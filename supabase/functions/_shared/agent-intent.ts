import { actionIsAffirmed, calendarCoordinationIsAffirmed, calendarInviteIsAffirmed, calendarWriteIsAffirmed } from './communication-safety.ts'
import { isApplicationIntent } from './application.ts'

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
  | 'passengers'
  | 'traveler_details'
  | 'airport_preferences'
  | 'airline'
  | 'departure_time'
  | 'arrival_time'

/**
 * Keep flight questions short and focused on one fact. The model may describe
 * several missing facts in a tool call, but the product presents only the
 * next safe question to the user.
 */
export function flightContextQuestion(field: FlightContextField, originalQuestion = '') {
  const text = originalQuestion.toLocaleLowerCase()
  if (field === 'traveler_details') {
    if (/passport|travel\s+document/.test(text) && /expir|valid\s+until/.test(text)) {
      return 'When does the traveler’s passport expire? Use YYYY-MM-DD.'
    }
    if (/passport|travel\s+document/.test(text) && /issu(?:ing|ed)|country/.test(text)) {
      return 'Which country issued the traveler’s passport?'
    }
    if (/passport|travel\s+document/.test(text) && /number|no\.?\b/.test(text)) {
      return 'What is the traveler’s passport number?'
    }
    if (/legal\s+name|given\s+name|family\s+name|full\s+name/.test(text)) {
      return 'What is the traveler’s full legal name?'
    }
    if (/date\s+of\s+birth|\bdob\b|birthdate/.test(text)) {
      return 'What is the traveler’s date of birth? Use YYYY-MM-DD.'
    }
    if (/email|e-mail/.test(text)) return 'What email should the booking use?'
    if (/phone|mobile|telephone/.test(text)) return 'What phone number should the booking use?'
    if (/title|salutation/.test(text)) return 'What title should I use for the traveler?'
    if (/gender|sex/.test(text)) return 'What gender or sex should I enter for the traveler?'
    if (/nationality|citizenship/.test(text)) return 'What is the traveler’s nationality?'
    if (/residence|living\s+in/.test(text)) return 'Which country does the traveler live in?'
    return 'What is the traveler’s full legal name?'
  }
  switch (field) {
    case 'trip_type': return 'Is this trip one-way or round trip?'
    case 'return_date': return 'What date would you like to return? Use YYYY-MM-DD.'
    case 'origin': return 'Which airport or city are you flying from?'
    case 'destination': return 'Which airport or city are you flying to?'
    case 'departure_date': return 'What date would you like to leave? Use YYYY-MM-DD.'
    case 'budget': return 'What is the most you want to spend?'
    case 'max_stops': return 'How many stops are okay?'
    case 'cabin': return 'Which cabin would you like?'
    case 'passengers': return 'How many people are traveling?'
    case 'airport_preferences': return 'Should I include nearby airports?'
    case 'airline': return 'Do you have an airline preference or one to avoid?'
    case 'departure_time': return 'What departure time window works for you?'
    case 'arrival_time': return 'What arrival time window works for you?'
  }
}

/**
 * Traveler details can arrive in two turns: the initial profile answer and a
 * later provider-specific request such as a passport expiry. Keep both
 * answers in the same durable field so the model never has to ask for the
 * legal name or date of birth again.
 */
export function mergeFlightContextAnswer(
  field: FlightContextField,
  existing: unknown,
  next: string,
) {
  const nextValue = next.trim()
  if (field !== 'traveler_details') return nextValue
  const existingValue = typeof existing === 'string' ? existing.trim() : ''
  if (!existingValue || existingValue === nextValue) return nextValue || existingValue
  if (existingValue.split(/\n+/).some(value => value.trim() === nextValue)) return existingValue
  return `${existingValue}\n${nextValue}`.slice(0, 12_000)
}

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

function contextFieldFromName(value: unknown): FlightContextField | null {
  const normalized = String(value ?? '').toLocaleLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (normalized.includes('return')) return 'return_date'
  if (normalized.includes('trip')) return 'trip_type'
  if (normalized.includes('origin') || normalized.includes('departing_airport')) return 'origin'
  if (normalized.includes('destination') || normalized.includes('arrival_airport')) return 'destination'
  if (normalized.includes('departure_date') || normalized === 'date' || normalized.includes('travel_date')) return 'departure_date'
  if (normalized.includes('budget') || normalized.includes('price')) return 'budget'
  if (normalized.includes('stop') || normalized.includes('layover')) return 'max_stops'
  if (normalized.includes('cabin') || normalized.includes('class')) return 'cabin'
  if (
    (normalized.includes('traveler') || normalized.includes('traveller') || normalized.includes('passenger')) &&
    /detail|name|given|middle|family|surname|title|birth|dob|gender|sex|nationality|residence|document|passport|expiry|email|phone|contact/.test(normalized)
  ) return 'traveler_details'
  if (normalized.includes('passenger') || normalized.includes('adult') || normalized.includes('child') || normalized.includes('infant')) return 'passengers'
  if (normalized.includes('traveler_detail') || normalized.includes('traveller_detail') || normalized.includes('passport') || normalized.includes('identity_document') || normalized.includes('legal_name')) return 'traveler_details'
  if (normalized.includes('nearby') || normalized.includes('airport_preference')) return 'airport_preferences'
  if (normalized.includes('airline') || normalized.includes('carrier')) return 'airline'
  if (normalized.includes('departure_time')) return 'departure_time'
  if (normalized.includes('arrival_time')) return 'arrival_time'
  return null
}

/** Identify every flight fact a context question is asking for, in stable order. */
export function flightContextFields(question: string, missingFields: unknown): FlightContextField[] {
  const missing = Array.isArray(missingFields)
    ? missingFields.map(value => String(value)).join(' ')
    : ''
  const text = `${question} ${missing}`.toLocaleLowerCase()
  const fields: FlightContextField[] = []
  const add = (field: FlightContextField | null) => {
    if (field && !fields.includes(field)) fields.push(field)
  }
  if (Array.isArray(missingFields)) {
    for (const field of missingFields) add(contextFieldFromName(field))
  }
  if (/\b(?:return[_ ]?date|returning\s+date|(?:when|what\s+date|which\s+date)\s+(?:(?:do|will)\s+)?you\s+return|return\s+on)\b/.test(text)) add('return_date')
  if (/\b(?:trip[_ ]?type|one[ -]?way|round[ -]?trip|return\s+flight|multi[ -]?city|open[ -]?jaw|journey\s+type)\b/.test(text)) add('trip_type')
  if (/\b(?:origin[_ ]?(?:code)?|from)\b/.test(text) ||
      /\b(?:origin[_ ]?(?:code)?|from)\b[\s\S]{0,90}\b(?:airport|city|fly|depart|leave)\b|\b(?:airport|city)\b[\s\S]{0,90}\b(?:depart(?:ure|ing)?|leav(?:e|ing)|origin|from)\b/.test(text)) add('origin')
  if (/\b(?:destination[_ ]?(?:code)?|arriv(?:e|ing)?|flying\s+into|fly\s+to)\b/.test(text) ||
      /\b(?:destination[_ ]?(?:code)?|arriv(?:e|ing)?|flying\s+into|fly\s+to|where)\b[\s\S]{0,90}\b(?:airport|city|fly|go|travel|destination|to|into)\b/.test(text)) add('destination')
  if (/\b(?:departure[_ ]?date|outbound\s+date|travel\s+date|flight\s+date|date\s+range|flexible\s+dates?)\b|\b(?:when|what\s+date|which\s+date)\b[\s\S]{0,50}\b(?:fly|depart|leave|travel)\b/.test(text)) add('departure_date')
  if (/\b(?:max[_ ]?stops?|stop|stops|connection|layover)\b/.test(text)) add('max_stops')
  const asksTravelerDetails = /\b(?:travell?er|passenger)\b[\s\S]{0,100}\b(?:name|passport|date of birth|nationality|identity|document|title|gender|sex|residence|expiry|email|phone)\b|\b(?:passport|travel document|traveler details|passenger details|legal name|given name|family name|date of birth|document expiry)\b/.test(text)
  if (asksTravelerDetails) add('traveler_details')
  else if (/\b(?:passenger|travell?er|adult|child(?:ren)?|infant|baby|how many people)\b/.test(text)) add('passengers')
  if (/\b(?:budget|price|cost|spend|under|maximum)\b/.test(text)) add('budget')
  if (/\b(?:cabin|class|economy|business|first)\b/.test(text)) add('cabin')
  if (/\b(?:nearby|neighbouring|neighboring|airport preference|alternate airport|alternative airport)\b/.test(text) ||
      /\b(?:which|what)\s+airports?\b/.test(text)) add('airport_preferences')
  if (/\b(?:airline|carrier)\b/.test(text)) add('airline')
  if (/\b(?:depart(?:ure)?|leave|take off)\b[\s\S]{0,60}\b(?:time|hour|morning|afternoon|evening|night|window)\b/.test(text)) add('departure_time')
  if (/\b(?:arriv(?:e|al|ing)?|land)\b[\s\S]{0,60}\b(?:time|hour|morning|afternoon|evening|night|window)\b/.test(text)) add('arrival_time')
  return fields
}

/** Identify the first flight fact a context question is asking for. */
export function flightContextField(question: string, missingFields: unknown): FlightContextField | null {
  return flightContextFields(question, missingFields)[0] ?? null
}

export function classifySharedAgentIntent(title: string, description = ''): SharedAgentIntent {
  const value = `${title} ${description}`.toLocaleLowerCase()
  const applicationIntent = isApplicationIntent(title, description)
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
