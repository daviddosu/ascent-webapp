import type { InterAgentRequestKind } from './david-applications.ts'

export const applicationRoonRequestKinds: InterAgentRequestKind[] = [
  'create_draft', 'send_email', 'monitor_thread', 'resolve_contact', 'follow_up',
  'read_application_reply', 'schedule_interview', 'schedule_meeting', 'create_calendar_reminder',
  'monitor_writer_deadline', 'monitor_referee_deadline', 'monitor_professor_reply',
  'detect_application_messages', 'search_otp', 'request_academic_document',
  'request_credential_evaluation_delivery', 'monitor_academic_delivery', 'monitor_test_score_delivery',
]

export function safeApplicationRequestKind(value: unknown): InterAgentRequestKind | null {
  const kind = typeof value === 'string' ? value : ''
  return applicationRoonRequestKinds.includes(kind as InterAgentRequestKind) ? kind as InterAgentRequestKind : null
}

export function applicationWriteIsApproved(payload: Record<string, unknown>) {
  return payload.approved_for_send === true || payload.approvedForSend === true || payload.approved_for_calendar === true || payload.approvedForCalendar === true
}

export function applicationFollowUpAllowed(payload: Record<string, unknown>, now = Date.now()) {
  if (payload.follow_up_stopped === true || payload.followUpStopped === true) return false
  if (['completed', 'refused', 'declined', 'replaced', 'opted_out', 'closed'].includes(String(payload.contact_status ?? payload.contactStatus ?? '').toLocaleLowerCase())) return false
  const sentCount = Number(payload.follow_up_count ?? payload.followUpCount ?? 0)
  const maximum = Number(payload.maximum_follow_ups ?? payload.maximumFollowUps ?? 2)
  if (!Number.isFinite(sentCount) || !Number.isFinite(maximum) || sentCount >= Math.max(0, Math.min(5, maximum))) return false
  const nextAt = String(payload.next_follow_up_at ?? payload.nextFollowUpAt ?? '')
  if (nextAt) {
    const timestamp = Date.parse(nextAt)
    if (Number.isFinite(timestamp) && timestamp > now) return false
  }
  return true
}

export function isGenericProfessorOutreach(payload: Record<string, unknown>) {
  if (String(payload.contact_kind ?? payload.contactKind ?? '').toLocaleLowerCase() !== 'professor') return false
  const body = String(payload.body_text ?? payload.body ?? '').toLocaleLowerCase()
  const evidence = Array.isArray(payload.research_fit_evidence ?? payload.researchFitEvidence)
    ? (payload.research_fit_evidence ?? payload.researchFitEvidence) as unknown[]
    : []
  const snippets = evidence.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
    const item = value as Record<string, unknown>
    const source = String(item.source_url ?? item.sourceUrl ?? item.source_excerpt ?? '').toLocaleLowerCase()
    return `${String(item.excerpt ?? '')} ${String(item.work ?? '')} ${String(item.rationale ?? '')} ${source}`.toLocaleLowerCase()
  }).filter(Boolean)
  if (!snippets.length) return true
  return !snippets.some(snippet => {
    const tokens = [...new Set(snippet.split(/\W+/).filter(token => token.length >= 5))]
    const overlap = tokens.filter(token => body.includes(token))
    return overlap.length >= 3 && (snippet.includes('http') || tokens.length >= 4)
  })
}

export function applicationFailureIsRetryable(error: unknown) {
  const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code ?? '') : ''
  if (/reauth|required|permission|invalid|sensitive|ownership|ambiguous|missing|unsupported|approval/i.test(code)) return false
  return true
}

export function applicationMessageQuery(payload: Record<string, unknown>, after: string) {
  const clean = (value: unknown, maximum = 120) => typeof value === 'string'
    ? value.replace(/[^a-zA-Z0-9@._+\- ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
  const query = [`after:${after}`]
  const destination = clean(payload.destination_email ?? payload.destinationEmail, 320)
  if (destination) query.push(`to:${destination}`)
  const subjects = Array.isArray(payload.subject_clues ?? payload.subjectClues) ? (payload.subject_clues ?? payload.subjectClues) as unknown[] : []
  const senders = Array.isArray(payload.sender_clues ?? payload.senderClues) ? (payload.sender_clues ?? payload.senderClues) as unknown[] : []
  const subjectClues = subjects.map(value => clean(value)).filter(Boolean)
  const senderClues = senders.map(value => clean(value)).filter(Boolean)
  if (subjectClues.length) query.push(`{${subjectClues.map(value => `subject:"${value}"`).join(' OR ')}}`)
  else if (senderClues.length) query.push(`{${senderClues.map(value => `from:${value}`).join(' OR ')}}`)
  return query.join(' ')
}
