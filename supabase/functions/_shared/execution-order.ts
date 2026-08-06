import { actionIsAffirmed, calendarWriteIsAffirmed } from './communication-safety.ts'

export type ProviderActionEvidence = {
  tool_name: string
  status: string
  provider_action_id?: string | null
  completed_at?: string | null
}

export type RequiredEffect = 'gmail_send' | 'calendar_write' | 'application_submission'

/**
 * A Calendar read (availability/listing) is not a required external write.
 * Keep the ledger scoped to task contracts that actually mutate Calendar.
 */
export function requiredEffectsForObjective(objective: string) {
  const text = objective.toLocaleLowerCase()
  const required: RequiredEffect[] = []
  if (calendarWriteIsAffirmed(text) && /\b(?:calendar|event|meeting|appointment|call|schedule|reschedule|move|update|cancel|delete)\b/.test(text)) {
    required.push('calendar_write')
  }
  if (actionIsAffirmed(text, 'gmail_send') || /\bemail\s+(?:the\s+)?(?:options|attendee|participant)\b/i.test(text)) {
    required.push('gmail_send')
  }
  return required
}

export function requiredEffectsSatisfied(required: RequiredEffect[], confirmedTools: string[]) {
  const confirmed = new Set(confirmedTools)
  return required.every(effect => effect === 'gmail_send'
    ? confirmed.has('gmail.send_message')
    : effect === 'application_submission'
      ? confirmed.has('application.submit') || confirmed.has('browser.submit')
      : ['calendar.create_event', 'calendar.update_event', 'calendar.delete_event'].some(tool => confirmed.has(tool)))
}

export function unresolvedRequiredEffects(required: RequiredEffect[], confirmedTools: string[]) {
  const confirmed = new Set(confirmedTools)
  return required.filter(effect => effect === 'gmail_send'
    ? !confirmed.has('gmail.send_message')
    : effect === 'application_submission'
      ? !confirmed.has('application.submit') && !confirmed.has('browser.submit')
      : !['calendar.create_event', 'calendar.update_event', 'calendar.delete_event'].some(tool => confirmed.has(tool)))
}

export function verifiedCrossToolStage(actions: ProviderActionEvidence[]) {
  const succeeded = actions.filter(action => action.status === 'succeeded' && action.provider_action_id)
  const calendar = succeeded.filter(action =>
    ['calendar.create_event', 'calendar.update_event', 'calendar.delete_event'].includes(action.tool_name),
  ).at(-1)
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

export function lunaContinuationAllowed(failureClass: string, deterministicMismatch: boolean) {
  return failureClass === 'MODEL_REASONING' && deterministicMismatch
}
