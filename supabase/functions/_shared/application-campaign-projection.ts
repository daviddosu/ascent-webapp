/**
 * Canonical, deterministic campaign projection for graduate applications.
 *
 * This module is deliberately free of provider calls and model calls. It
 * turns the current ApplicationCase/requirement/evidence state into the
 * compact state that clients render. A stale narration, agent message, or
 * provider acknowledgement cannot change a bucket here; only the current
 * typed state and accepted evidence can.
 */

import type {
  ApplicationCampaign,
  ApplicationCase,
  ApplicationCommunication,
  ApplicationContact,
  Artifact,
  Deadline,
  Evidence,
  HumanAssignment,
  Opportunity,
  Requirement,
} from './david-applications.ts'
import { feeRequirementSatisfiedByWaiver, type ApplicationFeeRequirement } from './application-fee-workflow.ts'

export const APPLICATION_CAMPAIGN_PROJECTION_VERSION = 'application-campaign-projection@1' as const

export const campaignBuckets = ['DOING', 'WAITING', 'NEEDS_YOU', 'AT_RISK', 'DONE'] as const
export type CampaignBucket = typeof campaignBuckets[number]

export const campaignStatuses = ['active', 'needs_user', 'risk_detected', 'all_currently_waiting', 'submission_season_complete', 'decisions_pending'] as const
export type CampaignProjectionStatus = typeof campaignStatuses[number]

export const applicationOverallStates = [
  'researching',
  'preparing',
  'blocked_on_user',
  'blocked_external',
  'at_risk',
  'ready_for_review',
  'ready_for_submission',
  'submitting',
  'submitted',
  'awaiting_decision',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'complete',
] as const
export type ApplicationOverallState = typeof applicationOverallStates[number]

export const riskLevels = ['none', 'watch', 'elevated', 'critical'] as const
export type RequirementRiskLevel = typeof riskLevels[number]

export const riskReasonCodes = [
  'USER_ATTACHMENT_REQUIRED',
  'USER_APPROVAL_REQUIRED',
  'EXTERNAL_RECOMMENDER_WAIT',
  'EXTERNAL_REGISTRAR_WAIT',
  'EXTERNAL_WRITER_WAIT',
  'EXTERNAL_INSTITUTION_WAIT',
  'DEADLINE_LOW_SLACK',
  'DEADLINE_BLOCKED',
  'DELIVERY_OVERDUE',
  'ARTIFACT_MISSING',
  'PORTAL_UNVERIFIED',
  'RETRY_EXHAUSTED',
  'SUBMISSION_UNVERIFIED',
  'FEE_WAIVER_PENDING',
  'PAYMENT_RECONCILIATION_REQUIRED',
  'DUPLICATE_PAYMENT_BLOCKED',
  'ADMISSIONS_CLARIFICATION_PENDING',
  'POST_SUBMISSION_RECOVERY_PENDING',
] as const
export type RequirementRiskReasonCode = typeof riskReasonCodes[number]

export type ProjectionExecutionState = {
  applicationCaseId: string
  requirementId: string | null
  state: 'active' | 'queued' | 'scheduled' | 'blocked'
  owner: 'david' | 'roon' | 'writer' | 'referee' | 'institution' | 'system'
  runId?: string | null
  operation?: string | null
  updatedAt?: string | null
}

export type ProjectionInteractionKind =
  | 'approve'
  | 'choose_one'
  | 'choose_several'
  | 'confirm'
  | 'correction'
  | 'email'
  | 'date'
  | 'contact'
  | 'attachment'
  | 'secure_authentication'
  | 'payment_approval'
  | 'short_text'

export type ProjectionUserInteraction = {
  id: string
  applicationCaseId: string
  requirementId: string | null
  taskId?: string | null
  kind: ProjectionInteractionKind
  question: string
  reason: string
  status: 'pending' | 'answered' | 'skipped' | 'invalid'
  dedupeKey?: string | null
  deadline?: Deadline | null
}

export type ProjectionExternalActor = {
  id: string
  kind: 'recommender' | 'supervisor' | 'writer' | 'registrar' | 'credential_evaluator' | 'test_provider' | 'admissions_office' | 'application_portal' | 'payment_provider' | 'university' | 'system' | 'other'
  name: string
}

export type ProjectionExternalCommitment = {
  id: string
  requirementId: string
  actor: ProjectionExternalActor
  promisedAt: string
  sourceEvidenceId?: string | null
  note?: string | null
}

export type ProjectionItemReference = {
  requirementId: string | null
  applicationCaseId: string
  interactionId: string | null
  taskId: string | null
  responsibleAgent: ProjectionExecutionState['owner'] | null
  deadline: Deadline | null
}

export type CampaignSummaryItem = {
  id: string
  bucket: Exclude<CampaignBucket, 'AT_RISK' | 'DONE'>
  label: string
  detail: string
  institution: string
  programme: string
  applicationCaseIds: string[]
  requirementIds: string[]
  references: ProjectionItemReference[]
  deadline: Deadline | null
  actor: ProjectionExternalActor | null
  interaction: ProjectionUserInteraction | null
  priority: number
  updatedAt: string | null
  queued?: boolean
}

export type RequirementSummary = {
  requirementId: string
  applicationCaseId: string
  name: string
  label: string
  status: string
  bucket: CampaignBucket
  deadline: Deadline | null
  evidenceIds: string[]
  actor: ProjectionExternalActor | null
  interaction: ProjectionUserInteraction | null
  lastVerifiedAt: string | null
  requirementType: string | null
}

export type RequirementRisk = {
  id: string
  applicationCaseId: string
  requirementId: string
  level: Exclude<RequirementRiskLevel, 'none'>
  reasonCodes: RequirementRiskReasonCode[]
  reason: string
  deadline: Deadline | null
  timeRemainingMs: number | null
  expectedCompletionMs: number
  safetyBufferMs: number
  deadlineSlackMs: number | null
  blocker: string | null
  recommendedMitigation: string
  actor: ProjectionExternalActor | null
  affectedApplicationCaseIds: string[]
  priority: number
}

export type CompletedMilestone = {
  id: string
  applicationCaseId: string
  requirementId: string | null
  label: string
  institution: string
  programme: string
  verifiedAt: string | null
  evidenceIds: string[]
}

export type ApplicationMilestone = {
  id: string
  label: string
  state: 'complete' | 'current' | 'pending'
  requirementIds: string[]
}

export type ApplicationSummary = {
  applicationCaseId: string
  institution: string
  programme: string
  degree: string
  deadline: Deadline | null
  overallState: ApplicationOverallState
  completionPercent: number | null
  progressState: 'Getting started' | 'In progress' | 'Nearly ready' | 'Needs your input' | 'Waiting on others' | 'At risk' | 'Ready for approval' | 'Ready for submission' | 'Submission needs verification' | 'Submitted' | 'Awaiting decision' | 'Interview' | 'Offer' | 'Rejected' | 'Complete'
  activeRequirements: RequirementSummary[]
  waitingRequirements: RequirementSummary[]
  userBlockedRequirements: RequirementSummary[]
  riskRequirements: RequirementRisk[]
  completedRequirements: RequirementSummary[]
  completedRequirementCount: number
  nextAction: string | null
  nextActionReference: ProjectionItemReference | null
  lastVerifiedProgress: { label: string; verifiedAt: string | null } | null
  submissionState: 'not_started' | 'in_progress' | 'ready_for_review' | 'submitting' | 'submitted' | 'unverified'
  postSubmissionState: 'not_applicable' | 'monitoring' | 'additional_documents' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'complete'
  milestones: ApplicationMilestone[]
}

export type CampaignProjectionCounts = {
  applications: number
  activeApplications: number
  submittedApplications: number
  decisionsPending: number
  doing: number
  queued: number
  waitingExternal: number
  needsUser: number
  risks: number
  completedRecently: number
}

export type CampaignProjectionIntegrity = {
  valid: boolean
  issues: string[]
}

export type ApplicationCampaignProjection = {
  version: typeof APPLICATION_CAMPAIGN_PROJECTION_VERSION
  campaignId: string
  applicantId: string
  generatedAt: string
  status: CampaignProjectionStatus
  phase: 'applications_preparing' | 'applications_submitted' | 'decisions_pending' | 'offers_being_handled' | 'campaign_closed'
  applications: ApplicationSummary[]
  activeWork: CampaignSummaryItem[]
  queuedWork: CampaignSummaryItem[]
  waitingExternal: CampaignSummaryItem[]
  userActions: CampaignSummaryItem[]
  risks: RequirementRisk[]
  recentlyCompleted: CompletedMilestone[]
  upcomingDeadlines: Array<{ applicationCaseId: string; requirementId: string | null; label: string; institution: string; programme: string; deadline: Deadline }>
  counts: CampaignProjectionCounts
  nextMeaningfulEvent: CampaignSummaryItem | RequirementRisk | null
  integrity: CampaignProjectionIntegrity
}

export type ApplicationCampaignProjectionInput = {
  campaign: ApplicationCampaign
  opportunities: Opportunity[]
  cases: ApplicationCase[]
  evidence?: Evidence[]
  artifacts?: Artifact[]
  contacts?: ApplicationContact[]
  assignments?: HumanAssignment[]
  communications?: ApplicationCommunication[]
  executions?: ProjectionExecutionState[]
  interactions?: ProjectionUserInteraction[]
  commitments?: ProjectionExternalCommitment[]
  now?: string
}

type RequirementEntry = {
  requirement: Requirement
  applicationCase: ApplicationCase
  opportunity: Opportunity | null
  institution: string
  programme: string
  degree: string
}

type RequirementEvaluation = RequirementEntry & {
  deadline: Deadline | null
  complete: boolean
  bucket: CampaignBucket
  interaction: ProjectionUserInteraction | null
  actor: ProjectionExternalActor | null
  execution: ProjectionExecutionState | null
  label: string
  updatedAt: string | null
  verifiedAt: string | null
}

const terminalRequirementStatuses = new Set(['verified', 'ready', 'approved', 'submitted', 'waived'])
const externalWaitingStatuses = new Set(['awaiting_writer', 'awaiting_referee', 'awaiting_institution'])

const leadTimeByType: Record<string, number> = {
  transcript: 10 * 24 * 60 * 60 * 1_000,
  credential: 14 * 24 * 60 * 60 * 1_000,
  wes: 14 * 24 * 60 * 60 * 1_000,
  referee: 7 * 24 * 60 * 60 * 1_000,
  reference: 7 * 24 * 60 * 60 * 1_000,
  writer: 4 * 24 * 60 * 60 * 1_000,
  research_proposal: 4 * 24 * 60 * 60 * 1_000,
  essay: 3 * 24 * 60 * 60 * 1_000,
  supervisor: 5 * 24 * 60 * 60 * 1_000,
  professor: 5 * 24 * 60 * 60 * 1_000,
  test: 14 * 24 * 60 * 60 * 1_000,
  portal: 1 * 24 * 60 * 60 * 1_000,
  submission: 1 * 24 * 60 * 60 * 1_000,
  approval: 1 * 24 * 60 * 60 * 1_000,
  admissions: 3 * 24 * 60 * 60 * 1_000,
  post_submission: 3 * 24 * 60 * 60 * 1_000,
}

const safetyBufferByType: Record<string, number> = {
  transcript: 2 * 24 * 60 * 60 * 1_000,
  credential: 3 * 24 * 60 * 60 * 1_000,
  wes: 3 * 24 * 60 * 60 * 1_000,
  referee: 2 * 24 * 60 * 60 * 1_000,
  writer: 2 * 24 * 60 * 60 * 1_000,
  test: 3 * 24 * 60 * 60 * 1_000,
  admissions: 1 * 24 * 60 * 60 * 1_000,
  post_submission: 1 * 24 * 60 * 60 * 1_000,
  default: 1 * 24 * 60 * 60 * 1_000,
}

function text(value: unknown, maximum = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function normalized(value: unknown) {
  return text(value, 1_000).replace(/\s+/g, ' ').toLocaleLowerCase()
}

function dateTime(value: string | null | undefined) {
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : null
}

function latestTimestamp(...values: Array<string | null | undefined>) {
  const candidates = values.filter((value): value is string => Boolean(value) && dateTime(value) !== null)
  return candidates.sort((left, right) => (dateTime(right) ?? 0) - (dateTime(left) ?? 0))[0] ?? null
}

function statusOf(requirement: Requirement) {
  return normalized(requirement.status)
}

function requirementTypeOf(requirement: Requirement) {
  return normalized(requirement.requirementType ?? requirement.category ?? requirement.name)
}

function requirementKey(requirement: Requirement) {
  return `${requirementTypeOf(requirement)} ${normalized(requirement.name)}`
}

function feeRequirementFor(applicationCase: ApplicationCase): ApplicationFeeRequirement | null {
  return applicationCase.feeRequirement ?? null
}

function feeRequirementAsRequirement(applicationCase: ApplicationCase): Requirement | null {
  const fee = feeRequirementFor(applicationCase)
  if (!fee) return null
  const completeByWaiver = feeRequirementSatisfiedByWaiver(fee)
  const completeByPayment = fee.paymentState === 'COMPLETE'
  const awaitingUser = fee.paymentState === 'AWAITING_USER_APPROVAL' || fee.waiverDecisionState === 'AWAITING_USER_EVIDENCE' || fee.waiverDecisionState === 'EVIDENCE_REQUIRED'
  const awaitingInstitution = fee.waiverDecisionState === 'REQUEST_SUBMITTED' || fee.waiverDecisionState === 'UNDER_REVIEW' || fee.paymentState === 'PAYMENT_HANDOFF_REQUIRED' || fee.paymentState === 'PROCESSING'
  const status: Requirement['status'] = completeByWaiver ? 'waived' : completeByPayment ? 'verified' : awaitingUser ? 'awaiting_user' : awaitingInstitution ? 'awaiting_institution' : fee.feeRequired === false ? 'waived' : 'in_progress'
  const amount = fee.totalPayable !== null && fee.currency ? `${fee.currency} ${fee.totalPayable.toFixed(2)}` : 'the current portal amount'
  const stateDetail = completeByWaiver
    ? 'The portal resulting state proves the application fee is cleared.'
    : completeByPayment
      ? 'The payment receipt and resulting application state are verified.'
      : fee.paymentState === 'AMBIGUOUS' || fee.paymentState === 'RECONCILIATION_REQUIRED'
        ? 'Payment result is ambiguous; reconcile before any retry.'
        : fee.waiverDecisionState === 'UNDER_REVIEW' || fee.waiverDecisionState === 'REQUEST_SUBMITTED'
          ? 'A legitimate fee-waiver request is awaiting the admissions decision.'
          : `Current application-fee state: ${fee.paymentState}; total ${amount}.`
  return {
    id: fee.id,
    applicationCaseId: applicationCase.id,
    name: `Application fee — ${fee.university || 'university'}`,
    category: 'financial',
    source: fee.sourceProvenance[fee.sourceProvenance.length - 1]
      ? { url: fee.sourceProvenance[fee.sourceProvenance.length - 1]!.url ?? '', excerpt: fee.sourceProvenance[fee.sourceProvenance.length - 1]!.excerpt, retrievedAt: fee.sourceProvenance[fee.sourceProvenance.length - 1]!.retrievedAt, sourceType: 'official' }
      : null,
    required: fee.feeRequired !== false,
    exactInstructions: `${stateDetail} ${fee.blocker ?? ''}`.trim(),
    deadline: fee.paymentDeadline ? { dateTime: fee.paymentDeadline, timezone: fee.deadlineTimezone ?? 'UTC', label: 'Application fee deadline', sourceUrl: fee.sourceProvenance.at(-1)?.url ?? null, retrievedAt: fee.amountRetrievedAt } : null,
    status,
    responsibleParty: awaitingInstitution ? 'institution' : awaitingUser ? 'applicant' : 'david',
    linkedArtifactId: fee.receiptArtifactId,
    verificationEvidenceIds: fee.verificationEvidenceIds,
    blockerReason: fee.blocker,
    sourceId: fee.sourceProvenance.at(-1)?.id ?? null,
    requirementType: 'application_fee',
    dependencyIds: [],
    evidenceContract: ['official_fee_source', 'waiver_result_or_payment_receipt'],
    retryState: null,
    resolutionTier: 1,
    waitUntil: fee.waiverDeadline ?? fee.paymentDeadline,
    createdAt: fee.createdAt,
    updatedAt: fee.updatedAt,
  }
}

function feeInteractionFor(applicationCase: ApplicationCase, requirement: Requirement): ProjectionUserInteraction | null {
  const fee = feeRequirementFor(applicationCase)
  if (!fee || requirement.id !== fee.id) return null
  if (fee.paymentState === 'AWAITING_USER_APPROVAL' && fee.totalPayable !== null && fee.currency) return {
    id: `fee-payment-approval:${fee.id}:${fee.version}`,
    applicationCaseId: applicationCase.id,
    requirementId: fee.id,
    taskId: applicationCase.taskId,
    kind: 'payment_approval',
    question: `Approve ${fee.currency} ${fee.totalPayable.toFixed(2)} application fee for ${fee.university}?`,
    reason: 'This is one approval for this exact application, currency, amount, and current requirement version. Payment credentials stay on the secure provider surface.',
    status: 'pending',
    dedupeKey: `fee-payment:${fee.id}:${fee.version}`,
    deadline: fee.paymentDeadline ? { dateTime: fee.paymentDeadline, timezone: fee.deadlineTimezone ?? 'UTC', label: 'Application fee deadline', sourceUrl: fee.sourceProvenance.at(-1)?.url ?? null, retrievedAt: fee.amountRetrievedAt } : null,
  }
  if (fee.waiverDecisionState === 'EVIDENCE_REQUIRED' || fee.waiverDecisionState === 'AWAITING_USER_EVIDENCE') {
    const evidence = fee.waiverEvidenceRequirements.find(item => item.required)
    return {
      id: `fee-evidence:${fee.id}:${evidence?.id ?? fee.version}`,
      applicationCaseId: applicationCase.id,
      requirementId: fee.id,
      taskId: applicationCase.taskId,
      kind: 'attachment',
      question: `Attach ${evidence?.label ?? 'the required fee-waiver evidence'} for ${fee.university}.`,
      reason: 'The published waiver policy requires this evidence; ShotCount validates its applicant, programme, readability, date, and checksum before submission.',
      status: 'pending',
      dedupeKey: `fee-evidence:${fee.id}:${evidence?.id ?? fee.version}`,
      deadline: fee.waiverDeadline ? { dateTime: fee.waiverDeadline, timezone: fee.deadlineTimezone ?? 'UTC', label: 'Fee-waiver deadline', sourceUrl: fee.sourceProvenance.at(-1)?.url ?? null, retrievedAt: fee.amountRetrievedAt } : null,
    }
  }
  if (fee.paymentState === 'PAYMENT_HANDOFF_REQUIRED') return {
    id: `fee-secure-handoff:${fee.id}:${fee.version}`,
    applicationCaseId: applicationCase.id,
    requirementId: fee.id,
    taskId: applicationCase.taskId,
    kind: 'secure_authentication',
    question: 'Complete the secure application-fee payment step.',
    reason: 'Card, bank authentication, 3DS, and OTP remain on the institution or payment-provider surface; return for reconciliation and receipt verification.',
    status: 'pending',
    dedupeKey: `fee-handoff:${fee.id}:${fee.version}`,
    deadline: fee.paymentDeadline ? { dateTime: fee.paymentDeadline, timezone: fee.deadlineTimezone ?? 'UTC', label: 'Application fee deadline', sourceUrl: fee.sourceProvenance.at(-1)?.url ?? null, retrievedAt: fee.amountRetrievedAt } : null,
  }
  return null
}

function deadlineFor(entry: RequirementEntry): Deadline | null {
  return entry.requirement.deadline ?? entry.applicationCase.deadlines[0] ?? entry.opportunity?.deadline ?? null
}

function displayProgramme(opportunity: Opportunity | null, applicationCase: ApplicationCase) {
  return opportunity?.programmeTitle || text((applicationCase as ApplicationCase & { programme?: string }).programme, 500) || 'Graduate application'
}

function displayDegree(opportunity: Opportunity | null, applicationCase: ApplicationCase) {
  return opportunity?.degreeOrAwardType || text((applicationCase as ApplicationCase & { degree?: string }).degree, 160) || 'Graduate programme'
}

function isAcceptedEvidence(requirement: Requirement, evidenceById: Map<string, Evidence>) {
  if (statusOf(requirement) === 'waived') return true
  if (!terminalRequirementStatuses.has(statusOf(requirement)) || !requirement.required) return false
  const evidenceIds = requirement.verificationEvidenceIds.filter(Boolean)
  if (!evidenceIds.length) return false
  // The persisted verification_evidence_ids column is only a reference. The
  // corresponding evidence row must be present and belong to this case; a
  // missing or cross-case row can never make a requirement look complete.
  return evidenceIds.some(id => {
    const item = evidenceById.get(id)
    return Boolean(item && item.applicationCaseId === requirement.applicationCaseId)
  })
}

function contactForRequirement(entry: RequirementEntry, contacts: ApplicationContact[]) {
  const candidates = contacts.filter(contact => contact.applicationCaseId === entry.applicationCase.id)
  const key = requirementKey(entry.requirement)
  const explicit = candidates.find(contact =>
    (entry.applicationCase.referees.includes(contact.id) && /referee|reference|recommend/i.test(key)) ||
    (entry.applicationCase.contacts.includes(contact.id) && /supervisor|professor/i.test(key)),
  )
  return explicit ?? candidates.find(contact => /referee|supervisor|professor/i.test(`${contact.kind} ${key}`)) ?? null
}

function actorFor(entry: RequirementEntry, contacts: ApplicationContact[], assignments: HumanAssignment[], dependencies: ProjectionExternalCommitment[]) {
  const dependency = dependencies.find(item => item.requirementId === entry.requirement.id)
  if (dependency) return dependency.actor
  const key = requirementKey(entry.requirement)
  const type = requirementTypeOf(entry.requirement)
  const fee = feeRequirementFor(entry.applicationCase)
  if (type === 'admissions_clarification' || /admissions clarification/.test(key)) {
    return { id: `admissions:${entry.applicationCase.id}`, kind: 'admissions_office' as const, name: 'Admissions office' }
  }
  if (type === 'post_submission_request' || /additional document|post submission|post-submission/.test(key)) {
    if (/portal|upload|checklist/.test(key)) return { id: `portal:${entry.applicationCase.id}`, kind: 'application_portal' as const, name: 'Application portal' }
    return { id: `admissions:${entry.applicationCase.id}`, kind: 'admissions_office' as const, name: 'Admissions office' }
  }
  if (fee && entry.requirement.id === fee.id) {
    if (fee.waiverDecisionState === 'REQUEST_SUBMITTED' || fee.waiverDecisionState === 'UNDER_REVIEW') return { id: `admissions:${entry.applicationCase.id}`, kind: 'admissions_office' as const, name: 'Admissions office' }
    if (fee.paymentState === 'PAYMENT_HANDOFF_REQUIRED' || fee.paymentState === 'PROCESSING' || fee.paymentState === 'AMBIGUOUS' || fee.paymentState === 'RECONCILIATION_REQUIRED') return { id: `payment-provider:${entry.applicationCase.id}`, kind: 'payment_provider' as const, name: 'Payment provider' }
  }
  const contact = contactForRequirement(entry, contacts)
  if (/referee|reference|recommend/i.test(key) || entry.requirement.responsibleParty === 'referee') {
    return contact
      ? { id: contact.id, kind: 'recommender' as const, name: contact.name }
      : { id: `recommender:${entry.applicationCase.id}`, kind: 'recommender' as const, name: 'Recommender' }
  }
  if (/supervisor|professor|faculty/i.test(key)) {
    return contact
      ? { id: contact.id, kind: 'supervisor' as const, name: contact.name }
      : { id: `supervisor:${entry.applicationCase.id}`, kind: 'supervisor' as const, name: 'Prospective supervisor' }
  }
  const assignment = assignments.find(item => item.applicationCaseId === entry.applicationCase.id)
  if (/writer|draft|proposal|statement|sop|essay/i.test(key) || entry.requirement.responsibleParty === 'writer') {
    return { id: `writer:${assignment?.writerId ?? entry.applicationCase.id}`, kind: 'writer' as const, name: 'Writer' }
  }
  if (/wes|credential|evaluation/i.test(key)) return { id: 'credential-evaluator', kind: 'credential_evaluator' as const, name: 'Credential evaluator' }
  if (/transcript|registrar|degree certificate|official document/i.test(key)) return { id: `registrar:${entry.applicationCase.id}`, kind: 'registrar' as const, name: 'Registrar' }
  if (/test|ielts|toefl|gre|score/i.test(key)) return { id: 'test-provider', kind: 'test_provider' as const, name: 'Test provider' }
  if (entry.requirement.responsibleParty === 'institution' || externalWaitingStatuses.has(statusOf(entry.requirement))) {
    const name = entry.opportunity?.institution || 'University'
    return { id: `institution:${name}`, kind: 'university' as const, name }
  }
  return null
}

function labelFor(requirement: Requirement, bucket: CampaignBucket, actor: ProjectionExternalActor | null) {
  const key = requirementKey(requirement)
  const type = requirementTypeOf(requirement)
  if (bucket === 'DONE') {
    if (type === 'admissions_clarification' || /admissions clarification/.test(key)) return 'Admissions clarification resolved'
    if (type === 'post_submission_request' || /post submission|post-submission|additional document/.test(key)) return 'Additional information accepted'
    if (/submission/.test(key)) return 'Application submitted'
    if (/recommend|referee/.test(key)) return 'Recommendation received'
    if (/transcript/.test(key)) return 'Transcript accepted'
    if (/supervisor|professor/.test(key)) return 'Supervisor contacted'
    if (/cv|curriculum/.test(key)) return 'CV ready'
    if (/proposal|statement|sop|essay/.test(key)) return 'Application writing approved'
    if (/fee|waiver|payment/.test(key)) return /waiver|waived/.test(key) || requirement.status === 'waived' ? 'Application fee waived' : 'Application fee paid — receipt verified'
    return text(requirement.name, 160) || 'Requirement completed'
  }
  if (bucket === 'NEEDS_YOU') {
    if (type === 'admissions_clarification' || /admissions clarification/.test(key)) return 'Approve admissions clarification'
    if (type === 'post_submission_request' || /post submission|post-submission|additional document/.test(key)) return `Provide ${text(requirement.name, 120) || 'the requested information'}`
    if (/fee|waiver|payment/.test(key)) {
      if (/attachment|evidence/.test(key) || requirement.status === 'awaiting_user') return 'Attach fee-waiver evidence'
      if (/payment|fee/.test(key)) return 'Approve application fee'
    }
    if (/attachment|upload|transcript|document/.test(key)) return `Attach ${text(requirement.name, 120) || 'the required document'}`
    if (/approval|submission|review/.test(key)) return 'Approve final application'
    return text(requirement.name, 160) || 'Review the application detail'
  }
  if (bucket === 'WAITING') {
    if (type === 'admissions_clarification' || /admissions clarification/.test(key)) return 'Waiting for admissions reply'
    if (type === 'post_submission_request' || /post submission|post-submission|additional document/.test(key)) return 'Waiting for institution checklist update'
    if (/fee|waiver|payment/.test(key)) {
      if (/reconcil|ambiguous/.test(key)) return 'Reconciling application payment'
      if (/waiver|fee/.test(key)) return 'Waiting on admissions for fee waiver'
    }
    if (actor?.kind === 'recommender') return 'Waiting for recommendation'
    if (actor?.kind === 'writer') return 'Waiting for writer draft'
    if (actor?.kind === 'registrar') return 'Waiting for official transcript'
    if (actor?.kind === 'credential_evaluator') return 'Waiting for credential evaluation'
    if (actor?.kind === 'application_portal') return 'Waiting for application portal'
    if (/decision/.test(key)) return 'Waiting for application decision'
    return `Waiting for ${actor?.name ?? 'external update'}`
  }
  if (/supervisor|professor|faculty/.test(key) && /research|find|identify/.test(key)) return 'Researching prospective supervisors'
  if (/supervisor|professor|outreach|contact/.test(key)) return 'Preparing supervisor outreach'
  if (/writer|sop|statement|essay|research_proposal|proposal/.test(`${type} ${key}`)) return 'Preparing application writing'
  if (/referee|recommend/.test(key)) return 'Coordinating recommendations'
  if (/transcript|credential|ielts|toefl|gre|test/.test(key)) return 'Checking credential requirements'
  if (/portal|form|field|section|submission/.test(key)) return 'Completing application form'
  if (/document|cv|resume/.test(key)) return 'Preparing application documents'
  if (/fee|waiver|payment/.test(key)) return /waiver/.test(key) ? 'Checking fee-waiver eligibility' : 'Preparing application fee'
  if (type === 'admissions_clarification' || /admissions clarification/.test(key)) return 'Preparing admissions clarification'
  if (type === 'post_submission_request' || /post submission|post-submission|additional document/.test(key)) return 'Recovering requested post-submission information'
  return text(requirement.name, 160) || 'Preparing application requirement'
}

function detailFor(entry: RequirementEntry, bucket: CampaignBucket, actor: ProjectionExternalActor | null, interaction: ProjectionUserInteraction | null) {
  if (bucket === 'NEEDS_YOU') return interaction?.question || interaction?.reason || 'Your decision is required to continue this application.'
  if (bucket === 'WAITING') return actor ? `Waiting on ${actor.name}.` : 'Waiting for an external update.'
  if (bucket === 'DONE') return 'Verified resulting-state evidence is recorded.'
  if (/fee|waiver|payment/.test(requirementKey(entry.requirement))) return text(entry.requirement.exactInstructions, 500) || 'The canonical application-fee lifecycle owns the next safe step.'
  if (entry.requirement.blockerReason) return text(entry.requirement.blockerReason, 300)
  return 'ShotCount owns the next executable step.'
}

function interactionFor(requirement: Requirement, interactions: ProjectionUserInteraction[]) {
  return interactions.find(item =>
    item.status === 'pending' && item.applicationCaseId === requirement.applicationCaseId && item.requirementId === requirement.id,
  ) ?? null
}

function currentInteractions(interactions: ProjectionUserInteraction[]) {
  const byKey = new Map<string, ProjectionUserInteraction[]>()
  for (const interaction of interactions) {
    const key = `${interaction.applicationCaseId}:${interaction.dedupeKey || interaction.id}`
    byKey.set(key, [...(byKey.get(key) ?? []), interaction])
  }
  return [...byKey.values()]
    .map(items => items.toSorted((left, right) => {
      const terminalRank = (value: ProjectionUserInteraction['status']) => value === 'answered' || value === 'skipped' || value === 'invalid' ? 1 : 0
      return terminalRank(right.status) - terminalRank(left.status) || left.id.localeCompare(right.id)
    })[0]!)
    .toSorted((left, right) => left.id.localeCompare(right.id))
}

function executionFor(requirement: Requirement, executions: ProjectionExecutionState[]) {
  const matching = executions.filter(item => item.applicationCaseId === requirement.applicationCaseId && (!item.requirementId || item.requirementId === requirement.id))
  return matching.sort((left, right) => (dateTime(right.updatedAt) ?? 0) - (dateTime(left.updatedAt) ?? 0))[0] ?? null
}

function inferBucket(evaluation: Omit<RequirementEvaluation, 'bucket'>) {
  if (evaluation.complete) return 'DONE' as const
  if (evaluation.interaction) return 'NEEDS_YOU' as const
  if (externalWaitingStatuses.has(statusOf(evaluation.requirement)) || evaluation.applicationCase.status === 'awaiting_referee' || evaluation.applicationCase.status === 'awaiting_writer' || evaluation.applicationCase.status === 'awaiting_institution') return 'WAITING' as const
  if (evaluation.execution?.state === 'blocked') return 'WAITING' as const
  return 'DOING' as const
}

function requirementWeight(requirement: Requirement) {
  const key = requirementKey(requirement)
  if (/submission/.test(key)) return 5
  if (/portal|form|section/.test(key)) return 3
  if (/essay|proposal|statement|sop/.test(key)) return 3
  if (/reference|referee|recommend/.test(key)) return 2.5
  if (/transcript|credential|test|ielts|toefl|gre/.test(key)) return 2.5
  if (/cv|document/.test(key)) return 2
  if (/fee|waiver|payment/.test(key)) return 2
  return 1
}

function requirementIsOnSubmissionPath(requirementId: string, byId: Map<string, Requirement>) {
  const dependents = new Map<string, string[]>()
  for (const requirement of byId.values()) {
    for (const dependencyId of requirement.dependencyIds ?? []) dependents.set(dependencyId, [...(dependents.get(dependencyId) ?? []), requirement.id])
  }
  const seen = new Set<string>()
  const queue = [...(dependents.get(requirementId) ?? [])]
  while (queue.length) {
    const next = queue.shift()!
    if (seen.has(next)) continue
    seen.add(next)
    const dependent = byId.get(next)
    if (dependent && /submission|submit|final review/.test(requirementKey(dependent))) return true
    queue.push(...(dependents.get(next) ?? []))
  }
  return /submission|submit|final review|portal/.test(requirementKey(byId.get(requirementId)!))
}

function leadTimeFor(requirement: Requirement, actor: ProjectionExternalActor | null) {
  const key = requirementKey(requirement)
  const match = Object.entries(leadTimeByType).find(([token]) => key.includes(token))
  if (match) return match[1]
  if (actor?.kind === 'recommender') return leadTimeByType.referee
  if (actor?.kind === 'writer') return leadTimeByType.writer
  if (actor?.kind === 'registrar') return leadTimeByType.transcript
  if (actor?.kind === 'credential_evaluator') return leadTimeByType.credential
  return 2 * 24 * 60 * 60 * 1_000
}

function safetyBufferFor(requirement: Requirement) {
  const key = requirementKey(requirement)
  const match = Object.entries(safetyBufferByType).find(([token]) => key.includes(token))
  return match?.[1] ?? safetyBufferByType.default
}

function riskFor(
  evaluation: RequirementEvaluation,
  artifacts: Artifact[],
  commitments: ProjectionExternalCommitment[],
  byId: Map<string, Requirement>,
  nowMs: number,
) {
  if (evaluation.complete || !evaluation.requirement.required) return null
  const deadline = evaluation.deadline
  const deadlineMs = dateTime(deadline?.dateTime)
  const timeRemainingMs = deadlineMs === null ? null : deadlineMs - nowMs
  const expectedCompletionMs = leadTimeFor(evaluation.requirement, evaluation.actor)
  const safetyBufferMs = safetyBufferFor(evaluation.requirement)
  const deadlineSlackMs = timeRemainingMs === null ? null : timeRemainingMs - expectedCompletionMs - safetyBufferMs
  const reasonCodes: RequirementRiskReasonCode[] = []
  const key = requirementKey(evaluation.requirement)
  const fee = feeRequirementFor(evaluation.applicationCase)
  const blocker = text(evaluation.requirement.blockerReason, 500) || null
  const hasArtifact = Boolean(evaluation.requirement.linkedArtifactId && artifacts.some(item => item.id === evaluation.requirement.linkedArtifactId && item.applicationCaseId === evaluation.applicationCase.id))
  const commitment = commitments.find(item => item.requirementId === evaluation.requirement.id)
  const promisedMs = dateTime(commitment?.promisedAt)
  const onSubmissionPath = requirementIsOnSubmissionPath(evaluation.requirement.id, byId)

  if (/transcript|registrar|official document/.test(key) && evaluation.bucket === 'WAITING') reasonCodes.push('EXTERNAL_REGISTRAR_WAIT')
  if (evaluation.actor?.kind === 'recommender' && evaluation.bucket === 'WAITING') reasonCodes.push('EXTERNAL_RECOMMENDER_WAIT')
  if (evaluation.actor?.kind === 'writer' && evaluation.bucket === 'WAITING') reasonCodes.push('EXTERNAL_WRITER_WAIT')
  if (evaluation.requirement.requirementType === 'admissions_clarification' && evaluation.bucket === 'WAITING') reasonCodes.push('ADMISSIONS_CLARIFICATION_PENDING')
  if (evaluation.requirement.requirementType === 'post_submission_request' && !evaluation.complete) reasonCodes.push('POST_SUBMISSION_RECOVERY_PENDING')
  if (evaluation.bucket === 'WAITING' && !reasonCodes.length) reasonCodes.push('EXTERNAL_INSTITUTION_WAIT')
  if (evaluation.interaction?.kind === 'attachment') reasonCodes.push('USER_ATTACHMENT_REQUIRED')
  if (evaluation.interaction?.kind === 'approve' || evaluation.interaction?.kind === 'payment_approval') reasonCodes.push('USER_APPROVAL_REQUIRED')
  if (deadlineMs !== null && deadlineMs < nowMs) reasonCodes.push('DEADLINE_BLOCKED')
  if (deadlineSlackMs !== null && deadlineSlackMs < 0) reasonCodes.push('DEADLINE_LOW_SLACK')
  if (evaluation.requirement.linkedArtifactId && !hasArtifact) reasonCodes.push('ARTIFACT_MISSING')
  if ((/portal|form|section/.test(key) || evaluation.applicationCase.currentStage === 'portal_preparation') && !evaluation.requirement.verificationEvidenceIds.length) reasonCodes.push('PORTAL_UNVERIFIED')
  if (evaluation.requirement.retryState?.escalated || (evaluation.requirement.retryState?.attempts ?? 0) >= (evaluation.requirement.retryState?.maximumAttempts ?? 3)) reasonCodes.push('RETRY_EXHAUSTED')
  if (evaluation.applicationCase.status === 'submitted' && !evaluation.applicationCase.applicationId) reasonCodes.push('SUBMISSION_UNVERIFIED')
  if (commitment && promisedMs !== null && promisedMs < nowMs) reasonCodes.push('DELIVERY_OVERDUE')
  if (fee && evaluation.requirement.id === fee.id) {
    if (['REQUEST_SUBMITTED', 'UNDER_REVIEW', 'EVIDENCE_REQUIRED', 'AWAITING_USER_EVIDENCE'].includes(fee.waiverDecisionState)) reasonCodes.push('FEE_WAIVER_PENDING')
    if (['AMBIGUOUS', 'RECONCILIATION_REQUIRED'].includes(fee.paymentState)) reasonCodes.push('PAYMENT_RECONCILIATION_REQUIRED')
    if (fee.paymentState === 'COMPLETE' || fee.paymentState === 'SUCCEEDED') reasonCodes.push('DUPLICATE_PAYMENT_BLOCKED')
  }

  // A promised external delivery is safe when the promise is still ahead of
  // the item deadline with the normal safety buffer intact.
  const safeCommitment = promisedMs !== null && deadlineMs !== null && promisedMs >= nowMs && deadlineMs - promisedMs >= safetyBufferMs
  const meaningfulDeadlineThreat = deadlineMs !== null && !safeCommitment && (deadlineSlackMs! < 0 || deadlineMs - nowMs <= expectedCompletionMs + safetyBufferMs)
  const meaningfulFeeRisk = Boolean(fee && evaluation.requirement.id === fee.id && ['FEE_WAIVER_PENDING', 'PAYMENT_RECONCILIATION_REQUIRED', 'DUPLICATE_PAYMENT_BLOCKED'].some(code => reasonCodes.includes(code as RequirementRiskReasonCode)))
  const meaningfulBlocker = Boolean(blocker && (onSubmissionPath || deadlineMs !== null))
  const meaningfulExternalOverdue = reasonCodes.includes('DELIVERY_OVERDUE')
  const meaningfulUnverified = reasonCodes.some(code => ['ARTIFACT_MISSING', 'PORTAL_UNVERIFIED', 'SUBMISSION_UNVERIFIED', 'RETRY_EXHAUSTED'].includes(code)) && onSubmissionPath
  if (!meaningfulDeadlineThreat && !meaningfulBlocker && !meaningfulExternalOverdue && !meaningfulUnverified && !meaningfulFeeRisk) return null
  if (!reasonCodes.length) return null

  const critical = reasonCodes.includes('DEADLINE_BLOCKED') || reasonCodes.includes('PAYMENT_RECONCILIATION_REQUIRED') || (deadlineSlackMs !== null && deadlineSlackMs < -safetyBufferMs) || (meaningfulExternalOverdue && deadlineSlackMs !== null && deadlineMs !== null && deadlineMs - nowMs < 0)
  const level: Exclude<RequirementRiskLevel, 'none'> = critical ? 'critical' : meaningfulDeadlineThreat || meaningfulExternalOverdue ? 'elevated' : 'watch'
  const reason = reasonCodes.includes('DEADLINE_BLOCKED')
    ? 'The authoritative deadline has passed while this requirement is unresolved.'
    : reasonCodes.includes('DELIVERY_OVERDUE')
      ? `${evaluation.actor?.name ?? 'An external dependency'} has missed the committed delivery date.`
    : reasonCodes.includes('PAYMENT_RECONCILIATION_REQUIRED')
      ? 'The payment result is ambiguous; reconcile portal and provider evidence before any retry.'
      : reasonCodes.includes('FEE_WAIVER_PENDING')
        ? 'The legitimate fee-waiver route is unresolved and may consume the payment deadline.'
      : reasonCodes.includes('DEADLINE_LOW_SLACK')
        ? 'The remaining deadline slack is shorter than the expected completion time and safety buffer.'
        : blocker ?? 'A required resulting-state verification is still missing.'
  const recommendedMitigation = evaluation.actor?.kind === 'registrar'
    ? 'Activate an accepted alternative transcript path or escalate with the registrar.'
    : evaluation.actor?.kind === 'recommender'
      ? 'Send the approved follow-up or prepare a verified replacement recommender.'
      : evaluation.actor?.kind === 'writer'
        ? 'Ask for the current draft and switch to the bounded revision path.'
        : evaluation.interaction
          ? 'Complete the linked Progress Detail action so ShotCount can resume.'
          : 'Continue the autonomous recovery path and verify the resulting state before submission.'
  const affectedApplicationCaseIds = onSubmissionPath ? [evaluation.applicationCase.id] : []
  const priority = (level === 'critical' ? 3_000 : level === 'elevated' ? 2_000 : 1_000) - (deadlineMs === null ? 0 : Math.max(0, Math.min(999, Math.floor((deadlineMs - nowMs) / 3_600_000))))
  return {
    id: `risk:${evaluation.applicationCase.id}:${evaluation.requirement.id}`,
    applicationCaseId: evaluation.applicationCase.id,
    requirementId: evaluation.requirement.id,
    level,
    reasonCodes: [...new Set(reasonCodes)],
    reason,
    deadline,
    timeRemainingMs,
    expectedCompletionMs,
    safetyBufferMs,
    deadlineSlackMs,
    blocker,
    recommendedMitigation,
    actor: evaluation.actor,
    affectedApplicationCaseIds,
    priority,
  } satisfies RequirementRisk
}

function caseIsSubmitted(applicationCase: ApplicationCase) {
  const status = normalized(applicationCase.status)
  const stage = normalized(applicationCase.currentStage)
  return Boolean(applicationCase.submittedAt) || status === 'submitted' || status === 'monitoring' || ['submitted', 'monitoring', 'interview', 'additional_documents', 'offer', 'rejected', 'closed'].includes(stage)
}

function submissionRiskFor(applicationCase: ApplicationCase, evaluations: RequirementEvaluation[], nowMs: number) {
  if (!caseIsSubmitted(applicationCase)) return null
  const submission = evaluations.find(item => /submission|submit/.test(requirementKey(item.requirement)))
  const verified = Boolean(applicationCase.applicationId && applicationCase.submittedAt && submission?.complete)
  if (verified) return null
  const deadline = submission?.deadline ?? applicationCase.deadlines[0] ?? null
  const deadlineMs = dateTime(deadline?.dateTime)
  const timeRemainingMs = deadlineMs === null ? null : deadlineMs - nowMs
  const expectedCompletionMs = leadTimeByType.submission
  const safetyBufferMs = safetyBufferByType.default
  return {
    id: `risk:${applicationCase.id}:submission-verification`,
    applicationCaseId: applicationCase.id,
    requirementId: submission?.requirement.id ?? `submission:${applicationCase.id}`,
    level: deadlineMs !== null && deadlineMs < nowMs ? 'critical' as const : 'elevated' as const,
    reasonCodes: ['SUBMISSION_UNVERIFIED' as const],
    reason: 'The portal acknowledgement is not verified, so this application is not safely complete.',
    deadline,
    timeRemainingMs,
    expectedCompletionMs,
    safetyBufferMs,
    deadlineSlackMs: deadlineMs === null ? null : timeRemainingMs! - expectedCompletionMs - safetyBufferMs,
    blocker: null,
    recommendedMitigation: 'Reopen the portal checkpoint and verify the final submission acknowledgement and application ID.',
    actor: { id: `portal:${applicationCase.id}`, kind: 'application_portal' as const, name: 'Application portal' },
    affectedApplicationCaseIds: [applicationCase.id],
    priority: 3_500,
  } satisfies RequirementRisk
}

function referenceFor(evaluation: RequirementEvaluation, interaction: ProjectionUserInteraction | null, execution: ProjectionExecutionState | null): ProjectionItemReference {
  return {
    requirementId: evaluation.requirement.id,
    applicationCaseId: evaluation.applicationCase.id,
    interactionId: interaction?.id ?? null,
    taskId: interaction?.taskId ?? null,
    responsibleAgent: execution?.owner ?? null,
    deadline: evaluation.deadline,
  }
}

function priorityFor(bucket: CampaignSummaryItem['bucket'], deadline: Deadline | null, nowMs: number, queued = false) {
  const deadlineMs = dateTime(deadline?.dateTime)
  const urgency = deadlineMs === null ? 0 : Math.max(0, 500 - Math.floor(Math.max(0, deadlineMs - nowMs) / 3_600_000))
  const base = bucket === 'NEEDS_YOU' ? 2_500 : bucket === 'WAITING' ? 1_500 : queued ? 900 : 1_000
  return base + urgency
}

function stableGroupId(prefix: string, values: string[]) {
  return `${prefix}:${[...new Set(values)].sort().join('|')}`
}

function groupItems(
  evaluations: RequirementEvaluation[],
  bucket: CampaignSummaryItem['bucket'],
  nowMs: number,
  groupKey: (evaluation: RequirementEvaluation) => string,
  queued = false,
) {
  const groups = new Map<string, RequirementEvaluation[]>()
  for (const evaluation of evaluations) {
    const key = groupKey(evaluation)
    groups.set(key, [...(groups.get(key) ?? []), evaluation])
  }
  return [...groups.entries()].map(([key, items]) => {
    const first = items[0]!
    const deadline = items.map(item => item.deadline).filter(Boolean).sort((left, right) => (dateTime(left?.dateTime) ?? Number.MAX_SAFE_INTEGER) - (dateTime(right?.dateTime) ?? Number.MAX_SAFE_INTEGER))[0] ?? null
    const interaction = first.interaction
    const actor = first.actor
    const references = items.map(item => referenceFor(item, item.interaction, item.execution))
    const applicationCaseIds = [...new Set(items.map(item => item.applicationCase.id))].sort()
    const requirementIds = [...new Set(items.map(item => item.requirement.id))].sort()
    const label = bucket === 'WAITING' && actor
      ? `Waiting on ${actor.name}`
      : interaction
        ? interaction.question
        : first.label
    const detail = bucket === 'WAITING' && items.length > 1
      ? `${items.length} application requirements are pending.`
      : bucket === 'NEEDS_YOU' && items.length > 1
        ? `${items.length} applications use this same decision.`
        : detailFor(first, bucket, actor, interaction)
    return {
      id: stableGroupId(`campaign:${bucket.toLocaleLowerCase()}:${key}`, requirementIds.length ? requirementIds : applicationCaseIds),
      bucket,
      label,
      detail,
      institution: first.institution,
      programme: first.programme,
      applicationCaseIds,
      requirementIds,
      references,
      deadline,
      actor,
      interaction,
      priority: priorityFor(bucket, deadline, nowMs, queued),
      updatedAt: latestTimestamp(...items.map(item => item.updatedAt)),
      ...(queued ? { queued: true } : {}),
    } satisfies CampaignSummaryItem
  }).sort((left, right) => right.priority - left.priority || (dateTime(left.deadline?.dateTime) ?? Number.MAX_SAFE_INTEGER) - (dateTime(right.deadline?.dateTime) ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id))
}

function meaningfulRequirement(requirement: Requirement) {
  return /submission|submit|recommend|referee|transcript|credential|proposal|statement|sop|cv|supervisor|professor|interview|decision|offer|portal|fee|waiver|payment/.test(requirementKey(requirement))
}

function verifiedAtFor(requirement: Requirement, evidenceById: Map<string, Evidence>, applicationCase: ApplicationCase) {
  const timestamps = requirement.verificationEvidenceIds.map(id => evidenceById.get(id)?.capturedAt).filter((value): value is string => Boolean(value))
  return latestTimestamp(...timestamps, applicationCase.updatedAt)
}

function applicationStateFor(
  applicationCase: ApplicationCase,
  evaluations: RequirementEvaluation[],
  risks: RequirementRisk[],
  userActions: CampaignSummaryItem[],
  waiting: CampaignSummaryItem[],
  active: CampaignSummaryItem[],
) {
  const status = normalized(applicationCase.status)
  const stage = normalized(applicationCase.currentStage)
  if (status === 'offer' || stage === 'offer') return 'offer' as const
  if (status === 'rejected' || stage === 'rejected') return 'rejected' as const
  if (status === 'withdrawn' || stage === 'withdrawn') return 'withdrawn' as const
  if (status === 'closed' || stage === 'closed') return 'complete' as const
  if (status === 'interview' || stage === 'interview') return 'interview' as const
  if (status === 'submitted' || status === 'monitoring' || stage === 'submitted' || stage === 'monitoring') return risks.length ? 'at_risk' as const : 'awaiting_decision' as const
  if (risks.length) return 'at_risk' as const
  if (userActions.length) return 'blocked_on_user' as const
  if (waiting.length && !active.length) return 'blocked_external' as const
  if (stage === 'submission_approval' || status === 'awaiting_submission_approval') return 'ready_for_review' as const
  const unresolved = evaluations.some(item => !item.complete)
  if (!unresolved) return 'ready_for_submission' as const
  if (stage === 'research' || stage === 'intake') return 'researching' as const
  return 'preparing' as const
}

function submissionStateFor(applicationCase: ApplicationCase, evaluations: RequirementEvaluation[]) {
  const status = normalized(applicationCase.status)
  const stage = normalized(applicationCase.currentStage)
  if (status === 'submitted' || stage === 'submitted' || stage === 'monitoring' || Boolean(applicationCase.submittedAt)) {
    const submission = evaluations.find(item => /submission|submit/.test(requirementKey(item.requirement)))
    return applicationCase.applicationId && applicationCase.submittedAt && submission?.complete ? 'submitted' as const : 'unverified' as const
  }
  if (stage === 'submission' || status === 'awaiting_submission_approval' && applicationCase.applicationId) return 'submitting' as const
  if (stage === 'submission_approval' || status === 'awaiting_submission_approval') return 'ready_for_review' as const
  if (evaluations.some(item => /submission|portal/.test(requirementKey(item.requirement)) && item.complete)) return 'in_progress' as const
  if (evaluations.length && evaluations.every(item => item.complete)) return 'ready_for_review' as const
  return 'not_started' as const
}

function postSubmissionStateFor(applicationCase: ApplicationCase) {
  const stage = normalized(applicationCase.currentStage)
  const status = normalized(applicationCase.status)
  if (!['submitted', 'monitoring', 'interview', 'additional_documents', 'offer', 'rejected', 'withdrawn', 'closed'].includes(stage) && !['submitted', 'monitoring', 'interview', 'additional_documents', 'offer', 'rejected', 'withdrawn', 'closed'].includes(status)) return 'not_applicable' as const
  if (stage === 'interview' || status === 'interview') return 'interview' as const
  if (stage === 'additional_documents' || status === 'additional_documents') return 'additional_documents' as const
  if (stage === 'offer' || status === 'offer') return 'offer' as const
  if (stage === 'rejected' || status === 'rejected') return 'rejected' as const
  if (stage === 'withdrawn' || status === 'withdrawn') return 'withdrawn' as const
  if (stage === 'closed' || status === 'closed') return 'complete' as const
  return 'monitoring' as const
}

function progressStateFor(state: ApplicationOverallState, submission: ApplicationSummary['submissionState'], postSubmission: ApplicationSummary['postSubmissionState'], percent: number | null) {
  if (state === 'complete' || state === 'withdrawn') return 'Complete' as const
  if (state === 'offer') return 'Offer' as const
  if (state === 'rejected') return 'Rejected' as const
  if (state === 'blocked_on_user') return 'Needs your input' as const
  if (state === 'blocked_external') return 'Waiting on others' as const
  if (postSubmission === 'interview') return 'Interview' as const
  if (submission === 'unverified') return 'Submission needs verification' as const
  if (state === 'at_risk') return 'At risk' as const
  if (postSubmission === 'monitoring') return 'Awaiting decision' as const
  if (submission === 'submitted') return 'Submitted' as const
  if (state === 'ready_for_review') return 'Ready for approval' as const
  if (state === 'ready_for_submission') return 'Ready for submission' as const
  if (percent !== null && percent >= 75) return 'Nearly ready' as const
  if (percent !== null && percent < 20) return 'Getting started' as const
  return 'In progress' as const
}

function milestonesFor(evaluations: RequirementEvaluation[], applicationCase: ApplicationCase) {
  const milestoneDefinitions: Array<[string, string, (items: RequirementEvaluation[]) => boolean, (items: RequirementEvaluation[]) => string[]]> = [
    ['programme-verified', 'Programme verified', items => items.length > 0, items => items.filter(item => /eligib|official|requirement|deadline/.test(requirementKey(item.requirement))).map(item => item.requirement.id)],
    ['materials-ready', 'Application materials ready', items => items.some(item => item.complete && /cv|document|statement|proposal|essay/.test(requirementKey(item.requirement))), items => items.filter(item => item.complete && /cv|document|statement|proposal|essay/.test(requirementKey(item.requirement))).map(item => item.requirement.id)],
    ['recommendations-underway', 'Recommendations underway', items => items.some(item => /reference|referee|recommend/.test(requirementKey(item.requirement))), items => items.filter(item => /reference|referee|recommend/.test(requirementKey(item.requirement))).map(item => item.requirement.id)],
    ['portal-substantially-complete', 'Portal substantially complete', items => items.filter(item => /portal|form|section/.test(requirementKey(item.requirement))).length > 0 && items.filter(item => /portal|form|section/.test(requirementKey(item.requirement))).every(item => item.complete), items => items.filter(item => /portal|form|section/.test(requirementKey(item.requirement))).map(item => item.requirement.id)],
    ['final-review-ready', 'Final review ready', items => items.length > 0 && items.every(item => item.complete), items => items.map(item => item.requirement.id)],
    ['submitted', 'Submitted', () => ['submitted', 'monitoring', 'interview', 'additional_documents', 'offer', 'rejected', 'closed'].includes(normalized(applicationCase.status)) || Boolean(applicationCase.submittedAt), () => []],
    ['post-submission-complete', 'Post-submission complete', () => ['offer', 'rejected', 'closed', 'withdrawn'].includes(normalized(applicationCase.status)), () => []],
  ]
  return milestoneDefinitions.map(([id, label, done, ids], index, definitions) => {
    const complete = done(evaluations)
    const previousComplete = index === 0 || definitions.slice(0, index).every(([, , predicate]) => predicate(evaluations))
    return { id, label, state: complete ? 'complete' : previousComplete ? 'current' : 'pending', requirementIds: ids(evaluations) } satisfies ApplicationMilestone
  })
}

function buildApplicationSummary(
  applicationCase: ApplicationCase,
  evaluations: RequirementEvaluation[],
  risks: RequirementRisk[],
  itemByCase: Map<string, CampaignSummaryItem[]>,
) {
  const caseItems = itemByCase.get(applicationCase.id) ?? []
  const active = evaluations.filter(item => item.bucket === 'DOING').map(item => toRequirementSummary(item))
  const waiting = evaluations.filter(item => item.bucket === 'WAITING').map(item => toRequirementSummary(item))
  const user = evaluations.filter(item => item.bucket === 'NEEDS_YOU').map(item => toRequirementSummary(item))
  const complete = evaluations.filter(item => item.complete && meaningfulRequirement(item.requirement)).sort((left, right) => (dateTime(right.verifiedAt) ?? 0) - (dateTime(left.verifiedAt) ?? 0)).map(item => toRequirementSummary(item)).slice(0, 12)
  const weightedTotal = evaluations.filter(item => item.requirement.required).reduce((sum, item) => sum + requirementWeight(item.requirement), 0)
  const weightedComplete = evaluations.filter(item => item.complete && item.requirement.required).reduce((sum, item) => sum + requirementWeight(item.requirement), 0)
  const completionPercent = weightedTotal > 0 ? Math.round((weightedComplete / weightedTotal) * 100) : null
  const userItems = caseItems.filter(item => item.bucket === 'NEEDS_YOU')
  const waitingItems = caseItems.filter(item => item.bucket === 'WAITING')
  const activeItems = caseItems.filter(item => item.bucket === 'DOING')
  const state = applicationStateFor(applicationCase, evaluations, risks, userItems, waitingItems, activeItems)
  const submissionState = submissionStateFor(applicationCase, evaluations)
  const postSubmissionState = postSubmissionStateFor(applicationCase)
  const nextItem = userItems[0] ?? activeItems[0] ?? waitingItems[0] ?? null
  const nextAction = userItems[0]?.label ?? risks[0]?.recommendedMitigation ?? nextItem?.label ?? (applicationCase.nextAction || null)
  const nextReference = userItems[0]?.references[0] ?? (risks[0] ? { requirementId: risks[0].requirementId, applicationCaseId: risks[0].applicationCaseId, interactionId: null, taskId: null, responsibleAgent: null, deadline: risks[0].deadline } : nextItem?.references[0] ?? null)
  const latestVerified = complete[0]
  const first = evaluations[0]
  const deadline = evaluations.map(item => item.deadline).filter(Boolean).sort((left, right) => (dateTime(left?.dateTime) ?? Number.MAX_SAFE_INTEGER) - (dateTime(right?.dateTime) ?? Number.MAX_SAFE_INTEGER))[0] ?? applicationCase.deadlines[0] ?? null
  const lastVerifiedProgress = latestVerified ? { label: latestVerified.label, verifiedAt: latestVerified.lastVerifiedAt } : null
  return {
    applicationCaseId: applicationCase.id,
    institution: first?.institution ?? 'University',
    programme: first?.programme ?? 'Graduate application',
    degree: first?.degree ?? 'Graduate programme',
    deadline,
    overallState: state,
    completionPercent,
    progressState: progressStateFor(state, submissionState, postSubmissionState, completionPercent),
    activeRequirements: active,
    waitingRequirements: waiting,
    userBlockedRequirements: user,
    riskRequirements: risks,
    completedRequirements: complete,
    completedRequirementCount: evaluations.filter(item => item.complete).length,
    nextAction,
    nextActionReference: nextReference,
    lastVerifiedProgress,
    submissionState,
    postSubmissionState,
    milestones: milestonesFor(evaluations, applicationCase),
  } satisfies ApplicationSummary
}

function toRequirementSummary(evaluation: RequirementEvaluation): RequirementSummary {
  return {
    requirementId: evaluation.requirement.id,
    applicationCaseId: evaluation.applicationCase.id,
    name: evaluation.requirement.name,
    label: evaluation.label,
    status: evaluation.requirement.status,
    bucket: evaluation.bucket,
    deadline: evaluation.deadline,
    evidenceIds: [...evaluation.requirement.verificationEvidenceIds],
    actor: evaluation.actor,
    interaction: evaluation.interaction,
    lastVerifiedAt: evaluation.verifiedAt,
    requirementType: evaluation.requirement.requirementType ?? null,
  }
}

function integrityFor(cases: ApplicationCase[], evaluations: RequirementEvaluation[], interactions: ProjectionUserInteraction[]) {
  const issues: string[] = []
  const caseIds = new Set(cases.map(item => item.id))
  const requirementIds = new Set<string>()
  for (const evaluation of evaluations) {
    if (evaluation.requirement.applicationCaseId !== evaluation.applicationCase.id) issues.push(`cross_case_requirement:${evaluation.requirement.id}`)
    if (requirementIds.has(evaluation.requirement.id)) issues.push(`duplicate_requirement:${evaluation.requirement.id}`)
    requirementIds.add(evaluation.requirement.id)
    for (const dependencyId of evaluation.requirement.dependencyIds ?? []) {
      const dependency = evaluations.find(item => item.requirement.id === dependencyId)
      if (!dependency) issues.push(`missing_dependency:${evaluation.requirement.id}:${dependencyId}`)
      else if (dependency.applicationCase.id !== evaluation.applicationCase.id) issues.push(`cross_case_dependency:${evaluation.requirement.id}:${dependencyId}`)
    }
  }
  for (const interaction of interactions) {
    if (!caseIds.has(interaction.applicationCaseId)) issues.push(`orphan_interaction:${interaction.id}`)
    if (interaction.status === 'pending' && interaction.requirementId && !requirementIds.has(interaction.requirementId)) issues.push(`orphan_interaction_requirement:${interaction.id}`)
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)].sort() } satisfies CampaignProjectionIntegrity
}

/**
 * Project one authoritative campaign. This is the only canonical status
 * decision point used by clients; it intentionally accepts current state, not
 * narration or an agent transcript.
 */
export function projectCampaign(input: ApplicationCampaignProjectionInput): ApplicationCampaignProjection {
  const generatedAt = input.now ?? new Date().toISOString()
  const nowMs = dateTime(generatedAt) ?? Date.now()
  const opportunityById = new Map(input.opportunities.filter(item => item.campaignId === input.campaign.id && item.userId === input.campaign.userId).map(item => [item.id, item]))
  const cases = input.cases
    .filter(item => item.campaignId === input.campaign.id && item.userId === input.campaign.userId)
    .toSorted((left, right) => left.id.localeCompare(right.id))
  const evidence = input.evidence ?? []
  const evidenceById = new Map(evidence.map(item => [item.id, item]))
  const contacts = input.contacts ?? []
  const assignments = input.assignments ?? []
  const executions = input.executions ?? []
  const rawInteractions = input.interactions ?? []
  const interactions = currentInteractions(rawInteractions).filter(item => item.status === 'pending')
  const commitments = input.commitments ?? []
  const evaluations: RequirementEvaluation[] = []
  const allCaseRisks = new Map<string, RequirementRisk[]>()
  const itemEvaluations = new Map<string, RequirementEvaluation[]>()
  const allRequirements: Requirement[] = []
  for (const applicationCase of cases) {
    const opportunity = opportunityById.get(applicationCase.opportunityId) ?? null
    const feeRequirement = feeRequirementAsRequirement(applicationCase)
    const requirements = [...applicationCase.requirements, ...(feeRequirement && !applicationCase.requirements.some(item => item.id === feeRequirement.id) ? [feeRequirement] : [])]
      .filter(requirement => requirement.applicationCaseId === applicationCase.id)
      .toSorted((left, right) => left.id.localeCompare(right.id))
    allRequirements.push(...requirements)
    for (const requirement of requirements) {
      const entry: RequirementEntry = {
        requirement,
        applicationCase,
        opportunity,
        institution: opportunity?.institution || 'University',
        programme: displayProgramme(opportunity, applicationCase),
        degree: displayDegree(opportunity, applicationCase),
      }
      const interaction = interactionFor(requirement, interactions) ?? feeInteractionFor(applicationCase, requirement)
      const execution = executionFor(requirement, executions)
      const actor = execution?.state === 'blocked'
        ? { id: 'shotcount-recovery', kind: 'system' as const, name: 'ShotCount recovery' }
        : actorFor(entry, contacts, assignments, commitments)
      const verifiedAt = isAcceptedEvidence(requirement, evidenceById) ? verifiedAtFor(requirement, evidenceById, applicationCase) : null
      const base = {
        ...entry,
        deadline: deadlineFor(entry),
        complete: isAcceptedEvidence(requirement, evidenceById),
        interaction,
        actor,
        execution,
        label: labelFor(requirement, 'DOING', actor),
        updatedAt: latestTimestamp(requirement.updatedAt, applicationCase.updatedAt),
        verifiedAt,
      }
      const bucket = inferBucket(base)
      const evaluation = { ...base, bucket, label: labelFor(requirement, bucket, actor) } satisfies RequirementEvaluation
      evaluations.push(evaluation)
      itemEvaluations.set(applicationCase.id, [...(itemEvaluations.get(applicationCase.id) ?? []), evaluation])
    }
  }

  const byRequirementId = new Map(allRequirements.map(item => [item.id, item]))
  const riskByRequirementId = new Map<string, RequirementRisk>()
  for (const evaluation of evaluations) {
    const risk = riskFor(evaluation, input.artifacts ?? [], commitments, byRequirementId, nowMs)
    if (risk) {
      riskByRequirementId.set(risk.requirementId, risk)
      allCaseRisks.set(evaluation.applicationCase.id, [...(allCaseRisks.get(evaluation.applicationCase.id) ?? []), risk])
    }
  }
  for (const applicationCase of cases) {
    const risk = submissionRiskFor(applicationCase, itemEvaluations.get(applicationCase.id) ?? [], nowMs)
    if (!risk) continue
    riskByRequirementId.set(risk.requirementId, risk)
    allCaseRisks.set(applicationCase.id, [...(allCaseRisks.get(applicationCase.id) ?? []), risk])
  }

  const activeEvaluations = evaluations.filter(item => item.bucket === 'DOING' && item.execution?.state !== 'queued' && item.execution?.state !== 'scheduled')
  const queuedEvaluations = evaluations.filter(item => item.bucket === 'DOING' && (item.execution?.state === 'queued' || item.execution?.state === 'scheduled'))
  const waitingEvaluations = evaluations.filter(item => item.bucket === 'WAITING')
  const userEvaluations = evaluations.filter(item => item.bucket === 'NEEDS_YOU')
  const activeWork = groupItems(activeEvaluations, 'DOING', nowMs, item => `${item.applicationCase.id}:${item.label}`)
  const queuedWork = groupItems(queuedEvaluations, 'DOING', nowMs, item => `${item.applicationCase.id}:${item.label}`, true)
  const waitingExternal = groupItems(waitingEvaluations, 'WAITING', nowMs, item => item.actor?.id ?? `${item.applicationCase.id}:${item.label}`)

  // Interactions may represent final approval or secure handoff even when the
  // requirement row is already "ready". They remain user actions until the
  // same interaction record is answered or invalidated.
  const interactionOnlyEvaluations: RequirementEvaluation[] = []
  for (const interaction of interactions.filter(item => item.status === 'pending')) {
    const existing = evaluations.find(item => item.interaction?.id === interaction.id)
    if (existing || !cases.some(item => item.id === interaction.applicationCaseId)) continue
    const applicationCase = cases.find(item => item.id === interaction.applicationCaseId)!
    const opportunity = opportunityById.get(applicationCase.opportunityId) ?? null
    const requirement = applicationCase.requirements.find(item => item.id === interaction.requirementId) ?? {
      id: interaction.requirementId ?? `interaction:${interaction.id}`,
      applicationCaseId: applicationCase.id,
      name: interaction.question,
      category: 'other',
      source: null,
      required: true,
      exactInstructions: interaction.reason,
      deadline: interaction.deadline ?? null,
      status: 'awaiting_user',
      responsibleParty: 'applicant',
      linkedArtifactId: null,
      verificationEvidenceIds: [],
      blockerReason: interaction.reason,
    } satisfies Requirement
    const evaluation: RequirementEvaluation = {
      requirement,
      applicationCase,
      opportunity,
      institution: opportunity?.institution || 'University',
      programme: displayProgramme(opportunity, applicationCase),
      degree: displayDegree(opportunity, applicationCase),
      deadline: interaction.deadline ?? deadlineFor({ requirement, applicationCase, opportunity, institution: opportunity?.institution || 'University', programme: displayProgramme(opportunity, applicationCase), degree: displayDegree(opportunity, applicationCase) }),
      complete: false,
      bucket: 'NEEDS_YOU',
      interaction,
      actor: null,
      execution: null,
      label: labelFor(requirement, 'NEEDS_YOU', null),
      updatedAt: null,
      verifiedAt: null,
    }
    interactionOnlyEvaluations.push(evaluation)
    itemEvaluations.set(applicationCase.id, [...(itemEvaluations.get(applicationCase.id) ?? []), evaluation])
  }
  userEvaluations.push(...interactionOnlyEvaluations)
  const userWork = groupItems(userEvaluations, 'NEEDS_YOU', nowMs, item => item.interaction?.dedupeKey ?? item.interaction?.id ?? item.requirement.id)

  const risks = [...riskByRequirementId.values()].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
  const itemByCase = new Map<string, CampaignSummaryItem[]>()
  for (const item of [...activeWork, ...queuedWork, ...waitingExternal, ...userWork]) {
    for (const caseId of item.applicationCaseIds) itemByCase.set(caseId, [...(itemByCase.get(caseId) ?? []), item])
  }
  const applications = cases.map(applicationCase => buildApplicationSummary(applicationCase, itemEvaluations.get(applicationCase.id) ?? [], allCaseRisks.get(applicationCase.id) ?? [], itemByCase))
  const recentlyCompleted = evaluations
    .filter(item => item.complete && meaningfulRequirement(item.requirement))
    .toSorted((left, right) => (dateTime(right.verifiedAt) ?? 0) - (dateTime(left.verifiedAt) ?? 0) || left.requirement.id.localeCompare(right.requirement.id))
    .slice(0, 12)
    .map(item => ({ id: `done:${item.applicationCase.id}:${item.requirement.id}`, applicationCaseId: item.applicationCase.id, requirementId: item.requirement.id, label: item.label, institution: item.institution, programme: item.programme, verifiedAt: item.verifiedAt, evidenceIds: [...item.requirement.verificationEvidenceIds] }) satisfies CompletedMilestone)
  const upcomingDeadlines = evaluations
    .filter(item => !item.complete && item.deadline && (dateTime(item.deadline.dateTime) ?? Number.MAX_SAFE_INTEGER) >= nowMs)
    .toSorted((left, right) => (dateTime(left.deadline?.dateTime) ?? Number.MAX_SAFE_INTEGER) - (dateTime(right.deadline?.dateTime) ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 12)
    .map(item => ({ applicationCaseId: item.applicationCase.id, requirementId: item.requirement.id, label: item.label, institution: item.institution, programme: item.programme, deadline: item.deadline! }))
  const activeApplications = applications.filter(item => !['complete', 'withdrawn', 'rejected'].includes(item.overallState)).length
  const submittedApplications = applications.filter(item => item.submissionState === 'submitted').length
  const decisionsPending = applications.filter(item => item.postSubmissionState === 'monitoring').length
  const counts = {
    applications: applications.length,
    activeApplications,
    submittedApplications,
    decisionsPending,
    doing: activeWork.length,
    queued: queuedWork.length,
    waitingExternal: waitingExternal.length,
    needsUser: userWork.length,
    risks: risks.length,
    completedRecently: recentlyCompleted.length,
  } satisfies CampaignProjectionCounts
  const allWaiting = applications.length > 0 && activeApplications > 0 && !activeWork.length && !queuedWork.length && !userWork.length && waitingExternal.length > 0
  const allClosed = applications.length > 0 && applications.every(item => ['complete', 'withdrawn', 'rejected', 'offer'].includes(item.overallState))
  const status: CampaignProjectionStatus = userWork.length ? 'needs_user' : risks.length ? 'risk_detected' : allClosed ? 'submission_season_complete' : allWaiting ? 'all_currently_waiting' : decisionsPending === activeApplications && decisionsPending > 0 ? 'decisions_pending' : 'active'
  const phase = allClosed
    ? 'campaign_closed'
    : applications.length > 0 && applications.every(item => item.submissionState === 'submitted' || ['offer', 'rejected', 'complete', 'withdrawn'].includes(item.overallState))
      ? decisionsPending > 0 ? 'decisions_pending' : 'offers_being_handled'
      : submittedApplications > 0 ? 'applications_submitted' : 'applications_preparing'
  const nextMeaningfulEvent = userWork[0] ?? risks[0] ?? activeWork[0] ?? waitingExternal[0] ?? null
  return {
    version: APPLICATION_CAMPAIGN_PROJECTION_VERSION,
    campaignId: input.campaign.id,
    applicantId: input.campaign.userId,
    generatedAt,
    status,
    phase,
    applications,
    activeWork,
    queuedWork,
    waitingExternal,
    userActions: userWork,
    risks,
    recentlyCompleted,
    upcomingDeadlines,
    counts,
    nextMeaningfulEvent,
    integrity: integrityFor(cases, evaluations, rawInteractions),
  }
}
