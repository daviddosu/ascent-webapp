/**
 * Deterministic ownership for values needed by an application.
 *
 * A requirement can be visible in the applicant's form while still being a
 * programme fact.  Keeping this classification separate from UI copy makes
 * it impossible for a stale form label (for example "application cycle") to
 * turn into an applicant question.
 */

export const missingValueOwners = ['programme', 'applicant', 'external_provider', 'user_choice'] as const
export type MissingValueOwner = typeof missingValueOwners[number]

export type RequirementOwnershipInput = {
  name?: unknown
  type?: unknown
  canonicalKey?: unknown
  category?: unknown
  responsible?: unknown
  exactInstructions?: unknown
  source?: Record<string, unknown> | null
}

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function lower(value: unknown) {
  return text(value).toLocaleLowerCase()
}

function explicitOwner(value: unknown): MissingValueOwner | null {
  const candidate = lower(value)
  return missingValueOwners.includes(candidate as MissingValueOwner) ? candidate as MissingValueOwner : null
}

/**
 * Return the owner of the unresolved value, not the owner of the worker that
 * will execute the requirement.  Persisted ownership is retained except when
 * a stale value contradicts an unambiguous programme or applicant field.
 * The remaining rules are intentionally conservative and deterministic.
 */
export function missingValueOwnerForRequirement(input: RequirementOwnershipInput): MissingValueOwner {
  const source = input.source ?? {}
  const name = lower(input.name)
  const type = lower(input.type)
  const key = lower(input.canonicalKey ?? source.canonical_key ?? source.canonicalKey)
  const wording = lower(input.exactInstructions ?? source.official_wording ?? source.officialWording)
  const value = `${key} ${name} ${type} ${wording}`
  const responsible = lower(input.responsible ?? source.responsible_party ?? source.responsibleParty)

  const persisted = explicitOwner(source.missing_value_owner ?? source.missingValueOwner ?? source.value_owner ?? source.valueOwner)
  // Persisted ownership is useful for stable applicant facts, but it cannot
  // turn an unambiguous programme field into an applicant question after a
  // stale model turn or an old form projection.  Repair that contradiction at
  // the compiler boundary before honouring the persisted value.
  const unambiguousProgrammeField = /(?:application\s+(?:cycle|deadline|fee)|start\s+term|entry\s+term|intake|academic\s+year|application\s+deadline|fee\s+waiver|funding|financial\s+aid|stipend|tuition|gre\s+policy|english(?:[- ]language)?\s+policy|number\s+of\s+recommendation|recommendation(?:\s+letter)?s?\s+(?:required|count|method)|application\s+portal|portal\s+field|electronic\s+submission|supporting\s+materials|programme\s+requirement|program(?:me)?\s+requirement|research\s+areas?|faculty\s+contact|supervisor\s+policy)/i.test(value)
  const unambiguousApplicantField = /(?:applicant|your)\s+(?:transcript|academic\s+record|phone|mobile|telephone|email|address|cv|resume|curriculum\s+vitae|writing\s+sample|statement|essay|test\s+score|score\s+report)|(?:citizenship|nationality|residency|passport|date\s+of\s+birth|recommender\s+(?:name|email|contact)|original\s+authorship)/i.test(value)
  const choiceField = /(?:which|choose|select|preference|direction|emphasize|emphasis|inclined toward|experimental or theoretical)/i.test(value) &&
    /(?:research|area|field|speciali[sz]ation|subfield|direction|preference)/i.test(value)
  if (choiceField) return 'user_choice'
  if (unambiguousProgrammeField && !unambiguousApplicantField) return 'programme'

  // A writer is the worker for a statement/proposal, not automatically the
  // applicant's source of truth.  Unless the programme explicitly requires
  // original applicant authorship or editing-only assistance, the missing
  // value is programme context that the writer can use autonomously.  An
  // explicit editing/authorship rule keeps the genuine applicant boundary.
  if (responsible === 'writer' || type === 'writer' || type === 'research_proposal') {
    if (persisted === 'user_choice' || persisted === 'external_provider') return persisted
    const authorshipPolicy = lower(source.authorship_policy ?? source.authorshipPolicy ?? source.ai_policy ?? source.aiPolicy)
    const editingOnly = /(?:editing|feedback|proofreading)\s*[- ]?only|original\s+(?:draft|input|authorship)|applicant[- ]authored|(?:do|does)\s+not\s+(?:permit|allow)|\bno\s+(?:ai|artificial intelligence)|(?:ai|artificial intelligence)\s+(?:is\s+)?(?:prohibited|not\s+(?:permitted|allowed))/i.test(`${authorshipPolicy} ${wording}`)
    return editingOnly ? 'applicant' : 'programme'
  }
  if (unambiguousApplicantField) return 'applicant'
  if (persisted) return persisted

  // These values come from a provider or another person after the applicant
  // has supplied the identity/contact needed to start the exchange.
  if (responsible === 'referee' || responsible === 'roon' || responsible === 'institution' ||
    /(?:professor|supervisor)\s+reply|recommendation\s+(?:submission|delivery|status)|referee\s+(?:reply|status)|provider\s+(?:message|reply|confirmation)/i.test(value)) {
    return 'external_provider'
  }

  // A few items are choices the applicant must make even though the facts
  // around them are programme-owned.  These are the only programme-facing
  // choices that should become an applicant question without first finding a
  // missing document or contact.
  if (choiceField) {
    return 'user_choice'
  }

  // Applicant-specific evidence and identity must never be inferred from a
  // programme rule.  Check these before the broad programme terms below.
  if (/(?:your|applicant|personal|identity|contact details?|phone|mobile|telephone|email|address|date of birth|citizenship|nationality|residency|passport|transcript|academic record|academic performance|grade report|coursework|academic preparation|degree|diploma|proof of graduation|cv|resume|curriculum vitae|writing sample|statement|essay|research experience|research history|test score|score report|gre|gmat|toefl|ielts|pte|duolingo|english (?:test|score|proficiency)|recommender|referee|recommendation|original authorship)/i.test(value)) {
    // Portal identity/contact sections still require applicant-owned values;
    // the portal type alone must not turn them into programme metadata.
    if (/(?:portal|form|section|field)/i.test(type) && /(?:identity|personal|contact details?|name|email|phone|address)/i.test(name)) return 'applicant'
    // An official rule about the number/method of recommendations is a
    // programme fact; only the identity/contact of a recommender is personal.
    if (/(?:recommendation|referee|recommender)/.test(value) &&
      !/(?:name|email|contact|identity)/i.test(value) &&
      /(?:\b(?:required|number|count|method|portal|submit|upload|provide|at\s+least)\b|\d)/i.test(value)) return 'programme'
    // The selected programme's fee/funding/deadline and submission policy are
    // not applicant facts even when the wording mentions "your application".
    if (/(?:application\s+(?:cycle|deadline|fee)|start\s+term|entry\s+term|intake|funding|financial aid|portal|electronic submission|supporting materials)/i.test(value)) return 'programme'
    return 'applicant'
  }

  // Programme/application metadata and policy are resolved from opportunity,
  // programme intelligence, official sources, or the portal.
  if (/(?:application\s+cycle|start\s+term|entry\s+term|intake|academic year|application\s+deadline|deadline|application\s+fee|fee waiver|funding|financial aid|stipend|tuition|gre policy|english(?:[- ]language)? policy|number of recommendation|recommendation(?: letter)?s?\s+(?:required|count|method)|application portal|portal field|electronic submission|supporting materials|programme|program(?:me)?\s+requirement|research areas?|faculty contact|supervisor policy)/i.test(value)) {
    return 'programme'
  }

  if (responsible === 'applicant') return 'applicant'
  if (responsible === 'writer') return 'applicant'
  return 'programme'
}

export type ProgrammeMetadata = {
  applicationCycle?: string | null
  startTerm?: string | null
  degree?: string | null
  programme?: string | null
  institution?: string | null
  deadline?: string | null
  fee?: string | null
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const candidate = text(value)
    if (candidate) return candidate
  }
  return null
}

function cycleLabel(value: unknown) {
  const candidate = objectValue(value)
  const explicit = firstText(candidate.label, candidate.name, candidate.cycle, candidate.academicYear, candidate.academic_year)
  if (explicit) return explicit
  const year = Number(candidate.intakeYear ?? candidate.intake_year ?? candidate.year)
  if (Number.isInteger(year) && year >= 1900 && year <= 2200) return `${year}\u2013${year + 1}`
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2200) return `${value}\u2013${value + 1}`
  return text(value) || null
}

function termLabel(value: unknown, wording: string) {
  const direct = firstText(value)
  if (direct) return direct
  const match = wording.match(/\b(fall|autumn|spring|summer|winter)\s+(?:entry|start|intake|term)\b/i) ??
    wording.match(/\b(?:entry|start|intake|term)\s*[:\-]?\s*(fall|autumn|spring|summer|winter)\b/i)
  return match?.[1] ? match[1][0]!.toLocaleUpperCase() + match[1].slice(1).toLocaleLowerCase() : null
}

function feeLabel(value: unknown, wording: string) {
  const direct = firstText(value)
  if (direct) return direct
  const match = wording.match(/(?:\$|USD\s*)(\d+(?:\.\d{1,2})?)/i)
  return match?.[1] ? `$${match[1]}` : null
}

/**
 * Extract programme/application metadata already present in the selected
 * opportunity.  This does not scrape or infer a new requirement; it merely
 * gives the scheduler a typed value to use before considering a user handoff.
 */
export function programmeMetadataFromContext(input: {
  opportunity?: Record<string, unknown> | null
  source?: Record<string, unknown> | null
  name?: unknown
  canonicalKey?: unknown
  exactInstructions?: unknown
}): ProgrammeMetadata {
  const opportunity = input.opportunity ?? {}
  const data = objectValue(opportunity.data)
  const currentCycle = objectValue(data.currentCycle ?? data.current_cycle ?? opportunity.currentCycle ?? opportunity.current_cycle)
  const feeObject = objectValue(opportunity.fee ?? data.fee)
  const wording = text(input.exactInstructions ?? input.source?.official_wording ?? input.source?.officialWording)
  const combined = lower(`${input.canonicalKey ?? input.source?.canonical_key ?? input.source?.canonicalKey ?? ''} ${input.name ?? ''} ${wording}`)
  const cycle = cycleLabel(input.source?.application_cycle ?? input.source?.applicationCycle ?? data.applicationCycle ?? data.application_cycle ?? opportunity.application_cycle ?? currentCycle)
  const term = termLabel(input.source?.start_term ?? input.source?.startTerm ?? data.startTerm ?? data.start_term ?? data.entryTerm ?? data.entry_term ?? currentCycle.startTerm ?? currentCycle.start_term ?? currentCycle.entryTerm ?? currentCycle.entry_term ?? currentCycle.term ?? opportunity.entry_term ?? opportunity.entryTerm, wording)
  const degree = firstText(input.source?.degree, data.degreeLevel, data.degree_level, opportunity.degree_or_award_type, opportunity.degreeOrAwardType, data.degreeOrAwardType)
  const programme = firstText(data.programmeTitle, data.programme_title, opportunity.programme_title, opportunity.programmeTitle)
  const institution = firstText(data.institution, opportunity.institution)
  const deadline = firstText(input.source?.deadline, opportunity.deadline_at, data.deadline, data.deadlineAt)
  const fee = feeLabel(input.source?.fee ?? feeObject.amount, wording)
  return {
    ...(cycle && /(?:cycle|intake|academic year|application)/i.test(combined) ? { applicationCycle: cycle } : {}),
    ...(term && /(?:term|entry|intake|application)/i.test(combined) ? { startTerm: term } : {}),
    ...(degree && /(?:degree|programme|program)/i.test(combined) ? { degree } : {}),
    ...(programme && /(?:programme|program|application)/i.test(combined) ? { programme } : {}),
    ...(institution && /(?:institution|university|programme|program)/i.test(combined) ? { institution } : {}),
    ...(deadline && /deadline|due date|application cycle/i.test(combined) ? { deadline } : {}),
    ...(fee && /fee|payment/i.test(combined) ? { fee } : {}),
  }
}

export function programmeValueForRequirement(input: {
  name?: unknown
  canonicalKey?: unknown
  source?: Record<string, unknown> | null
  exactInstructions?: unknown
  opportunity?: Record<string, unknown> | null
}): string | null {
  const source = input.source ?? {}
  const metadata = programmeMetadataFromContext(input)
  const value = lower(`${input.canonicalKey ?? source.canonical_key ?? source.canonicalKey ?? ''} ${input.name ?? ''}`)
  const wantsCycle = /(?:application[- ]cycle|current[- ]cycle|intake|academic year)/i.test(value)
  const wantsTerm = /(?:start[- ]term|entry[- ]term|entry|intake)/i.test(value)
  if (wantsCycle && wantsTerm && metadata.applicationCycle && metadata.startTerm) {
    const year = metadata.applicationCycle.match(/\b(?:19|20|21)\d{2}\b/)?.[0]
    // Some opportunity records already store a combined value such as
    // “Fall 2027”. Do not duplicate the year when joining it to the cycle.
    if (year && new RegExp(`\\b${year}\\b`).test(metadata.startTerm)) return `${metadata.startTerm} entry`
    return year ? `${metadata.startTerm} ${year} entry` : `${metadata.startTerm} ${metadata.applicationCycle} entry`
  }
  if (wantsCycle && metadata.applicationCycle) return metadata.applicationCycle
  if (wantsTerm && metadata.startTerm) return metadata.startTerm
  if (/deadline|due date/i.test(value) && metadata.deadline) return metadata.deadline
  if (/fee|payment/i.test(value) && metadata.fee) return metadata.fee
  if (/degree|programme|program/i.test(value) && (metadata.degree || metadata.programme)) return metadata.degree ?? metadata.programme ?? null
  // A portal may expose a typed suggested value even when the opportunity
  // snapshot is incomplete. Use it only as the final fallback; selected
  // opportunity metadata and verified programme intelligence take precedence.
  const direct = firstText(source.suggested_value, source.suggestedValue)
  if (direct) return direct
  return null
}
