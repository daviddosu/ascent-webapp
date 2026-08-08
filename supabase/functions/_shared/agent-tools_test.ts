import {
  agentCompletionEvidenceSatisfied,
  agentExecutionDateContext,
  agentToolDefinitions,
  internalAgentToolName,
  openAIToolDefinition,
  openAIToolName,
  policyForAgentTool,
  validateAgentToolArguments,
} from './agent-tools.ts'
import { assertEquals } from 'jsr:@std/assert@1'

Deno.test('OpenAI tool names use a reversible API-safe wire format', () => {
  for (const tool of agentToolDefinitions) {
    const wireName = openAIToolName(tool.name)
    assertEquals(/^[a-zA-Z0-9_-]+$/.test(wireName), true)
    assertEquals(internalAgentToolName(wireName), tool.name)
  }
})

Deno.test('OpenAI tool schemas use strict mode only when every nested object is strict-compatible', () => {
  const opportunity = agentToolDefinitions.find(tool => tool.name === 'application.record_opportunity')!
  const browserObserve = agentToolDefinitions.find(tool => tool.name === 'browser.observe')!
  assertEquals(openAIToolDefinition(opportunity).strict, false)
  assertEquals(openAIToolDefinition(browserObserve).strict, true)
})

Deno.test('completion requires provider-confirmed evidence for real-world outcomes', () => {
  const base = {
    taskCompletionPolicy: 'external_change' as const,
    preparedResult: false,
    externalChangeConfirmed: true,
    purchaseConfirmed: false,
  }

  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'gmail',
    providerConfirmedTools: [],
  }), false)
  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'gmail',
    providerConfirmedTools: ['gmail.send_message'],
  }), true)
  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'scheduling',
    providerConfirmedTools: ['gmail.send_message'],
  }), false)
  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'scheduling',
    providerConfirmedTools: ['calendar.create_event'],
  }), true)
  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'scheduling',
    providerConfirmedTools: ['gmail.send_message', 'calendar.create_event'],
  }), true)
  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'scheduling',
    providerConfirmedTools: ['calendar.update_event'],
    requiredExternalEffects: ['gmail_send', 'calendar_write'],
  }), false)
  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'scheduling',
    providerConfirmedTools: ['gmail.send_message', 'calendar.update_event'],
    requiredExternalEffects: ['gmail_send', 'calendar_write'],
  }), true)
  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'calendar',
    providerConfirmedTools: ['calendar.get_availability'],
  }), false)
  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'browser',
    providerConfirmedTools: ['browser.start_session', 'browser.navigate', 'browser.act'],
  }), false)
  assertEquals(agentCompletionEvidenceSatisfied({
    ...base,
    capability: 'browser',
    providerConfirmedTools: ['browser.start_session', 'browser.submit'],
  }), true)
})

Deno.test('payment handoff cannot be mistaken for a confirmed purchase', () => {
  assertEquals(agentCompletionEvidenceSatisfied({
    taskCompletionPolicy: 'payment_handoff',
    capability: 'flight_search',
    preparedResult: false,
    externalChangeConfirmed: false,
    purchaseConfirmed: true,
    providerConfirmedTools: ['browser.select_flight'],
  }), false)
})

Deno.test('external writes require approval and payment remains forbidden', () => {
  assertEquals(policyForAgentTool('gmail.send_message'), {
    risk: 'external_write',
    approvalKind: 'send_email',
  })
  assertEquals(policyForAgentTool('calendar.create_event'), {
    risk: 'external_write',
    approvalKind: 'calendar_write',
  })
  assertEquals(policyForAgentTool('browser.purchase'), {
    risk: 'financial',
    approvalKind: null,
  })
})

Deno.test('reply watches are bounded and read-only', () => {
  assertEquals(policyForAgentTool('gmail.wait_for_reply'), {
    risk: 'read',
    approvalKind: null,
  })
  assertEquals(validateAgentToolArguments('gmail.wait_for_reply', {
    thread_id: 'thread-1',
    sent_message_id: 'message-1',
    contact_email: 'blessing@example.com',
    timeout_days: 14,
  }), true)
  assertEquals(validateAgentToolArguments('gmail.wait_for_reply', {
    thread_id: 'thread-1',
    sent_message_id: 'message-1',
    contact_email: 'blessing@example.com',
    timeout_days: 31,
  }), false)
})

Deno.test('calendar writes reject invalid time windows', () => {
  assertEquals(validateAgentToolArguments('calendar.create_event', {
    calendar_id: 'primary',
    summary: 'ShotCount launch',
    description: '',
    start: '2026-07-30T15:00:00+01:00',
    end: '2026-07-30T14:30:00+01:00',
    timezone: 'Africa/Lagos',
    attendee_emails: ['blessing@example.com'],
    add_google_meet: true,
    notify_attendees: true,
  }), false)
  assertEquals(validateAgentToolArguments('calendar.update_event', {
    calendar_id: 'primary',
    event_id: 'event-1',
    summary: null,
    description: null,
    start: 'not-a-date',
    end: null,
    timezone: 'Africa/Lagos',
    notify_attendees: false,
  }), false)
  assertEquals(validateAgentToolArguments('calendar.create_event', {
    calendar_id: 'primary',
    summary: 'ShotCount launch',
    description: '',
    start: '2026-07-30T15:00:00',
    end: '2026-07-30T15:30:00',
    timezone: 'not/a-timezone',
    attendee_emails: [],
    add_google_meet: false,
    notify_attendees: false,
  }), false)
})

Deno.test('Gmail drafts require coherent reply identity and distinct recipients', () => {
  const base = {
    to: ['blessing@example.com'],
    cc: [],
    bcc: [],
    subject: 'Hello',
    body_text: 'Hello there.',
    thread_id: null,
    in_reply_to_message_id: null,
  }
  assertEquals(validateAgentToolArguments('gmail.create_draft', {
    ...base,
    thread_id: 'thread-1',
    in_reply_to_message_id: null,
  }), false)
  assertEquals(validateAgentToolArguments('gmail.create_draft', {
    ...base,
    cc: ['blessing@example.com'],
  }), false)
})

Deno.test('calendar reads require a bounded forward time window and at least one calendar', () => {
  assertEquals(validateAgentToolArguments('calendar.list_events', {
    time_min: '2026-07-30T15:00:00+01:00',
    time_max: '2026-07-30T14:30:00+01:00',
    calendar_id: 'primary',
    max_results: 25,
  }), false)
  assertEquals(validateAgentToolArguments('calendar.get_availability', {
    time_min: '2026-07-30T14:30:00+01:00',
    time_max: '2026-07-30T15:00:00+01:00',
    calendar_ids: [],
    timezone: 'Africa/Lagos',
  }), false)
})

Deno.test('relative dates are anchored to the user timezone and ordered flight legs', () => {
  const context = agentExecutionDateContext(
    'Find a flight next Thursday, returning Sunday',
    'Africa/Lagos',
    new Date('2026-07-25T23:30:00.000Z'),
  )
  assertEquals(context.local_date, '2026-07-26')
  assertEquals(context.timezone, 'Africa/Lagos')
  assertEquals(context.relative_dates, [
    { phrase: 'next thursday', date: '2026-07-30' },
    { phrase: 'returning sunday', date: '2026-08-02' },
  ])
})

Deno.test('next week uses the next Monday-through-Sunday window', () => {
  const context = agentExecutionDateContext(
    'Set up a meeting with Blessing next week',
    'Africa/Lagos',
    new Date('2026-07-25T09:00:00.000Z'),
  )
  assertEquals(context.relative_dates, [{
    phrase: 'next week',
    start_date: '2026-07-27',
    end_date: '2026-08-02',
  }])
})

Deno.test('completion output is deeply validated', () => {
  assertEquals(validateAgentToolArguments('agent.complete', {
    summary: 'Prepared three options.',
    sections: [{ title: 'Best overall', body: 'A concise comparison.' }],
    drafts: [],
    follow_ups: [],
    sources: [{ title: 'Invalid', url: 'javascript:alert(1)' }],
    prepared_result: true,
    external_change_confirmed: false,
    payment_boundary_reached: false,
    purchase_confirmed: false,
  }), false)
})

Deno.test('flight search is structured, bounded, and cannot cross payment policy', () => {
  const search = {
    session_id: 'cdd9dba7-af84-48ae-b61a-d85d9e514d80',
    origin_code: 'LOS',
    destination_code: 'LON',
    departure_date: '2026-07-30',
    return_date: '2026-08-02',
    cabin: 'economy',
    max_stops: 1,
    budget_amount: 1000,
    currency: 'USD',
    preferred_airlines: [],
    excluded_airlines: [],
    adults: 1,
    children: 0,
    children_ages: [],
    infants: 0,
    infant_seats: 0,
    allow_nearby_airports: false,
    departure_time_window: null,
    arrival_time_window: null,
  }
  assertEquals(policyForAgentTool('browser.search_flights'), {
    risk: 'read',
    approvalKind: null,
  })
  assertEquals(policyForAgentTool('browser.select_flight'), {
    risk: 'prepare',
    approvalKind: null,
  })
  assertEquals(validateAgentToolArguments('browser.search_flights', search), true)
  assertEquals(validateAgentToolArguments('browser.search_flights', {
    ...search,
    return_date: '2026-07-29',
  }), false)
  assertEquals(validateAgentToolArguments('browser.search_flights', {
    ...search,
    departure_date: '2026-02-30',
  }), false)
  assertEquals(validateAgentToolArguments('browser.search_flights', {
    ...search,
    infants: 2,
    adults: 1,
  }), false)
  assertEquals(validateAgentToolArguments('browser.search_flights', {
    ...search,
    children: 1,
    children_ages: [],
  }), false)
  assertEquals(validateAgentToolArguments('browser.search_flights', {
    ...search,
    departure_time_window: '25:00-26:00',
  }), false)
  assertEquals(validateAgentToolArguments('browser.search_flights', {
    ...search,
    infants: 1,
    infant_seats: 2,
  }), false)
  assertEquals(validateAgentToolArguments('browser.select_flight', {
    session_id: search.session_id,
    option_id: 'not-a-worker-option',
  }), false)
})

Deno.test('flight checkout preparation accepts traveler data but rejects incomplete or payment-shaped data', () => {
  const checkout = {
    session_id: 'cdd9dba7-af84-48ae-b61a-d85d9e514d80',
    travelers: [{
      traveler_type: 'adult',
      title: null,
      given_name: 'Ada',
      middle_name: null,
      family_name: 'Lovelace',
      date_of_birth: '1815-12-10',
      gender: null,
      nationality: 'GB',
      residence_country: null,
      document_type: 'passport',
      document_number: 'P1234567',
      document_issuing_country: 'GB',
      document_expiry: '2030-12-10',
    }],
    contact_email: 'traveler@example.com',
    contact_phone: '+2348000000000',
  }
  assertEquals(policyForAgentTool('browser.prepare_flight_checkout'), {
    risk: 'prepare',
    approvalKind: null,
  })
  assertEquals(validateAgentToolArguments('browser.prepare_flight_checkout', checkout), true)
  assertEquals(validateAgentToolArguments('browser.prepare_flight_checkout', {
    ...checkout,
    travelers: [{ ...checkout.travelers[0], document_number: 'P123', document_expiry: null }],
  }), false)
  assertEquals(validateAgentToolArguments('browser.prepare_flight_checkout', {
    ...checkout,
    contact_email: 'not-an-email',
  }), false)
  assertEquals(validateAgentToolArguments('browser.prepare_flight_checkout', {
    ...checkout,
    contact_phone: 'not a phone number',
  }), false)
  assertEquals(validateAgentToolArguments('browser.prepare_flight_checkout', {
    ...checkout,
    travelers: [{ ...checkout.travelers[0], date_of_birth: '2999-01-01' }],
  }), false)
  assertEquals(validateAgentToolArguments('browser.prepare_flight_checkout', {
    ...checkout,
    card_number: '4111111111111111',
  }), false)
  assertEquals(validateAgentToolArguments('browser.prepare_flight_checkout', {
    ...checkout,
    travelers: [{ ...checkout.travelers[0], cvv: '123' }],
  }), false)
})
