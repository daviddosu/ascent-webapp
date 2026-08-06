import { currentUser, getCloudClient } from './cloud'

export * from '../../supabase/functions/_shared/david-applications'

import type {
  ApplicantProfile,
  ApplicationCommunication,
  ApplicationContact,
  ApplicationCase,
  ApplicationCampaign,
  ApplicationWriter,
  DavidApplicationState,
  Evidence,
  HumanAssignment,
  Opportunity,
  PortalCheckpoint,
  Requirement,
} from '../../supabase/functions/_shared/david-applications'
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
  return {
    id: text(row.id, 80),
    applicationCaseId: text(row.application_case_id, 80),
    name: text(row.name, 500),
    category: text(row.category, 80) as Requirement['category'],
    source: row.source && typeof row.source === 'object' ? row.source as Requirement['source'] : null,
    required: row.required !== false,
    exactInstructions: text(row.exact_instructions, 4_000),
    deadline: row.deadline_at ? { dateTime: text(row.deadline_at, 80), timezone: text(row.deadline_timezone, 120) || 'UTC', label: text(row.deadline_at, 80), sourceUrl: null, retrievedAt: null } : null,
    status: text(row.status, 80) as Requirement['status'],
    responsibleParty: text(row.responsible_party, 80) as Requirement['responsibleParty'],
    linkedArtifactId: text(row.linked_artifact_id, 80) || null,
    verificationEvidenceIds: stringArray(row.verification_evidence_ids),
    blockerReason: text(row.blocker_reason, 1_000) || null,
  }
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
  if (!client || !user) return { campaign: null, opportunities: [], cases: [], state: null }

  const campaignResult = await client
    .from('application_campaigns')
    .select('*')
    .eq('user_id', user.id)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, unknown>>()
  if (campaignResult.error) throw new Error(campaignResult.error.message)
  if (!campaignResult.data) return { campaign: null, opportunities: [], cases: [], state: null }
  const campaignId = text(campaignResult.data.id, 80)
  const [opportunityResult, caseResult, requirementResult, contactResult, assignmentResult, checkpointResult, evidenceResult, communicationResult] = await Promise.all([
    client.from('application_opportunities').select('*').eq('user_id', user.id).eq('campaign_id', campaignId).order('created_at'),
    client.from('application_cases').select('*').eq('user_id', user.id).eq('campaign_id', campaignId).order('created_at'),
    client.from('application_requirements').select('*').eq('user_id', user.id),
    client.from('application_contacts').select('*').eq('user_id', user.id),
    client.from('human_assignments').select('*').eq('user_id', user.id),
    client.from('portal_checkpoints').select('*').eq('user_id', user.id),
    client.from('application_evidence').select('*').eq('user_id', user.id),
    client.from('application_communications').select('*').eq('user_id', user.id),
  ])
  for (const result of [opportunityResult, caseResult, requirementResult, contactResult, assignmentResult, checkpointResult, evidenceResult, communicationResult]) {
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
  return {
    campaign,
    opportunities,
    cases: caseRows.map(row => {
      const caseId = text(row.id, 80)
      const caseContacts = contacts.filter(contact => text(contact.application_case_id, 80) === caseId).map(contact => ({ ...contact, id: text(contact.id, 80), applicationCaseId: caseId, kind: text(contact.kind, 80), name: text(contact.name, 500), email: text(contact.email, 320) || null, providerContactId: text(contact.provider_contact_id, 256) || null, gmailThreadId: text(contact.gmail_thread_id, 256) || null, lastProviderMessageId: text(contact.last_provider_message_id, 256) || null, consentToContact: contact.consent_to_contact === true })) as ApplicationContact[]
      const caseAssignments = assignments.filter(assignment => text(assignment.application_case_id, 80) === caseId) as HumanAssignment[]
      const caseCheckpoints = checkpoints.filter(checkpoint => text(checkpoint.application_case_id, 80) === caseId) as PortalCheckpoint[]
      const caseEvidence = evidence.filter(item => text(item.application_case_id, 80) === caseId) as Evidence[]
      const caseCommunications = communications.filter(item => text(item.application_case_id, 80) === caseId) as ApplicationCommunication[]
      return mapCase(row, requirementsByCase.get(caseId) ?? [], caseContacts, caseAssignments, caseCheckpoints, caseEvidence, caseCommunications)
    }),
    state: null,
  }
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
