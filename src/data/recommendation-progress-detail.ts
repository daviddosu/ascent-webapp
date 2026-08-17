import type { RecommendationInteraction } from '../../supabase/functions/_shared/recommendation-workflow'
import { humanizeAgentProgressLabel } from './agent-progress'

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function options(interaction: Extract<RecommendationInteraction, { kind: 'single_choice' | 'multiple_choice' | 'contact_select' | 'attachment_selection' }>, taskId: string) {
  return interaction.options.map(option => {
    const description = option.description ? `<small>${escapeHtml(humanizeAgentProgressLabel(option.description))}</small>` : ''
    if (interaction.kind === 'multiple_choice') return `<label class="recommendation-choice recommendation-choice--multiple"><input type="checkbox" data-recommendation-choice data-interaction-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : ''}><span><strong>${escapeHtml(option.label)}</strong>${description}</span></label>`
    return `<button type="button" class="recommendation-choice" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" data-interaction-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : ''}><strong>${escapeHtml(option.label)}</strong>${description}</button>`
  }).join('')
}

/** Render the bounded Progress Detail contract; no interaction falls back to a broad question. */
export function renderRecommendationProgressDetail(interaction: RecommendationInteraction, taskId: string, busy = false) {
  const knownContext = interaction.knownContext.length
    ? `<div class="recommendation-known-context"><strong>What I already resolved</strong><ul>${interaction.knownContext.map(item => `<li>${escapeHtml(humanizeAgentProgressLabel(item))}</li>`).join('')}</ul></div>`
    : ''
  const reason = `<p class="recommendation-interaction-reason">${escapeHtml(humanizeAgentProgressLabel(interaction.reason))}</p>`
  const disabled = busy ? 'disabled' : ''
  let control = ''
  if (interaction.kind === 'approval' || interaction.kind === 'confirmation') {
    control = `<div class="recommendation-interaction-actions"><button class="agent-primary" type="button" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" data-interaction-value="true" ${disabled}>${escapeHtml(interaction.confirmLabel)}</button><button type="button" data-action="cancel-agent" data-task-id="${escapeHtml(taskId)}" ${disabled}>${escapeHtml(interaction.cancelLabel)}</button></div>`
  } else if (interaction.kind === 'single_choice' || interaction.kind === 'contact_select' || interaction.kind === 'attachment_selection' || interaction.kind === 'multiple_choice') {
    const multipleChoiceLabel = interaction.mapsToRequirement === 'application_programme_selection' ? 'Create application tasks' : 'Continue'
    control = `<div class="recommendation-interaction-options">${options(interaction, taskId)}</div>${interaction.kind === 'multiple_choice' ? `<button class="agent-primary" type="button" data-action="submit-recommendation-multiple" data-task-id="${escapeHtml(taskId)}" ${disabled}>${multipleChoiceLabel}</button>` : ''}`
  } else if (interaction.kind === 'attachment_request') {
    control = `<label class="recommendation-attachment-input"><span>${escapeHtml(humanizeAgentProgressLabel(interaction.attachmentPrompt))}</span><input type="file" data-recommendation-file data-task-id="${escapeHtml(taskId)}" accept="${escapeHtml(interaction.acceptedMimeTypes.join(','))}" ${interaction.maximumFiles > 1 ? 'multiple' : ''} ${disabled}></label><small>Files remain private to this task unless you explicitly mark them reusable.</small>`
  } else {
    const inputType = interaction.kind === 'date' ? 'date' : interaction.kind === 'email' ? 'email' : interaction.kind === 'fact' && interaction.inputType === 'number' ? 'number' : 'text'
    const value = 'currentValue' in interaction && interaction.currentValue !== null ? String(interaction.currentValue) : ''
    const placeholder = 'placeholder' in interaction ? humanizeAgentProgressLabel(interaction.placeholder) : interaction.kind === 'date' ? 'YYYY-MM-DD' : 'Add the missing detail'
    control = `<label class="recommendation-interaction-input"><span>${interaction.kind === 'fact' ? escapeHtml(interaction.field) : 'Your answer'}</span><input type="${inputType}" data-recommendation-input data-task-id="${escapeHtml(taskId)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" maxlength="${'maximumCharacters' in interaction ? interaction.maximumCharacters : 600}" ${disabled}></label><button class="agent-primary" type="button" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" ${disabled}>Continue</button>`
  }
  return `<section class="recommendation-progress-detail" data-recommendation-interaction-id="${escapeHtml(interaction.id)}"><header><strong>Next step</strong><span class="task-agent-header-mark" role="img" aria-label="Your input is needed">!</span></header><h4>${escapeHtml(humanizeAgentProgressLabel(interaction.question))}</h4>${reason}${knownContext}${control}</section>`
}
