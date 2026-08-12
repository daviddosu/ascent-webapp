/**
 * David's application domain contract.
 *
 * This file is deliberately provider-neutral. It is imported by the browser
 * for display and by Edge Functions for validation, so every value that can
 * reach an application portal has one small, inspectable source of truth.
 */

import {
  buildRecommenderSupportPack,
  extractRecommendationRequirements,
  generateRecommendationRequestEmail,
  type RecommenderCandidate,
} from './recommendation-workflow.ts'
import type { ApplicationFeeRequirement, ApplicationFeeWorkflow, FeeApplicantFact } from './application-fee-workflow.ts'

export const DAVID_APPLICATION_SCHEMA_VERSION = 1 as const

export const provenanceKinds = [
  'user_statement',
  'uploaded_document',
  'verified_external_source',
  'generated_inference',
] as const
export type ProvenanceKind = typeof provenanceKinds[number]

export const provenanceConfidence = ['high', 'medium', 'low'] as const
export type ProvenanceConfidence = typeof provenanceConfidence[number]

export type FactProvenance = {
  kind: ProvenanceKind
  confirmed: boolean
  confidence: ProvenanceConfidence
  sourceAssetIds: string[]
  sourceUrl: string | null
  sourceExcerpt: string | null
  retrievedAt: string | null
  note: string | null
}

export type ApplicantFact<T> = {
  value: T
  provenance: FactProvenance
}

export type ApplicantFactCollection<T> = Array<ApplicantFact<T>>

export type EducationRecord = {
  institution: string
  degree: string
  field: string
  startDate: string | null
  endDate: string | null
  grade: string | null
  country: string | null
}

export type EmploymentRecord = {
  employer: string
  title: string
  startDate: string | null
  endDate: string | null
  responsibilities: string[]
}

export type ResearchRecord = {
  title: string
  institution: string | null
  summary: string
  methods: string[]
  outcomes: string[]
  startDate: string | null
  endDate: string | null
}

export type PublicationRecord = {
  title: string
  venue: string | null
  year: number | null
  url: string | null
  authorship: string | null
}

export type AwardRecord = {
  title: string
  issuer: string | null
  year: number | null
  description: string | null
}

export type ContactReference = {
  name: string
  email: string | null
  institution: string | null
  relationship: string | null
  specialty: string | null
  providerContactId: string | null
}

export type PersonalStory = {
  title: string
  story: string
  themes: string[]
  approvedForReuse: boolean
}

export type IdentityDocumentMetadata = {
  documentType: 'passport' | 'national_id' | 'residence_permit' | 'other'
  issuingCountry: string | null
  expiryDate: string | null
  assetId: string | null
  lastFour: string | null
}

export type ReusableContextConsent = {
  granted: boolean
  grantedAt: string | null
  scope: 'application_tasks' | 'all_tasks' | null
  revokedAt: string | null
}

export type ApplicantProfile = {
  id: string
  userId: string
  schemaVersion: typeof DAVID_APPLICATION_SCHEMA_VERSION
  legalName: ApplicantFact<string> | null
  preferredName: ApplicantFact<string> | null
  contactInformation: {
    email: ApplicantFact<string> | null
    phone: ApplicantFact<string> | null
    address: ApplicantFact<string> | null
  }
  nationality: ApplicantFact<string> | null
  residency: ApplicantFact<string> | null
  education: ApplicantFactCollection<EducationRecord>
  employment: ApplicantFactCollection<EmploymentRecord>
  researchExperience: ApplicantFactCollection<ResearchRecord>
  projects: ApplicantFactCollection<string>
  publications: ApplicantFactCollection<PublicationRecord>
  awards: ApplicantFactCollection<AwardRecord>
  leadershipExperience: ApplicantFactCollection<string>
  volunteering: ApplicantFactCollection<string>
  skills: ApplicantFactCollection<string>
  testScores: ApplicantFactCollection<Record<string, string | number>>
  researchInterests: ApplicantFactCollection<string>
  careerGoals: ApplicantFactCollection<string>
  geographicPreferences: ApplicantFactCollection<string>
  fundingRequirements: ApplicantFactCollection<string>
  programmePreferences: ApplicantFactCollection<string>
  professors: ApplicantFactCollection<ContactReference>
  referees: ApplicantFactCollection<ContactReference>
  reusableStories: ApplicantFactCollection<PersonalStory>
  identityDocumentMetadata: ApplicantFactCollection<IdentityDocumentMetadata>
  /** Verified, reusable facts that may be used only when an authoritative waiver policy asks for them. */
  feeWaiverFacts?: FeeApplicantFact[]
  consent: ReusableContextConsent
  createdAt: string
  updatedAt: string
}

export const applicationKinds = [
  'masters',
  'phd',
  'scholarship',
  'fellowship',
  'accelerator',
  'research_programme',
  'internship',
  'job',
  'grant',
  'other',
] as const
export type ApplicationKind = typeof applicationKinds[number]

export const campaignStatuses = [
  'intake',
  'researching',
  'awaiting_shortlist_approval',
  'approved',
  'preparing',
  'executing',
  'monitoring',
  'completed',
  'paused',
  'cancelled',
] as const
export type ApplicationCampaignStatus = typeof campaignStatuses[number]

export type ApplicationCampaign = {
  id: string
  userId: string
  taskId: string
  ownerSpecialistId: 'david'
  objective: string
  applicationKind: ApplicationKind
  targetFields: string[]
  targetCountries: string[]
  degreeLevel: string | null
  intakeYear: number | null
  fundingRequirements: string[]
  quantityTarget: number | null
  searchCriteria: Record<string, unknown>
  approvedStrategy: Record<string, unknown> | null
  status: ApplicationCampaignStatus
  opportunityIds: string[]
  applicationCaseIds: string[]
  deadlines: Array<{ opportunityId: string; deadline: Deadline }>
  progress: ApplicationProgress
  executionEvidenceIds: string[]
  createdAt: string
  updatedAt: string
}

export type Deadline = {
  dateTime: string
  timezone: string
  label: string | null
  sourceUrl: string | null
  retrievedAt: string | null
}

export const verificationStatuses = ['unverified', 'partially_verified', 'verified', 'stale', 'conflicted'] as const
export type VerificationStatus = typeof verificationStatuses[number]

export type OpportunityCitation = {
  url: string
  excerpt: string
  retrievedAt: string
  sourceType: 'official' | 'government' | 'secondary'
}

export type Opportunity = {
  id: string
  campaignId: string
  userId: string
  institution: string
  department: string | null
  programmeTitle: string
  degreeOrAwardType: string
  entryTerm: string | null
  officialUrl: string
  applicationUrl: string | null
  deadline: Deadline | null
  fee: { amount: number; currency: string; waiverAvailable: boolean | null } | null
  funding: {
    status: 'full' | 'partial' | 'none' | 'unknown'
    summary: string
    stipend: string | null
    tuitionCoverage: string | null
  }
  eligibility: string[]
  academicPrerequisites: string[]
  requiredTests: string[]
  languageRequirements: string[]
  requiredDocuments: string[]
  requiredEssays: string[]
  recommendationCount: number | null
  supervisorContactExpectation: 'required' | 'recommended' | 'not_required' | 'unknown'
  faculty: Array<FacultyMatch>
  contactRequirements: string[]
  applicationStages: string[]
  authorshipRules: string[]
  citations: OpportunityCitation[]
  retrievalDate: string
  verificationStatus: VerificationStatus
  confidence: number
  fitScore: number
  admissionLikelihoodFactors: string[]
  recommendationRationale: string
}

export type FacultyMatch = {
  name: string
  department: string | null
  officialUrl: string
  researchAreas: string[]
  selectedWork: string[]
  fitScore: number
  fitRationale: string
  contactAllowed: boolean
}

export const requirementStatuses = [
  'unknown',
  'verified',
  'missing',
  'in_progress',
  'awaiting_user',
  'awaiting_writer',
  'awaiting_referee',
  'awaiting_institution',
  'ready',
  'approved',
  'submitted',
  'rejected',
  'waived',
  'expired',
] as const
export type RequirementStatus = typeof requirementStatuses[number]

export const requirementCategories = [
  'identity',
  'academic',
  'test',
  'essay',
  'reference',
  'financial',
  'portfolio',
  'portal',
  'other',
] as const
export type RequirementCategory = typeof requirementCategories[number]

export type Requirement = {
  id: string
  applicationCaseId: string
  name: string
  category: RequirementCategory
  source: OpportunityCitation | null
  required: boolean
  exactInstructions: string
  deadline: Deadline | null
  status: RequirementStatus
  responsibleParty: 'applicant' | 'david' | 'writer' | 'referee' | 'roon' | 'institution'
  linkedArtifactId: string | null
  verificationEvidenceIds: string[]
  blockerReason: string | null
  /** Requirement-graph fields are optional for backwards-compatible rows. */
  sourceId?: string | null
  requirementType?: string | null
  dependencyIds?: string[]
  evidenceContract?: string[]
  retryState?: {
    attempts: number
    maximumAttempts: number
    lastFailure: string | null
    nextAttemptAt: string | null
    escalated: boolean
  } | null
  resolutionTier?: number | null
  waitUntil?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export const applicationCaseStages = [
  'intake',
  'research',
  'shortlist_approval',
  'document_preparation',
  'writer_assignment',
  'referee_coordination',
  'portal_preparation',
  'submission_approval',
  'submitted',
  'monitoring',
  'interview',
  'additional_documents',
  'offer',
  'rejected',
  'withdrawn',
  'closed',
] as const
export type ApplicationCaseStage = typeof applicationCaseStages[number]

export const applicationCaseStatuses = [
  'active',
  'awaiting_user',
  'awaiting_writer',
  'awaiting_referee',
  'awaiting_institution',
  'awaiting_submission_approval',
  'submitted',
  'monitoring',
  'interview',
  'additional_documents',
  'offer',
  'rejected',
  'withdrawn',
  'closed',
] as const
export type ApplicationCaseStatus = typeof applicationCaseStatuses[number]

export type PortalAccount = {
  identifier: string | null
  destinationEmail: string | null
  provider: string | null
  lastVerifiedAt: string | null
}

export type SubmittedValue = {
  field: string
  value: string | number | boolean | null
  provenance: FactProvenance
}

export type ApplicationCase = {
  id: string
  campaignId: string
  opportunityId: string
  userId: string
  taskId: string
  currentStage: ApplicationCaseStage
  status: ApplicationCaseStatus
  requirements: Requirement[]
  portalAccount: PortalAccount
  portalSessionId: string | null
  documents: string[]
  essays: string[]
  contacts: string[]
  referees: string[]
  writerAssignmentIds: string[]
  communications: string[]
  approvalIds: string[]
  deadlines: Deadline[]
  submittedValues: SubmittedValue[]
  portalCheckpoints: string[]
  evidenceIds: string[]
  blockers: string[]
  nextAction: string
  finalOutcome: string | null
  applicationId: string | null
  submissionAttemptKey: string | null
  submittedAt: string | null
  /** Canonical fee lifecycle projection for this application case. */
  feeRequirement?: ApplicationFeeRequirement | null
  feeWorkflow?: ApplicationFeeWorkflow | null
  createdAt: string
  updatedAt: string
}

export type ArtifactKind =
  | 'immutable_original'
  | 'canonical_profile_record'
  | 'generated_derivative'
  | 'programme_derivative'
  | 'writer_draft'
  | 'reference_letter'
  | 'edited_version'
  | 'approved_final'
  | 'submitted_version'

export type ArtifactApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected' | 'superseded'

export type Artifact = {
  id: string
  fileAssetId: string
  kind: ArtifactKind
  originalAssetIds: string[]
  programmeId: string | null
  applicationCaseId: string | null
  templateVersion: string | null
  promptVersion: string | null
  author: 'david' | 'user' | 'writer' | 'editor' | 'referee' | 'institution'
  revisionOf: string | null
  revisionHistory: string[]
  checksum: string
  approvalStatus: ArtifactApprovalStatus
  finalSubmissionDestination: string | null
}

export type ApplicationContact = {
  id: string
  applicationCaseId: string | null
  kind: 'professor' | 'admissions' | 'referee' | 'writer' | 'editor' | 'administrator'
  name: string
  email: string | null
  providerContactId: string | null
  gmailThreadId: string | null
  lastProviderMessageId: string | null
  consentToContact: boolean
}

export type ApplicationWriter = {
  id: string
  name: string
  email: string
  specialties: string[]
  degreeFields: string[]
  programmeFamiliarity: string[]
  price: { amount: number; currency: string } | null
  turnaroundHours: number | null
  availability: 'available' | 'busy' | 'unavailable'
  qualityScore: number | null
  reliabilityScore: number | null
  revisionRate: number | null
  activeAssignments: number
}

export type ApplicationCommunication = {
  id: string
  applicationCaseId: string
  contactId: string | null
  provider: string
  providerMessageId: string | null
  providerThreadId: string | null
  direction: 'inbound' | 'outbound'
  classification: ApplicationReplyClassification | null
  excerpt: string | null
  createdAt: string
}

export const assignmentStatuses = ['draft', 'assigned', 'awaiting_question', 'in_progress', 'revision_requested', 'quality_review', 'approved', 'cancelled', 'overdue'] as const
export type HumanAssignmentStatus = typeof assignmentStatuses[number]

export type HumanAssignment = {
  id: string
  applicationCaseId: string
  writerId: string
  specialty: string
  deliverable: string
  brief: string
  sourceMaterials: string[]
  deadline: Deadline | null
  price: { amount: number; currency: string } | null
  status: HumanAssignmentStatus
  questions: string[]
  revisionCount: number
  qualityReview: { score: number | null; notes: string; reviewerId: string | null }
  finalArtifactId: string | null
  paymentStatus: 'not_applicable' | 'pending' | 'paid' | 'failed'
  slaBreaches: string[]
  escalationLevel: number
}

export type PortalExecutionContract = {
  portalIdentity: string
  sectionIdentity: string
  expectedFields: Array<{ field: string; source: string; required: boolean }>
  requiredUploads: Array<{ assetId: string; destination: string }>
  ambiguousFields: string[]
  completionCriteria: string[]
  saveCriteria: string[]
  evidenceRequirements: string[]
  allowedUserHandoffs: string[]
}

export type PortalCheckpoint = {
  id: string
  applicationCaseId: string
  portal: string
  accountIdentifier: string | null
  url: string
  section: string
  contract: PortalExecutionContract
  enteredValues: Record<string, string | number | boolean | null>
  valueSources: Record<string, string>
  uploadedArtifacts: string[]
  saveConfirmation: string | null
  validationErrors: string[]
  screenshots: string[]
  sessionInformation: { sessionId: string; fingerprint: string | null; expiresAt: string | null }
  completionSignal: string | null
  nextStep: string | null
  verified: boolean
  createdAt: string
}

export const evidenceKinds = [
  'official_requirement_source',
  'programme_snapshot',
  'sent_message',
  'received_message',
  'uploaded_file_verification',
  'saved_section_screenshot',
  'submission_confirmation',
  'application_id',
  'receipt',
  'status_email',
  'approval_record',
  'otp_retrieval',
] as const
export type EvidenceKind = typeof evidenceKinds[number]

export type Evidence = {
  id: string
  applicationCaseId: string
  kind: EvidenceKind
  sourceUrl: string | null
  provider: string | null
  providerMessageId: string | null
  providerThreadId: string | null
  assetId: string | null
  excerpt: string | null
  capturedAt: string
  metadata: Record<string, unknown>
}

export type ApplicationProgress = {
  completed: number
  total: number
  label: string
  nextAction: string
  blockers: string[]
  evidenceCount: number
}

export type DavidApplicationState = {
  schemaVersion: typeof DAVID_APPLICATION_SCHEMA_VERSION
  campaignId: string | null
  caseIds: string[]
  currentCaseId: string | null
  status: ApplicationCampaignStatus | ApplicationCaseStatus
  stage: ApplicationCaseStage
  progress: ApplicationProgress
  nextAction: string
  blockers: string[]
  verifiedOpportunityCount: number
  lastEvidenceAt: string | null
}

export type InterAgentRequestKind =
  | 'create_draft'
  | 'send_email'
  | 'monitor_thread'
  | 'resolve_contact'
  | 'follow_up'
  | 'read_application_reply'
  | 'schedule_interview'
  | 'schedule_meeting'
  | 'create_calendar_reminder'
  | 'monitor_writer_deadline'
  | 'monitor_referee_deadline'
  | 'monitor_professor_reply'
  | 'detect_application_messages'
  | 'search_otp'
  | 'request_academic_document'
  | 'request_credential_evaluation_delivery'
  | 'monitor_academic_delivery'
  | 'monitor_test_score_delivery'
  | 'send_fee_waiver_request'
  | 'monitor_fee_waiver'
  | 'admissions_clarification'
  | 'post_submission_response'

export type InterAgentRequestStatus = 'queued' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'cancelled'

export type InterAgentRequest = {
  id: string
  taskId: string
  agentRunId: string
  applicationCaseId: string
  fromSpecialistId: 'david' | 'roon' | 'caspian'
  toSpecialistId: 'roon' | 'david' | 'caspian'
  kind: InterAgentRequestKind
  payload: Record<string, unknown>
  idempotencyKey: string
  status: InterAgentRequestStatus
  result: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type ApplicationReplyClassification =
  | 'missing_documents'
  | 'interview_invitation'
  | 'referee_issue'
  | 'portal_update'
  | 'conditional_offer'
  | 'rejection'
  | 'scholarship_update'
  | 'payment_request'
  | 'visa_or_enrolment'
  | 'other'

export type OtpRequest = {
  applicationCaseId: string
  institution: string
  portal: string
  destinationEmail: string
  requestedAt: string
  senderClues: string[]
  subjectClues: string[]
}

export type OtpMessage = {
  id: string
  threadId: string | null
  from: string
  to: string
  subject: string
  body: string
  receivedAt: string
  applicationCaseId?: string | null
}

export type MatchedOtp = {
  code: string
  messageId: string
  threadId: string | null
  receivedAt: string
  redactedCode: string
}

export type SubmissionReadinessReport = {
  applicationCaseId: string
  opportunityId: string
  programme: string
  deadline: Deadline | null
  completedRequirements: string[]
  unresolvedWarnings: string[]
  enteredFactualInformation: SubmittedValue[]
  selectedDocumentVersions: string[]
  essayVersions: string[]
  refereeStatus: string[]
  fee: Opportunity['fee']
  declarations: string[]
  portalValidationState: string[]
  blockers: string[]
  ready: boolean
  generatedAt: string
}

export type ValidationIssue = {
  path: string
  message: string
  severity: 'error' | 'warning'
}

const submitAllowedProvenance = new Set<ProvenanceKind>([
  'user_statement',
  'uploaded_document',
  'verified_external_source',
])

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, maximum = 10_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function unique(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

function clampScore(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, Math.round(number)))
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (record(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
  return value
}

function hash(value: unknown) {
  const input = JSON.stringify(stable(value))
  let result = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    result ^= input.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(16).padStart(8, '0')
}

export function createFactProvenance(
  kind: ProvenanceKind,
  options: Partial<Omit<FactProvenance, 'kind'>> = {},
): FactProvenance {
  return {
    kind,
    confirmed: options.confirmed ?? kind !== 'generated_inference',
    confidence: options.confidence ?? (kind === 'verified_external_source' ? 'high' : 'medium'),
    sourceAssetIds: unique(options.sourceAssetIds ?? []),
    sourceUrl: text(options.sourceUrl, 2_000) || null,
    sourceExcerpt: text(options.sourceExcerpt, 2_000) || null,
    retrievedAt: text(options.retrievedAt, 80) || null,
    note: text(options.note, 1_000) || null,
  }
}

export function createApplicantFact<T>(value: T, kind: ProvenanceKind, options: Partial<Omit<FactProvenance, 'kind'>> = {}): ApplicantFact<T> {
  return { value, provenance: createFactProvenance(kind, options) }
}

export function canUseFactForSubmission<T>(fact: ApplicantFact<T> | null | undefined) {
  return Boolean(fact && fact.provenance.confirmed && submitAllowedProvenance.has(fact.provenance.kind))
}

export function factsAwaitingConfirmation(profile: ApplicantProfile) {
  const facts: Array<{ field: string; fact: ApplicantFact<unknown> }> = []
  const visit = (field: string, value: unknown) => {
    if (value && record(value) && 'provenance' in value) {
      const fact = value as ApplicantFact<unknown>
      if (!fact.provenance.confirmed || fact.provenance.kind === 'generated_inference') facts.push({ field, fact })
      return
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(`${field}[${index}]`, item))
    else if (record(value)) Object.entries(value).forEach(([key, item]) => visit(`${field}.${key}`, item))
  }
  visit('profile', profile)
  return facts
}

export function createEmptyApplicantProfile(userId: string, now = new Date().toISOString()): ApplicantProfile {
  const empty = {
    id: cryptoRandomId('profile'),
    userId,
    schemaVersion: DAVID_APPLICATION_SCHEMA_VERSION,
    legalName: null,
    preferredName: null,
    contactInformation: { email: null, phone: null, address: null },
    nationality: null,
    residency: null,
    education: [],
    employment: [],
    researchExperience: [],
    projects: [],
    publications: [],
    awards: [],
    leadershipExperience: [],
    volunteering: [],
    skills: [],
    testScores: [],
    researchInterests: [],
    careerGoals: [],
    geographicPreferences: [],
    fundingRequirements: [],
    programmePreferences: [],
    professors: [],
    referees: [],
    reusableStories: [],
    identityDocumentMetadata: [],
    consent: { granted: false, grantedAt: null, scope: null, revokedAt: null },
    createdAt: now,
    updatedAt: now,
  } satisfies ApplicantProfile
  return empty
}

function cryptoRandomId(prefix: string) {
  try {
    return `${prefix}-${crypto.randomUUID()}`
  } catch {
    return `${prefix}-${hash(`${prefix}:${Date.now()}:${Math.random()}`)}`
  }
}

export function validateApplicantProfile(profile: ApplicantProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!profile || profile.schemaVersion !== DAVID_APPLICATION_SCHEMA_VERSION) issues.push({ path: 'schemaVersion', message: 'Unsupported applicant profile schema.', severity: 'error' })
  if (!text(profile?.userId, 120)) issues.push({ path: 'userId', message: 'An owner is required.', severity: 'error' })
  const visit = (path: string, value: unknown) => {
    if (value && record(value) && 'provenance' in value) {
      const provenance = (value as ApplicantFact<unknown>).provenance
      if (!record(provenance) || !provenanceKinds.includes(provenance.kind)) issues.push({ path: `${path}.provenance`, message: 'Every applicant fact needs a valid provenance kind.', severity: 'error' })
      if (provenance?.kind === 'uploaded_document' && !provenance.sourceAssetIds.length) issues.push({ path: `${path}.provenance.sourceAssetIds`, message: 'Uploaded facts need a source asset.', severity: 'error' })
      if (provenance?.kind === 'verified_external_source' && !provenance.sourceUrl) issues.push({ path: `${path}.provenance.sourceUrl`, message: 'Externally verified facts need a source URL.', severity: 'error' })
      return
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(`${path}[${index}]`, item))
    else if (record(value)) Object.entries(value).forEach(([key, item]) => visit(`${path}.${key}`, item))
  }
  visit('profile', profile)
  return issues
}

export function resolveFactConflict<T>(field: string, candidates: Array<ApplicantFact<T>>) {
  if (!candidates.length) return { status: 'missing' as const, field, value: undefined, candidates: [], reason: 'No fact was found.' }
  const normalized = candidates.map(candidate => JSON.stringify(stable(candidate.value)))
  const allAgree = normalized.every(value => value === normalized[0])
  if (!allAgree) return { status: 'conflict' as const, field, value: undefined, candidates, reason: 'Sources disagree; user confirmation is required.' }
  const best = [...candidates].sort((left, right) => Number(right.provenance.confirmed) - Number(left.provenance.confirmed))[0]
  return { status: 'resolved' as const, field, value: best?.value, candidates, reason: 'Sources agree.' }
}

export function parseDeadline(value: string, timezone = 'UTC', sourceUrl: string | null = null, now = new Date().toISOString()): Deadline | null {
  const raw = text(value, 120)
  if (!raw || !isValidTimezone(timezone)) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.000Z` : raw
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return { dateTime: parsed.toISOString(), timezone, label: raw, sourceUrl: text(sourceUrl, 2_000) || null, retrievedAt: now }
}

export function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return Boolean(value)
  } catch {
    return false
  }
}

export function verifyOfficialSource(url: string, institutionDomains: string[] = []) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLocaleLowerCase()
    return institutionDomains.length === 0 || institutionDomains.some(domain => {
      const normalized = domain.toLocaleLowerCase().replace(/^www\./, '')
      return host === normalized || host.endsWith(`.${normalized}`)
    })
  } catch {
    return false
  }
}

export function verifyOpportunity(opportunity: Opportunity, now = new Date()) {
  const issues: ValidationIssue[] = []
  if (!verifyOfficialSource(opportunity.officialUrl)) issues.push({ path: 'officialUrl', message: 'The opportunity needs an HTTPS official source.', severity: 'error' })
  let officialHost = ''
  try { officialHost = new URL(opportunity.officialUrl).hostname.toLocaleLowerCase() } catch { /* the URL issue above is authoritative */ }
  const hasAuthoritativeCitation = opportunity.citations.some(citation => {
    if (!['official', 'government'].includes(citation.sourceType) || !verifyOfficialSource(citation.url)) return false
    try {
      const citationHost = new URL(citation.url).hostname.toLocaleLowerCase()
      return citationHost === officialHost || citationHost.endsWith(`.${officialHost}`) || officialHost.endsWith(`.${citationHost}`)
    } catch { return false }
  })
  if (!hasAuthoritativeCitation) issues.push({ path: 'citations', message: 'At least one official or government citation on the opportunity domain is required.', severity: 'error' })
  if (!opportunity.retrievalDate || Number.isNaN(Date.parse(opportunity.retrievalDate))) issues.push({ path: 'retrievalDate', message: 'The retrieval time is missing or invalid.', severity: 'error' })
  if (opportunity.deadline && Date.parse(opportunity.deadline.dateTime) < now.getTime() && opportunity.verificationStatus !== 'stale') issues.push({ path: 'deadline', message: 'The deadline has passed and must be revalidated.', severity: 'warning' })
  if (opportunity.confidence < 0 || opportunity.confidence > 100) issues.push({ path: 'confidence', message: 'Confidence must be between 0 and 100.', severity: 'error' })
  return { verified: issues.every(issue => issue.severity !== 'error') && opportunity.verificationStatus === 'verified', issues }
}

export type OpportunityRank = {
  opportunity: Opportunity
  score: number
  factors: Record<string, number>
  rationale: string
}

export function rankOpportunities(opportunities: Opportunity[], campaign: Pick<ApplicationCampaign, 'targetCountries' | 'fundingRequirements' | 'searchCriteria'>): OpportunityRank[] {
  const countries = campaign.targetCountries.map(value => value.toLocaleLowerCase())
  const fundingRequired = campaign.fundingRequirements.length > 0
  return opportunities.map(opportunity => {
    const countryMatch = countries.length === 0 || countries.some(country => `${opportunity.institution} ${opportunity.officialUrl}`.toLocaleLowerCase().includes(country))
    const fundingMatch = !fundingRequired || opportunity.funding.status === 'full'
    const verified = verifyOpportunity(opportunity).verified
    const factors = {
      eligibility: clampScore(opportunity.eligibility.length ? opportunity.confidence : 0),
      academicFit: clampScore(opportunity.fitScore),
      researchFit: clampScore(opportunity.faculty.length ? Math.max(...opportunity.faculty.map(faculty => faculty.fitScore)) : opportunity.fitScore / 2),
      funding: fundingMatch ? opportunity.funding.status === 'full' ? 100 : opportunity.funding.status === 'partial' ? 55 : 0 : 0,
      preference: countryMatch ? 100 : 20,
      deadlineFeasibility: opportunity.deadline && Date.parse(opportunity.deadline.dateTime) > Date.now() ? 100 : 0,
      documentReadiness: opportunity.requiredDocuments.length ? Math.max(10, 100 - opportunity.requiredDocuments.length * 12) : 100,
      professorFit: opportunity.faculty.length ? Math.max(...opportunity.faculty.map(faculty => faculty.fitScore)) : 30,
      competitiveness: clampScore(100 - opportunity.admissionLikelihoodFactors.length * 10),
      effort: clampScore(100 - (opportunity.requiredDocuments.length + opportunity.requiredEssays.length) * 8),
    }
    const score = clampScore(
      factors.eligibility * 0.18 + factors.academicFit * 0.16 + factors.researchFit * 0.14 + factors.funding * 0.18 +
      factors.preference * 0.08 + factors.deadlineFeasibility * 0.08 + factors.documentReadiness * 0.06 + factors.professorFit * 0.05 +
      factors.competitiveness * 0.04 + factors.effort * 0.03 + (verified ? 4 : 0),
    )
    const rationale = [
      verified ? 'official requirements verified' : 'verification still needed',
      fundingMatch ? opportunity.funding.status === 'full' ? 'full funding match' : 'funding needs review' : 'funding requirement not met',
      countryMatch ? 'location matches preference' : 'location is outside the stated preference',
      opportunity.faculty.length ? `faculty fit up to ${Math.max(...opportunity.faculty.map(faculty => faculty.fitScore))}/100` : 'faculty fit not yet established',
    ].join('; ')
    return { opportunity, score, factors, rationale }
  }).sort((left, right) => right.score - left.score)
}

export function buildFacultyMatch(input: Omit<FacultyMatch, 'fitScore'> & { fitScore?: number }): FacultyMatch {
  return { ...input, fitScore: clampScore(input.fitScore ?? 0) }
}

export function createPortalExecutionContract(input: PortalExecutionContract): PortalExecutionContract {
  return {
    portalIdentity: text(input.portalIdentity, 160),
    sectionIdentity: text(input.sectionIdentity, 160),
    expectedFields: input.expectedFields.map(field => ({ field: text(field.field, 160), source: text(field.source, 500), required: Boolean(field.required) })),
    requiredUploads: input.requiredUploads.map(upload => ({ assetId: text(upload.assetId, 120), destination: text(upload.destination, 500) })),
    ambiguousFields: unique(input.ambiguousFields).slice(0, 50),
    completionCriteria: unique(input.completionCriteria).slice(0, 30),
    saveCriteria: unique(input.saveCriteria).slice(0, 30),
    evidenceRequirements: unique(input.evidenceRequirements).slice(0, 30),
    allowedUserHandoffs: unique(input.allowedUserHandoffs).slice(0, 30),
  }
}

export function recordPortalCheckpoint(input: Omit<PortalCheckpoint, 'verified' | 'createdAt'>, now = new Date().toISOString()): PortalCheckpoint {
  const contract = createPortalExecutionContract(input.contract)
  const requiredFields = contract.expectedFields.filter(field => field.required).map(field => field.field)
  const missingSources = requiredFields.filter(field => !text(input.valueSources[field], 500))
  const missingUploads = contract.requiredUploads.filter(upload => !input.uploadedArtifacts.includes(upload.assetId))
  const verified = !contract.ambiguousFields.length && !input.validationErrors.length && Boolean(input.saveConfirmation) &&
    !missingSources.length && !missingUploads.length && Boolean(input.completionSignal || input.nextStep)
  return { ...input, contract, verified, createdAt: now }
}

export function canAdvancePortalCheckpoint(checkpoint: PortalCheckpoint) {
  return checkpoint.verified && !checkpoint.contract.ambiguousFields.length && !checkpoint.validationErrors.length
}

export function buildReadinessReport(input: {
  applicationCase: ApplicationCase
  opportunity: Opportunity
  artifacts: Artifact[]
  refereeStatus?: string[]
  declarations?: string[]
  portalValidationState?: string[]
  now?: string
}): SubmissionReadinessReport {
  const { applicationCase, opportunity } = input
  const blockers: string[] = []
  const warnings: string[] = []
  const completedRequirements: string[] = []
  for (const requirement of applicationCase.requirements) {
    if (!requirement.required) continue
    if (['verified', 'ready', 'approved', 'submitted', 'waived'].includes(requirement.status)) completedRequirements.push(requirement.name)
    else blockers.push(`${requirement.name}: ${requirement.blockerReason ?? requirement.status.replaceAll('_', ' ')}`)
  }
  const linkedArtifactIds = new Set([...applicationCase.documents, ...applicationCase.essays])
  const selected = input.artifacts.filter(artifact => artifact.applicationCaseId === applicationCase.id && (!linkedArtifactIds.size || linkedArtifactIds.has(artifact.id)))
  // A readiness report is the package the user is about to approve. Generated
  // and writer artifacts may still be pending at this point; the approval
  // transaction promotes the exact selected versions to approved_final before
  // the browser submission gate runs.
  const selectedFinals = selected.filter(artifact =>
    ['approved_final', 'programme_derivative', 'writer_draft', 'reference_letter', 'edited_version', 'generated_derivative'].includes(artifact.kind) &&
    ['approved', 'pending'].includes(artifact.approvalStatus),
  )
  const pendingFinals = selectedFinals.filter(artifact => artifact.approvalStatus !== 'approved')
  const selectedDocumentVersions = selectedFinals.map(artifact => artifact.id)
  if (selectedFinals.length < applicationCase.documents.length + applicationCase.essays.length) blockers.push('Every selected document needs an approved final version.')
  if (pendingFinals.length) warnings.push(`${pendingFinals.length} selected document version(s) will be promoted to approved final only when you approve this exact submission package.`)
  const refereeStatus = input.refereeStatus ?? applicationCase.referees.map(referee => `${referee}: status unknown`)
  if (refereeStatus.some(status => /(?:missing|pending|unknown|declined|overdue)/i.test(status))) blockers.push('One or more required referee actions are unresolved.')
  const portalValidationState = input.portalValidationState ?? []
  if (portalValidationState.some(state => {
    const normalized = state.toLocaleLowerCase()
    return /(?:error|invalid|ambiguous|required)/.test(normalized) && !/\bno\s+(?:errors?|issues?)\b/.test(normalized)
  })) blockers.push('The portal still reports a validation issue.')
  for (const value of applicationCase.submittedValues) {
    if (!canUseFactForSubmission({ value: value.value, provenance: value.provenance })) blockers.push(`Factual value needs confirmation: ${value.field}`)
  }
  if (opportunity.deadline && Date.parse(opportunity.deadline.dateTime) <= Date.now()) blockers.push('The verified deadline has passed.')
  if (opportunity.verificationStatus !== 'verified') warnings.push('Revalidate the official programme page shortly before submission.')
  if (!applicationCase.portalSessionId) blockers.push('The verified portal session is not available.')
  return {
    applicationCaseId: applicationCase.id,
    opportunityId: opportunity.id,
    programme: `${opportunity.institution} — ${opportunity.programmeTitle}`,
    deadline: opportunity.deadline,
    completedRequirements,
    unresolvedWarnings: warnings,
    enteredFactualInformation: applicationCase.submittedValues,
    selectedDocumentVersions,
    essayVersions: selectedFinals.filter(artifact => /(?:statement|essay|letter|cover)/i.test(artifact.finalSubmissionDestination ?? '')).map(artifact => artifact.id),
    refereeStatus,
    fee: opportunity.fee,
    declarations: input.declarations ?? [],
    portalValidationState,
    blockers,
    ready: blockers.length === 0,
    generatedAt: input.now ?? new Date().toISOString(),
  }
}

export function canSubmitApplication(report: SubmissionReadinessReport, finalApproval: boolean, existingAttemptKey: string | null = null) {
  if (!report.ready) return { allowed: false, reason: 'Required application items remain unresolved.' }
  if (!finalApproval) return { allowed: false, reason: 'Final application submission approval is required.' }
  if (existingAttemptKey) return { allowed: false, reason: 'This application already has a submission attempt.' }
  return { allowed: true, reason: 'The application is ready for one approved submission.' }
}

export function submissionIdempotencyKey(applicationCaseId: string, portalCheckpointId: string, packageChecksum: string) {
  return `application-submit:${applicationCaseId}:${portalCheckpointId}:${hash(packageChecksum)}`
}

export function classifyApplicationIntent(title: string, description = '') {
  const value = `${title} ${description}`.toLocaleLowerCase()
  const application = /\b(?:apply|applications?|admissions?|grad(?:uate)?\s+school|phd|doctoral|master'?s|msc|job\s+application|grant application|statement of purpose|personal statement|recommendation letters?|referees?)\b/.test(value) ||
    /\b(?:contact|email|message|outreach|ask|follow[ -]?up)\b[\s\S]{0,100}\b(?:professors?|supervisors?|faculty|research groups?|labs?)\b/.test(value) ||
    /\b(?:professors?|supervisors?|faculty|research groups?|labs?)\b[\s\S]{0,100}\b(?:contact|email|message|outreach|ask|follow[ -]?up)\b/.test(value)
  const research = /\b(?:professor|faculty|supervisor|lab|research group)\b/.test(value)
  const finalSubmission = /\b(?:submit|send in|finalize|final submission|application fee|pay the application)\b/.test(value)
  return {
    isApplication: application,
    owner: application ? 'david' as const : null,
    applicationKind: /\bphd\b|doctoral/.test(value) ? 'phd' as const : /scholarship|chevening/.test(value) ? 'scholarship' as const : /fellowship|studentship/.test(value) ? 'fellowship' as const : /accelerator/.test(value) ? 'accelerator' as const : /internship/.test(value) ? 'internship' as const : /master/.test(value) ? 'masters' as const : 'other' as const,
    researchWorkflow: research,
    requiresFinalSubmissionApproval: finalSubmission,
    delegatesToRoon: /\b(?:email|contact|professors?|faculty|supervisors?|follow up|referees?|recommendation|interview|schedule|otp|verification code)\b/.test(value),
  }
}

export function createInterAgentRequest(input: Omit<InterAgentRequest, 'status' | 'result' | 'createdAt' | 'updatedAt'>, now = new Date().toISOString()): InterAgentRequest {
  return { ...input, status: 'queued', result: null, createdAt: now, updatedAt: now }
}

export function isRoonRequestAllowed(kind: InterAgentRequestKind) {
  return ['create_draft', 'send_email', 'monitor_thread', 'resolve_contact', 'follow_up', 'read_application_reply', 'schedule_interview', 'schedule_meeting', 'create_calendar_reminder', 'monitor_writer_deadline', 'monitor_referee_deadline', 'monitor_professor_reply', 'detect_application_messages', 'search_otp', 'request_academic_document', 'request_credential_evaluation_delivery', 'monitor_academic_delivery', 'monitor_test_score_delivery', 'send_fee_waiver_request', 'monitor_fee_waiver', 'admissions_clarification', 'post_submission_response'].includes(kind)
}

export function matchApplicationOtp(request: OtpRequest, messages: OtpMessage[]): MatchedOtp | null {
  const requestedAt = Date.parse(request.requestedAt)
  if (Number.isNaN(requestedAt)) return null
  const senderClues = request.senderClues.map(value => value.toLocaleLowerCase()).filter(Boolean)
  const subjectClues = request.subjectClues.map(value => value.toLocaleLowerCase()).filter(Boolean)
  const candidateMessages = messages
    .filter(message => Date.parse(message.receivedAt) >= requestedAt)
    .filter(message => !message.applicationCaseId || message.applicationCaseId === request.applicationCaseId)
    .filter(message => message.to.toLocaleLowerCase().includes(request.destinationEmail.toLocaleLowerCase()))
    .filter(message => {
      const haystack = `${message.from} ${message.subject} ${message.body}`.toLocaleLowerCase()
      const senderMatches = !senderClues.length || senderClues.some(clue => message.from.toLocaleLowerCase().includes(clue))
      const subjectMatches = !subjectClues.length || subjectClues.some(clue => message.subject.toLocaleLowerCase().includes(clue))
      const institutionMatches = haystack.includes(request.institution.toLocaleLowerCase()) || haystack.includes(request.portal.toLocaleLowerCase())
      return senderMatches && subjectMatches && institutionMatches
    })
    .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))
  for (const message of candidateMessages) {
    const codes = [...message.body.matchAll(/\b([0-9]{4,8})\b/g)].map(match => match[1]).filter(code => !/^20\d{2}$/.test(code))
    const code = codes[0]
    if (code) return { code, messageId: message.id, threadId: message.threadId, receivedAt: message.receivedAt, redactedCode: `${code.slice(0, 1)}•••${code.slice(-1)}` }
  }
  return null
}

export function classifyApplicationReply(subject: string, body: string): ApplicationReplyClassification {
  const textValue = `${subject} ${body}`.toLocaleLowerCase()
  if (/\b(?:missing|additional|required)\b[\s\S]{0,80}\b(?:document|transcript|file|proof)\b/.test(textValue)) return 'missing_documents'
  if (/\b(?:interview|invite you to meet|conversation with the committee)\b/.test(textValue)) return 'interview_invitation'
  if (/\b(?:referee|reference|recommendation)\b[\s\S]{0,80}\b(?:issue|missing|problem|remind)\b/.test(textValue)) return 'referee_issue'
  if (/\b(?:offer|admitted|congratulations|conditional)\b/.test(textValue)) return 'conditional_offer'
  if (/\b(?:unfortunately|regret|not selected|rejected|unsuccessful)\b/.test(textValue)) return 'rejection'
  if (/\b(?:scholarship|funding|studentship|award)\b/.test(textValue)) return 'scholarship_update'
  if (/\b(?:payment|fee|invoice|deposit)\b/.test(textValue)) return 'payment_request'
  if (/\b(?:visa|enrol|enroll|matriculation|immigration)\b/.test(textValue)) return 'visa_or_enrolment'
  if (/\b(?:portal|application status|received your application|under review)\b/.test(textValue)) return 'portal_update'
  return 'other'
}

export function nextApplicationCaseState(classification: ApplicationReplyClassification): Pick<ApplicationCase, 'currentStage' | 'status' | 'nextAction'> {
  switch (classification) {
    case 'missing_documents': return { currentStage: 'additional_documents', status: 'additional_documents', nextAction: 'Prepare and approve the requested document.' }
    case 'interview_invitation': return { currentStage: 'interview', status: 'interview', nextAction: 'Prepare interview notes and schedule the approved meeting.' }
    case 'conditional_offer': return { currentStage: 'offer', status: 'offer', nextAction: 'Review the offer conditions before responding.' }
    case 'rejection': return { currentStage: 'rejected', status: 'rejected', nextAction: 'Record the outcome and decide whether to pursue another option.' }
    case 'referee_issue': return { currentStage: 'referee_coordination', status: 'awaiting_referee', nextAction: 'Resolve the referee request before the institution deadline.' }
    default: return { currentStage: 'monitoring', status: 'monitoring', nextAction: 'Review the update and continue monitoring.' }
  }
}

export function createHumanAssignment(input: Omit<HumanAssignment, 'status' | 'revisionCount' | 'qualityReview' | 'paymentStatus' | 'slaBreaches' | 'escalationLevel'>): HumanAssignment {
  return {
    ...input,
    status: 'draft',
    revisionCount: 0,
    qualityReview: { score: null, notes: '', reviewerId: null },
    paymentStatus: input.price ? 'pending' : 'not_applicable',
    slaBreaches: [],
    escalationLevel: 0,
  }
}

export function buildRefereeSupportPack(input: {
  opportunity: Opportunity
  profile: ApplicantProfile
  referee: ContactReference
  applicantAssetIds: string[]
  relationshipContext: string
  relevantAchievements: string[]
  suggestedEvidence: string[]
  recommendationDraft?: string
}) {
  const sourceEvidence = input.opportunity.citations.map((citation, index) => ({
    id: citation.url || `opportunity-citation-${index + 1}`,
    url: citation.url,
    excerpt: citation.excerpt,
    retrievedAt: citation.retrievedAt,
    sourceType: citation.sourceType,
    authority: citation.sourceType === 'official' ? 'official' : citation.sourceType === 'government' ? 'government' : 'provider',
  }))
  const primarySourceIds = sourceEvidence.map(source => source.id)
  const recommendationRequirements = extractRecommendationRequirements({
    opportunity: {
      programme: { value: input.opportunity.programmeTitle, sourceIds: primarySourceIds },
      institution: { value: input.opportunity.institution, sourceIds: primarySourceIds },
      recommendationCount: { value: input.opportunity.recommendationCount, sourceIds: primarySourceIds },
      requiredDocuments: { value: input.opportunity.requiredDocuments, sourceIds: primarySourceIds },
      officialUrl: input.opportunity.officialUrl,
    },
    sourceEvidence,
  })
  const candidate: RecommenderCandidate = {
    id: `referee:${slug(input.referee.name)}`,
    name: input.referee.name,
    email: input.referee.email,
    currentTitle: null,
    institution: input.referee.institution,
    department: null,
    relationshipType: 'other',
    relationshipStrength: input.relationshipContext ? 0.8 : 0.4,
    exactContextOfRelationship: input.relationshipContext,
    relationshipEvidence: input.relationshipContext ? [{ id: `relationship:${slug(input.referee.name)}`, text: input.relationshipContext, sourceId: `application-case:${input.opportunity.id}:relationship`, sourceKind: 'direct_observation', observedBoundary: 'personally_observed', confidence: 'high', observedAt: null }] : [],
    relevanceToProgramme: [],
    eligibility: 'unknown',
    eligibilityReasons: [],
    availability: 'unknown',
    verifiedContactSource: input.referee.providerContactId ? 'contacts' : 'none',
    contactVerificationStatus: input.referee.email ? input.referee.providerContactId ? 'verified' : 'needs_verification' : 'missing',
    recommendedProgrammes: [input.opportunity.programmeTitle],
    fitScore: 0,
    rankingReasons: [],
    portfolioRole: 'primary',
    sourceIds: [`application-case:${input.opportunity.id}:referee`],
  }
  const programme = {
    institution: input.opportunity.institution,
    title: input.opportunity.programmeTitle,
    deadline: input.opportunity.deadline?.dateTime ?? null,
    applicationUrl: input.opportunity.applicationUrl,
  }
  const recommendationSupportPack = buildRecommenderSupportPack({
    id: `support-pack:${input.opportunity.id}:${slug(input.referee.name)}`,
    candidate,
    programme,
    requirements: recommendationRequirements,
    applicantName: input.profile.preferredName?.value || input.profile.legalName?.value || 'the applicant',
    applicantGoal: input.opportunity.programmeTitle,
    relationshipEvidence: candidate.relationshipEvidence,
    directObservedEvidence: input.relationshipContext ? [{
      claim: input.relationshipContext,
      sourceIds: [`application-case:${input.opportunity.id}:relationship`],
      sourceKind: 'direct_observation',
      observedBoundary: 'personally_observed',
      provenance: 'Applicant profile/application relationship context',
    }] : [],
    applicantUpdates: input.relevantAchievements.map((achievement, index) => ({
      claim: achievement,
      sourceIds: input.applicantAssetIds[index] ? [input.applicantAssetIds[index]] : [`application-case:${input.opportunity.id}:achievement:${index + 1}`],
      sourceKind: 'applicant_update',
      observedBoundary: 'reported_after_relationship',
      provenance: 'Applicant-provided achievement; not presented as firsthand observation.',
    })),
    emphasis: input.suggestedEvidence,
    assetIds: input.applicantAssetIds,
  })
  const requestEmail = generateRecommendationRequestEmail({
    applicantName: input.profile.preferredName?.value || input.profile.legalName?.value || 'the applicant',
    applicantEmail: input.profile.contactInformation.email?.value,
    recommender: candidate,
    programmes: [programme],
    relationshipEvidence: candidate.relationshipEvidence,
    reason: input.suggestedEvidence[0] || `Your direct perspective on the applicant's preparation would be valuable to the admissions committee.`,
    applicantGoal: input.opportunity.programmeTitle,
    supportPackAvailable: true,
    programmeRequirements: recommendationRequirements,
  })
  return {
    referee: input.referee,
    programme: `${input.opportunity.institution} — ${input.opportunity.programmeTitle}`,
    deadline: input.opportunity.deadline,
    applicantAssetIds: unique(input.applicantAssetIds),
    relationshipContext: text(input.relationshipContext, 4_000),
    relevantAchievements: unique(input.relevantAchievements),
    officialRequirements: input.opportunity.citations.filter(citation => citation.sourceType === 'official' || citation.sourceType === 'government'),
    suggestedEvidence: unique(input.suggestedEvidence),
    recommendationDraft: text(input.recommendationDraft, 12_000) || null,
    workflowVersion: 'recommendation-coordination@1.0.0',
    campaignState: 'request_ready' as const,
    recommendationRequirements,
    recommendationSupportPack,
    requestEmail,
    request_email: requestEmail,
    contactVerification: {
      status: candidate.contactVerificationStatus,
      providerContactId: input.referee.providerContactId,
      email: input.referee.email,
    },
  }
}

function slug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'referee'
}

export * from './recommendation-workflow.ts'
export * from './research-proposal-workflow.ts'
export * from './academic-evidence.ts'
export * from './application-fee-workflow.ts'
export * from './application-recovery.ts'

export function hasOnlyGroundedSubmittedValues(values: SubmittedValue[]) {
  return values.every(value => canUseFactForSubmission({ value: value.value, provenance: value.provenance }))
}

export function applicationSubmissionApprovalPayload(report: SubmissionReadinessReport, idempotencyKey: string) {
  return {
    kind: 'browser_submit' as const,
    applicationCaseId: report.applicationCaseId,
    programme: report.programme,
    deadline: report.deadline,
    completedRequirements: report.completedRequirements,
    unresolvedWarnings: report.unresolvedWarnings,
    factualFieldCount: report.enteredFactualInformation.length,
    selectedDocumentVersions: report.selectedDocumentVersions,
    essayVersions: report.essayVersions,
    refereeStatus: report.refereeStatus,
    fee: report.fee,
    declarations: report.declarations,
    portalValidationState: report.portalValidationState,
    idempotencyKey,
  }
}
