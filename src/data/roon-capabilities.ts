import type { AgentCapability } from './agent-runtime'
import type { Task } from './planner-model'

export type RoonCapability = AgentCapability

type CapabilityDefinition = {
  capability: RoonCapability
  label: string
  matches: RegExp
}

// This is intentionally a small allow-list. A task gets a Delegate control only
// when it clearly names work Roon is equipped to carry through safely.
export const roonCapabilityIndex: readonly CapabilityDefinition[] = [
  { capability: 'flight_search', label: 'Find flights', matches: /\b(flight|fly|airfare|airline|airport|return trip|round trip|one-way)\b/i },
  { capability: 'scheduling', label: 'Schedule', matches: /\b(schedule|reschedule|availability|appointment|arrange|coordinate|organize)\b[\s\S]{0,80}\b(meeting|call|appointment)\b|\b(meeting|call|appointment)\b[\s\S]{0,40}\bwith\b/i },
  { capability: 'calendar', label: 'Check calendar', matches: /\b(calendar|meeting|appointment|remind(?:er)?|due time)\b/i },
  { capability: 'gmail', label: 'Email', matches: /\b(email|mail|gmail|reply|follow[\s-]?up|message|outreach)\b/i },
  { capability: 'research_draft', label: 'Research and draft', matches: /\b(research|find|compare|identify|market|program|professor|supervisor|grant|customer|competitor|event|resource)\b[\s\S]*\b(draft|write|outline|proposal|application|polish|document)\b|\b(draft|write|outline|proposal|application|polish|document)\b[\s\S]*\b(research|find|compare|identify|market|program|professor|supervisor|grant|customer|competitor|event|resource)\b/i },
  { capability: 'research', label: 'Research', matches: /\b(research|find|compare|identify|market|program|professor|supervisor|grant|customer|competitor|event|resource)\b/i },
  { capability: 'draft', label: 'Draft', matches: /\b(draft|write|outline|proposal|application|polish|document)\b/i },
  { capability: 'browser', label: 'Complete online task', matches: /\b(apply|application|renew|license|register|sign[\s-]?up|submit|upload|fill|complete)\b/i },
]

export function roonCapabilityForTask(task: Pick<Task, 'title' | 'description'>): CapabilityDefinition | null {
  const text = `${task.title} ${task.description ?? ''}`
  return roonCapabilityIndex.find(entry => entry.matches.test(text)) ?? null
}
