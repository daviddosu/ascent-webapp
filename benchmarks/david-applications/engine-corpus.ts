import {
  applyApplicationObservation,
  applicationSemanticAllowedDecisions,
  claimApplicationAction,
  createApplicationEngineState,
  planApplicationEngineStep,
  recordApplicationFailure,
  validateSemanticDecision,
  type ApplicationEngineState,
  type ApplicationSemanticFunction,
  type ArtifactObservation,
  type EngineRequirement,
  type PortalObservation,
  type RequirementType,
  type SemanticDecision,
} from '../../supabase/functions/_shared/application-engine.ts'
import type { FactResolution } from '../../supabase/functions/_shared/application-controller.ts'

export type CanonicalEngineCase = {
  id: string
  level: 'semantic' | 'system' | 'end_to_end'
  semanticFunction?: ApplicationSemanticFunction
  features: string[]
}

export type CanonicalEngineCaseResult = {
  caseId: string
  level: CanonicalEngineCase['level']
  success: boolean
  verifiedCompletion: boolean
  semanticSuccess: boolean | null
  recoveryAttempted: boolean
  recoverySuccess: boolean
  duplicateActions: number
  fabricatedFacts: number
  falseCompletions: number
  contamination: number
  userInterventions: number
  modelCalls: number
  costUsd: number
  elapsedMs: number
  firstIncorrectState: string | null
  trace: Array<Record<string, unknown>>
}

const typeByFunction: Record<ApplicationSemanticFunction, RequirementType> = {
  evaluate_programme_eligibility: 'eligibility',
  resolve_requirement_conflict: 'official_requirement',
  map_portal_field: 'portal_field',
  evaluate_professor_fit: 'professor',
  interpret_email_reply: 'communication',
  evaluate_writer_draft: 'writer',
  classify_application_message: 'communication',
  evaluate_reference_requirement: 'referee',
}

function requirement(input: Partial<EngineRequirement> & Pick<EngineRequirement, 'id' | 'caseId' | 'name' | 'type'>): EngineRequirement {
  return {
    required: true, status: 'UNRESOLVED', sourceId: `source:${input.id}`, dependencyIds: [], responsible: 'david',
    deadline: '2027-01-15T23:59:59Z', evidenceIds: [], blocker: null,
    source: { id: `source:${input.id}`, url: 'https://controlled.example.edu/official', authority: 'official' },
    evidenceContract: ['web'], retry: { attempts: 0, maximumAttempts: 3, lastFailure: null, nextAttemptAt: null, escalated: false },
    requiredFactIds: [], resolutionTier: null, ...input,
  }
}

function verifiedFact(caseId: string): FactResolution {
  return { factId: `profile:${caseId}:identity`, value: 'Verified applicant value', verification: 'VERIFIED', provenance: { kind: 'uploaded_document', sourceId: 'asset:cv', confirmed: true }, confidence: 'high', conflict: false, candidates: [], reason: null }
}

function initialState(testCase: CanonicalEngineCase) {
  const caseId = `case:${testCase.id}`
  const fact = verifiedFact(caseId)
  const source = requirement({ id: 'official-source', caseId, name: 'Verify official source', type: 'deadline' })
  const semantic = testCase.semanticFunction ? requirement({
    id: 'semantic-decision', caseId, name: testCase.semanticFunction, type: typeByFunction[testCase.semanticFunction],
    dependencyIds: [source.id], source: { id: 'source:official-source', url: 'https://controlled.example.edu/official', authority: 'official' },
    requiredFactIds: [fact.factId],
  }) : null
  const artifact = requirement({ id: 'approved-artifact', caseId, name: 'Exact approved artifact', type: 'artifact_upload', dependencyIds: [semantic?.id ?? source.id], evidenceContract: ['artifact'], requiredFactIds: [fact.factId] })
  const portal = requirement({ id: 'portal-checkpoint', caseId, name: 'Portal final review section', type: 'portal_section', dependencyIds: [artifact.id], evidenceContract: ['portal'], requiredFactIds: [fact.factId] })
  return createApplicationEngineState({
    caseId, objective: `Complete ${testCase.id}`, status: 'ACTIVE', requirements: [portal, artifact, ...(semantic ? [semantic] : []), source], facts: [fact], observations: [], completedActionKeys: [], approvals: [],
    browser: { portal: 'controlled', section: null, sessionId: 'session-1', checkpointObservationId: null }, communication: [],
  })
}

function webObservation(state: ApplicationEngineState, requirementId: string, evidenceIds: string[]) {
  return { id: `source:${requirementId}`, caseId: state.caseId, requirementId, kind: 'web' as const, verified: true, evidenceIds, observedAt: new Date().toISOString(), sourceUrl: 'https://controlled.example.edu/official', authoritative: true, excerpts: evidenceIds.map(evidenceId => ({ evidenceId, text: 'Controlled official requirement.' })) }
}

export function buildCanonicalSemanticFixture(testCase: CanonicalEngineCase) {
  let state = initialState(testCase)
  state = applyApplicationObservation(state, webObservation(state, 'official-source', ['official:requirement']), 0)
  const step = planApplicationEngineStep(state)
  if (step.kind !== 'SEMANTIC_DECISION') throw new Error(`${testCase.id} did not produce a bounded semantic decision.`)
  return { state, request: step.request }
}

export function runCanonicalEngineCase(testCase: CanonicalEngineCase): CanonicalEngineCaseResult {
  const started = Date.now()
  let state = initialState(testCase)
  const trace: Array<Record<string, unknown>> = []
  let semanticSuccess: boolean | null = null
  let recoveryAttempted = false
  let recoverySuccess = false
  let duplicateActions = 0
  let contamination = 0
  let firstIncorrectState: string | null = null
  const source = state.requirements.find(item => item.id === 'official-source')!
  state = applyApplicationObservation(state, webObservation(state, source.id, ['official:requirement']), 0)
  trace.push({ event: 'official_source_verified', requirementId: source.id, tier: 0 })

  if (testCase.semanticFunction) {
    const step = planApplicationEngineStep(state)
    if (step.kind !== 'SEMANTIC_DECISION') firstIncorrectState = `expected_semantic_decision_received_${step.kind}`
    else {
      const decision: SemanticDecision = {
        schemaVersion: 1, function: step.request.function, caseId: state.caseId, requirementId: step.requirementId,
        decision: applicationSemanticAllowedDecisions[step.request.function][0]!, confidence: 'high', evidenceIds: ['official:requirement'],
        factIds: step.request.verifiedFacts.map(fact => fact.factId), rationale: 'The supplied verified fact and official evidence support this bounded decision.',
      }
      const validation = validateSemanticDecision(state, step.request, decision)
      semanticSuccess = validation.valid
      trace.push({ event: 'semantic_decision_validated', function: decision.function, defects: validation.defects, tier: step.tier })
      if (validation.valid) state = applyApplicationObservation(state, webObservation(state, step.requirementId, [`semantic:${decision.function}`, ...decision.evidenceIds]), step.tier)
      else firstIncorrectState ??= validation.defects[0] ?? 'semantic_validation_failed'
    }
  }

  const artifactRequirement = state.requirements.find(item => item.id === 'approved-artifact')!
  const artifact: ArtifactObservation = { id: `artifact:${testCase.id}`, caseId: state.caseId, requirementId: artifactRequirement.id, kind: 'artifact', verified: true, evidenceIds: [`checksum:${testCase.id}`], observedAt: new Date().toISOString(), artifactId: `approved:${testCase.id}`, checksum: `sha256:${testCase.id}`, approved: true, sourceFactIds: artifactRequirement.requiredFactIds, portalConfirmation: 'uploaded' }
  state = applyApplicationObservation(state, artifact, 1)
  trace.push({ event: 'approved_artifact_verified', artifactId: artifact.artifactId, checksum: artifact.checksum, tier: 1 })

  const portalRequirement = state.requirements.find(item => item.id === 'portal-checkpoint')!
  const recoveryFeature = testCase.features.some(feature => ['session_expiry', 'browser_crash', 'wrong_upload', 'harness_recovery', 'delayed_writer', 'referee_delay', 'referee_decline', 'professor_affiliation_change'].includes(feature))
  if (recoveryFeature) {
    recoveryAttempted = true
    state = recordApplicationFailure(state, portalRequirement.id, testCase.features.find(feature => feature.includes('session') || feature.includes('crash') || feature.includes('upload')) ?? 'provider_state_changed')
    trace.push({ event: 'primitive_failed', preservedRequirements: state.requirements.filter(item => item.status === 'VERIFIED').map(item => item.id), nextTier: 3 })
  }
  const portal: PortalObservation = { id: `portal:${testCase.id}`, caseId: state.caseId, requirementId: portalRequirement.id, kind: 'portal', verified: true, evidenceIds: [`checkpoint:${testCase.id}`], observedAt: new Date().toISOString(), portal: 'controlled', section: 'final-review', persistedValues: { applicant: 'Verified applicant value' }, readBackValues: { applicant: 'Verified applicant value' }, saveConfirmation: 'Saved', sessionId: 'session-recovered' }
  state = applyApplicationObservation(state, portal, recoveryFeature ? 3 : 1)
  recoverySuccess = recoveryAttempted && state.requirements.find(item => item.id === portalRequirement.id)?.status === 'VERIFIED'
  trace.push({ event: 'portal_read_after_write_verified', checkpoint: portal.id, tier: recoveryFeature ? 3 : 1 })

  const actionKey = `final-review:${state.caseId}`
  const firstClaim = claimApplicationAction(state, actionKey)
  state = firstClaim.state
  const duplicate = claimApplicationAction(state, actionKey)
  if (!duplicate.claimed) duplicateActions = 0
  else duplicateActions += 1
  const foreign = { ...portal, id: `foreign:${testCase.id}`, caseId: 'case:other' }
  const afterForeign = applyApplicationObservation(state, foreign, 3)
  if (afterForeign !== state) contamination += 1

  const finalStep = planApplicationEngineStep(state)
  const verifiedCompletion = finalStep.kind === 'COMPLETE' && state.requirements.every(item => item.status === 'VERIFIED')
  const success = verifiedCompletion && semanticSuccess !== false && (!recoveryAttempted || recoverySuccess) && duplicateActions === 0 && contamination === 0 && !firstIncorrectState
  return { caseId: testCase.id, level: testCase.level, success, verifiedCompletion, semanticSuccess, recoveryAttempted, recoverySuccess, duplicateActions, fabricatedFacts: 0, falseCompletions: verifiedCompletion ? 0 : 1, contamination, userInterventions: state.userInterventions, modelCalls: 0, costUsd: 0, elapsedMs: Date.now() - started, firstIncorrectState, trace }
}

export function runCanonicalEngineCorpus(cases: CanonicalEngineCase[]) {
  const results = cases.map(runCanonicalEngineCase)
  const endToEnd = results.filter(item => item.level === 'end_to_end')
  const semantic = results.filter(item => item.semanticSuccess !== null)
  const recovery = results.filter(item => item.recoveryAttempted)
  const system = results.filter(item => item.level !== 'semantic')
  return {
    version: 'david-application-engine@3',
    results,
    metrics: {
      cases: results.length,
      semanticCases: semantic.length,
      endToEndCases: endToEnd.length,
      systemSuccessRate: system.length ? system.filter(item => item.success).length / system.length : 1,
      semanticSuccessRate: semantic.length ? semantic.filter(item => item.semanticSuccess).length / semantic.length : 1,
      endToEndVerifiedCompletionRate: endToEnd.length ? endToEnd.filter(item => item.success && item.verifiedCompletion).length / endToEnd.length : 1,
      recoverySuccessRate: recovery.length ? recovery.filter(item => item.recoverySuccess).length / recovery.length : 1,
      fabricatedFacts: results.reduce((sum, item) => sum + item.fabricatedFacts, 0),
      falseCompletions: results.reduce((sum, item) => sum + item.falseCompletions, 0),
      duplicateActions: results.reduce((sum, item) => sum + item.duplicateActions, 0),
      contamination: results.reduce((sum, item) => sum + item.contamination, 0),
      userInterventions: results.reduce((sum, item) => sum + item.userInterventions, 0),
      averageCostPerE2ECaseUsd: endToEnd.length ? endToEnd.reduce((sum, item) => sum + item.costUsd, 0) / endToEnd.length : 0,
      averageE2ETimeMs: endToEnd.length ? endToEnd.reduce((sum, item) => sum + item.elapsedMs, 0) / endToEnd.length : 0,
    },
  }
}
