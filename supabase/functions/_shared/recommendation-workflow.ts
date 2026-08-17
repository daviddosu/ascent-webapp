/**
 * The deterministic recommendation-letter workflow.
 *
 * David owns the strategy and the semantic interpretation in this module.
 * Roon owns provider effects (Gmail, Contacts, Calendar), and the task-agent
 * owns persistence and user-visible progress. Keeping these contracts here
 * means the same rules can be exercised by the Edge Functions, the browser,
 * and the David qualification harness without a live provider.
 */

export const RECOMMENDATION_WORKFLOW_VERSION = 'recommendation-coordination@1.0.0' as const

export const recommendationInteractionKinds = [
  'approval',
  'single_choice',
  'multiple_choice',
  'email',
  'contact_select',
  'attachment_request',
  'attachment_selection',
  'date',
  'fact',
  'short_text',
  'confirmation',
  'correction',
] as const
export type RecommendationInteractionKind = typeof recommendationInteractionKinds[number]

export const recommendationInteractionPriority: Record<RecommendationInteractionKind, number> = {
  approval: 1,
  single_choice: 2,
  multiple_choice: 2,
  contact_select: 2,
  email: 3,
  date: 3,
  fact: 3,
  attachment_request: 4,
  attachment_selection: 4,
  short_text: 5,
  confirmation: 1,
  correction: 3,
}

export const recommendationReplyClassifications = [
  'STRONG_ACCEPT',
  'ACCEPT',
  'HESITANT',
  'DECLINE',
  'NEEDS_MORE_INFORMATION',
  'REQUESTS_MATERIALS',
  'REQUESTS_DRAFT',
  'REQUESTS_MEETING',
  'CANNOT_MEET_DEADLINE',
  'GENERAL_LETTER_ONLY',
  'OTHER',
] as const
export type RecommendationReplyClassification = typeof recommendationReplyClassifications[number]

export const recommendationCampaignStates = [
  'requirements_verified',
  'candidates_discovered',
  'recommender_strategy_ready',
  'awaiting_user_selection',
  'contact_verification_pending',
  'contact_verified',
  'request_ready',
  'awaiting_request_approval',
  'request_sent',
  'waiting_response',
  'strong_accept',
  'accept',
  'hesitant',
  'declined',
  'needs_more_information',
  'requests_materials',
  'requests_draft',
  'requests_meeting',
  'cannot_meet_deadline',
  'general_letter_only',
  'support_pack_ready',
  'support_pack_sent',
  'portal_registration_ready',
  'portal_invitation_sent',
  'waiting_submission',
  'followup_due',
  'replacement_needed',
  'submitted',
  'thanked',
  'complete',
  'blocked',
] as const
export type RecommendationCampaignState = typeof recommendationCampaignStates[number]

export const recommendationRelationshipTypes = [
  'thesis_supervisor',
  'research_supervisor',
  'professor',
  'course_instructor',
  'internship_supervisor',
  'employer',
  'manager',
  'mentor',
  'other',
] as const
export type RecommendationRelationshipType = typeof recommendationRelationshipTypes[number]

export type RecommendationInteractionOption = {
  value: string
  label: string
  description?: string
  candidateId?: string
  assetId?: string
  disabled?: boolean
}

export type RecommendationApprovalScope = 'candidate_portfolio' | 'recommendation_request' | 'support_pack' | 'portal_invitation' | 'completion'

export type RecommendationInteractionBase = {
  id: string
  requirementId: string
  question: string
  reason: string
  knownContext: string[]
  reusableContextKeys: string[]
  required: boolean
  priority: number
  mapsToRequirement: string
}

export type RecommendationInteraction = RecommendationInteractionBase & ({
  kind: 'approval' | 'confirmation'
  approvalScope: RecommendationApprovalScope
  confirmLabel: string
  cancelLabel: string
} | {
  kind: 'single_choice' | 'contact_select' | 'attachment_selection'
  options: RecommendationInteractionOption[]
  allowOther: boolean
} | {
  kind: 'multiple_choice'
  options: RecommendationInteractionOption[]
  minSelections: number
  maxSelections: number
} | {
  kind: 'email'
  placeholder: string
  currentValue: string | null
  verified: boolean
} | {
  kind: 'attachment_request'
  acceptedMimeTypes: string[]
  minimumFiles: number
  maximumFiles: number
  attachmentPrompt: string
} | {
  kind: 'date'
  timezone: string
  currentValue: string | null
  minimumDate: string | null
} | {
  kind: 'fact'
  field: string
  currentValue: string | number | boolean | null
  inputType: 'text' | 'number' | 'boolean' | 'date'
} | {
  kind: 'short_text' | 'correction'
  placeholder: string
  currentValue: string | null
  maximumCharacters: number
})

export type RecommendationInteractionResponse = {
  interactionId: string
  kind: RecommendationInteractionKind
  value: string | string[] | boolean | number | Record<string, unknown> | null
  submittedAt: string
  reusable: boolean
}

export type RecommendationInteractionMetric = {
  interactionId: string
  kind: RecommendationInteractionKind
  requirementId: string
  outcome: 'answered' | 'skipped' | 'corrected' | 'invalid'
  autoResolvedBeforeQuestion: boolean
  resumedAutomatically: boolean
  answerCount: number
  createdAt: string
}

export type RecommendationSourceEvidence = {
  id: string
  url: string | null
  authority: 'official' | 'government' | 'provider' | 'applicant' | 'uploaded_document' | 'generated'
  excerpt: string
  claims: string[]
  retrievedAt: string
  sourceType?: string
}

export type RecommendationField<T> = {
  value: T | null
  sourceEvidenceIds: string[]
  verified: boolean
  note?: string | null
}

export type RecommendationProgrammeRequirements = {
  programme: RecommendationField<string>
  institution: RecommendationField<string>
  recommendationCount: RecommendationField<number>
  requiredRefereeTypes: RecommendationField<string[]>
  submissionMethod: RecommendationField<string>
  refereeDeadline: RecommendationField<{ dateTime: string; timezone: string }>
  portalInvitationFlow: RecommendationField<string>
  letterLength: RecommendationField<string>
  format: RecommendationField<string>
  template: RecommendationField<string>
  language: RecommendationField<string>
  relationshipRestrictions: RecommendationField<string[]>
  specialPrompts: RecommendationField<string[]>
  contactVerification: RecommendationField<string[]>
  fallbackRules: RecommendationField<string[]>
  sourceEvidence: RecommendationSourceEvidence[]
  unresolvedFields: string[]
  extractedAt: string
  sourceBacked: boolean
}

export type RelationshipEvidence = {
  id: string
  text: string
  sourceId: string
  sourceKind: 'direct_observation' | 'applicant_update'
  observedBoundary: 'personally_observed' | 'reported_after_relationship' | 'not_observed'
  confidence: 'high' | 'medium' | 'low'
  observedAt: string | null
}

export type RecommenderCandidate = {
  id: string
  name: string
  email: string | null
  currentTitle: string | null
  institution: string | null
  department: string | null
  relationshipType: RecommendationRelationshipType
  relationshipStrength: number
  exactContextOfRelationship: string
  relationshipEvidence: RelationshipEvidence[]
  relevanceToProgramme: string[]
  eligibility: 'eligible' | 'unknown' | 'ineligible'
  eligibilityReasons: string[]
  availability: 'available' | 'unknown' | 'unavailable'
  verifiedContactSource: 'gmail_thread' | 'contacts' | 'profile' | 'user_confirmed' | 'none'
  contactVerificationStatus: 'verified' | 'needs_verification' | 'invalid' | 'missing'
  recommendedProgrammes: string[]
  fitScore: number
  rankingReasons: string[]
  portfolioRole: 'primary' | 'complementary' | 'backup' | 'unassigned'
  sourceIds: string[]
}

export type RecommendationPortfolioStrategy = {
  recommendationCount: number
  selectedCandidateIds: string[]
  backupCandidateIds: string[]
  programmeAssignments: Array<{ programme: string; candidateIds: string[]; rationale: string }>
  complementaryCoverage: string[]
  titlePrestigeWeight: number
  directEvidenceWeight: number
  recommendation: string
  approvalRequired: boolean
}

export type RecommendationEvidenceItem = {
  claim: string
  sourceIds: string[]
  sourceKind: 'direct_observation' | 'applicant_update'
  observedBoundary: 'personally_observed' | 'reported_after_relationship' | 'not_observed'
  provenance: string
}

export type RecommenderSupportPack = {
  id: string
  version: typeof RECOMMENDATION_WORKFLOW_VERSION
  candidate: RecommenderCandidate
  programme: { institution: string; title: string; deadline: string | null }
  programmeRequirements: RecommendationProgrammeRequirements
  whatApplicantWants: string
  applicantGoal: string
  relationshipReminders: RelationshipEvidence[]
  evidenceBank: RecommendationEvidenceItem[]
  emphasis: string[]
  updatesSinceRelationship: RecommendationEvidenceItem[]
  materials: Array<{ assetId: string; label: string; purpose: string }>
  requestEmail: RecommendationRequestEmail
  quality: { grounded: boolean; unsupportedClaims: string[]; missingInputs: string[] }
  createdAt: string
}

export type RecommendationRequestProgramme = {
  institution: string
  title: string
  deadline: string | null
  applicationUrl?: string | null
}

export type RecommendationRequestEmailInput = {
  applicantName: string
  applicantEmail?: string | null
  recommender: Pick<RecommenderCandidate, 'name' | 'email' | 'currentTitle' | 'institution' | 'relationshipType' | 'exactContextOfRelationship'>
  programmes: RecommendationRequestProgramme[]
  relationshipEvidence: RelationshipEvidence[]
  reason: string
  applicantGoal?: string
  supportPackAvailable?: boolean
  tone?: 'recent_supervisor' | 'older_supervisor' | 'professional'
  programmeRequirements?: RecommendationProgrammeRequirements | null
}

export type RecommendationRequestEmail = {
  generatedBy: typeof RECOMMENDATION_WORKFLOW_VERSION
  to: string | null
  subject: string
  bodyText: string
  bodyHtml: string
  metadata: {
    applicantName: string
    recommenderName: string
    relationshipType: RecommendationRelationshipType
    relationshipContext: string
    programmeCount: number
    deadline: string | null
    strongRecommendationRequested: true
    supportPackMentioned: boolean
    tone: 'recent_supervisor' | 'older_supervisor' | 'professional'
  }
}

export type RecommendationContextResolution = {
  version: typeof RECOMMENDATION_WORKFLOW_VERSION
  checkedSources: string[]
  autoResolvedFacts: Array<{ key: string; value: string; sourceIds: string[]; confidence: 'high' | 'medium' | 'low' }>
  candidates: RecommenderCandidate[]
  reusableContext: Record<string, string>
  reusableContextConsent: boolean
  unresolved: string[]
  nextInteraction: RecommendationInteraction | null
  automaticContinuationRate: number
}

export type RecommendationRequirementNode = {
  id: string
  caseId: string
  name: string
  category: 'source' | 'candidate' | 'contact' | 'communication' | 'support_pack' | 'portal' | 'outcome'
  required: boolean
  status: RecommendationCampaignState | 'pending' | 'verified' | 'satisfied' | 'blocked'
  dependencyIds: string[]
  sourceEvidenceIds: string[]
  evidenceContract: Array<'gmail' | 'contacts' | 'portal' | 'artifact' | 'user_approval'>
}

function text(value: unknown, maximum = 4_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function stringArray(value: unknown, maximum = 80) {
  return Array.isArray(value) ? value.map(item => text(item, maximum)).filter(Boolean) : []
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function unwrap(value: unknown): unknown {
  const object = record(value)
  return Object.prototype.hasOwnProperty.call(object, 'value') ? object.value : value
}

function sourceIds(value: unknown) {
  const object = record(value)
  const provenance = record(object.provenance)
  return [
    ...stringArray(object.sourceIds, 160),
    ...stringArray(object.source_ids, 160),
    ...stringArray(object.sourceEvidenceIds, 160),
    ...stringArray(object.source_evidence_ids, 160),
    ...stringArray(provenance.sourceAssetIds, 160),
    ...stringArray(provenance.source_asset_ids, 160),
    ...stringArray(provenance.evidenceIds, 160),
    ...stringArray(provenance.evidence_ids, 160),
    text(provenance.sourceUrl, 2_000),
  ].filter(Boolean).filter((item, index, values) => values.indexOf(item) === index)
}

function now() {
  return new Date().toISOString()
}

function slug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'candidate'
}

function normalizedEmail(value: unknown) {
  const email = text(value, 320).toLocaleLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function candidateName(value: Record<string, unknown>) {
  return text(value.name ?? value.fullName ?? value.full_name ?? value.displayName ?? value.display_name, 240)
}

function relationshipType(value: unknown, fallback = 'other' as RecommendationRelationshipType): RecommendationRelationshipType {
  const normalized = text(value, 80).toLocaleLowerCase().replace(/[ -]+/g, '_')
  if ((recommendationRelationshipTypes as readonly string[]).includes(normalized)) return normalized as RecommendationRelationshipType
  if (/thesis|dissertation/.test(normalized)) return 'thesis_supervisor'
  if (/research/.test(normalized) && /supervisor|lead/.test(normalized)) return 'research_supervisor'
  if (/course|lectur|teach|professor/.test(normalized)) return 'course_instructor'
  if (/intern/.test(normalized)) return 'internship_supervisor'
  if (/manager/.test(normalized)) return 'manager'
  if (/employ|boss|work/.test(normalized)) return 'employer'
  if (/mentor/.test(normalized)) return 'mentor'
  return fallback
}

function candidateSourceKind(source: string) {
  if (source === 'gmail') return 'gmail_thread' as const
  if (source === 'contacts') return 'contacts' as const
  if (source === 'profile') return 'profile' as const
  return 'user_confirmed' as const
}

function evidence(
  id: string,
  value: string,
  sourceKind: RelationshipEvidence['sourceKind'],
  observedBoundary: RelationshipEvidence['observedBoundary'],
  confidence: RelationshipEvidence['confidence'] = 'medium',
): RelationshipEvidence {
  return { id, text: value, sourceId: id, sourceKind, observedBoundary, confidence, observedAt: null }
}

function contactVerification(email: string | null, source: string): RecommenderCandidate['contactVerificationStatus'] {
  if (!email) return 'missing'
  if (source === 'gmail' || source === 'contacts' || source === 'profile') return 'verified'
  return 'needs_verification'
}

function inferredRelationshipContext(value: Record<string, unknown>) {
  return text(value.relationshipContext ?? value.relationship_context ?? value.context ?? value.relationship, 2_000)
}

function directRelationshipEvidence(value: Record<string, unknown>, id: string) {
  const relationship = inferredRelationshipContext(value)
  const direct = stringArray(value.directObservations ?? value.direct_observations, 2_000)
  const result = direct.map((item, index) => evidence(`${id}:direct:${index + 1}`, item, 'direct_observation', 'personally_observed', 'high'))
  if (relationship) result.push(evidence(`${id}:relationship`, relationship, 'direct_observation', 'personally_observed', 'high'))
  return result
}

function applicantUpdateEvidence(value: Record<string, unknown>, id: string) {
  const updates = stringArray(value.applicantUpdates ?? value.applicant_updates ?? value.laterAccomplishments, 2_000)
  return updates.map((item, index) => evidence(`${id}:update:${index + 1}`, item, 'applicant_update', 'reported_after_relationship', 'medium'))
}

function candidateFromRecord(value: unknown, source: string, index: number): RecommenderCandidate | null {
  const input = record(value)
  const name = candidateName(input)
  if (!name) return null
  const email = normalizedEmail(input.email ?? input.emailAddress ?? input.email_address)
  const institution = text(input.institution ?? input.organization ?? input.organisation, 300) || null
  const id = text(input.id ?? input.providerContactId ?? input.provider_contact_id, 120) || `${slug(name)}-${index + 1}`
  const relationship = relationshipType(input.relationshipType ?? input.relationship_type ?? input.relationship, 'other')
  const sourceId = `${source}:${id}`
  const direct = directRelationshipEvidence(input, sourceId)
  const updates = applicantUpdateEvidence(input, sourceId)
  if (!direct.length && source === 'profile') {
    direct.push(evidence(`${sourceId}:profile`, `${name} is recorded in the applicant's reusable recommender context.`, 'direct_observation', 'personally_observed', 'medium'))
  }
  if (!direct.length && source === 'gmail') {
    direct.push(evidence(`${sourceId}:thread`, `A prior Gmail thread identifies ${name} in the recommendation context.`, 'direct_observation', 'personally_observed', 'medium'))
  }
  const relevance = stringArray(input.relevanceToProgramme ?? input.relevance_to_programme ?? input.researchAreas ?? input.specialty, 500)
  const sourceType = candidateSourceKind(source)
  return {
    id,
    name,
    email,
    currentTitle: text(input.currentTitle ?? input.current_title ?? input.title, 300) || null,
    institution,
    department: text(input.department, 300) || null,
    relationshipType: relationship,
    relationshipStrength: Math.max(0, Math.min(1, Number(input.relationshipStrength ?? input.relationship_strength ?? (direct.length ? 0.8 : 0.45)) || 0)),
    exactContextOfRelationship: inferredRelationshipContext(input),
    relationshipEvidence: [...direct, ...updates],
    relevanceToProgramme: relevance,
    eligibility: input.eligibility === 'ineligible' ? 'ineligible' : input.eligibility === 'eligible' ? 'eligible' : 'unknown',
    eligibilityReasons: stringArray(input.eligibilityReasons ?? input.eligibility_reasons, 500),
    availability: input.availability === 'unavailable' ? 'unavailable' : input.availability === 'available' ? 'available' : 'unknown',
    verifiedContactSource: sourceType,
    contactVerificationStatus: contactVerification(email, source),
    recommendedProgrammes: stringArray(input.recommendedProgrammes ?? input.recommended_programmes, 500),
    fitScore: 0,
    rankingReasons: [],
    portfolioRole: 'unassigned',
    sourceIds: [...new Set([sourceId, ...sourceIds(input)])],
  }
}

function mergeCandidates(values: RecommenderCandidate[]) {
  const merged = new Map<string, RecommenderCandidate>()
  for (const value of values) {
    const key = value.email ?? `${value.name.toLocaleLowerCase()}|${value.institution?.toLocaleLowerCase() ?? ''}`
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, value)
      continue
    }
    const relationshipEvidence = [...previous.relationshipEvidence, ...value.relationshipEvidence]
      .filter((item, index, items) => items.findIndex(other => other.text === item.text && other.sourceKind === item.sourceKind) === index)
    merged.set(key, {
      ...previous,
      email: previous.email ?? value.email,
      currentTitle: previous.currentTitle ?? value.currentTitle,
      institution: previous.institution ?? value.institution,
      department: previous.department ?? value.department,
      exactContextOfRelationship: previous.exactContextOfRelationship || value.exactContextOfRelationship,
      relationshipEvidence,
      relevanceToProgramme: [...new Set([...previous.relevanceToProgramme, ...value.relevanceToProgramme])],
      sourceIds: [...new Set([...previous.sourceIds, ...value.sourceIds])],
      verifiedContactSource: previous.verifiedContactSource === 'none' ? value.verifiedContactSource : previous.verifiedContactSource,
      contactVerificationStatus: previous.contactVerificationStatus === 'missing' ? value.contactVerificationStatus : previous.contactVerificationStatus,
      eligibility: previous.eligibility === 'unknown' ? value.eligibility : previous.eligibility,
    })
  }
  return [...merged.values()]
}

/** Reconstructs the relationship without turning later applicant updates into personal observations. */
export function reconstructRelationshipEvidence(input: {
  candidate: Pick<RecommenderCandidate, 'id' | 'name'>
  directObservations?: Array<{ text: string; sourceId: string; observedAt?: string | null }>
  applicantUpdates?: Array<{ text: string; sourceId: string; observedAt?: string | null }>
}) {
  const direct = (input.directObservations ?? []).filter(item => text(item.text)).map((item, index) => ({
    id: `${input.candidate.id}:direct:${index + 1}`,
    text: text(item.text, 2_000),
    sourceId: text(item.sourceId, 240),
    sourceKind: 'direct_observation' as const,
    observedBoundary: 'personally_observed' as const,
    confidence: 'high' as const,
    observedAt: item.observedAt ?? null,
  }))
  const updates = (input.applicantUpdates ?? []).filter(item => text(item.text)).map((item, index) => ({
    id: `${input.candidate.id}:update:${index + 1}`,
    text: text(item.text, 2_000),
    sourceId: text(item.sourceId, 240),
    sourceKind: 'applicant_update' as const,
    observedBoundary: 'reported_after_relationship' as const,
    confidence: 'medium' as const,
    observedAt: item.observedAt ?? null,
  }))
  return [...direct, ...updates]
}

/**
 * Discover candidates across all durable and provider-backed context supplied
 * to the controller. This function never contacts anyone and never assumes a
 * name in an email is a verified address.
 */
export function discoverRecommenderCandidates(input: {
  profile?: unknown
  applicationContext?: unknown
  uploadedDocuments?: unknown[]
  gmailMessages?: unknown[]
  contacts?: unknown[]
  previousApplications?: unknown[]
  existingCandidates?: unknown[]
}) {
  const candidates: RecommenderCandidate[] = []
  const profile = record(input.profile)
  for (const key of ['referees', 'professors', 'recommenders']) {
    const values = Array.isArray(profile[key]) ? profile[key] : []
    values.forEach((value, index) => {
      const candidate = candidateFromRecord(unwrap(value), 'profile', index)
      if (candidate) candidates.push(candidate)
    })
  }
  const education = Array.isArray(profile.education) ? profile.education : []
  education.forEach((value, index) => {
    const educationRecord = record(unwrap(value))
    const instructors = Array.isArray(educationRecord.professors) ? educationRecord.professors : []
    instructors.forEach((item, instructorIndex) => {
      const candidate = candidateFromRecord({ ...record(unwrap(item)), relationshipType: record(unwrap(item)).relationshipType ?? 'course_instructor', institution: record(unwrap(item)).institution ?? educationRecord.institution }, 'profile', index + instructorIndex + 1)
      if (candidate) candidates.push(candidate)
    })
  })
  for (const [index, value] of (input.contacts ?? []).entries()) {
    const candidate = candidateFromRecord(value, 'contacts', index)
    if (candidate) candidates.push(candidate)
  }
  for (const [index, value] of (input.existingCandidates ?? []).entries()) {
    const candidate = candidateFromRecord(value, 'profile', index + 100)
    if (candidate) candidates.push(candidate)
  }
  for (const [index, value] of (input.gmailMessages ?? []).entries()) {
    const message = record(value)
    const body = text(message.body ?? message.body_text ?? message.snippet, 4_000)
    const haystack = `${text(message.subject, 500)} ${body}`.toLocaleLowerCase()
    if (!/recommend|reference|referee|letter|supervisor|thesis/.test(haystack)) continue
    const from = record(message.from)
    const candidate = candidateFromRecord({
      name: text(from.name ?? message.from_name ?? message.senderName, 240) || text(message.from, 320).split('<')[0],
      email: normalizedEmail(from.email ?? message.from_email ?? message.from),
      relationshipType: /thesis|research/.test(haystack) ? 'research_supervisor' : 'professor',
      relationshipContext: `Prior Gmail thread: ${text(message.subject, 500)}`,
      directObservations: [`The applicant and ${text(from.name ?? message.from_name ?? 'this contact', 240)} have a prior Gmail thread about recommendation context.`],
      sourceIds: [text(message.id ?? message.message_id ?? message.thread_id, 240)],
    }, 'gmail', index)
    if (candidate) candidates.push(candidate)
  }
  for (const [index, value] of (input.previousApplications ?? []).entries()) {
    const application = record(value)
    const referees = Array.isArray(application.referees ?? application.recommenders) ? (application.referees ?? application.recommenders) as unknown[] : []
    referees.forEach((referee, refereeIndex) => {
      const candidate = candidateFromRecord({ ...record(unwrap(referee)), applicantUpdates: stringArray(record(unwrap(referee)).applicantUpdates ?? application.updates, 2_000) }, 'previous_application', index + refereeIndex)
      if (candidate) candidates.push(candidate)
    })
  }
  for (const [index, value] of (input.applicationContext ? [input.applicationContext] : []).entries()) {
    const context = record(value)
    const referees = Array.isArray(context.referees ?? context.recommenders) ? (context.referees ?? context.recommenders) as unknown[] : []
    referees.forEach((referee, refereeIndex) => {
      const candidate = candidateFromRecord(unwrap(referee), 'application_context', index + refereeIndex)
      if (candidate) candidates.push(candidate)
    })
  }
  for (const [index, value] of (input.uploadedDocuments ?? []).entries()) {
    const document = record(value)
    const extracted = Array.isArray(document.recommenders) ? document.recommenders : []
    extracted.forEach((referee, refereeIndex) => {
      const candidate = candidateFromRecord(unwrap(referee), 'uploaded_document', index + refereeIndex)
      if (candidate) candidates.push(candidate)
    })
  }
  return mergeCandidates(candidates)
}

function requirementField<T>(value: unknown, evidence: RecommendationSourceEvidence[], fieldName: string, fallback: T | null = null): RecommendationField<T> {
  const input = record(value)
  const resolved = Object.prototype.hasOwnProperty.call(input, 'value') ? input.value : value
  const ids = sourceIds(value).filter(id => evidence.some(item => item.id === id || item.url === id))
  const actual = resolved === undefined ? fallback : resolved as T | null
  return { value: actual, sourceEvidenceIds: ids, verified: actual !== null && ids.length > 0, note: ids.length ? null : `${fieldName} is not yet backed by a retrieved source.` }
}

function normalizeSourceEvidence(value: unknown, index: number): RecommendationSourceEvidence | null {
  const input = record(value)
  const url = text(input.url ?? input.sourceUrl ?? input.source_url, 2_000) || null
  const excerpt = text(input.excerpt ?? input.quote ?? input.text, 4_000)
  const id = text(input.id ?? url, 240) || `recommendation-source-${index + 1}`
  if (!excerpt && !url) return null
  const authority = ['official', 'government', 'provider', 'applicant', 'uploaded_document', 'generated'].includes(text(input.authority, 80))
    ? text(input.authority, 80) as RecommendationSourceEvidence['authority']
    : text(input.sourceType, 80) === 'official' ? 'official' : 'applicant'
  return {
    id,
    url,
    authority,
    excerpt: excerpt || `Source retrieved from ${url ?? id}.`,
    claims: stringArray(input.claims, 1_000),
    retrievedAt: text(input.retrievedAt ?? input.retrieved_at, 80) || now(),
    sourceType: text(input.sourceType, 80) || undefined,
  }
}

function officialSourceEvidence(evidence: RecommendationSourceEvidence[]) {
  return evidence.filter(source => ['official', 'government'].includes(source.authority) && Boolean(source.excerpt.trim()))
}

function wordNumber(value: string) {
  const normalized = value.toLocaleLowerCase()
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  }
  if (normalized in words) return words[normalized]
  const parsed = Number(normalized)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 20 ? parsed : null
}

function sourcedValue<T>(value: T, source: RecommendationSourceEvidence | null) {
  return source ? { value, sourceIds: [source.id] } : value
}

/**
 * Official programme pages routinely state the few facts needed to start a
 * recommendation plan in prose rather than in a structured application API.
 * Pull only direct, low-ambiguity claims out of those saved public snapshots.
 * Everything else remains explicitly unknown; this is not a substitute for
 * applicant evidence or a claim that a referee has agreed to help.
 */
function inferRecommendationRequirementsFromSources(input: {
  opportunity: Record<string, unknown>
  evidence: RecommendationSourceEvidence[]
}) {
  const sources = officialSourceEvidence(input.evidence)
  const first = sources[0] ?? null
  const sourceMatching = (pattern: RegExp) => sources.find(source => pattern.test(source.excerpt)) ?? null
  const inferred: Record<string, unknown> = {}
  const programme = text(input.opportunity.programme ?? input.opportunity.programmeTitle ?? input.opportunity.programme_title, 500)
  const institution = text(input.opportunity.institution, 500)
  if (programme && first) inferred.programme = sourcedValue(programme, first)
  if (institution && first) inferred.institution = sourcedValue(institution, first)

  const countSource = sourceMatching(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:(?:academic|professional|confidential|strong)\s+){0,3}(?:letters?\s+(?:of\s+)?(?:recommendation|reference)|recommendation\s+letters?|references?)\b/i)
  const countMatch = countSource?.excerpt.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:(?:academic|professional|confidential|strong)\s+){0,3}(?:letters?\s+(?:of\s+)?(?:recommendation|reference)|recommendation\s+letters?|references?)\b/i)
  const count = countMatch ? wordNumber(countMatch[1] ?? '') : null
  if (count && countSource) inferred.recommendationCount = sourcedValue(count, countSource)

  const submissionSource = sourceMatching(/(?:letters?\s+(?:of\s+)?(?:recommendation|reference)|recommendation\s+letters?|references?).{0,240}\b(?:submit(?:ted)?|upload(?:ed)?|provide(?:d)?|enter(?:ed)?|complete(?:d)?)\b.{0,160}\b(?:online|application|portal|system|electronic|slate)\b|(?:applicant|you).{0,180}\b(?:enter|provide|add)\b.{0,160}\b(?:recommender|referee)\b.{0,160}\b(?:email|portal|application|system|invitation)\b/i)
  if (submissionSource) {
    const sourceText = submissionSource.excerpt
    const submissionMethod = /\b(?:enter|provide|add)\b.{0,160}\b(?:recommender|referee)\b.{0,160}\b(?:email|portal|application|system|invitation)\b/i.test(sourceText)
      ? 'Enter each recommender in the application system.'
      : /\bportal\b/i.test(sourceText)
        ? 'Submit through the application portal.'
        : 'Submit through the online application.'
    inferred.submissionMethod = sourcedValue(submissionMethod, submissionSource)
  }

  const invitationSource = sourceMatching(/\b(?:recommender|referee).{0,180}\b(?:invitation|invited|email(?:ed)?)\b|\b(?:invitation|invited)\b.{0,180}\b(?:recommender|referee)\b/i)
  if (invitationSource) inferred.portalInvitationFlow = sourcedValue('The programme sends the recommender an invitation after their details are entered.', invitationSource)

  const formatSource = sourceMatching(/\b(?:pdf|docx?|word document|online form|electronic form)\b/i)
  if (formatSource) {
    const match = formatSource.excerpt.match(/\b(?:pdf|docx?|word document|online form|electronic form)\b/i)
    if (match) inferred.format = sourcedValue(match[0]!.toUpperCase() === 'PDF' ? 'PDF' : match[0]!, formatSource)
  }
  const languageSource = sourceMatching(/\b(?:letters?|recommendations?|references?).{0,120}\b(?:english|English)\b/i)
  if (languageSource) inferred.language = sourcedValue('English', languageSource)
  const lengthSource = sourceMatching(/\b(?:letters?|recommendations?|references?).{0,120}\b(?:maximum|limit(?:ed)? to|no more than)\s+\d+\s+(?:page|pages|word|words)\b/i)
  if (lengthSource) {
    const match = lengthSource.excerpt.match(/\b(?:maximum|limit(?:ed)? to|no more than)\s+\d+\s+(?:page|pages|word|words)\b/i)
    if (match) inferred.letterLength = sourcedValue(match[0]!, lengthSource)
  }
  return inferred
}

/** Extract requirements while retaining an explicit unresolved list for every unverified field. */
export function extractRecommendationRequirements(input: {
  raw?: unknown
  opportunity?: unknown
  sourceEvidence?: unknown[]
  retrievedAt?: string
}): RecommendationProgrammeRequirements {
  const raw = record(input.raw)
  const opportunity = record(input.opportunity)
  const initialData = { ...opportunity, ...raw }
  const evidence = [...(input.sourceEvidence ?? []), ...(Array.isArray(initialData.sourceEvidence) ? initialData.sourceEvidence : []), ...(Array.isArray(initialData.citations) ? initialData.citations : [])]
    .map(normalizeSourceEvidence)
    .filter((item): item is RecommendationSourceEvidence => Boolean(item))
    // Different saved excerpts can legitimately come from the same programme
    // URL: a short opportunity citation establishes provenance while a later
    // browser snapshot contains the actual recommendation instructions. Keep
    // both when their durable source ids differ, otherwise the richer snapshot
    // could be discarded before its direct claims are evaluated.
    .filter((item, index, items) => items.findIndex(other => other.id === item.id) === index)
  // Structured facts supplied by a verified source win. When a programme page
  // only exposes prose, the narrow source parser above supplies the minimal
  // operational fields without inventing any applicant-specific details.
  const inferred = inferRecommendationRequirementsFromSources({ opportunity, evidence })
  const data = { ...opportunity, ...inferred, ...raw }
  const countValue = data.recommendationCount ?? data.recommendation_count ?? (data.recommendations && record(data.recommendations).count)
  const deadlineValue = data.refereeDeadline ?? data.referee_deadline ?? data.recommendationDeadline ?? data.recommendation_deadline
  const requirements: RecommendationProgrammeRequirements = {
    programme: requirementField(data.programme ?? data.programmeTitle ?? data.programme_title, evidence, 'programme'),
    institution: requirementField(data.institution, evidence, 'institution'),
    recommendationCount: requirementField<number>(countValue, evidence, 'recommendationCount'),
    requiredRefereeTypes: requirementField<string[]>(data.requiredRefereeTypes ?? data.required_referee_types, evidence, 'requiredRefereeTypes', []),
    submissionMethod: requirementField(data.submissionMethod ?? data.submission_method, evidence, 'submissionMethod'),
    refereeDeadline: requirementField<{ dateTime: string; timezone: string }>(deadlineValue, evidence, 'refereeDeadline'),
    portalInvitationFlow: requirementField(data.portalInvitationFlow ?? data.portal_invitation_flow, evidence, 'portalInvitationFlow'),
    letterLength: requirementField(data.letterLength ?? data.letter_length, evidence, 'letterLength'),
    format: requirementField(data.format ?? data.letterFormat ?? data.letter_format, evidence, 'format'),
    template: requirementField(data.template ?? data.letterTemplate ?? data.letter_template, evidence, 'template'),
    language: requirementField(data.language ?? data.letterLanguage ?? data.letter_language, evidence, 'language'),
    relationshipRestrictions: requirementField<string[]>(data.relationshipRestrictions ?? data.relationship_restrictions, evidence, 'relationshipRestrictions', []),
    specialPrompts: requirementField<string[]>(data.specialPrompts ?? data.special_prompts, evidence, 'specialPrompts', []),
    contactVerification: requirementField<string[]>(data.contactVerification ?? data.contact_verification, evidence, 'contactVerification', []),
    fallbackRules: requirementField<string[]>(data.fallbackRules ?? data.fallback_rules, evidence, 'fallbackRules', []),
    sourceEvidence: evidence,
    unresolvedFields: [],
    extractedAt: text(input.retrievedAt, 80) || now(),
    sourceBacked: false,
  }
  const fields = Object.entries(requirements).filter(([key]) => !['sourceEvidence', 'unresolvedFields', 'extractedAt', 'sourceBacked'].includes(key))
  requirements.unresolvedFields = fields.filter(([, value]) => {
    const field = value as RecommendationField<unknown>
    return field.value === null || (field.value !== null && !field.verified && !(['requiredRefereeTypes', 'relationshipRestrictions', 'specialPrompts', 'contactVerification', 'fallbackRules'].includes(fieldNameFromEntry(value, fields))))
  }).map(([key]) => key)
  // Schools often publish no letter-length, language, invitation-flow, or
  // separate referee-deadline rule. Those omissions stay visible as unknown
  // and are checked again in the portal, but must not force the applicant to
  // chase down extra programme material before we can responsibly identify and
  // prepare recommenders. The core gate is limited to facts an official page
  // must actually establish to start that preparation.
  const criticalFields = new Set(['programme', 'institution', 'recommendationCount', 'submissionMethod'])
  requirements.sourceBacked = requirements.sourceEvidence.length > 0 && fields.every(([key, value]) => {
    const field = value as RecommendationField<unknown>
    return !criticalFields.has(key) || (field.value !== null && field.verified)
  })
  return requirements
}

// Object.entries loses the key after a narrow; keep this helper deliberately
// boring so the source-backed test remains easy to audit.
function fieldNameFromEntry(value: unknown, fields: Array<[string, unknown]>) {
  return fields.find(([, candidate]) => candidate === value)?.[0] ?? ''
}

function relevanceScore(candidate: RecommenderCandidate, programme: string, requirements: RecommendationProgrammeRequirements | null) {
  const programmeText = programme.toLocaleLowerCase()
  const relevanceHits = candidate.relevanceToProgramme.filter(item => programmeText.includes(item.toLocaleLowerCase()) || item.toLocaleLowerCase().includes(programmeText)).length
  const directCount = candidate.relationshipEvidence.filter(item => item.sourceKind === 'direct_observation').length
  const observedStrength = Math.min(1, candidate.relationshipStrength)
  const eligibilityScore = candidate.eligibility === 'eligible' ? 1 : candidate.eligibility === 'unknown' ? 0.55 : 0
  const contactScore = candidate.contactVerificationStatus === 'verified' ? 1 : candidate.contactVerificationStatus === 'needs_verification' ? 0.45 : 0
  const relationshipScore = observedStrength * 0.55 + Math.min(1, directCount / 3) * 0.45
  const topicalScore = Math.min(1, (relevanceHits + candidate.relevanceToProgramme.length * 0.25) / 2)
  const requirementMatch = requirements?.requiredRefereeTypes.value?.some(type => type.toLocaleLowerCase().includes(candidate.relationshipType.replaceAll('_', ' '))) ? 1 : 0.45
  const score = Math.round((relationshipScore * 0.30 + topicalScore * 0.22 + eligibilityScore * 0.16 + contactScore * 0.12 + requirementMatch * 0.10 + 0.10) * 100)
  return { score, directCount, relevanceHits }
}

/** Rank by observed relationship and programme fit; title prestige is intentionally only a tie-breaker. */
export function rankRecommenderCandidates(input: {
  candidates: RecommenderCandidate[]
  programme: string
  requirements?: RecommendationProgrammeRequirements | null
}) {
  return input.candidates
    .filter(candidate => candidate.eligibility !== 'ineligible')
    .map(candidate => {
      const result = relevanceScore(candidate, input.programme, input.requirements ?? null)
      const reasons = [
        result.directCount ? `${result.directCount} directly observed relationship signal${result.directCount === 1 ? '' : 's'}` : 'relationship evidence needs strengthening',
        result.relevanceHits ? `${result.relevanceHits} programme relevance match${result.relevanceHits === 1 ? '' : 'es'}` : 'programme relevance is not yet explicit',
        candidate.contactVerificationStatus === 'verified' ? 'contact is backed by a provider or profile source' : 'contact verification is still required',
      ]
      return { ...candidate, fitScore: result.score, rankingReasons: reasons }
    })
    .sort((left, right) => right.fitScore - left.fitScore || right.relationshipStrength - left.relationshipStrength || left.name.localeCompare(right.name))
}

export function createRecommendationPortfolioStrategy(input: {
  rankedCandidates: RecommenderCandidate[]
  programmes: RecommendationRequestProgramme[]
  recommendationCount?: number | null
  preferredCandidateIds?: string[]
}) {
  const count = Math.max(1, Math.min(5, Math.round(input.recommendationCount ?? (input.programmes.length || 1))))
  const eligible = input.rankedCandidates.filter(candidate => candidate.eligibility !== 'ineligible')
  const selected: RecommenderCandidate[] = []
  const relationshipTypes = new Set<string>()
  const preferredIds = new Set(input.preferredCandidateIds ?? [])
  const ordered = preferredIds.size
    ? [...eligible.filter(candidate => preferredIds.has(candidate.id)), ...eligible.filter(candidate => !preferredIds.has(candidate.id))]
    : eligible
  for (const candidate of ordered) {
    if (selected.length >= count) break
    if (!selected.length || !relationshipTypes.has(candidate.relationshipType) || selected.length + 1 >= count) {
      selected.push(candidate)
      relationshipTypes.add(candidate.relationshipType)
    }
  }
  const backups = eligible.filter(candidate => !selected.some(item => item.id === candidate.id)).slice(0, Math.max(1, count))
  const assignments = input.programmes.map((programme, index) => {
    const primary = selected[index % Math.max(1, selected.length)]
    const additional = selected.length > 1 && index % 2 === 1 ? selected.filter(candidate => candidate.id !== primary?.id).slice(0, 1) : []
    return {
      programme: programme.title,
      candidateIds: primary ? [primary.id, ...additional.map(candidate => candidate.id)] : [],
      rationale: primary ? `Uses ${primary.name}'s ${primary.relationshipType.replaceAll('_', ' ')} perspective for ${programme.title}.` : 'A verified recommender is still required.',
    }
  })
  const complementaryCoverage = [...new Set(selected.map(candidate => candidate.relationshipType.replaceAll('_', ' ')))]
  const strategy: RecommendationPortfolioStrategy = {
    recommendationCount: count,
    selectedCandidateIds: selected.map(candidate => candidate.id),
    backupCandidateIds: backups.map(candidate => candidate.id),
    programmeAssignments: assignments,
    complementaryCoverage,
    titlePrestigeWeight: 0.05,
    directEvidenceWeight: 0.30,
    recommendation: selected.length
      ? `Prefer ${selected.map(candidate => candidate.name).join(', ')} because the portfolio maximizes observed relationship evidence and complementary programme coverage.`
      : 'No eligible recommender is ready for selection.',
    approvalRequired: true,
  }
  const selectedIds = new Set(strategy.selectedCandidateIds)
  const backupIds = new Set(strategy.backupCandidateIds)
  return {
    strategy,
    candidates: input.rankedCandidates.map(candidate => ({
      ...candidate,
      portfolioRole: selectedIds.has(candidate.id) ? 'primary' as const : backupIds.has(candidate.id) ? 'backup' as const : 'unassigned' as const,
    })),
  }
}

function interactionBase(input: Omit<RecommendationInteractionBase, 'priority'> & { kind: RecommendationInteractionKind }): RecommendationInteractionBase {
  return { ...input, priority: recommendationInteractionPriority[input.kind] }
}

export function createRecommendationInteraction(input: {
  kind: RecommendationInteractionKind
  id: string
  requirementId: string
  question: string
  reason: string
  knownContext?: string[]
  reusableContextKeys?: string[]
  required?: boolean
  options?: RecommendationInteractionOption[]
  field?: string
  currentValue?: string | number | boolean | null
  placeholder?: string
  approvalScope?: RecommendationApprovalScope
  mapsToRequirement?: string
  timezone?: string
  acceptedMimeTypes?: string[]
  attachmentPrompt?: string
}): RecommendationInteraction {
  const base = interactionBase({
    id: input.id,
    requirementId: input.requirementId,
    question: text(input.question, 500),
    reason: text(input.reason, 1_000),
    knownContext: input.knownContext ?? [],
    reusableContextKeys: input.reusableContextKeys ?? [],
    required: input.required !== false,
    mapsToRequirement: input.mapsToRequirement ?? input.requirementId,
    kind: input.kind,
  })
  if (input.kind === 'approval' || input.kind === 'confirmation') return { ...base, kind: input.kind, approvalScope: input.approvalScope ?? 'recommendation_request', confirmLabel: 'Approve and continue', cancelLabel: 'Not now' }
  if (input.kind === 'single_choice' || input.kind === 'contact_select' || input.kind === 'attachment_selection') return { ...base, kind: input.kind, options: input.options ?? [], allowOther: false }
  if (input.kind === 'multiple_choice') return { ...base, kind: input.kind, options: input.options ?? [], minSelections: 1, maxSelections: (input.options ?? []).length }
  if (input.kind === 'email') return { ...base, kind: input.kind, placeholder: input.placeholder ?? 'name@example.edu', currentValue: typeof input.currentValue === 'string' ? input.currentValue : null, verified: false }
  if (input.kind === 'attachment_request') return { ...base, kind: input.kind, acceptedMimeTypes: input.acceptedMimeTypes ?? ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], minimumFiles: 1, maximumFiles: 10, attachmentPrompt: input.attachmentPrompt ?? 'Add the document that resolves this requirement.' }
  if (input.kind === 'date') return { ...base, kind: input.kind, timezone: input.timezone ?? 'UTC', currentValue: typeof input.currentValue === 'string' ? input.currentValue : null, minimumDate: null }
  if (input.kind === 'fact') return { ...base, kind: input.kind, field: input.field ?? input.requirementId, currentValue: input.currentValue ?? null, inputType: 'text' }
  return { ...base, kind: input.kind, placeholder: input.placeholder ?? 'Add the missing detail', currentValue: typeof input.currentValue === 'string' ? input.currentValue : null, maximumCharacters: 600 }
}

function validAnswerForInteraction(interaction: RecommendationInteraction, value: RecommendationInteractionResponse['value']) {
  if (interaction.kind === 'approval' || interaction.kind === 'confirmation') return value === true || value === 'approve' || value === 'confirm'
  if (interaction.kind === 'single_choice' || interaction.kind === 'contact_select' || interaction.kind === 'attachment_selection') return typeof value === 'string' && interaction.options.some(option => option.value === value && !option.disabled)
  if (interaction.kind === 'multiple_choice') return Array.isArray(value) && value.length >= interaction.minSelections && value.length <= interaction.maxSelections && value.every(item => typeof item === 'string' && interaction.options.some(option => option.value === item && !option.disabled))
  if (interaction.kind === 'email') return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  if (interaction.kind === 'attachment_request') return Array.isArray(value) && value.length >= interaction.minimumFiles && value.length <= interaction.maximumFiles && value.every(item => typeof item === 'string' && item.trim().length > 0)
  if (interaction.kind === 'date') return typeof value === 'string' && Number.isFinite(Date.parse(value))
  if (interaction.kind === 'fact') return value !== null && value !== undefined && (typeof value === 'string' ? value.trim().length > 0 : true)
  return (interaction.kind === 'short_text' || interaction.kind === 'correction') && typeof value === 'string' && value.trim().length > 0 && value.trim().length <= interaction.maximumCharacters
}

/** Validate, persist in the deterministic context, and return a reusable fact only when consent exists. */
export function applyRecommendationInteraction(input: {
  context: RecommendationContextResolution
  interaction: RecommendationInteraction
  value: RecommendationInteractionResponse['value']
  reusableContextConsent?: boolean
  submittedAt?: string
}) {
  const valid = validAnswerForInteraction(input.interaction, input.value)
  const metric: RecommendationInteractionMetric = {
    interactionId: input.interaction.id,
    kind: input.interaction.kind,
    requirementId: input.interaction.requirementId,
    outcome: valid ? 'answered' : 'invalid',
    autoResolvedBeforeQuestion: false,
    resumedAutomatically: valid,
    answerCount: 1,
    createdAt: input.submittedAt ?? now(),
  }
  if (!valid) return { accepted: false, context: input.context, metric, response: null }
  const key = input.interaction.reusableContextKeys[0] ?? input.interaction.mapsToRequirement
  const value = Array.isArray(input.value) ? input.value.join(', ') : String(input.value)
  const reusable = input.reusableContextConsent === true && input.interaction.reusableContextKeys.length > 0
  const autoResolvedFacts = [...input.context.autoResolvedFacts, { key, value, sourceIds: [`interaction:${input.interaction.id}`], confidence: 'high' as const }]
  const reusableContext = reusable ? { ...input.context.reusableContext, [key]: value } : input.context.reusableContext
  const unresolved = input.context.unresolved.filter(item => item !== input.interaction.mapsToRequirement && item !== key)
  const response: RecommendationInteractionResponse = {
    interactionId: input.interaction.id,
    kind: input.interaction.kind,
    value: input.value,
    submittedAt: input.submittedAt ?? now(),
    reusable,
  }
  return {
    accepted: true,
    context: { ...input.context, autoResolvedFacts, reusableContext, unresolved, nextInteraction: null },
    metric,
    response,
  }
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || value.trim()
}

function formalGreetingName(value: string) {
  const name = text(value, 240)
  return /^(?:prof(?:essor)?|dr|doctor|lecturer|director|manager)\.?\s/i.test(name) ? name : firstName(name)
}

function htmlEscape(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function textToHtml(value: string) {
  return value.split(/\n\n+/).map(paragraph => {
    const escaped = htmlEscape(paragraph).replaceAll('\n', '<br>')
    return `<p>${escaped}</p>`
  }).join('')
}

function relationshipSalutation(candidate: RecommendationRequestEmailInput['recommender']) {
  const title = text(candidate.currentTitle, 300)
  const name = text(candidate.name, 240)
  if (/(?:^|\s)(?:prof(?:essor)?|dr|doctor|lecturer|director|manager)\.?(?:\s|$)/i.test(name)) return name
  if (title && /professor|dr\.?|doctor|lecturer|director|manager/i.test(title)) return `${title} ${name}`
  return name
}

/** The only supported generator for recommendation-request email text and HTML. */
export function generateRecommendationRequestEmail(input: RecommendationRequestEmailInput): RecommendationRequestEmail {
  const name = text(input.applicantName, 240) || 'the applicant'
  const recommenderName = text(input.recommender.name, 240)
  const programmes = input.programmes.filter(programme => text(programme.title))
  const deadline = programmes.map(programme => programme.deadline).filter(Boolean).sort()[0] ?? null
  const tone = input.tone ?? (input.recommender.relationshipType === 'thesis_supervisor' || input.recommender.relationshipType === 'research_supervisor' ? 'recent_supervisor' : 'professional')
  const relationship = (text(input.recommender.exactContextOfRelationship, 1_500).replace(/[.]+$/, '') || 'our previous academic or professional work together')
  const directEvidence = input.relationshipEvidence.filter(item => item.sourceKind === 'direct_observation').map(item => item.text).slice(0, 2)
  const evidenceLine = directEvidence.length ? `I especially value your perspective because ${directEvidence.join(' and ').replace(/[.]+$/, '')}.` : ''
  const programmeLines = programmes.map(programme => `• ${programme.title} at ${programme.institution}${programme.deadline ? ` — recommender deadline ${programme.deadline}` : ''}`).join('\n')
  const programmeCount = programmes.length
  const opening = tone === 'older_supervisor'
    ? `I hope you have been well. I am preparing a graduate application and wanted to ask whether you would feel comfortable supporting me based on our earlier work together.`
    : tone === 'recent_supervisor'
      ? `I hope you are well. I am preparing a graduate application and would be grateful for your perspective on the work we have recently done together.`
      : `I hope you are well. I am preparing a graduate application and wanted to ask whether you would be willing to support my application.`
  const supportLine = input.supportPackAvailable
    ? 'I will send a concise support pack with my CV, programme details, deadlines, relationship reminders, and a grounded evidence bank so that the request is easy to assess.'
    : 'I can send my CV, programme details, deadlines, and a short evidence summary if that would be useful.'
  const bodyText = [
    `Dear ${relationshipSalutation(input.recommender)},`,
    opening,
    `I am applying to ${programmeCount === 1 ? 'the following programme' : `${programmeCount} programmes`}:\n${programmeLines}`,
    `Would you be willing to provide a strong recommendation letter for these applications? ${text(input.reason, 1_500) || `Your assessment would help the committee understand my preparation and potential for ${text(input.applicantGoal, 500) || 'advanced study'}.`}`,
    relationship ? `Our relationship was ${relationship}.` : '',
    evidenceLine,
    supportLine,
    deadline ? `The earliest verified recommender deadline is ${deadline}. If that timing is difficult, please feel free to tell me; I can adjust the portfolio or contact a backup recommender promptly.` : 'If you are open to this, I will confirm the exact portal invitation steps and timing with you before anything is due.',
    `Thank you for considering this request. Please feel free to decline if you are not able to write a strong letter; I would rather know early enough to make a responsible alternative plan.`,
    `Best regards,\n${name}${input.applicantEmail ? `\n${text(input.applicantEmail, 320)}` : ''}`,
  ].filter(Boolean).join('\n\n')
  return {
    generatedBy: RECOMMENDATION_WORKFLOW_VERSION,
    to: normalizedEmail(input.recommender.email),
    subject: `Recommendation request — ${programmes[0]?.title ?? 'graduate application'}${programmeCount > 1 ? ` and ${programmeCount - 1} other programme${programmeCount === 2 ? '' : 's'}` : ''}`,
    bodyText,
    bodyHtml: textToHtml(bodyText),
    metadata: {
      applicantName: name,
      recommenderName,
      relationshipType: input.recommender.relationshipType,
      relationshipContext: relationship,
      programmeCount,
      deadline,
      strongRecommendationRequested: true,
      supportPackMentioned: Boolean(input.supportPackAvailable),
      tone,
    },
  }
}

function simpleEmail(subject: string, bodyText: string, to: string | null): RecommendationRequestEmail {
  return {
    generatedBy: RECOMMENDATION_WORKFLOW_VERSION,
    to,
    subject,
    bodyText,
    bodyHtml: textToHtml(bodyText),
    metadata: {
      applicantName: '',
      recommenderName: '',
      relationshipType: 'other',
      relationshipContext: '',
      programmeCount: 0,
      deadline: null,
      strongRecommendationRequested: true,
      supportPackMentioned: false,
      tone: 'professional',
    },
  }
}

export function generateRecommendationAcceptanceFollowUpEmail(input: { applicantName: string; recommender: Pick<RecommenderCandidate, 'name' | 'email'>; supportPackUrl?: string | null; deadline?: string | null }) {
  const body = `Dear ${formalGreetingName(input.recommender.name)},\n\nThank you for agreeing to support my application. I have prepared the materials and will send the programme invitation details and verified deadline${input.deadline ? ` (${input.deadline})` : ''} in the same thread. Please tell me if anything would make the request easier to complete.\n\nBest regards,\n${input.applicantName}`
  return simpleEmail('Thank you — recommendation materials and next steps', body, normalizedEmail(input.recommender.email))
}

export function generateRecommendationDeadlineReminderEmail(input: { applicantName: string; recommender: Pick<RecommenderCandidate, 'name' | 'email'>; programme: string; deadline: string; daysRemaining: number }) {
  const body = `Dear ${formalGreetingName(input.recommender.name)},\n\nA gentle reminder that the recommendation for ${input.programme} is due by ${input.deadline} (${input.daysRemaining} day${input.daysRemaining === 1 ? '' : 's'} remaining). Please let me know if the timing has become difficult; I can adjust the plan responsibly.\n\nThank you again,\n${input.applicantName}`
  return simpleEmail(`Gentle reminder — ${input.programme} recommendation`, body, normalizedEmail(input.recommender.email))
}

export function generateRecommendationThankYouEmail(input: { applicantName: string; recommender: Pick<RecommenderCandidate, 'name' | 'email'>; programme: string; outcome?: string | null }) {
  const body = `Dear ${formalGreetingName(input.recommender.name)},\n\nThank you for taking the time to support my application to ${input.programme}.${input.outcome ? ` I wanted to share the update that ${input.outcome}.` : ''} I genuinely appreciate your help.\n\nBest regards,\n${input.applicantName}`
  return simpleEmail(`Thank you for your recommendation — ${input.programme}`, body, normalizedEmail(input.recommender.email))
}

/** Build the grounded pack a recommender receives after a positive reply. */
export function buildRecommenderSupportPack(input: {
  id?: string
  candidate: RecommenderCandidate
  programme: RecommendationRequestProgramme
  requirements: RecommendationProgrammeRequirements
  applicantName: string
  applicantGoal: string
  relationshipEvidence?: RelationshipEvidence[]
  directObservedEvidence?: RecommendationEvidenceItem[]
  applicantUpdates?: RecommendationEvidenceItem[]
  emphasis?: string[]
  assetIds?: string[]
}) {
  const relationshipEvidence = input.relationshipEvidence ?? input.candidate.relationshipEvidence
  const direct = (input.directObservedEvidence ?? relationshipEvidence.filter(item => item.sourceKind === 'direct_observation').map(item => ({ claim: item.text, sourceIds: [item.sourceId], sourceKind: item.sourceKind, observedBoundary: item.observedBoundary, provenance: `Direct observation: ${item.sourceId}` })))
  const updates = (input.applicantUpdates ?? relationshipEvidence.filter(item => item.sourceKind === 'applicant_update').map(item => ({ claim: item.text, sourceIds: [item.sourceId], sourceKind: item.sourceKind, observedBoundary: item.observedBoundary, provenance: `Applicant-reported update: ${item.sourceId}` })))
  const materials = [...new Set(input.assetIds ?? [])].map(assetId => ({ assetId, label: assetId === 'graduate_application_cv_v1' ? 'Canonical graduate application CV' : 'Applicant supporting material', purpose: 'Grounded context for the recommendation.' }))
  const requestEmail = generateRecommendationRequestEmail({
    applicantName: input.applicantName,
    recommender: input.candidate,
    programmes: [input.programme],
    relationshipEvidence,
    reason: `Your direct perspective on the applicant's preparation is especially relevant to this programme.`,
    applicantGoal: input.applicantGoal,
    supportPackAvailable: true,
    programmeRequirements: input.requirements,
  })
  const unsupportedClaims = [...direct, ...updates].filter(item => item.sourceIds.length === 0).map(item => item.claim)
  return {
    id: input.id ?? `support-pack:${slug(input.candidate.id)}:${slug(input.programme.title)}`,
    version: RECOMMENDATION_WORKFLOW_VERSION,
    candidate: input.candidate,
    programme: { institution: input.programme.institution, title: input.programme.title, deadline: input.programme.deadline },
    programmeRequirements: input.requirements,
    whatApplicantWants: `A strong recommendation letter for ${input.programme.title}.`,
    applicantGoal: input.applicantGoal,
    relationshipReminders: relationshipEvidence,
    evidenceBank: direct,
    emphasis: input.emphasis ?? ['Use personally observed preparation and work quality.', 'Keep later accomplishments clearly separate from firsthand observations.'],
    updatesSinceRelationship: updates,
    materials,
    requestEmail,
    quality: { grounded: unsupportedClaims.length === 0 && input.requirements.sourceBacked, unsupportedClaims, missingInputs: input.requirements.unresolvedFields },
    createdAt: now(),
  } satisfies RecommenderSupportPack
}

export function buildRecommendationRequirementGraph(input: {
  caseId: string
  requirements: RecommendationProgrammeRequirements
  candidateIds?: string[]
}) {
  const caseId = input.caseId
  const sourceEvidenceIds = input.requirements.sourceEvidence.map(item => item.id)
  const nodes: RecommendationRequirementNode[] = [
    { id: `${caseId}:requirements`, caseId, name: 'Source-backed recommendation requirements', category: 'source', required: true, status: input.requirements.sourceBacked ? 'verified' : 'blocked', dependencyIds: [], sourceEvidenceIds, evidenceContract: ['portal'] },
    { id: `${caseId}:candidate-selection`, caseId, name: 'Recommender candidate strategy', category: 'candidate', required: true, status: 'pending', dependencyIds: [`${caseId}:requirements`], sourceEvidenceIds: [], evidenceContract: ['user_approval'] },
    { id: `${caseId}:contact-verification`, caseId, name: 'Recommender contact verification', category: 'contact', required: true, status: 'pending', dependencyIds: [`${caseId}:candidate-selection`], sourceEvidenceIds: [], evidenceContract: ['contacts', 'gmail'] },
    { id: `${caseId}:request-approval`, caseId, name: 'Recommendation request approval', category: 'communication', required: true, status: 'pending', dependencyIds: [`${caseId}:contact-verification`], sourceEvidenceIds: [], evidenceContract: ['user_approval'] },
    { id: `${caseId}:request-sent`, caseId, name: 'Recommendation request sent', category: 'communication', required: true, status: 'pending', dependencyIds: [`${caseId}:request-approval`], sourceEvidenceIds: [], evidenceContract: ['gmail'] },
    { id: `${caseId}:reply`, caseId, name: 'Recommendation reply classified', category: 'outcome', required: true, status: 'pending', dependencyIds: [`${caseId}:request-sent`], sourceEvidenceIds: [], evidenceContract: ['gmail'] },
    { id: `${caseId}:support-pack`, caseId, name: 'Grounded recommender support pack', category: 'support_pack', required: false, status: 'pending', dependencyIds: [`${caseId}:reply`], sourceEvidenceIds: [], evidenceContract: ['artifact'] },
    { id: `${caseId}:portal`, caseId, name: 'Portal registration and invitation', category: 'portal', required: false, status: 'pending', dependencyIds: [`${caseId}:reply`, `${caseId}:support-pack`], sourceEvidenceIds: [], evidenceContract: ['portal', 'gmail'] },
    { id: `${caseId}:submission`, caseId, name: 'Recommendation submitted evidence', category: 'outcome', required: true, status: 'pending', dependencyIds: [`${caseId}:portal`], sourceEvidenceIds: [], evidenceContract: ['portal'] },
  ]
  if (input.candidateIds?.length) nodes[1] = { ...nodes[1], status: 'recommender_strategy_ready' }
  return nodes
}

export function recommendationReminderPlan(input: { deadline: string | null; now?: string; status: RecommendationCampaignState; maximumReminders?: number }) {
  if (!input.deadline || ['declined', 'replacement_needed', 'submitted', 'complete'].includes(input.status)) return []
  const deadline = Date.parse(input.deadline)
  const current = Date.parse(input.now ?? now())
  if (!Number.isFinite(deadline) || !Number.isFinite(current)) return []
  const days = Math.ceil((deadline - current) / 86_400_000)
  const windows = [14, 7, 3, 1]
  return windows.filter(window => days <= window && days >= 0).slice(0, input.maximumReminders ?? 1).map(window => ({ windowDays: window, daysRemaining: days, action: 'prepare_reminder_for_approval' as const }))
}

export function classifyRecommendationReply(subject: string, body: string): RecommendationReplyClassification {
  const value = `${subject} ${body}`.toLocaleLowerCase()
  if (/cannot|can't|unable|not able|won't be able|too late/.test(value) && /deadline|due|time|timing/.test(value)) return 'CANNOT_MEET_DEADLINE'
  if (/general letter|generic letter|only a general|not able to tailor|cannot tailor/.test(value)) return 'GENERAL_LETTER_ONLY'
  if (/decline|declining|unable to recommend|unable to write|not in a position|regret|sorry.*cannot|can't write/.test(value)) return 'DECLINE'
  if (/strong recommendation|very happy|delighted|glad to|absolutely|of course|happy to write|pleased to write/.test(value)) return 'STRONG_ACCEPT'
  if (/hesitat|not sure|may be able|let me check|need to think|possibly|perhaps|busy|if timing/.test(value)) return 'HESITANT'
  if (/meet|call|zoom|conversation|discuss/.test(value) && /recommend|letter|reference|application|request/.test(`${subject} ${value}`)) return 'REQUESTS_MEETING'
  if (/draft|template|sample letter|rough points|bullet points/.test(value)) return 'REQUESTS_DRAFT'
  if (/cv|resume|transcript|materials|support pack|information|programme details|send me/.test(value)) return 'REQUESTS_MATERIALS'
  if (/what programme|which programme|more information|tell me more|clarif|details|need to know/.test(value)) return 'NEEDS_MORE_INFORMATION'
  if (/accept|agreed|agree|happy to|willing to|can write|yes,?/.test(value)) return 'ACCEPT'
  return 'OTHER'
}

export function recommendationStateForReply(classification: RecommendationReplyClassification): RecommendationCampaignState {
  switch (classification) {
    case 'STRONG_ACCEPT': return 'strong_accept'
    case 'ACCEPT': return 'accept'
    case 'HESITANT': return 'hesitant'
    case 'DECLINE': return 'declined'
    case 'NEEDS_MORE_INFORMATION': return 'needs_more_information'
    case 'REQUESTS_MATERIALS': return 'requests_materials'
    case 'REQUESTS_DRAFT': return 'requests_draft'
    case 'REQUESTS_MEETING': return 'requests_meeting'
    case 'CANNOT_MEET_DEADLINE': return 'cannot_meet_deadline'
    case 'GENERAL_LETTER_ONLY': return 'general_letter_only'
    default: return 'waiting_response'
  }
}

export function recommendationReplyIsPositive(classification: RecommendationReplyClassification) {
  return classification === 'STRONG_ACCEPT' || classification === 'ACCEPT'
}

/** Resolve context before asking the user; only the remaining decision is rendered as Progress Detail. */
export function resolveRecommendationContext(input: {
  profile?: unknown
  applicationContext?: unknown
  uploadedDocuments?: unknown[]
  gmailMessages?: unknown[]
  contacts?: unknown[]
  previousApplications?: unknown[]
  existingCandidates?: unknown[]
  requirements?: RecommendationProgrammeRequirements | null
  programme?: string
  reusableContextConsent?: boolean
  selectedCandidateIds?: string[]
}) {
  const checkedSources = ['ApplicantProfile', 'application_case', 'uploaded_documents', 'Gmail', 'Google Contacts', 'previous_applications', 'reusable_context']
  const candidates = discoverRecommenderCandidates(input)
  const profile = record(input.profile)
  const autoResolvedFacts: RecommendationContextResolution['autoResolvedFacts'] = []
  const name = text(unwrap(profile.preferredName) ?? unwrap(profile.legalName), 240)
  if (name) autoResolvedFacts.push({ key: 'applicant_name', value: name, sourceIds: sourceIds(profile.preferredName ?? profile.legalName), confidence: 'high' })
  const email = text(unwrap(record(profile.contactInformation).email), 320)
  if (email) autoResolvedFacts.push({ key: 'applicant_email', value: email, sourceIds: sourceIds(record(profile.contactInformation).email), confidence: 'high' })
  if (input.requirements?.sourceBacked) autoResolvedFacts.push({ key: 'programme_requirements', value: 'source-backed requirements verified', sourceIds: input.requirements.sourceEvidence.map(item => item.id), confidence: 'high' })
  const reusableContext: Record<string, string> = {}
  if (input.reusableContextConsent === true) {
    for (const candidate of candidates) {
      reusableContext[`recommender:${candidate.id}:email`] = candidate.email ?? ''
      reusableContext[`recommender:${candidate.id}:relationship`] = candidate.exactContextOfRelationship
    }
  }
  const unresolved: string[] = []
  if (!input.requirements?.sourceBacked) unresolved.push('programme_requirements_source_evidence')
  if (!candidates.length) unresolved.push('recommender_candidate')
  const programme = text(input.programme ?? input.requirements?.programme.value, 500)
  const ranked = rankRecommenderCandidates({ candidates, programme, requirements: input.requirements })
  const selected = input.selectedCandidateIds ?? []
  const hasSelection = selected.length > 0
  if (ranked.length && !hasSelection) unresolved.push('recommender_selection')
  // Source discovery is owned by the task agent. Keeping it out of Progress
  // Detail prevents an upload card from appearing for work David can complete
  // through the programme's official pages. If that bounded research truly
  // exhausts, the task agent renders one plain-language fallback instead.
  const nextInteraction = !input.requirements?.sourceBacked
    ? null
    : !ranked.length
      ? createRecommendationInteraction({ kind: 'contact_select', id: 'recommendation:candidate', requirementId: 'recommender_candidate', question: 'Which eligible recommender should be considered for this application?', reason: 'No recommender was resolved from your profile, previous applications, Gmail, Contacts, or uploaded context.', options: [], knownContext: [], reusableContextKeys: [] })
      : !hasSelection
        ? createRecommendationInteraction({ kind: 'multiple_choice', id: 'recommendation:portfolio', requirementId: 'recommender_selection', question: 'Which recommender portfolio should I prepare?', reason: 'I found these candidates and ranked them by observed relationship evidence, programme relevance, and verified contact—not title prestige.', options: ranked.slice(0, 6).map(candidate => ({ value: candidate.id, label: `${candidate.name}${candidate.institution ? ` — ${candidate.institution}` : ''}`, description: `${candidate.fitScore}/100 · ${candidate.rankingReasons[0] ?? 'grounded relationship evidence'}`, candidateId: candidate.id })), knownContext: ranked.slice(0, 3).map(candidate => `${candidate.name}: ${candidate.rankingReasons[0] ?? 'ranked candidate'}`), reusableContextKeys: ['selected_recommender_ids'] })
        : null
  const totalQuestions = nextInteraction ? 1 : 0
  return {
    version: RECOMMENDATION_WORKFLOW_VERSION,
    checkedSources,
    autoResolvedFacts,
    candidates: ranked,
    reusableContext,
    reusableContextConsent: input.reusableContextConsent === true,
    unresolved,
    nextInteraction,
    automaticContinuationRate: totalQuestions === 0 ? 1 : autoResolvedFacts.length / (autoResolvedFacts.length + totalQuestions),
  } satisfies RecommendationContextResolution
}

export function nextRecommendationWorkflowState(input: {
  requirements: RecommendationProgrammeRequirements
  context: RecommendationContextResolution
  strategy?: RecommendationPortfolioStrategy | null
  contactVerified?: boolean
  requestPrepared?: boolean
  requestSent?: boolean
  reply?: RecommendationReplyClassification | null
}) {
  if (!input.requirements.sourceBacked) return 'blocked' as const
  if (!input.context.candidates.length) return 'candidates_discovered' as const
  if (!input.strategy) return 'awaiting_user_selection' as const
  if (!input.contactVerified) return 'contact_verification_pending' as const
  if (!input.requestPrepared) return 'request_ready' as const
  if (!input.requestSent) return 'awaiting_request_approval' as const
  if (!input.reply) return 'waiting_response' as const
  return recommendationStateForReply(input.reply)
}

export function recommendationMetricsSummary(metrics: RecommendationInteractionMetric[]) {
  return {
    totalInteractions: metrics.length,
    automaticContinuationRate: metrics.length ? metrics.filter(metric => metric.resumedAutomatically).length / metrics.length : 1,
    questionsByKind: metrics.reduce<Record<string, number>>((counts, metric) => ({ ...counts, [metric.kind]: (counts[metric.kind] ?? 0) + 1 }), {}),
    broadFreeTextQuestions: metrics.filter(metric => metric.kind === 'short_text' || metric.kind === 'correction').length,
    invalidResponses: metrics.filter(metric => metric.outcome === 'invalid').length,
    duplicateRequestKeys: 0,
    duplicatePortalInvitations: 0,
  }
}

export function recommendationCompletionEvidence(input: {
  requestSent: boolean
  providerMessageId?: string | null
  portalInvitationSent?: boolean
  portalSubmissionConfirmed?: boolean
  thanked?: boolean
}) {
  return {
    requestSent: input.requestSent && Boolean(input.providerMessageId),
    providerMessageId: input.providerMessageId ?? null,
    portalInvitationSent: input.portalInvitationSent === true,
    portalSubmissionConfirmed: input.portalSubmissionConfirmed === true,
    thanked: input.thanked === true,
    complete: input.requestSent && Boolean(input.providerMessageId) && input.portalSubmissionConfirmed === true,
  }
}
