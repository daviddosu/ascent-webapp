export type SharedAgentIntent = {
  capability: 'research' | 'draft' | 'research_draft' | 'gmail' | 'calendar' | 'scheduling' | 'browser' | 'flight_search'
  strategy: 'structured' | 'browser' | 'hybrid'
  outcomeType: 'prepared_result' | 'external_change' | 'payment_handoff'
}

export function classifySharedAgentIntent(title: string, description = ''): SharedAgentIntent {
  const value = `${title} ${description}`.toLocaleLowerCase()
  const applicationIntent = /\bapply\b[\s\S]{0,80}\b(programme|program|phd|scholarship|fellowship|accelerator|job|role|position|opportunity)\b/.test(value)
  const hasEmail = /\b(email|mail|gmail|reply|follow[\s-]?up|message|outreach)\b/.test(value)
  const hasCalendar = /\b(meeting|meet|calendar|schedule|reschedule|availability|appointment|invite|cancel.+(?:call|meeting))\b/.test(value)
  // People commonly describe the outcome in the wrong surface: “put the
  // meeting in her inbox”, “sync the call to his email”, or “add the event to
  // their Gmail”. Those are calendar-invite outcomes, not email-only asks.
  // Keep this deliberately narrow: merely *telling* someone about an event is
  // still an email; placing a scheduled item into their email/calendar is not.
  const eventDeliveryToRecipient =
    /\b(?:sync|add|put|place)\b[\s\S]{0,100}\b(?:pitch|meeting|event|appointment|call|session|interview)\b[\s\S]{0,100}\b(?:to|with|in|into|on)\b[\s\S]{0,64}\b(?:email|gmail|inbox|calendar|schedule)\b/.test(value) ||
    /\b(?:invite|calendar\s+invite)\b[\s\S]{0,80}\b(?:pitch|meeting|event|appointment|call|session|interview)\b/.test(value)
  const coordinatesWithSomeone =
    /\b(?:set\s*up|arrange|coordinate|organize|schedule)\b[\s\S]{0,80}\b(?:meeting|call|appointment)\b[\s\S]{0,80}\bwith\b/.test(value) ||
    /\b(?:meet|meeting|call|appointment)\b[\s\S]{0,40}\bwith\b/.test(value)
  const preparesEmailOnly = /\b(?:prepare|draft|write)\b/.test(value) ||
    /\b(?:do\s+not|don't|without)\s+send(?:ing)?\b/.test(value)
  const wantsEmailWrite =
    (!preparesEmailOnly && /\b(?:send|respond|follow[\s-]?up|outreach)\b/.test(value)) ||
    /^(?:email|message|reply)\s+\S+/.test(value.trim()) ||
    /\breply\s+to\b/.test(value)
  const calendarWriteIntent = value.replace(
    /\b(?:do\s+not|don't|without)\s+(?:create|creating|add|adding|book|booking|schedule|scheduling|reschedule|rescheduling|move|moving|cancel|cancelling|canceling|delete|deleting)\b/g,
    '',
  )
  const wantsCalendarWrite =
    /\b(?:set\s*up|schedule|reschedule|arrange|coordinate|organize|create|add|book|cancel|delete|move)\b/.test(calendarWriteIntent)
  const hasFlight = /\b(flight|fly|airfare|airline|airport|return trip|round trip|one-way)\b/.test(value)
  const bookingIntent = value.replace(
    /\b(?:do\s+not|don't|never|without|stop\s+before)\b[\s\S]{0,60}\b(?:book|booking|buy|purchase|reserve|payment)\b/g,
    '',
  )
  const wantsBooking = /\b(book|booking|buy|purchase|reserve|payment\s+handoff)\b/.test(bookingIntent)
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
  if (eventDeliveryToRecipient || (hasCalendar && (coordinatesWithSomeone || (hasEmail && (wantsEmailWrite || wantsCalendarWrite))))) {
    return { capability: 'scheduling', strategy: 'hybrid', outcomeType: 'external_change' }
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
