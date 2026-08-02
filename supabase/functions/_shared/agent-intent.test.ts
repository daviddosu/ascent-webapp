import { describe, expect, it } from 'vitest'
import { classifySharedAgentIntent, flightContextField, flightContextFields, requestsPaymentHandoff } from './agent-intent.ts'

describe('shared agent intent', () => {
  it('does not treat a negated calendar write as the requested outcome', () => {
    expect(classifySharedAgentIntent(
      'Find a free hour',
      'Find a conflict-free one-hour slot on my calendar. Do not create an event.',
    )).toEqual({
      capability: 'calendar',
      strategy: 'structured',
      outcomeType: 'prepared_result',
    })
  })

  it('keeps an affirmative calendar change approval-gated', () => {
    expect(classifySharedAgentIntent(
      'Create afternoon meeting',
      'Create a 45-minute meeting called Design Review.',
    ).outcomeType).toBe('external_change')
  })

  it('treats a requested Gmail draft as a prepared result', () => {
    expect(classifySharedAgentIntent(
      'Follow up with investors',
      'Find the unanswered threads and prepare a concise follow-up to each.',
    )).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'prepared_result',
    })
  })

  it('keeps a requested Gmail reply as an external change', () => {
    expect(classifySharedAgentIntent(
      'Reply to Sarah',
      "Reply to Sarah's most recent email and tell her Tuesday works.",
    ).outcomeType).toBe('external_change')
  })

  it.each(['Tell Ada about the meeting.', 'Ask Ada whether Tuesday works.', 'Remind Ada about the appointment.'])('%s is an affirmative Gmail communication', description => {
    expect(classifySharedAgentIntent('Roon communication', description)).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'external_change',
    })
  })

  it('keeps email nouns in read-only questions from becoming sends', () => {
    expect(classifySharedAgentIntent('Roon research', 'Tell me about the latest email.')).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'prepared_result',
    })
  })

  it('keeps advisory Calendar questions read-only', () => {
    expect(classifySharedAgentIntent('Roon advice', 'Should I schedule a meeting with Ada?')).toEqual({
      capability: 'calendar',
      strategy: 'structured',
      outcomeType: 'prepared_result',
    })
  })

  it('treats syncing a dated pitch to a recipient email as a calendar invite workflow', () => {
    expect(classifySharedAgentIntent(
      'Email David',
      "Tell David to prepare for Antler's speech; the pitch is Friday. Sync the pitch to his email for Friday at 11 a.m. Nigeria time.",
    )).toEqual({
      capability: 'scheduling',
      strategy: 'hybrid',
      outcomeType: 'external_change',
    })
  })

  it.each([
    'Put the call in her inbox for Thursday at 2 p.m.',
    'Add the interview to his Gmail for next Monday.',
    'Place the session on their calendar and invite them.',
  ])('infers a calendar invite when an event is described through the wrong surface: %s', description => {
    expect(classifySharedAgentIntent('Let the recipient know', description)).toEqual({
      capability: 'scheduling',
      strategy: 'hybrid',
      outcomeType: 'external_change',
    })
  })

  it('does not turn a normal event-notification email into a calendar change', () => {
    expect(classifySharedAgentIntent(
      'Email Ada',
      'Tell Ada that the pitch is on Friday at 11 a.m. Nigeria time.',
    )).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'external_change',
    })
    expect(classifySharedAgentIntent(
      'Email Ada',
      'Tell Ada about scheduling the meeting next week.',
    )).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'external_change',
    })
    expect(classifySharedAgentIntent(
      'Email Ada',
      'Ask Ada whether scheduling the meeting next week works.',
    )).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'external_change',
    })
    expect(classifySharedAgentIntent(
      'Email Ada',
      'Tell Ada about the calendar invite already on the schedule.',
    )).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'external_change',
    })
    expect(classifySharedAgentIntent(
      'Tell Ada',
      'Tell Ada about the calendar invite already on the schedule.',
    ).capability).toBe('gmail')
    expect(classifySharedAgentIntent(
      'Ask Ada',
      'Ask Ada to put the meeting on my calendar.',
    ).capability).toBe('gmail')
    expect(classifySharedAgentIntent(
      'Tell Ada',
      'Tell Ada about the meeting; do not add it to my calendar.',
    ).capability).toBe('gmail')
  })

  it('keeps explicitly negated invites and calendar placement as email-only communication', () => {
    expect(classifySharedAgentIntent(
      'Email Ada',
      'Tell Ada the meeting is tomorrow; do not invite her or put it on her calendar.',
    )).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'external_change',
    })
    expect(classifySharedAgentIntent(
      'Create the event and email Ada',
      'Create the event, but do not invite anyone. Send Ada a confirmation email.',
    ).capability).toBe('scheduling')
  })

  it.each([
    'Invite Ada to the meeting next week.',
    'Send Ada a meeting invitation.',
    'Check Ada\'s availability for next week, then propose a time.',
    'Check Ada availability for next week, then propose a time.',
    'Put the meeting in Ada\'s inbox for Thursday at 2 p.m.',
  ])('recognises person-to-person coordination: %s', description => {
    expect(classifySharedAgentIntent('Coordinate with Ada', description)).toEqual({
      capability: 'scheduling',
      strategy: 'hybrid',
      outcomeType: 'external_change',
    })
  })

  it('keeps a personal calendar placement out of the scheduling negotiation path', () => {
    expect(classifySharedAgentIntent(
      'Add event to my calendar',
      'Add the event to my calendar for Thursday at 2 p.m.',
    )).toEqual({
      capability: 'calendar',
      strategy: 'structured',
      outcomeType: 'external_change',
    })
  })

  it.each([
    'Arrange time with Ada next week.',
    'Find a time with Ada next week.',
    'Coordinate with Ada about a one-hour call.',
  ])('recognises ordinary-language person-to-person coordination without a Calendar keyword: %s', description => {
    expect(classifySharedAgentIntent('Coordinate availability', description)).toEqual({
      capability: 'scheduling',
      strategy: 'hybrid',
      outcomeType: 'external_change',
    })
  })

  it('keeps personal availability as a personal Calendar request', () => {
    expect(classifySharedAgentIntent('Find availability', 'Check my availability for next week.')).toEqual({
      capability: 'calendar',
      strategy: 'structured',
      outcomeType: 'prepared_result',
    })
  })

  it.each([
    ['Create event', 'Create an event tomorrow.', 'calendar', 'external_change'],
    ['Schedule meeting', 'Schedule a meeting tomorrow.', 'scheduling', 'external_change'],
    ['Set up meeting', 'Set up a meeting tomorrow.', 'scheduling', 'external_change'],
    ['Reschedule meeting', 'Reschedule the meeting to Friday.', 'scheduling', 'external_change'],
    ['Find a free slot', 'Find a free time with Ada next week.', 'scheduling', 'external_change'],
    ['Find availability', 'Find a free slot on my calendar next week.', 'calendar', 'prepared_result'],
    ['Draft only', 'Draft an email about tomorrow\'s meeting; do not send it.', 'gmail', 'prepared_result'],
    ['Write and send', 'Write and send the email to Ada.', 'gmail', 'external_change'],
    ['No reply', 'Do not reply to the email; summarize it.', 'gmail', 'prepared_result'],
  ] as const)('%s stays in the intended communication capability', (_label, description, capability, outcomeType) => {
    expect(classifySharedAgentIntent(_label, description)).toEqual({
      capability,
      strategy: capability === 'scheduling' ? 'hybrid' : 'structured',
      outcomeType,
    })
  })

  it('treats stopping before payment as a prepared booking handoff', () => {
    expect(classifySharedAgentIntent(
      'Find me a flight',
      'Find the best live option and stop before payment.',
    ).outcomeType).toBe('payment_handoff')
    expect(requestsPaymentHandoff('stop before any booking or payment step')).toBe(false)
  })

  it('groups independent missing flight fields in a stable order', () => {
    expect(flightContextFields(
      'Tell me the departure date, budget, and passenger count.',
      ['departure_date', 'budget', 'passengers'],
    )).toEqual(['departure_date', 'budget', 'passengers'])
  })

  it.each([
    ['Which airport are you departing from?', 'origin'],
    ['What date do you want to fly?', 'departure_date'],
    ['Is this one-way or round-trip?', 'trip_type'],
    ['What date will you return?', 'return_date'],
    ['What is the maximum number of stops?', 'max_stops'],
  ] as const)('identifies the durable field for a flight context question: %s', (question, field) => {
    expect(flightContextField(question, [])).toBe(field)
  })
})
