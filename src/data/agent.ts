import type { RealtimeChannel } from '@supabase/supabase-js'
import { currentUser, getCloudClient } from './cloud'
import {
  classifyAgentIntent,
  type AgentCapability,
  type AgentIntent,
  type DurableAgentRunStatus,
} from './agent-runtime'
import { needsSharedAgentContext } from '../../supabase/functions/_shared/agent-intent'
import { isApplicationIntent } from '../../supabase/functions/_shared/application'
import {
  REASONING_MODEL_ID,
  legacySpecialistRoute,
  routeTask,
  specialistIdentity,
  specialistRequiredEffects,
  type RequiredEffect,
  type SpecialistId,
  type SpecialistRoute,
  type SpecialistStage,
  type SpecialistVersion,
  type TaskContract,
} from '../../supabase/functions/_shared/specialists'
import type { Task } from './planner-model'
import type { DavidApplicationState } from '../../supabase/functions/_shared/david-applications'
import type { RecommendationInteraction } from '../../supabase/functions/_shared/recommendation-workflow'
import type { WorkSampleInteraction } from '../../supabase/functions/_shared/work-sample-workflow'
import type { SupplementalProgressInteraction } from '../../supabase/functions/_shared/application-questions'

export type AgentRunStatus = DurableAgentRunStatus

export type AgentCurrentProgress = {
  specialistId: SpecialistId
  label: string
}

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
  selectedReturnFlight?: AgentFlightOption
  paymentHandoffUrl?: string
  paymentHandoffProvider?: string
  paymentHandoffStage?: 'provider_booking' | 'google_booking_options'
  flightCheckout?: {
    provider?: string
    preparedFields?: string[]
    preparedTravelerCount?: number
    paymentBoundaryReached?: boolean
    handoffUrl?: string
    currentUrl?: string
  }
  applicationReviewUrl?: string
  application?: {
    campaignId?: string | null
    caseIds?: string[]
    status?: string
    stage?: string
    nextAction?: string
    blockers?: string[]
    verifiedOpportunityCount?: number
    evidenceCount?: number
  }
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
  durationMinutes?: number
  stopCount?: number
  amount?: number
  searchUrl?: string
  departureDate?: string
  returnDate?: string | null
  arrivalDate?: string
  arrivalDayOffset?: number
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
  schedulingOptions?: Array<{ label: string; value: string }>
  /** Typed Progress Detail interaction for canonical application workflows. */
  contextInteraction?: RecommendationInteraction | WorkSampleInteraction | SupplementalProgressInteraction | null
  capability: AgentCapability
  intent: AgentIntent
  specialistId: SpecialistId | null
  specialistVersion: SpecialistVersion | null
  activeSpecialistId: SpecialistId | null
  activeSpecialistVersion: SpecialistVersion | null
  /** Roon owns the user-facing question while a specialist remains active. */
  contextOwnerSpecialistId?: SpecialistId | null
  reasoningModel: typeof REASONING_MODEL_ID
  taskContract: TaskContract | null
  routingSource: 'deterministic' | 'semantic' | 'legacy_migration'
  specialistStageIndex: number
  specialistStages: SpecialistStage[]
  completedEffects: RequiredEffect[]
  unsatisfiedEffects: RequiredEffect[]
  currentStep: number
  waitingReason: string
  progressIndex: number
  progress: string[]
  /** The one operation currently being performed by the active specialist. */
  currentProgress: AgentCurrentProgress | null
  result: AgentResult | null
  applicationState?: DavidApplicationState | null
  applicationCaseId?: string | null
  applicationCaseIds?: string[]
  applicationRequirementId?: string | null
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
  kind: 'send_email' | 'calendar_write' | 'browser_submit' | 'payment'
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
  context: {
    description?: string
    user_context?: string
    application_case_id?: string
    application_case_ids?: string[]
    application_requirement_id?: string
    recipient_resolution_pending?: AgentRun['recipientResolution']
    scheduling_options?: AgentRun['schedulingOptions']
    progress_detail_interaction?: RecommendationInteraction | WorkSampleInteraction | SupplementalProgressInteraction | null
    flight_context_owner_specialist_id?: SpecialistId | null
    progress_current?: {
      specialist_id?: SpecialistId | null
      label?: string | null
    } | null
  } | null
  recipientResolution?: AgentRun['recipientResolution']
  contextOwnerSpecialistId?: SpecialistId | null
  capability: AgentCapability
  intent: AgentIntent | null
  specialist_id?: SpecialistId | null
  specialist_version?: SpecialistVersion | null
  active_specialist_id?: SpecialistId | null
  active_specialist_version?: SpecialistVersion | null
  reasoning_model?: string | null
  task_contract?: TaskContract | null
  routing_source?: AgentRun['routingSource'] | null
  specialist_stage_index?: number | null
  specialist_stages?: SpecialistStage[] | null
  completed_effects?: RequiredEffect[] | null
  unsatisfied_effects?: RequiredEffect[] | null
  current_step: number
  waiting_reason: string
  progress: string[] | null
  result: AgentResult | null
  application_state?: DavidApplicationState | null
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
  const route = legacySpecialistRoute(row.objective, row.context?.description, row.capability) ?? routeTask(row.objective, row.context?.description)
  const specialistId = row.specialist_id ?? route.primarySpecialistId
  const specialist = specialistIdentity(specialistId)
  const stages = Array.isArray(row.specialist_stages) && row.specialist_stages.length
    ? row.specialist_stages
    : route.stages
  const rawCurrentProgress = row.context?.progress_current
  const currentProgressLabel = ['planning', 'running', 'waiting_external'].includes(row.status) && typeof rawCurrentProgress?.label === 'string'
    ? rawCurrentProgress.label.trim()
    : ''
  const currentProgressSpecialist = specialistIdentity(
    rawCurrentProgress?.specialist_id ?? row.active_specialist_id ?? specialistId,
  )
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    objective: row.objective,
    context: row.context?.user_context || row.context?.description || '',
    recipientResolution: row.recipientResolution ?? row.context?.recipient_resolution_pending ?? null,
    schedulingOptions: Array.isArray(row.context?.scheduling_options) ? row.context.scheduling_options : [],
    contextInteraction: row.context?.progress_detail_interaction ?? null,
    capability: row.capability,
    intent,
    specialistId,
    specialistVersion: row.specialist_version ?? specialist?.version ?? null,
    activeSpecialistId: row.active_specialist_id ?? specialistId,
    activeSpecialistVersion: row.active_specialist_version ?? row.specialist_version ?? specialist?.version ?? null,
    contextOwnerSpecialistId: row.contextOwnerSpecialistId ?? row.context?.flight_context_owner_specialist_id ?? null,
    reasoningModel: REASONING_MODEL_ID,
    taskContract: row.task_contract ?? route.taskContract,
    routingSource: row.routing_source ?? 'legacy_migration',
    specialistStageIndex: row.specialist_stage_index ?? 0,
    specialistStages: stages,
    completedEffects: Array.isArray(row.completed_effects) ? row.completed_effects : [],
    unsatisfiedEffects: Array.isArray(row.unsatisfied_effects) ? row.unsatisfied_effects : [],
    currentStep: row.current_step,
    waitingReason: row.waiting_reason,
    progressIndex: row.current_step,
    progress: Array.isArray(row.progress) ? row.progress : [],
    currentProgress: currentProgressLabel && currentProgressSpecialist
      ? { specialistId: currentProgressSpecialist.id, label: currentProgressLabel }
      : null,
    applicationState: row.application_state ?? null,
    applicationCaseId: typeof row.context?.application_case_id === 'string' ? row.context.application_case_id : null,
    applicationCaseIds: Array.isArray(row.context?.application_case_ids) ? row.context.application_case_ids.filter((value): value is string => typeof value === 'string') : [],
    applicationRequirementId: typeof row.context?.application_requirement_id === 'string' ? row.context.application_requirement_id : null,
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

export function specialistRoute(task: Pick<Task, 'title' | 'description'>): SpecialistRoute {
  return routeTask(task.title, task.description)
}

export function taskSpecialist(task: Pick<Task, 'title' | 'description'>) {
  return specialistIdentity(routeTask(task.title, task.description).primarySpecialistId)
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
  const route = routeTask(task.title, task.description)
  const specialist = specialistIdentity(route.primarySpecialistId)
  const needsContext = needsAgentContext(task)
  return {
    id: crypto.randomUUID(),
    taskId: task.id,
    status: needsContext && !context ? 'needs_context' : 'planning',
    objective: task.title,
    context: context || task.description || '',
    capability: intent.capability,
    intent,
    specialistId: route.primarySpecialistId,
    specialistVersion: specialist?.version ?? null,
    activeSpecialistId: route.primarySpecialistId,
    activeSpecialistVersion: specialist?.version ?? null,
    reasoningModel: REASONING_MODEL_ID,
    taskContract: route.taskContract,
    routingSource: route.classification === 'deterministic' ? 'deterministic' : 'semantic',
    specialistStageIndex: 0,
    specialistStages: route.stages,
    completedEffects: [],
    unsatisfiedEffects: specialist && route.taskContract
      ? specialistRegistryEffects(route, task.title)
      : [],
    currentStep: 0,
    waitingReason: '',
    progressIndex: -1,
    progress: [],
    currentProgress: needsContext && !context && specialist
      ? null
      : specialist
        ? { specialistId: specialist.id, label: `${specialist.name} is preparing the first verified operation.` }
        : null,
    result: null,
    applicationState: isApplicationIntent(task.title, task.description)
      ? {
          schemaVersion: 1,
          campaignId: null,
          caseIds: [],
          currentCaseId: null,
          status: 'intake',
          stage: 'intake',
          progress: {
            completed: 0,
            total: 5,
            label: 'Researching programmes',
            nextAction: 'Verify official opportunities and requirements.',
            blockers: [],
            evidenceCount: 0,
          },
          nextAction: 'Verify official opportunities and requirements.',
          blockers: [],
          verifiedOpportunityCount: 0,
          lastEvidenceAt: null,
        }
      : null,
    durable: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function specialistRegistryEffects(route: SpecialistRoute, objective: string): RequiredEffect[] {
  if (!route.primarySpecialistId || !route.taskContract) return []
  return specialistRequiredEffects(route.primarySpecialistId, objective, route.taskContract)
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
  if (!client || !user) throw new Error(`Sign in to delegate this task to ${specialistIdentity(run.activeSpecialistId ?? run.specialistId)?.name ?? 'ShotCount'}.`)

  const { data, error } = await client.functions.invoke<AgentRun>('task-agent', {
    method: 'POST',
    body: {
      action: 'start',
      taskId: task.id,
      title: task.title,
      description: task.description ?? '',
      context: run.context,
      capability: run.capability,
      specialistId: run.specialistId,
      specialistVersion: run.specialistVersion,
      taskContract: run.taskContract,
      routingSource: run.routingSource,
      goalId: task.goalId ?? null,
      due: task.due ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
  })
  if (error || !data) {
    throw new Error(await resolveAgentFunctionError(error, `${specialistIdentity(run.activeSpecialistId ?? run.specialistId)?.name ?? 'ShotCount'} could not complete this task.`))
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
    .select('id,task_id,status,objective,context,capability,intent,specialist_id,specialist_version,active_specialist_id,active_specialist_version,reasoning_model,task_contract,routing_source,specialist_stage_index,specialist_stages,completed_effects,unsatisfied_effects,current_step,waiting_reason,progress,application_state,result,error,error_code,created_at,updated_at')
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

export function resumeAgentRun(runId: string, context = '', interactionResponse?: { interactionId: string; kind: string; value: unknown; reusable?: boolean }) {
  return invokeRunAction({ action: 'resume', runId, context, ...(interactionResponse ? { interactionResponse } : {}) }, 'ShotCount could not resume this task.')
}

export function selectAgentRecipient(runId: string, recipientEmail: string) {
  return invokeRunAction({ action: 'select_recipient', runId, recipientEmail }, 'ShotCount could not select that recipient.')
}

export function pollAgentRun(runId: string) {
  return invokeRunAction({ action: 'poll', runId }, 'ShotCount could not check the external work.')
}

export function simulateAgentReply(runId: string, simulationReply: string) {
  return invokeRunAction(
    { action: 'simulate_reply', runId, simulationReply },
    'ShotCount could not simulate this development reply.',
  )
}

export function selectAgentFlight(runId: string, optionId: string) {
  return invokeRunAction(
    { action: 'select_flight', runId, optionId },
    'Caspian could not continue with this flight.',
  )
}

export function cancelAgentRunRemote(runId: string) {
  return invokeRunAction({ action: 'cancel', runId }, 'ShotCount could not cancel this task.')
}

export function decideAgentApproval(approval: AgentApproval, decision: 'approve' | 'reject') {
  return invokeRunAction({
    action: decision,
    approvalId: approval.id,
    approvalVersion: approval.version,
  }, 'ShotCount could not apply this approval decision.')
}

export function editAgentEmailApproval(approval: AgentApproval, subject: string, emailBody: string, attachment?: { name: string; base64: string; mimeType: string }) {
  return invokeRunAction({
    action: 'edit_email_approval',
    approvalId: approval.id,
    approvalVersion: approval.version,
    emailSubject: subject,
    emailBody,
    attachmentName: attachment?.name,
    attachmentBase64: attachment?.base64,
    attachmentMimeType: attachment?.mimeType,
  }, 'ShotCount could not save the edited email.')
}

export function editAgentCalendarApproval(approval: AgentApproval, summary: string, description: string, start: string, end: string) {
  return invokeRunAction({
    action: 'edit_calendar_approval',
    approvalId: approval.id,
    approvalVersion: approval.version,
    calendarSummary: summary,
    calendarDescription: description,
    calendarStart: start,
    calendarEnd: end,
  }, 'ShotCount could not save the edited calendar event.')
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
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_campaigns',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_cases',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_opportunities',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_requirements',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_evidence',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_artifacts',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_contacts',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'portal_checkpoints',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_questions',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_recommendation_interactions',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'human_assignments',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'application_communications',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
  await channel.subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}
