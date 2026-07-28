export type ProviderActionEvidence = {
  tool_name: string
  status: string
  provider_action_id?: string | null
  completed_at?: string | null
}

export type RequiredEffect = 'gmail_send' | 'calendar_write'

/**
 * A Calendar read (availability/listing) is not a required external write.
 * Keep the ledger scoped to task contracts that actually mutate Calendar.
 */
export function requiredEffectsForObjective(objective: string) {
  const text = objective.toLocaleLowerCase()
  const required: RequiredEffect[] = []
  const calendarMutation = !/\b(?:do not|don't|without|never)\s+(?:create|add|schedule|book|move|reschedule|update|change|cancel|delete|remove)\b/.test(text) &&
    /\b(?:create|created|add|added|schedule|scheduled|book|booked|move|moved|reschedule|rescheduled|update|updated|change|changed|cancel|cancelled|delete|deleted|remove|removed)\b/.test(text)
  if (calendarMutation && /\b(?:calendar|event|meeting|appointment|call|schedule|reschedule|move|update|cancel|delete)\b/.test(text)) {
    required.push('calendar_write')
  }
  const gmailSend = !/\b(?:do not|don't|without|never)\s+(?:send|reply|respond|notify|email|message)\b/.test(text) &&
    /\b(?:send|sent|reply|respond|notify|notification|outreach|follow[\s-]?up)\b/.test(text) ||
    /\bemail\s+(?:the\s+)?(?:options|attendee|participant)\b/.test(text)
  if (gmailSend) required.push('gmail_send')
  return required
}

export function requiredEffectsSatisfied(required: RequiredEffect[], confirmedTools: string[]) {
  const confirmed = new Set(confirmedTools)
  return required.every(effect => effect === 'gmail_send'
    ? confirmed.has('gmail.send_message')
    : ['calendar.create_event', 'calendar.update_event', 'calendar.delete_event'].some(tool => confirmed.has(tool)))
}

export function unresolvedRequiredEffects(required: RequiredEffect[], confirmedTools: string[]) {
  const confirmed = new Set(confirmedTools)
  return required.filter(effect => effect === 'gmail_send'
    ? !confirmed.has('gmail.send_message')
    : !['calendar.create_event', 'calendar.update_event', 'calendar.delete_event'].some(tool => confirmed.has(tool)))
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
