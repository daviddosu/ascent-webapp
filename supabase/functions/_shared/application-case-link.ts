export type TaskApplicationCaseLink = {
  id: string
  campaignId: string
}

export type TaskApplicationCaseLinkResolution =
  | { kind: 'already_linked'; caseId: string }
  | { kind: 'relinked'; caseId: string }
  | { kind: 'unlinked' }
  | { kind: 'ambiguous'; caseIds: string[] }

/**
 * A resumed AgentRun must stay attached to one active ApplicationCase lane
 * owned by its task. A task may have several lanes in its canonical workflow
 * bundle, so the caller keeps the other case IDs separately rather than
 * silently collapsing them into this active-lane link.
 */
export function resolveTaskApplicationCaseLink(input: {
  campaignId: string | null
  currentCaseId: string | null
  cases: TaskApplicationCaseLink[]
}): TaskApplicationCaseLinkResolution {
  if (!input.campaignId) return { kind: 'unlinked' }

  const caseIds = [...new Set(
    input.cases
      .filter(item => item.campaignId === input.campaignId && item.id)
      .map(item => item.id),
  )]
  if (input.currentCaseId && caseIds.includes(input.currentCaseId)) {
    return { kind: 'already_linked', caseId: input.currentCaseId }
  }
  if (caseIds.length === 1) return { kind: 'relinked', caseId: caseIds[0]! }
  if (caseIds.length > 1) return { kind: 'ambiguous', caseIds }
  return { kind: 'unlinked' }
}
