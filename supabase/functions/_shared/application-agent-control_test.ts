import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  addApplicationResourceUsage,
  applicationActionElapsedMs,
  applicationFailureCategory,
  applicationProjectionRefreshNeeded,
  buildApplicationTurnAdmission,
  deriveApplicationRecoveryState,
  validateApplicationRecoverySlice,
  validateApplicationTurnAdmission,
} from './application-agent-control.ts'

function admission(overrides: Record<string, unknown> = {}) {
  return buildApplicationTurnAdmission({
    taskId: 'task-1',
    objective: 'Apply to the MSc Computer Science programme',
    description: 'Prepare the graduate-school application for the MSc Computer Science programme.',
    applicationCaseId: 'case-1',
    applicationCaseIds: ['case-1', 'case-2'],
    activeTargetKey: 'course-a',
    activeTargetLabel: 'MSc Computer Science at Example University',
    caseRequired: true,
    activeSpecialistId: 'david',
    controllerState: 'DOCUMENT_PREPARATION',
    engineStep: 'EXECUTE',
    currentLane: 'cv',
    currentOperation: { nodeId: 'cv', title: 'Prepare the tailored CV', owner: 'david' },
    allowedTools: ['application.generate_cv', 'application.update_requirement'],
    verifiedFactIds: ['profile:name'],
    evidenceIds: ['evidence-cv'],
    ...overrides,
  })
}

Deno.test('admits one scoped application operation and exposes reusable state', () => {
  const result = admission()
  assertEquals(result.decision, 'allow')
  assertEquals(result.scope.domain, 'graduate_application')
  assert(result.workingSet.reuse.some(item => item.includes('authoritative application controller')))
  assert(result.workingSet.excluded.some(item => item.includes('standalone work')))
  assertEquals(result.scope.applicationCaseIds, ['case-1', 'case-2'])
  assertEquals(result.scope.activeTargetKey, 'course-a')
  assertEquals(result.workingSet.activeTargetLabel, 'MSc Computer Science at Example University')
  assertEquals(validateApplicationTurnAdmission(result, { name: 'application.generate_cv', arguments: { application_case_id: 'case-1' } }), { allowed: true })
})

Deno.test('fails closed for a case mismatch, final browser submit, and empty objective', () => {
  const result = admission({ allowedTools: ['browser.submit'], currentOperation: { title: 'Save the portal section' } })
  assertEquals(validateApplicationTurnAdmission(result, { name: 'browser.submit', arguments: { application_case_id: 'case-2', expected_effect: 'save and continue' } }).allowed, false)
  assertEquals(validateApplicationTurnAdmission(result, { name: 'browser.submit', arguments: { application_case_id: 'case-1', expected_effect: 'final application submission' } }), {
    allowed: false,
    code: 'application_final_submit_requires_canonical_tool',
    message: 'Final application submission must use application.submit after the exact package, checkpoint, durable claim, and approval are re-verified.',
  })
  const outOfScope = admission({ objective: '', description: '' })
  assertEquals(outOfScope.decision, 'reject')
  assertEquals(outOfScope.reasonCode, 'graduate_application_scope_required')
})

Deno.test('keeps a user boundary visible while admitting independent application work', () => {
  const result = admission({ pendingUserInputs: ['Attach the transcript'], workAvailable: true })
  assertEquals(result.decision, 'allow')
  assertEquals(result.pendingBoundary.kind, 'user')
  assertEquals(result.pendingBoundary.canContinueIndependently, true)
})

Deno.test('detects unsafe recovery contradictions before another model or provider turn', () => {
  const invalid = validateApplicationRecoverySlice({
    runId: 'run-1',
    objective: 'Apply to the MSc Computer Science programme',
    description: 'Prepare the graduate-school application.',
    runStatus: 'running',
    currentStep: 2,
    applicationCaseId: 'case-1',
    contextCaseId: 'case-1',
    activeSpecialistId: 'david',
    actions: [
      { id: 'a-1', toolName: 'application.submit', modelCallId: 'call-1', idempotencyKey: 'submit:case-1', status: 'succeeded', providerActionId: null },
      { id: 'a-2', toolName: 'application.submit', modelCallId: 'call-1', idempotencyKey: 'submit:case-1', status: 'succeeded', providerActionId: 'provider-1' },
    ],
  })
  assertEquals(invalid.valid, false)
  assert(invalid.issues.includes('duplicate_model_call:call-1'))
  assert(invalid.issues.includes('duplicate_idempotency_key:submit:case-1'))
  assert(invalid.issues.includes('provider_confirmation_missing:application.submit'))
  assertEquals(deriveApplicationRecoveryState({
    runId: 'run-1', objective: 'Apply to the MSc Computer Science programme', runStatus: 'running', currentStep: 2,
    activeSpecialistId: 'david', actions: [{ id: 'a-3', status: 'running', toolName: 'application.observe' }],
  }), 'resume_action')
})

Deno.test('allows a scheduler target to advance after a persisted wait boundary', () => {
  const recovered = validateApplicationRecoverySlice({
    runId: 'run-1',
    objective: 'Apply to the MSc Computer Science programme',
    description: 'Prepare the graduate-school application.',
    runStatus: 'planning',
    currentStep: 3,
    applicationCaseId: 'case-1',
    contextCaseId: 'case-1',
    activeTargetKey: 'next-requirement',
    activeSpecialistId: 'david',
    admissionAnchor: {
      run_id: 'run-1',
      application_case_id: 'case-1',
      active_target_key: 'previous-requirement',
      current_step: 3,
      decision: 'wait',
    },
  })
  assertEquals(recovered.valid, true)
})

Deno.test('ignores an abandoned open action from an earlier completed step', () => {
  const recovered = validateApplicationRecoverySlice({
    runId: 'run-1',
    objective: 'Apply to the MSc Computer Science programme',
    runStatus: 'planning',
    currentStep: 4,
    applicationCaseId: 'case-1',
    contextCaseId: 'case-1',
    activeSpecialistId: 'david',
    actions: [
      { id: 'old', stepIndex: 2, status: 'running', toolName: 'application.coordinate_fee' },
      { id: 'current', stepIndex: 4, status: 'running', toolName: 'browser.navigate' },
    ],
  })
  assertEquals(recovered.valid, true)
  assertEquals(recovered.actionId, 'current')
})

Deno.test('accumulates observed model usage without making it part of workflow truth', () => {
  assertEquals(addApplicationResourceUsage({ modelCalls: 2, inputTokens: 100 }, { modelCalls: 1, inputTokens: 50, retries: 1 }), {
    schemaVersion: 1,
    modelCalls: 3,
    inputTokens: 150,
    cachedInputTokens: 0,
    outputTokens: 0,
    providerCalls: 0,
    browserOperations: 0,
    retries: 1,
    webSearchCalls: 0,
    modelLatencyMs: 0,
    lastModelCallAt: null,
  })
  assertEquals(admission({ resourceUsage: { outputTokens: 32_000 } }).reasonCode, 'application_output_budget_exhausted')
})

Deno.test('refreshes a stale applicant-document projection only once', () => {
  const interaction = {
    id: 'academic:case-1:transcript:attachment',
    kind: 'attachment_request',
    requirementId: 'transcript',
  }
  const input = {
    objective: 'Apply to the Harvard Physics PhD programme',
    description: '',
    status: 'needs_context',
    errorCode: 'academic_evidence_progress_detail',
    interaction,
    pendingInputs: [],
  }
  assertEquals(applicationProjectionRefreshNeeded(input), true)
  assertEquals(applicationProjectionRefreshNeeded({
    ...input,
    lastRefreshedInteractionId: interaction.id,
  }), false)
  assertEquals(applicationProjectionRefreshNeeded({
    ...input,
    pendingInputs: [{ requirementId: 'transcript', status: 'active' }],
  }), false)
})

Deno.test('classifies application failures without leaking high-cardinality detail', () => {
  assertEquals(applicationFailureCategory('browser_retry_exhausted', 'browser.upload'), 'browser_execution')
  assertEquals(applicationFailureCategory('application_cv_compilation_failed'), 'document_processing')
  assertEquals(applicationFailureCategory('research_provider_retry_exhausted', 'application.discover_programmes'), 'programme_research')
  assertEquals(applicationFailureCategory('model_configuration_invalid'), 'model_execution')
  assertEquals(applicationFailureCategory('unknown_state'), 'workflow_state')
  assertEquals(applicationActionElapsedMs('2026-09-20T12:00:00.000Z', Date.parse('2026-09-20T12:00:01.250Z')), 1_250)
  assertEquals(applicationActionElapsedMs('not-a-date'), null)
})
