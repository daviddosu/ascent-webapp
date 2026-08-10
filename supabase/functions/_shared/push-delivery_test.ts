import { assertEquals, assertRejects } from 'jsr:@std/assert'
import { deliverPushWithOutbox } from './push-delivery.ts'

function identity() {
  return { kind: 'scheduled' as const, deliveryKey: 'task:user:task:date', subscriptionId: 'subscription-1' }
}

Deno.test('a missing claim never reaches the external provider', async () => {
  let sends = 0
  const result = await deliverPushWithOutbox({
    admin: { rpc: async () => ({ data: null, error: null }) },
    identity: identity(),
    send: async () => { sends += 1 },
    classifyError: () => ({ retryable: true, code: 'failed' }),
  })
  assertEquals(result.outcome, 'skipped')
  assertEquals(sends, 0)
})

Deno.test('provider failure returns the lease to pending before reporting retryable', async () => {
  const calls: string[] = []
  const result = await deliverPushWithOutbox({
    admin: { rpc: async (name, values) => {
      calls.push(`${name}:${String(values.p_delivered)}`)
      return name === 'claim_push_delivery' ? { data: 'claim-1', error: null } : { data: true, error: null }
    } },
    identity: identity(),
    send: async () => { throw new Error('timeout') },
    classifyError: () => ({ retryable: true, code: 'provider_timeout' }),
  })
  assertEquals(result.outcome, 'retryable_failure')
  assertEquals(calls, ['claim_push_delivery:undefined', 'finish_push_delivery:false'])
})

Deno.test('a post-send acknowledgement crash is never reported as delivered', async () => {
  let sent = false
  await assertRejects(() => deliverPushWithOutbox({
    admin: { rpc: async name => name === 'claim_push_delivery'
      ? { data: 'claim-1', error: null }
      : { data: null, error: { message: 'database unavailable' } } },
    identity: identity(),
    send: async () => { sent = true },
    classifyError: () => ({ retryable: true, code: 'failed' }),
  }), Error, 'database unavailable')
  assertEquals(sent, true)
})

Deno.test('delivery is successful only after the durable acknowledgement', async () => {
  const calls: string[] = []
  const result = await deliverPushWithOutbox({
    admin: { rpc: async (name, values) => {
      calls.push(`${name}:${String(values.p_delivered)}`)
      return name === 'claim_push_delivery' ? { data: 'claim-1', error: null } : { data: true, error: null }
    } },
    identity: identity(),
    send: async () => { calls.push('provider:sent') },
    classifyError: () => ({ retryable: true, code: 'failed' }),
  })
  assertEquals(result.outcome, 'delivered')
  assertEquals(calls, ['claim_push_delivery:undefined', 'provider:sent', 'finish_push_delivery:true'])
})
