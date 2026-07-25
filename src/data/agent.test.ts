import { describe, expect, it } from 'vitest'
import {
  agentCapability,
  createAgentRun,
  needsAgentContext,
  resolveAgentFunctionError,
} from './agent'

describe('task agent model', () => {
  it('classifies the supported MVP capabilities', () => {
    expect(agentCapability({ id: '1', title: 'Research five relevant professors' })).toBe('research')
    expect(agentCapability({ id: '2', title: 'Draft a launch announcement' })).toBe('draft')
    expect(agentCapability({ id: '3', title: 'Research professors and draft candidate profiles' })).toBe('research_draft')
    expect(agentCapability({ id: '4', title: 'Follow up by email with everyone from last week' })).toBe('gmail')
    expect(agentCapability({ id: '5', title: 'Find a return flight from Lagos to London' })).toBe('flight_search')
  })

  it('asks for context progressively only when the task is too vague', () => {
    expect(needsAgentContext({ id: '1', title: 'Research' })).toBe(true)
    expect(needsAgentContext({ id: '2', title: 'Research', description: 'Compare three particle physics programs.' })).toBe(false)
    expect(needsAgentContext({ id: '3', title: 'Book flight' })).toBe(true)
    expect(needsAgentContext({ id: '4', title: 'Book London flight', description: 'Return from Lagos next Thursday and come back Sunday.' })).toBe(false)
    expect(needsAgentContext({ id: '5', title: "Reply to Sarah's email" })).toBe(false)
  })

  it('creates a private task-linked run without hidden reasoning', () => {
    const run = createAgentRun({ id: 'task-1', title: 'Find relevant scholarship programs', description: 'Focus on Europe.' })
    expect(run.taskId).toBe('task-1')
    expect(run.status).toBe('planning')
    expect(run.context).toBe('Focus on Europe.')
    expect(run.intent.strategy).toBe('structured')
    expect(run.result).toBeNull()
  })

  it('surfaces the server error returned by an Edge Function', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'OpenAI request failed with 429.' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    })

    await expect(resolveAgentFunctionError(error, 'Fallback')).resolves.toBe(
      'OpenAI request failed with 429.',
    )
  })
})
