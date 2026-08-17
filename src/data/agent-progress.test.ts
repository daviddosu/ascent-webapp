import { describe, expect, it } from 'vitest'
import { agentProgressTimeline, humanizeAgentProgressLabel } from './agent-progress'

describe('agent progress timeline', () => {
  it('shows only recorded completions and the current operation', () => {
    expect(agentProgressTimeline({
      completed: ['Opened the report', 'Opened the report', 'Extracted the key sections'],
      current: 'Roon is summarizing the main points.',
      status: 'running',
    })).toEqual({
      completed: ['Opened the report', 'Extracted the key sections'],
      active: 'I’m summarizing the main points.',
    })
  })

  it('uses the exact external wait as the active row', () => {
    expect(agentProgressTimeline({
      completed: ['Compared live flight options.', 'Waiting for the next update.'],
      current: 'Caspian is selecting the best matching itinerary.',
      waitingReason: 'Waiting for the next update.',
      status: 'waiting_external',
    })).toEqual({
      completed: ['Compared live flight options.'],
      active: 'Waiting for the next update.',
    })
  })

  it('does not invent an active row when live state is absent', () => {
    expect(agentProgressTimeline({
      completed: ['Opened the report'],
      status: 'running',
    })).toEqual({
      completed: ['Opened the report'],
      active: null,
    })
  })

  it('turns browser-worker wording into one clear activity', () => {
    expect(agentProgressTimeline({
      completed: [
        'Started an isolated browser session.',
        'Opened the allowed public webpage.',
      ],
      current: 'Opening the allowed public webpage.',
      status: 'running',
    })).toEqual({
      completed: ['Set up a secure workspace.'],
      active: 'Finding the right page.',
    })
    expect(humanizeAgentProgressLabel('Roon is waiting for the external update: Opening the allowed public webpage.'))
      .toBe('Finding the right page.')
  })

  it('turns internal controller failures into a clear next-step message', () => {
    expect(humanizeAgentProgressLabel('The required external effect remained unsatisfied after bounded same-run continuations.'))
      .toBe('I hit a snag finishing this step. Your progress is saved, and I’m finding a safer way forward.')
    expect(humanizeAgentProgressLabel('The bounded semantic decision remained invalid after one stronger repair: evidence_invalid.'))
      .toBe('I found a mismatch in the details, so I’m double-checking the application before I move on.')
    expect(humanizeAgentProgressLabel('The reconciliation_ledger controller rejected the step.'))
      .toBe('I found something to double-check before I move on. Your progress is saved.')
  })

  it('does not show the same moment as both history and live activity', () => {
    expect(agentProgressTimeline({
      completed: ['Found the right page.'],
      current: 'Finding the right page.',
      status: 'running',
    })).toEqual({
      completed: [],
      active: 'Finding the right page.',
    })
  })
})
