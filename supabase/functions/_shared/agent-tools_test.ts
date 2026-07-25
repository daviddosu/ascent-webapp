import {
  policyForAgentTool,
  validateAgentToolArguments,
} from './agent-tools.ts'
import { assertEquals } from 'jsr:@std/assert@1'

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
