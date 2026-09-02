/**
 * Identity and normalization contracts for the graduate-application pipeline.
 *
 * The database stores canonical requirement UUIDs.  Plan nodes and UI
 * projections have their own identities.  Keeping the brands here makes the
 * distinction visible at the compiler boundary without changing the existing
 * JSON-backed application-plan storage.
 */

export type BrandedId<Brand extends string> = string & { readonly __brand: Brand }

export type RequirementId = BrandedId<'RequirementId'>
export type PlanNodeId = BrandedId<'PlanNodeId'>
export type RequirementEvidenceId = BrandedId<'RequirementEvidenceId'>
export type ApplicationCaseId = BrandedId<'ApplicationCaseId'>
export type WriterId = BrandedId<'WriterId'>
export type ManagedWriterId = 'david-managed-writer' | 'roon-managed-writer' | 'caspian-managed-writer'

export type WriterReference =
  | { kind: 'record'; id: WriterId }
  | { kind: 'managed'; id: ManagedWriterId }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const legacyRequirementPlanNodePattern = /^application-plan:requirement:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

export class InvalidApplicationIdentityError extends Error {
  readonly code = 'invalid_application_identity'

  constructor(readonly identityKind: string, readonly value: unknown, message?: string) {
    super(message ?? `${identityKind} must be a canonical UUID.`)
    this.name = 'InvalidApplicationIdentityError'
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value.trim())
}

export function assertUuid(value: unknown, identityKind: string): string {
  if (!isUuid(value)) throw new InvalidApplicationIdentityError(identityKind, value)
  return value.trim()
}

export function asRequirementId(value: unknown): RequirementId {
  return assertUuid(value, 'RequirementId') as RequirementId
}

export function asRequirementIdOrNull(value: unknown): RequirementId | null {
  return isUuid(value) ? value.trim() as RequirementId : null
}

export function asApplicationCaseId(value: unknown): ApplicationCaseId {
  return assertUuid(value, 'ApplicationCaseId') as ApplicationCaseId
}

export function asPlanNodeId(value: unknown): PlanNodeId {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > 300) throw new InvalidApplicationIdentityError('PlanNodeId', value, 'PlanNodeId must be a non-empty stable plan identity.')
  return text as PlanNodeId
}

export function asRequirementEvidenceId(value: unknown): RequirementEvidenceId {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > 300) throw new InvalidApplicationIdentityError('RequirementEvidenceId', value, 'RequirementEvidenceId must be a non-empty evidence identity.')
  return text as RequirementEvidenceId
}

const managedWriterIds = new Set<ManagedWriterId>([
  'david-managed-writer',
  'roon-managed-writer',
  'caspian-managed-writer',
])

const managedWriterAliases = new Map<string, ManagedWriterId>([
  ['david-assigned-writer', 'david-managed-writer'],
  ['roon-assigned-writer', 'roon-managed-writer'],
  ['caspian-assigned-writer', 'caspian-managed-writer'],
])

export function resolveWriterReference(value: unknown): WriterReference | null {
  const candidate = typeof value === 'string' ? value.trim() : ''
  if (!candidate) return null
  const normalized = candidate.toLocaleLowerCase()
  const managed = managedWriterAliases.get(normalized) ?? normalized as ManagedWriterId
  if (managedWriterIds.has(managed)) return { kind: 'managed', id: managed }
  if (!isUuid(candidate)) return null
  return { kind: 'record', id: candidate as WriterId }
}

export function writerSourceMaterialIds(input: {
  suppliedIds: string[]
  expectedApplicationCaseId: string
  currentCvArtifact: {
    id: string
    applicationCaseId: string
    kind: string
    approvalStatus: string
    finalSubmissionDestination: string | null
  } | null
}) {
  const sourceIds = [...new Set(input.suppliedIds.map(value => value.trim()).filter(Boolean))]
  const artifact = input.currentCvArtifact
  if (!artifact) return sourceIds
  if (!isUuid(artifact.id) || artifact.applicationCaseId !== input.expectedApplicationCaseId) {
    throw new InvalidApplicationIdentityError('ApplicationArtifactId', artifact.id, 'The current CV artifact does not belong to this application case.')
  }
  if (artifact.kind !== 'programme_derivative' || artifact.finalSubmissionDestination !== 'CV / resume upload' || ['rejected', 'superseded'].includes(artifact.approvalStatus)) {
    throw new InvalidApplicationIdentityError('ApplicationArtifactId', artifact.id, 'The writer handoff requires the current programme-specific CV artifact.')
  }
  if (!sourceIds.includes(artifact.id)) sourceIds.push(artifact.id)
  return sourceIds
}

/**
 * Resolve a plan node to the canonical requirement it references.  The
 * normal path uses the explicit `requirementId` field.  The exact legacy
 * presentation form is accepted only during recovery and only when the
 * caller supplies the set of requirement UUIDs belonging to the case.
 * There is intentionally no generic prefix stripping.
 */
export function resolveRequirementIdFromPlanNode(input: {
  planNodeId?: string | null
  requirementId?: string | null
  knownRequirementIds?: ReadonlySet<string>
}): RequirementId | null {
  if (input.requirementId) {
    const requirementId = asRequirementIdOrNull(input.requirementId)
    if (!requirementId) throw new InvalidApplicationIdentityError('RequirementId', input.requirementId, 'A plan node requirementId must be the canonical requirement UUID.')
    if (input.knownRequirementIds && !input.knownRequirementIds.has(requirementId)) {
      throw new InvalidApplicationIdentityError('RequirementId', requirementId, 'The plan node requirementId is not part of this application case.')
    }
    return requirementId
  }
  const match = (input.planNodeId ?? '').trim().match(legacyRequirementPlanNodePattern)
  if (!match) return null
  const requirementId = asRequirementId(match[1])
  if (!input.knownRequirementIds || !input.knownRequirementIds.has(requirementId)) {
    throw new InvalidApplicationIdentityError('PlanNodeId', input.planNodeId, 'The legacy plan node does not resolve to a requirement in this application case.')
  }
  return requirementId
}

export type CanonicalRequirementType =
  | 'cv'
  | 'statement_of_purpose'
  | 'personal_statement'
  | 'research_statement'
  | 'research_proposal'
  | 'essay'
  | 'recommendation'
  | 'transcript'
  | 'degree_certificate'
  | 'credential_evaluation'
  | 'gre'
  | 'subject_gre'
  | 'english_test'
  | 'writing_sample'
  | 'portfolio'
  | 'faculty_selection'
  | 'supervisor_approval'
  | 'application_fee'
  | 'fee_waiver'
  | 'funding'
  | 'scholarship'
  | 'portal_field'
  | 'declaration'
  | 'deadline'
  | 'eligibility'
  | 'other'

export type RequirementLevel = 'required' | 'optional' | 'conditional' | 'recommended'
export type RequirementVerificationState = 'verified' | 'partially_verified' | 'conflicted' | 'unresolved'
export type RequirementApplicantState = 'unknown' | 'missing' | 'available' | 'in_progress' | 'satisfied' | 'not_applicable'

export type ApplicationCondition = {
  description: string
  field?: string
  operator?: 'equals' | 'not_equals' | 'present' | 'absent' | 'unknown'
  value?: string | number | boolean | null
  state: 'active' | 'inactive' | 'unresolved'
}

export type RequirementCardinality = {
  exact?: number
  min?: number
  max?: number
}

export type RequirementEvidenceKind =
  | 'deadline'
  | 'document'
  | 'recommendation'
  | 'test'
  | 'academic_record'
  | 'faculty'
  | 'funding'
  | 'fee'
  | 'portal'
  | 'declaration'
  | 'eligibility'
  | 'other'

export type RequirementEvidence = {
  id: RequirementEvidenceId
  applicationCaseId: ApplicationCaseId
  sourceUrl: string
  sourceTitle?: string
  authoritative: boolean
  retrievedAt: string
  exactText?: string
  normalizedClaim?: string
  evidenceKind: RequirementEvidenceKind
}

export type CanonicalApplicationRequirement = {
  id: RequirementId
  applicationCaseId: ApplicationCaseId
  type: CanonicalRequirementType
  canonicalKey: string
  title: string
  officialWording?: string
  required: RequirementLevel
  condition?: ApplicationCondition
  deadline?: string
  prompt?: string
  wordLimit?: { min?: number; max?: number }
  cardinality?: RequirementCardinality
  sourceEvidenceIds: RequirementEvidenceId[]
  verificationState: RequirementVerificationState
  applicantState: RequirementApplicantState
  mergedIntoRequirementId?: RequirementId | null
  sourceRowId?: RequirementId
  status?: string | null
  linkedArtifactId?: string | null
}

export type RequirementNormalizationProposal = {
  type: CanonicalRequirementType
  title: string
  required: RequirementLevel
  condition?: ApplicationCondition
  prompt?: string
  cardinality?: RequirementCardinality
  supportingEvidenceIds: RequirementEvidenceId[]
  confidence: number
}

export type RequirementExecutionNode = {
  id: PlanNodeId
  applicationCaseId: ApplicationCaseId
  requirementId?: RequirementId
  type: string
  title: string
  dependencies: PlanNodeId[]
  owner: string
  status: string
  cardinality?: RequirementCardinality
  evidenceIds: RequirementEvidenceId[]
}

function compact(value: unknown, max = 2_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function slug(value: unknown, fallback = 'unknown') {
  const normalized = compact(value, 300)
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return normalized || fallback
}

export function canonicalRequirementType(name: string, rawType?: string | null): CanonicalRequirementType {
  const value = `${rawType ?? ''} ${name}`.toLocaleLowerCase()
  if (/curriculum|\bcv\b|resume|résumé/.test(value)) return 'cv'
  if (/statement of purpose|\bsop\b/.test(value)) return 'statement_of_purpose'
  if (/personal statement|personal history/.test(value)) return 'personal_statement'
  if (/research statement/.test(value)) return 'research_statement'
  if (/research proposal|proposal/.test(value)) return 'research_proposal'
  if (/writing sample|work sample/.test(value)) return 'writing_sample'
  if (/essay|writing prompt|supplement/.test(value)) return 'essay'
  if (/recommend|referee|reference letter/.test(value)) return 'recommendation'
  if (/transcript|academic record/.test(value)) return 'transcript'
  if (/degree certificate|proof of degree|diploma|undergraduate degree|degree or equivalent/.test(value)) return 'degree_certificate'
  if (/credential evaluation|wes|evaluation/.test(value)) return 'credential_evaluation'
  if (/physics gre|gre.*physics|subject gre|gre.*subject/.test(value)) return 'subject_gre'
  if (/\bgre\b/.test(value)) return 'gre'
  if (/toefl|ielts|duolingo|pte|english.*test|language proficiency/.test(value)) return 'english_test'
  if (/portfolio|publication|paper|code sample/.test(value)) return 'portfolio'
  if (/faculty|professor|supervisor|advisor|research[- ]area|theory\/?experiment|experimental or theoretical/.test(value)) return 'faculty_selection'
  if (/fee waiver/.test(value)) return 'fee_waiver'
  if (/fee|payment/.test(value)) return 'application_fee'
  if (/funding|stipend|assistantship|financial support|financial[- ]aid/.test(value)) return 'funding'
  if (/scholarship|fellowship/.test(value)) return 'scholarship'
  if (/portal|application form|field|section|electronic submission|submit all required components|supporting materials electronically/.test(value)) return 'portal_field'
  if (/declaration|attest|consent/.test(value)) return 'declaration'
  if (/deadline|due date|close/.test(value)) return 'deadline'
  if (/eligib|prerequisite|academic preparation|undergraduate[- ]level/.test(value)) return 'eligibility'
  return 'other'
}

export function inferRequirementCardinality(input: { name: string; officialWording?: string | null; cardinality?: unknown }): RequirementCardinality | undefined {
  const value = `${input.name} ${input.officialWording ?? ''}`
  if (/recommend|referee|reference|letter/i.test(value)) {
    const match = value.match(/\b(?:at\s+least\s+|exactly\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine)\s+(?:required\s+|academic\s+|professional\s+|other\s+)?(?:letters?|recommendations?|referees?)\b/i)
    if (match) {
      const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
      const count = words[match[1].toLocaleLowerCase()] ?? Number(match[1])
      if (Number.isInteger(count) && count > 0) return /at\s+least/i.test(match[0]) ? { min: count } : { exact: count }
    }
  }
  if (input.cardinality && typeof input.cardinality === 'object' && !Array.isArray(input.cardinality)) {
    const candidate = input.cardinality as Record<string, unknown>
    const exact = Number(candidate.exact)
    const min = Number(candidate.min)
    const max = Number(candidate.max)
    if (Number.isInteger(exact) && exact > 0) return { exact }
    if (Number.isInteger(min) || Number.isInteger(max)) return {
      ...(Number.isInteger(min) && min > 0 ? { min } : {}),
      ...(Number.isInteger(max) && max > 0 ? { max } : {}),
    }
  }
  return undefined
}

export function inferRequirementLevel(input: { required?: boolean; status?: string | null; officialWording?: string | null; condition?: ApplicationCondition }): RequirementLevel {
  const wording = `${input.officialWording ?? ''}`
  if (/\boptional\b|not required|where relevant/i.test(wording) || input.status === 'optional') return 'optional'
  if (input.condition || /\bif\b|only if|where applicable|when applicable|unless\s+(?:the\s+)?(?:applicant|applicants|they|you)\s+(?:qualif|are\s+eligible|are\s+exempt|have\s+(?:an\s+)?exemption|can\s+claim)|conditional on/i.test(wording)) return 'conditional'
  if (input.required === false) return 'optional'
  if (/recommended|strongly advised|encouraged/i.test(wording)) return 'recommended'
  return 'required'
}

function inferCondition(officialWording: string | undefined, existing: unknown): ApplicationCondition | undefined {
  const hasApplicantException = /unless\s+(?:the\s+)?(?:applicant|applicants|they|you)\s+(?:qualif|are\s+eligible|are\s+exempt|have\s+(?:an\s+)?exemption|can\s+claim)/i.test(officialWording ?? '')
  const hasExplicitCondition = /\b(?:if|only if|when|where applicable|where relevant)\b|conditional on/i.test(officialWording ?? '')
  if (!officialWording || (!hasApplicantException && !hasExplicitCondition)) return undefined
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) return existing as ApplicationCondition
  return { description: officialWording, state: 'unresolved' }
}

export function inferApplicantState(input: { status?: string | null; linkedArtifactId?: string | null; type: CanonicalRequirementType; required: RequirementLevel }): RequirementApplicantState {
  const status = compact(input.status, 80).toLocaleLowerCase()
  if (input.required === 'optional' && status === 'not_applicable') return 'not_applicable'
  if (input.linkedArtifactId || ['ready', 'approved', 'submitted', 'satisfied'].includes(status)) return 'satisfied'
  if (['missing', 'awaiting_user'].includes(status)) return 'missing'
  if (['in_progress', 'awaiting_writer', 'awaiting_referee', 'awaiting_institution'].includes(status)) return 'in_progress'
  return 'unknown'
}

export function canonicalRequirementKey(input: { institution: string; programme: string; cycle?: string | null; type: CanonicalRequirementType; title: string; officialWording?: string | null }): string {
  const cycle = slug(input.cycle ?? 'current-cycle')
  const title = compact(input.title, 500).toLocaleLowerCase()
  const semanticSlot = input.type === 'recommendation'
    ? 'recommendation-letters'
    : input.type === 'gre'
        ? 'general'
        : input.type === 'subject_gre'
          ? 'subject'
          : input.type === 'transcript'
          ? /unofficial/.test(title)
            ? 'unofficial-application'
            : /official|admitted|after admission/.test(`${title} ${input.officialWording ?? ''}`.toLocaleLowerCase())
              ? 'official-after-admission'
              : /upload|application/.test(`${title} ${input.officialWording ?? ''}`.toLocaleLowerCase())
              ? 'unofficial-application'
              : 'transcript'
          : input.type === 'essay' || input.type === 'statement_of_purpose' || input.type === 'personal_statement' || input.type === 'research_statement'
            ? `${input.type}:${slug(input.officialWording || input.title)}`
            : input.type === 'other'
              ? `other:${slug(input.title)}`
              : `${input.type}:${slug(input.title)}`
  return `${slug(input.institution)}:${slug(input.programme)}:${cycle}:${semanticSlot}`.slice(0, 500)
}

export function normalizeCanonicalApplicationRequirement(input: {
  id: string
  applicationCaseId: string
  institution: string
  programme: string
  cycle?: string | null
  name: string
  requirementType?: string | null
  required?: boolean
  status?: string | null
  exactInstructions?: string | null
  deadline?: string | null
  sourceEvidenceIds?: string[]
  source?: Record<string, unknown> | null
  linkedArtifactId?: string | null
}): CanonicalApplicationRequirement {
  const id = asRequirementId(input.id)
  const applicationCaseId = asApplicationCaseId(input.applicationCaseId)
  const source = input.source ?? {}
  const officialWording = compact(input.exactInstructions, 4_000) || undefined
  const type = canonicalRequirementType(input.name, input.requirementType)
  const condition = inferCondition(officialWording, source.condition)
  const required = inferRequirementLevel({ required: input.required, status: input.status, officialWording, condition })
  const cardinality = inferRequirementCardinality({ name: input.name, officialWording, cardinality: source.cardinality })
  const sourceEvidenceIds = [...new Set([
    ...(input.sourceEvidenceIds ?? []),
    ...(Array.isArray(source.source_evidence_ids) ? source.source_evidence_ids.map(String) : []),
  ].filter(Boolean))].map(asRequirementEvidenceId)
  const verificationState: RequirementVerificationState = source.verification_state === 'conflicted'
    ? 'conflicted'
    : sourceEvidenceIds.length && source.authority === 'official'
      ? 'verified'
      : sourceEvidenceIds.length
        ? 'partially_verified'
        : 'unresolved'
  return {
    id,
    applicationCaseId,
    type,
    // The canonical key is deterministic application output. Never trust a
    // model- or legacy-supplied key as identity, otherwise stale pseudo-keys
    // can keep unrelated requirements merged forever.
    canonicalKey: canonicalRequirementKey({ institution: input.institution, programme: input.programme, cycle: input.cycle, type, title: input.name, officialWording }),
    title: compact(input.name, 500),
    officialWording,
    required,
    ...(condition ? { condition } : {}),
    ...(input.deadline ? { deadline: input.deadline } : {}),
    ...(cardinality ? { cardinality } : {}),
    ...(source.prompt || (['essay', 'writing_sample', 'statement_of_purpose', 'personal_statement', 'research_statement'].includes(type) && officialWording) ? { prompt: compact(source.prompt ?? officialWording, 4_000) } : {}),
    ...((source.word_limit ?? source.wordLimit) && typeof (source.word_limit ?? source.wordLimit) === 'object' && !Array.isArray(source.word_limit ?? source.wordLimit) ? { wordLimit: (source.word_limit ?? source.wordLimit) as { min?: number; max?: number } } : {}),
    sourceEvidenceIds,
    verificationState,
    applicantState: inferApplicantState({ status: input.status, linkedArtifactId: input.linkedArtifactId, type, required }),
    sourceRowId: id,
    status: input.status ?? null,
    linkedArtifactId: input.linkedArtifactId ?? null,
  }
}

export function canonicalRequirementRowsForCompilation(requirements: CanonicalApplicationRequirement[]) {
  return requirements.filter(requirement => !requirement.mergedIntoRequirementId && requirement.required !== 'optional' && requirement.applicantState !== 'not_applicable')
}
