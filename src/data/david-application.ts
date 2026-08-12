import { currentUser, getCloudClient } from './cloud'

export * from '../../supabase/functions/_shared/david-applications'
export { projectCampaign } from '../../supabase/functions/_shared/application-campaign-projection'
export type { ApplicationCampaignProjection, ProjectionExecutionState, ProjectionExternalCommitment, ProjectionInteractionKind, ProjectionUserInteraction } from '../../supabase/functions/_shared/application-campaign-projection'

import type {
  ApplicantProfile,
  ApplicationCommunication,
  ApplicationContact,
  ApplicationCase,
  ApplicationCampaign,
  ApplicationWriter,
  DavidApplicationState,
  Artifact,
  Evidence,
  EvidenceKind,
  HumanAssignment,
  Opportunity,
  PortalCheckpoint,
  Requirement,
} from '../../supabase/functions/_shared/david-applications'
import {
  projectCampaign,
  type ApplicationCampaignProjection,
  type ProjectionExecutionState,
  type ProjectionExternalCommitment,
  type ProjectionInteractionKind,
  type ProjectionUserInteraction,
} from '../../supabase/functions/_shared/application-campaign-projection'
import type { Database } from '../../supabase/database.types'

type ProfileRow = Omit<Database['public']['Tables']['applicant_profiles']['Row'], 'profile' | 'consent'> & {
  profile: ApplicantProfile
  consent: ApplicantProfile['consent']
}

function mapProfile(row: ProfileRow): ApplicantProfile {
  return {
    ...row.profile,
    id: row.id,
    userId: row.user_id,
    consent: row.consent ?? row.profile.consent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Load the canonical reusable applicant context. */
export async function loadApplicantProfile() {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return null
  const { data, error } = await client
    .from('applicant_profiles')
    .select('id,user_id,profile,consent,created_at,updated_at')
    .eq('user_id', user.id)
    .maybeSingle<ProfileRow>()
  if (error) throw new Error(error.message)
  return data ? mapProfile(data) : null
}

/** Load the user-owned writer pool used by David's assignment selector. */
export async function loadApplicationWriters(): Promise<ApplicationWriter[]> {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return []
  const { data, error } = await client
    .from('application_writers')
    .select('*')
    .eq('user_id', user.id)
    .order('quality_score', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    email: row.email,
    specialties: row.specialties ?? [],
    degreeFields: row.degree_fields ?? [],
    programmeFamiliarity: row.programme_familiarity ?? [],
    price: row.price === null ? null : { amount: Number(row.price), currency: row.price_currency ?? 'USD' },
    turnaroundHours: row.turnaround_hours,
    availability: row.availability,
    qualityScore: row.quality_score,
    reliabilityScore: row.reliability_score,
    revisionRate: row.revision_rate,
    activeAssignments: row.active_assignments,
  }))
}

/** Persist applicant context only after the user has explicitly granted scope. */
export async function saveApplicantProfile(profile: ApplicantProfile) {
  if (!profile.consent.granted) throw new Error('Reusable applicant context needs explicit consent before it can be saved.')
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to save applicant context.')
  if (profile.userId !== user.id) throw new Error('Applicant context belongs to a different account.')
  const { data, error } = await client
    .from('applicant_profiles')
    .upsert({
      id: profile.id,
      user_id: user.id,
      profile,
      consent: profile.consent,
      consent_granted: profile.consent.granted,
    }, { onConflict: 'user_id' })
    .select('id,user_id,profile,consent,created_at,updated_at')
    .single<ProfileRow>()
  if (error || !data) throw new Error(error?.message ?? 'Applicant context could not be saved.')
  return mapProfile(data)
}

export async function setApplicantReuseConsent(
  profile: ApplicantProfile,
  granted: boolean,
  scope: ApplicantProfile['consent']['scope'] = 'application_tasks',
  now = new Date().toISOString(),
) {
  const next: ApplicantProfile = {
    ...profile,
    consent: granted
      ? { granted: true, grantedAt: profile.consent.grantedAt ?? now, scope, revokedAt: null }
      : { granted: false, grantedAt: profile.consent.grantedAt, scope: null, revokedAt: now },
    updatedAt: now,
  }
  if (!granted) {
    const client = await getCloudClient()
    const user = await currentUser()
    if (client && user) {
      const { error } = await client.rpc('set_applicant_reuse_consent', {
        p_granted: false,
        p_scope: null,
      })
      if (error) throw new Error(error.message)
    }
    return next
  }
  return saveApplicantProfile(next)
}

export type ApplicationWorkspaceState = {
  campaign: ApplicationCampaign | null
  opportunities: Opportunity[]
  cases: ApplicationCase[]
  artifacts: Artifact[]
  evidence: Evidence[]
  contacts: ApplicationContact[]
  assignments: HumanAssignment[]
  checkpoints: PortalCheckpoint[]
  communications: ApplicationCommunication[]
  interactions: ProjectionUserInteraction[]
  state: DavidApplicationState | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown, maximum = 10_000) {
  return typeof value === 'string' ? value.slice(0, maximum) : ''
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(item => text(item, 500)).filter(Boolean) : []
}

function object(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function mapDeadline(row: Record<string, unknown>): NonNullable<Requirement['deadline']> | null {
  const dateTime = text(row.deadline_at ?? row.dateTime, 80)
  if (!dateTime) return null
  return {
    dateTime,
    timezone: text(row.deadline_timezone ?? row.timezone, 120) || 'UTC',
    label: text(row.deadline_label ?? row.label, 300) || dateTime,
    sourceUrl: text(row.deadline_source_url ?? row.sourceUrl, 2_000) || null,
    retrievedAt: text(row.deadline_retrieved_at ?? row.retrievedAt, 80) || null,
  }
}

function mapCampaign(row: Record<string, unknown>): ApplicationCampaign {
  const data = record(row.data)
  const progress = record(row.progress ?? data.progress)
  return {
    ...data,
    id: text(row.id, 80),
    userId: text(row.user_id, 80),
    taskId: text(row.task_id, 500),
    ownerSpecialistId: 'david',
    objective: text(row.objective, 4_000),
    applicationKind: text(row.application_kind, 80) as ApplicationCampaign['applicationKind'],
    targetFields: stringArray(data.targetFields ?? data.target_fields),
    targetCountries: stringArray(data.targetCountries ?? data.target_countries),
    degreeLevel: text(data.degreeLevel ?? data.degree_level, 160) || null,
    intakeYear: Number.isFinite(Number(data.intakeYear ?? data.intake_year)) ? Number(data.intakeYear ?? data.intake_year) : null,
    fundingRequirements: stringArray(data.fundingRequirements ?? data.funding_requirements),
    quantityTarget: Number.isFinite(Number(row.target_quantity ?? data.quantityTarget ?? data.quantity_target)) ? Number(row.target_quantity ?? data.quantityTarget ?? data.quantity_target) : null,
    searchCriteria: record(data.searchCriteria ?? data.search_criteria),
    approvedStrategy: record(row.approved_strategy ?? data.approvedStrategy ?? data.approved_strategy),
    status: text(row.status, 80) as ApplicationCampaign['status'],
    opportunityIds: stringArray(data.opportunityIds ?? data.opportunity_ids),
    applicationCaseIds: stringArray(data.applicationCaseIds ?? data.application_case_ids ?? data.case_ids),
    deadlines: Array.isArray(data.deadlines) ? data.deadlines as ApplicationCampaign['deadlines'] : [],
    progress: {
      completed: Number(progress.completed ?? 0),
      total: Number(progress.total ?? 5),
      label: text(progress.label, 300),
      nextAction: text(progress.nextAction ?? progress.next_action ?? row.next_action, 500),
      blockers: stringArray(progress.blockers),
      evidenceCount: Number(progress.evidenceCount ?? progress.evidence_count ?? 0),
    },
    executionEvidenceIds: stringArray(data.executionEvidenceIds ?? data.execution_evidence_ids),
    createdAt: text(row.created_at, 80),
    updatedAt: text(row.updated_at, 80),
  }
}

function mapOpportunity(row: Record<string, unknown>): Opportunity {
  const data = record(row.data)
  const funding = record(data.funding)
  const deadlineAt = text(row.deadline_at, 80)
  return {
    ...data,
    id: text(row.id, 80),
    campaignId: text(row.campaign_id, 80),
    userId: text(row.user_id, 80),
    institution: text(row.institution, 500) || text(data.institution, 500),
    department: text(data.department, 300) || null,
    programmeTitle: text(row.programme_title, 800) || text(data.programmeTitle ?? data.programme_title ?? data.title, 800),
    degreeOrAwardType: text(data.degreeOrAwardType ?? data.degree_or_award_type, 200),
    entryTerm: text(data.entryTerm ?? data.entry_term, 160) || null,
    officialUrl: text(row.official_url, 2_000),
    applicationUrl: text(row.application_url, 2_000) || null,
    deadline: deadlineAt ? { dateTime: deadlineAt, timezone: text(row.deadline_timezone, 120) || 'UTC', label: deadlineAt, sourceUrl: text(row.official_url, 2_000) || null, retrievedAt: text(row.retrieved_at, 80) || null } : null,
    fee: data.fee && typeof data.fee === 'object' ? data.fee as Opportunity['fee'] : null,
    funding: { status: ['full', 'partial', 'none', 'unknown'].includes(text(funding.status, 30)) ? funding.status as Opportunity['funding']['status'] : 'unknown', summary: text(funding.summary, 2_000), stipend: text(funding.stipend, 500) || null, tuitionCoverage: text(funding.tuitionCoverage ?? funding.tuition_coverage, 500) || null },
    eligibility: stringArray(data.eligibility),
    academicPrerequisites: stringArray(data.academicPrerequisites ?? data.academic_prerequisites),
    requiredTests: stringArray(data.requiredTests ?? data.required_tests),
    languageRequirements: stringArray(data.languageRequirements ?? data.language_requirements),
    requiredDocuments: stringArray(data.requiredDocuments ?? data.required_documents),
    requiredEssays: stringArray(data.requiredEssays ?? data.required_essays),
    recommendationCount: Number.isFinite(Number(data.recommendationCount ?? data.recommendation_count)) ? Number(data.recommendationCount ?? data.recommendation_count) : null,
    supervisorContactExpectation: text(data.supervisorContactExpectation ?? data.supervisor_contact_expectation, 40) as Opportunity['supervisorContactExpectation'] || 'unknown',
    faculty: Array.isArray(data.faculty) ? data.faculty as Opportunity['faculty'] : [],
    contactRequirements: stringArray(data.contactRequirements ?? data.contact_requirements),
    applicationStages: stringArray(data.applicationStages ?? data.application_stages),
    authorshipRules: stringArray(data.authorshipRules ?? data.authorship_rules),
    citations: Array.isArray(row.citations) ? row.citations as Opportunity['citations'] : Array.isArray(data.citations) ? data.citations as Opportunity['citations'] : [],
    retrievalDate: text(row.retrieved_at, 80),
    verificationStatus: text(row.verification_status, 40) as Opportunity['verificationStatus'],
    confidence: Number(row.confidence ?? data.confidence ?? 0),
    fitScore: Number(row.fit_score ?? data.fitScore ?? data.fit_score ?? 0),
    admissionLikelihoodFactors: stringArray(data.admissionLikelihoodFactors ?? data.admission_likelihood_factors),
    recommendationRationale: text(row.recommendation_rationale, 2_000),
  }
}

function mapRequirement(row: Record<string, unknown>): Requirement {
  const retry = object(row.retry_state)
  return {
    id: text(row.id, 80),
    applicationCaseId: text(row.application_case_id, 80),
    name: text(row.name, 500),
    category: text(row.category, 80) as Requirement['category'],
    source: row.source && typeof row.source === 'object' ? row.source as Requirement['source'] : null,
    required: row.required !== false,
    exactInstructions: text(row.exact_instructions, 4_000),
    deadline: mapDeadline(row),
    status: text(row.status, 80) as Requirement['status'],
    responsibleParty: text(row.responsible_party, 80) as Requirement['responsibleParty'],
    linkedArtifactId: text(row.linked_artifact_id, 80) || null,
    verificationEvidenceIds: stringArray(row.verification_evidence_ids),
    blockerReason: text(row.blocker_reason, 1_000) || null,
    sourceId: text(row.source_id, 160) || null,
    requirementType: text(row.requirement_type, 160) || null,
    dependencyIds: stringArray(row.dependency_ids),
    evidenceContract: stringArray(row.evidence_contract),
    retryState: {
      attempts: Number(retry.attempts ?? 0),
      maximumAttempts: Number(retry.maximumAttempts ?? retry.maximum_attempts ?? 3),
      lastFailure: text(retry.lastFailure ?? retry.last_failure, 500) || null,
      nextAttemptAt: text(retry.nextAttemptAt ?? retry.next_attempt_at, 80) || null,
      escalated: retry.escalated === true,
    },
    resolutionTier: Number.isFinite(Number(row.resolution_tier)) ? Number(row.resolution_tier) : null,
    waitUntil: text(row.wait_until, 80) || null,
    createdAt: text(row.created_at, 80) || null,
    updatedAt: text(row.updated_at, 80) || null,
  }
}

function mapArtifact(row: Record<string, unknown>): Artifact {
  const author = text(row.author_type, 40)
  const validAuthors = ['david', 'user', 'writer', 'editor', 'referee', 'institution'] as const
  return {
    id: text(row.id, 80),
    fileAssetId: text(row.file_asset_id, 80),
    kind: text(row.kind, 80) as Artifact['kind'],
    originalAssetIds: stringArray(row.original_asset_ids),
    programmeId: text(row.opportunity_id ?? row.programme_id, 80) || null,
    applicationCaseId: text(row.application_case_id, 80) || null,
    templateVersion: text(row.template_version, 160) || null,
    promptVersion: text(row.prompt_version, 160) || null,
    author: validAuthors.includes(author as typeof validAuthors[number]) ? author as Artifact['author'] : 'david',
    revisionOf: text(row.revision_of, 80) || null,
    revisionHistory: stringArray(row.revision_history),
    checksum: text(row.checksum, 128),
    approvalStatus: text(row.approval_status, 40) as Artifact['approvalStatus'],
    finalSubmissionDestination: text(row.final_submission_destination, 500) || null,
  }
}

function mapEvidence(row: Record<string, unknown>): Evidence {
  return {
    id: text(row.id, 80),
    applicationCaseId: text(row.application_case_id, 80),
    kind: text(row.kind, 80) as EvidenceKind,
    sourceUrl: text(row.source_url, 2_000) || null,
    provider: text(row.provider, 160) || null,
    providerMessageId: text(row.provider_message_id, 500) || null,
    providerThreadId: text(row.provider_thread_id, 500) || null,
    assetId: text(row.asset_id, 80) || null,
    excerpt: text(row.excerpt, 4_000) || null,
    capturedAt: text(row.captured_at, 80),
    metadata: object(row.metadata),
  }
}

function mapContact(row: Record<string, unknown>, applicationCaseId: string): ApplicationContact {
  return {
    id: text(row.id, 80), applicationCaseId,
    kind: text(row.kind, 80) as ApplicationContact['kind'],
    name: text(row.name, 500),
    email: text(row.email, 320) || null,
    providerContactId: text(row.provider_contact_id, 256) || null,
    gmailThreadId: text(row.gmail_thread_id, 256) || null,
    lastProviderMessageId: text(row.last_provider_message_id, 256) || null,
    consentToContact: row.consent_to_contact === true,
  }
}

function mapAssignment(row: Record<string, unknown>): HumanAssignment {
  const qualityReview = object(row.quality_review)
  const price = row.price === null || row.price === undefined ? null : { amount: Number(row.price), currency: text(row.price_currency, 20) || 'USD' }
  return {
    id: text(row.id, 80), applicationCaseId: text(row.application_case_id, 80), writerId: text(row.writer_id, 160), specialty: text(row.specialty, 300), deliverable: text(row.deliverable, 500), brief: text(row.brief, 4_000), sourceMaterials: stringArray(row.source_material_ids), deadline: mapDeadline(row), price, status: text(row.status, 80) as HumanAssignment['status'], questions: stringArray(row.questions), revisionCount: Number(row.revisions ?? 0), qualityReview: { score: Number.isFinite(Number(qualityReview.score)) ? Number(qualityReview.score) : null, notes: text(qualityReview.notes, 2_000), reviewerId: text(qualityReview.reviewerId ?? qualityReview.reviewer_id, 80) || null }, finalArtifactId: text(row.final_artifact_id, 80) || null, paymentStatus: text(row.payment_status, 40) as HumanAssignment['paymentStatus'], slaBreaches: stringArray(row.sla_breaches), escalationLevel: Number(row.escalation_level ?? 0),
  }
}

function mapCheckpoint(row: Record<string, unknown>): PortalCheckpoint {
  const session = object(row.session_information)
  return {
    id: text(row.id, 80), applicationCaseId: text(row.application_case_id, 80), portal: text(row.portal, 240), accountIdentifier: text(row.account_identifier, 320) || null, url: text(row.url, 2_000), section: text(row.section, 400), contract: object(row.contract) as PortalCheckpoint['contract'], enteredValues: object(row.entered_values) as PortalCheckpoint['enteredValues'], valueSources: object(row.value_sources) as PortalCheckpoint['valueSources'], uploadedArtifacts: stringArray(row.uploaded_artifacts), saveConfirmation: text(row.save_confirmation, 500) || null, validationErrors: stringArray(row.validation_errors), screenshots: stringArray(row.screenshots), sessionInformation: { sessionId: text(session.sessionId ?? session.session_id, 160), fingerprint: text(session.fingerprint, 160) || null, expiresAt: text(session.expiresAt ?? session.expires_at, 80) || null }, completionSignal: text(row.completion_signal, 500) || null, nextStep: text(row.next_step, 500) || null, verified: row.verified === true, createdAt: text(row.created_at, 80),
  }
}

function mapCommunication(row: Record<string, unknown>): ApplicationCommunication {
  return {
    id: text(row.id, 80), applicationCaseId: text(row.application_case_id, 80), contactId: text(row.contact_id, 80) || null, provider: text(row.provider, 80), providerMessageId: text(row.provider_message_id, 500) || null, providerThreadId: text(row.provider_thread_id, 500) || null, direction: text(row.direction, 40) as ApplicationCommunication['direction'], classification: text(row.classification, 120) as ApplicationCommunication['classification'], excerpt: text(object(row.data).excerpt, 4_000) || null, createdAt: text(row.created_at, 80),
  }
}

function interactionKind(value: unknown): ProjectionInteractionKind {
  const kind = text(value, 60)
  const map: Record<string, ProjectionInteractionKind> = { approval: 'approve', single_choice: 'choose_one', multiple_choice: 'choose_several', confirmation: 'confirm', correction: 'correction', email: 'email', date: 'date', contact_select: 'contact', attachment_request: 'attachment', attachment_selection: 'attachment', fact: 'short_text', short_text: 'short_text', secure_authentication: 'secure_authentication', payment_approval: 'payment_approval' }
  return map[kind] ?? 'short_text'
}

function mapInteractions(rows: Array<Record<string, unknown>>, questions: Array<Record<string, unknown>>, taskId: string): ProjectionUserInteraction[] {
  const recommendationInteractions = rows.map(row => ({ id: text(row.interaction_id, 300), applicationCaseId: text(row.application_case_id, 80), requirementId: text(row.requirement_id, 300) || null, taskId, kind: interactionKind(row.kind), question: text(row.question, 2_000), reason: text(row.reason, 2_000), status: text(row.status, 40) as ProjectionUserInteraction['status'], dedupeKey: text(row.idempotency_key, 300) || text(row.interaction_id, 300) || null, deadline: null }))
  const questionInteractions = questions
    .filter(row => text(row.status, 60) === 'awaiting_user')
    .map(row => ({ id: `question:${text(row.id, 80)}`, applicationCaseId: text(row.application_case_id, 80), requirementId: text(row.application_requirement_id, 300) || null, taskId, kind: interactionKind(row.input_type === 'file' ? 'attachment' : row.approval_requirement === 'submission' ? 'approval' : row.input_type === 'date' ? 'date' : 'short_text'), question: text(row.exact_prompt, 2_000), reason: text(row.last_error, 2_000) || 'This portal question needs your confirmed answer.', status: 'pending' as const, dedupeKey: text(row.question_key, 300) || text(row.id, 80), deadline: null }))
  return [...recommendationInteractions, ...questionInteractions]
}

function mapExternalCommitments(evidence: Evidence[]): ProjectionExternalCommitment[] {
  const actorKinds = new Set<ProjectionExternalCommitment['actor']['kind']>(['recommender', 'supervisor', 'writer', 'registrar', 'credential_evaluator', 'test_provider', 'admissions_office', 'application_portal', 'payment_provider', 'university', 'system', 'other'])
  return evidence.flatMap(item => {
    const metadata = object(item.metadata)
    const requirementId = text(metadata.requirementId ?? metadata.requirement_id, 300)
    const promisedAt = text(metadata.commitmentDueAt ?? metadata.commitment_due_at ?? metadata.promisedAt ?? metadata.promised_at, 80)
    if (!requirementId || !promisedAt) return []
    const kindValue = text(metadata.actorKind ?? metadata.actor_kind, 80) as ProjectionExternalCommitment['actor']['kind']
    const kind = actorKinds.has(kindValue) ? kindValue : 'other'
    const actorName = text(metadata.actorName ?? metadata.actor_name, 500) || 'External dependency'
    return [{
      id: `commitment:${item.id}`,
      requirementId,
      actor: { id: text(metadata.actorId ?? metadata.actor_id, 200) || `actor:${item.id}`, kind, name: actorName },
      promisedAt,
      sourceEvidenceId: item.id,
      note: text(metadata.commitmentNote ?? metadata.commitment_note, 1_000) || null,
    } satisfies ProjectionExternalCommitment]
  })
}

function mapCase(row: Record<string, unknown>, requirements: Requirement[], contacts: ApplicationContact[], assignments: HumanAssignment[], checkpoints: PortalCheckpoint[], evidence: Evidence[], communications: ApplicationCommunication[]): ApplicationCase {
  const data = record(row.data)
  return {
    ...data,
    id: text(row.id, 80), campaignId: text(row.campaign_id, 80), opportunityId: text(row.opportunity_id, 80), userId: text(row.user_id, 80), taskId: text(row.task_id, 500),
    currentStage: text(row.current_stage, 80) as ApplicationCase['currentStage'], status: text(row.status, 80) as ApplicationCase['status'], requirements,
    portalAccount: record(row.portal_account) as ApplicationCase['portalAccount'], portalSessionId: text(row.portal_session_id, 80) || null,
    documents: stringArray(data.documents), essays: stringArray(data.essays), contacts: contacts.map(contact => contact.id), referees: contacts.filter(contact => contact.kind === 'referee').map(contact => contact.id),
    writerAssignmentIds: assignments.map(assignment => assignment.id), communications: communications.map(communication => communication.id), approvalIds: stringArray(data.approvalIds ?? data.approval_ids), deadlines: Array.isArray(data.deadlines) ? data.deadlines as ApplicationCase['deadlines'] : [],
    submittedValues: Array.isArray(data.submittedValues) ? data.submittedValues as ApplicationCase['submittedValues'] : [], portalCheckpoints: checkpoints.map(checkpoint => checkpoint.id), evidenceIds: evidence.map(item => item.id), blockers: stringArray(data.blockers),
    nextAction: text(row.next_action, 500), finalOutcome: text(row.final_outcome, 500) || null, applicationId: text(row.application_id, 255) || null, submissionAttemptKey: text(row.submission_attempt_key, 300) || null, submittedAt: text(row.submitted_at, 80) || null, createdAt: text(row.created_at, 80), updatedAt: text(row.updated_at, 80),
  }
}

/** Restore a campaign and all of its cases after a restart or device change. */
export async function loadApplicationWorkspace(taskId: string): Promise<ApplicationWorkspaceState> {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return { campaign: null, opportunities: [], cases: [], artifacts: [], evidence: [], contacts: [], assignments: [], checkpoints: [], communications: [], interactions: [], state: null }

  const campaignResult = await client
    .from('application_campaigns')
    .select('*')
    .eq('user_id', user.id)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, unknown>>()
  if (campaignResult.error) throw new Error(campaignResult.error.message)
  if (!campaignResult.data) return { campaign: null, opportunities: [], cases: [], artifacts: [], evidence: [], contacts: [], assignments: [], checkpoints: [], communications: [], interactions: [], state: null }
  const campaignId = text(campaignResult.data.id, 80)
  const [opportunityResult, caseResult, requirementResult, contactResult, assignmentResult, checkpointResult, evidenceResult, communicationResult, artifactResult, recommendationInteractionResult, questionResult] = await Promise.all([
    client.from('application_opportunities').select('*').eq('user_id', user.id).eq('campaign_id', campaignId).order('created_at'),
    client.from('application_cases').select('*').eq('user_id', user.id).eq('campaign_id', campaignId).order('created_at'),
    client.from('application_requirements').select('*').eq('user_id', user.id),
    client.from('application_contacts').select('*').eq('user_id', user.id),
    client.from('human_assignments').select('*').eq('user_id', user.id),
    client.from('portal_checkpoints').select('*').eq('user_id', user.id),
    client.from('application_evidence').select('*').eq('user_id', user.id),
    client.from('application_communications').select('*').eq('user_id', user.id),
    client.from('application_artifacts').select('*').eq('user_id', user.id),
    client.from('application_recommendation_interactions').select('*').eq('user_id', user.id),
    client.from('application_questions').select('*').eq('user_id', user.id),
  ])
  for (const result of [opportunityResult, caseResult, requirementResult, contactResult, assignmentResult, checkpointResult, evidenceResult, communicationResult, artifactResult, recommendationInteractionResult, questionResult]) {
    if (result.error) throw new Error(result.error.message)
  }
  const campaign = mapCampaign(campaignResult.data)
  const opportunities = (opportunityResult.data ?? []).map(row => mapOpportunity(row as Record<string, unknown>))
  const caseRows = (caseResult.data ?? []) as Array<Record<string, unknown>>
  const requirementsByCase = new Map<string, Requirement[]>()
  const caseIdSet = new Set(caseRows.map(row => text(row.id, 80)))
  for (const row of (requirementResult.data ?? []) as Array<Record<string, unknown>>) {
    const key = text(row.application_case_id, 80)
    if (!caseIdSet.has(key)) continue
    requirementsByCase.set(key, [...(requirementsByCase.get(key) ?? []), mapRequirement(row)])
  }
  const contacts = (contactResult.data ?? []) as Array<Record<string, unknown>>
  const assignments = (assignmentResult.data ?? []) as Array<Record<string, unknown>>
  const checkpoints = (checkpointResult.data ?? []) as Array<Record<string, unknown>>
  const evidence = (evidenceResult.data ?? []) as Array<Record<string, unknown>>
  const communications = (communicationResult.data ?? []) as Array<Record<string, unknown>>
  const artifacts = (artifactResult.data ?? []) as Array<Record<string, unknown>>
  const recommendationInteractions = (recommendationInteractionResult.data ?? []) as Array<Record<string, unknown>>
  const questions = (questionResult.data ?? []) as Array<Record<string, unknown>>
  const caseIds = new Set(caseRows.map(row => text(row.id, 80)))
  const mappedEvidence = evidence.filter(row => caseIds.has(text(row.application_case_id, 80))).map(mapEvidence)
  const mappedArtifacts = artifacts.filter(row => !row.application_case_id || caseIds.has(text(row.application_case_id, 80))).map(mapArtifact)
  const mappedContacts = contacts.filter(row => caseIds.has(text(row.application_case_id, 80))).map(row => mapContact(row, text(row.application_case_id, 80)))
  const mappedAssignments = assignments.filter(row => caseIds.has(text(row.application_case_id, 80))).map(mapAssignment)
  const mappedCheckpoints = checkpoints.filter(row => caseIds.has(text(row.application_case_id, 80))).map(mapCheckpoint)
  const mappedCommunications = communications.filter(row => caseIds.has(text(row.application_case_id, 80))).map(mapCommunication)
  const mappedInteractions = mapInteractions(
    recommendationInteractions.filter(row => caseIds.has(text(row.application_case_id, 80))),
    questions.filter(row => caseIds.has(text(row.application_case_id, 80))),
    campaign.taskId,
  )
  return {
    campaign,
    opportunities,
    artifacts: mappedArtifacts,
    evidence: mappedEvidence,
    contacts: mappedContacts,
    assignments: mappedAssignments,
    checkpoints: mappedCheckpoints,
    communications: mappedCommunications,
    interactions: mappedInteractions,
    cases: caseRows.map(row => {
      const caseId = text(row.id, 80)
      const caseContacts = contacts.filter(contact => text(contact.application_case_id, 80) === caseId).map(contact => mapContact(contact, caseId))
      const caseAssignments = assignments.filter(assignment => text(assignment.application_case_id, 80) === caseId).map(mapAssignment)
      const caseCheckpoints = checkpoints.filter(checkpoint => text(checkpoint.application_case_id, 80) === caseId).map(mapCheckpoint)
      const caseEvidence = mappedEvidence.filter(item => item.applicationCaseId === caseId)
      const caseCommunications = communications.filter(item => text(item.application_case_id, 80) === caseId).map(mapCommunication)
      return mapCase(row, requirementsByCase.get(caseId) ?? [], caseContacts, caseAssignments, caseCheckpoints, caseEvidence, caseCommunications)
    }),
    state: null,
  }
}

export type LoadApplicationCampaignProjectionOptions = {
  executions?: ProjectionExecutionState[]
  interactions?: ProjectionUserInteraction[]
  commitments?: ProjectionExternalCommitment[]
  now?: string
}

/** Load authoritative rows once, then project them through the shared domain function. */
export async function loadApplicationCampaignProjection(taskId: string, options: LoadApplicationCampaignProjectionOptions = {}): Promise<ApplicationCampaignProjection | null> {
  const workspace = await loadApplicationWorkspace(taskId)
  if (!workspace.campaign) return null
  return projectCampaign({
    campaign: workspace.campaign,
    opportunities: workspace.opportunities,
    cases: workspace.cases,
    artifacts: workspace.artifacts,
    evidence: workspace.evidence,
    contacts: workspace.contacts,
    assignments: workspace.assignments,
    communications: workspace.communications,
    executions: options.executions,
    interactions: [...workspace.interactions, ...(options.interactions ?? [])],
    commitments: [...mapExternalCommitments(workspace.evidence), ...(options.commitments ?? [])],
    now: options.now,
  })
}

/** Fetch the compact runtime state used by the existing task-detail panel. */
export async function loadDavidApplicationState(runId: string) {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return null
  const { data, error } = await client
    .from('agent_runs')
    .select('application_state')
    .eq('id', runId)
    .eq('user_id', user.id)
    .maybeSingle<{ application_state: DavidApplicationState | null }>()
  if (error) throw new Error(error.message)
  return data?.application_state ?? null
}
