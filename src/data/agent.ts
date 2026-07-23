import { currentUser, getCloudClient } from './cloud'
import type { Task } from './planner-model'

export type AgentRunStatus =
  | 'needs_context'
  | 'ready'
  | 'running'
  | 'waiting_for_user'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AgentSource = {
  title: string
  url: string
}

export type AgentResult = {
  summary: string
  sections: Array<{ title: string; body: string }>
  drafts: Array<{ title: string; body: string }>
  followUps: string[]
  sources: AgentSource[]
}

export type AgentRun = {
  id: string
  taskId: string
  status: AgentRunStatus
  objective: string
  context: string
  capability: 'research' | 'draft' | 'research_draft'
  progressIndex: number
  result: AgentResult | null
  error?: string
  createdAt: string
  updatedAt: string
}

export function agentCapability(task: Task): AgentRun['capability'] {
  const value = `${task.title} ${task.description ?? ''}`.toLocaleLowerCase()
  const research = /research|find|compare|identify|market|program|professor|supervisor|grant|customer|competitor|event|resource/.test(value)
  const draft = /draft|write|email|post|proposal|outline|application|polish|document/.test(value)
  return research && draft ? 'research_draft' : draft ? 'draft' : 'research'
}

export function needsAgentContext(task: Task) {
  return task.title.trim().split(/\s+/).length < 4 && !task.description?.trim()
}

export function createAgentRun(task: Task, context = ''): AgentRun {
  const timestamp = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    taskId: task.id,
    status: needsAgentContext(task) && !context ? 'needs_context' : 'ready',
    objective: task.title,
    context: context || task.description || '',
    capability: agentCapability(task),
    progressIndex: -1,
    result: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export async function executeAgentRun(task: Task, run: AgentRun): Promise<AgentRun> {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to delegate this task to Shotcount.')

  const { data, error } = await client.functions.invoke<AgentRun>('task-agent', {
    method: 'POST',
    body: {
      taskId: task.id,
      title: task.title,
      description: task.description ?? '',
      context: run.context,
      capability: run.capability,
      goalId: task.goalId ?? null,
      due: task.due ?? null,
    },
  })
  if (error || !data) throw new Error(error?.message ?? 'Shotcount could not complete this task.')
  return data
}
