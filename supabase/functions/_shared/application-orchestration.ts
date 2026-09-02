/**
 * Programme-aware orchestration for graduate applications.
 *
 * This module deliberately contains no provider calls. It turns authoritative
 * programme evidence, verified applicant evidence, and the existing
 * requirement graph into typed pathway, strategy, and execution state. The
 * task-agent owns persistence and provider effects; this module owns the
 * deterministic shape of the plan.
 */

import type { ApplicationWorkstream } from './david-applications.ts'
import { isApplicationSubmissionMethodRequirement, requiresApplicantSpecificEvidence } from './application-requirement-evidence.ts'
import { asPlanNodeId, asRequirementIdOrNull, type RequirementCardinality, type RequirementId } from './application-requirement-contract.ts'
import { missingValueOwnerForRequirement, type MissingValueOwner } from './application-value-ownership.ts'
import {
  FACULTY_CONTACT_POLICY_VALUES,
  normalizeFacultyContactPolicy,
  normalizeFacultyContactPolicyClassification,
  type FacultyContactPolicy,
  type ProgrammeFacultyContactPolicy,
} from './application-programme-discovery.ts'

export const APPLICATION_ORCHESTRATION_VERSION = 'graduate-application-orchestration@1' as const

export type OrchestrationSourceEvidence = {
  id: string
  url: string
  excerpt: string
  authority: 'official' | 'government' | 'provider' | 'applicant'
  retrievedAt?: string | null
}

export type GraduateApplicationPathway = {
  schemaVersion: 1
  admissionModel:
    | 'central_committee'
    | 'supervisor_first'
    | 'direct_lab_admission'
    | 'rotation_based'
    | 'project_specific_position'
    | 'programme_plus_supervisor'
    | 'scholarship_coupled'
    | 'professional_or_coursework'
    | 'mixed'
    | 'unknown'
  applicationRoute:
    | 'central_portal'
    | 'department_portal'
    | 'supervisor_then_portal'
    | 'job_vacancy'
    | 'email_application'
    | 'external_scholarship_then_programme'
    | 'mixed'
    | 'unknown'
  facultyContactPolicy:
    FacultyContactPolicy
  /** The programme research package remains auditable at the pathway boundary. */
  facultyContactPolicyDetails?: ProgrammeFacultyContactPolicy | null
  supervisorApprovalBeforeApplication: 'required' | 'recommended' | 'not_required' | 'unknown'
  supervisorNamedInApplication: 'required' | 'optional' | 'not_requested' | 'unknown'
  researchProposalPolicy: 'required' | 'recommended' | 'optional' | 'not_required' | 'unknown'
  fundingModel: 'programme_funded' | 'pi_funded' | 'project_funded' | 'scholarship_required' | 'self_funded_possible' | 'mixed' | 'unknown'
  recommendationModel: {
    count: number | null
    academicRequired: boolean | null
    submissionMethod: 'portal_invitation' | 'email' | 'applicant_upload' | 'mixed' | 'unknown'
  }
  evidence: OrchestrationSourceEvidence[]
  confidence: number
  classifiedAt: string
}

export type ProgrammeFacultyCandidate = {
  id: string
  institution: string
  programmeId?: string | null
  name: string
  title?: string | null
  department?: string | null
  officialProfileUrl: string
  labUrl?: string | null
  researchAreas: string[]
  researchSummary?: string | null
  publicEmail?: string | null
  emailSourceUrl?: string | null
  currentlyActive: boolean | 'unknown'
  acceptsStudents?: boolean | 'unknown'
  sourceEvidence: OrchestrationSourceEvidence[]
  applicantFit?: number | null
}

export type FacultyFitBreakdown = {
  overallScore: number
  researchAreaFit: number
  methodsFit: number
  experienceFit: number
  facultySpecificFit: number
}

export type FacultyDraftEmail = {
  subject: string
  textBody: string
  htmlBody: string
  recipientEmail: string
  attachmentArtifactIds: string[]
  status: 'draft_ready'
}

export type FacultyOutreachDossier = {
  facultyId: string
  name: string
  institution: string
  department?: string | null
  title?: string | null
  identityVerification: 'official_verified' | 'uncertain'
  identitySourceUrl: string
  email?: string | null
  emailSourceUrl?: string | null
  emailVerification: 'official_verified' | 'secondary_verified' | 'unverified' | 'missing'
  officialProfileUrl: string
  labUrl?: string | null
  researchDomain: string
  researchSubdomains: string[]
  researchSummary: string
  researchThemes: string[]
  recentWork: Array<{ title: string; year?: number | null; url: string; relevanceToApplicant: string }>
  applicantOverlap: Array<{ facultySignal: string; applicantEvidence: string; applicantEvidenceId: string; strength: number }>
  fitBreakdown: FacultyFitBreakdown
  acceptsStudents?: boolean | 'unknown'
  contactPolicy?: FacultyContactPolicy
  outreachRecommendation: 'required' | 'strongly_recommended' | 'recommended' | 'optional' | 'skip' | 'prohibited'
  draftRecommendation?: 'required' | 'useful' | 'skip'
  sendRecommendation?: 'required_after_approval' | 'user_choice' | 'skip'
  outreachReason: string
  draftEmail?: FacultyDraftEmail | null
  draftStatus: 'draft_ready' | 'not_applicable' | 'identity_uncertain' | 'waiting_for_email' | 'waiting_for_cv'
  attachmentStrategy: { attachCv: boolean; cvArtifactId?: string; otherArtifactIds?: string[] }
  sourceEvidence?: Array<{ id: string; url: string; type: string; excerpt: string }>
  status: 'researching' | 'ready_to_draft' | 'draft_ready' | 'waiting_for_attachment' | 'ready_to_send' | 'sent' | 'replied' | 'follow_up_due' | 'closed'
}

export type ApplicantSignal = { id: string; signal: string; evidence?: string | null }

function signalTokens(value: string) {
  return new Set(
    lower(value)
      .split(/[^a-z0-9+#.-]+/i)
      .map(token => token.trim())
      .filter(token => token.length >= 4),
  )
}

function overlapScore(left: string[], right: string[]) {
  const leftTokens = new Set(left.flatMap(value => [...signalTokens(value)]))
  const rightTokens = new Set(right.flatMap(value => [...signalTokens(value)]))
  if (!leftTokens.size || !rightTokens.size) return 0
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length
  return clamp(intersection / Math.max(3, Math.min(leftTokens.size, rightTokens.size)))
}

/**
 * Build a conservative first-pass faculty dossier from the eager discovery
 * records. A later research call may add recent work or a verified email, but
 * it may not replace the candidate with an ungrounded person. Keeping this
 * deterministic makes faculty selection useful immediately after programme
 * selection while the deeper pass is still running.
 */
export function buildFacultyOutreachDossiers(input: {
  pathway: GraduateApplicationPathway
  candidates?: ProgrammeFacultyCandidate[]
  applicantSignals?: ApplicantSignal[]
  cvArtifactId?: string | null
  now?: string
}): FacultyOutreachDossier[] {
  const signals = (input.applicantSignals ?? []).filter(signal => signal.id && text(signal.signal))
  const outreachDisallowed = ['discouraged', 'prohibited'].includes(input.pathway.facultyContactPolicy)
  return (input.candidates ?? []).map(candidate => {
    const facultySignals = [candidate.name, candidate.department ?? '', ...candidate.researchAreas, candidate.researchSummary ?? '']
    const applicantOverlap = signals
      .map(signal => ({
        facultySignal: candidate.researchAreas[0] ?? candidate.researchSummary ?? candidate.name,
        applicantEvidence: signal.evidence || signal.signal,
        applicantEvidenceId: signal.id,
        strength: overlapScore(facultySignals, [signal.signal, signal.evidence ?? '']),
      }))
      .filter(item => item.strength > 0)
      .sort((left, right) => right.strength - left.strength)
      .slice(0, 5)
    const fit = applicantOverlap.length ? Math.max(...applicantOverlap.map(item => item.strength)) : 0
    const emailVerification = candidate.publicEmail && candidate.emailSourceUrl
      ? 'official_verified'
      : candidate.publicEmail
        ? 'unverified'
        : 'missing'
    const requiredContact = input.pathway.facultyContactPolicy === 'required' || input.pathway.supervisorApprovalBeforeApplication === 'required'
    const explicitlyStronglyRecommended = input.pathway.facultyContactPolicyDetails?.evidence.some(item => /strongly\s+(?:recommend|encourag|advise)/i.test(item.relevantTextSummary)) ?? false
    const recommendation = outreachDisallowed
      ? 'prohibited'
      : requiredContact
        ? (fit > 0 ? 'required' : 'skip')
        : fit >= 0.55 && candidate.currentlyActive !== false
          ? input.pathway.facultyContactPolicy === 'recommended'
            ? explicitlyStronglyRecommended ? 'strongly_recommended' : 'recommended'
            : 'optional'
          : fit >= 0.3 && input.pathway.facultyContactPolicy === 'allowed_or_neutral' ? 'optional' : 'skip'
    const reason = outreachDisallowed
      ? 'The official pathway does not call for faculty contact; use this dossier for programme fit only.'
      : recommendation === 'skip'
        ? 'The current evidence does not show enough programme-specific fit or a need for contact.'
        : requiredContact
          ? 'The pathway requires supervisor support or faculty contact, so this is part of the application route.'
      : input.pathway.facultyContactPolicy === 'allowed_or_neutral'
        ? 'Pre-application faculty contact is optional here; the candidate has a strong, specific research overlap that makes a narrowly tailored message useful.'
        : 'The candidate has an evidence-backed research overlap and is worth considering for a narrowly tailored message.'
    return {
      facultyId: candidate.id,
      name: candidate.name,
      institution: candidate.institution,
      department: candidate.department ?? null,
      title: candidate.title ?? null,
      identityVerification: candidate.currentlyActive === false ? 'uncertain' : 'official_verified',
      identitySourceUrl: candidate.officialProfileUrl,
      email: candidate.publicEmail ?? null,
      emailSourceUrl: candidate.emailSourceUrl ?? null,
      emailVerification,
      officialProfileUrl: candidate.officialProfileUrl,
      labUrl: candidate.labUrl ?? null,
      researchDomain: candidate.researchAreas[0] ?? 'Research faculty',
      researchSubdomains: candidate.researchAreas.slice(1),
      researchSummary: candidate.researchSummary ?? '',
      researchThemes: candidate.researchAreas,
      recentWork: [],
      applicantOverlap,
      fitBreakdown: { overallScore: Math.round(fit * 100), researchAreaFit: Math.round(fit * 100), methodsFit: Math.round(fit * 100), experienceFit: Math.round(fit * 100), facultySpecificFit: Math.round(fit * 100) },
      acceptsStudents: candidate.acceptsStudents ?? 'unknown',
      contactPolicy: input.pathway.facultyContactPolicy,
      outreachRecommendation: recommendation,
      outreachReason: reason,
      draftEmail: null,
      draftStatus: candidate.currentlyActive === false ? 'identity_uncertain' : emailVerification === 'missing' ? 'waiting_for_email' : 'not_applicable',
      attachmentStrategy: { attachCv: Boolean(input.cvArtifactId), ...(input.cvArtifactId ? { cvArtifactId: input.cvArtifactId } : {}) },
      status: 'researching',
      sourceEvidence: candidate.sourceEvidence.map(source => ({ id: source.id, url: source.url, type: 'official', excerpt: source.excerpt })),
    } satisfies FacultyOutreachDossier
  }).sort((left, right) => {
    const recommendationRank: Record<FacultyOutreachDossier['outreachRecommendation'], number> = {
      required: 6, strongly_recommended: 5, recommended: 4, optional: 3, skip: 2, prohibited: 1,
    }
    return recommendationRank[right.outreachRecommendation] - recommendationRank[left.outreachRecommendation] ||
      (right.applicantOverlap[0]?.strength ?? 0) - (left.applicantOverlap[0]?.strength ?? 0) ||
      left.name.localeCompare(right.name)
  })
}

export type AdmissionStrategy = {
  schemaVersion: 1
  id: string
  revision: number
  supersedes?: string | null
  basedOnEvidenceVersion?: number | null
  applicationCaseId: string
  objective: string
  primaryResearchRoute?: string
  alternateResearchRoutes: string[]
  researchNarrative: string
  strongestApplicantSignals: Array<{ signal: string; evidenceId: string }>
  weaknessesOrGaps: Array<{ gap: string; mitigation?: string }>
  facultyStrategy: { targetFacultyIds: string[]; outreachPriority: string[]; rationale: string } | null
  cvStrategy: string[]
  statementStrategy: string[]
  proposalStrategy: string[]
  recommendationStrategy: string[]
  fundingStrategy: string[]
  portalStrategy: string[]
  optionalHighLeverageActions: string[]
  timeSensitiveActions: string[]
  materialEvents: string[]
  generatedAt: string
  revisedAt: string
  basedOnEvidenceIds: string[]
}

export type ApplicationActionKind = 'required' | 'recommended' | 'strategic'
export type ApplicationPlanType =
  | 'programme_research'
  | 'pathway_classification'
  | 'faculty_intelligence'
  | 'faculty_outreach'
  | 'cv'
  | 'statement'
  | 'essay'
  | 'proposal'
  | 'recommendation'
  | 'academic_evidence'
  | 'test'
  | 'funding'
  | 'scholarship'
  | 'fee'
  | 'portal'
  | 'approval'
  | 'submission'
  | 'monitoring'
  | 'follow_up'

export type ApplicationPlanOwner = 'david' | 'roon' | 'browser' | 'writer' | 'user' | 'deterministic_engine'
export type ApplicationPlanExecutionMode = 'autonomous' | 'approval_required' | 'user_input_required'
export type ApplicationPlanStatus = 'planned' | 'ready' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped'

export type ApplicationPlanNode = {
  id: string
  applicationCaseId: string
  /** The durable canonical requirement UUID. Strategic nodes have no value. */
  requirementId?: RequirementId
  requirementCardinality?: RequirementCardinality
  kind: ApplicationActionKind
  type: ApplicationPlanType
  title: string
  priority: number
  expectedImpact: 'critical' | 'high' | 'medium' | 'low'
  dependencies: string[]
  produces: string[]
  owner: ApplicationPlanOwner
  /** Owner of an unresolved value; distinct from the worker owner above. */
  missingValueOwner?: MissingValueOwner | null
  /** Typed programme value available for autonomous mapping, when present. */
  programmeValue?: string | number | boolean | null
  executionMode: ApplicationPlanExecutionMode
  blockingReason?: string | null
  status: ApplicationPlanStatus
  retryState: { attempts: number; maximumAttempts: number; lastFailure: string | null; failureSignature?: string | null; circuitOpen?: boolean }
  evidenceIds: string[]
  deadline: string | null
  estimatedMinutes: number
  externalWaitRisk: 'high' | 'medium' | 'low'
  applicantBlockingRisk: 'high' | 'medium' | 'low'
  parallelGroup?: string | null
}

export type ApplicationOrchestrationRequirement = {
  id: string
  name: string
  type?: string | null
  dependencyIds?: string[]
  required: boolean
  status?: string | null
  exactInstructions?: string | null
  deadline?: string | null
  evidenceIds?: string[]
  linkedArtifactId?: string | null
  canonicalKey?: string | null
  officialWording?: string | null
  requiredLevel?: 'required' | 'optional' | 'conditional' | 'recommended' | null
  condition?: Record<string, unknown> | null
  cardinality?: RequirementCardinality | null
  verificationState?: 'verified' | 'partially_verified' | 'conflicted' | 'unresolved' | null
  applicantState?: 'unknown' | 'missing' | 'available' | 'in_progress' | 'satisfied' | 'not_applicable' | null
  /** Worker responsible for resolving this requirement. This is separate
   * from missingValueOwner, which describes who can supply an unresolved
   * value. */
  responsible?: 'applicant' | 'david' | 'writer' | 'referee' | 'roon' | 'institution' | null
  /** Owner of the unresolved value, not the worker that executes the node. */
  missingValueOwner?: MissingValueOwner | null
  /** Programme metadata already resolved by the opportunity/intelligence pass. */
  programmeValue?: string | number | boolean | null
}

export type ApplicationExecutionPlan = {
  schemaVersion: 1
  applicationCaseId: string
  objective: string
  strategyId: string
  revision: number
  basedOnEvidenceIds: string[]
  nodes: ApplicationPlanNode[]
  criticalPath: string[]
  currentlyRunnable: string[]
  userBlocked: string[]
  externalWaiting: string[]
  generatedAt: string
  revisedAt: string
}

export type ApplicationPlanNodeOutcome = {
  status: 'running' | 'waiting' | 'completed' | 'failed'
  waitingForUser?: boolean
  evidenceIds?: string[]
  blockingReason?: string | null
  failure?: string | null
}

export type ApplicationOrchestrationSnapshot = {
  version: typeof APPLICATION_ORCHESTRATION_VERSION
  evidenceVersion: number
  pathway: GraduateApplicationPathway
  strategy: AdmissionStrategy
  plan: ApplicationExecutionPlan
  facultyCandidates: ProgrammeFacultyCandidate[]
  facultyDossiers: FacultyOutreachDossier[]
  materialEvents: string[]
  updatedAt: string
}

const admissionModels: GraduateApplicationPathway['admissionModel'][] = [
  'central_committee', 'supervisor_first', 'direct_lab_admission', 'rotation_based',
  'project_specific_position', 'programme_plus_supervisor', 'scholarship_coupled',
  'professional_or_coursework', 'mixed', 'unknown',
]

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function lower(value: unknown) {
  return text(value).toLocaleLowerCase()
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
}

function sourceMatches(source: OrchestrationSourceEvidence, patterns: RegExp[]) {
  const value = `${source.excerpt} ${source.url}`
  return patterns.some(pattern => pattern.test(value))
}

function matchingSources(sources: OrchestrationSourceEvidence[], patterns: RegExp[]) {
  return sources.filter(source => ['official', 'government'].includes(source.authority) && sourceMatches(source, patterns))
}

function officialSources(sources: OrchestrationSourceEvidence[]) {
  return sources.filter(source => ['official', 'government'].includes(source.authority) && /^https:\/\//i.test(source.url) && source.excerpt)
}

const facultyContactTerms = /\b(?:contact|email|approach|write\s+to|prospective\s+(?:student|applicant)|faculty|professors?|supervisors?|advis(?:e|or)s?|adviser|find\s+an\s+advisor|potential\s+advisor)\b/i

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))]
}

/**
 * Resolve the programme-level contact policy once from the same authoritative
 * evidence used for pathway classification.  The semantic programme call may
 * provide a richer classification; deterministic checks still reject a
 * missing/contradictory evidence package and distinguish that from a clean
 * search that found no restriction.
 */
export function resolveFacultyContactPolicy(input: {
  sources: OrchestrationSourceEvidence[]
  supplied?: ProgrammeFacultyContactPolicy | null
  cycle?: string | null
  now?: string
}): ProgrammeFacultyContactPolicy {
  const now = input.now ?? new Date().toISOString()
  const sources = officialSources(input.sources)
  const supplied = input.supplied ?? null
  // A search result that only records a retrieval failure is not evidence that
  // the programme has no restriction. Keep this distinct from a successfully
  // checked official page whose excerpt simply contains no contact rule.
  const sourceRetrievalFailed = sources.length > 0 && sources.every(source =>
    /(?:could not|unable to|failed to|error(?:\s+(?:retriev|fetch|load))?|access\s+denied|unavailable|timed\s+out|request\s+failed|page\s+not\s+found|http\s*4(?:0[0134]|2[239])\b)/i.test(source.excerpt),
  )
  // Some programmes discourage applicants from contacting faculty *about
  // admission* while still leaving genuine research-fit conversations open.
  // That narrow instruction is not a prohibition on relevant prospective-
  // student outreach, so it must not be promoted to the programme-wide
  // policy below.
  const admissionOnlyRestriction = (source: OrchestrationSourceEvidence) => /\b(?:contact|email|approach|write\s+to)\b[^.]{0,100}\b(?:about|regarding|for)\s+(?:admission|admissions|the\s+application|applying)\b/i.test(source.excerpt)
  const prohibited = matchingSources(sources, [
    /(?:do|must|may)\s+not\s+(?:contact|email|approach|write\s+to)\s+(?:the\s+)?(?:faculty|professors?|potential\s+supervisors?|supervisors?|advis(?:e|or)s?)/i,
    /(?:cannot|may\s+not|are\s+not\s+(?:permitted|allowed)\s+to)\s+(?:contact|email|approach|write\s+to)\s+(?:the\s+)?(?:faculty|professors?|potential\s+supervisors?|supervisors?|advis(?:e|or)s?)/i,
    /(?:faculty|professors?|potential\s+supervisors?|supervisors?|advis(?:e|or)s?)[^.]{0,80}(?:cannot|may\s+not|are\s+not\s+permitted\s+to\s+be\s+contacted)/i,
    /(?:faculty|professors?|potential\s+supervisors?|supervisors?|advis(?:e|or)s?).{0,80}(?:not\s+permitted|not\s+allowed|prohibited|may\s+not\s+be\s+contacted)/i,
  ]).filter(source => !admissionOnlyRestriction(source))
  const discouraged = matchingSources(sources, [
    /(?:contact|email|approach|write\s+to).{0,80}(?:discouraged|not\s+encouraged|strongly\s+discouraged)/i,
    /(?:faculty|professors?|supervisors?|advis(?:e|or)s?).{0,80}(?:discouraged|not\s+encouraged|strongly\s+discouraged)/i,
    /(?:should|are\s+advised)\s+not\s+(?:contact|email|approach|write\s+to)\s+(?:the\s+)?(?:faculty|professors?|potential\s+supervisors?|supervisors?|advis(?:e|or)s?)/i,
  ]).filter(source => !admissionOnlyRestriction(source))
  const required = matchingSources(sources, [
    /(?:must|required|expected|need(?:s)?|should)\s+(?:first\s+)?(?:contact|email|approach|write\s+to|identify|find|secure|obtain).{0,100}(?:faculty|professors?|potential\s+supervisors?|supervisors?|advis(?:e|or)s?)/i,
    /(?:faculty|professors?|potential\s+supervisors?|supervisors?|advis(?:e|or)s?).{0,100}(?:contact|email|approval|agreement|consent).{0,80}(?:required|must|expected|before\s+applying)/i,
  ]).filter(source => !/\b(?:no|not|never)\b[^.]{0,100}\b(?:required|needed|must)\b/i.test(source.excerpt))
  const recommended = matchingSources(sources, [
    // Keep recommendation-letter requirements separate from actual outreach
    // guidance: "recommendation letters ... faculty" is not a recommendation
    // to contact faculty.
    /(?:strongly\s+)?(?:recommend(?:s|ed)?|encourage(?:s|d)?|suggest(?:s|ed)?|advise(?:s|d)?|useful)\b.{0,100}(?:contact|email|approach|write\s+to|faculty|professors?|supervisors?|advis(?:e|or)s?)/i,
    /(?:contact|email|approach|write\s+to).{0,100}(?:faculty|professors?|supervisors?|advis(?:e|or)s?).{0,80}(?:recommended|encouraged|advised|useful)/i,
    /(?:faculty|professors?|supervisors?|advis(?:e|or)s?|outreach|contact|email)[^.]{0,100}\b(?:strongly\s+)?(?:recommended|encouraged|advised|useful)\b/i,
  ]).filter(source => !/\b(?:not|never)\s+(?:recommended|encouraged|advised|useful)\b/i.test(source.excerpt))
  const explicitMatches = [prohibited, discouraged, required, recommended].filter(group => group.length > 0).length
  const contradictory = (prohibited.length > 0 && (discouraged.length > 0 || required.length > 0 || recommended.length > 0)) ||
    (discouraged.length > 0 && (required.length > 0 || recommended.length > 0)) ||
    (required.length > 0 && prohibited.length > 0)

  let classification: FacultyContactPolicy
  if ((!sources.length && !(supplied?.searchedSources?.length || supplied?.evidence?.length)) || sourceRetrievalFailed) classification = 'unknown_due_to_insufficient_evidence'
  else if (contradictory) classification = 'unknown_due_to_insufficient_evidence'
  else if (prohibited.length) classification = 'prohibited'
  else if (discouraged.length) classification = 'discouraged'
  else if (required.length) classification = 'required'
  else if (recommended.length) classification = 'recommended'
  else if (supplied && supplied.classification !== 'unknown_due_to_insufficient_evidence') classification = supplied.classification
  else classification = 'allowed_or_neutral'

  const matched = [...prohibited, ...discouraged, ...required, ...recommended]
  const suppliedEvidence = supplied?.evidence ?? []
  const evidence = uniqueStrings([
    ...suppliedEvidence.map(item => `${item.url}\u0000${item.relevantTextSummary}`),
    ...matched.map(source => `${source.url}\u0000${source.excerpt}`),
    ...sources.filter(source => facultyContactTerms.test(source.excerpt)).map(source => `${source.url}\u0000${source.excerpt}`),
    ...sources.slice(0, 4).map(source => `${source.url}\u0000${source.excerpt}`),
  ]).map(value => {
    const [url, ...summary] = value.split('\u0000')
    return { url, relevantTextSummary: summary.join('\u0000').slice(0, 1_200) }
  }).filter(item => item.url && item.relevantTextSummary).slice(0, 12)
  const searchedSources = uniqueStrings([
    ...(supplied?.searchedSources ?? []),
    ...sources.map(source => source.url),
  ]).slice(0, 24)
  const explicitRuleFound = Boolean(supplied?.explicitRuleFound || explicitMatches || ['required', 'recommended', 'discouraged', 'prohibited'].includes(classification))
  const explanation = supplied?.explanation && classification === supplied.classification && !contradictory
    ? supplied.explanation
    : classification === 'allowed_or_neutral'
      ? 'A bounded search of current authoritative programme sources found no rule discouraging or prohibiting relevant prospective-student faculty contact. This does not mean the programme explicitly recommends contacting faculty.'
      : classification === 'unknown_due_to_insufficient_evidence'
        ? 'The current authoritative programme sources were unavailable, incomplete, or contradictory, so faculty-contact policy could not be determined reliably.'
        : matched[0]?.excerpt ?? supplied?.explanation ?? ''
  return {
    classification,
    explanation: text(explanation).slice(0, 2_000),
    evidence,
    searchedSources,
    explicitRuleFound,
    retrievedAt: supplied?.retrievedAt ?? sources[0]?.retrievedAt ?? now,
    cycle: input.cycle ?? supplied?.cycle ?? null,
  }
}

function pathwayDefaults(now: string): GraduateApplicationPathway {
  return {
    schemaVersion: 1,
    admissionModel: 'unknown',
    applicationRoute: 'unknown',
    facultyContactPolicy: 'unknown_due_to_insufficient_evidence',
    facultyContactPolicyDetails: null,
    supervisorApprovalBeforeApplication: 'unknown',
    supervisorNamedInApplication: 'unknown',
    researchProposalPolicy: 'unknown',
    fundingModel: 'unknown',
    recommendationModel: { count: null, academicRequired: null, submissionMethod: 'unknown' },
    evidence: [],
    confidence: 0,
    classifiedAt: now,
  }
}

/**
 * Classify only from current official evidence. Unknown is intentional: it is
 * safer to research one more authoritative page than to invent a faculty or
 * funding obligation from a country-level convention.
 */
export function classifyGraduateApplicationPathway(input: {
  evidence: OrchestrationSourceEvidence[]
  facultyContactPolicy?: unknown
  cycle?: string | null
  now?: string
}): GraduateApplicationPathway {
  const now = input.now ?? new Date().toISOString()
  const sources = officialSources(input.evidence).slice(0, 40)
  const result = pathwayDefaults(now)
  result.evidence = sources.slice(0, 20)
  const suppliedPolicy = normalizeFacultyContactPolicy(input.facultyContactPolicy)
  result.facultyContactPolicyDetails = resolveFacultyContactPolicy({ sources, supplied: suppliedPolicy, cycle: input.cycle, now })
  result.facultyContactPolicy = result.facultyContactPolicyDetails.classification
  if (!sources.length && !suppliedPolicy?.searchedSources.length && !suppliedPolicy?.evidence.length) return result

  const has = (patterns: RegExp[]) => sources.some(source => sourceMatches(source, patterns))
  const supervisorNotRequired = has([/no\s+(?:prior\s+)?supervisor\s+(?:approval|agreement)/i, /supervisor.*not\s+required/i, /supervisor.*approval.*is\s+not\s+required/i])
  const supervisorRequired = !supervisorNotRequired && has([/must\s+(?:first\s+)?(?:identify|contact|secure|obtain).*supervisor/i, /supervisor.*(?:approval|agreement|consent).*before/i, /admission.*depends.*supervisor/i])
  const projectSpecific = has([/project[- ]specific/i, /advertised\s+(?:phd|doctoral)\s+(?:project|position)/i, /doctoral\s+(?:researcher|student)\s+vacanc/i, /apply\s+for\s+the\s+project/i])
  const rotation = has([/lab\s+rotation/i, /rotations?\s+(?:through|across|in)\s+(?:the|our)\s+(?:labs?|groups?)/i, /first[- ]year\s+rotations?/i])
  const directLab = has([/apply\s+directly\s+to\s+(?:a\s+)?(?:lab|laboratory|research\s+group)/i, /lab[- ]based\s+admission/i])
  const scholarship = has([/(?:external|separate)\s+scholarship.*(?:required|must|before)/i, /scholarship.*(?:prerequisite|condition).*application/i, /funding\s+application.*required/i])
  const coursework = has([/coursework[- ]based/i, /professional\s+(?:doctorate|programme|program)/i, /taught\s+(?:master|doctor)/i])
  const committee = has([/admission(?:s)?\s+(?:is|are)\s+(?:made|decided|determined)\s+by\s+(?:the\s+)?(?:departmental\s+)?(?:admissions?\s+)?committee/i, /applications?\s+are\s+reviewed\s+by\s+(?:the\s+|a\s+)?(?:departmental\s+)?(?:admissions?\s+)?committee/i, /central\s+admissions?/i])

  const modelSignals = [projectSpecific, rotation, directLab, supervisorRequired, scholarship, coursework, committee].filter(Boolean).length
  if (projectSpecific) result.admissionModel = 'project_specific_position'
  else if (rotation) result.admissionModel = 'rotation_based'
  else if (directLab) result.admissionModel = 'direct_lab_admission'
  else if (supervisorRequired) result.admissionModel = 'supervisor_first'
  else if (scholarship) result.admissionModel = 'scholarship_coupled'
  else if (coursework) result.admissionModel = 'professional_or_coursework'
  else if (committee) result.admissionModel = 'central_committee'

  if (has([/apply\s+(?:through|via)\s+(?:the\s+)?(?:central|university|graduate\s+school|graduate\s+admissions?)\s+portal/i, /(?:submit|submitted)\s+(?:(?:your\s+)?application\s+)?through\b[^.]{0,120}\bapplication\s+portal/i, /university[- ]wide\s+application\s+portal/i, /central\s+(?:graduate\s+)?admissions?\s+portal/i])) result.applicationRoute = 'central_portal'
  else if (has([/department(?:al)?\s+application\s+portal/i, /apply\s+through\s+the\s+department/i])) result.applicationRoute = 'department_portal'
  else if (projectSpecific) result.applicationRoute = 'job_vacancy'
  else if (supervisorRequired) result.applicationRoute = 'supervisor_then_portal'
  else if (scholarship && has([/apply\s+for\s+(?:the\s+)?scholarship\s+before/i, /external\s+scholarship\s+then/i])) result.applicationRoute = 'external_scholarship_then_programme'
  else if (has([/submit\s+your\s+application\s+by\s+email/i, /email\s+application/i])) result.applicationRoute = 'email_application'

  // The policy package is authoritative for contact semantics. Supervisor
  // requirements still imply required contact when the package omitted that
  // field, while a successful search with no explicit rule remains neutral.
  const classifiedPolicy = resolveFacultyContactPolicy({ sources, supplied: suppliedPolicy, cycle: input.cycle, now })
  result.facultyContactPolicyDetails = classifiedPolicy
  result.facultyContactPolicy = supervisorRequired && classifiedPolicy.classification === 'allowed_or_neutral'
    ? 'required'
    : classifiedPolicy.classification

  result.supervisorApprovalBeforeApplication = supervisorRequired
    ? 'required'
    : has([/supervisor.*(?:encouraged|recommended).*before/i, /contact.*supervisor.*recommended.*before/i]) ? 'recommended'
      : has([/no\s+(?:prior\s+)?supervisor\s+(?:approval|agreement)/i, /supervisor.*not\s+required/i]) ? 'not_required' : 'unknown'
  result.supervisorNamedInApplication = has([/(?:must|required\s+to)\s+name.*(?:supervisor|faculty|advisor)/i, /prospective\s+supervisor.*required/i])
    ? 'required'
    : has([/name.*(?:supervisor|faculty|advisor).*optional/i]) ? 'optional'
      : has([/supervisor.*(?:not\s+requested|not\s+needed)/i]) ? 'not_requested' : 'unknown'

  const proposalNotRequired = has([/no\s+(?:separate\s+)?(?:research\s+proposal|proposal)\s+(?:is\s+)?(?:required|needed)/i, /(?:research\s+proposal|proposal)\s+is\s+not\s+(?:required|needed)/i])
  result.researchProposalPolicy = proposalNotRequired
    ? 'not_required'
    : has([/(?:research\s+proposal|proposal).*\b(?:required|must\s+submit|submit.*required)/i])
    ? 'required'
    : has([/(?:research\s+proposal|proposal).*recommended/i]) ? 'recommended'
      : has([/(?:research\s+proposal|proposal).*optional/i]) ? 'optional'
        : has([/no\s+(?:research\s+)?proposal\s+(?:is\s+)?required/i, /proposal.*not\s+required/i]) ? 'not_required' : 'unknown'

  if (projectSpecific) result.fundingModel = 'project_funded'
  else if (has([/principal\s+investigator.*fund/i, /pi[- ]funded/i, /funding.*depends.*(?:faculty|principal\s+investigator)/i])) result.fundingModel = 'pi_funded'
  else if (scholarship) result.fundingModel = 'scholarship_required'
  else if (has([/all\s+(?:admitted|incoming)\s+students.*funded/i, /(?:admitted|incoming)[^.]{0,80}(?:receive|are\s+provided|are\s+guaranteed).*programme\s+funding/i, /guaranteed\s+(?:full|five[- ]year)\s+funding/i, /programme[- ]funded/i])) result.fundingModel = 'programme_funded'
  else if (has([/self[- ]funded/i, /self[- ]funding\s+(?:is|may be)\s+possible/i])) result.fundingModel = 'self_funded_possible'

  const countWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
  const countMatches = sources.flatMap(source => {
    const value = source.excerpt
    return [...value.matchAll(/\b(?:at\s+least\s+)?(one|two|three|four|five|six|seven|eight|nine|[2-9])\s+(?:(?:academic|professional|other)\s+)?(?:letters?|recommendations?|referees?)/gi)]
      .map(match => countWords[lower(match[1])] ?? Number(match[1]))
  }).filter(Number.isInteger)
  result.recommendationModel.count = countMatches.length ? Math.max(...countMatches) : null
  result.recommendationModel.academicRequired = has([/academic\s+(?:references?|recommendations?|letters?)/i, /professor(?:s)?\s+or\s+academic/i]) ? true : has([/professional\s+references?/i]) ? false : null
  if (has([/recommend(?:er|ation).*portal\s+invitation/i, /enter.*referee.*email.*portal/i])) result.recommendationModel.submissionMethod = 'portal_invitation'
  else if (has([/recommend(?:er|ation).*email/i])) result.recommendationModel.submissionMethod = 'email'
  else if (has([/applicant.*upload.*recommend/i])) result.recommendationModel.submissionMethod = 'applicant_upload'

  const fieldsKnown = [result.admissionModel !== 'unknown', result.applicationRoute !== 'unknown', result.facultyContactPolicy !== 'unknown_due_to_insufficient_evidence', result.researchProposalPolicy !== 'unknown', result.fundingModel !== 'unknown', result.recommendationModel.count !== null].filter(Boolean).length
  result.confidence = clamp((Math.min(1, fieldsKnown / 6) * 0.7) + (modelSignals > 0 ? 0.2 : 0) + (sources.length > 1 ? 0.1 : 0))
  return result
}

export function validateGraduateApplicationPathway(value: unknown, authoritativeEvidence: OrchestrationSourceEvidence[]) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const allowed = <T extends string>(raw: unknown, values: readonly T[], fallback: T) => values.includes(String(raw) as T) ? String(raw) as T : fallback
  const baseline = classifyGraduateApplicationPathway({ evidence: authoritativeEvidence })
  const safeEvidence = officialSources(authoritativeEvidence)
  const evidenceIds = new Set(safeEvidence.map(item => item.id))
  const candidateEvidence = Array.isArray(candidate.evidence)
    ? candidate.evidence.filter(item => item && typeof item === 'object' && evidenceIds.has(text((item as Record<string, unknown>).id))).map(item => safeEvidence.find(source => source.id === text((item as Record<string, unknown>).id))!).filter(Boolean)
    : []
  // A model may refine a deterministic classification, but it may not create a
  // pathway decision without citing the same authoritative evidence.
  const evidence = candidateEvidence.length ? candidateEvidence : baseline.evidence
  const candidatePolicyValue = candidate.facultyContactPolicy && typeof candidate.facultyContactPolicy === 'object'
    ? (candidate.facultyContactPolicy as Record<string, unknown>).classification
    : candidate.facultyContactPolicy
  const candidatePolicy = candidatePolicyValue === undefined || candidatePolicyValue === null || candidatePolicyValue === ''
    ? baseline.facultyContactPolicy
    : normalizeFacultyContactPolicyClassification(candidatePolicyValue)
  const candidatePolicyDetails = normalizeFacultyContactPolicy(candidate.facultyContactPolicyDetails ?? candidate.facultyContactPolicyEvidence)
  const output = { ...baseline,
    admissionModel: allowed(candidate.admissionModel, admissionModels, baseline.admissionModel),
    applicationRoute: allowed(candidate.applicationRoute, ['central_portal', 'department_portal', 'supervisor_then_portal', 'job_vacancy', 'email_application', 'external_scholarship_then_programme', 'mixed', 'unknown'] as const, baseline.applicationRoute),
    facultyContactPolicy: FACULTY_CONTACT_POLICY_VALUES.includes(candidatePolicy) ? candidatePolicy : baseline.facultyContactPolicy,
    facultyContactPolicyDetails: candidatePolicyDetails ?? baseline.facultyContactPolicyDetails,
    supervisorApprovalBeforeApplication: allowed(candidate.supervisorApprovalBeforeApplication, ['required', 'recommended', 'not_required', 'unknown'] as const, baseline.supervisorApprovalBeforeApplication),
    supervisorNamedInApplication: allowed(candidate.supervisorNamedInApplication, ['required', 'optional', 'not_requested', 'unknown'] as const, baseline.supervisorNamedInApplication),
    researchProposalPolicy: allowed(candidate.researchProposalPolicy, ['required', 'recommended', 'optional', 'not_required', 'unknown'] as const, baseline.researchProposalPolicy),
    fundingModel: allowed(candidate.fundingModel, ['programme_funded', 'pi_funded', 'project_funded', 'scholarship_required', 'self_funded_possible', 'mixed', 'unknown'] as const, baseline.fundingModel),
    evidence,
  }
  if (!evidence.length) return baseline
  output.confidence = Math.min(baseline.confidence, clamp(Number(candidate.confidence) || baseline.confidence))
  return output
}

function typeForRequirement(requirement: ApplicationOrchestrationRequirement): ApplicationPlanType | null {
  const value = lower(`${requirement.type ?? ''} ${requirement.name}`)
  if (/official[_ ]requirement|admission[_ ]requirement/.test(value)) {
    return isApplicationSubmissionMethodRequirement(requirement) ? 'portal' : 'programme_research'
  }
  if (/deadline|eligibility|official requirement|admission requirement/.test(value)) return 'programme_research'
  if (/cv|resume|curriculum/.test(value)) return 'cv'
  if (/document|artifact|work sample|writing sample|portfolio/.test(value)) return 'academic_evidence'
  if (/proposal/.test(value)) return 'proposal'
  if (/statement|essay|personal statement|motivation|sop/.test(value)) return /essay/.test(value) ? 'essay' : 'statement'
  if (/recommend|referee|reference letter/.test(value)) return 'recommendation'
  if (/transcript|degree|academic record|credential|graduation/.test(value)) return 'academic_evidence'
  if (/gre|gmat|test|english|toefl|ielts|language/.test(value)) return 'test'
  if (/scholarship/.test(value)) return 'scholarship'
  if (/funding|assistantship|stipend/.test(value)) return 'funding'
  if (/fee|waiver|payment/.test(value)) return 'fee'
  if (/portal|application form|section/.test(value)) return 'portal'
  // Keep generic uploaded documents in the execution graph as evidence work.
  // The canonical type is often only `document` for writing samples,
  // credential evaluations, and legacy CV rows; dropping those rows would
  // make optional/no-op decisions impossible to persist.
  if (/document|attachment|file|credential evaluation/.test(value)) return 'academic_evidence'
  if (/supervisor|faculty|professor|principal investigator|lab contact/.test(value)) return 'faculty_outreach'
  return null
}

function completeStatus(requirement: ApplicationOrchestrationRequirement) {
  // Evidence is not completion by itself. Official source evidence can prove
  // that a requirement exists; it cannot prove that the applicant supplied
  // the required artifact or that the portal accepted it.
  const status = lower(requirement.status)
  if (!['verified', 'ready', 'approved', 'submitted', 'waived', 'completed'].includes(status)) return false
  if (status !== 'verified') return true
  if (requirement.linkedArtifactId) return true
  return !requiresApplicantSpecificEvidence({
    name: requirement.name,
    requirement_type: requirement.type,
    responsible_party: requirement.missingValueOwner === 'applicant' || requirement.missingValueOwner === 'user_choice' ? 'applicant' : undefined,
    source: { missing_value_owner: requirement.missingValueOwner },
  })
}

function ownerFor(type: ApplicationPlanType): ApplicationPlanOwner {
  if (['faculty_outreach', 'recommendation'].includes(type)) return type === 'recommendation' ? 'roon' : 'david'
  if (type === 'portal') return 'browser'
  if (['statement', 'essay', 'proposal'].includes(type)) return 'writer'
  if (['academic_evidence', 'test'].includes(type)) return 'roon'
  return type === 'approval' || type === 'submission' || type === 'monitoring' ? 'deterministic_engine' : 'david'
}

function impactFor(kind: ApplicationActionKind, type: ApplicationPlanType): ApplicationPlanNode['expectedImpact'] {
  if (kind === 'required' || ['faculty_outreach', 'recommendation', 'scholarship', 'test'].includes(type)) return 'critical'
  if (['cv', 'statement', 'essay', 'proposal', 'faculty_intelligence', 'portal'].includes(type)) return 'high'
  return kind === 'recommended' ? 'medium' : 'low'
}

function newNode(input: Omit<ApplicationPlanNode, 'retryState' | 'status' | 'evidenceIds'> & { status?: ApplicationPlanStatus; evidenceIds?: string[]; blockingReason?: string | null }) : ApplicationPlanNode {
  return {
    ...input,
    id: asPlanNodeId(input.id),
    status: input.status ?? 'planned',
    blockingReason: input.blockingReason ?? null,
    retryState: { attempts: 0, maximumAttempts: 3, lastFailure: null, failureSignature: null, circuitOpen: false },
    evidenceIds: input.evidenceIds ?? [],
  }
}

function isFutureApplicationRequirement(requirement: Pick<ApplicationOrchestrationRequirement, 'name' | 'exactInstructions' | 'officialWording' | 'condition'>) {
  const text = `${requirement.name} ${requirement.exactInstructions ?? ''} ${requirement.officialWording ?? ''} ${JSON.stringify(requirement.condition ?? {})}`
  return /\b(?:after admission|after acceptance|once admitted|upon admission|upon enrollment|post[- ]admission|after you are admitted|following admission)\b/i.test(text)
}

function dependenciesSatisfied(node: ApplicationPlanNode, byId: Map<string, ApplicationPlanNode>) {
  return node.dependencies.every(id => ['completed', 'skipped'].includes(byId.get(id)?.status ?? 'planned'))
}

function nodeStatusFor(node: ApplicationPlanNode, existing: ApplicationPlanNode | undefined, byId: Map<string, ApplicationPlanNode>) {
  // Optional, conditional branches that have been ruled out, and post-
  // admission requirements are durable no-ops.  This takes precedence over a
  // stale completed/awaiting state from an earlier model projection so they
  // never reappear as user-facing work after a replan.
  if (node.status === 'skipped') return 'skipped' as const
  if (existing?.status === 'skipped') return 'skipped' as const
  if (existing?.status === 'completed') return existing.status
  // A circuit-open node has exhausted its bounded retries. Preserve that
  // durable failure across a later evidence replan; treating the freshly
  // compiled draft as ready would silently reopen the same broken lane and
  // starve independent application work.
  if (existing?.status === 'failed' && existing.retryState?.circuitOpen) return 'failed' as const
  if (node.status === 'completed') return node.status
  // Electronic-submission rules are portal contracts, not applicant-held
  // facts. A stale model turn must not preserve them as a user-waiting node.
  if (isApplicationSubmissionMethodRequirement({ name: node.title }) && dependenciesSatisfied(node, byId)) return 'ready' as const
  if (node.status === 'waiting' || node.status === 'failed') return node.status
  if (dependenciesSatisfied(node, byId)) return 'ready' as const
  return 'planned' as const
}

function addRequirementNodes(
  nodes: ApplicationPlanNode[],
  requirements: ApplicationOrchestrationRequirement[],
  strategyId: string,
  caseId: string,
) {
  const knownRequirementNodeIds = new Set(requirements.map(requirement => `requirement:${requirement.id}`))
  for (const requirement of requirements) {
    const type = typeForRequirement(requirement)
    if (!type) continue
    const kind: ApplicationActionKind = requirement.required ? 'required' : 'recommended'
    const id = `requirement:${requirement.id}`
    const dependencies = [`strategy:${strategyId}`]
    const dependencyRequirements = (requirement.dependencyIds ?? [])
      .map(dependencyId => `requirement:${dependencyId}`)
      .filter(dependencyId => knownRequirementNodeIds.has(dependencyId))
    const submissionMethod = isApplicationSubmissionMethodRequirement(requirement)
    const missingValueOwner = requirement.missingValueOwner ?? missingValueOwnerForRequirement({
      name: requirement.name,
      type: requirement.type,
      canonicalKey: requirement.canonicalKey,
      exactInstructions: requirement.exactInstructions ?? requirement.officialWording,
      responsible: requirement.responsible,
    })
    const waitingForUser = !submissionMethod && ['applicant', 'user_choice'].includes(missingValueOwner) && ['awaiting_user', 'waiting'].includes(lower(requirement.status))
    const futureRequirement = isFutureApplicationRequirement(requirement)
    const notApplicable = futureRequirement || requirement.required === false ||
      ['optional', 'recommended'].includes(requirement.requiredLevel ?? '') || requirement.applicantState === 'not_applicable'
    const applicantArtifactType = ['academic_evidence', 'test'].includes(type) || /transcript|document|language|proficiency|score|test/i.test(`${requirement.name} ${requirement.type ?? ''}`)
    const unresolvedApplicantState = ['awaiting_user', 'waiting', 'missing', 'blocked', 'unresolved'].includes(lower(requirement.status)) || requirement.applicantState === 'missing'
    const applicantEvidenceMissing = !futureRequirement && requirement.required && applicantArtifactType && unresolvedApplicantState && missingValueOwner === 'applicant' && lower(requirement.status) !== 'verified' && requiresApplicantSpecificEvidence({ name: requirement.name, requirement_type: requirement.type, source: { missing_value_owner: missingValueOwner } }) && !requirement.linkedArtifactId && requirement.applicantState !== 'satisfied'
    const owner = waitingForUser || applicantEvidenceMissing ? 'user' : ownerFor(type)
    nodes.push(newNode({
      id,
      applicationCaseId: caseId,
      ...(asRequirementIdOrNull(requirement.id) ? { requirementId: asRequirementIdOrNull(requirement.id)! } : {}),
      ...(requirement.cardinality ? { requirementCardinality: requirement.cardinality } : {}),
      kind,
      type,
      title: requirement.name,
      priority: requirement.required ? 10 : 50,
      expectedImpact: impactFor(kind, type),
      dependencies: unique([...dependencies, ...dependencyRequirements]),
      produces: [`requirement:${requirement.id}:verified`],
      owner,
      missingValueOwner,
      programmeValue: requirement.programmeValue ?? null,
      executionMode: owner === 'user' ? 'user_input_required' : 'autonomous',
      status: notApplicable ? 'skipped' : completeStatus({ ...requirement, missingValueOwner }) ? 'completed' : waitingForUser || applicantEvidenceMissing ? 'waiting' : lower(requirement.status) === 'blocked' ? 'failed' : undefined,
      blockingReason: notApplicable ? (futureRequirement ? 'Needed only after admission.' : 'Not required for this application.') : waitingForUser || applicantEvidenceMissing ? text(requirement.exactInstructions) || 'Add the missing applicant evidence for this requirement.' : null,
      evidenceIds: requirement.evidenceIds ?? [],
      deadline: requirement.deadline ?? null,
      estimatedMinutes: type === 'academic_evidence' || type === 'test' ? 20 : type === 'cv' ? 45 : 30,
      externalWaitRisk: ['recommendation', 'faculty_outreach', 'academic_evidence', 'test'].includes(type) ? 'high' : 'low',
      applicantBlockingRisk: ['academic_evidence', 'test'].includes(type) ? 'high' : requirement.required ? 'medium' : 'low',
      parallelGroup: 'application-preparation',
    }))
  }
}

/**
 * The deterministic compiler boundary. It accepts normalized requirement
 * records only and emits plan nodes with a separate plan identity and, when
 * applicable, the canonical persisted requirement UUID.
 */
export function compileApplicationRequirementsToPlanNodes(input: {
  requirements: ApplicationOrchestrationRequirement[]
  strategyId: string
  applicationCaseId: string
}) {
  const nodes: ApplicationPlanNode[] = []
  addRequirementNodes(nodes, input.requirements, input.strategyId, input.applicationCaseId)
  return nodes
}

function materializePlan(
  drafts: ApplicationPlanNode[],
  input: { applicationCaseId: string; objective: string; strategyId: string; basedOnEvidenceIds: string[]; now: string; existing?: ApplicationExecutionPlan | null },
) {
  const existingById = new Map((input.existing?.nodes ?? []).map(node => [node.id, node]))
  const initialById = new Map(drafts.map(node => [node.id, node]))
  for (const node of drafts) {
    const existing = existingById.get(node.id)
    node.status = nodeStatusFor(node, existing, initialById)
    if (existing) {
      node.evidenceIds = unique([...node.evidenceIds, ...existing.evidenceIds])
      node.retryState = existing.retryState
      if (existing.blockingReason) node.blockingReason = existing.blockingReason
      // Preserve a programme-level deadline across a replan when the latest
      // evidence refresh did not repeat it. A newly supplied requirement or
      // opportunity deadline still wins because it is already on `node`.
      if (!node.deadline && existing.deadline) node.deadline = existing.deadline
    }
  }
  const byId = new Map(drafts.map(node => [node.id, node]))
  for (const node of drafts) node.status = nodeStatusFor(node, existingById.get(node.id), byId)
  const runnable = drafts.filter(node => ['ready', 'running'].includes(node.status) && dependenciesSatisfied(node, byId)).map(node => node.id)
  const userBlocked = drafts.filter(node => node.status === 'waiting' && node.executionMode === 'user_input_required').map(node => node.id)
  const externalWaiting = drafts.filter(node => node.status === 'waiting' && node.executionMode !== 'user_input_required').map(node => node.id)
  const graph = new Map(drafts.map(node => [node.id, node]))
  const deadlinePressure = (node: ApplicationPlanNode) => {
    const deadline = Date.parse(node.deadline ?? '')
    const reference = Date.parse(input.now)
    if (!Number.isFinite(deadline) || !Number.isFinite(reference)) return 0
    const days = (deadline - reference) / 86_400_000
    if (days <= 0) return 240
    if (days <= 7) return 180
    if (days <= 30) return 100
    if (days <= 90) return 45
    return 0
  }
  const score = (node: ApplicationPlanNode) => node.estimatedMinutes +
    (node.externalWaitRisk === 'high' ? 120 : node.externalWaitRisk === 'medium' ? 45 : 0) +
    (node.expectedImpact === 'critical' ? 20 : 0) +
    deadlinePressure(node)
  const memo = new Map<string, { score: number; path: string[] }>()
  const longest = (id: string, visiting = new Set<string>()): { score: number; path: string[] } => {
    const cached = memo.get(id)
    if (cached) return cached
    if (visiting.has(id)) return { score: 0, path: [] }
    const node = graph.get(id)
    if (!node) return { score: 0, path: [] }
    const nextVisiting = new Set(visiting).add(id)
    const dependencyBest = node.dependencies.map(dependency => longest(dependency, nextVisiting)).sort((left, right) => right.score - left.score)[0] ?? { score: 0, path: [] }
    const value = { score: score(node) + dependencyBest.score, path: [...dependencyBest.path, node.id] }
    memo.set(id, value)
    return value
  }
  const criticalPath = drafts.map(node => longest(node.id)).sort((left, right) => right.score - left.score)[0]?.path ?? []
  const revision = Math.max(1, Number(input.existing?.revision ?? 0) + (input.existing ? 1 : 0))
  return {
    schemaVersion: 1 as const,
    applicationCaseId: input.applicationCaseId,
    objective: input.objective,
    strategyId: input.strategyId,
    revision,
    basedOnEvidenceIds: unique(input.basedOnEvidenceIds),
    nodes: drafts,
    criticalPath,
    currentlyRunnable: runnable,
    userBlocked,
    externalWaiting,
    generatedAt: input.existing?.generatedAt ?? input.now,
    revisedAt: input.now,
  } satisfies ApplicationExecutionPlan
}

export function buildAdmissionStrategy(input: {
  applicationCaseId: string
  objective: string
  institution: string
  programmeTitle: string
  pathway: GraduateApplicationPathway
  researchAreas?: string[]
  methods?: string[]
  applicantSignals?: ApplicantSignal[]
  facultyCandidates?: ProgrammeFacultyCandidate[]
  requirements?: ApplicationOrchestrationRequirement[]
  materialEvents?: string[]
  now?: string
  existing?: AdmissionStrategy | null
  evidenceVersion?: number
}): AdmissionStrategy {
  const now = input.now ?? new Date().toISOString()
  const areas = unique((input.researchAreas ?? []).map(text).filter(Boolean)).slice(0, 6)
  const methods = unique((input.methods ?? []).map(text).filter(Boolean)).slice(0, 6)
  const signals = (input.applicantSignals ?? []).filter(signal => signal.id && text(signal.signal)).slice(0, 8)
  const requirements = input.requirements ?? []
  const materialEvents = unique((input.materialEvents ?? []).map(text).filter(Boolean)).slice(-12)
  const requiredNames = requirements.filter(item => item.required && !completeStatus(item)).map(item => item.name).slice(0, 8)
  const route = input.pathway.admissionModel === 'project_specific_position'
    ? 'the advertised project and its named research team'
    : input.pathway.admissionModel === 'supervisor_first' || input.pathway.admissionModel === 'direct_lab_admission'
      ? 'a verified supervisor or lab fit before the formal portal route'
      : input.pathway.admissionModel === 'rotation_based'
        ? 'a coherent research direction that can credibly span the programme’s rotation structure'
        : `the ${input.programmeTitle} admissions route`
  const outreachAllowed = !['discouraged', 'prohibited'].includes(input.pathway.facultyContactPolicy)
  const strategy: AdmissionStrategy = {
    schemaVersion: 1,
    id: input.existing?.id ?? `strategy:${input.applicationCaseId}`,
    revision: (input.existing?.revision ?? 0) + 1,
    supersedes: input.existing ? `${input.existing.id}@${input.existing.revision}` : null,
    basedOnEvidenceVersion: input.evidenceVersion ?? null,
    applicationCaseId: input.applicationCaseId,
    objective: `Build the strongest evidence-backed application for ${input.programmeTitle} at ${input.institution}.`,
    primaryResearchRoute: route,
    alternateResearchRoutes: areas.slice(1, 4),
    researchNarrative: areas.length
      ? `Position the applicant around ${areas.join(', ')}${methods.length ? ` using ${methods.join(', ')}` : ''}, and connect each claim to verified applicant evidence.`
      : 'Use the programme’s verified research areas and the applicant’s confirmed record to define one coherent research direction.',
    strongestApplicantSignals: signals.slice(0, 5).map(signal => ({ signal: signal.signal, evidenceId: signal.id })),
    weaknessesOrGaps: requiredNames.map(name => ({ gap: `The requirement “${name}” is not yet verified.`, mitigation: 'Start the evidence or preparation route early and keep unrelated work moving.' })),
    facultyStrategy: outreachAllowed ? {
      targetFacultyIds: (input.facultyCandidates ?? []).slice(0, 5).map(candidate => candidate.id),
      outreachPriority: input.pathway.facultyContactPolicy === 'required' || input.pathway.supervisorApprovalBeforeApplication === 'required' ? ['required', 'recommended'] : ['recommended', 'optional'],
      rationale: input.pathway.facultyContactPolicy === 'unknown_due_to_insufficient_evidence'
        ? 'Faculty contact needs one targeted policy-evidence repair before outreach is decided.'
        : `Faculty work will be used only where the official pathway and applicant fit make contact worthwhile (${input.pathway.facultyContactPolicy}).`,
    } : null,
    cvStrategy: [
      `Tailor the CV to ${input.programmeTitle}, not to the institution in general.`,
      'Lead with the applicant’s strongest verified research signals and methods.',
      'Keep every factual claim traceable to the authoritative CV or applicant evidence.',
    ],
    statementStrategy: [
      'Use the same research narrative as the CV and proposal.',
      areas.length ? `Connect the applicant’s record to ${areas.slice(0, 3).join(', ')}.` : 'Use only verified programme and applicant evidence until research fit is clearer.',
      'Address the exact programme prompt and length limit from the official source.',
      ...(materialEvents.some(event => /professor_replied|supervisor_accepted/.test(event)) ? ['Incorporate only the supervisor or faculty guidance that is preserved in the latest verified communication evidence.'] : []),
      ...(materialEvents.some(event => /supervisor_declined|funding_changed|source_conflict_found/.test(event)) ? ['Recheck the research route and remove stale references to the changed or rejected path.'] : []),
    ],
    proposalStrategy: input.pathway.researchProposalPolicy === 'not_required' ? [] : ['Create a proposal only when the official route requires, recommends, or materially benefits from it.', 'Tie methods, feasibility, and programme fit to verified evidence.'],
    recommendationStrategy: ['Use the official recommender count, relationship, and submission method.', 'Start long-lead referee work early and never claim a letter is complete without provider evidence.'],
    fundingStrategy: input.pathway.fundingModel === 'unknown' ? ['Verify the programme funding model before promising a funding route.'] : [`Follow the ${input.pathway.fundingModel.replaceAll('_', ' ')} route and its separate deadlines where applicable.`],
    portalStrategy: ['Inspect the official portal early.', 'Map fields only to verified applicant facts, leave unsupported optional fields blank, and read back every saved section.', ...(materialEvents.some(event => /official_requirement_changed|portal_requirement_discovered|deadline_changed/.test(event)) ? ['Revalidate the affected portal sections and current deadline before relying on any earlier checkpoint.'] : [])],
    optionalHighLeverageActions: outreachAllowed ? ['Research a small number of high-fit faculty rather than mass emailing.'] : ['Use faculty research to strengthen the application without creating unnecessary outreach.'],
    timeSensitiveActions: [
      ...(input.pathway.supervisorApprovalBeforeApplication === 'required' ? ['Identify and contact viable supervisors before the formal application can be treated as ready.'] : []),
      ...(input.pathway.recommendationModel.count ? [`Resolve ${input.pathway.recommendationModel.count} recommendation route${input.pathway.recommendationModel.count === 1 ? '' : 's'} early.`] : []),
      ...(input.pathway.fundingModel === 'scholarship_required' ? ['Check the scholarship deadline and sequencing immediately.'] : []),
    ],
    materialEvents,
    generatedAt: input.existing?.generatedAt ?? now,
    revisedAt: now,
    basedOnEvidenceIds: unique([
      ...input.pathway.evidence.map(source => source.id),
      ...(input.facultyCandidates ?? []).flatMap(candidate => candidate.sourceEvidence.map(source => source.id)),
      ...signals.map(signal => signal.id),
      ...requirements.flatMap(requirement => requirement.evidenceIds ?? []),
    ]),
  }
  return strategy
}

export function buildApplicationExecutionPlan(input: {
  applicationCaseId: string
  objective: string
  programmeTitle: string
  pathway: GraduateApplicationPathway
  strategy: AdmissionStrategy
  requirements?: ApplicationOrchestrationRequirement[]
  facultyCandidates?: ProgrammeFacultyCandidate[]
  deadline?: string | null
  now?: string
  existing?: ApplicationExecutionPlan | null
}): ApplicationExecutionPlan {
  const now = input.now ?? new Date().toISOString()
  const caseId = input.applicationCaseId
  const nodes: ApplicationPlanNode[] = []
  const add = (node: ApplicationPlanNode) => nodes.push(node)
  add(newNode({ id: 'programme-research', applicationCaseId: caseId, kind: 'required', type: 'programme_research', title: `Refresh ${input.programmeTitle} requirements`, priority: 5, expectedImpact: 'critical', dependencies: [], produces: ['official-programme-evidence'], owner: 'david', executionMode: 'autonomous', status: 'completed', deadline: null, estimatedMinutes: 20, externalWaitRisk: 'low', applicantBlockingRisk: 'low', parallelGroup: 'research' }))
  add(newNode({ id: 'pathway:classification', applicationCaseId: caseId, kind: 'required', type: 'pathway_classification', title: 'Classify the admissions pathway', priority: 6, expectedImpact: 'critical', dependencies: ['programme-research'], produces: ['verified-admission-pathway'], owner: 'deterministic_engine', executionMode: 'autonomous', status: input.pathway.evidence.length ? 'completed' : 'ready', evidenceIds: input.pathway.evidence.map(source => source.id), deadline: null, estimatedMinutes: 10, externalWaitRisk: 'low', applicantBlockingRisk: 'low', parallelGroup: 'research' }))
  add(newNode({ id: `strategy:${input.strategy.id}`, applicationCaseId: caseId, kind: 'required', type: 'programme_research', title: 'Build one application strategy', priority: 8, expectedImpact: 'critical', dependencies: ['pathway:classification'], produces: ['shared-admission-strategy'], owner: 'david', executionMode: 'autonomous', status: input.pathway.evidence.length ? 'completed' : 'planned', deadline: null, estimatedMinutes: 15, externalWaitRisk: 'low', applicantBlockingRisk: 'low', parallelGroup: 'planning' }))

  // Faculty research remains useful even when contact is discouraged or
  // prohibited: it can still inform programme-specific application work. Keep
  // the node for an unresolved policy even without faculty seeds so the
  // bounded faculty pass can perform its one targeted policy repair instead
  // of silently skipping the lane.
  add(newNode({ id: 'faculty:intelligence', applicationCaseId: caseId, kind: input.pathway.facultyContactPolicy === 'required' ? 'required' : 'strategic', type: 'faculty_intelligence', title: 'Research relevant faculty and labs', priority: input.pathway.facultyContactPolicy === 'required' ? 12 : 35, expectedImpact: input.pathway.facultyContactPolicy === 'required' ? 'critical' : 'high', dependencies: ['pathway:classification'], produces: ['faculty-fit-dossiers'], owner: 'david', executionMode: 'autonomous', status: 'ready', deadline: null, estimatedMinutes: 35, externalWaitRisk: 'medium', applicantBlockingRisk: 'low', parallelGroup: 'application-preparation' }))

  add(newNode({ id: 'cv', applicationCaseId: caseId, kind: 'strategic', type: 'cv', title: `Tailor the CV to ${input.programmeTitle}`, priority: 18, expectedImpact: 'high', dependencies: [`strategy:${input.strategy.id}`], produces: ['programme-specific-cv'], owner: 'david', executionMode: 'autonomous', deadline: null, estimatedMinutes: 45, externalWaitRisk: 'low', applicantBlockingRisk: 'low', parallelGroup: 'application-preparation' }))
  // Portal inspection is safe preparation and can reveal conditional fields
  // before every document is ready. It is deliberately not a dependency of
  // the CV, statement, or faculty lanes.
  add(newNode({ id: 'portal:inspect', applicationCaseId: caseId, kind: 'strategic', type: 'portal', title: 'Inspect the application portal early', priority: 22, expectedImpact: 'high', dependencies: [`strategy:${input.strategy.id}`], produces: ['portal-schema', 'conditional-questions'], owner: 'browser', executionMode: 'autonomous', deadline: null, estimatedMinutes: 20, externalWaitRisk: 'low', applicantBlockingRisk: 'low', parallelGroup: 'application-preparation' }))

  const outreachAllowed = !['discouraged', 'prohibited'].includes(input.pathway.facultyContactPolicy)
  const outreachRequired = input.pathway.facultyContactPolicy === 'required' || input.pathway.supervisorApprovalBeforeApplication === 'required'
  const hasFacultyTarget = (input.facultyCandidates?.length ?? 0) > 0
  if (outreachAllowed && (outreachRequired || (hasFacultyTarget && !['discouraged', 'prohibited'].includes(input.pathway.facultyContactPolicy)))) {
    const draftId = 'faculty:outreach:draft'
    add(newNode({ id: draftId, applicationCaseId: caseId, kind: outreachRequired ? 'required' : 'recommended', type: 'faculty_outreach', title: outreachRequired ? 'Prepare required supervisor outreach' : 'Prepare targeted faculty outreach', priority: outreachRequired ? 14 : 45, expectedImpact: outreachRequired ? 'critical' : 'medium', dependencies: ['faculty:intelligence', `strategy:${input.strategy.id}`].filter(id => nodes.some(node => node.id === id)), produces: ['faculty-outreach-draft'], owner: 'david', executionMode: 'autonomous', deadline: null, estimatedMinutes: 30, externalWaitRisk: 'high', applicantBlockingRisk: outreachRequired ? 'high' : 'low', parallelGroup: 'application-preparation' }))
    add(newNode({ id: 'faculty:outreach:send', applicationCaseId: caseId, kind: outreachRequired ? 'required' : 'recommended', type: 'faculty_outreach', title: outreachRequired ? 'Send required supervisor outreach' : 'Send approved faculty outreach', priority: outreachRequired ? 15 : 50, expectedImpact: outreachRequired ? 'critical' : 'medium', dependencies: [draftId, 'cv'], produces: ['faculty-contact-evidence'], owner: 'roon', executionMode: 'approval_required', deadline: null, estimatedMinutes: 10, externalWaitRisk: 'high', applicantBlockingRisk: outreachRequired ? 'high' : 'low', parallelGroup: 'external-actions' }))
  }

  nodes.push(...compileApplicationRequirementsToPlanNodes({
    requirements: input.requirements ?? [],
    strategyId: input.strategy.id,
    applicationCaseId: caseId,
  }))
  if (input.pathway.researchProposalPolicy === 'recommended' || input.pathway.researchProposalPolicy === 'optional') {
      add(newNode({ id: 'proposal:decision', applicationCaseId: caseId, kind: 'strategic', type: 'proposal', title: input.pathway.researchProposalPolicy === 'recommended' ? 'Evaluate whether a research proposal strengthens the application' : 'Evaluate whether a research proposal is useful', priority: 55, expectedImpact: 'medium', dependencies: [`strategy:${input.strategy.id}`], produces: ['proposal-decision'], owner: 'david', executionMode: 'autonomous', deadline: null, estimatedMinutes: 15, externalWaitRisk: 'low', applicantBlockingRisk: 'low', parallelGroup: 'application-preparation' }))
  }
  if (input.pathway.researchProposalPolicy === 'required' && !nodes.some(node => node.type === 'proposal')) {
    add(newNode({ id: 'conditional:proposal', applicationCaseId: caseId, kind: 'required', type: 'proposal', title: 'Prepare the required research proposal', priority: 16, expectedImpact: 'critical', dependencies: [`strategy:${input.strategy.id}`], produces: ['research-proposal'], owner: 'writer', executionMode: 'autonomous', deadline: null, estimatedMinutes: 90, externalWaitRisk: 'medium', applicantBlockingRisk: 'high', parallelGroup: 'application-preparation' }))
  }
  const recommendationNodes = nodes.filter(node => node.type === 'recommendation')
  if (input.pathway.recommendationModel.count && !recommendationNodes.length) {
    const count = input.pathway.recommendationModel.count
    add(newNode({ id: 'conditional:recommendations', applicationCaseId: caseId, kind: 'required', type: 'recommendation', title: `Prepare ${count} recommendation${count === 1 ? '' : 's'} through the official route`, priority: 12, expectedImpact: 'critical', dependencies: [`strategy:${input.strategy.id}`], produces: ['recommendation-route'], owner: 'roon', executionMode: 'autonomous', deadline: null, estimatedMinutes: 40, externalWaitRisk: 'high', applicantBlockingRisk: 'high', parallelGroup: 'external-actions' }))
  }
  if (['pi_funded', 'project_funded'].includes(input.pathway.fundingModel) && !nodes.some(node => node.type === 'funding')) {
    const fundingDependencies = [`strategy:${input.strategy.id}`]
    if (input.pathway.admissionModel === 'project_specific_position' && nodes.some(node => node.id === 'faculty:intelligence')) fundingDependencies.push('faculty:intelligence')
    add(newNode({ id: 'conditional:funding', applicationCaseId: caseId, kind: 'required', type: 'funding', title: input.pathway.fundingModel === 'project_funded' ? 'Verify project funding and its application route' : 'Verify supervisor funding and its application route', priority: 17, expectedImpact: 'critical', dependencies: fundingDependencies, produces: ['funding-evidence'], owner: 'david', executionMode: 'autonomous', deadline: null, estimatedMinutes: 30, externalWaitRisk: 'high', applicantBlockingRisk: 'high', parallelGroup: 'external-actions' }))
  }
  if (input.pathway.fundingModel === 'scholarship_required' && !nodes.some(node => node.type === 'scholarship')) {
    add(newNode({ id: 'funding:scholarship', applicationCaseId: caseId, kind: 'required', type: 'scholarship', title: 'Prepare the required scholarship application', priority: 13, expectedImpact: 'critical', dependencies: [`strategy:${input.strategy.id}`], produces: ['scholarship-application'], owner: 'david', executionMode: 'autonomous', deadline: null, estimatedMinutes: 45, externalWaitRisk: 'high', applicantBlockingRisk: 'high', parallelGroup: 'external-actions' }))
  }
  if (input.deadline) {
    // A programme deadline is a planning constraint even for strategic work;
    // individual requirement deadlines still win when the official source
    // gives one. This lets long external waits rise onto the critical path.
    for (const node of nodes) if (!node.deadline && node.type !== 'monitoring') node.deadline = input.deadline
  }
  const requiredWork = nodes.filter(node => node.kind === 'required' && !['programme_research', 'pathway_classification'].includes(node.type))
  const readinessDeps = unique(requiredWork.map(node => node.id).concat(['cv']))
  add(newNode({ id: 'readiness', applicationCaseId: caseId, kind: 'required', type: 'approval', title: 'Check the complete application package', priority: 90, expectedImpact: 'critical', dependencies: readinessDeps, produces: ['deterministic-readiness-report'], owner: 'deterministic_engine', executionMode: 'autonomous', deadline: null, estimatedMinutes: 20, externalWaitRisk: 'low', applicantBlockingRisk: 'high', parallelGroup: 'final-review' }))
  add(newNode({ id: 'submission:approval', applicationCaseId: caseId, kind: 'required', type: 'approval', title: 'Request final submission approval', priority: 95, expectedImpact: 'critical', dependencies: ['readiness'], produces: ['submission-approval'], owner: 'user', executionMode: 'approval_required', deadline: null, estimatedMinutes: 5, externalWaitRisk: 'low', applicantBlockingRisk: 'high', parallelGroup: 'final-review' }))
  add(newNode({ id: 'submission', applicationCaseId: caseId, kind: 'required', type: 'submission', title: 'Submit the approved application', priority: 100, expectedImpact: 'critical', dependencies: ['submission:approval'], produces: ['submission-confirmation', 'application-id'], owner: 'browser', executionMode: 'approval_required', deadline: null, estimatedMinutes: 10, externalWaitRisk: 'low', applicantBlockingRisk: 'high', parallelGroup: 'final-review' }))
  add(newNode({ id: 'monitoring', applicationCaseId: caseId, kind: 'recommended', type: 'monitoring', title: 'Monitor the application after submission', priority: 110, expectedImpact: 'high', dependencies: ['submission'], produces: ['post-submission-evidence'], owner: 'roon', executionMode: 'autonomous', deadline: null, estimatedMinutes: 15, externalWaitRisk: 'high', applicantBlockingRisk: 'low', parallelGroup: 'post-submission' }))

  return materializePlan(nodes, {
    applicationCaseId: caseId,
    objective: input.objective,
    strategyId: input.strategy.id,
    basedOnEvidenceIds: unique([...input.pathway.evidence.map(source => source.id), ...input.strategy.basedOnEvidenceIds]),
    now,
    existing: input.existing,
  })
}

export function runnableApplicationPlanNodes(plan: ApplicationExecutionPlan) {
  const byId = new Map(plan.nodes.map(node => [node.id, node]))
  return plan.nodes.filter(node => ['ready', 'running'].includes(node.status) && dependenciesSatisfied(node, byId))
}

/**
 * Group the dependency-ready lanes that the worker may advance in the same
 * scheduler slice. This is deliberately derived from persisted state rather
 * than from a scripted checklist: a user-held transcript can sit in one
 * group while CV, portal inspection, faculty research, and writing continue
 * in their own groups. The provider layer still owns side-effect claims.
 */
export function runnableApplicationPlanBatches(plan: ApplicationExecutionPlan, maximum?: number) {
  const limit = maximum === undefined ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.floor(maximum))
  const groups = new Map<string, ApplicationPlanNode[]>()
  for (const node of runnableApplicationPlanNodes(plan).sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))) {
    const key = node.parallelGroup || `lane:${node.id}`
    groups.set(key, [...(groups.get(key) ?? []), node])
  }
  return [...groups.entries()]
    .slice(0, limit)
    .map(([parallelGroup, nodes]) => ({ parallelGroup, nodeIds: nodes.map(node => node.id), nodes }))
}

/** Apply a verified deep faculty result without rebuilding or erasing the
 * rest of the active plan. This is the same narrow update a durable provider
 * event should make when one orchestration node completes. */
export function applyFacultyResearchToOrchestration(input: {
  snapshot: ApplicationOrchestrationSnapshot
  dossiers: FacultyOutreachDossier[]
  evidenceIds?: string[]
  now?: string
  /** Optional repaired pathway facts discovered in the same faculty batch. */
  pathway?: Pick<GraduateApplicationPathway, 'facultyContactPolicy' | 'supervisorApprovalBeforeApplication'>
}) {
  const now = input.now ?? new Date().toISOString()
  const evidenceIds = unique(input.evidenceIds ?? [])
  const pathway = input.pathway ?? input.snapshot.pathway
  const nodes = input.snapshot.plan.nodes.map(node => {
    if (node.id !== 'faculty:intelligence') return { ...node }
    return {
      ...node,
      status: 'completed' as const,
      evidenceIds: unique([...node.evidenceIds, ...evidenceIds]),
      blockingReason: null,
    }
  })
  const completedById = new Map(nodes.map(node => [node.id, node]))
  let unlockedNodes = nodes.map(node =>
    node.status === 'planned' && dependenciesSatisfied(node, completedById)
      ? { ...node, status: 'ready' as const }
      : node,
  )
  // A case created while policy was unknown may not have had an outreach
  // node yet. If this same bounded faculty pass establishes a permitted
  // policy and a draft-worthy target, add the normal draft/send dependencies
  // now; prohibited or discouraged pathways never receive these nodes.
  const outreachAllowed = !['discouraged', 'prohibited'].includes(pathway.facultyContactPolicy)
  const outreachRequired = pathway.facultyContactPolicy === 'required' || pathway.supervisorApprovalBeforeApplication === 'required'
  const draftWorthyTarget = input.dossiers.some(dossier =>
    dossier.draftRecommendation !== 'skip' || dossier.outreachRecommendation === 'required',
  )
  if (outreachAllowed && (outreachRequired || draftWorthyTarget) && !unlockedNodes.some(node => node.id === 'faculty:outreach:draft')) {
    const draftId = 'faculty:outreach:draft'
    const strategyId = `strategy:${input.snapshot.strategy.id}`
    const draftDependencies = ['faculty:intelligence', strategyId].filter(id => unlockedNodes.some(node => node.id === id))
    unlockedNodes = [
      ...unlockedNodes,
      newNode({ id: draftId, applicationCaseId: input.snapshot.plan.applicationCaseId, kind: outreachRequired ? 'required' : 'recommended', type: 'faculty_outreach', title: outreachRequired ? 'Prepare required supervisor outreach' : 'Prepare targeted faculty outreach', priority: outreachRequired ? 14 : 45, expectedImpact: outreachRequired ? 'critical' : 'medium', dependencies: draftDependencies, produces: ['faculty-outreach-draft'], owner: 'david', executionMode: 'autonomous', deadline: null, estimatedMinutes: 30, externalWaitRisk: 'high', applicantBlockingRisk: outreachRequired ? 'high' : 'low', parallelGroup: 'application-preparation' }),
      newNode({ id: 'faculty:outreach:send', applicationCaseId: input.snapshot.plan.applicationCaseId, kind: outreachRequired ? 'required' : 'recommended', type: 'faculty_outreach', title: outreachRequired ? 'Send required supervisor outreach' : 'Send approved faculty outreach', priority: outreachRequired ? 15 : 50, expectedImpact: outreachRequired ? 'critical' : 'medium', dependencies: [draftId, 'cv'].filter(id => unlockedNodes.some(node => node.id === id) || id === draftId), produces: ['faculty-contact-evidence'], owner: 'roon', executionMode: 'approval_required', deadline: null, estimatedMinutes: 10, externalWaitRisk: 'high', applicantBlockingRisk: outreachRequired ? 'high' : 'low', parallelGroup: 'external-actions' }),
    ]
  }
  const finalDependencyMap = new Map(unlockedNodes.map(node => [node.id, node]))
  unlockedNodes = unlockedNodes.map(node =>
    node.status === 'planned' && dependenciesSatisfied(node, finalDependencyMap)
      ? { ...node, status: 'ready' as const }
      : node,
  )
  const nextPlan: ApplicationExecutionPlan = {
    ...input.snapshot.plan,
    nodes: unlockedNodes,
    currentlyRunnable: [],
    externalWaiting: [],
    userBlocked: [],
    revisedAt: now,
  }
  const byId = new Map(unlockedNodes.map(node => [node.id, node]))
  nextPlan.currentlyRunnable = unlockedNodes.filter(node => ['ready', 'running'].includes(node.status) && dependenciesSatisfied(node, byId)).map(node => node.id)
  nextPlan.userBlocked = unlockedNodes.filter(node => node.status === 'waiting' && node.executionMode === 'user_input_required').map(node => node.id)
  nextPlan.externalWaiting = unlockedNodes.filter(node => node.status === 'waiting' && node.executionMode !== 'user_input_required').map(node => node.id)
  return {
    ...input.snapshot,
    evidenceVersion: input.snapshot.evidenceVersion + (evidenceIds.length ? 1 : 0),
    facultyDossiers: input.dossiers,
    plan: nextPlan,
    updatedAt: now,
  } satisfies ApplicationOrchestrationSnapshot
}

/**
 * Apply one durable execution result to the typed application plan. Provider
 * handlers remain responsible for their own evidence and side effects; this
 * helper only advances the orchestration node whose contract was affected and
 * unlocks its real dependants. Keeping this transition deterministic prevents
 * a model success message from making unrelated work appear complete.
 */
export function applyApplicationPlanNodeOutcome(input: {
  snapshot: ApplicationOrchestrationSnapshot
  nodeIds: string[]
  outcome: ApplicationPlanNodeOutcome
  now?: string
}) {
  const now = input.now ?? new Date().toISOString()
  const requestedIds = new Set(input.nodeIds.filter(Boolean))
  if (!requestedIds.size) return input.snapshot
  const evidenceIds = unique(input.outcome.evidenceIds ?? [])
  const nodes = input.snapshot.plan.nodes.map(node => {
    if (!requestedIds.has(node.id)) return { ...node }
    if (node.status === 'completed' && input.outcome.status !== 'completed') return { ...node }
    const failure = input.outcome.failure ?? input.outcome.blockingReason ?? 'The application action failed.'
    const repeatedFailure = input.outcome.status === 'failed' && node.retryState.failureSignature === failure
    const nextAttempts = input.outcome.status === 'failed'
      ? repeatedFailure ? node.retryState.attempts + 1 : 1
      : node.retryState.attempts
    const circuitOpen = input.outcome.status === 'failed' && nextAttempts >= node.retryState.maximumAttempts
    const nextRetry = input.outcome.status === 'failed'
      ? { ...node.retryState, attempts: nextAttempts, lastFailure: failure, failureSignature: failure, circuitOpen }
      : node.retryState
    return {
      ...node,
      status: circuitOpen ? 'failed' as const : input.outcome.status,
      ...(input.outcome.status === 'waiting' && input.outcome.waitingForUser ? { owner: 'user' as const, executionMode: 'user_input_required' as const } : {}),
      evidenceIds: unique([...node.evidenceIds, ...evidenceIds]),
      blockingReason: circuitOpen
        ? `Paused this action after ${node.retryState.maximumAttempts} identical failures. The rest of the application can continue.`
        : input.outcome.blockingReason ?? (input.outcome.status === 'completed' ? null : node.blockingReason),
      retryState: nextRetry,
    }
  })
  const byId = new Map(nodes.map(node => [node.id, node]))
  const unlocked = nodes.map(node =>
    node.status === 'planned' && dependenciesSatisfied(node, byId)
      ? { ...node, status: 'ready' as const, blockingReason: null }
      : node,
  )
  const nextById = new Map(unlocked.map(node => [node.id, node]))
  const plan: ApplicationExecutionPlan = {
    ...input.snapshot.plan,
    nodes: unlocked,
    currentlyRunnable: unlocked.filter(node => ['ready', 'running'].includes(node.status) && dependenciesSatisfied(node, nextById)).map(node => node.id),
    userBlocked: unlocked.filter(node => node.status === 'waiting' && node.executionMode === 'user_input_required').map(node => node.id),
    externalWaiting: unlocked.filter(node => node.status === 'waiting' && node.executionMode !== 'user_input_required').map(node => node.id),
    revisedAt: now,
  }
  return {
    ...input.snapshot,
    evidenceVersion: input.snapshot.evidenceVersion + (evidenceIds.length ? 1 : 0),
    plan,
    updatedAt: now,
  } satisfies ApplicationOrchestrationSnapshot
}

export function projectApplicationOrchestrationWorkstreams(plan: ApplicationExecutionPlan, maximum?: number): ApplicationWorkstream[] {
  const reviewableTypes = new Set<ApplicationPlanType>(['cv', 'statement', 'essay', 'proposal', 'faculty_intelligence', 'faculty_outreach', 'recommendation', 'academic_evidence', 'test', 'fee', 'funding', 'scholarship', 'portal'])
  const ordered = [...plan.nodes].filter(node =>
    !['skipped'].includes(node.status) &&
    !isFutureApplicationRequirement({ name: node.title, exactInstructions: node.blockingReason, officialWording: null, condition: null }) &&
    !isApplicationSubmissionMethodRequirement({ name: node.title }) &&
    (node.status !== 'completed' || reviewableTypes.has(node.type))
  ).sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
  const visible = maximum === undefined ? ordered : ordered.slice(0, Math.max(1, Math.floor(maximum)))
  return visible.map(node => {
    const status: ApplicationWorkstream['status'] = node.status === 'completed'
      ? 'ready_for_review'
      : node.status === 'waiting'
      ? (node.executionMode === 'user_input_required' ? 'ready_for_user' : 'waiting_external')
      : node.status === 'failed' ? 'blocked' : ['ready', 'running'].includes(node.status) ? 'active' : 'queued'
    const owner: ApplicationWorkstream['owner'] = node.owner === 'user' ? 'you' : node.owner === 'writer' ? 'writer' : node.owner === 'roon' ? 'roon' : node.owner === 'browser' ? 'shotcount' : 'shotcount'
    return {
      id: `application-plan:${node.id}`,
      planNodeId: node.id,
      ...(node.requirementId ? { requirementId: node.requirementId } : {}),
      title: node.title,
      status,
      owner,
      detail: node.status === 'completed'
        ? 'Prepared and ready for your review.'
        : node.status === 'waiting'
        ? (node.blockingReason ?? 'Waiting for the next required update.')
        : node.status === 'planned'
          ? `Starts after ${node.dependencies.length ? 'the preceding verified steps' : 'the current work'}.`
          : node.status === 'ready'
            ? 'Starting now.'
            : node.status === 'running'
              ? node.type === 'academic_evidence' ? 'Checking the academic record requirements.'
                : node.type === 'test' ? 'Checking whether an admissions test is needed.'
                  : node.type === 'faculty_intelligence' ? 'Comparing current faculty research with your research profile.'
                    : node.type === 'portal' ? 'Inspecting the official application route.'
                      : node.type === 'cv' ? 'Preparing the programme-specific CV.'
                        : `Working on ${node.title.toLocaleLowerCase()}.`
              : 'Ready for the next verified step.',
      deadline: node.deadline,
      instructions: node.blockingReason ?? null,
    } satisfies ApplicationWorkstream
  })
}

export function isMaterialApplicationEvent(event: string) {
  return [
    'professor_replied', 'recommendation_status_changed', 'official_requirement_changed',
    'portal_requirement_discovered', 'user_uploaded_evidence', 'test_waiver_confirmed',
    'fee_waiver_approved', 'supervisor_accepted', 'supervisor_declined', 'funding_changed',
    'deadline_changed', 'source_conflict_found', 'writer_artifact_received',
  ].includes(lower(event).replaceAll(' ', '_'))
}

export function replanApplicationExecutionPlan(input: {
  plan: ApplicationExecutionPlan
  pathway: GraduateApplicationPathway
  strategy: AdmissionStrategy
  programmeTitle: string
  requirements?: ApplicationOrchestrationRequirement[]
  facultyCandidates?: ProgrammeFacultyCandidate[]
  event: string
  now?: string
}) {
  if (!isMaterialApplicationEvent(input.event)) return input.plan
  return buildApplicationExecutionPlan({
    applicationCaseId: input.plan.applicationCaseId,
    objective: input.plan.objective,
    programmeTitle: input.programmeTitle,
    pathway: input.pathway,
    strategy: input.strategy,
    requirements: input.requirements,
    facultyCandidates: input.facultyCandidates,
    deadline: input.plan.nodes.map(node => node.deadline).filter(Boolean).sort()[0] ?? null,
    now: input.now,
    existing: input.plan,
  })
}
