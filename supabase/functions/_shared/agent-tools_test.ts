import {
  agentCompletionEvidenceSatisfied,
  agentExecutionDateContext,
  agentToolDefinitions,
  internalAgentToolName,
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
    providerConfirmedTools: ['gmail.send_message', 'calendar.create_event'],
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
  }), false)
  assertEquals(validateAgentToolArguments('calendar.update_event', {
    calendar_id: 'primary',
    event_id: 'event-1',
    summary: null,
    description: null,
    start: 'not-a-date',
    end: null,
    timezone: 'Africa/Lagos',
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
  assertEquals(validateAgentToolArguments('browser.select_flight', {
    session_id: search.session_id,
    option_id: 'not-a-worker-option',
  }), false)
})
