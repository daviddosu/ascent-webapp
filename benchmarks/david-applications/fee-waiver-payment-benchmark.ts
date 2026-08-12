import {
  applyFeeWorkflowEvent,
  buildFeeWaiverRequestEmail,
  capturePaymentReceipt,
  claimPaymentAttempt,
  classifyPaymentRetry,
  createApplicationFeeRequirement,
  createApplicationFeeWorkflow,
  createPaymentAuthorization,
  duplicateChargeGuard,
  evaluateFeeWaiverEligibility,
  safePaymentHandoffPayload,
  updateFeeRequirementFromPortalAmount,
  type ApplicationFeeWorkflow,
  type FeeApplicantFact,
  type FeeSourceProvenance,
  type FeeWaiverPolicy,
} from '../../supabase/functions/_shared/application-fee-workflow'

export type FeeWaiverPaymentQualificationCase = {
  id: string
  passed: boolean
  assertions: Array<{ id: string; passed: boolean; detail: string }>
  output: Record<string, unknown>
}

export type FeeWaiverPaymentQualificationReport = {
  suiteVersion: 'david_fee_waiver_payment_qualification_v1'
  passed: boolean
  metrics: {
    cases: number
    passedCases: number
    failedAssertions: number
    typedWaiverStates: number
    typedPaymentStates: number
    noInferencePasses: number
    evidenceChecks: number
    approvalChecks: number
    duplicateChargeGuards: number
    generatedEmailExamples: number
  }
  cases: FeeWaiverPaymentQualificationCase[]
  examples: Array<{ caseId: string; output: Record<string, unknown> }>
}

const now = '2026-08-12T12:00:00.000Z'

const source: FeeSourceProvenance = {
  id: 'source:fee-guidance',
  kind: 'official_fee_guidance',
  url: 'https://admissions.example.edu/fees',
  excerpt: 'The 2027 application fee is USD 120 plus a USD 5 processing fee. A waiver route is available through the official admissions process.',
  retrievedAt: now,
  applicationCycle: '2027',
  authoritative: true,
  sourceHash: 'sha256:fee-guidance',
}

function requirement(caseId = 'case-fee') {
  const base = createApplicationFeeRequirement({ applicationCaseId: caseId, applicantId: 'benchmark-applicant', university: 'Northbridge University', programme: 'PhD Computational Physics', applicationCycle: '2027', now })
  return { ...base, feeRequired: true, feeAmount: 120, currency: 'USD', processingServiceFee: 5, totalPayable: 125, sourceProvenance: [source], paymentMethod: 'portal_hosted' as const, paymentDeadline: '2026-12-01T23:59:00.000Z', deadlineTimezone: 'UTC' }
}

function detected(caseId = 'case-fee') {
  return applyFeeWorkflowEvent(createApplicationFeeWorkflow({ requirement: requirement(caseId) }), {
    type: 'fee_detected', feeRequired: true, amount: 120, currency: 'USD', processingServiceFee: 5, paymentDeadline: '2026-12-01T23:59:00.000Z', deadlineTimezone: 'UTC', paymentMethod: 'portal_hosted', sources: [source], at: now,
  })
}

function waiverPolicy(caseId = 'case-fee'): FeeWaiverPolicy {
  return {
    id: `policy:${caseId}:2027`, applicationCaseId: caseId, applicationCycle: '2027', offered: true, category: 'need_based',
    eligibilityCriteria: [{ id: 'criterion:need', factKey: 'applicantConfirmedNeedBasedEligibility', operator: 'boolean_true', label: 'Applicant confirms the published criterion applies', required: true, sourceIds: [source.id] }],
    requiredEvidence: [], deadline: '2026-11-15T23:59:00.000Z', applicationStage: 'before_submission', requestMechanism: 'portal_form', decisionMechanism: 'portal_state', automaticApproval: false, admissionsReviewRequired: false, expectedProcessingDays: 5, applicationMaySubmitWhilePending: false, mustApproveBeforeSubmission: true, contactEmail: 'admissions@northbridge.example.edu', sources: [source], retrievedAt: now,
  }
}

function fact(caseId = 'case-fee'): FeeApplicantFact {
  return { id: `fact:${caseId}:need`, key: 'applicantConfirmedNeedBasedEligibility', value: true, verified: true, reusable: true, sensitive: true, provenance: { kind: 'user_statement', sourceIds: [], sourceAssetIds: [], confirmedAt: now } }
}

function qualificationCase(id: string, assertions: Array<{ id: string; passed: boolean; detail: string }>, output: Record<string, unknown>): FeeWaiverPaymentQualificationCase {
  return { id, passed: assertions.every(assertion => assertion.passed), assertions, output }
}

export function runFeeWaiverPaymentQualification(): FeeWaiverPaymentQualificationReport {
  const noInferencePolicy = waiverPolicy('case-no-inference')
  const noInferenceFact: FeeApplicantFact = { ...fact('case-no-inference'), id: 'fact:nationality', key: 'nationality', value: 'NG', sensitive: false, provenance: { kind: 'verified_external_source', sourceIds: ['profile'], sourceAssetIds: [], confirmedAt: now } }
  const noInferenceEvaluation = evaluateFeeWaiverEligibility(noInferencePolicy, [noInferenceFact])
  const noInference = qualificationCase('fee-waiver-no-inference', [
    { id: 'missing-explicit-fact', passed: noInferenceEvaluation.state === 'EVIDENCE_REQUIRED' && noInferenceEvaluation.missingFactKeys.includes('applicantConfirmedNeedBasedEligibility'), detail: 'Nationality does not become a hardship conclusion without an explicit verified fact.' },
  ], { state: noInferenceEvaluation.state, missingFactKeys: noInferenceEvaluation.missingFactKeys })

  let waiverWorkflow = applyFeeWorkflowEvent(detected('case-waiver'), { type: 'waiver_policy_researched', policy: waiverPolicy('case-waiver'), at: now })
  const waiverEvaluation = evaluateFeeWaiverEligibility(waiverPolicy('case-waiver'), [fact('case-waiver')])
  waiverWorkflow = applyFeeWorkflowEvent({ ...waiverWorkflow, applicantFacts: [fact('case-waiver')] }, { type: 'eligibility_resolved', evaluation: waiverEvaluation, at: now })
  waiverWorkflow = applyFeeWorkflowEvent(waiverWorkflow, { type: 'waiver_decision_received', decision: { classification: 'APPROVED', receivedAt: now, sourceEvidenceIds: ['evidence:waiver-email'], providerMessageId: 'message:waiver', providerThreadId: 'thread:waiver', commitmentDueAt: null, additionalEvidenceRequirementIds: [], waiverCode: null }, at: now })
  waiverWorkflow = applyFeeWorkflowEvent(waiverWorkflow, { type: 'waiver_result_verified', approved: true, sourceEvidenceIds: ['evidence:portal-waived'], portalFeeAmount: 0, at: now })
  const waiver = qualificationCase('fee-waiver-portal-verification', [
    { id: 'payment-not-required', passed: waiverWorkflow.requirement.paymentState === 'NOT_REQUIRED', detail: 'An admissions decision alone does not finish the waiver; portal read-back evidence clears the fee.' },
    { id: 'verification-evidence', passed: waiverWorkflow.requirement.verificationEvidenceIds.includes('evidence:portal-waived'), detail: 'The resulting portal state is attached to the fee requirement.' },
  ], { paymentState: waiverWorkflow.requirement.paymentState, waiverState: waiverWorkflow.requirement.waiverDecisionState, verificationEvidenceIds: waiverWorkflow.requirement.verificationEvidenceIds })

  let paymentWorkflow: ApplicationFeeWorkflow = applyFeeWorkflowEvent(detected('case-payment'), { type: 'waiver_policy_researched', policy: null, at: now })
  paymentWorkflow = applyFeeWorkflowEvent(paymentWorkflow, { type: 'payment_prepared', amount: 120, currency: 'USD', processingServiceFee: 5, total: 125, source: { ...source, id: 'source:portal-amount', kind: 'application_portal' }, at: now })
  const authorization = createPaymentAuthorization({ userId: 'benchmark-applicant', workflow: paymentWorkflow, reason: 'Application fee for Northbridge University', now })
  paymentWorkflow = applyFeeWorkflowEvent(paymentWorkflow, { type: 'payment_authorization_created', authorization, at: now })
  const prematureClaim = claimPaymentAttempt(paymentWorkflow, 'benchmark-run', now)
  paymentWorkflow = applyFeeWorkflowEvent(paymentWorkflow, { type: 'payment_authorization_decided', authorizationId: authorization.id, approved: true, at: now })
  const claimed = claimPaymentAttempt(paymentWorkflow, 'benchmark-run', now)
  if (claimed.claimed) paymentWorkflow = claimed.workflow
  if (paymentWorkflow.paymentAttempt) paymentWorkflow = applyFeeWorkflowEvent(paymentWorkflow, { type: 'payment_submitted', attemptId: paymentWorkflow.paymentAttempt.id, responseKnown: false, at: now })
  const ambiguousRetry = classifyPaymentRetry(paymentWorkflow.paymentAttempt)
  paymentWorkflow = applyFeeWorkflowEvent(paymentWorkflow, { type: 'payment_reconciled', observations: [{ id: 'observation:paid', applicationCaseId: 'case-payment', feeRequirementId: paymentWorkflow.requirement.id, source: 'portal', status: 'paid', verified: true, amount: 125, currency: 'USD', transactionId: 'transaction:1', receiptNumber: 'receipt:1', receiptArtifactId: null, observedAt: now, sourceEvidenceIds: ['evidence:paid'] }], at: now })
  paymentWorkflow = capturePaymentReceipt(paymentWorkflow, { id: 'receipt:evidence', applicationCaseId: 'case-payment', feeRequirementId: paymentWorkflow.requirement.id, institution: 'Northbridge University', amount: 125, currency: 'USD', transactionId: 'transaction:1', paymentDateTime: now, receiptNumber: 'receipt:1', provider: 'northbridge', portalState: 'paid', receiptArtifactId: null, evidenceSource: 'portal', checksum: null, sourceEvidenceIds: ['evidence:paid'] }, now)
  const payment = qualificationCase('fee-payment-approval-reconciliation', [
    { id: 'premature-claim-blocked', passed: !prematureClaim.claimed, detail: 'The server-side claim cannot run until the user approves the exact amount.' },
    { id: 'ambiguous-retry-blocked', passed: !ambiguousRetry.safe && ambiguousRetry.action === 'reconcile_first', detail: 'An unknown provider result is reconciled before any retry.' },
    { id: 'receipt-complete', passed: paymentWorkflow.requirement.paymentState === 'COMPLETE' && duplicateChargeGuard(paymentWorkflow).blocked, detail: 'Receipt evidence produces COMPLETE and keeps duplicate charging blocked.' },
  ], { paymentState: paymentWorkflow.requirement.paymentState, retry: ambiguousRetry, duplicateChargeGuard: duplicateChargeGuard(paymentWorkflow) })

  let changedWorkflow: ApplicationFeeWorkflow = applyFeeWorkflowEvent(detected('case-amount-change'), { type: 'waiver_policy_researched', policy: null, at: now })
  changedWorkflow = applyFeeWorkflowEvent(changedWorkflow, { type: 'payment_prepared', amount: 120, currency: 'USD', processingServiceFee: 5, total: 125, source: { ...source, id: 'source:amount-change', kind: 'application_portal' }, at: now })
  const changedAuthorization = createPaymentAuthorization({ userId: 'benchmark-applicant', workflow: changedWorkflow, reason: 'Application fee', now })
  changedWorkflow = applyFeeWorkflowEvent(changedWorkflow, { type: 'payment_authorization_created', authorization: changedAuthorization, at: now })
  const amountChanged = updateFeeRequirementFromPortalAmount(changedWorkflow, { amount: 130, currency: 'USD', processingServiceFee: 5, source: { ...source, id: 'source:new-amount', kind: 'application_portal', excerpt: 'The portal now shows USD 135.' }, at: now })
  const email = buildFeeWaiverRequestEmail({ requirement: detected('case-email').requirement, policy: waiverPolicy('case-email'), applicantName: 'Benchmark Applicant', applicantEmail: 'applicant@example.edu', eligibilityBasis: ['applicantConfirmedNeedBasedEligibility: true'], evidenceIds: ['evidence:need'], prompt: null, explanation: null })
  const amountAndEmail = qualificationCase('fee-amount-change-and-manual-email', [
    { id: 'approval-invalidated', passed: amountChanged.paymentAuthorization?.status === 'invalidated', detail: 'A changed authoritative fee snapshot invalidates the prior approval.' },
    { id: 'email-grounded', passed: Boolean(email.subject && email.bodyText && email.bodyText.includes('evidence:need')), detail: 'The manual waiver email is generated from the canonical workflow and evidence IDs.' },
    { id: 'secrets-rejected', passed: (() => { try { safePaymentHandoffPayload({ amount: 135, currency: 'USD', cardNumber: 'blocked' }); return false } catch { return true } })(), detail: 'Payment credentials are rejected at the handoff boundary.' },
  ], { authorizationState: amountChanged.paymentAuthorization?.status, subject: email.subject, bodyExcerpt: email.bodyText?.slice(0, 180) })

  const cases = [noInference, waiver, payment, amountAndEmail]
  const failedAssertions = cases.flatMap(item => item.assertions).filter(item => !item.passed).length
  return {
    suiteVersion: 'david_fee_waiver_payment_qualification_v1',
    passed: failedAssertions === 0,
    metrics: {
      cases: cases.length,
      passedCases: cases.filter(item => item.passed).length,
      failedAssertions,
      typedWaiverStates: new Set(['NOT_RESEARCHED', 'EVIDENCE_REQUIRED', waiverWorkflow.requirement.waiverDecisionState]).size,
      typedPaymentStates: new Set([waiverWorkflow.requirement.paymentState, paymentWorkflow.requirement.paymentState, amountChanged.requirement.paymentState]).size,
      noInferencePasses: noInference.assertions.filter(item => item.passed).length,
      evidenceChecks: waiver.assertions.filter(item => /evidence|payment-not-required/.test(item.id)).filter(item => item.passed).length,
      approvalChecks: payment.assertions.filter(item => /approval|ambiguous/.test(item.id)).filter(item => item.passed).length,
      duplicateChargeGuards: duplicateChargeGuard(paymentWorkflow).blocked ? 1 : 0,
      generatedEmailExamples: email.bodyText ? 1 : 0,
    },
    cases,
    examples: cases.map(item => ({ caseId: item.id, output: item.output })),
  }
}
