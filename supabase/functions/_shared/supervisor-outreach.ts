/**
 * Canonical, evidence-backed first-contact outreach for prospective graduate
 * supervisors.
 *
 * This module is intentionally provider-neutral. David creates one durable
 * package, Roon may materialise that exact package in Gmail, and the worker
 * validates the same contract again before a draft or send can reach Gmail.
 */

import {
  GRADUATE_CV_RENDERER_VERSION,
  GRADUATE_CV_TEMPLATE_ID,
  GRADUATE_CV_TEMPLATE_VERSION,
  validateCanonicalLatex,
} from './cv.ts'
import {
  validateApplicationEmailAction,
  type ApplicationEmailContext,
  type EmailActionPackage,
} from './application-email.ts'

export const SUPERVISOR_OUTREACH_SCHEMA_VERSION = 1 as const
export const SUPERVISOR_OUTREACH_WORKFLOW_VERSION = 'supervisor-outreach@1.0.0' as const

export const supervisorOutreachPolicyCategories = [
  'required',
  'recommended',
  'useful_optional',
  'discouraged',
  'irrelevant',
] as const
export type SupervisorOutreachPolicyCategory = typeof supervisorOutreachPolicyCategories[number]

export type SupervisorOutreachSource = {
  id: string
  title: string
  url: string
  authority: 'official' | 'peer_reviewed' | 'supplementary'
  source_type: 'official_programme' | 'official_profile' | 'official_lab' | 'project' | 'publication' | 'activity' | 'availability'
  retrieved_at: string
  excerpt: string
  publication_date?: string | null
  claims: string[]
}

export type SourcedSupervisorClaim = {
  text: string
  source_ids: string[]
}

export type SupervisorResearchDossier = {
  supervisor_id: string
  name: string
  title: string
  institution: string
  department: string
  lab_or_group: string | null
  verified_email: string
  verified_email_source_id: string
  alternate_verified_emails: Array<{ email: string; source_id: string }>
  research_themes: SourcedSupervisorClaim[]
  current_projects: SourcedSupervisorClaim[]
  recent_publications: SourcedSupervisorClaim[]
  recent_activity: SourcedSupervisorClaim[]
  availability_evidence: SourcedSupervisorClaim[]
  source_ids: string[]
  retrieved_at: string
  evidence: SupervisorOutreachSource[]
}

export type ApplicantFitEvidence = {
  id: string
  dimension: 'research_interest' | 'research_experience' | 'technical_skill' | 'project' | 'publication' | 'proposed_direction' | 'methodological_overlap' | 'programme_fit' | 'supervision_signal'
  text: string
  score: number
  applicant_fact_ids: string[]
  supervisor_evidence_ids: string[]
}

export type StrongestSupervisorConnection = {
  short_area: string
  statement: string
  applicant_fact_ids: string[]
  supervisor_evidence_ids: string[]
}

export type SupervisorOutreachPolicy = {
  category: SupervisorOutreachPolicyCategory
  strategic_usefulness: 'high' | 'medium' | 'low'
  rationale: string
  evidence_ids: string[]
}

export type SupervisorCvReference = {
  artifact_id: string
  file_asset_id?: string | null
  checksum: string
  filename: string
  mime_type: 'application/pdf'
  template_id: typeof GRADUATE_CV_TEMPLATE_ID
  template_version: typeof GRADUATE_CV_TEMPLATE_VERSION
  renderer_version: typeof GRADUATE_CV_RENDERER_VERSION
  page_count: number
  ats_text: string
  applicant_name: string
  applicant_email: string
  latex?: string
}

export type SupervisorOutreachEmail = {
  to: string
  subject: string
  body_text: string
  body_html: string
  version: string
  word_count: number
  evidence_map: Record<string, string[]>
}

export type SupervisorOutreachQuality = {
  passed: boolean
  checked_at: string
  issues: string[]
  warnings: string[]
  checks: {
    identity: boolean
    research: boolean
    applicant_fit: boolean
    writing: boolean
    gmail: boolean
    attachment: boolean
    consistency: boolean
  }
}

export type SupervisorOutreachPackageStatus = 'quality_checked' | 'approved' | 'sent' | 'rejected' | 'closed'

export type SupervisorOutreachPackage = {
  schema_version: typeof SUPERVISOR_OUTREACH_SCHEMA_VERSION
  workflow_version: typeof SUPERVISOR_OUTREACH_WORKFLOW_VERSION
  contact_mode: 'first_contact'
  application_case_id: string
  opportunity_id: string
  supervisor_id: string
  target_programme: string
  target_institution: string
  target_intake: string
  policy: SupervisorOutreachPolicy
  supervisor_dossier: SupervisorResearchDossier
  research_evidence: Array<{ id: string; source_ids: string[]; claim: string }>
  applicant_fit_evidence: ApplicantFitEvidence[]
  strongest_connection: StrongestSupervisorConnection
  verified_email: string
  verified_email_source_id: string
  email: SupervisorOutreachEmail
  application_email_context: ApplicationEmailContext
  email_action_package: EmailActionPackage
  approved_email_version: string | null
  cv: SupervisorCvReference
  approved_cv_artifact_id: string
  approved_cv_checksum: string
  user_approval: { approved: boolean; approved_at: string | null }
  quality: SupervisorOutreachQuality
  idempotency_key: string
  status: SupervisorOutreachPackageStatus
  created_at: string
  sent_message_id?: string | null
  sent_thread_id?: string | null
}

export type GenerateSupervisorOutreachInput = {
  task_id: string
  application_case_id: string
  opportunity_id: string
  target_programme: string
  target_institution: string
  target_intake: string
  policy: SupervisorOutreachPolicy
  supervisor_dossier: SupervisorResearchDossier
  applicant_fit_evidence: ApplicantFitEvidence[]
  strongest_connection: StrongestSupervisorConnection
  applicant_name: string
  applicant_email: string
  applicant_role?: string | null
  email_action_package: EmailActionPackage
  cv: SupervisorCvReference
  idempotency_key: string
  now?: string
}

export type OutreachValidationOptions = {
  require_user_approval?: boolean
  expected_application_case_id?: string
  expected_opportunity_id?: string
  expected_supervisor_id?: string
  expected_recipient?: string
  expected_subject?: string
  expected_body_text?: string
  expected_cv_artifact_id?: string
  expected_cv_checksum?: string
  expected_attachment_asset_id?: string
  now?: string
}

export type OutreachValidationResult = {
  valid: boolean
  issues: string[]
  warnings: string[]
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const freeEmailDomains = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'proton.me'])
const fitWeights: Record<ApplicantFitEvidence['dimension'], number> = {
  research_interest: 20,
  research_experience: 18,
  technical_skill: 12,
  project: 12,
  publication: 8,
  proposed_direction: 12,
  methodological_overlap: 10,
  programme_fit: 5,
  supervision_signal: 3,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, maximum = 4_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function stringArray(value: unknown, maximum = 80) {
  return Array.isArray(value) ? value.map(item => text(item, 300)).filter(Boolean).slice(0, maximum) : []
}

function canonicalEmail(value: unknown) {
  const candidate = text(value, 320).toLocaleLowerCase()
  return emailPattern.test(candidate) ? candidate : ''
}

function sameEmail(left: unknown, right: unknown) {
  return canonicalEmail(left) !== '' && canonicalEmail(left) === canonicalEmail(right)
}

function canonicalBody(value: unknown) {
  return text(value, 30_000).replace(/\r\n?/g, '\n').trim()
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function sourceMap(dossier: SupervisorResearchDossier) {
  return new Map(dossier.evidence.map(source => [source.id, source]))
}

function allClaimSourceIds(dossier: SupervisorResearchDossier) {
  return unique([
    ...dossier.research_themes.flatMap(item => item.source_ids),
    ...dossier.current_projects.flatMap(item => item.source_ids),
    ...dossier.recent_publications.flatMap(item => item.source_ids),
    ...dossier.recent_activity.flatMap(item => item.source_ids),
    ...dossier.availability_evidence.flatMap(item => item.source_ids),
  ])
}

function sourceClaims(dossier: SupervisorResearchDossier, ids: string[]) {
  const sources = sourceMap(dossier)
  return ids.flatMap(id => {
    const source = sources.get(id)
    return source ? [source.excerpt, ...source.claims] : []
  }).map(item => text(item, 2_000)).filter(Boolean)
}

function freshEnough(retrievedAt: string, now: string) {
  const retrieved = Date.parse(retrievedAt)
  const current = Date.parse(now)
  if (!Number.isFinite(retrieved) || !Number.isFinite(current)) return false
  const ageDays = (current - retrieved) / 86_400_000
  return ageDays >= -2 && ageDays <= 400
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function supervisorOutreachHtmlFromText(bodyText: string) {
  return canonicalBody(bodyText)
    .split('\n\n')
    .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export function supervisorOutreachTextFromHtml(bodyHtml: string) {
  return text(bodyHtml, 30_000)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function determineSupervisorOutreachPolicy(
  policy: SupervisorOutreachPolicy,
  dossier: SupervisorResearchDossier,
): { active: boolean; issues: string[] } {
  const issues: string[] = []
  const sources = sourceMap(dossier)
  if (!supervisorOutreachPolicyCategories.includes(policy.category)) issues.push('The supervisor-contact policy category is invalid.')
  if (!text(policy.rationale, 2_000)) issues.push('The supervisor-contact policy needs a rationale.')
  if (!policy.evidence_ids.length) issues.push('The supervisor-contact policy needs source evidence.')
  const policySources = policy.evidence_ids.map(id => sources.get(id)).filter(Boolean) as SupervisorOutreachSource[]
  if (policySources.length !== policy.evidence_ids.length) issues.push('The supervisor-contact policy references missing evidence.')
  if (!policySources.some(source => source.authority === 'official')) issues.push('The supervisor-contact policy needs an official programme or department source.')
  if (policy.category === 'irrelevant' || policy.category === 'discouraged') return { active: false, issues }
  if (policy.category === 'useful_optional' && policy.strategic_usefulness === 'low') return { active: false, issues }
  return { active: issues.length === 0, issues }
}

export function validateSupervisorResearchDossier(
  dossier: SupervisorResearchDossier,
  now = new Date().toISOString(),
): OutreachValidationResult {
  const issues: string[] = []
  const warnings: string[] = []
  const sources = sourceMap(dossier)
  if (!text(dossier.supervisor_id, 160)) issues.push('Supervisor ID is required.')
  if (!text(dossier.name, 240) || !text(dossier.title, 240) || !text(dossier.institution, 240) || !text(dossier.department, 240)) issues.push('Supervisor name, title, institution, and department are required.')
  const email = canonicalEmail(dossier.verified_email)
  if (!email) issues.push('A verified institutional email is required.')
  else if (freeEmailDomains.has(email.split('@')[1] ?? '')) issues.push('A free-mail address cannot be used as the verified institutional email.')
  const emailSource = sources.get(dossier.verified_email_source_id)
  if (!emailSource || emailSource.authority !== 'official') issues.push('The verified email must cite an official profile or department source.')
  if (!dossier.evidence.length || dossier.evidence.length < 2) issues.push('The supervisor dossier needs multiple source records.')
  for (const source of dossier.evidence) {
    if (!text(source.id, 200) || !/^https:\/\//i.test(source.url) || !text(source.title, 300) || !text(source.excerpt, 2_000)) issues.push(`Source ${source.id || '(missing)'} is incomplete.`)
    if (!freshEnough(source.retrieved_at, now)) warnings.push(`Source ${source.id || '(missing)'} is stale or has an invalid retrieval date.`)
  }
  const requiredClaims: Array<[string, SourcedSupervisorClaim[]]> = [
    ['research themes', dossier.research_themes],
    ['current projects', dossier.current_projects],
    ['recent publications', dossier.recent_publications],
    ['recent activity', dossier.recent_activity],
    ['availability evidence', dossier.availability_evidence],
  ]
  for (const [label, claims] of requiredClaims) {
    if (!claims.length) issues.push(`The supervisor dossier needs ${label} evidence.`)
    for (const claim of claims) {
      if (!text(claim.text, 2_000)) issues.push(`A ${label} claim is empty.`)
      if (!claim.source_ids.length || claim.source_ids.some(id => !sources.has(id))) issues.push(`A ${label} claim has missing source evidence.`)
    }
  }
  const listedSourceIds = new Set(dossier.source_ids)
  for (const sourceId of allClaimSourceIds(dossier)) if (!listedSourceIds.has(sourceId)) issues.push(`Dossier source ${sourceId} is not included in source_ids.`)
  if (!freshEnough(dossier.retrieved_at, now)) warnings.push('The dossier retrieval date is stale; current source records should be preferred.')
  return { valid: issues.length === 0 && warnings.length === 0, issues, warnings }
}

export function rankSupervisorCandidates(input: Array<{
  dossier: SupervisorResearchDossier
  fit_evidence: ApplicantFitEvidence[]
  strongest_connection: StrongestSupervisorConnection | null
}>) {
  return input.map(candidate => {
    const validSignals = candidate.fit_evidence.filter(signal => Number.isFinite(signal.score) && signal.score >= 0 && signal.score <= 100)
    const weighted = validSignals.reduce((sum, signal) => sum + signal.score * (fitWeights[signal.dimension] ?? 0), 0)
    const totalWeight = validSignals.reduce((sum, signal) => sum + (fitWeights[signal.dimension] ?? 0), 0)
    const core = validSignals.some(signal => ['research_interest', 'research_experience', 'proposed_direction', 'methodological_overlap', 'publication', 'project'].includes(signal.dimension) && signal.supervisor_evidence_ids.length > 0 && signal.applicant_fact_ids.length > 0)
    const fitScore = totalWeight ? Math.round(weighted / totalWeight) : 0
    const dossierCheck = validateSupervisorResearchDossier(candidate.dossier)
    return {
      supervisor_id: candidate.dossier.supervisor_id,
      name: candidate.dossier.name,
      fit_score: fitScore,
      eligible: core && dossierCheck.valid,
      fit_rationale: validSignals.sort((left, right) => right.score - left.score).slice(0, 3).map(signal => signal.text).join(' '),
      source_ids: candidate.dossier.source_ids,
      issues: [...dossierCheck.issues, ...dossierCheck.warnings, ...(core ? [] : ['No applicant-supervisor research overlap was evidenced.'])],
      strongest_connection: candidate.strongest_connection,
    }
  }).sort((left, right) => Number(right.eligible) - Number(left.eligible) || right.fit_score - left.fit_score || left.name.localeCompare(right.name))
}

function validCvReference(cv: SupervisorCvReference) {
  return Boolean(text(cv.artifact_id, 160) && /^[a-f0-9]{64}$/i.test(cv.checksum) && /\.pdf$/i.test(cv.filename) &&
    cv.mime_type === 'application/pdf' && cv.template_id === GRADUATE_CV_TEMPLATE_ID &&
    cv.template_version === GRADUATE_CV_TEMPLATE_VERSION && cv.renderer_version === GRADUATE_CV_RENDERER_VERSION &&
    Number.isInteger(cv.page_count) && cv.page_count >= 1 && cv.page_count <= 6 &&
    text(cv.applicant_name, 240) && canonicalEmail(cv.applicant_email) && text(cv.ats_text, 20_000))
}

export function qualityCheckSupervisorOutreach(input: {
  package: SupervisorOutreachPackage
  now?: string
}): SupervisorOutreachQuality {
  const current = input.now ?? new Date().toISOString()
  const packageValue = input.package
  const bodyText = canonicalBody(packageValue.email.body_text)
  const bodyHtml = text(packageValue.email.body_html, 30_000)
  const dossier = packageValue.supervisor_dossier
  const sources = sourceMap(dossier)
  const fitEvidenceIds = new Set(packageValue.applicant_fit_evidence.map(item => item.id))
  const researchEvidenceIds = new Set(packageValue.research_evidence.map(item => item.id))
  const emailEvidenceIds = packageValue.email_action_package.claims.flatMap(claim => claim.evidenceIds)
  const identity = sameEmail(packageValue.email.to, dossier.verified_email) &&
    text(packageValue.email.to) === canonicalEmail(dossier.verified_email)
  const research = packageValue.strongest_connection.supervisor_evidence_ids.length > 0 &&
    packageValue.strongest_connection.supervisor_evidence_ids.every(id => sources.has(id)) &&
    emailEvidenceIds.some(id => researchEvidenceIds.has(id))
  const applicantFit = packageValue.applicant_fit_evidence.length > 0 &&
    packageValue.applicant_fit_evidence.every(item => item.applicant_fact_ids.length > 0 && item.supervisor_evidence_ids.length > 0 && fitEvidenceIds.has(item.id)) &&
    emailEvidenceIds.some(id => fitEvidenceIds.has(id))
  const writing = wordCount(bodyText) > 0 && wordCount(bodyText) <= 220 &&
    supervisorOutreachTextFromHtml(bodyHtml) === bodyText &&
    Object.values(packageValue.email_action_package.quality).every(Boolean)
  const gmail = emailPattern.test(packageValue.email.to) && packageValue.email.subject.length >= 8 && packageValue.email.subject.length <= 180 &&
    bodyText.length > 0 && /^<p>/.test(bodyHtml) && !/<(?:style|script|table|img)\b/i.test(bodyHtml)
  const attachment = validCvReference(packageValue.cv) && packageValue.approved_cv_artifact_id === packageValue.cv.artifact_id &&
    packageValue.approved_cv_checksum === packageValue.cv.checksum && packageValue.cv.ats_text.toLocaleLowerCase().includes(packageValue.cv.applicant_name.toLocaleLowerCase()) &&
    packageValue.cv.ats_text.toLocaleLowerCase().includes(packageValue.cv.applicant_email.toLocaleLowerCase()) &&
    (!packageValue.cv.latex || validateCanonicalLatex(packageValue.cv.latex).length === 0)
  const consistency = sameEmail(packageValue.email_action_package.recipientEmail, packageValue.verified_email) &&
    packageValue.email_action_package.attachmentArtifactIds.includes(packageValue.cv.artifact_id) &&
    packageValue.email.evidence_map.research_connection?.length > 0 &&
    packageValue.email.evidence_map.applicant_fit?.length > 0 &&
    packageValue.email.evidence_map.programme_policy?.length > 0
  const issues: string[] = []
  const checks = { identity, research, applicant_fit: applicantFit, writing, gmail, attachment, consistency }
  for (const [name, passed] of Object.entries(checks)) if (!passed) issues.push(`${name} quality check failed.`)
  if (packageValue.policy.category === 'discouraged' || packageValue.policy.category === 'irrelevant') issues.push('The official programme policy does not support supervisor outreach.')
  if (!packageValue.supervisor_dossier.verified_email_source_id || !sources.has(packageValue.supervisor_dossier.verified_email_source_id)) issues.push('The verified institutional email source is missing.')
  return {
    passed: issues.length === 0,
    checked_at: current,
    issues,
    warnings: packageValue.quality?.warnings ?? [],
    checks,
  }
}

export function generateSupervisorOutreach(input: GenerateSupervisorOutreachInput): SupervisorOutreachPackage {
  const now = input.now ?? new Date().toISOString()
  const policyDecision = determineSupervisorOutreachPolicy(input.policy, input.supervisor_dossier)
  const dossierCheck = validateSupervisorResearchDossier(input.supervisor_dossier, now)
  const issues = [...policyDecision.issues, ...dossierCheck.issues, ...dossierCheck.warnings]
  if (!policyDecision.active) issues.push('Supervisor outreach is not active for this programme policy.')
  if (!text(input.task_id, 80) || !text(input.application_case_id, 80) || !text(input.opportunity_id, 80) || !text(input.idempotency_key, 300)) issues.push('Task, case, opportunity, and idempotency identifiers are required.')
  if (!canonicalEmail(input.applicant_email) || !text(input.applicant_name, 240)) issues.push('Applicant identity is incomplete.')
  if (!validCvReference(input.cv)) issues.push('The approved canonical CV reference is incomplete.')
  if (input.cv.applicant_name !== input.applicant_name || !sameEmail(input.cv.applicant_email, input.applicant_email)) issues.push('The CV identity does not match the applicant identity.')
  const evidenceIds = new Set(input.supervisor_dossier.evidence.map(item => item.id))
  const fitEvidence = input.applicant_fit_evidence.filter(item => item.score >= 0 && item.score <= 100)
  if (!fitEvidence.length) issues.push('At least one scored applicant-supervisor fit signal is required.')
  if (!input.strongest_connection.applicant_fact_ids.length || !input.strongest_connection.supervisor_evidence_ids.length) issues.push('The strongest research connection needs both applicant and supervisor evidence.')
  if (input.strongest_connection.supervisor_evidence_ids.some(id => !evidenceIds.has(id))) issues.push('The strongest research connection references missing supervisor evidence.')
  const researchEvidence = input.strongest_connection.supervisor_evidence_ids.map(id => ({
    id,
    source_ids: [id],
    claim: sourceClaims(input.supervisor_dossier, [id])[0] ?? input.strongest_connection.statement,
  }))
  const emailContext: ApplicationEmailContext = {
    taskId: input.task_id,
    applicationCaseId: input.application_case_id,
    emailType: 'prospective_supervisor_first_contact',
    purpose: input.email_action_package.communicationGoal,
    recipient: {
      name: input.supervisor_dossier.name,
      role: input.supervisor_dossier.title,
      institution: input.supervisor_dossier.institution,
      email: input.supervisor_dossier.verified_email,
      emailVerification: 'official_verified',
      sourceEvidenceIds: [input.supervisor_dossier.verified_email_source_id],
    },
    programme: { institution: input.target_institution, programme: input.target_programme, programmeId: input.opportunity_id },
    contactPolicy: {
      value: input.policy.category === 'useful_optional' ? 'optional' : input.policy.category,
      evidenceIds: input.policy.evidence_ids,
    },
    applicantEvidence: fitEvidence.map(item => ({ fact: item.text, evidenceId: item.id })),
    programmeEvidence: input.policy.evidence_ids.map(evidenceId => ({ fact: input.policy.rationale, evidenceId })),
    recipientResearch: {
      themes: input.supervisor_dossier.research_themes.map(item => item.text),
      recentWork: input.supervisor_dossier.recent_publications.map(item => {
        const source = item.source_ids.map(id => input.supervisor_dossier.evidence.find(evidence => evidence.id === id)).find(Boolean)
        return { title: source?.title ?? item.text, url: source?.url ?? '', relevance: item.text }
      }),
      evidenceIds: input.supervisor_dossier.source_ids,
    },
    attachments: [{ artifactId: input.cv.artifact_id, type: 'cv', filename: input.cv.filename, checksum: input.cv.checksum }],
    communicationConstraints: { approvalRequired: true, maxWords: 220, attachmentRequired: true },
  }
  const emailValidation = validateApplicationEmailAction(emailContext, input.email_action_package)
  issues.push(...emailValidation.issues, ...emailValidation.sendBlockers)
  const emptyEmail: SupervisorOutreachEmail = { to: canonicalEmail(input.supervisor_dossier.verified_email), subject: '', body_text: '', body_html: '', version: 'application-email-v1', word_count: 0, evidence_map: {} }
  if (issues.length) {
    const rejectedBase = {
      schema_version: SUPERVISOR_OUTREACH_SCHEMA_VERSION,
      workflow_version: SUPERVISOR_OUTREACH_WORKFLOW_VERSION,
      contact_mode: 'first_contact' as const,
      application_case_id: input.application_case_id,
      opportunity_id: input.opportunity_id,
      supervisor_id: input.supervisor_dossier.supervisor_id,
      target_programme: input.target_programme,
      target_institution: input.target_institution,
      target_intake: input.target_intake,
      policy: input.policy,
      supervisor_dossier: input.supervisor_dossier,
      research_evidence: [],
      applicant_fit_evidence: fitEvidence,
      strongest_connection: input.strongest_connection,
      verified_email: input.supervisor_dossier.verified_email,
      verified_email_source_id: input.supervisor_dossier.verified_email_source_id,
      email: emptyEmail,
      application_email_context: emailContext,
      email_action_package: input.email_action_package,
      approved_email_version: null,
      cv: input.cv,
      approved_cv_artifact_id: input.cv.artifact_id,
      approved_cv_checksum: input.cv.checksum,
      user_approval: { approved: false, approved_at: null },
      quality: { passed: false, checked_at: now, issues, warnings: dossierCheck.warnings, checks: { identity: false, research: false, applicant_fit: false, writing: false, gmail: false, attachment: false, consistency: false } },
      idempotency_key: input.idempotency_key,
      status: 'rejected' as const,
      created_at: now,
    }
    return rejectedBase
  }
  const bodyText = canonicalBody(input.email_action_package.textBody)
  const bodyHtml = text(input.email_action_package.htmlBody, 30_000)
  const email: SupervisorOutreachEmail = {
    to: canonicalEmail(input.supervisor_dossier.verified_email),
    subject: text(input.email_action_package.subject, 180),
    body_text: bodyText,
    body_html: bodyHtml,
    version: 'application-email-v1',
    word_count: wordCount(bodyText),
    evidence_map: {
      research_connection: researchEvidence.map(item => item.id),
      applicant_fit: fitEvidence.map(item => item.id),
      programme_policy: input.policy.evidence_ids,
      cv: [input.cv.artifact_id],
    },
  }
  const packageValue = {
    schema_version: SUPERVISOR_OUTREACH_SCHEMA_VERSION,
    workflow_version: SUPERVISOR_OUTREACH_WORKFLOW_VERSION,
    contact_mode: 'first_contact' as const,
    application_case_id: input.application_case_id,
    opportunity_id: input.opportunity_id,
    supervisor_id: input.supervisor_dossier.supervisor_id,
    target_programme: input.target_programme,
    target_institution: input.target_institution,
    target_intake: input.target_intake,
    policy: input.policy,
    supervisor_dossier: input.supervisor_dossier,
    research_evidence: researchEvidence,
    applicant_fit_evidence: fitEvidence,
    strongest_connection: input.strongest_connection,
    verified_email: email.to,
    verified_email_source_id: input.supervisor_dossier.verified_email_source_id,
    email,
    application_email_context: emailContext,
    email_action_package: input.email_action_package,
    approved_email_version: null,
    cv: input.cv,
    approved_cv_artifact_id: input.cv.artifact_id,
    approved_cv_checksum: input.cv.checksum,
    user_approval: { approved: false, approved_at: null },
    quality: { passed: false, checked_at: now, issues: [], warnings: dossierCheck.warnings, checks: { identity: false, research: false, applicant_fit: false, writing: false, gmail: false, attachment: false, consistency: false } },
    idempotency_key: input.idempotency_key,
    status: 'quality_checked' as const,
    created_at: now,
  }
  const quality = qualityCheckSupervisorOutreach({ package: packageValue, now })
  return { ...packageValue, quality, status: quality.passed ? 'quality_checked' : 'rejected' }
}

export function approveSupervisorOutreachPackage(packageValue: SupervisorOutreachPackage, now = new Date().toISOString()) {
  const validation = validateSupervisorOutreachPackage(packageValue)
  if (!validation.valid || !packageValue.quality.passed) throw new Error(`Supervisor outreach approval blocked: ${[...validation.issues, ...packageValue.quality.issues].join(' ')}`)
  return {
    ...packageValue,
    approved_email_version: packageValue.email.version,
    user_approval: { approved: true, approved_at: now },
    status: 'approved' as const,
  }
}

export function validateSupervisorOutreachPackage(
  packageValue: SupervisorOutreachPackage,
  options: OutreachValidationOptions = {},
): OutreachValidationResult {
  const issues: string[] = []
  const warnings: string[] = []
  if (packageValue.schema_version !== SUPERVISOR_OUTREACH_SCHEMA_VERSION) issues.push('Outreach package schema version is unsupported.')
  if (packageValue.workflow_version !== SUPERVISOR_OUTREACH_WORKFLOW_VERSION) issues.push('Outreach package workflow version is unsupported.')
  if (packageValue.contact_mode !== 'first_contact') issues.push('Only first-contact outreach packages use this canonical gate.')
  if (options.expected_application_case_id && packageValue.application_case_id !== options.expected_application_case_id) issues.push('Outreach package case does not match the request.')
  if (options.expected_opportunity_id && packageValue.opportunity_id !== options.expected_opportunity_id) issues.push('Outreach package opportunity does not match the request.')
  if (options.expected_supervisor_id && packageValue.supervisor_id !== options.expected_supervisor_id) issues.push('Outreach package supervisor does not match the request.')
  if (!sameEmail(packageValue.verified_email, packageValue.supervisor_dossier.verified_email)) issues.push('Outreach package email does not match the verified dossier email.')
  if (options.expected_recipient && !sameEmail(options.expected_recipient, packageValue.verified_email)) issues.push('Request recipient does not match the verified institutional email.')
  if (options.expected_subject && packageValue.email.subject !== options.expected_subject) issues.push('Request subject does not match the approved email version.')
  if (options.expected_body_text && canonicalBody(packageValue.email.body_text) !== canonicalBody(options.expected_body_text)) issues.push('Request plain-text body does not match the approved email version.')
  if (options.expected_cv_artifact_id && packageValue.approved_cv_artifact_id !== options.expected_cv_artifact_id) issues.push('Request CV artifact does not match the approved package.')
  if (options.expected_cv_checksum && packageValue.approved_cv_checksum !== options.expected_cv_checksum) issues.push('Request CV checksum does not match the approved package.')
  if (options.expected_attachment_asset_id && packageValue.cv.file_asset_id !== options.expected_attachment_asset_id) issues.push('Request attachment asset does not match the approved CV artifact.')
  if (!packageValue.quality.passed) issues.push('The outreach quality gate has not passed.')
  if (options.require_user_approval && (!packageValue.user_approval.approved || packageValue.approved_email_version !== packageValue.email.version)) issues.push('Explicit user approval of the exact email version is required before sending.')
  if (!validCvReference(packageValue.cv) || packageValue.approved_cv_artifact_id !== packageValue.cv.artifact_id || packageValue.approved_cv_checksum !== packageValue.cv.checksum) issues.push('The approved CV artifact and checksum are incomplete or inconsistent.')
  const policy = determineSupervisorOutreachPolicy(packageValue.policy, packageValue.supervisor_dossier)
  if (!policy.active) issues.push(...policy.issues, 'The programme policy does not permit this outreach package.')
  const dossier = validateSupervisorResearchDossier(packageValue.supervisor_dossier, options.now ?? new Date().toISOString())
  if (!dossier.valid) issues.push(...dossier.issues, ...dossier.warnings)
  warnings.push(...dossier.warnings)
  if (!emailPattern.test(packageValue.email.to) || packageValue.email.to !== canonicalEmail(packageValue.verified_email)) issues.push('The canonical recipient is invalid.')
  if (supervisorOutreachTextFromHtml(packageValue.email.body_html) !== canonicalBody(packageValue.email.body_text)) issues.push('The Gmail HTML and plain-text bodies are not equivalent.')
  if (packageValue.email.word_count !== wordCount(packageValue.email.body_text)) issues.push('The stored email word count is incorrect.')
  const emailActionValidation = validateApplicationEmailAction(packageValue.application_email_context, packageValue.email_action_package)
  issues.push(...emailActionValidation.issues, ...emailActionValidation.sendBlockers)
  return { valid: issues.length === 0, issues: unique(issues), warnings: unique(warnings) }
}

export function validateFirstContactSupervisorOutreachPayload(
  payload: Record<string, unknown>,
  options: OutreachValidationOptions & { require_user_approval?: boolean } = {},
): OutreachValidationResult {
  const packageValue = payload.supervisor_outreach_package ?? payload.supervisorOutreachPackage ?? payload.outreach_package
  if (!isRecord(packageValue)) return { valid: false, issues: ['A canonical supervisor outreach package is required for first contact.'], warnings: [] }
  const result = validateSupervisorOutreachPackage(packageValue as SupervisorOutreachPackage, options)
  const recipient = Array.isArray(payload.to) ? payload.to[0] : payload.destination_email ?? payload.destinationEmail ?? payload.to
  if (recipient && !sameEmail(recipient, (packageValue as Record<string, unknown>).verified_email)) result.issues.push('First-contact recipient does not match the package.')
  const subject = payload.subject
  if (subject && String(subject) !== String((packageValue as Record<string, unknown>).email && ((packageValue as Record<string, unknown>).email as Record<string, unknown>).subject)) result.issues.push('First-contact subject does not match the package.')
  const body = payload.body_text ?? payload.body
  if (body && canonicalBody(body) !== canonicalBody(((packageValue as Record<string, unknown>).email as Record<string, unknown>).body_text)) result.issues.push('First-contact body does not match the package.')
  return { ...result, valid: result.valid && result.issues.length === 0, issues: unique(result.issues) }
}

export function supervisorFirstContactRequiresPackage(payload: Record<string, unknown>, contactKind?: string | null) {
  const kind = text(contactKind ?? payload.contact_kind ?? payload.contactKind, 80).toLocaleLowerCase()
  const requestKind = text(payload.request_kind ?? payload.requestKind, 80).toLocaleLowerCase()
  const hasThread = Boolean(payload.thread_id ?? payload.threadId ?? payload.in_reply_to_message_id ?? payload.inReplyToMessageId)
  return kind === 'professor' && ['create_draft', 'send_email'].includes(requestKind) && !hasThread
}
