import type { SupplementalProgressInteraction } from '../../supabase/functions/_shared/application-questions'
import { humanizeAgentProgressLabel, progressDetailWindow } from './agent-progress'

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
function constraint(interaction: SupplementalProgressInteraction) {
  if (interaction.minimum !== null && interaction.maximum !== null) return `${interaction.minimum}-${interaction.maximum} ${interaction.unit}`
  if (interaction.maximum !== null) return `Maximum ${interaction.maximum} ${interaction.unit}`
  if (interaction.minimum !== null) return `Minimum ${interaction.minimum} ${interaction.unit}`
  return 'No length limit listed'
}

/** Uses the existing Progress Detail surface for one necessary application decision. */
export function renderApplicationQuestionProgressDetail(interaction: SupplementalProgressInteraction, taskId: string, busy = false) {
  const disabled = busy ? 'disabled' : ''
  const knownContextWindow = progressDetailWindow(interaction.knownContext)
  const knownContext = interaction.knownContext.length
    ? `<div class="recommendation-known-context"><strong>Already done</strong><ul>${knownContextWindow.visible.map(item => `<li>${escapeHtml(humanizeAgentProgressLabel(item))}</li>`).join('')}</ul>${knownContextWindow.overflow.length ? `<details class="recommendation-progress-more"><summary>Show ${knownContextWindow.overflow.length} more</summary><ul>${knownContextWindow.overflow.map(item => `<li>${escapeHtml(humanizeAgentProgressLabel(item))}</li>`).join('')}</ul></details>` : ''}</div>`
    : ''
  const optionWindow = progressDetailWindow(interaction.options)
  const optionMarkup = optionWindow.visible.map(option => `<button type="button" class="recommendation-choice" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" data-interaction-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : disabled}><strong>${escapeHtml(humanizeAgentProgressLabel(option.label))}</strong></button>`).join('')
  const overflowOptions = optionWindow.overflow.length
    ? `<details class="recommendation-progress-more"><summary>Show ${optionWindow.overflow.length} more option${optionWindow.overflow.length === 1 ? '' : 's'}</summary>${optionWindow.overflow.map(option => `<button type="button" class="recommendation-choice" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" data-interaction-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : disabled}><strong>${escapeHtml(humanizeAgentProgressLabel(option.label))}</strong></button>`).join('')}</details>`
    : ''
  const options = interaction.options.length
    ? `<div class="recommendation-interaction-options">${optionMarkup}${overflowOptions}</div>`
    : ''
  const narrative = ['short_essay', 'motivation', 'programme_fit', 'research_interest', 'career_goals', 'personal_background', 'leadership', 'challenge_adversity', 'community', 'diversity', 'ethical_conduct', 'academic_explanation', 'additional_information'].includes(interaction.questionType ?? '')
  const inputType = interaction.inputType === 'date' ? 'date' : interaction.inputType === 'number' ? 'number' : /\bemail\b/i.test(interaction.question) ? 'email' : 'text'
  const inputLabel = /\bemail\b/i.test(interaction.question) ? 'Email address' : /\b(?:full\s+name|legal\s+name|your\s+name)\b/i.test(interaction.question) ? 'Full name' : 'The exact answer'
  const input = options ? '' : `<label class="recommendation-interaction-input"><span>${escapeHtml(inputLabel)} · ${escapeHtml(constraint(interaction))}</span>${narrative ? `<textarea rows="5" data-application-question-input data-recommendation-input data-task-id="${escapeHtml(taskId)}" placeholder="${escapeHtml(humanizeAgentProgressLabel(interaction.placeholder))}" ${interaction.maximum !== null && interaction.unit === 'characters' ? `maxlength="${interaction.maximum}"` : ''} ${disabled}>${escapeHtml(interaction.currentValue ?? '')}</textarea>` : `<input type="${inputType}" data-application-question-input data-recommendation-input data-task-id="${escapeHtml(taskId)}" value="${escapeHtml(interaction.currentValue ?? '')}" placeholder="${escapeHtml(humanizeAgentProgressLabel(interaction.placeholder))}" ${interaction.maximum !== null && interaction.unit === 'characters' ? `maxlength="${interaction.maximum}"` : ''} ${disabled}>`}</label><button class="agent-primary" type="button" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" ${disabled}>Save and continue</button>`
  return `<section class="recommendation-progress-detail application-question-progress-detail" data-progress-detail data-recommendation-interaction-id="${escapeHtml(interaction.id)}"><header><strong>Next step</strong><span class="task-agent-header-mark" role="img" aria-label="Your input is needed">!</span></header><h4>${escapeHtml(humanizeAgentProgressLabel(interaction.question))}</h4><p class="recommendation-interaction-reason">${escapeHtml(humanizeAgentProgressLabel(interaction.reason))}</p><small class="application-question-constraint">${escapeHtml(constraint(interaction))}</small>${knownContext}${options}${input}</section>`
}
