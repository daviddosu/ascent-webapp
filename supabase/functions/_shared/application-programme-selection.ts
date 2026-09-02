import type {
  RecommendationInteraction,
  RecommendationInteractionOption,
} from './recommendation-workflow.ts'

export type ApplicationProgrammeSelectionOpportunity = {
  id: string
  institution: string
  programmeTitle: string
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
export type ApplicationProgrammeSelectionInteraction = Omit<RecommendationChoiceInteraction, 'kind'> & { kind: 'single_choice' }

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
}

/**
 * Pure transition guard used at the persistence boundary. It makes retries
 * safe while preventing a stale client from changing an active task's target.
 */
export function resolveApplicationProgrammeSelectionCommit(input: {
  selectedOpportunityId: string
  committedOpportunityId?: string | null
  taskId: string
  existingCases?: ApplicationProgrammeSelectionCaseReference[]
}): ApplicationProgrammeSelectionCommit {
  const selectedOpportunityId = input.selectedOpportunityId.trim()
  const committedOpportunityId = input.committedOpportunityId?.trim() || ''
  const existingCases = input.existingCases ?? []
  if (!selectedOpportunityId) return { kind: 'conflict', error: 'Choose one programme to continue.' }
  if (committedOpportunityId && committedOpportunityId !== selectedOpportunityId) {
    return { kind: 'conflict', error: 'This task is already committed to another programme. Create a new task if you want to pursue a different programme.' }
  }
  if (existingCases.some(reference => reference.opportunityId !== selectedOpportunityId)) {
    return { kind: 'conflict', error: 'This application task already has a different programme workspace. The selected programme was not changed.' }
  }
  const selectedCase = existingCases.find(reference => reference.opportunityId === selectedOpportunityId)
  if (selectedCase && selectedCase.taskId !== input.taskId) {
    return { kind: 'conflict', error: 'This programme is already connected to another application task. The selected programme was not changed.' }
  }
  return {
    kind: committedOpportunityId ? 'replayed' : 'committed',
    opportunityId: selectedOpportunityId,
    applicationCaseId: selectedCase?.caseId ?? null,
  }
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
  if (opportunity.routeType === 'adjacent_programme') return 'Related programme'
  if (opportunity.routeType === 'department_route') return 'Department route'
  if (opportunity.routeType === 'graduate_school_route') return 'Graduate-school route'
  return 'Direct programme'
}

export function createApplicationProgrammeSelectionInteraction(
  campaignId: string,
  opportunities: ApplicationProgrammeSelectionOpportunity[],
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
  return {
    id: `application:programme-selection:${campaignId}`,
    requirementId: 'application_programme_selection',
    question: 'Which programme do you want to apply to?',
    reason: 'I checked official programme pages and matched the verified options to your CV. Choose one programme and I’ll continue the application here.',
    knownContext: ['Official programme pages, deadlines, and current requirements were checked before showing these options.'],
    reusableContextKeys: [],
    required: true,
    priority: 2,
    mapsToRequirement: 'application_programme_selection',
    kind: 'single_choice',
    options,
    allowOther: false,
  }
}

export function validateApplicationProgrammeSelection(
  interaction: ApplicationProgrammeSelectionInteraction,
  value: unknown,
): { accepted: true; selectedIds: string[] } | { accepted: false; error: string } {
  const rawValues = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const selectedIds = [...new Set(rawValues.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean))]
  const allowed = new Set(interaction.options.map(option => option.value))
  if (selectedIds.length !== 1) {
    return { accepted: false, error: 'Choose one programme to continue.' }
  }
  if (selectedIds.some(id => !allowed.has(id))) {
    return { accepted: false, error: 'One of those programme choices is no longer current. Refresh the task and choose from the current shortlist.' }
  }
  return { accepted: true, selectedIds }
}
