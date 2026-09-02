import type { RecommendationInteraction } from '../../supabase/functions/_shared/recommendation-workflow'
import { humanizeAgentProgressLabel, progressDetailWindow } from './agent-progress'

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function isProgrammeSelectionInteraction(interaction: RecommendationInteraction) {
  return (interaction.kind === 'single_choice' || interaction.kind === 'multiple_choice') &&
    interaction.mapsToRequirement === 'application_programme_selection'
}

function sharedInstitutionPrefix(labels: string[]) {
  const separator = ' · '
  const prefixes = labels.map(label => {
    const separatorIndex = label.indexOf(separator)
    return separatorIndex > 0 ? label.slice(0, separatorIndex).trim() : ''
  })
  const prefix = prefixes[0]
  return prefix && prefixes.every(candidate => candidate === prefix) ? `${prefix}${separator}` : ''
}

function programmeFitSummary(description: string | undefined) {
  const match = description && humanizeAgentProgressLabel(description).match(/\bCV fit\s+(\d+(?:\.\d+)?)\s*\/\s*10\b/i)
  return match ? `CV fit ${match[1]}/10` : ''
}

function programmeInfo(value: string | undefined) {
  return (value ?? '')
    .split('\n')
    .filter(line => !/^(?:official source|source confidence):/i.test(line.trim()))
    .join('\n')
    .trim()
}

function programmeInfoIcon() {
  return '<svg class="application-shortlist-info-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.5h.01"/></svg>'
}

function programmeSelectionOptions(
  interaction: Extract<RecommendationInteraction, { kind: 'single_choice' | 'multiple_choice' | 'contact_select' | 'attachment_selection' }>,
  selectedValue = '',
) {
  const labels = interaction.options.map(option => humanizeAgentProgressLabel(option.label))
  const institutionPrefix = sharedInstitutionPrefix(labels)
  const render = (option: typeof interaction.options[number]) => {
    const fullLabel = humanizeAgentProgressLabel(option.label)
    const label = institutionPrefix && fullLabel.startsWith(institutionPrefix)
      ? fullLabel.slice(institutionPrefix.length).trim()
      : fullLabel
    const fitSummary = programmeFitSummary(option.description)
    const description = fitSummary ? `<small>${escapeHtml(fitSummary)}</small>` : ''
    const info = programmeInfo(option.info)
    const infoDisclosure = info
      ? `<details class="application-shortlist-info"><summary aria-label="More about ${escapeHtml(label)}">${programmeInfoIcon()}</summary><div class="application-shortlist-info-detail">${escapeHtml(info)}</div></details>`
      : ''
    return `<div class="application-shortlist-option-row">
      <label class="application-shortlist-option${option.disabled ? ' application-shortlist-option--disabled' : ''}">
        <input class="application-shortlist-option-input" type="radio" name="application-programme-${escapeHtml(interaction.id)}" data-recommendation-choice data-interaction-value="${escapeHtml(option.value)}" ${option.value === selectedValue ? 'checked' : ''} ${option.disabled ? 'disabled' : ''}>
        <span class="application-shortlist-radio" aria-hidden="true"></span>
        <span class="application-shortlist-option-copy"><span class="application-shortlist-option-main"><strong>${escapeHtml(label)}</strong>${description}</span>${infoDisclosure}</span>
      </label>
    </div>`
  }
  const window = progressDetailWindow(interaction.options)
  const visible = window.visible.map(render).join('')
  const overflow = window.overflow.length
    ? `<details class="recommendation-progress-more"><summary>Show ${window.overflow.length} more programme${window.overflow.length === 1 ? '' : 's'}</summary>${window.overflow.map(render).join('')}</details>`
    : ''
  return `${visible}${overflow}`
}

function options(interaction: Extract<RecommendationInteraction, { kind: 'single_choice' | 'multiple_choice' | 'contact_select' | 'attachment_selection' }>, taskId: string) {
  const render = (option: typeof interaction.options[number]) => {
    const description = option.description ? `<small>${escapeHtml(humanizeAgentProgressLabel(option.description))}</small>` : ''
    const label = humanizeAgentProgressLabel(option.label)
    if (interaction.kind === 'multiple_choice') return `<label class="recommendation-choice recommendation-choice--multiple"><input type="checkbox" data-recommendation-choice data-interaction-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : ''}><span><strong>${escapeHtml(label)}</strong>${description}</span></label>`
    return `<button type="button" class="recommendation-choice" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" data-interaction-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : ''}><strong>${escapeHtml(label)}</strong>${description}</button>`
  }
  const window = progressDetailWindow(interaction.options)
  const visible = window.visible.map(render).join('')
  const overflow = window.overflow.length
    ? `<details class="recommendation-progress-more"><summary>Show ${window.overflow.length} more option${window.overflow.length === 1 ? '' : 's'}</summary>${window.overflow.map(render).join('')}</details>`
    : ''
  return `${visible}${overflow}`
}

/** Render the bounded Progress Detail contract; no interaction falls back to a broad question. */
export function renderRecommendationProgressDetail(interaction: RecommendationInteraction, taskId: string, busy = false, selectedProgrammeValue = '') {
  if (isProgrammeSelectionInteraction(interaction)) {
    return `<section class="recommendation-progress-detail recommendation-progress-detail--application" data-recommendation-interaction-id="${escapeHtml(interaction.id)}">
      <header><strong>Choose a programme</strong><span class="task-agent-header-mark" role="img" aria-label="Your choice is needed">?</span></header>
      <h4>Which programme do you want to apply to?</h4>
      <p class="recommendation-interaction-reason">I checked official programme pages and matched the verified options to your CV. Choose one programme and I’ll continue the application here.</p>
      <div class="application-shortlist-options">${programmeSelectionOptions(interaction as Extract<RecommendationInteraction, { kind: 'single_choice' | 'multiple_choice' | 'contact_select' | 'attachment_selection' }>, selectedProgrammeValue)}</div>
      <button class="agent-primary" type="button" data-action="submit-recommendation-single" data-task-id="${escapeHtml(taskId)}" ${busy || !selectedProgrammeValue ? 'disabled' : ''}>Choose programme</button>
    </section>`
  }
  const knownContextWindow = progressDetailWindow(interaction.knownContext)
  const knownContext = interaction.knownContext.length
    ? `<div class="recommendation-known-context"><strong>What I checked</strong><ul>${knownContextWindow.visible.map(item => `<li>${escapeHtml(humanizeAgentProgressLabel(item))}</li>`).join('')}</ul>${knownContextWindow.overflow.length ? `<details class="recommendation-progress-more"><summary>Show ${knownContextWindow.overflow.length} more</summary><ul>${knownContextWindow.overflow.map(item => `<li>${escapeHtml(humanizeAgentProgressLabel(item))}</li>`).join('')}</ul></details>` : ''}</div>`
    : ''
  const reason = `<p class="recommendation-interaction-reason">${escapeHtml(humanizeAgentProgressLabel(interaction.reason))}</p>`
  const disabled = busy ? 'disabled' : ''
  let control = ''
  const choiceInteraction = interaction.kind === 'single_choice' || interaction.kind === 'contact_select' || interaction.kind === 'attachment_selection' || interaction.kind === 'multiple_choice'
  if (choiceInteraction && !interaction.options.length) {
    control = `<div class="recommendation-interaction-recovery"><p>The verified requirement did not include a usable choice, so I’m refreshing the source-backed plan.</p><button class="agent-primary" type="button" data-action="refresh-application-interaction" data-task-id="${escapeHtml(taskId)}" ${disabled}>Refresh this decision</button></div>`
  } else if (interaction.kind === 'approval' || interaction.kind === 'confirmation') {
    control = `<div class="recommendation-interaction-actions"><button class="agent-primary" type="button" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" data-interaction-value="true" ${disabled}>${escapeHtml(interaction.confirmLabel)}</button><button type="button" data-action="cancel-agent" data-task-id="${escapeHtml(taskId)}" ${disabled}>${escapeHtml(interaction.cancelLabel)}</button></div>`
  } else if (interaction.kind === 'multiple_choice') {
    const selectionLabel = interaction.requirementId === 'recommender_selection' ? 'Use selected recommender(s)' : 'Save selection'
    control = `<div class="recommendation-interaction-options">${options(interaction, taskId)}</div><button class="agent-primary" type="button" data-action="submit-recommendation-multiple" data-task-id="${escapeHtml(taskId)}" ${disabled}>${selectionLabel}</button>`
  } else if (interaction.kind === 'single_choice' || interaction.kind === 'contact_select' || interaction.kind === 'attachment_selection') {
    control = `<div class="recommendation-interaction-options">${options(interaction, taskId)}</div>`
  } else if (interaction.kind === 'attachment_request') {
    control = `<label class="recommendation-attachment-input"><span>${escapeHtml(humanizeAgentProgressLabel(interaction.attachmentPrompt))}</span><input type="file" data-recommendation-file data-task-id="${escapeHtml(taskId)}" accept="${escapeHtml(interaction.acceptedMimeTypes.join(','))}" ${interaction.maximumFiles > 1 ? 'multiple' : ''} ${disabled}></label><small>Files stay private to this task unless you choose to reuse them.</small>`
  } else {
    const inputType = interaction.kind === 'date' ? 'date' : interaction.kind === 'email' ? 'email' : interaction.kind === 'fact' && interaction.inputType === 'number' ? 'number' : 'text'
    const value = 'currentValue' in interaction && interaction.currentValue !== null ? String(interaction.currentValue) : ''
    const placeholder = 'placeholder' in interaction ? humanizeAgentProgressLabel(interaction.placeholder) : interaction.kind === 'date' ? 'YYYY-MM-DD' : 'Add the missing detail'
    const saveLabel = interaction.kind === 'fact' ? 'Save detail' : interaction.kind === 'email' ? 'Save email' : interaction.kind === 'date' ? 'Save date' : 'Save answer'
    control = `<label class="recommendation-interaction-input"><span>${interaction.kind === 'fact' ? escapeHtml(interaction.field) : 'Your answer'}</span><input type="${inputType}" data-recommendation-input data-task-id="${escapeHtml(taskId)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" maxlength="${'maximumCharacters' in interaction ? interaction.maximumCharacters : 600}" ${disabled}></label><button class="agent-primary" type="button" data-action="submit-recommendation-interaction" data-task-id="${escapeHtml(taskId)}" ${disabled}>${saveLabel}</button>`
  }
  return `<section class="recommendation-progress-detail" data-recommendation-interaction-id="${escapeHtml(interaction.id)}"><header><strong>Next step</strong><span class="task-agent-header-mark" role="img" aria-label="Your input is needed">!</span></header><h4>${escapeHtml(humanizeAgentProgressLabel(interaction.question))}</h4>${reason}${knownContext}${control}</section>`
}
