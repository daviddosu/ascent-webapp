import { describe, expect, it } from 'vitest'
import { agentProgressTimeline } from './agent-progress'

describe('agent progress timeline', () => {
  it('shows only recorded completions and the current operation', () => {
    expect(agentProgressTimeline({
      completed: ['Opened the report', 'Opened the report', 'Extracted the key sections'],
      current: 'Roon is summarizing the main points.',
      status: 'running',
    })).toEqual({
      completed: ['Opened the report', 'Extracted the key sections'],
      active: 'Roon is summarizing the main points.',
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
})
