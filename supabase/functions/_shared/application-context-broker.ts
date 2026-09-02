import type {
  ApplicationPendingInput,
  ApplicationPendingInputOwner,
  ApplicationPendingInputSource,
} from './david-applications.ts'
import { missingValueOwnerForRequirement } from './application-value-ownership.ts'

const unresolved = (item: ApplicationPendingInput) => item.status !== 'answered'

function deadlineTime(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

/**
 * The broker is the only presentation policy for application questions.
 * Durable state may contain stale requests from older runs, so programme-owned
 * values are filtered here as a final safety net even if a caller has not yet
 * rebuilt the requirement projection.
 */
export function prioritizeApplicationContextRequests(inputs: ApplicationPendingInput[]) {
  const deduped = new Map<string, ApplicationPendingInput>()
  for (const input of inputs) {
    const current = deduped.get(input.requirementId)
    if (!current || (input.priority ?? 50) < (current.priority ?? 50)) deduped.set(input.requirementId, input)
  }
  return [...deduped.values()].filter(unresolved).filter(item => {
    const owner = item.missingValueOwner ?? missingValueOwnerForRequirement({
      name: item.title,
      type: item.requirementType,
      responsible: item.owner,
      source: item.source ? { ...item.source } : null,
      exactInstructions: item.detail,
    })
    return owner !== 'programme'
  }).sort((left, right) => {
    const leftParked = left.status === 'parked' ? 1 : 0
    const rightParked = right.status === 'parked' ? 1 : 0
    return leftParked - rightParked ||
      (left.priority ?? 50) - (right.priority ?? 50) ||
      deadlineTime(left.deadline) - deadlineTime(right.deadline) ||
      left.id.localeCompare(right.id)
  })
}

export function applicationContextWindow(inputs: ApplicationPendingInput[]) {
  const queued = prioritizeApplicationContextRequests(inputs)
  const active = queued.find(item => item.status !== 'parked') ?? null
  return {
    active,
    queued: active ? queued.filter(item => item.id !== active.id) : queued,
    unresolvedCount: queued.length,
  }
}

export function applicationContextOwner(type: string): ApplicationPendingInputOwner {
  return ['communication', 'calendar', 'provider_contact'].includes(type) ? 'roon' : 'david'
}

export function applicationContextPriority(type: string, required = true) {
  if (type === 'portal_field') return required ? 10 : 60
  if (type === 'referee') return 20
  if (['transcript', 'degree_certificate', 'proof_of_graduation'].includes(type)) return 25
  if (['admissions_test', 'english_language_test'].includes(type)) return 30
  return required ? 40 : 70
}

export function applicationContextSource(input: {
  label?: string | null
  url?: string | null
  section?: string | null
  field?: string | null
}): ApplicationPendingInputSource | null {
  const url = String(input.url ?? '').trim() || null
  const section = String(input.section ?? '').trim() || null
  const field = String(input.field ?? '').trim() || null
  const label = String(input.label ?? '').trim() || (field ? 'Application form' : url ? 'Official programme requirements' : '')
  return label || url || section || field ? { label, url, section, field } : null
}

export function parkApplicationContextRequest(
  inputs: ApplicationPendingInput[],
  requirementId: string,
) {
  return inputs.map(item => item.requirementId === requirementId ? { ...item, status: 'parked' as const } : item)
}

export function answerApplicationContextRequest(
  inputs: ApplicationPendingInput[],
  requirementId: string,
) {
  return inputs.map(item => item.requirementId === requirementId ? { ...item, status: 'answered' as const } : item)
}
