/**
 * The canonical application workflow graph.
 *
 * A graduate application task is a bundle, not necessarily one university
 * application.  A scholarship can require several course choices, a funding
 * route can unlock a programme route, and some awards are alternatives rather
 * than additional submissions.  This module is deliberately pure: it defines
 * the graph contract, validates official structure evidence, and schedules
 * target lanes. Database and provider workers consume this contract; models do
 * not get to invent a second workflow.
 */

export const APPLICATION_WORKFLOW_VERSION = 'graduate-application-workflow@1' as const
export const APPLICATION_WORKFLOW_MAX_TARGETS = 20 as const
export const APPLICATION_WORKFLOW_MAX_GROUPS = 20 as const
export const APPLICATION_WORKFLOW_MAX_EDGES = 40 as const

export type ApplicationWorkflowMode =
  | 'single_target'
  | 'multi_target'
  | 'coupled_targets'
  | 'sequential_targets'

export type ApplicationWorkflowStatus = 'verified' | 'needs_official_structure'
export type ApplicationWorkflowTargetKind = 'programme' | 'scholarship' | 'institution' | 'course'
export type ApplicationWorkflowTargetRole = 'primary' | 'required' | 'choice' | 'alternative' | 'linked'
export type ApplicationWorkflowRelation = 'requires' | 'supports' | 'alternative' | 'shared_evidence'
export type ApplicationWorkflowStageOwner = 'david' | 'roon' | 'orchestrator' | 'browser'

export type ApplicationWorkflowEvidence = {
  id: string
  url: string
  excerpt: string
  authority: 'official' | 'government'
}

export type ApplicationWorkflowTarget = {
  key: string
  label: string
  targetKind: ApplicationWorkflowTargetKind
  role: ApplicationWorkflowTargetRole
  required: boolean
  opportunityId: string | null
  caseId: string | null
  selectionGroupId: string | null
  parentKey: string | null
  sourceEvidenceIds: string[]
  /** The target's official deadline, when the provider publishes one. */
  deadlineAt?: string | null
}

export type ApplicationWorkflowSelectionGroup = {
  id: string
  label: string
  targetKind: ApplicationWorkflowTargetKind
  minSelections: number
  maxSelections: number
  required: boolean
  relation: 'requires' | 'alternative'
  targetKeys: string[]
  sourceEvidenceIds: string[]
}

export type ApplicationWorkflowEdge = {
  from: string
  to: string
  relation: ApplicationWorkflowRelation
  condition: string | null
  sourceEvidenceIds: string[]
}

export type ApplicationWorkflowStage = {
  id: string
  label: string
  targetKeys: string[]
  dependsOn: string[]
  owner: ApplicationWorkflowStageOwner
  required: boolean
}

export type ApplicationWorkflowSpec = {
  version: typeof APPLICATION_WORKFLOW_VERSION
  status: ApplicationWorkflowStatus
  mode: ApplicationWorkflowMode
  rootTargetKey: string
  targets: ApplicationWorkflowTarget[]
  selectionGroups: ApplicationWorkflowSelectionGroup[]
  edges: ApplicationWorkflowEdge[]
  stages: ApplicationWorkflowStage[]
  sourceEvidence: ApplicationWorkflowEvidence[]
  blockers: string[]
  confidence: number
  compiledAt: string
}

export type ApplicationWorkflowCandidateBinding = {
  candidateKey: string
  opportunityId: string
  label?: string
  targetKind?: ApplicationWorkflowTargetKind
  selectionGroupId?: string | null
  parentKey?: string | null
  role?: ApplicationWorkflowTargetRole
  deadlineAt?: string | null
}

export type ApplicationWorkflowCaseBinding = {
  targetKey: string
  caseId: string
}

export type ApplicationWorkflowCaseObservation = {
  targetKey: string
  caseId: string
  status: string
  currentStage: string
  complete: boolean
  deadlineAt?: string | null
  nextAction?: string | null
}

export type ApplicationWorkflowSchedule = {
  activeTargetKey: string | null
  activeCaseId: string | null
  runnableTargetKeys: string[]
  waitingTargetKeys: string[]
  blockedTargetKeys: string[]
  completedTargetKeys: string[]
  complete: boolean
  reasons: Record<string, string>
}

type RecordValue = Record<string, unknown>

function recordValue(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function text(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : ''
}

function list(value: unknown, maximumItems: number, maximumLength = 240) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(item => text(item, maximumLength))
    .filter(Boolean))].slice(0, maximumItems)
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ''
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return ''
  }
}

function evidenceAuthority(value: unknown): ApplicationWorkflowEvidence['authority'] | null {
  const normalized = text(value, 40).toLocaleLowerCase()
  return normalized === 'government' ? 'government' : normalized === 'official' ? 'official' : null
}

function evidenceKey(source: ApplicationWorkflowEvidence) {
  return source.id || source.url
}

function normalizeSources(value: unknown, suppliedSources: ApplicationWorkflowEvidence[]) {
  const suppliedByUrl = new Map(suppliedSources.map(source => [canonicalUrl(source.url), source]))
  const references = Array.isArray(value) ? value : []
  const matched: ApplicationWorkflowEvidence[] = []
  for (const raw of references) {
    const row = recordValue(raw)
    const url = canonicalUrl(text(row.url ?? row.source_url ?? row.sourceUrl, 2_000))
    const supplied = suppliedByUrl.get(url)
    const authority = evidenceAuthority(row.authority ?? row.source_type ?? row.sourceType) ?? supplied?.authority
    const excerpt = text(row.excerpt ?? row.evidence ?? row.text, 2_000)
    if (!supplied || !authority || !excerpt || !['official', 'government'].includes(authority)) continue
    const key = evidenceKey(supplied)
    if (!matched.some(source => evidenceKey(source) === key)) matched.push({ ...supplied, authority })
  }
  return matched.slice(0, 80)
}

function targetKind(value: unknown, fallback: ApplicationWorkflowTargetKind): ApplicationWorkflowTargetKind {
  const normalized = text(value, 40).toLocaleLowerCase()
  return ['programme', 'scholarship', 'institution', 'course'].includes(normalized)
    ? normalized as ApplicationWorkflowTargetKind
    : fallback
}

function targetRole(value: unknown, fallback: ApplicationWorkflowTargetRole): ApplicationWorkflowTargetRole {
  const normalized = text(value, 40).toLocaleLowerCase()
  return ['primary', 'required', 'choice', 'alternative', 'linked'].includes(normalized)
    ? normalized as ApplicationWorkflowTargetRole
    : fallback
}

function workflowMode(value: unknown, fallback: ApplicationWorkflowMode): ApplicationWorkflowMode {
  const normalized = text(value, 40).toLocaleLowerCase()
  return ['single_target', 'multi_target', 'coupled_targets', 'sequential_targets'].includes(normalized)
    ? normalized as ApplicationWorkflowMode
    : fallback
}

function relation(value: unknown, fallback: ApplicationWorkflowRelation): ApplicationWorkflowRelation {
  const normalized = text(value, 40).toLocaleLowerCase()
  return ['requires', 'supports', 'alternative', 'shared_evidence'].includes(normalized)
    ? normalized as ApplicationWorkflowRelation
    : fallback
}

function selectionRelation(value: unknown, fallback: ApplicationWorkflowSelectionGroup['relation']) {
  return text(value, 40).toLocaleLowerCase() === 'alternative' ? 'alternative' as const : fallback
}

function boundedCount(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= APPLICATION_WORKFLOW_MAX_TARGETS ? number : fallback
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function cycleExists(edges: ApplicationWorkflowEdge[]) {
  const adjacency = new Map<string, string[]>()
  for (const edge of edges.filter(edge => edge.relation === 'requires')) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to])
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true
    if (visited.has(key)) return false
    visiting.add(key)
    for (const child of adjacency.get(key) ?? []) if (visit(child)) return true
    visiting.delete(key)
    visited.add(key)
    return false
  }
  return [...adjacency.keys()].some(visit)
}

function compileStages(
  targets: ApplicationWorkflowTarget[],
  groups: ApplicationWorkflowSelectionGroup[],
  edges: ApplicationWorkflowEdge[],
): ApplicationWorkflowStage[] {
  const selection = {
    id: 'workflow/select-targets',
    label: 'Select every target required by the official route',
    targetKeys: unique(groups.flatMap(group => group.targetKeys)),
    dependsOn: [],
    owner: 'david' as const,
    required: groups.some(group => group.required),
  }
  const prepare = targets.map(target => {
    // `supports` and `shared_evidence` describe how lanes inform one another;
    // only an official `requires` edge blocks execution. Otherwise a linked
    // course could be stranded behind a scholarship case that is meant to be
    // prepared in parallel.
    const prerequisites = edges
      .filter(edge => edge.to === target.key && edge.relation === 'requires')
      .map(edge => `workflow/prepare/${edge.from}`)
    return {
      id: `workflow/prepare/${target.key}`,
      label: `Prepare ${target.label}`,
      targetKeys: [target.key],
      dependsOn: unique(['workflow/select-targets', ...prerequisites]),
      owner: 'david' as const,
      required: target.required,
    }
  })
  const submit = targets.map(target => ({
    id: `workflow/submit/${target.key}`,
    label: `Submit and verify ${target.label}`,
    targetKeys: [target.key],
    dependsOn: [`workflow/prepare/${target.key}`],
    owner: 'browser' as const,
    required: target.required,
  }))
  const complete = {
    id: 'workflow/complete',
    label: 'Complete the graduate application bundle',
    targetKeys: targets.filter(target => target.required).map(target => target.key),
    dependsOn: submit.filter(stage => stage.required).map(stage => stage.id),
    owner: 'orchestrator' as const,
    required: true,
  }
  return [selection, ...prepare, ...submit, complete]
}

export function createSingleTargetWorkflow(input: {
  targetKey?: string
  label: string
  targetKind: ApplicationWorkflowTargetKind
  opportunityId?: string | null
  officialEvidence?: ApplicationWorkflowEvidence[]
  status?: ApplicationWorkflowStatus
  blocker?: string
  now?: string
}): ApplicationWorkflowSpec {
  const targetKey = text(input.targetKey, 120) || 'primary'
  const target: ApplicationWorkflowTarget = {
    key: targetKey,
    label: text(input.label, 500) || 'Graduate application target',
    targetKind: input.targetKind,
    role: 'primary',
    required: true,
    opportunityId: input.opportunityId ?? null,
    caseId: null,
    selectionGroupId: 'primary-target',
    parentKey: null,
    sourceEvidenceIds: (input.officialEvidence ?? []).map(evidenceKey),
    deadlineAt: null,
  }
  const group: ApplicationWorkflowSelectionGroup = {
    id: 'primary-target',
    label: `Choose the ${input.targetKind === 'scholarship' ? 'scholarship' : 'graduate programme'} to pursue`,
    targetKind: input.targetKind,
    minSelections: 1,
    maxSelections: 1,
    required: true,
    relation: 'requires',
    targetKeys: [targetKey],
    sourceEvidenceIds: (input.officialEvidence ?? []).map(evidenceKey),
  }
  const status = input.status ?? 'verified'
  const blockers = input.blocker ? [text(input.blocker, 500)] : []
  const sourceEvidence = (input.officialEvidence ?? []).slice(0, 80)
  const edges: ApplicationWorkflowEdge[] = []
  return {
    version: APPLICATION_WORKFLOW_VERSION,
    status,
    mode: 'single_target',
    rootTargetKey: targetKey,
    targets: [target],
    selectionGroups: [group],
    edges,
    stages: compileStages([target], [group], edges),
    sourceEvidence,
    blockers,
    confidence: status === 'verified' ? 1 : 0,
    compiledAt: input.now ?? new Date().toISOString(),
  }
}

/**
 * Compile the model's official-structure report into a bounded graph. A bad or
 * unsupported report never becomes executable: the result is an explicit
 * unresolved single-target graph that tells the orchestrator to research the
 * structure before creating cases.
 */
export function compileApplicationWorkflow(input: {
  raw?: unknown
  rootTarget?: { key?: string; label: string; targetKind: ApplicationWorkflowTargetKind; opportunityId?: string | null }
  officialEvidence?: ApplicationWorkflowEvidence[]
  candidateKeys?: string[]
  now?: string
}): ApplicationWorkflowSpec {
  const rootTarget = input.rootTarget ?? { label: 'Graduate application target', targetKind: 'programme' as const }
  const sources = (input.officialEvidence ?? []).filter(source =>
    Boolean(canonicalUrl(source.url) && source.excerpt && ['official', 'government'].includes(source.authority)),
  ).slice(0, 80)
  const fallback = createSingleTargetWorkflow({
    ...rootTarget,
    officialEvidence: sources,
    status: 'needs_official_structure',
    blocker: 'The official application structure has not been established yet. Research the provider route before selecting targets or creating application workspaces.',
    now: input.now,
  })
  const raw = recordValue(input.raw)
  if (!Object.keys(raw).length || !sources.length) return fallback

  const targetDefinitions = Array.isArray(raw.targets) ? raw.targets : Array.isArray(raw.target_definitions) ? raw.target_definitions : []
  const rawGroups = Array.isArray(raw.selection_groups) ? raw.selection_groups : Array.isArray(raw.selectionGroups) ? raw.selectionGroups : []
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : Array.isArray(raw.dependencies) ? raw.dependencies : []
  const rootKey = text(raw.root_target_key ?? raw.rootTargetKey ?? raw.primary_target_key ?? raw.primaryTargetKey, 120) || text(rootTarget.key, 120) || 'primary'
  const errors: string[] = []
  const sourceIds = sources.map(evidenceKey)
  const targets: ApplicationWorkflowTarget[] = []
  const groups: ApplicationWorkflowSelectionGroup[] = []
  const edges: ApplicationWorkflowEdge[] = []

  const addTarget = (rawTarget: unknown, fallbackTarget?: ApplicationWorkflowTarget) => {
    const row = recordValue(rawTarget)
    const key = text(row.key ?? row.target_key ?? row.targetKey ?? row.candidate_key ?? row.candidateKey, 120) || fallbackTarget?.key || ''
    if (!key || targets.some(target => target.key === key)) return
    const targetEvidence = normalizeSources(row.source_evidence ?? row.sourceEvidence ?? row.evidence, sources).map(evidenceKey)
    if (Array.isArray(row.source_evidence ?? row.sourceEvidence ?? row.evidence) && targetEvidence.length === 0) errors.push(`Target ${key} has no matching official evidence.`)
    targets.push({
      key,
      label: text(row.label ?? row.name ?? row.title, 500) || fallbackTarget?.label || key,
      targetKind: targetKind(row.target_kind ?? row.targetKind ?? row.kind, fallbackTarget?.targetKind ?? rootTarget.targetKind),
      role: targetRole(row.role, fallbackTarget?.role ?? (key === rootKey ? 'primary' : 'linked')),
      required: typeof row.required === 'boolean' ? row.required : fallbackTarget?.required ?? key === rootKey,
      opportunityId: text(row.opportunity_id ?? row.opportunityId, 120) || fallbackTarget?.opportunityId || null,
      caseId: text(row.case_id ?? row.caseId, 120) || fallbackTarget?.caseId || null,
      selectionGroupId: text(row.selection_group_id ?? row.selectionGroupId ?? row.group_id ?? row.groupId, 120) || fallbackTarget?.selectionGroupId || null,
      parentKey: text(row.parent_key ?? row.parentKey, 120) || fallbackTarget?.parentKey || null,
      sourceEvidenceIds: targetEvidence.length ? targetEvidence : fallbackTarget?.sourceEvidenceIds ?? sourceIds,
      deadlineAt: text(row.deadline_at ?? row.deadlineAt ?? row.deadline, 120) || fallbackTarget?.deadlineAt || null,
    })
  }
  addTarget({
    key: rootKey,
    label: rootTarget.label,
    target_kind: rootTarget.targetKind,
    role: 'primary',
    required: true,
    opportunity_id: rootTarget.opportunityId ?? null,
    source_evidence: sources,
  })
  for (const rawTarget of targetDefinitions.slice(0, APPLICATION_WORKFLOW_MAX_TARGETS)) addTarget(rawTarget)
  if (targetDefinitions.length > APPLICATION_WORKFLOW_MAX_TARGETS) errors.push('The official structure contains too many target definitions.')

  for (const rawGroup of rawGroups.slice(0, APPLICATION_WORKFLOW_MAX_GROUPS)) {
    const row = recordValue(rawGroup)
    const id = text(row.id ?? row.group_id ?? row.groupId, 120)
    const label = text(row.label ?? row.name, 500)
    const rawTargetKeys = list(row.target_keys ?? row.targetKeys ?? row.candidate_keys ?? row.candidateKeys, APPLICATION_WORKFLOW_MAX_TARGETS, 120)
    const groupEvidence = normalizeSources(row.source_evidence ?? row.sourceEvidence ?? row.evidence, sources).map(evidenceKey)
    const minSelections = boundedCount(row.min_selections ?? row.minSelections ?? row.minimum, 1)
    const maxSelections = boundedCount(row.max_selections ?? row.maxSelections ?? row.maximum, Math.max(minSelections, rawTargetKeys.length || minSelections))
    if (!id || !label || !groupEvidence.length || minSelections > maxSelections) {
      errors.push(`Selection group ${id || 'unnamed'} is incomplete or lacks official evidence.`)
      continue
    }
    // The provider's official group defines the target slots even when the
    // discovery pass has not yet found concrete candidates for them. Keep
    // those keys so discovery can fill the slots later; candidateKeys is a
    // search hint, not a second source of workflow truth.
    const validTargetKeys = rawTargetKeys
    groups.push({
      id,
      label,
      targetKind: targetKind(row.target_kind ?? row.targetKind, rootTarget.targetKind),
      minSelections,
      maxSelections,
      required: row.required !== false,
      relation: selectionRelation(row.relation, 'requires'),
      targetKeys: unique(validTargetKeys),
      sourceEvidenceIds: groupEvidence,
    })
  }
  if (rawGroups.length > APPLICATION_WORKFLOW_MAX_GROUPS) errors.push('The official structure contains too many selection groups.')

  // A group may list candidate keys before target definitions do. Materialize
  // those official candidates before parsing edges so dependencies can point
  // at every target the provider has already declared.
  for (const group of groups) {
    for (const key of group.targetKeys) {
      if (targets.some(target => target.key === key)) continue
      targets.push({ key, label: key, targetKind: group.targetKind, role: 'choice', required: false, opportunityId: null, caseId: null, selectionGroupId: group.id, parentKey: rootKey, sourceEvidenceIds: group.sourceEvidenceIds })
    }
  }
  for (const rawEdge of rawEdges.slice(0, APPLICATION_WORKFLOW_MAX_EDGES)) {
    const row = recordValue(rawEdge)
    const from = text(row.from ?? row.from_key ?? row.fromKey ?? row.prerequisite, 120)
    const to = text(row.to ?? row.to_key ?? row.toKey ?? row.dependent, 120)
    const edgeEvidence = normalizeSources(row.source_evidence ?? row.sourceEvidence ?? row.evidence, sources).map(evidenceKey)
    if (!from || !to || !edgeEvidence.length || from === to || !targets.some(target => target.key === from) || !targets.some(target => target.key === to)) {
      errors.push(`Workflow dependency ${from || '?'} → ${to || '?'} is incomplete or unsupported.`)
      continue
    }
    // `requires` is intentionally oriented prerequisite -> dependent.
    // This makes scheduling and human inspection read in the same direction.
    const edge: ApplicationWorkflowEdge = {
      from,
      to,
      relation: relation(row.relation, 'requires'),
      condition: text(row.condition, 500) || null,
      sourceEvidenceIds: edgeEvidence,
    }
    edges.push(edge)
  }
  if (rawEdges.length > APPLICATION_WORKFLOW_MAX_EDGES) errors.push('The official structure contains too many workflow dependencies.')

  for (const target of targets) {
    const group = groups.find(item => item.id === target.selectionGroupId)
    if (group && !group.targetKeys.includes(target.key)) group.targetKeys.push(target.key)
    const containingGroup = groups.find(item => item.targetKeys.includes(target.key))
    if (containingGroup && !target.selectionGroupId) target.selectionGroupId = containingGroup.id
  }
  const mode = workflowMode(raw.mode ?? raw.workflow_mode ?? raw.workflowMode, targets.length > 1 ? 'coupled_targets' : 'single_target')
  // A normal single-route programme may have no explicit choice list in its
  // provider instructions. Preserve the same selection boundary without
  // making the model invent a second target or leaving the route unusable.
  if (!groups.length && rawGroups.length === 0 && mode === 'single_target' && targets.length === 1) {
    groups.push({
      id: 'primary-target',
      label: 'Choose the graduate application target to pursue',
      targetKind: targets[0]!.targetKind,
      minSelections: 1,
      maxSelections: 1,
      required: true,
      relation: 'requires',
      targetKeys: [targets[0]!.key],
      sourceEvidenceIds: sourceIds,
    })
    targets[0]!.selectionGroupId = 'primary-target'
  }
  const valid = !errors.length && groups.length > 0 && targets.length > 0 && groups.every(group => group.targetKeys.length >= group.minSelections && group.maxSelections >= group.minSelections) && !cycleExists(edges)
  if (cycleExists(edges)) errors.push('The official dependency graph contains a cycle.')
  if (!valid) return { ...fallback, blockers: [...fallback.blockers, ...errors].slice(0, 8) }
  const spec: ApplicationWorkflowSpec = {
    version: APPLICATION_WORKFLOW_VERSION,
    status: 'verified',
    mode,
    rootTargetKey: targets.some(target => target.key === rootKey) ? rootKey : targets[0]!.key,
    targets: targets.slice(0, APPLICATION_WORKFLOW_MAX_TARGETS),
    selectionGroups: groups.slice(0, APPLICATION_WORKFLOW_MAX_GROUPS),
    edges: edges.slice(0, APPLICATION_WORKFLOW_MAX_EDGES),
    stages: [],
    sourceEvidence: sources,
    blockers: [],
    confidence: Math.min(1, 0.5 + Math.min(0.5, sources.length / 20)),
    compiledAt: input.now ?? new Date().toISOString(),
  }
  spec.stages = compileStages(spec.targets, spec.selectionGroups, spec.edges)
  return spec
}

/** Attach discovered shortlist candidates to the graph without changing its
 * official cardinality. This is what turns a Chevening-like group into actual
 * selectable course targets while keeping the provider's rule authoritative. */
export function attachApplicationWorkflowCandidates(
  spec: ApplicationWorkflowSpec,
  candidates: Array<{ candidateKey: string; label: string; targetKind: ApplicationWorkflowTargetKind; selectionGroupId?: string | null; parentKey?: string | null; role?: ApplicationWorkflowTargetRole; deadlineAt?: string | null }>,
) {
  const next: ApplicationWorkflowSpec = structuredClone(spec)
  const known = new Set(next.targets.map(target => target.key))
  const fallbackGroup = spec.status === 'needs_official_structure' && next.selectionGroups.length === 1 && next.selectionGroups[0]?.id === 'primary-target'
    ? next.selectionGroups[0]
    : null
  for (const candidate of candidates.slice(0, APPLICATION_WORKFLOW_MAX_TARGETS)) {
    const key = text(candidate.candidateKey, 120)
    if (!key) continue
    const group = candidate.selectionGroupId
      ? next.selectionGroups.find(item => item.id === candidate.selectionGroupId) ?? fallbackGroup
      : fallbackGroup
    if (!known.has(key)) {
      next.targets.push({
        key,
        label: text(candidate.label, 500) || key,
        targetKind: candidate.targetKind,
        role: candidate.role ?? (group ? 'choice' : 'alternative'),
        required: false,
        opportunityId: null,
        caseId: null,
        selectionGroupId: group?.id ?? null,
        parentKey: candidate.parentKey ?? null,
        sourceEvidenceIds: group?.sourceEvidenceIds ?? [],
        deadlineAt: candidate.deadlineAt ?? null,
      })
      known.add(key)
    }
    if (group && !group.targetKeys.includes(key)) group.targetKeys.push(key)
    const target = next.targets.find(item => item.key === key)
    if (group && target && !target.selectionGroupId) target.selectionGroupId = group.id
    if (target && candidate.deadlineAt !== undefined) target.deadlineAt = candidate.deadlineAt
  }
  if (!spec.selectionGroups.length && next.targets.length) {
    next.selectionGroups = [{
      id: 'primary-target',
      label: 'Choose the graduate application target to pursue',
      targetKind: next.targets[0]!.targetKind,
      minSelections: 1,
      maxSelections: 1,
      required: true,
      relation: 'alternative',
      targetKeys: next.targets.map(target => target.key),
      sourceEvidenceIds: next.sourceEvidence.map(evidenceKey),
    }]
    for (const target of next.targets) if (!target.selectionGroupId) target.selectionGroupId = 'primary-target'
  }
  next.stages = compileStages(next.targets, next.selectionGroups, next.edges)
  return next
}

export function bindApplicationWorkflowOpportunities(spec: ApplicationWorkflowSpec, bindings: ApplicationWorkflowCandidateBinding[]) {
  const byKey = new Map(bindings.map(binding => [binding.candidateKey, binding]))
  const next: ApplicationWorkflowSpec = structuredClone(spec)
  for (const target of next.targets) {
    const binding = byKey.get(target.key)
    if (!binding) continue
    target.opportunityId = binding.opportunityId
    if (binding.label) target.label = binding.label.slice(0, 500)
    if (binding.selectionGroupId) target.selectionGroupId = binding.selectionGroupId
    if (binding.parentKey) target.parentKey = binding.parentKey
    if (binding.role) target.role = binding.role
    if (binding.deadlineAt !== undefined) target.deadlineAt = binding.deadlineAt
  }
  next.stages = compileStages(next.targets, next.selectionGroups, next.edges)
  return next
}

export function bindApplicationWorkflowCases(spec: ApplicationWorkflowSpec, bindings: ApplicationWorkflowCaseBinding[]) {
  const byKey = new Map(bindings.map(binding => [binding.targetKey, binding.caseId]))
  const next: ApplicationWorkflowSpec = structuredClone(spec)
  for (const target of next.targets) {
    const caseId = byKey.get(target.key)
    if (caseId) target.caseId = caseId
  }
  return next
}

export function workflowSelectionPolicy(spec: ApplicationWorkflowSpec) {
  const groupedTargetKeys = new Set(spec.selectionGroups.flatMap(group => group.targetKeys))
  return spec.selectionGroups.map(group => ({
    id: group.id,
    label: group.label,
    targetKind: group.targetKind,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    required: group.required,
    targetKeys: group.targetKeys,
    availableOpportunityIds: nextAvailableOpportunityIds(spec, group),
    autoSelectedOpportunityIds: spec.targets
      .filter(target => target.required && !groupedTargetKeys.has(target.key) && target.opportunityId)
      .map(target => target.opportunityId!),
  }))
}

function nextAvailableOpportunityIds(spec: ApplicationWorkflowSpec, group: ApplicationWorkflowSelectionGroup) {
  return group.targetKeys.map(key => spec.targets.find(target => target.key === key)?.opportunityId ?? '').filter(Boolean)
}

/** The smallest candidate page that could satisfy every required selection
 * group plus every required target outside a group. This lets discovery
 * expand adaptively after the official structure reveals its cardinality. */
export function workflowMinimumCandidateCount(spec: ApplicationWorkflowSpec) {
  const requiredKeys = new Set<string>()
  for (const group of spec.selectionGroups) {
    if (!group.required) continue
    for (const key of group.targetKeys.slice(0, group.minSelections)) requiredKeys.add(key)
  }
  const groupedTargetKeys = new Set(spec.selectionGroups.flatMap(group => group.targetKeys))
  for (const target of spec.targets) {
    if (target.required && !groupedTargetKeys.has(target.key)) requiredKeys.add(target.key)
  }
  return Math.max(1, Math.min(APPLICATION_WORKFLOW_MAX_TARGETS, requiredKeys.size))
}

export function workflowNeedsCandidateExpansion(spec: ApplicationWorkflowSpec) {
  const groupedTargetKeys = new Set(spec.selectionGroups.flatMap(group => group.targetKeys))
  const missingRequiredTarget = spec.targets.some(target =>
    target.required && !groupedTargetKeys.has(target.key) && !target.opportunityId,
  )
  return spec.status === 'verified' && (
    missingRequiredTarget ||
    spec.selectionGroups.some(group =>
      group.required && nextAvailableOpportunityIds(spec, group).length < group.minSelections,
    )
  )
}

function autoSelectedOpportunityIds(spec: ApplicationWorkflowSpec) {
  const groupedTargetKeys = new Set(spec.selectionGroups.flatMap(group => group.targetKeys))
  return spec.targets
    .filter(target => target.required && !groupedTargetKeys.has(target.key) && target.opportunityId)
    .map(target => target.opportunityId!)
}

export function validateApplicationWorkflowSelection(spec: ApplicationWorkflowSpec, opportunityIds: string[], options: { allowPartial?: boolean } = {}) {
  if (spec.status !== 'verified') return { accepted: false as const, error: spec.blockers[0] ?? 'The official application structure still needs verification.' }
  const selected = unique([...opportunityIds, ...autoSelectedOpportunityIds(spec)].map(value => text(value, 120)))
  const selectedTargets = spec.targets.filter(target => target.opportunityId && selected.includes(target.opportunityId))
  if (selectedTargets.length !== selected.length) return { accepted: false as const, error: 'One or more selected application targets is no longer current.' }
  for (const group of spec.selectionGroups) {
    const count = selectedTargets.filter(target => target.selectionGroupId === group.id).length
    if (group.required && count < group.minSelections && !options.allowPartial) return { accepted: false as const, error: `${group.label} requires at least ${group.minSelections} selection${group.minSelections === 1 ? '' : 's'}.` }
    if (count > group.maxSelections) return { accepted: false as const, error: `${group.label} allows at most ${group.maxSelections} selection${group.maxSelections === 1 ? '' : 's'}.` }
  }
  const groupedTargetKeys = new Set(spec.selectionGroups.flatMap(group => group.targetKeys))
  const missingRequiredTargets = spec.targets.filter(target => target.required && !groupedTargetKeys.has(target.key) && !selected.includes(target.opportunityId ?? ''))
  if (missingRequiredTargets.length) return { accepted: false as const, error: 'Every required application target must be selected before execution can continue.' }
  const complete = spec.selectionGroups.every(group => {
    const count = selectedTargets.filter(target => target.selectionGroupId === group.id).length
    return !group.required || count >= group.minSelections
  })
  return { accepted: true as const, selectedIds: selected, complete }
}

function observationForTarget(observations: ApplicationWorkflowCaseObservation[], target: ApplicationWorkflowTarget) {
  return observations.find(observation => observation.targetKey === target.key) ?? null
}

function targetDependenciesSatisfied(spec: ApplicationWorkflowSpec, target: ApplicationWorkflowTarget, observations: ApplicationWorkflowCaseObservation[]) {
  const completed = new Set(observations.filter(observation => observation.complete).map(observation => observation.targetKey))
  return spec.edges
    .filter(edge => edge.to === target.key && edge.relation === 'requires')
    .every(edge => completed.has(edge.from))
}

/**
 * Choose one active lane from a bundle. The lane order is deterministic:
 * unlocked dependencies first, then deadline risk, then stable target key.
 * The worker may still run independent lanes across later turns, but only this
 * active case is exposed to case-bound tools in the current turn.
 */
export function scheduleApplicationWorkflow(
  spec: ApplicationWorkflowSpec,
  observations: ApplicationWorkflowCaseObservation[],
  selectedOpportunityIds: string[] = [],
): ApplicationWorkflowSchedule {
  const reasons: Record<string, string> = {}
  const observedTargetKeys = new Set(observations.map(observation => observation.targetKey))
  const selected = new Set(selectedOpportunityIds.map(value => text(value, 120)).filter(Boolean))
  // Selection-group candidates become required only after a durable case has
  // been created for that candidate. Once the controller has committed a
  // selection, however, every selected candidate is required even before its
  // case exists; otherwise the first created case could falsely complete a
  // multi-target bundle.
  const requiredTargets = spec.targets.filter(target => {
    const selectedTarget = Boolean(target.opportunityId && selected.has(target.opportunityId))
    return target.required || selectedTarget || (!selected.size && observedTargetKeys.has(target.key))
  })
  const completed = requiredTargets.filter(target => observationForTarget(observations, target)?.complete)
  const blockedBySelection = new Set<string>()
  for (const group of spec.selectionGroups) {
    const available = group.targetKeys.filter(key => spec.targets.find(target => target.key === key)?.opportunityId)
    const selectedKeys = selected.size
      ? available.filter(key => selected.has(spec.targets.find(target => target.key === key)?.opportunityId ?? ''))
      : available.filter(key => observationForTarget(observations, spec.targets.find(target => target.key === key)!) != null)
    if (group.required && available.length < group.minSelections) {
      for (const key of group.targetKeys) blockedBySelection.add(key)
      reasons[group.id] = `${group.label} needs ${group.minSelections} verified target${group.minSelections === 1 ? '' : 's'} before execution can continue.`
    } else if (group.required && selectedKeys.length < group.minSelections) {
      for (const key of group.targetKeys) blockedBySelection.add(key)
      reasons[group.id] = `${group.label} still needs the applicant's selection.`
    }
  }
  const runnable = requiredTargets.filter(target => {
    const observation = observationForTarget(observations, target)
    if (observation?.complete || blockedBySelection.has(target.key)) return false
    if (!targetDependenciesSatisfied(spec, target, observations)) {
      reasons[target.key] = 'Waiting for a required linked application target.'
      return false
    }
    if (!observation) {
      reasons[target.key] = 'The durable application workspace has not been created yet.'
      return false
    }
    return ['awaiting_user', 'awaiting_writer', 'awaiting_referee', 'awaiting_institution'].includes(observation.status) === false
  })
  const waiting = requiredTargets.filter(target => {
    const observation = observationForTarget(observations, target)
    return Boolean(observation && !observation.complete && ['awaiting_user', 'awaiting_writer', 'awaiting_referee', 'awaiting_institution'].includes(observation.status))
  }).map(target => target.key)
  const blocked = [...new Set([...blockedBySelection, ...requiredTargets.filter(target => !observationForTarget(observations, target) || !targetDependenciesSatisfied(spec, target, observations)).map(target => target.key)])]
  const active = runnable
    .slice()
    .sort((left, right) => {
      const leftObservation = observationForTarget(observations, left)
      const rightObservation = observationForTarget(observations, right)
      const leftDeadline = leftObservation?.deadlineAt ?? left.deadlineAt ? Date.parse(leftObservation?.deadlineAt ?? left.deadlineAt ?? '') : Number.POSITIVE_INFINITY
      const rightDeadline = rightObservation?.deadlineAt ?? right.deadlineAt ? Date.parse(rightObservation?.deadlineAt ?? right.deadlineAt ?? '') : Number.POSITIVE_INFINITY
      return leftDeadline - rightDeadline || left.key.localeCompare(right.key)
    })[0] ?? null
  return {
    activeTargetKey: active?.key ?? null,
    activeCaseId: active ? observationForTarget(observations, active)?.caseId ?? null : null,
    runnableTargetKeys: runnable.map(target => target.key),
    waitingTargetKeys: waiting,
    blockedTargetKeys: blocked,
    completedTargetKeys: completed.map(target => target.key),
    complete: spec.status === 'verified' && requiredTargets.length > 0 && completed.length === requiredTargets.length,
    reasons,
  }
}

export function applicationWorkflowSummary(spec: ApplicationWorkflowSpec | null, selectedOpportunityIds: string[] = []) {
  if (!spec) return null
  const selected = new Set(selectedOpportunityIds.map(value => text(value, 120)).filter(Boolean))
  return {
    version: spec.version,
    status: spec.status,
    mode: spec.mode,
    rootTargetKey: spec.rootTargetKey,
    targets: spec.targets.map(target => ({ key: target.key, label: target.label, targetKind: target.targetKind, role: target.role, required: target.required, opportunityId: target.opportunityId, caseId: target.caseId, selectionGroupId: target.selectionGroupId, parentKey: target.parentKey, deadlineAt: target.deadlineAt ?? null })),
    selectionGroups: spec.selectionGroups.map(group => {
      const availableOpportunityIds = nextAvailableOpportunityIds(spec, group)
      return { id: group.id, label: group.label, targetKind: group.targetKind, minSelections: group.minSelections, maxSelections: group.maxSelections, required: group.required, availableOpportunityIds, selectedOpportunityIds: availableOpportunityIds.filter(id => selected.has(id)) }
    }),
    edges: spec.edges,
    blockers: spec.blockers,
    confidence: spec.confidence,
  }
}
