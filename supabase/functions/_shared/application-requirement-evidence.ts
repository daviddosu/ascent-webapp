import { missingValueOwnerForRequirement } from './application-value-ownership.ts'

type RequirementInput = Record<string, unknown>

function text(value: unknown, maximum = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function requirementName(requirement: RequirementInput) {
  return text(requirement.name ?? requirement.label ?? requirement.title).toLocaleLowerCase()
}

function requirementCategory(requirement: RequirementInput) {
  return text(requirement.category, 120).toLocaleLowerCase()
}

function requirementType(requirement: RequirementInput) {
  return text(requirement.requirement_type ?? requirement.requirementType, 120).toLocaleLowerCase()
}

function responsibleParty(requirement: RequirementInput) {
  return text(requirement.responsible_party ?? requirement.responsibleParty, 120).toLocaleLowerCase()
}

export function isFundingRequirement(requirement: RequirementInput) {
  const name = requirementName(requirement)
  const type = requirementType(requirement)
  return type === 'funding' || /\b(?:fund(?:ing|ed)?|financial support|stipend|assistantship|scholarship)\b/i.test(name)
}

/**
 * Submission-method rules describe where the institution expects the packet
 * to go. They are satisfied by the portal workflow, not by an applicant file
 * or a free-form user answer. Keep them out of applicant-evidence waits.
 */
export function isApplicationSubmissionMethodRequirement(requirement: RequirementInput) {
  const name = requirementName(requirement)
  const type = requirementType(requirement)
  return (!type || type === 'official_requirement' || type === 'portal' || type === 'portal_section' || type === 'portal_field') &&
    /\b(?:application|supporting|supplemental)?\s*(?:materials?|documents?)\s+(?:must be\s+)?submitted electronically\b|\belectronic submission\b|\bmailed materials? (?:are )?not accepted\b/i.test(name)
}

/**
 * An official programme page can establish the institution's rule, but it
 * cannot prove anything about this particular applicant. Keep that line
 * explicit so a policy source never marks a CV, score report, referee, essay,
 * or personal choice complete.
 */
export function requiresApplicantSpecificEvidence(requirement: RequirementInput) {
  // A requirement may be stored with `responsible_party: applicant` because
  // the applicant ultimately submits it, while the unresolved value itself is
  // programme metadata (cycle, fee, deadline, or portal policy).  Ownership
  // of the value is the gate, not the worker or submitter.
  if (missingValueOwnerForRequirement({
    name: requirement.name ?? requirement.label ?? requirement.title,
    type: requirement.requirement_type ?? requirement.requirementType,
    category: requirement.category,
    responsible: requirement.responsible_party ?? requirement.responsibleParty,
    exactInstructions: requirement.exact_instructions ?? requirement.exactInstructions,
    source: requirement.source && typeof requirement.source === 'object' && !Array.isArray(requirement.source) ? requirement.source as Record<string, unknown> : null,
  }) === 'programme') return false
  if (isFundingRequirement(requirement)) return false
  const name = requirementName(requirement)
  const category = requirementCategory(requirement)
  const type = requirementType(requirement)
  const responsible = responsibleParty(requirement)

  if (isApplicationSubmissionMethodRequirement(requirement)) return false

  if (['applicant', 'writer', 'referee'].includes(responsible)) return true
  if (['identity', 'academic', 'test', 'essay', 'reference', 'portfolio'].includes(category)) return true
  if ([
    'document',
    'transcript',
    'degree_certificate',
    'proof_of_graduation',
    'credential_evaluation',
    'english_language_test',
    'admissions_test',
    'academic_evidence',
    'writer',
    'referee',
    'artifact_upload',
    'supplemental_question',
    'portal_field',
    'portal_section',
  ].includes(type)) return true

  return /\b(?:identity|contact details?|personal information|education|academic (?:performance|record|history|standing)|gpa|grades?|transcript|degree|diploma|research (?:experience|background|history)|(?:letters? of )?(?:recommendation|reference)s?|referees?|statement(?: of purpose)?|essay|personal statement|cv|curriculum vitae|r[eé]sum[eé]?|portfolio|work sample|gre|gmat|toefl|ielts|pte|duolingo|english (?:test|score|proficiency)|physics (?:area|field)|research area|field selection|speciali[sz]ation)\b/i.test(name)
}

export function canUseOfficialRequirementEvidence(requirement: RequirementInput) {
  const name = requirementName(requirement)
  if (!name.length || /\b(?:detailed|general|overall|full|all)?\s*(?:admissions?|application)\s+requirements?\b/i.test(name)) return false
  if (requiresApplicantSpecificEvidence(requirement)) return false
  return !/(?:identity|contact details?|education|academic history|research history|employment history|referees?|references?|cv|resume|transcript|degree|statement|essay|personal information|portal|upload|document)/i.test(name)
}

export function fundingCitationSupportsFullFunding(excerpt: string) {
  const value = excerpt.replace(/\s+/g, ' ').trim()
  if (!value) return false
  const mentionsFunding = /\b(?:fund(?:ing|ed)?|financial support|stipend|assistantship|fellowship|scholarship|tuition(?:\s+(?:support|coverage|waiver))?)\b/i.test(value)
  const establishesCoverage = /\b(?:fully? funded|all admitted(?: students)?|every admitted(?: student)?|all doctoral students|guarantee(?:d|s)?|five years?|tuition(?:\s+(?:support|coverage|waiver))?|stipend|assistantship|fellowship)\b/i.test(value)
  return mentionsFunding && establishesCoverage
}

export function officialCitationSupportsRequirement(requirement: RequirementInput, excerpt: string) {
  if (!canUseOfficialRequirementEvidence(requirement)) return false
  const name = requirementName(requirement)
  const value = excerpt.replace(/\s+/g, ' ').trim()
  if (!value) return false
  if (isFundingRequirement(requirement)) return fundingCitationSupportsFullFunding(value)
  if (/\bdeadline\b/.test(name)) return /\b(?:deadline|due date|applications? (?:are )?due|close[sd]?)\b/i.test(value)
  const ignored = new Set(['application', 'applications', 'admission', 'admissions', 'requirement', 'requirements', 'official', 'programme', 'program', 'university', 'doctoral', 'graduate'])
  const terms = name.match(/[a-z][a-z-]{3,}/g)?.filter(term => !ignored.has(term)) ?? []
  const matchedTerms = terms.filter(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(value))
  return terms.length > 0 && matchedTerms.length >= Math.min(2, terms.length)
}

/**
 * Validate that an official excerpt can be retained as requirement evidence.
 * This is intentionally broader than `officialCitationSupportsRequirement`:
 * applicant-specific documents (for example a transcript or CV) may have an
 * official rule source, but that source must never be treated as proof that the
 * applicant already supplied the document.
 */
export function officialSourceExcerptSupportsRequirement(requirement: RequirementInput, excerpt: string) {
  if (officialCitationSupportsRequirement(requirement, excerpt)) return true
  const name = requirementName(requirement)
  const value = excerpt.replace(/\s+/g, ' ').trim()
  if (!name || !value || isFundingRequirement(requirement)) return false
  const ignored = new Set(['application', 'applications', 'admission', 'admissions', 'requirement', 'requirements', 'official', 'programme', 'program', 'university', 'doctoral', 'graduate', 'required', 'supporting'])
  const terms = name.match(/[a-z][a-z-]{3,}/g)?.filter(term => !ignored.has(term)) ?? []
  const matchedTerms = terms.filter(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i').test(value))
  return terms.length > 0 && matchedTerms.length >= Math.min(1, terms.length)
}
