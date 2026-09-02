/**
 * Canonical academic records and testing domain.
 *
 * This module deliberately keeps transcripts, degree proof, credential
 * evaluations, language tests, and admissions tests in one evidence graph.
 * The application controller still owns the overall ApplicationCase; this
 * module owns the academic evidence facts, provider state, and the smallest
 * user interaction that can unblock the next safe action.
 */

import {
  createRecommendationInteraction,
  type RecommendationInteraction,
  type RecommendationInteractionOption,
  type RecommendationInteractionResponse,
} from './recommendation-workflow.ts'

export const ACADEMIC_EVIDENCE_WORKFLOW_VERSION = 'academic-evidence@1.0.0' as const

export const academicEvidenceRequirementTypes = [
  'transcript',
  'degree_certificate',
  'proof_of_graduation',
  'credential_evaluation',
  'english_language_test',
  'admissions_test',
] as const
export type AcademicEvidenceRequirementType = typeof academicEvidenceRequirementTypes[number]

export const academicRequirementStages = ['application', 'post-submission', 'offer-condition', 'enrollment'] as const
export type AcademicRequirementStage = typeof academicRequirementStages[number]

export const academicRequirementClasses = ['required', 'conditional', 'optional', 'recommended', 'waived', 'not_accepted'] as const
export type AcademicRequirementClass = typeof academicRequirementClasses[number]

export const academicRequirementStatuses = [
  'requirement_detected',
  'blocked',
  'missing',
  'existing_copy_found',
  'artifact_ready',
  'official_order_needed',
  'awaiting_user_auth',
  'order_ready',
  'ordered',
  'institution_processing',
  'dispatched',
  'delivered_to_recipient',
  'provider_selected',
  'account_needed',
  'account_ready',
  'evaluation_order_ready',
  'payment_required',
  'reference_number_issued',
  'documents_requested',
  'awaiting_institution_documents',
  'documents_received',
  'evaluation_in_progress',
  'evaluation_complete',
  'report_dispatch_pending',
  'report_sent',
  'university_receipt_pending',
  'waiver_evidence_needed',
  'score_ready',
  'reporting_pending',
  'rejected',
  'replacement_needed',
  'complete',
] as const
export type AcademicRequirementStatus = typeof academicRequirementStatuses[number]

export const academicDeliveryStates = [
  'not_started',
  'order_ready',
  'awaiting_user_auth',
  'ordered',
  'processing',
  'dispatched',
  'delivered',
  'accepted',
  'rejected',
  'replacement_needed',
  'blocked',
] as const
export type AcademicDeliveryState = typeof academicDeliveryStates[number]

export type AcademicSourceAuthority =
  | 'official'
  | 'official_programme_page'
  | 'graduate_school'
  | 'application_portal'
  | 'admitted_student_instructions'
  | 'official_testing_guidance'
  | 'official_evaluation_guidance'
  | 'provider'
  | 'applicant'
  | 'uploaded_document'
  | 'generated'

export type AcademicSourceEvidence = {
  id: string
  url: string | null
  authority: AcademicSourceAuthority
  sourceType: string
  excerpt: string
  claims: string[]
  retrievedAt: string
}

export type AcademicCost = {
  amount: number
  currency: string
  known: boolean
  sourceEvidenceIds: string[]
}

export type AcademicSubmissionMethod = {
  mode: 'applicant_upload' | 'institution_direct' | 'provider_direct' | 'secure_upload' | 'portal_field' | 'email' | 'physical_mail' | 'not_applicable'
  recipient: string | null
  institutionCode: string | null
  departmentCode: string | null
  provider: string | null
  instructions: string
}

export type AcademicCompletionEvidence = {
  id: string
  kind: 'portal_receipt' | 'portal_acceptance' | 'provider_confirmation' | 'delivery_acknowledgement' | 'registrar_confirmation' | 'application_id' | 'waiver_approval' | 'score_report_verification' | 'calendar_event' | 'approval'
  verified: boolean
  applicationCaseId: string
  requirementId: string
  provider: string | null
  providerId: string | null
  recipient: string | null
  artifactId: string | null
  checksum: string | null
  capturedAt: string
  excerpt: string
}

export type AcademicArtifactVerification = 'verified' | 'candidate' | 'unverified' | 'rejected'
export type AcademicArtifactOfficialStatus = 'official' | 'unofficial' | 'unknown' | 'not_applicable'

export type AcademicArtifactReference = {
  id: string
  applicantId: string
  applicationCaseId: string | null
  artifactType: string
  institution: string | null
  provider: string | null
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  pageCount: number | null
  checksum: string | null
  originalArtifactId: string | null
  transformationHistory: string[]
  source: string
  issueDate: string | null
  language: string | null
  officialStatus: AcademicArtifactOfficialStatus
  verification: AcademicArtifactVerification
  content: {
    applicantIdentityPresent: boolean
    institutionPresent: boolean
    courseGradeContentPresent: boolean
    readable: boolean
    gradingLegendPresent: boolean
    degreeConferralPresent: boolean
    translationPresent?: boolean
    certifiedTranslation?: boolean
    originalDocumentAttached?: boolean
    pageNumbers: number[]
    declaredPageCount: number | null
  }
  provenance: AcademicSourceEvidence[]
}

export type AcademicExternalProvider = {
  name: string
  accountId: string | null
  referenceNumber: string | null
  product: string | null
  recipient: string | null
  state: AcademicDeliveryState
}

export type AcademicEvidenceRequirement = {
  id: string
  applicationCaseId: string
  institution: string
  programme: string
  requirementType: AcademicEvidenceRequirementType
  requiredness: AcademicRequirementClass
  required: boolean
  stage: AcademicRequirementStage
  officialStatus: 'official' | 'unofficial' | 'either' | 'not_applicable'
  deadline: string | null
  deadlineTimezone: string | null
  acceptedEvidenceTypes: string[]
  submissionMethod: AcademicSubmissionMethod
  sourceEvidence: AcademicSourceEvidence[]
  confidence: 'high' | 'medium' | 'low'
  dependencies: string[]
  dependencyIds: string[]
  currentArtifact: AcademicArtifactReference | null
  currentArtifactIds: string[]
  status: AcademicRequirementStatus
  blocker: string | null
  externalProvider: AcademicExternalProvider | null
  cost: AcademicCost | null
  approvalRequirement: 'none' | 'user_approval' | 'payment' | 'secure_handoff' | 'final_submission'
  completionEvidence: AcademicCompletionEvidence[]
  exactRule: Record<string, unknown>
  idempotencyKey: string
}

export type EducationInstitutionRecord = {
  id: string
  applicantId: string
  officialInstitutionName: string
  alternateNames: string[]
  country: string | null
  degree: string | null
  programme: string | null
  attendanceStart: string | null
  attendanceEnd: string | null
  graduationStatus: 'currently_enrolled' | 'coursework_completed' | 'result_issued' | 'degree_awarded' | 'certificate_pending' | 'certificate_issued' | 'unknown'
  degreeConferralDate: string | null
  transcriptArtifacts: string[]
  transcriptType: string | null
  language: string | null
  officialStatus: AcademicArtifactOfficialStatus
  gradingSystem: string | null
  gradingScaleArtifactId: string | null
  orderingMethod: Record<string, unknown> | null
  registrarContact: string | null
  electronicTranscriptProvider: string | null
  previousVerifiedDeliveries: string[]
  sourceIds: string[]
  conflicts: string[]
}

export type LanguageTestAttempt = {
  id: string
  applicantId: string
  testProvider: string
  testType: string
  testVersion: string | null
  testDate: string
  overallScore: number | null
  sectionScores: Record<string, number>
  candidateOrReportNumber: string | null
  validUntil: string | null
  scoreReportArtifactId: string | null
  officialReportState: AcademicDeliveryState
  recipients: Array<{ institution: string; institutionCode: string | null; departmentCode: string | null; state: AcademicDeliveryState; providerTransactionId: string | null }>
  provenance: AcademicSourceEvidence[]
}

export type AdmissionsTestAttempt = {
  id: string
  applicantId: string
  testType: string
  testDate: string
  overallScore: number | null
  compositeScore: number | null
  sectionScores: Record<string, number>
  percentile: number | null
  writingScore: number | null
  candidateOrReportNumber: string | null
  validUntil: string | null
  scoreArtifactId: string | null
  officialReportState: AcademicDeliveryState
  recipients: Array<{ institution: string; institutionCode: string | null; departmentCode: string | null; state: AcademicDeliveryState; providerTransactionId: string | null }>
  provenance: AcademicSourceEvidence[]
}

export type InstitutionDocumentDelivery = {
  institution: string
  requiredDocumentTypes: string[]
  deliveryMode: AcademicSubmissionMethod['mode']
  state: AcademicDeliveryState
  providerId: string | null
  trackingId: string | null
  recipient: string | null
  commitmentAt: string | null
  commitmentDueAt: string | null
  evidence: AcademicCompletionEvidence[]
  blocker: string | null
}

export function canAdvanceAcademicDeliveryState(from: AcademicDeliveryState, to: AcademicDeliveryState) {
  if (from === to) return true
  const transitions: Partial<Record<AcademicDeliveryState, AcademicDeliveryState[]>> = {
    not_started: ['order_ready', 'awaiting_user_auth', 'ordered', 'blocked'],
    order_ready: ['awaiting_user_auth', 'ordered', 'blocked'],
    awaiting_user_auth: ['ordered', 'blocked'],
    ordered: ['processing', 'dispatched', 'blocked'],
    processing: ['dispatched', 'delivered', 'rejected', 'blocked'],
    dispatched: ['delivered', 'accepted', 'rejected', 'replacement_needed', 'blocked'],
    delivered: ['accepted', 'rejected', 'replacement_needed', 'blocked'],
    accepted: [],
    rejected: ['replacement_needed', 'order_ready', 'blocked'],
    replacement_needed: ['order_ready', 'awaiting_user_auth', 'blocked'],
    blocked: ['order_ready', 'awaiting_user_auth', 'blocked'],
  }
  return transitions[from]?.includes(to) ?? false
}

export function transitionAcademicDelivery(input: { delivery: InstitutionDocumentDelivery; to: AcademicDeliveryState; evidence?: AcademicCompletionEvidence[] }) {
  if (!canAdvanceAcademicDeliveryState(input.delivery.state, input.to)) throw new Error(`Illegal academic delivery transition ${input.delivery.state} → ${input.to}.`)
  if (['ordered', 'dispatched', 'delivered', 'accepted'].includes(input.to) && !(input.evidence ?? []).some(item => item.verified)) throw new Error('Provider, registrar, or recipient evidence is required before advancing academic delivery state.')
  return { ...input.delivery, state: input.to, ...(input.evidence?.length ? { evidence: [...input.delivery.evidence, ...input.evidence] } : {}) }
}

export const credentialEvaluationStates = [
  'requirement_verified',
  'provider_selected',
  'account_needed',
  'awaiting_auth',
  'account_ready',
  'evaluation_order_ready',
  'payment_required',
  'ordered',
  'reference_number_issued',
  'documents_requested',
  'awaiting_institution_documents',
  'documents_received',
  'evaluation_in_progress',
  'evaluation_complete',
  'report_dispatch_pending',
  'report_sent',
  'university_received',
  'complete',
  'blocked',
] as const
export type CredentialEvaluationState = typeof credentialEvaluationStates[number]

export type CredentialEvaluationCase = {
  id: string
  applicantId: string
  provider: string
  evaluationType: 'course_by_course' | 'document_by_document' | 'gpa_evaluation' | 'transcript_verification' | 'icap_storage' | 'other'
  applicationCaseIds: string[]
  requirementIds: string[]
  recipientInstitutions: string[]
  requiredDocuments: string[]
  requiredDeliveryRoute: string
  referenceNumber: string | null
  reportId: string | null
  translationRules: string[]
  deadline: string | null
  expectedProcessingTime: string | null
  cost: AcademicCost | null
  state: CredentialEvaluationState
  institutionDeliveries: InstitutionDocumentDelivery[]
  reportDispatchState: AcademicDeliveryState
  universityReceiptStates: Record<string, AcademicDeliveryState>
  sourceEvidence: AcademicSourceEvidence[]
  blocker: string | null
  idempotencyKey: string
}

export type AcademicEvidenceSourceInput = {
  id?: string
  url?: string | null
  authority?: AcademicSourceAuthority
  sourceType?: string
  excerpt?: string
  claims?: string[]
  retrievedAt?: string
}

export type AcademicContextInput = {
  applicantId: string
  applicantProfile?: unknown
  canonicalCv?: unknown
  uploadedDocuments?: unknown[]
  transcripts?: unknown[]
  degreeCertificates?: unknown[]
  proofOfGraduation?: unknown[]
  scoreReports?: unknown[]
  previousApplicationCases?: unknown[]
  previousUniversityUploads?: unknown[]
  existingCredentialEvaluations?: unknown[]
  gmailAttachments?: unknown[]
  previousProviderConfirmations?: unknown[]
  confirmedUserAnswers?: unknown[]
  reusableAcademicHistory?: unknown
}

export type AcademicContextResolution = {
  version: typeof ACADEMIC_EVIDENCE_WORKFLOW_VERSION
  checkedSources: string[]
  institutions: EducationInstitutionRecord[]
  artifacts: AcademicArtifactReference[]
  languageTestAttempts: LanguageTestAttempt[]
  admissionsTestAttempts: AdmissionsTestAttempt[]
  credentialEvaluations: CredentialEvaluationCase[]
  autoResolvedFacts: Array<{ key: string; value: unknown; sourceIds: string[]; confidence: 'high' | 'medium' | 'low' }>
  unresolvedFacts: string[]
  conflicts: Array<{ key: string; values: unknown[]; sourceIds: string[]; consequence: string }>
  reusableAcademicHistory: Record<string, unknown>
}

export type AcademicRule = {
  requirementType: AcademicEvidenceRequirementType
  institution?: string | null
  institutions?: string[]
  requiredness?: AcademicRequirementClass
  stage?: AcademicRequirementStage
  officialStatus?: AcademicEvidenceRequirement['officialStatus']
  deadline?: string | null
  deadlineTimezone?: string | null
  acceptedEvidenceTypes?: string[]
  submissionMethod?: Partial<AcademicSubmissionMethod> & { mode: AcademicSubmissionMethod['mode'] }
  sourceEvidence?: AcademicEvidenceSourceInput[]
  source?: AcademicEvidenceSourceInput
  externalProvider?: Partial<AcademicExternalProvider> & { name: string }
  cost?: Partial<AcademicCost>
  approvalRequirement?: AcademicEvidenceRequirement['approvalRequirement']
  dependencies?: string[]
  exactRule?: Record<string, unknown>
  institutionsMustSendSeparately?: boolean
  finalAfterAdmission?: boolean
  idempotencyKey?: string
}

export type AcademicApplicationInput = {
  applicationCaseId: string
  institution: string
  programme: string
  deadline?: string | null
  deadlineTimezone?: string | null
  rules?: AcademicRule[]
  requirements?: AcademicRule[]
}

export type AcademicEvidenceCoverageMap = {
  entries: Array<{
    evidenceId: string
    label: string
    kind: string
    applicationCaseIds: string[]
    requirementIds: string[]
    coverageCount: number
    avoidedDuplicateCost: AcademicCost | null
  }>
  duplicateActionsPrevented: number
  avoidedCost: AcademicCost[]
}

export type AcademicProgressInteraction = RecommendationInteraction

export type AcademicAcademicAction = {
  kind: 'reuse_artifact' | 'attach_artifact' | 'request_official_document' | 'request_waiver_evidence' | 'select_language_test' | 'select_test_date' | 'report_language_score' | 'select_admissions_test' | 'submit_optional_score' | 'secure_provider_handoff' | 'wait_external' | 'verify_portal_receipt'
  requirementId: string
  applicationCaseId: string
  label: string
  rationale: string
  idempotencyKey: string
  consequential: boolean
}

export type AcademicInteractionMetric = {
  interactionId: string
  requirementId: string
  kind: string
  outcome: 'answered' | 'invalid'
  resumedAutomatically: boolean
  reusableContextSaved: boolean
  createdAt: string
}

export type AcademicEvidencePlan = {
  version: typeof ACADEMIC_EVIDENCE_WORKFLOW_VERSION
  context: AcademicContextResolution
  requirements: AcademicEvidenceRequirement[]
  credentialEvaluationCases: CredentialEvaluationCase[]
  coverageMap: AcademicEvidenceCoverageMap
  nextAction: AcademicAcademicAction | null
  interaction: AcademicProgressInteraction | null
  metrics: {
    requirementsDetected: number
    automaticallyResolvedRequirements: number
    reusedArtifacts: number
    waiverResolutions: number
    attachmentsRequested: number
    structuredSelections: number
    authenticationHandoffs: number
    paymentApprovals: number
    rareFreeTextInputs: number
    externalRequests: number
    userInterruptionsAvoided: number
    duplicateCostsPrevented: number
    autonomousResolutionRate: number
  }
  blockers: string[]
}

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown, maximum = 2_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function nullableText(value: unknown, maximum = 2_000) {
  const result = text(value, maximum)
  return result || null
}

function bool(value: unknown) {
  return value === true
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArray(value: unknown, maximum = 100) {
  return array(value).map(item => text(item, 1_000)).filter(Boolean).slice(0, maximum)
}

function unwrapFact(value: unknown): unknown {
  const item = record(value)
  if ('value' in item && ('provenance' in item || 'sourceIds' in item || 'confidence' in item)) return item.value
  return value
}

function sourceIds(value: unknown): string[] {
  const item = record(value)
  return [
    ...stringArray(item.sourceIds, 20),
    ...stringArray(record(item.provenance).sourceAssetIds, 20),
    ...stringArray(record(item.provenance).sourceIds, 20),
    ...([text(record(item.provenance).sourceId, 200)].filter(Boolean)),
    ...([text(item.sourceId, 200)].filter(Boolean)),
  ].filter((value, index, values) => values.indexOf(value) === index)
}

function normalize(value: unknown) {
  return text(value, 400).toLocaleLowerCase().replace(/[&.'’`]/g, '').replace(/\b(the|university|of)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function slug(value: unknown) {
  return normalize(value).replace(/\s+/g, '-').slice(0, 120) || 'unknown'
}

function now() {
  return new Date().toISOString()
}

function validDate(value: string | null | undefined) {
  return Boolean(value && Number.isFinite(Date.parse(value)))
}

function monthsAfter(date: string, months: number) {
  const parsed = new Date(date)
  if (!Number.isFinite(parsed.getTime())) return null
  parsed.setUTCMonth(parsed.getUTCMonth() + months)
  return parsed.toISOString()
}

function authoritativeSource(input: AcademicEvidenceSourceInput, index: number): AcademicSourceEvidence {
  const authority = input.authority ?? 'official'
  return {
    id: text(input.id, 240) || `academic-source:${index + 1}:${slug(input.url ?? input.excerpt)}`,
    url: nullableText(input.url, 2_000),
    authority,
    sourceType: text(input.sourceType, 160) || authority,
    excerpt: text(input.excerpt, 2_000),
    claims: stringArray(input.claims, 30),
    retrievedAt: text(input.retrievedAt, 80) || now(),
  }
}

function sourceList(rule: AcademicRule) {
  const raw = [
    ...array(rule.sourceEvidence),
    ...(rule.source ? [rule.source] : []),
  ]
  return raw.map((item, index) => authoritativeSource(record(item), index))
}

function isAuthoritative(source: AcademicSourceEvidence) {
  return [
    'official',
    'official_programme_page',
    'graduate_school',
    'application_portal',
    'admitted_student_instructions',
    'official_testing_guidance',
    'official_evaluation_guidance',
    'provider',
  ].includes(source.authority)
}

function sourceBacked(sources: AcademicSourceEvidence[]) {
  return sources.some(source => isAuthoritative(source) && Boolean(source.url || source.excerpt))
}

function filenamePart(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'Document'
}

export function buildProfessionalTranscriptFilename(firstName: string, lastName: string, institution: string) {
  return `${filenamePart(firstName)}_${filenamePart(lastName)}_${filenamePart(institution)}_Transcript.pdf`
}

export function academicEvidenceRequirementIsRelevant(requirement: Pick<AcademicEvidenceRequirement, 'requiredness'>) {
  return requirement.requiredness !== 'not_accepted'
}

export function academicEvidenceRequirementIsComplete(requirement: Pick<AcademicEvidenceRequirement, 'requiredness' | 'status' | 'completionEvidence'>) {
  if (requirement.requiredness === 'not_accepted') return true
  if (requirement.requiredness === 'waived') return requirement.status === 'complete' || requirement.status === 'waiver_evidence_needed' && requirement.completionEvidence.some(item => item.kind === 'waiver_approval' && item.verified)
  return requirement.status === 'complete'
}

export function academicRequirementDependenciesSatisfied(requirement: Pick<AcademicEvidenceRequirement, 'dependencies'>, requirements: AcademicEvidenceRequirement[]) {
  const byId = new Map(requirements.map(item => [item.id, item]))
  return requirement.dependencies.every(id => {
    const dependency = byId.get(id)
    return Boolean(dependency && academicEvidenceRequirementIsComplete(dependency))
  })
}

export function inspectTranscriptArtifact(input: {
  artifact: Partial<AcademicArtifactReference> & { id: string; applicantId: string; filename: string }
  expectedApplicantId?: string
  expectedApplicantName?: string
  expectedInstitution?: string
  requireGradingLegend?: boolean
  requireDegreeConferral?: boolean
  requireTranslation?: boolean
  requireCertifiedTranslation?: boolean
  maximumBytes?: number
}): { accepted: boolean; verification: AcademicArtifactVerification; reasons: string[]; artifact: AcademicArtifactReference } {
  const raw = record(input.artifact.content)
  const pageNumbers = array(raw.pageNumbers ?? raw.pages).map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0).sort((left, right) => left - right)
  const pageCount = numberValue(input.artifact.pageCount) ?? numberValue(raw.pageCount)
  const declaredPageCount = numberValue(raw.declaredPageCount) ?? pageCount
  const institution = nullableText(input.artifact.institution) ?? nullableText(raw.institution)
  const applicantId = input.artifact.applicantId
  const officialStatus = input.artifact.officialStatus ?? 'unknown'
  const content = {
    applicantIdentityPresent: bool(raw.applicantIdentityPresent ?? raw.identityPresent),
    institutionPresent: bool(raw.institutionPresent) || Boolean(institution),
    courseGradeContentPresent: bool(raw.courseGradeContentPresent ?? raw.hasCourseGrades ?? raw.courseGradesPresent),
    readable: raw.readable === undefined ? Boolean(raw.extractedText || raw.courseGradeContentPresent || raw.hasCourseGrades) : bool(raw.readable),
    gradingLegendPresent: bool(raw.gradingLegendPresent ?? raw.hasGradingLegend),
    degreeConferralPresent: bool(raw.degreeConferralPresent ?? raw.degreeConferred),
    translationPresent: bool(raw.translationPresent ?? raw.hasTranslation),
    certifiedTranslation: bool(raw.certifiedTranslation ?? raw.isCertifiedTranslation),
    originalDocumentAttached: bool(raw.originalDocumentAttached ?? raw.originalAttached),
    pageNumbers,
    declaredPageCount,
  }
  const artifact: AcademicArtifactReference = {
    id: input.artifact.id,
    applicantId,
    applicationCaseId: input.artifact.applicationCaseId ?? null,
    artifactType: text(input.artifact.artifactType, 120) || 'transcript',
    institution,
    provider: nullableText(input.artifact.provider, 240),
    filename: input.artifact.filename,
    mimeType: nullableText(input.artifact.mimeType, 160),
    sizeBytes: numberValue(input.artifact.sizeBytes),
    pageCount,
    checksum: nullableText(input.artifact.checksum, 128),
    originalArtifactId: nullableText(input.artifact.originalArtifactId, 120),
    transformationHistory: stringArray(input.artifact.transformationHistory, 30),
    source: text(input.artifact.source, 120) || 'uploaded_document',
    issueDate: nullableText(input.artifact.issueDate, 80),
    language: nullableText(input.artifact.language, 120),
    officialStatus,
    verification: 'candidate',
    content,
    provenance: array(input.artifact.provenance).map((item, index) => authoritativeSource(record(item), index)),
  }
  const reasons: string[] = []
  if (input.expectedApplicantId && applicantId !== input.expectedApplicantId) reasons.push('wrong_applicant')
  if (input.expectedInstitution && normalize(institution) !== normalize(input.expectedInstitution)) reasons.push('wrong_institution')
  if (!content.applicantIdentityPresent && input.expectedApplicantName) reasons.push('applicant_identity_missing')
  if (!content.institutionPresent) reasons.push('institution_missing')
  if (!content.readable) reasons.push('unreadable')
  if (!content.courseGradeContentPresent) reasons.push('course_grade_content_missing')
  if (pageCount !== null && pageNumbers.length > 0) {
    const expected = Array.from({ length: pageCount }, (_, index) => index + 1)
    if (expected.some(page => !pageNumbers.includes(page))) reasons.push('missing_page')
  }
  if (input.maximumBytes !== undefined && artifact.sizeBytes !== null && artifact.sizeBytes > input.maximumBytes) reasons.push('oversized_pdf')
  if (input.requireGradingLegend && !content.gradingLegendPresent) reasons.push('grading_legend_missing')
  if (input.requireDegreeConferral && !content.degreeConferralPresent) reasons.push('degree_conferral_missing')
  if (input.requireTranslation && !content.translationPresent) reasons.push('translation_missing')
  if (input.requireCertifiedTranslation && !content.certifiedTranslation) reasons.push('certified_translation_missing')
  if (artifact.mimeType && artifact.mimeType !== 'application/pdf') reasons.push('wrong_format')
  artifact.verification = reasons.length ? 'rejected' : 'verified'
  return { accepted: reasons.length === 0, verification: artifact.verification, reasons, artifact }
}

export function createDerivedAcademicArtifact(input: {
  original: AcademicArtifactReference
  derivedId: string
  derivedChecksum: string
  filename: string
  transformations: string[]
  applicationCaseId?: string | null
}) {
  const forbidden = input.transformations.filter(transformation => /grade|score|course.?name|degree.?title|date|institution|signature|seal|marking/i.test(transformation))
  if (!input.original.id || !input.original.checksum) throw new Error('An immutable original artifact and checksum are required.')
  if (forbidden.length) throw new Error(`Academic facts cannot be transformed: ${forbidden.join(', ')}`)
  return {
    ...input.original,
    id: input.derivedId,
    applicationCaseId: input.applicationCaseId ?? input.original.applicationCaseId,
    filename: input.filename,
    checksum: input.derivedChecksum,
    originalArtifactId: input.original.id,
    transformationHistory: [...input.original.transformationHistory, ...input.transformations],
    source: 'derived_artifact',
    verification: 'verified' as const,
  }
}

function candidateArtifact(input: unknown, applicantId: string): AcademicArtifactReference | null {
  const item = record(input)
  const id = text(item.id ?? item.assetId ?? item.fileAssetId, 120)
  if (!id) return null
  const applicant = text(item.applicantId ?? item.userId, 120) || applicantId
  if (applicant !== applicantId) return null
  const metadata = record(item.metadata)
  const content = record(item.content ?? item.extractedContent ?? metadata.content)
  const parsedContent: AcademicArtifactReference['content'] = {
    applicantIdentityPresent: bool(content.applicantIdentityPresent ?? content.identityPresent),
    institutionPresent: bool(content.institutionPresent) || Boolean(item.institution ?? item.university ?? metadata.institution ?? content.institution),
    courseGradeContentPresent: bool(content.courseGradeContentPresent ?? content.hasCourseGrades ?? content.courseGradesPresent),
    readable: content.readable === undefined ? Boolean(content.extractedText || content.courseGradeContentPresent || content.hasCourseGrades) : bool(content.readable),
    gradingLegendPresent: bool(content.gradingLegendPresent ?? content.hasGradingLegend),
    degreeConferralPresent: bool(content.degreeConferralPresent ?? content.degreeConferred),
    translationPresent: bool(content.translationPresent ?? content.hasTranslation),
    certifiedTranslation: bool(content.certifiedTranslation ?? content.isCertifiedTranslation),
    originalDocumentAttached: bool(content.originalDocumentAttached ?? content.originalAttached),
    pageNumbers: array(content.pageNumbers ?? content.pages).map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0),
    declaredPageCount: numberValue(content.declaredPageCount ?? content.pageCount),
  }
  const type = text(item.artifactType ?? item.type ?? metadata.artifactType, 120) || 'document'
  const artifact: Partial<AcademicArtifactReference> & { id: string; applicantId: string; filename: string } = {
    id,
    applicantId: applicant,
    applicationCaseId: nullableText(item.applicationCaseId ?? item.caseId, 120),
    artifactType: type,
    institution: nullableText(item.institution ?? item.university ?? metadata.institution, 240),
    provider: nullableText(item.provider ?? metadata.provider, 240),
    filename: text(item.filename ?? item.originalFilename ?? item.name, 255) || `${id}.pdf`,
    mimeType: nullableText(item.mimeType ?? item.mime_type, 160),
    sizeBytes: numberValue(item.sizeBytes ?? item.size_bytes),
    pageCount: numberValue(item.pageCount ?? item.page_count ?? content.pageCount),
    checksum: nullableText(item.checksum, 128),
    originalArtifactId: nullableText(item.originalArtifactId ?? item.original_asset_id, 120),
    transformationHistory: stringArray(item.transformationHistory ?? metadata.transformationHistory, 30),
    source: text(item.source, 120) || 'uploaded_document',
    issueDate: nullableText(item.issueDate ?? metadata.issueDate, 80),
    language: nullableText(item.language ?? metadata.language, 120),
    officialStatus: ['official', 'unofficial', 'unknown', 'not_applicable'].includes(text(item.officialStatus ?? metadata.officialStatus, 40)) ? text(item.officialStatus ?? metadata.officialStatus, 40) as AcademicArtifactOfficialStatus : 'unknown',
    content: parsedContent,
    provenance: array(item.provenance ?? metadata.provenance).map((value, index) => authoritativeSource(record(value), index)),
  }
  const inspected = inspectTranscriptArtifact({ artifact })
  return inspected.artifact
}

function profileEducation(profile: RecordValue): Array<{ value: RecordValue; sourceIds: string[] }> {
  const values = array(profile.education ?? profile.educationHistory ?? profile.academicHistory)
  return values.map(item => ({ value: record(unwrapFact(item)), sourceIds: sourceIds(item) }))
}

function collectInstitutions(input: AcademicContextInput, artifacts: AcademicArtifactReference[]) {
  const profile = record(unwrapFact(input.applicantProfile))
  const candidates: Array<{ value: RecordValue; sourceIds: string[] }> = profileEducation(profile)
  const cv = record(unwrapFact(input.canonicalCv))
  for (const item of array(cv.education ?? cv.educationHistory)) candidates.push({ value: record(unwrapFact(item)), sourceIds: sourceIds(item).length ? sourceIds(item) : ['canonical_cv'] })
  for (const item of array(input.previousApplicationCases)) {
    const value = record(unwrapFact(record(item).education ?? record(record(item).profile).education))
    if (Object.keys(value).length) candidates.push({ value, sourceIds: sourceIds(item).length ? sourceIds(item) : ['previous_application'] })
  }
  for (const artifact of artifacts) {
    if (artifact.institution) candidates.push({ value: { institution: artifact.institution, language: artifact.language, officialStatus: artifact.officialStatus }, sourceIds: [artifact.id] })
  }
  const groups = new Map<string, Array<{ value: RecordValue; sourceIds: string[] }>>()
  for (const candidate of candidates) {
    const institution = text(candidate.value.institution ?? candidate.value.university ?? candidate.value.school ?? candidate.value.name, 240)
    if (!institution) continue
    const key = normalize(institution)
    groups.set(key, [...(groups.get(key) ?? []), { ...candidate, value: { ...candidate.value, institution } }])
  }
  return [...groups.entries()].map(([key, entries], index) => {
    const first = entries[0]!.value
    const names = [...new Set(entries.map(entry => text(entry.value.institution, 240)).filter(Boolean))]
    const degrees = [...new Set(entries.map(entry => text(entry.value.degree ?? entry.value.degreeTitle, 240)).filter(Boolean))]
    const conferralDates = [...new Set(entries.map(entry => text(entry.value.degreeConferralDate ?? entry.value.conferralDate ?? entry.value.graduationDate, 80)).filter(Boolean))]
    const conflicts = [
      ...(degrees.length > 1 ? ['degree_conflict'] : []),
      ...(conferralDates.length > 1 ? ['degree_conferral_date_conflict'] : []),
    ]
    const transcriptArtifacts = artifacts.filter(artifact => normalize(artifact.institution) === key && /transcript|grade.?report|academic.?record/i.test(artifact.artifactType)).map(artifact => artifact.id)
    const certificate = artifacts.find(artifact => normalize(artifact.institution) === key && /degree|diploma|graduation|result|completion/i.test(artifact.artifactType))
    const profileStatus = text(first.graduationStatus ?? first.status, 80)
    const status: EducationInstitutionRecord['graduationStatus'] = [
      'currently_enrolled', 'coursework_completed', 'result_issued', 'degree_awarded', 'certificate_pending', 'certificate_issued',
    ].includes(profileStatus) ? profileStatus as EducationInstitutionRecord['graduationStatus'] : certificate ? 'certificate_issued' : 'unknown'
    return {
      id: `education:${index + 1}:${slug(key)}`,
      applicantId: input.applicantId,
      officialInstitutionName: names[0] ?? key,
      alternateNames: names.slice(1),
      country: nullableText(first.country ?? first.countryName, 120),
      degree: degrees[0] ?? null,
      programme: nullableText(first.programme ?? first.field ?? first.major, 240),
      attendanceStart: nullableText(first.startDate ?? first.attendanceStart, 80),
      attendanceEnd: nullableText(first.endDate ?? first.attendanceEnd, 80),
      graduationStatus: status,
      degreeConferralDate: conferralDates[0] ?? null,
      transcriptArtifacts,
      transcriptType: transcriptArtifacts.length ? 'transcript' : null,
      language: nullableText(first.language, 120),
      officialStatus: certificate?.officialStatus ?? artifacts.find(artifact => artifact.id === transcriptArtifacts[0])?.officialStatus ?? 'unknown',
      gradingSystem: nullableText(first.gradingSystem ?? first.gradingScale, 240),
      gradingScaleArtifactId: artifacts.find(artifact => normalize(artifact.institution) === key && /grading|legend|scale/i.test(artifact.artifactType))?.id ?? null,
      orderingMethod: record(first.orderingMethod).mode ? record(first.orderingMethod) : null,
      registrarContact: nullableText(first.registrarEmail ?? first.registrarContact, 320),
      electronicTranscriptProvider: nullableText(first.electronicTranscriptProvider ?? first.transcriptProvider, 240),
      previousVerifiedDeliveries: stringArray(first.previousVerifiedDeliveries, 20),
      sourceIds: [...new Set(entries.flatMap(entry => entry.sourceIds))],
      conflicts,
    } satisfies EducationInstitutionRecord
  })
}

function parseLanguageAttempt(input: unknown, applicantId: string, index: number): LanguageTestAttempt | null {
  const item = record(input)
  const testDate = text(item.testDate ?? item.date ?? item.examDate, 80)
  const testType = text(item.testType ?? item.test ?? item.provider, 120)
  if (!testDate || !testType) return null
  const sections = record(item.sectionScores ?? item.subscores ?? item.sections)
  const sectionScores = Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, numberValue(value)]).filter((entry): entry is [string, number] => entry[1] !== null))
  return {
    id: text(item.id ?? item.reportId, 120) || `language-attempt:${index + 1}:${slug(testType)}:${testDate}`,
    applicantId,
    testProvider: text(item.testProvider ?? item.provider, 160) || testType,
    testType,
    testVersion: nullableText(item.testVersion ?? item.version, 120),
    testDate,
    overallScore: numberValue(item.overallScore ?? item.overall),
    sectionScores,
    candidateOrReportNumber: nullableText(item.candidateOrReportNumber ?? item.reportNumber ?? item.candidateNumber, 160),
    validUntil: nullableText(item.validUntil ?? item.expiryDate ?? item.expiresAt, 80),
    scoreReportArtifactId: nullableText(item.scoreReportArtifactId ?? item.artifactId, 120),
    officialReportState: text(item.officialReportState, 80) as AcademicDeliveryState || 'not_started',
    recipients: array(item.recipients).map(recipient => {
      const value = record(recipient)
      return { institution: text(value.institution, 240), institutionCode: nullableText(value.institutionCode, 80), departmentCode: nullableText(value.departmentCode, 80), state: text(value.state, 80) as AcademicDeliveryState || 'not_started', providerTransactionId: nullableText(value.providerTransactionId, 160) }
    }),
    provenance: array(item.provenance).map((source, sourceIndex) => authoritativeSource(record(source), sourceIndex)),
  }
}

function parseAdmissionsAttempt(input: unknown, applicantId: string, index: number): AdmissionsTestAttempt | null {
  const item = record(input)
  const testDate = text(item.testDate ?? item.date ?? item.examDate, 80)
  const testType = text(item.testType ?? item.test, 120)
  if (!testDate || !testType) return null
  const sections = record(item.sectionScores ?? item.subscores ?? item.sections)
  const sectionScores = Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, numberValue(value)]).filter((entry): entry is [string, number] => entry[1] !== null))
  return {
    id: text(item.id ?? item.reportId, 120) || `admissions-attempt:${index + 1}:${slug(testType)}:${testDate}`,
    applicantId,
    testType,
    testDate,
    overallScore: numberValue(item.overallScore ?? item.totalScore ?? item.compositeScore),
    compositeScore: numberValue(item.compositeScore ?? item.totalScore),
    sectionScores,
    percentile: numberValue(item.percentile),
    writingScore: numberValue(item.writingScore ?? record(sections).writing),
    candidateOrReportNumber: nullableText(item.candidateOrReportNumber ?? item.reportNumber ?? item.candidateNumber, 160),
    validUntil: nullableText(item.validUntil ?? item.expiryDate ?? item.expiresAt, 80),
    scoreArtifactId: nullableText(item.scoreArtifactId ?? item.artifactId, 120),
    officialReportState: text(item.officialReportState, 80) as AcademicDeliveryState || 'not_started',
    recipients: array(item.recipients).map(recipient => {
      const value = record(recipient)
      return { institution: text(value.institution, 240), institutionCode: nullableText(value.institutionCode, 80), departmentCode: nullableText(value.departmentCode, 80), state: text(value.state, 80) as AcademicDeliveryState || 'not_started', providerTransactionId: nullableText(value.providerTransactionId, 160) }
    }),
    provenance: array(item.provenance).map((source, sourceIndex) => authoritativeSource(record(source), sourceIndex)),
  }
}

function parseCredentialEvaluation(input: unknown, applicantId: string, index: number): CredentialEvaluationCase | null {
  const item = record(input)
  const provider = text(item.provider ?? item.service, 160)
  const evaluationType = text(item.evaluationType ?? item.productType ?? item.type, 80)
  if (!provider || !evaluationType) return null
  const normalizedEvaluationType: CredentialEvaluationCase['evaluationType'] = evaluationType === 'course-by-course' ? 'course_by_course' : evaluationType === 'document-by-document' ? 'document_by_document' : ['course_by_course', 'document_by_document', 'gpa_evaluation', 'transcript_verification', 'icap_storage', 'other'].includes(evaluationType) ? evaluationType as CredentialEvaluationCase['evaluationType'] : 'other'
  const deliveries = array(item.institutionDeliveries ?? item.institutions).map(value => {
    const delivery = record(value)
    return {
      institution: text(delivery.institution, 240),
      requiredDocumentTypes: stringArray(delivery.requiredDocumentTypes ?? delivery.documents, 20),
      deliveryMode: (text(delivery.deliveryMode ?? delivery.mode, 80) as AcademicSubmissionMethod['mode']) || 'institution_direct',
      state: (text(delivery.state, 80) as AcademicDeliveryState) || 'not_started',
      providerId: nullableText(delivery.providerId, 160),
      trackingId: nullableText(delivery.trackingId, 160),
      recipient: nullableText(delivery.recipient, 320),
      commitmentAt: nullableText(delivery.commitmentAt, 80),
      commitmentDueAt: nullableText(delivery.commitmentDueAt, 80),
      evidence: [],
      blocker: nullableText(delivery.blocker, 1_000),
    } satisfies InstitutionDocumentDelivery
  }).filter(item => item.institution)
  return {
    id: text(item.id, 120) || `credential-evaluation:${index + 1}:${slug(provider)}:${slug(normalizedEvaluationType)}`,
    applicantId,
    provider,
    evaluationType: normalizedEvaluationType,
    applicationCaseIds: stringArray(item.applicationCaseIds ?? item.application_case_ids, 80),
    requirementIds: stringArray(item.requirementIds ?? item.requirement_ids, 80),
    recipientInstitutions: stringArray(item.recipientInstitutions ?? item.recipients, 80),
    requiredDocuments: stringArray(item.requiredDocuments, 30),
    requiredDeliveryRoute: text(item.requiredDeliveryRoute, 500),
    referenceNumber: nullableText(item.referenceNumber ?? item.reference_number, 160),
    reportId: nullableText(item.reportId, 160),
    translationRules: stringArray(item.translationRules, 20),
    deadline: nullableText(item.deadline, 80),
    expectedProcessingTime: nullableText(item.expectedProcessingTime, 240),
    cost: numberValue(item.cost) === null ? null : { amount: numberValue(item.cost)!, currency: text(item.currency, 3) || 'USD', known: true, sourceEvidenceIds: stringArray(item.costSourceEvidenceIds, 20) },
    state: (text(item.state, 80) as CredentialEvaluationState) || 'requirement_verified',
    institutionDeliveries: deliveries,
    reportDispatchState: (text(item.reportDispatchState, 80) as AcademicDeliveryState) || 'not_started',
    universityReceiptStates: Object.fromEntries(Object.entries(record(item.universityReceiptStates)).map(([key, value]) => [key, text(value, 80) as AcademicDeliveryState])),
    sourceEvidence: array(item.sourceEvidence ?? item.provenance).map((source, sourceIndex) => authoritativeSource(record(source), sourceIndex)),
    blocker: nullableText(item.blocker, 1_000),
    idempotencyKey: text(item.idempotencyKey, 300) || `credential-evaluation:${slug(provider)}:${slug(normalizedEvaluationType)}`,
  }
}

export function resolveAcademicContext(input: AcademicContextInput): AcademicContextResolution {
  const uploaded = [
    ...array(input.uploadedDocuments),
    ...array(input.transcripts),
    ...array(input.degreeCertificates),
    ...array(input.proofOfGraduation),
    ...array(input.scoreReports),
    ...array(input.previousUniversityUploads),
    ...array(input.gmailAttachments),
  ]
  const artifacts = uploaded.map(item => candidateArtifact(item, input.applicantId)).filter((item): item is AcademicArtifactReference => Boolean(item))
  const uniqueArtifacts = [...new Map(artifacts.map(item => [item.id, item])).values()]
  const institutions = collectInstitutions(input, uniqueArtifacts)
  const rawLanguageAttempts = [
    ...array(record(unwrapFact(input.applicantProfile)).languageTests),
    ...array(record(unwrapFact(input.applicantProfile)).testScores).filter(item => /ielts|toefl|pte|duolingo|cambridge/i.test(text(record(item).testType ?? record(item).test, 120))),
    ...array(input.scoreReports).filter(item => /ielts|toefl|pte|duolingo|cambridge/i.test(text(record(item).testType ?? record(item).test ?? record(item).provider, 120))),
  ]
  const rawAdmissionsAttempts = [
    ...array(record(unwrapFact(input.applicantProfile)).admissionsTests),
    ...array(record(unwrapFact(input.applicantProfile)).testScores).filter(item => /gre|gmat|ea|lsat|admission/i.test(text(record(item).testType ?? record(item).test, 120))),
    ...array(input.scoreReports).filter(item => /gre|gmat|ea|lsat|admission/i.test(text(record(item).testType ?? record(item).test, 120))),
  ]
  const languageTestAttempts = [...new Map(rawLanguageAttempts.map((item, index) => parseLanguageAttempt(item, input.applicantId, index)).filter((item): item is LanguageTestAttempt => Boolean(item)).map(item => [item.id, item])).values()]
  const admissionsTestAttempts = [...new Map(rawAdmissionsAttempts.map((item, index) => parseAdmissionsAttempt(item, input.applicantId, index)).filter((item): item is AdmissionsTestAttempt => Boolean(item)).map(item => [item.id, item])).values()]
  const credentialEvaluations = [...new Map([
    ...array(input.existingCredentialEvaluations),
    ...array(input.previousProviderConfirmations).filter(item => /wes|ece|spantran|credential|evaluation/i.test(JSON.stringify(item))),
  ].map((item, index) => parseCredentialEvaluation(item, input.applicantId, index)).filter((item): item is CredentialEvaluationCase => Boolean(item)).map(item => [item.id, item])).values()]
  const conflicts = institutions.flatMap(institution => institution.conflicts.map(conflict => ({ key: `${institution.officialInstitutionName}:${conflict}`, values: [institution.degreeConferralDate, institution.degree], sourceIds: institution.sourceIds, consequence: 'Do not silently choose a degree or conferral fact used in a consequential requirement.' })))
  const autoResolvedFacts: AcademicContextResolution['autoResolvedFacts'] = []
  for (const institution of institutions) {
    if (!institution.conflicts.length) autoResolvedFacts.push({ key: `education:${institution.id}`, value: institution, sourceIds: institution.sourceIds, confidence: institution.sourceIds.length > 1 ? 'high' : 'medium' })
  }
  for (const artifact of uniqueArtifacts.filter(item => item.verification === 'verified')) autoResolvedFacts.push({ key: `artifact:${artifact.id}`, value: artifact, sourceIds: [artifact.id], confidence: 'high' })
  for (const attempt of [...languageTestAttempts, ...admissionsTestAttempts]) autoResolvedFacts.push({ key: `test:${attempt.id}`, value: attempt, sourceIds: attempt.provenance.map(item => item.id), confidence: attempt.provenance.length ? 'high' : 'medium' })
  for (const answer of array(input.confirmedUserAnswers)) {
    const item = record(unwrapFact(answer))
    const key = text(item.mapsToRequirement ?? item.requirementId ?? item.key ?? item.field, 300)
    const hasValue = Object.prototype.hasOwnProperty.call(item, 'value') || Object.prototype.hasOwnProperty.call(item, 'answer') || Object.prototype.hasOwnProperty.call(item, 'response')
    const value = Object.prototype.hasOwnProperty.call(item, 'value') ? item.value : Object.prototype.hasOwnProperty.call(item, 'answer') ? item.answer : item.response
    if (key && hasValue && value !== null && value !== undefined) autoResolvedFacts.push({ key, value, sourceIds: [text(item.interactionId, 300) ? `interaction:${text(item.interactionId, 300)}` : 'confirmed_user_answer'], confidence: 'high' })
  }
  const unresolvedFacts = conflicts.map(conflict => conflict.key)
  const reusable = record(input.reusableAcademicHistory)
  return {
    version: ACADEMIC_EVIDENCE_WORKFLOW_VERSION,
    checkedSources: ['ApplicantProfile', 'canonical_cv', 'uploaded_documents', 'stored_transcripts', 'degree_certificates', 'score_reports', 'previous_ApplicationCases', 'previous_university_uploads', 'existing_credential_evaluations', 'Gmail_attachments', 'provider_confirmations', 'confirmed_user_answers', 'reusable_academic_history'],
    institutions,
    artifacts: uniqueArtifacts,
    languageTestAttempts,
    admissionsTestAttempts,
    credentialEvaluations,
    autoResolvedFacts,
    unresolvedFacts,
    conflicts,
    reusableAcademicHistory: reusable,
  }
}

function defaultSubmissionMethod(rule: AcademicRule, provider: string | null): AcademicSubmissionMethod {
  return {
    mode: rule.submissionMethod?.mode ?? (provider ? 'provider_direct' : 'applicant_upload'),
    recipient: nullableText(rule.submissionMethod?.recipient, 320),
    institutionCode: nullableText(rule.submissionMethod?.institutionCode, 80),
    departmentCode: nullableText(rule.submissionMethod?.departmentCode, 80),
    provider: nullableText(rule.submissionMethod?.provider ?? provider, 240),
    instructions: text(rule.submissionMethod?.instructions, 2_000),
  }
}

function artifactMeetsRule(artifact: AcademicArtifactReference, exactRule: Record<string, unknown>) {
  const maximumBytes = numberValue(exactRule.maximumBytes ?? exactRule.maxFileBytes)
  if (maximumBytes !== null && artifact.sizeBytes !== null && artifact.sizeBytes > maximumBytes) return false
  if (bool(exactRule.requireGradingLegend ?? exactRule.gradingLegendRequired) && !artifact.content.gradingLegendPresent) return false
  if (bool(exactRule.transcriptMustShowDegreeConferral ?? exactRule.degreeConferralRequired) && !artifact.content.degreeConferralPresent) return false
  if (bool(exactRule.translationRequired ?? exactRule.requiresTranslation) && !artifact.content.translationPresent) return false
  if (bool(exactRule.certifiedTranslationRequired ?? exactRule.requireCertifiedTranslation) && !artifact.content.certifiedTranslation) return false
  return true
}

function artifactForRule(rule: AcademicRule, institution: string, context: AcademicContextResolution, officialStatus: AcademicEvidenceRequirement['officialStatus'], acceptedEvidenceTypes: string[], exactRule: Record<string, unknown>) {
  const candidates = context.artifacts.filter(artifact => {
    if (institution && normalize(artifact.institution) !== normalize(institution)) return false
    if (rule.requirementType === 'transcript') return /transcript|grade.?report|academic.?record/i.test(artifact.artifactType)
    if (rule.requirementType === 'degree_certificate' || rule.requirementType === 'proof_of_graduation') return /degree|diploma|graduation|result|completion/i.test(artifact.artifactType)
    if (rule.requirementType === 'english_language_test' || rule.requirementType === 'admissions_test') return /score|test|report/i.test(artifact.artifactType)
    return false
  })
  const typedCandidates = candidates.filter(artifact => {
    if (acceptedEvidenceTypes.length && !acceptedEvidenceTypes.some(type => normalize(type) === normalize(artifact.artifactType) || normalize(artifact.artifactType).includes(normalize(type)))) return false
    return true
  })
  const accepted = typedCandidates.filter(artifact => {
    if (artifact.verification !== 'verified') return false
    if (officialStatus === 'official' && artifact.officialStatus !== 'official') return false
    if (officialStatus === 'unofficial' && !['official', 'unofficial'].includes(artifact.officialStatus)) return false
    return artifactMeetsRule(artifact, exactRule)
  })
  return accepted.sort((left, right) => Number(right.officialStatus === 'official') - Number(left.officialStatus === 'official'))[0]
    ?? (officialStatus === 'official' ? typedCandidates.sort((left, right) => Number(right.officialStatus === 'official') - Number(left.officialStatus === 'official'))[0] : null)
}

function requirementStatusForArtifact(requirementType: AcademicEvidenceRequirementType, artifact: AcademicArtifactReference | null, officialStatus: AcademicEvidenceRequirement['officialStatus'], exactRule: Record<string, unknown>) {
  if (!artifact) return 'missing' as const
  if (artifact.verification === 'rejected') return 'replacement_needed' as const
  if (officialStatus === 'official' && artifact.officialStatus !== 'official') return 'official_order_needed' as const
  if (!artifactMeetsRule(artifact, exactRule)) return 'replacement_needed' as const
  if (requirementType === 'proof_of_graduation' || requirementType === 'degree_certificate') {
    if (bool(exactRule.finalDocumentRequired) && artifact.artifactType !== 'degree_certificate') return 'replacement_needed' as const
  }
  return 'artifact_ready' as const
}

function requirementId(input: { applicationCaseId: string; type: AcademicEvidenceRequirementType; institution: string; stage: AcademicRequirementStage; provider?: string | null; suffix?: string }) {
  return `academic:${input.applicationCaseId}:${input.type}:${slug(input.institution || input.provider || 'applicant')}:${input.stage}${input.suffix ? `:${slug(input.suffix)}` : ''}`
}

function normalizeRule(input: { application: AcademicApplicationInput; rule: AcademicRule; institution: string; context: AcademicContextResolution; suffix?: string }): AcademicEvidenceRequirement {
  const { application, rule, institution, context } = input
  const type = rule.requirementType
  const sources = sourceList(rule)
  const exactRule = { ...(rule.exactRule ?? {}) }
  const requiredness = rule.requiredness ?? 'required'
  const stage = rule.stage ?? (rule.finalAfterAdmission ? 'offer-condition' : 'application')
  const provider = rule.externalProvider?.name ? {
    name: rule.externalProvider.name,
    accountId: nullableText(rule.externalProvider.accountId, 160),
    referenceNumber: nullableText(rule.externalProvider.referenceNumber, 160),
    product: nullableText(rule.externalProvider.product, 160),
    recipient: nullableText(rule.externalProvider.recipient, 320),
    state: (rule.externalProvider.state ?? 'not_started') as AcademicDeliveryState,
  } satisfies AcademicExternalProvider : null
  const acceptedEvidenceTypes = rule.acceptedEvidenceTypes ?? []
  const artifact = artifactForRule(rule, institution, context, rule.officialStatus ?? 'either', acceptedEvidenceTypes, exactRule)
  const id = requirementId({ applicationCaseId: application.applicationCaseId, type, institution, stage, provider: provider?.name, suffix: input.suffix })
  const backed = sourceBacked(sources)
  const required = ['required', 'conditional', 'recommended'].includes(requiredness)
  let status: AcademicRequirementStatus = 'requirement_detected'
  let blocker: string | null = null
  if (!backed) {
    status = 'blocked'
    blocker = 'Authoritative programme or provider source evidence is required before this academic requirement can be executed.'
  } else if (requiredness === 'not_accepted') {
    status = 'complete'
  } else if (requiredness === 'waived') {
    status = 'complete'
  } else if (type === 'credential_evaluation') {
    status = provider ? 'provider_selected' : 'requirement_detected'
  } else if (type === 'english_language_test') {
    status = 'requirement_detected'
  } else if (type === 'admissions_test') {
    status = 'requirement_detected'
  } else {
    status = artifact ? requirementStatusForArtifact(type, artifact, rule.officialStatus ?? 'either', exactRule) : 'missing'
  }
  const deadline = rule.deadline ?? application.deadline ?? null
  const submissionMethod = defaultSubmissionMethod(rule, provider?.name ?? null)
  const costAmount = rule.cost?.amount
  const cost = typeof costAmount === 'number' && Number.isFinite(costAmount) ? { amount: costAmount, currency: text(rule.cost?.currency, 3) || 'USD', known: rule.cost?.known !== false, sourceEvidenceIds: stringArray(rule.cost?.sourceEvidenceIds, 20) } : null
  const dependencies = [...new Set(rule.dependencies ?? [])]
  const completionEvidence = requiredness === 'waived' ? [{ id: `waiver-rule:${id}`, kind: 'waiver_approval' as const, verified: backed, applicationCaseId: application.applicationCaseId, requirementId: id, provider: null, providerId: null, recipient: null, artifactId: null, checksum: null, capturedAt: now(), excerpt: 'The authoritative rule marks this requirement waived.' }] : []
  return {
    id,
    applicationCaseId: application.applicationCaseId,
    institution,
    programme: application.programme,
    requirementType: type,
    requiredness,
    required,
    stage,
    officialStatus: rule.officialStatus ?? 'either',
    deadline,
    deadlineTimezone: rule.deadlineTimezone ?? application.deadlineTimezone ?? null,
    acceptedEvidenceTypes,
    submissionMethod,
    sourceEvidence: sources,
    confidence: backed ? 'high' : 'low',
    dependencies,
    dependencyIds: dependencies,
    currentArtifact: artifact,
    currentArtifactIds: artifact ? [artifact.id] : [],
    status,
    blocker,
    externalProvider: provider,
    cost,
    approvalRequirement: rule.approvalRequirement ?? (['institution_direct', 'provider_direct', 'physical_mail'].includes(submissionMethod.mode) ? 'user_approval' : 'none'),
    completionEvidence,
    exactRule,
    idempotencyKey: text(rule.idempotencyKey, 300) || id,
  }
}

function applicableLanguageRequirement(requirement: AcademicEvidenceRequirement) {
  return record(requirement.exactRule) as {
    acceptedTests?: Array<Record<string, unknown>>
    waiverCriteria?: Array<Record<string, unknown>>
    relevantDate?: string
    relevantStage?: AcademicRequirementStage
  }
}

export type WaiverEvidence = {
  criterionId: string
  kind: string
  value: unknown
  verified: boolean
  sourceEvidenceIds: string[]
}

export function evaluateEnglishWaiver(input: {
  requirement: AcademicEvidenceRequirement
  evidence: WaiverEvidence[]
}) {
  const rule = applicableLanguageRequirement(input.requirement)
  const criteria = array(rule.waiverCriteria).map(value => record(value))
  if (!criteria.length) return { eligible: false, state: 'not_eligible' as const, missingCriteria: ['published_waiver_criteria'], evidenceIds: [] as string[], rationale: 'The authoritative programme rule does not publish a waiver path.' }
  const missingCriteria: string[] = []
  const evidenceIds: string[] = []
  for (const criterion of criteria) {
    const criterionId = text(criterion.id ?? criterion.kind ?? criterion.label, 160)
    const match = input.evidence.find(item => item.criterionId === criterionId && item.verified)
    if (!match) missingCriteria.push(criterionId || 'unidentified_waiver_criterion')
    else evidenceIds.push(...match.sourceEvidenceIds)
  }
  if (missingCriteria.length) return { eligible: false, state: 'evidence_missing' as const, missingCriteria, evidenceIds: [...new Set(evidenceIds)], rationale: 'The waiver may be available, but every published evidence criterion is not yet verified.' }
  return { eligible: true, state: 'valid' as const, missingCriteria: [], evidenceIds: [...new Set(evidenceIds)], rationale: 'Every published waiver criterion is supported by verified applicant or institutional evidence.' }
}

export type LanguageScoreEvaluation = {
  state: 'satisfies' | 'fails_overall' | 'fails_subscore' | 'expired' | 'expires_before_relevant_stage' | 'wrong_test_type' | 'wrong_test_version' | 'verification_needed'
  attemptId: string | null
  reasons: string[]
  relevantDate: string | null
  acceptedTest: string | null
}

export function evaluateLanguageTestAttempt(input: { requirement: AcademicEvidenceRequirement; attempt: LanguageTestAttempt; now?: string }): LanguageScoreEvaluation {
  const rule = applicableLanguageRequirement(input.requirement)
  const tests = array(rule.acceptedTests)
  const matched = tests.map(value => record(value)).find(test => {
    const acceptedType = text(test.type ?? test.testType, 120)
    return normalize(acceptedType) === normalize(input.attempt.testType) || normalize(acceptedType) === normalize(input.attempt.testProvider)
  })
  if (!matched) return { state: 'wrong_test_type', attemptId: input.attempt.id, reasons: [`${input.attempt.testType} is not in the programme's accepted test list.`], relevantDate: nullableText(rule.relevantDate, 80), acceptedTest: null }
  const acceptedVersions = stringArray(matched.acceptedVersions ?? matched.versions, 20)
  if (acceptedVersions.length && input.attempt.testVersion && !acceptedVersions.some(version => normalize(version) === normalize(input.attempt.testVersion))) return { state: 'wrong_test_version', attemptId: input.attempt.id, reasons: ['The score report uses a test version not accepted by the programme.'], relevantDate: nullableText(rule.relevantDate, 80), acceptedTest: text(matched.type ?? matched.testType, 120) }
  if (input.attempt.overallScore === null) return { state: 'verification_needed', attemptId: input.attempt.id, reasons: ['The score report does not contain a verified overall score.'], relevantDate: nullableText(rule.relevantDate, 80), acceptedTest: text(matched.type ?? matched.testType, 120) }
  const overallMinimum = numberValue(matched.minimumOverall ?? matched.minOverall ?? matched.overallMinimum)
  if (overallMinimum !== null && input.attempt.overallScore < overallMinimum) return { state: 'fails_overall', attemptId: input.attempt.id, reasons: [`Overall score ${input.attempt.overallScore} is below the published minimum ${overallMinimum}.`], relevantDate: nullableText(rule.relevantDate, 80), acceptedTest: text(matched.type ?? matched.testType, 120) }
  const sectionMinimums = record(matched.minimumSections ?? matched.sectionMinimums ?? matched.subscoreMinimums)
  const missingSections = Object.entries(sectionMinimums).filter(([section, minimum]) => {
    const score = input.attempt.sectionScores[section]
    return typeof score !== 'number' || typeof minimum !== 'number' || score < minimum
  }).map(([section]) => section)
  if (missingSections.length) return { state: 'fails_subscore', attemptId: input.attempt.id, reasons: [`Required subsection minimums are not met: ${missingSections.join(', ')}.`], relevantDate: nullableText(rule.relevantDate, 80), acceptedTest: text(matched.type ?? matched.testType, 120) }
  const relevantDate = nullableText(rule.relevantDate, 80)
  const validUntil = input.attempt.validUntil ?? (numberValue(matched.validityMonths) !== null ? monthsAfter(input.attempt.testDate, numberValue(matched.validityMonths)!) : null)
  if (relevantDate && validUntil && Date.parse(validUntil) < Date.parse(relevantDate)) return { state: 'expires_before_relevant_stage', attemptId: input.attempt.id, reasons: [`The score expires before the programme's ${text(rule.relevantStage, 80) || 'required'} date.`], relevantDate, acceptedTest: text(matched.type ?? matched.testType, 120) }
  if (validUntil && input.now && Date.parse(validUntil) < Date.parse(input.now)) return { state: 'expired', attemptId: input.attempt.id, reasons: ['The score is expired at the relevant evaluation time.'], relevantDate, acceptedTest: text(matched.type ?? matched.testType, 120) }
  if (input.attempt.provenance.length === 0 && !input.attempt.scoreReportArtifactId) return { state: 'verification_needed', attemptId: input.attempt.id, reasons: ['The score exists in context but does not have a verified report or provenance.'], relevantDate, acceptedTest: text(matched.type ?? matched.testType, 120) }
  return { state: 'satisfies', attemptId: input.attempt.id, reasons: [], relevantDate, acceptedTest: text(matched.type ?? matched.testType, 120) }
}

export function chooseEnglishTest(input: {
  acceptedTests: Array<Record<string, unknown>>
  applicationRequirements: Array<{ applicationCaseId: string; acceptedTestTypes: string[]; deadline: string | null }>
  options: Array<{ testType: string; resultDays?: number; availableDates?: string[]; cost?: AcademicCost | null; preparationScore?: number }>
  now?: string
}) {
  const ranked = input.options.map(option => {
    const covered = input.applicationRequirements.filter(requirement => requirement.acceptedTestTypes.some(type => normalize(type) === normalize(option.testType))).map(requirement => requirement.applicationCaseId)
    const latestDeadline = input.applicationRequirements.filter(requirement => covered.includes(requirement.applicationCaseId)).map(requirement => requirement.deadline).filter((value): value is string => Boolean(value)).sort()[0] ?? null
    const resultDays = option.resultDays ?? 21
    const feasible = !latestDeadline || !input.now || Date.parse(input.now) + resultDays * 86_400_000 < Date.parse(latestDeadline)
    const score = covered.length * 100 + (feasible ? 25 : -100) + (option.preparationScore ?? 0) - (option.cost?.known ? option.cost.amount / 100 : 0)
    return { ...option, coverageApplicationCaseIds: covered, coverageCount: covered.length, feasible, score, latestDeadline }
  }).sort((left, right) => right.score - left.score || left.testType.localeCompare(right.testType))
  return { ranked, recommendation: ranked.find(option => option.feasible && option.coverageCount > 0) ?? ranked[0] ?? null }
}

export function rankLanguageTestDates(input: { dates: Array<{ id: string; label: string; date: string; location?: string; resultDate?: string | null; cost?: AcademicCost | null }>; deadlines: string[]; calendarEvents?: Array<{ start: string; end: string }>; safeBufferDays?: number }) {
  const buffer = (input.safeBufferDays ?? 3) * 86_400_000
  return input.dates.filter(date => {
    if (input.deadlines.some(deadline => date.resultDate && Date.parse(date.resultDate) + buffer >= Date.parse(deadline))) return false
    return !input.calendarEvents?.some(event => Date.parse(date.date) >= Date.parse(event.start) && Date.parse(date.date) <= Date.parse(event.end))
  }).sort((left, right) => Date.parse(left.date) - Date.parse(right.date))
}

export function buildAcademicTestDateSelection(input: {
  requirementId: string
  dates: Array<{ id: string; label: string; date: string; location?: string; resultDate?: string | null; cost?: AcademicCost | null }>
  deadlines: string[]
  calendarEvents?: Array<{ start: string; end: string }>
  timezone: string
  question?: string
}) {
  const rankedDates = rankLanguageTestDates(input)
  const interaction = createRecommendationInteraction({
    kind: 'date',
    id: `${input.requirementId}:date-choice`,
    requirementId: input.requirementId,
    question: input.question ?? 'Choose the latest safe test date.',
    reason: 'I removed dates that conflict with Calendar or cannot return scores before the source-backed deadlines and safety buffer.',
    knownContext: rankedDates.slice(0, 3).map(date => `${date.label}: ${date.date}${date.location ? ` — ${date.location}` : ''}`),
    timezone: input.timezone,
    reusableContextKeys: [],
  })
  return { rankedDates, interaction: { ...interaction, minimumDate: rankedDates[0]?.date.slice(0, 10) ?? null } }
}

export function languageTestBookingKey(input: { applicantId: string; testType: string; date: string; location?: string }) {
  return `language-booking:${input.applicantId}:${slug(input.testType)}:${input.date}:${slug(input.location ?? 'online')}`
}

export function officialScoreReportingKey(input: { applicantId: string; attemptId: string; recipient: string; institutionCode?: string | null; departmentCode?: string | null }) {
  return `score-report:${input.applicantId}:${input.attemptId}:${slug(input.recipient)}:${slug(input.institutionCode ?? '')}:${slug(input.departmentCode ?? '')}`
}

export type AdmissionsTestPolicy = {
  requiredness: AcademicRequirementClass
  acceptedTestTypes: string[]
  minimumOverall?: number | null
  minimumSections?: Record<string, number>
  validityMonths?: number | null
  relevantDate?: string | null
  institutionCode?: string | null
  departmentCode?: string | null
  publishedRanges?: Array<{ testType: string; section: string; low?: number; high?: number; sourceEvidenceIds: string[] }>
  sourceEvidence: AcademicSourceEvidence[]
}

export function evaluateAdmissionsTestAttempt(input: { policy: AdmissionsTestPolicy; attempt: AdmissionsTestAttempt; now?: string }) {
  if (input.policy.requiredness === 'not_accepted') return { state: 'not_accepted' as const, reasons: ['The programme explicitly says this test will not be considered.'] }
  if (!input.policy.acceptedTestTypes.some(type => normalize(type) === normalize(input.attempt.testType))) return { state: 'wrong_test_type' as const, reasons: [`${input.attempt.testType} is not accepted by the programme.`] }
  if (input.attempt.overallScore === null && input.attempt.compositeScore === null) return { state: 'verification_needed' as const, reasons: ['No verified composite or overall score is present.'] }
  const overall = input.attempt.overallScore ?? input.attempt.compositeScore!
  if (input.policy.minimumOverall !== null && input.policy.minimumOverall !== undefined && overall < input.policy.minimumOverall) return { state: 'fails_overall' as const, reasons: [`Score ${overall} is below the published minimum ${input.policy.minimumOverall}.`] }
  const failedSections = Object.entries(input.policy.minimumSections ?? {}).filter(([section, minimum]) => (input.attempt.sectionScores[section] ?? Number.NEGATIVE_INFINITY) < minimum).map(([section]) => section)
  if (failedSections.length) return { state: 'fails_subscore' as const, reasons: [`Required section minimums are not met: ${failedSections.join(', ')}.`] }
  if (input.attempt.provenance.length === 0 && !input.attempt.scoreArtifactId) return { state: 'verification_needed' as const, reasons: ['The score exists in context but does not have a verified report or provenance.'] }
  const validUntil = input.attempt.validUntil ?? (input.policy.validityMonths && input.policy.validityMonths > 0 ? monthsAfter(input.attempt.testDate, input.policy.validityMonths) : null)
  if (input.policy.relevantDate && validUntil && Date.parse(validUntil) < Date.parse(input.policy.relevantDate)) return { state: 'expires_before_relevant_stage' as const, reasons: ['The attempt expires before the programme-relevant date.'] }
  if (input.now && validUntil && Date.parse(validUntil) < Date.parse(input.now)) return { state: 'expired' as const, reasons: ['The attempt is expired.'] }
  return { state: 'satisfies' as const, reasons: [] }
}

export type OptionalAdmissionsRecommendation = 'STRONGLY_SUBMIT' | 'SUBMIT' | 'NEUTRAL' | 'WITHHOLD' | 'INSUFFICIENT_EVIDENCE'

export function recommendOptionalAdmissionsScore(input: {
  policy: AdmissionsTestPolicy
  attempt?: AdmissionsTestAttempt | null
  applicantProfile?: Record<string, unknown>
}) {
  if (input.policy.requiredness === 'not_accepted') return { recommendation: 'WITHHOLD' as const, rationale: 'The programme explicitly does not accept or consider this score.', sourceEvidenceIds: input.policy.sourceEvidence.map(source => source.id) }
  if (input.policy.requiredness !== 'optional' && input.policy.requiredness !== 'recommended') return { recommendation: 'INSUFFICIENT_EVIDENCE' as const, rationale: 'This decision helper is only for optional or recommended scores.', sourceEvidenceIds: input.policy.sourceEvidence.map(source => source.id) }
  if (!input.attempt) return { recommendation: 'INSUFFICIENT_EVIDENCE' as const, rationale: 'No existing score is available; a new optional test needs an explicit expected-value analysis before it is recommended.', sourceEvidenceIds: input.policy.sourceEvidence.map(source => source.id) }
  const ranges = input.policy.publishedRanges ?? []
  if (!ranges.length) return { recommendation: 'INSUFFICIENT_EVIDENCE' as const, rationale: 'The programme has not published a score range or explicit optional-score guidance.', sourceEvidenceIds: input.policy.sourceEvidence.map(source => source.id) }
  const scores = [
    ...ranges.map(range => ({ range, score: range.section.toLocaleLowerCase() === 'overall' || range.section.toLocaleLowerCase() === 'total' ? input.attempt!.overallScore ?? input.attempt!.compositeScore : input.attempt!.sectionScores[range.section] })).filter(item => item.score !== null && item.score !== undefined),
  ]
  if (!scores.length) return { recommendation: 'INSUFFICIENT_EVIDENCE' as const, rationale: 'The existing score report does not contain the section used by the published comparison range.', sourceEvidenceIds: input.policy.sourceEvidence.map(source => source.id) }
  const above = scores.filter(item => item.range.high !== undefined && item.score! >= item.range.high!).length
  const below = scores.filter(item => item.range.low !== undefined && item.score! < item.range.low!).length
  const recommendation = above === scores.length ? 'STRONGLY_SUBMIT' : below > 0 ? 'WITHHOLD' : 'SUBMIT'
  return { recommendation, rationale: recommendation === 'WITHHOLD' ? 'The verified score is below at least one published recent range, so it is unlikely to strengthen this optional application.' : recommendation === 'STRONGLY_SUBMIT' ? 'The verified score is above every applicable published comparison range.' : 'The verified score is within the published comparison evidence and may be submitted.', sourceEvidenceIds: input.policy.sourceEvidence.map(source => source.id) }
}

export function selectBestAdmissionsAttempt(input: { policy: AdmissionsTestPolicy; attempts: AdmissionsTestAttempt[]; now?: string }) {
  const evaluated = input.attempts.map(attempt => ({ attempt, evaluation: evaluateAdmissionsTestAttempt({ policy: input.policy, attempt, now: input.now }) })).filter(item => item.evaluation.state === 'satisfies')
  return evaluated.sort((left, right) => ((right.attempt.overallScore ?? right.attempt.compositeScore ?? -Infinity) - (left.attempt.overallScore ?? left.attempt.compositeScore ?? -Infinity)) || right.attempt.testDate.localeCompare(left.attempt.testDate))[0] ?? null
}

export function admissionsTestRegistrationKey(input: { applicantId: string; testType: string; date: string }) {
  return `admissions-test:${input.applicantId}:${slug(input.testType)}:${input.date}`
}

export function admissionsScoreReportingKey(input: { applicantId: string; attemptId: string; recipient: string; institutionCode?: string | null; departmentCode?: string | null }) {
  return `admissions-score-report:${input.applicantId}:${input.attemptId}:${slug(input.recipient)}:${slug(input.institutionCode ?? '')}:${slug(input.departmentCode ?? '')}`
}

function credentialEvaluationKey(input: { provider: string; evaluationType: CredentialEvaluationCase['evaluationType']; applicantId: string; requiredDocuments: string[] }) {
  return `credential-evaluation:${input.applicantId}:${slug(input.provider)}:${input.evaluationType}:${input.requiredDocuments.map(slug).sort().join(',')}`
}

export function canAdvanceCredentialEvaluationState(from: CredentialEvaluationState, to: CredentialEvaluationState) {
  if (from === to) return true
  const transitions: Partial<Record<CredentialEvaluationState, CredentialEvaluationState[]>> = {
    requirement_verified: ['provider_selected', 'blocked'],
    provider_selected: ['account_needed', 'evaluation_order_ready', 'blocked'],
    account_needed: ['awaiting_auth', 'account_ready', 'blocked'],
    awaiting_auth: ['account_ready', 'blocked'],
    account_ready: ['evaluation_order_ready', 'blocked'],
    evaluation_order_ready: ['payment_required', 'ordered', 'blocked'],
    payment_required: ['ordered', 'blocked'],
    ordered: ['reference_number_issued', 'documents_requested', 'blocked'],
    reference_number_issued: ['documents_requested', 'awaiting_institution_documents'],
    documents_requested: ['awaiting_institution_documents', 'documents_received', 'blocked'],
    awaiting_institution_documents: ['documents_received', 'blocked'],
    documents_received: ['evaluation_in_progress', 'blocked'],
    evaluation_in_progress: ['evaluation_complete', 'blocked'],
    evaluation_complete: ['report_dispatch_pending', 'report_sent', 'blocked'],
    report_dispatch_pending: ['report_sent', 'blocked'],
    report_sent: ['university_received', 'complete', 'blocked'],
    university_received: ['complete', 'blocked'],
  }
  return transitions[from]?.includes(to) ?? false
}

export function transitionCredentialEvaluation(input: { evaluation: CredentialEvaluationCase; to: CredentialEvaluationState; evidence?: AcademicCompletionEvidence[] }) {
  if (!canAdvanceCredentialEvaluationState(input.evaluation.state, input.to)) throw new Error(`Illegal credential-evaluation transition ${input.evaluation.state} → ${input.to}.`)
  if (['evaluation_complete', 'report_sent', 'university_received', 'complete'].includes(input.to) && !(input.evidence ?? []).some(item => item.verified)) throw new Error('Provider or recipient evidence is required before advancing credential evaluation state.')
  const evidence = input.evidence ?? []
  const universityReceiptStates = { ...input.evaluation.universityReceiptStates }
  for (const item of evidence.filter(item => item.verified && item.recipient)) universityReceiptStates[item.recipient!] = 'accepted'
  return {
    ...input.evaluation,
    state: input.to,
    ...(input.to === 'report_sent' ? { reportDispatchState: 'dispatched' as const } : {}),
    ...(Object.keys(universityReceiptStates).length ? { universityReceiptStates } : {}),
    ...(evidence.length ? { sourceEvidence: [...input.evaluation.sourceEvidence, ...evidence.map(item => ({ id: item.id, url: null, authority: 'provider' as const, sourceType: item.kind, excerpt: item.excerpt, claims: [], retrievedAt: item.capturedAt }))] } : {}),
  }
}

export function buildCredentialEvaluationCases(input: { applicantId: string; requirements: AcademicEvidenceRequirement[]; existing?: CredentialEvaluationCase[] }) {
  const evaluationRequirements = input.requirements.filter(item => item.requirementType === 'credential_evaluation' && academicEvidenceRequirementIsRelevant(item))
  const cases: CredentialEvaluationCase[] = []
  let duplicateActionsPrevented = 0
  for (const requirement of evaluationRequirements) {
    const provider = requirement.externalProvider?.name ?? requirement.submissionMethod.provider ?? ''
    const evaluationType = text(requirement.exactRule.evaluationType ?? requirement.externalProvider?.product, 80) as CredentialEvaluationCase['evaluationType'] || 'other'
    const requiredDocuments = [...new Set([
      ...requirement.acceptedEvidenceTypes,
      ...stringArray(requirement.exactRule.requiredDocuments ?? requirement.exactRule.documents, 20),
    ])]
    const key = credentialEvaluationKey({ provider, evaluationType, applicantId: input.applicantId, requiredDocuments })
    const existing = input.existing?.find(item => item.idempotencyKey === key || (
      item.provider === provider &&
      item.evaluationType === evaluationType &&
      item.applicantId === input.applicantId &&
      (!requiredDocuments.length || requiredDocuments.every(document => item.requiredDocuments.includes(document)) || ['requirement_verified', 'provider_selected', 'account_needed', 'awaiting_auth', 'account_ready', 'evaluation_order_ready', 'payment_required'].includes(item.state))
    ))
    const current = existing ?? cases.find(item => item.idempotencyKey === key)
    const institutionNames = stringArray(requirement.exactRule.institutions ?? requirement.exactRule.requiredInstitutions, 30)
    const institutionDeliveries = (institutionNames.length ? institutionNames : [requirement.institution]).map(institution => ({ institution, requiredDocumentTypes: requiredDocuments, deliveryMode: requirement.submissionMethod.mode === 'provider_direct' ? 'institution_direct' : requirement.submissionMethod.mode, state: 'not_started' as const, providerId: null, trackingId: null, recipient: requirement.externalProvider?.recipient ?? requirement.submissionMethod.recipient, commitmentAt: null, commitmentDueAt: null, evidence: [], blocker: null }))
    if (current) {
      duplicateActionsPrevented += 1
      current.applicationCaseIds = [...new Set([...current.applicationCaseIds, requirement.applicationCaseId])]
      current.requirementIds = [...new Set([...current.requirementIds, requirement.id])]
      current.recipientInstitutions = [...new Set([...current.recipientInstitutions, ...institutionNames, requirement.institution])]
      current.requiredDocuments = [...new Set([...current.requiredDocuments, ...requiredDocuments])]
      current.requiredDeliveryRoute ||= requirement.submissionMethod.instructions
      current.translationRules = [...new Set([...current.translationRules, ...stringArray(requirement.exactRule.translationRules, 20)])]
      current.sourceEvidence = [...new Map([...current.sourceEvidence, ...requirement.sourceEvidence].map(item => [item.id, item])).values()]
      current.institutionDeliveries = [...current.institutionDeliveries, ...institutionDeliveries.filter(delivery => !current.institutionDeliveries.some(existingDelivery => normalize(existingDelivery.institution) === normalize(delivery.institution)))]
      if (!current.cost && requirement.cost) current.cost = requirement.cost
      continue
    }
    cases.push({
      id: existing?.id ?? `evaluation-case:${slug(key)}`,
      applicantId: input.applicantId,
      provider,
      evaluationType,
      applicationCaseIds: [requirement.applicationCaseId],
      requirementIds: [requirement.id],
      recipientInstitutions: [requirement.institution],
      requiredDocuments,
      requiredDeliveryRoute: requirement.submissionMethod.instructions,
      referenceNumber: existing?.referenceNumber ?? null,
      reportId: existing?.reportId ?? null,
      translationRules: stringArray(requirement.exactRule.translationRules, 20),
      deadline: requirement.deadline,
      expectedProcessingTime: nullableText(requirement.exactRule.expectedProcessingTime, 240),
      cost: requirement.cost,
      state: existing?.state ?? 'requirement_verified',
      institutionDeliveries: existing?.institutionDeliveries.length ? existing.institutionDeliveries : institutionDeliveries,
      reportDispatchState: existing?.reportDispatchState ?? 'not_started',
      universityReceiptStates: existing?.universityReceiptStates ?? {},
      sourceEvidence: requirement.sourceEvidence,
      blocker: existing?.blocker ?? null,
      idempotencyKey: key,
    })
  }
  return { cases: [...(input.existing ?? []).filter(item => !cases.some(candidate => candidate.id === item.id)), ...cases], duplicateActionsPrevented }
}

function findEvidenceForRequirement(requirement: AcademicEvidenceRequirement, context: AcademicContextResolution) {
  const evidence = array(requirement.exactRule.waiverEvidence ?? requirement.exactRule.evidence).map(value => record(value)).map(value => ({ criterionId: text(value.criterionId ?? value.id ?? value.kind, 160), kind: text(value.kind, 160), value: value.value, verified: bool(value.verified), sourceEvidenceIds: stringArray(value.sourceEvidenceIds, 20).length ? stringArray(value.sourceEvidenceIds, 20) : [text(value.sourceId, 160)].filter(Boolean) }))
  const answerEvidence = context.autoResolvedFacts.filter(fact => fact.key.startsWith('waiver:')).map(fact => ({ criterionId: fact.key.replace(/^waiver:/, ''), kind: 'reusable_context', value: fact.value, verified: true, sourceEvidenceIds: fact.sourceIds }))
  return [...evidence, ...answerEvidence]
}

function enrichLanguageAndAdmissions(requirements: AcademicEvidenceRequirement[], context: AcademicContextResolution, referenceDate: string) {
  return requirements.map(requirement => {
    if (requirement.requirementType === 'english_language_test') {
      const waiver = evaluateEnglishWaiver({ requirement, evidence: findEvidenceForRequirement(requirement, context) })
      if (waiver.eligible) return { ...requirement, requiredness: 'waived' as const, status: 'complete' as const, completionEvidence: [{ id: `waiver:${requirement.id}`, kind: 'waiver_approval' as const, verified: true, applicationCaseId: requirement.applicationCaseId, requirementId: requirement.id, provider: null, providerId: null, recipient: null, artifactId: null, checksum: null, capturedAt: now(), excerpt: waiver.rationale }] }
      const evaluations = context.languageTestAttempts.map(attempt => ({ attempt, evaluation: evaluateLanguageTestAttempt({ requirement, attempt, now: referenceDate }) }))
      const satisfying = evaluations.find(item => item.evaluation.state === 'satisfies')
      if (satisfying) return { ...requirement, status: 'score_ready' as const, currentArtifactIds: satisfying.attempt.scoreReportArtifactId ? [satisfying.attempt.scoreReportArtifactId] : [], exactRule: { ...requirement.exactRule, selectedAttemptId: satisfying.attempt.id, scoreEvaluation: satisfying.evaluation } }
      const waiverCriteria = array(applicableLanguageRequirement(requirement).waiverCriteria)
      if (waiverCriteria.length && waiver.state === 'evidence_missing') return { ...requirement, status: 'waiver_evidence_needed' as const, blocker: 'Published waiver criteria exist, but their evidence is not yet verified.' }
      return { ...requirement, status: evaluations.length ? 'replacement_needed' as const : 'missing' as const, blocker: evaluations.length ? evaluations[0]!.evaluation.reasons.join(' ') : null }
    }
    if (requirement.requirementType === 'admissions_test') {
      if (requirement.requiredness === 'not_accepted') return { ...requirement, status: 'complete' as const, exactRule: { ...requirement.exactRule, scoreEvaluation: { state: 'not_accepted', reasons: ['The programme explicitly says this test will not be considered.'] } } }
      const policy: AdmissionsTestPolicy = { requiredness: requirement.requiredness, acceptedTestTypes: stringArray(requirement.exactRule.acceptedTestTypes ?? requirement.acceptedEvidenceTypes, 20), minimumOverall: numberValue(requirement.exactRule.minimumOverall ?? requirement.exactRule.minOverall), minimumSections: Object.fromEntries(Object.entries(record(requirement.exactRule.minimumSections)).map(([key, value]) => [key, numberValue(value)]).filter((entry): entry is [string, number] => entry[1] !== null)), validityMonths: numberValue(requirement.exactRule.validityMonths), relevantDate: nullableText(requirement.exactRule.relevantDate ?? requirement.deadline, 80), institutionCode: nullableText(requirement.exactRule.institutionCode, 80), departmentCode: nullableText(requirement.exactRule.departmentCode, 80), publishedRanges: array(requirement.exactRule.publishedRanges).map(value => { const item = record(value); return { testType: text(item.testType ?? item.type, 80), section: text(item.section, 80), low: numberValue(item.low) ?? undefined, high: numberValue(item.high) ?? undefined, sourceEvidenceIds: stringArray(item.sourceEvidenceIds, 20) } }).filter(value => Boolean(value.testType && value.section)), sourceEvidence: requirement.sourceEvidence }
      const best = selectBestAdmissionsAttempt({ policy, attempts: context.admissionsTestAttempts, now: referenceDate })
      if (best) return { ...requirement, status: 'score_ready' as const, currentArtifactIds: best.attempt.scoreArtifactId ? [best.attempt.scoreArtifactId] : [], exactRule: { ...requirement.exactRule, selectedAttemptId: best.attempt.id, scoreEvaluation: best.evaluation } }
      if (requirement.requiredness === 'optional' || requirement.requiredness === 'recommended') return { ...requirement, status: 'requirement_detected' as const }
      return { ...requirement, status: context.admissionsTestAttempts.length ? 'replacement_needed' as const : 'missing' as const }
    }
    return requirement
  })
}

/**
 * Collapse repeated rules before they reach the durable evidence tables.
 *
 * Requirement identity is intentionally derived from the application case,
 * evidence type, institution, and stage.  A model can nevertheless return
 * the same rule more than once (for example once in `requirements` and once
 * in `rules`).  Sending those duplicate identities in one PostgREST upsert
 * causes PostgreSQL to reject the whole statement with "cannot affect row a
 * second time".  Keep one canonical row while retaining additive evidence
 * and dependency context from every equivalent rule.
 */
function deduplicateAcademicRequirements(requirements: AcademicEvidenceRequirement[]) {
  const byId = new Map<string, AcademicEvidenceRequirement>()
  for (const requirement of requirements) {
    const existing = byId.get(requirement.id)
    if (!existing) {
      byId.set(requirement.id, requirement)
      continue
    }
    const sourceEvidence = [...new Map([...existing.sourceEvidence, ...requirement.sourceEvidence].map(item => [item.id, item])).values()]
    const completionEvidence = [...new Map([...existing.completionEvidence, ...requirement.completionEvidence].map(item => [item.id, item])).values()]
    byId.set(requirement.id, {
      ...existing,
      acceptedEvidenceTypes: [...new Set([...existing.acceptedEvidenceTypes, ...requirement.acceptedEvidenceTypes])],
      sourceEvidence,
      dependencies: [...new Set([...existing.dependencies, ...requirement.dependencies])],
      dependencyIds: [...new Set([...existing.dependencyIds, ...requirement.dependencyIds])],
      currentArtifactIds: [...new Set([...existing.currentArtifactIds, ...requirement.currentArtifactIds])],
      completionEvidence,
      currentArtifact: existing.currentArtifact ?? requirement.currentArtifact,
      blocker: existing.blocker ?? requirement.blocker,
      cost: existing.cost ?? requirement.cost,
    })
  }
  return [...byId.values()]
}

function nextAcademicAction(requirements: AcademicEvidenceRequirement[], context: AcademicContextResolution, credentialCases: CredentialEvaluationCase[]): { action: AcademicAcademicAction | null; interaction: AcademicProgressInteraction | null } {
  const relevant = requirements.filter(item => academicEvidenceRequirementIsRelevant(item) && !academicEvidenceRequirementIsComplete(item) && academicRequirementDependenciesSatisfied(item, requirements)).sort((left, right) => {
    const leftDeadline = left.deadline ? Date.parse(left.deadline) : Number.MAX_SAFE_INTEGER
    const rightDeadline = right.deadline ? Date.parse(right.deadline) : Number.MAX_SAFE_INTEGER
    const leadTime = (type: AcademicEvidenceRequirementType) => ['credential_evaluation', 'transcript'].includes(type) ? 0 : type === 'english_language_test' || type === 'admissions_test' ? 1 : 2
    return leadTime(left.requirementType) - leadTime(right.requirementType) || leftDeadline - rightDeadline || left.id.localeCompare(right.id)
  })
  const requirement = relevant[0]
  if (!requirement) return { action: null, interaction: null }
  if (requirement.status === 'blocked') return { action: null, interaction: createRecommendationInteraction({ kind: 'attachment_request', id: `${requirement.id}:source`, requirementId: requirement.id, question: `Add the authoritative instructions for ${requirement.institution} ${requirement.programme}.`, reason: requirement.blocker ?? 'The exact academic rule is not source-backed yet.', knownContext: [], acceptedMimeTypes: ['application/pdf', 'text/html'], attachmentPrompt: 'Attach the official instructions or share the official programme page.', reusableContextKeys: [] }) }
  if (requirement.status === 'score_ready') {
    if (requirement.requirementType === 'admissions_test' && (requirement.requiredness === 'optional' || requirement.requiredness === 'recommended')) {
      const attempt = context.admissionsTestAttempts.find(item => item.id === text(requirement.exactRule.selectedAttemptId, 160)) ?? context.admissionsTestAttempts[0]
      const policy: AdmissionsTestPolicy = { requiredness: requirement.requiredness, acceptedTestTypes: stringArray(requirement.exactRule.acceptedTestTypes ?? requirement.acceptedEvidenceTypes, 20), minimumOverall: numberValue(requirement.exactRule.minimumOverall), minimumSections: {}, validityMonths: numberValue(requirement.exactRule.validityMonths), relevantDate: nullableText(requirement.exactRule.relevantDate ?? requirement.deadline, 80), institutionCode: nullableText(requirement.exactRule.institutionCode, 80), departmentCode: nullableText(requirement.exactRule.departmentCode, 80), publishedRanges: array(requirement.exactRule.publishedRanges).map(value => { const item = record(value); return { testType: text(item.testType ?? item.type, 80), section: text(item.section, 80), low: numberValue(item.low) ?? undefined, high: numberValue(item.high) ?? undefined, sourceEvidenceIds: stringArray(item.sourceEvidenceIds, 20) } }).filter(value => Boolean(value.testType && value.section)), sourceEvidence: requirement.sourceEvidence }
      const decision = attempt ? recommendOptionalAdmissionsScore({ policy, attempt }) : { recommendation: 'INSUFFICIENT_EVIDENCE' as const, rationale: 'No verified score is available for an optional submission decision.', sourceEvidenceIds: requirement.sourceEvidence.map(item => item.id) }
      if (attempt && decision.recommendation !== 'INSUFFICIENT_EVIDENCE') return { action: { kind: 'submit_optional_score', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: decision.recommendation === 'WITHHOLD' ? 'Do not submit optional score' : 'Submit optional score', rationale: decision.rationale, idempotencyKey: `optional-score:${requirement.id}:${attempt.id}`, consequential: true }, interaction: createRecommendationInteraction({ kind: 'single_choice', id: `${requirement.id}:optional-score`, requirementId: requirement.id, question: `The ${attempt.testType} is optional for this programme.`, reason: decision.rationale, options: [{ value: 'submit', label: 'Submit score', description: 'Use the verified official reporting route.' }, { value: 'withhold', label: 'Do not submit', description: 'Leave the optional score out.' }], knownContext: [`Recommendation: ${decision.recommendation}`, ...decision.sourceEvidenceIds.map(id => `Source evidence: ${id}`)], reusableContextKeys: [] }) }
    }
    const actionKind: 'report_language_score' | 'submit_optional_score' = requirement.requirementType === 'english_language_test' ? 'report_language_score' : 'submit_optional_score'
    return { action: { kind: actionKind, requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: 'Report verified score', rationale: 'The score satisfies the exact published rule; provider receipt and university receipt remain separate evidence.', idempotencyKey: `report-score:${requirement.id}`, consequential: true }, interaction: createRecommendationInteraction({ kind: 'confirmation', id: `${requirement.id}:report`, requirementId: requirement.id, question: 'The verified score satisfies this requirement. Prepare official reporting?', reason: 'Reporting is a consequential provider action and will remain open until the receiving institution confirms receipt.', knownContext: [`Attempt: ${text(requirement.exactRule.selectedAttemptId, 160)}`], approvalScope: 'completion', reusableContextKeys: [] }) }
  }
  if (requirement.status === 'waiver_evidence_needed') return { action: { kind: 'request_waiver_evidence', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: 'Resolve waiver evidence', rationale: 'A published waiver may avoid a paid test, but the required evidence is missing.', idempotencyKey: `waiver-evidence:${requirement.id}`, consequential: false }, interaction: createRecommendationInteraction({ kind: 'attachment_request', id: `${requirement.id}:waiver`, requirementId: requirement.id, question: `I may be able to waive the ${requirement.requirementType === 'english_language_test' ? 'English test' : 'test'}, but I need the published evidence.`, reason: 'I checked the waiver rule before recommending any test. Attach the institutional confirmation if you already have it, or I can prepare the request route.', knownContext: [requirement.sourceEvidence[0]?.excerpt ?? 'Waiver rule is source-backed'], attachmentPrompt: 'Attach the official waiver evidence.', acceptedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'message/rfc822'], reusableContextKeys: [] }) }
  const isArtifactRequirement = ['transcript', 'degree_certificate', 'proof_of_graduation'].includes(requirement.requirementType)
  if (isArtifactRequirement && (requirement.status === 'replacement_needed' || (requirement.status === 'missing' && ['applicant_upload', 'secure_upload'].includes(requirement.submissionMethod.mode)))) {
    const label = requirement.requirementType === 'transcript' ? `${requirement.institution} transcript` : requirement.requirementType.replaceAll('_', ' ')
    return { action: { kind: 'attach_artifact', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: `Attach ${label}`, rationale: requirement.blocker ?? `I searched the applicant profile, stored records, previous applications, and uploads but did not find an acceptable copy.`, idempotencyKey: `attach:${requirement.id}`, consequential: false }, interaction: createRecommendationInteraction({ kind: 'attachment_request', id: `${requirement.id}:attachment`, requirementId: requirement.id, question: `I’m missing your ${label}.`, reason: requirement.blocker ?? 'I checked the applicant profile, canonical CV, stored documents, previous applications, Gmail attachments, and reusable academic history first.', knownContext: context.institutions.map(institution => `${institution.officialInstitutionName}: ${institution.graduationStatus}`).slice(0, 5), attachmentPrompt: `Attach the ${label}.`, acceptedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'], reusableContextKeys: [] }) }
  }
  if (requirement.status === 'official_order_needed' || requirement.approvalRequirement === 'user_approval' && ['institution_direct', 'provider_direct', 'physical_mail'].includes(requirement.submissionMethod.mode)) {
    return { action: { kind: 'request_official_document', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: `Request official ${requirement.requirementType.replaceAll('_', ' ')}`, rationale: `The programme requires ${requirement.officialStatus} evidence through ${requirement.submissionMethod.mode}.`, idempotencyKey: `official-request:${requirement.id}`, consequential: true }, interaction: createRecommendationInteraction({ kind: 'confirmation', id: `${requirement.id}:official-request`, requirementId: requirement.id, question: `I found the official request route for ${requirement.institution}. Start it?`, reason: `This is a consequential external request. I will use the institution’s verified route and stop at authentication or payment, then monitor delivery automatically.`, knownContext: [requirement.submissionMethod.instructions || `Recipient: ${requirement.submissionMethod.recipient ?? 'the receiving institution'}`, requirement.deadline ? `Deadline: ${requirement.deadline}` : 'No source-backed deadline recorded'], approvalScope: 'completion', reusableContextKeys: [] }) }
  }
  if (requirement.requirementType === 'credential_evaluation') {
    const evaluation = credentialCases.find(item => item.requirementIds.includes(requirement.id))
    if (!evaluation) return { action: null, interaction: null }
    if (evaluation.state === 'requirement_verified' || evaluation.state === 'provider_selected' || evaluation.state === 'evaluation_order_ready') return { action: { kind: 'secure_provider_handoff', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: `Prepare ${evaluation.provider} ${evaluation.evaluationType.replaceAll('_', ' ')}`, rationale: 'This evaluation is being shared across every dependent application case before any duplicate order is considered.', idempotencyKey: evaluation.idempotencyKey, consequential: Boolean(evaluation.cost?.known) }, interaction: createRecommendationInteraction({ kind: evaluation.cost?.known ? 'approval' : 'confirmation', id: `${requirement.id}:evaluation-handoff`, requirementId: requirement.id, question: `The ${evaluation.provider} evaluation is ready. ${evaluation.cost?.known ? 'Approve the order?' : 'Open the secure provider handoff?'}`, reason: `I found the exact provider and evaluation type from the official instructions and mapped each institution document dependency.`, knownContext: [`Provider: ${evaluation.provider}`, `Product: ${evaluation.evaluationType.replaceAll('_', ' ')}`, `Applications covered: ${evaluation.applicationCaseIds.length}`, ...evaluation.institutionDeliveries.map(delivery => `${delivery.institution}: ${delivery.state}`)], approvalScope: 'completion', reusableContextKeys: [] }) }
    if (evaluation.state === 'awaiting_institution_documents' || evaluation.institutionDeliveries.some(delivery => ['processing', 'ordered'].includes(delivery.state))) return { action: { kind: 'wait_external', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: `Wait for ${evaluation.provider}`, rationale: 'The evaluator or registrar has not produced resulting-state evidence yet.', idempotencyKey: `wait:${evaluation.id}`, consequential: false }, interaction: null }
  }
  if (requirement.requirementType === 'english_language_test') {
    const rule = applicableLanguageRequirement(requirement)
    const acceptedTests = array(rule.acceptedTests).map(item => record(item))
    const options: RecommendationInteractionOption[] = acceptedTests.map(test => ({ value: text(test.type ?? test.testType, 120), label: `Book ${text(test.label ?? test.type ?? test.testType, 120)}`, description: `${text(test.resultTurnaround ?? test.resultDays ? `${test.resultTurnaround ?? test.resultDays} days to results` : 'Accepted by this programme')}` })).filter(option => option.value)
    return { action: { kind: 'select_language_test', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: 'Choose an accepted English test', rationale: 'The waiver and existing score checks did not produce a valid result.', idempotencyKey: `language-choice:${requirement.id}`, consequential: false }, interaction: createRecommendationInteraction({ kind: 'single_choice', id: `${requirement.id}:test-choice`, requirementId: requirement.id, question: 'A new English test is required. Which accepted test should I prepare?', reason: 'I checked published waiver criteria, existing score reports, validity, overall minimums, subsection minimums, and accepted test versions first.', options, knownContext: [`Accepted tests: ${options.map(option => option.label).join(', ')}`, requirement.deadline ? `Latest application deadline: ${requirement.deadline}` : 'Deadline not recorded'], reusableContextKeys: [] }) }
  }
  if (requirement.requirementType === 'admissions_test') {
    const policy: AdmissionsTestPolicy = { requiredness: requirement.requiredness, acceptedTestTypes: stringArray(requirement.exactRule.acceptedTestTypes ?? requirement.acceptedEvidenceTypes, 20), minimumOverall: numberValue(requirement.exactRule.minimumOverall), minimumSections: {}, validityMonths: numberValue(requirement.exactRule.validityMonths), relevantDate: requirement.deadline, sourceEvidence: requirement.sourceEvidence }
    if (requirement.requiredness === 'optional' || requirement.requiredness === 'recommended') {
      const attempt = context.admissionsTestAttempts[0]
      const decision = recommendOptionalAdmissionsScore({ policy, attempt: attempt ?? null })
      if (attempt && decision.recommendation !== 'INSUFFICIENT_EVIDENCE') return { action: { kind: 'submit_optional_score', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: decision.recommendation === 'WITHHOLD' ? 'Do not submit optional score' : 'Submit optional score', rationale: decision.rationale, idempotencyKey: `optional-score:${requirement.id}:${attempt.id}`, consequential: true }, interaction: createRecommendationInteraction({ kind: 'single_choice', id: `${requirement.id}:optional-score`, requirementId: requirement.id, question: `The ${attempt.testType} is optional for this programme.`, reason: decision.rationale, options: [{ value: 'submit', label: 'Submit score', description: 'Use the verified official reporting route.' }, { value: 'withhold', label: 'Do not submit', description: 'Leave the optional score out.' }], knownContext: [`Recommendation: ${decision.recommendation}`, ...decision.sourceEvidenceIds.map(id => `Source evidence: ${id}`)], reusableContextKeys: [] }) }
      return { action: { kind: 'select_admissions_test', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: 'Keep optional test closed', rationale: decision.rationale, idempotencyKey: `optional-test-decision:${requirement.id}`, consequential: false }, interaction: null }
    }
    const options: RecommendationInteractionOption[] = policy.acceptedTestTypes.map(type => ({ value: type, label: `Book ${type}`, description: 'Accepted by the published programme rule.' }))
    return { action: { kind: 'select_admissions_test', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: 'Choose an admissions test', rationale: 'The required-test policy has no qualifying verified attempt.', idempotencyKey: `admissions-choice:${requirement.id}`, consequential: false }, interaction: createRecommendationInteraction({ kind: 'single_choice', id: `${requirement.id}:test-choice`, requirementId: requirement.id, question: 'A new admissions test is required. Which accepted test should I prepare?', reason: 'I checked the exact required/optional/not-accepted policy and existing attempts before recommending a booking.', options, knownContext: [`Accepted tests: ${options.map(option => option.label).join(', ')}`, requirement.deadline ? `Latest safe deadline: ${requirement.deadline}` : 'Deadline not recorded'], reusableContextKeys: [] }) }
  }
  return { action: { kind: 'verify_portal_receipt', requirementId: requirement.id, applicationCaseId: requirement.applicationCaseId, label: 'Verify resulting-state evidence', rationale: 'The evidence is prepared, but the receiving portal/provider state is not yet verified.', idempotencyKey: `verify:${requirement.id}`, consequential: false }, interaction: null }
}

export function buildAcademicEvidenceCoverageMap(input: { requirements: AcademicEvidenceRequirement[]; credentialEvaluationCases?: CredentialEvaluationCase[] }) {
  const entries = new Map<string, AcademicEvidenceCoverageMap['entries'][number]>()
  for (const requirement of input.requirements) {
    const artifact = requirement.currentArtifact
    if (artifact) {
      const key = `artifact:${artifact.id}`
      const entry = entries.get(key) ?? { evidenceId: artifact.id, label: artifact.filename, kind: artifact.artifactType, applicationCaseIds: [], requirementIds: [], coverageCount: 0, avoidedDuplicateCost: null }
      entry.applicationCaseIds = [...new Set([...entry.applicationCaseIds, requirement.applicationCaseId])]
      entry.requirementIds = [...new Set([...entry.requirementIds, requirement.id])]
      entry.coverageCount = entry.applicationCaseIds.length
      entries.set(key, entry)
    }
  }
  for (const evaluation of input.credentialEvaluationCases ?? []) {
    const key = `evaluation:${evaluation.id}`
    entries.set(key, { evidenceId: evaluation.id, label: `${evaluation.provider} ${evaluation.evaluationType}`, kind: 'credential_evaluation', applicationCaseIds: evaluation.applicationCaseIds, requirementIds: evaluation.requirementIds, coverageCount: evaluation.applicationCaseIds.length, avoidedDuplicateCost: evaluation.applicationCaseIds.length > 1 ? evaluation.cost : null })
  }
  const avoidedCost = [...entries.values()].filter(entry => entry.coverageCount > 1 && entry.avoidedDuplicateCost).map(entry => entry.avoidedDuplicateCost!).filter((value, index, values) => values.findIndex(candidate => candidate.amount === value.amount && candidate.currency === value.currency) === index)
  return { entries: [...entries.values()], duplicateActionsPrevented: Math.max(0, [...entries.values()].reduce((sum, entry) => sum + Math.max(0, entry.coverageCount - 1), 0)), avoidedCost }
}

export function coordinateAcademicEvidence(input: { applications: AcademicApplicationInput[]; context: AcademicContextInput; now?: string }): AcademicEvidencePlan {
  const context = resolveAcademicContext(input.context)
  const rawRequirements = input.applications.flatMap(application => {
    const rules = application.rules ?? application.requirements ?? []
    return rules.flatMap(rule => {
      const institutions = rule.institutions?.length ? rule.institutions : [rule.institution ?? application.institution]
      return institutions.map(institution => normalizeRule({ application, rule, institution, context }))
    })
  })
  const enriched = deduplicateAcademicRequirements(enrichLanguageAndAdmissions(rawRequirements, context, input.now ?? now()))
  const credential = buildCredentialEvaluationCases({ applicantId: input.context.applicantId, requirements: enriched, existing: context.credentialEvaluations })
  const coverageMap = buildAcademicEvidenceCoverageMap({ requirements: enriched, credentialEvaluationCases: credential.cases })
  const selected = nextAcademicAction(enriched, context, credential.cases)
  const autoResolved = enriched.filter(requirement => academicEvidenceRequirementIsComplete(requirement) || ['artifact_ready', 'score_ready', 'provider_selected'].includes(requirement.status)).length
  const attachmentsRequested = selected.interaction?.kind === 'attachment_request' ? 1 : 0
  const structuredSelections = selected.interaction && ['single_choice', 'multiple_choice', 'date'].includes(selected.interaction.kind) ? 1 : 0
  const authenticationHandoffs = selected.action?.kind === 'secure_provider_handoff' ? 1 : 0
  const paymentApprovals = selected.action?.consequential && enriched.find(requirement => requirement.id === selected.action?.requirementId)?.cost?.known ? 1 : 0
  const requirementsDetected = enriched.length
  return {
    version: ACADEMIC_EVIDENCE_WORKFLOW_VERSION,
    context,
    requirements: enriched,
    credentialEvaluationCases: credential.cases,
    coverageMap,
    nextAction: selected.action,
    interaction: selected.interaction,
    metrics: {
      requirementsDetected,
      automaticallyResolvedRequirements: autoResolved,
      reusedArtifacts: enriched.filter(requirement => Boolean(requirement.currentArtifact)).length,
      waiverResolutions: enriched.filter(requirement => requirement.requiredness === 'waived').length,
      attachmentsRequested,
      structuredSelections,
      authenticationHandoffs,
      paymentApprovals,
      rareFreeTextInputs: 0,
      externalRequests: enriched.filter(requirement => ['official_order_needed', 'provider_selected'].includes(requirement.status)).length,
      userInterruptionsAvoided: Math.max(0, context.autoResolvedFacts.length - (selected.interaction ? 1 : 0)),
      duplicateCostsPrevented: credential.duplicateActionsPrevented + coverageMap.duplicateActionsPrevented,
      autonomousResolutionRate: requirementsDetected ? autoResolved / requirementsDetected : 1,
    },
    blockers: enriched.filter(requirement => requirement.blocker && !academicEvidenceRequirementIsComplete(requirement)).map(requirement => `${requirement.id}: ${requirement.blocker}`),
  }
}

function validAcademicInteractionValue(interaction: AcademicProgressInteraction, value: RecommendationInteractionResponse['value']) {
  if (interaction.kind === 'approval' || interaction.kind === 'confirmation') return value === true || value === 'approve' || value === 'confirm'
  if (interaction.kind === 'single_choice' || interaction.kind === 'contact_select' || interaction.kind === 'attachment_selection') return typeof value === 'string' && interaction.options.some(option => option.value === value && !option.disabled)
  if (interaction.kind === 'multiple_choice') return Array.isArray(value) && value.length >= interaction.minSelections && value.length <= interaction.maxSelections && value.every(item => typeof item === 'string' && interaction.options.some(option => option.value === item && !option.disabled))
  if (interaction.kind === 'attachment_request') return Array.isArray(value) && value.length >= interaction.minimumFiles && value.length <= interaction.maximumFiles && value.every(item => typeof item === 'string' && item.length > 0)
  if (interaction.kind === 'date') return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && validDate(`${value}T00:00:00Z`)
  if (interaction.kind === 'fact') return value !== null && value !== undefined && (typeof value === 'string' ? value.trim().length > 0 : true)
  if (interaction.kind === 'email') return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  return (interaction.kind === 'short_text' || interaction.kind === 'correction') && typeof value === 'string' && value.trim().length > 0 && value.length <= interaction.maximumCharacters
}

export function applyAcademicProgressInteraction(input: { context: AcademicContextResolution; interaction: AcademicProgressInteraction; value: RecommendationInteractionResponse['value']; reusableContextConsent?: boolean; submittedAt?: string }) {
  const field = 'field' in input.interaction ? input.interaction.field : input.interaction.mapsToRequirement
  const sensitive = /password|passcode|otp|one[- ]time|bank|card|cvv|payment|security.?code/i.test(field)
  const valid = !sensitive && validAcademicInteractionValue(input.interaction, input.value)
  const submittedAt = input.submittedAt ?? now()
  const metric: AcademicInteractionMetric = { interactionId: input.interaction.id, requirementId: input.interaction.requirementId, kind: input.interaction.kind, outcome: valid ? 'answered' : 'invalid', resumedAutomatically: valid, reusableContextSaved: valid && input.reusableContextConsent === true && input.interaction.reusableContextKeys.length > 0, createdAt: submittedAt }
  if (!valid) return { accepted: false, context: input.context, response: null, metric, error: sensitive ? 'Credentials and security values must use the secure provider handoff.' : 'The response does not match the typed Progress Detail control.' }
  const response: RecommendationInteractionResponse = { interactionId: input.interaction.id, kind: input.interaction.kind, value: input.value, submittedAt, reusable: input.reusableContextConsent === true && input.interaction.reusableContextKeys.length > 0 }
  const value = Array.isArray(input.value) ? input.value : input.value
  const reusableAcademicHistory = response.reusable ? { ...input.context.reusableAcademicHistory, [input.interaction.reusableContextKeys[0] ?? input.interaction.mapsToRequirement]: value } : input.context.reusableAcademicHistory
  const autoResolvedFacts = [...input.context.autoResolvedFacts, { key: input.interaction.mapsToRequirement, value, sourceIds: [`interaction:${input.interaction.id}`], confidence: 'high' as const }]
  return { accepted: true, context: { ...input.context, reusableAcademicHistory, autoResolvedFacts }, response, metric, error: null }
}

export function academicEvidenceProgressDetailExamples(input: AcademicEvidencePlan) {
  const examples = input.interaction ? [{ kind: input.interaction.kind, question: input.interaction.question, reason: input.interaction.reason, knownContext: input.interaction.knownContext }] : []
  return examples
}
