export type CommunicationAction = 'gmail_send' | 'calendar_write'

export type NegotiationReplyState = 'accepted' | 'declined' | 'needs_resolution'

const actionPatterns: Record<CommunicationAction, RegExp> = {
  gmail_send: /\b(?:send|sending|reply|respond|notify|notification|outreach|follow[\s-]?up|email|message)\b/gi,
  calendar_write: /\b(?:create|creating|add|adding|schedule|scheduling|book|booking|move|moving|reschedule|rescheduling|update|updating|change|changing|cancel|cancelling|canceling|delete|deleting|remove|removing|invite|inviting)\b/gi,
}

const directMessageRequest = /\b(?:email|message)\s+(?:me|the|[a-z0-9._%+-]+@[a-z0-9.-]+|[a-z][a-z'-]*)\b/i
const readOnlyGmailRequest = /\b(?:read|check|search|find|summarize|review|list|show|open|latest)\b[\s\S]{0,48}\b(?:email|mail|gmail|message|inbox)\b/i

function normalizedText(value: unknown) {
  return String(value ?? '')
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function clauseStart(text: string, index: number) {
  const prefix = text.slice(0, index)
  const boundaries = [...prefix.matchAll(/[.!?;]|\b(?:but|however|instead)\b/gi)]
  return boundaries.at(-1)?.index === undefined
    ? 0
    : Number(boundaries.at(-1)?.index) + 1
}

function isNegatedOccurrence(text: string, index: number) {
  const before = text.slice(clauseStart(text, index), index).trim()
  return /(?:^|\s)(?:do\s+not|don't|never|without|no|not)(?:\s+(?:the|a|an|any|to|be|ever|this|that|one|someone|sending|send|replying|reply|responding|respond|notifying|notify|creating|create|adding|add|scheduling|schedule|booking|book|inviting|invite))?\s*$/i.test(before) ||
    /(?:^|\s)(?:do\s+not|don't|never|without|no|not)(?:\s+\S+){0,5}\s*$/i.test(before)
}

/** True when the text contains an affirmative request for the given action. */
export function actionIsAffirmed(value: unknown, action: CommunicationAction) {
  const text = normalizedText(value)
  const matches = [...text.matchAll(actionPatterns[action])]
  if (!matches.length) return false
  const affirmative = matches.some(match => !isNegatedOccurrence(text, Number(match.index ?? 0)))
  if (!affirmative) return false
  if (action === 'gmail_send' && readOnlyGmailRequest.test(text)) {
    const explicitMatches = [...text.matchAll(/\b(?:send|sending|reply|respond|notify|notification|outreach|follow[\s-]?up)\b/gi)]
    const explicitAffirmed = explicitMatches.some(match => !isNegatedOccurrence(text, Number(match.index ?? 0)))
    if (!explicitAffirmed && !directMessageRequest.test(text)) return false
  }
  return true
}

/** True when every occurrence of the given action is explicitly negated. */
export function actionIsNegated(value: unknown, action: CommunicationAction) {
  const text = normalizedText(value)
  const pattern = new RegExp(actionPatterns[action].source, 'i')
  return pattern.test(text) && !actionIsAffirmed(text, action)
}

export function normalizeEmail(value: unknown) {
  const text = String(value ?? '').toLocaleLowerCase().trim()
  const match = text.match(/<([^>\s]+@[^>\s]+)>/)?.[1] ?? text
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(match) ? match : ''
}

export function extractEmailAddresses(value: unknown) {
  const text = String(value ?? '').toLocaleLowerCase()
  const addresses = text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/g) ?? []
  return [...new Set(addresses.map(normalizeEmail).filter(Boolean))]
}

export function normalizeContextQuestion(value: unknown) {
  return normalizedText(value)
    .replace(/[^\p{L}\p{N}@._' -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Conservative classification: only unmistakable agreement is accepted. */
export function classifyNegotiationReply(value: unknown): NegotiationReplyState {
  const text = normalizedText(value)
  if (!text) return 'needs_resolution'
  if (/\b(?:i\s+(?:can't|cannot|won't|will\s+not)|(?:can't|cannot|won't|will\s+not)\s+(?:make|attend|do)|not\s+available|unavailable|declin(?:e|ed|ing)|cancel(?:l(?:ed|ing)|ation)?|withdraw(?:n|ing)?|please\s+(?:remove|cancel|stop)|doesn?'t\s+work|does\s+not\s+work|unable\s+to)\b/i.test(text)) {
    return 'declined'
  }
  if (/[?]/.test(text) || /\b(?:could\s+we|can\s+we|would\s+.+\s+work|how\s+about|what\s+about|instead|another\s+(?:time|day)|different\s+(?:time|day)|tentative|maybe|prefer(?:s|red)?|available\s+(?:on|at))\b/i.test(text)) {
    return 'needs_resolution'
  }
  if (/\b(?:yes|yep|yeah|confirmed?|agreed?|i\s+agree|that\s+works?|works?\s+for\s+me|sounds?\s+good|fine\s+by\s+me|happy\s+to|looking\s+forward)\b/i.test(text)) {
    return 'accepted'
  }
  return 'needs_resolution'
}
