/**
 * The single deterministic owner of graduate-application progress.
 *
 * David is deliberately outside this state machine. The engine may request one
 * typed semantic decision, but only code can select requirements, execute a
 * transition, accept evidence, or mark work complete.
 */

import {
  requirementDependenciesSatisfied,
  requirementIsComplete,
  validateRequirementGraph,
  type FactResolution,
  type RequirementNode,
} from './application-controller.ts'
import type { ApplicationQuestion } from './application-questions.ts'

export const APPLICATION_ENGINE_VERSION = 'david-application-engine@3' as const

export const applicationSemanticFunctions = [
  'evaluate_programme_eligibility',
  'resolve_requirement_conflict',
  'map_portal_field',
  'evaluate_professor_fit',
  'interpret_email_reply',
  'evaluate_writer_draft',
  'classify_application_message',
  'evaluate_reference_requirement',
] as const
export type ApplicationSemanticFunction = typeof applicationSemanticFunctions[number]

export type RequirementType =
  | 'profile_fact' | 'eligibility' | 'official_requirement' | 'deadline' | 'funding'
  | 'document' | 'writer' | 'research_proposal' | 'referee' | 'professor' | 'communication' | 'portal_field'
  | 'portal_section' | 'supplemental_question' | 'artifact_upload' | 'transcript' | 'degree_certificate' | 'proof_of_graduation'
  | 'credential_evaluation' | 'english_language_test' | 'admissions_test' | 'academic_evidence'
  | 'approval' | 'submission' | 'post_submission' | 'calendar' | 'application_fee' | 'fee_waiver' | 'payment'

export type ResolutionTier = 0 | 1 | 2 | 3 | 4 | 5

export type RetryState = {
  attempts: number
  maximumAttempts: number
  lastFailure: string | null
  nextAttemptAt: string | null
  escalated: boolean
}

export type EngineRequirement = RequirementNode & {
  type: RequirementType
  source: { id: string; url?: string | null; authority?: 'official' | 'applicant' | 'provider' | 'generated' }
  evidenceContract: ObservationKind[]
  retry: RetryState
  requiredFactIds: string[]
  resolutionTier: ResolutionTier | null
  waitUntil?: string | null
}

type ObservationBase = {
  id: string
  caseId: string
  requirementId: string
  kind: ObservationKind
  verified: boolean
  evidenceIds: string[]
  observedAt: string
}

export type WebObservation = ObservationBase & {
  kind: 'web'
  sourceUrl: string
  authoritative: boolean
  excerpts: Array<{ evidenceId: string; text: string }>
}

export type GmailObservation = ObservationBase & {
  kind: 'gmail'
  providerMessageId: string
  providerThreadId: string
  expectedRecipient: string | null
  actualRecipients: string[]
  direction: 'inbound' | 'outbound'
}

export type PortalObservation = ObservationBase & {
  kind: 'portal'
  portal: string
  section: string
  persistedValues: Record<string, unknown>
  readBackValues: Record<string, unknown>
  saveConfirmation: string
  sessionId: string
}

export type ArtifactObservation = ObservationBase & {
  kind: 'artifact'
  artifactId: string
  checksum: string
  approved: boolean
  sourceFactIds: string[]
  portalConfirmation?: string | null
}

export type CalendarObservation = ObservationBase & {
  kind: 'calendar'
  providerEventId: string
  expectedAttendees: string[]
  actualAttendees: string[]
}

export type SubmissionObservation = ObservationBase & {
  kind: 'submission'
  applicationId: string
  confirmation: string
}

export type ObservationKind = 'web' | 'gmail' | 'portal' | 'artifact' | 'calendar' | 'submission'
export type ApplicationObservation = WebObservation | GmailObservation | PortalObservation | ArtifactObservation | CalendarObservation | SubmissionObservation

export type SemanticDecision = {
  schemaVersion: 1
  function: ApplicationSemanticFunction
  caseId: string
  requirementId: string
  decision: string
  confidence: 'high' | 'medium' | 'low'
  evidenceIds: string[]
  factIds: string[]
  rationale: string
}

export type SemanticRequest = {
  schemaVersion: 1
  function: ApplicationSemanticFunction
  case: { id: string; objective: string }
  requirement: Pick<EngineRequirement, 'id' | 'type' | 'name' | 'deadline' | 'source' | 'evidenceContract'>
  verifiedFacts: Array<Pick<FactResolution, 'factId' | 'value' | 'provenance'>>
  sources: Array<{ id: string; kind: ObservationKind; evidenceIds: string[] }>
  allowedDecisions: string[]
  successCriteria: string[]
}

export type PortalExecutionContract = {
  caseId: string
  requirementId: string
  portal: string
  section: string
  fields: Array<{ name: string; factId: string; expectedValue: unknown }>
  artifacts: Array<{ artifactId: string; checksum: string }>
  successConditions: string[]
  saveConditions: string[]
  evidenceConditions: string[]
}

export type ApplicationEngineState = {
  version: typeof APPLICATION_ENGINE_VERSION
  caseId: string
  objective: string
  status: 'ACTIVE' | 'WAITING' | 'BLOCKED' | 'READY_FOR_SUBMISSION' | 'SUBMITTED' | 'COMPLETE'
  requirements: EngineRequirement[]
  facts: FactResolution[]
  observations: ApplicationObservation[]
  completedActionKeys: string[]
  approvals: Array<{ id: string; kind: string; status: 'pending' | 'approved' | 'rejected'; artifactIds: string[] }>
  browser: { portal: string | null; section: string | null; sessionId: string | null; checkpointObservationId: string | null }
  communication: Array<{ requirementId: string; providerMessageId: string; providerThreadId: string; state: string }>
  questions?: ApplicationQuestion[]
  tierCounts: Record<ResolutionTier, number>
  userInterventions: number
}

export type EngineStep =
  | { kind: 'CONTROLLER'; caseId: string; action: 'continue_application_controller' }
  | { kind: 'COMPLETE'; caseId: string }
  | { kind: 'WAIT'; caseId: string; requirementId: string; until: string | null }
  | { kind: 'USER_HANDOFF'; caseId: string; requirementId: string; missingFactIds: string[]; tier: 5 }
  | { kind: 'SEMANTIC_DECISION'; caseId: string; requirementId: string; tier: 2 | 4; request: SemanticRequest }
  | { kind: 'SUPPLEMENTAL_QUESTION'; caseId: string; requirementId: string; questionId: string; action: 'discover' | 'resolve' | 'generate' | 'delegate_writer' | 'write' | 'verify' | 'user_decision'; question: ApplicationQuestion | null }
  | { kind: 'EXECUTE'; caseId: string; requirementId: string; tier: 0 | 1 | 3; action: string; evidenceContract: ObservationKind[]; idempotencyKey: string }
  | { kind: 'VERIFY'; caseId: string; requirementId: string; evidenceContract: ObservationKind[] }
  | { kind: 'BLOCKED'; caseId: string; reason: string }

const semanticFunctionByType: Partial<Record<RequirementType, ApplicationSemanticFunction>> = {
  eligibility: 'evaluate_programme_eligibility',
  official_requirement: 'resolve_requirement_conflict',
  portal_field: 'map_portal_field',
  professor: 'evaluate_professor_fit',
  communication: 'interpret_email_reply',
  writer: 'evaluate_writer_draft',
  referee: 'evaluate_reference_requirement',
}

export const applicationSemanticAllowedDecisions: Record<ApplicationSemanticFunction, string[]> = {
  evaluate_programme_eligibility: ['eligible', 'ineligible', 'insufficient_evidence'],
  resolve_requirement_conflict: ['source_a', 'source_b', 'unresolved'],
  map_portal_field: ['map', 'leave_blank', 'needs_fact'],
  evaluate_professor_fit: ['strong_fit', 'possible_fit', 'not_fit', 'affiliation_unverified'],
  interpret_email_reply: ['accepted', 'declined', 'question', 'revision_requested', 'delayed', 'unrelated'],
  evaluate_writer_draft: ['accepted', 'revision_required', 'wrong_institution', 'unsupported_claims'],
  classify_application_message: ['otp', 'confirmation', 'request', 'status', 'unrelated'],
  evaluate_reference_requirement: ['satisfied', 'replacement_required', 'waiting', 'unresolved'],
}

function time(value: string | null | undefined) {
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

export function createApplicationEngineState(input: Omit<ApplicationEngineState, 'version' | 'tierCounts' | 'userInterventions'> & { tierCounts?: Partial<Record<ResolutionTier, number>>; userInterventions?: number }): ApplicationEngineState {
  return {
    ...input,
    version: APPLICATION_ENGINE_VERSION,
    tierCounts: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, ...input.tierCounts },
    userInterventions: input.userInterventions ?? 0,
  }
}

export function selectNextUnresolvedRequirement(state: ApplicationEngineState, now = new Date().toISOString()) {
  const issues = validateRequirementGraph(state.requirements)
  if (issues.length) return { requirement: null, blocked: `Invalid requirement graph: ${issues[0]!.code}` }
  const candidates = state.requirements.filter(requirement =>
    requirement.required && !requirementIsComplete(requirement) && requirementDependenciesSatisfied(requirement, state.requirements),
  )
  candidates.sort((left, right) => {
    const leftReady = time(left.waitUntil) <= time(now) ? 0 : 1
    const rightReady = time(right.waitUntil) <= time(now) ? 0 : 1
    const leftDependents = state.requirements.filter(item => item.dependencyIds.includes(left.id)).length
    const rightDependents = state.requirements.filter(item => item.dependencyIds.includes(right.id)).length
    return leftReady - rightReady || time(left.deadline) - time(right.deadline) || rightDependents - leftDependents || left.id.localeCompare(right.id)
  })
  return { requirement: candidates[0] ?? null, blocked: null }
}

function relatedVerifiedFacts(state: ApplicationEngineState, requirement: EngineRequirement) {
  const ids = new Set(requirement.requiredFactIds)
  return state.facts.filter(fact => ids.has(fact.factId) && fact.verification === 'VERIFIED')
}

export function semanticRequestFor(state: ApplicationEngineState, requirement: EngineRequirement, functionName = semanticFunctionByType[requirement.type] ?? 'classify_application_message'): SemanticRequest {
  const sourceIds = new Set([requirement.source.id, ...requirement.evidenceIds])
  return {
    schemaVersion: 1,
    function: functionName,
    case: { id: state.caseId, objective: state.objective },
    requirement: {
      id: requirement.id, type: requirement.type, name: requirement.name, deadline: requirement.deadline,
      source: requirement.source, evidenceContract: requirement.evidenceContract,
    },
    verifiedFacts: relatedVerifiedFacts(state, requirement).map(({ factId, value, provenance }) => ({ factId, value, provenance })),
    sources: state.observations.filter(item => sourceIds.has(item.id) || item.evidenceIds.some(id => sourceIds.has(id))).map(item => ({ id: item.id, kind: item.kind, evidenceIds: item.evidenceIds })),
    allowedDecisions: applicationSemanticAllowedDecisions[functionName],
    successCriteria: ['Use only supplied VERIFIED facts.', 'Cite supplied evidence IDs.', 'Decide only the target requirement.'],
  }
}

export function planApplicationEngineStep(state: ApplicationEngineState, now = new Date().toISOString()): EngineStep {
  // Before a case exists, the application controller owns campaign research,
  // shortlist approval, and case creation. An empty case requirement graph is
  // therefore an active controller step, never a vacuous completion.
  if (!state.caseId) {
    if (state.status === 'BLOCKED') return { kind: 'BLOCKED', caseId: '', reason: 'Application controller is blocked before case creation.' }
    if (state.status === 'COMPLETE') return { kind: 'COMPLETE', caseId: '' }
    return { kind: 'CONTROLLER', caseId: '', action: 'continue_application_controller' }
  }
  if (state.status === 'COMPLETE') return { kind: 'COMPLETE', caseId: state.caseId }
  const selected = selectNextUnresolvedRequirement(state, now)
  if (selected.blocked) return { kind: 'BLOCKED', caseId: state.caseId, reason: selected.blocked }
  const requirement = selected.requirement
  if (!requirement) {
    const submission = state.observations.find(item => item.kind === 'submission' && item.caseId === state.caseId && item.verified)
    return submission || !state.requirements.some(item => item.type === 'submission')
      ? { kind: 'COMPLETE', caseId: state.caseId }
      : { kind: 'BLOCKED', caseId: state.caseId, reason: 'Submission has no verified resulting-state evidence.' }
  }
  if (requirement.status === 'WAITING' && time(requirement.waitUntil) > time(now)) return { kind: 'WAIT', caseId: state.caseId, requirementId: requirement.id, until: requirement.waitUntil ?? null }
  if (!requirement.evidenceContract.length) return { kind: 'BLOCKED', caseId: state.caseId, reason: `Requirement ${requirement.id} has no evidence contract.` }
  if (requirement.type === 'supplemental_question') {
    const question = state.questions?.find(item => item.id === requirement.id || item.questionKey === requirement.source.id || item.id === requirement.source.id) ?? null
    if (!question) return { kind: 'SUPPLEMENTAL_QUESTION', caseId: state.caseId, requirementId: requirement.id, questionId: requirement.source.id, action: 'discover', question: null }
    if (question.status === 'awaiting_user') return { kind: 'SUPPLEMENTAL_QUESTION', caseId: state.caseId, requirementId: requirement.id, questionId: question.id, action: 'user_decision', question }
    if (question.status === 'awaiting_writer') return { kind: 'SUPPLEMENTAL_QUESTION', caseId: state.caseId, requirementId: requirement.id, questionId: question.id, action: 'delegate_writer', question }
    if (question.status === 'ready_to_answer' || question.status === 'classified') return { kind: 'SUPPLEMENTAL_QUESTION', caseId: state.caseId, requirementId: requirement.id, questionId: question.id, action: 'resolve', question }
    if (question.status === 'ready_to_write' || question.status === 'generated' || question.status === 'quality_checked' || question.status === 'consistency_checked') return { kind: 'SUPPLEMENTAL_QUESTION', caseId: state.caseId, requirementId: requirement.id, questionId: question.id, action: 'write', question }
    if (question.status === 'written' || question.status === 'saved') return { kind: 'SUPPLEMENTAL_QUESTION', caseId: state.caseId, requirementId: requirement.id, questionId: question.id, action: 'verify', question }
    if (question.status === 'failed') {
      const retryState = question.retryState
      if ((retryState?.attempts ?? 0) >= (retryState?.maximumAttempts ?? 3)) return { kind: 'BLOCKED', caseId: state.caseId, reason: `Supplemental question ${question.id} exhausted its bounded retries: ${question.lastError ?? 'answer gate failed.'}` }
      return { kind: 'SUPPLEMENTAL_QUESTION', caseId: state.caseId, requirementId: requirement.id, questionId: question.id, action: 'resolve', question }
    }
  }
  const missingFacts = requirement.requiredFactIds.filter(id => state.facts.find(fact => fact.factId === id)?.verification !== 'VERIFIED')
  if (missingFacts.length) {
    const searched = requirement.retry.attempts > 0
    return searched
      ? { kind: 'USER_HANDOFF', caseId: state.caseId, requirementId: requirement.id, missingFactIds: missingFacts, tier: 5 }
      : { kind: 'EXECUTE', caseId: state.caseId, requirementId: requirement.id, tier: 0, action: 'search_verified_context', evidenceContract: ['artifact'], idempotencyKey: `fact-search:${state.caseId}:${requirement.id}` }
  }
  const existing = state.observations.filter(item => item.requirementId === requirement.id && item.verified)
  const semanticEvidence = state.observations.filter(item => item.verified && (
    item.requirementId === requirement.id ||
    item.id === requirement.source.id ||
    item.evidenceIds.includes(requirement.source.id)
  ))
  const semanticFunction = semanticFunctionByType[requirement.type]
  // Reference requirements begin with verified applicant referee facts, not
  // provider correspondence. Route that first procedural step through the
  // referee harness; semantic reference interpretation becomes meaningful
  // only after a real provider observation exists.
  const verifiedRefereeFacts = requirement.type === 'referee' && state.facts.some(fact =>
    fact.verification === 'VERIFIED' && /^profile:referees(?:\[|$)/i.test(fact.factId),
  )
  // A generic official-requirements node has no conflict to resolve until an
  // authoritative observation exists. Route the empty-evidence case to the
  // research harness first; otherwise the model is asked to choose between
  // sources that the controller has not actually observed.
  const hasEvidenceForSemanticReview = requirement.type !== 'official_requirement' || semanticEvidence.length > 0
  if (semanticFunction && hasEvidenceForSemanticReview && !verifiedRefereeFacts && !semanticEvidence.some(item => item.evidenceIds.includes(`semantic:${semanticFunction}`))) {
    return { kind: 'SEMANTIC_DECISION', caseId: state.caseId, requirementId: requirement.id, tier: requirement.retry.attempts >= 1 ? 4 : 2, request: semanticRequestFor(state, requirement, semanticFunction) }
  }
  if (requirement.evidenceContract.every(kind => existing.some(item => item.kind === kind))) return { kind: 'VERIFY', caseId: state.caseId, requirementId: requirement.id, evidenceContract: requirement.evidenceContract }
  const harness = requirement.retry.attempts > 0 || ['portal_section', 'artifact_upload', 'referee', 'submission'].includes(requirement.type)
  return {
    kind: 'EXECUTE', caseId: state.caseId, requirementId: requirement.id, tier: harness ? 3 : 1,
    action: harness ? 'execute_with_harness' : 'execute_primitive', evidenceContract: requirement.evidenceContract,
    idempotencyKey: `${requirement.type}:${state.caseId}:${requirement.id}`,
  }
}

export function validateSemanticDecision(state: ApplicationEngineState, request: SemanticRequest, decision: SemanticDecision) {
  const defects: string[] = []
  if (decision.schemaVersion !== 1) defects.push('schema_version')
  if (decision.function !== request.function) defects.push('wrong_function')
  if (decision.caseId !== state.caseId || decision.caseId !== request.case.id) defects.push('wrong_application_case')
  if (decision.requirementId !== request.requirement.id) defects.push('wrong_requirement')
  if (!request.allowedDecisions.includes(decision.decision)) defects.push('decision_not_allowed')
  if (!decision.evidenceIds.length || decision.evidenceIds.some(id => !request.sources.some(source => source.id === id || source.evidenceIds.includes(id)))) defects.push('evidence_invalid')
  const allowedFacts = new Set(request.verifiedFacts.map(fact => fact.factId))
  if (decision.factIds.some(id => !allowedFacts.has(id))) defects.push('fact_unverified')
  if (!decision.rationale.trim()) defects.push('rationale_missing')
  return { valid: defects.length === 0, defects }
}

function observationMatches(observation: ApplicationObservation, requirement: EngineRequirement) {
  if (!observation.verified || observation.caseId !== requirement.caseId || observation.requirementId !== requirement.id || !observation.evidenceIds.length) return false
  if (observation.kind === 'web') return observation.authoritative && Boolean(observation.sourceUrl)
  if (observation.kind === 'gmail') return Boolean(observation.providerMessageId && observation.providerThreadId) && (!observation.expectedRecipient || observation.actualRecipients.includes(observation.expectedRecipient))
  if (observation.kind === 'portal') return Boolean(observation.saveConfirmation && observation.sessionId) && JSON.stringify(observation.persistedValues) === JSON.stringify(observation.readBackValues)
  if (observation.kind === 'artifact') return observation.approved && Boolean(observation.artifactId && observation.checksum) && requirement.requiredFactIds.every(id => observation.sourceFactIds.includes(id))
  if (observation.kind === 'calendar') return Boolean(observation.providerEventId) && observation.expectedAttendees.every(item => observation.actualAttendees.includes(item))
  return Boolean(observation.applicationId && observation.confirmation)
}

export function applyApplicationObservation(state: ApplicationEngineState, observation: ApplicationObservation, tier: ResolutionTier): ApplicationEngineState {
  const requirement = state.requirements.find(item => item.id === observation.requirementId)
  if (!requirement || observation.caseId !== state.caseId || !observationMatches(observation, requirement)) return state
  const observations = state.observations.some(item => item.id === observation.id) ? state.observations : [...state.observations, observation]
  const scoped = observations.filter(item => item.requirementId === requirement.id && observationMatches(item, requirement))
  const complete = requirement.evidenceContract.length > 0 && requirement.evidenceContract.every(kind => scoped.some(item => item.kind === kind))
  const requirements = state.requirements.map(item => item.id === requirement.id
    ? { ...item, status: complete ? 'VERIFIED' as const : 'IN_PROGRESS' as const, evidenceIds: [...new Set([...item.evidenceIds, ...observation.evidenceIds])], resolutionTier: tier }
    : item)
  return { ...state, observations, requirements, tierCounts: { ...state.tierCounts, [tier]: state.tierCounts[tier] + 1 } }
}

/**
 * Commit a VERIFY step after the engine has independently checked every
 * resulting-state observation in the requirement's evidence contract.
 * Observation ingestion and verification are separate so a provider response
 * cannot mark a requirement complete merely by existing in the event log.
 */
export function verifyApplicationRequirement(state: ApplicationEngineState, requirementId: string): ApplicationEngineState {
  const requirement = state.requirements.find(item => item.id === requirementId)
  if (!requirement || requirement.caseId !== state.caseId) return state
  const scoped = state.observations.filter(item => item.requirementId === requirement.id && observationMatches(item, requirement))
  const complete = requirement.evidenceContract.length > 0 && requirement.evidenceContract.every(kind => scoped.some(item => item.kind === kind))
  if (!complete) return state
  return {
    ...state,
    requirements: state.requirements.map(item => item.id === requirement.id ? { ...item, status: 'VERIFIED' as const, evidenceIds: [...new Set(scoped.flatMap(observation => observation.evidenceIds))] } : item),
  }
}

export function recordApplicationFailure(state: ApplicationEngineState, requirementId: string, failure: string, now = new Date().toISOString()) {
  return {
    ...state,
    requirements: state.requirements.map(item => item.id === requirementId ? {
      ...item,
      status: item.retry.attempts + 1 >= item.retry.maximumAttempts ? 'BLOCKED' as const : item.status,
      retry: { ...item.retry, attempts: item.retry.attempts + 1, lastFailure: failure, nextAttemptAt: now, escalated: item.retry.attempts >= 0 },
    } : item),
  }
}

export function claimApplicationAction(state: ApplicationEngineState, key: string) {
  return state.completedActionKeys.includes(key)
    ? { claimed: false, state }
    : { claimed: true, state: { ...state, completedActionKeys: [...state.completedActionKeys, key] } }
}

export function verifyPortalExecutionContract(contract: PortalExecutionContract, observation: PortalObservation, facts: FactResolution[], artifacts: ArtifactObservation[]) {
  if (observation.caseId !== contract.caseId || observation.requirementId !== contract.requirementId || observation.portal !== contract.portal || observation.section !== contract.section) return false
  if (!observationMatches(observation, { id: contract.requirementId, caseId: contract.caseId } as EngineRequirement)) return false
  if (!contract.fields.every(field => facts.some(fact => fact.factId === field.factId && fact.verification === 'VERIFIED' && JSON.stringify(fact.value) === JSON.stringify(field.expectedValue)) && JSON.stringify(observation.readBackValues[field.name]) === JSON.stringify(field.expectedValue))) return false
  return contract.artifacts.every(expected => artifacts.some(item => item.caseId === contract.caseId && item.artifactId === expected.artifactId && item.checksum === expected.checksum && item.approved && item.verified))
}

export function applicationEngineDirective(state: ApplicationEngineState, step = planApplicationEngineStep(state)) {
  if (step.kind === 'CONTROLLER') {
    return [
      'APPLICATION_ENGINE_DIRECTIVE_V3',
      'The application controller owns pre-case campaign progress. This is an active controller step, not completion. Continue with the exposed campaign research, approval, or case-creation tool; never call agent.complete for an empty case requirement graph.',
      JSON.stringify({ engineVersion: state.version, caseId: state.caseId, step }),
    ].join('\n')
  }
  return ['APPLICATION_ENGINE_DIRECTIVE_V3', 'The engine owns progress. Execute only this step; never create a long-horizon plan.', JSON.stringify({ engineVersion: state.version, caseId: state.caseId, step })].join('\n')
}
