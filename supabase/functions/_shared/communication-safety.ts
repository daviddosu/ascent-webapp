export type CommunicationAction = 'gmail_send' | 'calendar_write'

export type NegotiationReplyState = 'accepted' | 'declined' | 'needs_resolution'

const actionPatterns: Record<CommunicationAction, RegExp> = {
  gmail_send: /\b(?:send|sending|reply|respond|notify|notification|outreach|forward|forwarding|follow[\s-]?up)\b/gi,
  calendar_write: /\b(?:create|creating|add|adding|put|putting|place|placing|sync|syncing|schedule|scheduling|set[\s-]?up|setting[\s-]?up|arrange|arranging|coordinate|coordinating|organize|organizing|book|booking|move|moving|reschedule|rescheduling|update|updating|change|changing|cancel|cancelling|canceling|delete|deleting|remove|removing|invite|inviting|invitation|invitations)\b/gi,
}

const directMessageRequest = /\b(?:email|message)(?:\s+to)?\s+(?!(?:about|regarding|from|for|of|on|in|with|the\s+(?:latest|most\s+recent|message|email|inbox))\b)(?:me|the|[a-z0-9._%+-]+@[a-z0-9.-]+|[a-z][a-z'-]*)\b/i
const readOnlyGmailRequest = /\b(?:read|check|search|find|summarize|review|list|show|open|latest)\b[\s\S]{0,48}\b(?:email|mail|gmail|message|inbox)\b/i
const gmailDirectivePattern = /\b(?:send|sending|reply(?:ing)?|respond(?:ing)?|notify|notifying|forward(?:ing)?|outreach|follow[\s-]?up)\b/gi
const directMessagePattern = /\b(?:email|message)(?:\s+to)?\s+(?!(?:about|regarding|from|for|of|on|in|with|the\s+(?:latest|most\s+recent|message|email|inbox))\b)(?:me|the|[a-z0-9._%+-]+@[a-z0-9.-]+|[a-z][a-z'-]*)\b/gi
const directRecipientMessagePattern = /\b(?:tell|ask|inform|remind)\s+(?!me\b|myself\b|us\b|the\s+user\b)(?:the\s+)?(?:[a-z][a-z'-]*|them|him|her|someone|everyone|the\s+team)\b/gi
const calendarCoordinationPatterns = [
  /\b(?:set\s*up|arrange|coordinate|organize|schedule|reschedule|book)\b[\s\S]{0,80}\b(?:meeting|call|appointment)\b/gi,
  /\b(?:meet|meeting|call|appointment)\b[\s\S]{0,40}\bwith\b/gi,
  /\b(?:find|check|look\s+for)\b[\s\S]{0,60}\b(?:a\s+)?(?:free|available)\s+(?:slot|time)\b[\s\S]{0,60}\bwith\b/gi,
  /\b(?:find|check|look\s+for)\b[\s\S]{0,40}\b(?:a\s+)?time\b[\s\S]{0,60}\bwith\b/gi,
  /\b(?:find|check|see|look\s+for)\b[\s\S]{0,60}\b(?:when|whether|if)\s+(?!i\b|i'm\b|im\b|we\b|we're\b|we\s+are\b|you\b|your\b|my\b|our\b|the\s+user\b)(?:his|her|their|someone|[a-z][a-z'-]*)\b[\s\S]{0,30}\b(?:free|available)\b/gi,
  /\b(?:is|are)\s+(?!i\b|we\b|you\b|my\b|our\b|the\s+user\b)(?:his|her|their|someone|[a-z][a-z'-]*)\b\s+(?:free|available)\b/gi,
  /\b(?:what|which)\s+(?:time|day|date)\b[\s\S]{0,40}\bworks?\s+for\s+(?!me\b|us\b|you\b|the\s+user\b)[a-z][a-z'-]*\b/gi,
  /\b(?:when|what\s+time)\b[\s\S]{0,30}\b(?:can|could|would)\s+(?!i\b|we\b|you\b|my\b|our\b|the\s+user\b)[a-z][a-z'-]*\b[\s\S]{0,30}\bmeet\b/gi,
  /\b(?:find|check|look\s+for)\b[\s\S]{0,60}\b(?:[a-z][a-z'-]*'s|his|her|their|someone(?:'s)?|the\s+recipient(?:'s)?)\s+availability\b/gi,
  /\b(?:find|check|look\s+for)\b[\s\S]{0,30}\b(?!my\b|our\b|your\b|next\b|this\b|today\b|tomorrow\b|the\s+user\b|calendar\b|schedule\b|event\b|meeting\b|slot\b|time\b)[a-z][a-z'-]*\s+availability\b/gi,
  /\b(?:find|check|look\s+for)\b[\s\S]{0,60}\bavailability\b[\s\S]{0,40}\bwith\s+(?!my\b|our\b|your\b|the\s+user\b)[a-z][a-z'-]*\b/gi,
  /\b(?:find|check|look\s+for)\b[\s\S]{0,60}\bavailability\b[\s\S]{0,40}\bfor\s+(?!my\b|our\b|your\b|next\b|this\b|today\b|tomorrow\b|monday\b|tuesday\b|wednesday\b|thursday\b|friday\b|saturday\b|sunday\b)[a-z][a-z'-]*\b/gi,
  /\b(?:set\s*up|arrange|coordinate|organize|schedule|reschedule|book)\b[\s\S]{0,60}\bwith\s+(?!my\b|our\b|your\b|the\s+user\b)[a-z][a-z'-]*\b/gi,
  /\binvite\s+(?!me\b|my\b|us\b|our\b|you\b|the\s+user\b|already\b|anyone\b|everyone\b|the\b|a\b|an\b)[a-z][a-z'-]*\b/gi,
  /\binvite\b[\s\S]{0,80}\b(?:to|for)\b[\s\S]{0,40}\b(?:the\s+)?(?:meeting|event|appointment|call|session|interview)\b/gi,
  /\b(?:send|create|prepare|add|put|place|sync|accept|decline|cancel|forward|request|make)\b[\s\S]{0,40}\b(?:a\s+)?(?:calendar\s+)?(?:invites?|invitations?|meeting\s+requests?)\b/gi,
]
const calendarInvitePatterns = [
  /\b(?:sync|add|put|place)\b[\s\S]{0,100}\b(?:pitch|meeting|event|appointment|call|session|interview)\b[\s\S]{0,100}\b(?:to|with|in|into|on)\b[\s\S]{0,64}\b(?:his|her|their|someone(?:'s)?|the\s+recipient(?:'s)?|recipient(?:'s)?|[a-z][a-z'-]*'s)\s+(?:email|gmail|inbox|calendar|schedule)\b/gi,
  /\b(?:send|email|message|notify)\s+(?!me\b|my\b|us\b|our\b|the\s+user\b)(?:[a-z][a-z'-]*|them|him|her|someone|everyone)\s+(?:a\s+|the\s+)?(?:meeting|calendar)\s+(?:invites?|invitations?)\b/gi,
  /\b(?:send|email|message|notify)\b[\s\S]{0,40}\b(?:meeting|calendar)\s+(?:invites?|invitations?)\b[\s\S]{0,24}\bto\s+(?!me\b|my\b|us\b|our\b|the\s+user\b)[a-z][a-z'-]*\b/gi,
  /\b(?:invite|invitation|inviting)\b[\s\S]{0,80}\b(?:to|for)\b[\s\S]{0,40}\b(?:the\s+)?(?:meeting|event|appointment|call|session|interview)\b/gi,
  /\binvite\s+(?!me\b|my\b|us\b|our\b|you\b|the\s+user\b|already\b|anyone\b|everyone\b|the\b|a\b|an\b)[a-z][a-z'-]*\b/gi,
]
const calendarWritePatterns = [
  /\b(?:create|add|put|place|sync|schedule|set\s*up|arrange|coordinate|organize|book|move|reschedule|update|change|cancel|delete|remove)\b[\s\S]{0,100}\b(?:event|meeting|appointment|call|calendar|slot|time|schedule)\b/gi,
  /\b(?:invite|invitation|inviting)\b[\s\S]{0,80}\b(?:to|for)\b[\s\S]{0,40}\b(?:the\s+)?(?:meeting|event|appointment|call|session|interview|calendar)\b/gi,
]

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
  return /(?:^|\s)(?:do\s+not|don't|never|without|no|not|can't|cannot|won't|will\s+not)(?:\s+(?:the|a|an|any|to|be|ever|this|that|one|someone|sending|send|replying|reply|responding|respond|notifying|notify|creating|create|adding|add|scheduling|schedule|booking|book|inviting|invite))?\s*$/i.test(before) ||
    /(?:^|\s)(?:do\s+not|don't|never|without|no|not|can't|cannot|won't|will\s+not)(?:\s+\S+){0,5}\s*$/i.test(before)
}

function isDescriptiveOccurrence(text: string, index: number) {
  const before = text.slice(clauseStart(text, index), index).trim()
  return /\b(?:about|regarding|mention(?:ing)?|tell(?:ing)?|say(?:ing)?|discuss(?:ing)?)\s*$/i.test(before) ||
    /\b(?:tell|ask|inform|remind|email|message)\b[\s\S]{0,40}\b(?:to|about|regarding|whether|if)\s*$/i.test(before)
}

function isAdvisoryQuestion(text: string) {
  const value = text.trim()
  return /\b(?:should|do)\s+(?:i|we)\b/i.test(value) ||
    /\b(?:could|can|may)\s+i\b/i.test(value) ||
    /\bis\s+it\s+(?:okay|possible|safe|wise)\s+to\b/i.test(value) ||
    /\bwhat\s+(?:if|happens\s+if)\b/i.test(value)
}

function gmailDirectives(text: string) {
  return [
    ...[...text.matchAll(gmailDirectivePattern)].map(match => ({
      index: Number(match.index ?? 0),
      negated: isNegatedOccurrence(text, Number(match.index ?? 0)),
    })),
    ...[...text.matchAll(directMessagePattern)].map(match => ({
      index: Number(match.index ?? 0),
      negated: isNegatedOccurrence(text, Number(match.index ?? 0)),
    })),
    ...[...text.matchAll(directRecipientMessagePattern)].map(match => ({
      index: Number(match.index ?? 0),
      negated: isNegatedOccurrence(text, Number(match.index ?? 0)),
    })),
  ].sort((left, right) => left.index - right.index)
}

/** True when the request actively coordinates time with another person. */
export function calendarCoordinationIsAffirmed(value: unknown) {
  const text = normalizedText(value)
  if (isAdvisoryQuestion(text)) return false
  return calendarCoordinationPatterns.some(pattern =>
    [...text.matchAll(pattern)].some(match => {
      const index = Number(match.index ?? 0)
      return !isNegatedOccurrence(text, index) && !isDescriptiveOccurrence(text, index)
    }),
  )
}

/** True only when the Calendar outcome depends on another attendee agreeing. */
export function calendarAttendeeCoordinationIsAffirmed(value: unknown) {
  const text = normalizedText(value)
  const externalMarker = /\b(?:with|for)\s+(?!next\b|this\b|today\b|tomorrow\b|monday\b|tuesday\b|wednesday\b|thursday\b|friday\b|saturday\b|sunday\b|the\s+user\b)(?:(?:my|our|your|the)\s+)?(?:his|her|their|someone|recipient|[a-z][a-z'-]*)\b|\b(?:when|whether|if)\s+(?:his|her|their|someone|[a-z][a-z'-]*)\b[\s\S]{0,30}\b(?:free|available)\b|\b(?:what|which)\s+(?:time|day|date)\b[\s\S]{0,40}\bworks?\s+for\s+(?!me\b|us\b|you\b|the\s+user\b)[a-z][a-z'-]*\b/i
  return calendarInviteIsAffirmed(text) || (calendarCoordinationIsAffirmed(text) && externalMarker.test(text))
}

/** True when event language is being placed into another person's calendar/email surface. */
export function calendarInviteIsAffirmed(value: unknown) {
  const text = normalizedText(value)
  if (isAdvisoryQuestion(text)) return false
  return calendarInvitePatterns.some(pattern =>
    [...text.matchAll(pattern)].some(match => {
      const index = Number(match.index ?? 0)
      return !isNegatedOccurrence(text, index) && !isDescriptiveOccurrence(text, index)
    }),
  )
}

/** True when a Calendar write is requested, rather than merely mentioned. */
export function calendarWriteIsAffirmed(value: unknown) {
  const text = normalizedText(value)
  if (isAdvisoryQuestion(text)) return false
  return calendarCoordinationIsAffirmed(text) || calendarWritePatterns.some(pattern =>
    [...text.matchAll(pattern)].some(match => {
      const index = Number(match.index ?? 0)
      return !isNegatedOccurrence(text, index) && !isDescriptiveOccurrence(text, index)
    }),
  )
}

/** True when the text contains an affirmative request for the given action. */
export function actionIsAffirmed(value: unknown, action: CommunicationAction) {
  const text = normalizedText(value)
  if (action === 'gmail_send' && isAdvisoryQuestion(text)) return false
  const matches = [
    ...text.matchAll(actionPatterns[action]),
    ...(action === 'gmail_send'
      ? [...text.matchAll(directMessagePattern), ...text.matchAll(directRecipientMessagePattern)]
      : []),
  ]
  if (!matches.length) return false
  const affirmative = matches.some(match => !isNegatedOccurrence(text, Number(match.index ?? 0)))
  if (!affirmative) return false
  if (action === 'gmail_send' && readOnlyGmailRequest.test(text)) {
    const explicitAffirmed = gmailDirectives(text).some(directive => !directive.negated)
    if (!explicitAffirmed && !directMessageRequest.test(text)) return false
  }
  if (action === 'gmail_send' && /\b(?:prepare|draft|write)\b/.test(text)) {
    if (!gmailDirectives(text).some(directive => !directive.negated)) return false
  }
  if (action === 'gmail_send' && gmailDirectives(text).at(-1)?.negated) return false
  if (action === 'calendar_write' && matches.at(-1) && isNegatedOccurrence(text, Number(matches.at(-1)?.index ?? 0))) return false
  return true
}

/** True when the text contains an explicit negation and no affirmative action. */
export function actionIsNegated(value: unknown, action: CommunicationAction) {
  const text = normalizedText(value)
  const matches = [
    ...text.matchAll(actionPatterns[action]),
    ...(action === 'gmail_send'
      ? [...text.matchAll(directMessagePattern), ...text.matchAll(directRecipientMessagePattern)]
      : []),
  ]
  return matches.length > 0 && matches.some(match => isNegatedOccurrence(text, Number(match.index ?? 0))) && !actionIsAffirmed(text, action)
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

/** Reject provider-marked automatic responses from scheduling negotiations. */
export function isAutomatedEmailReply(message: Record<string, unknown>) {
  const content = [
    message.subject,
    message.body_text,
  ].map(value => normalizedText(value).slice(0, 8_000)).join(' ')
  const metadata = [
    message.auto_submitted,
    message.precedence,
  ].map(value => normalizedText(value).slice(0, 120)).join(' ')
  const suppressesAutoReply = normalizedText(message.x_auto_response_suppress)
  return /\b(?:automatic reply|auto[ -]?reply|out of (?:the )?office|on (?:annual )?leave|delivery status notification|undeliverable|mail delivery failed|auto-replied)\b/.test(content) ||
    /\b(?:auto-submitted\s*:\s*)?(?:auto-replied|auto-generated|bulk|list)\b/i.test(metadata) ||
    /^(?:all|oof|auto[ -]?reply)$/i.test(suppressesAutoReply)
}

/** Keep only the newest human-written portion of an email reply. */
export function latestEmailReplyText(value: unknown) {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n')
  const kept: string[] = []
  for (const line of lines) {
    if (/^\s*(?:on .+\bwrote:|[-_ ]*original message[-_ ]*)\s*$/i.test(line) || /^\s*from:\s+.+$/i.test(line) && kept.length > 0 || /^\s*--\s*$/i.test(line)) break
    if (/^\s*>/.test(line)) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

/** Conservative classification: only unmistakable agreement is accepted. */
export function classifyNegotiationReply(value: unknown): NegotiationReplyState {
  const text = normalizedText(latestEmailReplyText(value))
  if (!text) return 'needs_resolution'
  const declined = /\b(?:i\s+(?:can't|cannot|won't|will\s+not)|(?:can't|cannot|won't|will\s+not)\s+(?:make|attend|join|do)|not\s+(?:available|free|able)|no\s+longer\s+(?:available|free)|unavailable|busy|booked|away|out\s+of\s+(?:town|office)|travell?ing|conflict|prior\s+commitment|another\s+commitment|declin(?:e|ed|ing)|cancel(?:l(?:ed|ing)|ation)?|withdraw(?:n|ing)?|please\s+(?:remove|cancel|stop)|doesn?'t\s+work|does\s+not\s+work|unable\s+to|not\s+able\s+to)\b/i.test(text)
  const unavailable = /\b(?:not\s+(?:available|free|able)|no\s+longer\s+(?:available|free)|unavailable|busy|booked|away|out\s+of\s+(?:town|office)|travell?ing|conflict|prior\s+commitment|another\s+commitment)\b/i.test(text)
  const counteroffer = /[?]/.test(text) ||
    /\b(?:could\s+we|can\s+we|would\s+.+\s+work|how\s+about|what\s+about|instead|another\s+(?:time|day)|different\s+(?:time|day)|tentative|maybe|might(?:\s+work)?|prefer(?:s|red)?|available\s+(?:on|at))\b/i.test(text) ||
    (!unavailable && /\b(?:available|free)\b/i.test(text))
  const alternativePositive = /\b(?:works?\s+for\s+me|works?\s+(?:on|at)|can\s+(?:do|make|attend|join)\b|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[\s\S]{0,30}\b(?:works?|fine|okay|ok|available|free)\b)\b/i.test(text)
  if (declined && !(counteroffer || alternativePositive)) return 'declined'
  if (declined && (counteroffer || alternativePositive)) return 'needs_resolution'
  if (counteroffer || /^\s*(?:no|nope|nah)\b(?!\s+problem)/i.test(text)) {
    return 'needs_resolution'
  }
  if (/\b(?:yes|yep|yeah|confirmed?|agreed?|i\s+agree|that\s+works?|works?\s+for\s+me|sounds?\s+good|fine\s+by\s+me|happy\s+to|looking\s+forward|can\s+(?:do|make|attend|join)\b|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[\s\S]{0,30}\b(?:works?|fine|okay|ok)\b)\b/i.test(text)) {
    return 'accepted'
  }
  return 'needs_resolution'
}
