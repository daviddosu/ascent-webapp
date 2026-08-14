export type AgentProgressTimeline = {
  completed: string[]
  active: string | null
}

function cleanProgressLabel(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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
  const waitingReason = cleanProgressLabel(input.waitingReason)
  const isLive = !input.status || ['planning', 'running', 'waiting_external'].includes(input.status)
  const active = isLive
    ? input.status === 'waiting_external'
      ? waitingReason
      : cleanProgressLabel(input.current)
    : ''
  const completed = input.completed
    .map(cleanProgressLabel)
    .filter(Boolean)
    .filter((label, index, labels) => index === 0 || label !== labels[index - 1])
    .filter(label => label !== active)

  return {
    completed,
    active: active && active !== completed[completed.length - 1] ? active : null,
  }
}
