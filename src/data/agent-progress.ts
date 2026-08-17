export type AgentProgressTimeline = {
  completed: string[]
  active: string | null
}

function cleanProgressLabel(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function progressMomentKey(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[.!?…]+$/g, '')
    .replace(/\b(?:finding|found)\b/g, 'find')
    .replace(/\b(?:preparing|prepared)\b/g, 'prepare')
    .replace(/\b(?:checking|checked)\b/g, 'check')
    .replace(/\b(?:opening|opened)\b/g, 'open')
    .replace(/\b(?:choosing|chosen)\b/g, 'choose')
    .replace(/\b(?:submitting|submitted)\b/g, 'submit')
    .replace(/\b(?:moving|moved)\b/g, 'move')
    .replace(/\s+/g, ' ')
    .trim()
}

const progressLabels = new Map<string, string>([
  ['Started an isolated browser session.', 'Set up a secure workspace.'],
  ['Reused the task-owned browser session.', 'Picked up where things left off.'],
  ['Observed the isolated browser session.', 'Checked the latest progress.'],
  ['Opened the allowed public webpage.', 'Found the right page.'],
  ['Opening the allowed public webpage.', 'Finding the right page.'],
  ['Prepared the public webpage.', 'Prepared the next step.'],
  ['Preparing the public webpage.', 'Preparing the next step.'],
  ['Submitted the exact approved public form.', 'Submitted the approved form.'],
  ['Submitting the exact approved public form.', 'Submitting the approved form.'],
  ['David is entering the canonical application controller.', 'I’m taking the lead on your application.'],
  ['David is continuing the application workflow.', 'I’m moving your application forward.'],
  ['David is resuming from the last verified application state.', 'I’m picking up from the last confirmed step.'],
  ['David is preparing the first verified operation.', 'I’m getting started.'],
  ['David is preparing the next verified operation.', 'I’m choosing the best next move.'],
  ['David is verifying the completion evidence.', 'I’m checking that every step is on track.'],
  ['Roon is repairing the task-owned browser domain configuration.', 'I’m getting the secure workspace back on track.'],
])

function friendlyRecoveryMessage(label: string) {
  if (/\bsign in\b|authentication required|reconnect (?:google|your account)/i.test(label)) {
    return 'Sign in to continue, then I’ll pick up from the last confirmed step.'
  }
  if (/official requirement.*candidate evidence.*(?:bounded )?decision/i.test(label)) {
    return 'I’ve checked the programme requirements and your material. I just need your decision on this next step.'
  }
  if (/required external effect remained unsatisfied after bounded same-run continuations/i.test(label)) {
    return 'I hit a snag finishing this step. Your progress is saved, and I’m finding a safer way forward.'
  }
  if (/bounded semantic decision remained invalid|evidence_invalid|application_semantic_handoff/i.test(label)) {
    return 'I found a mismatch in the details, so I’m double-checking the application before I move on.'
  }
  if (/application_funding_evidence_required/i.test(label)) {
    return 'I’m confirming the funding details from an official source before I move on.'
  }
  if (/application_applicant_evidence_required/i.test(label)) {
    return 'I’m matching this requirement to the right applicant material before I move on.'
  }
  if (/browser[_ -]?(?:domain|allowlist)|outside the task/i.test(label)) {
    return 'I’m finding the right verified page for this step.'
  }
  if (/\bbounded decision\b/i.test(label)) {
    return 'I’ve checked what I can. I need your decision on this next step.'
  }
  if (/model_reasoning_luna|application_controller_repair_exhausted|idempotency|provider[_ -]?action|external effect|semantic decision|bounded (?:repair|continuation)|controller|ledger/i.test(label)) {
    return 'I hit a snag while checking this step. Your progress is saved, and I’m choosing the safest next move.'
  }
  return ''
}

/**
 * Durable progress is also audit history, so it intentionally retains the
 * precise worker wording. This adapter keeps that history intact while giving
 * people a single, clear activity statement in the product.
 */
export function humanizeAgentProgressLabel(value: unknown) {
  const label = cleanProgressLabel(value)
  if (!label) return ''
  const exact = progressLabels.get(label)
  if (exact) return exact
  const recovery = friendlyRecoveryMessage(label)
  if (recovery) return recovery

  const externalWait = label.match(/^(.+?) is waiting for the external update:\s*(.+)$/i)
  if (externalWait) return humanizeAgentProgressLabel(externalWait[2])

  return label
    .replace(/\btask-owned browser session\b/gi, 'secure workspace')
    .replace(/\bisolated browser session\b/gi, 'secure workspace')
    .replace(/\ballowed public webpage\b/gi, 'right page')
    .replace(/\bverified website page\b/gi, 'right page')
    .replace(/\bcurrent website state\b/gi, 'latest page')
    .replace(/\bprovider-confirmed\b/gi, 'confirmed')
    .replace(/\btyped handoff\b/gi, 'handoff')
    .replace(/^(?:David|Roon|Caspian|ShotCount) is\s+/i, 'I’m ')
}

/**
 * Builds the visible timeline from durable facts only. There is never a
 * client-side list of anticipated steps: a row is complete only when it is
 * present in `progress`, and the one active row comes from live state.
 */
export function agentProgressTimeline(input: {
  completed: unknown[]
  current?: string | null
  waitingReason?: string | null
  status?: string | null
}): AgentProgressTimeline {
  const waitingReason = humanizeAgentProgressLabel(input.waitingReason)
  const isLive = !input.status || ['planning', 'running', 'waiting_external'].includes(input.status)
  const active = isLive
    ? input.status === 'waiting_external'
      ? waitingReason
      : humanizeAgentProgressLabel(input.current)
    : ''
  const completed = input.completed
    .map(humanizeAgentProgressLabel)
    .filter(Boolean)
    .filter((label, index, labels) => index === 0 || progressMomentKey(label) !== progressMomentKey(labels[index - 1]))
    .filter(label => !active || progressMomentKey(label) !== progressMomentKey(active))

  return {
    completed,
    active: active && (!completed.length || progressMomentKey(active) !== progressMomentKey(completed[completed.length - 1])) ? active : null,
  }
}
