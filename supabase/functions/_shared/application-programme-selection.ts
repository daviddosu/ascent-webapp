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
}

export type ApplicationProgrammeSelectionInteraction = Extract<RecommendationInteraction, { kind: 'multiple_choice' }>

function deadlineLabel(value: string | null) {
  if (!value) return ''
  const date = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? ` · Deadline ${date}` : ''
}

export function createApplicationProgrammeSelectionInteraction(
  campaignId: string,
  opportunities: ApplicationProgrammeSelectionOpportunity[],
): ApplicationProgrammeSelectionInteraction {
  const options: RecommendationInteractionOption[] = opportunities.map(opportunity => ({
    value: opportunity.id,
    label: `${opportunity.institution} · ${opportunity.programmeTitle}`,
    description: `Official programme page${opportunity.fitScore > 0 ? ` · Fit ${Math.round(opportunity.fitScore)}%` : ''}${deadlineLabel(opportunity.deadlineAt)}`,
  }))
  return {
    id: `application:programme-selection:${campaignId}`,
    requirementId: 'application_programme_selection',
    question: 'Which programmes should I turn into application tasks?',
    reason: 'Each application task covers exactly one programme. Select every verified programme you want to pursue, and I will create one separate to-do task for each selection.',
    knownContext: ['Official programme pages and current requirements were verified for this shortlist.'],
    reusableContextKeys: [],
    required: true,
    priority: 2,
    mapsToRequirement: 'application_programme_selection',
    kind: 'multiple_choice',
    options,
    minSelections: 1,
    maxSelections: options.length,
  }
}

export function validateApplicationProgrammeSelection(
  interaction: ApplicationProgrammeSelectionInteraction,
  value: unknown,
): { accepted: true; selectedIds: string[] } | { accepted: false; error: string } {
  const rawValues = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const selectedIds = [...new Set(rawValues.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean))]
  const allowed = new Set(interaction.options.map(option => option.value))
  if (selectedIds.length < interaction.minSelections) {
    return { accepted: false, error: `Select at least ${interaction.minSelections} programme${interaction.minSelections === 1 ? '' : 's'}.` }
  }
  if (selectedIds.length > interaction.maxSelections) {
    return { accepted: false, error: `Select no more than ${interaction.maxSelections} programmes.` }
  }
  if (selectedIds.some(id => !allowed.has(id))) {
    return { accepted: false, error: 'One of those programme choices is no longer current. Refresh the task and choose from the current shortlist.' }
  }
  return { accepted: true, selectedIds }
}
