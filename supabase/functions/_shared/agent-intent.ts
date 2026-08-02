import { actionIsAffirmed, calendarCoordinationIsAffirmed, calendarInviteIsAffirmed, calendarWriteIsAffirmed } from './communication-safety.ts'

export type SharedAgentIntent = {
  capability: 'research' | 'draft' | 'research_draft' | 'gmail' | 'calendar' | 'scheduling' | 'browser' | 'flight_search'
  strategy: 'structured' | 'browser' | 'hybrid'
  outcomeType: 'prepared_result' | 'external_change' | 'payment_handoff'
}

export type FlightContextField =
  | 'trip_type'
  | 'return_date'
  | 'origin'
  | 'destination'
  | 'departure_date'
  | 'budget'
  | 'max_stops'
  | 'cabin'

/**
 * Payment handoff means “prepare the exact provider checkout boundary”; it
 * never authorizes payment. Keep this distinct from language that explicitly
 * stops before both booking and payment.
 */
export function requestsPaymentHandoff(value: string) {
  const text = value.toLocaleLowerCase()
  return /\b(?:payment\s+handoff|stop\s+before\s+payment|(?:continue|proceed|go|get|take|bring|reach)\b[\s\S]{0,80}\b(?:to|through|until)\b[\s\S]{0,30}\bpayment)\b/i.test(text)
}

export function hasEmailIntent(value: string) {
  return /\b(?:email|mail|gmail|reply|respond|follow[\s-]?up|message|outreach|recipient|inbox)\b/i.test(value) ||
    /\b(?:tell|ask|inform|remind|notify)\s+(?!me\b|myself\b|us\b|the\s+user\b)(?:the\s+)?(?:[a-z][a-z'-]*|them|him|her|someone|everyone)\b/i.test(value)
}

export function hasCalendarIntent(value: string) {
  return /\b(?:meeting|meet|calendar|schedule|scheduled|scheduling|reschedule|availability|appointment|invite|invitation|slot|free)\b/i.test(value) ||
    /\b(?:create|add|put|place|sync|move|update|change|cancel|delete|remove|book)\b[\s\S]{0,80}\b(?:event|meeting|appointment|call|calendar|slot)\b/i.test(value)
}

/** Identify which flight fact a context question is asking for. */
export function flightContextField(question: string, missingFields: unknown): FlightContextField | null {
  const missing = Array.isArray(missingFields)
    ? missingFields.map(value => String(value)).join(' ')
    : ''
  const text = `${question} ${missing}`.toLocaleLowerCase()
  if (/\b(?:return[_ ]?date|returning\s+date|(?:when|what\s+date|which\s+date)\s+(?:(?:do|will)\s+)?you\s+return|return\s+on)\b/.test(text)) return 'return_date'
  if (/\b(?:trip[_ ]?type|one[ -]?way|round[ -]?trip|return\s+flight|journey\s+type)\b/.test(text)) return 'trip_type'
  if (/\b(?:origin[_ ]?(?:code)?|from)\b/.test(text) ||
      /\b(?:origin[_ ]?(?:code)?|from)\b[\s\S]{0,90}\b(?:airport|city|fly|depart|leave)\b|\b(?:airport|city)\b[\s\S]{0,90}\b(?:depart(?:ure|ing)?|leav(?:e|ing)|origin|from)\b/.test(text)) return 'origin'
  if (/\b(?:destination[_ ]?(?:code)?|arriv(?:e|ing)?|flying\s+into|fly\s+to)\b/.test(text) ||
      /\b(?:destination[_ ]?(?:code)?|arriv(?:e|ing)?|flying\s+into|fly\s+to|where)\b[\s\S]{0,90}\b(?:airport|city|fly|go|travel|destination|to|into)\b/.test(text)) return 'destination'
  if (/\b(?:departure[_ ]?date|outbound\s+date|travel\s+date|flight\s+date)\b|\b(?:when|what\s+date|which\s+date)\b[\s\S]{0,50}\b(?:fly|depart|leave|travel)\b/.test(text)) return 'departure_date'
  if (/\b(?:max[_ ]?stops?|stop|stops|connection|layover)\b/.test(text)) return 'max_stops'
  if (/\b(?:budget|price|cost|spend|under|maximum)\b/.test(text)) return 'budget'
  if (/\b(?:cabin|class|economy|business|first)\b/.test(text)) return 'cabin'
  return null
}

export function classifySharedAgentIntent(title: string, description = ''): SharedAgentIntent {
  const value = `${title} ${description}`.toLocaleLowerCase()
  const applicationIntent = /^apply\s+to\s+(?:this|it|that)$/i.test(value.trim()) ||
    /\bapply\b[\s\S]{0,80}\b(programme|program|phd|scholarship|fellowship|accelerator|job|role|position|opportunity)\b/.test(value)
  const hasEmail = hasEmailIntent(value)
  const calendarCoordination = calendarCoordinationIsAffirmed(value) || calendarInviteIsAffirmed(value)
  const hasCalendar = hasCalendarIntent(value) || calendarCoordination
  // People commonly describe the outcome in the wrong surface: “put the
  // meeting in her inbox”, “sync the call to his email”, or “add the event to
  // their Gmail”. Those are calendar-invite outcomes, not email-only asks.
  // Keep this deliberately narrow: merely *telling* someone about an event is
  // still an email; placing a scheduled item into their email/calendar is not.
  const eventDeliveryToRecipient = calendarInviteIsAffirmed(value)
  const preparingEmail = /\b(?:prepare|draft|write)\b/.test(value)
  const explicitSendRequest = actionIsAffirmed(
    value.replace(/\b(?:email|message|follow[\s-]?up)\b/g, ''),
    'gmail_send',
  )
  const wantsEmailWrite = actionIsAffirmed(value, 'gmail_send') && (!preparingEmail || explicitSendRequest)
  const wantsCalendarWrite = calendarWriteIsAffirmed(value)
  const hasFlight = /\b(flight|fly|airfare|airline|airport|return trip|round trip|one-way)\b/.test(value)
  const bookingIntent = value.replace(
    /\b(?:do\s+not|don't|never|without|stop\s+before)\b[\s\S]{0,60}\b(?:book|booking|buy|purchase|reserve|payment)\b/g,
    '',
  )
  const wantsBooking = /\b(book|booking|buy|purchase|reserve|payment\s+handoff)\b/.test(bookingIntent) ||
    requestsPaymentHandoff(value)
  const wantsBrowserWrite = /\b(?:submit|register|sign[\s-]?up|apply|post|publish|upload)\b/.test(value) ||
    /\b(?:fill|complete)\b[\s\S]{0,40}\bform\b/.test(value)
  const research = /\b(research|find|compare|identify|market|program|professor|supervisor|grant|customer|competitor|event|resource)\b/.test(value)
  const draft = /\b(draft|write|outline|proposal|application|polish|document)\b/.test(value)

  if (applicationIntent) {
    return { capability: 'browser', strategy: 'hybrid', outcomeType: 'prepared_result' }
  }
  if (hasFlight) {
    return {
      capability: 'flight_search',
      strategy: 'browser',
      outcomeType: wantsBooking ? 'payment_handoff' : 'prepared_result',
    }
  }
  if (eventDeliveryToRecipient || (hasCalendar && calendarCoordination) || (hasEmail && hasCalendar && wantsCalendarWrite)) {
    return { capability: 'scheduling', strategy: 'hybrid', outcomeType: 'external_change' }
  }
  // Meeting/event words often describe the subject of an email. They should
  // not turn a read, draft, or notification task into a Calendar operation.
  if (hasEmail && hasCalendar && !wantsCalendarWrite && !calendarCoordination) {
    return {
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: wantsEmailWrite ? 'external_change' : 'prepared_result',
    }
  }
  if (hasCalendar) {
    return {
      capability: 'calendar',
      strategy: 'structured',
      outcomeType: wantsCalendarWrite ? 'external_change' : 'prepared_result',
    }
  }
  if (hasEmail) {
    return {
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: wantsEmailWrite ? 'external_change' : 'prepared_result',
    }
  }
  if (research && draft) {
    return { capability: 'research_draft', strategy: 'structured', outcomeType: 'prepared_result' }
  }
  if (draft) {
    return { capability: 'draft', strategy: 'structured', outcomeType: 'prepared_result' }
  }
  return {
    capability: research ? 'research' : 'browser',
    strategy: research ? 'structured' : 'browser',
    outcomeType: wantsBrowserWrite ? 'external_change' : 'prepared_result',
  }
}

export function needsSharedAgentContext(title: string, description = '', context = '') {
  const combined = `${title} ${description} ${context}`.toLocaleLowerCase()
  const explicitlyMissingMeetingDetails =
    /\b(?:meet|meeting|call|appointment)\b/.test(combined) &&
    /\b(?:no|missing|without)\b[\s\S]{0,80}\b(?:duration|topic|agenda|time|date)\b/.test(combined) &&
    /\b(?:do not|don't|never|without)\b[\s\S]{0,80}\b(?:guess|invent|assume|fabricate)/.test(combined)
  if (explicitlyMissingMeetingDetails) return true
  if (description.trim() || context.trim()) return false

  const value = title.trim().toLocaleLowerCase()
  const words = value.match(/[\p{L}\p{N}]+/gu) ?? []
  const intent = classifySharedAgentIntent(title)

  if (intent.capability === 'flight_search') {
    const hasTravelDate = /\b(today|tomorrow|tonight|next|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\s./-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}))\b/i.test(value)
    const hasDestination = /\b(?:to|for)\s+[\p{L}][\p{L}\s-]{1,40}/iu.test(value) || /\b[\p{L}][\p{L}-]+\s+flight\b/iu.test(value)
    return !hasTravelDate || !hasDestination
  }

  // Very short instructions such as “Book flight” or “Send email” do not
  // contain an outcome Roon can safely infer. More specific connected tasks,
  // such as “Reply to Sarah's email”, continue without requiring Description.
  return words.length < 3
}
