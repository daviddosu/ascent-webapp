import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createApplicationEngineState, planApplicationEngineStep } from './application-engine.ts'
import { applicationContinuationDecision, applicationCvLaneAlreadyPrepared, applicationResearchTargetQuantity, applicationTaskAuthorizesCaseCreation, canonicalApplicationBrowserSubmitIsPreparatory, canonicalApplicationToolAllowed, isApplicationCvRepairExhausted, isInternalApplicationRepair, toolsForCanonicalApplicationStep, type ExternalWait } from './application-runtime-policy.ts'

Deno.test('distinguishes application execution from research-only planning', () => {
  assert(applicationTaskAuthorizesCaseCreation('Apply to Stanford Physics PhD', 'Use my attached CV.'))
  assert(applicationTaskAuthorizesCaseCreation('Finish my application', 'Take it through final review.'))
  assertEquals(applicationTaskAuthorizesCaseCreation('Build an application checklist', 'Research documents and deadlines only.'), false)
  assertEquals(applicationTaskAuthorizesCaseCreation('Research Stanford admissions', 'Do not apply or start the portal.'), false)
  assertEquals(applicationResearchTargetQuantity('Find five verified programmes'), 5)
  assertEquals(applicationResearchTargetQuantity('Build me a graduate shortlist'), 3)
})

Deno.test('pre-case application work remains inside the canonical controller tool surface', () => {
  const engine = createApplicationEngineState({
    caseId: '',
    objective: 'Apply to the verified programme',
    status: 'ACTIVE',
    requirements: [],
    facts: [],
    observations: [],
    completedActionKeys: [],
    approvals: [],
    browser: { portal: null, section: null, sessionId: null, checkpointObservationId: null },
    communication: [],
  })
  const step = planApplicationEngineStep(engine)
  const research = toolsForCanonicalApplicationStep({ state: 'OPPORTUNITY_RESEARCH', step })
  assert(research.has('web_search'))
  assert(research.has('application.record_opportunity'))
  assertEquals(research.has('agent.complete'), false)
  assertEquals(research.has('application.submit'), false)

  const caseCreation = toolsForCanonicalApplicationStep({ state: 'CASE_CREATION', step })
  assertEquals([...caseCreation], ['application.create_case'])
})

Deno.test('a bounded verified research shortlist can complete without creating a case', () => {
  const engine = createApplicationEngineState({
    caseId: '',
    objective: 'Find three verified graduate programmes; do not apply.',
    status: 'COMPLETE',
    requirements: [],
    facts: [],
    observations: [],
    completedActionKeys: [],
    approvals: [],
    browser: { portal: null, section: null, sessionId: null, checkpointObservationId: null },
    communication: [],
  })
  const step = planApplicationEngineStep(engine)
  assertEquals(step.kind, 'COMPLETE')
  assertEquals([...toolsForCanonicalApplicationStep({ state: 'COMPLETE', step })], ['agent.complete'])
})

Deno.test('canonical requirement policies expose the specialised Wednesday workflows', () => {
  const execute = {
    kind: 'EXECUTE' as const,
    caseId: 'case-1',
    requirementId: 'requirement-1',
    tier: 1 as const,
    action: 'execute_primitive',
    evidenceContract: ['artifact' as const],
    idempotencyKey: 'requirement:case-1:requirement-1',
  }
  const proposal = toolsForCanonicalApplicationStep({ state: 'DOCUMENT_PREPARATION', step: execute, requirementType: 'research_proposal' })
  const fee = toolsForCanonicalApplicationStep({ state: 'DOCUMENT_PREPARATION', step: execute, requirementType: 'application_fee' })
  const supplemental = toolsForCanonicalApplicationStep({ state: 'PORTAL_EXECUTION', step: execute, requirementType: 'supplemental_question' })
  assert(canonicalApplicationToolAllowed(proposal, 'application.prepare_research_proposal'))
  assert(canonicalApplicationToolAllowed(proposal, 'application.finalize_research_proposal'))
  assert(canonicalApplicationToolAllowed(fee, 'application.coordinate_fee'))
  assert(canonicalApplicationToolAllowed(fee, 'application.execute_fee_payment'))
  assert(canonicalApplicationToolAllowed(supplemental, 'application.resolve_supplemental_questions'))
})

Deno.test('dependency-ready orchestration lanes can use safe preparation tools together', () => {
  const execute = {
    kind: 'EXECUTE' as const,
    caseId: 'case-1',
    requirementId: 'transcript-1',
    tier: 3 as const,
    action: 'execute_with_harness',
    evidenceContract: ['artifact' as const],
    idempotencyKey: 'transcript:case-1:transcript-1',
  }
  const tools = toolsForCanonicalApplicationStep({
    state: 'DOCUMENT_PREPARATION',
    step: execute,
    requirementType: 'transcript',
    orchestrationRunnableNodeTypes: ['cv', 'portal', 'faculty_intelligence'],
  })
  assert(tools.has('application.coordinate_academic_evidence'))
  assert(tools.has('application.generate_cv'))
  assert(tools.has('browser.navigate'))
  assert(tools.has('application.research_faculty'))

  const refreshTools = toolsForCanonicalApplicationStep({
    state: 'DOCUMENT_PREPARATION',
    step: execute,
    requirementType: 'transcript',
    orchestrationRunnableNodeTypes: ['programme_research'],
  })
  assert(refreshTools.has('web_search'))
  assert(refreshTools.has('application.record_evidence'))
})

Deno.test('generic browser submit cannot impersonate final application submission', () => {
  assert(canonicalApplicationBrowserSubmitIsPreparatory('Save and continue', 'Persist the education section and open the next section.'))
  assert(canonicalApplicationBrowserSubmitIsPreparatory('Request transcript', 'Send the approved transcript request to the registrar.'))
  assertEquals(canonicalApplicationBrowserSubmitIsPreparatory('Submit application', 'Send the final admission application.'), false)
  assertEquals(canonicalApplicationBrowserSubmitIsPreparatory('Continue', 'Complete the application.'), false)
})

Deno.test('the application scheduler auto-advances runnable work instead of creating a false external wait', () => {
  assertEquals(applicationContinuationDecision({
    pendingUserInputs: 0,
    requiredApprovals: 0,
    authenticationRequired: false,
    paymentRequired: false,
    externalWaits: [],
    runnableNodes: 3,
    unfinishedApplication: true,
  }), 'auto_advance')
  assertEquals(applicationContinuationDecision({
    pendingUserInputs: 1,
    requiredApprovals: 0,
    authenticationRequired: false,
    paymentRequired: false,
    externalWaits: [],
    runnableNodes: 2,
    unfinishedApplication: true,
  }), 'auto_advance')
})

Deno.test('a real provider wait remains typed and blocks only when no lane is runnable', () => {
  const wait: ExternalWait = {
    type: 'recommender',
    externalEntityId: 'referee-1',
    expectedEvent: 'recommendation_submitted',
    startedAt: '2026-08-25T12:00:00.000Z',
  }
  assertEquals(applicationContinuationDecision({
    pendingUserInputs: 0,
    requiredApprovals: 0,
    authenticationRequired: false,
    paymentRequired: false,
    externalWaits: [wait],
    runnableNodes: 0,
    unfinishedApplication: true,
}), 'waiting_external')
})

Deno.test('internal document repair is not a completed application node', () => {
  assert(isInternalApplicationRepair({ repair_required: true, diagnostics: { page_count: 2 } }))
  assertEquals(isInternalApplicationRepair({ ok: true, artifact_id: 'artifact-1' }), false)
})

Deno.test('an exhausted CV repair remains a user boundary instead of a watcher retry', () => {
  assert(isApplicationCvRepairExhausted({
    repairAttempts: 2,
    message: 'The CV remained invalid after two targeted model repairs. Fix the layout.',
  }))
  assert(isApplicationCvRepairExhausted({ explicit: true, repairAttempts: 0 }))
  assertEquals(isApplicationCvRepairExhausted({ repairAttempts: 1, message: 'The CV remained invalid after two targeted model repairs.' }), false)
})

Deno.test('a prepared CV review boundary is reused only with its durable artifact checkpoint', () => {
  assert(applicationCvLaneAlreadyPrepared({ laneParked: true, artifactId: 'artifact-cv-1' }))
  assertEquals(applicationCvLaneAlreadyPrepared({ laneParked: false, artifactId: 'artifact-cv-1' }), false)
  assertEquals(applicationCvLaneAlreadyPrepared({ laneParked: true, artifactId: '' }), false)
  assertEquals(applicationCvLaneAlreadyPrepared({ laneParked: true, artifactId: null }), false)
})
