import type { RealtimeChannel } from '@supabase/supabase-js'
import { currentUser, getCloudClient } from './cloud'
import {
  classifyAgentIntent,
  type AgentCapability,
  type AgentIntent,
  type DurableAgentRunStatus,
} from './agent-runtime'
import { needsSharedAgentContext } from '../../supabase/functions/_shared/agent-intent'
import type { Task } from './planner-model'

export type AgentRunStatus = DurableAgentRunStatus

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
  flightOptions?: AgentFlightOption[]
  selectedFlight?: AgentFlightOption
  paymentHandoffUrl?: string
  paymentHandoffProvider?: string
  paymentHandoffStage?: 'provider_booking' | 'google_booking_options'
  outcome?: {
    preparedResult: boolean
    externalChangeConfirmed: boolean
    paymentBoundaryReached: boolean
    purchaseConfirmed: boolean
  }
}

export type AgentFlightOption = {
  id: string
  label: string
  airline: string
  departureTime: string
  arrivalTime: string
  duration: string
  route: string
  stops: string
  price: string
  currency: string
  provider: string
}

export type AgentRun = {
  id: string
  taskId: string
  status: AgentRunStatus
  objective: string
  context: string
  recipientResolution?: {
    state?: string
    recipient?: string
    candidates?: Array<{ name?: string; email?: string; evidence?: string }>
  } | null
  capability: AgentCapability
  intent: AgentIntent
  currentStep: number
  waitingReason: string
  progressIndex: number
  progress: string[]
  result: AgentResult | null
  error?: string
  errorCode?: string
  durable: boolean
  createdAt: string
  updatedAt: string
}

export type AgentApproval = {
  id: string
  runId: string
  actionId: string
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'
  kind: 'send_email' | 'calendar_write' | 'browser_submit'
  title: string
  summary: string
  payload: Record<string, unknown>
  version: number
  expiresAt: string | null
}

export type RoonPlanTask = {
  title: string
  description: string
}

export type RoonPlanResponse = {
  clarification: string
  tasks: RoonPlanTask[]
}

type AgentRunRow = {
  id: string
  task_id: string
  status: AgentRunStatus
  objective: string
  context: { description?: string; user_context?: string; recipient_resolution_pending?: AgentRun['recipientResolution'] } | null
  recipientResolution?: AgentRun['recipientResolution']
  capability: AgentCapability
  intent: AgentIntent | null
  current_step: number
  waiting_reason: string
  progress: string[] | null
  result: AgentResult | null
  error: string | null
  error_code: string | null
  created_at: string
  updated_at: string
}

type AgentApprovalRow = {
  id: string
  run_id: string
  action_id: string
  status: AgentApproval['status']
  kind: AgentApproval['kind']
  title: string
  summary: string
  payload: Record<string, unknown>
  version: number
  expires_at: string | null
}

const agentE2EFixtureEnabled = import.meta.env.VITE_AGENT_E2E === 'true'

async function agentE2EFixture() {
  return import('./agent-e2e-fixture')
}

function mapAgentRun(row: AgentRunRow): AgentRun {
  const intent = row.intent ?? classifyAgentIntent(row.objective, row.context?.description)
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    objective: row.objective,
    context: row.context?.user_context || row.context?.description || '',
    recipientResolution: row.recipientResolution ?? row.context?.recipient_resolution_pending ?? null,
    capability: row.capability,
    intent,
    currentStep: row.current_step,
    waitingReason: row.waiting_reason,
    progressIndex: row.current_step,
    progress: Array.isArray(row.progress) ? row.progress : [],
    result: row.result,
    error: row.error ?? undefined,
    errorCode: row.error_code ?? undefined,
    durable: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapApproval(row: AgentApprovalRow): AgentApproval {
  return {
    id: row.id,
    runId: row.run_id,
    actionId: row.action_id,
    status: row.status,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    payload: row.payload,
    version: row.version,
    expiresAt: row.expires_at,
  }
}

export function agentCapability(task: Task): AgentRun['capability'] {
  return classifyAgentIntent(task.title, task.description).capability
}

export function needsAgentContext(task: Task) {
  return needsSharedAgentContext(task.title, task.description)
}

const scholarshipPlanFixture: RoonPlanTask[] = [
  { title: 'Find scholarships', description: 'Find fully funded study opportunities in Europe that fit the user’s background and accept international applicants. Capture eligibility, funding, deadlines, and application requirements.' },
  { title: 'Shortlist programmes', description: 'Compare the strongest eligible programmes and create a practical shortlist based on academic fit, funding, location, and deadlines.' },
  { title: 'Build application pack', description: 'Prepare an academic CV, achievement inventory, transcripts, certificates, identification, and test results for the shortlisted applications.' },
  { title: 'Write tailored statements', description: 'Draft focused statements that connect the user’s background and goals to each programme, then obtain a critical review.' },
  { title: 'Secure references and submit', description: 'Brief suitable referees early, complete every required field and attachment, and submit each application before its deadline.' },
]

export async function generateRoonPlan(goal: string, clarification = ''): Promise<RoonPlanResponse> {
  if (agentE2EFixtureEnabled) return { clarification: '', tasks: scholarshipPlanFixture }

  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to ask Roon for a plan.')

  const { data, error } = await client.functions.invoke<RoonPlanResponse>('task-agent', {
    method: 'POST',
    body: {
      action: 'plan_tasks',
      goal,
      clarification: clarification || undefined,
    },
  })
  if (error || !data) {
    throw new Error(await resolveAgentFunctionError(error, 'Roon could not prepare that plan.'))
  }
  return data
}

export function createAgentRun(task: Task, context = ''): AgentRun {
  const timestamp = new Date().toISOString()
  const intent = classifyAgentIntent(task.title, task.description)
  return {
    id: crypto.randomUUID(),
    taskId: task.id,
    status: needsAgentContext(task) && !context ? 'needs_context' : 'planning',
    objective: task.title,
    context: context || task.description || '',
    capability: intent.capability,
    intent,
    currentStep: 0,
    waitingReason: '',
    progressIndex: -1,
    progress: [],
    result: null,
    durable: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export async function resolveAgentFunctionError(
  error: unknown,
  fallback: string,
) {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown }
      if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim()
    } catch {
      try {
        const message = await context.clone().text()
        if (message.trim()) return message.trim()
      } catch {
        // Fall through to the SDK error below.
      }
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return fallback
}

export async function executeAgentRun(task: Task, run: AgentRun): Promise<AgentRun> {
  if (agentE2EFixtureEnabled) {
    return (await agentE2EFixture()).startFixtureRun(task, run)
  }
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to delegate this task to Roon.')

  const { data, error } = await client.functions.invoke<AgentRun>('task-agent', {
    method: 'POST',
    body: {
      action: 'start',
      taskId: task.id,
      title: task.title,
      description: task.description ?? '',
      context: run.context,
      capability: run.capability,
      goalId: task.goalId ?? null,
      due: task.due ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
  })
  if (error || !data) {
    throw new Error(await resolveAgentFunctionError(error, 'Roon could not complete this task.'))
  }
  return { ...data, durable: true }
}

export async function loadAgentRuns(): Promise<AgentRun[]> {
  if (agentE2EFixtureEnabled) return (await agentE2EFixture()).fixtureRuns()
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return []
  const { data, error } = await client
    .from('agent_runs')
    .select('id,task_id,status,objective,context,capability,intent,current_step,waiting_reason,progress,result,error,error_code,created_at,updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(250)
    .returns<AgentRunRow[]>()
  if (error) throw new Error(error.message)
  const latestByTask = new Map<string, AgentRun>()
  for (const row of data ?? []) {
    if (!latestByTask.has(row.task_id)) latestByTask.set(row.task_id, mapAgentRun(row))
  }
  return [...latestByTask.values()]
}

export async function loadAgentApprovals(runId: string): Promise<AgentApproval[]> {
  if (agentE2EFixtureEnabled) return (await agentE2EFixture()).fixtureApprovals(runId)
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return []
  const { data, error } = await client
    .from('agent_approvals')
    .select('id,run_id,action_id,status,kind,title,summary,payload,version,expires_at')
    .eq('user_id', user.id)
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .returns<AgentApprovalRow[]>()
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapApproval)
}

async function invokeRunAction(
  body: Record<string, unknown>,
  fallback: string,
) {
  if (agentE2EFixtureEnabled) {
    return (await agentE2EFixture()).invokeFixtureAction(body)
  }
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to continue this ShotCount task.')
  const { data, error } = await client.functions.invoke<AgentRun>('task-agent', {
    method: 'POST',
    body,
  })
  if (error || !data) throw new Error(await resolveAgentFunctionError(error, fallback))
  return { ...data, durable: true }
}

export function resumeAgentRun(runId: string, context = '') {
  return invokeRunAction({ action: 'resume', runId, context }, 'Roon could not resume this task.')
}

export function selectAgentRecipient(runId: string, recipientEmail: string) {
  return invokeRunAction({ action: 'select_recipient', runId, recipientEmail }, 'Roon could not select that recipient.')
}

export function pollAgentRun(runId: string) {
  return invokeRunAction({ action: 'poll', runId }, 'Roon could not check the external work.')
}

export function simulateAgentReply(runId: string, simulationReply: string) {
  return invokeRunAction(
    { action: 'simulate_reply', runId, simulationReply },
    'Roon could not simulate this development reply.',
  )
}

export function selectAgentFlight(runId: string, optionId: string) {
  return invokeRunAction(
    { action: 'select_flight', runId, optionId },
    'Roon could not continue with this flight.',
  )
}

export function cancelAgentRunRemote(runId: string) {
  return invokeRunAction({ action: 'cancel', runId }, 'Roon could not cancel this task.')
}

export function decideAgentApproval(approval: AgentApproval, decision: 'approve' | 'reject') {
  return invokeRunAction({
    action: decision,
    approvalId: approval.id,
    approvalVersion: approval.version,
  }, 'Roon could not apply this approval decision.')
}

export function editAgentEmailApproval(approval: AgentApproval, subject: string, emailBody: string) {
  return invokeRunAction({
    action: 'edit_email_approval',
    approvalId: approval.id,
    approvalVersion: approval.version,
    emailSubject: subject,
    emailBody,
  }, 'Roon could not save the edited email.')
}

export async function subscribeToAgentRuns(onChange: () => void) {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return () => {}
  const channel: RealtimeChannel = client
    .channel(`shotcount-agent-runs:${user.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'agent_runs',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'agent_approvals',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
  await channel.subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}
