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
 * A resumed AgentRun must stay attached to the one ApplicationCase owned by
 * its task. A previous run may have created that case, so the new run cannot
 * assume an empty context means an empty application workspace.
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
