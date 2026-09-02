import { describe, expect, it } from 'vitest'
import {
  agentActionIdempotencyKey,
  canTransitionAgentRun,
  classifyAgentIntent,
  mayExecuteTool,
  outcomeCompletesTask,
  policyForTool,
  transitionAgentRun,
} from './agent-runtime'

describe('durable agent state', () => {
  it('allows recoverable work and waiting transitions', () => {
    expect(canTransitionAgentRun('planning', 'running')).toBe(true)
    expect(canTransitionAgentRun('running', 'needs_approval')).toBe(true)
    expect(canTransitionAgentRun('needs_approval', 'waiting_external')).toBe(true)
    expect(canTransitionAgentRun('waiting_external', 'running')).toBe(true)
    expect(canTransitionAgentRun('completed', 'running')).toBe(false)
  })

  it('sets completion timestamps and rejects invalid transitions', () => {
    const start = {
      status: 'running' as const,
      currentStep: 2,
      waitingReason: '',
      completedAt: null,
      updatedAt: '2026-07-24T10:00:00.000Z',
    }
    const completed = transitionAgentRun(start, 'completed', {}, '2026-07-24T10:01:00.000Z')
    expect(completed.completedAt).toBe('2026-07-24T10:01:00.000Z')
    expect(() => transitionAgentRun(completed, 'running')).toThrow('Invalid agent run transition')
  })
})

describe('agent policy', () => {
  it('allows reads and preparation without approval', () => {
    expect(policyForTool('gmail.search_messages').decision).toBe('allow')
    expect(policyForTool('gmail.create_draft').decision).toBe('allow')
    expect(policyForTool('gmail.wait_for_reply').decision).toBe('allow')
    expect(policyForTool('calendar.get_availability').risk).toBe('read')
    expect(policyForTool('browser.act')).toMatchObject({ risk: 'prepare', decision: 'allow' })
  })

  it('requires approval for external writes and never delegates payment', () => {
    expect(mayExecuteTool('gmail.send_message').decision).toBe('require_approval')
    expect(mayExecuteTool('gmail.send_message', true).decision).toBe('allow')
    expect(mayExecuteTool('browser.purchase', true).decision).toBe('deny')
    expect(policyForTool('unknown.tool').decision).toBe('deny')
  })

  it('builds stable, action-scoped idempotency keys', () => {
    const first = agentActionIdempotencyKey('run-1', 'gmail.send_message', { to: 'a@example.com', body: 'Hi' }, 3)
    const reordered = agentActionIdempotencyKey('run-1', 'gmail.send_message', { body: 'Hi', to: 'a@example.com' }, 3)
    const next = agentActionIdempotencyKey('run-1', 'gmail.send_message', { to: 'a@example.com', body: 'Hi' }, 4)
    expect(first).toBe(reordered)
    expect(next).not.toBe(first)
  })
})

describe('agent intent and completion semantics', () => {
  it('routes Gmail, scheduling, and browser work deliberately', () => {
    expect(classifyAgentIntent('Follow up with everyone I emailed last week')).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'external_change',
    })
    expect(classifyAgentIntent('Set up a meeting with Blessing and email her next week')).toEqual({
      capability: 'scheduling',
      strategy: 'hybrid',
      outcomeType: 'external_change',
    })
    expect(classifyAgentIntent('Set up a meeting with Blessing next week to discuss the ShotCount launch')).toEqual({
      capability: 'scheduling',
      strategy: 'hybrid',
      outcomeType: 'external_change',
    })
    expect(classifyAgentIntent('Summarize the subject and sender of my latest Gmail message')).toEqual({
      capability: 'gmail',
      strategy: 'structured',
      outcomeType: 'prepared_result',
    })
    expect(classifyAgentIntent('Check my Calendar availability next week')).toEqual({
      capability: 'calendar',
      strategy: 'structured',
      outcomeType: 'prepared_result',
    })
    expect(classifyAgentIntent(
      'Apply to Stanford Physics PhD',
      'Research the requirements and prepare the application.',
    )).toEqual({ capability: 'browser', strategy: 'hybrid', outcomeType: 'prepared_result' })
  })

  it('does not confuse preparation with the real external outcome', () => {
    const scheduling = classifyAgentIntent('Set up a meeting with Blessing and email her next week')
    expect(outcomeCompletesTask(scheduling, { preparedResult: true })).toBe(false)
    expect(outcomeCompletesTask(scheduling, { externalChangeConfirmed: true })).toBe(true)
  })
})
