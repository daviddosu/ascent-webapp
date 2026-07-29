import { describe, expect, it } from 'vitest'
import { classifySharedAgentIntent } from './agent-intent'

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
  })
})
