import { actionIsAffirmed, actionIsNegated, calendarWriteIsAffirmed } from './communication-safety.ts'
import { isApplicationIntent } from './application.ts'

/**
 * The durable task contract is the long-horizon source of truth. The model may
 * choose a bounded semantic action inside the active node, but it must not
 * invent the task's overall sequence one turn at a time.
 */
export const AGENT_EXECUTION_PLAN_VERSION = 1 as const
export const AGENT_EXECUTION_PLAN_WINDOW_SIZE = 5 as const

export type AgentTaskMode = 'research' | 'prepare' | 'execute' | 'monitor'
export type AgentTaskDomain = 'application' | 'communication' | 'browser' | 'documents' | 'general'
export type AgentTaskEffect =
  | 'gmail_send'
  | 'calendar_write'
  | 'browser_write'
  | 'application_plan'
  | 'application_submission'

export type AgentApprovalBoundary = 'none' | 'user_approval' | 'submission_approval' | 'payment_boundary'

export type AgentTaskSpec = {
  schemaVersion: typeof AGENT_EXECUTION_PLAN_VERSION
  objective: string
  description: string
  mode: AgentTaskMode
  domains: AgentTaskDomain[]
  requestedEffects: AgentTaskEffect[]
  forbiddenEffects: AgentTaskEffect[]
  approvalBoundaries: AgentApprovalBoundary[]
  completionEvidence: string[]
  constraints: string[]
  missingInputs: string[]
  createdAt: string
}

export type ExecutionPlanNodeKind = 'milestone' | 'action' | 'decision' | 'approval' | 'wait'
export type ExecutionPlanNodeStatus =
  | 'planned'
  | 'ready'
  | 'active'
  | 'waiting_user'
  | 'waiting_external'
  | 'completed'
  | 'blocked'
  | 'skipped'

export type ExecutionPlanNode = {
  id: string
  kind: ExecutionPlanNodeKind
  title: string
  owner: 'orchestrator' | 'roon' | 'david'
  dependsOn: string[]
  status: ExecutionPlanNodeStatus
  branch?: string
  /** Nodes in the same group are independently runnable once their own dependencies are met. */
  parallelGroup?: string
  toolNames: string[]
  completionToolNames: string[]
  requiredEvidence: string[]
  idempotencyKey: string
  attempts: number
  maximumAttempts: number
  waitingReason?: string
  completedAt?: string
}

export type AgentTaskPlanInput = {
  objective: string
  description?: string
  capability?: string | null
  taskContract?: string | null
  specialistId?: string | null
  stages?: Array<{ specialistId?: string | null; taskContract?: string | null }>
  missingInputs?: string[]
  now?: string
}

export type TaskOperation = {
  mode: AgentTaskMode
  requestedEffects: AgentTaskEffect[]
  forbiddenEffects: AgentTaskEffect[]
}

const unique = <T>(values: T[]) => [...new Set(values)]

function normalized(value: unknown) {
  return String(value ?? '')
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function negated(text: string, expression: RegExp) {
  const match = expression.exec(text)
  if (!match || match.index === undefined) return false
  const before = text.slice(Math.max(0, match.index - 100), match.index)
  return /\b(?:do not|don't|never|without|stop before|not|no|cannot|can't|won't|will not)\b[\s\S]{0,70}$/i.test(before)
}

function explicitApplicationSubmission(text: string) {
  const expression = /\b(?:submit|submitting|send in|send\s+the\s+application|final submission|finalize|finalise)\b/i
  return expression.test(text) && !negated(text, expression)
}

function explicitBrowserSubmission(text: string) {
  const expression = /\b(?:submit|register|sign[ -]?up|publish|upload)\b|\b(?:fill|complete)\b[\s\S]{0,40}\bform\b/i
  return expression.test(text) && !negated(text, expression)
}

/**
 * Extract the irreversible boundary before routing. This deliberately uses
 * affirmative and negative clauses together so a mentioned capability is not
 * mistaken for permission to perform it.
 */
export function classifyTaskOperation(value: string): TaskOperation {
  const text = normalized(value)
  const requestedEffects: AgentTaskEffect[] = []
  const forbiddenEffects: AgentTaskEffect[] = []
  const preparationVerb = /\b(?:prepare|draft|write|compose)\b/i.test(text)
  const explicitGmailSendDirective = /\b(?:send|reply|respond|notify|forward|tell|ask|inform|remind)\b/i.test(text) ||
    /\b(?:email|message)\s+(?:to\s+)?(?:the\s+)?(?:options|attendee|participant|[a-z][a-z'-]*)\b/i.test(text)

  if (actionIsAffirmed(text, 'gmail_send') && (!preparationVerb || explicitGmailSendDirective)) requestedEffects.push('gmail_send')
  else if (actionIsNegated(text, 'gmail_send')) forbiddenEffects.push('gmail_send')

  if (calendarWriteIsAffirmed(text)) requestedEffects.push('calendar_write')
  else if (actionIsNegated(text, 'calendar_write')) forbiddenEffects.push('calendar_write')

  if (explicitApplicationSubmission(text)) requestedEffects.push('application_submission')
  else if (/\b(?:submit|final submission|send in|finalize|finalise)\b/i.test(text)) forbiddenEffects.push('application_submission')

  if (explicitBrowserSubmission(text)) requestedEffects.push('browser_write')

  const monitor = /\b(?:monitor|watch|keep watch|poll|wait for|follow the status|track)\b/i.test(text)
  const research = /\b(?:research|find|search|look up|compare|identify|check|review|read|summari[sz]e|verify|validate)\b/i.test(text)
  const preparation = /\b(?:prepare|draft|write|compose|outline|plan|organize|organise|build|assemble|create a pack)\b/i.test(text)
  const external = requestedEffects.length > 0
  const mode: AgentTaskMode = monitor && !external
    ? 'monitor'
    : external
      ? 'execute'
      : research && !preparation
        ? 'research'
        : 'prepare'

  return {
    mode,
    requestedEffects: unique(requestedEffects),
    forbiddenEffects: unique(forbiddenEffects.filter(effect => !requestedEffects.includes(effect))),
  }
}

function domainsFor(input: AgentTaskPlanInput, operation: TaskOperation): AgentTaskDomain[] {
  const value = normalized(`${input.objective} ${input.description ?? ''}`)
  const domains: AgentTaskDomain[] = []
  if (isApplicationIntent(input.objective, input.description ?? '') || input.specialistId === 'david' || input.taskContract?.startsWith('applications.')) domains.push('application')
  if (input.taskContract?.startsWith('communication.') || /\b(?:email|gmail|message|calendar|meeting|schedule|invite|availability)\b/i.test(value)) domains.push('communication')
  if (input.capability === 'browser' || /\b(?:browser|portal|website|webpage|form|submit|upload)\b/i.test(value)) domains.push('browser')
  if (operation.mode === 'prepare' || /\b(?:document|cv|resume|statement|essay|proposal|pack|artifact)\b/i.test(value)) domains.push('documents')
  return unique(domains.length ? domains : ['general'])
}

function completionEvidenceFor(effects: AgentTaskEffect[], mode: AgentTaskMode) {
  const evidence: string[] = []
  if (effects.includes('gmail_send')) evidence.push('provider-confirmed Gmail message ID and thread ID')
  if (effects.includes('calendar_write')) evidence.push('provider-confirmed Calendar event ID and read-back state')
  if (effects.includes('browser_write')) evidence.push('provider-confirmed browser state or resumable upload result')
  if (effects.includes('application_plan')) evidence.push('official-source requirements, applicant evidence, and durable application state')
  if (effects.includes('application_submission')) evidence.push('canonical application submission confirmation and provider application ID')
  if (!evidence.length) evidence.push(mode === 'research' ? 'source-backed research result' : 'persisted prepared artifact and review evidence')
  return evidence
}

export function compileAgentTaskSpec(input: AgentTaskPlanInput): AgentTaskSpec {
  const objective = input.objective.trim().slice(0, 2_000)
  const description = (input.description ?? '').trim().slice(0, 8_000)
  const operation = classifyTaskOperation(`${objective} ${description}`)
  const application = domainsFor(input, operation).includes('application')
  const requestedEffects = [...operation.requestedEffects]
  if (application && !requestedEffects.includes('application_submission')) requestedEffects.push('application_plan')
  const approvalBoundaries: AgentApprovalBoundary[] = ['none']
  if (requestedEffects.includes('gmail_send') || requestedEffects.includes('calendar_write') || requestedEffects.includes('browser_write')) approvalBoundaries.push('user_approval')
  if (requestedEffects.includes('application_submission')) approvalBoundaries.push('submission_approval')
  return {
    schemaVersion: AGENT_EXECUTION_PLAN_VERSION,
    objective,
    description,
    mode: operation.mode,
    domains: domainsFor(input, operation),
    requestedEffects: unique(requestedEffects),
    forbiddenEffects: operation.forbiddenEffects,
    approvalBoundaries: unique(approvalBoundaries),
    completionEvidence: completionEvidenceFor(unique(requestedEffects), operation.mode),
    constraints: [
      'Do not perform an effect listed in forbiddenEffects.',
      'Do not report completion without the required provider or durable-state evidence.',
      ...(input.stages?.length ? ['Respect the typed specialist stage order.'] : []),
    ],
    missingInputs: unique((input.missingInputs ?? []).map(value => value.trim()).filter(Boolean).slice(0, 12)),
    createdAt: input.now ?? new Date().toISOString(),
  }
}

type NodeDraft = Omit<ExecutionPlanNode, 'status' | 'attempts' | 'idempotencyKey'> & { initialStatus?: ExecutionPlanNodeStatus }

function node(
  id: string,
  title: string,
  kind: ExecutionPlanNodeKind,
  owner: ExecutionPlanNode['owner'],
  dependsOn: string[],
  toolNames: string[],
  completionToolNames: string[],
  requiredEvidence: string[],
  extra: Partial<Pick<ExecutionPlanNode, 'branch' | 'parallelGroup' | 'maximumAttempts'>> & { initialStatus?: ExecutionPlanNodeStatus } = {},
): NodeDraft {
  return {
    id,
    title,
    kind,
    owner,
    dependsOn,
    toolNames: unique(toolNames),
    completionToolNames: unique(completionToolNames),
    requiredEvidence,
    maximumAttempts: extra.maximumAttempts ?? 3,
    ...(extra.branch ? { branch: extra.branch } : {}),
    ...(extra.parallelGroup ? { parallelGroup: extra.parallelGroup } : {}),
    ...(extra.initialStatus ? { initialStatus: extra.initialStatus } : {}),
  }
}

function materializeNodes(drafts: NodeDraft[], spec: AgentTaskSpec): ExecutionPlanNode[] {
  return drafts.map((draft, index) => {
    const initialStatus = draft.initialStatus ?? (index === 0 ? (spec.missingInputs.length ? 'waiting_user' : 'ready') : 'planned')
    return {
      ...draft,
      status: initialStatus,
      attempts: 0,
      idempotencyKey: `agent-plan:${spec.schemaVersion}:${draft.id}`,
    }
  })
}

function applicationNodes(spec: AgentTaskSpec) {
  const owner = 'david' as const
  const evidence = spec.completionEvidence
  return materializeNodes([
    node('application/research', 'Research official programmes and requirements', 'milestone', owner, [], ['web_search', 'browser.start_session', 'browser.navigate', 'browser.observe', 'application.record_opportunity', 'application.record_evidence', 'agent.request_context'], ['application.record_opportunity'], ['official programme pages and requirements']),
    node('application/verify-shortlist', 'Verify fit, eligibility, funding, and deadlines', 'decision', owner, ['application/research'], ['web_search', 'browser.start_session', 'browser.navigate', 'browser.observe', 'application.evaluate_programme_eligibility', 'application.resolve_requirement_conflict', 'application.record_opportunity', 'application.record_evidence', 'agent.request_context'], ['application.evaluate_programme_eligibility', 'application.record_opportunity'], ['verified official-source evidence and bounded fit decision']),
    node('application/create-cases', 'Create the approved application workspaces', 'milestone', owner, ['application/verify-shortlist'], ['application.create_case', 'agent.request_context'], ['application.create_case'], ['durable ApplicationCase for each selected programme']),
    node('application/resolve-profile', 'Resolve applicant facts and requirement dependencies', 'action', owner, ['application/create-cases'], ['application.map_portal_field', 'application.resolve_supplemental_questions', 'application.record_evidence', 'application.update_requirement', 'agent.request_context'], ['application.map_portal_field', 'application.resolve_supplemental_questions', 'application.update_requirement'], ['verified applicant facts and linked evidence'], { parallelGroup: 'application-preparation' }),
    node('application/prepare-documents', 'Prepare and review the application documents', 'milestone', owner, ['application/create-cases'], ['application.coordinate_academic_evidence', 'application.coordinate_work_samples', 'application.coordinate_fee', 'application.generate_document', 'application.generate_cv', 'application.prepare_research_proposal', 'application.review_research_proposal', 'application.finalize_research_proposal', 'application.update_requirement', 'agent.request_context'], ['application.generate_document', 'application.generate_cv', 'application.finalize_research_proposal', 'application.update_requirement'], ['approved artifacts with provenance'], { branch: 'when the programme requires documents', parallelGroup: 'application-preparation' }),
    node('application/coordinate-people', 'Coordinate referees, supervisors, and writers', 'milestone', owner, ['application/create-cases'], ['application.record_contact', 'application.evaluate_professor_fit', 'application.coordinate_recommendations', 'application.build_referee_support_pack', 'application.create_human_assignment', 'application.generate_supervisor_outreach', 'application.request_roon', 'agent.request_context'], ['application.record_contact', 'application.coordinate_recommendations', 'application.build_referee_support_pack', 'application.create_human_assignment', 'application.request_roon'], ['provider-confirmed communication or durable human assignment'], { branch: 'when people or communication support is required', parallelGroup: 'application-preparation' }),
    node('application/portal-readiness', 'Fill the portal and verify every saved section', 'action', owner, ['application/create-cases'], ['browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'application.resolve_portal_fields', 'application.record_portal_checkpoint', 'application.resolve_supplemental_questions', 'application.record_evidence', 'agent.request_context'], ['application.record_portal_checkpoint', 'application.record_evidence'], ['verified portal save/read-back checkpoints'], { branch: 'when a portal is available', parallelGroup: 'application-preparation' }),
    node('application/submission-approval', 'Run the final readiness review and request approval', 'approval', owner, ['application/resolve-profile', 'application/prepare-documents', 'application/coordinate-people', 'application/portal-readiness'], ['application.build_readiness_report', 'agent.request_context', 'application.submit', 'browser.submit'], ['application.build_readiness_report'], ['readiness report and explicit user approval'], { branch: 'only when final submission is requested' }),
    node('application/submit-verify', 'Submit only the approved package and verify the result', 'action', owner, ['application/submission-approval'], ['application.submit', 'browser.observe', 'application.record_portal_checkpoint', 'application.record_evidence', 'agent.complete'], ['application.submit', 'agent.complete'], evidence, { branch: 'only after exact submission approval' }),
  ], spec)
}

function communicationNodes(spec: AgentTaskSpec) {
  const email = spec.domains.includes('communication') && spec.requestedEffects.includes('gmail_send')
  const calendar = spec.requestedEffects.includes('calendar_write')
  const needsPreparation = spec.mode === 'prepare' || email || calendar
  const owner = 'roon' as const
  const understandingCompletionTools = needsPreparation
    ? ['gmail.read_message', 'gmail.read_thread', 'contacts.resolve_recipient', 'calendar.get_availability']
    : ['gmail.search_messages', 'gmail.read_message', 'gmail.read_thread', 'calendar.list_events', 'calendar.get_availability', 'contacts.resolve_recipient']
  const nodes: NodeDraft[] = [
    node('communication/understand', 'Read the relevant context and resolve recipients', 'action', owner, [], ['gmail.search_messages', 'gmail.read_message', 'gmail.read_thread', 'contacts.find_contact', 'contacts.resolve_recipient', 'calendar.list_events', 'calendar.get_availability', 'agent.request_context'], understandingCompletionTools, ['authoritative recipient and source context']),
  ]
  const preparationId = 'communication/prepare'
  if (needsPreparation) {
    nodes.push(node(preparationId, calendar ? 'Prepare the verified calendar change' : email ? 'Prepare the exact email draft' : 'Prepare the requested result', 'action', owner, ['communication/understand'], calendar ? ['gmail.create_draft', 'calendar.create_event', 'calendar.update_event', 'calendar.delete_event', 'agent.request_context'] : email ? ['gmail.create_draft', 'agent.request_context'] : ['gmail.create_draft', 'agent.request_context'], calendar ? ['calendar.create_event', 'calendar.update_event', 'calendar.delete_event'] : email ? ['gmail.create_draft'] : ['gmail.create_draft'], ['provider-ready prepared result']))
  }
  if (email || calendar) {
    nodes.push(node('communication/approval', 'Pause for the exact external-action approval', 'approval', owner, [preparationId], email ? ['gmail.send_message', 'calendar.create_event', 'calendar.update_event', 'calendar.delete_event', 'agent.request_context'] : ['calendar.create_event', 'calendar.update_event', 'calendar.delete_event', 'agent.request_context'], [], ['pending approval for the exact payload']))
    nodes.push(node('communication/execute', calendar && email ? 'Apply the approved Calendar change and notification in order' : email ? 'Send the approved email' : 'Apply the approved Calendar change', 'action', owner, ['communication/approval'], calendar && email ? ['calendar.create_event', 'calendar.update_event', 'calendar.delete_event', 'gmail.send_message'] : email ? ['gmail.send_message'] : ['calendar.create_event', 'calendar.update_event', 'calendar.delete_event'], calendar && email ? ['gmail.send_message'] : email ? ['gmail.send_message'] : ['calendar.create_event', 'calendar.update_event', 'calendar.delete_event'], ['provider-confirmed external effect']))
  }
  const last = nodes.at(-1)?.id ?? 'communication/understand'
  nodes.push(node('communication/verify', 'Verify the provider result and close the task', 'action', owner, [last], ['gmail.read_message', 'gmail.read_thread', 'calendar.list_events', 'agent.complete'], ['agent.complete'], ['provider read-back and completion evidence']))
  return materializeNodes(nodes, spec)
}

function generalNodes(spec: AgentTaskSpec) {
  if (spec.domains.includes('browser') && spec.requestedEffects.includes('browser_write')) {
    const owner = 'orchestrator' as const
    return materializeNodes([
      node('browser/prepare', 'Open the approved site and prepare the exact browser change', 'action', owner, [], ['browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'agent.request_context'], ['browser.act'], ['observed target and provider-ready browser state']),
      node('browser/approval', 'Pause for approval before the browser write', 'approval', owner, ['browser/prepare'], ['browser.observe', 'browser.submit', 'agent.request_context'], [], ['explicit approval for the exact observed target and payload']),
      node('browser/verify', 'Verify the browser result and close the task', 'action', owner, ['browser/approval'], ['browser.observe', 'agent.complete'], ['agent.complete'], spec.completionEvidence),
    ], spec)
  }
  const owner = spec.domains.includes('documents') ? 'david' : 'orchestrator'
  const research = spec.mode === 'research'
  const nodes: NodeDraft[] = [
    node('general/understand', research ? 'Gather reliable source context' : 'Resolve the task inputs and constraints', 'action', owner, [], research ? ['web_search', 'agent.request_context'] : ['web_search', 'agent.request_context'], research ? ['web_search'] : [], ['bounded task context']),
    node('general/execute', research ? 'Synthesize the source-backed result' : 'Prepare the requested result', 'action', owner, ['general/understand'], ['web_search', 'application.generate_document', 'agent.request_context'], ['application.generate_document'], ['persisted prepared result']),
    node('general/verify', 'Verify the result against the original request', 'action', owner, ['general/execute'], ['agent.complete', 'agent.request_context'], ['agent.complete'], spec.completionEvidence),
  ]
  return materializeNodes(nodes, spec)
}

export function compileExecutionPlan(spec: AgentTaskSpec): ExecutionPlanNode[] {
  if (spec.domains.includes('application')) return applicationNodes(spec)
  if (spec.domains.includes('communication')) return communicationNodes(spec)
  return generalNodes(spec)
}

export function isAgentTaskSpec(value: unknown): value is AgentTaskSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return candidate.schemaVersion === AGENT_EXECUTION_PLAN_VERSION &&
    typeof candidate.objective === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.mode === 'string' &&
    Array.isArray(candidate.domains) &&
    Array.isArray(candidate.requestedEffects) &&
    Array.isArray(candidate.forbiddenEffects)
}

export function normalizeExecutionPlan(value: unknown): ExecutionPlanNode[] {
  if (!Array.isArray(value)) return []
  return value.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => {
    const candidate = item as Record<string, unknown>
    return {
      id: String(candidate.id ?? ''),
      kind: (candidate.kind ?? 'action') as ExecutionPlanNodeKind,
      title: String(candidate.title ?? ''),
      owner: (candidate.owner ?? 'orchestrator') as ExecutionPlanNode['owner'],
      dependsOn: Array.isArray(candidate.dependsOn) ? candidate.dependsOn.map(String) : [],
      status: (candidate.status ?? 'planned') as ExecutionPlanNodeStatus,
      ...(typeof candidate.branch === 'string' ? { branch: candidate.branch } : {}),
      ...(typeof candidate.parallelGroup === 'string' ? { parallelGroup: candidate.parallelGroup } : {}),
      toolNames: Array.isArray(candidate.toolNames) ? candidate.toolNames.map(String) : [],
      completionToolNames: Array.isArray(candidate.completionToolNames) ? candidate.completionToolNames.map(String) : [],
      requiredEvidence: Array.isArray(candidate.requiredEvidence) ? candidate.requiredEvidence.map(String) : [],
      idempotencyKey: String(candidate.idempotencyKey ?? `agent-plan:${String(candidate.id ?? '')}`),
      attempts: Number.isFinite(Number(candidate.attempts)) ? Number(candidate.attempts) : 0,
      maximumAttempts: Number.isFinite(Number(candidate.maximumAttempts)) ? Number(candidate.maximumAttempts) : 3,
      ...(typeof candidate.waitingReason === 'string' ? { waitingReason: candidate.waitingReason } : {}),
      ...(typeof candidate.completedAt === 'string' ? { completedAt: candidate.completedAt } : {}),
    }
  }).filter(node => node.id && node.title)
}

export function validateExecutionPlan(plan: ExecutionPlanNode[]) {
  const defects: string[] = []
  const ids = new Set<string>()
  const validStatuses = new Set<ExecutionPlanNodeStatus>(['planned', 'ready', 'active', 'waiting_user', 'waiting_external', 'completed', 'blocked', 'skipped'])
  for (const node of plan) {
    if (ids.has(node.id)) defects.push(`duplicate node ${node.id}`)
    ids.add(node.id)
    if (!validStatuses.has(node.status)) defects.push(`invalid status for ${node.id}`)
    if (node.dependsOn.some(dependency => !plan.some(candidate => candidate.id === dependency))) defects.push(`missing dependency for ${node.id}`)
    if (node.dependsOn.some(dependency => plan.findIndex(candidate => candidate.id === dependency) >= plan.findIndex(candidate => candidate.id === node.id))) defects.push(`dependency order violation for ${node.id}`)
    if (node.completionToolNames.some(tool => !node.toolNames.includes(tool) && tool !== 'agent.complete')) defects.push(`completion tool is not allowed for ${node.id}`)
  }
  if (plan.filter(node => node.status === 'active').length > 1) defects.push('more than one active node')
  return { valid: defects.length === 0, defects }
}

export function planWindow(plan: ExecutionPlanNode[], maximum = AGENT_EXECUTION_PLAN_WINDOW_SIZE) {
  const limit = Math.max(1, Math.min(AGENT_EXECUTION_PLAN_WINDOW_SIZE, Math.floor(maximum)))
  const currentIndex = plan.findIndex(node => ['active', 'ready', 'waiting_user', 'waiting_external', 'blocked'].includes(node.status))
  const start = currentIndex < 0 ? Math.max(0, plan.length - limit) : Math.max(0, Math.min(currentIndex - 1, plan.length - limit))
  return plan.slice(start, start + limit)
}

export function activePlanNode(plan: ExecutionPlanNode[]) {
  return plan.find(node => ['active', 'ready', 'waiting_user', 'waiting_external', 'blocked'].includes(node.status)) ?? null
}

export function alignExecutionPlan(
  plan: ExecutionPlanNode[],
  observation: {
    activeNodeId?: string | null
    completedNodeIds?: string[]
    status?: 'running' | 'waiting_user' | 'waiting_external' | 'blocked' | 'completed'
    waitingReason?: string
    now?: string
  },
) {
  const completed = new Set(observation.completedNodeIds ?? [])
  const now = observation.now ?? new Date().toISOString()
  return plan.map(node => {
    if (completed.has(node.id)) return { ...node, status: 'completed' as const, completedAt: node.completedAt ?? now, waitingReason: undefined }
    if (node.id === observation.activeNodeId) {
      const status: ExecutionPlanNodeStatus = observation.status === 'waiting_user'
        ? 'waiting_user'
        : observation.status === 'waiting_external'
          ? 'waiting_external'
          : observation.status === 'blocked'
            ? 'blocked'
            : observation.status === 'completed'
              ? 'completed'
              : 'active'
      return { ...node, status, ...(observation.waitingReason ? { waitingReason: observation.waitingReason } : {}), ...(status === 'completed' ? { completedAt: now } : {}) }
    }
    if (node.status === 'completed' || node.status === 'skipped') return node
    const dependenciesComplete = node.dependsOn.every(dependency => completed.has(dependency) || plan.find(candidate => candidate.id === dependency)?.status === 'completed')
    return { ...node, status: dependenciesComplete ? 'ready' as const : 'planned' as const, waitingReason: undefined }
  })
}

export function advancePlanAfterTool(
  plan: ExecutionPlanNode[],
  toolName: string,
  outcome: { status?: 'running' | 'waiting_user' | 'waiting_external' | 'completed' | 'blocked'; succeeded?: boolean; waitingReason?: string; now?: string } = {},
) {
  const active = activePlanNode(plan)
  if (!active) return plan
  const now = outcome.now ?? new Date().toISOString()
  const waiting = outcome.status === 'waiting_user' || outcome.status === 'waiting_external'
  const completed = outcome.succeeded !== false && (active.completionToolNames.includes(toolName) || (toolName === 'agent.complete' && outcome.status === 'completed'))
  if (waiting) return plan.map(node => node.id === active.id ? { ...node, status: outcome.status === 'waiting_external' ? 'waiting_external' as const : 'waiting_user' as const, waitingReason: outcome.waitingReason ?? '' } : node)
  if (!completed) return plan.map(node => node.id === active.id && node.status === 'ready' ? { ...node, status: 'active' as const } : node)
  const next = plan.find(node => node.id !== active.id && node.status !== 'completed' && node.status !== 'skipped' && node.dependsOn.every(dependency => dependency === active.id || plan.find(candidate => candidate.id === dependency)?.status === 'completed'))
  return plan.map(node => {
    if (node.id === active.id) return { ...node, status: 'completed' as const, completedAt: now, waitingReason: undefined }
    if (next && node.id === next.id) return { ...node, status: 'ready' as const }
    return node
  })
}

const applicationPhaseOrder = [
  'application/research',
  'application/verify-shortlist',
  'application/create-cases',
  'application/resolve-profile',
  'application/prepare-documents',
  'application/coordinate-people',
  'application/portal-readiness',
  'application/submission-approval',
  'application/submit-verify',
] as const

export function applicationPlanNodeForControllerState(state: string) {
  const value = normalized(state)
  if (value === 'complete') return null
  if (value === 'blocked') return 'application/portal-readiness'
  if (/intake|opportunity_research/.test(value)) return 'application/research'
  if (/opportunity_verification/.test(value)) return 'application/verify-shortlist'
  if (/shortlist_approval|case_creation/.test(value)) return 'application/create-cases'
  if (/profile_resolution/.test(value)) return 'application/resolve-profile'
  if (/document_preparation|writer_execution/.test(value)) return 'application/prepare-documents'
  if (/referee_execution|professor_outreach/.test(value)) return 'application/coordinate-people'
  if (/portal_account|portal_execution/.test(value)) return 'application/portal-readiness'
  if (/readiness_review|submission_approval/.test(value)) return 'application/submission-approval'
  if (/submission|post_submission/.test(value)) return 'application/submit-verify'
  return 'application/research'
}

export function alignApplicationPlan(plan: ExecutionPlanNode[], controllerState: string, runStatus: 'running' | 'waiting_user' | 'waiting_external' | 'blocked' | 'completed', waitingReason = '') {
  const activeId = applicationPlanNodeForControllerState(controllerState)
  if (!activeId) return plan.map(node => ({ ...node, status: node.status === 'skipped' ? node.status : 'completed' as const, completedAt: node.completedAt ?? new Date().toISOString(), waitingReason: undefined }))
  const activeIndex = applicationPhaseOrder.indexOf(activeId as typeof applicationPhaseOrder[number])
  const completedNodeIds = applicationPhaseOrder.slice(0, Math.max(0, activeIndex)).filter(id => plan.some(node => node.id === id))
  return alignExecutionPlan(plan, {
    activeNodeId: activeId,
    completedNodeIds,
    status: controllerState === 'BLOCKED' ? 'blocked' : runStatus,
    waitingReason,
  })
}

export function executionPlanInstruction(spec: AgentTaskSpec | null, plan: ExecutionPlanNode[]) {
  if (!spec || !plan.length) return ''
  const active = activePlanNode(plan)
  return [
    'DURABLE_EXECUTION_PLAN_V1',
    'The orchestrator compiled this plan before execution. Follow it in order; do not invent a replacement plan or skip dependencies.',
    `TASK_SPEC=${JSON.stringify({ mode: spec.mode, domains: spec.domains, requestedEffects: spec.requestedEffects, forbiddenEffects: spec.forbiddenEffects, approvalBoundaries: spec.approvalBoundaries, completionEvidence: spec.completionEvidence })}`,
    `PLAN=${JSON.stringify(plan.map(node => ({ id: node.id, status: node.status, title: node.title, dependsOn: node.dependsOn, branch: node.branch ?? null, parallelGroup: node.parallelGroup ?? null, toolNames: node.toolNames, requiredEvidence: node.requiredEvidence })))}`,
    active ? `ACTIVE_NODE=${JSON.stringify({ id: active.id, title: active.title, status: active.status, allowedTools: active.toolNames, requiredEvidence: active.requiredEvidence, waitingReason: active.waitingReason ?? null })}` : 'ACTIVE_NODE=none; use agent.complete only if all durable evidence is present.',
    'A planned node is not completed evidence. Never mark a waiting or in-progress node complete.',
  ].join('\n')
}
