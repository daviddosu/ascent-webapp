import { describe, expect, it } from 'vitest'
import {
  agentActionIdempotencyKey,
  classifyAgentIntent,
  mayExecuteTool,
  outcomeCompletesTask,
  transitionAgentRun,
  type AgentIntent,
  type AgentRunState,
} from './agent-runtime'
import { agentCompletionEvidenceSatisfied } from '../../supabase/functions/_shared/agent-tools'

type ToolResult = Record<string, unknown>

class MockProvider {
  calls: Array<{ tool: string; arguments: ToolResult; idempotencyKey: string }> = []
  private completed = new Map<string, ToolResult>()

  execute(tool: string, argumentsValue: ToolResult, idempotencyKey: string) {
    const existing = this.completed.get(idempotencyKey)
    if (existing) return existing
    const output = { ok: true, tool, ...argumentsValue }
    this.calls.push({ tool, arguments: argumentsValue, idempotencyKey })
    this.completed.set(idempotencyKey, output)
    return output
  }

  count(tool: string) {
    return this.calls.filter(call => call.tool === tool).length
  }
}

class AgentFlow {
  state: AgentRunState = {
    status: 'running',
    currentStep: 0,
    waitingReason: '',
    completedAt: null,
    updatedAt: '2026-07-25T09:00:00.000Z',
  }
  readonly intent: AgentIntent
  readonly provider = new MockProvider()
  readonly events: string[] = ['agent_run_started']
  private pendingApproval: {
    tool: string
    argumentsValue: ToolResult
    idempotencyKey: string
  } | null = null

  constructor(readonly runId: string, objective: string) {
    this.intent = classifyAgentIntent(objective)
  }

  execute(tool: string, argumentsValue: ToolResult) {
    const policy = mayExecuteTool(tool)
    if (policy.decision === 'deny') throw new Error(policy.reason)
    const idempotencyKey = agentActionIdempotencyKey(
      this.runId,
      tool,
      argumentsValue,
      this.state.currentStep,
    )
    if (policy.decision === 'require_approval') {
      this.pendingApproval = { tool, argumentsValue, idempotencyKey }
      this.state = transitionAgentRun(this.state, 'needs_approval', {
        waitingReason: tool,
      })
      this.events.push('agent_approval_requested')
      return { approvalRequired: true }
    }
    const output = this.provider.execute(tool, argumentsValue, idempotencyKey)
    this.state = transitionAgentRun(this.state, 'running', {
      currentStep: this.state.currentStep + 1,
    })
    this.events.push(`tool:${tool}`)
    return output
  }

  approve() {
    if (!this.pendingApproval) throw new Error('No approval is pending.')
    const approval = this.pendingApproval
    this.pendingApproval = null
    this.state = transitionAgentRun(this.state, 'running')
    const output = this.provider.execute(
      approval.tool,
      approval.argumentsValue,
      approval.idempotencyKey,
    )
    this.state = transitionAgentRun(this.state, 'running', {
      currentStep: this.state.currentStep + 1,
    })
    this.events.push(`approved:${approval.tool}`)
    return output
  }

  wait(reason: string) {
    this.state = transitionAgentRun(this.state, 'waiting_external', {
      waitingReason: reason,
    })
    this.events.push('agent_waiting_external')
  }

  resume() {
    this.state = transitionAgentRun(this.state, 'running')
    this.events.push('agent_resumed')
  }

  handoff(reason: string) {
    this.state = transitionAgentRun(this.state, 'waiting_for_user', {
      waitingReason: reason,
    })
    this.events.push('agent_waiting_for_user')
  }

  continueFromUser() {
    this.state = transitionAgentRun(this.state, 'running')
  }

  complete(result: {
    preparedResult?: boolean
    externalChangeConfirmed?: boolean
    paymentBoundaryReached?: boolean
    purchaseConfirmed?: boolean
  }) {
    const policySatisfied = agentCompletionEvidenceSatisfied({
      taskCompletionPolicy: this.intent.outcomeType,
      capability: this.intent.capability,
      preparedResult: result.preparedResult === true,
      externalChangeConfirmed: result.externalChangeConfirmed === true,
      purchaseConfirmed: result.purchaseConfirmed === true,
      providerConfirmedTools: this.provider.calls.map(call => call.tool),
    })
    if (!outcomeCompletesTask(this.intent, result) || !policySatisfied) return false
    this.state = transitionAgentRun(this.state, 'completed')
    this.events.push('task_completed_by_agent')
    return true
  }
}

describe('mocked AgentRun integration journeys', () => {
  it('searches Gmail, drafts, approves one exact send, and completes once', () => {
    const flow = new AgentFlow('run-gmail', 'Follow up by email with Blessing')
    flow.execute('gmail.search_messages', { query: 'from:blessing@example.com' })
    flow.execute('gmail.create_draft', {
      to: ['blessing@example.com'],
      subject: 'Following up',
      body_text: 'Hi Blessing, just following up.',
    })
    expect(flow.execute('gmail.send_message', {
      draft_id: 'draft-1',
      expected_to: ['blessing@example.com'],
      expected_subject: 'Following up',
    })).toEqual({ approvalRequired: true })
    expect(flow.provider.count('gmail.send_message')).toBe(0)
    flow.approve()
    expect(flow.provider.count('gmail.send_message')).toBe(1)
    expect(flow.complete({ externalChangeConfirmed: true })).toBe(true)
    expect(flow.state.status).toBe('completed')
    expect(flow.events).toContain('task_completed_by_agent')
  })

  it('checks Calendar availability, approves event creation, and completes', () => {
    const flow = new AgentFlow('run-calendar', 'Schedule a meeting with Blessing next week')
    flow.execute('calendar.get_availability', {
      time_min: '2026-07-27T09:00:00+01:00',
      time_max: '2026-07-31T17:00:00+01:00',
      calendar_ids: ['primary'],
      timezone: 'Africa/Lagos',
    })
    flow.execute('calendar.create_event', {
      calendar_id: 'primary',
      summary: 'ShotCount launch',
      description: '',
      start: '2026-07-30T14:00:00+01:00',
      end: '2026-07-30T14:30:00+01:00',
      attendee_emails: ['blessing@example.com'],
      add_google_meet: false,
      notify_attendees: true,
    })
    expect(flow.provider.count('calendar.create_event')).toBe(0)
    flow.approve()
    expect(flow.provider.count('calendar.create_event')).toBe(1)
    expect(flow.complete({ externalChangeConfirmed: true })).toBe(true)
  })

  it('resumes the same scheduling run after a reply before creating the meeting', () => {
    const flow = new AgentFlow(
      'run-scheduling',
      'Set up a meeting with Blessing and email her next week',
    )
    flow.execute('contacts.find_contact', { query: 'Blessing', max_results: 10 })
    flow.execute('calendar.get_availability', {
      time_min: '2026-07-27T09:00:00+01:00',
      time_max: '2026-07-31T17:00:00+01:00',
      calendar_ids: ['primary'],
      timezone: 'Africa/Lagos',
    })
    flow.execute('gmail.create_draft', {
      to: ['blessing@example.com'],
      subject: 'Meeting next week',
      body_text: 'Would Thursday at 2 PM work?',
    })
    flow.execute('gmail.send_message', {
      draft_id: 'draft-2',
      expected_to: ['blessing@example.com'],
      expected_subject: 'Meeting next week',
    })
    flow.approve()
    flow.execute('gmail.wait_for_reply', {
      thread_id: 'thread-1',
      sent_message_id: 'message-1',
      timeout_days: 14,
    })
    flow.wait('Waiting for Blessing to reply.')
    expect(flow.state.status).toBe('waiting_external')
    flow.resume()
    expect(flow.events).toContain('agent_resumed')
    expect(flow.complete({ externalChangeConfirmed: true })).toBe(false)
    flow.execute('calendar.create_event', {
      calendar_id: 'primary',
      summary: 'ShotCount launch',
      description: '',
      start: '2026-07-30T14:00:00+01:00',
      end: '2026-07-30T14:30:00+01:00',
      attendee_emails: ['blessing@example.com'],
      add_google_meet: false,
      notify_attendees: true,
    })
    flow.approve()
    expect(flow.complete({ externalChangeConfirmed: true })).toBe(true)
    expect(flow.provider.count('gmail.send_message')).toBe(1)
    expect(flow.provider.count('calendar.create_event')).toBe(1)
  })

  it('prepares a public form, requires exact submit approval, and completes only after submit', () => {
    const flow = new AgentFlow(
      'run-browser-form',
      'Submit the public conference interest form for me',
    )
    flow.execute('browser.start_session', {
      objective: 'Complete the public conference interest form.',
      allowed_domains: ['conference.example.com'],
    })
    flow.execute('browser.navigate', {
      session_id: 'browser-session-1',
      url: 'https://conference.example.com/interest',
    })
    flow.execute('browser.act', {
      session_id: 'browser-session-1',
      action: 'type',
      target: 'label:Name',
      value: 'David Dosu',
    })
    expect(flow.complete({ externalChangeConfirmed: true })).toBe(false)
    expect(flow.execute('browser.submit', {
      session_id: 'browser-session-1',
      target: 'role:button:Submit interest',
      expected_effect: 'Submit the conference interest form once.',
    })).toEqual({ approvalRequired: true })
    expect(flow.provider.count('browser.submit')).toBe(0)
    flow.approve()
    expect(flow.provider.count('browser.submit')).toBe(1)
    expect(flow.complete({ externalChangeConfirmed: true })).toBe(true)
  })

  it('returns flight options, resumes selection, and remains waiting at payment', () => {
    const flow = new AgentFlow(
      'run-flight',
      'Book a return flight from Lagos to London next Thursday',
    )
    flow.execute('browser.start_session', {
      objective: 'Find the best matching return flight.',
      allowed_domains: ['www.google.com'],
    })
    flow.execute('browser.search_flights', {
      origin_code: 'LOS',
      destination_code: 'LON',
      departure_date: '2026-08-06',
      return_date: '2026-08-09',
      cabin: 'economy',
      max_stops: 1,
      budget_amount: null,
      currency: 'USD',
      preferred_airlines: [],
      excluded_airlines: [],
      adults: 1,
      children: 0,
      children_ages: [],
      infants: 0,
      infant_seats: 0,
      allow_nearby_airports: false,
    })
    flow.handoff('Choose a flight option to continue.')
    expect(flow.state.status).toBe('waiting_for_user')
    flow.continueFromUser()
    flow.execute('browser.select_flight', { option_id: 'option-1' })
    flow.handoff('Continue to payment.')
    expect(flow.complete({ paymentBoundaryReached: true })).toBe(false)
    expect(flow.state.status).toBe('waiting_for_user')
    expect(() => flow.execute('browser.purchase', { option_id: 'option-1' }))
      .toThrow('Financial purchases must remain under direct user control.')
    expect(flow.provider.count('browser.purchase')).toBe(0)
  })
})
