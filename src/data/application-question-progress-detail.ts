import type { SupplementalProgressInteraction } from '../../supabase/functions/_shared/application-questions'
import { humanizeAgentProgressLabel } from './agent-progress'

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
function constraint(interaction: SupplementalProgressInteraction) {
  if (interaction.minimum !== null && interaction.maximum !== null) return `${interaction.minimum}-${interaction.maximum} ${interaction.unit}`
  if (interaction.maximum !== null) return `Maximum ${interaction.maximum} ${interaction.unit}`
  if (interaction.minimum !== null) return `Minimum ${interaction.minimum} ${interaction.unit}`
  return 'No explicit length limit observed'
}

/** Uses the existing Progress Detail surface for one necessary application decision. */
export function renderApplicationQuestionProgressDetail(interaction: SupplementalProgressInteraction, taskId: string, busy = false) {
  const disabled = busy ? 'disabled' : ''
  const knownContext = interaction.knownContext.length
    ? `<div class="recommendation-known-context"><strong>Already resolved</strong><ul>${interaction.knownContext.map(item => `<li>${escapeHtml(humanizeAgentProgressLabel(item))}</li>`).join('')}</ul></div>`
    : ''
  const options = interaction.options.length
    ? `<div class="recommendation-interaction-options">${interaction.options.map(option => `<button type="button" class="recommendation-choice" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" data-interaction-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : disabled}><strong>${escapeHtml(humanizeAgentProgressLabel(option.label))}</strong></button>`).join('')}</div>`
    : ''
  const input = options ? '' : `<label class="recommendation-interaction-input"><span>Your answer · ${escapeHtml(constraint(interaction))}</span><textarea rows="5" data-application-question-input data-recommendation-input data-task-id="${escapeHtml(taskId)}" placeholder="${escapeHtml(humanizeAgentProgressLabel(interaction.placeholder))}" ${interaction.maximum !== null && interaction.unit === 'characters' ? `maxlength="${interaction.maximum}"` : ''} ${disabled}>${escapeHtml(interaction.currentValue ?? '')}</textarea></label><button class="agent-primary" type="button" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" ${disabled}>Continue</button>`
  return `<section class="recommendation-progress-detail application-question-progress-detail" data-progress-detail data-recommendation-interaction-id="${escapeHtml(interaction.id)}"><header><strong>Next step</strong><span class="task-agent-header-mark" role="img" aria-label="Your input is needed">!</span></header><h4>${escapeHtml(humanizeAgentProgressLabel(interaction.question))}</h4><p class="recommendation-interaction-reason">${escapeHtml(humanizeAgentProgressLabel(interaction.reason))}</p><small class="application-question-constraint">${escapeHtml(constraint(interaction))}</small>${knownContext}${options}${input}</section>`
}
