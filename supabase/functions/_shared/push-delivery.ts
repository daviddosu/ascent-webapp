type RpcResult<T> = { data: T; error: { message: string } | null }
type RpcClient = { rpc(name: string, argumentsValue: Record<string, unknown>): PromiseLike<RpcResult<unknown>> }

export type PushDeliveryIdentity = {
  kind: 'completion' | 'scheduled'
  deliveryKey?: string
  completionEventId?: string
  subscriptionId: string
}

function rpcArguments(identity: PushDeliveryIdentity) {
  return {
    p_kind: identity.kind,
    p_delivery_key: identity.deliveryKey ?? null,
    p_completion_event_id: identity.completionEventId ?? null,
    p_subscription_id: identity.subscriptionId,
  }
}

export async function deliverPushWithOutbox(input: {
  admin: RpcClient
  identity: PushDeliveryIdentity
  send: () => Promise<void>
  classifyError: (error: unknown) => { retryable: boolean; code: string }
}) {
  const claim = await input.admin.rpc('claim_push_delivery', { ...rpcArguments(input.identity), p_lease_seconds: 120 })
  if (claim.error) throw new Error(claim.error.message)
  const claimToken = typeof claim.data === 'string' ? claim.data : ''
  if (!claimToken) return { outcome: 'skipped' as const }

  try {
    await input.send()
  } catch (error) {
    const failure = input.classifyError(error)
    const finished = await input.admin.rpc('finish_push_delivery', {
      ...rpcArguments(input.identity),
      p_claim_token: claimToken,
      p_delivered: false,
      p_retryable: failure.retryable,
      p_error_code: failure.code,
    })
    if (finished.error || finished.data !== true) throw new Error(finished.error?.message ?? 'Push failure state was not persisted.')
    return { outcome: failure.retryable ? 'retryable_failure' as const : 'permanent_failure' as const, code: failure.code }
  }

  const finished = await input.admin.rpc('finish_push_delivery', {
    ...rpcArguments(input.identity),
    p_claim_token: claimToken,
    p_delivered: true,
    p_retryable: false,
    p_error_code: null,
  })
  if (finished.error || finished.data !== true) throw new Error(finished.error?.message ?? 'Push delivery acknowledgement was not persisted.')
  return { outcome: 'delivered' as const }
}
