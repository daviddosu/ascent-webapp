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

export function isApplicationIntent(title: string, description = '') {
  const value = `${title} ${description}`.trim()
  const graduateContext = /\b(?:grad(?:uate)?\s+school|postgraduate|phd|dphil|doctoral|master'?s|msc|university|college|admissions?|transcript|statement\s+of\s+purpose|personal\s+statement|recommendation\s+letters?|referees?|application\s+portal|fee\s+waiver|professors?|supervisors?|faculty|research\s+groups?|labs?)\b/i.test(value)
  const facultyContact = /\b(?:contact|email|message|outreach|ask|follow[ -]?up)\b[\s\S]{0,100}\b(?:professors?|supervisors?|faculty|research groups?|labs?)\b/i.test(value) ||
    /\b(?:professors?|supervisors?|faculty|research groups?|labs?)\b[\s\S]{0,100}\b(?:contact|email|message|outreach|ask|follow[ -]?up)\b/i.test(value)
  return graduateContext && (/\b(?:apply|applications?|admissions?|programmes?|programs?|phds?|dphil|doctorates?|masters?|msc|deadline|requirements?|documents?|research|funding|scholarship)\b/i.test(value) || facultyContact)
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
