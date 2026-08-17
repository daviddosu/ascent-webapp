import type { WorkSampleInteraction } from '../../supabase/functions/_shared/work-sample-workflow'
import { humanizeAgentProgressLabel } from './agent-progress'

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function renderOptions(interaction: WorkSampleInteraction, taskId: string) {
  return interaction.options.map(option => {
    const description = option.description ? `<small>${escapeHtml(humanizeAgentProgressLabel(option.description))}</small>` : ''
    if (interaction.kind === 'multiple_choice') {
      return `<label class="recommendation-choice recommendation-choice--multiple"><input type="checkbox" data-recommendation-choice data-interaction-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : ''}><span><strong>${escapeHtml(option.label)}</strong>${description}</span></label>`
    }
    return `<button type="button" class="recommendation-choice" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" data-interaction-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : ''}><strong>${escapeHtml(option.label)}</strong>${description}</button>`
  }).join('')
}

/** Render the canonical writing-sample/portfolio Progress Detail contract. */
export function renderWorkSampleProgressDetail(interaction: WorkSampleInteraction, taskId: string, busy = false) {
  const knownContext = interaction.knownContext.length
    ? `<div class="recommendation-known-context"><strong>What I already resolved</strong><ul>${interaction.knownContext.map(item => `<li>${escapeHtml(humanizeAgentProgressLabel(item))}</li>`).join('')}</ul></div>`
    : ''
  const disabled = busy ? 'disabled' : ''
  let control = ''
  if (interaction.kind === 'approval' || interaction.kind === 'confirmation') {
    control = `<div class="recommendation-interaction-actions"><button class="agent-primary" type="button" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" data-interaction-value="true" ${disabled}>${escapeHtml(interaction.confirmLabel)}</button><button type="button" data-action="cancel-agent" data-task-id="${escapeHtml(taskId)}" ${disabled}>${escapeHtml(interaction.cancelLabel)}</button></div>`
  } else if (interaction.kind === 'single_choice' || interaction.kind === 'multiple_choice') {
    control = `<div class="recommendation-interaction-options">${renderOptions(interaction, taskId)}</div>${interaction.kind === 'multiple_choice' ? `<button class="agent-primary" type="button" data-action="submit-recommendation-multiple" data-task-id="${escapeHtml(taskId)}" ${disabled}>Continue</button>` : ''}`
  } else if (interaction.kind === 'attachment_request') {
    const accepted = interaction.acceptedMimeTypes?.join(',') ?? 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
    const maximumFiles = interaction.maximumFiles ?? 1
    control = `<label class="recommendation-attachment-input"><span>${escapeHtml(humanizeAgentProgressLabel(interaction.attachmentPrompt ?? 'Attach the exact source artifact.'))}</span><input type="file" data-recommendation-file data-task-id="${escapeHtml(taskId)}" accept="${escapeHtml(accepted)}" ${maximumFiles > 1 ? 'multiple' : ''} ${disabled}></label><small>Files remain private to this task unless you explicitly mark them reusable.</small>`
  } else {
    control = `<label class="recommendation-interaction-input"><span>Your answer</span><input type="text" data-recommendation-input data-task-id="${escapeHtml(taskId)}" placeholder="Add the missing work-sample detail" maxlength="600" ${disabled}></label><button class="agent-primary" type="button" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" ${disabled}>Continue</button>`
  }
  return `<section class="work-sample-progress-detail recommendation-progress-detail" data-progress-detail data-work-sample-interaction-id="${escapeHtml(interaction.id)}"><header><strong>Next step</strong><span class="task-agent-header-mark" role="img" aria-label="Your input is needed">!</span></header><h4>${escapeHtml(humanizeAgentProgressLabel(interaction.question))}</h4><p class="recommendation-interaction-reason">${escapeHtml(humanizeAgentProgressLabel(interaction.reason))}</p>${knownContext}${control}</section>`
}
