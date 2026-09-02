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
  compileAgentTaskSpec,
  compileExecutionPlan,
  type AgentTaskSpec,
  type ExecutionPlanNode,
} from '../../supabase/functions/_shared/agent-execution-plan'
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
import type { DavidApplicationState, FacultyIntelligenceView } from '../../supabase/functions/_shared/david-applications'
import { normalizeFacultyContactPolicyClassification } from '../../supabase/functions/_shared/application-programme-discovery'
import type { ExternalWait } from '../../supabase/functions/_shared/application-runtime-policy'
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
  reasoningModel: typeof REASONING_MODEL_ID
  taskContract: TaskContract | null
  taskSpec?: AgentTaskSpec | null
  executionPlan?: ExecutionPlanNode[]
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
  applicationSelectedOpportunityId?: string | null
  applicationProgrammeSelectionCompleted?: boolean
  externalWaits?: ExternalWait[]
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
    application_selected_opportunity_id?: string
    application_programme_selection_completed?: boolean
    recipient_resolution_pending?: AgentRun['recipientResolution']
    scheduling_options?: AgentRun['schedulingOptions']
    progress_detail_interaction?: RecommendationInteraction | WorkSampleInteraction | SupplementalProgressInteraction | null
    external_wait?: ExternalWait | null
    external_waits?: ExternalWait[]
    progress_current?: {
      specialist_id?: SpecialistId | null
      label?: string | null
    } | null
  } | null
  recipientResolution?: AgentRun['recipientResolution']
  capability: AgentCapability
  intent: AgentIntent | null
  specialist_id?: SpecialistId | null
  specialist_version?: SpecialistVersion | null
  active_specialist_id?: SpecialistId | null
  active_specialist_version?: SpecialistVersion | null
  reasoning_model?: string | null
  task_contract?: TaskContract | null
  task_spec?: AgentTaskSpec | null
  plan?: ExecutionPlanNode[] | null
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

function reconcileFacultyIntelligence(state: DavidApplicationState | null | undefined, caseData: unknown): DavidApplicationState | null | undefined {
  if (!state) return state
  const existing = state.facultyIntelligence
  const data = caseData && typeof caseData === 'object' && !Array.isArray(caseData) ? caseData as Record<string, unknown> : {}
  const resolution = data.applicationFacultyOutreachResolution && typeof data.applicationFacultyOutreachResolution === 'object' && !Array.isArray(data.applicationFacultyOutreachResolution)
    ? data.applicationFacultyOutreachResolution as Record<string, unknown>
    : null
  const persistedRows = Array.isArray(resolution?.faculty)
    ? resolution.faculty.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value)))
    : []
  if (!persistedRows.length) return state
  const research = data.applicationFacultyResearch && typeof data.applicationFacultyResearch === 'object' && !Array.isArray(data.applicationFacultyResearch)
    ? data.applicationFacultyResearch as Record<string, unknown>
    : {}
  const metrics = resolution?.metrics && typeof resolution.metrics === 'object' && !Array.isArray(resolution.metrics)
    ? resolution.metrics as Record<string, unknown>
    : {}
  // A concurrent continuation can leave the run-level faculty snapshot empty
  // even though the case has already persisted the validated resolution. Build
  // a minimal view from that case record so a refresh still exposes the same
  // evidence-backed cards and drafts.
  const current: FacultyIntelligenceView = existing ?? {
    version: typeof resolution?.resultContractVersion === 'string' ? resolution.resultContractVersion : 'verified-faculty-match@5',
    applicationCaseId: typeof resolution?.applicationCaseId === 'string' ? resolution.applicationCaseId : state.currentCaseId ?? '',
    opportunityId: typeof resolution?.programmeId === 'string' ? resolution.programmeId : '',
    refreshedAt: typeof resolution?.completedAt === 'string' ? resolution.completedAt : new Date().toISOString(),
    verifiedFacultyCount: 0,
    uncertainFacultyCount: typeof research.uncertainFacultyCount === 'number' ? research.uncertainFacultyCount : 0,
    primaryCallCount: Math.max(0, Number(research.modelCalls ?? metrics.modelCalls ?? 0) - Number(research.repairAttempts ?? metrics.repairAttempts ?? 0)),
    targetedRepairCount: Number(research.repairAttempts ?? metrics.repairAttempts ?? 0),
    latencyMs: Number(metrics.modelLatencyMs ?? 0),
    bestFitResearchRoutes: [],
    facultyContactPolicy: undefined,
    facultyContactPolicyExplanation: null,
    facultyContactPolicyEvidence: [],
    faculty: [],
  }
  const persistedProgrammePolicy = typeof resolution?.programmeContactPolicy === 'string'
    ? normalizeFacultyContactPolicyClassification(resolution.programmeContactPolicy)
    : typeof resolution?.facultyContactPolicy === 'string'
      ? normalizeFacultyContactPolicyClassification(resolution.facultyContactPolicy)
      : current.facultyContactPolicy
  const persistedProgrammePolicyDetails = resolution?.programmeContactPolicyDetails && typeof resolution.programmeContactPolicyDetails === 'object' && !Array.isArray(resolution.programmeContactPolicyDetails)
    ? resolution.programmeContactPolicyDetails as Record<string, unknown>
    : null
  const programmeDraftAllowed = !['discouraged', 'prohibited', 'unknown_due_to_insufficient_evidence'].includes(persistedProgrammePolicy ?? '')
  const currentById = new Map(current.faculty.map(item => [item.facultyId, item]))
  const faculty = persistedRows.map(persisted => {
    const identityEvidence = persisted.identityEvidence && typeof persisted.identityEvidence === 'object' && !Array.isArray(persisted.identityEvidence)
      ? persisted.identityEvidence as Record<string, unknown>
      : {}
    const fit = persisted.applicantFit && typeof persisted.applicantFit === 'object' && !Array.isArray(persisted.applicantFit)
      ? persisted.applicantFit as Record<string, unknown>
      : {}
    const facultyId = typeof persisted.facultyId === 'string' ? persisted.facultyId : ''
    const item = currentById.get(facultyId) ?? {
      facultyId,
      name: typeof persisted.name === 'string' ? persisted.name : 'Faculty member',
      title: typeof persisted.title === 'string' ? persisted.title : null,
      department: typeof persisted.department === 'string' ? persisted.department : null,
      institution: typeof identityEvidence.institution === 'string' ? identityEvidence.institution : 'Harvard University',
      officialProfileUrl: typeof persisted.officialProfileUrl === 'string' ? persisted.officialProfileUrl : typeof identityEvidence.officialProfileUrl === 'string' ? identityEvidence.officialProfileUrl : '',
      identitySourceUrl: typeof identityEvidence.identitySourceUrl === 'string' ? identityEvidence.identitySourceUrl : typeof persisted.officialProfileUrl === 'string' ? persisted.officialProfileUrl : '',
      identityVerification: persisted.identityVerification === 'official_verified' ? 'official_verified' as const : 'uncertain' as const,
      researchDomain: typeof persisted.researchDomain === 'string' ? persisted.researchDomain : '',
      researchSubdomains: Array.isArray(persisted.researchSubdomains) ? persisted.researchSubdomains.filter((value): value is string => typeof value === 'string') : [],
      researchSummary: typeof persisted.researchSummary === 'string' ? persisted.researchSummary : '',
      relevantCurrentWork: Array.isArray(persisted.relevantCurrentWork) ? persisted.relevantCurrentWork.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))).map(work => ({
        title: typeof work.title === 'string' ? work.title : '',
        year: typeof work.year === 'number' ? work.year : null,
        url: typeof work.url === 'string' ? work.url : '',
        relevanceToApplicant: typeof work.relevanceToApplicant === 'string' ? work.relevanceToApplicant : '',
      })) : [],
      email: null,
      emailSourceUrl: null,
      emailVerification: 'missing' as const,
      fitBreakdown: {
        overallScore: typeof fit.score === 'number' ? fit.score : 0,
        researchAreaFit: typeof fit.researchAreaFit === 'number' ? fit.researchAreaFit : 0,
        methodsFit: typeof fit.methodsFit === 'number' ? fit.methodsFit : 0,
        experienceFit: typeof fit.experienceFit === 'number' ? fit.experienceFit : 0,
        facultySpecificFit: typeof fit.facultySpecificFit === 'number' ? fit.facultySpecificFit : 0,
      },
      strongestConnections: [],
      contactPolicy: undefined,
      outreachRecommendation: 'skip' as const,
      outreachReason: '',
      draftRecommendation: 'skip' as const,
      sendRecommendation: 'skip' as const,
      draftEmail: null,
      draftStatus: 'waiting_for_email' as const,
      sourceEvidence: Array.isArray(persisted.sources) ? persisted.sources.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))).map(source => ({
        id: typeof source.sourceKey === 'string' ? source.sourceKey : typeof source.url === 'string' ? source.url : '',
        url: typeof source.url === 'string' ? source.url : '',
        type: typeof source.type === 'string' ? source.type : 'official_source',
        excerpt: typeof source.excerpt === 'string' ? source.excerpt : '',
      })) : [],
    } satisfies FacultyIntelligenceView['faculty'][number]
    const numberOr = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
    const emailVerified = persisted.emailVerification === 'official_source_supplied' && typeof persisted.email === 'string' && persisted.email.includes('@')
    const persistedContactPolicy = typeof persisted.contactPolicy === 'string'
      ? normalizeFacultyContactPolicyClassification(persisted.contactPolicy)
      : item.contactPolicy
        ? normalizeFacultyContactPolicyClassification(item.contactPolicy)
        : 'unknown_due_to_insufficient_evidence' as const
    const persistedDraftRecommendation = typeof persisted.draftRecommendation === 'string'
      ? persisted.draftRecommendation as FacultyIntelligenceView['faculty'][number]['draftRecommendation']
      : item.draftRecommendation
    const rawEmailAction = persisted.emailAction && typeof persisted.emailAction === 'object' && !Array.isArray(persisted.emailAction)
      ? persisted.emailAction as Record<string, unknown>
      : null
    const draftAllowed = programmeDraftAllowed && !['discouraged', 'prohibited', 'unknown_due_to_insufficient_evidence'].includes(persistedContactPolicy ?? '') && persistedDraftRecommendation !== 'skip'
    const draftEmail = emailVerified && rawEmailAction && draftAllowed &&
      typeof rawEmailAction.subject === 'string' && typeof rawEmailAction.textBody === 'string' && typeof rawEmailAction.htmlBody === 'string'
      ? {
          subject: rawEmailAction.subject,
          textBody: rawEmailAction.textBody,
          htmlBody: rawEmailAction.htmlBody,
          recipientEmail: persisted.email as string,
          attachmentArtifactIds: Array.isArray(rawEmailAction.attachmentArtifactIds)
            ? rawEmailAction.attachmentArtifactIds.filter((value): value is string => typeof value === 'string')
            : [],
        }
      : draftAllowed ? item.draftEmail : null
    const strongestConnections = Array.isArray(fit.strongestConnections)
      ? fit.strongestConnections.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))).map(connection => ({
          facultySignal: typeof connection.facultySignal === 'string' ? connection.facultySignal : '',
          applicantEvidenceId: typeof connection.applicantEvidenceId === 'string' ? connection.applicantEvidenceId : '',
          explanation: typeof connection.explanation === 'string' ? connection.explanation : '',
        }))
      : item.strongestConnections
    return {
      ...item,
      name: typeof persisted.name === 'string' ? persisted.name : item.name,
      title: typeof persisted.title === 'string' ? persisted.title : item.title,
      department: typeof persisted.department === 'string' ? persisted.department : item.department,
      researchDomain: typeof persisted.researchDomain === 'string' ? persisted.researchDomain : item.researchDomain,
      researchSubdomains: Array.isArray(persisted.researchSubdomains) ? persisted.researchSubdomains.filter((value): value is string => typeof value === 'string') : item.researchSubdomains,
      researchSummary: typeof persisted.researchSummary === 'string' ? persisted.researchSummary : item.researchSummary,
      email: emailVerified ? persisted.email as string : null,
      emailSourceUrl: emailVerified && typeof persisted.emailSourceUrl === 'string' ? persisted.emailSourceUrl : null,
      emailVerification: (emailVerified ? 'official_verified' : 'missing') as 'official_verified' | 'missing',
      fitBreakdown: {
        overallScore: numberOr(fit.score, item.fitBreakdown.overallScore),
        researchAreaFit: numberOr(fit.researchAreaFit, item.fitBreakdown.researchAreaFit),
        methodsFit: numberOr(fit.methodsFit, item.fitBreakdown.methodsFit),
        experienceFit: numberOr(fit.experienceFit, item.fitBreakdown.experienceFit),
        facultySpecificFit: numberOr(fit.facultySpecificFit, item.fitBreakdown.facultySpecificFit),
      },
      strongestConnections,
      contactPolicy: persistedContactPolicy,
      outreachRecommendation: typeof persisted.outreachRecommendation === 'string' ? persisted.outreachRecommendation as FacultyIntelligenceView['faculty'][number]['outreachRecommendation'] : item.outreachRecommendation,
      outreachReason: typeof persisted.outreachReason === 'string' ? persisted.outreachReason : item.outreachReason,
      draftRecommendation: persistedDraftRecommendation,
      sendRecommendation: typeof persisted.sendRecommendation === 'string' ? persisted.sendRecommendation as FacultyIntelligenceView['faculty'][number]['sendRecommendation'] : item.sendRecommendation,
      draftEmail,
      draftStatus: draftEmail ? 'draft_ready' : !draftAllowed ? 'not_applicable' : emailVerified ? item.draftStatus : 'waiting_for_email',
    }
  }).sort((left, right) => right.fitBreakdown.overallScore - left.fitBreakdown.overallScore || right.fitBreakdown.researchAreaFit - left.fitBreakdown.researchAreaFit || right.fitBreakdown.facultySpecificFit - left.fitBreakdown.facultySpecificFit || left.name.localeCompare(right.name))
  return {
    ...state,
    facultyIntelligence: {
      ...current,
      version: typeof resolution?.resultContractVersion === 'string' ? resolution.resultContractVersion : current.version,
      refreshedAt: typeof resolution?.completedAt === 'string' ? resolution.completedAt : current.refreshedAt,
      verifiedFacultyCount: faculty.length,
      facultyContactPolicy: persistedProgrammePolicy as FacultyIntelligenceView['facultyContactPolicy'],
      facultyContactPolicyExplanation: typeof persistedProgrammePolicyDetails?.explanation === 'string' ? persistedProgrammePolicyDetails.explanation : current.facultyContactPolicyExplanation,
      facultyContactPolicyEvidence: Array.isArray(persistedProgrammePolicyDetails?.evidence) ? persistedProgrammePolicyDetails.evidence as FacultyIntelligenceView['facultyContactPolicyEvidence'] : current.facultyContactPolicyEvidence,
      faculty,
    },
  }
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
    applicationSelectedOpportunityId: typeof row.context?.application_selected_opportunity_id === 'string'
      ? row.context.application_selected_opportunity_id
      : null,
    applicationProgrammeSelectionCompleted: row.context?.application_programme_selection_completed === true || Boolean(row.context?.application_selected_opportunity_id),
    externalWaits: Array.isArray(row.context?.external_waits)
      ? row.context.external_waits
      : row.context?.external_wait ? [row.context.external_wait] : [],
    capability: row.capability,
    intent,
    specialistId,
    specialistVersion: row.specialist_version ?? specialist?.version ?? null,
    activeSpecialistId: row.active_specialist_id ?? specialistId,
    activeSpecialistVersion: row.active_specialist_version ?? row.specialist_version ?? specialist?.version ?? null,
    reasoningModel: REASONING_MODEL_ID,
    taskContract: row.task_contract ?? route.taskContract,
    taskSpec: row.task_spec ?? null,
    executionPlan: Array.isArray(row.plan) ? row.plan : [],
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

export async function generateRoonPlan(outcome: string, clarification = ''): Promise<RoonPlanResponse> {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to ask Roon for a plan.')

  const { data, error } = await client.functions.invoke<RoonPlanResponse>('task-agent', {
    method: 'POST',
    body: {
      action: 'plan_tasks',
      outcome,
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
  const taskSpec = compileAgentTaskSpec({
    objective: task.title,
    description: task.description,
    capability: intent.capability,
    taskContract: route.taskContract,
    specialistId: route.primarySpecialistId,
    stages: route.stages,
    missingInputs: needsContext && !context ? ['the concrete outcome or task detail needed to continue'] : [],
  })
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
    taskSpec,
    executionPlan: compileExecutionPlan(taskSpec),
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
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return []
  const { data, error } = await client
    .from('agent_runs')
    .select('id,task_id,status,objective,context,capability,intent,specialist_id,specialist_version,active_specialist_id,active_specialist_version,reasoning_model,task_contract,task_spec,plan,routing_source,specialist_stage_index,specialist_stages,completed_effects,unsatisfied_effects,current_step,waiting_reason,progress,application_state,result,error,error_code,created_at,updated_at')
    .eq('user_id', user.id)
    // A task can have more than one durable run after a retry or recovery.
    // The most recently updated run is the live state; choosing by creation
    // time can surface an older stale question (for example, programme
    // selection) after the canonical run has already reached a transcript
    // boundary.
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(250)
    .returns<AgentRunRow[]>()
  if (error) throw new Error(error.message)
  const mappedRows = (data ?? []).map(mapAgentRun)
  const caseIds = [...new Set(mappedRows.map(run => run.applicationCaseId).filter((value): value is string => Boolean(value)))]
  const caseDataById = new Map<string, unknown>()
  if (caseIds.length) {
    const cases = await client
      .from('application_cases')
      .select('id,data')
      .eq('user_id', user.id)
      .in('id', caseIds)
      .returns<Array<{ id: string; data: unknown }>>()
    if (!cases.error) for (const row of cases.data ?? []) caseDataById.set(row.id, row.data)
  }
  const latestByTask = new Map<string, AgentRun>()
  for (const run of mappedRows) {
    if (!latestByTask.has(run.taskId)) latestByTask.set(run.taskId, { ...run, applicationState: reconcileFacultyIntelligence(run.applicationState, run.applicationCaseId ? caseDataById.get(run.applicationCaseId) : null) })
  }
  return [...latestByTask.values()]
}

export async function loadAgentApprovals(runId: string): Promise<AgentApproval[]> {
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

export type ApplicationAvailabilityDisposition = 'have_now' | 'can_get' | 'can_get_document' | 'need_help' | 'have_score' | 'can_take_before_deadline' | 'cannot_get' | 'cannot_take_before_deadline' | 'not_sure' | 'have_referee' | 'can_find_referee' | 'provide_now' | 'keep_preparing' | 'change_plan' | 'attach_score' | 'enter_score' | 'provide_referee_details' | 'later'

export function updateApplicationRequirementAvailability(
  runId: string,
  requirementId: string,
  disposition: ApplicationAvailabilityDisposition,
  values?: Record<string, unknown>,
) {
  return invokeRunAction(
    { action: 'resume', runId, applicationAvailability: { requirementId, disposition, ...(values ? { values } : {}) } },
    'ShotCount could not update this application item.',
  )
}

export function selectAgentRecipient(runId: string, recipientEmail: string) {
  return invokeRunAction({ action: 'select_recipient', runId, recipientEmail }, 'ShotCount could not select that recipient.')
}

export function pollAgentRun(runId: string) {
  return invokeRunAction({ action: 'poll', runId }, 'ShotCount could not check the external work.')
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
