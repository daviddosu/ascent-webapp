/**
 * Deterministic recovery workflows shared by David, Roon, the portal harness,
 * and the campaign projection.
 *
 * This module intentionally has no provider calls. It decides whether a
 * contact is necessary, what an institution asked for, whether an existing
 * artifact satisfies that exact request, and what resulting evidence is still
 * required. Roon and the browser harness execute the returned contracts.
 */

import type {
  ApplicationCase,
  ApplicationCommunication,
  ApplicantProfile,
  Artifact,
  Deadline,
  Requirement,
} from './david-applications.ts'

export const APPLICATION_RECOVERY_VERSION = 'application-recovery@1' as const

export const admissionsQuestionCategories = [
  'eligibility',
  'transcript',
  'degree_evidence',
  'credential_evaluation',
  'language_testing',
  'gre_gmat',
  'recommendation',
  'supervisor',
  'research_proposal',
  'writing_sample',
  'application_fee',
  'fee_waiver',
  'document_format',
  'deadline',
  'portal_issue',
  'funding',
  'application_status',
  'other',
] as const
export type AdmissionsQuestionCategory = typeof admissionsQuestionCategories[number]

export const admissionsUnresolvedReasons = [
  'UNKNOWN',
  'CONFLICTING_OFFICIAL_SOURCES',
  'PORTAL_CONTRADICTS_GUIDANCE',
  'APPLICANT_SPECIFIC_EXCEPTION',
  'TECHNICAL_PORTAL_ISSUE',
  'MANUAL_APPROVAL_REQUIRED',
] as const
export type AdmissionsUnresolvedReason = typeof admissionsUnresolvedReasons[number]

export const admissionsClarificationStatuses = [
  'researching',
  'prepared',
  'awaiting_approval',
  'queued',
  'sent',
  'monitoring',
  'needs_more_info',
  'referred',
  'resolved',
  'closed',
  'blocked',
] as const
export type AdmissionsClarificationStatus = typeof admissionsClarificationStatuses[number]

export const admissionsReplyClassifications = [
  'ANSWERED_CLEARLY',
  'PARTIAL_ANSWER',
  'REQUESTS_MORE_INFO',
  'REFERS_TO_OTHER_OFFICE',
  'USE_PORTAL_INSTRUCTION',
  'EXCEPTION_GRANTED',
  'EXCEPTION_DENIED',
  'TECHNICAL_SUPPORT_NEEDED',
  'NO_ACTION_REQUIRED',
  'OTHER',
] as const
export type AdmissionsReplyClassification = typeof admissionsReplyClassifications[number]

export const officialSourceKinds = [
  'application_portal',
  'programme_guidance',
  'graduate_admissions',
  'department_guidance',
  'department_faq',
  'downloadable_instructions',
  'existing_official_email',
  'older_official',
  'portal_observation',
] as const
export type OfficialSourceKind = typeof officialSourceKinds[number]

export type AdmissionsResearchSource = {
  id: string
  kind: OfficialSourceKind | string
  title: string
  url: string | null
  authority: 'official' | 'provider' | 'applicant' | 'generated'
  current: boolean
  retrievedAt: string | null
  scope: 'programme' | 'graduate_school' | 'department' | 'applicant' | 'portal' | 'institution' | 'unknown'
  appliesToApplicant: boolean
  answer: string | null
  answerKey: string | null
  excerpts: string[]
  contactEmails: string[]
  office: string | null
}

export type AdmissionsSourceInput = Partial<AdmissionsResearchSource> & {
  id: string
  kind?: string
  sourceType?: string
  source_type?: string
  title?: string
  url?: string | null
  authority?: AdmissionsResearchSource['authority']
  current?: boolean
  retrievedAt?: string | null
  retrieved_at?: string | null
  scope?: AdmissionsResearchSource['scope']
  appliesToApplicant?: boolean
  answer?: string | null
  answerKey?: string | null
  answer_key?: string | null
  excerpt?: string | null
  excerpts?: string[]
  contactEmails?: string[]
  contact_emails?: string[]
  office?: string | null
}

export type AdmissionsContactCandidate = {
  id?: string | null
  name: string
  email: string
  office: string
  role: string
  institution: string
  programme?: string | null
  sourceId: string
  sourceUrl: string
  sourceKind?: string
  verified: boolean
  current: boolean
  contactType?: 'programme_admissions' | 'graduate_admissions' | 'department_administrator' | 'international_admissions' | 'credential_office' | 'financial_aid' | 'technical_support' | 'general'
}

export type AdmissionsContactResolution = {
  contact: AdmissionsContactCandidate | null
  verified: boolean
  reason: 'verified_official_contact' | 'no_verified_contact' | 'institution_mismatch' | 'stale_or_unverified_contact'
  rejected: Array<{ email: string; reason: string }>
}

export type AdmissionsThreadCandidate = Pick<ApplicationCommunication, 'id' | 'applicationCaseId' | 'providerMessageId' | 'providerThreadId' | 'direction' | 'excerpt' | 'createdAt'> & {
  institution?: string | null
  programme?: string | null
  contactEmail?: string | null
  subject?: string | null
}

export type AdmissionsResearchResult = {
  status: 'RESOLVED' | 'UNRESOLVED'
  answer: string | null
  answerKey: string | null
  selectedSourceIds: string[]
  sourcesChecked: string[]
  conflictingEvidence: Array<{ sourceId: string; answer: string; excerpt: string | null; url: string | null }>
  reason: AdmissionsUnresolvedReason | null
  whyClarificationIsNecessary: string | null
  authoritativeSource: AdmissionsResearchSource | null
}

export type AdmissionsClarification = {
  id: string
  applicationCaseId: string
  programme: string
  institution: string
  underlyingRequirementId: string
  questionCategory: AdmissionsQuestionCategory
  unresolvedIssue: string
  sourcesAlreadyChecked: string[]
  conflictingEvidence: Array<{ sourceId: string; answer: string; excerpt: string | null; url: string | null }>
  whyClarificationIsNecessary: string
  unresolvedReason: AdmissionsUnresolvedReason
  admissionsContact: AdmissionsContactCandidate | null
  contactSource: string | null
  deadlineRelevance: string | null
  deadline: Deadline | null
  risk: 'low' | 'medium' | 'high' | 'critical'
  draftedQuestion: string
  gmailThreadId: string | null
  gmailMessageId: string | null
  status: AdmissionsClarificationStatus
  resolvedInterpretation: AdmissionsReplyInterpretation | null
  resultingRequirementUpdates: Array<{ requirementId: string; status: Requirement['status']; evidenceIds: string[]; note: string }>
  evidenceIds: string[]
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

export type ResearchAdmissionsRequirementInput = {
  requirementId: string
  questionCategory: AdmissionsQuestionCategory
  unresolvedIssue: string
  sources: AdmissionsSourceInput[]
  portalObservation?: { issue?: string | null; answer?: string | null; contradictsGuidance?: boolean; applicantSpecific?: boolean } | null
  existingCommunications?: Array<{ provider: string; direction: 'inbound' | 'outbound'; excerpt?: string | null; data?: Record<string, unknown> | null; applicationCaseId?: string | null }>
  applicantSpecificException?: boolean
  now?: string
}

export type GenerateAdmissionsClarificationEmailInput = {
  clarification?: Partial<AdmissionsClarification> | null
  exactUnresolvedRequirement?: string
  requirement?: string | { name?: string; exactInstructions?: string; id?: string }
  programme?: string
  institution?: string
  applicantName?: string
  applicantStatus?: string
  applicationId?: string | null
  intake?: string | null
  deadline?: Deadline | null
  contact?: AdmissionsContactCandidate | null
  sources?: AdmissionsSourceInput[]
  conflictingSources?: Array<{ title?: string; excerpt?: string; answer?: string }>
  question?: string
  verifiedContext?: string[]
}

export type AdmissionsEmail = {
  version: typeof APPLICATION_RECOVERY_VERSION
  to: string[]
  subject: string
  textPlain: string
  textHtml: string
  bodyText: string
  bodyHtml: string
  question: string
  evidenceMap: Array<{ field: string; sourceIds: string[]; explanation: string }>
  threadId: string | null
  inReplyToMessageId: string | null
}

export const postSubmissionRequestTypes = [
  'DOCUMENT_MISSING',
  'DOCUMENT_INCOMPLETE',
  'WRONG_DOCUMENT',
  'OFFICIAL_VERSION_REQUIRED',
  'UPDATED_VERSION_REQUIRED',
  'TRANSLATION_REQUIRED',
  'EXPLANATION_REQUIRED',
  'FORM_REQUIRED',
  'TEST_SCORE_REQUIRED',
  'RECOMMENDATION_REQUIRED',
  'IDENTITY_DOCUMENT_REQUIRED',
  'CREDENTIAL_EVALUATION_REQUIRED',
  'PORTAL_CORRECTION_REQUIRED',
  'CLARIFICATION_REQUIRED',
  'OTHER',
] as const
export type PostSubmissionRequestType = typeof postSubmissionRequestTypes[number]

export const postSubmissionUrgencies = ['routine', 'deadline-sensitive', 'critical'] as const
export type PostSubmissionUrgency = typeof postSubmissionUrgencies[number]

export const postSubmissionStates = [
  'artifact_ready',
  'submitted_to_portal',
  'sent_to_institution',
  'delivery_verified',
  'under_review',
  'accepted',
  'rejected',
  'replacement_required',
  'complete',
] as const
export type PostSubmissionState = typeof postSubmissionStates[number]

export type PostSubmissionSourceMessage = {
  messageId: string
  threadId: string | null
  provider: 'gmail' | 'portal' | 'university_dashboard' | string
  from: string
  to?: string[]
  subject: string
  body: string
  receivedAt: string
  applicationId?: string | null
  institution?: string | null
  programme?: string | null
  portal?: string | null
  sourceUrl?: string | null
}

export type PostSubmissionCaseCandidate = {
  applicationCaseId: string
  institution: string
  programme: string
  applicationId: string | null
  applicantId?: string | null
  applicantName?: string | null
  submittedAt?: string | null
  portal?: string | null
  admissionsDomains?: string[]
}

export type PostSubmissionRequest = {
  id: string
  applicationCaseId: string
  institution: string
  programme: string
  sourceMessageId: string
  sourceThreadId: string | null
  sourceProvider: string
  sourceUrl: string | null
  exactRequestText: string
  normalizedRequirement: string
  requestType: PostSubmissionRequestType
  requestedArtifactDataType: string | null
  officialStatusRequired: boolean
  finalVersionRequired: boolean
  degreeConferralRequired: boolean
  translationRequired: boolean
  certifiedTranslationRequired: boolean
  institutionDirectDeliveryRequired: boolean
  deadline: Deadline | null
  urgency: PostSubmissionUrgency
  submissionMethod: 'portal_upload' | 'email' | 'institution_direct' | 'provider_portal' | 'user_authentication' | 'unknown'
  recipient: string | null
  applicantActionRequired: boolean
  artifactCandidates: string[]
  status: PostSubmissionState
  responseEvidence: string[]
  acceptanceEvidence: string[]
  rejectionReason: string | null
  externalCommitmentDueAt: string | null
  version: number
  history: Array<{ at: string; event: string; exactRequestText?: string; evidenceIds?: string[] }>
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

export type PostSubmissionDetection = {
  case: PostSubmissionCaseCandidate | null
  requests: PostSubmissionRequest[]
  ambiguous: boolean
  reason: string | null
}

export type ArtifactForRecovery = Partial<Artifact> & {
  id: string
  applicantId?: string | null
  institution?: string | null
  artifactType?: string | null
  filename?: string | null
  mimeType?: string | null
  checksum?: string | null
  officialStatus?: 'official' | 'unofficial' | 'provisional' | 'unknown' | string
  final?: boolean
  issueDate?: string | null
  validUntil?: string | null
  degreeConferralPresent?: boolean
  complete?: boolean
  readable?: boolean
  translated?: boolean
  certifiedTranslation?: boolean
  institutionDirect?: boolean
  recipients?: string[]
  current?: boolean
  metadata?: Record<string, unknown>
}

export type ArtifactInspection = {
  artifactId: string
  satisfies: boolean
  score: number
  reasons: string[]
  checks: Record<string, boolean>
}

export type PostSubmissionProgressInteraction = {
  id: string
  applicationCaseId: string
  requestId: string
  kind: 'attachment' | 'correction' | 'secure_authentication' | 'short_text'
  question: string
  reason: string
  status: 'pending' | 'answered' | 'invalid'
  acceptedMimeTypes?: string[]
  maximumFiles?: number
  field?: string
  deadline: Deadline | null
  dedupeKey: string
}

export type PostSubmissionActionPlan =
  | { action: 'USE_EXISTING_ARTIFACT'; request: PostSubmissionRequest; artifact: ArtifactForRecovery; inspection: ArtifactInspection; idempotencyKey: string }
  | { action: 'PREPARE_PORTAL_UPLOAD'; request: PostSubmissionRequest; artifact: ArtifactForRecovery; inspection: ArtifactInspection; idempotencyKey: string }
  | { action: 'PREPARE_EMAIL_RESPONSE'; request: PostSubmissionRequest; artifact: ArtifactForRecovery | null; idempotencyKey: string }
  | { action: 'ACQUIRE_EXTERNAL_DOCUMENT'; request: PostSubmissionRequest; provider: string; idempotencyKey: string }
  | { action: 'USER_HANDOFF'; request: PostSubmissionRequest; interaction: PostSubmissionProgressInteraction; idempotencyKey: string }
  | { action: 'WAIT_FOR_PROCESSING'; request: PostSubmissionRequest; until: string | null; idempotencyKey: string }

export type PostSubmissionResponse = {
  version: typeof APPLICATION_RECOVERY_VERSION
  to: string[]
  subject: string
  textPlain: string
  textHtml: string
  bodyText: string
  bodyHtml: string
  attachmentIds: string[]
  evidenceMap: Array<{ field: string; sourceIds: string[]; explanation: string }>
  threadId: string | null
  inReplyToMessageId: string | null
}

export type PostSubmissionDeliveryEvidence = {
  providerMessageId?: string | null
  providerThreadId?: string | null
  portalCheckpointId?: string | null
  artifactId?: string | null
  checksum?: string | null
  receiptVerified: boolean
  acceptanceVerified: boolean
  portalStatus?: 'missing' | 'uploaded' | 'received' | 'accepted' | 'rejected' | 'processing' | 'unknown'
  providerStatus?: 'sent' | 'delivered' | 'received' | 'accepted' | 'rejected' | 'unknown'
  evidenceIds: string[]
  observedAt: string
  note?: string | null
}

export type PostSubmissionReconciliation = {
  state: 'WAIT_FOR_PROCESSING' | 'ADMISSIONS_ESCALATION_REQUIRED' | 'RESOLVED' | 'REPLACEMENT_REQUIRED'
  reason: string
  shouldContactAdmissions: boolean
  waitUntil: string | null
  evidenceIds: string[]
}

export type ApplicationRecoveryMetrics = {
  clarificationRequirementsCreated: number
  clarificationsResolvedWithoutEmail: number
  admissionsEmailsSent: number
  admissionsRepliesInterpreted: number
  postSubmissionRequestsDetected: number
  artifactsResolvedAutomatically: number
  attachmentRequests: number
  structuredUserQuestions: number
  authenticationHandoffs: number
  freeTextInteractions: number
  duplicateActionsPrevented: number
  crossCaseContamination: number
}

function text(value: unknown, maximum = 10_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function normalized(value: unknown) {
  return text(value, 20_000).replace(/\s+/g, ' ').toLocaleLowerCase()
}

function unique(values: string[]) {
  return [...new Set(values.map(value => text(value, 2_000)).filter(Boolean))]
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function safeEmail(value: unknown) {
  const email = text(value, 320).toLocaleLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function htmlEscape(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function htmlParagraphs(lines: string[]) {
  return lines.filter(line => line !== '').map(line => `<p>${htmlEscape(line)}</p>`).join('')
}

function stableHash(value: unknown) {
  const input = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function toSource(input: AdmissionsSourceInput): AdmissionsResearchSource {
  const kind = text(input.kind ?? input.sourceType ?? input.source_type, 120) || 'unknown'
  const excerpts = unique([
    ...(Array.isArray(input.excerpts) ? input.excerpts : []),
    text(input.excerpt, 2_000),
  ])
  const answer = text(input.answer, 4_000) || null
  return {
    id: text(input.id, 300),
    kind,
    title: text(input.title, 500) || kind.replaceAll('_', ' '),
    url: text(input.url, 2_000) || null,
    authority: input.authority ?? 'official',
    current: input.current !== false,
    retrievedAt: text(input.retrievedAt ?? input.retrieved_at, 80) || null,
    scope: input.scope ?? (kind === 'application_portal' || kind === 'portal_observation' ? 'portal' : 'unknown'),
    appliesToApplicant: input.appliesToApplicant === true || input.scope === 'applicant',
    answer,
    answerKey: text(input.answerKey ?? input.answer_key, 500) || (answer ? normalized(answer) : null),
    excerpts,
    contactEmails: unique([...(Array.isArray(input.contactEmails) ? input.contactEmails : []), ...(Array.isArray(input.contact_emails) ? input.contact_emails : [])].map(value => safeEmail(value))).slice(0, 10),
    office: text(input.office, 300) || null,
  }
}

function sourceRank(source: AdmissionsResearchSource) {
  if (source.authority !== 'official' || !source.current) return 0
  if (source.scope === 'applicant' || source.kind === 'portal_observation') return 100
  if (source.kind === 'application_portal') return 95
  if (source.kind === 'programme_guidance') return 90
  if (source.kind === 'graduate_admissions') return 80
  if (source.kind === 'department_guidance' || source.kind === 'department_faq') return 70
  if (source.kind === 'downloadable_instructions') return 60
  if (source.kind === 'existing_official_email') return 50
  if (source.kind === 'older_official') return 20
  return 10
}

function answerIsDefinitive(value: string | null) {
  const answer = normalized(value)
  return Boolean(answer) && /\b(?:yes|no|not required|required|accepted|unacceptable|must|may|can|cannot|eligible|ineligible|submit|upload|contact|waived|exempt|deadline|due|received|accepted)\b/.test(answer)
}

function answerKeyFor(value: string | null) {
  if (!value) return null
  const normalizedValue = normalized(value)
  if (/\b(?:not required|no need|do not need|does not need|exempt|waived)\b/.test(normalizedValue)) return 'not_required'
  if (/\b(?:official|required|must submit|must provide|final)\b/.test(normalizedValue)) return 'official_required'
  if (/\b(?:unofficial|provisional|unacceptable|not accepted)\b/.test(normalizedValue)) return 'unofficial_not_accepted'
  if (/\b(?:accepted|acceptable|may submit|can submit|may upload|can upload)\b/.test(normalizedValue)) return 'accepted'
  if (/\b(?:portal|dashboard|application system)\b/.test(normalizedValue)) return 'portal'
  return normalizedValue.slice(0, 500)
}

function riskForDeadline(deadline: Deadline | null, now: string, fallback: 'low' | 'medium' | 'high' | 'critical' = 'medium') {
  if (!deadline) return fallback
  const remaining = Date.parse(deadline.dateTime) - Date.parse(now)
  if (!Number.isFinite(remaining)) return fallback
  if (remaining <= 0) return 'critical'
  if (remaining <= 48 * 60 * 60 * 1_000) return 'critical'
  if (remaining <= 7 * 24 * 60 * 60 * 1_000) return 'high'
  if (remaining <= 21 * 24 * 60 * 60 * 1_000) return 'medium'
  return 'low'
}

function parseExplicitDeadline(value: string, timezone = 'UTC', sourceUrl: string | null = null, now = new Date().toISOString()): Deadline | null {
  const match = value.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?\b/)
  if (!match) return null
  const [, year, month, day, hour = '23', minute = '59'] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0))
  if (Number.isNaN(date.getTime())) return null
  return { dateTime: date.toISOString(), timezone, label: match[0], sourceUrl, retrievedAt: now }
}

function institutionMatches(candidate: string, expected: string) {
  const left = normalized(candidate)
  const right = normalized(expected)
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)))
}

/**
 * Research the requirement before allowing any admissions outreach.
 * A source with no explicit answer is evidence that it was checked, not an
 * answer. A model cannot turn such a source into a resolved requirement.
 */
export function researchAdmissionsRequirement(input: ResearchAdmissionsRequirementInput): AdmissionsResearchResult {
  const sources = input.sources.map(toSource).filter(source => source.id)
  const currentOfficial = sources.filter(source => source.authority === 'official' && source.current)
  const answered = currentOfficial.filter(source => answerIsDefinitive(source.answer))
  const sourcesChecked = sources.map(source => source.id)
  if (input.existingCommunications?.some(message => message.direction === 'inbound' && answerIsDefinitive(text(message.excerpt, 4_000)))) {
    const communication = input.existingCommunications.find(message => message.direction === 'inbound' && answerIsDefinitive(text(message.excerpt, 4_000)))!
    const answer = text(communication.excerpt, 4_000)
    return {
      status: 'RESOLVED', answer, answerKey: answerKeyFor(answer), selectedSourceIds: ['existing-official-communication'], sourcesChecked: [...sourcesChecked, 'existing-official-communication'], conflictingEvidence: [], reason: null, whyClarificationIsNecessary: null,
      authoritativeSource: null,
    }
  }
  const answerGroups = new Map<string, AdmissionsResearchSource[]>()
  for (const source of answered) {
    const key = source.answerKey ?? answerKeyFor(source.answer) ?? normalized(source.answer)
    answerGroups.set(key, [...(answerGroups.get(key) ?? []), source])
  }
  const portal = input.portalObservation
  if (portal?.answer && answerIsDefinitive(portal.answer)) {
    const portalSource = sources.find(source => source.kind === 'application_portal' || source.kind === 'portal_observation')
    const key = answerKeyFor(portal.answer) ?? normalized(portal.answer)
    answerGroups.set(key, [...(answerGroups.get(key) ?? []), portalSource ?? toSource({ id: 'portal-observation', kind: 'portal_observation', title: 'Portal observation', authority: 'official', current: true, scope: 'portal', answer: portal.answer })])
  }
  if (answerGroups.size === 1) {
    const group = [...answerGroups.values()][0]!
    const selected = [...group].sort((left, right) => sourceRank(right) - sourceRank(left))[0]!
    return { status: 'RESOLVED', answer: selected.answer, answerKey: selected.answerKey ?? answerKeyFor(selected.answer), selectedSourceIds: group.map(source => source.id), sourcesChecked, conflictingEvidence: [], reason: null, whyClarificationIsNecessary: null, authoritativeSource: selected }
  }
  if (answerGroups.size > 1) {
    const conflictingEvidence = [...answerGroups.values()].flatMap(group => group.map(source => ({ sourceId: source.id, answer: source.answer ?? '', excerpt: source.excerpts[0] ?? null, url: source.url })))
    const portalAnswer = portal?.answer ?? null
    const portalConflicts = Boolean(portal?.contradictsGuidance) || Boolean(portalAnswer && currentOfficial.some(source => source.kind !== 'application_portal' && source.answerKey && source.answerKey !== answerKeyFor(portalAnswer)))
    const reason: AdmissionsUnresolvedReason = portalConflicts ? 'PORTAL_CONTRADICTS_GUIDANCE' : 'CONFLICTING_OFFICIAL_SOURCES'
    return { status: 'UNRESOLVED', answer: null, answerKey: null, selectedSourceIds: [], sourcesChecked, conflictingEvidence, reason, whyClarificationIsNecessary: portalConflicts ? 'The applicant portal contradicts current official programme guidance on a consequential requirement.' : 'Current official sources provide materially different instructions for a consequential requirement.', authoritativeSource: null }
  }
  const portalIssue = Boolean(portal?.issue) || input.questionCategory === 'portal_issue'
  const reason: AdmissionsUnresolvedReason = portalIssue && !answered.length
    ? 'TECHNICAL_PORTAL_ISSUE'
    : input.applicantSpecificException || portal?.applicantSpecific
      ? 'APPLICANT_SPECIFIC_EXCEPTION'
      : 'UNKNOWN'
  return { status: 'UNRESOLVED', answer: null, answerKey: null, selectedSourceIds: [], sourcesChecked, conflictingEvidence: [], reason, whyClarificationIsNecessary: portalIssue ? 'The portal presents a consequential problem that the published guidance does not resolve.' : reason === 'APPLICANT_SPECIFIC_EXCEPTION' ? 'The published rule does not answer the applicant-specific facts recorded for this application.' : 'The checked authoritative sources do not provide a definitive answer.' , authoritativeSource: null }
}

export function resolveAdmissionsContact(input: {
  institution: string
  programme?: string | null
  category: AdmissionsQuestionCategory
  candidates: AdmissionsContactCandidate[]
}) : AdmissionsContactResolution {
  const rejected: Array<{ email: string; reason: string }> = []
  const valid = input.candidates.filter(candidate => {
    const email = safeEmail(candidate.email)
    if (!email) { rejected.push({ email: candidate.email, reason: 'invalid_email' }); return false }
    if (!candidate.verified || !candidate.current || !candidate.sourceUrl || !/^https:\/\//i.test(candidate.sourceUrl) || candidate.sourceKind === 'inferred') {
      rejected.push({ email, reason: 'contact_is_not_current_and_verified_from_an_official_source' }); return false
    }
    if (!institutionMatches(candidate.institution, input.institution)) {
      rejected.push({ email, reason: 'institution_mismatch' }); return false
    }
    if (candidate.programme && input.programme && !institutionMatches(candidate.programme, input.programme)) {
      rejected.push({ email, reason: 'programme_mismatch' }); return false
    }
    return true
  })
  const roleScore = (candidate: AdmissionsContactCandidate) => {
    const role = normalized(`${candidate.contactType ?? ''} ${candidate.role} ${candidate.office}`)
    if (input.category === 'portal_issue' && /technical|portal|it|support/.test(role)) return 100
    if (input.category === 'credential_evaluation' && /credential|records|registrar/.test(role)) return 100
    if (input.category === 'fee_waiver' || input.category === 'application_fee' && /financial|fee/.test(role)) return 100
    if (/programme|program|department/.test(role)) return 90
    if (/graduate/.test(role)) return 80
    if (/international/.test(role) && (input.category === 'eligibility' || input.category === 'language_testing')) return 85
    if (/admission/.test(role)) return 75
    return 10
  }
  const contact = [...valid].sort((left, right) => roleScore(right) - roleScore(left) || left.email.localeCompare(right.email))[0] ?? null
  return { contact, verified: Boolean(contact), reason: contact ? 'verified_official_contact' : input.candidates.length ? 'stale_or_unverified_contact' : 'no_verified_contact', rejected }
}

export function findRelevantAdmissionsThread(input: {
  clarification: Pick<AdmissionsClarification, 'applicationCaseId' | 'institution' | 'programme'>
  contactEmail?: string | null
  communications: AdmissionsThreadCandidate[]
}) {
  const expectedEmail = safeEmail(input.contactEmail)
  const candidates = input.communications.filter(message => {
    if (message.applicationCaseId !== input.clarification.applicationCaseId || !message.providerThreadId) return false
    const sameContact = !expectedEmail || safeEmail(message.contactEmail) === expectedEmail || normalized(message.excerpt).includes(expectedEmail)
    const sameContext = !message.institution || institutionMatches(message.institution, input.clarification.institution)
    const programmeMatches = !message.programme || institutionMatches(message.programme, input.clarification.programme)
    return sameContact && sameContext && programmeMatches
  }).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
  const selected = candidates[0] ?? null
  return selected ? { threadId: selected.providerThreadId, inReplyToMessageId: selected.providerMessageId, sourceCommunicationId: selected.id } : null
}

function defaultQuestion(input: GenerateAdmissionsClarificationEmailInput, requirement: string) {
  if (text(input.question, 1_500)) return text(input.question, 1_500)
  const clarification = input.clarification
  const issue = text(clarification?.unresolvedIssue ?? input.exactUnresolvedRequirement, 1_500)
  if (issue) return issue.endsWith('?') ? issue : `Could you please confirm how I should satisfy this requirement: ${issue}`
  return `Could you please confirm the exact requirement for ${requirement}?`
}

/** Generate the exact concise message that Roon is allowed to send. */
export function generateAdmissionsClarificationEmail(input: GenerateAdmissionsClarificationEmailInput): AdmissionsEmail {
  const clarification = input.clarification ?? {}
  const requirement = typeof input.requirement === 'string' ? input.requirement : text(input.requirement?.name ?? input.requirement?.exactInstructions, 500)
    || text(clarification.unresolvedIssue ?? input.exactUnresolvedRequirement, 500) || 'this application requirement'
  const programme = text(input.programme ?? clarification.programme, 800) || 'the graduate programme'
  const institution = text(input.institution ?? clarification.institution, 500) || 'the university'
  const applicantName = text(input.applicantName, 240) || 'the applicant'
  const contact = input.contact ?? clarification.admissionsContact ?? null
  const question = defaultQuestion(input, requirement)
  const sources = (input.sources ?? []).map(toSource)
  const checkedTitles = sources.filter(source => clarification.sourcesAlreadyChecked?.includes(source.id) ?? true).map(source => source.title).slice(0, 5)
  const conflicts = (input.conflictingSources ?? clarification.conflictingEvidence ?? []).map(item => ({
    sourceId: 'sourceId' in item ? item.sourceId : null,
    title: 'title' in item ? item.title ?? null : null,
    excerpt: item.excerpt ?? null,
    answer: item.answer ?? null,
  }))
  const lines = [
    `Dear ${contact?.name || 'Admissions Team'},`,
    '',
    `I am applying to ${programme} at ${institution}${input.intake ? ` for ${input.intake}` : ''}.`,
    input.applicationId ? `My application reference is ${input.applicationId}.` : '',
    `I am writing to clarify one point about ${requirement}:`,
    question,
    checkedTitles.length ? `I checked the ${checkedTitles.join(', ')} guidance.` : '',
    conflicts.length ? `The guidance appears to conflict: ${conflicts.slice(0, 2).map(item => text(item.excerpt ?? item.answer ?? item.title, 500)).filter(Boolean).join(' / ')}.` : '',
    input.deadline?.dateTime ? `This is relevant to my application deadline on ${input.deadline.label ?? input.deadline.dateTime} (${input.deadline.timezone}).` : '',
    '',
    'Could you please confirm the correct action for my application?',
    '',
    'Kind regards,',
    applicantName,
  ].filter(Boolean)
  const textPlain = lines.join('\n')
  const textHtml = `<div>${htmlParagraphs(lines)}</div>`
  const evidenceMap = [
    { field: 'programme_and_institution', sourceIds: sources.filter(source => /programme|graduate|department|portal/.test(source.kind)).map(source => source.id), explanation: 'Verified programme context used to identify the application.' },
    { field: 'unresolved_requirement', sourceIds: unique([...(clarification.sourcesAlreadyChecked ?? []), ...sources.map(source => source.id)]), explanation: 'Sources were checked before outreach and did not produce one safe answer.' },
    { field: 'conflicting_guidance', sourceIds: conflicts.flatMap(item => item.sourceId ? [item.sourceId] : []), explanation: conflicts.length ? 'The conflict is stated only because it changes the required action.' : 'No conflict was included in the message.' },
  ].filter(item => item.sourceIds.length)
  return {
    version: APPLICATION_RECOVERY_VERSION,
    to: contact?.email ? [safeEmail(contact.email)] : [],
    subject: `Clarification about ${requirement} — ${programme}`.slice(0, 998),
    textPlain,
    textHtml,
    bodyText: textPlain,
    bodyHtml: textHtml,
    question,
    evidenceMap,
    threadId: text(clarification.gmailThreadId, 256) || null,
    inReplyToMessageId: text(clarification.gmailMessageId, 256) || null,
  }
}

export function createAdmissionsClarification(input: {
  id: string
  applicationCaseId: string
  programme: string
  institution: string
  requirementId: string
  category: AdmissionsQuestionCategory
  unresolvedIssue: string
  research: AdmissionsResearchResult
  contact: AdmissionsContactResolution
  email: AdmissionsEmail
  deadline?: Deadline | null
  approvalRequired?: boolean
  risk?: AdmissionsClarification['risk']
  idempotencyKey?: string
  now?: string
}): AdmissionsClarification {
  if (input.research.status === 'RESOLVED') throw new Error('Admissions contact is not allowed when authoritative research already resolves the requirement.')
  if (!input.research.sourcesChecked.length) throw new Error('Admissions outreach needs evidence that authoritative sources were checked.')
  if (!input.contact.verified || !input.contact.contact) throw new Error('Admissions outreach needs a current verified official contact.')
  if (!input.email.textPlain || !input.email.textHtml) throw new Error('Admissions clarification email formatting is incomplete.')
  const now = input.now ?? new Date().toISOString()
  const deadline = input.deadline ?? null
  return {
    id: input.id,
    applicationCaseId: input.applicationCaseId,
    programme: text(input.programme, 800),
    institution: text(input.institution, 500),
    underlyingRequirementId: input.requirementId,
    questionCategory: input.category,
    unresolvedIssue: text(input.unresolvedIssue, 4_000),
    sourcesAlreadyChecked: unique(input.research.sourcesChecked),
    conflictingEvidence: input.research.conflictingEvidence,
    whyClarificationIsNecessary: input.research.whyClarificationIsNecessary ?? 'The requirement remains unresolved after authoritative research.',
    unresolvedReason: input.research.reason ?? 'UNKNOWN',
    admissionsContact: input.contact.contact,
    contactSource: input.contact.contact.sourceId,
    deadlineRelevance: deadline ? `The clarification affects the deadline on ${deadline.label ?? deadline.dateTime}.` : null,
    deadline,
    risk: input.risk ?? riskForDeadline(deadline, now),
    draftedQuestion: input.email.question,
    gmailThreadId: input.email.threadId,
    gmailMessageId: input.email.inReplyToMessageId,
    status: input.approvalRequired === false ? 'queued' : 'awaiting_approval',
    resolvedInterpretation: null,
    resultingRequirementUpdates: [],
    evidenceIds: [],
    idempotencyKey: input.idempotencyKey ?? `admissions-clarification:${input.applicationCaseId}:${input.requirementId}:${stableHash(input.email.question)}`,
    createdAt: now,
    updatedAt: now,
  }
}

function redactReply(value: string) {
  return text(value, 4_000)
    .replace(/\b(?:password|passcode|secret|security key)\s*[:=]?\s*[^\s,;.]+/gi, '[redacted credential]')
    .replace(/\b(?:verification code|one[- ]time password|otp)\s*[:=]?\s*\d{4,8}\b/gi, '[redacted verification code]')
}

export function classifyAdmissionsReply(subject: string, body: string): AdmissionsReplyClassification {
  const value = normalized(`${subject} ${body}`)
  if (/contact|please write|refer|forward|graduate records|registrar|another office|different office/.test(value)) return 'REFERS_TO_OTHER_OFFICE'
  if (/screenshot|application id|student number|please provide|please send|need more information|additional information|attach/.test(value)) return 'REQUESTS_MORE_INFO'
  if (/technical support|it support|portal error|system error|cannot log|unable to upload|browser error/.test(value)) return 'TECHNICAL_SUPPORT_NEEDED'
  if (/use the portal|portal instructions|upload through|application system|checklist/.test(value)) return 'USE_PORTAL_INSTRUCTION'
  if (/exception|exempt|waive|we can make an exception|not required in your case|you do not need/.test(value)) {
    return /cannot|not able|not permitted|denied|decline|unfortunately/.test(value) ? 'EXCEPTION_DENIED' : 'EXCEPTION_GRANTED'
  }
  if (/no action required|nothing further|no further action|you are all set|already received|do not need to contact/.test(value)) return 'NO_ACTION_REQUIRED'
  const direct = /\b(?:yes|no|must|may|can|cannot|required|not required|accepted|unacceptable|submit|upload|deadline|due)\b/.test(value)
  const qualified = /however|depends|generally|usually|case[- ]by[- ]case|may need|please confirm/.test(value)
  if (direct && qualified) return 'PARTIAL_ANSWER'
  if (direct) return 'ANSWERED_CLEARLY'
  return 'OTHER'
}

export type AdmissionsReplyInterpretation = {
  classification: AdmissionsReplyClassification
  actualAnswer: string | null
  requirementId: string | null
  requirementUpdates: Array<{ requirementId: string; status: Requirement['status']; note: string }>
  deadlineImplications: string | null
  newEvidenceRequired: string[]
  referredOffice: { name: string; contactHint: string | null } | null
  definitive: boolean
  confidence: 'high' | 'medium' | 'low'
  evidenceExcerpt: string
}

export function interpretAdmissionsReply(input: { subject: string; body: string; clarification?: Pick<AdmissionsClarification, 'underlyingRequirementId'> | null }): AdmissionsReplyInterpretation {
  const body = redactReply(input.body)
  const classification = classifyAdmissionsReply(input.subject, body)
  const definitive = ['ANSWERED_CLEARLY', 'EXCEPTION_GRANTED', 'EXCEPTION_DENIED', 'USE_PORTAL_INSTRUCTION', 'NO_ACTION_REQUIRED'].includes(classification)
  const noLongerRequired = /not required|no need|do not need|exempt|waived|nothing further/.test(normalized(body))
  const status: Requirement['status'] = noLongerRequired && classification === 'EXCEPTION_GRANTED' ? 'waived' : definitive ? 'verified' : 'awaiting_institution'
  const actualAnswer = classification === 'REQUESTS_MORE_INFO' || classification === 'REFERS_TO_OTHER_OFFICE' ? null : text(body, 2_000) || null
  const referredMatch = body.match(/(?:contact|write to|referred to|send this to)\s+([^.;\n]{2,120})(?:[.;\n]|$)/i)
  const referredOffice = classification === 'REFERS_TO_OTHER_OFFICE' ? { name: text(referredMatch?.[1] ?? 'the referred office', 200), contactHint: null } : null
  const requestedEvidence = classification === 'REQUESTS_MORE_INFO'
    ? [...body.matchAll(/\b(?:screenshot|application id|student number|transcript|document|file|form|proof)\b/gi)].map(match => match[0].toLocaleLowerCase()).filter((value, index, values) => values.indexOf(value) === index).slice(0, 8)
    : []
  const deadlineImplications = /deadline|due|before|by\s+\d/.test(normalized(body)) ? text(body.match(/[^.\n]*(?:deadline|due|before|by\s+\d)[^.\n]*/i)?.[0] ?? body, 600) : null
  return {
    classification,
    actualAnswer,
    requirementId: input.clarification?.underlyingRequirementId ?? null,
    requirementUpdates: input.clarification?.underlyingRequirementId ? [{ requirementId: input.clarification.underlyingRequirementId, status, note: actualAnswer ?? 'The institution has not yet provided a definitive answer.' }] : [],
    deadlineImplications,
    newEvidenceRequired: requestedEvidence,
    referredOffice,
    definitive,
    confidence: definitive ? 'high' : classification === 'PARTIAL_ANSWER' || classification === 'OTHER' ? 'medium' : 'high',
    evidenceExcerpt: text(body, 2_000),
  }
}

export function applyAdmissionsReplyToRequirementGraph(input: {
  requirements: Requirement[]
  clarification: AdmissionsClarification
  interpretation: AdmissionsReplyInterpretation
  evidenceId: string
  now?: string
}) {
  const now = input.now ?? new Date().toISOString()
  const scoped = input.requirements.filter(requirement => requirement.applicationCaseId === input.clarification.applicationCaseId)
  const target = scoped.find(requirement => requirement.id === input.clarification.underlyingRequirementId)
  if (!target) throw new Error('Admissions reply targeted a requirement outside the ApplicationCase.')
  const completed = input.interpretation.definitive
  const evidenceIds = unique([...target.verificationEvidenceIds, input.evidenceId])
  const nextStatus = input.interpretation.requirementUpdates[0]?.status ?? (completed ? 'verified' : 'awaiting_institution')
  const updatedRequirement: Requirement = {
    ...target,
    status: nextStatus,
    verificationEvidenceIds: completed ? evidenceIds : target.verificationEvidenceIds,
    blockerReason: completed ? null : input.interpretation.classification === 'REQUESTS_MORE_INFO' ? `Admissions requested: ${input.interpretation.newEvidenceRequired.join(', ') || 'additional information'}.` : target.blockerReason,
    exactInstructions: input.interpretation.actualAnswer ? `${target.exactInstructions}\nInstitution guidance: ${input.interpretation.actualAnswer}`.slice(0, 4_000) : target.exactInstructions,
    updatedAt: now,
  }
  const requirements = input.requirements.map(requirement => requirement.id === updatedRequirement.id ? updatedRequirement : requirement)
  const clarification: AdmissionsClarification = {
    ...input.clarification,
    status: input.interpretation.classification === 'REFERS_TO_OTHER_OFFICE' ? 'referred' : input.interpretation.definitive ? 'resolved' : 'needs_more_info',
    resolvedInterpretation: input.interpretation,
    resultingRequirementUpdates: input.interpretation.requirementUpdates.map(update => ({ ...update, evidenceIds: completed ? [input.evidenceId] : [], note: update.note })),
    evidenceIds: unique([...input.clarification.evidenceIds, input.evidenceId]),
    updatedAt: now,
  }
  return { requirements, clarification }
}

export function admissionsFollowUpDecision(input: {
  clarification: Pick<AdmissionsClarification, 'status' | 'risk' | 'deadline' | 'createdAt'>
  now: string
  publishedResponseTimeHours?: number | null
  lastMessageAt?: string | null
  followUpCount?: number
}) {
  if (['resolved', 'closed'].includes(input.clarification.status)) return { action: 'none' as const, reason: 'Clarification is already resolved.', waitUntil: null }
  const nowMs = Date.parse(input.now)
  const deadlineMs = input.clarification.deadline ? Date.parse(input.clarification.deadline.dateTime) : NaN
  const lastMs = Date.parse(input.lastMessageAt ?? input.clarification.createdAt)
  const responseHours = input.publishedResponseTimeHours ?? 72
  const elapsed = Number.isFinite(lastMs) && Number.isFinite(nowMs) ? nowMs - lastMs : 0
  const urgent = input.clarification.risk === 'critical' || (Number.isFinite(deadlineMs) && deadlineMs - nowMs <= 48 * 60 * 60 * 1_000)
  if ((input.followUpCount ?? 0) >= 2) return { action: 'escalate' as const, reason: 'The bounded follow-up cadence is exhausted; use the next verified office or portal route.', waitUntil: null }
  if (urgent && elapsed >= 24 * 60 * 60 * 1_000) return { action: 'follow_up' as const, reason: 'The unresolved clarification is deadline-critical and the response window has elapsed.', waitUntil: null }
  if (elapsed >= responseHours * 60 * 60 * 1_000) return { action: 'follow_up' as const, reason: 'The published or default response window has elapsed.', waitUntil: null }
  const waitUntil = Number.isFinite(lastMs) ? new Date(lastMs + responseHours * 60 * 60 * 1_000).toISOString() : null
  return { action: 'wait' as const, reason: 'Wait for the appropriate response window before following up.', waitUntil }
}

function requestTypeFor(value: string) {
  if (/updated|current|recent|latest/.test(value) && /transcript|cv|resume|grades|passport|financial/.test(value)) return 'UPDATED_VERSION_REQUIRED' as const
  if (/official.{0,30}(transcript|academic record)|official copy/.test(value)) return 'OFFICIAL_VERSION_REQUIRED' as const
  if (/wrong|incorrect|does not show|not the|deficien|incomplete|unreadable|illegible/.test(value)) return /wrong|incorrect|not the/.test(value) ? 'WRONG_DOCUMENT' as const : 'DOCUMENT_INCOMPLETE' as const
  if (/translation|translated|certified translation/.test(value)) return 'TRANSLATION_REQUIRED' as const
  if (/degree certificate|proof of graduation|degree award|conferral/.test(value)) return 'DOCUMENT_MISSING' as const
  if (/transcript|academic record|grade report/.test(value)) return 'DOCUMENT_MISSING' as const
  if (/credential evaluation|wes|ece|equivalency/.test(value)) return 'CREDENTIAL_EVALUATION_REQUIRED' as const
  if (/test score|gre|gmat|ielts|toefl|duolingo|language score/.test(value)) return 'TEST_SCORE_REQUIRED' as const
  if (/recommendation|reference letter|referee/.test(value)) return 'RECOMMENDATION_REQUIRED' as const
  if (/passport|identity document|national id|proof of identity/.test(value)) return 'IDENTITY_DOCUMENT_REQUIRED' as const
  if (/financial|bank statement|funding evidence|proof of funds/.test(value)) return 'DOCUMENT_MISSING' as const
  if (/cv|resume|curriculum vitae/.test(value)) return /updated|current|latest/.test(value) ? 'UPDATED_VERSION_REQUIRED' as const : 'DOCUMENT_MISSING' as const
  if (/research proposal|additional essay|writing sample|statement/.test(value)) return 'DOCUMENT_MISSING' as const
  if (/explain|explanation|clarify|name discrepancy|gap in|grading anomaly/.test(value)) return 'EXPLANATION_REQUIRED' as const
  if (/form|questionnaire|declaration/.test(value)) return 'FORM_REQUIRED' as const
  if (/portal|checklist|upload field|application system/.test(value)) return 'PORTAL_CORRECTION_REQUIRED' as const
  if (/additional information|please clarify|clarification/.test(value)) return 'CLARIFICATION_REQUIRED' as const
  return 'OTHER' as const
}

function artifactDataTypeFor(value: string, type: PostSubmissionRequestType) {
  if (/transcript|academic record|grade report/.test(value)) return 'transcript'
  if (/degree certificate|proof of graduation|degree award|conferral/.test(value)) return 'degree_certificate'
  if (/credential evaluation|wes|ece/.test(value)) return 'credential_evaluation'
  if (/passport|identity document|national id/.test(value)) return 'identity_document'
  if (/financial|bank statement|proof of funds/.test(value)) return 'financial_evidence'
  if (/cv|resume|curriculum vitae/.test(value)) return 'cv'
  if (/recommendation|reference/.test(value)) return 'recommendation'
  if (/proposal/.test(value)) return 'research_proposal'
  if (/essay|writing sample|statement/.test(value)) return 'writing_sample'
  if (/gre|gmat|ielts|toefl|duolingo|test score/.test(value)) return 'test_score'
  return type === 'FORM_REQUIRED' ? 'form' : null
}

function submissionMethodFor(value: string, source: PostSubmissionSourceMessage) {
  if (/institution[- ]direct|send directly|registrar must send|testing provider must send/.test(value)) return 'institution_direct' as const
  if (/wes|ece|credential portal|testing provider portal/.test(value)) return 'provider_portal' as const
  if (/upload|portal|dashboard|checklist/.test(value) || source.provider === 'portal') return 'portal_upload' as const
  if (/email|reply|send to|attach/.test(value) || source.provider === 'gmail') return 'email' as const
  if (/sign in|log in|authenticate/.test(value)) return 'user_authentication' as const
  return 'unknown' as const
}

function urgencyFor(value: string, deadline: Deadline | null, now: string): PostSubmissionUrgency {
  if (/urgent|immediately|as soon as possible|within 24 hours|critical/.test(value)) return 'critical'
  if (deadline) {
    const remaining = Date.parse(deadline.dateTime) - Date.parse(now)
    if (Number.isFinite(remaining) && remaining <= 7 * 24 * 60 * 60 * 1_000) return remaining <= 72 * 60 * 60 * 1_000 ? 'critical' : 'deadline-sensitive'
    return 'deadline-sensitive'
  }
  return 'routine'
}

function requestSegments(body: string) {
  const segments = body.split(/(?<=[.!?])\s+|\n+/).map(segment => segment.trim()).filter(Boolean)
  const matched = segments.filter(segment => /(?:missing|required|please provide|please upload|please submit|need|deficien|incomplete|incorrect|additional|send us|attach|official|translated|updated)/i.test(segment))
  return matched.length ? matched : [text(body, 8_000)]
}

function pickCase(input: { source: PostSubmissionSourceMessage; candidates: PostSubmissionCaseCandidate[] }) {
  const source = input.source
  const explicitId = text(source.applicationId, 200)
  if (explicitId) {
    const exact = input.candidates.filter(candidate => candidate.applicationId === explicitId)
    if (exact.length === 1) return { case: exact[0]!, ambiguous: false, reason: null }
    if (exact.length > 1) return { case: null, ambiguous: true, reason: 'The application reference matches more than one ApplicationCase.' }
    return { case: null, ambiguous: false, reason: 'The institution application reference does not match an owned ApplicationCase.' }
  }
  const filtered = input.candidates.filter(candidate => {
    const institution = source.institution ? institutionMatches(candidate.institution, source.institution) : true
    const programme = source.programme ? institutionMatches(candidate.programme, source.programme) : true
    const senderDomain = source.from.toLocaleLowerCase().split('@')[1] ?? ''
    const domainMatch = !candidate.admissionsDomains?.length || candidate.admissionsDomains.some(domain => senderDomain === domain || senderDomain.endsWith(`.${domain}`))
    return institution && programme && domainMatch && Boolean(candidate.applicationId || candidate.submittedAt)
  })
  if (filtered.length === 1) return { case: filtered[0]!, ambiguous: false, reason: null }
  if (filtered.length > 1) return { case: null, ambiguous: true, reason: 'The institution request could belong to more than one ApplicationCase.' }
  return { case: null, ambiguous: false, reason: 'The institution request could not be bound to a submitted ApplicationCase.' }
}

/** Detect one typed requirement per requested item while preserving the source wording. */
export function detectPostSubmissionRequests(input: {
  source: PostSubmissionSourceMessage
  cases: PostSubmissionCaseCandidate[]
  now?: string
  idPrefix?: string
}): PostSubmissionDetection {
  const now = input.now ?? new Date().toISOString()
  const binding = pickCase({ source: input.source, candidates: input.cases })
  if (!binding.case) return { case: null, requests: [], ambiguous: binding.ambiguous, reason: binding.reason }
  const caseValue = binding.case
  const requests: PostSubmissionRequest[] = []
  const segments = requestSegments(input.source.body)
  const types = new Map<PostSubmissionRequestType, string>()
  for (const segment of segments) {
    const type = requestTypeFor(normalized(segment))
    if (type !== 'OTHER' || /additional|provide|upload|submit|required|missing|request/.test(normalized(segment))) types.set(type, segment)
  }
  if (!types.size) return { case: caseValue, requests: [], ambiguous: false, reason: null }
  const explicitDeadline = parseExplicitDeadline(input.source.body, 'UTC', input.source.sourceUrl ?? null, now)
  for (const [type, segment] of types.entries()) {
    const value = normalized(segment)
    const deadline = explicitDeadline
    const id = `${input.idPrefix ?? 'post-submission'}:${input.source.messageId}:${type.toLocaleLowerCase()}`
    const artifactDataType = artifactDataTypeFor(value, type)
    const status: PostSubmissionState = 'under_review'
    requests.push({
      id,
      applicationCaseId: caseValue.applicationCaseId,
      institution: caseValue.institution,
      programme: caseValue.programme,
      sourceMessageId: input.source.messageId,
      sourceThreadId: input.source.threadId,
      sourceProvider: input.source.provider,
      sourceUrl: input.source.sourceUrl ?? null,
      exactRequestText: text(segment, 8_000),
      normalizedRequirement: artifactDataType ? `${type.toLocaleLowerCase().replaceAll('_', ' ')}: ${artifactDataType.replaceAll('_', ' ')}` : type.toLocaleLowerCase().replaceAll('_', ' '),
      requestType: type,
      requestedArtifactDataType: artifactDataType,
      officialStatusRequired: type === 'OFFICIAL_VERSION_REQUIRED' || /official|certified|institution[- ]direct/.test(value),
      finalVersionRequired: type === 'UPDATED_VERSION_REQUIRED' || /final|degree conferred|complete/.test(value),
      degreeConferralRequired: /degree conferr|degree award|proof of graduation|final degree/.test(value),
      translationRequired: type === 'TRANSLATION_REQUIRED' || /translated|translation/.test(value),
      certifiedTranslationRequired: /certified translation/.test(value),
      institutionDirectDeliveryRequired: /institution[- ]direct|registrar must send|testing provider must send/.test(value),
      deadline,
      urgency: urgencyFor(value, deadline, now),
      submissionMethod: submissionMethodFor(value, input.source),
      recipient: safeEmail(input.source.from) || null,
      applicantActionRequired: true,
      artifactCandidates: [],
      status,
      responseEvidence: [],
      acceptanceEvidence: [],
      rejectionReason: null,
      externalCommitmentDueAt: null,
      version: 1,
      history: [{ at: input.source.receivedAt, event: 'request_detected', exactRequestText: text(segment, 8_000) }],
      idempotencyKey: `post-submission:${caseValue.applicationCaseId}:${input.source.messageId}:${type}`,
      createdAt: input.source.receivedAt,
      updatedAt: input.source.receivedAt,
    })
  }
  return { case: caseValue, requests, ambiguous: false, reason: null }
}

export function classifyPostSubmissionRequest(exactRequestText: string) {
  return requestTypeFor(normalized(exactRequestText))
}

export function bindPostSubmissionRequestToCase(input: { request: Pick<PostSubmissionRequest, 'applicationCaseId' | 'institution' | 'programme'>; applicationCase: PostSubmissionCaseCandidate }) {
  if (input.request.applicationCaseId !== input.applicationCase.applicationCaseId) return { valid: false, reason: 'cross_case_application_request' }
  if (!institutionMatches(input.request.institution, input.applicationCase.institution) || !institutionMatches(input.request.programme, input.applicationCase.programme)) return { valid: false, reason: 'application_identity_mismatch' }
  return { valid: true, reason: null }
}

function requiredArtifactChecks(request: PostSubmissionRequest, artifact: ArtifactForRecovery, expectedApplicantId?: string | null) {
  const metadata = record(artifact.metadata)
  const checks: Record<string, boolean> = {
    applicant: !expectedApplicantId || artifact.applicantId === expectedApplicantId || metadata.applicant_id === expectedApplicantId,
    institution: !artifact.institution || institutionMatches(artifact.institution, request.institution) || institutionMatches(text(metadata.institution, 500), request.institution),
    type: !request.requestedArtifactDataType || normalized(artifact.artifactType ?? artifact.kind).includes(normalized(request.requestedArtifactDataType)) || normalized(request.requestedArtifactDataType).includes(normalized(artifact.artifactType ?? artifact.kind)),
    official: !request.officialStatusRequired || artifact.officialStatus === 'official',
    final: !request.finalVersionRequired || artifact.final === true || /final|official/i.test(text(artifact.filename ?? artifact.finalSubmissionDestination, 300)),
    degreeConferral: !request.degreeConferralRequired || artifact.degreeConferralPresent === true || metadata.degree_conferral_present === true,
    translation: !request.translationRequired || artifact.translated === true || metadata.translated === true,
    certifiedTranslation: !request.certifiedTranslationRequired || artifact.certifiedTranslation === true || metadata.certified_translation === true,
    institutionDirect: !request.institutionDirectDeliveryRequired || artifact.institutionDirect === true || metadata.institution_direct === true,
    readable: artifact.readable !== false,
    complete: artifact.complete !== false,
    current: artifact.current !== false,
  }
  if (artifact.validUntil && Date.parse(artifact.validUntil) < Date.now()) checks.current = false
  return checks
}

export function inspectArtifactForPostSubmissionRequest(input: { request: PostSubmissionRequest; artifact: ArtifactForRecovery; expectedApplicantId?: string | null }): ArtifactInspection {
  const checks = requiredArtifactChecks(input.request, input.artifact, input.expectedApplicantId)
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key)
  const reasons = failed.map(key => {
    const labels: Record<string, string> = { applicant: 'The artifact belongs to a different applicant.', institution: 'The artifact is from a different institution.', type: 'The artifact type does not match the request.', official: 'An official version is required.', final: 'A final/current version is required.', degreeConferral: 'The document does not show degree conferral.', translation: 'A translation is required.', certifiedTranslation: 'A certified translation is required.', institutionDirect: 'The institution must send this evidence directly.', readable: 'The artifact is not readable.', complete: 'The artifact is incomplete.', current: 'The artifact is stale or expired.' }
    return labels[key] ?? `The artifact failed the ${key} check.`
  })
  const score = Math.max(0, Object.values(checks).filter(Boolean).length * 10 - failed.length * 20)
  return { artifactId: input.artifact.id, satisfies: failed.length === 0, score, reasons, checks }
}

export function rankArtifactCandidates(input: { request: PostSubmissionRequest; artifacts: ArtifactForRecovery[]; expectedApplicantId?: string | null }) {
  return input.artifacts.map(artifact => ({ artifact, inspection: inspectArtifactForPostSubmissionRequest({ request: input.request, artifact, expectedApplicantId: input.expectedApplicantId }) }))
    .sort((left, right) => Number(right.inspection.satisfies) - Number(left.inspection.satisfies) || right.inspection.score - left.inspection.score || (Date.parse(right.artifact.issueDate ?? '') || 0) - (Date.parse(left.artifact.issueDate ?? '') || 0) || left.artifact.id.localeCompare(right.artifact.id))
}

export const safeArtifactTransformations = ['compress_pdf', 'rotate_pages', 'merge_translation', 'merge_grading_legend', 'rename'] as const

export function createSafeDerivedArtifactPlan(input: { original: ArtifactForRecovery; derivedId: string; derivedChecksum: string; filename: string; transformations: string[]; applicationCaseId?: string | null }) {
  const invalid = input.transformations.filter(transformation => !safeArtifactTransformations.includes(transformation as typeof safeArtifactTransformations[number]))
  if (invalid.length) throw new Error(`Substantive artifact transformations are not allowed: ${invalid.join(', ')}`)
  if (!input.original.checksum) throw new Error('A derived artifact must preserve the original checksum reference.')
  return {
    id: input.derivedId,
    fileAssetId: input.derivedId,
    applicationCaseId: input.applicationCaseId ?? null,
    originalArtifactId: input.original.id,
    originalChecksum: input.original.checksum,
    checksum: input.derivedChecksum,
    filename: text(input.filename, 255),
    transformations: [...input.transformations],
    substantiveContentUnchanged: true,
    sourceAssetIds: [input.original.fileAssetId ?? input.original.id],
    approvalStatus: 'not_required' as const,
  }
}

function interactionForMissingRequest(request: PostSubmissionRequest): PostSubmissionProgressInteraction {
  const id = `post-submission-interaction:${request.id}:missing`
  if (request.submissionMethod === 'user_authentication') return { id, applicationCaseId: request.applicationCaseId, requestId: request.id, kind: 'secure_authentication', question: `Your ${request.institution} application portal needs you to sign in before I can provide ${request.normalizedRequirement}.`, reason: 'Authentication is required from you; ShotCount will resume the saved request after the secure handoff.', status: 'pending', deadline: request.deadline, dedupeKey: id }
  if (request.requestType === 'EXPLANATION_REQUIRED' || request.requestType === 'CLARIFICATION_REQUIRED') return { id, applicationCaseId: request.applicationCaseId, requestId: request.id, kind: 'correction', question: `What factual detail should I provide to ${request.institution} about this request?`, reason: `The institution asked: “${request.exactRequestText}” I will construct the response from your one confirmed fact.`, field: request.normalizedRequirement, status: 'pending', deadline: request.deadline, dedupeKey: id }
  return { id, applicationCaseId: request.applicationCaseId, requestId: request.id, kind: 'attachment', question: `${request.institution} needs your ${request.normalizedRequirement}.`, reason: `I could not find a valid artifact that satisfies the exact request: “${request.exactRequestText}”`, acceptedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maximumFiles: 1, status: 'pending', deadline: request.deadline, dedupeKey: id }
}

export function planPostSubmissionResponse(input: { request: PostSubmissionRequest; artifacts: ArtifactForRecovery[]; expectedApplicantId?: string | null; existingActionKeys?: string[]; externalProvider?: string | null }) : PostSubmissionActionPlan {
  const actionBase = `${input.request.id}:${input.request.version}`
  const ranked = rankArtifactCandidates({ request: input.request, artifacts: input.artifacts, expectedApplicantId: input.expectedApplicantId })
  const selected = ranked.find(item => item.inspection.satisfies)
  const method = input.request.submissionMethod
  if (input.existingActionKeys?.includes(`post-submission:${actionBase}`)) return { action: 'WAIT_FOR_PROCESSING', request: input.request, until: input.request.externalCommitmentDueAt, idempotencyKey: `post-submission:${actionBase}` }
  if (selected && method === 'portal_upload') return { action: 'PREPARE_PORTAL_UPLOAD', request: { ...input.request, artifactCandidates: [selected.artifact.id], status: 'artifact_ready' }, artifact: selected.artifact, inspection: selected.inspection, idempotencyKey: `post-submission:${actionBase}:${selected.artifact.id}:portal` }
  if (selected && method === 'email') return { action: 'PREPARE_EMAIL_RESPONSE', request: { ...input.request, artifactCandidates: [selected.artifact.id], status: 'artifact_ready' }, artifact: selected.artifact, idempotencyKey: `post-submission:${actionBase}:${selected.artifact.id}:email` }
  if (selected && method === 'institution_direct') return { action: 'WAIT_FOR_PROCESSING', request: input.request, until: input.request.externalCommitmentDueAt, idempotencyKey: `post-submission:${actionBase}:institution-direct` }
  if (input.externalProvider && (method === 'provider_portal' || /credential|score|transcript|registrar/i.test(input.externalProvider))) return { action: 'ACQUIRE_EXTERNAL_DOCUMENT', request: input.request, provider: input.externalProvider, idempotencyKey: `post-submission:${actionBase}:provider` }
  return { action: 'USER_HANDOFF', request: input.request, interaction: interactionForMissingRequest(input.request), idempotencyKey: `post-submission:${actionBase}:user` }
}

export function generateAdditionalInformationResponse(input: {
  request: Pick<PostSubmissionRequest, 'institution' | 'programme' | 'exactRequestText' | 'recipient' | 'sourceThreadId' | 'sourceMessageId'>
  applicationId?: string | null
  applicantName?: string | null
  artifact?: ArtifactForRecovery | null
  artifactId?: string | null
  verifiedExplanation?: string | null
  deadline?: Deadline | null
}) : PostSubmissionResponse {
  const recipient = safeEmail(input.request.recipient)
  const subject = `Re: ${input.request.exactRequestText.slice(0, 160)}`.slice(0, 998)
  const attachmentIds = input.artifactId ? [input.artifactId] : input.artifact?.id ? [input.artifact.id] : []
  const lines = [
    `Dear Admissions Team,`,
    '',
    `I am writing regarding your request: “${text(input.request.exactRequestText, 2_000)}”`,
    input.applicationId ? `My application reference is ${input.applicationId}.` : '',
    input.verifiedExplanation ? input.verifiedExplanation : attachmentIds.length ? 'I have attached the requested document for your review.' : 'I have provided the requested information below.',
    input.deadline ? `Please let me know if anything else is needed before ${input.deadline.label ?? input.deadline.dateTime}.` : 'Please let me know if any further information is required.',
    '',
    'Kind regards,',
    text(input.applicantName, 240) || 'the applicant',
  ].filter(Boolean)
  const textPlain = lines.join('\n')
  const textHtml = `<div>${htmlParagraphs(lines)}</div>`
  return {
    version: APPLICATION_RECOVERY_VERSION,
    to: recipient ? [recipient] : [],
    subject,
    textPlain,
    textHtml,
    bodyText: textPlain,
    bodyHtml: textHtml,
    attachmentIds,
    evidenceMap: [
      { field: 'exact_institution_request', sourceIds: [input.request.sourceMessageId], explanation: 'The response preserves the institution wording.' },
      ...(input.artifact ? [{ field: 'attachment', sourceIds: [input.artifact.id, input.artifact.checksum ?? ''].filter(Boolean), explanation: 'The attachment was selected from verified artifact context.' }] : []),
    ],
    threadId: input.request.sourceThreadId,
    inReplyToMessageId: input.request.sourceMessageId,
  }
}

export function applyPostSubmissionDeliveryEvidence(input: { request: PostSubmissionRequest; evidence: PostSubmissionDeliveryEvidence; now?: string }) {
  const now = input.now ?? input.evidence.observedAt
  const evidenceIds = unique([...input.request.responseEvidence, ...input.evidence.evidenceIds])
  const acceptanceIds = input.evidence.acceptanceVerified ? unique([...input.request.acceptanceEvidence, ...input.evidence.evidenceIds]) : input.request.acceptanceEvidence
  let status = input.request.status
  let rejectionReason = input.request.rejectionReason
  if (input.evidence.portalStatus === 'rejected' || input.evidence.providerStatus === 'rejected') {
    status = 'replacement_required'
    rejectionReason = input.evidence.note ?? 'The institution rejected or found a deficiency in the submitted evidence.'
  } else if (input.evidence.acceptanceVerified || input.evidence.portalStatus === 'accepted') {
    status = input.request.status === 'accepted' ? 'complete' : 'accepted'
  } else if (input.evidence.receiptVerified || input.evidence.providerStatus === 'delivered' || input.evidence.portalStatus === 'received') {
    status = 'delivery_verified'
  } else if (input.evidence.portalStatus === 'uploaded' || input.evidence.providerStatus === 'sent') {
    status = input.request.submissionMethod === 'portal_upload' ? 'submitted_to_portal' : 'sent_to_institution'
  }
  const next: PostSubmissionRequest = {
    ...input.request,
    status,
    responseEvidence: evidenceIds,
    acceptanceEvidence: acceptanceIds,
    rejectionReason,
    applicantActionRequired: status === 'replacement_required',
    updatedAt: now,
    history: [...input.request.history, { at: now, event: `delivery_${status}`, evidenceIds: input.evidence.evidenceIds }],
  }
  return next
}

export function reconcilePostSubmissionDelivery(input: { request: PostSubmissionRequest; providerDelivered: boolean; portalStatus: PostSubmissionDeliveryEvidence['portalStatus']; providerDeliveredAt?: string | null; expectedProcessingDays?: number | null; now: string; evidenceIds: string[] }) : PostSubmissionReconciliation {
  if (input.portalStatus === 'accepted') return { state: 'RESOLVED', reason: 'The portal checklist confirms acceptance.', shouldContactAdmissions: false, waitUntil: null, evidenceIds: input.evidenceIds }
  if (input.portalStatus === 'rejected') return { state: 'REPLACEMENT_REQUIRED', reason: 'The portal still reports a deficiency; find or request a replacement artifact.', shouldContactAdmissions: false, waitUntil: null, evidenceIds: input.evidenceIds }
  if (!input.providerDelivered) return { state: 'WAIT_FOR_PROCESSING', reason: 'Delivery is not verified yet; do not claim completion or resend.', shouldContactAdmissions: false, waitUntil: null, evidenceIds: input.evidenceIds }
  const deliveredAt = Date.parse(input.providerDeliveredAt ?? '')
  const nowMs = Date.parse(input.now)
  const processingDays = input.expectedProcessingDays ?? 3
  const processingDue = Number.isFinite(deliveredAt) ? deliveredAt + processingDays * 24 * 60 * 60 * 1_000 : NaN
  if (!Number.isFinite(processingDue) || nowMs < processingDue) return { state: 'WAIT_FOR_PROCESSING', reason: 'The provider confirms delivery but the institution is still within its expected processing window.', shouldContactAdmissions: false, waitUntil: Number.isFinite(processingDue) ? new Date(processingDue).toISOString() : null, evidenceIds: input.evidenceIds }
  return { state: 'ADMISSIONS_ESCALATION_REQUIRED', reason: 'Provider delivery is verified and the institution processing window has elapsed while the portal remains missing.', shouldContactAdmissions: true, waitUntil: null, evidenceIds: input.evidenceIds }
}

export function postSubmissionActionKey(requestId: string, artifactChecksum: string | null, method: string) {
  return `post-submission:${requestId}:${artifactChecksum ?? 'none'}:${normalized(method)}`
}

export function buildRecoveryMetrics(events: Array<{ type: keyof ApplicationRecoveryMetrics; value?: number }>): ApplicationRecoveryMetrics {
  const empty: ApplicationRecoveryMetrics = { clarificationRequirementsCreated: 0, clarificationsResolvedWithoutEmail: 0, admissionsEmailsSent: 0, admissionsRepliesInterpreted: 0, postSubmissionRequestsDetected: 0, artifactsResolvedAutomatically: 0, attachmentRequests: 0, structuredUserQuestions: 0, authenticationHandoffs: 0, freeTextInteractions: 0, duplicateActionsPrevented: 0, crossCaseContamination: 0 }
  for (const event of events) empty[event.type] += event.value ?? 1
  return empty
}

export function progressInteractionToProjectionInteraction(interaction: PostSubmissionProgressInteraction) {
  return {
    id: interaction.id,
    applicationCaseId: interaction.applicationCaseId,
    requirementId: interaction.requestId,
    kind: interaction.kind,
    question: interaction.question,
    reason: interaction.reason,
    status: interaction.status,
    dedupeKey: interaction.dedupeKey,
    deadline: interaction.deadline,
  }
}

export function admissionsClarificationToApprovalInteraction(clarification: AdmissionsClarification) {
  return {
    id: `admissions-clarification-approval:${clarification.id}`,
    applicationCaseId: clarification.applicationCaseId,
    requirementId: clarification.id,
    kind: 'approve' as const,
    question: `Review the prepared clarification for ${clarification.institution} before Roon sends it.`,
    reason: clarification.whyClarificationIsNecessary,
    status: clarification.status === 'awaiting_approval' ? 'pending' as const : 'answered' as const,
    dedupeKey: clarification.idempotencyKey,
    deadline: clarification.deadline,
  }
}

export function admissionsClarificationToRequirement(clarification: AdmissionsClarification): Requirement {
  return {
    id: clarification.id,
    applicationCaseId: clarification.applicationCaseId,
    name: `Admissions clarification: ${clarification.unresolvedIssue}`.slice(0, 500),
    category: clarification.questionCategory === 'funding' || clarification.questionCategory === 'fee_waiver' ? 'financial' : clarification.questionCategory === 'transcript' || clarification.questionCategory === 'degree_evidence' ? 'academic' : 'other',
    source: null,
    required: true,
    exactInstructions: clarification.unresolvedIssue,
    deadline: clarification.deadline,
    status: clarification.status === 'resolved' || clarification.status === 'closed' ? 'verified' : clarification.status === 'awaiting_approval' ? 'awaiting_user' : clarification.status === 'monitoring' || clarification.status === 'sent' ? 'awaiting_institution' : 'in_progress',
    responsibleParty: clarification.status === 'awaiting_approval' ? 'applicant' : 'david',
    linkedArtifactId: null,
    verificationEvidenceIds: clarification.evidenceIds,
    blockerReason: clarification.status === 'awaiting_approval' ? 'Review the prepared admissions clarification before Roon sends it.' : clarification.whyClarificationIsNecessary,
    sourceId: clarification.id,
    requirementType: 'admissions_clarification',
    dependencyIds: [],
    evidenceContract: ['gmail'],
    retryState: { attempts: 0, maximumAttempts: 3, lastFailure: null, nextAttemptAt: null, escalated: false },
    resolutionTier: clarification.status === 'awaiting_approval' ? 5 : 2,
    waitUntil: null,
    createdAt: clarification.createdAt,
    updatedAt: clarification.updatedAt,
  }
}

export function postSubmissionRequestToRequirement(request: PostSubmissionRequest): Requirement {
  const status: Requirement['status'] = request.status === 'complete' || request.status === 'accepted' ? 'verified' : request.status === 'replacement_required' || request.status === 'rejected' ? 'rejected' : request.applicantActionRequired ? 'awaiting_user' : ['delivery_verified', 'under_review'].includes(request.status) ? 'awaiting_institution' : 'in_progress'
  return {
    id: request.id,
    applicationCaseId: request.applicationCaseId,
    name: request.normalizedRequirement.slice(0, 500),
    category: /financial|funding/.test(request.normalizedRequirement) ? 'financial' : /transcript|degree|credential|test|identity/.test(request.normalizedRequirement) ? 'academic' : 'other',
    source: null,
    required: true,
    exactInstructions: request.exactRequestText,
    deadline: request.deadline,
    status,
    responsibleParty: request.applicantActionRequired ? 'applicant' : request.submissionMethod === 'email' ? 'roon' : 'david',
    linkedArtifactId: request.artifactCandidates[0] ?? null,
    verificationEvidenceIds: unique([...request.responseEvidence, ...request.acceptanceEvidence]),
    blockerReason: request.rejectionReason ?? (request.applicantActionRequired ? `The exact request remains open: ${request.exactRequestText}` : null),
    sourceId: request.sourceMessageId,
    requirementType: 'post_submission_request',
    dependencyIds: [],
    evidenceContract: request.status === 'complete' ? ['gmail'] : request.submissionMethod === 'portal_upload' ? ['portal', 'artifact'] : ['gmail', 'artifact'],
    retryState: { attempts: 0, maximumAttempts: 3, lastFailure: null, nextAttemptAt: null, escalated: false },
    resolutionTier: request.applicantActionRequired ? 5 : 3,
    waitUntil: request.externalCommitmentDueAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  }
}

export function postSubmissionRequestRow(request: PostSubmissionRequest, userId: string, requirementId: string | null = null) {
  return {
    id: request.id,
    user_id: userId,
    application_case_id: request.applicationCaseId,
    requirement_id: requirementId,
    institution: request.institution,
    programme: request.programme,
    source_message_id: request.sourceMessageId,
    source_thread_id: request.sourceThreadId,
    source_provider: request.sourceProvider,
    source_url: request.sourceUrl,
    exact_request_text: request.exactRequestText,
    normalized_requirement: request.normalizedRequirement,
    request_type: request.requestType,
    requested_artifact_data_type: request.requestedArtifactDataType,
    official_status_required: request.officialStatusRequired,
    final_version_required: request.finalVersionRequired,
    degree_conferral_required: request.degreeConferralRequired,
    translation_required: request.translationRequired,
    certified_translation_required: request.certifiedTranslationRequired,
    institution_direct_delivery_required: request.institutionDirectDeliveryRequired,
    deadline_at: request.deadline?.dateTime ?? null,
    deadline_timezone: request.deadline?.timezone ?? null,
    urgency: request.urgency,
    submission_method: request.submissionMethod,
    recipient: request.recipient,
    applicant_action_required: request.applicantActionRequired,
    artifact_candidates: request.artifactCandidates,
    status: request.status,
    response_evidence: request.responseEvidence,
    acceptance_evidence: request.acceptanceEvidence,
    rejection_reason: request.rejectionReason,
    external_commitment_due_at: request.externalCommitmentDueAt,
    version: request.version,
    history: request.history,
    idempotency_key: request.idempotencyKey,
  }
}

export function admissionsClarificationRow(clarification: AdmissionsClarification, userId: string) {
  return {
    id: clarification.id,
    user_id: userId,
    application_case_id: clarification.applicationCaseId,
    programme: clarification.programme,
    institution: clarification.institution,
    requirement_id: clarification.underlyingRequirementId,
    question_category: clarification.questionCategory,
    unresolved_issue: clarification.unresolvedIssue,
    sources_checked: clarification.sourcesAlreadyChecked,
    conflicting_evidence: clarification.conflictingEvidence,
    why_necessary: clarification.whyClarificationIsNecessary,
    unresolved_reason: clarification.unresolvedReason,
    admissions_contact: clarification.admissionsContact,
    contact_source: clarification.contactSource,
    deadline_relevance: clarification.deadlineRelevance,
    deadline_at: clarification.deadline?.dateTime ?? null,
    deadline_timezone: clarification.deadline?.timezone ?? null,
    risk: clarification.risk,
    drafted_question: clarification.draftedQuestion,
    gmail_thread_id: clarification.gmailThreadId,
    gmail_message_id: clarification.gmailMessageId,
    status: clarification.status,
    resolved_interpretation: clarification.resolvedInterpretation,
    resulting_requirement_updates: clarification.resultingRequirementUpdates,
    evidence_ids: clarification.evidenceIds,
    idempotency_key: clarification.idempotencyKey,
  }
}

export function emptyRecoveryMetrics(): ApplicationRecoveryMetrics {
  return buildRecoveryMetrics([])
}

// Keep the imports above meaningful to both the browser projection and the
// Edge Functions. These helpers are intentionally small and pure; actual
// applicant profile lookup happens at the call site where RLS can be checked.
export function recoveryContextSummary(profile: Pick<ApplicantProfile, 'legalName' | 'preferredName'> | null, applicationCase: Pick<ApplicationCase, 'id' | 'applicationId'>) {
  return {
    applicantName: profile?.preferredName?.value || profile?.legalName?.value || null,
    applicationCaseId: applicationCase.id,
    applicationId: applicationCase.applicationId,
  }
}
