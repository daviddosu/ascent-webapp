import type {
  ProgrammeCurrentCycle,
  ProgrammeDiscoveryCandidate,
  ProgrammeFacultyLab,
  ProgrammeEligibility,
} from './application-programme-discovery.ts'

/**
 * The discovery pipeline deliberately keeps model judgement separate from the
 * final score. Models can find and describe evidence; this module owns the
 * bounded, repeatable ranking decision.
 */
export const OPPORTUNITY_DISCOVERY_VERSION = 'staged-opportunity-discovery@1.1.0' as const

export const OPPORTUNITY_SCORE_WEIGHTS = {
  queryRelevance: 0.16,
  academicEligibility: 0.14,
  researchFit: 0.20,
  topicFit: 0.10,
  methodsFit: 0.07,
  facultyFit: 0.14,
  experienceFit: 0.07,
  applicationFeasibility: 0.05,
  evidenceStrength: 0.04,
  sourceConfidence: 0.03,
} as const

export type OpportunityScoreDimension = keyof typeof OPPORTUNITY_SCORE_WEIGHTS

export type OpportunityIntent = {
  rawQuery: string
  degreeLevel: string | null
  institutionNames: string[]
  fields: string[]
  locations: string[]
  constraints: string[]
  breadth: 'institution_wide' | 'field_wide' | 'exact_programme'
  expansionTerms: string[]
}

export type ApplicantEvidence = {
  id: string
  text: string
  source: 'cv' | 'profile'
}

export type ApplicantResearchProfile = {
  version: 'applicant-research-profile@1'
  evidence: ApplicantEvidence[]
  researchAreas: string[]
  methods: string[]
  education: string[]
  experience: string[]
  interests: string[]
  keywords: string[]
  sourceState: 'cv' | 'verified_profile' | 'none'
}

export type OpportunityMatchDimensions = Record<OpportunityScoreDimension, number>

export type OpportunityMatchEvidence = {
  dimension: OpportunityScoreDimension
  applicantEvidence: string
  opportunityEvidence: string
  sourceUrl?: string | null
}

export type OpportunityMatchInput = ProgrammeDiscoveryCandidate & {
  modelDimensions?: Partial<OpportunityMatchDimensions> | null
  modelEvidence?: OpportunityMatchEvidence[]
}

export type RankedOpportunity = ProgrammeDiscoveryCandidate & {
  finalScoreTen: number
  dimensions: OpportunityMatchDimensions
  matchEvidence: OpportunityMatchEvidence[]
}

const STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'are', 'before', 'between', 'build', 'course', 'from', 'have',
  'into', 'more', 'need', 'only', 'over', 'program', 'programme', 'research', 'school', 'should',
  'that', 'their', 'this', 'through', 'university', 'with', 'your', 'for', 'the', 'phd', 'doctorate',
])

const FIELD_NEIGHBOURS: Record<string, string[]> = {
  physics: ['applied physics', 'quantum', 'condensed matter', 'astrophysics', 'particle physics', 'optics', 'atomic molecular optical', 'plasma'],
  engineering: ['systems', 'robotics', 'controls', 'materials', 'electrical engineering', 'mechanical engineering', 'computer engineering'],
  computer: ['computer science', 'machine learning', 'artificial intelligence', 'data science', 'human computer interaction', 'theory'],
  biology: ['molecular biology', 'cell biology', 'neuroscience', 'genomics', 'biophysics', 'bioinformatics', 'systems biology'],
  chemistry: ['chemical physics', 'materials chemistry', 'organic chemistry', 'physical chemistry', 'nanoscience'],
  mathematics: ['applied mathematics', 'statistics', 'mathematical physics', 'optimization', 'computational mathematics'],
}

function clean(value: unknown, maximum = 2_000) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : ''
}

function unique(values: string[], maximum = 30) {
  return [...new Set(values.map(value => clean(value, 240).toLocaleLowerCase()).filter(Boolean))].slice(0, maximum)
}

function tokens(value: string) {
  return unique(value.toLocaleLowerCase().split(/[^a-z0-9+.-]+/).filter(token => token.length > 2 && !STOP_WORDS.has(token)), 120)
}

function stem(value: string) {
  return value.toLocaleLowerCase().replace(/(ing|ed|es|s)$/i, '').slice(0, 12)
}

function overlap(left: string[], right: string[]) {
  const rightTokens = new Set(right.flatMap(tokens).map(stem))
  const leftTokens = unique(left.flatMap(tokens), 200)
  if (!leftTokens.length || !rightTokens.size) return 0
  const hits = leftTokens.filter(token => rightTokens.has(stem(token))).length
  return Math.max(0, Math.min(1, hits / Math.max(2, Math.min(leftTokens.length, 8))))
}

function score(value: number) {
  return Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100) / 100
}

function parseDegreeLevel(text: string) {
  if (/\b(?:ph\.?d\.?|doctor(?:al|ate)|dphil)\b/i.test(text)) return 'PhD'
  if (/\b(?:master(?:s|’s)?|msc|meng|ma)\b/i.test(text)) return 'Master’s'
  if (/\b(?:bachelor(?:s|’s)?|undergraduate|bsc|ba)\b/i.test(text)) return 'Bachelor’s'
  return null
}

function parseInstitutions(text: string) {
  const matches = text.match(/\b(?:[A-Z][A-Za-z&.'-]+\s+){0,5}(?:University|Institute|College|School)\b/g) ?? []
  const named = text.match(/\b(?:Harvard|Stanford|Princeton|Yale|Columbia|Cornell|Duke|Brown|MIT|Caltech|Oxford|Cambridge)\b(?:\s+[A-Za-z]+){0,3}/gi) ?? []
  return unique([...matches, ...named], 8).map(value => value.replace(/\s+(?:PhD|Physics|programme|program)$/i, '').trim())
}

function parseFields(text: string) {
  const fields: string[] = []
  const known = Object.keys(FIELD_NEIGHBOURS)
  for (const field of known) if (new RegExp(`\\b${field}\\b`, 'i').test(text)) fields.push(field)
  const fieldPhrases = text.match(/\b(?:quantum|physics|engineering|biology|chemistry|mathematics|computer science|machine learning|astronomy|astrophysics|neuroscience|materials|controls|robotics|optics|biophysics|data science)\b/gi) ?? []
  return unique([...fields, ...fieldPhrases], 12)
}

function expansionTerms(fields: string[]) {
  return unique(fields.flatMap(field => {
    const key = field.split(' ')[0]
    return [field, ...(FIELD_NEIGHBOURS[key] ?? [])]
  }), 30)
}

export function decomposeOpportunityIntent(input: { objective?: string; query?: string; description?: string }): OpportunityIntent {
  const rawQuery = clean([input.objective, input.query, input.description].filter(Boolean).join('\n'), 8_000)
  const degreeLevel = parseDegreeLevel(rawQuery)
  const fields = parseFields(rawQuery)
  const institutionNames = parseInstitutions(rawQuery)
  const locations = unique((rawQuery.match(/\b(?:United States|USA|US|Canada|United Kingdom|UK|Europe|Australia|Germany|France|Netherlands|Switzerland|online)\b/gi) ?? []), 8)
  const constraints = unique([
    /fund(?:ed|ing|ed)/i.test(rawQuery) ? 'funding' : '',
    /full[- ]?time/i.test(rawQuery) ? 'full-time' : '',
    /deadline|current cycle|next intake/i.test(rawQuery) ? 'current cycle' : '',
  ], 8)
  const exact = Boolean(institutionNames.length && degreeLevel && fields.length && /\b(?:apply|application|programme|program|phd|doctorate|master)\b/i.test(rawQuery))
  return {
    rawQuery,
    degreeLevel,
    institutionNames,
    fields,
    locations,
    constraints,
    breadth: institutionNames.length ? 'institution_wide' : exact ? 'exact_programme' : 'field_wide',
    expansionTerms: expansionTerms(fields),
  }
}

function evidenceLines(text: string, source: ApplicantEvidence['source']) {
  return text.split(/\r?\n+/).map((line, index) => clean(line, 1_000) ? {
    id: `${source}:${index + 1}`,
    text: clean(line, 1_000),
    source,
  } : null).filter((item): item is ApplicantEvidence => Boolean(item)).slice(0, 160)
}

function valuesFromVerifiedFacts(value: unknown): ApplicantEvidence[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const text = clean(row.value ?? row.text ?? row.fact, 1_000)
    return text ? [{ id: clean(row.fact_id ?? row.factId, 240) || `profile:${index + 1}`, text, source: 'profile' as const }] : []
  }).slice(0, 160)
}

export function buildApplicantResearchProfile(input: { cvText?: string; verifiedFacts?: unknown[] }): ApplicantResearchProfile {
  const cvEvidence = evidenceLines(clean(input.cvText, 120_000), 'cv')
  const profileEvidence = valuesFromVerifiedFacts(input.verifiedFacts)
  const evidence = [...cvEvidence, ...profileEvidence]
  const allText = evidence.map(item => item.text).join('\n')
  const researchAreas = parseFields(allText)
  const methods = unique((allText.match(/\b(?:simulation|modelling|modeling|machine learning|deep learning|optimization|optimisation|numerical methods|experimental|spectroscopy|microscopy|quantum control|data analysis|statistical analysis|programming|python|matlab|c\+\+|laboratory|lab work|theoretical|computational)\b/gi) ?? []), 20)
  const education = evidence.filter(item => /education|university|college|degree|master|bachelor|phd|coursework/i.test(item.text)).map(item => item.text).slice(0, 24)
  const experience = evidence.filter(item => /research|project|intern|assistant|lectur|teaching|work|publication|thesis|dissertation/i.test(item.text)).map(item => item.text).slice(0, 40)
  const interests = unique([...researchAreas, ...methods], 24)
  return {
    version: 'applicant-research-profile@1',
    evidence: evidence.slice(0, 180),
    researchAreas,
    methods,
    education,
    experience,
    interests,
    keywords: unique(tokens(allText), 80),
    sourceState: cvEvidence.length ? 'cv' : profileEvidence.length ? 'verified_profile' : 'none',
  }
}

function candidateText(candidate: ProgrammeDiscoveryCandidate) {
  return [
    candidate.institution,
    candidate.programmeTitle,
    candidate.degreeLevel ?? '',
    candidate.location ?? '',
    candidate.routeLabel ?? '',
    candidate.discoveryReason ?? '',
    ...(candidate.researchAreas ?? []),
    ...(candidate.methods ?? []),
    ...candidate.requirementsSummary,
    ...(candidate.facultyLabs ?? []).flatMap(faculty => [faculty.name, faculty.role ?? '', ...faculty.researchAreas, faculty.evidence]),
  ].join(' ')
}

function fallbackDimensions(candidate: ProgrammeDiscoveryCandidate, profile: ApplicantResearchProfile, intent: OpportunityIntent): OpportunityMatchDimensions {
  const text = candidateText(candidate)
  const queryTerms = [...intent.fields, intent.degreeLevel ?? '', ...intent.locations, ...intent.expansionTerms]
  const eligible: ProgrammeEligibility = candidate.eligibility ?? { status: 'unclear', requirements: candidate.requirementsSummary, uncertainties: [], evidence: [] }
  const cycle: ProgrammeCurrentCycle = candidate.currentCycle ?? { intakeYear: null, deadlineStatus: candidate.deadline ? 'confirmed' : 'not_found', notes: [], sourceUrls: [] }
  const facultyText = (candidate.facultyLabs ?? []).flatMap(faculty => [...faculty.researchAreas, faculty.evidence])
  const evidenceStrength = Math.min(1, (candidate.sources.length * 0.18) + (candidate.cvEvidence.length * 0.08) + (eligible.evidence.length * 0.06))
  return {
    queryRelevance: score(overlap(queryTerms, [text])),
    academicEligibility: score(eligible.status === 'verified' ? 0.9 : eligible.status === 'unclear' ? 0.55 : 0.3),
    researchFit: score(overlap(profile.researchAreas, candidate.researchAreas?.length ? candidate.researchAreas : [text])),
    topicFit: score(overlap(intent.fields.length ? intent.fields : intent.expansionTerms, [candidate.researchAreas?.join(' ') ?? '', candidate.programmeTitle, candidate.routeLabel ?? ''])),
    methodsFit: score(profile.methods.length ? overlap(profile.methods, candidate.methods?.length ? candidate.methods : [text]) : 0.45),
    facultyFit: score(facultyText.length ? overlap(profile.researchAreas, facultyText) : 0.35),
    experienceFit: score(profile.experience.length ? overlap(profile.experience, [text]) : profile.sourceState === 'none' ? 0.2 : 0.35),
    applicationFeasibility: score(cycle.deadlineStatus === 'confirmed' ? 0.9 : cycle.deadlineStatus === 'conflicting' ? 0.25 : 0.55),
    evidenceStrength: score(evidenceStrength),
    sourceConfidence: score((candidate.confidence || 0) / 100),
  }
}

function normalizedModelDimensions(candidate: OpportunityMatchInput, fallback: OpportunityMatchDimensions, profile: ApplicantResearchProfile) {
  const dimensions = { ...fallback }
  const applicantEvidenceText = candidate.modelEvidence?.map(item => item.applicantEvidence).join(' ') ?? ''
  const modelEvidenceGrounded = Boolean(
    profile.sourceState !== 'none' &&
    candidate.modelEvidence?.length &&
    applicantEvidenceText &&
    candidate.modelEvidence.some(item => overlap([item.applicantEvidence], profile.evidence.map(evidence => evidence.text)) > 0),
  )
  if (!modelEvidenceGrounded) return dimensions
  for (const key of Object.keys(OPPORTUNITY_SCORE_WEIGHTS) as OpportunityScoreDimension[]) {
    const value = candidate.modelDimensions?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) dimensions[key] = score(value)
  }
  return dimensions
}

function computedScore(dimensions: OpportunityMatchDimensions) {
  return Math.round(Object.entries(OPPORTUNITY_SCORE_WEIGHTS).reduce((total, [key, weight]) => total + dimensions[key as OpportunityScoreDimension] * weight, 0) * 100) / 100
}

function deterministicEvidence(candidate: ProgrammeDiscoveryCandidate, profile: ApplicantResearchProfile, dimensions: OpportunityMatchDimensions): OpportunityMatchEvidence[] {
  const evidence: OpportunityMatchEvidence[] = []
  const sourceUrl = candidate.sources[0]?.url ?? candidate.officialUrl
  if (profile.researchAreas.length && (candidate.researchAreas?.length || candidate.programmeTitle)) evidence.push({ dimension: 'researchFit', applicantEvidence: profile.researchAreas.join(', '), opportunityEvidence: (candidate.researchAreas ?? [candidate.programmeTitle]).join(', '), sourceUrl })
  if (profile.methods.length && candidate.methods?.length) evidence.push({ dimension: 'methodsFit', applicantEvidence: profile.methods.slice(0, 3).join(', '), opportunityEvidence: candidate.methods.slice(0, 3).join(', '), sourceUrl })
  if (candidate.facultyLabs?.length) evidence.push({ dimension: 'facultyFit', applicantEvidence: profile.researchAreas.slice(0, 3).join(', ') || 'Applicant research profile', opportunityEvidence: candidate.facultyLabs.slice(0, 2).map(faculty => faculty.name).join(', '), sourceUrl })
  if (candidate.cvEvidence.length) evidence.push({ dimension: 'experienceFit', applicantEvidence: candidate.cvEvidence[0] ?? 'CV evidence', opportunityEvidence: candidate.fitRationale || candidate.programmeTitle, sourceUrl })
  if (!dimensions.evidenceStrength) evidence.push({ dimension: 'evidenceStrength', applicantEvidence: 'No verified CV evidence supplied', opportunityEvidence: 'Official programme source only', sourceUrl })
  return evidence.slice(0, 8)
}

export function rankOpportunityCandidates(candidates: OpportunityMatchInput[], profile: ApplicantResearchProfile, intent: OpportunityIntent): RankedOpportunity[] {
  return candidates.map(candidate => {
    const fallback = fallbackDimensions(candidate, profile, intent)
    const dimensions = normalizedModelDimensions(candidate, fallback, profile)
    const matchEvidence = [...(candidate.modelEvidence ?? []), ...deterministicEvidence(candidate, profile, dimensions)].slice(0, 10)
    const normalizedScore = profile.sourceState === 'none' ? 0 : computedScore(dimensions)
    return { ...candidate, finalScoreTen: Math.round(normalizedScore * 100) / 10, dimensions, matchEvidence }
  }).sort((left, right) => right.finalScoreTen - left.finalScoreTen || right.confidence - left.confidence || left.institution.localeCompare(right.institution) || left.programmeTitle.localeCompare(right.programmeTitle))
}

export function compactApplicantProfile(profile: ApplicantResearchProfile) {
  return {
    version: profile.version,
    source_state: profile.sourceState,
    research_areas: profile.researchAreas,
    methods: profile.methods,
    education: profile.education.slice(0, 16),
    experience: profile.experience.slice(0, 24),
    evidence: profile.evidence.slice(0, 60),
  }
}
