/** One-call, provider-neutral faculty intelligence and outreach resolution. */

import { applicationEmailTextFromHtml, type EmailActionPackage } from './application-email.ts'
import {
  FACULTY_CONTACT_POLICY_VALUES,
  normalizeFacultyContactPolicy,
  normalizeFacultyContactPolicyClassification,
  type FacultyContactPolicy as ProgrammeFacultyContactPolicyValue,
  type ProgrammeFacultyContactPolicy,
} from './application-programme-discovery.ts'

export const FACULTY_OUTREACH_RESOLUTION_VERSION = 'faculty-outreach-resolution@1' as const
// Bump this whenever the deterministic fit/email policy changes. Persisted
// batches are refreshed instead of silently keeping scores produced by the
// previous policy.
// Bump when deterministic presentation or evidence rules change so persisted
// faculty dossiers are refreshed instead of silently retaining stale output.
export const FACULTY_RESULT_CONTRACT_VERSION = 'verified-faculty-match@5' as const
export type FacultyResearchPurpose = 'application_context' | 'outreach'
export type FacultyOutreachRecommendation = 'required' | 'strongly_recommended' | 'recommended' | 'optional' | 'skip'
export type FacultyIdentityVerification = 'official_verified' | 'uncertain'
/** Faculty-level decisions consume the programme-level policy. Legacy labels
 * are accepted on read so old persisted packages can be repaired safely, but
 * all new decisions normalize to the six factual programme semantics. */
export type FacultyContactPolicy = ProgrammeFacultyContactPolicyValue | 'strongly_recommended' | 'optional' | 'irrelevant' | 'unknown'
export type FacultyDraftRecommendation = 'required' | 'useful' | 'skip'
export type FacultySendRecommendation = 'required_after_approval' | 'user_choice' | 'skip'

export type FacultyResolutionSource = {
  sourceKey: string
  url: string
  type: 'faculty_profile' | 'directory' | 'lab' | 'research' | 'publication'
  excerpt: string
}

export type FacultyResolutionEmailAction = Omit<EmailActionPackage,
  'schemaVersion' | 'workflowVersion' | 'emailType' | 'recipientEmail'>

export type FacultyOutreachResolutionPackage = {
  version: typeof FACULTY_OUTREACH_RESOLUTION_VERSION
  resultContractVersion: typeof FACULTY_RESULT_CONTRACT_VERSION
  applicationCaseId: string
  programmeId: string
  strategyId: string
  strategyRevision: number
  purpose: FacultyResearchPurpose
  cvArtifactId: string | null
  cvChecksum: string | null
  /** A bounded policy repair may refresh the programme-level result without
   * making every faculty row responsible for repeating the same rule. */
  programmeContactPolicy?: ProgrammeFacultyContactPolicyValue
  programmeContactPolicyDetails?: ProgrammeFacultyContactPolicy | null
  faculty: Array<{
    facultyId: string
    name: string
    title: string | null
    department: string | null
    identityVerification: FacultyIdentityVerification
    identityEvidence: {
      name: string
      institution: string
      department: string | null
      title: string | null
      officialProfileUrl: string
      identitySourceUrl: string
      currentAffiliation: 'verified' | 'uncertain'
      retrievedAt: string
    }
    officialProfileUrl: string
    labUrl: string | null
    email: string | null
    emailSourceKey: string | null
    emailSourceUrl: string | null
    emailVerification: 'official_source_supplied' | 'missing'
    researchDomain: string
    researchSubdomains: string[]
    researchSummary: string
    researchThemes: string[]
    relevantCurrentWork: Array<{ title: string; year: number | null; url: string; relevanceToApplicant: string }>
    applicantFit: {
      score: number
      researchAreaFit: number
      methodsFit: number
      experienceFit: number
      facultySpecificFit: number
      strongestConnections: Array<{ facultySignal: string; applicantEvidenceId: string; explanation: string }>
    }
    outreachRecommendation: FacultyOutreachRecommendation
    /** Contact, draft, and send are deliberately separate decisions. Older
     * persisted/model results may omit these and are filled deterministically
     * from the verified pathway at the application boundary. */
    contactPolicy?: FacultyContactPolicy
    draftRecommendation?: FacultyDraftRecommendation
    sendRecommendation?: FacultySendRecommendation
    outreachReason: string
    sources: FacultyResolutionSource[]
    emailAction: FacultyResolutionEmailAction | null
  }>
}

export type FacultyOutreachValidation = {
  valid: boolean
  issues: string[]
  repairReason: string | null
}

type ValidationContext = {
  applicationCaseId: string
  programmeId: string
  strategyId: string
  strategyRevision: number
  purpose: FacultyResearchPurpose
  facultySeeds: Array<{ facultyId: string; name: string }>
  facultyDiscoveryRequired?: boolean
  applicantEvidenceIds: string[]
  programmeEvidenceIds: string[]
  outreachPermitted: boolean
  cvArtifactId: string | null
  cvChecksum: string | null
  maxWords?: number
  isApprovedInstitutionalUrl: (url: string) => boolean
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clean(value: unknown, maximum = 30_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function canonicalEmail(value: unknown) {
  const email = clean(value, 320).toLocaleLowerCase()
  return emailPattern.test(email) ? email : ''
}

/**
 * Return an address that is explicitly present in a source excerpt. This
 * supports the common institutional presentation `name[at]example.edu` (and
 * its parenthesized/braced equivalent) without ever deriving an address from
 * a person's name or institution. A normal `name@example.edu` is handled by
 * the same source-bound parser.
 */
export function extractExplicitEmailFromSource(value: unknown) {
  const excerpt = clean(value, 4_000)
  const direct = excerpt.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]
  if (direct) return canonicalEmail(direct)
  const obfuscated = excerpt.match(/\b([A-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\{at\})\s*([A-Z0-9.-]+\.[A-Z]{2,})\b/i)
  if (obfuscated) return canonicalEmail(`${obfuscated[1]}@${obfuscated[2]}`)
  return ''
}

function sourceSupportsEmail(excerpt: unknown, email: string) {
  return extractExplicitEmailFromSource(excerpt) === canonicalEmail(email)
}

function words(value: string) {
  return clean(value).split(/\s+/).filter(Boolean).length
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

export function facultyOutreachResolutionPurpose(policy: string): FacultyResearchPurpose {
  // Neutral and insufficient-evidence pathways may prepare an internal draft,
  // but never authorize a send. Explicitly discouraged/prohibited pathways
  // remain research-only.
  const raw = String(policy ?? '').trim().toLocaleLowerCase()
  const normalized = normalizeFacultyContactPolicyClassification(policy)
  return raw === 'irrelevant' || ['discouraged', 'prohibited'].includes(normalized) ? 'application_context' : 'outreach'
}

function canonicalContactPolicy(value: unknown): ProgrammeFacultyContactPolicyValue {
  return normalizeFacultyContactPolicyClassification(value)
}

export function deriveFacultyContactDecisions(input: {
  purpose: FacultyResearchPurpose
  outreachPermitted: boolean
  recommendation: FacultyOutreachRecommendation
  emailAction?: FacultyResolutionEmailAction | null
  contactPolicy?: FacultyContactPolicy
  draftRecommendation?: FacultyDraftRecommendation
  sendRecommendation?: FacultySendRecommendation
}) {
  const contactPolicy: ProgrammeFacultyContactPolicyValue = canonicalContactPolicy(input.contactPolicy ?? (
    input.purpose === 'application_context' || !input.outreachPermitted
      ? 'prohibited'
      : input.recommendation === 'required' || input.recommendation === 'strongly_recommended'
        ? 'required'
        : input.recommendation === 'recommended'
          ? 'recommended'
          : input.recommendation === 'optional' ? 'allowed_or_neutral' : 'unknown_due_to_insufficient_evidence'
  ))
  const draftRecommendation: FacultyDraftRecommendation = input.draftRecommendation ?? (
    input.emailAction && contactPolicy !== 'unknown_due_to_insufficient_evidence' && !['discouraged', 'prohibited'].includes(contactPolicy)
      ? (contactPolicy === 'required' ? 'required' : 'useful')
      : 'skip'
  )
  const sendRecommendation: FacultySendRecommendation = input.sendRecommendation ?? (
    contactPolicy === 'required' ? 'required_after_approval' : ['prohibited', 'discouraged', 'unknown_due_to_insufficient_evidence'].includes(contactPolicy) || draftRecommendation === 'skip' ? 'skip' : 'user_choice'
  )
  return { contactPolicy, draftRecommendation, sendRecommendation }
}

/**
 * Return at most three deterministic, source-backed faculty drafts. The
 * resolution may contain more useful contacts for ranking, but the outreach
 * lane must stay small enough for a human to review and choose from.
 */
export function selectFacultyDraftCandidates(
  faculty: FacultyOutreachResolutionPackage['faculty'],
  context: Pick<ValidationContext, 'purpose' | 'outreachPermitted'>,
) {
  const isStrongSpecificMatch = (candidate: FacultyOutreachResolutionPackage['faculty'][number]) => {
    const fit = candidate.applicantFit
    if (fit.score < 70 || fit.researchAreaFit < 65 || fit.facultySpecificFit < 45 || !fit.strongestConnections.length) return false
    const connectionText = fit.strongestConnections.map(connection => `${connection.facultySignal} ${connection.explanation}`).join(' ')
    return !(/\b(?:hpc|python|numerical methods?|generic computation|scientific computing|computational skills?)\b/i.test(connectionText) &&
      !/\b(?:research|quantum|matter|materials?|particle|condensed|atomic|molecular|optical|astrophys|cosmolog|control|information|many[- ]body|nonequilibrium|topolog|experimental)\b/i.test(connectionText))
  }
  const decisionsFor = (candidate: FacultyOutreachResolutionPackage['faculty'][number]) => deriveFacultyContactDecisions({
    purpose: context.purpose,
    outreachPermitted: context.outreachPermitted,
    recommendation: candidate.outreachRecommendation,
    emailAction: candidate.emailAction,
    contactPolicy: candidate.contactPolicy,
    draftRecommendation: candidate.draftRecommendation,
    sendRecommendation: candidate.sendRecommendation,
  })
  return [...faculty]
    .filter(candidate => {
      const decisions = decisionsFor(candidate)
      const strongMatchRequired = decisions.contactPolicy !== 'required'
      return Boolean(candidate.emailAction && candidate.emailVerification === 'official_source_supplied' && candidate.email && decisions.draftRecommendation !== 'skip' && !['discouraged', 'prohibited', 'unknown_due_to_insufficient_evidence'].includes(decisions.contactPolicy) && (!strongMatchRequired || isStrongSpecificMatch(candidate)))
    })
    .sort((left, right) => (
      right.applicantFit.score - left.applicantFit.score ||
      right.applicantFit.researchAreaFit - left.applicantFit.researchAreaFit ||
      right.applicantFit.facultySpecificFit - left.applicantFit.facultySpecificFit ||
      left.name.localeCompare(right.name)
    ))
    .slice(0, 3)
}

/** Calculate the user-facing percentage from semantic fit dimensions. The
 * model supplies the dimensions; this deterministic function owns the final
 * score so a bare model number can never drift from its explanation. */
export function calculateFacultyFitScore(input: {
  researchAreaFit: number
  methodsFit: number
  experienceFit: number
  facultySpecificFit: number
}) {
  const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const research = clamp(input.researchAreaFit)
  const weighted = research * 0.35 +
    clamp(input.facultySpecificFit) * 0.30 +
    clamp(input.experienceFit) * 0.20 +
    clamp(input.methodsFit) * 0.15
  // A strong methods score is supporting evidence, not a substitute for a
  // weak research-direction match. Keep a weak-area match from becoming an
  // apparently excellent academic fit merely because the applicant has
  // generic computational skills.
  const researchCeiling = research < 60 ? 55 + research * 0.2 : 100
  return Math.round(Math.min(weighted, researchCeiling))
}

/** Models sometimes express an otherwise valid fit score as a 0–1 ratio.
 * Canonical persistence uses a 0–100 percentage; normalize that mechanical
 * representation before validation rather than spending the one repair on it. */
export function normalizeFacultyOutreachResolutionScores(packageValue: FacultyOutreachResolutionPackage) {
  if (packageValue.programmeContactPolicyDetails) {
    const details = packageValue.programmeContactPolicyDetails
    const normalizedDetails = normalizeFacultyContactPolicy(details)
    if (normalizedDetails) {
      packageValue.programmeContactPolicyDetails = normalizedDetails
      packageValue.programmeContactPolicy = normalizedDetails.classification
    }
  } else if (packageValue.programmeContactPolicy !== undefined) {
    packageValue.programmeContactPolicy = canonicalContactPolicy(packageValue.programmeContactPolicy)
  }
  for (const faculty of packageValue.faculty ?? []) {
    if (faculty.contactPolicy !== undefined) faculty.contactPolicy = canonicalContactPolicy(faculty.contactPolicy)
    const declaredEmailSource = faculty.emailSourceKey
      ? (faculty.sources ?? []).find(source => source.sourceKey === faculty.emailSourceKey)
      : null
    const declaredEmailIsSourceBacked = Boolean(
      faculty.emailVerification === 'official_source_supplied' &&
      canonicalEmail(faculty.email) &&
      declaredEmailSource &&
      ['faculty_profile', 'directory', 'lab'].includes(declaredEmailSource.type) &&
      sourceSupportsEmail(declaredEmailSource.excerpt, canonicalEmail(faculty.email)),
    )
    if (!declaredEmailIsSourceBacked) {
      const emailSource = (faculty.sources ?? []).find(source =>
        ['faculty_profile', 'directory', 'lab'].includes(source.type) && Boolean(extractExplicitEmailFromSource(source.excerpt)),
      )
      const explicitEmail = emailSource ? extractExplicitEmailFromSource(emailSource.excerpt) : ''
      if (emailSource && explicitEmail) {
        faculty.email = explicitEmail
        faculty.emailSourceKey = emailSource.sourceKey
        faculty.emailSourceUrl = emailSource.url
        faculty.emailVerification = 'official_source_supplied'
      }
    }
    // A model may select a strong research match for outreach while the
    // targeted official-email search returns no exact address. That is a
    // valid research result, not a reason to reject the entire batch or to
    // invent contact data. Deterministically close only the unsafe outreach
    // path; the verified identity, ranking, and policy evidence remain useful
    // in the application case for later review.
    const normalizedEmailSource = faculty.emailSourceKey
      ? (faculty.sources ?? []).find(source => source.sourceKey === faculty.emailSourceKey)
      : null
    const normalizedEmailIsSourceBacked = Boolean(
      faculty.emailVerification === 'official_source_supplied' &&
      canonicalEmail(faculty.email) &&
      normalizedEmailSource &&
      ['faculty_profile', 'directory', 'lab'].includes(normalizedEmailSource.type) &&
      sourceSupportsEmail(normalizedEmailSource.excerpt, canonicalEmail(faculty.email)),
    )
    if (!normalizedEmailIsSourceBacked) {
      faculty.email = null
      faculty.emailSourceKey = null
      faculty.emailSourceUrl = null
      faculty.emailVerification = 'missing'
      faculty.emailAction = null
      faculty.outreachRecommendation = 'skip'
      faculty.draftRecommendation = 'skip'
      faculty.sendRecommendation = 'skip'
    }
    const fit = faculty.applicantFit
    for (const key of ['score', 'researchAreaFit', 'methodsFit', 'experienceFit', 'facultySpecificFit'] as const) {
      const score = Number(fit?.[key])
      if (Number.isFinite(score) && score > 0 && score <= 1) fit[key] = Math.round(score * 10_000) / 100
    }
    fit.score = calculateFacultyFitScore(fit)
  }
  return packageValue
}

/** Only these records may enter the user-facing ranked faculty list. */
export function trustedFacultyFromResolution(packageValue: FacultyOutreachResolutionPackage) {
  return packageValue.faculty
    .filter(faculty => faculty.identityVerification === 'official_verified' && faculty.identityEvidence.currentAffiliation === 'verified')
    .sort((left, right) => {
      const score = right.applicantFit.score - left.applicantFit.score
      if (score) return score
      const research = right.applicantFit.researchAreaFit - left.applicantFit.researchAreaFit
      if (research) return research
      const facultySpecific = right.applicantFit.facultySpecificFit - left.applicantFit.facultySpecificFit
      if (facultySpecific) return facultySpecific
      return left.name.localeCompare(right.name)
    })
}

export function validateFacultyOutreachResolution(
  packageValue: FacultyOutreachResolutionPackage,
  context: ValidationContext,
): FacultyOutreachValidation {
  // Normalize source-explicit addresses before checking the contract. This is
  // still deterministic validation of the same faculty pass, not another
  // research call.
  normalizeFacultyOutreachResolutionScores(packageValue)
  const issues: string[] = []
  if (packageValue.version !== FACULTY_OUTREACH_RESOLUTION_VERSION) issues.push('The faculty resolution version is unsupported.')
  if (packageValue.resultContractVersion !== FACULTY_RESULT_CONTRACT_VERSION) issues.push('The faculty result contract is stale; identity, research, and fit details must be refreshed.')
  if (packageValue.applicationCaseId !== context.applicationCaseId) issues.push('The faculty resolution belongs to a different application case.')
  if (packageValue.programmeId !== context.programmeId) issues.push('The faculty resolution belongs to a different programme.')
  if (packageValue.strategyId !== context.strategyId || packageValue.strategyRevision !== context.strategyRevision) issues.push('The faculty resolution uses a stale admission strategy.')
  if (packageValue.purpose !== context.purpose) issues.push('The faculty resolution purpose does not match the verified pathway.')
  if (packageValue.cvArtifactId !== context.cvArtifactId || packageValue.cvChecksum !== context.cvChecksum) issues.push('The faculty resolution does not reference the current CV state.')
  const seeds = new Map(context.facultySeeds.map(seed => [seed.facultyId, seed.name.toLocaleLowerCase()]))
  const allowedApplicantEvidence = new Set(context.applicantEvidenceIds)
  const allowedProgrammeEvidence = new Set(context.programmeEvidenceIds)
  const seen = new Set<string>()
  if (context.facultyDiscoveryRequired && !packageValue.faculty.length) {
    issues.push('The selected research programme has no verified faculty result; discover at least one current faculty member from an official institutional profile.')
  }
  for (const faculty of packageValue.faculty) {
    if (seen.has(faculty.facultyId)) issues.push(`Faculty ${faculty.facultyId} appears more than once.`)
    seen.add(faculty.facultyId)
    const seedName = seeds.get(faculty.facultyId)
    if (seedName && seedName !== clean(faculty.name, 240).toLocaleLowerCase()) issues.push(`Faculty ${faculty.facultyId} does not match the verified candidate name.`)
    if (seeds.size && !seedName) issues.push(`Faculty ${faculty.facultyId} was not in the verified candidate set.`)
    if (!seeds.size && context.facultyDiscoveryRequired && !faculty.facultyId.startsWith(`faculty:${context.programmeId}:`)) issues.push(`Faculty ${faculty.facultyId} does not use the deterministic discovered-faculty identity.`)
    if (!/^https:\/\//i.test(faculty.officialProfileUrl)) issues.push(`${faculty.name} has an invalid official profile URL.`)
    if (!['official_verified', 'uncertain'].includes(faculty.identityVerification)) issues.push(`${faculty.name} has an invalid identity verification state.`)
    const identity = faculty.identityEvidence
    if (!identity || identity.name !== faculty.name || identity.officialProfileUrl !== faculty.officialProfileUrl || !clean(identity.identitySourceUrl, 2_000) || !clean(identity.retrievedAt, 100)) {
      issues.push(`${faculty.name} has incomplete identity evidence.`)
    }
    if (faculty.identityVerification === 'official_verified') {
      if (identity.currentAffiliation !== 'verified' || !context.isApprovedInstitutionalUrl(faculty.officialProfileUrl) || !context.isApprovedInstitutionalUrl(identity.identitySourceUrl)) issues.push(`${faculty.name} is marked verified without a current official institutional identity.`)
    } else if (identity.currentAffiliation !== 'uncertain') {
      issues.push(`${faculty.name} must mark an unresolved current affiliation as uncertain.`)
    }
    const sourceByKey = new Map(faculty.sources.map(source => [source.sourceKey, source]))
    if (sourceByKey.size !== faculty.sources.length) issues.push(`${faculty.name} has duplicate source keys.`)
    const identitySource = faculty.sources.find(source => source.url === identity.identitySourceUrl && ['faculty_profile', 'directory', 'lab'].includes(source.type))
    const surname = faculty.name.split(/\s+/).filter(Boolean).at(-1)?.toLocaleLowerCase() ?? ''
    if (!identitySource || (faculty.identityVerification === 'official_verified' && !context.isApprovedInstitutionalUrl(identitySource.url)) || (faculty.identityVerification === 'official_verified' && surname && !identitySource.excerpt.toLocaleLowerCase().includes(surname))) issues.push(`${faculty.name} identity is not supported by an official profile or directory excerpt.`)
    for (const source of faculty.sources) {
      if (!clean(source.sourceKey, 160) || !/^https:\/\//i.test(source.url) || !clean(source.excerpt, 2_000)) issues.push(`${faculty.name} has an incomplete source.`)
      if (source.type !== 'publication' && !context.isApprovedInstitutionalUrl(source.url)) issues.push(`${faculty.name} has a non-institutional ${source.type} source.`)
    }
    const email = canonicalEmail(faculty.email)
    if (faculty.emailVerification === 'official_source_supplied') {
      const emailSource = faculty.emailSourceKey ? sourceByKey.get(faculty.emailSourceKey) : null
      if (!email || !emailSource || !['faculty_profile', 'directory', 'lab'].includes(emailSource.type) || !context.isApprovedInstitutionalUrl(emailSource.url) || !sourceSupportsEmail(emailSource.excerpt, email) || faculty.emailSourceUrl !== emailSource.url) issues.push(`${faculty.name} email is not shown in an approved official source excerpt.`)
    } else if (faculty.email !== null || faculty.emailSourceKey !== null || faculty.emailSourceUrl !== null) issues.push(`${faculty.name} must keep email null when no official source supplies it.`)
    if (!clean(faculty.researchDomain, 240) || !clean(faculty.researchSummary, 3_000)) issues.push(`${faculty.name} is missing a research domain or summary.`)
    if (faculty.researchSubdomains.some(item => !clean(item, 240))) issues.push(`${faculty.name} has an empty research subdomain.`)
    const researchSources = faculty.sources.filter(source => ['faculty_profile', 'directory', 'lab', 'research', 'publication'].includes(source.type))
    if (faculty.identityVerification === 'official_verified' && !researchSources.some(source => ['faculty_profile', 'directory', 'lab', 'research'].includes(source.type))) issues.push(`${faculty.name} has no official research source.`)
    for (const connection of faculty.applicantFit.strongestConnections) {
      if (!allowedApplicantEvidence.has(connection.applicantEvidenceId)) issues.push(`${faculty.name} cites unknown applicant evidence ${connection.applicantEvidenceId}.`)
      if (!clean(connection.facultySignal, 1_000) || !clean(connection.explanation, 2_000)) issues.push(`${faculty.name} has an incomplete applicant-fit connection.`)
    }
    const connectionText = faculty.applicantFit.strongestConnections.map(connection => `${connection.facultySignal} ${connection.explanation}`).join(' ')
    const genericMethodsOnly = faculty.applicantFit.strongestConnections.length > 0 &&
      faculty.applicantFit.strongestConnections.every(connection => /\b(?:hpc|python|numerical methods?|generic computation|scientific computing|computational skills?)\b/i.test(`${connection.facultySignal} ${connection.explanation}`)) &&
      !/\b(?:research|quantum|matter|materials?|particle|condensed|atomic|molecular|optical|astrophys|cosmolog|control|information|many[- ]body|nonequilibrium|topolog|experimental)\b/i.test(connectionText)
    if (faculty.identityVerification === 'official_verified' && genericMethodsOnly) issues.push(`${faculty.name} needs a research-direction applicant-fit connection; generic methods alone are not sufficient.`)
    for (const [label, score] of Object.entries({ researchAreaFit: faculty.applicantFit.researchAreaFit, methodsFit: faculty.applicantFit.methodsFit, experienceFit: faculty.applicantFit.experienceFit, facultySpecificFit: faculty.applicantFit.facultySpecificFit, score: faculty.applicantFit.score })) {
      if (!Number.isFinite(score) || score < 0 || score > 100) issues.push(`${faculty.name} has an invalid ${label} applicant-fit score.`)
    }
    if (faculty.identityVerification === 'official_verified' && faculty.applicantFit.strongestConnections.length === 0) issues.push(`${faculty.name} has no provenance-backed applicant-fit connection.`)
    const outreachSelected = !['skip'].includes(faculty.outreachRecommendation)
    const contactPolicy = canonicalContactPolicy(faculty.contactPolicy ?? (context.purpose === 'application_context' || !context.outreachPermitted ? 'prohibited' : faculty.outreachRecommendation === 'required' || faculty.outreachRecommendation === 'strongly_recommended' ? 'required' : faculty.outreachRecommendation === 'recommended' ? 'recommended' : faculty.outreachRecommendation === 'optional' ? 'allowed_or_neutral' : 'unknown_due_to_insufficient_evidence'))
    const draftRecommendation = faculty.draftRecommendation ?? (faculty.emailAction ? (contactPolicy === 'required' ? 'required' : 'useful') : 'skip')
    const sendRecommendation = faculty.sendRecommendation ?? (contactPolicy === 'required' ? 'required_after_approval' : contactPolicy === 'prohibited' || draftRecommendation === 'skip' ? 'skip' : 'user_choice')
    if (context.purpose === 'application_context' && (contactPolicy !== 'prohibited' || draftRecommendation !== 'skip' || sendRecommendation !== 'skip')) issues.push(`${faculty.name} contact/draft/send policy conflicts with the application-context pathway.`)
    if (['prohibited', 'discouraged', 'unknown_due_to_insufficient_evidence'].includes(contactPolicy) && (draftRecommendation !== 'skip' || sendRecommendation !== 'skip')) issues.push(`${faculty.name} cannot have a draft or send recommendation while the programme contact policy is ${contactPolicy}.`)
    if (draftRecommendation === 'skip' && faculty.emailAction) issues.push(`${faculty.name} has an email even though the draft recommendation is skip.`)
    if ((!context.outreachPermitted || context.purpose === 'application_context') && outreachSelected) issues.push(`${faculty.name} outreach conflicts with the verified application pathway.`)
    if (!outreachSelected && faculty.emailAction) issues.push(`${faculty.name} has an email even though outreach was skipped.`)
    if (outreachSelected && context.purpose === 'outreach') {
      if (!email || faculty.emailVerification !== 'official_source_supplied') {
        if (faculty.emailAction) issues.push(`${faculty.name} cannot receive an email without an official verified address.`)
      } else if (!faculty.emailAction) issues.push(`${faculty.name} was selected for outreach but has no final email action.`)
    }
    if (faculty.emailAction) {
      const action = faculty.emailAction
      if (!clean(action.subject, 998) || !clean(action.textBody) || !clean(action.htmlBody)) issues.push(`${faculty.name} email is missing its subject or body.`)
      if (applicationEmailTextFromHtml(action.htmlBody) !== clean(action.textBody)) issues.push(`${faculty.name} HTML and plain-text email bodies differ.`)
      if (words(action.textBody) > (context.maxWords ?? 220)) issues.push(`${faculty.name} email exceeds the word limit.`)
      if (!Object.values(action.quality ?? {}).every(Boolean) || Object.keys(action.quality ?? {}).length !== 5) issues.push(`${faculty.name} email did not pass the semantic quality rubric.`)
      const permittedEvidence = new Set([...sourceByKey.keys(), ...allowedApplicantEvidence, ...allowedProgrammeEvidence])
      for (const claim of action.claims ?? []) {
        if (!clean(claim.claim, 2_000) || !claim.evidenceIds.length || claim.evidenceIds.some(id => !permittedEvidence.has(id))) issues.push(`${faculty.name} email contains an unsupported claim mapping.`)
      }
      const attachments = action.attachmentArtifactIds ?? []
      if (context.cvArtifactId && (attachments.length !== 1 || attachments[0] !== context.cvArtifactId)) issues.push(`${faculty.name} email does not reference the exact current CV artifact.`)
      if (!context.cvArtifactId && attachments.length) issues.push(`${faculty.name} email references a CV artifact that is not ready.`)
    }
  }
  for (const facultyId of seeds.keys()) {
    if (!seen.has(facultyId)) issues.push(`Verified faculty seed ${facultyId} is missing from the batch result.`)
  }
  const normalized = unique(issues)
  return {
    valid: normalized.length === 0,
    issues: normalized,
    repairReason: normalized.length ? `Repair this faculty package once without repeating valid research: ${normalized.join(' ')}` : null,
  }
}

export const facultyOutreachResolutionSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    version: { type: 'string', enum: [FACULTY_OUTREACH_RESOLUTION_VERSION] },
    resultContractVersion: { type: 'string', enum: [FACULTY_RESULT_CONTRACT_VERSION] },
    applicationCaseId: { type: 'string', maxLength: 80 },
    programmeId: { type: 'string', maxLength: 80 },
    strategyId: { type: 'string', maxLength: 160 },
    strategyRevision: { type: 'integer', minimum: 1, maximum: 1_000 },
    purpose: { type: 'string', enum: ['application_context', 'outreach'] },
    cvArtifactId: { type: ['string', 'null'], maxLength: 80 },
    cvChecksum: { type: ['string', 'null'], maxLength: 128 },
    programmeContactPolicy: { type: 'string', enum: [...FACULTY_CONTACT_POLICY_VALUES] },
    programmeContactPolicyDetails: { type: ['object', 'null'], additionalProperties: false, properties: {
      classification: { type: 'string', enum: [...FACULTY_CONTACT_POLICY_VALUES] },
      explanation: { type: 'string', maxLength: 2_000 },
      evidence: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, properties: { url: { type: 'string', maxLength: 2_000 }, relevantTextSummary: { type: 'string', maxLength: 1_200 } }, required: ['url', 'relevantTextSummary'] } },
      searchedSources: { type: 'array', maxItems: 24, items: { type: 'string', maxLength: 2_000 } },
      explicitRuleFound: { type: 'boolean' },
      retrievedAt: { type: ['string', 'null'], maxLength: 100 },
      cycle: { type: ['string', 'null'], maxLength: 120 },
    }, required: ['classification', 'explanation', 'evidence', 'searchedSources', 'explicitRuleFound', 'retrievedAt', 'cycle'] },
    faculty: { type: 'array', maxItems: 12, items: {
      type: 'object', additionalProperties: false,
      properties: {
        facultyId: { type: 'string', maxLength: 160 }, name: { type: 'string', maxLength: 240 }, title: { type: ['string', 'null'], maxLength: 240 }, department: { type: ['string', 'null'], maxLength: 240 },
        identityVerification: { type: 'string', enum: ['official_verified', 'uncertain'] },
        identityEvidence: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', maxLength: 240 }, institution: { type: 'string', maxLength: 500 }, department: { type: ['string', 'null'], maxLength: 240 }, title: { type: ['string', 'null'], maxLength: 240 }, officialProfileUrl: { type: 'string', maxLength: 2_000 }, identitySourceUrl: { type: 'string', maxLength: 2_000 }, currentAffiliation: { type: 'string', enum: ['verified', 'uncertain'] }, retrievedAt: { type: 'string', maxLength: 100 } }, required: ['name', 'institution', 'department', 'title', 'officialProfileUrl', 'identitySourceUrl', 'currentAffiliation', 'retrievedAt'] },
        officialProfileUrl: { type: 'string', maxLength: 2_000 }, labUrl: { type: ['string', 'null'], maxLength: 2_000 }, email: { type: ['string', 'null'], maxLength: 320 }, emailSourceKey: { type: ['string', 'null'], maxLength: 160 }, emailSourceUrl: { type: ['string', 'null'], maxLength: 2_000 }, emailVerification: { type: 'string', enum: ['official_source_supplied', 'missing'] },
        researchDomain: { type: 'string', maxLength: 240 }, researchSubdomains: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 240 } }, researchSummary: { type: 'string', maxLength: 3_000 }, researchThemes: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 500 } },
        relevantCurrentWork: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string', maxLength: 500 }, year: { type: ['integer', 'null'], minimum: 1900, maximum: 2200 }, url: { type: 'string', maxLength: 2_000 }, relevanceToApplicant: { type: 'string', maxLength: 1_500 } }, required: ['title', 'year', 'url', 'relevanceToApplicant'] } },
        applicantFit: { type: 'object', additionalProperties: false, properties: { score: { type: 'number', minimum: 0, maximum: 100 }, researchAreaFit: { type: 'number', minimum: 0, maximum: 100 }, methodsFit: { type: 'number', minimum: 0, maximum: 100 }, experienceFit: { type: 'number', minimum: 0, maximum: 100 }, facultySpecificFit: { type: 'number', minimum: 0, maximum: 100 }, strongestConnections: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, properties: { facultySignal: { type: 'string', maxLength: 1_000 }, applicantEvidenceId: { type: 'string', maxLength: 300 }, explanation: { type: 'string', maxLength: 2_000 } }, required: ['facultySignal', 'applicantEvidenceId', 'explanation'] } } }, required: ['score', 'researchAreaFit', 'methodsFit', 'experienceFit', 'facultySpecificFit', 'strongestConnections'] },
        outreachRecommendation: { type: 'string', enum: ['required', 'strongly_recommended', 'recommended', 'optional', 'skip'] },
        contactPolicy: { type: 'string', enum: [...FACULTY_CONTACT_POLICY_VALUES, 'strongly_recommended', 'optional', 'irrelevant', 'unknown'] },
        draftRecommendation: { type: 'string', enum: ['required', 'useful', 'skip'] },
        sendRecommendation: { type: 'string', enum: ['required_after_approval', 'user_choice', 'skip'] },
        outreachReason: { type: 'string', maxLength: 2_000 },
        sources: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'object', additionalProperties: false, properties: { sourceKey: { type: 'string', maxLength: 160 }, url: { type: 'string', maxLength: 2_000 }, type: { type: 'string', enum: ['faculty_profile', 'directory', 'lab', 'research', 'publication'] }, excerpt: { type: 'string', maxLength: 2_000 } }, required: ['sourceKey', 'url', 'type', 'excerpt'] } },
        emailAction: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, properties: {
          subject: { type: 'string', maxLength: 998 }, textBody: { type: 'string', maxLength: 30_000 }, htmlBody: { type: 'string', maxLength: 30_000 }, communicationGoal: { type: 'string', maxLength: 2_000 }, strongestConnection: { type: ['string', 'null'], maxLength: 2_000 }, attachmentArtifactIds: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 80 } },
          claims: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', additionalProperties: false, properties: { claim: { type: 'string', maxLength: 2_000 }, evidenceIds: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string', maxLength: 300 } } }, required: ['claim', 'evidenceIds'] } },
          followUp: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, properties: { recommended: { type: 'boolean' }, afterDays: { type: ['integer', 'null'], minimum: 1, maximum: 90 }, purpose: { type: ['string', 'null'], maxLength: 1_000 } }, required: ['recommended', 'afterDays', 'purpose'] }] },
          applicationImpact: { type: 'null' },
          quality: { type: 'object', additionalProperties: false, properties: { specific: { type: 'boolean' }, concise: { type: 'boolean' }, recipientSpecific: { type: 'boolean' }, programmeSpecific: { type: 'boolean' }, applicantEvidenceUsed: { type: 'boolean' } }, required: ['specific', 'concise', 'recipientSpecific', 'programmeSpecific', 'applicantEvidenceUsed'] },
        }, required: ['subject', 'textBody', 'htmlBody', 'communicationGoal', 'strongestConnection', 'attachmentArtifactIds', 'claims', 'followUp', 'applicationImpact', 'quality'] }] },
      }, required: ['facultyId', 'name', 'title', 'department', 'identityVerification', 'identityEvidence', 'officialProfileUrl', 'labUrl', 'email', 'emailSourceKey', 'emailSourceUrl', 'emailVerification', 'researchDomain', 'researchSubdomains', 'researchSummary', 'researchThemes', 'relevantCurrentWork', 'applicantFit', 'outreachRecommendation', 'contactPolicy', 'draftRecommendation', 'sendRecommendation', 'outreachReason', 'sources', 'emailAction'],
    } },
  }, required: ['version', 'resultContractVersion', 'applicationCaseId', 'programmeId', 'strategyId', 'strategyRevision', 'purpose', 'cvArtifactId', 'cvChecksum', 'programmeContactPolicy', 'programmeContactPolicyDetails', 'faculty'],
} as const
