export type AgentRisk = 'read' | 'prepare' | 'external_write' | 'financial'

export type AgentToolDefinition = {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
  strict: true
}

type ToolPolicy = {
  risk: AgentRisk
  approvalKind: 'send_email' | 'calendar_write' | 'browser_submit' | null
}

export type AgentExecutionDateContext = {
  utc_time: string
  timezone: string
  local_date: string
  relative_dates: Array<{
    phrase: string
    date?: string
    start_date?: string
    end_date?: string
  }>
}

const weekdayIndexes: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

function validExecutionTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return value
  } catch {
    return 'UTC'
  }
}

function localDateInTimezone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function addDateDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function nextWeekday(value: string, targetWeekday: number) {
  const currentWeekday = new Date(`${value}T12:00:00Z`).getUTCDay()
  const distance = (targetWeekday - currentWeekday + 7) % 7 || 7
  return addDateDays(value, distance)
}

export function agentExecutionDateContext(
  objective: string,
  requestedTimezone: string,
  now = new Date(),
): AgentExecutionDateContext {
  const timezone = validExecutionTimezone(requestedTimezone)
  const localDate = localDateInTimezone(now, timezone)
  const normalized = objective.toLocaleLowerCase()
  const relativeDates: AgentExecutionDateContext['relative_dates'] = []

  if (/\bnext week\b/.test(normalized)) {
    const currentWeekday = new Date(`${localDate}T12:00:00Z`).getUTCDay()
    const daysUntilNextMonday = (8 - currentWeekday) % 7 || 7
    const startDate = addDateDays(localDate, daysUntilNextMonday)
    relativeDates.push({
      phrase: 'next week',
      start_date: startDate,
      end_date: addDateDays(startDate, 6),
    })
  }
  if (/\btomorrow\b/.test(normalized)) {
    relativeDates.push({ phrase: 'tomorrow', date: addDateDays(localDate, 1) })
  }
  if (/\btoday\b/.test(normalized)) {
    relativeDates.push({ phrase: 'today', date: localDate })
  }

  const nextDayMatch = normalized.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  )
  let outboundDate = ''
  if (nextDayMatch?.[1]) {
    outboundDate = nextWeekday(localDate, weekdayIndexes[nextDayMatch[1]]!)
    relativeDates.push({
      phrase: `next ${nextDayMatch[1]}`,
      date: outboundDate,
    })
  }

  const returnDayMatch = normalized.match(
    /\breturn(?:ing)?(?:\s+on)?\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  )
  if (returnDayMatch?.[1] && outboundDate) {
    relativeDates.push({
      phrase: `returning ${returnDayMatch[1]}`,
      date: nextWeekday(outboundDate, weekdayIndexes[returnDayMatch[1]]!),
    })
  }

  return {
    utc_time: now.toISOString(),
    timezone,
    local_date: localDate,
    relative_dates: relativeDates,
  }
}

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const stringValue = (description: string, maxLength = 500) => ({
  type: 'string',
  description,
  maxLength,
})

const nullableString = (description: string, maxLength = 500) => ({
  type: ['string', 'null'],
  description,
  maxLength,
})

export const agentToolDefinitions: AgentToolDefinition[] = [
  {
    type: 'function',
    name: 'agent.request_context',
    description: 'Pause and ask the user one concise question for genuinely missing information.',
    parameters: objectSchema({
      question: stringValue('The single concise question shown to the user.', 400),
      missing_fields: {
        type: 'array',
        items: stringValue('A stable missing field name.', 80),
        maxItems: 6,
      },
    }, ['question', 'missing_fields']),
    strict: true,
  },
  {
    type: 'function',
    name: 'agent.complete',
    description: 'Complete only when the task completion policy is satisfied by verified tool results.',
    parameters: objectSchema({
      summary: stringValue('Concise user-visible outcome summary.', 1200),
      sections: {
        type: 'array',
        items: objectSchema({
          title: stringValue('Section title.', 120),
          body: stringValue('Section content.', 4000),
        }, ['title', 'body']),
        maxItems: 8,
      },
      drafts: {
        type: 'array',
        items: objectSchema({
          title: stringValue('Draft title.', 160),
          body: stringValue('Draft body.', 12000),
        }, ['title', 'body']),
        maxItems: 20,
      },
      follow_ups: {
        type: 'array',
        items: stringValue('A short follow-up task.', 300),
        maxItems: 8,
      },
      sources: {
        type: 'array',
        items: objectSchema({
          title: stringValue('Source title.', 300),
          url: stringValue('HTTP or HTTPS source URL.', 2000),
        }, ['title', 'url']),
        maxItems: 20,
      },
      prepared_result: { type: 'boolean' },
      external_change_confirmed: { type: 'boolean' },
      payment_boundary_reached: { type: 'boolean' },
      purchase_confirmed: { type: 'boolean' },
    }, [
      'summary',
      'sections',
      'drafts',
      'follow_ups',
      'sources',
      'prepared_result',
      'external_change_confirmed',
      'payment_boundary_reached',
      'purchase_confirmed',
    ]),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.search_messages',
    description: 'Search only the connected user’s Gmail with a bounded Gmail query.',
    parameters: objectSchema({
      query: stringValue('Gmail search query scoped to the objective.', 500),
      max_results: { type: 'integer', minimum: 1, maximum: 50 },
    }, ['query', 'max_results']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.read_message',
    description: 'Read one Gmail message already identified by a search or thread result.',
    parameters: objectSchema({
      message_id: stringValue('Google Gmail message ID.', 256),
    }, ['message_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.read_thread',
    description: 'Read one Gmail thread already identified as relevant to the objective.',
    parameters: objectSchema({
      thread_id: stringValue('Google Gmail thread ID.', 256),
    }, ['thread_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.create_draft',
    description: 'Prepare a private Gmail draft. This does not send the message.',
    parameters: objectSchema({
      to: {
        type: 'array',
        items: stringValue('Recipient email address.', 320),
        minItems: 1,
        maxItems: 20,
      },
      subject: stringValue('Email subject.', 998),
      body_text: stringValue('Plain-text email body.', 30000),
      thread_id: nullableString('Existing Gmail thread ID when replying.', 256),
      in_reply_to_message_id: nullableString('Existing Gmail message ID when replying.', 256),
    }, ['to', 'subject', 'body_text', 'thread_id', 'in_reply_to_message_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.send_message',
    description: 'Send one exact approved Gmail draft. Requires a pending user approval.',
    parameters: objectSchema({
      draft_id: stringValue('The Gmail draft ID created by gmail.create_draft.', 256),
      expected_to: {
        type: 'array',
        items: stringValue('Approved recipient email address.', 320),
        minItems: 1,
        maxItems: 20,
      },
      expected_subject: stringValue('Approved email subject.', 998),
    }, ['draft_id', 'expected_to', 'expected_subject']),
    strict: true,
  },
  {
    type: 'function',
    name: 'gmail.wait_for_reply',
    description: 'Pause this same AgentRun until a new reply arrives in a Gmail thread.',
    parameters: objectSchema({
      thread_id: stringValue('Gmail thread ID returned after sending.', 256),
      sent_message_id: stringValue('Gmail message ID of the message ShotCount sent.', 256),
      contact_email: nullableString('Expected respondent email address when known.', 320),
      timeout_days: { type: 'integer', minimum: 1, maximum: 30 },
    }, ['thread_id', 'sent_message_id', 'contact_email', 'timeout_days']),
    strict: true,
  },
  {
    type: 'function',
    name: 'contacts.find_contact',
    description: 'Resolve a person from the connected user’s Google contacts and recent relevant correspondence.',
    parameters: objectSchema({
      query: stringValue('Name or email fragment from the user’s task.', 300),
      max_results: { type: 'integer', minimum: 1, maximum: 10 },
    }, ['query', 'max_results']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.list_events',
    description: 'List connected calendar events in a bounded time window.',
    parameters: objectSchema({
      time_min: stringValue('Inclusive ISO 8601 start timestamp.', 64),
      time_max: stringValue('Exclusive ISO 8601 end timestamp.', 64),
      calendar_id: stringValue('Calendar ID, usually primary.', 320),
      max_results: { type: 'integer', minimum: 1, maximum: 250 },
    }, ['time_min', 'time_max', 'calendar_id', 'max_results']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.get_availability',
    description: 'Check free/busy information for a bounded set of calendars and time window.',
    parameters: objectSchema({
      time_min: stringValue('Inclusive ISO 8601 start timestamp.', 64),
      time_max: stringValue('Exclusive ISO 8601 end timestamp.', 64),
      calendar_ids: {
        type: 'array',
        items: stringValue('Calendar ID.', 320),
        minItems: 1,
        maxItems: 20,
      },
      timezone: stringValue('IANA timezone.', 120),
    }, ['time_min', 'time_max', 'calendar_ids', 'timezone']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.create_event',
    description: 'Create one exact approved calendar event and optional attendee invitations.',
    parameters: objectSchema({
      calendar_id: stringValue('Calendar ID, usually primary.', 320),
      summary: stringValue('Event title.', 1000),
      description: stringValue('Event description.', 12000),
      start: stringValue('ISO 8601 start timestamp.', 64),
      end: stringValue('ISO 8601 end timestamp.', 64),
      timezone: stringValue('IANA timezone.', 120),
      attendee_emails: {
        type: 'array',
        items: stringValue('Attendee email address.', 320),
        maxItems: 50,
      },
      add_google_meet: { type: 'boolean' },
    }, ['calendar_id', 'summary', 'description', 'start', 'end', 'timezone', 'attendee_emails', 'add_google_meet']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.update_event',
    description: 'Apply an exact approved patch to an existing calendar event.',
    parameters: objectSchema({
      calendar_id: stringValue('Calendar ID.', 320),
      event_id: stringValue('Google Calendar event ID.', 256),
      summary: nullableString('Replacement title.', 1000),
      description: nullableString('Replacement description.', 12000),
      start: nullableString('Replacement ISO 8601 start timestamp.', 64),
      end: nullableString('Replacement ISO 8601 end timestamp.', 64),
      timezone: nullableString('IANA timezone.', 120),
    }, ['calendar_id', 'event_id', 'summary', 'description', 'start', 'end', 'timezone']),
    strict: true,
  },
  {
    type: 'function',
    name: 'calendar.delete_event',
    description: 'Cancel one exact approved calendar event.',
    parameters: objectSchema({
      calendar_id: stringValue('Calendar ID.', 320),
      event_id: stringValue('Google Calendar event ID.', 256),
      notify_attendees: { type: 'boolean' },
    }, ['calendar_id', 'event_id', 'notify_attendees']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.start_session',
    description: 'Start an isolated, task-owned browser session for an allowed domain.',
    parameters: objectSchema({
      objective: stringValue('Browser sub-objective.', 1200),
      allowed_domains: {
        type: 'array',
        items: stringValue('Allowed hostname without scheme or path.', 253),
        minItems: 1,
        maxItems: 10,
      },
    }, ['objective', 'allowed_domains']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.navigate',
    description: 'Navigate the task-owned session to an HTTPS URL on its domain allowlist.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      url: stringValue('HTTPS URL on an allowed domain.', 2000),
    }, ['session_id', 'url']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.search_flights',
    description: 'Run a live, bounded round-trip flight search in the task-owned browser session.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      origin_code: stringValue('Three-letter IATA origin code.', 3),
      destination_code: stringValue('Three-letter IATA destination or city code.', 3),
      departure_date: stringValue('Outbound date in YYYY-MM-DD format.', 10),
      return_date: stringValue('Return date in YYYY-MM-DD format.', 10),
      cabin: {
        type: 'string',
        enum: ['economy', 'premium_economy', 'business', 'first'],
      },
      max_stops: { type: 'integer', minimum: 0, maximum: 2 },
      budget_amount: {
        type: ['number', 'null'],
        minimum: 0,
        maximum: 1_000_000,
      },
      currency: {
        type: 'string',
        enum: ['USD', 'GBP', 'EUR', 'NGN'],
      },
      preferred_airlines: {
        type: 'array',
        items: stringValue('Optional preferred airline.', 120),
        maxItems: 10,
      },
    }, [
      'session_id',
      'origin_code',
      'destination_code',
      'departure_date',
      'return_date',
      'cabin',
      'max_stops',
      'budget_amount',
      'currency',
      'preferred_airlines',
    ]),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.select_flight',
    description: 'Resume the task-owned flight session with one exact option returned by browser.search_flights.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      option_id: stringValue('Exact option ID returned by the live search.', 128),
    }, ['session_id', 'option_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.observe',
    description: 'Read the current task-owned browser page state.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
    }, ['session_id']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.act',
    description: 'Perform a safe preparatory action in the task-owned browser session.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      action: {
        type: 'string',
        enum: ['click', 'type', 'select', 'scroll', 'wait'],
      },
      target: stringValue('Stable locator or concise visual target.', 1000),
      value: nullableString('Value for type/select actions.', 5000),
    }, ['session_id', 'action', 'target', 'value']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.submit',
    description: 'Submit an exact approved browser form before any financial boundary.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
      target: stringValue('Exact submission target.', 1000),
      expected_effect: stringValue('Externally visible effect the user approved.', 1200),
    }, ['session_id', 'target', 'expected_effect']),
    strict: true,
  },
  {
    type: 'function',
    name: 'browser.purchase',
    description: 'Financial purchase boundary. ShotCount must never execute this tool.',
    parameters: objectSchema({
      session_id: stringValue('Browser execution session ID.', 64),
    }, ['session_id']),
    strict: true,
  },
]

const policies: Record<string, ToolPolicy> = {
  'agent.request_context': { risk: 'read', approvalKind: null },
  'agent.complete': { risk: 'read', approvalKind: null },
  'gmail.search_messages': { risk: 'read', approvalKind: null },
  'gmail.read_message': { risk: 'read', approvalKind: null },
  'gmail.read_thread': { risk: 'read', approvalKind: null },
  'gmail.create_draft': { risk: 'prepare', approvalKind: null },
  'gmail.send_message': { risk: 'external_write', approvalKind: 'send_email' },
  'gmail.wait_for_reply': { risk: 'read', approvalKind: null },
  'contacts.find_contact': { risk: 'read', approvalKind: null },
  'calendar.list_events': { risk: 'read', approvalKind: null },
  'calendar.get_availability': { risk: 'read', approvalKind: null },
  'calendar.create_event': { risk: 'external_write', approvalKind: 'calendar_write' },
  'calendar.update_event': { risk: 'external_write', approvalKind: 'calendar_write' },
  'calendar.delete_event': { risk: 'external_write', approvalKind: 'calendar_write' },
  'browser.start_session': { risk: 'read', approvalKind: null },
  'browser.navigate': { risk: 'read', approvalKind: null },
  'browser.search_flights': { risk: 'read', approvalKind: null },
  'browser.select_flight': { risk: 'prepare', approvalKind: null },
  'browser.observe': { risk: 'read', approvalKind: null },
  'browser.act': { risk: 'prepare', approvalKind: null },
  'browser.submit': { risk: 'external_write', approvalKind: 'browser_submit' },
  'browser.purchase': { risk: 'financial', approvalKind: null },
}

export function policyForAgentTool(toolName: string): ToolPolicy {
  return policies[toolName] ?? { risk: 'financial', approvalKind: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function validateHttpUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function validateEmail(value: unknown) {
  return typeof value === 'string' &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validateIso(value: unknown) {
  return typeof value === 'string' && value.length <= 64 && !Number.isNaN(Date.parse(value))
}

function validateDateOnly(value: unknown) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

function validateString(value: unknown, maximum: number, allowEmpty = false) {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.trim().length > 0)
}

function validateStringArray(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
  minimumItems = 0,
) {
  return Array.isArray(value) &&
    value.length >= minimumItems &&
    value.length <= maximumItems &&
    value.every(item => validateString(item, maximumLength))
}

export function validateAgentToolArguments(toolName: string, value: unknown) {
  if (!isRecord(value)) return false
  switch (toolName) {
    case 'agent.request_context':
      return validateString(value.question, 400) && validateStringArray(value.missing_fields, 6, 80)
    case 'agent.complete':
      return validateString(value.summary, 1200) &&
        Array.isArray(value.sections) &&
        value.sections.length <= 8 &&
        value.sections.every(section =>
          isRecord(section) &&
          validateString(section.title, 120) &&
          validateString(section.body, 4000)
        ) &&
        Array.isArray(value.drafts) &&
        value.drafts.length <= 20 &&
        value.drafts.every(draft =>
          isRecord(draft) &&
          validateString(draft.title, 160) &&
          validateString(draft.body, 12000)
        ) &&
        Array.isArray(value.follow_ups) &&
        validateStringArray(value.follow_ups, 8, 300) &&
        Array.isArray(value.sources) &&
        value.sources.length <= 20 &&
        value.sources.every(source =>
          isRecord(source) &&
          validateString(source.title, 300) &&
          validateHttpUrl(source.url)
        ) &&
        typeof value.prepared_result === 'boolean' &&
        typeof value.external_change_confirmed === 'boolean' &&
        typeof value.payment_boundary_reached === 'boolean' &&
        typeof value.purchase_confirmed === 'boolean'
    case 'gmail.search_messages':
      return validateString(value.query, 500) &&
        Number.isInteger(value.max_results) &&
        Number(value.max_results) >= 1 &&
        Number(value.max_results) <= 50
    case 'gmail.read_message':
      return validateString(value.message_id, 256)
    case 'gmail.read_thread':
      return validateString(value.thread_id, 256)
    case 'gmail.create_draft':
      return Array.isArray(value.to) &&
        value.to.length >= 1 &&
        value.to.length <= 20 &&
        value.to.every(validateEmail) &&
        validateString(value.subject, 998, true) &&
        validateString(value.body_text, 30000) &&
        (value.thread_id === null || validateString(value.thread_id, 256)) &&
        (value.in_reply_to_message_id === null || validateString(value.in_reply_to_message_id, 256))
    case 'gmail.send_message':
      return validateString(value.draft_id, 256) &&
        Array.isArray(value.expected_to) &&
        value.expected_to.length >= 1 &&
        value.expected_to.length <= 20 &&
        value.expected_to.every(validateEmail) &&
        validateString(value.expected_subject, 998, true)
    case 'gmail.wait_for_reply':
      return validateString(value.thread_id, 256) &&
        validateString(value.sent_message_id, 256) &&
        (value.contact_email === null || validateEmail(value.contact_email)) &&
        Number.isInteger(value.timeout_days) &&
        Number(value.timeout_days) >= 1 &&
        Number(value.timeout_days) <= 30
    case 'contacts.find_contact':
      return validateString(value.query, 300) &&
        Number.isInteger(value.max_results) &&
        Number(value.max_results) >= 1 &&
        Number(value.max_results) <= 10
    case 'calendar.list_events':
      return validateIso(value.time_min) &&
        validateIso(value.time_max) &&
        Date.parse(String(value.time_max)) > Date.parse(String(value.time_min)) &&
        validateString(value.calendar_id, 320) &&
        Number.isInteger(value.max_results) &&
        Number(value.max_results) >= 1 &&
        Number(value.max_results) <= 250
    case 'calendar.get_availability':
      return validateIso(value.time_min) &&
        validateIso(value.time_max) &&
        Date.parse(String(value.time_max)) > Date.parse(String(value.time_min)) &&
        validateStringArray(value.calendar_ids, 20, 320, 1) &&
        validateString(value.timezone, 120)
    case 'calendar.create_event':
      return validateString(value.calendar_id, 320) &&
        validateString(value.summary, 1000) &&
        validateString(value.description, 12000, true) &&
        validateIso(value.start) &&
        validateIso(value.end) &&
        Date.parse(String(value.end)) > Date.parse(String(value.start)) &&
        validateString(value.timezone, 120) &&
        Array.isArray(value.attendee_emails) &&
        value.attendee_emails.length <= 50 &&
        value.attendee_emails.every(validateEmail) &&
        typeof value.add_google_meet === 'boolean'
    case 'calendar.update_event':
      if (!(validateString(value.calendar_id, 320) &&
        validateString(value.event_id, 256) &&
        (value.summary === null || validateString(value.summary, 1000)) &&
        (value.description === null || validateString(value.description, 12000, true)) &&
        (value.start === null || validateIso(value.start)) &&
        (value.end === null || validateIso(value.end)) &&
        (value.timezone === null || validateString(value.timezone, 120)))) return false
      return value.start === null ||
        value.end === null ||
        Date.parse(String(value.end)) > Date.parse(String(value.start))
    case 'calendar.delete_event':
      return validateString(value.calendar_id, 320) &&
        validateString(value.event_id, 256) &&
        typeof value.notify_attendees === 'boolean'
    case 'browser.start_session':
      return validateString(value.objective, 1200) &&
        validateStringArray(value.allowed_domains, 10, 253) &&
        (value.allowed_domains as string[]).length > 0 &&
        (value.allowed_domains as string[]).every(domain =>
          /^[a-z0-9.-]+$/i.test(domain) && !domain.includes('..')
        )
    case 'browser.navigate':
      return validateString(value.session_id, 64) && validateUrl(value.url)
    case 'browser.search_flights':
      return validateString(value.session_id, 64) &&
        /^[A-Z]{3}$/.test(String(value.origin_code)) &&
        /^[A-Z]{3}$/.test(String(value.destination_code)) &&
        value.origin_code !== value.destination_code &&
        validateDateOnly(value.departure_date) &&
        validateDateOnly(value.return_date) &&
        Date.parse(`${value.return_date}T00:00:00Z`) > Date.parse(`${value.departure_date}T00:00:00Z`) &&
        ['economy', 'premium_economy', 'business', 'first'].includes(String(value.cabin)) &&
        Number.isInteger(value.max_stops) &&
        Number(value.max_stops) >= 0 &&
        Number(value.max_stops) <= 2 &&
        (value.budget_amount === null ||
          (typeof value.budget_amount === 'number' &&
            Number.isFinite(value.budget_amount) &&
            value.budget_amount >= 0 &&
            value.budget_amount <= 1_000_000)) &&
        ['USD', 'GBP', 'EUR', 'NGN'].includes(String(value.currency)) &&
        validateStringArray(value.preferred_airlines, 10, 120)
    case 'browser.select_flight':
      return validateString(value.session_id, 64) &&
        /^[a-f0-9]{16,128}$/i.test(String(value.option_id))
    case 'browser.observe':
    case 'browser.purchase':
      return validateString(value.session_id, 64)
    case 'browser.act':
      return validateString(value.session_id, 64) &&
        ['click', 'type', 'select', 'scroll', 'wait'].includes(String(value.action)) &&
        validateString(value.target, 1000) &&
        (value.value === null || validateString(value.value, 5000, true))
    case 'browser.submit':
      return validateString(value.session_id, 64) &&
        validateString(value.target, 1000) &&
        validateString(value.expected_effect, 1200)
    default:
      return false
  }
}
