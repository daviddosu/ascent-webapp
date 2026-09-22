import type {
  RecommendationInteraction,
  RecommendationInteractionOption,
} from './recommendation-workflow.ts'
import type { ApplicationWorkflowSelectionGroup } from './application-workflow.ts'

export type ApplicationProgrammeSelectionOpportunity = {
  id: string
  institution: string
  programmeTitle: string
  opportunityKind?: 'programme' | 'scholarship' | null
  officialUrl: string
  fitScore: number
  deadlineAt: string | null
  confidence?: number | null
  fitRationale?: string | null
  requirementsSummary?: string[]
  routeType?: string | null
  routeLabel?: string | null
  discoveryReason?: string | null
  researchAreas?: string[]
  methods?: string[]
  facultyLabs?: Array<{ name: string; role?: string | null; officialUrl?: string | null; researchAreas?: string[]; evidence?: string }>
  eligibility?: { status?: string; requirements?: string[]; uncertainties?: string[]; evidence?: string[] } | null
  currentCycle?: { intakeYear?: number | null; deadlineStatus?: string; notes?: string[]; sourceUrls?: string[] } | null
  matchDimensions?: Record<string, number> | null
  matchEvidence?: Array<{ dimension?: string; applicantEvidence?: string; opportunityEvidence?: string; sourceUrl?: string | null }>
}

type RecommendationChoiceInteraction = Extract<RecommendationInteraction, { kind: 'single_choice' | 'contact_select' | 'attachment_selection' }>
type RecommendationMultipleChoiceInteraction = Extract<RecommendationInteraction, { kind: 'multiple_choice' }>
export type ApplicationProgrammeSelectionInteraction =
  | (Omit<RecommendationChoiceInteraction, 'kind'> & { kind: 'single_choice'; targetKind?: 'programme' | 'scholarship'; selectionGroupId?: string | null; selectionLabel?: string | null; minSelections?: 1; maxSelections?: 1 })
  | (Omit<RecommendationMultipleChoiceInteraction, 'kind'> & { kind: 'multiple_choice'; targetKind?: 'programme' | 'scholarship'; selectionGroupId?: string | null; selectionLabel?: string | null })

export type ApplicationProgrammeSelectionCaseReference = {
  opportunityId: string
  caseId: string
  taskId: string
}

export type ApplicationProgrammeSelectionCommit = {
  kind: 'committed' | 'replayed'
  opportunityId: string
  applicationCaseId: string | null
} | {
  kind: 'conflict'
  error: string
} | {
  kind: 'committed' | 'replayed'
  opportunityIds: string[]
  applicationCaseIds: string[]
}

/**
 * Pure transition guard used at the persistence boundary. It makes retries
 * safe while preventing a stale client from changing an active task's target.
 */
export function resolveApplicationProgrammeSelectionCommit(input: {
  selectedOpportunityId?: string
  selectedOpportunityIds?: string[]
  committedOpportunityId?: string | null
  committedOpportunityIds?: string[]
  allowExpansion?: boolean
  taskId: string
  existingCases?: ApplicationProgrammeSelectionCaseReference[]
}): ApplicationProgrammeSelectionCommit {
  const selectedOpportunityIds = [...new Set([
    ...(input.selectedOpportunityIds ?? []),
    ...(input.selectedOpportunityId ? [input.selectedOpportunityId] : []),
  ].map(value => value.trim()).filter(Boolean))]
  const committedOpportunityIds = [...new Set([
    ...(input.committedOpportunityIds ?? []),
    ...(input.committedOpportunityId ? [input.committedOpportunityId] : []),
  ].map(value => value.trim()).filter(Boolean))]
  const existingCases = input.existingCases ?? []
  const legacySingle = !input.selectedOpportunityIds?.length && selectedOpportunityIds.length === 1
  if (!selectedOpportunityIds.length) return { kind: 'conflict', error: 'Choose at least one application target to continue.' }
  const committedIsSubset = committedOpportunityIds.every(id => selectedOpportunityIds.includes(id))
  const expansionAllowed = input.allowExpansion === true && !legacySingle
  if (committedOpportunityIds.length && (!committedIsSubset || (!expansionAllowed && committedOpportunityIds.length !== selectedOpportunityIds.length))) {
    return { kind: 'conflict', error: 'This task is already committed to a different set of application targets. The existing application bundle was not changed.' }
  }
  if (existingCases.some(reference => !selectedOpportunityIds.includes(reference.opportunityId))) {
    return { kind: 'conflict', error: 'This application task already has a different application workspace. The selected application bundle was not changed.' }
  }
  const foreignCase = existingCases.find(reference => selectedOpportunityIds.includes(reference.opportunityId) && reference.taskId !== input.taskId)
  if (foreignCase) {
    return { kind: 'conflict', error: 'This application target is already connected to another application task. The selected target was not changed.' }
  }
  const selectedCases = existingCases.filter(reference => selectedOpportunityIds.includes(reference.opportunityId))
  if (legacySingle) {
    return {
      kind: committedOpportunityIds.length ? 'replayed' : 'committed',
      opportunityId: selectedOpportunityIds[0]!,
      applicationCaseId: selectedCases[0]?.caseId ?? null,
    }
  }
  return { kind: committedOpportunityIds.length ? 'replayed' : 'committed', opportunityIds: selectedOpportunityIds, applicationCaseIds: selectedCases.map(reference => reference.caseId) }
}

function deadlineLabel(value: string | null) {
  if (!value) return ''
  const date = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? ` · Deadline ${date}` : ''
}

function fitScoreLabel(value: number) {
  const score = Math.max(0, Math.min(100, Number(value) || 0)) / 10
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function routeLabel(opportunity: ApplicationProgrammeSelectionOpportunity) {
  if (opportunity.routeLabel) return opportunity.routeLabel
  if (opportunity.opportunityKind === 'scholarship' || opportunity.routeType === 'graduate_scholarship') return 'Graduate scholarship'
  if (opportunity.routeType === 'adjacent_programme') return 'Related programme'
  if (opportunity.routeType === 'department_route') return 'Department route'
  if (opportunity.routeType === 'graduate_school_route') return 'Graduate-school route'
  return 'Direct programme'
}

export function createApplicationProgrammeSelectionInteraction(
  campaignId: string,
  opportunities: ApplicationProgrammeSelectionOpportunity[],
  targetKind: 'programme' | 'scholarship' = 'programme',
  selectionGroup?: ApplicationWorkflowSelectionGroup | null,
): ApplicationProgrammeSelectionInteraction {
  const options: RecommendationInteractionOption[] = opportunities.map(opportunity => ({
    value: opportunity.id,
    label: `${opportunity.institution} · ${opportunity.programmeTitle}`,
    description: `${routeLabel(opportunity)} · ${opportunity.fitScore > 0 ? `CV fit ${fitScoreLabel(opportunity.fitScore)}/10` : 'CV fit not scored yet'}${deadlineLabel(opportunity.deadlineAt)}`,
    info: [
      opportunity.fitRationale ? `Why it fits: ${opportunity.fitRationale}` : '',
      opportunity.discoveryReason ? `Why it was found: ${opportunity.discoveryReason}` : '',
      opportunity.researchAreas?.length ? `Research areas: ${opportunity.researchAreas.slice(0, 6).join(', ')}` : '',
      opportunity.methods?.length ? `Methods: ${opportunity.methods.slice(0, 6).join(', ')}` : '',
      opportunity.facultyLabs?.length ? `Faculty or labs: ${opportunity.facultyLabs.slice(0, 4).map(faculty => faculty.name).join(', ')}` : '',
      opportunity.matchEvidence?.length ? `CV evidence: ${opportunity.matchEvidence.slice(0, 4).map(item => item.applicantEvidence).filter(Boolean).join('; ')}` : '',
      opportunity.requirementsSummary?.length ? `Key requirements: ${opportunity.requirementsSummary.join('; ')}` : '',
      opportunity.eligibility?.status ? `Eligibility check: ${opportunity.eligibility.status}${opportunity.eligibility.uncertainties?.length ? ` — ${opportunity.eligibility.uncertainties.join('; ')}` : ''}` : '',
      opportunity.currentCycle?.deadlineStatus && opportunity.currentCycle.deadlineStatus !== 'confirmed' ? `Deadline: ${opportunity.currentCycle.deadlineStatus.replaceAll('_', ' ')}` : '',
      opportunity.confidence ? `Source confidence: ${Math.round(Math.max(0, Math.min(100, opportunity.confidence)))}%` : '',
      opportunity.officialUrl ? `Official source: ${opportunity.officialUrl}` : '',
    ].filter(Boolean).join('\n'),
    href: opportunity.officialUrl || undefined,
  }))
  const multiple = Boolean(selectionGroup && selectionGroup.maxSelections > 1)
  const selectionLabel = selectionGroup?.label ?? null
  const targetLabel = selectionGroup?.targetKind === 'course'
    ? 'course'
    : selectionGroup?.targetKind === 'institution'
      ? 'institution'
      : targetKind === 'scholarship' ? 'graduate scholarship' : 'graduate programme'
  const base = {
    id: `application:programme-selection:${campaignId}${selectionGroup?.id ? `:${selectionGroup.id}` : ''}`,
    requirementId: 'application_programme_selection',
    question: selectionLabel ?? (multiple
      ? `Which ${targetLabel}${selectionGroup!.maxSelections === selectionGroup!.minSelections ? `s (${selectionGroup!.minSelections})` : 's'} do you want to apply for?`
      : targetKind === 'scholarship' ? 'Which graduate scholarship do you want to apply for?' : 'Which programme do you want to apply to?'),
    reason: targetKind === 'scholarship'
      ? `I checked official scholarship and linked-route pages. ${multiple ? `Choose ${selectionGroup!.minSelections === selectionGroup!.maxSelections ? `exactly ${selectionGroup!.minSelections}` : `between ${selectionGroup!.minSelections} and ${selectionGroup!.maxSelections}`} linked ${targetLabel}${selectionGroup!.maxSelections === 1 ? '' : 's'}; each selected route will get its own application workspace.` : 'Choose the scholarship and I’ll continue the application here.'}`
      : `I checked official programme pages and matched the verified options to your CV. ${multiple ? `Choose ${selectionGroup!.minSelections === selectionGroup!.maxSelections ? `exactly ${selectionGroup!.minSelections}` : `between ${selectionGroup!.minSelections} and ${selectionGroup!.maxSelections}`} ${targetLabel}${selectionGroup!.maxSelections === 1 ? '' : 's'}.` : 'Choose one programme and I’ll continue the application here.'}`,
    knownContext: [targetKind === 'scholarship' ? 'Official scholarship, linked-route, deadline, and current requirements were checked before showing these options.' : 'Official programme pages, deadlines, and current requirements were checked before showing these options.'],
    reusableContextKeys: [],
    required: true,
    priority: 2,
    mapsToRequirement: 'application_programme_selection',
    options,
    targetKind,
    selectionGroupId: selectionGroup?.id ?? null,
    selectionLabel,
  }
  return multiple
    ? { ...base, kind: 'multiple_choice' as const, minSelections: selectionGroup!.minSelections, maxSelections: selectionGroup!.maxSelections }
    : { ...base, kind: 'single_choice' as const, allowOther: false as const, minSelections: 1 as const, maxSelections: 1 as const }
}

export function validateApplicationProgrammeSelection(
  interaction: ApplicationProgrammeSelectionInteraction,
  value: unknown,
): { accepted: true; selectedIds: string[] } | { accepted: false; error: string } {
  const rawValues = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const selectedIds = [...new Set(rawValues.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean))]
  const allowed = new Set(interaction.options.map(option => option.value))
  const minSelections = interaction.kind === 'multiple_choice' ? interaction.minSelections : 1
  const maxSelections = interaction.kind === 'multiple_choice' ? interaction.maxSelections : 1
  if (selectedIds.length < minSelections || selectedIds.length > maxSelections) {
    if (interaction.kind === 'single_choice') {
      return { accepted: false, error: `Choose one ${interaction.targetKind === 'scholarship' ? 'scholarship' : 'programme'} to continue.` }
    }
    return { accepted: false, error: minSelections === maxSelections ? `Choose exactly ${minSelections} application target${minSelections === 1 ? '' : 's'} to continue.` : `Choose between ${minSelections} and ${maxSelections} application targets to continue.` }
  }
  if (selectedIds.some(id => !allowed.has(id))) {
    return { accepted: false, error: 'One of those programme choices is no longer current. Refresh the task and choose from the current shortlist.' }
  }
  return { accepted: true, selectedIds }
}
