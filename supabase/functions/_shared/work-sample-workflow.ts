/**
 * Canonical work-sample and portfolio execution for David applications.
 *
 * This module is deliberately provider-neutral. It owns the deterministic
 * decisions around requirements, candidate discovery, authorship, ranking,
 * preparation, quality gates, and resulting-state evidence. The application
 * controller, private file-assets, application-artifacts, browser harness,
 * and evidence tables remain the persistence and provider boundaries.
 */

export const WORK_SAMPLE_WORKFLOW_VERSION = 'work-sample-execution@1.0.0' as const

export const workSampleArtifactTypes = [
  'ACADEMIC_WRITING',
  'RESEARCH_PAPER',
  'THESIS_EXCERPT',
  'PUBLICATION',
  'PREPRINT',
  'TECHNICAL_REPORT',
  'POLICY_WRITING',
  'CODE_SAMPLE',
  'SOFTWARE_PROJECT',
  'DATA_NOTEBOOK',
  'DESIGN_PORTFOLIO',
  'VISUAL_PORTFOLIO',
  'PROJECT_PORTFOLIO',
  'PUBLICATION_LIST',
  'WEBSITE',
  'OTHER',
] as const
export type WorkSampleArtifactType = typeof workSampleArtifactTypes[number]

export const workSampleRequirementModes = ['required', 'recommended', 'optional', 'prohibited', 'not_applicable'] as const
export type WorkSampleRequirementMode = typeof workSampleRequirementModes[number]

export const workSampleEligibilityStates = ['eligible', 'ineligible', 'unknown'] as const
export type WorkSampleEligibilityState = typeof workSampleEligibilityStates[number]

export const workSampleApprovalStates = ['not_required', 'pending', 'approved', 'rejected'] as const
export type WorkSampleApprovalState = typeof workSampleApprovalStates[number]

export const workSampleUploadStates = ['not_started', 'ready', 'uploaded', 'verified', 'blocked'] as const
export type WorkSampleUploadState = typeof workSampleUploadStates[number]

export const workSampleSubmissionMethods = ['file_upload', 'url', 'portal_entry'] as const
export type WorkSampleSubmissionMethod = typeof workSampleSubmissionMethods[number]

export type WorkSampleSourceEvidence = {
  id: string
  url: string | null
  title: string
  excerpt: string
  authority: 'official' | 'government' | 'provider' | 'applicant' | 'uploaded_document' | 'generated'
  sourceKind: 'official_programme' | 'department' | 'application_guide' | 'portal' | 'portfolio_guidance' | 'faq' | 'download' | 'other'
  retrievedAt: string | null
}

export type WorkSampleRequirement = {
  id: string
  applicationCaseId: string
  requirementKey: string
  requirementType: WorkSampleArtifactType
  mode: WorkSampleRequirementMode
  required: boolean
  recommended: boolean
  optional: boolean
  prohibited: boolean
  numberAllowed: number | null
  numberRequired: number | null
  acceptedArtifactTypes: WorkSampleArtifactType[]
  requiredContentType: string | null
  expectedSubjectArea: string | null
  authorshipRequirements: string[]
  soloAuthorRequired: boolean | null
  coAuthoredAllowed: boolean | null
  publicationRequirement: 'published' | 'accepted' | 'preprint' | 'submitted' | 'unpublished' | 'any' | null
  pageLimit: number | null
  wordLimit: number | null
  fileSizeLimitBytes: number | null
  fileFormats: string[]
  linkPermitted: boolean
  githubPermitted: boolean
  websitePermitted: boolean
  excerptPermitted: boolean
  anonymizationRequired: boolean
  applicantNameRequired: boolean
  coverSheetRequired: boolean
  citationRequirements: string[]
  language: string | null
  translationRequired: boolean
  explanatoryNoteAllowed: boolean
  deadline: { dateTime: string; timezone: string } | null
  portalDestination: string | null
  evaluationCriteria: string[]
  exactInstructions: string
  sources: WorkSampleSourceEvidence[]
  sourceEvidenceIds: string[]
  confidence: number
  status: 'detected' | 'verified' | 'needs_context' | 'ready' | 'blocked' | 'submitted' | 'not_required'
}

export type WorkSampleCandidateSection = {
  title: string
  startPage: number
  endPage: number
  purpose: 'problem' | 'method' | 'analysis' | 'results' | 'contribution' | 'context' | 'other'
}

export type WorkSampleInspection = {
  inspected: boolean
  inspectionSource: string | null
  topic: string | null
  structure: string[]
  methods: string[]
  results: string[]
  argumentQuality: number
  evidenceQuality: number
  writingClarity: number
  completeness: number
  contributionEvidence: number
  securityFindings: string[]
  warnings: string[]
}

export type WorkSampleCandidate = {
  id: string
  title: string
  artifactType: WorkSampleArtifactType
  source: { kind: string; id: string; url: string | null }
  sourceAssetIds: string[]
  assetAvailable: boolean
  authors: string[]
  applicantAuthorshipRole: 'sole_author' | 'first_author' | 'co_author' | 'contributor' | 'designer' | 'developer' | 'unknown'
  authorshipEvidence: string[]
  publicationStatus: 'published' | 'accepted' | 'in_press' | 'preprint' | 'submitted' | 'unpublished' | 'unknown'
  date: string | null
  institutionOrProject: string | null
  subjectArea: string | null
  description: string
  applicantContribution: string | null
  pageCount: number | null
  wordCount: number | null
  fileFormat: string | null
  fileSizeBytes: number | null
  language: string | null
  publicationVenue: string | null
  doiOrIdentifier: string | null
  url: string | null
  repositoryUrl: string | null
  liveSiteUrl: string | null
  technologies: string[]
  visualMetadata: Record<string, unknown>
  sections: WorkSampleCandidateSection[]
  programmeRelevance: number
  evidentiaryStrength: number
  qualityScore: number
  eligibility: WorkSampleEligibilityState
  eligibilityReasons: string[]
  provenance: {
    sourceIds: string[]
    sourceAssetIds: string[]
    checksum: string | null
    createdAt: string | null
    updatedAt: string | null
    stale: boolean
  }
  content: string | null
  inspection: WorkSampleInspection
}

export type RankedWorkSampleCandidate = WorkSampleCandidate & {
  rank: number
  applicationFitScore: number
  rankingReasons: string[]
  scoreBreakdown: Record<string, number>
}

export type PortfolioStrategy = {
  id: string
  applicationCaseId: string
  requiredNumber: number
  maximumNumber: number | null
  selectedCandidateIds: string[]
  ordering: string[]
  purposeByCandidate: Record<string, string>
  redundancyCheck: { passed: boolean; warnings: string[] }
  applicantContributionByCandidate: Record<string, string>
  programmeRelevanceByCandidate: Record<string, number>
  narrative: string
  approvalRequired: boolean
}

export type WorkSampleTransformation = {
  type: 'filename_normalized' | 'page_extraction' | 'cover_sheet_added' | 'pdf_normalized' | 'metadata_normalized' | 'compression' | 'projects_ordered' | 'contribution_note_added' | 'anonymized'
  description: string
  substantiveContentChanged: boolean
}

export type WorkSampleQualityGate = {
  passed: boolean
  programmatic: { passed: boolean; issues: string[]; warnings: string[] }
  semantic: { passed: boolean; issues: string[]; rationale: string }
  security: { passed: boolean; findings: string[] }
}

export type WorkSampleSubmission = {
  id: string
  applicationCaseId: string
  requirementId: string
  candidateId: string
  originalArtifactId: string | null
  derivedArtifactId: string | null
  artifactType: WorkSampleArtifactType
  transformations: WorkSampleTransformation[]
  selectedPages: number[]
  selectedProjects: string[]
  submissionMethod: WorkSampleSubmissionMethod
  submissionUrl: string | null
  filename: string
  sizeBytes: number | null
  pageCount: number | null
  wordCount: number | null
  checksum: string
  originalChecksum: string | null
  approvalState: WorkSampleApprovalState
  uploadState: WorkSampleUploadState
  resultingStateEvidence: {
    portal: string | null
    section: string | null
    sessionId: string | null
    url: string | null
    filename: string | null
    checksum: string | null
    sizeBytes: number | null
    readBackValues: Record<string, unknown>
    confirmation: string | null
    evidenceIds: string[]
  }
  qualityGate: WorkSampleQualityGate
  provenance: {
    sourceArtifactId: string | null
    sourceChecksum: string | null
    preparationVersion: string
    transformationHistory: WorkSampleTransformation[]
    applicationCaseId: string
  }
}

export type WorkSampleInteractionOption = { value: string; label: string; description?: string; disabled?: boolean }

export type WorkSampleInteraction = {
  workflow: 'work_sample'
  id: string
  requirementId: string
  kind: 'approval' | 'single_choice' | 'multiple_choice' | 'attachment_request' | 'fact' | 'confirmation'
  question: string
  reason: string
  knownContext: string[]
  options: WorkSampleInteractionOption[]
  reusableContextKeys: string[]
  confirmLabel: string
  cancelLabel: string
  approvalScope?: 'work_sample_submission' | 'portfolio_strategy'
  mapsToRequirement?: string
  attachmentPrompt?: string
  acceptedMimeTypes?: string[]
  maximumFiles?: number
  minSelections?: number
}

export type WorkSampleInteractionMetric = {
  interactionId: string
  kind: WorkSampleInteraction['kind']
  resumedAutomatically: boolean
  reusableContextSaved: boolean
  freeText: boolean
}

export type WorkSampleContextResolution = {
  version: typeof WORK_SAMPLE_WORKFLOW_VERSION
  checkedSources: string[]
  autoResolvedFacts: string[]
  candidates: WorkSampleCandidate[]
  reusableContext: Record<string, unknown>
  unresolved: string[]
  nextInteraction: WorkSampleInteraction | null
  automaticContinuationRate: number
}

export type WorkSampleRequirementGraphNode = {
  id: string
  requirementId: string
  name: string
  status: 'verified' | 'unresolved' | 'ready' | 'awaiting_user' | 'blocked' | 'submitted'
  dependencyIds: string[]
  evidenceIds: string[]
  action: string
}

export type WorkSampleUploadVerificationInput = {
  applicationCaseId: string
  requirementId: string
  submissionId: string
  portal: string
  section: string
  sessionId: string
  submissionMethod?: WorkSampleSubmissionMethod
  submissionUrl?: string | null
  persistedValues: Record<string, unknown>
  readBackValues: Record<string, unknown>
  filename: string
  checksum: string
  sizeBytes: number | null
  accepted: boolean
  validationWarnings?: string[]
  confirmation: string | null
  existingSubmissionIds?: string[]
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown, maximum = 10_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function isHttpUrl(value: string | null | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function stringArray(value: unknown, maximum = 80) {
  return Array.isArray(value) ? value.map(item => text(item, 1_000)).filter(Boolean).slice(0, maximum) : []
}

function unique(values: string[]) {
  return [...new Set(values.map(item => item.trim()).filter(Boolean))]
}

function clamp(value: unknown, fallback = 0) {
  const parsed = numberValue(value)
  return parsed === null ? fallback : Math.max(0, Math.min(100, Math.round(parsed)))
}

function unwrap(value: unknown) {
  const item = record(value)
  return item.value !== undefined && Object.keys(item).length <= 4 ? item.value : value
}

function snakeOrCamel(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (input[key] !== undefined) return input[key]
  return undefined
}

function sourceAuthority(value: unknown): WorkSampleSourceEvidence['authority'] {
  const normalized = text(value, 80).toLocaleLowerCase()
  return ['official', 'government', 'provider', 'applicant', 'uploaded_document', 'generated'].includes(normalized)
    ? normalized as WorkSampleSourceEvidence['authority']
    : 'official'
}

function sourceKind(value: unknown): WorkSampleSourceEvidence['sourceKind'] {
  const normalized = text(value, 80).toLocaleLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (normalized.includes('department')) return 'department'
  if (normalized.includes('guide')) return 'application_guide'
  if (normalized.includes('portal')) return 'portal'
  if (normalized.includes('portfolio')) return 'portfolio_guidance'
  if (normalized.includes('faq')) return 'faq'
  if (normalized.includes('download') || normalized.includes('instruction')) return 'download'
  if (normalized.includes('programme') || normalized.includes('program')) return 'official_programme'
  return 'other'
}

function normalizeSource(value: unknown, index: number): WorkSampleSourceEvidence | null {
  const item = record(value)
  const excerpt = text(snakeOrCamel(item, 'excerpt', 'text', 'content', 'quote', 'instruction'), 5_000)
  const url = text(snakeOrCamel(item, 'url', 'sourceUrl', 'source_url', 'href'), 2_000) || null
  if (!excerpt && !url) return null
  return {
    id: text(snakeOrCamel(item, 'id', 'sourceId', 'source_id'), 160) || `work-sample-source:${index + 1}`,
    url,
    title: text(snakeOrCamel(item, 'title', 'name'), 500) || 'Programme work-sample guidance',
    excerpt,
    authority: sourceAuthority(snakeOrCamel(item, 'authority', 'sourceType', 'source_type')),
    sourceKind: sourceKind(snakeOrCamel(item, 'sourceKind', 'source_kind', 'kind', 'type')),
    retrievedAt: text(snakeOrCamel(item, 'retrievedAt', 'retrieved_at', 'capturedAt'), 80) || null,
  }
}

function normalizedSources(input: unknown[]): WorkSampleSourceEvidence[] {
  return input.map(normalizeSource).filter((value): value is WorkSampleSourceEvidence => Boolean(value))
}

function authoritativeSources(sources: WorkSampleSourceEvidence[]) {
  const official = sources.filter(source => source.authority === 'official' || source.authority === 'government')
  return official.length ? official : sources
}

function fullRequirementText(sources: WorkSampleSourceEvidence[], raw: Record<string, unknown>) {
  return [
    text(snakeOrCamel(raw, 'exactInstructions', 'exact_instructions', 'instructions', 'guidance', 'workSampleGuidance'), 10_000),
    ...sources.map(source => source.excerpt),
  ].filter(Boolean).join('\n')
}

function inferArtifactTypes(value: string): WorkSampleArtifactType[] {
  const textValue = value.toLocaleLowerCase()
  const types: WorkSampleArtifactType[] = []
  const add = (type: WorkSampleArtifactType) => { if (!types.includes(type)) types.push(type) }
  if (/design portfolio|ux portfolio|ui portfolio|product design/.test(textValue)) add('DESIGN_PORTFOLIO')
  if (/architecture portfolio/.test(textValue)) add('VISUAL_PORTFOLIO')
  if (/visual portfolio|creative portfolio|art portfolio|image portfolio/.test(textValue)) add('VISUAL_PORTFOLIO')
  if (/project portfolio|portfolio of projects|selected projects/.test(textValue)) add('PROJECT_PORTFOLIO')
  if (/publication list|list of publications|bibliography/.test(textValue)) add('PUBLICATION_LIST')
  if (/github|\brepositories?\b|\brepo\b|code sample|source code|software portfolio|programming sample/.test(textValue)) add('CODE_SAMPLE')
  if (/notebook|jupyter|data science|data-science/.test(textValue)) add('DATA_NOTEBOOK')
  if (/website portfolio|personal website|project website|website url|portfolio url|portfolio link/.test(textValue)) add('WEBSITE')
  if (/thesis excerpt|dissertation excerpt|thesis chapter/.test(textValue)) add('THESIS_EXCERPT')
  if (/publication|journal article|conference paper/.test(textValue)) add('PUBLICATION')
  if (/preprint|arxiv/.test(textValue)) add('PREPRINT')
  if (/technical report|engineering report|research report/.test(textValue)) add('TECHNICAL_REPORT')
  if (/policy paper|policy writing|briefing paper/.test(textValue)) add('POLICY_WRITING')
  if (/academic paper|academic writing|writing sample|research paper|essay sample|sample of written work/.test(textValue)) add('ACADEMIC_WRITING')
  return types.length ? types : ['OTHER']
}

function requirementMode(textValue: string, raw: Record<string, unknown>): WorkSampleRequirementMode {
  const normalizedText = textValue.toLocaleLowerCase()
  const explicit = text(snakeOrCamel(raw, 'mode', 'requirementMode', 'requirement_mode', 'status'), 40).toLocaleLowerCase()
  if (workSampleRequirementModes.includes(explicit as WorkSampleRequirementMode)) return explicit as WorkSampleRequirementMode
  if (raw.prohibited === true || /(?:do not|does not|will not|cannot|not) accept|\bno\s+(?:writing sample|paper|publication|portfolio|code sample|previous work)\b|prohibited|not permitted/.test(normalizedText)) return 'prohibited'
  if (raw.required === true || /\b(?:required|must submit|mandatory|are required|is required)\b|\bsubmit\s+(?:one|two|three|four|five|a|an|the|\d+)\s+(?:academic\s+)?(?:writing sample|code sample|paper|publication|portfolio|project|repository|notebook|website|work)|\b(?:writing sample|code sample|paper|publication|portfolio|project artifact|previous work|repository|notebook|website|publication list)\s+(?:must|is required|are required)\b/.test(normalizedText)) return 'required'
  if (raw.recommended === true || /\b(?:recommended|strongly encouraged|encouraged|helpful)\b/.test(normalizedText)) return 'recommended'
  if (raw.optional === true || /\b(?:optional|may submit|if available|where applicable)\b/.test(normalizedText)) return 'optional'
  return 'not_applicable'
}

function parseFirst(textValue: string, expression: RegExp) {
  const match = textValue.match(expression)
  return match ? Number(match[1]) : null
}

function parseSizeBytes(textValue: string) {
  const match = textValue.match(/(?:maximum|max|limit|under|less than)\s*(\d+(?:\.\d+)?)\s*(mb|mib|kb|kib|bytes?)/i)
  if (!match) return null
  const amount = Number(match[1])
  const unit = match[2].toLocaleLowerCase()
  const multiplier = unit.startsWith('m') ? 1024 * 1024 : unit.startsWith('k') ? 1024 : 1
  return Number.isFinite(amount) ? Math.round(amount * multiplier) : null
}

function parseFormats(textValue: string, raw: Record<string, unknown>) {
  const explicit = stringArray(snakeOrCamel(raw, 'fileFormats', 'file_formats', 'formats', 'acceptedFormats', 'accepted_formats'), 20)
  const fromText = [...textValue.matchAll(/\.(pdf|docx?|txt|zip|ipynb|png|jpe?g|svg|html?)\b/gi)].map(match => `.${match[1]!.toLowerCase()}`)
  return unique([...explicit, ...fromText])
}

function publicationRequirement(textValue: string, raw: Record<string, unknown>): WorkSampleRequirement['publicationRequirement'] {
  const explicit = text(snakeOrCamel(raw, 'publicationRequirement', 'publication_requirement', 'publicationStatus', 'publication_status'), 40).toLocaleLowerCase()
  const values = ['published', 'accepted', 'preprint', 'submitted', 'unpublished', 'any']
  if (values.includes(explicit)) return explicit as WorkSampleRequirement['publicationRequirement']
  if (/published (?:paper|article|publication)|publication rather than manuscript|published work/.test(textValue)) return 'published'
  if (/accepted paper|accepted publication|in press/.test(textValue)) return 'accepted'
  if (/preprint/.test(textValue)) return 'preprint'
  if (/submitted manuscript|submitted paper/.test(textValue)) return 'submitted'
  return null
}

function parseNumberAllowed(textValue: string, raw: Record<string, unknown>) {
  const explicit = numberValue(snakeOrCamel(raw, 'numberAllowed', 'number_allowed', 'maximumProjects', 'maximum_projects', 'maxItems', 'max_items'))
  if (explicit !== null) return Math.max(1, Math.round(explicit))
  const numeric = parseFirst(textValue, /(?:up to|maximum of|max(?:imum)?\s*(?:of)?|no more than)\s*(\d+)\s*(?:samples?|pieces?|projects?|items?|works?)/i)
  if (numeric !== null) return numeric
  const word = textValue.match(/(?:up to|maximum of|max(?:imum)?\s*(?:of)?|no more than)\s*(one|two|three|four|five)\s*(?:samples?|pieces?|projects?|items?|works?)/i)?.[1]?.toLocaleLowerCase()
  return word ? ({ one: 1, two: 2, three: 3, four: 4, five: 5 }[word] ?? null) : null
}

function parseNumberRequired(textValue: string, raw: Record<string, unknown>) {
  const explicit = numberValue(snakeOrCamel(raw, 'numberRequired', 'number_required', 'requiredNumber', 'required_number'))
  if (explicit !== null) return Math.max(1, Math.round(explicit))
  const numeric = parseFirst(textValue, /(?:submit|provide|include|upload)\s*(\d+)\s*(?:samples?|pieces?|projects?|items?|works?)/i)
  if (numeric !== null) return numeric
  const word = textValue.match(/(?:submit|provide|include|upload)\s*(one|two|three|four|five)\s*(?:samples?|pieces?|projects?|items?|works?)/i)?.[1]?.toLocaleLowerCase()
  return word ? ({ one: 1, two: 2, three: 3, four: 4, five: 5 }[word] ?? null) : null
}

function acceptedTypesFromText(type: WorkSampleArtifactType, textValue: string) {
  const types = [type]
  const add = (candidate: WorkSampleArtifactType) => { if (!types.includes(candidate)) types.push(candidate) }
  if (type === 'ACADEMIC_WRITING' || /writing sample|academic writing|written work/i.test(textValue)) {
    if (/paper|article|manuscript|research writing/i.test(textValue)) add('RESEARCH_PAPER')
    if (/thesis|dissertation|chapter|excerpt|extract/i.test(textValue)) add('THESIS_EXCERPT')
    if (/technical report|research report/i.test(textValue)) add('TECHNICAL_REPORT')
    if (/policy paper|policy writing/i.test(textValue)) add('POLICY_WRITING')
    // A generic academic writing-sample rule normally accepts a legitimate
    // published paper unless the official source explicitly narrows it.
    if (/paper|publication|journal|conference/i.test(textValue)) add('PUBLICATION')
  }
  if (/publication|journal article|conference paper/i.test(textValue)) add('PUBLICATION')
  if (/preprint|arxiv/i.test(textValue)) add('PREPRINT')
  if (/code sample|repository|github|source code/i.test(textValue)) add('CODE_SAMPLE')
  if (/notebook|jupyter/i.test(textValue)) add('DATA_NOTEBOOK')
  if (/portfolio|selected projects?/i.test(textValue)) add('PROJECT_PORTFOLIO')
  return types
}

function makeRequirement(input: {
  applicationCaseId: string
  requirementKey: string
  type: WorkSampleArtifactType
  mode: WorkSampleRequirementMode
  raw: Record<string, unknown>
  sources: WorkSampleSourceEvidence[]
  programme?: string
}): WorkSampleRequirement {
  const textValue = fullRequirementText(input.sources, input.raw)
  const authoritative = authoritativeSources(input.sources)
  const explicitTypes = stringArray(snakeOrCamel(input.raw, 'acceptedArtifactTypes', 'accepted_artifact_types', 'acceptedTypes', 'accepted_types'), 20)
    .filter(type => workSampleArtifactTypes.includes(type as WorkSampleArtifactType)) as WorkSampleArtifactType[]
  const acceptedArtifactTypes = explicitTypes.length ? explicitTypes : acceptedTypesFromText(input.type, textValue)
  const pageLimit = numberValue(snakeOrCamel(input.raw, 'pageLimit', 'page_limit', 'maximumPages', 'maximum_pages')) ?? parseFirst(textValue, /(?:maximum|max|limit|no more than|up to)\s*(\d+)\s*pages?/i)
  const wordLimit = numberValue(snakeOrCamel(input.raw, 'wordLimit', 'word_limit', 'maximumWords', 'maximum_words')) ?? parseFirst(textValue, /(?:maximum|max|limit|no more than|up to)\s*([\d,]+)\s*words?/i)
  const explicitDeadline = record(snakeOrCamel(input.raw, 'deadline', 'deadline_at'))
  const deadlineDate = text(explicitDeadline.dateTime ?? explicitDeadline.date_time ?? snakeOrCamel(input.raw, 'deadlineAt', 'deadline_at'), 80)
  const fileSizeLimitBytes = numberValue(snakeOrCamel(input.raw, 'fileSizeLimitBytes', 'file_size_limit_bytes')) ?? parseSizeBytes(textValue)
  const linkPermitted = booleanValue(snakeOrCamel(input.raw, 'linkPermitted', 'link_permitted')) ?? /\b(?:link|url|online|website)\s+(?:is|are|may be|can be)\s*(?:accepted|submitted|provided)|submit (?:a )?(?:url|link)/i.test(textValue)
  const githubPermitted = booleanValue(snakeOrCamel(input.raw, 'githubPermitted', 'github_permitted')) ?? /github|repository|repo url/i.test(textValue)
  const websitePermitted = booleanValue(snakeOrCamel(input.raw, 'websitePermitted', 'website_permitted')) ?? /website|portfolio url|personal site/i.test(textValue)
  const excerptPermitted = booleanValue(snakeOrCamel(input.raw, 'excerptPermitted', 'excerpt_permitted')) ?? /excerpt|chapter|selected sections?|extract|coherent thesis/i.test(textValue.toLocaleLowerCase())
  const anonymizationRequired = booleanValue(snakeOrCamel(input.raw, 'anonymizationRequired', 'anonymization_required')) ?? /anonymi[sz]ed|anonymous|remove your name|without identifying information/i.test(textValue)
  const applicantNameRequired = booleanValue(snakeOrCamel(input.raw, 'applicantNameRequired', 'applicant_name_required')) ?? /include your name|applicant name|name must appear/i.test(textValue)
  const coverSheetRequired = booleanValue(snakeOrCamel(input.raw, 'coverSheetRequired', 'cover_sheet_required')) ?? /cover (?:sheet|page)|title page/i.test(textValue)
  const translationRequired = booleanValue(snakeOrCamel(input.raw, 'translationRequired', 'translation_required')) ?? /translation|translated copy/i.test(textValue)
  const explanatoryNoteAllowed = booleanValue(snakeOrCamel(input.raw, 'explanatoryNoteAllowed', 'explanatory_note_allowed')) ?? /explanatory note|contribution note|brief note/i.test(textValue)
  const language = text(snakeOrCamel(input.raw, 'language', 'requiredLanguage', 'required_language'), 120) || (textValue.match(/(?:in|written in)\s+(English|French|German|Spanish|Arabic)/i)?.[1] ?? null)
  const exactInstructions = textValue || `${input.type.replaceAll('_', ' ').toLocaleLowerCase()} requirement detected from the programme materials.`
  const evidenceIds = authoritative.map(source => source.id)
  const required = input.mode === 'required'
  const recommended = input.mode === 'recommended'
  const optional = input.mode === 'optional'
  const prohibited = input.mode === 'prohibited'
  const id = `${input.applicationCaseId}:work-sample:${input.requirementKey}`
  return {
    id,
    applicationCaseId: input.applicationCaseId,
    requirementKey: input.requirementKey,
    requirementType: input.type,
    mode: input.mode,
    required,
    recommended,
    optional,
    prohibited,
    numberAllowed: parseNumberAllowed(textValue, input.raw),
    numberRequired: parseNumberRequired(textValue, input.raw),
    acceptedArtifactTypes,
    requiredContentType: text(snakeOrCamel(input.raw, 'requiredContentType', 'required_content_type', 'contentType', 'content_type'), 500) || null,
    expectedSubjectArea: text(snakeOrCamel(input.raw, 'expectedSubjectArea', 'expected_subject_area', 'subjectArea', 'subject_area'), 500) || text(input.programme, 500) || null,
    authorshipRequirements: stringArray(snakeOrCamel(input.raw, 'authorshipRequirements', 'authorship_requirements', 'authorshipRules', 'authorship_rules'), 20),
    soloAuthorRequired: booleanValue(snakeOrCamel(input.raw, 'soloAuthorRequired', 'solo_author_required')) ?? (/single[- ]author|sole author|written solely by you/i.test(textValue) ? true : null),
    coAuthoredAllowed: booleanValue(snakeOrCamel(input.raw, 'coAuthoredAllowed', 'co_authored_allowed')) ?? (/co-authored|coauthored|multiple authors|team work/i.test(textValue) ? true : null),
    publicationRequirement: publicationRequirement(textValue, input.raw),
    pageLimit,
    wordLimit,
    fileSizeLimitBytes,
    fileFormats: parseFormats(textValue, input.raw),
    linkPermitted,
    githubPermitted,
    websitePermitted,
    excerptPermitted,
    anonymizationRequired,
    applicantNameRequired,
    coverSheetRequired,
    citationRequirements: stringArray(snakeOrCamel(input.raw, 'citationRequirements', 'citation_requirements', 'citations'), 20),
    language: language || null,
    translationRequired,
    explanatoryNoteAllowed,
    deadline: deadlineDate ? { dateTime: deadlineDate, timezone: text(explicitDeadline.timezone, 120) || 'UTC' } : null,
    portalDestination: text(snakeOrCamel(input.raw, 'portalDestination', 'portal_destination', 'destination', 'field'), 500) || null,
    evaluationCriteria: stringArray(snakeOrCamel(input.raw, 'evaluationCriteria', 'evaluation_criteria', 'criteria'), 30),
    exactInstructions,
    sources: authoritative,
    sourceEvidenceIds: evidenceIds,
    confidence: Math.min(100, Math.round((authoritative.length ? 70 : 35) + (exactInstructions.length > 40 ? 20 : 0) + (input.mode !== 'not_applicable' ? 10 : 0))),
    status: input.mode === 'not_applicable' ? 'not_required' : authoritative.length ? 'verified' : 'detected',
  }
}

/** Extract every work-sample-like requirement from independent programme sources. */
export function extractWorkSampleRequirements(input: {
  applicationCaseId: string
  programme?: string
  raw?: unknown
  sourceEvidence?: unknown[]
  officialProgramme?: unknown[]
  departmentInstructions?: unknown[]
  applicationGuide?: unknown[]
  portalSections?: unknown[]
  portfolioGuidance?: unknown[]
  faq?: unknown[]
  downloads?: unknown[]
}): WorkSampleRequirement[] {
  const raw = record(input.raw)
  const sources = normalizedSources([
    ...(input.sourceEvidence ?? []), ...(input.officialProgramme ?? []), ...(input.departmentInstructions ?? []),
    ...(input.applicationGuide ?? []), ...(input.portalSections ?? []), ...(input.portfolioGuidance ?? []), ...(input.faq ?? []), ...(input.downloads ?? []),
  ])
  const textValue = fullRequirementText(sources, raw)
  const structured = Array.isArray(raw.requirements) ? raw.requirements : Array.isArray(raw.workSampleRequirements) ? raw.workSampleRequirements : []
  const values = structured.length ? structured : [raw]
  const result: WorkSampleRequirement[] = []
  for (const [index, value] of values.entries()) {
    const item = record(value)
    const itemSources = normalizedSources([
      ...(Array.isArray(item.sources) ? item.sources : []),
      ...(Array.isArray(item.sourceEvidence) ? item.sourceEvidence : []),
      ...sources,
    ])
    const itemText = fullRequirementText(itemSources, item)
    const types = inferArtifactTypes(itemText || textValue)
    const mode = requirementMode(itemText || textValue, item)
    for (const type of types) {
      const key = text(snakeOrCamel(item, 'requirementKey', 'requirement_key', 'id', 'name'), 160) || `${type.toLocaleLowerCase()}:${index + 1}`
      const requirement = makeRequirement({ applicationCaseId: input.applicationCaseId, requirementKey: key, type, mode, raw: item, sources: itemSources, programme: input.programme })
      if (!result.some(existing => existing.requirementType === requirement.requirementType && existing.mode === requirement.mode)) result.push(requirement)
    }
  }
  if (!result.length || (!/writing sample|paper|thesis|publication|code|github|portfolio|previous work|project artifact|notebook|website/i.test(textValue) && !structured.length)) {
    const noSampleRaw = { exactInstructions: textValue || 'No writing sample, portfolio, code sample, publication, or other previous-work artifact was found in the supplied programme sources.' }
    result.push(makeRequirement({ applicationCaseId: input.applicationCaseId, requirementKey: 'no-work-sample', type: 'OTHER', mode: 'not_applicable', raw: noSampleRaw, sources, programme: input.programme }))
  }
  return result
}

function inferPublicationStatus(value: Record<string, unknown>): WorkSampleCandidate['publicationStatus'] {
  const status = text(snakeOrCamel(value, 'publicationStatus', 'publication_status', 'status', 'stage'), 80).toLocaleLowerCase()
  if (/published/.test(status)) return 'published'
  if (/accepted/.test(status)) return 'accepted'
  if (/in press|in_press/.test(status)) return 'in_press'
  if (/preprint|arxiv/.test(status)) return 'preprint'
  if (/submitted|under review|under_review/.test(status)) return 'submitted'
  if (/unpublished|draft/.test(status)) return 'unpublished'
  return 'unknown'
}

function inferCandidateType(value: Record<string, unknown>, fallbackText: string) {
  const explicit = text(snakeOrCamel(value, 'artifactType', 'artifact_type', 'workType', 'work_type', 'type', 'kind'), 80).toLocaleUpperCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (workSampleArtifactTypes.includes(explicit as WorkSampleArtifactType)) return explicit as WorkSampleArtifactType
  const inferred = inferArtifactTypes(`${fallbackText} ${text(snakeOrCamel(value, 'title', 'name'), 500)}`)
  return inferred[0] ?? 'OTHER'
}

function sourceRecord(value: unknown, kind: string, index: number) {
  const item = record(value)
  return {
    item,
    kind,
    id: text(snakeOrCamel(item, 'id', 'assetId', 'asset_id', 'recordId', 'record_id'), 160) || `${kind}:${index + 1}`,
  }
}

function candidateSections(value: Record<string, unknown>) {
  const sections = Array.isArray(snakeOrCamel(value, 'sections', 'chapters', 'selectedSections')) ? snakeOrCamel(value, 'sections', 'chapters', 'selectedSections') as unknown[] : []
  return sections.map(section => {
    const item = record(section)
    const purpose = text(item.purpose, 40).toLocaleLowerCase()
    const allowed: WorkSampleCandidateSection['purpose'][] = ['problem', 'method', 'analysis', 'results', 'contribution', 'context', 'other']
    return {
      title: text(item.title ?? item.name, 300) || 'Section',
      startPage: Math.max(1, Math.round(numberValue(item.startPage ?? item.start_page) ?? 1)),
      endPage: Math.max(1, Math.round(numberValue(item.endPage ?? item.end_page) ?? numberValue(item.startPage ?? item.start_page) ?? 1)),
      purpose: allowed.includes(purpose as WorkSampleCandidateSection['purpose']) ? purpose as WorkSampleCandidateSection['purpose'] : 'other',
    }
  }).filter(section => section.endPage >= section.startPage)
}

function securityFindings(content: string | null) {
  if (!content) return []
  const findings: string[] = []
  const checks: Array<[string, RegExp]> = [
    ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
    ['API key or token', /(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-/.]{16,}/i],
    ['password literal', /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{6,}["']/i],
    ['environment secret', /(?:^|\n)\s*\.env(?:\.|\s|$)|(?:^|\n)\s*(?:AWS_|GITHUB_|SUPABASE_)[A-Z0-9_]+\s*=/i],
    ['sensitive repository file', /(?:^|\n)\s*(?:[^\n]*\/)?(?:\.env(?:\.|$)|id_rsa(?:\.[^\s]+)?|[^\n]*\.pem|[^\n]*credentials)/i],
    ['private URL', /https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)/i],
  ]
  for (const [label, expression] of checks) if (expression.test(content)) findings.push(label)
  return findings
}

function inspectContent(content: string | null, value: Record<string, unknown>): WorkSampleInspection {
  if (!content?.trim()) return {
    inspected: false, inspectionSource: null, topic: text(value.topic ?? value.subjectArea ?? value.subject_area, 500) || null,
    structure: [], methods: [], results: [], argumentQuality: 0, evidenceQuality: 0, writingClarity: 0, completeness: 0, contributionEvidence: 0,
    securityFindings: [], warnings: ['The source artifact was discovered, but readable content was not available for inspection.'],
  }
  const lower = content.toLocaleLowerCase()
  const structure = ['abstract', 'introduction', 'literature review', 'method', 'methodology', 'analysis', 'results', 'discussion', 'conclusion', 'references'].filter(label => lower.includes(label))
  const methods = content.split(/[.!?\n]/).map(line => line.trim()).filter(line => /\b(?:method|methodology|dataset|experiment|model|regression|simulation|interview|sample|analysis)\b/i.test(line)).slice(0, 8)
  const results = content.split(/[.!?\n]/).map(line => line.trim()).filter(line => /\b(?:result|find|finding|show|demonstrat|improv|accuracy|contribution|outcome)\w*\b/i.test(line)).slice(0, 8)
  const words = content.trim().split(/\s+/).length
  const citations = (content.match(/\([^)]{2,80}\s+\d{4}[a-z]?\)|\[\d+\]|doi\.org/gi) ?? []).length
  const security = securityFindings(content)
  return {
    inspected: true,
    inspectionSource: text(value.contentSource ?? value.content_source ?? value.sourceId ?? value.source_id, 160) || 'provided artifact content',
    topic: text(value.topic ?? value.subjectArea ?? value.subject_area, 500) || content.split(/[.!?\n]/).map(line => line.trim()).find(line => line.length >= 20) || null,
    structure,
    methods,
    results,
    argumentQuality: clamp(45 + (structure.includes('introduction') ? 10 : 0) + (structure.includes('discussion') ? 10 : 0) + (words > 1_000 ? 10 : 0)),
    evidenceQuality: clamp(35 + Math.min(30, citations * 3) + (results.length ? 15 : 0) + (methods.length ? 10 : 0)),
    writingClarity: clamp(45 + (structure.length >= 5 ? 15 : 0) + (words > 500 ? 10 : 0)),
    completeness: clamp(35 + Math.min(45, structure.length * 6) + (words > 1_500 ? 10 : 0)),
    contributionEvidence: clamp(30 + (/(my contribution|i developed|i designed|i implemented|i analysed|i analyzed|role:|contribution:)/i.test(content) ? 35 : 0) + (methods.length ? 15 : 0)),
    securityFindings: security,
    warnings: security.length ? ['Sensitive material was detected in the inspected content.'] : [],
  }
}

function candidateFromRecord(value: unknown, kind: string, index: number): WorkSampleCandidate | null {
  const { item, id } = sourceRecord(unwrap(value), kind, index)
  const content = text(snakeOrCamel(item, 'content', 'text', 'body', 'extractedText', 'extracted_text', 'plainText', 'plain_text', 'atsText', 'ats_text'), 200_000) || null
  const fallbackText = [text(snakeOrCamel(item, 'title', 'name', 'filename', 'originalFilename', 'original_filename'), 500), text(snakeOrCamel(item, 'description', 'summary', 'abstract', 'topic', 'subjectArea', 'subject_area'), 2_000), content ?? ''].join(' ')
  const artifactType = inferCandidateType(item, fallbackText)
  const sourceAssetIds = unique([
    ...stringArray(snakeOrCamel(item, 'sourceAssetIds', 'source_asset_ids', 'assetIds', 'asset_ids'), 40),
    ...[text(snakeOrCamel(item, 'assetId', 'asset_id', 'fileAssetId', 'file_asset_id'), 120)].filter(Boolean),
  ])
  const url = text(snakeOrCamel(item, 'url', 'link', 'publicationUrl', 'publication_url'), 2_000) || null
  const repositoryUrl = text(snakeOrCamel(item, 'repositoryUrl', 'repository_url', 'githubUrl', 'github_url', 'repoUrl', 'repo_url'), 2_000) || (/github\.com/i.test(url ?? '') ? url : null)
  const liveSiteUrl = text(snakeOrCamel(item, 'liveSiteUrl', 'live_site_url', 'website', 'websiteUrl', 'website_url', 'portfolioUrl', 'portfolio_url'), 2_000) || (artifactType === 'WEBSITE' ? url : null)
  const authors = stringArray(snakeOrCamel(item, 'authors', 'coauthors', 'co_authors'), 40)
  const role = text(snakeOrCamel(item, 'applicantAuthorshipRole', 'applicant_authorship_role', 'authorship', 'authorRole', 'author_role', 'contributionRole', 'contribution_role'), 80).toLocaleLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  const applicantAuthorshipRole: WorkSampleCandidate['applicantAuthorshipRole'] = role.includes('sole') || role.includes('single') ? 'sole_author' : role.includes('first') ? 'first_author' : role.includes('co_author') || role.includes('coauthor') ? 'co_author' : role.includes('design') ? 'designer' : role.includes('develop') || role.includes('code') ? 'developer' : role.includes('contribut') ? 'contributor' : 'unknown'
  const authorshipEvidence = stringArray(snakeOrCamel(item, 'authorshipEvidence', 'authorship_evidence', 'ownershipEvidence', 'ownership_evidence', 'sourceEvidenceIds', 'source_evidence_ids'), 30)
  const assetAvailable = sourceAssetIds.length > 0 || Boolean(repositoryUrl || liveSiteUrl || url)
  const pageCount = numberValue(snakeOrCamel(item, 'pageCount', 'page_count', 'pages'))
  const wordCount = numberValue(snakeOrCamel(item, 'wordCount', 'word_count', 'words')) ?? (content ? content.trim().split(/\s+/).length : null)
  const inspection = inspectContent(content, item)
  const stale = item.stale === true || /stale|superseded|outdated/i.test(text(snakeOrCamel(item, 'status', 'state'), 80))
  const date = text(snakeOrCamel(item, 'date', 'year', 'createdAt', 'created_at', 'updatedAt', 'updated_at'), 80) || null
  const sourceUrl = text(snakeOrCamel(item, 'sourceUrl', 'source_url', 'provenanceUrl', 'provenance_url'), 2_000) || url
  const score = clamp(inspection.inspected ? inspection.argumentQuality * 0.22 + inspection.evidenceQuality * 0.18 + inspection.writingClarity * 0.18 + inspection.completeness * 0.14 + inspection.contributionEvidence * 0.18 + (authors.length ? 5 : 0) + (sourceUrl ? 5 : 0) : 25)
  return {
    id: text(snakeOrCamel(item, 'candidateId', 'candidate_id', 'id'), 160) || `${kind}:${index + 1}`,
    title: text(snakeOrCamel(item, 'title', 'name', 'filename', 'originalFilename', 'original_filename'), 500) || 'Untitled work sample',
    artifactType,
    source: { kind, id, url: sourceUrl },
    sourceAssetIds,
    assetAvailable,
    authors,
    applicantAuthorshipRole,
    authorshipEvidence,
    publicationStatus: inferPublicationStatus(item),
    date,
    institutionOrProject: text(snakeOrCamel(item, 'institution', 'institutionName', 'institution_name', 'project', 'projectName', 'project_name'), 500) || null,
    subjectArea: text(snakeOrCamel(item, 'subjectArea', 'subject_area', 'field', 'topic'), 500) || null,
    description: text(snakeOrCamel(item, 'description', 'summary', 'abstract'), 4_000),
    applicantContribution: text(snakeOrCamel(item, 'applicantContribution', 'applicant_contribution', 'contribution', 'roleDescription', 'role_description'), 4_000) || null,
    pageCount,
    wordCount,
    fileFormat: text(snakeOrCamel(item, 'fileFormat', 'file_format', 'mimeType', 'mime_type', 'format'), 120) || null,
    fileSizeBytes: numberValue(snakeOrCamel(item, 'fileSizeBytes', 'file_size_bytes', 'sizeBytes', 'size_bytes', 'size')),
    language: text(snakeOrCamel(item, 'language', 'lang'), 120) || null,
    publicationVenue: text(snakeOrCamel(item, 'publicationVenue', 'publication_venue', 'venue', 'journal'), 500) || null,
    doiOrIdentifier: text(snakeOrCamel(item, 'doi', 'doiOrIdentifier', 'doi_or_identifier', 'identifier', 'arxiv'), 300) || null,
    url,
    repositoryUrl,
    liveSiteUrl,
    technologies: stringArray(snakeOrCamel(item, 'technologies', 'tech', 'stack'), 40),
    visualMetadata: {
      ...record(snakeOrCamel(item, 'visualMetadata', 'visual_metadata', 'designMetadata', 'design_metadata')),
      ...(item.urlStatus !== undefined || item.url_status !== undefined ? { urlStatus: text(item.urlStatus ?? item.url_status, 80) } : {}),
      ...(item.urlAccessible !== undefined || item.url_accessible !== undefined ? { urlAccessible: item.urlAccessible ?? item.url_accessible } : {}),
      ...(item.brokenLinks !== undefined || item.broken_links !== undefined ? { brokenLinks: stringArray(item.brokenLinks ?? item.broken_links, 40) } : {}),
    },
    sections: candidateSections(item),
    programmeRelevance: clamp(snakeOrCamel(item, 'programmeRelevance', 'programme_relevance', 'relevanceScore', 'relevance_score')),
    evidentiaryStrength: clamp(snakeOrCamel(item, 'evidentiaryStrength', 'evidentiary_strength', 'evidenceScore', 'evidence_score'), score),
    qualityScore: score,
    eligibility: 'unknown',
    eligibilityReasons: [],
    provenance: {
      sourceIds: unique([id, ...authorshipEvidence]), sourceAssetIds, checksum: text(snakeOrCamel(item, 'checksum', 'sha256', 'hash'), 128) || null,
      createdAt: text(snakeOrCamel(item, 'createdAt', 'created_at'), 80) || null, updatedAt: text(snakeOrCamel(item, 'updatedAt', 'updated_at'), 80) || null, stale,
    },
    content,
    inspection,
  }
}

function mergeCandidates(values: WorkSampleCandidate[]) {
  const merged = new Map<string, WorkSampleCandidate>()
  for (const value of values) {
    const key = value.provenance.checksum || value.url || value.repositoryUrl || `${value.title.toLocaleLowerCase()}:${value.source.kind}`
    const existing = merged.get(key)
    if (!existing || value.inspection.inspected && !existing.inspection.inspected || value.qualityScore > existing.qualityScore) merged.set(key, existing ? { ...existing, ...value, id: existing.id, sourceAssetIds: unique([...existing.sourceAssetIds, ...value.sourceAssetIds]), authorshipEvidence: unique([...existing.authorshipEvidence, ...value.authorshipEvidence]), provenance: { ...existing.provenance, ...value.provenance, sourceIds: unique([...existing.provenance.sourceIds, ...value.provenance.sourceIds]), sourceAssetIds: unique([...existing.provenance.sourceAssetIds, ...value.provenance.sourceAssetIds]) } } : value)
  }
  return [...merged.values()]
}

/** Search all authorized reusable application context before creating a user handoff. */
export function discoverWorkSampleCandidates(input: {
  profile?: unknown
  uploadedFiles?: unknown[]
  previousApplications?: unknown[]
  canonicalCv?: unknown
  thesisRecords?: unknown[]
  researchRecords?: unknown[]
  publicationRecords?: unknown[]
  projectRecords?: unknown[]
  previousArtifacts?: unknown[]
  gmailAttachments?: unknown[]
  reusableContext?: unknown
  existingCandidates?: unknown[]
}): WorkSampleCandidate[] {
  const sources: Array<{ value: unknown; kind: string }> = []
  const addArray = (values: unknown[] | undefined, kind: string) => values?.forEach(value => sources.push({ value, kind }))
  const profile = record(input.profile)
  addArray(Array.isArray(profile.theses) ? profile.theses : Array.isArray(profile.thesis) ? profile.thesis : [], 'ApplicantProfile.thesis')
  addArray(Array.isArray(profile.researchExperience) ? profile.researchExperience : [], 'ApplicantProfile.research')
  addArray(Array.isArray(profile.publications) ? profile.publications : input.publicationRecords, 'ApplicantProfile.publication')
  addArray(Array.isArray(profile.projects) ? profile.projects : input.projectRecords, 'ApplicantProfile.project')
  addArray(input.thesisRecords, 'thesis_records')
  addArray(input.researchRecords, 'research_records')
  addArray(input.publicationRecords, 'publication_records')
  addArray(input.projectRecords, 'project_records')
  addArray(input.uploadedFiles, 'uploaded_file')
  addArray(input.previousApplications, 'previous_application')
  addArray(input.previousArtifacts, 'previous_artifact')
  addArray(input.gmailAttachments, 'gmail_attachment')
  addArray(input.existingCandidates, 'existing_candidate')
  if (input.canonicalCv) sources.push({ value: input.canonicalCv, kind: 'canonical_cv' })
  const reusable = record(input.reusableContext)
  for (const key of ['writingSamples', 'writing_samples', 'papers', 'publications', 'projects', 'portfolios', 'codeSamples', 'code_samples', 'previousWork', 'previous_work']) addArray(Array.isArray(reusable[key]) ? reusable[key] : [], `reusable_context.${key}`)
  const candidates = sources.map((source, index) => candidateFromRecord(source.value, source.kind, index)).filter((value): value is WorkSampleCandidate => Boolean(value))
  return mergeCandidates(candidates)
}

export function verifyCandidateAuthorship(candidate: WorkSampleCandidate) {
  const reasons: string[] = []
  if (candidate.applicantAuthorshipRole === 'unknown') reasons.push('Applicant authorship or contribution role is not verified.')
  if (!candidate.authorshipEvidence.length && ['sole_author', 'first_author', 'co_author', 'contributor', 'designer', 'developer'].includes(candidate.applicantAuthorshipRole)) reasons.push('The authorship claim has no recorded supporting evidence.')
  if (candidate.applicantAuthorshipRole === 'co_author' && !candidate.applicantContribution) reasons.push('Co-authored work needs the applicant contribution before submission.')
  if (candidate.provenance.stale) reasons.push('The candidate is marked stale or superseded.')
  return { verified: reasons.length === 0, reasons }
}

export function checkWorkSampleEligibility(requirement: WorkSampleRequirement, candidate: WorkSampleCandidate) {
  const reasons: string[] = []
  if (requirement.prohibited) reasons.push('The programme does not accept this work-sample class.')
  if (!requirement.acceptedArtifactTypes.includes(candidate.artifactType) && !requirement.acceptedArtifactTypes.includes('OTHER')) reasons.push(`Artifact type ${candidate.artifactType} is not accepted by this requirement.`)
  const authorship = verifyCandidateAuthorship(candidate)
  reasons.push(...authorship.reasons)
  if (requirement.soloAuthorRequired === true && candidate.applicantAuthorshipRole !== 'sole_author') reasons.push('A single-author artifact is required.')
  if (requirement.coAuthoredAllowed === false && ['co_author', 'contributor'].includes(candidate.applicantAuthorshipRole)) reasons.push('Co-authored work is not allowed by this requirement.')
  if (requirement.publicationRequirement && requirement.publicationRequirement !== 'any') {
    const status = candidate.publicationStatus
    const acceptable = requirement.publicationRequirement === 'published' ? status === 'published' : requirement.publicationRequirement === 'accepted' ? ['published', 'accepted', 'in_press'].includes(status) : requirement.publicationRequirement === 'preprint' ? ['preprint', 'published', 'accepted'].includes(status) : status === requirement.publicationRequirement
    if (!acceptable) reasons.push(`Publication status ${status} does not satisfy ${requirement.publicationRequirement}.`)
  }
  if (requirement.pageLimit !== null && candidate.pageCount !== null && candidate.pageCount > requirement.pageLimit && !requirement.excerptPermitted) reasons.push(`The candidate is ${candidate.pageCount} pages; the limit is ${requirement.pageLimit} pages and excerpts are not permitted.`)
  if (requirement.wordLimit !== null && candidate.wordCount !== null && candidate.wordCount > requirement.wordLimit && !requirement.excerptPermitted) reasons.push(`The candidate exceeds the ${requirement.wordLimit}-word limit.`)
  if (requirement.fileSizeLimitBytes !== null && candidate.fileSizeBytes !== null && candidate.fileSizeBytes > requirement.fileSizeLimitBytes) reasons.push('The source file exceeds the programme file-size limit.')
  const urlDeliveryPermitted = Boolean((candidate.liveSiteUrl || candidate.repositoryUrl || candidate.url) && (requirement.linkPermitted || requirement.githubPermitted || requirement.websitePermitted))
  if (requirement.fileFormats.length && candidate.fileFormat && !requirement.fileFormats.some(format => candidate.fileFormat?.toLocaleLowerCase().includes(format.toLocaleLowerCase().replace('.', '')) || candidate.fileFormat?.toLocaleLowerCase() === format.toLocaleLowerCase()) && !urlDeliveryPermitted) reasons.push(`File format ${candidate.fileFormat} is not accepted.`)
  if (!candidate.assetAvailable && !requirement.linkPermitted && !requirement.githubPermitted && !requirement.websitePermitted) reasons.push('The eligible work is known, but no authorized source file is available.')
  if (candidate.inspection.securityFindings.length) reasons.push(`Sensitive material detected: ${candidate.inspection.securityFindings.join(', ')}.`)
  const urlStatus = text(candidate.visualMetadata.urlStatus, 80).toLocaleLowerCase()
  if (candidate.url || candidate.repositoryUrl || candidate.liveSiteUrl) {
    if (candidate.visualMetadata.urlAccessible === false || ['broken', 'unreachable', 'failed', 'private', 'login_required'].includes(urlStatus)) reasons.push('The candidate URL is not reachable under the programme access rules.')
    if (Array.isArray(candidate.visualMetadata.brokenLinks) && candidate.visualMetadata.brokenLinks.length) reasons.push('The candidate portfolio contains broken links.')
  }
  const unknown = candidate.applicantAuthorshipRole === 'unknown' || !candidate.inspection.inspected && !candidate.sourceAssetIds.length && !candidate.url && !candidate.repositoryUrl
  const eligibility: WorkSampleEligibilityState = reasons.length ? 'ineligible' : unknown ? 'unknown' : 'eligible'
  return { eligibility, reasons }
}

function relevanceScore(requirement: WorkSampleRequirement, candidate: WorkSampleCandidate) {
  const expected = `${requirement.expectedSubjectArea ?? ''} ${requirement.requiredContentType ?? ''}`.toLocaleLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 3)
  const candidateText = `${candidate.subjectArea ?? ''} ${candidate.description} ${candidate.title} ${candidate.inspection.topic ?? ''}`.toLocaleLowerCase()
  const overlap = expected.length ? expected.filter(token => candidateText.includes(token)).length / expected.length : 0.5
  return clamp(Math.max(candidate.programmeRelevance, overlap * 100))
}

/** Rank for the committee's requested evidence, not prestige alone. */
export function rankWorkSampleCandidates(input: { requirement: WorkSampleRequirement; candidates: WorkSampleCandidate[]; programme?: string; weights?: Record<string, number> }): RankedWorkSampleCandidate[] {
  const ranked = input.candidates.map(candidate => {
    const eligibility = checkWorkSampleEligibility(input.requirement, candidate)
    const relevance = relevanceScore(input.requirement, candidate)
    const contribution = candidate.inspection.contributionEvidence || (candidate.applicantContribution ? 75 : 25)
    const externalValidation = candidate.publicationStatus === 'published' ? 95 : candidate.publicationStatus === 'accepted' || candidate.publicationStatus === 'in_press' ? 85 : candidate.publicationStatus === 'preprint' ? 70 : 45
    const completeness = candidate.inspection.completeness || (candidate.pageCount || candidate.wordCount ? 60 : 25)
    // External prestige is useful evidence, but it must not outweigh a
    // stronger inspected fit or a clearer record of the applicant's work.
    const weights: Record<string, number> = { programmeRelevance: 0.28, quality: 0.24, contribution: 0.18, depth: 0.14, completeness: 0.08, externalValidation: 0.04, recency: 0.04, ...input.weights }
    const scoreBreakdown: Record<string, number> = { programmeRelevance: relevance, quality: candidate.qualityScore, contribution, depth: candidate.inspection.argumentQuality + candidate.inspection.evidenceQuality / 2, completeness, externalValidation, recency: candidate.date ? 70 : 40 }
    const total = clamp(Object.entries(scoreBreakdown).reduce((sum, [key, value]) => sum + value * (weights[key] ?? 0), 0))
    const rankingReasons = [
      `${relevance}/100 programme-fit evidence`, `${candidate.qualityScore}/100 inspected quality`, `${contribution}/100 verified applicant contribution`,
      eligibility.eligibility === 'eligible' ? 'fully eligible' : eligibility.eligibility === 'unknown' ? 'needs one evidence check' : 'not eligible',
    ]
    return { ...candidate, eligibility: eligibility.eligibility, eligibilityReasons: eligibility.reasons, rank: 0, applicationFitScore: total, rankingReasons, scoreBreakdown }
  }).sort((left, right) => {
    const eligibilityRank = (value: WorkSampleEligibilityState) => value === 'eligible' ? 0 : value === 'unknown' ? 1 : 2
    return eligibilityRank(left.eligibility) - eligibilityRank(right.eligibility) || right.applicationFitScore - left.applicationFitScore || right.qualityScore - left.qualityScore || left.title.localeCompare(right.title)
  })
  return ranked.map((candidate, index) => ({ ...candidate, rank: index + 1 }))
}

function interactionBase(input: Pick<WorkSampleInteraction, 'id' | 'requirementId' | 'kind' | 'question' | 'reason'> & Partial<WorkSampleInteraction>): WorkSampleInteraction {
  return {
    workflow: 'work_sample', id: input.id, requirementId: input.requirementId, kind: input.kind, question: input.question, reason: input.reason,
    knownContext: input.knownContext ?? [], options: input.options ?? [], reusableContextKeys: input.reusableContextKeys ?? [],
    confirmLabel: input.confirmLabel ?? (input.kind === 'approval' ? 'Approve' : 'Continue'), cancelLabel: input.cancelLabel ?? 'Choose another',
    approvalScope: input.approvalScope, mapsToRequirement: input.mapsToRequirement, attachmentPrompt: input.attachmentPrompt,
    acceptedMimeTypes: input.acceptedMimeTypes ?? ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    maximumFiles: input.maximumFiles ?? 1, minSelections: input.minSelections ?? 1,
  }
}

export function createWorkSamplePortfolioStrategy(input: { applicationCaseId: string; requirement: WorkSampleRequirement; rankedCandidates: RankedWorkSampleCandidate[]; selectedCandidateIds?: string[] }): { strategy: PortfolioStrategy | null; interaction: WorkSampleInteraction | null } {
  const eligible = input.rankedCandidates.filter(candidate => candidate.eligibility === 'eligible')
  const requiredNumber = input.requirement.numberRequired ?? 1
  const maximumNumber = input.requirement.numberAllowed
  if (!eligible.length) {
    const missing = input.rankedCandidates.find(candidate => candidate.assetAvailable === false && candidate.eligibility !== 'ineligible')
    return missing
      ? { strategy: null, interaction: interactionBase({ kind: 'attachment_request', id: `${input.requirement.id}:missing-file`, requirementId: input.requirement.id, question: `${missing.title} is the strongest eligible match, but I do not have the final source file.`, reason: 'I found and inspected the work in reusable context, but the portal upload cannot be prepared without its authorized file.', knownContext: [missing.title, missing.applicantContribution ? `Verified role: ${missing.applicantContribution}` : 'Authorship still needs confirmation'], attachmentPrompt: `Attach ${missing.title}.`, reusableContextKeys: [] }) }
      : { strategy: null, interaction: null }
  }
  const explicitlySelected = input.selectedCandidateIds?.length ? eligible.filter(candidate => input.selectedCandidateIds!.includes(candidate.id)) : []
  const pool = explicitlySelected.length >= requiredNumber ? explicitlySelected : eligible
  const selected = pool.slice(0, maximumNumber ?? requiredNumber)
  if (selected.length < requiredNumber) return { strategy: null, interaction: null }
  const genuinelyCompetitive = eligible.length > 1 && eligible[1]!.applicationFitScore >= eligible[0]!.applicationFitScore - 5 && !input.selectedCandidateIds?.length
  if (genuinelyCompetitive) {
    return {
      strategy: null,
      interaction: interactionBase({
        kind: requiredNumber > 1 ? 'multiple_choice' : 'single_choice', id: `${input.requirement.id}:candidate-choice`, requirementId: input.requirement.id,
        question: `I found ${selected.length > 1 ? 'two strong' : 'one strong'} work-sample options for this application.`, reason: 'I inspected the available artifacts and ranked them by programme fit, evidence quality, and your verified contribution before asking you to choose.',
        knownContext: selected.slice(0, 4).map(candidate => `${candidate.title}: ${candidate.applicationFitScore}/100 — ${candidate.rankingReasons.slice(0, 2).join('; ')}`),
        options: selected.slice(0, 4).map(candidate => ({ value: candidate.id, label: candidate.title, description: `${candidate.artifactType.replaceAll('_', ' ')} · ${candidate.applicationFitScore}/100 · ${candidate.applicantContribution ?? 'Contribution evidence recorded'}` })),
        reusableContextKeys: ['selected_work_sample_ids'], minSelections: requiredNumber,
      }),
    }
  }
  const purposeByCandidate: Record<string, string> = {}
  const applicantContributionByCandidate: Record<string, string> = {}
  const programmeRelevanceByCandidate: Record<string, number> = {}
  for (const [index, candidate] of selected.entries()) {
    purposeByCandidate[candidate.id] = requiredNumber > 1 ? index === 0 ? 'Lead with the strongest direct programme fit.' : 'Add complementary evidence without repeating the lead piece.' : 'Primary evidence of the requested previous work.'
    applicantContributionByCandidate[candidate.id] = candidate.applicantContribution ?? 'Contribution evidence is recorded in the candidate provenance.'
    programmeRelevanceByCandidate[candidate.id] = relevanceScore(input.requirement, candidate)
  }
  const topics = selected.map(candidate => candidate.subjectArea ?? candidate.title.toLocaleLowerCase())
  const duplicateTopic = new Set(topics.map(topic => topic.toLocaleLowerCase())).size < topics.length
  const strategy: PortfolioStrategy = {
    id: `${input.applicationCaseId}:portfolio:${input.requirement.requirementKey}`,
    applicationCaseId: input.applicationCaseId,
    requiredNumber, maximumNumber, selectedCandidateIds: selected.map(candidate => candidate.id), ordering: selected.map(candidate => candidate.id), purposeByCandidate,
    redundancyCheck: { passed: !duplicateTopic, warnings: duplicateTopic ? ['Selected projects may repeat the same evidence; review the ordering before approval.'] : [] },
    applicantContributionByCandidate, programmeRelevanceByCandidate,
    narrative: selected.length > 1 ? `A ${selected.length}-piece set led by ${selected[0]!.title}, followed by complementary work that shows breadth without replacing the strongest programme fit.` : `Lead with ${selected[0]!.title} because it is the strongest eligible evidence for this programme.`,
    approvalRequired: true,
  }
  return { strategy, interaction: null }
}

function chooseCoherentExcerpt(candidate: WorkSampleCandidate, pageLimit: number) {
  if (candidate.pageCount === null || candidate.pageCount <= pageLimit) return { pages: candidate.pageCount ? Array.from({ length: candidate.pageCount }, (_, index) => index + 1) : [], warning: null }
  const sections = candidate.sections.filter(section => ['problem', 'method', 'analysis', 'results', 'contribution'].includes(section.purpose))
  const selected: number[] = []
  const preferred = [
    ...sections.filter(section => section.purpose === 'problem'),
    ...sections.filter(section => section.purpose === 'method'),
    ...sections.filter(section => ['results', 'contribution', 'analysis'].includes(section.purpose)),
  ]
  for (const section of preferred) {
    const remaining = pageLimit - selected.length
    if (remaining <= 0) break
    const length = Math.min(remaining, section.endPage - section.startPage + 1)
    const pages = Array.from({ length }, (_, index) => section.startPage + index)
    selected.push(...pages)
  }
  if (!selected.length) selected.push(...Array.from({ length: pageLimit }, (_, index) => index + 1))
  return { pages: [...new Set(selected)].sort((left, right) => left - right).slice(0, pageLimit), warning: sections.length ? null : 'The source has no typed section map; page selection needs human review.' }
}

function safeName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'Applicant'
}

function filenameFor(applicantName: string, type: WorkSampleArtifactType, extension = '.pdf') {
  const label = type === 'THESIS_EXCERPT' ? 'Thesis_Excerpt' : type === 'ACADEMIC_WRITING' || type === 'RESEARCH_PAPER' ? 'Writing_Sample' : type === 'CODE_SAMPLE' || type === 'SOFTWARE_PROJECT' ? 'Code_Sample' : type === 'PUBLICATION_LIST' ? 'Publication_List' : type === 'DESIGN_PORTFOLIO' || type === 'VISUAL_PORTFOLIO' || type === 'PROJECT_PORTFOLIO' ? 'Portfolio' : type.replaceAll('_', '_')
  return `${safeName(applicantName)}_${label}${extension.startsWith('.') ? extension : `.${extension}`}`
}

function extensionForCandidate(candidate: WorkSampleCandidate) {
  const format = candidate.fileFormat?.toLocaleLowerCase() ?? ''
  if (format.includes('zip')) return '.zip'
  if (format.includes('ipynb') || format.includes('notebook')) return '.ipynb'
  if (format.includes('html')) return '.html'
  if (format.includes('json')) return '.json'
  if (format.includes('text') || format.endsWith('/plain') || format.endsWith('.txt')) return '.txt'
  return '.pdf'
}

function submissionMethodFor(requirement: WorkSampleRequirement, candidate: WorkSampleCandidate): WorkSampleSubmissionMethod {
  const hasSourceFile = candidate.sourceAssetIds.length > 0
  const url = candidate.liveSiteUrl ?? candidate.repositoryUrl ?? candidate.url
  if (!hasSourceFile && url && (requirement.linkPermitted || requirement.githubPermitted || requirement.websitePermitted)) return 'url'
  return 'file_upload'
}

function stableChecksum(value: unknown) {
  const input = JSON.stringify(value)
  let first = 2166136261
  let second = 2246822519
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    first = Math.imul(first ^ code, 16777619)
    second = Math.imul(second ^ (code + index), 3266489917)
  }
  const a = (first >>> 0).toString(16).padStart(8, '0')
  const b = (second >>> 0).toString(16).padStart(8, '0')
  return `${a}${b}${a}${b}${a}${b}${a}${b}`
}

export function scanWorkSampleSecurity(input: { content?: string | null; filename?: string | null; repositoryFiles?: Array<{ path: string; content?: string | null }>; }): { passed: boolean; findings: string[] } {
  const findings = [...securityFindings(input.content ?? null)]
  for (const file of input.repositoryFiles ?? []) {
    if (/^(?:\.env(?:\.|$)|.*(?:id_rsa|\.pem)$|.*credentials)/i.test(file.path)) findings.push(`sensitive file path: ${file.path}`)
    findings.push(...securityFindings(file.content ?? null).map(item => `${file.path}: ${item}`))
  }
  return { passed: findings.length === 0, findings: unique(findings) }
}

export function validateWorkSampleSubmission(input: {
  requirement: WorkSampleRequirement
  candidate: WorkSampleCandidate
  filename: string
  applicantName: string
  originalChecksum?: string | null
  checksum: string
  sizeBytes?: number | null
  pageCount?: number | null
  wordCount?: number | null
  selectedPages?: number[]
  anonymized?: boolean
  applicantNameIncluded?: boolean
  substantiveContentChanged?: boolean
  securityFindings?: string[]
}) {
  const issues: string[] = []
  const warnings: string[] = []
  const { requirement, candidate } = input
  const eligibility = checkWorkSampleEligibility(requirement, candidate)
  if (eligibility.eligibility !== 'eligible') issues.push(...eligibility.reasons)
  if (!input.filename || /final_final|uuid|temp|tmp|undefined/i.test(input.filename)) issues.push('The filename is not a professional programme-facing filename.')
  if (requirement.pageLimit !== null && input.pageCount !== null && input.pageCount !== undefined && input.pageCount > requirement.pageLimit) issues.push(`Prepared artifact exceeds the ${requirement.pageLimit}-page limit.`)
  if (requirement.wordLimit !== null && input.wordCount !== null && input.wordCount !== undefined && input.wordCount > requirement.wordLimit) issues.push(`Prepared artifact exceeds the ${requirement.wordLimit}-word limit.`)
  if (requirement.fileSizeLimitBytes !== null && input.sizeBytes !== null && input.sizeBytes !== undefined && input.sizeBytes > requirement.fileSizeLimitBytes) issues.push('Prepared artifact exceeds the programme file-size limit.')
  if (requirement.anonymizationRequired && input.anonymized !== true) issues.push('Programme-required anonymization is not verified.')
  if (requirement.applicantNameRequired && input.applicantNameIncluded !== true) issues.push('The programme requires the applicant name, but it was not verified in the prepared artifact.')
  if (!input.checksum || input.checksum.length < 32) issues.push('The prepared artifact has no usable checksum.')
  if (!input.originalChecksum && candidate.sourceAssetIds.length) warnings.push('Original artifact checksum is not yet linked; persist it before upload.')
  if (input.substantiveContentChanged) issues.push('Preparation changed substantive prior work. Derived preparation may format or select content, not rewrite history.')
  const security = { passed: !(input.securityFindings?.length), findings: input.securityFindings ?? [] }
  if (!security.passed) issues.push(`Security scan blocked submission: ${security.findings.join(', ')}.`)
  const semanticRationale = candidate.inspection.inspected
    ? `Inspected ${candidate.title}; quality ${candidate.qualityScore}/100, contribution evidence ${candidate.inspection.contributionEvidence}/100, and programme relevance was evaluated.`
    : 'The candidate was discovered but its readable content was not inspected.'
  const semanticPassed = candidate.inspection.inspected && candidate.qualityScore >= 45 && candidate.inspection.contributionEvidence >= 40
  if (!semanticPassed) issues.push('The selected artifact is not yet a sufficiently inspected representation of the applicant.')
  const programmaticPassed = issues.length === 0
  return {
    passed: programmaticPassed && semanticPassed && security.passed,
    programmatic: { passed: programmaticPassed, issues, warnings },
    semantic: { passed: semanticPassed, issues: semanticPassed ? [] : ['Inspected quality or contribution evidence is below the safe submission threshold.'], rationale: semanticRationale },
    security,
  }
}

/** Prepare a derived submission record while preserving the original artifact identity. */
export function prepareWorkSampleSubmission(input: {
  applicationCaseId: string
  requirement: WorkSampleRequirement
  candidate: WorkSampleCandidate
  applicantName: string
  originalArtifactId?: string | null
  originalChecksum?: string | null
  derivedChecksum?: string | null
  derivedSizeBytes?: number | null
  selectedProjects?: string[]
  anonymized?: boolean
  applicantNameIncluded?: boolean
  approvalRequired?: boolean
}): WorkSampleSubmission {
  const transformations: WorkSampleTransformation[] = []
  const selectedPages = input.requirement.pageLimit !== null && input.candidate.pageCount !== null
    ? chooseCoherentExcerpt(input.candidate, input.requirement.pageLimit).pages
    : input.candidate.pageCount ? Array.from({ length: input.candidate.pageCount }, (_, index) => index + 1) : []
  if (input.candidate.pageCount !== null && input.requirement.pageLimit !== null && input.candidate.pageCount > input.requirement.pageLimit) transformations.push({ type: 'page_extraction', description: `Selected coherent problem/method/analysis/results pages within the ${input.requirement.pageLimit}-page limit.`, substantiveContentChanged: false })
  if (input.requirement.coverSheetRequired) transformations.push({ type: 'cover_sheet_added', description: 'Added only the permitted title, institution, degree/year, selected sections, and authorship context.', substantiveContentChanged: false })
  transformations.push({ type: 'filename_normalized', description: 'Generated a clean programme-facing filename.', substantiveContentChanged: false })
  if (input.requirement.anonymizationRequired && input.anonymized) transformations.push({ type: 'anonymized', description: 'Removed only identifying fields specified by the programme.', substantiveContentChanged: false })
  if (input.candidate.fileFormat?.toLocaleLowerCase().includes('pdf') || input.requirement.fileFormats.includes('.pdf')) transformations.push({ type: 'pdf_normalized', description: 'Normalized the derived PDF container without rewriting substantive content.', substantiveContentChanged: false })
  if (input.selectedProjects?.length) transformations.push({ type: 'projects_ordered', description: 'Ordered selected projects to present complementary technical, independent, and cross-disciplinary evidence.', substantiveContentChanged: false })
  const submissionMethod = submissionMethodFor(input.requirement, input.candidate)
  const submissionUrl = submissionMethod === 'url' ? input.candidate.liveSiteUrl ?? input.candidate.repositoryUrl ?? input.candidate.url : null
  const filename = filenameFor(input.applicantName, input.requirement.requirementType, submissionMethod === 'url' ? '.url' : extensionForCandidate(input.candidate))
  const pageCount = selectedPages.length || input.candidate.pageCount
  const wordCount = input.candidate.wordCount
  const checksum = input.derivedChecksum ?? input.originalChecksum ?? stableChecksum({ candidate: input.candidate.id, url: submissionUrl, pages: selectedPages, projects: input.selectedProjects ?? [], transformations })
  const qualityGate = validateWorkSampleSubmission({
    requirement: input.requirement, candidate: input.candidate, filename, applicantName: input.applicantName,
    originalChecksum: input.originalChecksum, checksum, sizeBytes: input.derivedSizeBytes ?? input.candidate.fileSizeBytes, pageCount, wordCount, selectedPages,
    anonymized: input.anonymized ?? !input.requirement.anonymizationRequired, applicantNameIncluded: input.applicantNameIncluded ?? !input.requirement.applicantNameRequired,
    substantiveContentChanged: transformations.some(item => item.substantiveContentChanged), securityFindings: input.candidate.inspection.securityFindings,
  })
  return {
    id: `${input.applicationCaseId}:submission:${input.requirement.requirementKey}:${input.candidate.id}`,
    applicationCaseId: input.applicationCaseId, requirementId: input.requirement.id, candidateId: input.candidate.id,
    originalArtifactId: input.originalArtifactId ?? null, derivedArtifactId: null, artifactType: input.requirement.requirementType,
    transformations, selectedPages, selectedProjects: input.selectedProjects ?? [], submissionMethod, submissionUrl, filename,
    sizeBytes: input.derivedSizeBytes ?? input.candidate.fileSizeBytes, pageCount, wordCount, checksum, originalChecksum: input.originalChecksum ?? input.candidate.provenance.checksum,
    approvalState: input.approvalRequired === false ? 'not_required' : 'pending', uploadState: qualityGate.passed ? 'ready' : 'blocked',
    resultingStateEvidence: { portal: null, section: null, sessionId: null, url: submissionUrl, filename: null, checksum: null, sizeBytes: null, readBackValues: {}, confirmation: null, evidenceIds: [] },
    qualityGate,
    provenance: { sourceArtifactId: input.originalArtifactId ?? null, sourceChecksum: input.originalChecksum ?? input.candidate.provenance.checksum, preparationVersion: WORK_SAMPLE_WORKFLOW_VERSION, transformationHistory: transformations, applicationCaseId: input.applicationCaseId },
  }
}

export function verifyWorkSampleUpload(input: WorkSampleUploadVerificationInput) {
  const issues: string[] = []
  if (!input.applicationCaseId || !input.requirementId || !input.submissionId) issues.push('The upload is missing its canonical application, requirement, or submission identity.')
  if (!input.portal || !input.section || !input.sessionId) issues.push('Portal identity, section, and task-owned session are required.')
  if (!input.accepted) issues.push('The portal did not accept the uploaded artifact.')
  if (input.validationWarnings?.length) issues.push(...input.validationWarnings.map(warning => `Portal warning: ${warning}`))
  const submissionMethod = input.submissionMethod ?? 'file_upload'
  if (submissionMethod === 'url') {
    const expectedUrl = input.submissionUrl ?? ''
    const persistedUrl = text(input.persistedValues.url ?? input.persistedValues.href ?? input.persistedValues.value, 2_000)
    const readBackUrl = text(input.readBackValues.url ?? input.readBackValues.href ?? input.readBackValues.value, 2_000)
    if (!isHttpUrl(expectedUrl) || persistedUrl !== expectedUrl || readBackUrl !== expectedUrl) issues.push('The portal URL does not match the verified candidate URL.')
  } else if (!input.filename || input.filename !== text(input.persistedValues.filename ?? input.persistedValues.fileName ?? input.persistedValues.file_name, 500)) {
    issues.push('The portal filename does not match the prepared filename.')
  }
  if (!input.checksum) issues.push('The resulting upload has no artifact checksum.')
  if (JSON.stringify(input.persistedValues) !== JSON.stringify(input.readBackValues)) issues.push('Portal read-back values do not match the persisted upload values.')
  if (input.existingSubmissionIds?.filter(id => id === input.submissionId).length && input.existingSubmissionIds.filter(id => id === input.submissionId).length > 1) issues.push('Duplicate upload evidence was detected.')
  const verified = issues.length === 0 && Boolean(input.confirmation)
  return {
    verified,
    issues,
    evidence: verified ? {
      kind: 'uploaded_file_verification' as const, applicationCaseId: input.applicationCaseId, requirementId: input.requirementId, submissionId: input.submissionId,
      portal: input.portal, section: input.section, sessionId: input.sessionId, filename: input.filename, checksum: input.checksum, sizeBytes: input.sizeBytes,
      url: submissionMethod === 'url' ? input.submissionUrl ?? null : null,
      readBackValues: input.readBackValues, confirmation: input.confirmation,
    } : null,
  }
}

export function buildWorkSampleRequirementGraph(input: { caseId: string; requirements: WorkSampleRequirement[]; submissions?: WorkSampleSubmission[] }): WorkSampleRequirementGraphNode[] {
  const nodes: WorkSampleRequirementGraphNode[] = input.requirements.map(requirement => {
    const submission = input.submissions?.find(item => item.requirementId === requirement.id)
    const status: WorkSampleRequirementGraphNode['status'] = requirement.status === 'not_required' ? 'verified' : requirement.status === 'verified' ? 'verified' : requirement.status === 'submitted' ? 'submitted' : submission?.uploadState === 'verified' ? 'submitted' : submission?.qualityGate.passed ? 'ready' : requirement.status === 'blocked' ? 'blocked' : 'unresolved'
    return {
      id: `${requirement.id}:detect`, requirementId: requirement.id, name: `Detect ${requirement.requirementType.replaceAll('_', ' ').toLocaleLowerCase()} requirement`,
      status,
      dependencyIds: [], evidenceIds: requirement.sourceEvidenceIds, action: 'extract_official_work_sample_requirement',
    }
  })
  return nodes.flatMap(node => [
    node,
    { ...node, id: `${node.requirementId}:candidate`, name: 'Discover, inspect, and rank existing work', dependencyIds: [node.id], action: 'discover_rank_work_sample_candidates' },
    { ...node, id: `${node.requirementId}:prepare`, name: 'Prepare and quality-check exact submission artifact', dependencyIds: [`${node.requirementId}:candidate`], action: 'prepare_work_sample_submission' },
    { ...node, id: `${node.requirementId}:upload`, name: 'Upload, read back, verify, and persist evidence', dependencyIds: [`${node.requirementId}:prepare`], action: 'verify_work_sample_upload' },
  ])
}

export function resolveWorkSampleContext(input: {
  profile?: unknown
  uploadedFiles?: unknown[]
  previousApplications?: unknown[]
  canonicalCv?: unknown
  thesisRecords?: unknown[]
  researchRecords?: unknown[]
  publicationRecords?: unknown[]
  projectRecords?: unknown[]
  previousArtifacts?: unknown[]
  gmailAttachments?: unknown[]
  reusableContext?: unknown
  existingCandidates?: unknown[]
  requirements: WorkSampleRequirement[]
  programme?: string
  selectedCandidateIds?: string[]
  automaticContinuationCount?: number
  interactionCount?: number
}): WorkSampleContextResolution {
  const candidates = discoverWorkSampleCandidates(input)
  const autoResolvedFacts = [
    candidates.length ? `discovered:${candidates.length} work-sample candidates` : '',
    candidates.some(candidate => candidate.inspection.inspected) ? 'inspected:artifact content' : '',
    candidates.some(candidate => candidate.authorshipEvidence.length) ? 'verified:authorship evidence' : '',
    input.requirements.some(requirement => requirement.sources.length) ? 'verified:official programme rules' : '',
  ].filter(Boolean)
  const unresolved = input.requirements.filter(requirement => requirement.mode !== 'not_applicable').flatMap(requirement => {
    const ranked = rankWorkSampleCandidates({ requirement, candidates, programme: input.programme })
    return ranked.some(candidate => candidate.eligibility === 'eligible') ? [] : [`${requirement.id}:eligible_candidate`]
  })
  const continuation = input.automaticContinuationCount ?? autoResolvedFacts.length
  const interactionCount = input.interactionCount ?? 0
  return {
    version: WORK_SAMPLE_WORKFLOW_VERSION,
    checkedSources: ['ApplicantProfile', 'uploaded files', 'previous ApplicationCases', 'canonical CV', 'thesis records', 'research records', 'publication records', 'project records', 'previous application artifacts', 'Gmail attachments where authorized', 'reusable context'],
    autoResolvedFacts, candidates, reusableContext: { selectedCandidateIds: input.selectedCandidateIds ?? [], candidateIds: candidates.map(candidate => candidate.id) }, unresolved,
    nextInteraction: null, automaticContinuationRate: continuation + interactionCount ? continuation / (continuation + interactionCount) : 1,
  }
}

export function applyWorkSampleInteraction(input: {
  context: WorkSampleContextResolution
  interaction: WorkSampleInteraction
  value: unknown
  reusableContextConsent: boolean
  submittedAt?: string
}): { accepted: boolean; context: WorkSampleContextResolution; metric: WorkSampleInteractionMetric; error?: string } {
  const values = Array.isArray(input.value) ? input.value.map(value => text(value, 160)).filter(Boolean) : [text(input.value, 160)].filter(Boolean)
  const valid = input.interaction.kind === 'approval' || input.interaction.kind === 'confirmation' ? input.value === true || values[0] === 'true' || values[0]?.toLocaleLowerCase() === 'approved' : input.interaction.kind === 'multiple_choice' ? values.length >= (input.interaction.minSelections ?? 1) && values.every(value => input.interaction.options.some(option => option.value === value)) : input.interaction.kind === 'attachment_request' ? values.length > 0 : values.length > 0 && (input.interaction.options.length === 0 || input.interaction.options.some(option => option.value === values[0]))
  if (!valid) return { accepted: false, context: input.context, metric: { interactionId: input.interaction.id, kind: input.interaction.kind, resumedAutomatically: false, reusableContextSaved: false, freeText: input.interaction.kind === 'fact' }, error: 'The response does not match the typed Progress Detail control.' }
  const reusableContext = input.reusableContextConsent && input.interaction.reusableContextKeys.length ? { ...input.context.reusableContext, ...Object.fromEntries(input.interaction.reusableContextKeys.map(key => [key, values.length > 1 ? values : values[0]])) } : input.context.reusableContext
  return {
    accepted: true,
    context: { ...input.context, reusableContext, unresolved: input.context.unresolved.filter(item => item !== input.interaction.requirementId), nextInteraction: null, automaticContinuationRate: 1 },
    metric: { interactionId: input.interaction.id, kind: input.interaction.kind, resumedAutomatically: true, reusableContextSaved: input.reusableContextConsent && input.interaction.reusableContextKeys.length > 0, freeText: input.interaction.kind === 'fact' },
  }
}

export function workSampleMetricsSummary(metrics: WorkSampleInteractionMetric[]) {
  const byKind = Object.fromEntries(workSampleInteractionKinds.map(kind => [kind, metrics.filter(metric => metric.kind === kind).length]))
  return {
    interactions: metrics.length, questionsByKind: byKind, broadFreeTextQuestions: metrics.filter(metric => metric.freeText).length,
    automaticContinuations: metrics.filter(metric => metric.resumedAutomatically).length,
    automaticContinuationRate: metrics.length ? metrics.filter(metric => metric.resumedAutomatically).length / metrics.length : 1,
    reusableContextSaves: metrics.filter(metric => metric.reusableContextSaved).length,
  }
}

export const workSampleInteractionKinds = ['approval', 'single_choice', 'multiple_choice', 'attachment_request', 'fact', 'confirmation'] as const

export function workSampleCompletionEvidence(input: {
  requirement: WorkSampleRequirement
  submission: WorkSampleSubmission
  portalVerification: ReturnType<typeof verifyWorkSampleUpload> | null
  applicantAuthorshipVerified: boolean
  userResponsesResumed: boolean
}) {
  const defects: string[] = []
  if (input.requirement.mode !== 'not_applicable' && !input.applicantAuthorshipVerified) defects.push('authorship_unverified')
  if (!input.submission.qualityGate.passed) defects.push('quality_gate_failed')
  if (!input.portalVerification?.verified) defects.push('portal_upload_unverified')
  if (input.submission.checksum !== input.portalVerification?.evidence?.checksum) defects.push('checksum_mismatch')
  if (!input.userResponsesResumed) defects.push('user_response_did_not_resume')
  return { complete: defects.length === 0, defects }
}
