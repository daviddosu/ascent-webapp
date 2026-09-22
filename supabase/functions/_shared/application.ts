export type ApplicationRequirement = {
  name: string
  required: boolean
  limit?: number
  limitKind?: 'words' | 'characters'
}

export type ApplicationState = {
  institution?: string
  programme?: string
  programmeType?: string
  applicationUrl?: string
  officialSource?: string
  deadline?: string
  funding?: string
  eligibility: string[]
  requirements: ApplicationRequirement[]
  status: 'understanding' | 'checking_requirements' | 'needs_context' | 'preparing' | 'completing' | 'authentication_needed' | 'ready_for_review'
}

export const GRADUATE_APPLICATION_ONLY_CODE = 'graduate_application_only' as const
export const GRADUATE_APPLICATION_ONLY_MESSAGE = 'Describe what you want help with for your graduate-school application.'

export const graduateApplicationTargetKinds = ['programme', 'scholarship'] as const
export type GraduateApplicationTargetKind = typeof graduateApplicationTargetKinds[number]

export type GraduateApplicationClassification = {
  inScope: boolean
  targetKind: GraduateApplicationTargetKind | null
}

const explicitGraduateContext = /\b(?:grad(?:uate)?\s+school|grad(?:uate)?\s+stud(?:y|ies)|postgrad(?:uate)?|phd|dphil|doctoral|doctorate|master'?s?|ma|ms|msc|mres|mphil|mba|mfa|mph|llm|research\s+degree|graduate\s+(?:programme|program|application|admissions?|scholarship|fellowship|studentship|funding))\b/i
const graduateScholarshipProviderAlias = /\bchevening\b/i
const graduateAwardContext = /\b(?:graduate|postgraduate|phd|dphil|doctoral|doctorate|master'?s?|ma|ms|msc|mres|mphil|mba|mfa|mph|llm)\s+(?:scholarships?|fellowships?|studentships?|funding)\b/i
const graduateStudyEvidence = /\b(?:graduate|postgraduate|phd|dphil|doctoral|doctorate|master'?s?|ma|ms|msc|mres|mphil|mba|mfa|mph|llm)\b/i
const directScholarshipTarget = /\b(?:apply|application|submit|complete|prepare)\b[\s\S]{0,80}\b(?:for|to)\s+(?:the\s+|a\s+|an\s+)?[a-z0-9&'’ -]{0,80}\b(?:scholarships?|fellowships?|studentships?)\b/i
const namedScholarshipTarget = /\b(?:apply|application|submit|complete|prepare)\b[\s\S]{0,80}\b(?:for|to)\s+(?:the\s+|a\s+|an\s+)?([a-z0-9][a-z0-9&'’.,() -]{1,80}?)\s+(?:scholarships?|fellowships?|studentships?)\b/i
const programmeTarget = /\b(?:apply|application|submit|complete|prepare)\b[\s\S]{0,80}\b(?:programme|program|course|degree|university|college)\b/i

function hasNamedScholarshipTarget(value: string) {
  const match = value.match(namedScholarshipTarget)
  const name = match?.[1]?.trim().toLocaleLowerCase()
  return Boolean(name && !/^(?:a|an|any|some|graduate|postgraduate|phd|doctoral|master'?s?)$/.test(name))
}

/**
 * Every nonempty request enters graduate-application intake by default.
 * Intake resolves missing targets; acceptance does not select a programme.
 * Communication, research, documents, and
 * browser operations are allowed only as steps inside this graduate-
 * application scope; they are not standalone ShotCount tasks.
 */
export function classifyGraduateApplicationTask(title: string, description = ''): GraduateApplicationClassification {
  const value = `${title} ${description}`.replace(/[’‘]/g, "'").trim()
  if (!value) {
    return { inScope: false, targetKind: null }
  }

  const hasGraduateContext = explicitGraduateContext.test(value)

  const scholarshipTarget = graduateScholarshipProviderAlias.test(value) || graduateAwardContext.test(value) || hasNamedScholarshipTarget(value) ||
    (hasGraduateContext && directScholarshipTarget.test(value) && !programmeTarget.test(value))
  return { inScope: true, targetKind: scholarshipTarget ? 'scholarship' : 'programme' }
}

export function isGraduateApplicationTask(title: string, description = '') {
  return classifyGraduateApplicationTask(title, description).inScope
}

/**
 * A named scholarship is safe to investigate before its level is known, but
 * it becomes executable application truth only when its official evidence
 * identifies graduate study. A provider alias is an explicit exception for a
 * provider whose purpose is unambiguous from the target name.
 */
export function hasGraduateScholarshipEvidence(targetText: string, officialEvidenceText = '') {
  return graduateScholarshipProviderAlias.test(targetText) || graduateStudyEvidence.test(officialEvidenceText)
}

export function isApplicationIntent(title: string, description = '') {
  return isGraduateApplicationTask(title, description)
}

export function preferOfficialSource<T extends { url: string; value: string }>(
  screenshot: T | undefined,
  sources: T[],
  officialDomains: string[],
) {
  const official = sources.find(source => {
    try {
      const host = new URL(source.url).hostname.toLocaleLowerCase()
      return officialDomains.some(domain => host === domain || host.endsWith(`.${domain}`))
    } catch {
      return false
    }
  })
  return official ?? screenshot
}

export function classifyApplicationContext(
  requirements: ApplicationRequirement[],
  assets: Array<{ mimeType: string; reusable: boolean; originalFilename: string }>,
) {
  return requirements.map(requirement => {
    const key = requirement.name.toLocaleLowerCase()
    const available = assets.some(asset => {
      const filename = asset.originalFilename.replace(/[_-]+/g, ' ')
      return (key.includes('cv') && /\b(cv|resume|curriculum)\b/i.test(filename)) ||
        (key.includes('transcript') && /transcript/i.test(filename))
    },
    )
    const canPrepare = /\b(statement|motivation|short answer|cover|email|tailored cv)\b/i.test(requirement.name)
    return { ...requirement, classification: available ? 'available' : canPrepare ? 'can_prepare' : 'needs_user' as const }
  })
}

export function canMarkApplicationReady(
  requirements: Array<ApplicationRequirement & { satisfied: boolean; evidence?: string }>,
  finalSubmissionAttempted: boolean,
) {
  return !finalSubmissionAttempted &&
    requirements.filter(item => item.required).every(item => item.satisfied && Boolean(item.evidence?.trim()))
}

export function groundedClaims(claims: string[], authorisedFacts: string[]) {
  const facts = new Set(authorisedFacts.map(value => value.trim().toLocaleLowerCase()))
  return claims.filter(claim => facts.has(claim.trim().toLocaleLowerCase()))
}
