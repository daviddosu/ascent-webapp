import type { AgentCapability } from './agent-runtime'
import type { Task } from './planner-model'
import { routeTask } from '../../supabase/functions/_shared/specialists'

export type RoonCapability = AgentCapability

type CapabilityDefinition = {
  capability: RoonCapability
  label: string
  matches: RegExp
}

// Kept as a compatibility boundary for older UI/tests. New routing lives in
// the shared specialist registry; this helper never selects a model or starts
// a run. It only tells the legacy inspector whether it should keep showing its
// existing delegate affordance while an old run is migrated.
export const roonCapabilityIndex: readonly CapabilityDefinition[] = []

export function roonCapabilityForTask(task: Pick<Task, 'title' | 'description'>): CapabilityDefinition | null {
  const text = `${task.title} ${task.description ?? ''}`
  const route = routeTask(task.title, task.description)
  if (route.primarySpecialistId === 'david') return { capability: 'browser', label: 'Complete online task', matches: /application/i }
  if (route.primarySpecialistId === 'roon') {
    const capability: AgentCapability = route.taskContract === 'communication.calendar'
      ? 'calendar'
      : route.taskContract === 'communication.scheduling'
        ? 'scheduling'
        : 'gmail'
    return { capability, label: capability === 'calendar' ? 'Check calendar' : capability === 'scheduling' ? 'Schedule' : 'Email', matches: /communication/i }
  }
  if (/\b(?:research|compare|identify|program|professor|supervisor|grant|customer|competitor|event|resource)\b/i.test(text)) {
    const combined = /\b(?:draft|write|outline|proposal|polish|document)\b/i.test(text)
    return { capability: combined ? 'research_draft' : 'research', label: combined ? 'Research and draft' : 'Research', matches: /research/i }
  }
  if (/\b(?:renew|license|register|sign[\s-]?up|submit|upload|fill|complete)\b/i.test(text)) {
    return { capability: 'browser', label: 'Complete online task', matches: /online/i }
  }
  return null
}
