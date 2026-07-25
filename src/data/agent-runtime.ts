import { classifySharedAgentIntent } from '../../supabase/functions/_shared/agent-intent'

export const agentRunStatuses = [
  'planning',
  'needs_context',
  'running',
  'needs_approval',
  'waiting_external',
  'waiting_for_user',
  'completed',
  'failed',
  'cancelled',
] as const

export type DurableAgentRunStatus = typeof agentRunStatuses[number]

export const agentCapabilities = [
  'research',
  'draft',
  'research_draft',
  'gmail',
  'calendar',
  'scheduling',
  'browser',
  'flight_search',
] as const

export type AgentCapability = typeof agentCapabilities[number]
export type AgentStrategy = 'structured' | 'browser' | 'hybrid'
export type AgentRisk = 'read' | 'prepare' | 'external_write' | 'financial'
export type PolicyDecision = 'allow' | 'require_approval' | 'deny'

export type AgentIntent = {
  capability: AgentCapability
  strategy: AgentStrategy
  outcomeType: 'prepared_result' | 'external_change' | 'payment_handoff'
}

export type AgentRunState = {
  status: DurableAgentRunStatus
  currentStep: number
  waitingReason: string
  completedAt: string | null
  updatedAt: string
}

export type ToolPolicy = {
  risk: AgentRisk
  decision: PolicyDecision
  reason: string
}

const terminalStatuses = new Set<DurableAgentRunStatus>(['completed', 'cancelled'])

const transitions: Record<DurableAgentRunStatus, ReadonlySet<DurableAgentRunStatus>> = {
  planning: new Set(['needs_context', 'running', 'failed', 'cancelled']),
  needs_context: new Set(['planning', 'running', 'cancelled']),
  running: new Set([
    'needs_context',
    'needs_approval',
    'waiting_external',
    'waiting_for_user',
    'completed',
    'failed',
    'cancelled',
  ]),
  needs_approval: new Set(['running', 'waiting_external', 'waiting_for_user', 'failed', 'cancelled']),
  waiting_external: new Set(['running', 'needs_approval', 'waiting_for_user', 'completed', 'failed', 'cancelled']),
  waiting_for_user: new Set(['running', 'needs_approval', 'completed', 'failed', 'cancelled']),
  failed: new Set(['planning', 'running', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
}

const toolPolicies: Record<string, ToolPolicy> = {
  'gmail.search_messages': {
    risk: 'read',
    decision: 'allow',
    reason: 'Searching connected Gmail is a read-only action.',
  },
  'gmail.read_message': {
    risk: 'read',
    decision: 'allow',
    reason: 'Reading a relevant message is a read-only action.',
  },
  'gmail.read_thread': {
    risk: 'read',
    decision: 'allow',
    reason: 'Reading a relevant thread is a read-only action.',
  },
  'gmail.create_draft': {
    risk: 'prepare',
    decision: 'allow',
    reason: 'Preparing a private draft does not send it.',
  },
  'gmail.send_message': {
    risk: 'external_write',
    decision: 'require_approval',
    reason: 'Sending email represents the user to another person.',
  },
  'gmail.wait_for_reply': {
    risk: 'read',
    decision: 'allow',
    reason: 'Watching an already-authorized Gmail thread is read-only.',
  },
  'calendar.list_events': {
    risk: 'read',
    decision: 'allow',
    reason: 'Listing connected calendar events is read-only.',
  },
  'calendar.get_availability': {
    risk: 'read',
    decision: 'allow',
    reason: 'Checking availability is read-only.',
  },
  'calendar.create_event': {
    risk: 'external_write',
    decision: 'require_approval',
    reason: 'Creating an event changes the user’s calendar and may invite other people.',
  },
  'calendar.update_event': {
    risk: 'external_write',
    decision: 'require_approval',
    reason: 'Changing an event can affect the user and attendees.',
  },
  'calendar.delete_event': {
    risk: 'external_write',
    decision: 'require_approval',
    reason: 'Cancelling an event is an externally visible destructive action.',
  },
  'contacts.find_contact': {
    risk: 'read',
    decision: 'allow',
    reason: 'Resolving a contact is read-only.',
  },
  'browser.start_session': {
    risk: 'read',
    decision: 'allow',
    reason: 'Starting an isolated browser session does not create an external change.',
  },
  'browser.navigate': {
    risk: 'read',
    decision: 'allow',
    reason: 'Navigation to an allowed public domain is read-only.',
  },
  'browser.search_flights': {
    risk: 'read',
    decision: 'allow',
    reason: 'Searching live public flight results is read-only.',
  },
  'browser.select_flight': {
    risk: 'prepare',
    decision: 'allow',
    reason: 'Selecting a returned itinerary may prepare checkout but cannot cross the payment boundary.',
  },
  'browser.observe': {
    risk: 'read',
    decision: 'allow',
    reason: 'Observing the active page is read-only.',
  },
  'browser.act': {
    risk: 'prepare',
    decision: 'allow',
    reason: 'Safe browser preparation is allowed until a consequential boundary is reached.',
  },
  'browser.submit': {
    risk: 'external_write',
    decision: 'require_approval',
    reason: 'Submitting a form may represent the user or create an external change.',
  },
  'browser.purchase': {
    risk: 'financial',
    decision: 'deny',
    reason: 'Financial purchases must remain under direct user control.',
  },
}

export function canTransitionAgentRun(from: DurableAgentRunStatus, to: DurableAgentRunStatus) {
  return transitions[from].has(to)
}

export function transitionAgentRun(
  run: AgentRunState,
  status: DurableAgentRunStatus,
  patch: Partial<Omit<AgentRunState, 'status'>> = {},
  now = new Date().toISOString(),
): AgentRunState {
  if (run.status !== status && !canTransitionAgentRun(run.status, status)) {
    throw new Error(`Invalid agent run transition: ${run.status} -> ${status}`)
  }
  if (terminalStatuses.has(run.status) && run.status !== status) {
    throw new Error(`Agent run is already ${run.status}.`)
  }
  return {
    ...run,
    ...patch,
    status,
    waitingReason: patch.waitingReason ?? (status.startsWith('waiting_') || status === 'needs_approval' || status === 'needs_context'
      ? run.waitingReason
      : ''),
    completedAt: status === 'completed' ? patch.completedAt ?? now : patch.completedAt ?? run.completedAt,
    updatedAt: now,
  }
}

export function policyForTool(toolName: string): ToolPolicy {
  return toolPolicies[toolName] ?? {
    risk: 'external_write',
    decision: 'deny',
    reason: 'Unknown tools are denied by default.',
  }
}

export function mayExecuteTool(toolName: string, approved = false): ToolPolicy {
  const policy = policyForTool(toolName)
  if (policy.decision !== 'require_approval' || !approved) return policy
  return {
    ...policy,
    decision: 'allow',
    reason: 'The user approved this exact action.',
  }
}

function normalizeForKey(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForKey)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForKey(item)]),
    )
  }
  return value
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function agentActionIdempotencyKey(
  runId: string,
  toolName: string,
  argumentsValue: unknown,
  ordinal: number,
) {
  const canonical = JSON.stringify(normalizeForKey(argumentsValue))
  return `agent:${runId}:${ordinal}:${toolName}:${fnv1a(canonical)}`
}

export function classifyAgentIntent(title: string, description = ''): AgentIntent {
  return classifySharedAgentIntent(title, description)
}

export function outcomeCompletesTask(intent: AgentIntent, result: {
  preparedResult?: boolean
  externalChangeConfirmed?: boolean
  paymentBoundaryReached?: boolean
  purchaseConfirmed?: boolean
}) {
  if (intent.outcomeType === 'prepared_result') return result.preparedResult === true
  if (intent.outcomeType === 'external_change') return result.externalChangeConfirmed === true
  return result.purchaseConfirmed === true
}
