import { sameOfficialInstitutionDomain } from './david-applications.ts'
import { hasGraduateScholarshipEvidence } from './application.ts'
import {
  attachApplicationWorkflowCandidates,
  compileApplicationWorkflow,
  type ApplicationWorkflowSpec,
} from './application-workflow.ts'

/**
 * Normalisation rules for the backend programme-discovery operation.
 *
 * Search is a recall and ranking aid. It is not admissions truth: a candidate
 * is only eligible for persistence when it includes an HTTPS programme page
 * and a matching official or government source on the same institution host.
 */

export const APPLICATION_PROGRAMME_DISCOVERY_VERSION = 'staged-web-search@5' as const

/**
 * Programme-level faculty contact policy.  `allowed_or_neutral` means that a
 * bounded search of current authoritative programme sources found no rule
 * discouraging or prohibiting relevant prospective-student contact; it does
 * not mean that the programme explicitly recommends outreach.
 */
export const FACULTY_CONTACT_POLICY_VALUES = [
  'required',
  'recommended',
  'allowed_or_neutral',
  'discouraged',
  'prohibited',
  'unknown_due_to_insufficient_evidence',
] as const
export type FacultyContactPolicy = typeof FACULTY_CONTACT_POLICY_VALUES[number]

export type ProgrammeFacultyContactPolicy = {
  classification: FacultyContactPolicy
  explanation: string
  evidence: Array<{ url: string; relevantTextSummary: string }>
  searchedSources: string[]
  explicitRuleFound: boolean
  retrievedAt?: string | null
  /** The application/intake cycle for which this policy was checked. */
  cycle?: string | null
}

export type ProgrammeDiscoverySourceType = 'official' | 'government' | 'secondary'

export type ProgrammeDiscoverySource = {
  url: string
  excerpt: string
  sourceType: ProgrammeDiscoverySourceType
}

export type ProgrammeDiscoveryCandidate = {
  /** Stable key used to bind a discovery result to a workflow target. */
  candidateKey?: string
  institution: string
  programmeTitle: string
  /** Whether this opportunity is a university programme or a graduate award. */
  opportunityKind?: 'programme' | 'scholarship' | null
  degreeLevel: string | null
  location: string | null
  officialUrl: string
  applicationUrl: string | null
  deadline: string | null
  deadlineTimezone: string | null
  fitScoreTen: number
  confidence: number
  fitRationale: string
  cvEvidence: string[]
  requirementsSummary: string[]
  sources: ProgrammeDiscoverySource[]
  routeType?: 'exact_programme' | 'adjacent_programme' | 'department_route' | 'graduate_school_route' | 'graduate_scholarship' | null
  routeLabel?: string | null
  discoveryReason?: string | null
  researchAreas?: string[]
  methods?: string[]
  facultyLabs?: ProgrammeFacultyLab[]
  eligibility?: ProgrammeEligibility
  currentCycle?: ProgrammeCurrentCycle
  facultyContactPolicy?: ProgrammeFacultyContactPolicy | null
  /** Official-structure metadata for coupled or multi-target routes. */
  workflowTargetKey?: string | null
  workflowTargetRole?: 'primary' | 'required' | 'choice' | 'alternative' | 'linked' | null
  workflowSelectionGroupId?: string | null
  workflowParentTargetKey?: string | null
}

export type ProgrammeFacultyLab = {
  name: string
  role: string | null
  title?: string | null
  department?: string | null
  officialUrl: string | null
  labUrl?: string | null
  researchAreas: string[]
  researchSummary?: string | null
  publicEmail?: string | null
  emailSourceUrl?: string | null
  currentlyActive?: boolean | 'unknown'
  acceptsStudents?: boolean | 'unknown'
  evidence: string
}

export type ProgrammeEligibility = {
  status: 'verified' | 'unclear' | 'not_found'
  requirements: string[]
  uncertainties: string[]
  evidence: string[]
}

export type ProgrammeCurrentCycle = {
  intakeYear: number | null
  deadlineStatus: 'confirmed' | 'not_published' | 'not_found' | 'conflicting'
  notes: string[]
  sourceUrls: string[]
}

export type ProgrammeDiscoveryRejection = {
  institution: string
  programmeTitle: string
  reason: string
}

export type ProgrammeDiscoveryNormalisation = {
  candidates: ProgrammeDiscoveryCandidate[]
  rejected: ProgrammeDiscoveryRejection[]
  workflow: ApplicationWorkflowSpec | null
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringValue(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : ''
}

function stringArray(value: unknown, maximumItems: number, maximumLength: number) {
  return Array.isArray(value)
    ? value.map(item => stringValue(item, maximumLength)).filter(Boolean).slice(0, maximumItems)
    : []
}

function httpsUrl(value: unknown) {
  const raw = stringValue(value, 2_000)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return ''
  }
}

function sourceType(value: unknown): ProgrammeDiscoverySourceType {
  const normalized = stringValue(value, 40).toLocaleLowerCase()
  if (normalized === 'government') return 'government'
  if (['official', 'official_page', 'official_programme_page', 'official_source'].includes(normalized)) return 'official'
  return 'secondary'
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = stringValue(value, 80).toLocaleLowerCase() as T
  return allowed.includes(normalized) ? normalized : fallback
}

export function normalizeFacultyContactPolicyClassification(value: unknown): FacultyContactPolicy {
  const normalized = stringValue(value, 100).toLocaleLowerCase()
  if (FACULTY_CONTACT_POLICY_VALUES.includes(normalized as FacultyContactPolicy)) return normalized as FacultyContactPolicy
  // Accept old persisted/model labels while writing only the canonical
  // semantics back into the current programme-intelligence contract.
  if (normalized === 'strongly_recommended') return 'recommended'
  if (['optional', 'irrelevant', 'allowed', 'neutral', 'allowed-or-neutral', 'allowed/neutral'].includes(normalized)) return 'allowed_or_neutral'
  if (normalized === 'unknown') return 'unknown_due_to_insufficient_evidence'
  return 'unknown_due_to_insufficient_evidence'
}

export function normalizeFacultyContactPolicy(value: unknown): ProgrammeFacultyContactPolicy | null {
  const row = recordValue(value)
  if (!Object.keys(row).length) return null
  const rawEvidence = Array.isArray(row.evidence) ? row.evidence : []
  const evidence = rawEvidence.map(item => {
    const source = recordValue(item)
    return {
      url: httpsUrl(source.url ?? source.source_url ?? source.sourceUrl),
      relevantTextSummary: stringValue(source.relevantTextSummary ?? source.relevant_text_summary ?? source.summary ?? source.excerpt, 1_200),
    }
  }).filter(item => item.url && item.relevantTextSummary).slice(0, 12)
  const searchedSources = (Array.isArray(row.searchedSources) ? row.searchedSources : Array.isArray(row.searched_sources) ? row.searched_sources : [])
    .map(item => httpsUrl(item)).filter(Boolean).slice(0, 24)
  const classification = normalizeFacultyContactPolicyClassification(row.classification ?? row.category ?? row.value)
  const explanation = stringValue(row.explanation ?? row.rationale ?? row.reason, 2_000)
  const explicitRuleFound = typeof row.explicitRuleFound === 'boolean'
    ? row.explicitRuleFound
    : typeof row.explicit_rule_found === 'boolean'
      ? row.explicit_rule_found
      : !['allowed_or_neutral', 'unknown_due_to_insufficient_evidence'].includes(classification)
  const retrievedAt = stringValue(row.retrievedAt ?? row.retrieved_at, 100) || null
  const rawCycle = row.cycle ?? row.applicationCycle ?? row.application_cycle ?? row.intakeYear ?? row.intake_year
  const cycle = (typeof rawCycle === 'number' && Number.isFinite(rawCycle)
    ? String(Math.trunc(rawCycle))
    : stringValue(rawCycle, 120)) || null
  if (!explanation && !evidence.length && !searchedSources.length) return null
  return { classification, explanation, evidence, searchedSources, explicitRuleFound, retrievedAt, cycle }
}

function scoreTen(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(Math.max(0, Math.min(10, numeric)) * 10) / 10
}

function confidence(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  // Providers commonly express confidence as either 0–1 or 0–100. The
  // durable contract is percentage points, so normalize the compact form
  // before clamping it.
  const percentage = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric
  return Math.round(Math.max(0, Math.min(100, percentage)))
}

function canonicalKey(candidate: Pick<ProgrammeDiscoveryCandidate, 'officialUrl' | 'institution' | 'programmeTitle'>) {
  return [
    candidate.officialUrl.toLocaleLowerCase(),
    candidate.institution.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    candidate.programmeTitle.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  ].join('|')
}

/**
 * Keep search-provider output outside the durable application graph until it
 * has the minimum source contract required by the application engine.
 */
export function normalizeProgrammeDiscoveryResponse(
  value: unknown,
  options: { maximumCandidates?: number; opportunityKind?: 'programme' | 'scholarship' } = {},
): ProgrammeDiscoveryNormalisation {
  const root = recordValue(value)
  const rawCandidates = Array.isArray(root.candidates)
    ? root.candidates
    : Array.isArray(value)
      ? value
      : []
  const maximumCandidates = Math.max(1, Math.min(20, Math.trunc(options.maximumCandidates ?? 10)))
  const candidates: ProgrammeDiscoveryCandidate[] = []
  const rejected: ProgrammeDiscoveryRejection[] = []
  const seen = new Set<string>()

  for (const item of rawCandidates) {
    const row = recordValue(item)
    const institution = stringValue(row.institution ?? row.university ?? row.school, 500)
    const programmeTitle = stringValue(row.programme_title ?? row.programmeTitle ?? row.programme ?? row.title, 800)
    const officialUrl = httpsUrl(row.official_url ?? row.officialUrl ?? row.programme_url ?? row.programmeUrl ?? row.url)
    const label = `${institution}${programmeTitle ? ` · ${programmeTitle}` : ''}`.trim() || 'Unnamed programme'
    if (!institution || !programmeTitle || !officialUrl) {
      rejected.push({ institution, programmeTitle, reason: 'The result did not include an institution, programme title, and HTTPS official page.' })
      continue
    }

    const rawSources = Array.isArray(row.sources)
      ? row.sources
      : Array.isArray(row.citations)
        ? row.citations
        : []
    const sources = rawSources.map(source => {
      const sourceRow = recordValue(source)
      return {
        url: httpsUrl(sourceRow.url ?? sourceRow.href ?? sourceRow.source_url),
        excerpt: stringValue(sourceRow.excerpt ?? sourceRow.snippet ?? sourceRow.evidence, 1_000),
        sourceType: sourceType(sourceRow.source_type ?? sourceRow.sourceType ?? sourceRow.type),
      }
    }).filter(source => source.url && source.excerpt)
    const authoritativeSources = sources.filter(source =>
      ['official', 'government'].includes(source.sourceType) && sameOfficialInstitutionDomain(officialUrl, source.url),
    )
    if (!authoritativeSources.length) {
      rejected.push({ institution, programmeTitle, reason: `No matching official source was supplied for ${label}.` })
      continue
    }
    // The search is often rooted at a scholarship while returning the linked
    // university routes that the award permits.  A caller-supplied kind is a
    // fallback for old providers; an explicit row kind always wins so linked
    // courses are not accidentally persisted as scholarships.
    const opportunityKind = enumValue(row.opportunity_kind ?? row.opportunityKind ?? row.application_kind ?? row.applicationKind, ['programme', 'scholarship'] as const, options.opportunityKind ?? 'programme')
    if (opportunityKind === 'scholarship' && !hasGraduateScholarshipEvidence(`${institution} ${programmeTitle} ${officialUrl}`, authoritativeSources.map(source => source.excerpt).join(' '))) {
      rejected.push({ institution, programmeTitle, reason: `The official source for ${label} did not establish that the award supports graduate study.` })
      continue
    }

    const candidateKey = stringValue(row.candidate_key ?? row.candidateKey ?? row.workflow_target_key ?? row.workflowTargetKey, 120) || canonicalKey({ officialUrl, institution, programmeTitle })
    const candidate: ProgrammeDiscoveryCandidate = {
      candidateKey,
      institution,
      programmeTitle,
      opportunityKind,
      degreeLevel: stringValue(row.degree_level ?? row.degreeLevel ?? row.level, 160) || null,
      location: stringValue(row.location ?? row.country ?? row.city, 240) || null,
      officialUrl,
      applicationUrl: httpsUrl(row.application_url ?? row.applicationUrl) || null,
      deadline: stringValue(row.deadline ?? row.deadline_at ?? row.deadlineAt, 120) || null,
      deadlineTimezone: stringValue(row.deadline_timezone ?? row.deadlineTimezone ?? row.timezone, 120) || null,
      fitScoreTen: scoreTen(row.fit_score_10 ?? row.fitScoreTen ?? row.fit_score ?? row.fitScore),
      confidence: confidence(row.confidence),
      fitRationale: stringValue(row.fit_rationale ?? row.fitRationale ?? row.recommendation_rationale ?? row.rationale, 2_000),
      cvEvidence: stringArray(row.cv_evidence ?? row.cvEvidence ?? row.fit_evidence ?? row.fitEvidence, 8, 500),
      requirementsSummary: stringArray(row.requirements_summary ?? row.requirementsSummary ?? row.requirements, 8, 400),
      sources: authoritativeSources.slice(0, 8),
      routeType: enumValue(row.route_type ?? row.routeType ?? row.discovery_kind ?? row.discoveryKind, ['exact_programme', 'adjacent_programme', 'department_route', 'graduate_school_route', 'graduate_scholarship'] as const, 'exact_programme'),
      routeLabel: stringValue(row.route_label ?? row.routeLabel ?? row.route, 240) || null,
      discoveryReason: stringValue(row.discovery_reason ?? row.discoveryReason ?? row.reason, 800) || null,
      researchAreas: stringArray(row.research_areas ?? row.researchAreas ?? row.research_topics ?? row.researchTopics, 12, 240),
      methods: stringArray(row.methods ?? row.methodology ?? row.research_methods ?? row.researchMethods, 12, 240),
      facultyLabs: (Array.isArray(row.faculty_labs) ? row.faculty_labs : Array.isArray(row.facultyLabs) ? row.facultyLabs : [])
        .map(item => {
          const faculty = recordValue(item)
          return {
            name: stringValue(faculty.name ?? faculty.person ?? faculty.lab, 240),
            role: stringValue(faculty.role ?? faculty.title, 240) || null,
            title: stringValue(faculty.title, 240) || null,
            department: stringValue(faculty.department ?? faculty.unit, 240) || null,
            officialUrl: httpsUrl(faculty.official_url ?? faculty.officialUrl ?? faculty.url) || null,
            labUrl: httpsUrl(faculty.lab_url ?? faculty.labUrl ?? faculty.group_url ?? faculty.groupUrl) || null,
            researchAreas: stringArray(faculty.research_areas ?? faculty.researchAreas ?? faculty.topics, 8, 240),
            researchSummary: stringValue(faculty.research_summary ?? faculty.researchSummary ?? faculty.summary, 1_000) || null,
            publicEmail: stringValue(faculty.public_email ?? faculty.publicEmail ?? faculty.email, 320) || null,
            emailSourceUrl: httpsUrl(faculty.email_source_url ?? faculty.emailSourceUrl ?? faculty.email_url ?? faculty.emailUrl) || null,
            currentlyActive: typeof faculty.currently_active === 'boolean' ? faculty.currently_active : typeof faculty.currentlyActive === 'boolean' ? faculty.currentlyActive : 'unknown',
            acceptsStudents: typeof faculty.accepts_students === 'boolean' ? faculty.accepts_students : typeof faculty.acceptsStudents === 'boolean' ? faculty.acceptsStudents : 'unknown',
            evidence: stringValue(faculty.evidence ?? faculty.excerpt ?? faculty.reason, 800),
          } satisfies ProgrammeFacultyLab
        })
        .filter(item => item.name && item.evidence)
        .slice(0, 12),
      eligibility: (() => {
        const eligibility = recordValue(row.eligibility)
        return {
          status: enumValue(eligibility.status, ['verified', 'unclear', 'not_found'] as const, 'unclear'),
          requirements: stringArray(eligibility.requirements ?? row.eligibility_requirements, 12, 400),
          uncertainties: stringArray(eligibility.uncertainties ?? row.eligibility_uncertainties, 8, 400),
          evidence: stringArray(eligibility.evidence ?? row.eligibility_evidence, 8, 800),
        }
      })(),
      currentCycle: (() => {
        const cycle = recordValue(row.current_cycle ?? row.currentCycle)
        const rawYear = Number(cycle.intake_year ?? cycle.intakeYear ?? row.intake_year ?? row.intakeYear)
        return {
          intakeYear: Number.isInteger(rawYear) && rawYear >= 1900 && rawYear <= 2200 ? rawYear : null,
          deadlineStatus: enumValue(cycle.deadline_status ?? cycle.deadlineStatus, ['confirmed', 'not_published', 'not_found', 'conflicting'] as const, candidateDeadlineStatus(row.deadline ?? row.deadline_at ?? row.deadlineAt)),
          notes: stringArray(cycle.notes ?? cycle.deadline_notes ?? row.deadline_notes, 6, 400),
          sourceUrls: (Array.isArray(cycle.source_urls) ? cycle.source_urls : Array.isArray(cycle.sourceUrls) ? cycle.sourceUrls : [])
            .map(value => httpsUrl(value)).filter(Boolean).slice(0, 8),
        }
      })(),
      facultyContactPolicy: normalizeFacultyContactPolicy(
        row.faculty_contact_policy ?? row.facultyContactPolicy ?? recordValue(row.programme_intelligence ?? row.programmeIntelligence).facultyContactPolicy ?? recordValue(row.programme_intelligence ?? row.programmeIntelligence).faculty_contact_policy,
      ),
      workflowTargetKey: stringValue(row.workflow_target_key ?? row.workflowTargetKey ?? row.candidate_key ?? row.candidateKey, 120) || candidateKey,
      workflowTargetRole: enumValue(row.workflow_target_role ?? row.workflowTargetRole ?? row.workflow_role ?? row.workflowRole, ['primary', 'required', 'choice', 'alternative', 'linked'] as const, 'choice'),
      workflowSelectionGroupId: stringValue(row.workflow_selection_group_id ?? row.workflowSelectionGroupId ?? row.selection_group_id ?? row.selectionGroupId, 120) || null,
      workflowParentTargetKey: stringValue(row.workflow_parent_target_key ?? row.workflowParentTargetKey ?? row.parent_target_key ?? row.parentTargetKey, 120) || null,
    }
    const key = canonicalKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(candidate)
  }

  candidates.sort((left, right) =>
    right.fitScoreTen - left.fitScoreTen ||
    right.confidence - left.confidence ||
    left.institution.localeCompare(right.institution) ||
    left.programmeTitle.localeCompare(right.programmeTitle),
  )

  const visibleCandidates = candidates.slice(0, maximumCandidates)
  const candidateSources = visibleCandidates.flatMap(candidate => candidate.sources)
    .filter((source, index, sources) => sources.findIndex(other => other.url === source.url && other.excerpt === source.excerpt) === index)
    .map(source => ({ id: source.url, url: source.url, excerpt: source.excerpt, authority: source.sourceType === 'government' ? 'government' as const : 'official' as const }))
  const rootCandidate = visibleCandidates.find(candidate =>
    options.opportunityKind === 'scholarship' && candidate.opportunityKind === 'scholarship',
  ) ?? visibleCandidates[0]
  const compiled = rootCandidate
    ? compileApplicationWorkflow({
        raw: recordValue(root.application_structure ?? root.applicationStructure ?? root.workflow ?? root.applicationWorkflow),
        rootTarget: { key: rootCandidate.candidateKey, label: `${rootCandidate.institution} · ${rootCandidate.programmeTitle}`, targetKind: rootCandidate.opportunityKind === 'scholarship' ? 'scholarship' : 'programme' },
        officialEvidence: candidateSources,
        candidateKeys: visibleCandidates.map(candidate => candidate.candidateKey ?? ''),
      })
    : null
  const workflow = compiled
    ? attachApplicationWorkflowCandidates(compiled, visibleCandidates.map(candidate => ({
        candidateKey: candidate.workflowTargetKey ?? candidate.candidateKey ?? '',
        label: `${candidate.institution} · ${candidate.programmeTitle}`,
        targetKind: candidate.opportunityKind === 'scholarship' ? 'scholarship' as const : 'programme' as const,
        selectionGroupId: candidate.workflowSelectionGroupId,
        parentKey: candidate.workflowParentTargetKey,
        role: candidate.workflowTargetRole ?? undefined,
      })))
    : null
  return { candidates: visibleCandidates, rejected, workflow }
}

function candidateDeadlineStatus(value: unknown): ProgrammeCurrentCycle['deadlineStatus'] {
  return stringValue(value, 120) ? 'confirmed' : 'not_found'
}
