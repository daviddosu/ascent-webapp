import { describe, expect, it } from 'vitest'
import { agentCapability, createAgentRun, needsAgentContext } from './agent'

describe('task agent model', () => {
  it('classifies the supported MVP capabilities', () => {
    expect(agentCapability({ id: '1', title: 'Research five relevant professors' })).toBe('research')
    expect(agentCapability({ id: '2', title: 'Draft an introductory email' })).toBe('draft')
    expect(agentCapability({ id: '3', title: 'Research professors and draft outreach emails' })).toBe('research_draft')
  })

  it('asks for context progressively only when the task is too vague', () => {
    expect(needsAgentContext({ id: '1', title: 'Research' })).toBe(true)
    expect(needsAgentContext({ id: '2', title: 'Research', description: 'Compare three particle physics programs.' })).toBe(false)
  })

  it('creates a private task-linked run without hidden reasoning', () => {
    const run = createAgentRun({ id: 'task-1', title: 'Find relevant scholarship programs', description: 'Focus on Europe.' })
    expect(run.taskId).toBe('task-1')
    expect(run.status).toBe('ready')
    expect(run.context).toBe('Focus on Europe.')
    expect(run.result).toBeNull()
  })
})
