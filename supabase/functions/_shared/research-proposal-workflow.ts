/**
 * Canonical research-proposal workflow for David's application engine.
 *
 * This module is deliberately provider-neutral. It owns the typed proposal
 * contract, evidence boundaries, bounded user interactions, deterministic
 * validation, revision planning, and exact-artifact verification. The task
 * agent and the benchmark both call these functions; neither is allowed to
 * invent a second proposal state machine.
 */

export const RESEARCH_PROPOSAL_WORKFLOW_VERSION = 'research-proposal-workflow@1' as const

export const researchProposalTypes = [
  'full_research_proposal',
  'preliminary_proposal',
  'research_outline',
  'statement_of_proposed_research',
  'research_plan',
  'phd_project_proposal',
  'project_specific_application_statement',
  'lab_specific_research_statement',
  'methodology_proposal',
  'funding_research_proposal',
] as const
export type ResearchProposalType = typeof researchProposalTypes[number]

export const proposalRequirementStates = [
  'required',
  'conditionally_required',
  'recommended',
  'optional',
  'supervisor_contact',
  'shortlisting',
  'not_required',
  'unresolved',
] as const
export type ProposalRequirementState = typeof proposalRequirementStates[number]

export const proposalStages = [
  'application',
  'supervisor_contact',
  'shortlisting',
  'portal',
  'funding',
  'post_shortlisting',
] as const
export type ProposalStage = typeof proposalStages[number]

export const proposalTopicModes = [
  'applicant_defined',
  'advertised_project',
  'supervisor_defined',
  'collaborative',
  'unknown',
] as const
export type ProposalTopicMode = typeof proposalTopicModes[number]

export const proposalWorkflowStates = [
  'requirement_research',
  'context_collection',
  'direction_resolution',
  'programme_research',
  'strategy_building',
  'brief_ready',
  'writer_assignment_pending',
  'assigned',
  'drafting',
  'draft_received',
  'quality_review',
  'revision_required',
  'awaiting_applicant_decision',
  'supervisor_review',
  'supervisor_feedback_received',
  'final_revision',
  'final_quality_review',
  'approved',
  'artifact_ready',
  'uploaded',
  'complete',
  'blocked',
] as const
export type ProposalWorkflowState = typeof proposalWorkflowStates[number]

export type ProposalSourceType =
  | 'official_programme_page'
  | 'official_department_page'
  | 'official_research_degree_guidance'
  | 'official_application_instruction'
  | 'official_portal_requirement'
  | 'official_faculty_guidance'
  | 'official_faq'
  | 'supervisor_guidance'
  | 'lab_guidance'
  | 'scholarly_paper'
  | 'applicant_document'
  | 'provider_message'
  | 'reusable_context'

export type ProposalEvidence = {
  id: string
  url: string | null
  title: string
  excerpt: string
  retrievedAt: string
  sourceType: ProposalSourceType
  authority: 'official' | 'scholarly' | 'applicant' | 'provider' | 'inferred'
  verified: boolean
}

export type ProposalCitation = {
  id: string
  authors: string[]
  title: string
  venue: string | null
  year: number | null
  identifier: string | null
  url: string | null
  sourceEvidenceIds: string[]
  claimSupport: string[]
  verified: boolean
}

export type ProposalFormatRequirements = {
  fileTypes: string[]
  font: string | null
  fontSize: string | null
  margins: string | null
  lineSpacing: string | null
  header: string | null
  filenamePattern: string | null
  maxFileSizeBytes: number | null
  other: string[]
}

export type ProposalCitationRules = {
  style: string | null
  referencesRequired: boolean | null
  referencesIncludedInWordCount: boolean | null
  identifierRequired: boolean
  other: string[]
}

export type ResearchProposalRequirement = {
  id: string
  applicationCaseId: string
  institution: string
  programme: string
  degree: string | null
  proposalType: ResearchProposalType
  requirementState: ProposalRequirementState
  required: boolean
  stage: ProposalStage
  deadline: string | null
  uploadLocation: string | null
  submissionMethod: string
  wordLimit: number | null
  pageLimit: number | null
  requiredSections: string[]
  prohibitedSections: string[]
  evaluationCriteria: string[]
  citationRules: ProposalCitationRules
  formatRequirements: ProposalFormatRequirements
  supervisorReviewExpected: boolean | null
  supervisorContactBeforeDrafting: boolean | null
  topicMode: ProposalTopicMode
  sources: ProposalEvidence[]
  confidence: number
  retrievalDate: string
  exactInstructions: string
  unresolvedFields: string[]
}

export type ProposalRequirementDecision = {
  requirement: ResearchProposalRequirement
  authoritativeSources: ProposalEvidence[]
  rationale: string
  evidenceBacked: boolean
  unresolvedFields: string[]
}

export type ProposalRequirementInput = {
  id?: string
  applicationCaseId: string
  institution: string
  programme: string
  degree?: string | null
  officialSources: ProposalEvidence[]
  portalRequirements?: ProposalEvidence[]
  supervisorGuidance?: ProposalEvidence[]
  deadline?: string | null
  uploadLocation?: string | null
  extracted?: Partial<ResearchProposalRequirement>
  retrievedAt?: string
}

export type ProposalContextFact = {
  id: string
  label: string
  value: string
  sourceIds: string[]
  provenance: 'verified_applicant' | 'verified_document' | 'verified_provider' | 'inferred'
  verified: boolean
}

export type ProposalContextSource = {
  id: string
  kind: 'applicant_profile' | 'cv' | 'transcript' | 'thesis' | 'publication' | 'project' | 'sop' | 'previous_proposal' | 'supervisor_dossier' | 'programme_research' | 'gmail' | 'previous_application' | 'reusable_context' | 'attachment'
  title: string
  verified: boolean
  facts: ProposalContextFact[]
  sourceIds?: string[]
}

export type ProposalContextSnapshot = {
  sources: ProposalContextSource[]
  facts: ProposalContextFact[]
  verifiedFacts: ProposalContextFact[]
  unresolvedKinds: string[]
  resolvedFactCount: number
  factCount: number
  autonomousResolutionRate: number
  sourceIds: string[]
}

export type ProposalResearchDirection = {
  id: string
  workingTitle: string
  problem: string
  motivation: string
  likelyResearchQuestion: string
  methodologicalDirection: string
  whyApplicantFit: string
  whyProgrammeFit: string
  feasibility: string
  noveltyHypothesis: string
  evidence: string[]
  status: 'verified_basis' | 'proposed'
  scores: {
    applicantFit: number
    programmeFit: number
    supervisorFit: number
    feasibility: number
    novelty: number
    total: number
  }
  recommended?: boolean
}

export type ProposalPaperSummary = {
  citation: ProposalCitation
  summary: string
  methods: string[]
  limitations: string[]
  openProblems: string[]
  applicantContribution: string
  sourceEvidenceIds: string[]
}

export type ProposalClaim = {
  id: string
  text: string
  sourceIds: string[]
  confidence: 'high' | 'medium' | 'low'
  claimType: 'requirement' | 'applicant' | 'programme_fit' | 'literature' | 'novelty' | 'feasibility' | 'method'
}

export type ProposalResearchDossier = {
  id: string
  applicationCaseId: string
  institution: string
  programme: string
  department: string | null
  supervisor: string | null
  researchGroup: string | null
  currentResearchThemes: ProposalClaim[]
  relevantRecentPapers: ProposalPaperSummary[]
  methods: ProposalClaim[]
  researchGaps: ProposalClaim[]
  relevantDatasets: ProposalClaim[]
  infrastructure: ProposalClaim[]
  relatedApplicantWork: ProposalClaim[]
  candidateResearchQuestions: ProposalClaim[]
  sources: ProposalEvidence[]
  invalidClaims: string[]
}

export type ProposalMethodology = {
  approach: string
  data: string[]
  experimentsOrAnalysis: string[]
  tools: string[]
  validation: string[]
  dependencies: string[]
}

export type ResearchProposalStrategy = {
  id: string
  applicationCaseId: string
  requirementId: string
  directionId: string
  centralResearchProblem: string
  primaryResearchQuestion: string
  secondaryResearchQuestions: string[]
  hypothesis: string | null
  motivation: string
  gap: string
  methodology: ProposalMethodology
  expectedContribution: string[]
  feasibility: {
    durationMonths: number | null
    equipment: string[]
    dataAccess: string[]
    skills: string[]
    ethicalApprovals: string[]
    dependencies: string[]
    riskLevel: 'low' | 'medium' | 'high'
    assessment: string
  }
  applicantFit: string
  supervisorFit: string
  risks: string[]
  expectedOutputs: string[]
  timeline: string[]
  evaluationCriteriaMapping: Record<string, string>
  novelty: {
    claim: string
    mode: 'underexplored' | 'extension' | 'different_setting' | 'unresolved'
    evidenceIds: string[]
    confidence: 'high' | 'medium' | 'low'
  }
  evidenceMap: ProposalClaim[]
  unsupportedClaimsToAvoid: string[]
  revisionNotes: string[]
  version: number
}

export type ResearchProposalBrief = {
  id: string
  applicationCaseId: string
  application: {
    institution: string
    programme: string
    degree: string | null
    deadline: string | null
    supervisor: string | null
    proposalType: ResearchProposalType
  }
  formalRequirements: ResearchProposalRequirement
  applicant: {
    academicHistory: ProposalClaim[]
    relevantResearch: ProposalClaim[]
    technicalSkills: ProposalClaim[]
    publicationsAndProjects: ProposalClaim[]
    intendedResearchDirection: ProposalResearchDirection
  }
  researchProblem: {
    background: string
    gap: string
    question: string
    contribution: string[]
  }
  relevantLiterature: ProposalPaperSummary[]
  programmeAndLabFit: ProposalClaim[]
  proposedMethodology: ProposalMethodology
  expectedContribution: string[]
  constraints: {
    unsupportedClaimsToAvoid: string[]
    speculativeAreas: string[]
    programmeRestrictions: string[]
  }
  evidenceMap: ProposalClaim[]
  sourceIds: string[]
  briefText: string
}

export type ProposalWriterCandidate = {
  id: string
  name: string
  email: string
  specialties: string[]
  degreeFields: string[]
  programmeFamiliarity: string[]
  proposalTypes: ResearchProposalType[]
  availability: 'available' | 'busy' | 'unavailable'
  activeAssignments: number
  qualityScore: number | null
  reliabilityScore: number | null
  revisionRate: number | null
  turnaroundHours: number | null
}

export type ProposalWriterAssignment = {
  id: string
  applicationCaseId: string
  writerId: string
  specialty: string
  deliverable: string
  brief: ResearchProposalBrief
  sourceMaterialIds: string[]
  deadline: string | null
  status: 'assigned' | 'drafting' | 'revision_requested' | 'quality_review' | 'approved'
  selectionScore: number
  selectionReasons: string[]
  revisionCount: number
}

export type ProposalDraft = {
  id: string
  version: number
  applicationCaseId: string
  applicantName: string
  institution: string
  programme: string
  degree: string | null
  supervisor: string | null
  proposalType: ResearchProposalType
  filename: string
  fileType: string
  body: string
  sections: string[]
  pageCount: number | null
  citations: ProposalCitation[]
  sourceFactIds: string[]
  sourceEvidenceIds: string[]
  formatMetadata: Record<string, string | number | boolean | null>
  artifactId: string | null
  checksum: string | null
  receivedAt: string
}

export type ProposalValidationIssue = {
  code: string
  message: string
  severity: 'error' | 'warning'
  evidenceIds?: string[]
}

export type ProposalDraftValidation = {
  valid: boolean
  hardFailures: ProposalValidationIssue[]
  warnings: ProposalValidationIssue[]
  wordCount: number
  characterCount: number
  pageCount: number | null
  citationVerification: ProposalCitationVerification
  consistency: ProposalConsistencyResult
}

export type ProposalCitationVerification = {
  valid: boolean
  verifiedCount: number
  hallucinatedCount: number
  issues: ProposalValidationIssue[]
}

export type ProposalConsistencyClaim = {
  field: string
  value: string
  sourceFactId: string
}

export type ProposalConsistencyResult = {
  valid: boolean
  issues: ProposalValidationIssue[]
}

export type ProposalQualityDimension =
  | 'researchProblem'
  | 'literatureGrounding'
  | 'researchGap'
  | 'researchQuestion'
  | 'methodology'
  | 'contribution'
  | 'applicantFit'
  | 'supervisorProgrammeFit'
  | 'writing'
  | 'requirements'

export type ProposalQualityReview = {
  passed: boolean
  scores: Record<ProposalQualityDimension, number>
  blockingDimensions: ProposalQualityDimension[]
  hardFailures: ProposalValidationIssue[]
  warnings: ProposalValidationIssue[]
  reviewer: 'david' | 'specialist' | 'supervisor'
  notes: string[]
}

export type ProposalFeedbackCategory =
  | 'scope_change'
  | 'research_question_change'
  | 'methodology_change'
  | 'literature_addition'
  | 'feasibility_issue'
  | 'formatting_change'
  | 'programme_fit_issue'
  | 'supervisor_fit_issue'
  | 'minor_edit'
  | 'approval'
  | 'rejection_of_direction'
  | 'meeting_requested'
  | 'other'

export type ProposalFeedbackInterpretation = {
  id: string
  sourceMessageId: string
  sourceThreadId: string | null
  category: ProposalFeedbackCategory
  requestedChange: string
  severity: 'critical' | 'major' | 'minor' | 'informational'
  clarificationRequired: boolean
  revisionPriority: number
  evidenceIds: string[]
  revisionRequirements: string[]
  affectsStrategy: boolean
}

export type ProposalRevisionPlan = {
  revisionNumber: number
  explicitDefects: string[]
  instructions: string[]
  priority: number
  clarificationRequired: boolean
  requiresDirectionDecision: boolean
  strategyPatch: Partial<ResearchProposalStrategy>
}

export type ProposalArtifactIdentity = {
  applicationCaseId: string
  institution: string
  programme: string
  supervisor: string | null
  proposalVersion: number
  sourceArtifactId: string | null
  renderedArtifactId: string
  sourceFilename: string | null
  renderedFilename: string
  checksum: string
  provenanceSourceIds: string[]
  approvalState: 'pending' | 'approved' | 'rejected' | 'superseded'
  uploadState: 'not_uploaded' | 'uploaded' | 'verified'
}

export type ProposalDeliveryVerification = {
  valid: boolean
  applicationCaseId: string
  artifactId: string
  checksum: string
  destination: string
  uploadedFilename: string
  uploadedChecksum: string
  readBackVerified: boolean
  evidenceIds: string[]
  issues: ProposalValidationIssue[]
}

export type ProposalInteractionOption = {
  id: string
  label: string
  value: string
  description: string
}

export type ProposalProgressDetail = {
  id: string
  kind: 'progress_detail'
  applicationCaseId: string
  workflowState: ProposalWorkflowState
  title: string
  message: string
  inputMode: 'approve' | 'choose' | 'structured' | 'attachment' | 'free_text'
  options: ProposalInteractionOption[]
  allowFreeText: boolean
  attachmentKinds: string[]
  requiredDecision: string | null
}

export type ResearchProposalWorkflow = {
  version: typeof RESEARCH_PROPOSAL_WORKFLOW_VERSION
  applicationCaseId: string
  currentState: ProposalWorkflowState
  requirement: ResearchProposalRequirement
  context: ProposalContextSnapshot
  directionCandidates: ProposalResearchDirection[]
  selectedDirectionId: string | null
  dossier: ProposalResearchDossier | null
  strategy: ResearchProposalStrategy | null
  brief: ResearchProposalBrief | null
  writerAssignment: ProposalWriterAssignment | null
  drafts: ProposalDraft[]
  qualityReviews: ProposalQualityReview[]
  supervisorFeedback: ProposalFeedbackInterpretation[]
  revisionPlans: ProposalRevisionPlan[]
  finalArtifact: ProposalArtifactIdentity | null
  delivery: ProposalDeliveryVerification | null
  interactions: ProposalProgressDetail[]
  userInterventions: number
  contextFactsResolvedAutomatically: number
  contextFactsConsidered: number
  revisionCount: number
  transitionHistory: Array<{ from: ProposalWorkflowState; to: ProposalWorkflowState; event: string; at: string }>
  blockers: string[]
}

function text(value: unknown, maximum = 10_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function unique(values: string[]) {
  return [...new Set(values.map(value => text(value, 2_000)).filter(Boolean))]
}

function positiveInteger(value: unknown) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function clamp(value: unknown, minimum = 0, maximum = 100) {
  const number = Number(value)
  if (!Number.isFinite(number)) return minimum
  return Math.max(minimum, Math.min(maximum, Math.round(number)))
}

function confidence(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number))
}

function normalized(value: unknown) {
  return text(value, 20_000).toLocaleLowerCase().replace(/\s+/g, ' ')
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
  return value
}

function shortHash(value: unknown) {
  const input = JSON.stringify(stable(value))
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0
}

function isOfficialSource(source: ProposalEvidence) {
  return source.verified && ['official', 'provider'].includes(source.authority) && source.sourceType !== 'provider_message'
}

function sourceMap(sources: ProposalEvidence[]) {
  return new Map(sources.map(source => [source.id, source]))
}

function inferredProposalType(value: string) {
  const input = normalized(value)
  if (/funding|scholarship|studentship|fellowship|grant/.test(input)) return 'funding_research_proposal' as const
  if (/methodology|methods? proposal/.test(input)) return 'methodology_proposal' as const
  if (/statement of proposed research|proposed research statement/.test(input)) return 'statement_of_proposed_research' as const
  if (/research outline|outline of research/.test(input)) return 'research_outline' as const
  if (/research plan|plan of research/.test(input)) return 'research_plan' as const
  if (/preliminary|short proposal|brief proposal/.test(input)) return 'preliminary_proposal' as const
  if (/advertised|project[- ]specific|specific project/.test(input)) return 'project_specific_application_statement' as const
  if (/lab[- ]specific|research statement/.test(input)) return 'lab_specific_research_statement' as const
  if (/phd project|doctoral project/.test(input)) return 'phd_project_proposal' as const
  return 'full_research_proposal' as const
}

function inferredStage(input: string, state: ProposalRequirementState): ProposalStage {
  if (state === 'supervisor_contact') return 'supervisor_contact'
  if (/shortlist|shortlist(ed|ing)|after selection|following selection/.test(input)) return 'shortlisting'
  if (/funding|scholarship|studentship|fellowship|grant/.test(input)) return 'funding'
  if (/portal|upload|application form/.test(input)) return 'portal'
  return 'application'
}

function inferTopicMode(input: string): ProposalTopicMode {
  if (/advertised project|predefined project|specific project|project description/.test(input)) return 'advertised_project'
  if (/supervisor[- ]defined|supervisor will define|defined by the supervisor/.test(input)) return 'supervisor_defined'
  if (/co[- ]?develop|collaborative|jointly develop/.test(input)) return 'collaborative'
  if (/own project|your own proposal|applicant[- ]defined|propose your own/.test(input)) return 'applicant_defined'
  return 'unknown'
}

function parseLimit(input: string, expression: RegExp) {
  const match = input.match(expression)
  return match?.[1] ? positiveInteger(match[1].replaceAll(',', '')) : null
}

function parseSections(input: string) {
  const match = input.match(/(?:sections?|include|comprise(?:s)?)\s*[:\-]\s*([^.!?\n]+)/i)
  if (!match?.[1]) return []
  return unique(match[1].split(/,|;|\band\b/i).map(item => item.replace(/[()[\]]/g, '').trim())).slice(0, 30)
}

function parseFileTypes(input: string) {
  const fileTypes = [...input.matchAll(/\.(pdf|docx?|tex)\b/gi)].map(match => `.${match[1]!.toLocaleLowerCase()}`)
  return unique(fileTypes)
}

function parseCitationStyle(input: string) {
  const match = input.match(/\b(apa|mla|chicago|harvard|vancouver|ieee|oxford)\b(?:\s+style|\s+referencing|\s+citation)?/i)
  return match?.[1] ? match[1]!.toLocaleLowerCase() : null
}

function parseState(input: string): ProposalRequirementState {
  if (/(?:after|following|once)\s+(?:a\s+)?(?:supervisor|shortlist|selection)|only\s+(?:if|after)|may be requested|if shortlisted/.test(input)) {
    if (/supervisor/.test(input) && !/shortlist|selection/.test(input)) return 'supervisor_contact'
    return 'conditionally_required'
  }
  if (/\b(?:not required|do not submit|no (?:research )?proposal|not normally required)\b/.test(input)) return 'not_required'
  if (/\b(?:recommended|encouraged|strongly advised)\b/.test(input)) return 'recommended'
  if (/\b(?:optional|if you wish|may submit)\b/.test(input)) return 'optional'
  if (/\b(?:required|submit|must submit|must include|should submit|need to submit)\b/.test(input)) return 'required'
  return 'unresolved'
}

function defaultFormatRequirements(): ProposalFormatRequirements {
  return { fileTypes: [], font: null, fontSize: null, margins: null, lineSpacing: null, header: null, filenamePattern: null, maxFileSizeBytes: null, other: [] }
}

function defaultCitationRules(): ProposalCitationRules {
  return { style: null, referencesRequired: null, referencesIncludedInWordCount: null, identifierRequired: false, other: [] }
}

/**
 * Normalize a typed requirement after official research or portal extraction.
 * Unknown fields remain explicit blockers; they are never filled with generic
 * PhD assumptions.
 */
export function normalizeResearchProposalRequirement(input: Partial<ResearchProposalRequirement> & Pick<ResearchProposalRequirement, 'applicationCaseId' | 'institution' | 'programme'>): ResearchProposalRequirement {
  const state = proposalRequirementStates.includes(input.requirementState as ProposalRequirementState) ? input.requirementState as ProposalRequirementState : 'unresolved'
  const proposalType = researchProposalTypes.includes(input.proposalType as ResearchProposalType) ? input.proposalType as ResearchProposalType : 'full_research_proposal'
  const sources = Array.isArray(input.sources) ? input.sources.filter(source => text(source.id, 160)) : []
  const required = input.required ?? ['required', 'conditionally_required'].includes(state)
  const format = { ...defaultFormatRequirements(), ...(input.formatRequirements ?? {}) }
  const citations = { ...defaultCitationRules(), ...(input.citationRules ?? {}) }
  return {
    id: text(input.id, 160) || `proposal-requirement:${shortHash({ applicationCaseId: input.applicationCaseId, programme: input.programme })}`,
    applicationCaseId: text(input.applicationCaseId, 160),
    institution: text(input.institution, 300),
    programme: text(input.programme, 500),
    degree: text(input.degree, 200) || null,
    proposalType,
    requirementState: state,
    required,
    stage: proposalStages.includes(input.stage as ProposalStage) ? input.stage as ProposalStage : 'application',
    deadline: text(input.deadline, 100) || null,
    uploadLocation: text(input.uploadLocation, 500) || null,
    submissionMethod: text(input.submissionMethod, 500) || 'application portal',
    wordLimit: positiveInteger(input.wordLimit),
    pageLimit: positiveInteger(input.pageLimit),
    requiredSections: unique(input.requiredSections ?? []).slice(0, 40),
    prohibitedSections: unique(input.prohibitedSections ?? []).slice(0, 40),
    evaluationCriteria: unique(input.evaluationCriteria ?? []).slice(0, 40),
    citationRules: {
      style: text(citations.style, 120) || null,
      referencesRequired: typeof citations.referencesRequired === 'boolean' ? citations.referencesRequired : null,
      referencesIncludedInWordCount: typeof citations.referencesIncludedInWordCount === 'boolean' ? citations.referencesIncludedInWordCount : null,
      identifierRequired: citations.identifierRequired === true,
      other: unique(citations.other ?? []).slice(0, 20),
    },
    formatRequirements: {
      fileTypes: unique(format.fileTypes ?? []).slice(0, 10),
      font: text(format.font, 120) || null,
      fontSize: text(format.fontSize, 80) || null,
      margins: text(format.margins, 160) || null,
      lineSpacing: text(format.lineSpacing, 120) || null,
      header: text(format.header, 300) || null,
      filenamePattern: text(format.filenamePattern, 300) || null,
      maxFileSizeBytes: positiveInteger(format.maxFileSizeBytes),
      other: unique(format.other ?? []).slice(0, 30),
    },
    supervisorReviewExpected: typeof input.supervisorReviewExpected === 'boolean' ? input.supervisorReviewExpected : null,
    supervisorContactBeforeDrafting: typeof input.supervisorContactBeforeDrafting === 'boolean' ? input.supervisorContactBeforeDrafting : null,
    topicMode: proposalTopicModes.includes(input.topicMode as ProposalTopicMode) ? input.topicMode as ProposalTopicMode : 'unknown',
    sources,
    confidence: confidence(input.confidence),
    retrievalDate: text(input.retrievalDate, 100) || new Date().toISOString(),
    exactInstructions: text(input.exactInstructions, 12_000),
    unresolvedFields: unique(input.unresolvedFields ?? []).slice(0, 30),
  }
}

/**
 * Decide whether the programme expects a proposal. Only official sources or
 * explicit portal evidence can support a consequential decision.
 */
export function detectResearchProposalRequirement(input: ProposalRequirementInput): ProposalRequirementDecision {
  const allSources = [...(input.officialSources ?? []), ...(input.portalRequirements ?? []), ...(input.supervisorGuidance ?? [])]
  const authoritativeSources = allSources.filter(isOfficialSource)
  const ordered = [...authoritativeSources].sort((left, right) => {
    const rank = (source: ProposalEvidence) => source.sourceType === 'official_application_instruction' ? 0 : source.sourceType === 'official_portal_requirement' ? 1 : source.sourceType === 'official_research_degree_guidance' ? 2 : 3
    return rank(left) - rank(right) || left.id.localeCompare(right.id)
  })
  const instructionText = ordered.map(source => source.excerpt).join('\n')
  const normalizedInstruction = normalized(instructionText)
  const state = parseState(normalizedInstruction)
  const extracted = input.extracted ?? {}
  const extractedState = proposalRequirementStates.includes(extracted.requirementState as ProposalRequirementState) ? extracted.requirementState as ProposalRequirementState : state
  const finalState = state === 'unresolved' && extractedState !== 'unresolved' ? extractedState : state
  const exactInstructions = text(extracted.exactInstructions, 12_000) || ordered.map(source => source.excerpt).filter(Boolean).join('\n')
  const sections = (extracted.requiredSections?.length ? extracted.requiredSections : parseSections(normalizedInstruction)) ?? []
  const wordLimit = extracted.wordLimit ?? parseLimit(normalizedInstruction, /(?:no more than|maximum of|up to|limit of|under)\s*([\d,]+)\s*words?/i)
  const pageLimit = extracted.pageLimit ?? parseLimit(normalizedInstruction, /(?:no more than|maximum of|up to|limit of|under)\s*([\d,]+)\s*pages?/i)
  const topicMode = extracted.topicMode && extracted.topicMode !== 'unknown' ? extracted.topicMode : inferTopicMode(normalizedInstruction)
  const stage = extracted.stage && proposalStages.includes(extracted.stage) ? extracted.stage : inferredStage(normalizedInstruction, finalState)
  const unresolvedFields = unique([
    ...(extracted.unresolvedFields ?? []),
    ...(!authoritativeSources.length ? ['official_source'] : []),
    ...(finalState === 'unresolved' ? ['requirement_state'] : []),
    ...(finalState !== 'not_required' && !wordLimit && !pageLimit ? [] : []),
    ...(!exactInstructions ? ['exact_instructions'] : []),
  ])
  const requirement = normalizeResearchProposalRequirement({
    ...extracted,
    id: input.id,
    applicationCaseId: input.applicationCaseId,
    institution: input.institution,
    programme: input.programme,
    degree: input.degree,
    requirementState: finalState,
    required: ['required', 'conditionally_required'].includes(finalState),
    stage,
    wordLimit,
    pageLimit,
    requiredSections: sections,
    proposalType: extracted.proposalType ?? inferredProposalType(exactInstructions || input.programme),
    topicMode,
    sources: allSources,
    citationRules: {
      ...defaultCitationRules(),
      ...(extracted.citationRules ?? {}),
      style: extracted.citationRules?.style ?? parseCitationStyle(normalizedInstruction),
      referencesRequired: extracted.citationRules?.referencesRequired ?? (/references?|bibliography/.test(normalizedInstruction) ? true : null),
    },
    formatRequirements: {
      ...defaultFormatRequirements(),
      ...(extracted.formatRequirements ?? {}),
      fileTypes: extracted.formatRequirements?.fileTypes?.length ? extracted.formatRequirements.fileTypes : parseFileTypes(normalizedInstruction),
    },
    supervisorReviewExpected: extracted.supervisorReviewExpected ?? (/supervisor.{0,80}(?:approval|review|feedback)|review.{0,80}supervisor/.test(normalizedInstruction) ? true : null),
    supervisorContactBeforeDrafting: extracted.supervisorContactBeforeDrafting ?? (/contact.{0,80}supervisor.{0,80}(?:before|prior)|supervisor.{0,80}before.{0,80}proposal/.test(normalizedInstruction) ? true : null),
    uploadLocation: input.uploadLocation ?? extracted.uploadLocation,
    deadline: input.deadline ?? extracted.deadline,
    exactInstructions,
    confidence: authoritativeSources.length && finalState !== 'unresolved' ? state === 'unresolved' ? 0.7 : 0.95 : 0.2,
    retrievalDate: input.retrievedAt ?? extracted.retrievalDate ?? new Date().toISOString(),
    unresolvedFields,
  })
  const rationale = finalState === 'unresolved'
    ? 'No authoritative source states whether a proposal is expected; research or a narrow user decision is still required.'
    : `The proposal state is ${finalState.replaceAll('_', ' ')} based on ${authoritativeSources.length} authoritative source(s).`
  return { requirement, authoritativeSources: ordered, rationale, evidenceBacked: authoritativeSources.length > 0 && finalState !== 'unresolved', unresolvedFields }
}

export const extractResearchProposalRequirement = detectResearchProposalRequirement

/** Resolve all available context before producing a user question. */
export function collectProposalContext(input: { sources: ProposalContextSource[]; requiredKinds?: ProposalContextSource['kind'][] }): ProposalContextSnapshot {
  const sources = input.sources.filter(source => text(source.id, 160) && text(source.title, 500))
  const factsById = new Map<string, ProposalContextFact>()
  for (const source of sources) {
    for (const fact of source.facts ?? []) {
      if (!text(fact.id, 240) || !text(fact.value, 20_000)) continue
      const existing = factsById.get(fact.id)
      if (!existing || (fact.verified && !existing.verified)) factsById.set(fact.id, { ...fact, sourceIds: unique([...(fact.sourceIds ?? []), source.id]) })
      else factsById.set(fact.id, { ...existing, sourceIds: unique([...existing.sourceIds, ...(fact.sourceIds ?? []), source.id]) })
    }
  }
  const facts = [...factsById.values()]
  const verifiedFacts = facts.filter(fact => fact.verified && fact.provenance !== 'inferred')
  const requiredKinds = input.requiredKinds ?? ['applicant_profile', 'cv', 'programme_research']
  const unresolvedKinds = requiredKinds.filter(kind => !sources.some(source => source.kind === kind && source.verified && source.facts.some(fact => fact.verified)))
  const factCount = facts.length
  const resolvedFactCount = verifiedFacts.length
  return {
    sources,
    facts,
    verifiedFacts,
    unresolvedKinds,
    resolvedFactCount,
    factCount,
    autonomousResolutionRate: factCount ? resolvedFactCount / factCount : 0,
    sourceIds: unique(sources.flatMap(source => [source.id, ...(source.sourceIds ?? [])])),
  }
}

function scoreDirection(direction: ProposalResearchDirection) {
  const scores = {
    applicantFit: clamp(direction.scores.applicantFit),
    programmeFit: clamp(direction.scores.programmeFit),
    supervisorFit: clamp(direction.scores.supervisorFit),
    feasibility: clamp(direction.scores.feasibility),
    novelty: clamp(direction.scores.novelty),
    total: 0,
  }
  scores.total = clamp(scores.applicantFit * 0.25 + scores.programmeFit * 0.25 + scores.supervisorFit * 0.2 + scores.feasibility * 0.2 + scores.novelty * 0.1)
  return scores
}

/** Rank proposed directions without promoting inference to an applicant fact. */
export function rankResearchDirections(candidates: ProposalResearchDirection[], availableEvidenceIds: string[] = []): ProposalResearchDirection[] {
  const evidence = new Set(availableEvidenceIds)
  return candidates.map(candidate => {
    const groundedEvidence = candidate.evidence.filter(id => evidence.size === 0 || evidence.has(id))
    const scores = scoreDirection(candidate)
    return { ...candidate, evidence: groundedEvidence, status: (candidate.status === 'verified_basis' && groundedEvidence.length ? 'verified_basis' : 'proposed') as ProposalResearchDirection['status'], scores, recommended: false }
  }).sort((left, right) => right.scores.total - left.scores.total || left.id.localeCompare(right.id)).map((candidate, index) => ({ ...candidate, recommended: index === 0 }))
}

export const generateResearchDirections = rankResearchDirections

function claim(input: ProposalClaim, sourceLookup: Map<string, ProposalEvidence>, invalidClaims: string[]) {
  const sourceIds = unique(input.sourceIds ?? [])
  const missing = sourceIds.filter(id => !sourceLookup.has(id) || !sourceLookup.get(id)!.verified)
  if (!sourceIds.length || missing.length) invalidClaims.push(`${input.id}: missing verified evidence${missing.length ? ` (${missing.join(', ')})` : ''}`)
  return { ...input, text: text(input.text, 4_000), sourceIds, confidence: input.confidence ?? 'low' }
}

/** Build a dossier where every factual claim retains source provenance. */
export function buildProposalResearchDossier(input: {
  id?: string
  applicationCaseId: string
  institution: string
  programme: string
  department?: string | null
  supervisor?: string | null
  researchGroup?: string | null
  sources: ProposalEvidence[]
  currentResearchThemes?: ProposalClaim[]
  relevantRecentPapers?: ProposalPaperSummary[]
  methods?: ProposalClaim[]
  researchGaps?: ProposalClaim[]
  relevantDatasets?: ProposalClaim[]
  infrastructure?: ProposalClaim[]
  relatedApplicantWork?: ProposalClaim[]
  candidateResearchQuestions?: ProposalClaim[]
}): ProposalResearchDossier {
  const invalidClaims: string[] = []
  const lookup = sourceMap(input.sources)
  const claims = (values: ProposalClaim[] | undefined) => (values ?? []).map(item => claim(item, lookup, invalidClaims))
  const papers = (input.relevantRecentPapers ?? []).map(paper => ({
    ...paper,
    citation: { ...paper.citation, sourceEvidenceIds: unique(paper.citation.sourceEvidenceIds ?? []), claimSupport: unique(paper.citation.claimSupport ?? []) },
    sourceEvidenceIds: unique(paper.sourceEvidenceIds ?? []),
  }))
  for (const paper of papers) {
    const ids = unique([...paper.sourceEvidenceIds, ...paper.citation.sourceEvidenceIds])
    if (!ids.length || ids.some(id => !lookup.get(id)?.verified)) invalidClaims.push(`citation:${paper.citation.id}: missing verified paper evidence`)
  }
  return {
    id: text(input.id, 160) || `dossier:${shortHash(input)}`,
    applicationCaseId: text(input.applicationCaseId, 160),
    institution: text(input.institution, 300),
    programme: text(input.programme, 500),
    department: text(input.department, 300) || null,
    supervisor: text(input.supervisor, 300) || null,
    researchGroup: text(input.researchGroup, 300) || null,
    currentResearchThemes: claims(input.currentResearchThemes),
    relevantRecentPapers: papers,
    methods: claims(input.methods),
    researchGaps: claims(input.researchGaps),
    relevantDatasets: claims(input.relevantDatasets),
    infrastructure: claims(input.infrastructure),
    relatedApplicantWork: claims(input.relatedApplicantWork),
    candidateResearchQuestions: claims(input.candidateResearchQuestions),
    sources: input.sources.filter(source => text(source.id, 160)),
    invalidClaims: unique(invalidClaims),
  }
}

export function validateProposalResearchDossier(dossier: ProposalResearchDossier) {
  const issues: ProposalValidationIssue[] = dossier.invalidClaims.map(message => ({ code: 'ungrounded_dossier_claim', message, severity: 'error' as const }))
  if (!dossier.sources.some(source => source.authority === 'official' && source.verified)) issues.push({ code: 'programme_source_missing', message: 'The programme/lab dossier has no verified official source.', severity: 'error' })
  return { valid: issues.length === 0, issues }
}

/** Build a conservative strategy that follows the programme rubric and feasibility boundary. */
export function buildResearchProposalStrategy(input: {
  id?: string
  requirement: ResearchProposalRequirement
  direction: ProposalResearchDirection
  dossier: ProposalResearchDossier
  methodology: ProposalMethodology
  centralResearchProblem?: string
  primaryResearchQuestion?: string
  secondaryResearchQuestions?: string[]
  hypothesis?: string | null
  motivation?: string
  expectedContribution?: string[]
  feasibility?: Partial<ResearchProposalStrategy['feasibility']>
  risks?: string[]
  expectedOutputs?: string[]
  timeline?: string[]
  evaluationCriteriaMapping?: Record<string, string>
}): ResearchProposalStrategy {
  const evidenceMap = [
    ...input.dossier.currentResearchThemes,
    ...input.dossier.methods,
    ...input.dossier.researchGaps,
    ...input.dossier.relatedApplicantWork,
    ...input.dossier.candidateResearchQuestions,
  ]
  const absoluteNovelty = /\b(?:no one|nobody|first ever|unprecedented|never been studied)\b/i.test(input.direction.noveltyHypothesis)
  const novelty = absoluteNovelty
    ? { claim: 'Novelty is unresolved; the supplied evidence is insufficient for an absolute claim.', mode: 'unresolved' as const, evidenceIds: [], confidence: 'low' as const }
    : { claim: text(input.direction.noveltyHypothesis, 2_000) || 'This proposal investigates an underexplored or extended direction.', mode: 'underexplored' as const, evidenceIds: input.direction.evidence, confidence: input.direction.evidence.length ? 'medium' as const : 'low' as const }
  const feasibility = {
    durationMonths: positiveInteger(input.feasibility?.durationMonths),
    equipment: unique(input.feasibility?.equipment ?? []),
    dataAccess: unique(input.feasibility?.dataAccess ?? []),
    skills: unique(input.feasibility?.skills ?? []),
    ethicalApprovals: unique(input.feasibility?.ethicalApprovals ?? []),
    dependencies: unique(input.feasibility?.dependencies ?? input.methodology.dependencies),
    riskLevel: input.feasibility?.riskLevel ?? 'medium',
    assessment: text(input.feasibility?.assessment, 4_000) || input.direction.feasibility,
  }
  return {
    id: text(input.id, 160) || `strategy:${shortHash({ requirement: input.requirement.id, direction: input.direction.id })}`,
    applicationCaseId: input.requirement.applicationCaseId,
    requirementId: input.requirement.id,
    directionId: input.direction.id,
    centralResearchProblem: text(input.centralResearchProblem, 4_000) || input.direction.problem,
    primaryResearchQuestion: text(input.primaryResearchQuestion, 2_000) || input.direction.likelyResearchQuestion,
    secondaryResearchQuestions: unique(input.secondaryResearchQuestions ?? []).slice(0, 8),
    hypothesis: text(input.hypothesis, 2_000) || null,
    motivation: text(input.motivation, 4_000) || input.direction.motivation,
    gap: input.dossier.researchGaps[0]?.text || 'The evidence supports a focused extension, but the exact gap should remain conservative until literature coverage is complete.',
    methodology: {
      approach: text(input.methodology.approach, 4_000),
      data: unique(input.methodology.data),
      experimentsOrAnalysis: unique(input.methodology.experimentsOrAnalysis),
      tools: unique(input.methodology.tools),
      validation: unique(input.methodology.validation),
      dependencies: unique(input.methodology.dependencies),
    },
    expectedContribution: unique(input.expectedContribution ?? [input.direction.noveltyHypothesis]).slice(0, 12),
    feasibility,
    applicantFit: input.direction.whyApplicantFit,
    supervisorFit: input.direction.whyProgrammeFit,
    risks: unique(input.risks ?? []),
    expectedOutputs: unique(input.expectedOutputs ?? []),
    timeline: unique(input.timeline ?? []),
    evaluationCriteriaMapping: Object.fromEntries(Object.entries(input.evaluationCriteriaMapping ?? {}).map(([key, value]) => [text(key, 300), text(value, 2_000)]).filter(([key, value]) => key && value)),
    novelty,
    evidenceMap,
    unsupportedClaimsToAvoid: unique([
      'Do not claim that no one has studied the problem unless a systematic review supports it.',
      'Do not present inferred applicant interests as confirmed facts.',
      ...((input.requirement.topicMode === 'advertised_project') ? ['Do not replace the advertised project with an unrelated topic.'] : []),
    ]),
    revisionNotes: [],
    version: 1,
  }
}

export function validateResearchProposalStrategy(strategy: ResearchProposalStrategy, dossier: ProposalResearchDossier, requirement: ResearchProposalRequirement) {
  const issues: ProposalValidationIssue[] = []
  if (!text(strategy.centralResearchProblem, 4_000)) issues.push({ code: 'research_problem_missing', message: 'A central research problem is required.', severity: 'error' })
  if (!text(strategy.primaryResearchQuestion, 2_000)) issues.push({ code: 'research_question_missing', message: 'A primary research question is required.', severity: 'error' })
  if (!text(strategy.methodology.approach, 4_000)) issues.push({ code: 'methodology_missing', message: 'A methodology connected to the research question is required.', severity: 'error' })
  if (!strategy.evidenceMap.every(item => item.sourceIds.length && item.sourceIds.every(id => dossier.sources.some(source => source.id === id && source.verified)))) issues.push({ code: 'strategy_evidence_missing', message: 'Every factual strategy claim needs verified dossier evidence.', severity: 'error' })
  if (strategy.novelty.mode === 'unresolved') issues.push({ code: 'novelty_unresolved', message: 'Novelty coverage is insufficient; use conservative wording or research further.', severity: 'warning' })
  if (requirement.topicMode === 'advertised_project' && !/advertised|project|extension|specified/i.test(`${strategy.centralResearchProblem} ${strategy.primaryResearchQuestion}`)) issues.push({ code: 'advertised_project_fit_missing', message: 'The strategy does not show how it relates to the advertised project.', severity: 'error' })
  if (strategy.feasibility.riskLevel === 'high') issues.push({ code: 'feasibility_high_risk', message: strategy.feasibility.assessment || 'The proposed methodology has a high feasibility risk.', severity: 'warning' })
  return { valid: issues.every(issue => issue.severity !== 'error'), issues }
}

function claimsForContext(context: ProposalContextSnapshot, patterns: RegExp[]) {
  return context.verifiedFacts.filter(fact => patterns.some(pattern => pattern.test(`${fact.label} ${fact.value}`))).map(fact => ({ id: fact.id, text: `${fact.label}: ${fact.value}`, sourceIds: fact.sourceIds, confidence: 'high' as const, claimType: 'applicant' as const }))
}

/** Create the writer brief automatically from the requirement, dossier, strategy, and verified context. */
export function buildResearchProposalBrief(input: {
  id?: string
  requirement: ResearchProposalRequirement
  context: ProposalContextSnapshot
  direction: ProposalResearchDirection
  dossier: ProposalResearchDossier
  strategy: ResearchProposalStrategy
  academicHistory?: ProposalClaim[]
  relevantResearch?: ProposalClaim[]
  technicalSkills?: ProposalClaim[]
  publicationsAndProjects?: ProposalClaim[]
  programmeAndLabFit?: ProposalClaim[]
  programmeRestrictions?: string[]
}): ResearchProposalBrief {
  const academicHistory = input.academicHistory ?? claimsForContext(input.context, [/education|degree|academic|transcript/i])
  const relevantResearch = input.relevantResearch ?? [...input.dossier.relatedApplicantWork, ...claimsForContext(input.context, [/research|thesis|publication|project/i])]
  const technicalSkills = input.technicalSkills ?? claimsForContext(input.context, [/skill|method|python|analysis|model|laboratory|laboratory/i])
  const publicationsAndProjects = input.publicationsAndProjects ?? claimsForContext(input.context, [/publication|project|paper|thesis/i])
  const programmeAndLabFit = input.programmeAndLabFit ?? [
    ...input.dossier.currentResearchThemes,
    ...input.dossier.infrastructure,
    ...input.dossier.methods,
  ]
  const evidenceMap = uniqueClaims([
    ...input.strategy.evidenceMap,
    ...academicHistory,
    ...relevantResearch,
    ...technicalSkills,
    ...publicationsAndProjects,
    ...programmeAndLabFit,
  ])
  const brief: ResearchProposalBrief = {
    id: text(input.id, 160) || `brief:${shortHash({ requirement: input.requirement.id, strategy: input.strategy.id })}`,
    applicationCaseId: input.requirement.applicationCaseId,
    application: {
      institution: input.requirement.institution,
      programme: input.requirement.programme,
      degree: input.requirement.degree,
      deadline: input.requirement.deadline,
      supervisor: input.dossier.supervisor,
      proposalType: input.requirement.proposalType,
    },
    formalRequirements: input.requirement,
    applicant: { academicHistory, relevantResearch, technicalSkills, publicationsAndProjects, intendedResearchDirection: input.direction },
    researchProblem: { background: input.strategy.motivation, gap: input.strategy.gap, question: input.strategy.primaryResearchQuestion, contribution: input.strategy.expectedContribution },
    relevantLiterature: input.dossier.relevantRecentPapers,
    programmeAndLabFit,
    proposedMethodology: input.strategy.methodology,
    expectedContribution: input.strategy.expectedContribution,
    constraints: {
      unsupportedClaimsToAvoid: unique(input.strategy.unsupportedClaimsToAvoid),
      speculativeAreas: unique(input.strategy.risks),
      programmeRestrictions: unique(input.programmeRestrictions ?? input.requirement.formatRequirements.other),
    },
    evidenceMap,
    sourceIds: unique([...input.context.sourceIds, ...input.dossier.sources.map(source => source.id), ...evidenceMap.flatMap(item => item.sourceIds)]),
    briefText: '',
  }
  brief.briefText = formatResearchProposalBrief(brief)
  return brief
}

function uniqueClaims(claims: ProposalClaim[]) {
  const seen = new Set<string>()
  return claims.filter(item => {
    const key = `${item.id}:${item.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return Boolean(text(item.text, 4_000))
  })
}

export function formatResearchProposalBrief(brief: ResearchProposalBrief) {
  const lines = [
    `Application: ${brief.application.institution} — ${brief.application.programme}`,
    `Degree: ${brief.application.degree ?? 'not specified'} | Proposal type: ${brief.application.proposalType}`,
    `Deadline: ${brief.application.deadline ?? 'not specified'} | Supervisor: ${brief.application.supervisor ?? 'not specified'}`,
    `Formal requirements: ${brief.formalRequirements.wordLimit ? `${brief.formalRequirements.wordLimit} words` : 'word limit not specified'}${brief.formalRequirements.pageLimit ? `; ${brief.formalRequirements.pageLimit} pages` : ''}; format ${brief.formalRequirements.formatRequirements.fileTypes.join(', ') || 'programme-defined'}.`,
    `Required sections: ${brief.formalRequirements.requiredSections.join(', ') || 'none prescribed'}.`,
    '',
    'Applicant grounding:',
    ...brief.applicant.relevantResearch.slice(0, 8).map(item => `- ${item.text} [evidence: ${item.sourceIds.join(', ')}]`),
    ...brief.applicant.technicalSkills.slice(0, 8).map(item => `- Skill/method: ${item.text} [evidence: ${item.sourceIds.join(', ')}]`),
    '',
    `Research problem: ${brief.researchProblem.background}`,
    `Gap: ${brief.researchProblem.gap}`,
    `Primary question: ${brief.researchProblem.question}`,
    `Expected contribution: ${brief.expectedContribution.join('; ')}`,
    '',
    `Methodology: ${brief.proposedMethodology.approach}`,
    `Data: ${brief.proposedMethodology.data.join('; ') || 'to be justified'}`,
    `Validation: ${brief.proposedMethodology.validation.join('; ') || 'to be specified'}`,
    '',
    'Evidence constraints:',
    ...brief.constraints.unsupportedClaimsToAvoid.map(item => `- ${item}`),
    `Source count: ${brief.sourceIds.length}`,
  ]
  return lines.join('\n')
}

/** Use the existing writer pool's fields, with proposal-specific scoring. */
export function selectResearchProposalWriter(input: { applicationCaseId: string; brief: ResearchProposalBrief; candidates: ProposalWriterCandidate[]; id?: string }): { assignment: ProposalWriterAssignment | null; ranked: Array<{ writer: ProposalWriterCandidate; score: number; reasons: string[] }> } {
  const field = normalized(`${input.brief.application.degree ?? ''} ${input.brief.application.programme}`)
  const requiredType = input.brief.application.proposalType
  const ranked = input.candidates.filter(writer => writer.availability === 'available').map(writer => {
    const specialties = writer.specialties.map(normalized)
    const degreeFields = writer.degreeFields.map(normalized)
    const programmeFamiliarity = writer.programmeFamiliarity.map(normalized)
    const reasons: string[] = []
    const discipline = specialties.some(item => field.includes(item) || item.includes(field)) ? 25 : 0
    if (discipline) reasons.push('discipline match')
    const type = writer.proposalTypes.includes(requiredType) ? 20 : 0
    if (type) reasons.push('proposal-type experience')
    const familiarity = programmeFamiliarity.some(item => field.includes(item) || item.includes(field)) ? 15 : 0
    if (familiarity) reasons.push('programme familiarity')
    const method = degreeFields.some(item => input.brief.proposedMethodology.approach.toLocaleLowerCase().includes(item)) ? 15 : 0
    if (method) reasons.push('methodological familiarity')
    const quality = (writer.qualityScore ?? 50) * 0.2
    const reliability = (writer.reliabilityScore ?? 50) * 0.15
    const revisionPenalty = (writer.revisionRate ?? 0) * 0.1
    const loadPenalty = Math.min(15, writer.activeAssignments * 2)
    if (writer.turnaroundHours !== null && input.brief.application.deadline) reasons.push('deadline-aware availability check')
    return { writer, score: Math.round((discipline + type + familiarity + method + quality + reliability - revisionPenalty - loadPenalty) * 100) / 100, reasons }
  }).sort((left, right) => right.score - left.score || left.writer.id.localeCompare(right.writer.id))
  const selected = ranked[0]
  if (!selected) return { assignment: null, ranked }
  const assignment: ProposalWriterAssignment = {
    id: text(input.id, 160) || `proposal-assignment:${input.applicationCaseId}:${selected.writer.id}`,
    applicationCaseId: input.applicationCaseId,
    writerId: selected.writer.id,
    specialty: selected.writer.specialties[0] ?? 'research proposal writing',
    deliverable: `${input.brief.application.proposalType} for ${input.brief.application.programme}`,
    brief: input.brief,
    sourceMaterialIds: input.brief.sourceIds,
    deadline: input.brief.application.deadline,
    status: 'assigned',
    selectionScore: selected.score,
    selectionReasons: selected.reasons,
    revisionCount: 0,
  }
  return { assignment, ranked }
}

function proposalExtension(filename: string) {
  const match = filename.toLocaleLowerCase().match(/\.[a-z0-9]+$/)
  return match?.[0] ?? ''
}

function sectionAppears(body: string, section: string) {
  const heading = normalized(section).replace(/[^a-z0-9 ]/g, ' ').trim()
  if (!heading) return true
  const bodyText = normalized(body).replace(/[^a-z0-9 ]/g, ' ')
  if (bodyText.includes(heading)) return true
  const significantWords = heading.split(' ').filter(word => word.length > 3)
  return significantWords.length > 0 && significantWords.every(word => bodyText.includes(word))
}

/** Verify that every scholarly citation points to a supplied source record. */
export function verifyResearchProposalCitations(input: { citations: ProposalCitation[]; papers: ProposalPaperSummary[]; evidence?: ProposalEvidence[] }): ProposalCitationVerification {
  const papers = new Map(input.papers.map(paper => [paper.citation.id, paper]))
  const evidence = sourceMap(input.evidence ?? input.papers.flatMap(paper => paper.citation.sourceEvidenceIds.map(id => ({ id, url: null, title: '', excerpt: '', retrievedAt: '', sourceType: 'scholarly_paper' as const, authority: 'scholarly' as const, verified: true }))))
  const issues: ProposalValidationIssue[] = []
  let verifiedCount = 0
  let hallucinatedCount = 0
  for (const citation of input.citations) {
    const paper = papers.get(citation.id)
    const missingEvidence = citation.sourceEvidenceIds.filter(id => !evidence.get(id)?.verified)
    if (!citation.verified || !paper || missingEvidence.length || !citation.claimSupport.length) {
      hallucinatedCount += 1
      issues.push({
        code: 'hallucinated_citation',
        message: `Citation ${citation.id || citation.title || 'unknown'} is not fully verified against the supplied literature dossier.`,
        severity: 'error',
        evidenceIds: citation.sourceEvidenceIds,
      })
      continue
    }
    if (normalized(citation.title) !== normalized(paper.citation.title) || (citation.year !== null && paper.citation.year !== null && citation.year !== paper.citation.year)) {
      hallucinatedCount += 1
      issues.push({ code: 'citation_metadata_mismatch', message: `Citation ${citation.id} does not match the verified paper metadata.`, severity: 'error', evidenceIds: citation.sourceEvidenceIds })
      continue
    }
    verifiedCount += 1
  }
  return { valid: issues.length === 0, verifiedCount, hallucinatedCount, issues }
}

/** Compare structured proposal claims against the same verified facts used by the rest of the application. */
export function validateProposalCrossDocumentConsistency(input: { claims: ProposalConsistencyClaim[]; verifiedFacts: Array<{ id: string; value: string }>; otherProgrammeNames?: string[]; otherSupervisorNames?: string[] }): ProposalConsistencyResult {
  const facts = new Map(input.verifiedFacts.map(fact => [fact.id, normalized(fact.value)]))
  const issues: ProposalValidationIssue[] = []
  for (const claim of input.claims) {
    const expected = facts.get(claim.sourceFactId)
    if (expected === undefined) issues.push({ code: 'applicant_fact_unverified', message: `${claim.field} cites an unavailable verified applicant fact.`, severity: 'error' })
    else if (expected !== normalized(claim.value)) issues.push({ code: 'cross_document_inconsistency', message: `${claim.field} conflicts with the verified applicant record.`, severity: 'error' })
  }
  for (const name of input.otherProgrammeNames ?? []) {
    if (name && normalized(input.claims.map(claim => claim.value).join(' ')).includes(normalized(name))) issues.push({ code: 'wrong_programme_contamination', message: `Proposal content contains another programme name: ${name}.`, severity: 'error' })
  }
  for (const name of input.otherSupervisorNames ?? []) {
    if (name && normalized(input.claims.map(claim => claim.value).join(' ')).includes(normalized(name))) issues.push({ code: 'wrong_supervisor_contamination', message: `Proposal claims contain another supervisor name: ${name}.`, severity: 'error' })
  }
  return { valid: issues.length === 0, issues }
}

/**
 * Run deterministic checks before a semantic proposal review. A draft is
 * rejected on identity, requirements, citations, placeholders, or exact-file
 * failures; a reviewer never gets to waive these checks.
 */
export function validateResearchProposalDraft(input: {
  draft: ProposalDraft
  requirement: ResearchProposalRequirement
  expected: { applicantName: string; institution: string; programme: string; supervisor?: string | null; proposalType?: ResearchProposalType }
  checkRenderedFormat?: boolean
  verifiedFactIds?: string[]
  verifiedEvidenceIds?: string[]
  verifiedFacts?: Array<{ id: string; value: string }>
  sourcePapers?: ProposalPaperSummary[]
  evidence?: ProposalEvidence[]
  consistencyClaims?: ProposalConsistencyClaim[]
  otherProgrammeNames?: string[]
  otherSupervisorNames?: string[]
}): ProposalDraftValidation {
  const { draft, requirement, expected } = input
  const hardFailures: ProposalValidationIssue[] = []
  const warnings: ProposalValidationIssue[] = []
  const add = (code: string, message: string, severity: 'error' | 'warning' = 'error', evidenceIds?: string[]) => (severity === 'error' ? hardFailures : warnings).push({ code, message, severity, evidenceIds })
  const words = wordCount(draft.body)
  const characters = [...draft.body].length
  const extension = proposalExtension(draft.filename)
  const checkRenderedFormat = input.checkRenderedFormat !== false
  if (draft.applicationCaseId !== requirement.applicationCaseId) add('wrong_application_case', 'The proposal draft belongs to a different ApplicationCase.')
  if (normalized(draft.applicantName) !== normalized(expected.applicantName)) add('wrong_applicant', 'The proposal draft applicant does not match the verified applicant.')
  if (normalized(draft.institution) !== normalized(expected.institution)) add('wrong_institution', 'The proposal draft names the wrong institution.')
  if (normalized(draft.programme) !== normalized(expected.programme)) add('wrong_programme', 'The proposal draft names the wrong programme.')
  if (expected.supervisor && normalized(draft.supervisor ?? '') !== normalized(expected.supervisor)) add('wrong_supervisor', 'The proposal draft names the wrong supervisor.')
  if (expected.proposalType && draft.proposalType !== expected.proposalType) add('wrong_proposal_type', 'The proposal draft has the wrong programme-specific proposal type.')
  if (requirement.wordLimit !== null && words > requirement.wordLimit) add('word_limit_exceeded', `The proposal has ${words} words; the programme limit is ${requirement.wordLimit}.`)
  if (checkRenderedFormat && requirement.pageLimit !== null && (draft.pageCount === null || draft.pageCount > requirement.pageLimit)) add('page_limit_exceeded', `The proposal page count does not satisfy the ${requirement.pageLimit}-page limit.`)
  for (const section of requirement.requiredSections) if (!sectionAppears(draft.body, section)) add('required_section_missing', `Required section missing: ${section}.`)
  for (const section of requirement.prohibitedSections) if (sectionAppears(draft.body, section)) add('prohibited_section_present', `Prohibited section present: ${section}.`)
  if (checkRenderedFormat && requirement.formatRequirements.fileTypes.length && !requirement.formatRequirements.fileTypes.includes(extension)) add('wrong_file_type', `The file type ${extension || 'unknown'} is not one of the required formats.`)
  if (checkRenderedFormat && (!draft.filename || /[\\/\n\r]/.test(draft.filename))) add('invalid_filename', 'The proposal filename is missing or unsafe.')
  if (checkRenderedFormat && requirement.formatRequirements.filenamePattern && !new RegExp(requirement.formatRequirements.filenamePattern).test(draft.filename)) add('filename_requirement_failed', 'The filename does not satisfy the programme pattern.')
  if (/\b(?:lorem ipsum|insert (?:citation|name|text)|todo|tbd|placeholder|your name here|xxx+)\b/i.test(draft.body)) add('placeholder_text', 'The proposal contains placeholder text.')
  if (!new TextEncoder().encode(draft.body).length) add('empty_document', 'The proposal body is empty.')
  const knownFactIds = new Set(input.verifiedFactIds ?? [])
  const unknownFactIds = draft.sourceFactIds.filter(id => !knownFactIds.has(id))
  if (unknownFactIds.length) add('unverified_applicant_fact', `The draft cites facts that are not verified: ${unknownFactIds.join(', ')}.`)
  const knownEvidenceIds = new Set(input.verifiedEvidenceIds ?? [])
  const unknownEvidenceIds = draft.sourceEvidenceIds.filter(id => !knownEvidenceIds.has(id))
  if (unknownEvidenceIds.length) add('unverified_research_evidence', `The draft cites evidence that is not verified: ${unknownEvidenceIds.join(', ')}.`)
  const citationVerification = verifyResearchProposalCitations({ citations: draft.citations, papers: input.sourcePapers ?? [], evidence: input.evidence })
  hardFailures.push(...citationVerification.issues)
  const consistency = validateProposalCrossDocumentConsistency({
    claims: input.consistencyClaims ?? [],
    verifiedFacts: input.verifiedFacts ?? [],
    otherProgrammeNames: input.otherProgrammeNames,
    otherSupervisorNames: input.otherSupervisorNames,
  })
  hardFailures.push(...consistency.issues)
  if (requirement.supervisorReviewExpected === true && !draft.supervisor) add('supervisor_missing', 'The programme expects a supervisor-specific proposal but no supervisor is attached.')
  if (requirement.topicMode === 'advertised_project' && !/project|advertised|extension/i.test(draft.body)) warnings.push({ code: 'advertised_project_reference_weak', message: 'The draft does not visibly connect to the advertised project.', severity: 'warning' })
  return { valid: hardFailures.length === 0, hardFailures, warnings, wordCount: words, characterCount: characters, pageCount: draft.pageCount, citationVerification, consistency }
}

function defaultQualityScores(validation: ProposalDraftValidation, draft: ProposalDraft, strategy: ResearchProposalStrategy): Record<ProposalQualityDimension, number> {
  const bodyLength = wordCount(draft.body)
  const hasMethod = strategy.methodology.approach.length > 40 && strategy.methodology.validation.length > 0
  const scores: Record<ProposalQualityDimension, number> = {
    researchProblem: strategy.centralResearchProblem.length > 40 ? 82 : 48,
    literatureGrounding: validation.citationVerification.verifiedCount > 0 ? 82 : 42,
    researchGap: strategy.gap.length > 50 && strategy.novelty.mode !== 'unresolved' ? 78 : 55,
    researchQuestion: strategy.primaryResearchQuestion.length > 25 ? 84 : 48,
    methodology: hasMethod ? 84 : 52,
    contribution: strategy.expectedContribution.length ? 80 : 45,
    applicantFit: strategy.applicantFit.length > 30 ? 82 : 48,
    supervisorProgrammeFit: strategy.supervisorFit.length > 30 ? 82 : 48,
    writing: bodyLength >= 120 && bodyLength <= 10_000 ? 80 : 50,
    requirements: validation.valid ? 100 : 0,
  }
  return scores
}

/** Apply semantic scores only within a bounded, code-validated quality gate. */
export function evaluateResearchProposalQuality(input: { draft: ProposalDraft; validation: ProposalDraftValidation; strategy: ResearchProposalStrategy; scores?: Partial<Record<ProposalQualityDimension, number>>; reviewer?: 'david' | 'specialist' | 'supervisor'; notes?: string[] }): ProposalQualityReview {
  const scores = { ...defaultQualityScores(input.validation, input.draft, input.strategy), ...Object.fromEntries(Object.entries(input.scores ?? {}).map(([key, value]) => [key, clamp(value)])) } as Record<ProposalQualityDimension, number>
  const blockingDimensions = (Object.keys(scores) as ProposalQualityDimension[]).filter(dimension => scores[dimension] < 70)
  const hardFailures = [...input.validation.hardFailures]
  if (input.strategy.feasibility.riskLevel === 'high') {
    hardFailures.push({ code: 'infeasible_methodology', message: 'The proposed methodology has high feasibility risk and must be narrowed or evidenced before approval.', severity: 'error' })
    if (!blockingDimensions.includes('methodology')) blockingDimensions.push('methodology')
  }
  if (input.strategy.novelty.mode === 'unresolved') input.validation.warnings.push({ code: 'novelty_unresolved', message: 'Novelty remains unresolved and must be expressed conservatively.', severity: 'warning' })
  return {
    passed: hardFailures.length === 0 && blockingDimensions.length === 0,
    scores,
    blockingDimensions,
    hardFailures,
    warnings: [...input.validation.warnings],
    reviewer: input.reviewer ?? 'david',
    notes: unique(input.notes ?? []),
  }
}

function feedbackId(messageId: string, category: ProposalFeedbackCategory, requestedChange: string) {
  return `proposal-feedback:${shortHash({ messageId, category, requestedChange })}`
}

/** Translate a supervisor/reviewer message into bounded revision work. */
export function interpretResearchProposalFeedback(input: { messageId: string; threadId?: string | null; body: string; evidenceIds?: string[] }): ProposalFeedbackInterpretation[] {
  const body = text(input.body, 20_000)
  const lower = normalized(body)
  const items: ProposalFeedbackInterpretation[] = []
  const add = (category: ProposalFeedbackCategory, requestedChange: string, severity: ProposalFeedbackInterpretation['severity'], revisionRequirements: string[], affectsStrategy: boolean, clarificationRequired = false) => {
    items.push({ id: feedbackId(input.messageId, category, requestedChange), sourceMessageId: input.messageId, sourceThreadId: text(input.threadId, 240) || null, category, requestedChange, severity, clarificationRequired, revisionPriority: severity === 'critical' ? 1 : severity === 'major' ? 2 : severity === 'minor' ? 3 : 4, evidenceIds: unique(input.evidenceIds ?? []), revisionRequirements, affectsStrategy })
  }
  if (/approve|looks good|happy with|support this direction|no changes required/.test(lower)) add('approval', 'Supervisor approved the current direction or draft.', 'informational', [], false)
  if (/too broad|too ambitious|narrow|focus only|reduce scope|scope/.test(lower)) add('scope_change', body, /reject|cannot|unacceptable/.test(lower) ? 'critical' : 'major', ['Narrow the research scope to the supervisor-specified tractable subproblem.', 'Update the primary research question and remove claims outside the narrowed scope.', 'Re-run feasibility and programme-fit review.'], true)
  if (/research question|question should|ask instead|reframe the question/.test(lower)) add('research_question_change', body, 'major', ['Rewrite the primary research question to match the requested framing.', 'Check that each method and expected contribution answers the revised question.'], true)
  if (/method|methodolog|experiment|dataset|data access|validation|algorithm|approach/.test(lower)) add('methodology_change', body, 'major', ['Update the methodology section with the requested approach, data, experiments, and validation.', 'Re-run the technical plausibility and feasibility checks.'], true)
  if (/paper|citation|literature|reference|related work|bibliograph/.test(lower)) add('literature_addition', body, 'major', ['Add or replace the requested verified scholarly sources.', 'Verify author, title, year, identifier, and claim support before redrafting.'], false)
  if (/feasib|resource|equipment|time|duration|ethic|ethics|access/.test(lower)) add('feasibility_issue', body, 'major', ['Resolve the stated resource, duration, data-access, or ethics dependency.', 'Prefer a narrower defensible project if the dependency cannot be verified.'], true)
  if (/format|word|page|margin|font|spacing|filename/.test(lower)) add('formatting_change', body, 'major', ['Apply the exact programme formatting or length correction.', 'Run deterministic page, word, filename, and file-type checks again.'], false)
  if (/programme fit|department fit|group fit|lab fit|not a fit|does not fit/.test(lower)) add('programme_fit_issue', body, 'major', ['Update the proposal to fit the verified programme or lab priorities.', 'Remove unsupported claims about facilities, projects, or methods.'], true)
  if (/supervisor fit|my work|our group|not aligned|alignment/.test(lower)) add('supervisor_fit_issue', body, 'major', ['Update the supervisor-fit rationale using the supervisor dossier evidence.', 'Do not claim collaboration or support that the message does not establish.'], true)
  if (/reject|do not pursue|wrong direction|not the direction|start again/.test(lower)) add('rejection_of_direction', body, 'critical', ['Pause the current direction and present grounded alternatives or ask one narrow research-preference question.', 'Do not silently convert the rejected direction into an applicant fact.'], true, true)
  if (/meet|meeting|call|discuss this/.test(lower)) add('meeting_requested', body, 'major', ['Prepare a concise meeting request through the existing Roon Calendar/Gmail handoff.', 'Keep the proposal workflow waiting on the meeting result; do not mark the proposal approved.'], false)
  if (!items.length) add('other', body || 'Supervisor feedback was received but could not be classified.', 'minor', ['Review the message and create a specific revision requirement before redrafting.'], false, true)
  return items.sort((left, right) => left.revisionPriority - right.revisionPriority || left.id.localeCompare(right.id))
}

export function buildProposalRevisionPlan(input: { strategy: ResearchProposalStrategy; feedback: ProposalFeedbackInterpretation[]; revisionNumber: number }): ProposalRevisionPlan {
  const explicitDefects = unique(input.feedback.filter(item => item.category !== 'approval').map(item => item.requestedChange))
  const instructions = unique(input.feedback.flatMap(item => item.revisionRequirements))
  const highest = input.feedback.some(item => item.severity === 'critical') ? 1 : input.feedback.some(item => item.severity === 'major') ? 2 : 3
  const requiresDirectionDecision = input.feedback.some(item => item.category === 'rejection_of_direction' || item.clarificationRequired)
  const scopeFeedback = input.feedback.find(item => item.category === 'scope_change')
  const strategyPatch: Partial<ResearchProposalStrategy> = {
    revisionNotes: [...input.strategy.revisionNotes, ...instructions],
    version: input.strategy.version + 1,
    ...(scopeFeedback ? { risks: unique([...input.strategy.risks, 'Supervisor requested a narrower scope; verify the revised boundary.']) } : {}),
  }
  return { revisionNumber: input.revisionNumber, explicitDefects, instructions, priority: highest, clarificationRequired: input.feedback.some(item => item.clarificationRequired), requiresDirectionDecision, strategyPatch }
}

export function applyProposalRevisionPlan(strategy: ResearchProposalStrategy, plan: ProposalRevisionPlan) {
  return { ...strategy, ...plan.strategyPatch, revisionNotes: unique([...(strategy.revisionNotes ?? []), ...plan.instructions]), version: Math.max(strategy.version + 1, plan.strategyPatch.version ?? 0) }
}

function interactionId(applicationCaseId: string, purpose: string) {
  return `proposal-interaction:${applicationCaseId}:${purpose}`
}

/** Structured Progress Detail card for the one research choice David could not resolve. */
export function createResearchDirectionInteraction(input: { applicationCaseId: string; candidates: ProposalResearchDirection[]; recommendedId?: string | null }): ProposalProgressDetail {
  const candidates = input.candidates.slice(0, 3)
  const recommended = candidates.find(candidate => candidate.id === (input.recommendedId ?? candidates.find(candidate => candidate.recommended)?.id)) ?? candidates[0]
  return {
    id: interactionId(input.applicationCaseId, 'research-direction'),
    kind: 'progress_detail',
    applicationCaseId: input.applicationCaseId,
    workflowState: 'awaiting_applicant_decision',
    title: recommended ? `I recommend ${recommended.workingTitle}.` : 'Choose a research direction',
    message: recommended
      ? `It best connects the verified applicant context with the target programme and supervisor. I have prepared alternatives so you can approve a genuine research choice without having to generate the idea from scratch.`
      : 'I found several possible directions, but none is sufficiently stronger to recommend without your choice.',
    inputMode: 'choose',
    options: candidates.map((candidate, index) => ({ id: candidate.id, label: `Use ${index + 1}: ${candidate.workingTitle}`, value: candidate.id, description: `${candidate.whyApplicantFit} ${candidate.whyProgrammeFit} Feasibility: ${candidate.feasibility}` })),
    allowFreeText: false,
    attachmentKinds: [],
    requiredDecision: 'research_direction_approval',
  }
}

export function createProposalMissingContextInteraction(input: { applicationCaseId: string; missingKind: 'thesis' | 'research_preference' | 'programme_requirement' | 'supervisor_feedback'; options?: ProposalInteractionOption[] }): ProposalProgressDetail {
  const attachment = input.missingKind === 'thesis'
  return {
    id: interactionId(input.applicationCaseId, `missing-${input.missingKind}`),
    kind: 'progress_detail',
    applicationCaseId: input.applicationCaseId,
    workflowState: 'context_collection',
    title: attachment ? 'Your thesis could improve the methodology section.' : 'One focused research decision remains.',
    message: attachment ? 'I have already read the available profile, CV, research history, and application materials. Attach the thesis if you want it used; otherwise I can continue with the verified context.' : 'I exhausted the available verified context. Choose the closest direction or give one short answer; I will resume the same proposal workflow automatically.',
    inputMode: attachment ? 'attachment' : input.options?.length ? 'structured' : 'free_text',
    options: input.options ?? (attachment ? [{ id: 'continue', label: 'Continue without thesis', value: 'continue_without_thesis', description: 'Use the context already verified.' }] : [{ id: 'recommend', label: 'Choose for me', value: 'recommend', description: 'Use the strongest evidence-backed direction.' }]),
    allowFreeText: !attachment && !(input.options?.length),
    attachmentKinds: attachment ? ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] : [],
    requiredDecision: attachment ? 'thesis_source' : 'research_preference',
  }
}

export function createProposalDraftApprovalInteraction(input: { applicationCaseId: string; programme: string; supervisor?: string | null; wordCount: number; quality: ProposalQualityReview }): ProposalProgressDetail {
  return {
    id: interactionId(input.applicationCaseId, `draft-${input.wordCount}`),
    kind: 'progress_detail',
    applicationCaseId: input.applicationCaseId,
    workflowState: 'awaiting_applicant_decision',
    title: 'Research proposal draft ready',
    message: `${input.programme}${input.supervisor ? ` · Supervisor: ${input.supervisor}` : ''}\n${input.wordCount.toLocaleString()} words\n${input.quality.passed ? 'All research and programme requirement checks passed.' : `Review required: ${input.quality.blockingDimensions.join(', ') || 'deterministic defects remain.'}`}`,
    inputMode: 'approve',
    options: [
      { id: 'review', label: 'Review proposal', value: 'review', description: 'Open the readable proposal preview and evidence summary.' },
      { id: 'approve', label: 'Approve', value: 'approve', description: 'Approve this exact version for supervisor review or delivery.' },
      ...(input.quality.passed ? [] : [{ id: 'request_changes', label: 'Request changes', value: 'request_changes', description: 'Send the explicit review defects back to the writer.' }]),
    ],
    allowFreeText: false,
    attachmentKinds: [],
    requiredDecision: 'draft_approval',
  }
}

export function createProposalFinalApprovalInteraction(input: { applicationCaseId: string; programme: string; supervisor?: string | null; wordCount: number; artifact: ProposalArtifactIdentity; quality: ProposalQualityReview }): ProposalProgressDetail {
  return {
    id: interactionId(input.applicationCaseId, `final-${input.artifact.proposalVersion}`),
    kind: 'progress_detail',
    applicationCaseId: input.applicationCaseId,
    workflowState: 'artifact_ready',
    title: 'Research proposal ready',
    message: `${input.programme}${input.supervisor ? `\nSupervisor: ${input.supervisor}` : ''}\n${input.wordCount.toLocaleString()} words\nAll requirements passed\nExact artifact checksum: ${input.artifact.checksum}`,
    inputMode: 'approve',
    options: [
      { id: 'review-proposal', label: 'Review proposal', value: 'review', description: 'Open the final readable proposal and provenance.' },
      { id: 'approve-proposal', label: 'Approve', value: 'approve', description: 'Approve this exact artifact for upload or supervisor attachment.' },
    ],
    allowFreeText: false,
    attachmentKinds: [],
    requiredDecision: 'final_artifact_approval',
  }
}

function validChecksum(value: string) {
  return /^[a-f0-9]{64}$/i.test(value)
}

export function buildProposalArtifactIdentity(input: Omit<ProposalArtifactIdentity, 'approvalState' | 'uploadState'> & { approvalState?: ProposalArtifactIdentity['approvalState']; uploadState?: ProposalArtifactIdentity['uploadState'] }): ProposalArtifactIdentity {
  return {
    ...input,
    applicationCaseId: text(input.applicationCaseId, 160),
    institution: text(input.institution, 300),
    programme: text(input.programme, 500),
    supervisor: text(input.supervisor, 300) || null,
    proposalVersion: positiveInteger(input.proposalVersion) ?? 1,
    sourceArtifactId: text(input.sourceArtifactId, 160) || null,
    renderedArtifactId: text(input.renderedArtifactId, 160),
    sourceFilename: text(input.sourceFilename, 300) || null,
    renderedFilename: text(input.renderedFilename, 300),
    checksum: text(input.checksum, 128).toLocaleLowerCase(),
    provenanceSourceIds: unique(input.provenanceSourceIds),
    approvalState: input.approvalState ?? 'pending',
    uploadState: input.uploadState ?? 'not_uploaded',
  }
}

export function verifyApprovedProposalArtifact(input: { artifact: ProposalArtifactIdentity; expected: { applicationCaseId: string; institution: string; programme: string; supervisor?: string | null; proposalVersion: number; checksum: string } }): { valid: boolean; issues: ProposalValidationIssue[] } {
  const issues: ProposalValidationIssue[] = []
  const { artifact, expected } = input
  if (artifact.applicationCaseId !== expected.applicationCaseId) issues.push({ code: 'wrong_application_case', message: 'The artifact belongs to a different ApplicationCase.', severity: 'error' })
  if (normalized(artifact.institution) !== normalized(expected.institution)) issues.push({ code: 'wrong_institution', message: 'The artifact institution does not match the current case.', severity: 'error' })
  if (normalized(artifact.programme) !== normalized(expected.programme)) issues.push({ code: 'wrong_programme', message: 'The artifact programme does not match the current case.', severity: 'error' })
  if (expected.supervisor && normalized(artifact.supervisor ?? '') !== normalized(expected.supervisor)) issues.push({ code: 'wrong_supervisor', message: 'The artifact supervisor does not match the current case.', severity: 'error' })
  if (artifact.proposalVersion !== expected.proposalVersion) issues.push({ code: 'stale_artifact', message: 'The artifact version is not the approved proposal version.', severity: 'error' })
  if (!validChecksum(artifact.checksum) || artifact.checksum !== expected.checksum.toLocaleLowerCase()) issues.push({ code: 'checksum_mismatch', message: 'The artifact checksum does not match the approved proposal.', severity: 'error' })
  if (artifact.approvalState !== 'approved') issues.push({ code: 'artifact_not_approved', message: 'The exact proposal artifact has not been approved.', severity: 'error' })
  return { valid: issues.length === 0, issues }
}

/** Result-state verification for portal upload or an email attachment handoff. */
export function verifyProposalDelivery(input: { artifact: ProposalArtifactIdentity; destination: string; uploadedFilename: string; uploadedChecksum: string; readBackVerified: boolean; evidenceIds: string[] }): ProposalDeliveryVerification {
  const issues: ProposalValidationIssue[] = []
  if (input.artifact.uploadState === 'not_uploaded') issues.push({ code: 'upload_not_recorded', message: 'The provider has not recorded an upload or attachment result.', severity: 'error' })
  if (input.uploadedFilename !== input.artifact.renderedFilename) issues.push({ code: 'wrong_artifact_uploaded', message: 'The resulting provider state names a different filename.', severity: 'error' })
  if (input.uploadedChecksum.toLocaleLowerCase() !== input.artifact.checksum.toLocaleLowerCase()) issues.push({ code: 'uploaded_checksum_mismatch', message: 'The resulting provider state does not match the approved artifact checksum.', severity: 'error' })
  if (!input.readBackVerified) issues.push({ code: 'resulting_state_unverified', message: 'The resulting portal or provider state was not independently read back.', severity: 'error' })
  if (!input.evidenceIds.length) issues.push({ code: 'delivery_evidence_missing', message: 'Delivery requires provider or portal evidence.', severity: 'error' })
  return { valid: issues.length === 0, applicationCaseId: input.artifact.applicationCaseId, artifactId: input.artifact.renderedArtifactId, checksum: input.artifact.checksum, destination: text(input.destination, 500), uploadedFilename: text(input.uploadedFilename, 300), uploadedChecksum: text(input.uploadedChecksum, 128), readBackVerified: input.readBackVerified, evidenceIds: unique(input.evidenceIds), issues }
}

const allowedProposalTransitions: Record<ProposalWorkflowState, ProposalWorkflowState[]> = {
  requirement_research: ['context_collection', 'blocked'],
  context_collection: ['direction_resolution', 'programme_research', 'awaiting_applicant_decision', 'blocked'],
  direction_resolution: ['programme_research', 'strategy_building', 'awaiting_applicant_decision', 'blocked'],
  programme_research: ['strategy_building', 'blocked'],
  strategy_building: ['brief_ready', 'blocked'],
  brief_ready: ['writer_assignment_pending', 'assigned', 'blocked'],
  writer_assignment_pending: ['assigned', 'blocked'],
  assigned: ['drafting', 'draft_received', 'quality_review', 'blocked'],
  drafting: ['draft_received', 'quality_review', 'blocked'],
  draft_received: ['quality_review', 'awaiting_applicant_decision', 'revision_required', 'blocked'],
  quality_review: ['awaiting_applicant_decision', 'revision_required', 'supervisor_review', 'final_quality_review', 'blocked'],
  revision_required: ['final_revision', 'drafting', 'blocked'],
  awaiting_applicant_decision: ['supervisor_review', 'final_quality_review', 'programme_research', 'revision_required', 'blocked'],
  supervisor_review: ['supervisor_feedback_received', 'final_quality_review', 'blocked'],
  supervisor_feedback_received: ['final_revision', 'awaiting_applicant_decision', 'blocked'],
  final_revision: ['drafting', 'draft_received', 'final_quality_review', 'approved', 'blocked'],
  final_quality_review: ['approved', 'revision_required', 'blocked'],
  approved: ['artifact_ready', 'supervisor_review', 'blocked'],
  artifact_ready: ['uploaded', 'complete', 'blocked'],
  uploaded: ['complete', 'blocked'],
  complete: [],
  blocked: ['requirement_research', 'context_collection', 'direction_resolution', 'programme_research', 'strategy_building', 'brief_ready', 'writer_assignment_pending', 'assigned', 'drafting', 'draft_received', 'quality_review', 'revision_required', 'awaiting_applicant_decision', 'supervisor_review', 'supervisor_feedback_received', 'final_revision', 'final_quality_review', 'approved', 'artifact_ready', 'uploaded'],
}

export function canTransitionResearchProposalState(from: ProposalWorkflowState, to: ProposalWorkflowState) {
  return from === to || allowedProposalTransitions[from].includes(to)
}

export type ProposalWorkflowEvent =
  | { type: 'requirement_verified'; requirement: ResearchProposalRequirement; at?: string }
  | { type: 'context_collected'; context: ProposalContextSnapshot; at?: string }
  | { type: 'directions_proposed'; candidates: ProposalResearchDirection[]; at?: string }
  | { type: 'direction_approved'; directionId: string; at?: string }
  | { type: 'dossier_ready'; dossier: ProposalResearchDossier; at?: string }
  | { type: 'strategy_ready'; strategy: ResearchProposalStrategy; at?: string }
  | { type: 'brief_ready'; brief: ResearchProposalBrief; at?: string }
  | { type: 'writer_assigned'; assignment: ProposalWriterAssignment; at?: string }
  | { type: 'draft_received'; draft: ProposalDraft; at?: string }
  | { type: 'quality_reviewed'; review: ProposalQualityReview; at?: string }
  | { type: 'applicant_approved'; at?: string }
  | { type: 'supervisor_review_requested'; at?: string }
  | { type: 'supervisor_feedback_received'; feedback: ProposalFeedbackInterpretation[]; at?: string }
  | { type: 'revision_planned'; plan: ProposalRevisionPlan; at?: string }
  | { type: 'final_quality_reviewed'; review: ProposalQualityReview; at?: string }
  | { type: 'artifact_ready'; artifact: ProposalArtifactIdentity; at?: string }
  | { type: 'delivery_verified'; delivery: ProposalDeliveryVerification; at?: string }
  | { type: 'blocked'; reason: string; at?: string }

function eventState(event: ProposalWorkflowEvent): ProposalWorkflowState {
  switch (event.type) {
    case 'requirement_verified': return 'context_collection'
    case 'context_collected': return 'direction_resolution'
    case 'directions_proposed': return 'awaiting_applicant_decision'
    case 'direction_approved': return 'programme_research'
    case 'dossier_ready': return 'strategy_building'
    case 'strategy_ready': return 'brief_ready'
    case 'brief_ready': return 'writer_assignment_pending'
    case 'writer_assigned': return 'assigned'
    case 'draft_received': return 'draft_received'
    case 'quality_reviewed': return event.review.passed ? 'awaiting_applicant_decision' : 'revision_required'
    case 'applicant_approved': return 'supervisor_review'
    case 'supervisor_review_requested': return 'supervisor_review'
    case 'supervisor_feedback_received': return event.feedback.some(item => item.category !== 'approval') ? 'supervisor_feedback_received' : 'final_quality_review'
    case 'revision_planned': return 'final_revision'
    case 'final_quality_reviewed': return event.review.passed ? 'approved' : 'revision_required'
    case 'artifact_ready': return 'artifact_ready'
    case 'delivery_verified': return event.delivery.valid ? 'complete' : 'blocked'
    case 'blocked': return 'blocked'
  }
}

export function createResearchProposalWorkflow(input: { applicationCaseId: string; requirement: ResearchProposalRequirement; context?: ProposalContextSnapshot; now?: string }): ResearchProposalWorkflow {
  const context = input.context ?? collectProposalContext({ sources: [] })
  const currentState: ProposalWorkflowState = input.requirement.requirementState === 'unresolved' ? 'requirement_research' : 'context_collection'
  return {
    version: RESEARCH_PROPOSAL_WORKFLOW_VERSION,
    applicationCaseId: input.applicationCaseId,
    currentState,
    requirement: input.requirement,
    context,
    directionCandidates: [],
    selectedDirectionId: null,
    dossier: null,
    strategy: null,
    brief: null,
    writerAssignment: null,
    drafts: [],
    qualityReviews: [],
    supervisorFeedback: [],
    revisionPlans: [],
    finalArtifact: null,
    delivery: null,
    interactions: [],
    userInterventions: 0,
    contextFactsResolvedAutomatically: context.resolvedFactCount,
    contextFactsConsidered: context.factCount,
    revisionCount: 0,
    transitionHistory: [],
    blockers: [],
  }
}

/** One deterministic transition point for the entire proposal lifecycle. */
export function transitionResearchProposalWorkflow(workflow: ResearchProposalWorkflow, event: ProposalWorkflowEvent): ResearchProposalWorkflow {
  const nextState = eventState(event)
  if (!canTransitionResearchProposalState(workflow.currentState, nextState)) throw new Error(`Invalid research-proposal transition ${workflow.currentState} -> ${nextState} for ${event.type}.`)
  const at = text(event.at, 100) || new Date().toISOString()
  let next: ResearchProposalWorkflow = { ...workflow, currentState: nextState, transitionHistory: [...workflow.transitionHistory, { from: workflow.currentState, to: nextState, event: event.type, at }] }
  switch (event.type) {
    case 'requirement_verified': next = { ...next, requirement: event.requirement, blockers: [] }; break
    case 'context_collected': next = { ...next, context: event.context, contextFactsResolvedAutomatically: event.context.resolvedFactCount, contextFactsConsidered: event.context.factCount }; break
    case 'directions_proposed': next = { ...next, directionCandidates: event.candidates }; break
    case 'direction_approved':
      if (!workflow.directionCandidates.some(candidate => candidate.id === event.directionId)) throw new Error('The selected research direction is not one of the grounded candidates.')
      next = { ...next, selectedDirectionId: event.directionId, userInterventions: workflow.userInterventions + 1 }; break
    case 'dossier_ready': next = { ...next, dossier: event.dossier, blockers: event.dossier.invalidClaims.length ? event.dossier.invalidClaims : [] }; break
    case 'strategy_ready': next = { ...next, strategy: event.strategy }; break
    case 'brief_ready': next = { ...next, brief: event.brief }; break
    case 'writer_assigned': next = { ...next, writerAssignment: event.assignment }; break
    case 'draft_received': next = { ...next, drafts: [...workflow.drafts, event.draft] }; break
    case 'quality_reviewed': next = { ...next, qualityReviews: [...workflow.qualityReviews, event.review] }; break
    case 'applicant_approved': next = { ...next, userInterventions: workflow.userInterventions + 1 }; break
    case 'supervisor_feedback_received': next = { ...next, supervisorFeedback: [...workflow.supervisorFeedback, ...event.feedback] }; break
    case 'revision_planned': next = { ...next, revisionPlans: [...workflow.revisionPlans, event.plan], revisionCount: Math.max(workflow.revisionCount, event.plan.revisionNumber), strategy: workflow.strategy ? applyProposalRevisionPlan(workflow.strategy, event.plan) : workflow.strategy }; break
    case 'final_quality_reviewed': next = { ...next, qualityReviews: [...workflow.qualityReviews, event.review] }; break
    case 'artifact_ready': next = { ...next, finalArtifact: event.artifact }; break
    case 'delivery_verified': next = { ...next, delivery: event.delivery }; break
    case 'blocked': next = { ...next, blockers: unique([...workflow.blockers, event.reason]) }; break
  }
  return next
}
