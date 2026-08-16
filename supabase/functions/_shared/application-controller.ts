/**
 * Deterministic application execution controller (David v2.1).
 *
 * The model may propose an action inside the current state. This module owns
 * fact admissibility, dependency order, case scope, state transitions, and
 * evidence-backed completion. It is provider-neutral so production and the
 * replay benchmark exercise the same rules.
 */

export const APPLICATION_CONTROLLER_VERSION = 'david-application-controller@2.1' as const

export const applicationControllerStates = [
  'INTAKE',
  'PROFILE_RESOLUTION',
  'OPPORTUNITY_RESEARCH',
  'OPPORTUNITY_VERIFICATION',
  'SHORTLIST_APPROVAL',
  'CASE_CREATION',
  'DOCUMENT_PREPARATION',
  'WRITER_EXECUTION',
  'REFEREE_EXECUTION',
  'PROFESSOR_OUTREACH',
  'PORTAL_ACCOUNT',
  'PORTAL_EXECUTION',
  'READINESS_REVIEW',
  'SUBMISSION_APPROVAL',
  'SUBMISSION',
  'POST_SUBMISSION',
  'COMPLETE',
  'BLOCKED',
] as const
export type ApplicationControllerState = typeof applicationControllerStates[number]

export type FactVerification = 'VERIFIED' | 'UNRESOLVED' | 'CONFLICTING'
export type FactConfidence = 'high' | 'medium' | 'low'
export type FactProvenanceKind =
  | 'user_statement'
  | 'uploaded_document'
  | 'verified_external_source'
  | 'provider_observation'
  | 'generated_inference'

export type FactCandidate<T = unknown> = {
  value: T
  provenance: {
    kind: FactProvenanceKind
    sourceId: string | null
    sourceAssetIds?: string[]
    sourceUrl?: string | null
    confirmed: boolean
  }
  confidence: FactConfidence
}

export type FactResolution<T = unknown> = {
  factId: string
  value: T | null
  verification: FactVerification
  provenance: FactCandidate<T>['provenance'] | null
  confidence: FactConfidence
  conflict: boolean
  candidates: FactCandidate<T>[]
  reason: string | null
}

function stableValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  return JSON.stringify(value)
}

/**
 * A fact is usable only when one confirmed, non-inferred value wins without a
 * contradictory confirmed value. Missing facts are UNRESOLVED and conflicting
 * facts are CONFLICTING; downstream callers never receive either as a value.
 */
export function resolveApplicationFact<T>(factId: string, candidates: FactCandidate<T>[]): FactResolution<T> {
  const admissible = candidates.filter(candidate =>
    candidate.provenance.confirmed &&
    candidate.provenance.kind !== 'generated_inference' &&
    candidate.value !== null &&
    candidate.value !== undefined &&
    stableValue(candidate.value) !== '',
  )
  const values = new Map<string, FactCandidate<T>[]>()
  for (const candidate of admissible) {
    const key = stableValue(candidate.value)
    values.set(key, [...(values.get(key) ?? []), candidate])
  }
  if (!admissible.length) {
    return {
      factId,
      value: null,
      verification: 'UNRESOLVED',
      provenance: null,
      confidence: 'low',
      conflict: false,
      candidates,
      reason: 'No confirmed source supplies this fact.',
    }
  }
  if (values.size !== 1) {
    return {
      factId,
      value: null,
      verification: 'CONFLICTING',
      provenance: null,
      confidence: 'low',
      conflict: true,
      candidates,
      reason: 'Confirmed sources disagree; resolve the conflict before use.',
    }
  }
  const winning = admissible.toSorted((left, right) => {
    const rank = { high: 3, medium: 2, low: 1 }
    return rank[right.confidence] - rank[left.confidence]
  })[0]!
  return {
    factId,
    value: winning.value,
    verification: 'VERIFIED',
    provenance: winning.provenance,
    confidence: winning.confidence,
    conflict: false,
    candidates,
    reason: null,
  }
}

/**
 * Resolve an existing conflict only after an applicant or an authoritative
 * source explicitly selects the winning candidate. The discarded candidates
 * remain in the audit trail, but cannot keep a fact blocked after the choice.
 */
export function resolveChosenApplicationFact<T>(
  factId: string,
  fact: FactResolution<T>,
  selectedValue: T,
  provenance: FactCandidate<T>['provenance'],
  confidence: FactConfidence = 'high',
): FactResolution<T> {
  const selected = fact.candidates.filter(candidate => stableValue(candidate.value) === stableValue(selectedValue))
  const candidates = selected.length
    ? selected
    : [{ value: selectedValue, provenance, confidence }]
  return resolveApplicationFact(factId, candidates)
}

export type RequirementNodeStatus =
  | 'UNRESOLVED'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'READY'
  | 'VERIFIED'
  | 'WAIVED'
  | 'SUBMITTED'
  | 'BLOCKED'

export type RequirementNode = {
  id: string
  caseId: string
  name: string
  required: boolean
  status: RequirementNodeStatus
  sourceId: string | null
  dependencyIds: string[]
  responsible: 'applicant' | 'david' | 'writer' | 'referee' | 'roon' | 'institution'
  deadline: string | null
  evidenceIds: string[]
  blocker: string | null
}

export type RequirementGraphIssue = {
  code: 'missing_dependency' | 'cross_case_dependency' | 'cycle'
  requirementId: string
  dependencyId: string | null
}

export function validateRequirementGraph(nodes: RequirementNode[]): RequirementGraphIssue[] {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const issues: RequirementGraphIssue[] = []
  for (const node of nodes) {
    for (const dependencyId of node.dependencyIds) {
      const dependency = byId.get(dependencyId)
      if (!dependency) issues.push({ code: 'missing_dependency', requirementId: node.id, dependencyId })
      else if (dependency.caseId !== node.caseId) issues.push({ code: 'cross_case_dependency', requirementId: node.id, dependencyId })
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const walk = (id: string) => {
    if (visiting.has(id)) {
      issues.push({ code: 'cycle', requirementId: id, dependencyId: id })
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependencyId of byId.get(id)?.dependencyIds ?? []) walk(dependencyId)
    visiting.delete(id)
    visited.add(id)
  }
  nodes.forEach(node => walk(node.id))
  return issues
}

export function requirementIsComplete(node: RequirementNode) {
  return ['READY', 'VERIFIED', 'WAIVED', 'SUBMITTED'].includes(node.status) &&
    (!node.required || node.status === 'WAIVED' || node.evidenceIds.length > 0)
}

export function requirementDependenciesSatisfied(node: RequirementNode, graph: RequirementNode[]) {
  const byId = new Map(graph.map(item => [item.id, item]))
  return node.dependencyIds.every(id => {
    const dependency = byId.get(id)
    return Boolean(dependency && dependency.caseId === node.caseId && requirementIsComplete(dependency))
  })
}

export type EvidenceType =
  | 'OFFICIAL_SOURCE'
  | 'PROFILE_FACT'
  | 'APPROVAL'
  | 'DOCUMENT_CHECKSUM'
  | 'PORTAL_OBSERVATION'
  | 'PORTAL_SAVE_CONFIRMATION'
  | 'UPLOAD_PRESENCE'
  | 'PROVIDER_MESSAGE'
  | 'PROVIDER_THREAD'
  | 'WRITER_ARTIFACT'
  | 'REFEREE_STATUS'
  | 'SUBMISSION_CONFIRMATION'
  | 'APPLICATION_ID'

export type ControllerEvidence = {
  id: string
  caseId: string
  type: EvidenceType
  verified: boolean
  sourceId: string | null
  providerId?: string | null
  threadId?: string | null
  artifactId?: string | null
  checksum?: string | null
  capturedAt?: string | null
}

export type CompletionContract = {
  intendedAction: string
  expectedState: ApplicationControllerState
  evidenceTypes: EvidenceType[]
  caseId: string
  expectedProviderId?: string | null
  expectedThreadId?: string | null
  expectedArtifactId?: string | null
  expectedChecksum?: string | null
}

/** Hard invariant: NO_EVIDENCE => NO_COMPLETION. */
export function verifyApplicationCompletion(contract: CompletionContract, evidence: ControllerEvidence[]) {
  const scoped = evidence.filter(item => item.caseId === contract.caseId && item.verified)
  if (!scoped.length || !contract.evidenceTypes.length) return false
  if (!contract.evidenceTypes.every(type => scoped.some(item => item.type === type))) return false
  if (contract.expectedProviderId && !scoped.some(item => item.providerId === contract.expectedProviderId)) return false
  if (contract.expectedThreadId && !scoped.some(item => item.threadId === contract.expectedThreadId)) return false
  if (contract.expectedArtifactId && !scoped.some(item => item.artifactId === contract.expectedArtifactId)) return false
  if (contract.expectedChecksum && !scoped.some(item => item.checksum === contract.expectedChecksum)) return false
  return true
}

type StateDefinition = {
  entryConditions: string[]
  requiredInputs: string[]
  allowedActionKinds: string[]
  completionConditions: string[]
  nextStates: ApplicationControllerState[]
  recoveryState: ApplicationControllerState
  prohibitedTransitions: ApplicationControllerState[]
}

const terminalStates = new Set<ApplicationControllerState>(['COMPLETE', 'BLOCKED'])
const allStates = [...applicationControllerStates]

function stateDefinition(
  nextStates: ApplicationControllerState[],
  allowedActionKinds: string[],
  requiredInputs: string[],
  completionConditions: string[],
  recoveryState: ApplicationControllerState,
): StateDefinition {
  return {
    entryConditions: requiredInputs,
    requiredInputs,
    allowedActionKinds,
    completionConditions,
    nextStates,
    recoveryState,
    prohibitedTransitions: allStates.filter(state => state !== recoveryState && !nextStates.includes(state)),
  }
}

export const applicationStateMachine: Record<ApplicationControllerState, StateDefinition> = {
  INTAKE: stateDefinition(['PROFILE_RESOLUTION', 'BLOCKED'], ['intake', 'request_context'], ['objective'], ['objective_captured'], 'INTAKE'),
  PROFILE_RESOLUTION: stateDefinition(['OPPORTUNITY_RESEARCH', 'BLOCKED'], ['profile', 'request_context'], ['objective', 'profile'], ['required_facts_resolved_or_explicitly_blocked'], 'PROFILE_RESOLUTION'),
  OPPORTUNITY_RESEARCH: stateDefinition(['OPPORTUNITY_VERIFICATION', 'BLOCKED'], ['research'], ['objective', 'verified_profile_facts'], ['candidate_opportunities_found'], 'OPPORTUNITY_RESEARCH'),
  OPPORTUNITY_VERIFICATION: stateDefinition(['SHORTLIST_APPROVAL', 'BLOCKED'], ['research', 'requirement'], ['official_sources'], ['requirements_and_deadlines_verified'], 'OPPORTUNITY_RESEARCH'),
  SHORTLIST_APPROVAL: stateDefinition(['CASE_CREATION', 'BLOCKED'], ['approval', 'request_context'], ['verified_opportunities'], ['shortlist_approved'], 'SHORTLIST_APPROVAL'),
  CASE_CREATION: stateDefinition(['DOCUMENT_PREPARATION', 'BLOCKED'], ['case', 'requirement'], ['approved_shortlist'], ['case_and_requirement_graph_created'], 'CASE_CREATION'),
  DOCUMENT_PREPARATION: stateDefinition(['WRITER_EXECUTION', 'REFEREE_EXECUTION', 'PROFESSOR_OUTREACH', 'PORTAL_ACCOUNT', 'PORTAL_EXECUTION', 'READINESS_REVIEW', 'BLOCKED'], ['document', 'writer', 'referee', 'professor', 'portal', 'communication', 'evidence', 'requirement', 'payment', 'request_context'], ['case', 'verified_facts', 'requirement_graph'], ['required_documents_ready_or_delegated'], 'DOCUMENT_PREPARATION'),
  WRITER_EXECUTION: stateDefinition(['DOCUMENT_PREPARATION', 'REFEREE_EXECUTION', 'PORTAL_EXECUTION', 'BLOCKED'], ['writer', 'communication', 'document'], ['case', 'writer_brief', 'source_fact_ids'], ['writer_artifact_verified'], 'WRITER_EXECUTION'),
  REFEREE_EXECUTION: stateDefinition(['DOCUMENT_PREPARATION', 'PROFESSOR_OUTREACH', 'PORTAL_EXECUTION', 'BLOCKED'], ['referee', 'communication'], ['case', 'verified_referee', 'requirements'], ['referee_request_verified_or_waiting'], 'REFEREE_EXECUTION'),
  PROFESSOR_OUTREACH: stateDefinition(['DOCUMENT_PREPARATION', 'PORTAL_EXECUTION', 'BLOCKED'], ['professor', 'communication'], ['case', 'verified_faculty', 'approval'], ['outreach_verified_or_waiting'], 'PROFESSOR_OUTREACH'),
  PORTAL_ACCOUNT: stateDefinition(['PORTAL_EXECUTION', 'BLOCKED'], ['portal_account', 'request_context'], ['case', 'official_portal'], ['account_session_verified'], 'PORTAL_ACCOUNT'),
  PORTAL_EXECUTION: stateDefinition(['DOCUMENT_PREPARATION', 'WRITER_EXECUTION', 'REFEREE_EXECUTION', 'PROFESSOR_OUTREACH', 'READINESS_REVIEW', 'BLOCKED'], ['portal', 'document', 'writer', 'referee', 'professor', 'communication', 'requirement', 'evidence', 'payment', 'request_context'], ['case', 'verified_facts', 'requirement_graph'], ['all_required_sections_verified'], 'PORTAL_EXECUTION'),
  READINESS_REVIEW: stateDefinition(['DOCUMENT_PREPARATION', 'WRITER_EXECUTION', 'REFEREE_EXECUTION', 'PORTAL_EXECUTION', 'SUBMISSION_APPROVAL', 'BLOCKED'], ['readiness', 'requirement'], ['case', 'requirements', 'artifacts', 'portal_evidence'], ['readiness_report_verified'], 'READINESS_REVIEW'),
  SUBMISSION_APPROVAL: stateDefinition(['SUBMISSION', 'READINESS_REVIEW', 'BLOCKED'], ['approval'], ['exact_readiness_package'], ['exact_package_approved'], 'READINESS_REVIEW'),
  SUBMISSION: stateDefinition(['POST_SUBMISSION', 'BLOCKED'], ['submission'], ['approval', 'readiness', 'verified_portal_session'], ['submission_confirmation_and_application_id'], 'SUBMISSION_APPROVAL'),
  POST_SUBMISSION: stateDefinition(['COMPLETE', 'BLOCKED'], ['monitoring', 'communication', 'evidence'], ['submission_evidence'], ['post_submission_state_recorded'], 'POST_SUBMISSION'),
  COMPLETE: stateDefinition([], [], ['completion_evidence'], ['objective_satisfied'], 'COMPLETE'),
  BLOCKED: stateDefinition(['PROFILE_RESOLUTION', 'OPPORTUNITY_RESEARCH', 'DOCUMENT_PREPARATION', 'WRITER_EXECUTION', 'REFEREE_EXECUTION', 'PROFESSOR_OUTREACH', 'PORTAL_ACCOUNT', 'PORTAL_EXECUTION', 'READINESS_REVIEW', 'SUBMISSION_APPROVAL', 'POST_SUBMISSION'], ['request_context', 'recovery'], ['blocker'], ['blocker_resolved'], 'BLOCKED'),
}

export function applicationControllerStateFromLegacy(input: {
  campaignStatus?: string | null
  caseStage?: string | null
  caseStatus?: string | null
  hasCase?: boolean
  readinessVerified?: boolean
  submissionApproved?: boolean
  submissionConfirmed?: boolean
}): ApplicationControllerState {
  if (input.submissionConfirmed || input.caseStatus === 'submitted') return 'POST_SUBMISSION'
  if (['closed', 'offer', 'rejected', 'withdrawn'].includes(input.caseStatus ?? '')) return 'COMPLETE'
  if (input.caseStatus === 'awaiting_submission_approval') return input.submissionApproved ? 'SUBMISSION' : 'SUBMISSION_APPROVAL'
  if (input.readinessVerified) return 'SUBMISSION_APPROVAL'
  switch (input.caseStage) {
    case 'intake': return 'PROFILE_RESOLUTION'
    case 'research': return 'OPPORTUNITY_RESEARCH'
    case 'shortlist_approval': return 'SHORTLIST_APPROVAL'
    case 'document_preparation': return 'DOCUMENT_PREPARATION'
    case 'writer_assignment': return 'WRITER_EXECUTION'
    case 'referee_coordination': return 'REFEREE_EXECUTION'
    case 'portal_preparation': return 'PORTAL_EXECUTION'
    case 'submission_approval': return 'READINESS_REVIEW'
    case 'submitted': return 'POST_SUBMISSION'
    case 'monitoring':
    case 'interview':
    case 'additional_documents': return 'POST_SUBMISSION'
    case 'offer':
    case 'rejected':
    case 'withdrawn':
    case 'closed': return 'COMPLETE'
    default: break
  }
  if (input.hasCase) return 'DOCUMENT_PREPARATION'
  if (input.campaignStatus === 'awaiting_shortlist_approval') return 'SHORTLIST_APPROVAL'
  if (input.campaignStatus === 'approved') return 'CASE_CREATION'
  if (input.campaignStatus === 'intake') return 'PROFILE_RESOLUTION'
  return 'OPPORTUNITY_RESEARCH'
}

export function canTransitionApplicationState(from: ApplicationControllerState, to: ApplicationControllerState) {
  if (from === to) return true
  if (terminalStates.has(from)) return false
  return applicationStateMachine[from].nextStates.includes(to)
}

export type ProposedApplicationAction = {
  id: string
  kind: string
  toolName: string
  caseId: string | null
  targetRequirementId?: string | null
  requiredFactIds?: string[]
  expectedEvidenceTypes?: EvidenceType[]
  intendedNextState?: ApplicationControllerState | null
  deadline?: string | null
  externalLeadTime?: boolean
  userInputAvailable?: boolean
  completed?: boolean
  consequential?: boolean
  idempotencyKey?: string | null
}

export type NextActionSelection = {
  action: ProposedApplicationAction | null
  rejected: Array<{ actionId: string; reasons: string[] }>
}

function deadlineRisk(deadline: string | null | undefined, now: string) {
  if (!deadline) return Number.MAX_SAFE_INTEGER
  const difference = Date.parse(deadline) - Date.parse(now)
  return Number.isFinite(difference) ? difference : Number.MAX_SAFE_INTEGER
}

function priority(action: ProposedApplicationAction, graph: RequirementNode[], now: string) {
  const requirement = graph.find(node => node.id === action.targetRequirementId)
  const dependents = requirement ? graph.filter(node => node.dependencyIds.includes(requirement.id)).length : 0
  const deadline = deadlineRisk(action.deadline ?? requirement?.deadline, now)
  if (deadline < 7 * 24 * 60 * 60 * 1_000) return [1, deadline, -dependents]
  if (dependents > 0) return [2, -dependents, deadline]
  if (action.userInputAvailable) return [3, 0, deadline]
  if (action.externalLeadTime) return [4, 0, deadline]
  if (['writer', 'referee', 'professor'].includes(action.kind)) return [5, 0, deadline]
  if (action.kind === 'document') return [6, 0, deadline]
  if (action.kind === 'portal') return [7, 0, deadline]
  return [8, 0, deadline]
}

function compareTuple(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference) return difference
  }
  return 0
}

export function selectNextApplicationAction(input: {
  state: ApplicationControllerState
  currentCaseId: string | null
  actions: ProposedApplicationAction[]
  facts: FactResolution[]
  requirements: RequirementNode[]
  completedIdempotencyKeys?: string[]
  now?: string
}): NextActionSelection {
  const completedKeys = new Set(input.completedIdempotencyKeys ?? [])
  const facts = new Map(input.facts.map(fact => [fact.factId, fact]))
  const requirements = new Map(input.requirements.map(node => [node.id, node]))
  const rejected: NextActionSelection['rejected'] = []
  const eligible = input.actions.filter(action => {
    const reasons: string[] = []
    if (action.completed) reasons.push('target_already_complete')
    if (action.consequential && action.idempotencyKey && completedKeys.has(action.idempotencyKey)) reasons.push('duplicate_consequential_action')
    if (action.caseId && input.currentCaseId && action.caseId !== input.currentCaseId) reasons.push('wrong_application_case')
    if ((action.requiredFactIds ?? []).some(id => facts.get(id)?.verification !== 'VERIFIED')) reasons.push('required_fact_unresolved')
    const requirement = action.targetRequirementId ? requirements.get(action.targetRequirementId) : null
    if (action.targetRequirementId && !requirement) reasons.push('requirement_missing')
    if (requirement && !requirementDependenciesSatisfied(requirement, input.requirements)) reasons.push('requirement_dependency_incomplete')
    if (action.intendedNextState && !canTransitionApplicationState(input.state, action.intendedNextState)) reasons.push('illegal_state_transition')
    const stateAllowed = applicationStateMachine[input.state].allowedActionKinds
    if (stateAllowed.length && !stateAllowed.includes(action.kind) && action.kind !== 'request_context') reasons.push('action_outside_current_state')
    if (reasons.length) rejected.push({ actionId: action.id, reasons })
    return reasons.length === 0
  })
  const now = input.now ?? new Date().toISOString()
  eligible.sort((left, right) => compareTuple(priority(left, input.requirements, now), priority(right, input.requirements, now)) || left.id.localeCompare(right.id))
  return { action: eligible[0] ?? null, rejected }
}

export type ApplicationValidationCode =
  | 'wrong_application_case'
  | 'required_fact_unresolved'
  | 'requirement_missing'
  | 'requirement_dependency_incomplete'
  | 'requirement_already_complete'
  | 'evidence_contract_missing'
  | 'illegal_state_transition'
  | 'action_outside_current_state'
  | 'duplicate_consequential_action'
  | 'readiness_required_before_submission'
  | 'approval_required_before_submission'

export type ApplicationValidationError = {
  code: ApplicationValidationCode
  message: string
  actionId: string
  retryable: true
  preserveState: true
  details: Record<string, unknown>
}

export function validateApplicationAction(input: {
  state: ApplicationControllerState
  currentCaseId: string | null
  action: ProposedApplicationAction
  facts: FactResolution[]
  requirements: RequirementNode[]
  completedIdempotencyKeys?: string[]
  readinessVerified?: boolean
  submissionApproved?: boolean
}): ApplicationValidationError[] {
  const { action } = input
  const errors: ApplicationValidationError[] = []
  const add = (code: ApplicationValidationCode, message: string, details: Record<string, unknown> = {}) => {
    errors.push({ code, message, actionId: action.id, retryable: true, preserveState: true, details })
  }
  if (action.caseId && input.currentCaseId && action.caseId !== input.currentCaseId) {
    add('wrong_application_case', 'The action targets a different ApplicationCase.', { expectedCaseId: input.currentCaseId, receivedCaseId: action.caseId })
  }
  const unresolved = (action.requiredFactIds ?? []).filter(id => input.facts.find(fact => fact.factId === id)?.verification !== 'VERIFIED')
  if (unresolved.length) add('required_fact_unresolved', 'Resolve required applicant facts before using them downstream.', { factIds: unresolved })
  if (action.targetRequirementId) {
    const requirement = input.requirements.find(node => node.id === action.targetRequirementId)
    if (!requirement) add('requirement_missing', 'The target requirement is not in the current case graph.', { requirementId: action.targetRequirementId })
    else {
      if (requirementIsComplete(requirement)) add('requirement_already_complete', 'The target requirement is already complete.', { requirementId: requirement.id })
      if (!requirementDependenciesSatisfied(requirement, input.requirements)) add('requirement_dependency_incomplete', 'Complete requirement dependencies first.', { requirementId: requirement.id, dependencyIds: requirement.dependencyIds })
    }
  }
  if (action.consequential && !(action.expectedEvidenceTypes ?? []).length) add('evidence_contract_missing', 'Consequential actions need an expected evidence contract before execution.')
  if (action.intendedNextState && !canTransitionApplicationState(input.state, action.intendedNextState)) {
    add('illegal_state_transition', `The controller cannot advance from ${input.state} to ${action.intendedNextState}.`)
  }
  const allowed = applicationStateMachine[input.state].allowedActionKinds
  if (allowed.length && !allowed.includes(action.kind) && action.kind !== 'request_context') {
    add('action_outside_current_state', `${action.kind} is not allowed in ${input.state}.`, { allowedActionKinds: allowed })
  }
  if (action.consequential && action.idempotencyKey && (input.completedIdempotencyKeys ?? []).includes(action.idempotencyKey)) {
    add('duplicate_consequential_action', 'This consequential action already has confirmed evidence.', { idempotencyKey: action.idempotencyKey })
  }
  if (action.kind === 'submission' && !input.readinessVerified) add('readiness_required_before_submission', 'A verified readiness report is required before submission.')
  if (action.kind === 'submission' && !input.submissionApproved) add('approval_required_before_submission', 'The exact readiness package must be approved before submission.')
  return errors
}

export function validateApplicationPlan(input: Omit<Parameters<typeof validateApplicationAction>[0], 'action'> & { actions: ProposedApplicationAction[] }) {
  const errors: ApplicationValidationError[] = []
  let state = input.state
  const seen = new Set<string>()
  for (const action of input.actions) {
    if (action.consequential && action.idempotencyKey && seen.has(action.idempotencyKey)) {
      errors.push({
        code: 'duplicate_consequential_action',
        message: 'A plan cannot repeat a consequential idempotency key.',
        actionId: action.id,
        retryable: true,
        preserveState: true,
        details: { idempotencyKey: action.idempotencyKey },
      })
    }
    if (action.idempotencyKey) seen.add(action.idempotencyKey)
    const actionErrors = validateApplicationAction({ ...input, state, action })
    errors.push(...actionErrors)
    if (!actionErrors.length && action.intendedNextState) state = action.intendedNextState
  }
  return { valid: errors.length === 0, errors, finalState: errors.length ? input.state : state }
}

export type RecoveryDecision = {
  state: ApplicationControllerState
  retryCount: number
  retryAllowed: boolean
  instruction: string
  fallback: 'MODEL_REPAIR' | 'HARNESS_FALLBACK'
}

export function recoverInvalidApplicationAction(input: {
  state: ApplicationControllerState
  error: ApplicationValidationError
  priorRetries: number
  maximumRetries?: number
}): RecoveryDecision {
  const maximumRetries = input.maximumRetries ?? 1
  const retryCount = input.priorRetries + 1
  const retryAllowed = retryCount <= maximumRetries
  return {
    state: input.state,
    retryCount,
    retryAllowed,
    instruction: retryAllowed
      ? `${input.error.message} Propose exactly one corrected action; do not restart or repeat confirmed work.`
      : `${input.error.message} The bounded model repair is exhausted; use the deterministic harness fallback from the preserved state.`,
    fallback: retryAllowed ? 'MODEL_REPAIR' : 'HARNESS_FALLBACK',
  }
}

export type AuthoritativeApplicationContext = {
  version: typeof APPLICATION_CONTROLLER_VERSION
  objective: string
  campaignId: string | null
  caseId: string | null
  state: ApplicationControllerState
  nextAction: string | null
  verifiedOpportunities: Array<{ id: string; institution: string; programmeTitle: string; officialUrl: string; applicationUrl: string | null; verificationStatus: string; confidence: number | null; fitScore: number | null }>
  unresolvedRequirements: Array<Pick<RequirementNode, 'id' | 'name' | 'status' | 'dependencyIds' | 'responsible' | 'deadline' | 'evidenceIds' | 'blocker'>>
  verifiedFacts: Array<Pick<FactResolution, 'factId' | 'value' | 'confidence' | 'provenance'>>
  artifacts: Array<{ id: string; checksum: string | null; status: string; caseId: string }>
  writer: Array<{ id: string; status: string; deadline: string | null }>
  referee: Array<{ id: string; status: string; providerId: string | null; threadId: string | null }>
  professor: Array<{ id: string; status: string; providerId: string | null; threadId: string | null }>
  gmail: Array<{ providerId: string | null; threadId: string | null; direction: string; classification: string | null }>
  checkpoint: { id: string; verified: boolean; section: string; caseId: string } | null
  approvals: Array<{ id: string; kind: string; status: string }>
  deadlines: Array<{ requirementId: string; at: string }>
}

export function buildAuthoritativeApplicationContext(input: Omit<AuthoritativeApplicationContext, 'version' | 'unresolvedRequirements' | 'verifiedFacts' | 'deadlines'> & {
  requirements: RequirementNode[]
  facts: FactResolution[]
}): AuthoritativeApplicationContext {
  const unresolvedRequirements = input.requirements
    .filter(node => node.required && !requirementIsComplete(node))
    .toSorted((left, right) => deadlineRisk(left.deadline, new Date().toISOString()) - deadlineRisk(right.deadline, new Date().toISOString()))
    .slice(0, 12)
    .map(({ id, name, status, dependencyIds, responsible, deadline, evidenceIds, blocker }) => ({ id, name, status, dependencyIds, responsible, deadline, evidenceIds, blocker }))
  const verifiedFacts = input.facts
    .filter(fact => fact.verification === 'VERIFIED')
    .slice(0, 60)
    .map(({ factId, value, confidence, provenance }) => ({ factId, value, confidence, provenance }))
  return {
    version: APPLICATION_CONTROLLER_VERSION,
    objective: input.objective,
    campaignId: input.campaignId,
    caseId: input.caseId,
    state: input.state,
    nextAction: input.nextAction,
    verifiedOpportunities: input.verifiedOpportunities.filter(opportunity => opportunity.verificationStatus === 'verified').slice(0, 12),
    unresolvedRequirements,
    verifiedFacts,
    artifacts: input.artifacts.slice(0, 30),
    writer: input.writer.slice(0, 12),
    referee: input.referee.slice(0, 12),
    professor: input.professor.slice(0, 12),
    gmail: input.gmail.slice(0, 20),
    checkpoint: input.checkpoint,
    approvals: input.approvals.slice(0, 12),
    deadlines: input.requirements
      .filter(node => node.deadline)
      .map(node => ({ requirementId: node.id, at: node.deadline! }))
      .toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at))
      .slice(0, 12),
  }
}

export function serializeAuthoritativeApplicationContext(context: AuthoritativeApplicationContext) {
  return [
    'AUTHORITATIVE_APPLICATION_CONTEXT_V2_1',
    'Use only VERIFIED applicant facts. UNRESOLVED required facts block downstream execution.',
    'The verifiedOpportunities array contains the authoritative durable opportunity IDs for the current campaign. Use those IDs exactly when creating ApplicationCases; do not invent replacements.',
    'The harness controls state advancement. NO_EVIDENCE => NO_COMPLETION.',
    JSON.stringify(context),
  ].join('\n')
}
