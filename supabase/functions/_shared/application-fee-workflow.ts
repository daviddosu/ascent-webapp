/**
 * Canonical application-fee lifecycle.
 *
 * This module is deliberately provider-neutral. It owns the typed state and
 * the legal transitions; portal workers, Roon, the approval layer, and the
 * campaign projection only supply observations or execute the next bounded
 * step. A fee amount or a provider acknowledgement is never completion by
 * itself.
 */

export const APPLICATION_FEE_WORKFLOW_VERSION = 'application-fee-waiver-payment@1' as const

export const feeWaiverStates = [
  'NOT_RESEARCHED',
  'NO_WAIVER_AVAILABLE',
  'WAIVER_AVAILABLE',
  'POTENTIALLY_ELIGIBLE',
  'ELIGIBLE',
  'NOT_ELIGIBLE',
  'EVIDENCE_REQUIRED',
  'REQUEST_READY',
  'AWAITING_USER_EVIDENCE',
  'REQUEST_SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'DENIED',
  'EXPIRED',
  'WITHDRAWN',
  'NOT_NEEDED',
] as const
export type FeeWaiverState = typeof feeWaiverStates[number]

export const paymentStates = [
  'NOT_REQUIRED',
  'BLOCKED_ON_WAIVER',
  'READY',
  'AWAITING_USER_APPROVAL',
  'APPROVED',
  'PAYMENT_HANDOFF_REQUIRED',
  'PROCESSING',
  'AMBIGUOUS',
  'SUCCEEDED',
  'FAILED',
  'DECLINED',
  'CANCELLED',
  'RECONCILIATION_REQUIRED',
  'REFUND_PENDING',
  'REFUNDED',
  'COMPLETE',
] as const
export type ApplicationFeePaymentState = typeof paymentStates[number]

export const feePaymentStages = [
  'APPLICATION',
  'DETECT_APPLICATION_FEE',
  'DETECT_WAIVER_OPTIONS',
  'DETERMINE_APPLICANT_ELIGIBILITY',
  'GATHER_REUSE_EVIDENCE',
  'CLAIM_REQUEST_WAIVER',
  'MONITOR_WAIVER_DECISION',
  'VERIFY_WAIVER_RESULT',
  'PREPARE_PAYMENT',
  'PAYMENT_APPROVAL',
  'SECURE_PAYMENT_HANDOFF',
  'VERIFY_PAYMENT',
  'CAPTURE_RECEIPT',
  'UPDATE_APPLICATION_REQUIREMENT',
  'COMPLETE',
] as const
export type ApplicationFeePaymentStage = typeof feePaymentStages[number]

export const feeWaiverTypes = [
  'financial_hardship',
  'need_based',
  'country_or_geographic',
  'institutional_partnership',
  'eligible_programme',
  'prior_university_programme',
  'recruitment_event',
  'graduate_fair',
  'scholarship_pathway',
  'departmental',
  'admissions_discretion',
  'campaign_promotion',
  'official_code',
  'other',
] as const
export type FeeWaiverType = typeof feeWaiverTypes[number]

export const feePaymentMethods = [
  'portal_hosted',
  'provider_hosted',
  'bank_transfer',
  'card_tokenized',
  'other',
  'unknown',
] as const
export type FeePaymentMethod = typeof feePaymentMethods[number]

export const feeWaiverSubmissionMethods = ['portal_form', 'email_admissions', 'code_entry', 'automatic', 'other'] as const
export type FeeWaiverSubmissionMethod = typeof feeWaiverSubmissionMethods[number]

export const feeWaiverReplyClassifications = [
  'APPROVED',
  'DENIED',
  'PENDING',
  'NEEDS_DOCUMENT',
  'NEEDS_EXPLANATION',
  'USE_PORTAL_FORM',
  'CODE_ISSUED',
  'NOT_ELIGIBLE',
  'CONTACT_OTHER_OFFICE',
  'OTHER',
] as const
export type FeeWaiverReplyClassification = typeof feeWaiverReplyClassifications[number]

export const feeRiskStates = ['NONE', 'WATCH', 'ELEVATED', 'CRITICAL'] as const
export type FeeRiskState = typeof feeRiskStates[number]

export type FeeSourceKind =
  | 'programme_admissions_page'
  | 'graduate_admissions_page'
  | 'official_fee_guidance'
  | 'official_waiver_guidance'
  | 'application_portal'
  | 'admissions_email'
  | 'payment_provider'
  | 'receipt'
  | 'other'

export type FeeSourceProvenance = {
  id: string
  kind: FeeSourceKind
  url: string | null
  excerpt: string
  retrievedAt: string
  applicationCycle: string
  authoritative: boolean
  sourceHash: string | null
}

export type FeeWaiverEvidenceRequirement = {
  id: string
  label: string
  acceptedTypes: string[]
  required: boolean
  issueDateRequired: boolean
  maxAgeDays: number | null
  sensitive: boolean
  sourceIds: string[]
}

export type FeeWaiverEligibilityOperator = 'present' | 'equals' | 'one_of' | 'contains' | 'boolean_true' | 'boolean_false'

export type FeeWaiverEligibilityCriterion = {
  id: string
  factKey: string
  operator: FeeWaiverEligibilityOperator
  expectedValue?: string | number | boolean | null
  expectedValues?: Array<string | number | boolean>
  label: string
  required: boolean
  sourceIds: string[]
}

export type FeeWaiverPolicy = {
  id: string
  applicationCaseId: string
  applicationCycle: string
  offered: boolean
  category: FeeWaiverType | null
  eligibilityCriteria: FeeWaiverEligibilityCriterion[]
  requiredEvidence: FeeWaiverEvidenceRequirement[]
  deadline: string | null
  applicationStage: string | null
  requestMechanism: FeeWaiverSubmissionMethod | null
  decisionMechanism: 'automatic' | 'admissions_review' | 'portal_state' | 'unknown'
  automaticApproval: boolean
  admissionsReviewRequired: boolean
  expectedProcessingDays: number | null
  applicationMaySubmitWhilePending: boolean | null
  mustApproveBeforeSubmission: boolean | null
  contactEmail: string | null
  sources: FeeSourceProvenance[]
  retrievedAt: string
}

export type FeeApplicantFact = {
  id: string
  key: string
  value: unknown
  verified: boolean
  reusable: boolean
  sensitive: boolean
  provenance: {
    kind: 'user_statement' | 'uploaded_document' | 'verified_external_source'
    sourceIds: string[]
    sourceAssetIds: string[]
    confirmedAt: string | null
  }
}

export type FeeWaiverEvidence = {
  id: string
  applicationCaseId: string
  applicantId: string
  requirementId: string
  category: FeeWaiverType
  evidenceRequirementId: string
  assetId: string
  checksum: string
  mimeType: string
  readable: boolean
  correctApplicant: boolean
  correctProgramme: boolean
  issueDate: string | null
  sourceIds: string[]
  sensitive: boolean
  verifiedAt: string | null
}

export type ApplicationFeeRequirement = {
  id: string
  applicationCaseId: string
  applicantId: string
  university: string
  programme: string
  applicationCycle: string
  feeRequired: boolean | null
  feeAmount: number | null
  currency: string | null
  processingServiceFee: number | null
  totalPayable: number | null
  paymentDeadline: string | null
  deadlineTimezone: string | null
  paymentStage: ApplicationFeePaymentStage
  paymentMethod: FeePaymentMethod | null
  waiverAvailability: 'unknown' | 'none' | 'available' | 'automatic' | 'conditional' | 'manual'
  waiverType: FeeWaiverType | null
  waiverEligibilityState: FeeWaiverState
  waiverEvidenceRequirements: FeeWaiverEvidenceRequirement[]
  waiverSubmissionMethod: FeeWaiverSubmissionMethod | null
  waiverDeadline: string | null
  waiverDecisionState: FeeWaiverState
  waiverCode: string | null
  paymentState: ApplicationFeePaymentState
  providerPortalTransactionId: string | null
  receiptArtifactId: string | null
  verificationEvidenceIds: string[]
  blocker: string | null
  riskState: FeeRiskState
  sourceProvenance: FeeSourceProvenance[]
  amountRetrievedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export type FeeWaiverRequest = {
  id: string
  applicationCaseId: string
  requirementId: string
  applicantId: string
  category: FeeWaiverType
  submissionMethod: FeeWaiverSubmissionMethod
  portalFormId: string | null
  admissionsEmail: string | null
  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  evidenceIds: string[]
  idempotencyKey: string
  submittedAt: string | null
  providerMessageId: string | null
  providerThreadId: string | null
}

export type FeeWaiverDecision = {
  classification: FeeWaiverReplyClassification
  receivedAt: string
  sourceEvidenceIds: string[]
  providerMessageId: string | null
  providerThreadId: string | null
  commitmentDueAt: string | null
  additionalEvidenceRequirementIds: string[]
  waiverCode: string | null
}

export type PaymentAuthorization = {
  id: string
  userId: string
  applicationCaseId: string
  feeRequirementId: string
  merchant: string
  amount: number
  currency: string
  maximumAuthorizedAmount: number
  reason: string
  authorizedAt: string
  expiresAt: string
  idempotencyKey: string
  status: 'pending' | 'approved' | 'invalidated' | 'consumed' | 'cancelled'
  requirementVersion: number
}

export type ApplicationFeePaymentEvidence = {
  id: string
  applicationCaseId: string
  feeRequirementId: string
  institution: string
  amount: number
  currency: string
  transactionId: string | null
  paymentDateTime: string
  receiptNumber: string | null
  provider: string | null
  portalState: 'paid' | 'fee_cleared' | 'submitted_without_fee' | 'unknown'
  receiptArtifactId: string | null
  evidenceSource: 'portal' | 'provider' | 'gmail' | 'bank_return' | 'user_handoff'
  checksum: string | null
  sourceEvidenceIds: string[]
}

export type FeePaymentObservation = {
  id: string
  applicationCaseId: string
  feeRequirementId: string
  source: 'portal' | 'provider' | 'gmail' | 'bank_return'
  status: 'paid' | 'unpaid' | 'pending' | 'declined' | 'unknown'
  verified: boolean
  amount: number | null
  currency: string | null
  transactionId: string | null
  receiptNumber: string | null
  receiptArtifactId: string | null
  observedAt: string
  sourceEvidenceIds: string[]
}

export type FeePaymentAttempt = {
  id: string
  applicationCaseId: string
  feeRequirementId: string
  authorizationId: string
  idempotencyKey: string
  state: 'CLAIMED' | 'SUBMITTED' | 'AMBIGUOUS' | 'SUCCEEDED' | 'FAILED' | 'DECLINED' | 'CANCELLED'
  providerTransactionId: string | null
  claimedAt: string
  submittedAt: string | null
  completedAt: string | null
  lockOwner: string | null
}

export type FeeAuditEvent = {
  id: string
  applicationCaseId: string
  feeRequirementId: string
  type: string
  at: string
  idempotencyKey: string
  nonSensitiveData: Record<string, unknown>
}

export type FeeWorkflowMetrics = {
  feesDetected: number
  waiverOpportunitiesDiscovered: number
  waiverEligibilityAutoResolved: number
  evidenceReused: number
  attachmentRequests: number
  structuredQuestions: number
  waiverApprovalsRequested: number
  paymentApprovals: number
  securePaymentHandoffs: number
  rareFreeTextInputs: number
  waiverSavings: number
  duplicateChargesPrevented: number
  autonomousReconciliations: number
}

export type ApplicationFeeWorkflow = {
  version: typeof APPLICATION_FEE_WORKFLOW_VERSION
  requirement: ApplicationFeeRequirement
  policy: FeeWaiverPolicy | null
  applicantFacts: FeeApplicantFact[]
  waiverEvidence: FeeWaiverEvidence[]
  waiverRequest: FeeWaiverRequest | null
  waiverDecision: FeeWaiverDecision | null
  paymentAuthorization: PaymentAuthorization | null
  paymentAttempt: FeePaymentAttempt | null
  paymentObservations: FeePaymentObservation[]
  paymentEvidence: ApplicationFeePaymentEvidence | null
  auditTrail: FeeAuditEvent[]
  metrics: FeeWorkflowMetrics
}

export type FeeProgressInteraction = {
  id: string
  applicationCaseId: string
  requirementId: string
  kind: 'single_choice' | 'attachment_request' | 'short_text' | 'payment_approval' | 'secure_authentication' | 'confirmation'
  question: string
  reason: string
  options: Array<{ label: string; value: string }>
  knownContext: string[]
  exactAmount?: { amount: number; currency: string; processingFee: number; total: number } | null
  sensitive: boolean
  deadline: string | null
}

export type FeeWorkflowStep = {
  stage: ApplicationFeePaymentStage
  action: 'research' | 'resolve' | 'gather_evidence' | 'submit_waiver' | 'monitor' | 'verify' | 'prepare_payment' | 'request_payment_approval' | 'secure_handoff' | 'reconcile' | 'capture_receipt' | 'update_requirement' | 'complete' | 'user_input' | 'blocked'
  reason: string
  paymentBlocked: boolean
  interaction: FeeProgressInteraction | null
  until: string | null
}

export type FeeEligibilityEvaluation = {
  state: FeeWaiverState
  rationale: string
  matchedCriterionIds: string[]
  failedCriterionIds: string[]
  missingFactKeys: string[]
  requiredEvidence: FeeWaiverEvidenceRequirement[]
}

export type FeeWorkflowEvent =
  | { type: 'fee_detected'; feeRequired: boolean; amount: number | null; currency: string | null; processingServiceFee?: number | null; paymentDeadline?: string | null; deadlineTimezone?: string | null; paymentStage?: ApplicationFeePaymentStage; paymentMethod?: FeePaymentMethod | null; sources: FeeSourceProvenance[]; at?: string }
  | { type: 'waiver_policy_researched'; policy: FeeWaiverPolicy | null; at?: string }
  | { type: 'eligibility_resolved'; evaluation: FeeEligibilityEvaluation; at?: string }
  | { type: 'evidence_added'; evidence: FeeWaiverEvidence; reused?: boolean; at?: string }
  | { type: 'waiver_request_submitted'; request: FeeWaiverRequest; at?: string }
  | { type: 'waiver_decision_received'; decision: FeeWaiverDecision; at?: string }
  | { type: 'waiver_result_verified'; approved: boolean; sourceEvidenceIds: string[]; portalFeeAmount: number | null; at?: string }
  | { type: 'payment_prepared'; amount: number; currency: string; processingServiceFee: number; total: number; source: FeeSourceProvenance; at?: string }
  | { type: 'payment_authorization_created'; authorization: PaymentAuthorization; at?: string }
  | { type: 'payment_authorization_decided'; authorizationId: string; approved: boolean; at?: string }
  | { type: 'payment_handoff_started'; attemptId: string; at?: string }
  | { type: 'payment_submitted'; attemptId: string; providerTransactionId?: string | null; responseKnown: boolean; at?: string }
  | { type: 'payment_reconciled'; observations: FeePaymentObservation[]; at?: string }
  | { type: 'receipt_captured'; evidence: ApplicationFeePaymentEvidence; at?: string }
  | { type: 'payment_deadline_decision'; choice: 'pay_now' | 'keep_waiting'; at?: string }
  | { type: 'payment_cancelled'; reason: string; at?: string }

function text(value: unknown, maximum = 2_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function nonNegativeMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return Math.round(number * 100) / 100
}

function moneyTotal(amount: number | null, processingServiceFee: number | null) {
  if (amount === null) return null
  return Math.round((amount + (processingServiceFee ?? 0)) * 100) / 100
}

function unique(values: string[]) {
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))]
}

function safeDate(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}

function id(prefix: string, seed: string) {
  const normalized = seed.replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 180)
  return `${prefix}:${normalized}`
}

function hash(value: unknown) {
  const raw = JSON.stringify(value)
  let result = 2166136261
  for (let index = 0; index < raw.length; index += 1) {
    result ^= raw.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(16).padStart(8, '0')
}

function nowIso(value?: string) {
  return safeDate(value) ?? new Date().toISOString()
}

function emptyMetrics(): FeeWorkflowMetrics {
  return {
    feesDetected: 0,
    waiverOpportunitiesDiscovered: 0,
    waiverEligibilityAutoResolved: 0,
    evidenceReused: 0,
    attachmentRequests: 0,
    structuredQuestions: 0,
    waiverApprovalsRequested: 0,
    paymentApprovals: 0,
    securePaymentHandoffs: 0,
    rareFreeTextInputs: 0,
    waiverSavings: 0,
    duplicateChargesPrevented: 0,
    autonomousReconciliations: 0,
  }
}

export function calculateFeeTotal(feeAmount: number | null, processingServiceFee: number | null) {
  return moneyTotal(nonNegativeMoney(feeAmount), nonNegativeMoney(processingServiceFee))
}

export function feeRequirementId(applicationCaseId: string) {
  return id('application-fee', applicationCaseId)
}

export function createApplicationFeeRequirement(input: {
  applicationCaseId: string
  applicantId: string
  university: string
  programme: string
  applicationCycle: string
  now?: string
}): ApplicationFeeRequirement {
  const createdAt = nowIso(input.now)
  return {
    id: feeRequirementId(input.applicationCaseId),
    applicationCaseId: text(input.applicationCaseId, 160),
    applicantId: text(input.applicantId, 160),
    university: text(input.university, 500),
    programme: text(input.programme, 800),
    applicationCycle: text(input.applicationCycle, 160),
    feeRequired: null,
    feeAmount: null,
    currency: null,
    processingServiceFee: null,
    totalPayable: null,
    paymentDeadline: null,
    deadlineTimezone: null,
    paymentStage: 'APPLICATION',
    paymentMethod: null,
    waiverAvailability: 'unknown',
    waiverType: null,
    waiverEligibilityState: 'NOT_RESEARCHED',
    waiverEvidenceRequirements: [],
    waiverSubmissionMethod: null,
    waiverDeadline: null,
    waiverDecisionState: 'NOT_RESEARCHED',
    waiverCode: null,
    paymentState: 'NOT_REQUIRED',
    providerPortalTransactionId: null,
    receiptArtifactId: null,
    verificationEvidenceIds: [],
    blocker: null,
    riskState: 'NONE',
    sourceProvenance: [],
    amountRetrievedAt: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
  }
}

export function createApplicationFeeWorkflow(input: {
  requirement: ApplicationFeeRequirement
  policy?: FeeWaiverPolicy | null
  applicantFacts?: FeeApplicantFact[]
  now?: string
}): ApplicationFeeWorkflow {
  const requirement = normalizeFeeRequirement(input.requirement, input.now)
  return {
    version: APPLICATION_FEE_WORKFLOW_VERSION,
    requirement,
    policy: input.policy ?? null,
    applicantFacts: input.applicantFacts ?? [],
    waiverEvidence: [],
    waiverRequest: null,
    waiverDecision: null,
    paymentAuthorization: null,
    paymentAttempt: null,
    paymentObservations: [],
    paymentEvidence: null,
    auditTrail: [],
    metrics: emptyMetrics(),
  }
}

export function normalizeFeeRequirement(requirement: ApplicationFeeRequirement, now?: string): ApplicationFeeRequirement {
  const feeAmount = nonNegativeMoney(requirement.feeAmount)
  const processingServiceFee = nonNegativeMoney(requirement.processingServiceFee)
  const normalizedCurrency = text(requirement.currency, 12).toUpperCase() || null
  const totalPayable = requirement.feeRequired === false ? 0 : moneyTotal(feeAmount, processingServiceFee)
  const normalized = {
    ...requirement,
    id: text(requirement.id, 180) || feeRequirementId(requirement.applicationCaseId),
    applicationCaseId: text(requirement.applicationCaseId, 160),
    applicantId: text(requirement.applicantId, 160),
    university: text(requirement.university, 500),
    programme: text(requirement.programme, 800),
    applicationCycle: text(requirement.applicationCycle, 160),
    feeAmount,
    currency: normalizedCurrency,
    processingServiceFee,
    totalPayable,
    paymentDeadline: safeDate(requirement.paymentDeadline),
    waiverDeadline: safeDate(requirement.waiverDeadline),
    sourceProvenance: requirement.sourceProvenance ?? [],
    waiverEvidenceRequirements: requirement.waiverEvidenceRequirements ?? [],
    verificationEvidenceIds: unique(requirement.verificationEvidenceIds ?? []),
    amountRetrievedAt: safeDate(requirement.amountRetrievedAt),
    updatedAt: nowIso(now ?? requirement.updatedAt),
  }
  if (normalized.feeRequired === false) {
    normalized.paymentState = 'NOT_REQUIRED'
    normalized.waiverEligibilityState = 'NOT_NEEDED'
    normalized.waiverDecisionState = 'NOT_NEEDED'
    normalized.paymentStage = 'COMPLETE'
    normalized.blocker = null
  }
  return normalized
}

export function authoritativeFeeSources(sources: FeeSourceProvenance[], applicationCycle?: string) {
  return sources.filter(source => source.authoritative &&
    ['programme_admissions_page', 'graduate_admissions_page', 'official_fee_guidance', 'application_portal'].includes(source.kind) &&
    (!applicationCycle || source.applicationCycle === applicationCycle))
}

export function validateFeeWaiverPolicy(policy: FeeWaiverPolicy, requirement: ApplicationFeeRequirement) {
  const issues: string[] = []
  if (policy.applicationCaseId !== requirement.applicationCaseId) issues.push('wrong_application_case')
  if (policy.applicationCycle !== requirement.applicationCycle) issues.push('wrong_application_cycle')
  if (policy.offered && !policy.category) issues.push('waiver_category_missing')
  if (policy.offered && !policy.sources.some(source => source.authoritative && source.applicationCycle === requirement.applicationCycle)) issues.push('waiver_source_not_authoritative')
  if (policy.requestMechanism === 'email_admissions' && !policy.contactEmail) issues.push('admissions_email_missing')
  if (policy.expectedProcessingDays !== null && (!Number.isInteger(policy.expectedProcessingDays) || policy.expectedProcessingDays < 0)) issues.push('processing_days_invalid')
  for (const criterion of policy.eligibilityCriteria) {
    if (!criterion.id || !criterion.factKey || !criterion.label) issues.push(`criterion_incomplete:${criterion.id || 'unknown'}`)
    if (criterion.operator === 'one_of' && !criterion.expectedValues?.length) issues.push(`criterion_values_missing:${criterion.id}`)
  }
  return { valid: issues.length === 0, issues }
}

function factFor(facts: FeeApplicantFact[], key: string) {
  return facts.find(fact => fact.key === key && fact.verified)
}

function criterionMatches(criterion: FeeWaiverEligibilityCriterion, fact: FeeApplicantFact | undefined) {
  if (!fact || fact.key !== criterion.factKey || !fact.verified) return false
  const value = fact.value
  switch (criterion.operator) {
    case 'present': return value !== null && value !== undefined && value !== ''
    case 'equals': return JSON.stringify(value) === JSON.stringify(criterion.expectedValue)
    case 'one_of': return (criterion.expectedValues ?? []).some(expected => JSON.stringify(expected) === JSON.stringify(value))
    case 'contains': return typeof value === 'string' && value.toLocaleLowerCase().includes(String(criterion.expectedValue ?? '').toLocaleLowerCase())
    case 'boolean_true': return value === true
    case 'boolean_false': return value === false
  }
}

/**
 * Resolve only from verified facts. In particular, this function never
 * converts nationality, geography, employment, or institution into a
 * hardship conclusion; a published policy criterion must explicitly say what
 * the fact means.
 */
export function evaluateFeeWaiverEligibility(policy: FeeWaiverPolicy | null, facts: FeeApplicantFact[]): FeeEligibilityEvaluation {
  if (!policy || !policy.offered) return { state: 'NO_WAIVER_AVAILABLE', rationale: 'No legitimate fee-waiver route was found in the authoritative sources.', matchedCriterionIds: [], failedCriterionIds: [], missingFactKeys: [], requiredEvidence: [] }
  const policyIssues = validateFeeWaiverPolicy(policy, { applicationCaseId: policy.applicationCaseId, applicationCycle: policy.applicationCycle } as ApplicationFeeRequirement)
  if (policyIssues.issues.includes('waiver_source_not_authoritative')) return { state: 'NOT_RESEARCHED', rationale: 'The waiver policy does not yet have an authoritative source for this application cycle.', matchedCriterionIds: [], failedCriterionIds: [], missingFactKeys: [], requiredEvidence: [] }
  if (!policy.eligibilityCriteria.length) {
    return {
      state: policy.requiredEvidence.length ? 'POTENTIALLY_ELIGIBLE' : 'REQUEST_READY',
      rationale: policy.requiredEvidence.length ? 'A legitimate waiver route exists, but the programme has not supplied a fact-based eligibility criterion that can be resolved automatically.' : 'The authoritative policy provides an application route without additional applicant facts.',
      matchedCriterionIds: [], failedCriterionIds: [], missingFactKeys: [], requiredEvidence: policy.requiredEvidence,
    }
  }
  const matchedCriterionIds: string[] = []
  const failedCriterionIds: string[] = []
  const missingFactKeys: string[] = []
  for (const criterion of policy.eligibilityCriteria.filter(item => item.required)) {
    const fact = factFor(facts, criterion.factKey)
    if (!fact) {
      missingFactKeys.push(criterion.factKey)
      continue
    }
    if (criterionMatches(criterion, fact)) matchedCriterionIds.push(criterion.id)
    else failedCriterionIds.push(criterion.id)
  }
  if (failedCriterionIds.length) return { state: 'NOT_ELIGIBLE', rationale: 'At least one published eligibility criterion is not satisfied by the verified applicant facts.', matchedCriterionIds, failedCriterionIds, missingFactKeys, requiredEvidence: policy.requiredEvidence }
  if (missingFactKeys.length) return { state: 'EVIDENCE_REQUIRED', rationale: 'The waiver route is legitimate, but one or more factual eligibility inputs are not verified yet.', matchedCriterionIds, failedCriterionIds, missingFactKeys: unique(missingFactKeys), requiredEvidence: policy.requiredEvidence }
  return { state: policy.requiredEvidence.length ? 'ELIGIBLE' : 'REQUEST_READY', rationale: policy.requiredEvidence.length ? 'All published eligibility criteria match verified applicant facts; the listed evidence is still required.' : 'All published eligibility criteria match verified applicant facts.', matchedCriterionIds, failedCriterionIds, missingFactKeys: [], requiredEvidence: policy.requiredEvidence }
}

export function validateFeeWaiverEvidence(evidence: FeeWaiverEvidence, requirement: ApplicationFeeRequirement, policy: FeeWaiverPolicy | null) {
  const issues: string[] = []
  if (evidence.applicationCaseId !== requirement.applicationCaseId) issues.push('wrong_application_case')
  if (evidence.applicantId !== requirement.applicantId) issues.push('wrong_applicant')
  if (evidence.requirementId !== requirement.id) issues.push('wrong_fee_requirement')
  if (!evidence.assetId || !evidence.checksum) issues.push('asset_checksum_missing')
  if (!evidence.readable) issues.push('evidence_not_readable')
  if (!evidence.correctApplicant) issues.push('evidence_applicant_mismatch')
  if (!evidence.correctProgramme) issues.push('evidence_programme_mismatch')
  if (policy && policy.category && evidence.category !== policy.category) issues.push('wrong_waiver_category')
  const expected = policy?.requiredEvidence.find(item => item.id === evidence.evidenceRequirementId)
  if (!expected) issues.push('evidence_requirement_not_in_policy')
  if (expected?.issueDateRequired && !evidence.issueDate) issues.push('evidence_issue_date_missing')
  if (!evidence.verifiedAt) issues.push('evidence_not_verified')
  return { valid: issues.length === 0, issues }
}

export function waiverPolicySourcesForCurrentCycle(policy: FeeWaiverPolicy, requirement: ApplicationFeeRequirement) {
  return policy.sources.filter(source => source.applicationCycle === requirement.applicationCycle && source.authoritative)
}

export function buildFeeEligibilityInteraction(input: {
  requirement: ApplicationFeeRequirement
  policy: FeeWaiverPolicy
  evaluation: FeeEligibilityEvaluation
}): FeeProgressInteraction | null {
  const { requirement, policy, evaluation } = input
  if (evaluation.state === 'EVIDENCE_REQUIRED' || evaluation.state === 'POTENTIALLY_ELIGIBLE') {
    const fact = evaluation.missingFactKeys[0]
    if (fact) return {
      id: id('fee-fact', `${requirement.id}:${fact}`),
      applicationCaseId: requirement.applicationCaseId,
      requirementId: requirement.id,
      kind: 'single_choice',
      question: `${policy.category === 'financial_hardship' || policy.category === 'need_based' ? 'This programme offers a need-based application-fee waiver. Does the published eligibility criterion apply to you?' : `The programme requires one fact for its ${policy.category ?? 'fee-waiver'} route. Is this fact true for you?`}`,
      reason: 'Answer the factual eligibility question once; the verified answer can be reused across application cases where the policy matches.',
      options: [{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }],
      knownContext: [`University: ${requirement.university}`, `Programme: ${requirement.programme}`, `Policy source: ${policy.sources.find(source => source.authoritative)?.url ?? 'authoritative programme guidance'}`],
      sensitive: policy.category === 'financial_hardship' || policy.category === 'need_based',
      deadline: requirement.waiverDeadline,
    }
    const evidence = evaluation.requiredEvidence.find(item => item.required)
    if (evidence) return buildFeeEvidenceInteraction(requirement, evidence)
  }
  if (evaluation.state === 'ELIGIBLE') {
    const evidence = evaluation.requiredEvidence.find(item => item.required)
    return evidence ? buildFeeEvidenceInteraction(requirement, evidence) : null
  }
  return null
}

export function buildFeeEvidenceInteraction(requirement: ApplicationFeeRequirement, evidence: FeeWaiverEvidenceRequirement): FeeProgressInteraction {
  return {
    id: id('fee-evidence', `${requirement.id}:${evidence.id}`),
    applicationCaseId: requirement.applicationCaseId,
    requirementId: requirement.id,
    kind: 'attachment_request',
    question: `Attach ${evidence.label} for the ${requirement.university} application-fee waiver.`,
    reason: `The programme accepts ${evidence.acceptedTypes.join(', ') || 'the specified evidence'} for this waiver route. ShotCount will validate the applicant, programme, readability, date, and checksum before submission.`,
    options: [],
    knownContext: [`University: ${requirement.university}`, `Programme: ${requirement.programme}`, `Waiver evidence: ${evidence.label}`],
    sensitive: evidence.sensitive,
    deadline: requirement.waiverDeadline,
  }
}

export function buildPaymentApprovalInteraction(requirement: ApplicationFeeRequirement, authorization?: PaymentAuthorization | null): FeeProgressInteraction | null {
  if (requirement.feeRequired !== true || requirement.totalPayable === null || !requirement.currency) return null
  return {
    id: id('fee-payment-approval', `${requirement.id}:${authorization?.id ?? requirement.version}`),
    applicationCaseId: requirement.applicationCaseId,
    requirementId: requirement.id,
    kind: 'payment_approval',
    question: `Application fee ready — ${requirement.university} ${requirement.programme}`,
    reason: `Fee waiver resolution is complete or no legitimate waiver applies. This approval authorizes one payment attempt only for this application and exact amount.`,
    options: [{ label: 'Approve payment', value: 'approve' }, { label: 'Not now', value: 'cancel' }],
    knownContext: [`Application fee: ${formatMoney(requirement.feeAmount ?? 0, requirement.currency)}`, `Processing/service fee: ${formatMoney(requirement.processingServiceFee ?? 0, requirement.currency)}`, `Total: ${formatMoney(requirement.totalPayable, requirement.currency)}`, ...(requirement.paymentDeadline ? [`Deadline: ${requirement.paymentDeadline}${requirement.deadlineTimezone ? ` (${requirement.deadlineTimezone})` : ''}`] : [])],
    exactAmount: { amount: requirement.feeAmount ?? 0, currency: requirement.currency, processingFee: requirement.processingServiceFee ?? 0, total: requirement.totalPayable },
    sensitive: false,
    deadline: requirement.paymentDeadline,
  }
}

export function buildFeeDeadlineRiskInteraction(requirement: ApplicationFeeRequirement): FeeProgressInteraction {
  const total = requirement.totalPayable !== null && requirement.currency ? formatMoney(requirement.totalPayable, requirement.currency) : 'the current portal amount'
  return {
    id: id('fee-deadline-decision', `${requirement.id}:${requirement.version}`),
    applicationCaseId: requirement.applicationCaseId,
    requirementId: requirement.id,
    kind: 'single_choice',
    question: `${requirement.university} has not resolved the fee waiver and the application deadline is approaching.`,
    reason: `You can protect the application by approving one ${total} payment, or keep waiting for the waiver. No payment will be attempted without your choice.`,
    options: [{ label: `Pay ${total} now`, value: 'pay_now' }, { label: 'Keep waiting', value: 'keep_waiting' }],
    knownContext: [`University: ${requirement.university}`, `Programme: ${requirement.programme}`, `Total if paid: ${total}`, ...(requirement.paymentDeadline ? [`Payment deadline: ${requirement.paymentDeadline}`] : []), ...(requirement.waiverDeadline ? [`Waiver deadline: ${requirement.waiverDeadline}`] : [])],
    exactAmount: requirement.totalPayable !== null && requirement.currency ? { amount: requirement.feeAmount ?? 0, currency: requirement.currency, processingFee: requirement.processingServiceFee ?? 0, total: requirement.totalPayable } : null,
    sensitive: false,
    deadline: requirement.paymentDeadline,
  }
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}

export function buildFeeWaiverRequestEmail(input: {
  requirement: ApplicationFeeRequirement
  policy: FeeWaiverPolicy
  applicantName: string
  applicantEmail: string | null
  eligibilityBasis: string[]
  evidenceIds: string[]
  prompt?: string | null
  explanation?: string | null
}): Pick<FeeWaiverRequest, 'subject' | 'bodyText' | 'bodyHtml'> {
  const subject = `Application fee waiver request — ${input.requirement.programme}`
  const basis = input.eligibilityBasis.map(value => text(value, 500)).filter(Boolean)
  const evidenceLine = input.evidenceIds.length ? `I have attached the evidence requested by the published waiver guidance (reference: ${input.evidenceIds.join(', ')}).` : 'I can provide the supporting evidence requested by the published waiver guidance.'
  const explanation = input.explanation?.trim() ? `\n\n${text(input.explanation, 2_000)}` : ''
  const bodyText = [
    `Dear Admissions Team,`,
    '',
    `I am applying to the ${input.requirement.programme} at ${input.requirement.university} for the ${input.requirement.applicationCycle} application cycle.`,
    '',
    `I would like to request consideration for the ${input.policy.category?.replaceAll('_', ' ') ?? 'application-fee'} waiver described in the official guidance.`,
    basis.length ? `Basis: ${basis.join('; ')}.` : '',
    evidenceLine,
    input.prompt ? `The waiver form asks: ${text(input.prompt, 1_000)}${explanation}` : explanation,
    '',
    `Please let me know if any additional information is required, and whether the application fee can be waived before submission.`,
    '',
    `Kind regards,`,
    text(input.applicantName, 240) || 'Applicant',
    input.applicantEmail ? text(input.applicantEmail, 320) : '',
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
  const body = bodyText.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const bodyHtml = body.split('\n\n').map(paragraph => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`).join('')
  return { subject, bodyText: body, bodyHtml }
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function classifyFeeWaiverReply(subject: string, body: string): FeeWaiverReplyClassification {
  const value = `${subject} ${body}`.toLocaleLowerCase()
  if (/\b(?:approved|granted|waive(?:d|r)?|no fee required|fee has been removed|fee is waived)\b/.test(value) && !/not approved|cannot waive|unable to waive/.test(value)) return 'APPROVED'
  if (/\b(?:denied|declined|not approved|cannot waive|unable to waive|not eligible|ineligible)\b/.test(value)) return /not eligible|ineligible/.test(value) ? 'NOT_ELIGIBLE' : 'DENIED'
  if (/\b(?:additional|another|valid)\b[\s\S]{0,100}\b(?:document|proof|evidence|attachment)\b/.test(value)) return 'NEEDS_DOCUMENT'
  if (/\b(?:explanation|brief statement|describe|tell us why)\b/.test(value)) return 'NEEDS_EXPLANATION'
  if (/\b(?:code|coupon|waiver code)\b[\s\S]{0,80}\b(?:use|enter|issued|provided)\b/.test(value)) return 'CODE_ISSUED'
  if (/\b(?:portal|application form|select the waiver|use the form)\b/.test(value)) return 'USE_PORTAL_FORM'
  if (/\b(?:reviewing|under review|pending|allow five|business days|we will review)\b/.test(value)) return 'PENDING'
  if (/\b(?:contact|email|write to)\b[\s\S]{0,80}\b(?:office|department|graduate school|admissions)\b/.test(value)) return 'CONTACT_OTHER_OFFICE'
  return 'OTHER'
}

export function paymentAuthorizationId(requirement: ApplicationFeeRequirement, userId: string) {
  return id('payment-authorization', `${userId}:${requirement.applicationCaseId}:${requirement.id}:${requirement.version}`)
}

export function paymentAttemptIdempotencyKey(requirement: ApplicationFeeRequirement, authorization: PaymentAuthorization) {
  return `fee-payment:${requirement.applicationCaseId}:${requirement.id}:${authorization.id}:${requirement.totalPayable}:${requirement.currency}`
}

export function duplicateChargeGuard(workflow: ApplicationFeeWorkflow) {
  const requirement = workflow.requirement
  const reasons: string[] = []
  if (requirement.waiverDecisionState === 'APPROVED' || requirement.waiverEligibilityState === 'APPROVED') reasons.push('fee_waived')
  if (['PROCESSING', 'AMBIGUOUS', 'RECONCILIATION_REQUIRED'].includes(requirement.paymentState)) reasons.push('payment_requires_reconciliation')
  if (['SUCCEEDED', 'COMPLETE'].includes(requirement.paymentState)) reasons.push('payment_already_verified')
  if (workflow.paymentAttempt && ['SUBMITTED', 'AMBIGUOUS', 'SUCCEEDED'].includes(workflow.paymentAttempt.state)) reasons.push('existing_payment_attempt')
  if (workflow.paymentObservations.some(observation => observation.verified && observation.status === 'paid')) reasons.push('paid_observation_exists')
  return { blocked: reasons.length > 0, reasons: [...new Set(reasons)] }
}

export function canEnterPayment(workflow: ApplicationFeeWorkflow, now = new Date().toISOString()) {
  const requirement = workflow.requirement
  if (requirement.feeRequired !== true || requirement.totalPayable === null || !requirement.currency) return { allowed: false, reason: 'The current application fee is not fully verified.' }
  if (duplicateChargeGuard(workflow).blocked) return { allowed: false, reason: 'A prior waiver or payment state must be reconciled before another charge is considered.' }
  const waiverPending = ['REQUEST_SUBMITTED', 'UNDER_REVIEW', 'EVIDENCE_REQUIRED', 'AWAITING_USER_EVIDENCE', 'ELIGIBLE', 'REQUEST_READY'].includes(requirement.waiverDecisionState) || ['REQUEST_SUBMITTED', 'UNDER_REVIEW'].includes(requirement.waiverEligibilityState)
  if (waiverPending) {
    const deadlineMs = Date.parse(requirement.paymentDeadline ?? '')
    const waiverDeadlineMs = Date.parse(requirement.waiverDeadline ?? '')
    const deadlineRisk = Number.isFinite(deadlineMs) && Number.isFinite(waiverDeadlineMs) && deadlineMs - Date.parse(now) < Math.max(0, waiverDeadlineMs - Date.parse(now))
    if (!deadlineRisk) return { allowed: false, reason: 'A legitimate active waiver path is unresolved; payment remains blocked on the waiver.' }
  }
  return { allowed: true, reason: 'Waiver resolution permits payment preparation.' }
}

export function createPaymentAuthorization(input: {
  userId: string
  workflow: ApplicationFeeWorkflow
  reason: string
  now?: string
  expiresInHours?: number
}): PaymentAuthorization {
  const allowed = canEnterPayment(input.workflow, input.now)
  if (!allowed.allowed) throw new Error(allowed.reason)
  const requirement = input.workflow.requirement
  const now = nowIso(input.now)
  const expiresInHours = Math.max(1, Math.min(72, Math.floor(input.expiresInHours ?? 24)))
  const authorization: PaymentAuthorization = {
    id: paymentAuthorizationId(requirement, input.userId),
    userId: text(input.userId, 160),
    applicationCaseId: requirement.applicationCaseId,
    feeRequirementId: requirement.id,
    merchant: requirement.university,
    amount: requirement.totalPayable!,
    currency: requirement.currency!,
    maximumAuthorizedAmount: requirement.totalPayable!,
    reason: text(input.reason, 1_000) || `Application fee for ${requirement.programme}`,
    authorizedAt: now,
    expiresAt: new Date(Date.parse(now) + expiresInHours * 60 * 60 * 1_000).toISOString(),
    idempotencyKey: `fee-approval:${requirement.applicationCaseId}:${requirement.id}:${hash({ amount: requirement.totalPayable, currency: requirement.currency, version: requirement.version })}`,
    status: 'pending',
    requirementVersion: requirement.version,
  }
  return authorization
}

export function validatePaymentAuthorization(authorization: PaymentAuthorization, requirement: ApplicationFeeRequirement, now = new Date().toISOString()) {
  const issues: string[] = []
  if (authorization.applicationCaseId !== requirement.applicationCaseId || authorization.feeRequirementId !== requirement.id) issues.push('wrong_application_scope')
  if (authorization.amount !== requirement.totalPayable || authorization.currency !== requirement.currency) issues.push('amount_or_currency_changed')
  if (authorization.maximumAuthorizedAmount < (requirement.totalPayable ?? Number.POSITIVE_INFINITY)) issues.push('amount_exceeds_authorization')
  // The requirement version also advances for state-only transitions such as
  // creating or approving the authorization. Amount/currency changes are the
  // semantic invalidation boundary, so a newer authorization may not target a
  // newer fee snapshot, but the same snapshot may carry a later lifecycle
  // version.
  if (authorization.requirementVersion > requirement.version) issues.push('requirement_version_changed')
  if (authorization.status !== 'pending' && authorization.status !== 'approved') issues.push('authorization_not_active')
  if (Date.parse(authorization.expiresAt) <= Date.parse(now)) issues.push('authorization_expired')
  if (requirement.waiverDecisionState === 'APPROVED' || requirement.paymentState === 'NOT_REQUIRED') issues.push('payment_no_longer_needed')
  return { valid: issues.length === 0, issues }
}

export function invalidatePaymentAuthorizationIfStale(authorization: PaymentAuthorization | null, requirement: ApplicationFeeRequirement, now = new Date().toISOString()) {
  if (!authorization) return null
  return validatePaymentAuthorization(authorization, requirement, now).valid ? authorization : { ...authorization, status: 'invalidated' as const }
}

export function claimPaymentAttempt(workflow: ApplicationFeeWorkflow, lockOwner: string, now = new Date().toISOString()) {
  const guard = duplicateChargeGuard(workflow)
  if (guard.blocked) return { claimed: false, reason: guard.reasons.join(','), workflow }
  const authorization = workflow.paymentAuthorization
  if (!authorization) return { claimed: false, reason: 'payment_authorization_missing', workflow }
  if (!['APPROVED', 'PAYMENT_HANDOFF_REQUIRED'].includes(workflow.requirement.paymentState)) return { claimed: false, reason: 'payment_authorization_required', workflow }
  if (authorization.status !== 'approved') return { claimed: false, reason: 'payment_authorization_not_approved', workflow }
  const authorizationCheck = validatePaymentAuthorization(authorization, workflow.requirement, now)
  if (!authorizationCheck.valid) return { claimed: false, reason: authorizationCheck.issues.join(','), workflow }
  const existing = workflow.paymentAttempt
  if (existing && ['CLAIMED', 'SUBMITTED', 'AMBIGUOUS'].includes(existing.state)) return { claimed: false, reason: 'payment_attempt_already_active', workflow }
  const attempt: FeePaymentAttempt = {
    id: id('fee-attempt', authorization.id),
    applicationCaseId: workflow.requirement.applicationCaseId,
    feeRequirementId: workflow.requirement.id,
    authorizationId: authorization.id,
    idempotencyKey: paymentAttemptIdempotencyKey(workflow.requirement, authorization),
    state: 'CLAIMED',
    providerTransactionId: null,
    claimedAt: nowIso(now),
    submittedAt: null,
    completedAt: null,
    lockOwner: text(lockOwner, 160) || null,
  }
  const claimedWorkflow: ApplicationFeeWorkflow = {
    ...workflow,
    paymentAttempt: attempt,
    requirement: { ...workflow.requirement, paymentState: 'PROCESSING', paymentStage: 'SECURE_PAYMENT_HANDOFF', updatedAt: nowIso(now), version: workflow.requirement.version + 1 },
    auditTrail: [...workflow.auditTrail, audit(workflow.requirement, 'payment_attempt_claimed', attempt.idempotencyKey, now, { authorizationId: authorization.id })],
  }
  return {
    claimed: true,
    reason: 'one_payment_attempt_claimed',
    workflow: claimedWorkflow,
  }
}

export function classifyPaymentRetry(attempt: FeePaymentAttempt | null) {
  if (!attempt) return { safe: true, action: 'retry_before_submit' as const, reason: 'No external payment attempt was claimed.' }
  if (attempt.state === 'CLAIMED') return { safe: true, action: 'retry_before_submit' as const, reason: 'The attempt was claimed but not submitted to an external processor.' }
  if (attempt.state === 'FAILED' || attempt.state === 'DECLINED' || attempt.state === 'CANCELLED') return { safe: true, action: 'retry_after_verified_failure' as const, reason: 'The prior attempt has a terminal non-payment result.' }
  return { safe: false, action: 'reconcile_first' as const, reason: 'The prior attempt may have reached the payment processor; reconcile before retrying.' }
}

export function recordPaymentSubmission(workflow: ApplicationFeeWorkflow, input: { providerTransactionId?: string | null; responseKnown: boolean; now?: string }): ApplicationFeeWorkflow {
  const attempt = workflow.paymentAttempt
  if (!attempt || attempt.state !== 'CLAIMED') throw new Error('A claimed payment attempt is required before submission.')
  const now = nowIso(input.now)
  const nextAttempt = { ...attempt, state: input.responseKnown ? 'SUBMITTED' as const : 'AMBIGUOUS' as const, providerTransactionId: text(input.providerTransactionId, 256) || null, submittedAt: now }
  return {
    ...workflow,
    paymentAttempt: nextAttempt,
    requirement: { ...workflow.requirement, paymentState: input.responseKnown ? 'PROCESSING' : 'AMBIGUOUS', paymentStage: input.responseKnown ? 'VERIFY_PAYMENT' : 'VERIFY_PAYMENT', updatedAt: now, version: workflow.requirement.version + 1 },
    auditTrail: [...workflow.auditTrail, audit(workflow.requirement, input.responseKnown ? 'payment_submitted' : 'payment_result_ambiguous', attempt.idempotencyKey, now, { responseKnown: input.responseKnown })],
  }
}

export function reconcilePaymentObservations(workflow: ApplicationFeeWorkflow, observations: FeePaymentObservation[], now = new Date().toISOString()): ApplicationFeeWorkflow {
  const valid = observations.filter(observation => observation.applicationCaseId === workflow.requirement.applicationCaseId && observation.feeRequirementId === workflow.requirement.id && observation.verified && observation.sourceEvidenceIds.length && observation.currency === workflow.requirement.currency && observation.amount === workflow.requirement.totalPayable)
  const paid = valid.filter(observation => observation.status === 'paid')
  const failed = valid.filter(observation => observation.status === 'declined' || observation.status === 'unpaid')
  const conflicting = paid.length > 0 && failed.length > 0
  let paymentState: ApplicationFeePaymentState = 'AMBIGUOUS'
  let attemptState: FeePaymentAttempt['state'] = 'AMBIGUOUS'
  if (conflicting) {
    paymentState = 'RECONCILIATION_REQUIRED'
  } else if (paid.length) {
    paymentState = 'SUCCEEDED'
    attemptState = 'SUCCEEDED'
  } else if (failed.length) {
    paymentState = failed.some(item => item.status === 'declined') ? 'DECLINED' : 'FAILED'
    attemptState = failed.some(item => item.status === 'declined') ? 'DECLINED' : 'FAILED'
  }
  const attempt = workflow.paymentAttempt ? { ...workflow.paymentAttempt, state: attemptState, providerTransactionId: paid[0]?.transactionId ?? workflow.paymentAttempt.providerTransactionId, completedAt: paymentState === 'AMBIGUOUS' || paymentState === 'RECONCILIATION_REQUIRED' ? null : nowIso(now) } : null
  const deduped = [...workflow.paymentObservations, ...observations].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
  return {
    ...workflow,
    paymentAttempt: attempt,
    paymentObservations: deduped,
    requirement: { ...workflow.requirement, paymentState, paymentStage: paymentState === 'SUCCEEDED' ? 'CAPTURE_RECEIPT' : 'VERIFY_PAYMENT', providerPortalTransactionId: paid[0]?.transactionId ?? workflow.requirement.providerPortalTransactionId, updatedAt: nowIso(now), version: workflow.requirement.version + 1 },
    auditTrail: [...workflow.auditTrail, audit(workflow.requirement, 'payment_reconciled', id('payment-reconcile', nowIso(now)), now, { verifiedObservations: valid.length, state: paymentState })],
    metrics: { ...workflow.metrics, autonomousReconciliations: workflow.metrics.autonomousReconciliations + 1 },
  }
}

export function validatePaymentEvidence(evidence: ApplicationFeePaymentEvidence, requirement: ApplicationFeeRequirement) {
  const issues: string[] = []
  if (evidence.applicationCaseId !== requirement.applicationCaseId || evidence.feeRequirementId !== requirement.id) issues.push('wrong_application_scope')
  if (evidence.institution !== requirement.university) issues.push('wrong_institution')
  if (evidence.amount !== requirement.totalPayable || evidence.currency !== requirement.currency) issues.push('amount_or_currency_mismatch')
  if (!evidence.paymentDateTime || !Number.isFinite(Date.parse(evidence.paymentDateTime))) issues.push('payment_datetime_missing')
  if (!evidence.sourceEvidenceIds.length) issues.push('source_evidence_missing')
  if (!['paid', 'fee_cleared', 'submitted_without_fee'].includes(evidence.portalState)) issues.push('resulting_state_missing')
  if (evidence.receiptArtifactId && !evidence.checksum) issues.push('receipt_checksum_missing')
  return { valid: issues.length === 0, issues }
}

export function capturePaymentReceipt(workflow: ApplicationFeeWorkflow, evidence: ApplicationFeePaymentEvidence, now = new Date().toISOString()) {
  const validation = validatePaymentEvidence(evidence, workflow.requirement)
  if (!validation.valid) throw new Error(`Payment evidence is invalid: ${validation.issues.join(', ')}`)
  if (!['SUCCEEDED', 'COMPLETE'].includes(workflow.requirement.paymentState)) throw new Error('A verified payment resulting state is required before capturing a receipt.')
  const requirement = { ...workflow.requirement, receiptArtifactId: evidence.receiptArtifactId, verificationEvidenceIds: unique([...workflow.requirement.verificationEvidenceIds, ...evidence.sourceEvidenceIds]), paymentStage: 'UPDATE_APPLICATION_REQUIREMENT' as const, paymentState: 'COMPLETE' as const, updatedAt: nowIso(now), version: workflow.requirement.version + 1 }
  return { ...workflow, requirement, paymentEvidence: evidence, auditTrail: [...workflow.auditTrail, audit(requirement, 'receipt_captured', evidence.id, now, { transactionId: evidence.transactionId, receiptNumber: evidence.receiptNumber, evidenceSource: evidence.evidenceSource })] }
}

export function feeRequirementSatisfiedByWaiver(requirement: ApplicationFeeRequirement) {
  return requirement.feeRequired === false || requirement.waiverDecisionState === 'APPROVED' && requirement.paymentState === 'NOT_REQUIRED'
}

export function updateFeeRequirementFromPortalAmount(workflow: ApplicationFeeWorkflow, input: { amount: number | null; currency: string | null; processingServiceFee?: number | null; source: FeeSourceProvenance; at?: string }) {
  const amount = nonNegativeMoney(input.amount)
  const processingServiceFee = nonNegativeMoney(input.processingServiceFee ?? 0)
  const total = moneyTotal(amount, processingServiceFee)
  const changed = workflow.requirement.feeAmount !== amount || workflow.requirement.currency !== (text(input.currency, 12).toUpperCase() || null) || workflow.requirement.processingServiceFee !== processingServiceFee
  const now = nowIso(input.at)
  const requirement = { ...workflow.requirement, feeAmount: amount, currency: text(input.currency, 12).toUpperCase() || null, processingServiceFee, totalPayable: total, amountRetrievedAt: now, sourceProvenance: [...workflow.requirement.sourceProvenance, input.source], paymentState: changed && workflow.paymentAuthorization ? 'READY' as const : workflow.requirement.paymentState, paymentStage: changed && workflow.paymentAuthorization ? 'PREPARE_PAYMENT' as const : workflow.requirement.paymentStage, updatedAt: now, version: changed ? workflow.requirement.version + 1 : workflow.requirement.version }
  const authorization = changed ? invalidatePaymentAuthorizationIfStale(workflow.paymentAuthorization, requirement, now) : workflow.paymentAuthorization
  return { ...workflow, requirement, paymentAuthorization: authorization, auditTrail: [...workflow.auditTrail, audit(requirement, changed ? 'fee_amount_changed' : 'fee_amount_verified', id('fee-amount', `${now}:${amount}:${input.currency}`), now, { amount, currency: requirement.currency, changed })] }
}

function audit(requirement: ApplicationFeeRequirement, type: string, eventId: string, at: string | undefined, nonSensitiveData: Record<string, unknown>): FeeAuditEvent {
  return { id: id('fee-audit', eventId), applicationCaseId: requirement.applicationCaseId, feeRequirementId: requirement.id, type, at: nowIso(at), idempotencyKey: eventId, nonSensitiveData }
}

export function applyFeeWorkflowEvent(workflow: ApplicationFeeWorkflow, event: FeeWorkflowEvent): ApplicationFeeWorkflow {
  const at = nowIso(event.at)
  const requirement = workflow.requirement
  if (event.type !== 'fee_detected' && event.type !== 'waiver_policy_researched' && event.type !== 'eligibility_resolved' && event.type !== 'payment_cancelled') {
    const scoped = 'request' in event ? event.request.applicationCaseId : 'evidence' in event ? event.evidence.applicationCaseId : 'decision' in event ? requirement.applicationCaseId : 'observations' in event ? event.observations[0]?.applicationCaseId : requirement.applicationCaseId
    if (scoped !== requirement.applicationCaseId) throw new Error('Fee workflow event belongs to another ApplicationCase.')
  }
  switch (event.type) {
    case 'fee_detected': {
      const updated = normalizeFeeRequirement({ ...requirement, feeRequired: event.feeRequired, feeAmount: event.amount, currency: event.currency, processingServiceFee: event.processingServiceFee ?? 0, totalPayable: moneyTotal(nonNegativeMoney(event.amount), nonNegativeMoney(event.processingServiceFee ?? 0)), paymentDeadline: event.paymentDeadline ?? requirement.paymentDeadline, deadlineTimezone: event.deadlineTimezone ?? requirement.deadlineTimezone, paymentStage: event.feeRequired ? 'DETECT_WAIVER_OPTIONS' : 'COMPLETE', paymentMethod: event.paymentMethod ?? requirement.paymentMethod, sourceProvenance: [...requirement.sourceProvenance, ...event.sources], paymentState: event.feeRequired ? 'BLOCKED_ON_WAIVER' : 'NOT_REQUIRED', waiverEligibilityState: event.feeRequired ? 'NOT_RESEARCHED' : 'NOT_NEEDED', waiverDecisionState: event.feeRequired ? 'NOT_RESEARCHED' : 'NOT_NEEDED', updatedAt: at, version: requirement.version + 1 }, at)
      return withAudit(workflow, { ...workflow, requirement: updated }, 'fee_detected', `fee:${updated.version}`, at, { feeRequired: event.feeRequired, amount: updated.feeAmount, currency: updated.currency })
    }
    case 'waiver_policy_researched': {
      const policy = event.policy
      const availability: ApplicationFeeRequirement['waiverAvailability'] = !policy || !policy.offered ? 'none' : policy.automaticApproval ? 'automatic' : policy.requestMechanism === 'email_admissions' ? 'manual' : 'available'
      const evaluation = policy ? evaluateFeeWaiverEligibility(policy, workflow.applicantFacts) : { state: 'NO_WAIVER_AVAILABLE' as const, rationale: 'No waiver policy exists.', matchedCriterionIds: [], failedCriterionIds: [], missingFactKeys: [], requiredEvidence: [] }
      const nextPaymentState = !policy || !policy.offered ? 'READY' as const : 'BLOCKED_ON_WAIVER' as const
      const updated = { ...requirement, waiverAvailability: availability, waiverType: policy?.category ?? null, waiverEvidenceRequirements: policy?.requiredEvidence ?? [], waiverSubmissionMethod: policy?.requestMechanism ?? null, waiverDeadline: policy?.deadline ?? null, waiverEligibilityState: policy ? evaluation.state : 'NO_WAIVER_AVAILABLE' as const, waiverDecisionState: policy ? evaluation.state : 'NO_WAIVER_AVAILABLE' as const, paymentState: nextPaymentState, paymentStage: policy?.offered ? 'DETERMINE_APPLICANT_ELIGIBILITY' as const : 'PREPARE_PAYMENT' as const, blocker: policy?.offered ? evaluation.rationale : null, updatedAt: at, version: requirement.version + 1 }
      return withAudit({ ...workflow, policy }, { ...workflow, policy, requirement: updated }, 'waiver_policy_researched', `policy:${policy?.id ?? 'none'}:${requirement.applicationCycle}`, at, { offered: Boolean(policy?.offered), category: policy?.category ?? null })
    }
    case 'eligibility_resolved': {
      const evaluation = event.evaluation
      const pendingEvidence = evaluation.requiredEvidence.some(item => item.required) && ['ELIGIBLE', 'POTENTIALLY_ELIGIBLE'].includes(evaluation.state)
      const updated = { ...requirement, waiverEligibilityState: evaluation.state, waiverDecisionState: pendingEvidence ? 'EVIDENCE_REQUIRED' as const : evaluation.state, waiverEvidenceRequirements: evaluation.requiredEvidence, paymentState: ['ELIGIBLE', 'EVIDENCE_REQUIRED', 'POTENTIALLY_ELIGIBLE', 'REQUEST_READY'].includes(evaluation.state) ? 'BLOCKED_ON_WAIVER' as const : evaluation.state === 'NOT_ELIGIBLE' ? 'READY' as const : requirement.paymentState, paymentStage: pendingEvidence ? 'GATHER_REUSE_EVIDENCE' as const : evaluation.state === 'REQUEST_READY' ? 'CLAIM_REQUEST_WAIVER' as const : 'DETERMINE_APPLICANT_ELIGIBILITY' as const, blocker: evaluation.missingFactKeys.length ? `Verified facts required: ${evaluation.missingFactKeys.join(', ')}` : null, updatedAt: at, version: requirement.version + 1 }
      const metrics = evaluation.missingFactKeys.length ? workflow.metrics : { ...workflow.metrics, waiverEligibilityAutoResolved: workflow.metrics.waiverEligibilityAutoResolved + 1 }
      return withAudit({ ...workflow, metrics }, { ...workflow, requirement: updated, metrics }, 'eligibility_resolved', `eligibility:${updated.version}`, at, { state: evaluation.state, matchedCriterionIds: evaluation.matchedCriterionIds, missingFactCount: evaluation.missingFactKeys.length })
    }
    case 'evidence_added': {
      const validation = validateFeeWaiverEvidence(event.evidence, requirement, workflow.policy)
      if (!validation.valid) throw new Error(`Fee-waiver evidence is invalid: ${validation.issues.join(', ')}`)
      const evidence = workflow.waiverEvidence.some(item => item.id === event.evidence.id) ? workflow.waiverEvidence : [...workflow.waiverEvidence, event.evidence]
      const required = requirement.waiverEvidenceRequirements.filter(item => item.required)
      const complete = required.every(item => evidence.some(itemEvidence => itemEvidence.evidenceRequirementId === item.id))
      const updated = { ...requirement, waiverDecisionState: complete ? 'REQUEST_READY' as const : 'AWAITING_USER_EVIDENCE' as const, paymentStage: complete ? 'CLAIM_REQUEST_WAIVER' as const : 'GATHER_REUSE_EVIDENCE' as const, blocker: complete ? null : 'The published waiver evidence is incomplete.', updatedAt: at, version: requirement.version + 1 }
      return withAudit({ ...workflow, waiverEvidence: evidence, metrics: { ...workflow.metrics, evidenceReused: workflow.metrics.evidenceReused + (event.reused ? 1 : 0) } }, { ...workflow, waiverEvidence: evidence, requirement: updated }, 'waiver_evidence_added', event.evidence.id, at, { evidenceRequirementId: event.evidence.evidenceRequirementId, reused: event.reused === true })
    }
    case 'waiver_request_submitted': {
      if (workflow.waiverRequest?.id === event.request.id) return workflow
      if (event.request.applicationCaseId !== requirement.applicationCaseId || event.request.requirementId !== requirement.id) throw new Error('Waiver request is not scoped to this fee requirement.')
      const updated = { ...requirement, waiverDecisionState: 'REQUEST_SUBMITTED' as const, waiverEligibilityState: 'REQUEST_SUBMITTED' as const, paymentState: 'BLOCKED_ON_WAIVER' as const, paymentStage: 'MONITOR_WAIVER_DECISION' as const, blocker: 'The legitimate fee-waiver request is awaiting a decision.', updatedAt: at, version: requirement.version + 1 }
      return withAudit({ ...workflow, waiverRequest: event.request, metrics: { ...workflow.metrics, waiverApprovalsRequested: workflow.metrics.waiverApprovalsRequested + 1 } }, { ...workflow, waiverRequest: event.request, requirement: updated }, 'waiver_request_submitted', event.request.idempotencyKey, at, { submissionMethod: event.request.submissionMethod, providerMessageId: event.request.providerMessageId })
    }
    case 'waiver_decision_received': {
      const decision = event.decision
      const state: FeeWaiverState = decision.classification === 'APPROVED' || decision.classification === 'CODE_ISSUED' ? 'APPROVED' : decision.classification === 'DENIED' || decision.classification === 'NOT_ELIGIBLE' ? decision.classification : decision.classification === 'NEEDS_DOCUMENT' || decision.classification === 'NEEDS_EXPLANATION' ? 'EVIDENCE_REQUIRED' : decision.classification === 'PENDING' ? 'UNDER_REVIEW' : requirement.waiverDecisionState
      const updated = { ...requirement, waiverDecisionState: state, waiverEligibilityState: state, waiverCode: decision.waiverCode, paymentState: state === 'APPROVED' ? 'BLOCKED_ON_WAIVER' as const : state === 'UNDER_REVIEW' || state === 'EVIDENCE_REQUIRED' ? 'BLOCKED_ON_WAIVER' as const : 'READY' as const, paymentStage: state === 'APPROVED' ? 'VERIFY_WAIVER_RESULT' as const : state === 'UNDER_REVIEW' ? 'MONITOR_WAIVER_DECISION' as const : state === 'EVIDENCE_REQUIRED' ? 'GATHER_REUSE_EVIDENCE' as const : 'PREPARE_PAYMENT' as const, blocker: state === 'APPROVED' ? 'Waiver approval must be verified in the application portal.' : state === 'UNDER_REVIEW' ? 'Admissions is reviewing the fee-waiver request.' : null, updatedAt: at, version: requirement.version + 1 }
      return withAudit({ ...workflow, waiverDecision: decision }, { ...workflow, waiverDecision: decision, requirement: updated }, 'waiver_decision_received', `waiver-decision:${decision.receivedAt}`, at, { classification: decision.classification, providerMessageId: decision.providerMessageId })
    }
    case 'waiver_result_verified': {
      if (!event.sourceEvidenceIds.length) throw new Error('A waiver resulting-state verification needs evidence.')
      if (event.approved && event.portalFeeAmount !== null && event.portalFeeAmount !== 0) throw new Error('A waiver cannot be verified while the portal still shows a payable fee.')
      if (event.approved && workflow.paymentAttempt && ['SUBMITTED', 'AMBIGUOUS'].includes(workflow.paymentAttempt.state)) throw new Error('A payment attempt may have reached the processor; reconcile it before applying the waiver result.')
      const updated = event.approved
        ? { ...requirement, waiverDecisionState: 'APPROVED' as const, waiverEligibilityState: 'APPROVED' as const, paymentState: 'NOT_REQUIRED' as const, paymentStage: 'UPDATE_APPLICATION_REQUIREMENT' as const, verificationEvidenceIds: unique([...requirement.verificationEvidenceIds, ...event.sourceEvidenceIds]), blocker: null, updatedAt: at, version: requirement.version + 1 }
        : { ...requirement, paymentState: 'READY' as const, paymentStage: 'PREPARE_PAYMENT' as const, blocker: null, updatedAt: at, version: requirement.version + 1 }
      const metrics = event.approved ? { ...workflow.metrics, waiverSavings: workflow.metrics.waiverSavings + (requirement.totalPayable ?? 0) } : workflow.metrics
      const paymentAuthorization = event.approved && workflow.paymentAuthorization && !workflow.paymentAttempt
        ? { ...workflow.paymentAuthorization, status: 'invalidated' as const }
        : workflow.paymentAuthorization
      const paymentAttempt = event.approved && workflow.paymentAttempt?.state === 'CLAIMED'
        ? { ...workflow.paymentAttempt, state: 'CANCELLED' as const, completedAt: at }
        : workflow.paymentAttempt
      return withAudit({ ...workflow, metrics }, { ...workflow, paymentAuthorization, paymentAttempt, requirement: updated, metrics }, 'waiver_result_verified', `waiver-result:${updated.version}`, at, { approved: event.approved, sourceEvidenceCount: event.sourceEvidenceIds.length, portalFeeAmount: event.portalFeeAmount })
    }
    case 'payment_prepared': {
      if (event.amount !== requirement.feeAmount || event.currency !== requirement.currency || event.total !== moneyTotal(event.amount, event.processingServiceFee)) throw new Error('The payment snapshot does not match the canonical fee requirement.')
      const updated = { ...requirement, processingServiceFee: event.processingServiceFee, totalPayable: event.total, paymentState: 'AWAITING_USER_APPROVAL' as const, paymentStage: 'PAYMENT_APPROVAL' as const, blocker: 'One exact payment approval is required.', updatedAt: at, version: requirement.version + 1 }
      return withAudit(workflow, { ...workflow, requirement: updated }, 'payment_prepared', event.source.id, at, { amount: event.amount, currency: event.currency, total: event.total })
    }
    case 'payment_authorization_created': {
      const valid = validatePaymentAuthorization(event.authorization, requirement, at)
      if (!valid.valid && !valid.issues.includes('authorization_not_active')) throw new Error(`Payment authorization is invalid: ${valid.issues.join(', ')}`)
      const updated = { ...requirement, paymentState: 'AWAITING_USER_APPROVAL' as const, paymentStage: 'PAYMENT_APPROVAL' as const, updatedAt: at, version: requirement.version + 1 }
      return withAudit({ ...workflow, paymentAuthorization: event.authorization }, { ...workflow, paymentAuthorization: event.authorization, requirement: updated }, 'payment_authorization_created', event.authorization.idempotencyKey, at, { amount: event.authorization.amount, currency: event.authorization.currency, expiresAt: event.authorization.expiresAt })
    }
    case 'payment_authorization_decided': {
      if (!workflow.paymentAuthorization || workflow.paymentAuthorization.id !== event.authorizationId) throw new Error('Payment authorization does not belong to this fee requirement.')
      const authorization = { ...workflow.paymentAuthorization, status: event.approved ? 'approved' as const : 'cancelled' as const }
      const updated = { ...requirement, paymentState: event.approved ? 'APPROVED' as const : 'CANCELLED' as const, paymentStage: event.approved ? 'SECURE_PAYMENT_HANDOFF' as const : 'PREPARE_PAYMENT' as const, blocker: event.approved ? 'Complete the secure payment step.' : 'Payment approval was declined.', updatedAt: at, version: requirement.version + 1 }
      return withAudit({ ...workflow, paymentAuthorization: authorization, metrics: event.approved ? { ...workflow.metrics, paymentApprovals: workflow.metrics.paymentApprovals + 1 } : workflow.metrics }, { ...workflow, paymentAuthorization: authorization, requirement: updated }, 'payment_authorization_decided', authorization.idempotencyKey, at, { approved: event.approved })
    }
    case 'payment_handoff_started': {
      if (!workflow.paymentAttempt || workflow.paymentAttempt.id !== event.attemptId) throw new Error('Payment handoff does not match the claimed attempt.')
      const updated = { ...requirement, paymentState: 'PAYMENT_HANDOFF_REQUIRED' as const, paymentStage: 'SECURE_PAYMENT_HANDOFF' as const, blocker: 'Secure provider authentication is required; ShotCount will resume from the resulting state.', updatedAt: at, version: requirement.version + 1 }
      return withAudit({ ...workflow, metrics: { ...workflow.metrics, securePaymentHandoffs: workflow.metrics.securePaymentHandoffs + 1 } }, { ...workflow, requirement: updated }, 'payment_handoff_started', event.attemptId, at, {})
    }
    case 'payment_submitted': {
      if (!workflow.paymentAttempt || workflow.paymentAttempt.id !== event.attemptId) throw new Error('Payment submission does not match the claimed attempt.')
      return recordPaymentSubmission(workflow, { providerTransactionId: event.providerTransactionId, responseKnown: event.responseKnown, now: at })
    }
    case 'payment_reconciled': return reconcilePaymentObservations(workflow, event.observations, at)
    case 'receipt_captured': return capturePaymentReceipt(workflow, event.evidence, at)
    case 'payment_deadline_decision': {
      if (event.choice === 'keep_waiting') return withAudit(workflow, workflow, 'payment_deadline_decision', `deadline-decision:${requirement.version}:keep-waiting`, at, { choice: event.choice })
      const updated = { ...requirement, paymentState: 'READY' as const, paymentStage: 'PREPARE_PAYMENT' as const, blocker: 'The applicant chose payment to protect the application deadline while the waiver remains unresolved.', updatedAt: at, version: requirement.version + 1 }
      return withAudit(workflow, { ...workflow, requirement: updated }, 'payment_deadline_decision', `deadline-decision:${updated.version}:pay-now`, at, { choice: event.choice })
    }
    case 'payment_cancelled': {
      const updated = { ...requirement, paymentState: 'CANCELLED' as const, paymentStage: 'PREPARE_PAYMENT' as const, blocker: text(event.reason, 1_000) || 'Payment was cancelled.', updatedAt: at, version: requirement.version + 1 }
      return withAudit(workflow, { ...workflow, requirement: updated }, 'payment_cancelled', `payment-cancelled:${updated.version}`, at, {})
    }
  }
}

function withAudit(base: ApplicationFeeWorkflow, next: ApplicationFeeWorkflow, type: string, eventId: string, at: string, data: Record<string, unknown>) {
  const nextAudit = audit(next.requirement, type, eventId, at, data)
  return { ...next, auditTrail: [...base.auditTrail, nextAudit] }
}

export function planApplicationFeeWorkflow(workflow: ApplicationFeeWorkflow, now = new Date().toISOString()): FeeWorkflowStep {
  const requirement = workflow.requirement
  if (requirement.feeRequired === null || !requirement.sourceProvenance.length) return { stage: 'DETECT_APPLICATION_FEE', action: 'research', reason: 'Verify whether this exact programme and cycle require an application fee.', paymentBlocked: true, interaction: null, until: null }
  if (requirement.feeRequired === false) return { stage: 'COMPLETE', action: 'complete', reason: 'This application has no fee requirement.', paymentBlocked: false, interaction: null, until: null }
  if (requirement.feeAmount === null || !requirement.currency || requirement.totalPayable === null) return { stage: 'DETECT_APPLICATION_FEE', action: 'research', reason: 'The exact portal amount and currency are not verified yet.', paymentBlocked: true, interaction: null, until: null }
  if (!workflow.policy && requirement.waiverEligibilityState === 'NOT_RESEARCHED') return { stage: 'DETECT_WAIVER_OPTIONS', action: 'research', reason: 'Check authoritative programme, graduate-admissions, and portal guidance for a legitimate fee-waiver route.', paymentBlocked: true, interaction: null, until: null }
  if (requirement.paymentState === 'READY' && requirement.paymentStage === 'PREPARE_PAYMENT') return { stage: 'PREPARE_PAYMENT', action: 'prepare_payment', reason: 'The applicant chose to protect the deadline with payment; re-read the current portal amount before preparing approval.', paymentBlocked: false, interaction: null, until: requirement.paymentDeadline }
  const waiverPending = ['REQUEST_SUBMITTED', 'UNDER_REVIEW'].includes(requirement.waiverDecisionState)
  const lastDeadlineDecision = [...workflow.auditTrail].reverse().find(event => event.type === 'payment_deadline_decision')
  const keptWaiting = lastDeadlineDecision?.nonSensitiveData.choice === 'keep_waiting'
  if (waiverPending && requirement.paymentState === 'BLOCKED_ON_WAIVER' && !keptWaiting && canEnterPayment(workflow, now).allowed) return { stage: 'PAYMENT_APPROVAL', action: 'user_input', reason: 'The waiver is unresolved and deadline slack is unsafe. Choose whether to protect the application with one exact payment or keep waiting.', paymentBlocked: true, interaction: buildFeeDeadlineRiskInteraction(requirement), until: requirement.paymentDeadline }
  if (workflow.policy?.offered && ['NOT_RESEARCHED', 'WAIVER_AVAILABLE', 'POTENTIALLY_ELIGIBLE', 'EVIDENCE_REQUIRED', 'ELIGIBLE'].includes(requirement.waiverEligibilityState)) {
    const evaluation = evaluateFeeWaiverEligibility(workflow.policy, workflow.applicantFacts)
    const interaction = buildFeeEligibilityInteraction({ requirement, policy: workflow.policy, evaluation })
    const missingRequiredEvidence = evaluation.requiredEvidence.some(item => item.required && !workflow.waiverEvidence.some(existing => existing.evidenceRequirementId === item.id))
    if (interaction && (evaluation.missingFactKeys.length > 0 || missingRequiredEvidence)) return { stage: evaluation.missingFactKeys.length ? 'DETERMINE_APPLICANT_ELIGIBILITY' : 'GATHER_REUSE_EVIDENCE', action: 'user_input', reason: evaluation.rationale, paymentBlocked: true, interaction, until: requirement.waiverDeadline }
    if (['NOT_RESEARCHED', 'WAIVER_AVAILABLE', 'POTENTIALLY_ELIGIBLE'].includes(requirement.waiverEligibilityState)) return { stage: 'DETERMINE_APPLICANT_ELIGIBILITY', action: 'resolve', reason: evaluation.rationale, paymentBlocked: true, interaction: null, until: null }
  }
  if (['EVIDENCE_REQUIRED', 'AWAITING_USER_EVIDENCE', 'ELIGIBLE'].includes(requirement.waiverDecisionState)) {
    const evidence = requirement.waiverEvidenceRequirements.find(item => item.required && !workflow.waiverEvidence.some(existing => existing.evidenceRequirementId === item.id))
    if (evidence) return { stage: 'GATHER_REUSE_EVIDENCE', action: 'user_input', reason: `Provide ${evidence.label} required by the official waiver policy.`, paymentBlocked: true, interaction: buildFeeEvidenceInteraction(requirement, evidence), until: requirement.waiverDeadline }
  }
  if (requirement.waiverDecisionState === 'REQUEST_READY') return { stage: 'CLAIM_REQUEST_WAIVER', action: 'submit_waiver', reason: 'Submit the verified waiver request through the programme’s authorised route.', paymentBlocked: true, interaction: null, until: requirement.waiverDeadline }
  if (['REQUEST_SUBMITTED', 'UNDER_REVIEW'].includes(requirement.waiverDecisionState)) return { stage: 'MONITOR_WAIVER_DECISION', action: 'monitor', reason: 'The fee-waiver request is active; continue independent application work while monitoring the authoritative decision channel.', paymentBlocked: true, interaction: null, until: workflow.waiverDecision?.commitmentDueAt ?? requirement.waiverDeadline }
  if (requirement.waiverDecisionState === 'APPROVED') return { stage: 'VERIFY_WAIVER_RESULT', action: 'verify', reason: 'Verify that the portal removed the fee or permits submission without payment.', paymentBlocked: true, interaction: null, until: null }
  if (requirement.paymentState === 'AMBIGUOUS' || requirement.paymentState === 'RECONCILIATION_REQUIRED') return { stage: 'VERIFY_PAYMENT', action: 'reconcile', reason: 'The payment result is ambiguous. Reconcile portal, provider, and receipt evidence before any retry.', paymentBlocked: true, interaction: null, until: null }
  if (['SUCCEEDED'].includes(requirement.paymentState) && !workflow.paymentEvidence) return { stage: 'CAPTURE_RECEIPT', action: 'capture_receipt', reason: 'Capture and verify the non-sensitive payment receipt metadata.', paymentBlocked: false, interaction: null, until: null }
  if (['NOT_REQUIRED', 'COMPLETE'].includes(requirement.paymentState)) return { stage: 'UPDATE_APPLICATION_REQUIREMENT', action: 'update_requirement', reason: 'The fee requirement has a verified resulting state.', paymentBlocked: false, interaction: null, until: null }
  if (requirement.paymentState === 'BLOCKED_ON_WAIVER') return { stage: 'MONITOR_WAIVER_DECISION', action: 'monitor', reason: 'Payment remains blocked until the active waiver route resolves or deadline risk creates an explicit user decision.', paymentBlocked: true, interaction: null, until: requirement.waiverDeadline }
  if (requirement.paymentState === 'READY' || requirement.paymentState === 'CANCELLED' || requirement.paymentState === 'FAILED' || requirement.paymentState === 'DECLINED') return { stage: 'PREPARE_PAYMENT', action: 'prepare_payment', reason: 'No viable waiver remains; re-read the current portal amount before preparing payment approval.', paymentBlocked: false, interaction: null, until: requirement.paymentDeadline }
  if (requirement.paymentState === 'AWAITING_USER_APPROVAL') return { stage: 'PAYMENT_APPROVAL', action: 'request_payment_approval', reason: 'Show one approval for this exact application, amount, currency, and total.', paymentBlocked: false, interaction: buildPaymentApprovalInteraction(requirement, workflow.paymentAuthorization), until: requirement.paymentDeadline }
  if (requirement.paymentState === 'APPROVED' || requirement.paymentState === 'PAYMENT_HANDOFF_REQUIRED') return { stage: 'SECURE_PAYMENT_HANDOFF', action: 'secure_handoff', reason: 'Continue only on the portal/provider-hosted payment surface; never collect card details in ShotCount.', paymentBlocked: false, interaction: { id: id('fee-secure-handoff', requirement.id), applicationCaseId: requirement.applicationCaseId, requirementId: requirement.id, kind: 'secure_authentication', question: 'Payment approval received. Complete the secure payment step to continue.', reason: 'Card details, bank authentication, 3DS, and OTP remain on the secure provider surface.', options: [{ label: 'Open payment', value: 'open' }], knownContext: [`${requirement.university} ${requirement.programme}`, `Total: ${formatMoney(requirement.totalPayable!, requirement.currency!)}`], exactAmount: null, sensitive: true, deadline: requirement.paymentDeadline }, until: requirement.paymentDeadline }
  return { stage: 'VERIFY_PAYMENT', action: 'verify', reason: 'Verify the provider and portal resulting state before treating payment as complete.', paymentBlocked: true, interaction: null, until: null }
}

export function paymentApprovalMustBeInvalidated(workflow: ApplicationFeeWorkflow, currentPortal: { amount: number; currency: string; processingServiceFee: number; total: number }) {
  const authorization = workflow.paymentAuthorization
  if (!authorization) return false
  return authorization.amount !== currentPortal.total || authorization.currency !== currentPortal.currency || workflow.requirement.totalPayable !== currentPortal.total
}

export function safePaymentHandoffPayload(input: Record<string, unknown>) {
  const serialized = JSON.stringify(input)
  if (/(?:card|cvv|cvc|security[_ -]?code|bank[_ -]?password|online[_ -]?banking|pin|otp|verification[_ -]?code|password)/i.test(serialized)) throw new Error('Payment handoff payload contains sensitive payment authentication data.')
  const allowed = ['applicationCaseId', 'feeRequirementId', 'authorizationId', 'sessionId', 'handoffUrl', 'provider', 'stage', 'amount', 'currency', 'idempotencyKey']
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key)))
}
