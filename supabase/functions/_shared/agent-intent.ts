export type SharedAgentIntent = {
  capability: 'research' | 'draft' | 'research_draft' | 'gmail' | 'calendar' | 'scheduling' | 'browser' | 'flight_search'
  strategy: 'structured' | 'browser' | 'hybrid'
  outcomeType: 'prepared_result' | 'external_change' | 'payment_handoff'
}

export function classifySharedAgentIntent(title: string, description = ''): SharedAgentIntent {
  const titleValue = title.toLocaleLowerCase()
  const value = `${title} ${description}`.toLocaleLowerCase()
  const hasEmail = /\b(email|mail|gmail|reply|follow[\s-]?up|message|outreach)\b/.test(value)
  const hasCalendar = /\b(meeting|meet|calendar|schedule|reschedule|availability|appointment|invite|cancel.+(?:call|meeting))\b/.test(value)
  const coordinatesWithSomeone =
    /\b(?:set\s*up|arrange|coordinate|organize|schedule)\b[\s\S]{0,80}\b(?:meeting|call|appointment)\b[\s\S]{0,80}\bwith\b/.test(titleValue)
  const wantsEmailWrite =
    /\b(?:send|respond|follow[\s-]?up|outreach|draft|write)\b/.test(titleValue) ||
    /^(?:email|message|reply)\s+\S+/.test(titleValue.trim()) ||
    /\breply\s+to\b/.test(titleValue)
  const wantsCalendarWrite =
    /\b(?:set\s*up|schedule|reschedule|arrange|coordinate|organize|create|add|book|cancel|delete|move)\b/.test(titleValue)
  const hasFlight = /\b(flight|fly|airfare|airline|airport|return trip|round trip|one-way)\b/.test(value)
  const wantsBooking = /\b(book|booking|buy|purchase|reserve)\b/.test(titleValue)
  const research = /\b(research|find|compare|identify|market|program|professor|supervisor|grant|customer|competitor|event|resource)\b/.test(value)
  const draft = /\b(draft|write|outline|proposal|application|polish|document)\b/.test(value)

  if (hasFlight) {
    return {
      capability: 'flight_search',
      strategy: 'browser',
      outcomeType: wantsBooking ? 'payment_handoff' : 'prepared_result',
    }
  }
  if (hasCalendar && (coordinatesWithSomeone || (hasEmail && (wantsEmailWrite || wantsCalendarWrite)))) {
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
    outcomeType: 'prepared_result',
  }
}
