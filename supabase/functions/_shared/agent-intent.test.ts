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
})
