import { assertEquals } from 'jsr:@std/assert@1'
import { classifySharedAgentIntent, flightContextField, needsSharedAgentContext, requestsPaymentHandoff } from './agent-intent.ts'

Deno.test('read-only Gmail and Calendar tasks use prepared-result completion', () => {
  assertEquals(
    classifySharedAgentIntent('Summarize the subject and sender of my latest Gmail message'),
    { capability: 'gmail', strategy: 'structured', outcomeType: 'prepared_result' },
  )
  assertEquals(
    classifySharedAgentIntent('Check my Calendar availability next week'),
    { capability: 'calendar', strategy: 'structured', outcomeType: 'prepared_result' },
  )
})

Deno.test('short titles use Description for intent and only ask when context is genuinely missing', () => {
  assertEquals(
    classifySharedAgentIntent('Book London flight', 'Return trip from Lagos next Thursday, returning Sunday. Economy.'),
    { capability: 'flight_search', strategy: 'browser', outcomeType: 'payment_handoff' },
  )
  assertEquals(
    classifySharedAgentIntent('Meet with Blessing', 'Set up a one-hour meeting next week. Prefer afternoons.'),
    { capability: 'scheduling', strategy: 'hybrid', outcomeType: 'external_change' },
  )
  assertEquals(needsSharedAgentContext('Book flight'), true)
  assertEquals(needsSharedAgentContext('Book London flight'), true)
  assertEquals(needsSharedAgentContext('Book London flight', 'Return trip from Lagos next Thursday.'), false)
  assertEquals(needsSharedAgentContext("Reply to Sarah's email"), false)
})

Deno.test('flight search that explicitly stops before booking is a prepared result', () => {
  assertEquals(
    classifySharedAgentIntent(
      'Find cheapest valid London flight',
      'Find a one-way economy flight and stop before any booking or payment step.',
    ),
    { capability: 'flight_search', strategy: 'browser', outcomeType: 'prepared_result' },
  )
  assertEquals(
    classifySharedAgentIntent(
      'Prepare London flight handoff',
      'Choose a valid result and continue only to the final safe payment handoff. Do not purchase.',
    ),
    { capability: 'flight_search', strategy: 'browser', outcomeType: 'payment_handoff' },
  )
})

Deno.test('flight context answers have stable fields and stop-before-payment means handoff', () => {
  assertEquals(requestsPaymentHandoff('Continue to the payment boundary and stop before payment.'), true)
  assertEquals(requestsPaymentHandoff('Stop before any booking or payment step.'), false)
  assertEquals(flightContextField('Which airport are you departing from?', []), 'origin')
  assertEquals(flightContextField('What date will you return?', []), 'return_date')
  assertEquals(flightContextField('What is the maximum number of stops?', []), 'max_stops')
})

Deno.test('provider writes and meeting coordination keep external-change completion', () => {
  assertEquals(
    classifySharedAgentIntent('Follow up with everyone I emailed last week'),
    { capability: 'gmail', strategy: 'structured', outcomeType: 'external_change' },
  )
  assertEquals(
    classifySharedAgentIntent('Set up a meeting with Blessing next week'),
    { capability: 'scheduling', strategy: 'hybrid', outcomeType: 'external_change' },
  )
  assertEquals(
    classifySharedAgentIntent('Submit the public conference interest form for me'),
    { capability: 'browser', strategy: 'browser', outcomeType: 'external_change' },
  )
})

Deno.test('explicitly missing consequential meeting details require context', () => {
  assertEquals(needsSharedAgentContext(
    'Handle vague meeting request',
    'Jordan asked to meet but gave no duration or topic. Handle it without inventing missing details.',
  ), true)
  assertEquals(needsSharedAgentContext(
    'Schedule investor call',
    'Use the email request, find a free 30-minute slot, reply, and add the call to Calendar.',
  ), false)
})
