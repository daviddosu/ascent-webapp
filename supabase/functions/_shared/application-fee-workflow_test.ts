import { assert, assertEquals, assertFalse, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  applyFeeWorkflowEvent,
  authoritativeFeeSources,
  buildFeeWaiverRequestEmail,
  canEnterPayment,
  capturePaymentReceipt,
  claimPaymentAttempt,
  classifyPaymentRetry,
  createApplicationFeeRequirement,
  createApplicationFeeWorkflow,
  createPaymentAuthorization,
  duplicateChargeGuard,
  evaluateFeeWaiverEligibility,
  paymentApprovalMustBeInvalidated,
  planApplicationFeeWorkflow,
  safePaymentHandoffPayload,
  updateFeeRequirementFromPortalAmount,
  validateFeeWaiverEvidence,
  validateFeeWaiverPolicy,
  waiverPolicySourcesForCurrentCycle,
  type ApplicationFeeWorkflow,
  type FeeApplicantFact,
  type FeeSourceProvenance,
  type FeeWaiverPolicy,
} from './application-fee-workflow.ts'

const now = '2026-08-12T12:00:00.000Z'

const source: FeeSourceProvenance = {
  id: 'source:fee-guidance',
  kind: 'official_fee_guidance',
  url: 'https://admissions.example.edu/fees',
  excerpt: 'The application fee is USD 120 for the 2027 cycle. Applicants may request a fee waiver through the admissions form.',
  retrievedAt: now,
  applicationCycle: '2027',
  authoritative: true,
  sourceHash: 'sha256:fee-guidance',
}

function requirement(overrides: Record<string, unknown> = {}) {
  return createApplicationFeeRequirement({
    applicationCaseId: 'case-1',
    applicantId: 'applicant-1',
    university: 'Northbridge University',
    programme: 'PhD Computational Physics',
    applicationCycle: '2027',
    now,
    ...overrides,
  })
}

function policy(overrides: Partial<FeeWaiverPolicy> = {}): FeeWaiverPolicy {
  return {
    id: 'policy:fee-waiver:2027',
    applicationCaseId: 'case-1',
    applicationCycle: '2027',
    offered: true,
    category: 'need_based',
    eligibilityCriteria: [{ id: 'criterion:need', factKey: 'applicantConfirmedNeedBasedEligibility', operator: 'boolean_true', label: 'Applicant confirms the published need-based criterion applies', required: true, sourceIds: [source.id] }],
    requiredEvidence: [],
    deadline: '2026-10-01T23:59:00.000Z',
    applicationStage: 'before_submission',
    requestMechanism: 'portal_form',
    decisionMechanism: 'portal_state',
    automaticApproval: false,
    admissionsReviewRequired: false,
    expectedProcessingDays: 5,
    applicationMaySubmitWhilePending: false,
    mustApproveBeforeSubmission: true,
    contactEmail: 'admissions@northbridge.example.edu',
    sources: [source],
    retrievedAt: now,
    ...overrides,
  }
}

function detectedWorkflow(): ApplicationFeeWorkflow {
  const initial = createApplicationFeeWorkflow({ requirement: requirement() })
  return applyFeeWorkflowEvent(initial, {
    type: 'fee_detected',
    feeRequired: true,
    amount: 120,
    currency: 'USD',
    processingServiceFee: 5,
    paymentDeadline: '2026-12-01T23:59:00.000Z',
    deadlineTimezone: 'UTC',
    paymentMethod: 'portal_hosted',
    sources: [source],
    at: now,
  })
}

function paymentReadyWorkflow(): ApplicationFeeWorkflow {
  return applyFeeWorkflowEvent(detectedWorkflow(), { type: 'waiver_policy_researched', policy: null, at: now })
}

function waiverEvidence() {
  return {
    id: 'evidence:need-document',
    applicationCaseId: 'case-1',
    applicantId: 'applicant-1',
    requirementId: 'application-fee:case-1',
    category: 'need_based' as const,
    evidenceRequirementId: 'evidence:criterion',
    assetId: 'asset:proof',
    checksum: 'sha256:proof',
    mimeType: 'application/pdf',
    readable: true,
    correctApplicant: true,
    correctProgramme: true,
    issueDate: '2026-07-01',
    sourceIds: [source.id],
    sensitive: true,
    verifiedAt: now,
  }
}

Deno.test('keeps fee amount, currency, cycle, and authoritative provenance typed', () => {
  const stale = { ...source, id: 'source:stale', applicationCycle: '2026' }
  assertEquals(authoritativeFeeSources([stale, source], '2027').map(item => item.id), [source.id])
  assertEquals(detectedWorkflow().requirement.totalPayable, 125)
  assertEquals(detectedWorkflow().requirement.currency, 'USD')
  assertEquals(detectedWorkflow().requirement.paymentState, 'BLOCKED_ON_WAIVER')
})

Deno.test('does not infer hardship from unrelated facts and exposes a structured question', () => {
  const needPolicy = policy({ category: 'financial_hardship' })
  const facts: FeeApplicantFact[] = [{ id: 'fact:nationality', key: 'nationality', value: 'NG', verified: true, reusable: true, sensitive: false, provenance: { kind: 'verified_external_source', sourceIds: ['profile'], sourceAssetIds: [], confirmedAt: now } }]
  const evaluation = evaluateFeeWaiverEligibility(needPolicy, facts)
  assertEquals(evaluation.state, 'EVIDENCE_REQUIRED')
  assertEquals(evaluation.missingFactKeys, ['applicantConfirmedNeedBasedEligibility'])
  const workflow = applyFeeWorkflowEvent(detectedWorkflow(), { type: 'waiver_policy_researched', policy: needPolicy, at: now })
  const step = planApplicationFeeWorkflow({ ...workflow, applicantFacts: facts })
  assertEquals(step.action, 'user_input')
  assertEquals(step.interaction?.kind, 'single_choice')
  assert(step.interaction?.sensitive)
})

Deno.test('requires current-cycle authoritative waiver policy and validates evidence scope', () => {
  const wrongCycle = policy({ applicationCycle: '2026', sources: [{ ...source, applicationCycle: '2026' }] })
  const validation = validateFeeWaiverPolicy(wrongCycle, requirement())
  assert(validation.issues.includes('wrong_application_cycle'))
  assertEquals(waiverPolicySourcesForCurrentCycle(wrongCycle, requirement()), [])
  const evidenceValidation = validateFeeWaiverEvidence({ ...waiverEvidence(), applicationCaseId: 'case-other' }, requirement(), policy({ requiredEvidence: [{ id: 'evidence:criterion', label: 'Proof', acceptedTypes: ['application/pdf'], required: true, issueDateRequired: true, maxAgeDays: 365, sensitive: true, sourceIds: [source.id] }] }))
  assertFalse(evidenceValidation.valid)
  assert(evidenceValidation.issues.includes('wrong_application_case'))
})

Deno.test('moves a legitimate waiver from eligibility through evidence, request, and portal verification', () => {
  const requiredEvidence = { id: 'evidence:criterion', label: 'Need statement', acceptedTypes: ['application/pdf'], required: true, issueDateRequired: true, maxAgeDays: 365, sensitive: true, sourceIds: [source.id] }
  const waiver = policy({ requiredEvidence: [requiredEvidence] })
  let workflow = applyFeeWorkflowEvent(detectedWorkflow(), { type: 'waiver_policy_researched', policy: waiver, at: now })
  const fact: FeeApplicantFact = { id: 'fact:need', key: 'applicantConfirmedNeedBasedEligibility', value: true, verified: true, reusable: true, sensitive: true, provenance: { kind: 'user_statement', sourceIds: [], sourceAssetIds: [], confirmedAt: now } }
  const evaluation = evaluateFeeWaiverEligibility(waiver, [fact])
  assertEquals(evaluation.state, 'ELIGIBLE')
  workflow = applyFeeWorkflowEvent({ ...workflow, applicantFacts: [fact] }, { type: 'eligibility_resolved', evaluation, at: now })
  workflow = applyFeeWorkflowEvent(workflow, { type: 'evidence_added', evidence: waiverEvidence(), reused: true, at: now })
  assertEquals(workflow.requirement.waiverDecisionState, 'REQUEST_READY')
  assertEquals(planApplicationFeeWorkflow(workflow).action, 'submit_waiver')
  const request = {
    id: 'waiver-request:case-1', applicationCaseId: 'case-1', requirementId: workflow.requirement.id, applicantId: 'applicant-1', category: 'need_based' as const, submissionMethod: 'portal_form' as const, portalFormId: 'form-1', admissionsEmail: null, subject: null, bodyText: null, bodyHtml: null, evidenceIds: [waiverEvidence().id], idempotencyKey: 'waiver-request:case-1:v1', submittedAt: now, providerMessageId: null, providerThreadId: null,
  }
  workflow = applyFeeWorkflowEvent(workflow, { type: 'waiver_request_submitted', request, at: now })
  workflow = applyFeeWorkflowEvent(workflow, { type: 'waiver_decision_received', decision: { classification: 'APPROVED', receivedAt: now, sourceEvidenceIds: ['evidence:email'], providerMessageId: 'message-1', providerThreadId: 'thread-1', commitmentDueAt: null, additionalEvidenceRequirementIds: [], waiverCode: null }, at: now })
  assertEquals(workflow.requirement.paymentState, 'BLOCKED_ON_WAIVER')
  workflow = applyFeeWorkflowEvent(workflow, { type: 'waiver_result_verified', approved: true, sourceEvidenceIds: ['evidence:portal'], portalFeeAmount: 0, at: now })
  assertEquals(workflow.requirement.paymentState, 'NOT_REQUIRED')
  assert(workflow.requirement.verificationEvidenceIds.includes('evidence:portal'))
  assertEquals(workflow.metrics.waiverSavings, 125)
})

Deno.test('requires one exact payment approval, prevents premature claims, and reconciles ambiguity before receipt completion', () => {
  let workflow = paymentReadyWorkflow()
  assertEquals(canEnterPayment(workflow).allowed, true)
  const sourceAtPayment = { ...source, id: 'source:payment', kind: 'application_portal' as const, excerpt: 'The portal currently shows USD 125 payable.' }
  workflow = applyFeeWorkflowEvent(workflow, { type: 'payment_prepared', amount: 120, currency: 'USD', processingServiceFee: 5, total: 125, source: sourceAtPayment, at: now })
  const authorization = createPaymentAuthorization({ userId: 'user-1', workflow, reason: 'Application fee for Northbridge', now })
  workflow = applyFeeWorkflowEvent(workflow, { type: 'payment_authorization_created', authorization, at: now })
  assertEquals(claimPaymentAttempt(workflow, 'run-1', now).reason, 'payment_authorization_required')
  workflow = applyFeeWorkflowEvent(workflow, { type: 'payment_authorization_decided', authorizationId: authorization.id, approved: true, at: now })
  assertEquals(workflow.paymentAuthorization?.status, 'approved')
  const attempt = claimPaymentAttempt(workflow, 'run-1', now)
  if (!attempt.claimed) throw new Error(attempt.reason)
  workflow = attempt.workflow
  workflow = applyFeeWorkflowEvent(workflow, { type: 'payment_submitted', attemptId: workflow.paymentAttempt!.id, responseKnown: false, at: now })
  assertEquals(classifyPaymentRetry(workflow.paymentAttempt).safe, false)
  assertEquals(workflow.requirement.paymentState, 'AMBIGUOUS')
  workflow = applyFeeWorkflowEvent(workflow, { type: 'payment_reconciled', observations: [{ id: 'obs:paid', applicationCaseId: 'case-1', feeRequirementId: workflow.requirement.id, source: 'portal', status: 'paid', verified: true, amount: 125, currency: 'USD', transactionId: 'txn-1', receiptNumber: 'receipt-1', receiptArtifactId: null, observedAt: now, sourceEvidenceIds: ['evidence:portal-paid'] }], at: now })
  assertEquals(workflow.requirement.paymentState, 'SUCCEEDED')
  workflow = capturePaymentReceipt(workflow, { id: 'evidence:receipt', applicationCaseId: 'case-1', feeRequirementId: workflow.requirement.id, institution: 'Northbridge University', amount: 125, currency: 'USD', transactionId: 'txn-1', paymentDateTime: now, receiptNumber: 'receipt-1', provider: 'northbridge', portalState: 'paid', receiptArtifactId: null, evidenceSource: 'portal', checksum: null, sourceEvidenceIds: ['evidence:portal-paid'] }, now)
  assertEquals(workflow.requirement.paymentState, 'COMPLETE')
  assertEquals(duplicateChargeGuard(workflow).blocked, true)
})

Deno.test('invalidates a stale approval when the authoritative portal amount changes and never accepts payment secrets', () => {
  let workflow = paymentReadyWorkflow()
  workflow = applyFeeWorkflowEvent(workflow, { type: 'payment_prepared', amount: 120, currency: 'USD', processingServiceFee: 5, total: 125, source, at: now })
  const authorization = createPaymentAuthorization({ userId: 'user-1', workflow, reason: 'Application fee', now })
  workflow = applyFeeWorkflowEvent(workflow, { type: 'payment_authorization_created', authorization, at: now })
  const changed = updateFeeRequirementFromPortalAmount(workflow, { amount: 130, currency: 'USD', processingServiceFee: 5, source: { ...source, id: 'source:changed', kind: 'application_portal', excerpt: 'The portal now shows USD 135 payable.' }, at: now })
  assertEquals(changed.paymentAuthorization?.status, 'invalidated')
  assert(paymentApprovalMustBeInvalidated(workflow, { amount: 130, currency: 'USD', processingServiceFee: 5, total: 135 }))
  assertThrows(() => safePaymentHandoffPayload({ applicationCaseId: 'case-1', amount: 135, currency: 'USD', cardNumber: '4111111111111111' }))
})

Deno.test('surfaces a deadline decision while a waiver is pending and prevents a stale payment approval after waiver success', () => {
  let workflow = applyFeeWorkflowEvent(detectedWorkflow(), { type: 'waiver_policy_researched', policy: policy({ deadline: '2026-12-05T23:59:00.000Z' }), at: now })
  workflow = applyFeeWorkflowEvent(workflow, { type: 'waiver_decision_received', decision: { classification: 'PENDING', receivedAt: now, sourceEvidenceIds: ['evidence:pending'], providerMessageId: 'message:pending', providerThreadId: 'thread:pending', commitmentDueAt: '2026-12-05T23:59:00.000Z', additionalEvidenceRequirementIds: [], waiverCode: null }, at: now })
  const deadlineStep = planApplicationFeeWorkflow(workflow, now)
  assertEquals(deadlineStep.action, 'user_input')
  assertEquals(deadlineStep.interaction?.options.map(option => option.value), ['pay_now', 'keep_waiting'])
  workflow = applyFeeWorkflowEvent(workflow, { type: 'payment_deadline_decision', choice: 'pay_now', at: now })
  assertEquals(planApplicationFeeWorkflow(workflow, now).action, 'prepare_payment')

  let approved = paymentReadyWorkflow()
  approved = applyFeeWorkflowEvent(approved, { type: 'payment_prepared', amount: 120, currency: 'USD', processingServiceFee: 5, total: 125, source, at: now })
  const authorization = createPaymentAuthorization({ userId: 'user-1', workflow: approved, reason: 'Application fee', now })
  approved = applyFeeWorkflowEvent(approved, { type: 'payment_authorization_created', authorization, at: now })
  approved = applyFeeWorkflowEvent(approved, { type: 'waiver_result_verified', approved: true, sourceEvidenceIds: ['evidence:portal-waived'], portalFeeAmount: 0, at: now })
  assertEquals(approved.requirement.paymentState, 'NOT_REQUIRED')
  assertEquals(approved.paymentAuthorization?.status, 'invalidated')
})

Deno.test('renders a manual waiver request without inventing unverified applicant facts', () => {
  const email = buildFeeWaiverRequestEmail({ requirement: detectedWorkflow().requirement, policy: policy(), applicantName: 'Applicant One', applicantEmail: 'applicant@example.com', eligibilityBasis: ['applicantConfirmedNeedBasedEligibility: true'], evidenceIds: ['evidence:need'], prompt: null, explanation: null })
  const subject = email.subject ?? ''
  const bodyText = email.bodyText ?? ''
  assert(subject.includes('Application fee waiver request'))
  assert(bodyText.includes('Northbridge University'))
  assert(bodyText.includes('evidence:need'))
  assertFalse(bodyText.includes('nationality'))
})
