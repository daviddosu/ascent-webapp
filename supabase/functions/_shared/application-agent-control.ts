import { isGraduateApplicationTask } from './application.ts'

/**
 * The application controller owns workflow truth. This module owns the small
 * agent-facing contract that makes one turn legible, bounded, and replayable.
 * It intentionally contains no provider calls or database code.
 */
export const APPLICATION_AGENT_CONTROL_VERSION = 'application-agent-control@1' as const
export const APPLICATION_WORKING_SET_VERSION = 'application-working-set@1' as const
export const APPLICATION_TURN_ADMISSION_VERSION = 'application-turn-admission@1' as const
export const APPLICATION_RECOVERY_VALIDATION_VERSION = 'application-recovery-validation@1' as const

export type ApplicationResourceBudget = {
  schemaVersion: 1
  maxModelCalls: number
  maxInputTokens: number
  maxOutputTokens: number
  maxProviderCalls: number
  maxBrowserOperations: number
  maxRetries: number
}

export type ApplicationResourceUsage = {
  schemaVersion: 1
  modelCalls: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  providerCalls: number
  browserOperations: number
  retries: number
  webSearchCalls: number
  modelLatencyMs: number
  lastModelCallAt: string | null
}

export const DEFAULT_APPLICATION_RESOURCE_BUDGET: ApplicationResourceBudget = {
  schemaVersion: 1,
  maxModelCalls: 8,
  maxInputTokens: 240_000,
  maxOutputTokens: 32_000,
  maxProviderCalls: 24,
  maxBrowserOperations: 32,
  maxRetries: 2,
}

const terminalActionStatuses = new Set(['succeeded', 'failed', 'cancelled'])
const consequentialProviderTools = new Set([
  'browser.submit',
  'gmail.send_message',
  'calendar.create_event',
  'calendar.update_event',
  'calendar.delete_event',
  'application.execute_fee_payment',
  'application.submit',
])

function finiteNonNegative(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback
}

function bounded(value: unknown, fallback: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, finiteNonNegative(value, fallback)))
}

function text(value: unknown, maximum = 500) {
  return typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim().slice(0, maximum) : ''
}

function stringList(value: unknown, maximumItems = 40, maximumLength = 240) {
  const values = Array.isArray(value) ? value : []
  return [...new Set(values.map(item => text(item, maximumLength)).filter(Boolean))].slice(0, maximumItems)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

export function stableApplicationControlJson(value: unknown) {
  return JSON.stringify(stableValue(value))
}

export function estimateApplicationTokens(value: unknown) {
  const characters = typeof value === 'string' ? value.length : stableApplicationControlJson(value).length
  return Math.max(0, Math.ceil(characters / 4))
}

export function normalizeApplicationResourceBudget(value: unknown, overrides: Partial<ApplicationResourceBudget> = {}): ApplicationResourceBudget {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return {
    schemaVersion: 1,
    maxModelCalls: bounded(overrides.maxModelCalls ?? source.maxModelCalls, DEFAULT_APPLICATION_RESOURCE_BUDGET.maxModelCalls, 1, 64),
    maxInputTokens: bounded(overrides.maxInputTokens ?? source.maxInputTokens, DEFAULT_APPLICATION_RESOURCE_BUDGET.maxInputTokens, 16_000, 1_000_000),
    maxOutputTokens: bounded(overrides.maxOutputTokens ?? source.maxOutputTokens, DEFAULT_APPLICATION_RESOURCE_BUDGET.maxOutputTokens, 2_000, 200_000),
    maxProviderCalls: bounded(overrides.maxProviderCalls ?? source.maxProviderCalls, DEFAULT_APPLICATION_RESOURCE_BUDGET.maxProviderCalls, 1, 200),
    maxBrowserOperations: bounded(overrides.maxBrowserOperations ?? source.maxBrowserOperations, DEFAULT_APPLICATION_RESOURCE_BUDGET.maxBrowserOperations, 1, 200),
    maxRetries: bounded(overrides.maxRetries ?? source.maxRetries, DEFAULT_APPLICATION_RESOURCE_BUDGET.maxRetries, 0, 8),
  }
}

export function normalizeApplicationResourceUsage(value: unknown): ApplicationResourceUsage {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const lastModelCallAt = text(source.lastModelCallAt ?? source.last_model_call_at, 80)
  return {
    schemaVersion: 1,
    modelCalls: finiteNonNegative(source.modelCalls ?? source.model_calls),
    inputTokens: finiteNonNegative(source.inputTokens ?? source.input_tokens),
    cachedInputTokens: finiteNonNegative(source.cachedInputTokens ?? source.cached_input_tokens),
    outputTokens: finiteNonNegative(source.outputTokens ?? source.output_tokens),
    providerCalls: finiteNonNegative(source.providerCalls ?? source.provider_calls),
    browserOperations: finiteNonNegative(source.browserOperations ?? source.browser_operations),
    retries: finiteNonNegative(source.retries),
    webSearchCalls: finiteNonNegative(source.webSearchCalls ?? source.web_search_calls),
    modelLatencyMs: finiteNonNegative(source.modelLatencyMs ?? source.model_latency_ms),
    lastModelCallAt: lastModelCallAt || null,
  }
}

export function addApplicationResourceUsage(
  left: unknown,
  right: Partial<ApplicationResourceUsage>,
): ApplicationResourceUsage {
  const current = normalizeApplicationResourceUsage(left)
  return {
    schemaVersion: 1,
    modelCalls: current.modelCalls + finiteNonNegative(right.modelCalls),
    inputTokens: current.inputTokens + finiteNonNegative(right.inputTokens),
    cachedInputTokens: current.cachedInputTokens + finiteNonNegative(right.cachedInputTokens),
    outputTokens: current.outputTokens + finiteNonNegative(right.outputTokens),
    providerCalls: current.providerCalls + finiteNonNegative(right.providerCalls),
    browserOperations: current.browserOperations + finiteNonNegative(right.browserOperations),
    retries: current.retries + finiteNonNegative(right.retries),
    webSearchCalls: current.webSearchCalls + finiteNonNegative(right.webSearchCalls),
    modelLatencyMs: current.modelLatencyMs + finiteNonNegative(right.modelLatencyMs),
    lastModelCallAt: text(right.lastModelCallAt, 80) || current.lastModelCallAt,
  }
}

export function modelUsageFromResponse(input: {
  usage?: unknown
  retryCount?: unknown
  latencyMs?: unknown
  estimatedInputTokens?: unknown
  estimatedOutputTokens?: unknown
  webSearchCalls?: unknown
  now?: string
}): Partial<ApplicationResourceUsage> {
  const usage = input.usage && typeof input.usage === 'object' && !Array.isArray(input.usage)
    ? input.usage as Record<string, unknown>
    : {}
  const inputTokens = finiteNonNegative(usage.input_tokens, finiteNonNegative(input.estimatedInputTokens))
  const outputTokens = finiteNonNegative(usage.output_tokens, finiteNonNegative(input.estimatedOutputTokens))
  const cachedDetails = usage.input_tokens_details && typeof usage.input_tokens_details === 'object'
    ? usage.input_tokens_details as Record<string, unknown>
    : {}
  return {
    modelCalls: 1,
    inputTokens,
    cachedInputTokens: finiteNonNegative(cachedDetails.cached_tokens),
    outputTokens,
    retries: finiteNonNegative(input.retryCount),
    webSearchCalls: finiteNonNegative(input.webSearchCalls),
    modelLatencyMs: finiteNonNegative(input.latencyMs),
    lastModelCallAt: text(input.now, 80) || new Date().toISOString(),
  }
}

export type ApplicationProjectionRefreshInput = {
  objective?: unknown
  description?: unknown
  status?: unknown
  errorCode?: unknown
  interaction?: unknown
  pendingInputs?: unknown
  lastRefreshedInteractionId?: unknown
}

export type ApplicationFailureCategory =
  | 'applicant_gate'
  | 'approval_gate'
  | 'browser_execution'
  | 'document_processing'
  | 'model_execution'
  | 'programme_research'
  | 'provider_integration'
  | 'workflow_state'

/**
 * Keep production failure reporting stable and low-cardinality. Error codes
 * and tool names remain available for diagnosis; this category is for trends.
 */
export function applicationFailureCategory(errorCode: unknown, toolName: unknown = ''): ApplicationFailureCategory {
  const code = text(errorCode, 180).toLowerCase()
  const tool = text(toolName, 180).toLowerCase()
  const combined = `${code} ${tool}`
  if (/approval|payment|submit|attestation|consent/.test(combined)) return 'approval_gate'
  if (/browser|portal|upload|captcha|otp/.test(combined)) return 'browser_execution'
  if (/cv|pdf|latex|document|transcript|academic_evidence|work_sample|proposal/.test(combined)) return 'document_processing'
  if (/discover|research|faculty|programme|opportunit|official_source/.test(combined)) return 'programme_research'
  if (/gmail|calendar|google|provider|oauth|contact/.test(combined)) return 'provider_integration'
  if (/model|semantic|reasoning|token|response|agent_execution/.test(combined)) return 'model_execution'
  if (/applicant|user|missing|required|needs_context|progress_detail/.test(combined)) return 'applicant_gate'
  return 'workflow_state'
}

export function applicationActionElapsedMs(startedAt: unknown, now = Date.now()) {
  const parsed = Date.parse(text(startedAt, 80))
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : null
}

/**
 * Older waiting runs can carry a correct typed attachment interaction while
 * their application-state projection predates pendingInputs. Refresh that
 * projection once so every client gets the same actionable applicant gate.
 */
export function applicationProjectionRefreshNeeded(input: ApplicationProjectionRefreshInput) {
  if (!isGraduateApplicationTask(text(input.objective, 1_200), text(input.description, 4_000))) return false
  if (!['needs_context', 'waiting_for_user'].includes(text(input.status, 80))) return false
  if (text(input.errorCode, 120) !== 'academic_evidence_progress_detail') return false
  const interaction = input.interaction && typeof input.interaction === 'object' && !Array.isArray(input.interaction)
    ? input.interaction as Record<string, unknown>
    : {}
  if (text(interaction.kind, 80) !== 'attachment_request') return false
  const interactionId = text(interaction.id, 300)
  const requirementId = text(interaction.requirementId ?? interaction.requirement_id, 180)
  if (!interactionId || !requirementId || interactionId === text(input.lastRefreshedInteractionId, 300)) return false
  const pendingInputs = Array.isArray(input.pendingInputs) ? input.pendingInputs : []
  return !pendingInputs.some(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const pending = value as Record<string, unknown>
    return text(pending.requirementId ?? pending.requirement_id, 180) === requirementId &&
      !['answered', 'parked'].includes(text(pending.status, 80))
  })
}

export type ApplicationWorkingSetNode = {
  id: string
  type: string
  title: string
  status: string
  dependencies: string[]
}

export type ApplicationWorkingSet = {
  schemaVersion: 1
  domain: 'graduate_application'
  objective: string
  applicationCaseId: string | null
  applicationCaseIds: string[]
  activeTargetKey: string | null
  activeTargetLabel: string | null
  controllerState: string
  engineStep: string
  currentLane: string | null
  currentOperation: {
    nodeId: string | null
    title: string
    owner: string | null
  }
  runnable: ApplicationWorkingSetNode[]
  verifiedFactIds: string[]
  evidenceIds: string[]
  pending: {
    userInputs: string[]
    approvals: string[]
    externalWaits: Array<{ type: string; expectedEvent: string }>
  }
  allowedTools: string[]
  excluded: string[]
  reuse: string[]
}

export type ApplicationWorkingSetInput = {
  objective: string
  applicationCaseId?: string | null
  applicationCaseIds?: readonly string[]
  activeTargetKey?: string | null
  activeTargetLabel?: string | null
  controllerState: string
  engineStep: string
  currentLane?: string | null
  currentOperation?: { nodeId?: string | null; title?: string; owner?: string | null }
  runnable?: Array<Partial<ApplicationWorkingSetNode> & { id?: string }>
  verifiedFactIds?: readonly string[]
  evidenceIds?: readonly string[]
  pendingUserInputs?: readonly string[]
  pendingApprovals?: readonly string[]
  externalWaits?: readonly { type?: string; expectedEvent?: string }[]
  allowedTools: readonly string[]
  excluded?: readonly string[]
  reuse?: readonly string[]
}

export function buildApplicationWorkingSet(input: ApplicationWorkingSetInput): ApplicationWorkingSet {
  const currentOperation = input.currentOperation ?? {}
  const applicationCaseId = text(input.applicationCaseId, 100) || null
  const applicationCaseIds = stringList([
    ...(input.applicationCaseIds ?? []),
    applicationCaseId ?? '',
  ], 20, 100)
  const runnable = (input.runnable ?? []).map((node, index) => ({
    id: text(node.id, 180) || `runnable-${index + 1}`,
    type: text(node.type, 100) || 'application_step',
    title: text(node.title, 300) || 'Runnable application step',
    status: text(node.status, 60) || 'runnable',
    dependencies: stringList(node.dependencies, 20, 180),
  })).slice(0, 24)
  return {
    schemaVersion: 1,
    domain: 'graduate_application',
    objective: text(input.objective, 1_200),
    applicationCaseId,
    applicationCaseIds,
    activeTargetKey: text(input.activeTargetKey, 180) || null,
    activeTargetLabel: text(input.activeTargetLabel, 500) || null,
    controllerState: text(input.controllerState, 100),
    engineStep: text(input.engineStep, 100),
    currentLane: text(input.currentLane, 180) || null,
    currentOperation: {
      nodeId: text(currentOperation.nodeId, 180) || null,
      title: text(currentOperation.title, 300) || 'Continue the current application operation.',
      owner: text(currentOperation.owner, 100) || null,
    },
    runnable,
    verifiedFactIds: stringList(input.verifiedFactIds, 80, 300),
    evidenceIds: stringList(input.evidenceIds, 100, 300),
    pending: {
      userInputs: stringList(input.pendingUserInputs, 12, 500),
      approvals: stringList(input.pendingApprovals, 12, 500),
      externalWaits: (input.externalWaits ?? []).map(wait => ({
        type: text(wait.type, 100),
        expectedEvent: text(wait.expectedEvent, 200),
      })).filter(wait => wait.type && wait.expectedEvent).slice(0, 12),
    },
    allowedTools: stringList(input.allowedTools, 48, 160),
    excluded: stringList([
      'standalone work outside a graduate-school application',
      'unverified applicant facts or invented programme requirements',
      'provider effects without the existing approval and evidence gates',
      'final application submission through browser.submit',
      'work belonging to a different application case or an unselected application target',
      ...(input.excluded ?? []),
    ], 24, 260),
    reuse: stringList([
      'the authoritative application controller and dependency-aware plan',
      'verified applicant facts and source-backed evidence IDs',
      'completed idempotency keys and provider confirmations',
      'the current application strategy and its revision',
      'the canonical bundle graph, selected targets, and dependency-aware lane schedule',
      ...(input.reuse ?? []),
    ], 20, 300),
  }
}

export function serializeApplicationWorkingSet(workingSet: ApplicationWorkingSet) {
  return stableApplicationControlJson(workingSet)
}

export type ApplicationTurnAdmission = {
  schemaVersion: 1
  version: typeof APPLICATION_TURN_ADMISSION_VERSION
  decision: 'allow' | 'wait' | 'reject'
  reasonCode: string
  reason: string
  scope: {
    domain: 'graduate_application'
    taskId: string
    applicationCaseId: string | null
    applicationCaseIds: string[]
    activeTargetKey: string | null
    objective: string
    caseRequired: boolean
  }
  currentOperation: {
    controllerState: string
    engineStep: string
    planNodeId: string | null
    lane: string | null
  }
  allowedTools: string[]
  forbiddenEffects: string[]
  requiredEvidence: string[]
  pendingBoundary: {
    kind: 'none' | 'user' | 'approval' | 'external'
    reason: string
    count: number
    canContinueIndependently: boolean
  }
  resources: {
    budget: ApplicationResourceBudget
    used: ApplicationResourceUsage
    remaining: {
      modelCalls: number
      inputTokens: number
      outputTokens: number
      retries: number
    }
    estimatedInputTokens: number
  }
  workingSet: ApplicationWorkingSet
  fingerprintSeed: string
}

export type ApplicationTurnAdmissionInput = {
  taskId: string
  objective: string
  description?: string
  applicationCaseId?: string | null
  applicationCaseIds?: readonly string[]
  activeTargetKey?: string | null
  activeTargetLabel?: string | null
  caseRequired?: boolean
  activeSpecialistId: string
  controllerState: string
  engineStep: string
  currentLane?: string | null
  currentOperation?: { nodeId?: string | null; title?: string; owner?: string | null }
  runnable?: Array<Partial<ApplicationWorkingSetNode> & { id?: string }>
  verifiedFactIds?: readonly string[]
  evidenceIds?: readonly string[]
  pendingUserInputs?: readonly string[]
  pendingApprovals?: readonly string[]
  externalWaits?: readonly { type?: string; expectedEvent?: string }[]
  allowedTools: readonly string[]
  requiredEvidence?: readonly string[]
  excluded?: readonly string[]
  reuse?: readonly string[]
  workAvailable?: boolean
  hardUserBoundary?: { kind: 'approval' | 'user'; reason: string }
  resourceUsage?: unknown
  resourceBudget?: unknown
  resourceBudgetOverrides?: Partial<ApplicationResourceBudget>
  estimatedInputTokens?: number
}

function pendingBoundary(input: ApplicationTurnAdmissionInput, workAvailable: boolean) {
  const approvals = stringList(input.pendingApprovals, 12, 500)
  if (input.hardUserBoundary?.kind === 'approval' || approvals.length) {
    return {
      kind: 'approval' as const,
      reason: text(input.hardUserBoundary?.reason, 500) || 'A user approval is required before the next consequential application effect.',
      count: Math.max(1, approvals.length),
      canContinueIndependently: false,
    }
  }
  const userInputs = stringList(input.pendingUserInputs, 12, 500)
  if (input.hardUserBoundary?.kind === 'user' || userInputs.length) {
    return {
      kind: 'user' as const,
      reason: text(input.hardUserBoundary?.reason, 500) || 'One application input is waiting for the applicant.',
      count: Math.max(1, userInputs.length),
      canContinueIndependently: workAvailable,
    }
  }
  const externalWaits = input.externalWaits ?? []
  if (externalWaits.length) {
    return {
      kind: 'external' as const,
      reason: `${text(externalWaits[0]?.expectedEvent, 240) || 'An external application update'} is pending.`,
      count: externalWaits.length,
      canContinueIndependently: workAvailable,
    }
  }
  return { kind: 'none' as const, reason: '', count: 0, canContinueIndependently: workAvailable }
}

export function buildApplicationTurnAdmission(input: ApplicationTurnAdmissionInput): ApplicationTurnAdmission {
  const description = text(input.description, 4_000)
  const objective = text(input.objective, 1_200)
  const applicationCaseId = text(input.applicationCaseId, 100) || null
  const applicationCaseIds = stringList([
    ...(input.applicationCaseIds ?? []),
    applicationCaseId ?? '',
  ], 20, 100)
  const activeTargetKey = text(input.activeTargetKey, 180) || null
  const caseRequired = input.caseRequired === true
  const allowedTools = stringList(input.allowedTools, 48, 160)
  const workAvailable = input.workAvailable ?? allowedTools.length > 0
  const workingSet = buildApplicationWorkingSet({
    objective,
    applicationCaseId,
    applicationCaseIds,
    activeTargetKey,
    activeTargetLabel: input.activeTargetLabel,
    controllerState: input.controllerState,
    engineStep: input.engineStep,
    currentLane: input.currentLane,
    currentOperation: input.currentOperation,
    runnable: input.runnable,
    verifiedFactIds: input.verifiedFactIds,
    evidenceIds: input.evidenceIds,
    pendingUserInputs: input.pendingUserInputs,
    pendingApprovals: input.pendingApprovals,
    externalWaits: input.externalWaits,
    allowedTools,
    excluded: input.excluded,
    reuse: input.reuse,
  })
  const budget = normalizeApplicationResourceBudget(input.resourceBudget, input.resourceBudgetOverrides)
  const used = normalizeApplicationResourceUsage(input.resourceUsage)
  const estimatedInputTokens = finiteNonNegative(input.estimatedInputTokens)
  const boundary = pendingBoundary(input, workAvailable)
  let decision: ApplicationTurnAdmission['decision'] = 'allow'
  let reasonCode = 'admitted'
  let reason = 'One bounded graduate-application operation is admitted.'
  if (!isGraduateApplicationTask(objective, description)) {
    decision = 'reject'
    reasonCode = 'graduate_application_scope_required'
    reason = 'This turn is outside ShotCount’s graduate-school application scope.'
  } else if (input.activeSpecialistId !== 'david') {
    decision = 'reject'
    reasonCode = 'application_specialist_required'
    reason = 'Only David may execute the canonical graduate-application controller.'
  } else if (caseRequired && !applicationCaseId) {
    decision = 'reject'
    reasonCode = 'application_case_required'
    reason = 'The current application operation requires a durable ApplicationCase.'
  } else if (!allowedTools.length) {
    decision = 'reject'
    reasonCode = 'application_tools_unavailable'
    reason = 'The controller exposed no allowed tool for the current application operation.'
  } else if (used.modelCalls >= budget.maxModelCalls) {
    decision = 'wait'
    reasonCode = 'application_model_call_budget_exhausted'
    reason = 'The bounded application model-call budget for this scheduler slice is exhausted.'
  } else if (used.inputTokens + estimatedInputTokens > budget.maxInputTokens) {
    decision = 'wait'
    reasonCode = 'application_input_budget_exhausted'
    reason = 'The bounded application input budget for this scheduler slice is exhausted.'
  } else if (used.outputTokens >= budget.maxOutputTokens) {
    decision = 'wait'
    reasonCode = 'application_output_budget_exhausted'
    reason = 'The bounded application output budget for this scheduler slice is exhausted.'
  } else if (boundary.kind === 'approval' || (boundary.kind === 'user' && !boundary.canContinueIndependently) || (boundary.kind === 'external' && !boundary.canContinueIndependently)) {
    decision = 'wait'
    reasonCode = boundary.kind === 'approval' ? 'application_approval_boundary' : boundary.kind === 'external' ? 'application_external_wait' : 'application_user_boundary'
    reason = boundary.reason
  }
  const fingerprintSeed = stableApplicationControlJson({
    version: APPLICATION_TURN_ADMISSION_VERSION,
    taskId: text(input.taskId, 100),
    scope: { objective, applicationCaseId, applicationCaseIds, activeTargetKey, caseRequired },
    currentOperation: { controllerState: text(input.controllerState, 100), engineStep: text(input.engineStep, 100), lane: text(input.currentLane, 180) || null },
    allowedTools,
    requiredEvidence: stringList(input.requiredEvidence, 40, 300),
    workingSet,
  })
  return {
    schemaVersion: 1,
    version: APPLICATION_TURN_ADMISSION_VERSION,
    decision,
    reasonCode,
    reason,
    scope: {
      domain: 'graduate_application',
      taskId: text(input.taskId, 100),
      applicationCaseId,
      applicationCaseIds,
      activeTargetKey,
      objective,
      caseRequired,
    },
    currentOperation: {
      controllerState: text(input.controllerState, 100),
      engineStep: text(input.engineStep, 100),
      planNodeId: text(input.currentOperation?.nodeId, 180) || null,
      lane: text(input.currentLane, 180) || null,
    },
    allowedTools,
    forbiddenEffects: [
      'final application submission through browser.submit',
      'payment or first-contact communication without the existing approval gate',
      'claiming completion without provider, portal, or artifact evidence',
      'executing any non-graduate-application task',
    ],
    requiredEvidence: stringList(input.requiredEvidence, 40, 300),
    pendingBoundary: boundary,
    resources: {
      budget,
      used,
      remaining: {
        modelCalls: Math.max(0, budget.maxModelCalls - used.modelCalls),
        inputTokens: Math.max(0, budget.maxInputTokens - used.inputTokens),
        outputTokens: Math.max(0, budget.maxOutputTokens - used.outputTokens),
        retries: Math.max(0, budget.maxRetries - used.retries),
      },
      estimatedInputTokens,
    },
    workingSet,
    fingerprintSeed,
  }
}

export type ApplicationTurnToolProposal = {
  name: string
  arguments?: Record<string, unknown>
}

export type ApplicationTurnAdmissionValidation =
  | { allowed: true }
  | { allowed: false; code: string; message: string }

export function validateApplicationTurnAdmission(
  admission: ApplicationTurnAdmission,
  proposal: ApplicationTurnToolProposal,
): ApplicationTurnAdmissionValidation {
  const toolName = text(proposal.name, 160)
  const argumentsValue = proposal.arguments ?? {}
  if (admission.decision !== 'allow') return { allowed: false, code: admission.reasonCode, message: admission.reason }
  if (!toolName || !admission.allowedTools.includes(toolName)) {
    return { allowed: false, code: 'application_turn_tool_not_admitted', message: `${toolName || 'That tool'} is not admitted for the current application operation.` }
  }
  if (admission.scope.caseRequired && !admission.scope.applicationCaseId) {
    return { allowed: false, code: 'application_case_required', message: 'The current application operation requires a durable ApplicationCase.' }
  }
  const proposedCaseId = text(argumentsValue.application_case_id, 100)
  if (proposedCaseId && admission.scope.applicationCaseId && proposedCaseId !== admission.scope.applicationCaseId) {
    return { allowed: false, code: 'application_case_mismatch', message: 'The proposed application action targets a different ApplicationCase than the active turn.' }
  }
  if (toolName === 'browser.submit') {
    const effect = text(argumentsValue.expected_effect ?? argumentsValue.expectedEffect ?? argumentsValue.target, 1_200).toLocaleLowerCase()
    if (/final|application\s+submission|submit(?:ting)?\s+(?:the|this|my)?\s*application/.test(effect)) {
      return { allowed: false, code: 'application_final_submit_requires_canonical_tool', message: 'Final application submission must use application.submit after the exact package, checkpoint, durable claim, and approval are re-verified.' }
    }
  }
  return { allowed: true }
}

export type ApplicationRecoveryActionSlice = {
  id?: string | null
  stepIndex?: number | null
  toolName?: string | null
  modelCallId?: string | null
  status?: string | null
  idempotencyKey?: string | null
  providerActionId?: string | null
}

export type ApplicationRecoverySliceInput = {
  runId: string
  objective: string
  description?: string
  runStatus: string
  currentStep: number
  applicationCaseId?: string | null
  applicationCaseIds?: readonly string[]
  activeTargetKey?: string | null
  contextCaseId?: string | null
  contextCaseIds?: readonly string[]
  activeSpecialistId: string
  admissionAnchor?: unknown
  actions?: readonly ApplicationRecoveryActionSlice[]
}

export type ApplicationRecoveryState = 'clean' | 'resume_action' | 'resume_model' | 'blocked'

export type ApplicationRecoveryValidation = {
  valid: boolean
  state: ApplicationRecoveryState
  code: string | null
  issues: string[]
  actionId: string | null
}

function activeRecoveryActions(input: ApplicationRecoverySliceInput) {
  return (input.actions ?? []).filter(action => {
    if (terminalActionStatuses.has(text(action.status, 40))) return false
    const stepIndex = Number(action.stepIndex)
    return !Number.isFinite(stepIndex) || stepIndex >= input.currentStep
  })
}

function recoveryAnchor(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function deriveApplicationRecoveryState(input: ApplicationRecoverySliceInput): ApplicationRecoveryState {
  const activeActions = activeRecoveryActions(input)
  if (['completed', 'cancelled'].includes(text(input.runStatus, 40)) && activeActions.length) return 'blocked'
  if (activeActions.length) return 'resume_action'
  const anchor = recoveryAnchor(input.admissionAnchor)
  if (anchor?.decision === 'allow' && text(anchor.response_id ?? anchor.responseId, 200)) return 'resume_model'
  return 'clean'
}

export function validateApplicationRecoverySlice(input: ApplicationRecoverySliceInput): ApplicationRecoveryValidation {
  const issues: string[] = []
  const actionId = null
  if (!text(input.runId, 100)) issues.push('run_id_missing')
  if (!isGraduateApplicationTask(text(input.objective, 1_200), text(input.description, 4_000))) issues.push('graduate_application_scope_required')
  if (input.activeSpecialistId !== 'david') issues.push('application_specialist_required')
  const caseId = text(input.applicationCaseId, 100)
  const caseIds = stringList([...(input.applicationCaseIds ?? []), caseId], 20, 100)
  const contextCaseId = text(input.contextCaseId, 100)
  const contextCaseIds = stringList([...(input.contextCaseIds ?? []), contextCaseId], 20, 100)
  const activeTargetKey = text(input.activeTargetKey, 180)
  if (caseId && contextCaseId && caseId !== contextCaseId) issues.push('application_case_mismatch')
  if (caseIds.length && contextCaseIds.length && (caseIds.length !== contextCaseIds.length || caseIds.some(id => !contextCaseIds.includes(id)))) issues.push('application_case_bundle_mismatch')
  const anchor = recoveryAnchor(input.admissionAnchor)
  if (anchor) {
    const anchorRunId = text(anchor.run_id ?? anchor.runId, 100)
    const anchorCaseId = text(anchor.application_case_id ?? anchor.applicationCaseId, 100)
    const anchorCaseIds = stringList(anchor.application_case_ids ?? anchor.applicationCaseIds, 20, 100)
    const anchorTargetKey = text(anchor.active_target_key ?? anchor.activeTargetKey, 180)
    const anchorDecision = text(anchor.decision, 40)
    const anchorStep = Number(anchor.current_step ?? anchor.currentStep)
    if (anchorRunId && anchorRunId !== input.runId) issues.push('admission_anchor_run_mismatch')
    if (anchorCaseId && caseId && anchorCaseId !== caseId) issues.push('admission_anchor_case_mismatch')
    if (anchorCaseIds.length && caseIds.length && (anchorCaseIds.length !== caseIds.length || anchorCaseIds.some(id => !caseIds.includes(id)))) issues.push('admission_anchor_bundle_mismatch')
    if (anchorDecision === 'allow' && anchorTargetKey && activeTargetKey && anchorTargetKey !== activeTargetKey) issues.push('admission_anchor_target_mismatch')
    if (Number.isFinite(anchorStep) && anchorStep > input.currentStep) issues.push('admission_anchor_rewinds_state')
  }
  const actions = input.actions ?? []
  const nonCancelled = actions.filter(action => text(action.status, 40) !== 'cancelled')
  const byModelCall = new Map<string, ApplicationRecoveryActionSlice[]>()
  const byIdempotency = new Map<string, ApplicationRecoveryActionSlice[]>()
  for (const action of nonCancelled) {
    const modelCallId = text(action.modelCallId, 240)
    const idempotencyKey = text(action.idempotencyKey, 500)
    if (modelCallId) byModelCall.set(modelCallId, [...(byModelCall.get(modelCallId) ?? []), action])
    if (idempotencyKey) byIdempotency.set(idempotencyKey, [...(byIdempotency.get(idempotencyKey) ?? []), action])
    const toolName = text(action.toolName, 160)
    if (text(action.status, 40) === 'succeeded' && consequentialProviderTools.has(toolName) && !text(action.providerActionId, 300)) {
      issues.push(`provider_confirmation_missing:${toolName}`)
    }
  }
  for (const [modelCallId, grouped] of byModelCall) {
    if (grouped.length > 1) issues.push(`duplicate_model_call:${modelCallId}`)
  }
  for (const [idempotencyKey, grouped] of byIdempotency) {
    if (grouped.length > 1) issues.push(`duplicate_idempotency_key:${idempotencyKey}`)
  }
  const activeActions = activeRecoveryActions({ ...input, actions: nonCancelled })
  if (activeActions.length > 1) issues.push('multiple_open_application_actions')
  const uniqueIssues = [...new Set(issues)]
  if (uniqueIssues.length) {
    return {
      valid: false,
      state: 'blocked',
      code: uniqueIssues[0]!.split(':', 1)[0]!,
      issues: uniqueIssues,
      actionId,
    }
  }
  return {
    valid: true,
    state: deriveApplicationRecoveryState(input),
    code: null,
    issues: [],
    actionId: activeActions.length === 1 ? text(activeActions[0]?.id, 100) || null : null,
  }
}

export function serializeApplicationTurnAdmission(admission: ApplicationTurnAdmission) {
  return [
    'APPLICATION_TURN_ADMISSION_V1',
    'The deterministic application controller admits at most one bounded operation in this turn.',
    stableApplicationControlJson({
      decision: admission.decision,
      reasonCode: admission.reasonCode,
      reason: admission.reason,
      scope: admission.scope,
      currentOperation: admission.currentOperation,
      allowedTools: admission.allowedTools,
      forbiddenEffects: admission.forbiddenEffects,
      requiredEvidence: admission.requiredEvidence,
      pendingBoundary: admission.pendingBoundary,
      resources: admission.resources,
      workingSet: admission.workingSet,
    }),
  ].join('\n')
}
