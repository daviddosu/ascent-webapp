export type ProviderActionEvidence = {
  tool_name: string
  status: string
  provider_action_id?: string | null
  completed_at?: string | null
}

export function verifiedCrossToolStage(actions: ProviderActionEvidence[]) {
  const succeeded = actions.filter(action => action.status === 'succeeded' && action.provider_action_id)
  const calendar = succeeded.filter(action => action.tool_name === 'calendar.update_event').at(-1)
  const gmail = succeeded.filter(action => action.tool_name === 'gmail.send_message').at(-1)
  if (!calendar) return { stage: 'calendar_required' as const, complete: false }
  if (!gmail) return { stage: 'notification_required' as const, complete: false }
  const calendarAt = Date.parse(calendar.completed_at ?? '')
  const gmailAt = Date.parse(gmail.completed_at ?? '')
  if (!Number.isFinite(calendarAt) || !Number.isFinite(gmailAt) || gmailAt < calendarAt) {
    return { stage: 'out_of_order' as const, complete: false }
  }
  return { stage: 'complete' as const, complete: true }
}

export function reasoningFallbackAllowed(failureClass: string, deterministicMismatch: boolean) {
  return failureClass === 'MODEL_REASONING' && deterministicMismatch
}
