import { nextRecurringDate, type Recurrence as SharedRecurrence } from './domain'
import { beginGoogleSignIn, cloudEnabled, connectGoogleCalendar, currentUser, getCloudClient, hasGoogleIdentity, signOut as signOutCloud } from './data/cloud'
import { appendTranscript, prepareDescriptionTranscription, transcribeDescriptionAudio } from './data/transcription'
import {
  loadGoogleCalendarEvents,
  loadGoogleCalendarSyncState,
  syncGoogleCalendar,
  type GoogleCalendarEvent,
  type GoogleCalendarSyncState,
} from './data/google-calendar'
import {
  beginGoogleAgentConnection,
  loadGoogleAgentConnection,
  type GoogleAgentConnection,
} from './data/google-agent'
import {
  loadProfile,
  profileDefaults,
  saveProfile,
  uploadProfilePhoto,
  type UserProfile,
  type UserProfileInput,
} from './data/profile'
import {
  enableWebPush,
  showLocalReminder,
  type WebPushStatus,
} from './data/notifications'
import {
  DEFAULT_TASK_REMINDER_MINUTES,
  isTaskReminderDue,
  shouldPromptForToday,
  shouldPromptForTomorrow,
  taskReminderDeliveryKey,
} from './data/reminders'
import { CloudPlannerRepository, createSupabasePlannerAdapter } from './data/sync'
import { roonCapabilityForTask } from './data/roon-capabilities'
import type { SyncState } from './data/contracts'
import { normalizeTask, type PlannerKind, type Task } from './data/planner-model'
import {
  cancelAgentRunRemote,
  createAgentRun,
  decideAgentApproval,
  editAgentCalendarApproval,
  editAgentEmailApproval,
  executeAgentRun,
  loadAgentApprovals,
  loadAgentRuns,
  pollAgentRun,
  resumeAgentRun,
  selectAgentRecipient,
  subscribeToAgentRuns,
  updateApplicationRequirementAvailability,
  type AgentApproval,
  type AgentRun,
  type ApplicationAvailabilityDisposition,
} from './data/agent'
import { agentProgressTimeline, canUserContinueManually, humanizeAgentProgressLabel, humanizeApplicationProgressTitle, prioritizePendingInputs, progressDetailWindow } from './data/agent-progress'
import { mountRoonOrbs, renderRoonOrb } from './data/roon-orb'
import {
  REASONING_MODEL_ID,
  getSpecialist,
  legacySpecialistRoute,
  routeTask,
  specialistRequiredEffects,
  type SpecialistRoute,
} from './data/specialists'
import {
  acceptedTaskFileTypes,
  createTaskFileAssetViewUrl,
  downloadTaskFileAsset,
  loadTaskFileAssets,
  removeTaskFileAsset,
  selectUserVisibleGeneratedFiles,
  isUserVisibleTaskAttachment,
  setFileAssetReusable,
  uploadTaskFileAsset,
  type FileAsset,
} from './data/file-assets'
import { isApplicationIntent } from './data/application'
import { renderRecommendationProgressDetail } from './data/recommendation-progress-detail'
import { renderWorkSampleProgressDetail } from './data/work-sample-progress-detail'
import type { RecommendationInteraction } from '../supabase/functions/_shared/recommendation-workflow'
import type { WorkSampleInteraction } from '../supabase/functions/_shared/work-sample-workflow'
import { renderApplicationQuestionProgressDetail } from './data/application-question-progress-detail'
import type { SupplementalProgressInteraction } from '../supabase/functions/_shared/application-questions'
import { planWindow, type ExecutionPlanNode } from '../supabase/functions/_shared/agent-execution-plan'
import type { ApplicationPendingInput, ApplicationPendingInputField, FacultyIntelligenceView } from '../supabase/functions/_shared/david-applications'
import { applicationPendingInputFor, applicationPendingInputOptions } from '../supabase/functions/_shared/application-pending-input'
import { missingValueOwnerForRequirement } from '../supabase/functions/_shared/application-value-ownership'
import './style.css'
import heroCollage from './assets/shotcount-collage.webp'
import { pcmChunksToWav } from './audio/pcm-wav'

type View = 'today' | 'upcoming' | 'calendar'
type CountKey = 'today' | 'upcoming'
type UpcomingGroup = 'tomorrow' | 'week'
type ActivityMode = 'daily' | 'weekly' | 'cumulative'
type Recurrence = SharedRecurrence
type TodayComposerDraft = {
  title: string
  description: string
  due: string
  time: string
}
type CalendarMode = 'day' | 'week' | 'month'
type Theme = 'light' | 'dark'
const previewParams = new URLSearchParams(window.location.search)
const previewView = previewParams.get('previewView')
const previewAgentState = previewParams.get('previewAgent')
const previewGoogleCalendar = previewParams.has('previewGoogleCalendar')
const googleAgentOAuthStatus = previewParams.get('google')
const isPreviewMode = previewParams.has('previewView')
const showDemoData = isPreviewMode || import.meta.env.MODE === 'test'
type AuthState = 'checking' | 'authenticated' | 'unauthenticated' | 'error'
const hostedWorkspace = window.location.hostname === 'app.shotcount.app' || window.location.hostname.endsWith('.vercel.app')
const localCloudWorkspace = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
// Local development uses the production Supabase project when its Vite cloud
// variables are present. Keep the same auth gate there so actions such as file
// upload never appear available and then fail later because activeUser was
// never initialised.
const authRequired = !isPreviewMode && (hostedWorkspace || (localCloudWorkspace && cloudEnabled))
let authState: AuthState = authRequired ? 'checking' : 'authenticated'
let plannerRepository: CloudPlannerRepository | null = null
let syncState: SyncState = { status: 'loading', message: 'Loading your workspace…', pending: 0 }
let activeUser: Awaited<ReturnType<typeof currentUser>> = null
let userProfile: UserProfile | null = null
let profileDraft: UserProfileInput = profileDefaults()
let profileModalOpen = false
let profileBusy = false
let profileError = ''
let profilePhotoFile: File | null = null
let profilePhotoPreview = ''
let googleAgentConnection: GoogleAgentConnection | null = null
let googleAgentConnectionBusy = false

const app = document.querySelector<HTMLDivElement>('#app')!
const storagePrefix = 'shotcount-workspace-current-v1:'
const viewStorageKey = `${storagePrefix}active-view`
const googleCalendarConsentKey = `${storagePrefix}google-calendar-consent-v2`
const plannerStorageKey = `${storagePrefix}planner`
const themeStorageKey = `${storagePrefix}theme`
const agentRunsStorageKey = `${storagePrefix}agent-runs`
const todayPromptStorageKey = `${storagePrefix}today-prompt-date`
const tomorrowPromptStorageKey = `${storagePrefix}tomorrow-prompt-date`
const reminderDeliveryStorageKey = `${storagePrefix}reminder-deliveries`
const dateStateHook = window as Window & { __shotcountRefreshDateState?: (reference?: Date) => void }

function readStoredValue(storage: Storage, key: string) {
  return storage.getItem(key)
}

function readTheme(): Theme {
  try {
    return readStoredValue(window.localStorage, themeStorageKey) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

let theme: Theme = readTheme()

function applyTheme() {
  document.documentElement.dataset.theme = theme
  document.body.dataset.theme = theme
}

function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark'
  try {
    window.localStorage.setItem(themeStorageKey, theme)
  } catch {
    // The switch still works for this visit when storage is unavailable.
  }
  applyTheme()
  render()
}

applyTheme()

function dateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setHours(12, 0, 0, 0)
  next.setDate(next.getDate() + amount)
  return next
}

function refreshDateContext(reference = new Date()) {
  now = reference
  todayKey = dateKey(reference)
  tomorrowKey = dateKey(addDays(reference, 1))
  weekEndKey = dateKey(addDays(reference, 7))
}

function formatTaskDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function formatTaskTime(value: string) {
  const [hours = '0', minutes = '00'] = value.split(':')
  const hour = Number(hours)
  const displayHour = hour % 12 || 12
  return `${String(displayHour).padStart(2, '0')}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`
}

function readStoredView(): View {
  if (previewParams.get('plan') === 'today') return 'today'
  if (previewParams.get('plan') === 'tomorrow') return 'upcoming'
  if (previewView === 'today' || previewView === 'upcoming' || previewView === 'calendar') {
    return previewView
  }

  const routeView = workspaceViewFromPathname(window.location.pathname)
  if (routeView) return routeView

  try {
    const stored = readStoredValue(window.sessionStorage, viewStorageKey)
    return stored === 'today' || stored === 'upcoming' || stored === 'calendar' ? stored : 'today'
  } catch {
    return 'today'
  }
}

function rememberView(nextView: View) {
  view = nextView
  try {
    window.sessionStorage.setItem(viewStorageKey, nextView)
  } catch {
    // Some browser contexts block storage, so we quietly keep going.
  }
}

function workspaceViewFromPathname(pathname: string): View | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (normalized === '/app' || normalized === '/workspace') return 'today'
  if (normalized === '/app/upcoming') return 'upcoming'
  if (normalized === '/app/calendar') return 'calendar'
  return null
}

let now = new Date()
let todayKey = dateKey(now)
let tomorrowKey = dateKey(addDays(now, 1))
let weekEndKey = dateKey(addDays(now, 7))

const seedTasks: Task[] = [
  { id: 'programme-requirements', title: 'Verify Stanford Physics PhD requirements', due: dateKey(addDays(now, -1)) },
  {
    id: 'statement',
    title: 'Tailor research statement for Stanford Physics PhD',
    due: todayKey,
    subtasks: 1,
    subtaskItems: [{ id: 'statement-subtask', title: 'Confirm programme-specific research fit', completed: false }],
  },
  { id: 'referee', title: 'Ask referee for a recommendation letter', due: todayKey, time: '09:00' },
  { id: 'transcript', title: 'Upload official transcript to the application portal', due: tomorrowKey },
  { id: 'deadline', title: 'Review application deadline and fee waiver', due: dateKey(addDays(now, 2)) },
]
const seedTaskIds = new Set(seedTasks.map(task => task.id))

function readPlannerTasks() {
  try {
    const stored = readStoredValue(window.localStorage, plannerStorageKey)
    if (!stored) return (showDemoData ? seedTasks : []).map(task => normalizeTask(task))
    const parsed = JSON.parse(stored) as Task[]
    if (!Array.isArray(parsed)) return (showDemoData ? seedTasks : []).map(task => normalizeTask(task))
    const cleaned = showDemoData ? parsed : parsed.filter(task => !seedTaskIds.has(task.id))
    if (!showDemoData && cleaned.length !== parsed.length) {
      window.localStorage.setItem(plannerStorageKey, JSON.stringify(cleaned))
    }
    return cleaned.map(task => normalizeTask(task))
  } catch {
    return (showDemoData ? seedTasks : []).map(task => normalizeTask(task))
  }
}

const tasks: Task[] = readPlannerTasks()
let view: View = readStoredView()
let selectedTaskId = showDemoData && tasks.some(task => task.id === 'statement') ? 'statement' : tasks[0]?.id ?? ''
let mobileInspectorOpen = false
const agentRuns = readAgentRuns()
const taskFileAssets = new Map<string, FileAsset[]>()
const loadingTaskFileAssets = new Set<string>()
const taskFileAssetBusy = new Set<string>()
let filePreview: { asset: FileAsset; url: string | null; placement?: 'modal' | 'progress'; loading?: boolean; message?: string } | null = null
const agentApprovals = new Map<string, AgentApproval>()
const agentDecisionBusy = new Set<string>()
const roonContextDrafts = new Map<string, string>()
const programmeSelectionDrafts = new Map<string, string>()
const pendingEmailSends = new Map<string, (proceed: boolean) => void>()
let agentPollingTimer = 0
let agentPollBusy = false
let agentRunsRefreshing = false
// Deduplicate one exact paused state, not the run forever. A recovery can
// legitimately produce a new persisted pause (for example after David checks
// another official source), and that new state deserves its own bounded
// continuation. Unchanged states remain quiet instead of polling in a loop.
const internalAgentRecoveryFingerprints = new Map<string, string>()
const screenCounts: Record<CountKey, number> = { today: 0, upcoming: 0 }
const completedTaskIds = new Set(tasks.filter(task => task.completedAt).map(task => task.id))
let activityMode: ActivityMode = 'daily'
let dailyPlanningPrompt: 'today' | 'tomorrow' | null = null
let plannerDraftGroup: UpcomingGroup | null = null
let todayComposerOpen = false
let todayComposerAttachment: File | null = null
let skipTodayComposerCapture = false
let todayComposerDraft: TodayComposerDraft = {
  title: '',
  description: '',
  due: todayKey,
  time: '',
}
let subtaskComposerTaskId: string | null = null
let editingSubtaskId: string | null = null
let toast = googleAgentOAuthStatus === 'connected'
  ? 'Google is connected to Roon'
  : googleAgentOAuthStatus === 'error'
    ? 'Google could not be connected. Please try again.'
    : ''
let toastTimer: number | undefined
let observedToast = ''
let calendarMode: CalendarMode = 'month'
let calendarDate = new Date(now)
let calendarComposer: { date: string; time: string; taskId?: string } | null = null
let calendarSearch = ''
let draggingCalendarTaskId: string | null = null
let googleCalendarEvents: GoogleCalendarEvent[] = previewGoogleCalendar ? [{
  id: 'google-preview',
  googleEventId: 'google-preview',
  calendarId: 'primary',
  calendarName: 'Google Calendar',
  calendarColor: '#4285f4',
  title: 'Google design review',
  startAt: `${todayKey}T10:00:00.000Z`,
  endAt: `${todayKey}T11:00:00.000Z`,
  startDate: null,
  endDate: null,
  allDay: false,
  location: 'Google Meet',
  htmlLink: 'https://calendar.google.com/calendar/event?eid=preview',
}] : []
let googleCalendarState: GoogleCalendarSyncState = previewGoogleCalendar
  ? { status: 'synced', lastSyncedAt: new Date().toISOString(), message: '' }
  : { status: 'idle', lastSyncedAt: null, message: '' }
let googleCalendarBusy = false
let googleCalendarSyncTimer: number | undefined
let browserPushStatus: WebPushStatus = 'available'
let browserPushBusy = false
const MAX_DESCRIPTION_RECORDING_MS = 2 * 60 * 1000
let descriptionRecorder: MediaRecorder | null = null
let descriptionRecordingTaskId: string | null = null
let descriptionRecordingTimer: number | undefined
let descriptionRecordingStartedAt = 0
let descriptionRecordingStopPending = false
let descriptionAudioContext: AudioContext | null = null
let descriptionAudioSource: MediaStreamAudioSourceNode | null = null
let descriptionAudioProcessor: ScriptProcessorNode | null = null
let descriptionAudioSink: GainNode | null = null
let descriptionPcmChunks: Float32Array[] = []
let descriptionPcmSampleRate = 0
let descriptionPcmPeak = 0
let descriptionTranscribingTaskId: string | null = null
let agentRunSubscription: (() => void) | null = null

const icons: Record<string, string> = {
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
  upcoming: '<path d="m7 7 5 5-5 5M13 7l5 5-5 5"/>',
  today: '<path d="M7 6h12M7 12h12M7 18h12"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="1"/><path d="M8 3v4M16 3v4M4 9h16M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/>',
  sticky: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/>',
  moon: '<path d="M20 15.2A8 8 0 1 1 8.8 4 6.5 6.5 0 0 0 20 15.2Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>',
  logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m8 10 4 4 4-4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7"/>',
  paperclip: '<path d="m20.5 11.5-8.9 8.9a5 5 0 0 1-7.1-7.1l9.6-9.6a3.5 3.5 0 1 1 5 5l-9.7 9.6a2 2 0 0 1-2.8-2.8l8.9-8.8"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.5h.01"/>',
}

function icon(name: string) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name]}</svg>`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

async function refreshAgentRuns() {
  if (!activeUser || agentRunsRefreshing) return
  agentRunsRefreshing = true
  try {
    const durableRuns = await loadAgentRuns()
    const pendingApprovals = (await Promise.all(
      durableRuns
        .filter(run => run.status === 'needs_approval')
        .map(run => loadAgentApprovals(run.id)),
    )).flat().filter(approval => approval.status === 'pending')
    agentRuns.clear()
    durableRuns.forEach(run => agentRuns.set(run.taskId, run))
    agentApprovals.clear()
    pendingApprovals.forEach(approval => agentApprovals.set(approval.runId, approval))
    persistAgentRuns()
    // Task state is ready before attachment metadata. Keep the workspace
    // responsive while that secondary read finishes in the background.
    render()
    if (selectedTaskId) {
      const taskId = selectedTaskId
      void loadTaskFileAssets(taskId).then(selectedAssets => {
        if (selectedTaskId !== taskId) return
        taskFileAssets.set(taskId, selectedAssets)
        const selectedTask = tasks.find(task => task.id === taskId)
        if (selectedTask) resumeApplicationRunForNewAttachment(selectedTask, selectedAssets)
        render()
      }).catch(() => undefined)
    }
  } catch {
    // The task workspace remains usable while durable runs reconnect.
  } finally {
    agentRunsRefreshing = false
  }
}

async function pollWaitingAgentRuns() {
  if ((!activeUser && !isPreviewMode) || agentPollBusy || document.visibilityState === 'hidden') return
  // A provider write normally continues in the same approval response. Poll
  // active application runs as a recovery path too. An application turn can
  // take longer than the browser request that started it; without this nudge a
  // dropped response leaves the panel stuck on a stale activity message until the periodic
  // server sweep catches it. The server-side lease makes this safe: while the
  // original turn still owns the run, a poll only reads its durable state and
  // cannot replay the model turn.
  const staleApplicationRuns = [...agentRuns.values()].filter(run =>
    isApplicationIntent(run.objective, run.context) &&
    ['planning', 'running'].includes(run.status) &&
    !agentDecisionBusy.has(run.id) &&
    Date.now() - Date.parse(run.updatedAt) >= 20_000,
  )
  const waitingRuns = [...agentRuns.values()].filter(run => run.status === 'waiting_external')
  const internalRecoveryRuns = [...agentRuns.values()].filter(run => {
    const officialProgrammeSourceRecovery = ['waiting_for_user', 'needs_context'].includes(run.status) &&
      (
        run.errorCode === 'application_official_source_required' ||
        /official .*?(?:url|link|document|domain)|programme document|program(?:me)? admissions URL|verify .*requirements.*application workspace|couldn.?t access .*official|official .*?pages? .*?(?:accessed|available)|browser recovery path|authoritative source.*verify/i.test(run.waitingReason)
      )
    const applicationRequirementsRecovery = ['failed', 'waiting_for_user', 'needs_context'].includes(run.status) &&
      (
        run.errorCode === 'application_requirements_incomplete' ||
        /represent every required application item explicitly|application requirements?.*(?:incomplete|missing|snapshot)|required application item/i.test(`${run.errorCode ?? ''} ${run.error ?? ''} ${run.waitingReason}`)
      )
    const applicationCvRecovery = ['failed', 'waiting_for_user', 'needs_context'].includes(run.status) &&
      (
        [
        'application_cv_source_unavailable',
        'application_cv_source_page_count_mismatch',
        'application_cv_factual_inventory_invalid',
        'application_cv_compilation_failed',
        'application_cv_layout_invalid',
        'application_cv_tailoring_brief_invalid',
        'application_cv_tailoring_target_mismatch',
        'application_cv_tailoring_source_invalid',
        'application_cv_programme_fit_ungrounded',
        'application_cv_programme_fit_provenance_missing',
        'application_cv_tailoring_rules_outdated',
        'application_cv_render_invalid',
        ].includes(run.errorCode ?? '') ||
        (run.errorCode === 'application_official_source_required' && /tailoring brief must cite|cv.*official source|programme-specific cv/i.test(`${run.error ?? ''} ${run.waitingReason}`))
      ) &&
      /cv|resume|tailoring|programme fit|official source|applicant profile/i.test(`${run.error ?? ''} ${run.waitingReason}`)
    // The exact source-research blocker is safe to recover on its own. Keep
    // it eligible even when an older run was persisted without the full
    // application intent metadata needed by the normal classifier.
    if (!isApplicationIntent(run.objective, run.context) && !officialProgrammeSourceRecovery) return false
    const recoveryFingerprint = `${run.status}|${run.errorCode ?? ''}|${run.waitingReason}|${run.updatedAt}`
    if (internalAgentRecoveryFingerprints.get(run.id) === recoveryFingerprint) return false
    const browserAllowlistRecovery = ['waiting_for_user', 'needs_context'].includes(run.status) &&
      (
        run.errorCode === 'browser_domain_not_allowed' ||
        /browser allowlist/i.test(run.waitingReason) ||
        /outside the task/i.test(run.waitingReason)
      )
    const singleProgrammeRecovery = run.status === 'needs_context' &&
      /approve creating .*application case/i.test(run.waitingReason)
    const semanticHandoffRecovery = run.status === 'waiting_for_user' &&
      run.errorCode === 'application_semantic_handoff'
    // Programme-source research is internal work. If a bounded pass stopped
    // too early, wake the persisted run so it can continue through verified
    // university sources before asking the applicant for anything.
    const recommendationSourceRecovery = run.status === 'needs_context' &&
      (run.contextInteraction?.id === 'recommendation:requirements-source' ||
        run.errorCode === 'recommendation_source_not_found' ||
        /recommendation rules aren.t clear yet/i.test(run.waitingReason))
    const failedApplicationRecovery = run.status === 'failed' &&
      ['agent_execution_error', 'model_reasoning_luna', 'application_controller_repair_exhausted', 'step_limit_reached'].includes(run.errorCode ?? '')
    const intermediateApplicationRecovery = run.status === 'completed' &&
      Boolean(run.applicationState) &&
      !['complete', 'submitted', 'post_submission'].includes(String(run.applicationState?.stage ?? '').toLocaleLowerCase()) &&
      String(run.applicationState?.status ?? '').toLocaleLowerCase() !== 'complete'
    const autonomousProgrammeDiscoveryRecovery = run.status === 'needs_context' &&
      isApplicationIntent(run.objective, run.context) &&
      !isApplicationProgrammeSelectionInteraction(run.contextInteraction ?? null) &&
      Boolean(run.applicationState) &&
      ['intake', 'research', 'shortlist_approval'].includes(String(run.applicationState?.stage ?? '').toLocaleLowerCase()) &&
      !run.applicationState?.currentCaseId &&
      Number(run.applicationState?.verifiedOpportunityCount ?? 0) > 0 &&
      applicationNeedsProgrammeDiscovery(run.applicationState, run)
    return browserAllowlistRecovery || singleProgrammeRecovery || semanticHandoffRecovery || recommendationSourceRecovery || officialProgrammeSourceRecovery || applicationRequirementsRecovery || applicationCvRecovery || failedApplicationRecovery || intermediateApplicationRecovery || autonomousProgrammeDiscoveryRecovery
  })
  internalRecoveryRuns.forEach(run => {
    internalAgentRecoveryFingerprints.set(run.id, `${run.status}|${run.errorCode ?? ''}|${run.waitingReason}|${run.updatedAt}`)
  })
  const recoverableRuns = [...waitingRuns, ...staleApplicationRuns, ...internalRecoveryRuns]
  if (!recoverableRuns.length) return
  agentPollBusy = true
  try {
    const updatedRuns = await Promise.all(recoverableRuns.map(run => {
      const discoveryRecovery = Boolean(run.applicationState && applicationNeedsProgrammeDiscovery(run.applicationState, run))
      return discoveryRecovery
        ? resumeAgentRun(run.id, 'Continue the verified programme search for this application. Use the attached CV and official sources, then show the ranked programme options.')
        : pollAgentRun(run.id)
    }))
    for (const run of updatedRuns) {
      agentRuns.set(run.taskId, run)
      await syncAgentApproval(run)
    }
    persistAgentRuns()
    render()
  } catch {
    // The next isolated polling pass retries without interrupting the workspace.
  } finally {
    agentPollBusy = false
  }
}

async function startAgentRunSystem() {
  agentRunSubscription?.()
  agentRunSubscription = null
  window.clearInterval(agentPollingTimer)
  agentPollingTimer = 0
  // Install the watchdog before the initial durable refresh. If that refresh
  // is slow or temporarily unavailable, cached runs can still wake the
  // server-side recovery path instead of waiting for the bootstrap to finish.
  agentPollingTimer = window.setInterval(() => void pollWaitingAgentRuns(), 5_000)
  await refreshAgentRuns()
  try {
    agentRunSubscription = await subscribeToAgentRuns(() => void refreshAgentRuns())
  } catch {
    // A focus refresh can recover if realtime is temporarily unavailable.
  }
  void pollWaitingAgentRuns()
}

function readAgentRuns() {
  try {
    const stored = window.localStorage.getItem(agentRunsStorageKey)
    if (!stored) return new Map<string, AgentRun>()
    const parsed = JSON.parse(stored) as AgentRun[]
    return new Map(parsed.map(run => {
      const task = { title: run.objective, description: run.context }
      const migrated = !run.specialistId && !run.activeSpecialistId
        ? legacySpecialistRoute(task.title, task.description, run.capability)
        : null
      const route = migrated ?? taskSpecialistRoute(task)
      const specialistId = run.specialistId ?? route?.primarySpecialistId ?? null
      const specialist = getSpecialist(specialistId)
      const taskContract = run.taskContract ?? route?.taskContract ?? null
      const unsatisfiedEffects = Array.isArray(run.unsatisfiedEffects)
        ? run.unsatisfiedEffects
        : specialistId && taskContract
          ? specialistRequiredEffects(specialistId, `${run.objective} ${run.context ?? ''}`, taskContract)
          : []
      const currentProgress = ['planning', 'running', 'waiting_external'].includes(run.status) &&
        run.currentProgress && getSpecialist(run.currentProgress.specialistId) && run.currentProgress.label?.trim()
        ? {
            specialistId: run.currentProgress.specialistId,
            label: run.currentProgress.label.trim(),
          }
        : null
      return [run.taskId, {
        ...run,
        specialistId,
        specialistVersion: run.specialistVersion ?? specialist?.version ?? null,
        activeSpecialistId: run.activeSpecialistId ?? specialistId,
        activeSpecialistVersion: run.activeSpecialistVersion ?? run.specialistVersion ?? specialist?.version ?? null,
        reasoningModel: REASONING_MODEL_ID,
        taskContract,
        routingSource: run.routingSource ?? (migrated ? 'legacy_migration' : route?.classification === 'deterministic' ? 'deterministic' : 'semantic'),
        specialistStageIndex: run.specialistStageIndex ?? 0,
        specialistStages: Array.isArray(run.specialistStages) && run.specialistStages.length ? run.specialistStages : route?.stages ?? [],
        completedEffects: Array.isArray(run.completedEffects) ? run.completedEffects : [],
        unsatisfiedEffects,
        progressIndex: run.progressIndex ?? run.currentStep ?? -1,
        progress: Array.isArray(run.progress) ? run.progress : [],
        currentProgress,
        durable: Boolean(run.durable),
      } as AgentRun]
    }))
  } catch {
    return new Map<string, AgentRun>()
  }
}

function persistAgentRuns() {
  try {
    window.localStorage.setItem(agentRunsStorageKey, JSON.stringify([...agentRuns.values()]))
  } catch {
    // Agent state remains available for this visit if private storage is unavailable.
  }
}

function taskSpecialistRoute(task: Pick<Task, 'title' | 'description'>): SpecialistRoute {
  return routeTask(task.title, task.description)
}

function specialistForTask(task: Pick<Task, 'title' | 'description'>, run?: AgentRun | null) {
  const route = taskSpecialistRoute(task)
  const liveProgressSpecialist = run?.currentProgress?.specialistId
  const assigned = run?.activeSpecialistId ?? liveProgressSpecialist ?? run?.specialistId ?? route.primarySpecialistId
  if (assigned) return getSpecialist(assigned)
  // Legacy tasks that were previously delegated to Roon retain a subtle
  // identity treatment in the existing inspector while the server performs
  // the new domain classification. This is presentation compatibility, not
  // a routing fallback: unsupported work still stops for context.
  return roonCapabilityForTask(task) ? getSpecialist('roon') : null
}

function specialistName(task: Pick<Task, 'title' | 'description'>, run?: AgentRun | null) {
  return specialistForTask(task, run)?.displayName ?? 'ShotCount'
}

function specialistHeader(task: Pick<Task, 'title' | 'description'>, run?: AgentRun | null) {
  // Application progress is a user-facing workspace, not an ownership
  // trace. Keep the internal David/Roon routing labels in diagnostics while
  // presenting a stable product label beside the applicant's work.
  if (isApplicationIntent(task.title, task.description)) return '<strong>Application</strong>'
  const specialist = specialistForTask(task, run)
  if (!specialist) return '<strong>ShotCount</strong>'
  return `<strong>${escapeHtml(specialist.displayName)}</strong>`
}

function agentUpdateToast(run: AgentRun) {
  if (run.status === 'completed') return 'Your task is ready'
  if (run.status === 'needs_approval') return 'Ready for your approval'
  if (run.status === 'needs_context') return 'Add the requested details to continue'
  if (run.status === 'waiting_external') return 'I’ll continue as soon as there’s an update'
  if (run.status === 'waiting_for_user') return 'I need your next step'
  if (run.status === 'failed') return humanizeAgentProgressLabel(run.error) || 'I hit a snag, but your task is safe.'
  return 'I’m moving your task forward'
}

function clearAgentToast(expected: string) {
  window.setTimeout(() => {
    if (toast !== expected) return
    toast = ''
    render()
  }, 1200)
}

function ensureToastDismissal() {
  if (!toast) {
    observedToast = ''
    return
  }
  if (toast === observedToast) return
  observedToast = toast
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    if (toast === observedToast) {
      toast = ''
      observedToast = ''
      render()
    }
  }, 1200)
}

async function refreshTaskFileAssetsForAgent(taskId: string) {
  try {
    taskFileAssets.set(taskId, await loadTaskFileAssets(taskId))
  } catch {
    // The run result remains useful if the secondary asset listing is briefly
    // unavailable; the inspector's normal refresh will reconcile it later.
  }
}

async function startAgentRun(task: Task, context = '', interactionResponse?: { interactionId: string; kind: string; value: unknown; reusable?: boolean }) {
  const route = taskSpecialistRoute(task)
  if (!route.supported && !route.needsSemanticClassification) {
    toast = 'ShotCount cannot assign this task to a supported specialist yet.'
    render()
    clearAgentToast(toast)
    return
  }
  const existing = agentRuns.get(task.id)
  const canResumeDurableRun = context && existing?.durable && (
    existing.status === 'needs_context' ||
    (existing.status === 'waiting_for_user' && Boolean(interactionResponse)) ||
    // A recoverable application worker failure must continue the same
    // durable run. In particular, a malformed PDF/model-history payload can
    // leave the browser cache at `failed` while its typed application
    // decision is still the current boundary. Starting a replacement run
    // would duplicate the task and lose the existing case checkpoint.
    (existing.status === 'failed' && isApplicationIntent(task.title, task.description) &&
      /unsupported Unicode|agent_execution_error|application requirement/i.test(`${existing.error ?? ''} ${existing.errorCode ?? ''}`))
  )
  if (canResumeDurableRun) {
    agentDecisionBusy.add(existing.id)
    existing.context = context
    existing.status = 'planning'
    existing.waitingReason = ''
    const specialist = getSpecialist(existing.activeSpecialistId ?? existing.specialistId)
    existing.currentProgress = specialist
      ? { specialistId: specialist.id, label: `${specialist.displayName} is preparing the next verified operation.` }
      : null
    persistAgentRuns()
    render()
    try {
      const resumed = await resumeAgentRun(existing.id, context, interactionResponse)
      agentRuns.set(task.id, resumed)
      await syncAgentApproval(resumed)
      await refreshTaskFileAssetsForAgent(task.id)
      toast = agentUpdateToast(resumed)
    } catch (error) {
      existing.status = 'failed'
      existing.error = error instanceof Error ? error.message : `${specialistName(task, existing)} could not resume this task.`
      toast = existing.error
    } finally {
      agentDecisionBusy.delete(existing.id)
      persistAgentRuns()
      render()
      if (toast) clearAgentToast(toast)
    }
    return
  }

  // A typed interaction belongs to one persisted run. Never turn a transient
  // client refresh or auth-cache race into a replacement run; reload the
  // durable state and let the applicant retry the exact same interaction.
  if (interactionResponse && existing) {
    toast = 'Refreshing this application step…'
    render()
    void refreshAgentRuns()
    clearAgentToast(toast)
    return
  }

  const run = createAgentRun(task, context)
  agentRuns.set(task.id, run)
  selectedTaskId = task.id
  mobileInspectorOpen = true
  persistAgentRuns()
  render()
  if (run.status === 'needs_context') return

  agentDecisionBusy.add(run.id)
  run.status = 'running'
  run.progressIndex = 0
  const specialist = getSpecialist(run.activeSpecialistId ?? run.specialistId)
  run.currentProgress = specialist
    ? { specialistId: specialist.id, label: `${specialist.displayName} is preparing the first verified operation.` }
    : null
  persistAgentRuns()
  render()

  try {
    let completed = await executeAgentRun(task, run)
    if (agentRuns.get(task.id)?.status === 'cancelled') return
    if (
      completed.status === 'needs_context' &&
      /^Which .+\?$/.test(completed.waitingReason) &&
      !completed.recipientResolution
    ) {
      const persisted = (await loadAgentRuns()).find(candidate => candidate.id === completed.id)
      if (persisted) completed = persisted
    }
    agentRuns.set(task.id, completed)
    await syncAgentApproval(completed)
    await refreshTaskFileAssetsForAgent(task.id)
    toast = agentUpdateToast(completed)
  } catch (error) {
    if (agentRuns.get(task.id)?.status === 'cancelled') return
    run.status = 'failed'
    run.error = error instanceof Error ? error.message : `${specialistName(task, run)} could not complete this task.`
    run.updatedAt = new Date().toISOString()
    toast = humanizeAgentProgressLabel(run.error)
  } finally {
    agentDecisionBusy.delete(run.id)
    persistAgentRuns()
    render()
    if (toast) clearAgentToast(toast)
  }
}

function roonContinuationContext(task: Task, note: string) {
  const latestDescription = task.description?.trim()
  return latestDescription
    ? `Latest task Description from the user:\n${latestDescription}\n\n${note}`
    : note
}

function isWorkSampleProgressInteraction(value: unknown): value is WorkSampleInteraction {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).workflow === 'work_sample')
}

function isRecommendationProgressInteraction(value: unknown): value is RecommendationInteraction {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (value as Record<string, unknown>).workflow !== 'work_sample' &&
    (value as Record<string, unknown>).kind !== 'application_question')
}

function isRecommendationMultipleChoiceInteraction(value: unknown): value is RecommendationInteraction & { kind: 'multiple_choice' } {
  return isRecommendationProgressInteraction(value) && value.kind === 'multiple_choice'
}

function recommendationInteractionContext(interaction: RecommendationInteraction | WorkSampleInteraction | SupplementalProgressInteraction, value: unknown) {
  const serialized = Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'Approved' : 'Not approved') : String(value ?? '').trim()
  return `Typed Progress Detail response for ${interaction.kind} (${interaction.id}): ${serialized}`
}

function submitRecommendationInteraction(task: Task, interaction: RecommendationInteraction | WorkSampleInteraction | SupplementalProgressInteraction, value: unknown) {
  const run = agentRuns.get(task.id)
  if (!run || !value || agentDecisionBusy.has(run.id)) return
  roonContextDrafts.delete(run.id)
  void startAgentRun(task, recommendationInteractionContext(interaction, value), {
    interactionId: interaction.id,
    kind: interaction.kind,
    value,
    reusable: interaction.kind === 'application_question' ? false : interaction.reusableContextKeys.length > 0,
  })
}

function resumeApplicationRunForNewAttachment(task: Task, assets: FileAsset[]) {
  const run = agentRuns.get(task.id)
  if (
    !isApplicationIntent(task.title, task.description) ||
    run?.status !== 'needs_context' ||
    agentDecisionBusy.has(run.id)
  ) return
  const runUpdatedAt = Date.parse(run.updatedAt)
  const hasNewUpload = assets.some(asset =>
    asset.source === 'task_upload' && Date.parse(asset.createdAt) > runUpdatedAt,
  )
  const replacementPdfConfirmed =
    /NOT A REAL APPLICANT|authoritative CV/i.test(run.waitingReason) &&
    assets.some(asset => asset.source === 'task_upload' && asset.mimeType === 'application/pdf')
  if (hasNewUpload || replacementPdfConfirmed) {
    void startAgentRun(task, replacementPdfConfirmed
      ? roonContinuationContext(task, 'The user confirms that the attached PDF is their real CV. Use it as authorised applicant context and continue the application workflow.')
      : roonContinuationContext(task, 'A new attachment was added. Use it as the requested context and continue the application workflow.'))
  }
}

async function syncAgentApproval(run: AgentRun) {
  if (run.status !== 'needs_approval') {
    agentApprovals.delete(run.id)
    return
  }
  // The run can reach needs_approval just before its approval row is committed.
  // Retry briefly so the panel does not get stuck on the waiting state.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const pending = (await loadAgentApprovals(run.id)).find(approval => approval.status === 'pending')
      if (pending) {
        agentApprovals.set(run.id, pending)
        return
      }
    } catch {
      // A later attempt, realtime update, or refresh can recover the details.
    }
    await new Promise(resolve => window.setTimeout(resolve, 150 * (attempt + 1)))
  }
}

async function decidePendingAgentApproval(taskId: string, decision: 'approve' | 'reject') {
  const run = agentRuns.get(taskId)
  const task = tasks.find(item => item.id === taskId)
  const approval = run ? agentApprovals.get(run.id) : null
  if (!run || !approval || agentDecisionBusy.has(approval.id) || pendingEmailSends.has(approval.id)) return
  const editedSubject = approval.kind === 'send_email'
    ? document.querySelector<HTMLInputElement>(`[data-agent-email-subject="${taskId}"]`)?.value.trim() ?? ''
    : ''
  const editedBody = approval.kind === 'send_email'
    ? document.querySelector<HTMLTextAreaElement>(`[data-agent-email-body="${taskId}"]`)?.value.trim() ?? ''
    : ''
  const editedCalendarSummary = approval.kind === 'calendar_write'
    ? document.querySelector<HTMLInputElement>(`[data-agent-calendar-summary="${taskId}"]`)?.value.trim() ?? ''
    : ''
  const editedCalendarDescription = approval.kind === 'calendar_write'
    ? document.querySelector<HTMLTextAreaElement>(`[data-agent-calendar-description="${taskId}"]`)?.value.trim() ?? ''
    : ''
  const editedCalendarStart = approval.kind === 'calendar_write'
    ? document.querySelector<HTMLInputElement>(`[data-agent-calendar-start="${taskId}"]`)?.value.trim() ?? ''
    : ''
  const editedCalendarEnd = approval.kind === 'calendar_write'
    ? document.querySelector<HTMLInputElement>(`[data-agent-calendar-end="${taskId}"]`)?.value.trim() ?? ''
    : ''
  agentDecisionBusy.add(approval.id)
  render()
  try {
    let approvalToDecide = approval
    if (decision === 'approve' && approval.kind === 'send_email') {
      if (!editedSubject || !editedBody) throw new Error('Add both a subject and email body before sending.')
      const currentSubject = String(approvalPreviewValue(approval, 'subject') ?? '').trim()
      const currentBody = String(approvalPreviewValue(approval, 'body_text') ?? '').trim()
      const file = document.querySelector<HTMLInputElement>(`[data-agent-email-attachment="${taskId}"]`)?.files?.[0]
      const attachment = file ? await new Promise<{ name: string; base64: string; mimeType: string }>((resolve, reject) => {
        if (file.size > 1_000_000) return reject(new Error('Attachments must be 1 MB or smaller for now.'))
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('The attachment could not be read.'))
        reader.onload = () => resolve({ name: file.name, mimeType: file.type, base64: String(reader.result).split(',').at(-1) ?? '' })
        reader.readAsDataURL(file)
      }) : undefined
      const safety = approvalPreviewValue(approval, 'safety') as { requiresAttachment?: boolean; hasPlaceholder?: boolean } | ''
      const persistedAttachment = approvalPreviewValue(approval, 'attachment') as { name?: string; sha256?: string } | null
      if (safety && safety.requiresAttachment && !attachment && !persistedAttachment?.name && !persistedAttachment?.sha256) throw new Error('Choose the attachment mentioned in this email before sending.')
      if (safety && safety.hasPlaceholder) throw new Error('Remove unfinished placeholders before sending.')
      if (editedSubject !== currentSubject || editedBody !== currentBody || attachment) {
        await editAgentEmailApproval(approval, editedSubject, editedBody, attachment)
        const refreshed = (await loadAgentApprovals(run.id)).find(item => item.status === 'pending')
        if (!refreshed) throw new Error('The edited email approval could not be reloaded.')
        agentApprovals.set(run.id, refreshed)
        approvalToDecide = refreshed
      }
      const shouldSend = await new Promise<boolean>(resolve => {
        pendingEmailSends.set(approvalToDecide.id, resolve)
        window.setTimeout(() => {
          const pending = pendingEmailSends.get(approvalToDecide.id)
          if (pending === resolve) {
            pendingEmailSends.delete(approvalToDecide.id)
            resolve(true)
            render()
          }
        }, 3000)
        render()
      })
      if (!shouldSend) return
    }
    if (decision === 'approve' && approval.kind === 'calendar_write') {
      const currentSummary = String(approvalPreviewValue(approval, 'summary') ?? '').trim()
      const currentDescription = String(approvalPreviewValue(approval, 'description') ?? '').trim()
      const currentStart = String(approvalPreviewValue(approval, 'start') ?? '').trim()
      const currentEnd = String(approvalPreviewValue(approval, 'end') ?? '').trim()
      if (approval.payload.toolName === 'calendar.create_event' && (!editedCalendarSummary || !editedCalendarStart || !editedCalendarEnd)) {
        throw new Error('Add an event title and valid start and end times before confirming.')
      }
      if (editedCalendarSummary !== currentSummary || editedCalendarDescription !== currentDescription || editedCalendarStart !== currentStart || editedCalendarEnd !== currentEnd) {
        await editAgentCalendarApproval(approval, editedCalendarSummary, editedCalendarDescription, editedCalendarStart, editedCalendarEnd)
        const refreshed = (await loadAgentApprovals(run.id)).find(item => item.status === 'pending')
        if (!refreshed) throw new Error('The edited calendar approval could not be reloaded.')
        agentApprovals.set(run.id, refreshed)
        approvalToDecide = refreshed
      }
    }
    const updated = await decideAgentApproval(approvalToDecide, decision)
    agentRuns.set(taskId, updated)
    agentApprovals.delete(run.id)
    await syncAgentApproval(updated)
    if (isPreviewMode && updated.status === 'waiting_external') {
      window.setTimeout(() => void pollWaitingAgentRuns(), 750)
    }
    toast = decision === 'approve'
      ? `Approved — ${task ? specialistName(task, updated) : 'ShotCount'} is continuing`
      : 'Action declined'
  } catch (error) {
    toast = error instanceof Error ? error.message : `${task ? specialistName(task, run) : 'ShotCount'} could not apply that decision.`
  } finally {
    agentDecisionBusy.delete(approval.id)
    persistAgentRuns()
    render()
    if (toast) clearAgentToast(toast)
  }
}

async function retryAgentRun(taskId: string) {
  const run = agentRuns.get(taskId)
  const task = tasks.find(item => item.id === taskId)
  if (!run || agentDecisionBusy.has(run.id)) return
  if (!run.durable) {
    if (task) await startAgentRun(task, run.context)
    return
  }
  agentDecisionBusy.add(run.id)
  render()
  try {
    // Programme discovery is an active application operation, not a passive
    // provider poll. A legacy run can still carry an official-source blocker
    // after the backend has learned the batch-search path; resuming the same
    // controller lets David call application.search_programmes and persist
    // the shortlist instead of replaying the old one-source recovery.
    const discoveryRecovery = Boolean(run.applicationState && applicationNeedsProgrammeDiscovery(run.applicationState, run))
    const internalRecovery = [
      'application_requirements_repair_paused',
      'application_official_source_required',
      'application_requirements_incomplete',
      'application_cv_source_unavailable',
      'application_cv_source_page_count_mismatch',
      'application_cv_factual_inventory_invalid',
      'application_cv_compilation_failed',
      'application_cv_layout_invalid',
      'application_cv_tailoring_brief_invalid',
      'application_cv_tailoring_target_mismatch',
      'application_cv_tailoring_source_invalid',
      'application_cv_programme_fit_ungrounded',
      'application_cv_programme_fit_provenance_missing',
      'application_cv_tailoring_rules_outdated',
      'application_cv_render_invalid',
    ].includes(run.errorCode ?? '') ||
      /official .*?(?:url|link|document|domain)|programme document|browser recovery path|represent every required application item explicitly|application requirements?.*(?:incomplete|missing|snapshot)|cv.*(?:tailoring|programme fit|official source)|tailoring brief must cite/i.test(`${run.errorCode ?? ''} ${run.error ?? ''} ${run.waitingReason}`)
    const cvRecovery = /^application_cv_/i.test(run.errorCode ?? '') ||
      /\bcv\b.*(?:tailoring|programme fit|official source|render|page|coverage|latex)|LaTeX (?:compilation|recovery) failed/i.test(`${run.error ?? ''} ${run.waitingReason}`)
    // A failed application run may have lost the specific worker error. Only
    // known deterministic recovery states use the poll/reconcile path; every
    // other retry must reset the durable model turn so a transient worker or
    // schema failure cannot be replayed forever.
    const requirementRepairRecovery = run.status === 'needs_context' && run.errorCode === 'application_requirements_repair_paused'
    const updated = await (discoveryRecovery
      ? resumeAgentRun(run.id, 'Continue the verified programme search for this application. Use the attached CV and official sources, then show the ranked programme options.')
      : requirementRepairRecovery
        ? resumeAgentRun(run.id, 'Resume the existing application from its last confirmed requirements checkpoint. Keep the same task, programme, application case, and source evidence; do not rediscover or create duplicates.')
      : cvRecovery
        ? resumeAgentRun(run.id, 'Restart only the CV-generation checkpoint. Give the attached one-page CV directly to the model with the verified programme brief, return complete Jake-template LaTeX, compile it to exactly one page, and stop with the PDF preview for review.')
      : internalRecovery
        ? pollAgentRun(run.id)
        : resumeAgentRun(run.id))
    agentRuns.set(taskId, updated)
    await syncAgentApproval(updated)
    await refreshTaskFileAssetsForAgent(taskId)
    toast = agentUpdateToast(updated)
  } catch (error) {
    toast = error instanceof Error ? error.message : `${task ? specialistName(task, run) : 'ShotCount'} could not resume this task.`
  } finally {
    agentDecisionBusy.delete(run.id)
    persistAgentRuns()
    render()
    if (toast) clearAgentToast(toast)
  }
}

async function chooseAgentRecipient(taskId: string, recipientEmail: string) {
  const run = agentRuns.get(taskId)
  const task = tasks.find(item => item.id === taskId)
  if (!run || agentDecisionBusy.has(run.id)) return
  agentDecisionBusy.add(run.id)
  render()
  try {
    const updated = await selectAgentRecipient(run.id, recipientEmail)
    agentRuns.set(taskId, updated)
    await syncAgentApproval(updated)
    toast = agentUpdateToast(updated)
  } catch (error) {
    toast = error instanceof Error ? error.message : `${task ? specialistName(task, run) : 'Roon'} could not select that recipient.`
  } finally {
    agentDecisionBusy.delete(run.id)
    persistAgentRuns()
    render()
    if (toast) clearAgentToast(toast)
  }
}

function cancelAgentRun(taskId: string) {
  const run = agentRuns.get(taskId)
  if (!run) return
  run.status = 'cancelled'
  run.updatedAt = new Date().toISOString()
  persistAgentRuns()
  render()
  if (activeUser) {
    void cancelAgentRunRemote(run.id).then(remoteRun => {
      agentRuns.set(taskId, remoteRun)
      persistAgentRuns()
      render()
    }).catch(() => {
      // Realtime or the next refresh will reconcile a temporary network failure.
    })
  }
}

function addAgentFollowUps(task: Task) {
  const run = agentRuns.get(task.id)
  const followUps = run?.result?.followUps ?? []
  const existing = new Set(tasks.map(item => item.title.toLocaleLowerCase()))
  const created = followUps
    .filter(title => !existing.has(title.toLocaleLowerCase()))
    .map(title => normalizeTask({
      id: crypto.randomUUID(),
      title,
      description: `Suggested by ${specialistName(task, run)} from “${task.title}”.`,
      due: todayKey,
      subtaskItems: [],
    }))
  tasks.push(...created)
  persistPlanner()
  refreshCounts()
  toast = `${created.length} follow-up task${created.length === 1 ? '' : 's'} added`
  render()
}

function persistPlanner() {
  if (plannerRepository) {
    plannerRepository.save({ tasks })
    return
  }
  try {
    window.localStorage.setItem(plannerStorageKey, JSON.stringify(tasks))
  } catch {
    // The planner still works for this visit when storage is unavailable.
  }
}

function belongsOnTodayList(task: Task) {
  if (!task.due || task.due > todayKey) return false
  if (!task.completedAt) return true
  const completedDate = new Date(task.completedAt)
  return !Number.isNaN(completedDate.getTime()) && dateKey(completedDate) === todayKey
}

function tasksForToday() {
  return tasks.filter(task => belongsOnTodayList(task))
}

function tasksForUpcoming(group: UpcomingGroup) {
  return tasks.filter(task => {
    if (!task.due) return false
    if (group === 'tomorrow') return task.due === tomorrowKey
    return task.due > tomorrowKey && task.due <= weekEndKey
  })
}

function sortTasks(items: Task[]) {
  return [...items].sort((first, second) => {
    const completionDifference = Number(completedTaskIds.has(first.id)) - Number(completedTaskIds.has(second.id))
    if (completionDifference) return completionDifference
    return (first.due ?? '').localeCompare(second.due ?? '')
  })
}

function refreshCounts() {
  screenCounts.today = tasksForToday().filter(task => !completedTaskIds.has(task.id)).length
  screenCounts.upcoming = tasksForUpcoming('tomorrow').length + tasksForUpcoming('week').length
}

function isLandingRoute() {
  return false
}

function setRoute(pathname: string) {
  if (window.location.pathname !== pathname) {
    window.history.pushState({}, '', pathname)
  }
  render()
}

function renderLanding() {
  return `
    <main class="shotcount-landing">
      <header class="landing-nav">
        <a class="landing-brand" href="/" aria-label="Shotcount home">SHOTCOUNT</a>
        <nav aria-label="Primary">
          <a href="#focus">How it works</a>
          <a href="#focus">Applications</a>
        </nav>
        <div class="landing-nav-actions">
          <a href="#focus" class="landing-link">Sign in</a>
          <button type="button" class="landing-button" data-action="enter-app">Start your application</button>
        </div>
      </header>

      <section class="landing-hero">
        <div class="landing-hero-copy">
          <p class="landing-eyebrow">GRADUATE APPLICATIONS</p>
          <h1>Your graduate application, under control</h1>
          <p>Shotcount helps you research programmes, prepare the right documents, coordinate references, and submit each application with confidence.</p>
          <div class="landing-hero-actions">
            <button type="button" class="landing-button landing-button--primary" data-action="enter-app">Start your application</button>
            <a href="#focus">See how it works →</a>
          </div>
        </div>
        <div class="landing-hero-art">
          <img src="${heroCollage}" alt="A collage-style preview of the Shotcount workspace" />
        </div>
      </section>

      <section id="focus" class="landing-feature">
        <div class="landing-feature-copy">
          <p class="landing-eyebrow">ONE APPLICATION WORKSPACE</p>
          <h2>From programme research to submission</h2>
          <p>Keep requirements, statements, transcripts, recommendation letters, deadlines, and portal steps together. Roon turns the work into a clear sequence and helps you recover when something is missing.</p>
        </div>
        <div class="landing-feature-card">
          <div class="landing-task-card">
            <span>Today</span>
            <strong>What matters now</strong>
            <ul>
              <li><i></i>Verify programme requirements</li>
              <li><i></i>Tailor research statement</li>
              <li class="checked"><i></i>Request recommendation letter</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="landing-cta">
        <h2>Make your next application step obvious.</h2>
        <button type="button" class="landing-button landing-button--primary" data-action="enter-app">Start your application</button>
      </section>
    </main>
  `
}

function render() {
  // Any render can be triggered by cloud sync or a control change. Snapshot
  // the visible composer before replacing the DOM so an in-progress task is
  // never cleared mid-entry.
  if (todayComposerOpen && !skipTodayComposerCapture && document.querySelector('[data-today-form]')) captureTodayComposerDraft()
  skipTodayComposerCapture = false
  const pageScroll = { x: window.scrollX, y: window.scrollY }
  const inspectorScroll = app.querySelector<HTMLElement>('.inspector-content')?.scrollTop
  if (authState !== 'authenticated') {
    app.innerHTML = renderAuthGate()
    return
  }
  if (isLandingRoute()) {
    app.innerHTML = renderLanding()
    return
  }
  ensureToastDismissal()
  refreshDateContext(now)
  refreshCounts()
  const todaySelection = tasksForToday()
  if (view === 'today' && !todaySelection.some(task => task.id === selectedTaskId)) {
    selectedTaskId = todaySelection[0]?.id ?? ''
  }
  const selected = view === 'today'
    ? todaySelection.find(task => task.id === selectedTaskId) ?? todaySelection[0]
    : tasks.find(task => task.id === selectedTaskId) ?? tasks[0]
  const isPhone = window.matchMedia?.('(max-width: 620px)').matches ?? false
  const selectedInView = Boolean(selected) && (
    view === 'today'
      ? tasksForToday().some(task => task.id === selected?.id)
      : view === 'upcoming'
        ? tasksForUpcoming('tomorrow').some(task => task.id === selected?.id) ||
          tasksForUpcoming('week').some(task => task.id === selected?.id)
        : false
  )
  const showInspector = selectedInView && !todayComposerOpen && (!isPhone || mobileInspectorOpen)
  app.innerHTML = `
    <div class="reference-app ${showInspector ? 'with-inspector' : ''}">
      ${authRequired ? renderSyncStatus() : ''}
      ${renderNotificationBell()}
      ${renderSidebar()}
      <main class="workspace">
        ${renderMobileTopbar()}
        ${view === 'today' ? renderToday() : view === 'upcoming' ? renderUpcoming() : renderCalendar()}
      </main>
      ${showInspector && selected ? renderInspector(selected) : ''}
    </div>
    <div class="toast ${toast ? 'show' : ''}" role="status">${escapeHtml(toast)}</div>

    ${renderDailyPlanningPrompt()}
    ${renderProfileModal()}
    ${renderFilePreview()}
  `
  const nextInspectorContent = app.querySelector<HTMLElement>('.inspector-content')
  if (nextInspectorContent && inspectorScroll !== undefined) nextInspectorContent.scrollTop = inspectorScroll
  if (pageScroll.x || pageScroll.y) window.scrollTo(pageScroll.x, pageScroll.y)
  if (isPhone) queueMicrotask(alignMobileScrollSurfaces)
  mountRoonOrbs(app)
}

function renderDailyPlanningPrompt() {
  if (!dailyPlanningPrompt) return ''
  const isToday = dailyPlanningPrompt === 'today'
  return `
    <div class="tomorrow-planning-prompt" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="daily-planning-title">
        <span aria-hidden="true">${isToday ? '7:30' : '6:30'}</span>
        <h2 id="daily-planning-title">${isToday ? 'Make today’s list' : 'Set up tomorrow'}</h2>
        <p>${isToday ? 'Take two minutes to choose what matters today.' : 'Take two minutes to decide what matters before the day ends.'}</p>
        <div>
          <button type="button" data-action="dismiss-daily-plan">Not now</button>
          <button type="button" class="primary" data-action="plan-${dailyPlanningPrompt}">${isToday ? 'Plan today’s steps' : 'Plan tomorrow’s steps'}</button>
        </div>
      </section>
    </div>
  `
}

function renderNotificationBell() {
  const enabled = browserPushStatus === 'enabled'
  const label = enabled ? 'Browser alerts are on' : browserPushBusy ? 'Turning on browser alerts' : 'Enable browser alerts'
  return `<button type="button" class="notification-bell ${authRequired ? 'has-sync' : ''} ${enabled ? 'is-enabled' : ''} ${browserPushBusy ? 'is-busy' : ''}" data-action="notification-bell" aria-label="${label}" aria-pressed="${enabled}">${icon('bell')}<i aria-hidden="true"></i></button>`
}

function renderSyncStatus() {
  const labels: Record<SyncState['status'], string> = {
    loading: 'Loading',
    offline: 'Offline',
    saving: 'Saving',
    saved: 'Saved',
    failed: 'Save failed',
  }
  return `<div class="cloud-sync-state cloud-sync-state--${syncState.status}" role="status" aria-live="polite" title="${escapeHtml(syncState.message)}"><i></i><span>${labels[syncState.status]}</span>${syncState.pending ? `<b>${syncState.pending}</b>` : ''}</div>`
}

function profileInput(profile: UserProfile): UserProfileInput {
  return {
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    timezone: profile.timezone,
  }
}

function profileInputWithAccountDefaults(profile: UserProfile, user = activeUser): UserProfileInput {
  const input = profileInput(profile)
  const defaults = profileDefaults(user)
  return {
    ...input,
    displayName: input.displayName || defaults.displayName,
    avatarUrl: input.avatarUrl || defaults.avatarUrl,
    timezone: input.timezone || defaults.timezone,
  }
}

function captureProfileDraft(form = document.querySelector<HTMLFormElement>('[data-profile-form]')) {
  if (!form) return
  const data = new FormData(form)
  profileDraft = {
    ...profileDraft,
    displayName: String(data.get('displayName') ?? '').trimStart(),
    timezone: String(data.get('timezone') ?? '').trim() || profileDraft.timezone,
  }
}

function clearProfilePhotoPreview() {
  if (profilePhotoPreview.startsWith('blob:')) URL.revokeObjectURL(profilePhotoPreview)
  profilePhotoPreview = ''
  profilePhotoFile = null
}

function openProfileModal() {
  profileDraft = userProfile ? profileInputWithAccountDefaults(userProfile) : profileDraft
  profileError = ''
  profileModalOpen = true
  render()
  void refreshGoogleAgentConnection()
  queueMicrotask(() => document.querySelector<HTMLInputElement>('[data-profile-form] input[name="displayName"]')?.focus())
}

async function refreshGoogleAgentConnection() {
  if (!activeUser) return
  try {
    googleAgentConnection = await loadGoogleAgentConnection()
  } catch {
    googleAgentConnection = null
  }
  render()
}

async function connectGoogleAgent() {
  if (googleAgentConnectionBusy) return
  googleAgentConnectionBusy = true
  render()
  try {
    await beginGoogleAgentConnection()
  } catch (error) {
    googleAgentConnectionBusy = false
    toast = error instanceof Error ? error.message : 'ShotCount could not start the Google connection.'
    render()
  }
}

function renderProfileModal() {
  if (!profileModalOpen) return ''
  const photo = profilePhotoPreview || profileDraft.avatarUrl
  const initial = profileDraft.displayName.trim().charAt(0).toUpperCase() || 'S'
  return `
    <div class="profile-popover" role="presentation">
      <button type="button" class="profile-popover-backdrop" data-action="close-profile" aria-label="Close settings"></button>
      <section class="profile-popover-card" role="dialog" aria-modal="true" aria-labelledby="profile-popover-title">
        <button type="button" class="profile-popover-close" data-action="close-profile" aria-label="Close settings">×</button>
        <h2 id="profile-popover-title">Application settings</h2>
        <form class="profile-form" data-profile-form>
          <div class="profile-photo-row" data-profile-field="avatarUrl">
            <div class="profile-photo-preview" aria-hidden="true">
              ${photo ? `<img src="${escapeHtml(photo)}" alt="" />` : `<span>${escapeHtml(initial)}</span>`}
            </div>
            <label class="profile-photo-button">
              <span>${photo ? 'Change photo' : 'Add photo'}</span>
              <input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-profile-photo />
            </label>
          </div>
          <div class="profile-form-grid">
            <label data-profile-field="displayName">
              <span>Name</span>
              <input name="displayName" autocomplete="name" maxlength="80" value="${escapeHtml(profileDraft.displayName)}" />
            </label>
            <label data-profile-field="timezone">
              <span>Timezone</span>
              <input name="timezone" autocomplete="off" value="${escapeHtml(profileDraft.timezone)}" />
            </label>
          </div>
          <p class="profile-private-note">Your application workspace and materials stay private to you.</p>
          <section class="settings-google-card agent-google-card" aria-labelledby="agent-google-title">
            <div>
              <strong id="agent-google-title">Google execution</strong>
              <small>${googleAgentConnection?.status === 'connected'
                ? `Connected as ${escapeHtml(googleAgentConnection.accountEmail || 'your Google account')}`
                : 'Connect Gmail, Calendar, and Contacts for application work.'}</small>
            </div>
            <button type="button" data-action="connect-agent-google" ${googleAgentConnectionBusy ? 'disabled' : ''}>
              ${googleAgentConnectionBusy ? 'Opening…' : googleAgentConnection?.status === 'connected' ? 'Reconnect' : 'Connect'}
            </button>
          </section>
          <p class="profile-form-error" role="alert">${escapeHtml(profileError)}</p>
          <div class="profile-form-actions">
            <button type="button" data-action="close-profile">Cancel</button>
            <button type="submit" ${profileBusy ? 'disabled' : ''}>${profileBusy ? 'Saving…' : 'Save settings'}</button>
          </div>
        </form>
      </section>
    </div>
  `
}

function replacePlannerWorkspace(workspace: { tasks: Task[] }) {
  tasks.splice(0, tasks.length, ...workspace.tasks.map(task => normalizeTask(task)))
  completedTaskIds.clear()
  tasks.filter(task => task.completedAt).forEach(task => completedTaskIds.add(task.id))
  if (!tasks.some(task => task.id === selectedTaskId)) selectedTaskId = tasks[0]?.id ?? ''
}

function renderAuthGate() {
  const isError = authState === 'error'
  if (!isError) {
    return `
      <main class="workspace-auth-redirect workspace-auth-redirect--loading" role="status" aria-live="polite" aria-label="Loading Shotcount">
        <img src="/shotcount-loading.gif" alt="" />
      </main>
    `
  }

  if (localCloudWorkspace) {
    return `
      <main class="workspace-auth-redirect" aria-live="polite">
        <span>S</span>
        <p>Sign in to use this local workspace.</p>
        <button type="button" data-action="continue-google">Continue with Google</button>
        <a href="https://shotcount.app/?auth=signin">Use email sign-in</a>
      </main>
    `
  }

  return `
    <main class="workspace-auth-redirect" aria-live="polite">
      <span>S</span>
      <p>We could not check your login.</p>
      <button type="button" data-action="retry-auth">Try again</button>
      <a href="https://shotcount.app/?auth=signin">Go to sign in</a>
    </main>
  `
}

function hasOAuthCallbackHash(hash = window.location.hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return params.has('access_token') || params.has('refresh_token')
}

function cleanAuthCallbackUrl() {
  const currentUrl = new URL(window.location.href)
  const hasAuthQuery = currentUrl.searchParams.has('code') || currentUrl.searchParams.has('auth')
  if (!hasAuthQuery && !hasOAuthCallbackHash(currentUrl.hash)) return

  currentUrl.searchParams.delete('code')
  currentUrl.searchParams.delete('auth')
  currentUrl.hash = ''
  if (currentUrl.pathname === '/') currentUrl.pathname = '/app'
  window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}`)
}

async function verifyAuthSession() {
  authState = 'checking'
  render()
  try {
    if (!cloudEnabled) throw new Error('Cloud accounts are not configured')
    const authIntent = new URLSearchParams(window.location.search).get('auth')
    if (authIntent === 'google') {
      const { error } = await beginGoogleSignIn()
      if (error) throw error
      return
    }
    const [user, client] = await Promise.all([currentUser(), getCloudClient()])
    if (!user) {
      if (localCloudWorkspace) {
        authState = 'error'
        render()
        return
      }
      const signInUrl = new URL('https://shotcount.app/')
      signInUrl.searchParams.set('auth', 'signin')
      window.location.replace(signInUrl.toString())
      return
    }
    // Supabase has consumed the callback by this point. Leave the signed-in
    // workspace at its canonical route without a code or legacy auth hash.
    cleanAuthCallbackUrl()
    if (!client) throw new Error('Cloud accounts are not configured')
    plannerRepository?.destroy()
    plannerRepository = new CloudPlannerRepository({
      userId: user.id,
      storage: window.localStorage,
      adapter: createSupabasePlannerAdapter(client),
      onWorkspace: workspace => {
        replacePlannerWorkspace(workspace)
        if (authState === 'authenticated') render()
      },
      onState: nextState => {
        syncState = nextState
        if (authState === 'authenticated') render()
      },
    })
    activeUser = user
    // Authentication is done. Let the cached workspace render while the
    // independent profile, calendar, and task reads reconcile in parallel.
    authState = 'authenticated'
    render()
    // Start the agent-run recovery loop before secondary workspace reads. A
    // slow profile, calendar, or attachment query must never strand an
    // already-visible application task on an internal waiting message.
    void startAgentRunSystem()
    const [workspace, profileResult, googleEventsResult, googleStateResult] = await Promise.all([
      plannerRepository.initialize({ tasks: [...tasks] }),
      loadProfile(user)
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: null })),
      loadGoogleCalendarEvents(user)
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: [] as GoogleCalendarEvent[] })),
      loadGoogleCalendarSyncState(user)
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: { status: 'idle', lastSyncedAt: null, message: '' } as GoogleCalendarSyncState })),
    ])
    replacePlannerWorkspace(workspace)
    if (profileResult.ok) {
      userProfile = profileResult.value
      profileDraft = userProfile ? profileInputWithAccountDefaults(userProfile, user) : profileDefaults(user)
      profileModalOpen = false
    }
    if (googleEventsResult.ok) googleCalendarEvents = googleEventsResult.value
    if (googleStateResult.ok) googleCalendarState = googleStateResult.value
    void refreshGoogleCalendar(true)
  } catch {
    authState = 'error'
  }
  render()
}

async function signOut() {
  try {
    if (googleCalendarSyncTimer !== undefined) window.clearTimeout(googleCalendarSyncTimer)
    googleCalendarSyncTimer = undefined
    googleCalendarEvents = []
    googleCalendarState = { status: 'idle', lastSyncedAt: null, message: '' }
    agentRunSubscription?.()
    agentRunSubscription = null
    window.clearInterval(agentPollingTimer)
    agentPollingTimer = 0
    agentApprovals.clear()
    plannerRepository?.destroy()
    plannerRepository = null
    activeUser = null
    userProfile = null
    clearProfilePhotoPreview()
    window.localStorage.removeItem(plannerStorageKey)
    await signOutCloud()
  } finally {
    window.location.replace('https://shotcount.app/?auth=signin')
  }
}

async function refreshSignedInProfile() {
  if (!activeUser || profileModalOpen || profileBusy) return
  try {
    const latest = await loadProfile(activeUser)
    userProfile = latest
    profileDraft = latest ? profileInputWithAccountDefaults(latest, activeUser) : profileDefaults(activeUser)
    render()
  } catch {
    // A temporary profile check must never block the task workspace.
  }
}

function scheduleGoogleCalendarSync() {
  if (googleCalendarSyncTimer !== undefined) window.clearTimeout(googleCalendarSyncTimer)
  if (!activeUser || googleCalendarState.status === 'needs_permission') return
  googleCalendarSyncTimer = window.setTimeout(() => void refreshGoogleCalendar(true), 5 * 60 * 1000)
}

async function refreshGoogleCalendar(runRemoteSync = false) {
  if (!activeUser || googleCalendarBusy) return
  googleCalendarBusy = true
  if (runRemoteSync) googleCalendarState = { ...googleCalendarState, status: 'syncing', message: '' }
  if (view === 'calendar') render()
  try {
    if (runRemoteSync) googleCalendarState = await syncGoogleCalendar(activeUser)
    googleCalendarEvents = await loadGoogleCalendarEvents(activeUser)
  } catch (error) {
    googleCalendarState = {
      status: 'failed',
      lastSyncedAt: googleCalendarState.lastSyncedAt,
      message: error instanceof Error ? error.message : 'Google Calendar could not sync.',
    }
  } finally {
    googleCalendarBusy = false
    scheduleGoogleCalendarSync()
    if (view === 'calendar') {
      render()
      void populateGoogleCalendarForExistingUser()
    }
  }
}

function claimGoogleCalendarConsentAttempt(userId: string) {
  try {
    const key = `${googleCalendarConsentKey}:${userId}`
    if (window.sessionStorage.getItem(key)) return false
    window.sessionStorage.setItem(key, new Date().toISOString())
    return true
  } catch {
    // Without storage we cannot prevent an OAuth redirect loop, so keep the manual button.
    return false
  }
}

async function populateGoogleCalendarForExistingUser() {
  if (!activeUser || view !== 'calendar' || profileModalOpen || googleCalendarBusy) return
  if (googleCalendarState.status !== 'needs_permission' || !hasGoogleIdentity(activeUser)) return
  if (!claimGoogleCalendarConsentAttempt(activeUser.id)) return
  await beginGoogleCalendarConnection()
}

async function beginGoogleCalendarConnection() {
  if (googleCalendarBusy) return
  googleCalendarBusy = true
  googleCalendarState = { ...googleCalendarState, status: 'syncing', message: '' }
  render()
  const { error } = await connectGoogleCalendar()
  if (!error) return
  googleCalendarBusy = false
  googleCalendarState = { ...googleCalendarState, status: 'failed', message: error.message }
  render()
}


function renderMobileTopbar() {
  const profilePhoto = userProfile?.avatarUrl || profileDraft.avatarUrl
  const profileInitial = (userProfile?.displayName || profileDraft.displayName).trim().charAt(0).toUpperCase() || 'S'
  return `
    <header class="mobile-topbar">
      <div class="mobile-brand"><strong>Shotcount</strong></div>
      <div class="mobile-topbar-actions">
        <button type="button" class="mobile-alert-button ${browserPushStatus === 'enabled' ? 'is-enabled' : ''}" data-action="notification-bell" aria-label="${browserPushStatus === 'enabled' ? 'Browser alerts are on' : 'Enable browser alerts'}" aria-pressed="${browserPushStatus === 'enabled'}">${icon('bell')}<i aria-hidden="true"></i></button>
        <button type="button" class="mobile-profile-button" data-action="settings" aria-label="Profile">
          ${profilePhoto ? `<img src="${escapeHtml(profilePhoto)}" alt="" />` : `<span>${escapeHtml(profileInitial)}</span>`}
        </button>
        <button
          type="button"
          class="mobile-theme-toggle"
          data-action="toggle-theme"
          aria-label="Use ${theme === 'dark' ? 'light' : 'dark'} mode"
          title="Use ${theme === 'dark' ? 'light' : 'dark'} mode"
        >${icon('moon')}</button>
      </div>
    </header>
  `
}

function alignMobileScrollSurfaces() {
  if (view === 'upcoming') {
    const activity = document.querySelector<HTMLElement>('.activity-scroll')
    if (activity) activity.scrollLeft = activity.scrollWidth
  }

  if (view === 'calendar') {
    const board = document.querySelector<HTMLElement>('.calendar-board')
    const currentDay = board?.querySelector<HTMLElement>('.calendar-day-head.today, .month-day.today')
    if (board && currentDay) board.scrollLeft = Math.max(0, currentDay.offsetLeft - 78)
  }
}

function renderWithMotion(update: () => void) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const transitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => unknown
  }
  if (reducedMotion || !transitionDocument.startViewTransition) {
    update()
    return
  }
  transitionDocument.startViewTransition(update)
}

function scheduleDateRefresh() {
  const nextMidnight = new Date()
  nextMidnight.setHours(24, 0, 0, 50)
  window.setTimeout(() => {
    const previousTodayKey = todayKey
    refreshDateContext()
    if (todayKey !== previousTodayKey) {
      refreshCounts()
      checkPlanningAndTaskReminders()
      render()
    }
    scheduleDateRefresh()
  }, Math.max(1_000, nextMidnight.getTime() - Date.now()))
}

function readReminderDeliveries() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(reminderDeliveryStorageKey) ?? '[]')
    return new Set(Array.isArray(stored) ? stored.map(String) : [])
  } catch {
    return new Set<string>()
  }
}

function saveReminderDeliveries(deliveries: Set<string>) {
  try {
    window.localStorage.setItem(reminderDeliveryStorageKey, JSON.stringify([...deliveries].slice(-250)))
  } catch {
    // Reminders still work for this visit when storage is unavailable.
  }
}

function checkPlanningAndTaskReminders(reference = new Date()) {
  if (authState !== 'authenticated') return
  let shouldRender = false
  let lastTodayPromptDate = ''
  let lastTomorrowPromptDate = ''
  try {
    lastTodayPromptDate = window.localStorage.getItem(todayPromptStorageKey) ?? ''
    lastTomorrowPromptDate = window.localStorage.getItem(tomorrowPromptStorageKey) ?? ''
  } catch {
    // The in-app prompt can still appear for this visit.
  }

  if (shouldPromptForToday(reference, lastTodayPromptDate, tasks.some(belongsOnTodayList))) {
    const promptDate = dateKey(reference)
    dailyPlanningPrompt = 'today'
    shouldRender = true
    try {
      window.localStorage.setItem(todayPromptStorageKey, promptDate)
    } catch {
      // Keep the visible prompt even when storage is unavailable.
    }
    void showLocalReminder(
      'Make today’s list',
      'Choose what matters today.',
      `shotcount-plan-today-${promptDate}`,
      '/app?plan=today',
    ).catch(() => undefined)
  } else if (shouldPromptForTomorrow(reference, lastTomorrowPromptDate)) {
    const promptDate = dateKey(reference)
    dailyPlanningPrompt = 'tomorrow'
    shouldRender = true
    try {
      window.localStorage.setItem(tomorrowPromptStorageKey, promptDate)
    } catch {
      // Keep the visible prompt even when storage is unavailable.
    }
    void showLocalReminder(
      'Set up tomorrow',
      'Choose what matters before the day ends.',
      `shotcount-plan-tomorrow-${promptDate}`,
      '/app?plan=tomorrow',
    ).catch(() => undefined)
  }

  const delivered = readReminderDeliveries()
  for (const task of tasks) {
    const deliveryKey = taskReminderDeliveryKey(task)
    if (delivered.has(deliveryKey) || !isTaskReminderDue(task, reference)) continue
    delivered.add(deliveryKey)
    toast = `${task.title} is due at ${formatTaskTime(task.time!)}`
    shouldRender = true
    void showLocalReminder(
      task.title,
      `Due at ${formatTaskTime(task.time!)} · ${task.reminder ?? DEFAULT_TASK_REMINDER_MINUTES} minute reminder`,
      `shotcount-task-${deliveryKey}`,
      '/app?plan=today',
    ).catch(() => undefined)
  }
  saveReminderDeliveries(delivered)
  if (shouldRender) render()
}

function triggerHaptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Haptics are an enhancement; unsupported devices continue normally.
  }
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="menu-heading"><h1>Menu</h1><button aria-label="Menu">${icon('menu')}</button></div>
      <label class="search">${icon('search')}<input aria-label="Search" placeholder="Search" /></label>

      <nav aria-label="Tasks">
        <h2>Tasks</h2>
        ${navButton('today', 'Today', 'today', isPreviewMode ? '' : String(screenCounts.today))}
        ${navButton('upcoming', 'Upcoming', 'upcoming', isPreviewMode ? '' : String(screenCounts.upcoming))}
        ${navButton('calendar', 'Calendar', 'calendar')}
        <button
          type="button"
          class="theme-toggle"
          data-action="toggle-theme"
          role="switch"
          aria-checked="${theme === 'dark'}"
          aria-label="Dark mode"
        >
          ${icon('moon')}
          <span>Dark mode</span>
          <i aria-hidden="true"><b></b></i>
        </button>
      </nav>

      <div class="sidebar-bottom">
        <button class="side-row" data-action="settings">${icon('settings')}<span>Settings</span></button>
        <button class="side-row" data-action="signout">${icon('logout')}<span>Sign out</span></button>
      </div>
    </aside>
  `
}

function navButton(target: View, label: string, iconName: string, count = '') {
  return `<button class="nav-row ${view === target ? 'active' : ''}" data-view="${target}" ${view === target ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span>${count ? `<b>${count}</b>` : ''}</button>`
}

function renderToday() {
  const allTodayTasks = sortTasks(tasksForToday())
  const carriedOverTasks = allTodayTasks.filter(task => !completedTaskIds.has(task.id) && task.due! < todayKey)
  const todayTasks = allTodayTasks.filter(task => !carriedOverTasks.includes(task))
  const hasTasks = allTodayTasks.length > 0
  return `
    <section class="today-screen">
      <header class="screen-title"><h1>Today</h1><span class="screen-count" data-count="${screenCounts.today}" aria-label="${screenCounts.today} open tasks">${screenCounts.today}</span></header>
      ${todayComposerOpen ? renderTodayComposer() : `<button class="add-task-row" data-action="add-task">${icon('plus')}<span>Add New Task</span></button>`}
      <div class="task-list">
        ${hasTasks
          ? `<section class="today-task-group today-task-group--today" aria-labelledby="today-tasks-heading">
              <h2 id="today-tasks-heading"><span>Today</span></h2>
              ${todayTasks.length
                ? todayTasks.map(task => renderTaskRow(task, task.id === selectedTaskId)).join('')
                : '<div class="planner-empty planner-empty--small"><strong>Nothing else for today.</strong><p>Add a task when you are ready.</p></div>'}
            </section>
            ${carriedOverTasks.length ? `<section class="today-task-group today-task-group--carried" aria-labelledby="carried-over-heading">
              <h2 id="carried-over-heading">Carried over</h2>
              ${carriedOverTasks.map(task => renderTaskRow(task, task.id === selectedTaskId)).join('')}
            </section>` : ''}`
          : '<div class="planner-empty"><strong>Your day is clear.</strong><p>Add your first task when you are ready.</p></div>'}
      </div>
    </section>
  `
}

function renderTodayComposer() {
  return `
    <form class="today-composer" data-today-form>
      <div class="today-composer-heading">
        <div><strong>New task</strong><span>Add the details now, then get moving.</span></div>
        <button type="button" class="planner-cancel" data-action="close-today-composer" aria-label="Cancel">×</button>
      </div>
      <div class="today-composer-fields">
        <label class="today-field today-field-title">
          <span>Task name</span>
          <input name="title" value="${escapeHtml(todayComposerDraft.title)}" placeholder="What needs doing?" autocomplete="off" required />
        </label>
        <label class="today-field today-field-description">
          <span>Description</span>
          <div class="today-description-wrap">
            <textarea name="description" placeholder="Add a short note or useful context">${escapeHtml(todayComposerDraft.description)}</textarea>
            ${renderDescriptionWaveform('today-composer')}
            <div class="description-tools">
              <label class="description-attachment-input" aria-label="Add attachment">
                <input type="file" data-today-task-file accept="${acceptedTaskFileTypes.join(',')}">
                ${icon('paperclip')}
              </label>
              <button type="button" class="description-voice-input ${descriptionRecordingTaskId === 'today-composer' ? 'is-recording' : ''}" data-action="toggle-today-description-voice" aria-label="${descriptionRecordingTaskId === 'today-composer' ? 'Stop voice input' : descriptionTranscribingTaskId === 'today-composer' ? 'Transcribing description' : 'Add voice input to description'}" aria-pressed="${descriptionRecordingTaskId === 'today-composer'}" ${descriptionTranscribingTaskId === 'today-composer' ? 'disabled' : ''}>
                ${descriptionRecordingTaskId === 'today-composer' ? renderRoonOrb('listening', 23) : descriptionTranscribingTaskId === 'today-composer' ? '<span aria-hidden="true">…</span>' : icon('mic')}
              </button>
            </div>
          </div>
          ${todayComposerAttachment ? `<small class="today-composer-attachment">${icon('paperclip')}${escapeHtml(todayComposerAttachment.name)}</small>` : ''}
        </label>
        <label class="today-field">
          <span>Due date</span>
          <input name="due" type="date" value="${escapeHtml(todayComposerDraft.due)}" min="${todayKey}" max="${weekEndKey}" required />
        </label>
        <label class="today-field">
          <span>Due time <small>Optional · reminder 15 min before</small></span>
          <input name="time" type="time" value="${escapeHtml(todayComposerDraft.time)}" />
        </label>
      </div>
      <div class="today-composer-actions">
        <button type="button" data-action="close-today-composer">Cancel</button>
        <button type="submit">Add task</button>
      </div>
    </form>
  `
}

function renderDescriptionWaveform(targetId: string) {
  const recording = descriptionRecordingTaskId === targetId
  const transcribing = descriptionTranscribingTaskId === targetId
  if (!recording && !transcribing) return ''
  const label = recording ? 'Recording voice input' : 'Transcribing voice input'
  const heights = [0.42, 0.7, 0.95, 0.58, 0.82, 0.5, 0.9, 0.64, 0.78, 0.46, 0.68]
  return `<span class="description-waveform ${transcribing ? 'is-transcribing' : ''}" data-description-waveform role="status" aria-label="${label}">${heights.map((height, index) => `<i style="--wave-height:${height};--wave-delay:${index * 70}ms"></i>`).join('')}</span>`
}

function resetTodayComposerDraft() {
  todayComposerAttachment = null
  todayComposerDraft = {
    title: '',
    description: '',
    due: todayKey,
    time: '',
  }
}

function captureTodayComposerDraft() {
  const form = document.querySelector<HTMLFormElement>('[data-today-form]')
  if (!form) return
  const data = new FormData(form)
  todayComposerDraft = {
    title: String(data.get('title') ?? ''),
    description: String(data.get('description') ?? ''),
    due: String(data.get('due') ?? todayKey),
    time: String(data.get('time') ?? ''),
  }
}


function renderTaskRow(task: Task, selected = false) {
  const completed = completedTaskIds.has(task.id)
  const subtaskCount = task.subtaskItems?.length ?? task.subtasks ?? 0
  return `
    <div class="task-row ${selected ? 'selected' : ''} ${completed ? 'completed' : ''}">
      <button class="checkbox" data-complete="${escapeHtml(task.id)}" aria-label="${completed ? 'Mark as not done' : 'Mark as done'}: ${escapeHtml(task.title)}" aria-pressed="${completed}">
        <span class="completion-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            ${completed
              ? `<path class="completion-seal" d="M12 1.8c1.2 0 1.8 1.3 2.9 1.6 1.1.3 2.2-.6 3.1.1.9.7.4 2.1 1.1 3 .7.9 2.2.8 2.6 1.9.4 1.1-.8 2-.8 3.2s1.2 2.1.8 3.2c-.4 1.1-1.9 1-2.6 1.9-.7.9-.2 2.3-1.1 3-.9.7-2-.2-3.1.1-1.1.3-1.7 1.6-2.9 1.6s-1.8-1.3-2.9-1.6c-1.1-.3-2.2.6-3.1-.1-.9-.7-.4-2.1-1.1-3-.7-.9-2.2-.8-2.6-1.9-.4-1.1.8-2 .8-3.2s-1.2-2.1-.8-3.2c.4-1.1 1.9-1 2.6-1.9.7-.9.2-2.3 1.1-3 .9-.7 2 .2 3.1-.1C10.2 3.1 10.8 1.8 12 1.8Z"/><path class="completion-check" d="m7.4 12.1 3 2.9 6.2-6.2"/>`
              : `<circle class="completion-ring" cx="12" cy="12" r="8.4"/>`}
          </svg>
        </span>
      </button>
      <button class="task-text" data-task="${escapeHtml(task.id)}">
        <strong>${escapeHtml(task.title)}</strong>
        <small>
          ${task.due ? `<span>${icon('calendar')}${formatTaskDate(task.due)}${task.time ? ` · ${formatTaskTime(task.time)}` : ''}</span>` : ''}
          ${task.due && subtaskCount ? `<span><b>${subtaskCount}</b> Subtasks</span>` : ''}
          ${!task.due && subtaskCount ? `<span><b>${subtaskCount}</b> Subtasks</span>` : ''}
        </small>
      </button>
      ${renderTaskTrailingAction(task)}
    </div>
  `
}

function renderTaskTrailingAction(task: Task) {
  const agentAction = renderAgentPill(task)
  if (agentAction) return `<div class="task-trailing-action">${agentAction}</div>`
  return `<button class="task-chevron" data-task="${escapeHtml(task.id)}" aria-label="Open ${escapeHtml(task.title)}">${icon('chevron')}</button>`
}

function taskIsExecutableToday(task: Task) {
  return Boolean(task.due && task.due <= todayKey)
}

function renderAgentPill(task: Task) {
  if (!taskIsExecutableToday(task)) return ''
  const run = agentRuns.get(task.id)
  if (!run) return ''
  const displayStatus = isPreviewMode && previewAgentState !== 'error' && run?.status === 'failed' ? 'running' : run?.status
  if (displayStatus === 'completed') return ''
  const label =
    displayStatus === 'planning' || displayStatus === 'running' ? 'Application underway' :
      displayStatus === 'needs_approval' ? 'Approval requested' :
        displayStatus === 'waiting_external' ? 'Waiting for an update' :
          ['waiting_for_user', 'needs_context', 'failed'].includes(displayStatus ?? '') ? 'Action needed' :
            'Application step available'
  const mark =
    ['needs_approval', 'waiting_for_user', 'needs_context', 'failed'].includes(displayStatus ?? '') ? '!' :
      displayStatus === 'waiting_external' ? '…' :
        ['planning', 'running'].includes(displayStatus ?? '') ? '◔' : '✓'
  return `<span class="task-agent-indicator task-agent-indicator--${displayStatus ?? 'available'}" role="img" aria-label="${escapeHtml(label)}">${mark}</span>`
}

function safeAgentUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? escapeHtml(url.toString()) : '#'
  } catch {
    return '#'
  }
}

function facultyScoreLabel(value: number) {
  const score = Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
  return `${score}% match`
}

function facultyPolicyValue(value: unknown): 'required' | 'recommended' | 'allowed_or_neutral' | 'discouraged' | 'prohibited' | 'unknown_due_to_insufficient_evidence' {
  const normalized = String(value ?? '').trim().toLocaleLowerCase()
  if (normalized === 'strongly_recommended') return 'recommended'
  if (normalized === 'optional' || normalized === 'irrelevant') return 'allowed_or_neutral'
  if (normalized === 'unknown') return 'unknown_due_to_insufficient_evidence'
  if (['required', 'recommended', 'allowed_or_neutral', 'discouraged', 'prohibited', 'unknown_due_to_insufficient_evidence'].includes(normalized)) return normalized as ReturnType<typeof facultyPolicyValue>
  return 'unknown_due_to_insufficient_evidence'
}

function facultyPolicyNote(policy: ReturnType<typeof facultyPolicyValue>, draftCount = 0) {
  switch (policy) {
    case 'required': return 'This programme requires or expects supervisor contact before applying. Faculty outreach is part of the application path.'
    case 'recommended': return `Faculty outreach is recommended for this programme. ${draftCount ? 'I’ve prepared drafts for the strongest matches.' : 'Drafts will be prepared only for strong, specific matches.'}`
    case 'allowed_or_neutral': return `Pre-application faculty contact is optional for this programme. ${draftCount ? 'I’ve prepared drafts only for your strongest research matches.' : 'Drafts appear only for your strongest research matches.'} Nothing will be sent without your action.`
    case 'discouraged': return 'This programme discourages pre-application faculty outreach, so ShotCount will use faculty research to tailor your application without creating cold-email drafts.'
    case 'prohibited': return 'This programme does not permit pre-application faculty outreach. ShotCount will not prepare or send faculty emails for this application.'
    default: return 'I couldn’t verify the programme’s faculty-contact policy from current authoritative sources, so outreach remains paused until that evidence is resolved.'
  }
}

function titleCaseResearchRoute(value: string) {
  return value.split(/\s+/).map(word => word ? `${word[0]!.toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}` : word).join(' ')
}

function directApplicantVoice(value: string) {
  const replacements: Array<[RegExp, string]> = [
    [/\bthe applicant's\b/gi, 'your'],
    [/\bthe applicant has\b/gi, 'you have'],
    [/\bthe applicant is\b/gi, 'you are'],
    [/\bthe applicant was\b/gi, 'you were'],
    [/\bthe applicant can\b/gi, 'you can'],
    [/\bthe applicant demonstrates\b/gi, 'you demonstrate'],
    [/\bthe applicant brings\b/gi, 'you bring'],
    [/\bthe applicant uses\b/gi, 'you use'],
    [/\bthe applicant\b/gi, 'you'],
    [/\bapplicant's\b/gi, 'your'],
    [/\bapplicant has\b/gi, 'you have'],
    [/\bapplicant is\b/gi, 'you are'],
    [/\bapplicant was\b/gi, 'you were'],
    [/\bapplicant can\b/gi, 'you can'],
    [/\bapplicant demonstrates\b/gi, 'you demonstrate'],
    [/\bapplicant brings\b/gi, 'you bring'],
    [/\bapplicant uses\b/gi, 'you use'],
    [/\bapplicant\b/gi, 'you'],
  ]
  let normalized = value
  for (const [pattern, replacement] of replacements) normalized = normalized.replace(pattern, replacement)
  const firstPersonVerbForms: Record<string, string> = {
    identifies: 'identify',
    includes: 'include',
    uses: 'use',
    shows: 'show',
    demonstrates: 'demonstrate',
    brings: 'bring',
    conducts: 'conduct',
    studies: 'study',
    develops: 'develop',
    applies: 'apply',
    works: 'work',
    explores: 'explore',
    researches: 'research',
  }
  normalized = normalized.replace(/\byou\s+(identifies|includes|uses|shows|demonstrates|brings|conducts|studies|develops|applies|works|explores|researches)\b/gi, (_, verb: string) => `you ${firstPersonVerbForms[verb.toLocaleLowerCase()] ?? verb}`)
  return normalized.replace(/^(you|your)\b/, match => `${match[0]!.toLocaleUpperCase()}${match.slice(1)}`)
}

function userFacingFacultyReason(value: string) {
  const normalized = directApplicantVoice(String(value || '').replace(/\s+/g, ' ').trim())
  // Older persisted passes sometimes stored an implementation diagnostic in
  // outreachReason (for example, an enum comparison or “Draft: skip”). The
  // policy note and the deterministic outreach detail already explain that
  // state in plain language, so do not repeat the diagnostic in the card.
  if (/\b(?:faculty[- ]contact\s+policy|contact\s+policy|draft\s*:\s*(?:skip|prepare)|send\s*:\s*(?:skip|send)|unknown_due_to_insufficient_evidence|strongly_recommended)\b/i.test(normalized)) return ''
  return normalized
}

function facultyConnectionDisplayText(faculty: FacultyIntelligenceView['faculty'][number], connection: FacultyIntelligenceView['faculty'][number]['strongestConnections'][number]) {
  const raw = String(connection.explanation || '').replace(/\s+/g, ' ').trim()
  const containsPrivateCvNoise = /(?:\+\d{7,}|[\w.+-]+@[\w.-]+|linkedin\.com|github\.com|\bprofile\b|\beducation\b|\bcontact\b)/i.test(raw)
  if (raw.length <= 420 && !containsPrivateCvNoise) {
    return directApplicantVoice(raw)
  }
  const facultyDirection = connection.facultySignal || faculty.researchDomain || 'this research area'
  return `Your documented research aligns with ${faculty.name}'s work in ${facultyDirection}.`
}

function renderFacultyDraftPreview(draft: NonNullable<FacultyIntelligenceView['faculty'][number]['draftEmail']>, why?: string) {
  const attachment = draft.attachmentArtifactIds.length ? 'Programme-specific CV' : 'No attachment'
  return `<details class="faculty-draft-preview" aria-label="Email draft preview">
    <summary>Preview email</summary>
    <div class="faculty-draft-status"><span class="faculty-status-dot" aria-hidden="true"></span><strong>Draft ready · not sent</strong></div>
    <dl class="faculty-draft-fields">
      <div><dt>To</dt><dd>${escapeHtml(draft.recipientEmail)}</dd></div>
      <div><dt>Subject</dt><dd>${escapeHtml(draft.subject)}</dd></div>
      <div><dt>Attachment</dt><dd>${escapeHtml(attachment)}</dd></div>
    </dl>
    ${why ? `<p class="faculty-draft-why"><strong>Why this professor</strong> ${escapeHtml(why)}</p>` : ''}
    <div class="faculty-draft-body">${escapeHtml(draft.textBody).replaceAll('\n', '<br>')}</div>
  </details>`
}

function renderFacultyIntelligence(intelligence: FacultyIntelligenceView | null | undefined) {
  if (!intelligence) return ''
  const faculty = (intelligence.faculty ?? [])
    .filter(item => item.identityVerification === 'official_verified')
    .sort((left, right) => right.fitBreakdown.overallScore - left.fitBreakdown.overallScore || right.fitBreakdown.researchAreaFit - left.fitBreakdown.researchAreaFit || right.fitBreakdown.facultySpecificFit - left.fitBreakdown.facultySpecificFit || left.name.localeCompare(right.name))
  if (!faculty.length && !intelligence.uncertainFacultyCount) return ''
  const policy = facultyPolicyValue(intelligence.facultyContactPolicy ?? faculty.find(item => item.contactPolicy)?.contactPolicy)
  const outreachAllowed = !['discouraged', 'prohibited'].includes(policy)
  const draftCount = faculty.filter(item => Boolean(item.draftEmail)).length
  const policyNote = facultyPolicyNote(policy, draftCount)
  const cards = faculty.map(item => {
    const domain = item.researchDomain || 'Research area not classified'
    const subdomains = item.researchSubdomains.length ? item.researchSubdomains.join(' · ') : 'Specific subdomain not supported by the official sources'
    const strongest = item.strongestConnections[0]
    const strongestExplanation = strongest ? facultyConnectionDisplayText(item, strongest) : ''
    const emailSummary = item.emailVerification === 'official_verified' && item.email
      ? '<span class="faculty-email-state faculty-email-state--verified">Email verified</span>'
      : '<span class="faculty-email-state">Email not verified</span>'
    const emailDetails = item.emailVerification === 'official_verified' && item.email
      ? `<p><strong>${escapeHtml(item.email)}</strong>${item.emailSourceUrl ? ` · <a href="${safeAgentUrl(item.emailSourceUrl)}" target="_blank" rel="noreferrer">Email source ↗</a>` : ''}</p>`
      : '<p>No exact institutional email was present in the verified sources.</p>'
    const draftMarkup = item.draftEmail
      ? renderFacultyDraftPreview(item.draftEmail)
      : outreachAllowed
        ? `<p class="faculty-no-draft">${escapeHtml(item.outreachRecommendation === 'skip' ? 'I did not prepare a draft because this research overlap is weaker than the other faculty matches.' : item.emailVerification !== 'official_verified' ? 'This match has no verified institutional email, so there is no sendable draft.' : 'No draft is persisted for this recommendation.')}</p>`
        : ''
    const outreachDetail = !outreachAllowed
      ? policy === 'prohibited' ? 'Faculty outreach is not permitted for this programme.' : 'Faculty outreach is discouraged for this programme.'
      : item.draftEmail
        ? 'This is a strong research match, so I prepared an email draft you can review. Nothing has been sent.'
        : item.outreachRecommendation === 'skip'
          ? 'I did not prepare a draft because the research overlap is weaker than the other faculty matches.'
          : item.emailVerification !== 'official_verified'
            ? 'This match may be useful, but I found no verified institutional email for a safe draft.'
            : 'I’m keeping this outreach decision pending a stronger, specific research connection.'
    const fit = item.fitBreakdown
    return `<article class="faculty-intelligence-card">
      <div class="faculty-card-topline"><div><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.title || 'Faculty member')}${item.department ? ` · ${escapeHtml(item.department)}` : ''}</p></div><strong class="faculty-fit-score">${facultyScoreLabel(fit.overallScore)}</strong></div>
      <div class="faculty-identity-row"><span class="faculty-identity-badge">Verified current faculty</span><span>${escapeHtml(item.institution)}</span></div>
      <div class="faculty-research-label">${escapeHtml(domain)}</div>
      <p class="faculty-subdomains">${escapeHtml(subdomains)}</p>
      ${strongest ? `<p class="faculty-match-explanation"><strong>Why this matches</strong> ${escapeHtml(strongestExplanation)}</p>` : ''}
      <div class="faculty-card-links"><a href="${safeAgentUrl(item.officialProfileUrl)}" target="_blank" rel="noreferrer">Official profile ↗</a>${outreachAllowed ? emailSummary : ''}${outreachAllowed && item.draftEmail ? renderFacultyDraftPreview(item.draftEmail, strongestExplanation) : ''}</div>
      <details class="faculty-detail-panel"><summary>Research, fit, and outreach details</summary>
        <div class="faculty-detail-grid">
          <section><strong>Research summary</strong><p>${escapeHtml(item.researchSummary || 'No summary was supported by the retrieved official sources.')}</p></section>
          ${item.relevantCurrentWork.length ? `<section><strong>Relevant current work</strong><ul>${item.relevantCurrentWork.map(work => `<li><a href="${safeAgentUrl(work.url)}" target="_blank" rel="noreferrer">${escapeHtml(work.title)}${work.year ? ` (${work.year})` : ''} ↗</a><span>${escapeHtml(work.relevanceToApplicant)}</span></li>`).join('')}</ul></section>` : ''}
          <section><strong>Fit breakdown</strong><dl class="faculty-fit-breakdown"><div><dt>Research area</dt><dd>${facultyScoreLabel(fit.researchAreaFit)}</dd></div><div><dt>Methods</dt><dd>${facultyScoreLabel(fit.methodsFit)}</dd></div><div><dt>Experience</dt><dd>${facultyScoreLabel(fit.experienceFit)}</dd></div><div><dt>Faculty-specific</dt><dd>${facultyScoreLabel(fit.facultySpecificFit)}</dd></div></dl></section>
          <section><strong>Why ShotCount matched you</strong>${item.strongestConnections.length ? `<ul>${item.strongestConnections.map(connection => `<li><b>${escapeHtml(connection.facultySignal)}</b><span>${escapeHtml(facultyConnectionDisplayText(item, connection))}</span></li>`).join('')}</ul>` : '<p>No provenance-backed connection was persisted.</p>'}</section>
          <section><strong>Outreach</strong><p>${escapeHtml(outreachDetail)}</p>${outreachAllowed && userFacingFacultyReason(item.outreachReason) ? `<small>${escapeHtml(userFacingFacultyReason(item.outreachReason))}</small>` : ''}</section>
          ${outreachAllowed ? `<section><strong>Email verification</strong>${emailDetails}</section>` : ''}
          ${item.sourceEvidence.length ? `<section><strong>Official sources</strong><ul class="faculty-source-list">${item.sourceEvidence.slice(0, 5).map(source => `<li><a href="${safeAgentUrl(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.type.replaceAll('_', ' '))} ↗</a></li>`).join('')}</ul></section>` : ''}
          ${outreachAllowed ? `<section class="faculty-draft-section"><strong>Email draft</strong>${item.draftEmail ? '<p>Prepared in ShotCount and not sent.</p>' : draftMarkup}</section>` : ''}
        </div>
      </details>
    </article>`
  }).join('')
  const withheld = intelligence.uncertainFacultyCount > 0
    ? `<p class="faculty-withheld-note">${intelligence.uncertainFacultyCount} profile${intelligence.uncertainFacultyCount === 1 ? '' : 's'} withheld because current institutional identity could not be verified.</p>`
    : ''
  const routes = (intelligence.bestFitResearchRoutes ?? []).filter(Boolean)
  const routeMarkup = routes.length
    ? `<section class="faculty-route-summary"><strong>Best-fit research areas</strong><ol>${routes.map(route => `<li>${escapeHtml(titleCaseResearchRoute(route))}</li>`).join('')}</ol><small>Matched from your CV and the programme’s current faculty research.</small></section>`
    : ''
  return `<section class="task-agent-faculty-intelligence" aria-label="Verified faculty matches">
    <header class="faculty-intelligence-header"><div><strong>Verified faculty matches</strong><small>Research context and CV fit from the current faculty pass</small></div><span>${faculty.length} verified</span></header>
    ${routeMarkup}
    <section class="faculty-policy-note" aria-label="Faculty outreach policy"><strong>Faculty outreach</strong><p>${escapeHtml(policyNote)}</p>${intelligence.facultyContactPolicyExplanation && policy === 'unknown_due_to_insufficient_evidence' ? `<small>${escapeHtml(intelligence.facultyContactPolicyExplanation)}</small>` : ''}</section>
    <div class="faculty-intelligence-cards">${cards}</div>
    ${withheld}
    <small class="faculty-intelligence-meta">Research refreshed ${new Date(intelligence.refreshedAt).toLocaleString()}</small>
  </section>`
}

function applicationPendingInputDisposition(item: ApplicationPendingInput): ApplicationAvailabilityDisposition {
  if (item.requirementType === 'admissions_test' || item.requirementType === 'english_language_test') return 'enter_score'
  if (item.requirementType === 'referee') return 'provide_referee_details'
  return 'provide_now'
}

function taskHasPreparedCv(taskId: string) {
  return selectUserVisibleGeneratedFiles(taskFileAssets.get(taskId) ?? []).some(asset =>
    asset.mimeType === 'application/pdf' && /\b(?:cv|resum[eé]+|curriculum vitae)\b/i.test(asset.originalFilename),
  )
}

function isCvPendingInput(item: ApplicationPendingInput) {
  return /\b(?:cv|resum[eé]+|curriculum vitae)\b/i.test(`${item.title} ${item.question} ${item.detail}`)
}

function inferredApplicationRequirementType(item: ApplicationPendingInput) {
  const text = `${item.title} ${item.question}`.toLocaleLowerCase()
  if (/\b(?:test|score|gre|ielts|toefl|english proficiency)\b/.test(text)) return 'admissions_test'
  if (/\b(?:transcript|degree certificate|proof of graduation|credential evaluation)\b/.test(text)) return 'transcript'
  if (/\b(?:recommendation|referee|recommender|letter)\b/.test(text)) return 'referee'
  if (/\b(?:essay|statement|proposal|writer)\b/.test(text)) return 'writer'
  return 'fact'
}

function isAutonomousApplicationPendingInput(item: ApplicationPendingInput) {
  const type = item.requirementType || inferredApplicationRequirementType(item)
  return type === 'writer' || type === 'research_proposal'
}

function normalizeApplicationPendingInput(item: ApplicationPendingInput): ApplicationPendingInput {
  const requirementType = inferredApplicationRequirementType(item)
  const missingValueOwner = item.missingValueOwner ?? missingValueOwnerForRequirement({
    name: item.title,
    type: item.requirementType || requirementType,
    responsible: item.owner,
    exactInstructions: item.detail,
    source: item.source ? { ...item.source } : null,
  })
  if (missingValueOwner === 'programme') return { ...item, missingValueOwner, status: 'answered' }
  const transcriptLike = /\b(?:transcript|academic record|grade report)\b/i.test(`${item.requirementType} ${item.title} ${item.question}`)
  if (transcriptLike) {
    return {
      ...item,
      requirementType: 'transcript',
      kind: 'document',
      question: 'Please attach the transcript required for this application so I can validate it.',
      detail: 'Your transcript is required before the dependent application steps can continue.',
      options: applicationPendingInputOptions('transcript', item.deadline),
      fields: [],
      allowLater: false,
      missingValueOwner: 'applicant',
    }
  }
  const legacyEssayName = /^(?:essay|essays)\s*(?:[-—:]\s*)?\d+$/i.test(item.title)
  const legacyAdditionalName = /^additional$/i.test(item.title) || /^add the missing information$/i.test(item.title)
  const needsSharedContract = ['referee', 'writer', 'research_proposal', 'additional_information'].includes(item.requirementType || requirementType) || legacyEssayName || legacyAdditionalName
  const genericOptions = item.options?.some(option => ['provide_now', 'can_get', 'need_help', 'later', 'can_get_document'].includes(option.value))
  if (!needsSharedContract && !genericOptions && (item.options?.length || item.fields?.length || item.requirementType)) return { ...item, missingValueOwner }
  return {
    ...item,
    ...applicationPendingInputFor({
      id: item.id,
      requirementId: item.requirementId,
      name: legacyAdditionalName ? 'Additional' : item.title,
      type: requirementType,
      question: item.question,
      detail: item.detail,
      deadline: item.deadline,
      instructions: null,
      missingValueOwner,
      programmeValue: item.portalField?.suggestedValue ?? null,
    }),
  }
}

function isApplicationProgrammeSelectionInteraction(value: AgentRun['contextInteraction']) {
  return Boolean(
    isRecommendationProgressInteraction(value) &&
    (value.kind === 'single_choice' || value.kind === 'multiple_choice') &&
    value.mapsToRequirement === 'application_programme_selection',
  )
}

function applicationNeedsProgrammeDiscovery(state: AgentRun['applicationState'], run?: AgentRun) {
  if (!state) return false
  if (isApplicationProgrammeSelectionInteraction(run?.contextInteraction ?? null)) return false
  if (run?.applicationProgrammeSelectionCompleted || run?.applicationSelectedOpportunityId) return false
  // Older runs can be carrying a case-level state while their last durable
  // blocker explicitly says programme research must happen first. Treat that
  // message as a discovery signal so the watchdog wakes the same run instead
  // of leaving the user on a misleading "application is moving" card.
  const durableDiscoveryBlocker = `${run?.waitingReason ?? ''} ${run?.error ?? ''}`
  if (/tailoring brief must cite|continue programme research before rendering/i.test(durableDiscoveryBlocker)) return true
  const stage = String(state.stage ?? '').toLocaleLowerCase()
  if (['intake', 'research', 'shortlist_approval'].includes(stage)) return true
  const pendingText = (state.pendingInputs ?? [])
    .map(item => `${item.title} ${item.question}`)
    .join(' ')
  if (/(?:provide|upload|find)\b[^.]{0,100}\bofficial\b[^.]{0,100}\b(?:programme|program|admissions?)\b[^.]{0,100}\b(?:url|guide|source|page)\b/i.test(pendingText)) return true
  const contextText = [
    run?.waitingReason ?? '',
    ...(run?.schedulingOptions ?? []).flatMap(option => [option.label, option.value]),
  ].join(' ')
  if (/\bofficial\b[^.]{0,180}\b(?:programme|program|admissions?)\b[^.]{0,180}\b(?:url|guide|source|page|document)\b/i.test(contextText)) return true
  // A legacy run can retain a case-level workstream while the programme
  // search never produced a verified opportunity. Treat that as discovery,
  // not preparation, until the controller repairs the durable state.
  return !state.currentCaseId || Number(state.verifiedOpportunityCount ?? 0) < 1
}

function renderApplicationDiscoveryPanel(state: NonNullable<AgentRun['applicationState']>, run: AgentRun) {
  const verifiedCount = Math.max(0, Number(state.verifiedOpportunityCount ?? 0))
  const shortlistReady = isApplicationProgrammeSelectionInteraction(run.contextInteraction)
  const steps = [
    { label: 'Understand your search', done: verifiedCount > 0, active: verifiedCount === 0 },
    { label: 'Searching official programme routes', done: verifiedCount > 0, active: false },
    { label: 'Checking deadlines and requirements', done: shortlistReady, active: verifiedCount > 0 && !shortlistReady },
    { label: 'Matching routes to your CV', done: shortlistReady, active: false },
    { label: 'Rank the options', done: shortlistReady, active: false },
  ]
  const headline = shortlistReady ? 'Choose a programme' : 'Finding the right programme'
  const summary = shortlistReady
    ? verifiedCount === 1
      ? '1 verified option is ready to review.'
      : verifiedCount > 1
        ? `${verifiedCount} verified options are ready to review.`
        : 'The verified shortlist is ready to review.'
    : verifiedCount > 0
      ? `${verifiedCount} official option${verifiedCount === 1 ? '' : 's'} found. I’m checking the details before I show them.`
    : 'I’m checking official sources and matching the options to your CV.'
  const info = shortlistReady
    ? 'Each option comes from an official source. The fit score reflects the verified evidence in your CV, not a guess.'
    : 'I’ll search official university and graduate-admissions pages first. You only need to choose from the verified options.'
  const recovery = run.status === 'needs_context'
    ? `<footer><button class="agent-primary" type="button" data-action="retry-agent" data-task-id="${escapeHtml(run.taskId)}" ${agentDecisionBusy.has(run.id) ? 'disabled' : ''}>${agentDecisionBusy.has(run.id) ? 'Searching…' : 'Keep searching'}</button></footer>`
    : ''
  return `<section class="task-agent-application-cockpit task-agent-application-cockpit--discovery" aria-label="Programme discovery">
    <div class="task-agent-application-summary"><div><strong>${headline}</strong><small>${escapeHtml(summary)}</small></div><span class="application-discovery-info" tabindex="0" role="img" aria-label="How programme discovery works" data-tooltip="${escapeHtml(info)}">i</span></div>
    <div class="application-discovery-steps">${steps.map(step => `<div class="application-discovery-step${step.done ? ' application-discovery-step--done' : step.active ? ' application-discovery-step--active' : ''}"><span class="task-agent-progress-orb">${renderRoonOrb(step.done ? 'complete' : step.active ? 'active' : 'waiting', 18)}</span><span>${escapeHtml(step.label)}</span></div>`).join('')}</div>
    ${recovery}
  </section>`
}

function applicationPendingFieldMarkup(field: ApplicationPendingInputField, taskId: string, requirementId: string, busy: boolean) {
  const disabled = busy ? 'disabled' : ''
  if (field.kind === 'attachment') {
    return `<label class="task-agent-pending-file" data-application-pending-file-label><span>${escapeHtml(field.label)}</span><input type="file" data-application-pending-file data-task-id="${escapeHtml(taskId)}" data-requirement-id="${escapeHtml(requirementId)}" data-application-disposition="attach_score" accept="${escapeHtml((field.acceptedMimeTypes ?? acceptedTaskFileTypes).join(','))}" ${disabled}><small>${escapeHtml(field.placeholder)}</small></label>`
  }
  const inputType = field.kind === 'tel' ? 'tel' : field.kind
  return `<label class="task-agent-pending-field"><span>${escapeHtml(field.label)}</span><input type="${escapeHtml(inputType)}" data-application-pending-field="${escapeHtml(field.id)}" placeholder="${escapeHtml(field.placeholder)}"${field.maximumCharacters ? ` maxlength="${field.maximumCharacters}"` : ''} ${field.required ? 'required' : ''} ${disabled}></label>`
}

function renderApplicationControlTower(task: Task, run: AgentRun) {
  const state = run.applicationState
  if (!state) return ''
  if (isApplicationProgrammeSelectionInteraction(run.contextInteraction ?? null)) return ''
  const applicationInteraction = isApplicationIntent(task.title, task.description) && isRecommendationProgressInteraction(run.contextInteraction)
    ? run.contextInteraction
    : null
  if (applicationNeedsProgrammeDiscovery(state, run)) return renderApplicationDiscoveryPanel(state, run)
  const workstreams = Array.isArray(state.workstreams) ? state.workstreams : []
  const preparedCv = taskHasPreparedCv(task.id)
  const pendingInputs = Array.isArray(state.pendingInputs)
    ? prioritizePendingInputs(state.pendingInputs.map(normalizeApplicationPendingInput).filter(item =>
      !isAutonomousApplicationPendingInput(item) &&
      item.status !== 'answered' &&
      !(preparedCv && isCvPendingInput(item)),
    ))
    : []
  if (!workstreams.length && !pendingInputs.length && !applicationInteraction && !(state.facultyIntelligence?.faculty?.length || state.facultyIntelligence?.uncertainFacultyCount)) return ''
  const activeWork = workstreams.filter(item => item.status === 'active')
  const reviewWork = workstreams.filter(item => item.status === 'ready_for_review')
  const laterWork = workstreams.filter(item => item.status === 'queued' || item.status === 'waiting_external' || item.status === 'blocked')
  const activeWindow = progressDetailWindow(activeWork)
  const reviewWindow = progressDetailWindow(reviewWork)
  const laterWindow = progressDetailWindow(laterWork)
  const needsYouWindow = progressDetailWindow(pendingInputs)
  const busy = agentDecisionBusy.has(run.id)
  const summary = pendingInputs.length || applicationInteraction
    ? 'I’m keeping independent work moving and showing only the decisions or files that need you.'
    : reviewWork.length
      ? 'Independent work continues; prepared results are ready for your review below.'
      : activeWork.length
        ? 'Independent application work continues automatically.'
        : 'Your application work is saved here.'
  const headline = 'Working on your application'
  const cvReviewBoundary = run.errorCode === 'application_cv_review_required' && run.waitingReason.trim()
    ? `<div class="task-agent-cv-review" role="status"><strong>Review your generated CV</strong><p>${escapeHtml(run.waitingReason.trim())}</p><small>Open the prepared PDF below. Other application lanes can continue while you review it.</small></div>`
    : ''
  const facultyIntelligence = renderFacultyIntelligence(state.facultyIntelligence)
  const renderWorkstream = (item: typeof workstreams[number]) => {
    const orbState = item.status === 'blocked' || item.status === 'waiting_external'
      ? 'waiting'
      : item.status === 'active'
        ? 'active'
        : 'complete'
    return `<div class="task-agent-workstream task-agent-workstream--${escapeHtml(item.status)}">
      <span class="task-agent-progress-orb">${renderRoonOrb(orbState, 18)}</span>
      <span class="task-agent-workstream-copy"><strong>${escapeHtml(humanizeApplicationProgressTitle(item.title, `${item.detail}`))}</strong><small>${escapeHtml(humanizeAgentProgressLabel(item.detail))}</small></span>
    </div>`
  }
  const renderPendingInput = (item: typeof pendingInputs[number]) => {
    const options = item.options ?? []
    const hasAttachmentOption = item.kind === 'document' || options.some(option => option.value === 'have_document' || option.value === 'attach_score')
    const fileInput = hasAttachmentOption
      ? `<input class="task-agent-pending-file-input" type="file" data-application-pending-file data-task-id="${escapeHtml(run.taskId)}" data-requirement-id="${escapeHtml(item.requirementId)}" data-application-disposition="${options.some(option => option.value === 'attach_score') ? 'attach_score' : 'have_now'}" accept="${escapeHtml(acceptedTaskFileTypes.join(','))}" ${busy ? 'disabled' : ''}>`
      : ''
    const optionMarkup = options.length
      ? options.map(option => `<button type="button" data-action="application-pending-choice" data-task-id="${escapeHtml(run.taskId)}" data-requirement-id="${escapeHtml(item.requirementId)}" data-application-disposition="${escapeHtml(option.value)}" ${busy ? 'disabled' : ''}><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.description)}</small></button>`).join('')
      : ''
    const fields = item.fields ?? []
    const fieldMarkup = fields.length
      ? `<div class="task-agent-pending-fields">${fields.map(field => applicationPendingFieldMarkup(field, run.taskId, item.requirementId, busy)).join('')}</div><button class="agent-primary" type="button" data-action="submit-application-pending-input" data-task-id="${escapeHtml(run.taskId)}" data-requirement-id="${escapeHtml(item.requirementId)}" data-application-disposition="${applicationPendingInputDisposition(item)}" ${busy ? 'disabled' : ''}>${escapeHtml(item.submitLabel ?? 'Save and continue')}</button>`
      : ''
    return `<article class="task-agent-pending-input">
      <div class="task-agent-pending-input-copy"><strong>${escapeHtml(humanizeApplicationProgressTitle(item.title, `${item.question} ${item.detail}`))}</strong><p>${escapeHtml(humanizeAgentProgressLabel(item.question))}</p><small>${escapeHtml(humanizeAgentProgressLabel(item.detail))}</small></div>
      ${fileInput}
      ${fieldMarkup}
      ${optionMarkup ? `<div class="task-agent-pending-input-actions">${optionMarkup}</div>` : ''}
    </article>`
  }
  const needsYouMarkup = applicationInteraction
    ? `<div class="task-agent-pending-lane"><header><strong>Needs you</strong><small>Only this applicant decision is unresolved.</small></header>${renderRecommendationProgressDetail(applicationInteraction, run.taskId, busy)}</div>`
    : needsYouWindow.visible.length
      ? `<div class="task-agent-pending-lane"><header><strong>Needs you</strong><small>Only these applicant decisions or files are unresolved.</small></header>${needsYouWindow.visible.map(renderPendingInput).join('')}</div>`
      : ''
  return `<section class="task-agent-application-cockpit" aria-label="Application progress">
    <div class="task-agent-application-summary"><div><strong>${headline}</strong><small>${escapeHtml(summary)}</small></div><span>Application</span></div>
    ${cvReviewBoundary}
    ${facultyIntelligence}
    ${activeWork.length ? `<div class="task-agent-workstream-lane"><header><strong>Working now</strong><small>Independent application work continues automatically.</small></header>${activeWindow.visible.map(renderWorkstream).join('')}</div>` : ''}
    ${reviewWork.length ? `<div class="task-agent-workstream-lane task-agent-workstream-lane--review"><header><strong>Ready for review</strong><small>Inspect prepared results when you’re ready.</small></header>${reviewWindow.visible.map(renderWorkstream).join('')}</div>` : ''}
    ${needsYouMarkup}
    ${laterWork.length ? `<div class="task-agent-workstream-lane task-agent-workstream-lane--later"><header><strong>Later</strong><small>Waiting on a dependency or an external update.</small></header>${laterWindow.visible.map(renderWorkstream).join('')}</div>` : ''}
  </section>`
}

function submitApplicationPendingChoice(
  task: Task,
  run: AgentRun,
  requirementId: string,
  disposition: ApplicationAvailabilityDisposition,
  values?: Record<string, unknown>,
) {
  if (agentDecisionBusy.has(run.id)) return
  agentDecisionBusy.add(run.id)
  render()
  void updateApplicationRequirementAvailability(run.id, requirementId, disposition, values).then(updated => {
    agentRuns.set(task.id, updated)
    void syncAgentApproval(updated).then(() => render())
    toast = disposition === 'need_help' || disposition === 'not_sure'
      ? 'I’ll check this and keep the rest of the application moving.'
      : disposition === 'can_get' || disposition === 'can_take_before_deadline'
        ? 'Got it — I’ll keep moving while you get this ready.'
        : disposition === 'cannot_get'
          ? 'I’ve flagged the deadline risk and will keep the rest moving.'
          : 'Got it — I’m checking this now.'
  }).catch(error => {
    toast = error instanceof Error ? error.message : 'ShotCount could not update this application item.'
  }).finally(() => {
    agentDecisionBusy.delete(run.id)
    persistAgentRuns()
    render()
  })
}

function renderAgentProgressPanel(task: Task, _progressIndex: number, placeholder = false, run?: AgentRun) {
  const timeline = agentProgressTimeline({
    completed: run?.progress ?? [],
    current: run?.currentProgress?.label,
    waitingReason: run?.waitingReason,
    status: run?.status,
  })
  const progressRows = timeline.completed.map(label => ({ label, state: 'done' as const }))
  const liveActivity = timeline.active || (run?.status === 'waiting_external' ? humanizeAgentProgressLabel(run.waitingReason) : '')
  // Internal application progression is scheduler-owned. A run being in a
  // live state or having a next node is not a user continuation affordance.
  // Keep this selector for the narrow, genuine user-controlled pause cases;
  // external waits are watched automatically by the durable worker.
  const canContinueManually = run && !placeholder
    ? canUserContinueManually({ userDecisionRequired: false, userInitiatedPauseCanResume: false })
    : false
  const checkExternalBusy = canContinueManually && agentDecisionBusy.has(run?.id ?? '')
  const planRows = run?.executionPlan?.length ? planWindow(run.executionPlan) : []
  const applicationControlTower = run && !placeholder ? renderApplicationControlTower(task, run) : ''
  const planMarkup = !applicationControlTower && planRows.length
    ? `<div class="task-agent-execution-plan" aria-label="Next steps"><div class="task-agent-execution-plan-header"><strong>Next steps</strong><small>Showing ${planRows.length} current steps</small></div>${planRows.map(renderExecutionPlanRow).join('')}</div>`
    : ''
  return `<section class="task-agent-card task-agent-card--progress${placeholder ? ' task-agent-card--placeholder' : ''}">
    <header>${specialistHeader(task, run)}</header>
    ${liveActivity ? `<p class="task-agent-live-activity">${escapeHtml(liveActivity)}</p>` : ''}
    ${applicationControlTower}
    ${planMarkup}
    ${progressRows.length ? `<div class="task-agent-progress">
      ${progressRows.map(row => `<div class="${row.state}"><span class="task-agent-progress-orb">${renderRoonOrb(row.state === 'done' ? 'complete' : 'active', 20)}</span><span>${escapeHtml(row.label)}</span></div>`).join('')}
    </div>` : ''}
    ${renderRoonGeneratedFiles(task)}
    <footer><button type="button" data-action="view-agent-progress" data-task-id="${escapeHtml(task.id)}">Activity</button>${canContinueManually ? `<button class="agent-primary" type="button" data-action="poll-agent" data-task-id="${escapeHtml(task.id)}" ${checkExternalBusy ? 'disabled' : ''}>${checkExternalBusy ? 'Checking…' : 'Continue'}</button>` : ''}<button type="button" data-action="cancel-agent" data-task-id="${escapeHtml(task.id)}">Cancel</button></footer>
  </section>
  <aside class="task-agent-notification">${icon('bell')}<span>ShotCount keeps watch while you get on with your day.</span></aside>`
}

function executionPlanStatusLabel(status: ExecutionPlanNode['status']) {
  switch (status) {
    case 'completed': return 'Done'
    case 'active': return 'Working now'
    case 'ready': return 'Coming up'
    case 'waiting_user': return 'Waiting for you'
    case 'waiting_external': return 'Waiting for an update'
    case 'blocked': return 'Choose what to do next'
    case 'skipped': return 'Skipped'
    default: return 'Coming up'
  }
}

function renderExecutionPlanRow(node: ExecutionPlanNode) {
  const orbState = node.status === 'completed'
    ? 'complete'
    : ['waiting_user', 'waiting_external', 'blocked'].includes(node.status)
      ? 'waiting'
      : 'active'
  const currentReason = node.status === 'waiting_user' || node.status === 'waiting_external' || node.status === 'blocked'
    ? node.waitingReason
    : ''
  return `<div class="task-agent-execution-plan-row task-agent-execution-plan-row--${escapeHtml(node.status)}"><span class="task-agent-progress-orb">${renderRoonOrb(orbState, 18)}</span><span class="task-agent-execution-plan-title">${escapeHtml(humanizeAgentProgressLabel(node.title))}</span><small>${escapeHtml(humanizeAgentProgressLabel(currentReason) || executionPlanStatusLabel(node.status))}</small></div>`
}

function renderAgentErrorPanel(task: Task, error: string) {
  const needsSignIn = error.toLowerCase().includes('sign in')
  const friendlyError = humanizeAgentProgressLabel(error) || 'I hit a snag, but your application work is safe. Try again and I’ll pick up from the last confirmed step.'
  return `<section class="task-agent-card task-agent-card--error" role="alert" data-raw-error="${escapeHtml(error)}">
    <header>${specialistHeader(task, agentRuns.get(task.id))}<span class="task-agent-header-mark" role="img" aria-label="${needsSignIn ? 'Sign in needed' : 'Action needed'}">!</span></header>
    <p class="task-agent-live-activity">${escapeHtml(friendlyError)}</p>
    ${renderRoonGeneratedFiles(task)}
    <footer><button type="button" data-action="cancel-agent" data-task-id="${escapeHtml(task.id)}">Dismiss</button><button class="agent-primary" type="button" data-action="retry-agent" data-task-id="${escapeHtml(task.id)}">Try again</button></footer>
  </section>
  <aside class="task-agent-notification task-agent-notification--error">${icon('bell')}<span>No application changes were made. You can safely try again.</span></aside>`
}

function approvalPreviewValue(approval: AgentApproval, key: string) {
  const preview = approval.payload.preview
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return ''
  return (preview as Record<string, unknown>)[key]
}

function renderAgentApprovalPanel(task: Task, approval: AgentApproval) {
  const recipients = approvalPreviewValue(approval, 'to')
  const ccRecipients = approvalPreviewValue(approval, 'cc')
  const bccRecipients = approvalPreviewValue(approval, 'bcc')
  const calendarAttendees = approvalPreviewValue(approval, 'attendee_emails')
  const notifyAttendees = approvalPreviewValue(approval, 'notify_attendees')
  const title = approvalPreviewValue(approval, approval.kind === 'calendar_write' ? 'summary' : 'subject')
  const body = approvalPreviewValue(approval, approval.kind === 'calendar_write' ? 'description' : 'body_text')
  const startsAt = approvalPreviewValue(approval, 'start')
  const endsAt = approvalPreviewValue(approval, 'end')
  const destination = approvalPreviewValue(approval, 'destination')
  const browserTarget = approvalPreviewValue(approval, 'target')
  const browserEffect = approvalPreviewValue(approval, 'expected_effect')
  const paymentAmount = approvalPreviewValue(approval, 'amount')
  const paymentCurrency = approvalPreviewValue(approval, 'currency')
  const paymentMerchant = approvalPreviewValue(approval, 'merchant')
  const paymentDeadline = approvalPreviewValue(approval, 'deadline')
  const preparedValues = approvalPreviewValue(approval, 'prepared_values')
  const attachment = approvalPreviewValue(approval, 'attachment') as { name?: string; mime_type?: string; size?: number } | null
  const safety = approvalPreviewValue(approval, 'safety') as { warnings?: unknown } | null
  const busy = agentDecisionBusy.has(approval.id)
  const undoing = pendingEmailSends.has(approval.id)
  const confirmLabel = approval.kind === 'send_email'
    ? 'Send'
    : approval.kind === 'calendar_write'
      ? 'Confirm'
      : approval.kind === 'payment'
        ? 'Approve payment'
      : 'Submit'
  return `<section class="task-agent-card task-agent-card--approval">
    <header>${specialistHeader(task, agentRuns.get(task.id))}<span class="task-agent-header-mark" role="img" aria-label="Approval needed">!</span></header>
    <p>${escapeHtml(approval.title)}</p>
    <div class="task-agent-approval-detail">
      ${Array.isArray(recipients) && recipients.length ? `<dl><dt>To</dt><dd>${escapeHtml(recipients.join(', '))}</dd></dl>` : ''}
      ${Array.isArray(ccRecipients) && ccRecipients.length ? `<dl><dt>CC</dt><dd>${escapeHtml(ccRecipients.join(', '))}</dd></dl>` : ''}
      ${Array.isArray(bccRecipients) && bccRecipients.length ? `<dl><dt>BCC</dt><dd>${escapeHtml(bccRecipients.join(', '))}</dd></dl>` : ''}
      ${approval.kind === 'send_email' && attachment?.name ? `<dl><dt>Attachment</dt><dd>${escapeHtml(String(attachment.name))}${attachment.size ? ` (${Math.ceil(Number(attachment.size) / 1024)} KB)` : ''}</dd></dl>` : ''}
      ${approval.kind === 'calendar_write' && Array.isArray(calendarAttendees) && calendarAttendees.length ? `<dl><dt>Attendees</dt><dd>${escapeHtml(calendarAttendees.join(', '))}</dd></dl>` : ''}
      ${approval.kind === 'calendar_write' && typeof notifyAttendees === 'boolean' ? `<dl><dt>Notifications</dt><dd>${notifyAttendees ? 'Attendees will be notified.' : 'No attendee notifications.'}</dd></dl>` : ''}
      ${approval.kind === 'payment' ? `<dl><dt>Application fee</dt><dd>${escapeHtml(String(paymentCurrency ?? ''))} ${escapeHtml(Number(paymentAmount ?? 0).toFixed(2))}</dd></dl><dl><dt>Merchant</dt><dd>${escapeHtml(String(paymentMerchant ?? 'Institution or payment provider'))}</dd></dl>${paymentDeadline ? `<dl><dt>Deadline</dt><dd>${escapeHtml(String(paymentDeadline))}</dd></dl>` : ''}<div class="task-agent-waiting-detail"><span>Card details, bank authentication, 3DS, and OTP stay on the secure provider surface. ShotCount will verify the resulting portal state and receipt before marking this complete.</span></div>` : ''}
      ${title || approval.kind === 'calendar_write' ? approval.kind === 'send_email'
        ? `<label class="task-agent-email-field"><span>Subject</span><input type="text" data-agent-email-subject="${escapeHtml(task.id)}" value="${escapeHtml(String(title))}" maxlength="998" aria-label="Email subject" ${busy || undoing ? 'disabled' : ''}></label>`
        : approval.kind === 'calendar_write'
          ? `<label class="task-agent-email-field"><span>Event <strong class="task-agent-review-value">${escapeHtml(String(title))}</strong></span><input type="text" data-agent-calendar-summary="${escapeHtml(task.id)}" value="${escapeHtml(String(title))}" maxlength="1000" aria-label="Calendar event title" ${busy ? 'disabled' : ''}></label>`
          : `<dl><dt>Event</dt><dd>${escapeHtml(String(title))}</dd></dl>` : ''}
      ${approval.kind === 'calendar_write' ? `<div class="task-agent-calendar-times"><label class="task-agent-email-field"><span>Starts <small>ISO 8601</small></span><input type="text" data-agent-calendar-start="${escapeHtml(task.id)}" value="${escapeHtml(String(startsAt ?? ''))}" maxlength="64" aria-label="Calendar event start" ${busy ? 'disabled' : ''}><output class="task-agent-review-value">${escapeHtml(String(startsAt ?? ''))}</output></label><label class="task-agent-email-field"><span>Ends <small>ISO 8601</small></span><input type="text" data-agent-calendar-end="${escapeHtml(task.id)}" value="${escapeHtml(String(endsAt ?? ''))}" maxlength="64" aria-label="Calendar event end" ${busy ? 'disabled' : ''}><output class="task-agent-review-value">${escapeHtml(String(endsAt ?? ''))}</output></label></div>` : startsAt ? `<dl><dt>When</dt><dd>${escapeHtml(String(startsAt))}${endsAt ? ` → ${escapeHtml(String(endsAt))}` : ''}</dd></dl>` : ''}
      ${destination ? `<dl><dt>Page</dt><dd>${escapeHtml(String(destination))}</dd></dl>` : ''}
      ${browserTarget ? `<dl><dt>Submit</dt><dd>${escapeHtml(String(browserTarget))}</dd></dl>` : ''}
      ${Array.isArray(preparedValues) ? preparedValues.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
        const value = item as Record<string, unknown>
        return `<dl><dt>${escapeHtml(String(value.field ?? 'Field'))}</dt><dd>${escapeHtml(String(value.value ?? ''))}</dd></dl>`
      }).join('') : ''}
      ${Array.isArray(safety?.warnings) && safety.warnings.length ? `<div class="task-agent-waiting-detail"><span>${escapeHtml(safety.warnings.join(' '))}</span></div>` : ''}
      ${approval.kind === 'calendar_write'
        ? `<label class="task-agent-email-field"><span>Description</span><textarea data-agent-calendar-description="${escapeHtml(task.id)}" rows="5" maxlength="12000" aria-label="Calendar event description" ${busy ? 'disabled' : ''}>${escapeHtml(String(body ?? ''))}</textarea></label>`
        : body ? approval.kind === 'send_email'
        ? `<label class="task-agent-email-field"><span>Message</span><textarea data-agent-email-body="${escapeHtml(task.id)}" rows="9" maxlength="20000" aria-label="Email body" ${busy || undoing ? 'disabled' : ''}>${escapeHtml(String(body))}</textarea></label><label class="task-agent-email-field"><span>Attachment <small>${attachment?.name ? 'Choose another to replace it' : 'Optional · from your computer'}</small></span><input type="file" data-agent-email-attachment="${escapeHtml(task.id)}" aria-label="Email attachment" ${busy || undoing ? 'disabled' : ''}></label>`
        : `<blockquote>${escapeHtml(String(body)).replaceAll('\n', '<br>')}</blockquote>` : browserEffect ? `<blockquote>${escapeHtml(String(browserEffect))}</blockquote>` : `<p>${escapeHtml(approval.summary)}</p>`}
    </div>
    <small>Only this exact action is approved. Any change requires a new review.</small>
    <footer>
      <button type="button" data-action="reject-agent-approval" data-task-id="${escapeHtml(task.id)}" ${(busy || undoing) ? 'disabled' : ''}>Not now</button>
      <button class="agent-primary" type="button" data-action="${undoing ? 'undo-email-send' : 'approve-agent-approval'}" data-task-id="${escapeHtml(task.id)}" ${busy ? 'disabled' : ''}>${undoing ? 'Undo send' : busy ? 'Working…' : confirmLabel}</button>
    </footer>
  </section>`
}

function renderAgentWaitingPanel(task: Task, run: AgentRun) {
  const external = run.status === 'waiting_external'
  const busy = agentDecisionBusy.has(run.id)
  const applicationControlTower = run.applicationState?.pendingInputs?.some(item =>
    !isAutonomousApplicationPendingInput(item) &&
    !(taskHasPreparedCv(task.id) && isCvPendingInput(normalizeApplicationPendingInput(item))),
  )
    ? renderApplicationControlTower(task, run)
    : ''
  if (applicationControlTower) {
    return `<section class="task-agent-card task-agent-card--progress">
      <header>${specialistHeader(task, run)}</header>
      ${applicationControlTower}
      ${renderRoonGeneratedFiles(task)}
      <footer><button type="button" data-action="cancel-agent" data-task-id="${escapeHtml(task.id)}">Cancel</button></footer>
    </section>
    <aside class="task-agent-notification">${icon('bell')}<span>ShotCount keeps watch while you get on with your day.</span></aside>`
  }
  // Application research runs through the OpenAI web-research lane and must
  // never turn a stale provider error into a Gmail authorization prompt. A
  // Gmail connection remains available for non-application communication
  // tasks, while the application lane gets its normal safe retry affordance.
  const applicationWebResearch = isApplicationIntent(task.title, task.description) &&
    (run.errorCode === 'google_retry_exhausted' || run.errorCode === 'research_provider_retry_exhausted' || /web research provider/i.test(run.waitingReason))
  const needsGoogle = !applicationWebResearch && (run.errorCode?.startsWith('google_') ||
    /connect google|reconnect google/i.test(run.waitingReason))
  const title = external ? 'I’m keeping an eye on this.' : 'I need one detail to keep moving.'
  const userFacingWaitingReason = humanizeAgentProgressLabel(run.waitingReason)
  const detail = external ? 'I’ll keep watching and continue as soon as there’s an update. You can leave this screen.' : ''
  return `<section class="task-agent-card task-agent-card--waiting">
    <header>${specialistHeader(task, run)}<span class="task-agent-header-mark" role="img" aria-label="${external ? 'Waiting for an update' : 'Action needed'}">${external ? '…' : '!'}</span></header>
    <p>${escapeHtml(userFacingWaitingReason || title)}</p>
    ${detail ? `<div class="task-agent-waiting-detail">${icon('bell')}<span>${escapeHtml(detail)}</span></div>` : ''}
    ${renderRoonGeneratedFiles(task)}
    <footer>
      <button type="button" data-action="cancel-agent" data-task-id="${escapeHtml(task.id)}">Cancel</button>
      ${needsGoogle ? `<button class="agent-primary" type="button" data-action="connect-agent-google" data-task-id="${escapeHtml(task.id)}" ${(busy || googleAgentConnectionBusy) ? 'disabled' : ''}>${googleAgentConnectionBusy ? 'Opening…' : 'Connect Google'}</button>` : external ? '' : `<button class="agent-primary" type="button" data-action="retry-agent" data-task-id="${escapeHtml(task.id)}" ${busy ? 'disabled' : ''}>${busy ? 'Refreshing…' : 'Try again'}</button>`}
    </footer>
  </section>`
}

function formatAgentContextPrompt(prompt: string) {
  const numbered = [...prompt.matchAll(/(?:^|\s)\(\d+\)\s*([\s\S]*?)(?=\s*\(\d+\)|$)/g)]
    .map(match => match[1].trim().replace(/[;.]$/, ''))
    .filter(Boolean)
  const dashed = prompt.split(/\n\s*[-•]\s+/).map(value => value.trim()).filter(Boolean)
  const items = numbered.length > 1 ? numbered : dashed.length > 1 ? dashed.slice(1) : []
  if (!items.length) return `<p>${escapeHtml(prompt)}</p>`
  const introEnd = prompt.search(/(?:^|\s)\(1\)\s*/)
  const intro = introEnd > 0 ? prompt.slice(0, introEnd).replace(/[:\s]+$/, '') : 'Here’s what I need next'
  return `<div class="task-agent-context-message"><p>${escapeHtml(intro)}</p><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`
}

function applicationInputSpec(prompt: string) {
  const text = prompt.toLocaleLowerCase()
  if (/\bemail\b/.test(text)) return { type: 'email', label: 'Email address', placeholder: 'name@example.com' }
  if (/\b(?:full\s+name|legal\s+name|your\s+name)\b/.test(text)) return { type: 'text', label: 'Full name', placeholder: 'Enter the full name' }
  if (/\b(?:phone|mobile|telephone)\b/.test(text)) return { type: 'tel', label: 'Phone number', placeholder: 'Enter the phone number' }
  if (/\b(?:house|home|postal|mailing|residential)\s+address\b|\baddress\b/.test(text)) return { type: 'text', label: 'Address', placeholder: 'Enter the complete address' }
  if (/\b(?:date|deadline|return)\b/.test(text)) return { type: 'date', label: 'Date', placeholder: 'Choose a date' }
  if (/\b(?:score|gpa|grade|number)\b/.test(text)) return { type: 'text', label: 'The exact result', placeholder: 'Enter the result exactly as reported' }
  return { type: 'text', label: 'The missing application detail', placeholder: 'Enter the detail needed for this application' }
}

function canResumeCancelledApplicationRun(task: Task, run: AgentRun | undefined) {
  return Boolean(
    run?.status === 'cancelled' &&
    isApplicationIntent(task.title, task.description) &&
    (run.applicationState?.currentCaseId || run.applicationCaseId),
  )
}

function renderAgentPanel(task: Task) {
  const run = agentRuns.get(task.id)
  if (!run) return ''
  if (run.status === 'cancelled') {
    if (!canResumeCancelledApplicationRun(task, run)) return ''
    const busy = agentDecisionBusy.has(run.id)
    return `<section class="task-agent-card task-agent-card--waiting">
      <header>${specialistHeader(task, run)}<span class="task-agent-header-mark" role="img" aria-label="Paused">…</span></header>
      <p>This application is paused at the last confirmed step.</p>
      <small>Everything already found is safe. Continue this task to pick up where it stopped.</small>
      <footer><button class="agent-primary" type="button" data-action="retry-agent" data-task-id="${escapeHtml(task.id)}" ${busy ? 'disabled' : ''}>${busy ? 'Continuing…' : 'Continue from checkpoint'}</button></footer>
    </section>`
  }

  // Application lanes can park one persisted decision while independent
  // workstreams continue. Keep that exact interaction visible even while the
  // outer AgentRun remains running; hiding it behind the run-level status
  // makes a real user checkpoint disappear from the task UI.
  if (run.status === 'needs_context' || run.contextInteraction) {
    const rawContextPrompt = run.waitingReason.trim() || 'Share the missing details so I can continue.'
    const contextPrompt = humanizeAgentProgressLabel(rawContextPrompt)
      .replace(/\bRoon\b/gi, specialistName(task, run))
    const requirementRepairPaused = run.errorCode === 'application_requirements_repair_paused'
    const owner = specialistForTask(task, run)
    const ownerName = isApplicationIntent(task.title, task.description)
      ? 'ShotCount'
      : owner?.displayName ?? 'ShotCount'
    const canUseAttachedCv = isApplicationIntent(task.title, task.description) &&
      /NOT A REAL APPLICANT|authoritative CV/i.test(rawContextPrompt) &&
      (taskFileAssets.get(task.id) ?? []).some(asset => asset.source === 'task_upload' && asset.mimeType === 'application/pdf')
    const hasReadableAttachedCv = isApplicationIntent(task.title, task.description) &&
      (taskFileAssets.get(task.id) ?? []).some(asset => asset.source === 'task_upload' && ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(asset.mimeType))
    const canRetryAttachedCv = hasReadableAttachedCv && (
      ['application_cv_source_unavailable', 'application_cv_source_page_count_mismatch', 'application_cv_factual_inventory_invalid', 'application_cv_compilation_failed', 'application_cv_layout_invalid', 'application_cv_tailoring_rules_outdated', 'application_cv_render_invalid', 'application_cv_tailoring_brief_invalid', 'application_cv_tailoring_target_mismatch', 'application_cv_tailoring_source_invalid', 'application_cv_programme_fit_ungrounded', 'application_cv_programme_fit_provenance_missing'].includes(run.errorCode ?? '') ||
      /record\.[a-z_]+ is not iterable/i.test(rawContextPrompt)
    )
    const candidates = run.recipientResolution?.state === 'ambiguous'
      ? (run.recipientResolution.candidates ?? []).filter(candidate => candidate.email)
      : []
    const schedulingOptions = run.schedulingOptions ?? []
    const applicationDiscoveryActive = Boolean(run.applicationState && applicationNeedsProgrammeDiscovery(run.applicationState, run))
    const applicationRun = isApplicationIntent(task.title, task.description)
    const sopAuthoringOptions = isApplicationIntent(task.title, task.description) && schedulingOptions.length === 2 &&
      schedulingOptions.some(option => /human expert/i.test(option.label)) &&
      schedulingOptions.some(option => /(?:roon|david) draft/i.test(option.label))
    const sopAuthoringPrompt = `Your CV is my home turf: facts in, unfairly sharp tailoring out. An SOP deserves human editorial firepower for the final narrative. Want me to bring in a human application expert, or should ${ownerName} draft it? If we bring one in, I’ll quarterback the whole thing—brief them, handle the messages, drive the revisions, and get the final application pack submission-ready for your approval.`
    const formattedPrompt = formatAgentContextPrompt(canRetryAttachedCv
      ? 'I found an optional detail in the attached CV in an unexpected format. I’m rebuilding the tailored CV from the same document and will keep the rest of the application moving.'
      : sopAuthoringOptions ? sopAuthoringPrompt : contextPrompt)
    const asksForConfirmation = /\b(?:please\s+)?confirm\b/i.test(contextPrompt)
    const requestsAttachment = !sopAuthoringOptions && /\b(?:attach(?:ment)?|upload|file|document|CV|résumé|resume|passport|certificate|transcript)\b/i.test(contextPrompt)
    const hasDirectChoice = candidates.length > 0
    const draft = roonContextDrafts.get(run.id) ?? ''
    const replyLabel = asksForConfirmation ? 'Your confirmation' : 'The missing detail'
    const attachmentHint = 'Roon checks it automatically once it is attached.'.replace('Roon', ownerName)
    const contextInputSpec = applicationInputSpec(contextPrompt)
    const hasStructuredChoice = hasDirectChoice || schedulingOptions.length > 0
    const canReplyInPanel = !hasStructuredChoice && !canUseAttachedCv && !canRetryAttachedCv && !requestsAttachment
    const contextInteraction = run.contextInteraction
    const workSampleInteraction = isWorkSampleProgressInteraction(contextInteraction) ? contextInteraction : null
    const applicationQuestionInteraction = contextInteraction?.kind === 'application_question' ? contextInteraction : null
    const recommendationInteraction = isRecommendationProgressInteraction(contextInteraction) ? contextInteraction : null
    const interactionRenderedInApplicationTower = Boolean(applicationRun && recommendationInteraction && !isApplicationProgrammeSelectionInteraction(recommendationInteraction))
    const hasApplicationPendingInputs = Boolean(run.applicationState?.pendingInputs?.some(item => !isAutonomousApplicationPendingInput(item)))
    // Structured progress details already render their own question, reason,
    // and control. Repeating the run's waiting message below it makes
    // the card feel like it is stuck, and can surface stale worker wording.
    const showContextPrompt = !requirementRepairPaused && !contextInteraction && !hasApplicationPendingInputs && !applicationDiscoveryActive && !applicationRun
    const applicationControlTower = run.applicationState
      ? renderApplicationControlTower(task, run)
      : ''
    return `<section class="task-agent-card task-agent-card--context${applicationDiscoveryActive ? ' task-agent-card--application-discovery' : ''}" data-agent-error-code="${escapeHtml(run.errorCode ?? '')}">
      <header>${specialistHeader(task, run)}<span class="task-agent-header-mark" role="img" aria-label="Your turn">?</span></header>
      ${applicationControlTower}
      ${workSampleInteraction ? renderWorkSampleProgressDetail(workSampleInteraction, task.id, agentDecisionBusy.has(run.id)) : applicationQuestionInteraction ? renderApplicationQuestionProgressDetail(applicationQuestionInteraction, task.id, agentDecisionBusy.has(run.id)) : recommendationInteraction && !interactionRenderedInApplicationTower ? renderRecommendationProgressDetail(recommendationInteraction, task.id, agentDecisionBusy.has(run.id), programmeSelectionDrafts.get(recommendationInteraction.id) ?? '') : ''}
      ${showContextPrompt ? formattedPrompt : run.errorCode === 'application_cv_review_required' || applicationRun ? '' : '<p class="task-agent-context-summary">I’m ready to continue from the last confirmed step.</p>'}
      ${candidates.length ? `<div class="task-agent-recipient-options">${candidates.map(candidate => `<button type="button" data-action="select-agent-recipient" data-task-id="${escapeHtml(task.id)}" data-recipient-email="${escapeHtml(candidate.email ?? '')}" ${agentDecisionBusy.has(run.id) ? 'disabled' : ''}><strong>${escapeHtml(candidate.name || run.recipientResolution?.recipient || 'Unknown recipient')}</strong><span>${escapeHtml(candidate.email ?? '')}</span></button>`).join('')}</div><small>Choose the person you mean. ${escapeHtml(ownerName)} will continue this same task.</small>` : schedulingOptions.length ? `<div class="task-agent-recipient-options">${schedulingOptions.map(option => `<button type="button" data-action="select-agent-schedule-option" data-task-id="${escapeHtml(task.id)}" data-schedule-option="${escapeHtml(option.value)}" ${agentDecisionBusy.has(run.id) ? 'disabled' : ''}><strong>${escapeHtml(option.label.replace(/Roon/gi, ownerName))}</strong><span>${sopAuthoringOptions ? 'Choose this path' : 'Use this option'}</span></button>`).join('')}</div><small>${sopAuthoringOptions ? `${escapeHtml(ownerName)} stays in the driver’s seat—from expert brief to final submission-ready pack.` : `Choose an option, or give ${escapeHtml(ownerName)} a different detail below.`}</small>` : ''}
      ${!requirementRepairPaused && !contextInteraction && !hasApplicationPendingInputs && canReplyInPanel ? `<label class="task-agent-context-input"><span>${replyLabel}</span><input class="task-agent-context" type="${contextInputSpec.type}" data-agent-context-input data-run-id="${escapeHtml(run.id)}" placeholder="${contextInputSpec.placeholder}" aria-label="${contextInputSpec.label}" value="${escapeHtml(draft)}" ${agentDecisionBusy.has(run.id) ? 'disabled' : ''}></label>` : ''}
      ${!contextInteraction && requestsAttachment && !applicationRun ? `<small class="task-agent-attachment-hint">Use the attachment control in Description to add the file. ${escapeHtml(attachmentHint)}</small>` : ''}
      ${renderRoonGeneratedFiles(task)}
      ${contextInteraction || hasApplicationPendingInputs ? '' : `<footer><button type="button" data-action="cancel-agent" data-task-id="${escapeHtml(task.id)}">Cancel task</button>${requirementRepairPaused ? '' : canRetryAttachedCv ? '<button class="agent-primary" type="button" data-action="retry-agent" data-task-id="' + escapeHtml(task.id) + '" ' + (agentDecisionBusy.has(run.id) ? 'disabled' : '') + '>' + (agentDecisionBusy.has(run.id) ? 'Rebuilding…' : 'Keep working') + '</button>' : candidates.length ? '' : canUseAttachedCv ? '<button class="agent-primary" type="button" data-action="use-attached-cv" data-task-id="' + escapeHtml(task.id) + '">Use attached CV</button>' : requestsAttachment ? '<button type="button" data-action="focus-task-description" data-task-id="' + escapeHtml(task.id) + '">Attach file</button><button class="agent-primary" type="button" data-action="check-attached-context" data-task-id="' + escapeHtml(task.id) + '">Check attachment</button>' : hasStructuredChoice ? '' : '<button class="agent-primary" type="button" data-action="submit-agent-context" data-task-id="' + escapeHtml(task.id) + '" ' + (agentDecisionBusy.has(run.id) ? 'disabled' : '') + '>' + (asksForConfirmation ? 'Confirm' : 'Save and continue') + '</button>'}</footer>`}
    </section>`
  }

  if (run.status === 'needs_approval') {
    const approval = agentApprovals.get(run.id)
    if (approval) return renderAgentApprovalPanel(task, approval)
    return renderAgentWaitingPanel(task, { ...run, status: 'waiting_for_user', waitingReason: 'Preparing the approval details…' })
  }

  if (run.status === 'waiting_external') {
    return renderAgentProgressPanel(task, run.progressIndex, false, run)
  }

  if (run.status === 'waiting_for_user') {
    return renderAgentWaitingPanel(task, run)
  }

  if (run.status === 'completed' && run.result) {
    const resultLabel = run.intent.outcomeType === 'external_change' ? 'Done' : 'Ready to review'
    return `<section class="task-agent-card task-agent-card--result">
      <header>${specialistHeader(task, run)}<span class="task-agent-header-mark task-agent-header-mark--complete" role="img" aria-label="${escapeHtml(resultLabel)}">✓</span></header>
      <p>${escapeHtml(humanizeAgentProgressLabel(run.result.summary))}</p>
      <div class="task-agent-result">
        ${run.result.sections.map(section => `<article><strong>${escapeHtml(humanizeAgentProgressLabel(section.title))}</strong><p>${escapeHtml(humanizeAgentProgressLabel(section.body))}</p></article>`).join('')}
        ${run.result.drafts.map(draft => `<article class="agent-draft"><strong>${escapeHtml(draft.title)}</strong><p>${escapeHtml(draft.body).replaceAll('\n', '<br>')}</p></article>`).join('')}
      </div>
      ${renderRoonGeneratedFiles(task)}
      ${run.result.sources.length ? `<div class="agent-sources"><strong>Sources</strong>${run.result.sources.map(source => `<a href="${safeAgentUrl(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)} ↗</a>`).join('')}</div>` : ''}
      ${run.result.followUps.length ? `<div class="agent-followups"><strong>Suggested next application steps</strong>${run.result.followUps.map(title => `<span>＋ ${escapeHtml(title)}</span>`).join('')}</div><button class="agent-add-followups" type="button" data-action="add-agent-followups" data-task-id="${escapeHtml(task.id)}">Add application follow-ups</button>` : ''}
      ${run.result.applicationReviewUrl ? `<a class="agent-primary agent-review-application" href="${safeAgentUrl(run.result.applicationReviewUrl)}" target="_blank" rel="noreferrer">Review application</a>` : ''}
      <small>Private to you · Application context and output stay in this workspace.</small>
    </section>`
  }

  if (run.status === 'failed') {
    if (isPreviewMode && previewAgentState !== 'error') return renderAgentProgressPanel(task, run.progressIndex, true, run)
    return renderAgentErrorPanel(task, run.error ?? `${specialistName(task, run)} could not complete this task.`)
  }

  return renderAgentProgressPanel(task, run.progressIndex, false, run)
}

function renderInspector(task: Task) {
  if (cloudEnabled && !taskFileAssets.has(task.id) && !loadingTaskFileAssets.has(task.id)) {
    loadingTaskFileAssets.add(task.id)
    void loadTaskFileAssets(task.id).then(assets => {
      taskFileAssets.set(task.id, assets)
      resumeApplicationRunForNewAttachment(task, assets)
      if (selectedTaskId === task.id) render()
    }).catch(() => {
      taskFileAssets.set(task.id, [])
    }).finally(() => loadingTaskFileAssets.delete(task.id))
  }
  const subtasks = task.subtaskItems ?? Array.from({ length: task.subtasks ?? 0 }, (_, index) => ({
    id: task.id + '-subtask-' + index,
    title: index === 0 ? 'Subtask' : `Subtask ${index + 1}`,
    completed: false,
  }))
  task.subtaskItems = subtasks
  const recording = descriptionRecordingTaskId === task.id
  const transcribing = descriptionTranscribingTaskId === task.id
  return `
    <aside class="inspector">
      <button type="button" class="inspector-close" data-action="close-inspector" aria-label="Close task details">${icon('chevron')}</button>
      <div class="inspector-content">
        <h2>Task:</h2>
        <input class="inspector-title" value="${escapeHtml(task.title)}" aria-label="Task title" />
        <div class="inspector-description-wrap">
          <textarea class="inspector-description" aria-label="Description" placeholder="Description" rows="3">${escapeHtml(task.description ?? '')}</textarea>
          ${renderDescriptionWaveform(task.id)}
          <div class="description-tools">
            <label class="description-attachment-input ${taskFileAssetBusy.has(task.id) ? 'is-busy' : ''}" aria-label="${taskFileAssetBusy.has(task.id) ? 'Uploading attachment' : 'Add attachment'}">
              <input type="file" data-task-file-input="${escapeHtml(task.id)}" accept="${acceptedTaskFileTypes.join(',')}" ${taskFileAssetBusy.has(task.id) ? 'disabled' : ''}>
              ${taskFileAssetBusy.has(task.id) ? '<span aria-hidden="true">…</span>' : icon('paperclip')}
            </label>
            <button type="button" class="description-voice-input ${recording ? 'is-recording' : ''}" data-action="toggle-description-voice" aria-label="${recording ? 'Stop voice input' : transcribing ? 'Transcribing description' : 'Add voice input to description'}" aria-pressed="${recording}" ${transcribing ? 'disabled' : ''}>
              ${recording ? renderRoonOrb('listening', 23) : transcribing ? '<span aria-hidden="true">…</span>' : icon('mic')}
            </button>
          </div>
        </div>
        ${renderTaskAttachments(task)}
        ${renderInspectorRoonAction(task)}

        <div class="inspector-fields">
          <label><span>Due date</span><input class="inspector-date" type="date" value="${task.due ?? ''}" aria-label="Due date" /></label>
          <label><span>Due time · reminds 15 min before</span><input class="inspector-time" type="time" value="${task.time ?? ''}" aria-label="Due time, optional; reminder 15 minutes before" /></label>
        </div>

        ${renderAgentPanel(task)}

        <h3>Subtasks:</h3>
        ${subtaskComposerTaskId === task.id ? `
          <form class="subtask-composer" data-subtask-form="${escapeHtml(task.id)}">
            <input name="title" aria-label="Subtask title" placeholder="What needs doing?" autocomplete="off" required />
            <button type="submit">Add</button>
            <button type="button" data-action="cancel-subtask" aria-label="Cancel subtask">Cancel</button>
          </form>
        ` : `<button class="add-subtask" data-action="add-subtask">${icon('plus')}<span>Add subtask</span></button>`}
        ${subtasks.map(subtask => renderSubtask(task, subtask)).join('')}
      </div>
      <div class="inspector-actions">
        <button data-action="delete-task">Delete task</button>
        <button class="save" data-action="save-task">Save changes</button>
      </div>
    </aside>
  `
}

function fileKind(asset: FileAsset) {
  if (asset.mimeType.startsWith('image/')) return 'Image'
  if (asset.mimeType === 'application/pdf') return 'PDF'
  if (asset.mimeType.includes('wordprocessingml')) return 'DOCX'
  return 'TXT'
}

function renderTaskAttachments(task: Task) {
  const assets = (taskFileAssets.get(task.id) ?? []).filter(isUserVisibleTaskAttachment)
  const busy = taskFileAssetBusy.has(task.id)
  if (!assets.length) return ''
  const reuseOwner = isApplicationIntent(task.title, task.description)
    ? 'application tasks'
    : `${specialistName(task, agentRuns.get(task.id))} in future tasks`
  return `<section class="task-attachments" aria-label="Task attachments">
    <div class="task-attachment-list">
      ${assets.map(asset => `<article class="task-attachment-chip">
        <span class="task-attachment-kind">${icon('paperclip')}</span>
        <button class="task-attachment-preview" type="button" data-action="preview-task-file" data-task-id="${escapeHtml(task.id)}" data-file-asset-id="${escapeHtml(asset.id)}" title="Open ${escapeHtml(asset.originalFilename)}" aria-label="Open ${escapeHtml(asset.originalFilename)}">${escapeHtml(asset.originalFilename)}</button>
        <label class="task-attachment-reuse" title="Make available to ${escapeHtml(reuseOwner)}"><input type="checkbox" data-action="toggle-file-reusable" data-task-id="${escapeHtml(task.id)}" data-file-asset-id="${escapeHtml(asset.id)}" ${asset.reusable ? 'checked' : ''} ${busy ? 'disabled' : ''}><span>Reuse</span></label>
        <button class="task-attachment-remove" type="button" data-action="remove-task-attachment" data-task-id="${escapeHtml(task.id)}" data-file-asset-id="${escapeHtml(asset.id)}" aria-label="Remove ${escapeHtml(asset.originalFilename)}" ${busy ? 'disabled' : ''}>×</button>
      </article>`).join('')}
    </div>
  </section>`
}

function renderRoonGeneratedFiles(task: Task) {
  const assets = selectUserVisibleGeneratedFiles(taskFileAssets.get(task.id) ?? [])
  if (!assets.length) return ''
  const ownerName = isApplicationIntent(task.title, task.description)
    ? 'Application'
    : specialistName(task, agentRuns.get(task.id))
  const progressPreview = filePreview?.placement === 'progress' && assets.some(asset => asset.id === filePreview?.asset.id)
    ? filePreview
    : null
  const previewMarkup = progressPreview
    ? `<div class="task-agent-file-preview" aria-label="CV preview">
        <header><span><strong>CV preview</strong><small>${escapeHtml(progressPreview.asset.originalFilename)}</small></span><button type="button" data-action="close-file-preview" aria-label="Close CV preview">×</button></header>
        ${progressPreview.loading
          ? '<div class="task-agent-file-preview-notice"><strong>Opening CV…</strong><small>Preparing a private view of the generated PDF.</small></div>'
          : progressPreview.url
            ? `<iframe title="Preview of ${escapeHtml(progressPreview.asset.originalFilename)}" src="${escapeHtml(progressPreview.url)}"></iframe><footer><span>Private to you</span><a href="${escapeHtml(progressPreview.url)}" download="${escapeHtml(progressPreview.asset.originalFilename)}" target="_blank" rel="noopener noreferrer">Download PDF</a></footer>`
            : `<div class="task-agent-file-preview-notice"><strong>Preview unavailable</strong><small>${escapeHtml(progressPreview.message ?? 'The CV could not be opened.')}</small></div>`}
      </div>`
    : ''
  return `<section class="task-agent-files" aria-label="Files prepared by ${escapeHtml(ownerName)}">
    <header><strong>Prepared files</strong><span>${assets.length} ready</span></header>
    ${assets.map(asset => `<button type="button" data-action="preview-progress-file" data-task-id="${escapeHtml(task.id)}" data-file-asset-id="${escapeHtml(asset.id)}" aria-label="Preview ${escapeHtml(asset.originalFilename)}" aria-expanded="${progressPreview?.asset.id === asset.id}">
      <span class="task-agent-file-icon">${icon('sticky')}</span>
      <span><b title="${escapeHtml(asset.originalFilename)}">${escapeHtml(asset.originalFilename)}</b><small>${fileKind(asset)}</small></span>
      <em>${progressPreview?.asset.id === asset.id ? 'Previewing' : 'Preview'}</em>
    </button>`).join('')}
    ${previewMarkup}
  </section>`
}

function renderFilePreview() {
  if (!filePreview || filePreview.placement === 'progress') return ''
  const isPdf = filePreview.asset.mimeType === 'application/pdf'
  const isImage = filePreview.asset.mimeType.startsWith('image/')
  const isText = filePreview.asset.mimeType === 'text/plain' || filePreview.asset.mimeType === 'application/json' || filePreview.asset.mimeType === 'application/x-ipynb+json'
  const canPreviewInline = isPdf || isImage || isText
  const previewTask = tasks.find(task => task.id === filePreview?.asset.taskId)
  const sourceLabel = filePreview.asset.source === 'roon_generated'
    ? `Prepared by ${specialistName(previewTask ?? { title: '', description: '' }, previewTask ? agentRuns.get(previewTask.id) : null)}`
    : 'Attachment'
  const safeUrl = filePreview.url ? escapeHtml(filePreview.url) : ''
  const openLabel = isPdf ? 'Open PDF' : isImage ? 'Open image' : 'Open file'
  const loadingNotice = filePreview.loading
    ? '<div class="file-preview-notice"><strong>Opening file…</strong><p>Preparing a private view of this file.</p></div>'
    : !filePreview.url
      ? `<div class="file-preview-notice"><strong>Preview unavailable</strong><p>${escapeHtml(filePreview.message ?? 'The file could not be opened.')}</p></div>`
      : ''
  return `<div class="file-preview-backdrop" data-action="close-file-preview">
    <section class="file-preview-card" role="dialog" aria-modal="true" aria-labelledby="file-preview-title" data-action-stop>
      <header><div><small>${sourceLabel}</small><strong id="file-preview-title">${escapeHtml(filePreview.asset.originalFilename)}</strong></div><button type="button" data-action="close-file-preview" aria-label="Close preview">×</button></header>
      ${loadingNotice || (filePreview.url && canPreviewInline
        ? isImage
          ? `<div class="file-preview-image"><img alt="Preview of ${escapeHtml(filePreview.asset.originalFilename)}" src="${safeUrl}"></div>`
          : `<iframe title="Preview of ${escapeHtml(filePreview.asset.originalFilename)}" src="${safeUrl}"></iframe>`
        : filePreview.url ? `<div class="file-preview-notice"><strong>${filePreview.asset.mimeType.includes('wordprocessingml') ? 'Open this Word document' : 'Open this file'}</strong><p>${escapeHtml(filePreview.message ?? 'This format is best opened in its native app.')}</p></div>` : '')}
      <footer><span>Private to you</span>${filePreview.url ? `<div class="file-preview-links"><a class="file-preview-open" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${openLabel}</a><a class="file-preview-download" href="${safeUrl}" download="${escapeHtml(filePreview.asset.originalFilename)}" target="_blank" rel="noopener noreferrer">Download ${fileKind(filePreview.asset)}</a></div>` : ''}</footer>
    </section>
  </div>`
}

function renderInspectorRoonAction(task: Task) {
  const run = agentRuns.get(task.id)
  if (canResumeCancelledApplicationRun(task, run)) return ''
  if (run && run.status !== 'failed' && run.status !== 'cancelled') return ''
  const route = taskSpecialistRoute(task)
  if (!route.supported && !roonCapabilityForTask(task)) return ''
  const owner = specialistForTask(task, run)
  const ownerName = owner?.displayName ?? 'ShotCount'
  return `<button type="button" class="inspector-roon-delegate" data-action="delegate-task" data-task-id="${escapeHtml(task.id)}">Delegate to ${escapeHtml(ownerName)}</button>`
}

function renderSubtask(task: Task, subtask: NonNullable<Task['subtaskItems']>[number]) {
  const editing = editingSubtaskId === subtask.id
  return `<div class="subtask">
    <input type="checkbox" data-subtask="${escapeHtml(subtask.id)}" aria-label="Mark ${escapeHtml(subtask.title)} as ${subtask.completed ? 'not done' : 'done'}" ${subtask.completed ? 'checked' : ''}/>
    ${editing ? `<form class="subtask-edit-form" data-subtask-edit-form="${escapeHtml(task.id)}" data-subtask-id="${escapeHtml(subtask.id)}">
      <input name="title" value="${escapeHtml(subtask.title)}" aria-label="Edit subtask" autocomplete="off" required />
      <button type="submit">Save</button>
      <button type="button" data-action="cancel-subtask-edit" aria-label="Cancel editing">Cancel</button>
    </form>` : `<button type="button" class="subtask-title ${subtask.completed ? 'completed' : ''}" data-action="edit-subtask" data-subtask-id="${escapeHtml(subtask.id)}" aria-label="Edit ${escapeHtml(subtask.title)}">${escapeHtml(subtask.title)}</button>`}
    <button type="button" class="subtask-delete" data-action="delete-subtask" data-subtask-id="${escapeHtml(subtask.id)}" aria-label="Delete ${escapeHtml(subtask.title)}">${icon('trash')}</button>
  </div>`
}

function renderUpcoming() {
  const renderGroup = (group: UpcomingGroup) => sortTasks(tasksForUpcoming(group))
    .map(task => renderTaskRow(task, task.id === selectedTaskId))
    .join('')
  const tomorrowTasks = renderGroup('tomorrow')
  const weekTasks = renderGroup('week')
  return `
    <section class="upcoming-screen">
      <header class="screen-title"><h1>Upcoming</h1><span class="screen-count" data-count="${screenCounts.upcoming}" aria-label="${screenCounts.upcoming} upcoming tasks">${screenCounts.upcoming}</span></header>
      <div class="upcoming-columns">
        <section data-upcoming-section="tomorrow">
          <h2>Tomorrow</h2>
          ${renderUpcomingComposer('tomorrow')}
          ${tomorrowTasks || '<div class="planner-empty planner-empty--small"><strong>Nothing planned yet.</strong><p>Add a task for tomorrow.</p></div>'}
        </section>
        <section data-upcoming-section="week">
          <h2>This Week</h2>
          ${renderUpcomingComposer('week')}
          ${weekTasks || '<div class="planner-empty planner-empty--small"><strong>The week is open.</strong><p>Add something when it matters.</p></div>'}
        </section>
      </div>
      ${renderActivityGraph()}
    </section>
  `
}

function renderUpcomingComposer(group: UpcomingGroup) {
  if (plannerDraftGroup !== group) {
    return `<button class="add-task-row" data-action="open-planner" data-task-group="${group}">${icon('plus')}<span>Add New Task</span></button>`
  }
  const isWeek = group === 'week'
  return `
    <form class="planner-composer" data-planner-form="${group}">
      <input name="title" aria-label="Task name" placeholder="What needs doing?" autocomplete="off" required />
      ${isWeek ? `<input name="due" aria-label="Task date" type="date" min="${dateKey(addDays(now, 2))}" max="${weekEndKey}" value="${dateKey(addDays(now, 2))}" required />` : `<span class="planner-date">${formatTaskDate(tomorrowKey)}</span>`}
      <input name="time" aria-label="Task time, optional; reminder 15 minutes before" title="Adds a reminder 15 minutes before" type="time" />
      <button type="submit">Add</button>
      <button type="button" class="planner-cancel" data-action="close-planner" aria-label="Cancel">×</button>
    </form>
  `
}

function activityDates() {
  const end = addDays(now, 6 - now.getDay())
  return Array.from({ length: 371 }, (_, index) => addDays(end, index - 370))
}

function completionCountForDate(day: Date) {
  const key = dateKey(day)
  return tasks.filter(task => task.completedAt && dateKey(new Date(task.completedAt)) === key).length
}

function completedTasksForDate(day: Date) {
  const key = dateKey(day)
  return tasks
    .filter(task => task.completedAt && dateKey(new Date(task.completedAt)) === key)
    .sort((first, second) => new Date(first.completedAt!).getTime() - new Date(second.completedAt!).getTime())
}

function activityLevel(value: number, max: number) {
  if (!value || !max) return 0
  return Math.max(1, Math.min(4, Math.ceil(value / max * 4)))
}

function renderActivityGraph() {
  const dates = activityDates()
  const dailyCounts = dates.map(completionCountForDate)
  const weeklyCounts = Array.from({ length: 53 }, (_, column) =>
    dailyCounts.slice(column * 7, column * 7 + 7).reduce((total, count) => total + count, 0))
  const cumulativeCounts: number[] = []
  dailyCounts.reduce((total, count) => {
    const next = total + count
    cumulativeCounts.push(next)
    return next
  }, 0)
  const maxDaily = Math.max(...dailyCounts, 1)
  const maxWeekly = Math.max(...weeklyCounts, 1)
  const maxCumulative = Math.max(...cumulativeCounts, 1)
  const monthLabels = dates.filter((_, index) => index % 7 === 0).map((date, column, columns) => {
    const previous = columns[column - 1]
    return !previous || previous.getMonth() !== date.getMonth()
      ? `<span style="grid-column:${column + 1}">${date.toLocaleDateString('en-GB', { month: 'short' })}</span>`
      : ''
  }).join('')
  const cells = dates.map((day, index) => {
    const column = Math.floor(index / 7)
    const row = index % 7
    const isFuture = day > new Date(`${todayKey}T23:59:59`)
    let value = dailyCounts[index] ?? 0
    let level = activityLevel(value, maxDaily)
    let label = `${value} application step${value === 1 ? '' : 's'} completed on ${day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    const completedTasks = completedTasksForDate(day)
    if (completedTasks.length) label += `\n${completedTasks.map(task => `• ${task.title}`).join('\n')}`
    if (activityMode === 'weekly') {
      value = weeklyCounts[column] ?? 0
      const filledRows = Math.ceil(value / maxWeekly * 7)
      level = row >= 7 - filledRows ? activityLevel(value, maxWeekly) : 0
      label = `${value} application step${value === 1 ? '' : 's'} completed in the week of ${dates[column * 7]?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    } else if (activityMode === 'cumulative') {
      value = cumulativeCounts[index] ?? 0
      const filledRows = Math.ceil(value / maxCumulative * 7)
      level = row >= 7 - filledRows ? 3 : 0
      label = `${value} application steps completed by ${day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return `<span class="activity-cell level-${isFuture ? 0 : level} ${isFuture ? 'is-future' : ''}" role="img" data-activity-date="${dateKey(day)}" style="--column:${column + 1};--row:${row + 1}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>`
  }).join('')

  return `
    <section class="activity-panel" aria-labelledby="activity-title">
      <div class="activity-header">
        <div><h2 id="activity-title">Application progress</h2><p>Your completed application steps, one square at a time.</p></div>
        <div class="activity-tabs" aria-label="Activity view">
          ${(['daily', 'weekly', 'cumulative'] as ActivityMode[]).map(mode =>
            `<button class="${activityMode === mode ? 'active' : ''}" data-activity-mode="${mode}" aria-pressed="${activityMode === mode}">${mode[0]!.toUpperCase()}${mode.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div class="activity-scroll">
        <div class="activity-grid">${cells}</div>
        <div class="activity-months">${monthLabels}</div>
      </div>
      <span class="activity-mobile-hint">Swipe for earlier weeks</span>
      <div class="activity-legend"><span>Less</span>${[0, 1, 2, 3, 4].map(level => `<i class="level-${level}"></i>`).join('')}<span>More</span></div>
    </section>
  `
}

function renderCalendar() {
  const scheduled: CalendarOccurrence[] = [...calendarOccurrences(), ...googleCalendarOccurrences()]
  const visible = scheduled.filter(item => item.source === 'google'
    ? googleEventMatchesCalendarSearch(item.event)
    : taskMatchesCalendarSearch(item.task))
  const unscheduled = tasks.filter(task =>
    !task.time &&
    !completedTaskIds.has(task.id) &&
    taskMatchesCalendarSearch(task)
  )
  const conflicts = countCalendarConflicts(visible)
  const plannedMinutes = visible.reduce((total, item) => total + (item.source === 'google' && item.event.allDay ? 0 : calendarOccurrenceDuration(item)), 0)
  return `
    <section class="calendar-screen">
      <header class="calendar-header">
        <div>
          <div class="calendar-title-row">
            <h1>${formatCalendarTitle()}</h1>
            ${renderGoogleCalendarStatus()}
          </div>
          <div class="calendar-tabs"><button class="${calendarMode === 'day' ? 'active' : ''}" data-calendar-mode="day">Day</button><button class="${calendarMode === 'week' ? 'active' : ''}" data-calendar-mode="week">Week</button><button class="${calendarMode === 'month' ? 'active' : ''}" data-calendar-mode="month">Month</button></div>
        </div>
        <div class="calendar-header-actions">
          <label class="calendar-search">${icon('search')}<input data-calendar-search aria-label="Search calendar" placeholder="Search calendar" value="${escapeHtml(calendarSearch)}" /></label>
        </div>
      </header>
      <div class="calendar-toolbar">
        <div class="calendar-nav"><button aria-label="Previous ${calendarMode}" data-action="previous-date">‹</button><button aria-label="Next ${calendarMode}" data-action="next-date">›</button></div>
        <div class="calendar-stats"><span><b>${formatDuration(plannedMinutes)}</b> planned</span><span class="${conflicts ? 'has-conflict' : ''}"><b>${conflicts}</b> conflicts</span></div>
      </div>
      <div class="calendar-layout">
        <aside class="unscheduled-tray">
          <div><h2>To schedule</h2><span>${unscheduled.length}</span></div>
          <p><span class="desktop-schedule-copy">Drag a task onto the calendar.</span><span class="mobile-schedule-copy">Tap a task to schedule it.</span></p>
          <div class="unscheduled-list">
            ${unscheduled.length ? unscheduled.map(renderUnscheduledTask).join('') : '<div class="tray-empty">Everything has a place.</div>'}
          </div>
        </aside>
        <div class="calendar-board">
          ${calendarMode === 'month' ? renderCalendarMonth(visible) : renderCalendarTimeGrid(visible)}
        </div>
      </div>
      ${calendarComposer ? renderCalendarComposer() : ''}
    </section>
  `
}

function renderGoogleCalendarStatus() {
  if (googleCalendarState.status === 'needs_permission') {
    return '<button class="google-calendar-status needs-permission" data-action="connect-google-calendar">Connect Google Calendar</button>'
  }
  if (googleCalendarState.status === 'syncing') return '<span class="google-calendar-status is-syncing">Google · Syncing…</span>'
  if (googleCalendarState.status === 'failed') {
    return `<button class="google-calendar-status has-error" data-action="sync-google-calendar" title="${escapeHtml(googleCalendarState.message)}">Google · Retry</button>`
  }
  if (googleCalendarState.status === 'synced') return '<button class="google-calendar-status" data-action="sync-google-calendar">Google · Synced</button>'
  return '<button class="google-calendar-status" data-action="connect-google-calendar">Connect Google Calendar</button>'
}

function calendarDateKey(date = calendarDate) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCalendarTitle() {
  if (calendarMode === 'month') return calendarDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  if (calendarMode === 'week') {
    const monday = new Date(calendarDate)
    const weekday = (monday.getDay() + 6) % 7
    monday.setDate(monday.getDate() - weekday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return `${monday.getDate()} – ${sunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  return calendarDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

type TaskCalendarOccurrence = { source: 'shotcount'; task: Task; date: string }
type GoogleCalendarOccurrence = { source: 'google'; event: GoogleCalendarEvent; date: string; time: string; duration: number }
type CalendarOccurrence = TaskCalendarOccurrence | GoogleCalendarOccurrence

function calendarOccurrences(): TaskCalendarOccurrence[] {
  const dates = calendarMode === 'month' ? monthGridDates(calendarDate) : visibleCalendarDates()
  return dates.flatMap(date => tasks
    .filter(task => task.time && !completedTaskIds.has(task.id) && taskOccursOn(task, date))
    .map(task => ({ source: 'shotcount' as const, task, date })))
}

function googleCalendarOccurrences(): GoogleCalendarOccurrence[] {
  const visibleDates = calendarMode === 'month' ? monthGridDates(calendarDate) : visibleCalendarDates()
  return googleCalendarEvents.flatMap(event => {
    if (event.allDay && event.startDate) {
      const end = event.endDate ?? event.startDate
      return visibleDates
        .filter(date => date >= event.startDate! && date < end)
        .map(date => ({ source: 'google' as const, event, date, time: '06:00', duration: 30 }))
    }
    if (!event.startAt) return []
    const start = new Date(event.startAt)
    const end = event.endAt ? new Date(event.endAt) : new Date(start.getTime() + 30 * 60 * 1000)
    const date = dateKey(start)
    if (!visibleDates.includes(date)) return []
    return [{
      source: 'google' as const,
      event,
      date,
      time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      duration: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000)),
    }]
  })
}

function taskOccursOn(task: Task, date: string) {
  if (!task.due || date < task.due) return false
  if (!task.recurrence || task.recurrence === 'none') return date === task.due
  let nextDate: string | null = task.due
  const anchorDay = new Date(`${task.due}T12:00:00`).getUTCDate()
  while (nextDate && nextDate < date) {
    nextDate = nextRecurringDate(nextDate, task.recurrence, anchorDay)
  }
  return nextDate === date
}

function visibleCalendarDates() {
  if (calendarMode === 'day') return [calendarDateKey()]
  const monday = new Date(calendarDate)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => dateKey(addDays(monday, index)))
}

function monthGridDates(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12)
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, index) => dateKey(addDays(first, index)))
}

function renderCalendarTimeGrid(occurrences: CalendarOccurrence[]) {
  const dates = visibleCalendarDates()
  const hours = Array.from({ length: 17 }, (_, index) => index + 6)
  return `
    <div class="calendar-time-grid ${calendarMode === 'day' ? 'is-day' : ''}" style="--day-count:${dates.length}">
      <div class="calendar-day-head spacer"></div>
      ${dates.map(date => {
        const day = new Date(`${date}T12:00:00`)
        return `<div class="calendar-day-head ${date === todayKey ? 'today' : ''}"><span>${day.toLocaleDateString('en-GB', { weekday: 'short' })}</span><b>${day.getDate()}</b></div>`
      }).join('')}
      <div class="calendar-hours">${hours.map(hour => `<time>${formatTaskTime(`${String(hour).padStart(2, '0')}:00`)}</time>`).join('')}</div>
      ${dates.map(date => `
        <div class="calendar-day-track" data-calendar-drop-date="${date}">
          ${date === todayKey ? renderNowLine() : ''}
          ${occurrences.filter(item => item.date === date).map(item => renderCalendarBlock(item, occurrences)).join('')}
        </div>
      `).join('')}
    </div>
  `
}

function renderNowLine() {
  const current = new Date()
  const minutes = current.getHours() * 60 + current.getMinutes()
  const top = Math.min(17 * 64, Math.max(0, (minutes - 360) / 60 * 64))
  return `<div class="calendar-now-line" style="--now-top:${top}px"><span>Now</span></div>`
}

function renderCalendarBlock(item: CalendarOccurrence, all: CalendarOccurrence[]) {
  if (item.source === 'google') return renderGoogleCalendarBlock(item, all)
  const { task, date } = item
  const start = timeToMinutes(task.time!)
  const duration = task.duration ?? 30
  const top = Math.max(0, (start - 360) / 60 * 64)
  const height = Math.max(28, duration / 60 * 64)
  const conflict = all.some(other =>
    other !== item && other.date === date && !calendarOccurrenceAllDay(other) &&
    rangesOverlap(start, start + duration, timeToMinutes(calendarOccurrenceTime(other)), timeToMinutes(calendarOccurrenceTime(other)) + calendarOccurrenceDuration(other))
  )
  return `
    <article class="calendar-event ${conflict ? 'conflict' : ''}" draggable="true" data-calendar-task="${escapeHtml(task.id)}" data-occurrence-date="${escapeHtml(date)}" style="--event-color:#8a9aad;--event-top:${top}px;--event-height:${height}px">
      <button data-action="edit-calendar-task" data-task-id="${escapeHtml(task.id)}">
        <strong>${escapeHtml(task.title)}</strong>
        <span>${formatTaskTime(task.time!)} · ${formatDuration(duration)}</span>
        ${task.location ? `<small>${escapeHtml(task.location)}</small>` : ''}
        ${renderCalendarDetailChips(task)}
      </button>
    </article>
  `
}

function renderGoogleCalendarBlock(item: GoogleCalendarOccurrence, all: CalendarOccurrence[]) {
  const { event, date, time, duration } = item
  const start = timeToMinutes(time)
  const top = Math.max(0, (start - 360) / 60 * 64)
  const height = Math.max(28, duration / 60 * 64)
  const conflict = !event.allDay && all.some(other =>
    other !== item && other.date === date && !calendarOccurrenceAllDay(other) &&
    rangesOverlap(start, start + duration, timeToMinutes(calendarOccurrenceTime(other)), timeToMinutes(calendarOccurrenceTime(other)) + calendarOccurrenceDuration(other))
  )
  const content = `<strong>${escapeHtml(event.title)}</strong><span>${event.allDay ? 'All day' : `${formatTaskTime(time)} · ${formatDuration(duration)}`}</span><small class="google-calendar-name">${escapeHtml(event.calendarName)}</small>${event.location ? `<small>${escapeHtml(event.location)}</small>` : ''}`
  return `
    <article class="calendar-event google-calendar-event ${conflict ? 'conflict' : ''}" data-google-event="${escapeHtml(event.googleEventId)}" style="--event-color:${escapeHtml(event.calendarColor)};--event-top:${top}px;--event-height:${height}px">
      ${event.htmlLink ? `<a href="${escapeHtml(event.htmlLink)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(event.title)} in Google Calendar">${content}</a>` : `<div>${content}</div>`}
    </article>
  `
}

function renderCalendarMonth(occurrences: CalendarOccurrence[]) {
  const dates = monthGridDates(calendarDate)
  const currentMonth = calendarDate.getMonth()
  return `
    <div class="calendar-month">
      ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `<div class="month-weekday">${day}</div>`).join('')}
      ${dates.map(date => {
        const day = new Date(`${date}T12:00:00`)
        const dayItems = occurrences.filter(item => item.date === date)
        return `<div class="month-day ${day.getMonth() !== currentMonth ? 'outside' : ''} ${date === todayKey ? 'today' : ''}" data-calendar-drop-date="${date}">
          <span class="month-day-number">${day.getDate()}</span>
          ${dayItems.slice(0, 3).map(item => {
            if (item.source === 'google') {
              const content = `${item.event.allDay ? '' : `${formatTaskTime(item.time)} `}${escapeHtml(item.event.title)}`
              return item.event.htmlLink
                ? `<a class="month-event google-month-event" href="${escapeHtml(item.event.htmlLink)}" target="_blank" rel="noreferrer" style="--event-color:${escapeHtml(item.event.calendarColor)}">${content}</a>`
                : `<span class="month-event google-month-event" style="--event-color:${escapeHtml(item.event.calendarColor)}">${content}</span>`
            }
            return `<button class="month-event" draggable="true" data-calendar-task="${escapeHtml(item.task.id)}" data-action="edit-calendar-task" data-task-id="${escapeHtml(item.task.id)}" style="--event-color:#8a9aad">${escapeHtml(item.task.title)}</button>`
          }).join('')}
          ${dayItems.length > 3 ? `<span class="month-more">+${dayItems.length - 3} more</span>` : ''}
        </div>`
      }).join('')}
    </div>
  `
}

function renderUnscheduledTask(task: Task) {
  return `<button class="unscheduled-task" draggable="true" data-calendar-task="${escapeHtml(task.id)}" data-action="schedule-task" data-task-id="${escapeHtml(task.id)}"><i style="--task-color:#8a9aad"></i><span>${escapeHtml(task.title)}</span>${task.due ? `<small>${formatTaskDate(task.due)}</small>` : ''}</button>`
}

function renderCalendarDetailChips(task: Task) {
  const chips = [
    task.recurrence && task.recurrence !== 'none' ? { label: formatRecurrence(task.recurrence), title: formatRecurrence(task.recurrence) } : null,
    task.reminder !== undefined ? { label: formatReminderChip(task.reminder), title: formatReminder(task.reminder) } : null,
    task.attendees ? { label: formatAttendeesChip(task.attendees), title: `With ${task.attendees}` } : null,
  ].filter(Boolean)
  return chips.length ? `<div class="calendar-event-chips">${chips.map(chip => `<small title="${escapeHtml(chip!.title)}">${escapeHtml(chip!.label)}</small>`).join('')}</div>` : ''
}

function renderCalendarComposer() {
  const editing = calendarComposer?.taskId ? tasks.find(task => task.id === calendarComposer?.taskId) : undefined
  const date = calendarComposer?.date ?? todayKey
  const time = calendarComposer?.time ?? '09:00'
  const formDate = editing?.time ? editing.due ?? date : date
  const reminder = editing?.reminder ?? 15
  return `
    <div class="calendar-composer-backdrop" data-action="close-calendar-composer"></div>
    <form class="calendar-composer" data-calendar-form data-editing-task="${editing?.id ?? ''}">
      <div class="calendar-composer-head"><div><strong>${editing ? 'Schedule task' : 'Task schedule'}</strong><span>Keep your tasks and deadlines visible.</span></div><button type="button" data-action="close-calendar-composer" aria-label="Close">×</button></div>
      <input class="calendar-composer-title" name="title" aria-label="Task" placeholder="Task" value="${escapeHtml(editing?.title ?? '')}" required />
      <div class="calendar-composer-row">
        <label><span>Date</span><input name="due" type="date" value="${formDate}" required /></label>
        <label><span>Start</span><input name="time" type="time" value="${editing?.time ?? time}" required /></label>
        <label><span>Duration</span><select name="duration">${[15, 30, 45, 60, 90, 120, 180].map(value => `<option value="${value}" ${value === (editing?.duration ?? 30) ? 'selected' : ''}>${formatDuration(value)}</option>`).join('')}</select></label>
      </div>
      <div class="calendar-composer-row">
        <label><span>Type</span><select name="kind"><option value="task" ${(editing?.kind ?? 'task') === 'task' ? 'selected' : ''}>Task</option><option value="event" ${editing?.kind === 'event' ? 'selected' : ''}>Event</option></select></label>
        <label><span>Repeat</span><select name="recurrence">${(['none', 'daily', 'weekdays', 'weekly', 'monthly'] as Recurrence[]).map(value => `<option value="${value}" ${value === (editing?.recurrence ?? 'none') ? 'selected' : ''}>${value[0]!.toUpperCase()}${value.slice(1)}</option>`).join('')}</select></label>
      </div>
      <div class="calendar-composer-row">
        <label><span>Reminder</span><select name="reminder">${[0, 5, 15, 30, 60].map(value => `<option value="${value}" ${value === reminder ? 'selected' : ''}>${formatReminder(value)}</option>`).join('')}</select></label>
        <label><span>Location</span><input name="location" value="${escapeHtml(editing?.location ?? '')}" placeholder="Optional" /></label>
        <label><span>People</span><input name="attendees" value="${escapeHtml(editing?.attendees ?? '')}" placeholder="Optional" /></label>
      </div>
      <div class="calendar-composer-actions">${editing ? '<button type="button" class="danger" data-action="unschedule-task">Remove time</button>' : '<span></span>'}<button type="button" data-action="close-calendar-composer">Cancel</button><button type="submit">Save</button></div>
    </form>
  `
}

function taskMatchesCalendarSearch(task: Task) {
  const query = calendarSearch.trim().toLowerCase()
  if (!query) return true
  return [task.title, task.description, task.location, task.attendees].some(value => value?.toLowerCase().includes(query))
}

function googleEventMatchesCalendarSearch(event: GoogleCalendarEvent) {
  const query = calendarSearch.trim().toLowerCase()
  if (!query) return true
  return [event.title, event.calendarName, event.location].some(value => value.toLowerCase().includes(query))
}

function calendarOccurrenceTime(item: CalendarOccurrence) {
  return item.source === 'google' ? item.time : item.task.time!
}

function calendarOccurrenceDuration(item: CalendarOccurrence) {
  return item.source === 'google' ? item.duration : item.task.duration ?? 30
}

function calendarOccurrenceAllDay(item: CalendarOccurrence) {
  return item.source === 'google' && item.event.allDay
}

function countCalendarConflicts(items: CalendarOccurrence[]) {
  return items.filter((item, index) => {
    if (calendarOccurrenceAllDay(item)) return false
    const start = timeToMinutes(calendarOccurrenceTime(item))
    return items.slice(0, index).some(other =>
      other.date === item.date && !calendarOccurrenceAllDay(other) &&
      rangesOverlap(start, start + calendarOccurrenceDuration(item), timeToMinutes(calendarOccurrenceTime(other)), timeToMinutes(calendarOccurrenceTime(other)) + calendarOccurrenceDuration(other))
    )
  }).length
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA
}

function timeToMinutes(time: string) {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function formatReminder(minutes: number) {
  if (minutes === 0) return 'At start'
  if (minutes === 60) return '1 hour before'
  return `${minutes} minutes before`
}

function formatReminderChip(minutes: number) {
  if (minutes === 0) return 'Start'
  if (minutes === 60) return '1h'
  return `${minutes}m`
}

function formatAttendeesChip(attendees: string) {
  const names = attendees.split(',').map(name => name.trim()).filter(Boolean)
  if (names.length <= 1) return names[0] ?? attendees
  return `${names[0]} +${names.length - 1}`
}

function formatRecurrence(recurrence: Recurrence) {
  const labels: Record<Recurrence, string> = {
    none: 'No repeat',
    daily: 'Daily',
    weekdays: 'Weekdays',
    weekly: 'Weekly',
    monthly: 'Monthly',
  }
  return labels[recurrence]
}

function selectedTask() {
  return tasks.find(task => task.id === selectedTaskId)
}

function persistInspectorDraft() {
  const task = selectedTask()
  if (!task) return
  const title = document.querySelector<HTMLInputElement>('.inspector-title')?.value?.trim()
  const description = document.querySelector<HTMLTextAreaElement>('.inspector textarea')?.value
  const due = document.querySelector<HTMLInputElement>('.inspector-date')?.value
  const time = document.querySelector<HTMLInputElement>('.inspector-time')?.value
  if (title) task.title = title
  if (description !== undefined) task.description = description
  if (due !== undefined) task.due = due || undefined
  if (time !== undefined) {
    task.time = time || undefined
    task.reminder = time ? task.reminder ?? DEFAULT_TASK_REMINDER_MINUTES : undefined
  }
  persistPlanner()
}

function refreshProgrammeShortlistAfterTaskSave(task: Task) {
  const run = agentRuns.get(task.id)
  if (
    !run ||
    run.status !== 'needs_context' ||
    !isApplicationProgrammeSelectionInteraction(run.contextInteraction) ||
    agentDecisionBusy.has(run.id)
  ) return

  agentDecisionBusy.add(run.id)
  render()
  void resumeAgentRun(run.id, 'The task instruction was saved. Re-check this exact objective, refresh the verified programme shortlist, and show the ranked options before asking me to choose.')
    .then(async updated => {
      agentRuns.set(task.id, updated)
      await syncAgentApproval(updated)
      toast = 'Programme options refreshed'
    })
    .catch(error => {
      toast = error instanceof Error ? error.message : 'Programme options could not be refreshed.'
    })
    .finally(() => {
      agentDecisionBusy.delete(run.id)
      persistAgentRuns()
      render()
      if (toast) clearAgentToast(toast)
    })
}

async function startDescriptionPcmCapture(stream: MediaStream) {
  const context = new AudioContext()
  await context.resume()
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  const sink = context.createGain()
  sink.gain.value = 0
  descriptionPcmChunks = []
  descriptionPcmSampleRate = context.sampleRate
  descriptionPcmPeak = 0
  processor.onaudioprocess = event => {
    const input = event.inputBuffer.getChannelData(0)
    const chunk = new Float32Array(input)
    for (const sample of chunk) descriptionPcmPeak = Math.max(descriptionPcmPeak, Math.abs(sample))
    descriptionPcmChunks.push(chunk)
  }
  source.connect(processor)
  processor.connect(sink)
  sink.connect(context.destination)
  descriptionAudioContext = context
  descriptionAudioSource = source
  descriptionAudioProcessor = processor
  descriptionAudioSink = sink
}

async function finishDescriptionPcmCapture() {
  descriptionAudioProcessor?.disconnect()
  descriptionAudioSource?.disconnect()
  descriptionAudioSink?.disconnect()
  if (descriptionAudioProcessor) descriptionAudioProcessor.onaudioprocess = null
  await descriptionAudioContext?.close().catch(() => undefined)
  descriptionAudioContext = null
  descriptionAudioSource = null
  descriptionAudioProcessor = null
  descriptionAudioSink = null
}

function descriptionPcmWav() {
  return pcmChunksToWav(descriptionPcmChunks, descriptionPcmSampleRate)
}

async function toggleDescriptionVoiceInput(requestedTargetId?: string) {
  const task = selectedTask()
  const targetId = requestedTargetId ?? task?.id
  if (!targetId) return
  if (descriptionRecorder) {
    if (
      descriptionRecordingTaskId === targetId
      && descriptionRecorder.state === 'recording'
      && !descriptionRecordingStopPending
    ) {
      descriptionRecordingStopPending = true
      // Flush audio still held by the encoder before stopping. Without this,
      // short recordings can arrive as a valid container containing no speech.
      descriptionRecorder.requestData()
      window.setTimeout(() => {
        if (descriptionRecorder?.state === 'recording') descriptionRecorder.stop()
      }, 120)
    }
    return
  }
  // Keep typed text before a recording-state render replaces the inspector DOM.
  if (targetId === 'today-composer') captureTodayComposerDraft()
  else persistInspectorDraft()
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    toast = 'Voice input is not available in this browser.'
    render()
    return
  }
  let pendingStream: MediaStream | null = null
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    pendingStream = stream
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128_000 })
      : new MediaRecorder(stream, { audioBitsPerSecond: 128_000 })
    const chunks: Blob[] = []
    // The task-inspector mic can use the PCM path, but the Today composer is
    // sometimes rendered inside a focus-trapping sheet where a second audio
    // context is rejected. Recording itself remains valid, so fall back to
    // the native stream instead of abandoning the mic button.
    await startDescriptionPcmCapture(stream).catch(() => {
      descriptionPcmChunks = []
      descriptionPcmSampleRate = 0
      descriptionPcmPeak = 0
    })
    descriptionRecorder = recorder
    descriptionRecordingTaskId = targetId
    descriptionRecordingStartedAt = Date.now()
    descriptionRecordingStopPending = false
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data) })
    recorder.addEventListener('stop', () => void finishDescriptionVoiceInput(targetId, stream, chunks, recorder.mimeType))
    // Periodic chunks make short dictation reliable across Chromium and WebKit.
    recorder.start(250)
    // The stop handler now owns the live tracks.
    pendingStream = null
    void prepareDescriptionTranscription()
    descriptionRecordingTimer = window.setTimeout(() => {
      toast = 'Recording stopped after two minutes.'
      if (recorder.state === 'recording') recorder.stop()
    }, MAX_DESCRIPTION_RECORDING_MS)
    render()
  } catch (error) {
    pendingStream?.getTracks().forEach(track => track.stop())
    await finishDescriptionPcmCapture()
    descriptionPcmChunks = []
    descriptionPcmSampleRate = 0
    descriptionPcmPeak = 0
    descriptionRecorder = null
    descriptionRecordingTaskId = null
    descriptionRecordingStartedAt = 0
    descriptionRecordingStopPending = false
    toast = error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'Microphone access is needed for voice input.'
      : 'We could not start the microphone. Try again or type your description.'
    render()
  }
}

async function finishDescriptionVoiceInput(taskId: string, stream: MediaStream, chunks: Blob[], mimeType: string) {
  const recordingDuration = Date.now() - descriptionRecordingStartedAt
  await finishDescriptionPcmCapture()
  stream.getTracks().forEach(track => track.stop())
  if (descriptionRecordingTimer !== undefined) window.clearTimeout(descriptionRecordingTimer)
  descriptionRecordingTimer = undefined
  descriptionRecorder = null
  descriptionRecordingTaskId = null
  descriptionRecordingStartedAt = 0
  descriptionRecordingStopPending = false
  if (recordingDuration < 600) {
    toast = 'Keep the microphone on while you speak, then tap it again to finish.'
    render()
    return
  }
  const pcmAudio = descriptionPcmChunks.length && descriptionPcmPeak >= 0.0005
    ? descriptionPcmWav()
    : null
  descriptionPcmChunks = []
  descriptionPcmSampleRate = 0
  descriptionPcmPeak = 0
  if (!pcmAudio && !chunks.length) {
    toast = 'No audio was captured. Please try again.'
    render()
    return
  }
  // Preserve the afternoon PCM path when it contains speech, but use the
  // browser's recorded stream if embedded WebKit/Chromium reports a false
  // silent PCM signal. This keeps voice input working in the live app.
  const audio = pcmAudio ?? new Blob(chunks, { type: mimeType || chunks[0]?.type || 'audio/webm' })
  if (!audio.size) {
    toast = 'No audio was captured. Please try again.'
    render()
    return
  }
  descriptionTranscribingTaskId = taskId
  render()
  try {
    const transcript = await transcribeDescriptionAudio(audio)
    const task = tasks.find(item => item.id === taskId)
    if (task) {
      task.description = appendTranscript(task.description ?? '', transcript)
      persistPlanner()
    } else if (taskId === 'today-composer') {
      todayComposerDraft.description = appendTranscript(todayComposerDraft.description, transcript)
    }
    descriptionTranscribingTaskId = null
    render()
    queueMicrotask(() => {
      const field = document.querySelector<HTMLTextAreaElement>(taskId === 'today-composer' ? '[data-today-form] textarea[name="description"]' : '.inspector-description')
      field?.focus()
      field?.setSelectionRange(field.value.length, field.value.length)
    })
  } catch (error) {
    descriptionTranscribingTaskId = null
    toast = error instanceof Error ? error.message : 'Transcription failed. Please try again.'
    render()
  }
}

function openCalendarComposer(date = calendarDateKey(), time = '09:00', taskId?: string) {
  if (!taskId) return
  calendarComposer = { date, time, taskId }
  render()
  document.querySelector<HTMLInputElement>('[data-calendar-form] input[name="title"]')?.focus()
}

function saveCalendarForm(form: HTMLFormElement) {
  const data = new FormData(form)
  const editingId = form.dataset.editingTask
  const title = String(data.get('title') ?? '').trim()
  const due = String(data.get('due') ?? '').trim()
  const time = String(data.get('time') ?? '').trim()
  if (!title || !due || !time) return
  const task = editingId ? tasks.find(item => item.id === editingId) : undefined
  const patch: Partial<Task> = {
    title,
    due,
    time,
    duration: Number(data.get('duration') ?? 30),
    kind: String(data.get('kind') ?? 'task') as PlannerKind,
    recurrence: String(data.get('recurrence') ?? 'none') as Recurrence,
    reminder: Number(data.get('reminder') ?? 15),
    location: String(data.get('location') ?? '').trim() || undefined,
    attendees: String(data.get('attendees') ?? '').trim() || undefined,
  }
  if (task) {
    Object.assign(task, patch)
    selectedTaskId = task.id
  } else return
  calendarComposer = null
  persistPlanner()
  refreshCounts()
  triggerHaptic([35, 30, 60])
  toast = 'Schedule updated'
  render()
  window.setTimeout(() => {
    toast = ''
    render()
  }, 1400)
}

function scheduleTask(taskId: string, date: string, time = '09:00') {
  const task = tasks.find(item => item.id === taskId)
  if (!task) return
  task.due = date
  task.time = time
  task.reminder = task.reminder ?? DEFAULT_TASK_REMINDER_MINUTES
  task.duration = task.duration ?? 30
  task.recurrence = task.recurrence ?? 'none'
  selectedTaskId = task.id
  persistPlanner()
  triggerHaptic([45, 25, 70])
  toast = `Scheduled for ${formatTaskDate(date)}`
  render()
  window.setTimeout(() => {
    toast = ''
    render()
  }, 1400)
}

app.addEventListener('submit', async event => {
  const target = event.target as HTMLElement
  const profileForm = target.closest<HTMLFormElement>('[data-profile-form]')
  if (profileForm) {
    event.preventDefault()
    captureProfileDraft(profileForm)
    if (!activeUser) {
      profileError = 'Sign in to save your profile.'
      render()
      return
    }
    profileBusy = true
    profileError = ''
    render()
    try {
      if (profilePhotoFile) profileDraft.avatarUrl = await uploadProfilePhoto(activeUser, profilePhotoFile)
      userProfile = await saveProfile(activeUser, profileDraft)
      profileDraft = profileInput(userProfile)
      profileModalOpen = false
      profileBusy = false
      clearProfilePhotoPreview()
      toast = 'Settings saved'
      render()
      window.setTimeout(() => {
        toast = ''
        render()
      }, 1400)
    } catch (error) {
      profileBusy = false
      profileError = error instanceof Error ? error.message : 'Your profile could not be saved.'
      render()
    }
    return
  }

  const todayForm = target.closest<HTMLFormElement>('[data-today-form]')
  if (todayForm) {
    event.preventDefault()
    const data = new FormData(todayForm)
    const title = String(data.get('title') ?? '').trim()
    const due = String(data.get('due') ?? todayKey).trim()
    const time = String(data.get('time') ?? '').trim()
    if (!title || !due) return
    const attachment = todayComposerAttachment
    const newTask = normalizeTask({
      id: crypto.randomUUID(),
      title,
      description: String(data.get('description') ?? '').trim(),
      due,
      time: time || undefined,
      reminder: time ? DEFAULT_TASK_REMINDER_MINUTES : undefined,
      subtaskItems: [],
    })
    tasks.unshift(newTask)
    selectedTaskId = newTask.id
    todayComposerOpen = false
    resetTodayComposerDraft()
    persistPlanner()
    refreshCounts()
    triggerHaptic([35, 30, 60])
    toast = due === todayKey
      ? 'Task added to today'
      : due === tomorrowKey
        ? 'Task scheduled for tomorrow'
        : `Task scheduled for ${formatTaskDate(due)}`
    render()
    if (attachment) {
      taskFileAssetBusy.add(newTask.id)
      render()
      void uploadTaskFileAsset(newTask.id, attachment).then(asset => {
        taskFileAssets.set(newTask.id, [asset])
        toast = `${asset.originalFilename} attached`
        if (isApplicationIntent(newTask.title, newTask.description)) void startAgentRun(newTask)
      }).catch(error => {
        toast = error instanceof Error ? error.message : 'The attachment could not be uploaded.'
      }).finally(() => {
        taskFileAssetBusy.delete(newTask.id)
        render()
      })
    }
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
    return
  }

  const subtaskForm = target.closest<HTMLFormElement>('[data-subtask-form]')
  if (subtaskForm) {
    event.preventDefault()
    persistInspectorDraft()
    const task = tasks.find(item => item.id === subtaskForm.dataset.subtaskForm)
    const title = String(new FormData(subtaskForm).get('title') ?? '').trim()
    if (!task || !title) return
    const timestamp = new Date().toISOString()
    task.subtaskItems = [
      ...(task.subtaskItems ?? []),
      { id: crypto.randomUUID(), title, completed: false, createdAt: timestamp, updatedAt: timestamp },
    ]
    task.subtasks = task.subtaskItems.length
    subtaskComposerTaskId = null
    persistPlanner()
    toast = 'Subtask added'
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
    return
  }

  const subtaskEditForm = target.closest<HTMLFormElement>('[data-subtask-edit-form]')
  if (subtaskEditForm) {
    event.preventDefault()
    const task = tasks.find(item => item.id === subtaskEditForm.dataset.subtaskEditForm)
    const subtask = task?.subtaskItems?.find(item => item.id === subtaskEditForm.dataset.subtaskId)
    const title = String(new FormData(subtaskEditForm).get('title') ?? '').trim()
    if (!task || !subtask || !title) return
    persistInspectorDraft()
    subtask.title = title
    subtask.updatedAt = new Date().toISOString()
    editingSubtaskId = null
    persistPlanner()
    toast = 'Subtask updated'
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
    return
  }

  const calendarForm = target.closest<HTMLFormElement>('[data-calendar-form]')
  if (calendarForm) {
    event.preventDefault()
    saveCalendarForm(calendarForm)
    return
  }

  const plannerForm = target.closest<HTMLFormElement>('[data-planner-form]')
  if (plannerForm) {
    event.preventDefault()
    const group = plannerForm.dataset.plannerForm as UpcomingGroup
    const data = new FormData(plannerForm)
    const title = String(data.get('title') ?? '').trim()
    const due = group === 'tomorrow' ? tomorrowKey : String(data.get('due') ?? '').trim()
    const time = String(data.get('time') ?? '').trim()
    if (!title || !due) return
    tasks.unshift(normalizeTask({
      id: crypto.randomUUID(),
      title,
      due,
      time: time || undefined,
      reminder: time ? DEFAULT_TASK_REMINDER_MINUTES : undefined,
      subtaskItems: [],
    }))
    persistPlanner()
    triggerHaptic([35, 30, 60])
    plannerDraftGroup = null
    refreshCounts()
    toast = group === 'tomorrow' ? 'Added to tomorrow' : `Added for ${formatTaskDate(due)}`
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
    return
  }

})

app.addEventListener('input', event => {
  const target = event.target as HTMLElement
  if (target.closest('[data-today-form]')) {
    captureTodayComposerDraft()
    return
  }
  const agentContextInput = target.closest<HTMLInputElement | HTMLTextAreaElement>('[data-agent-context-input]')
  if (agentContextInput) {
    const runId = agentContextInput.dataset.runId
    if (runId) roonContextDrafts.set(runId, agentContextInput.value)
    return
  }
  if (target.closest('[data-profile-form]')) {
    captureProfileDraft()
    return
  }
  const calendarInput = target.closest<HTMLInputElement>('[data-calendar-search]')
  if (calendarInput) {
    const cursor = calendarInput.selectionStart ?? calendarInput.value.length
    calendarSearch = calendarInput.value
    render()
    const nextInput = document.querySelector<HTMLInputElement>('[data-calendar-search]')
    nextInput?.focus()
    nextInput?.setSelectionRange(cursor, cursor)
  }
})

app.addEventListener('focusout', event => {
  const target = event.target as HTMLElement
  if (target.closest('.inspector-title, .inspector-description, .inspector-date, .inspector-time')) {
    persistInspectorDraft()
  }
})

app.addEventListener('change', event => {
  if ((event.target as HTMLElement).closest('[data-today-form]')) captureTodayComposerDraft()
  const programmeChoice = (event.target as HTMLElement).closest<HTMLInputElement>('.application-shortlist-option-input')
  if (programmeChoice) {
    const panel = programmeChoice.closest<HTMLElement>('.recommendation-progress-detail--application')
    const interactionId = panel?.dataset.recommendationInteractionId
    if (interactionId && programmeChoice.checked) programmeSelectionDrafts.set(interactionId, programmeChoice.dataset.interactionValue ?? '')
    const submit = panel?.querySelector<HTMLButtonElement>('[data-action="submit-recommendation-single"]')
    if (submit) submit.disabled = !panel?.querySelector<HTMLInputElement>('.application-shortlist-option-input:checked')
    return
  }
  const todayTaskFileInput = (event.target as HTMLElement).closest<HTMLInputElement>('[data-today-task-file]')
  if (todayTaskFileInput) {
    const file = todayTaskFileInput.files?.[0]
    if (!file) return
    captureTodayComposerDraft()
    if (!acceptedTaskFileTypes.includes(file.type as typeof acceptedTaskFileTypes[number])) {
      toast = 'Choose a PNG, JPEG, PDF, DOCX, TXT, ZIP, or notebook file.'
      render()
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      toast = 'Attachments must be 20 MB or smaller.'
      render()
      return
    }
    todayComposerAttachment = file
    render()
    return
  }
  const recommendationFileInput = (event.target as HTMLElement).closest<HTMLInputElement>('[data-recommendation-file]')
  if (recommendationFileInput) {
    const taskId = recommendationFileInput.dataset.taskId
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const run = task ? agentRuns.get(task.id) : null
    const interaction = run?.contextInteraction
    const files = [...(recommendationFileInput.files ?? [])]
    if (!task || !run || !interaction || interaction.kind !== 'attachment_request' || !files.length || taskFileAssetBusy.has(task.id)) return
    taskFileAssetBusy.add(task.id)
    render()
    void Promise.all(files.slice(0, interaction.maximumFiles ?? 1).map(file => uploadTaskFileAsset(task.id, file)))
      .then(assets => {
        const current = taskFileAssets.get(task.id) ?? []
        const merged = [...current, ...assets.filter(asset => !current.some(item => item.id === asset.id))]
        taskFileAssets.set(task.id, merged)
        submitRecommendationInteraction(task, interaction, assets.map(asset => asset.id))
      })
      .catch(error => {
        toast = error instanceof Error ? error.message : 'The requested file could not be attached.'
      })
      .finally(() => {
        taskFileAssetBusy.delete(task.id)
        render()
      })
    return
  }
  const applicationPendingFileInput = (event.target as HTMLElement).closest<HTMLInputElement>('[data-application-pending-file]')
  if (applicationPendingFileInput) {
    const taskId = applicationPendingFileInput.dataset.taskId
    const requirementId = applicationPendingFileInput.dataset.requirementId
    const disposition = applicationPendingFileInput.dataset.applicationDisposition as ApplicationAvailabilityDisposition | undefined
    const file = applicationPendingFileInput.files?.[0]
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const run = task ? agentRuns.get(task.id) : null
    if (!task || !run || !requirementId || !disposition || !file || taskFileAssetBusy.has(task.id)) return
    taskFileAssetBusy.add(task.id)
    render()
    void uploadTaskFileAsset(task.id, file).then(asset => {
      const assets = taskFileAssets.get(task.id) ?? []
      if (!assets.some(item => item.id === asset.id)) taskFileAssets.set(task.id, [...assets, asset])
      submitApplicationPendingChoice(task, run, requirementId, disposition, { asset_id: asset.id })
      toast = `${asset.originalFilename} attached — I’m checking it now`
    }).catch(error => {
      toast = error instanceof Error ? error.message : 'The file could not be attached.'
    }).finally(() => {
      taskFileAssetBusy.delete(task.id)
      persistAgentRuns()
      render()
    })
    return
  }
  const taskFileInput = (event.target as HTMLElement).closest<HTMLInputElement>('[data-task-file-input]')
  if (taskFileInput) {
    persistInspectorDraft()
    const taskId = taskFileInput.dataset.taskFileInput
    const file = taskFileInput.files?.[0]
    if (!taskId || !file || taskFileAssetBusy.has(taskId)) return
    taskFileAssetBusy.add(taskId)
    render()
    void uploadTaskFileAsset(taskId, file).then(asset => {
      const assets = taskFileAssets.get(taskId) ?? []
      if (!assets.some(item => item.id === asset.id)) taskFileAssets.set(taskId, [...assets, asset])
      toast = `${asset.originalFilename} attached`
      const task = tasks.find(item => item.id === taskId)
      if (task && isApplicationIntent(task.title, task.description)) {
        const existingRun = agentRuns.get(task.id)
        if (!existingRun) {
          void startAgentRun(task)
        } else if (existingRun.applicationState?.pendingInputs?.some(item => item.kind === 'document') && ['planning', 'running', 'waiting_for_user'].includes(existingRun.status)) {
          const pendingDocument = existingRun.applicationState.pendingInputs.find(item => item.kind === 'document')
          if (pendingDocument) {
            agentDecisionBusy.add(existingRun.id)
            void updateApplicationRequirementAvailability(existingRun.id, pendingDocument.requirementId, 'have_now')
              .then(updated => {
                agentRuns.set(task.id, updated)
                toast = `${asset.originalFilename} attached — I’m checking it now`
              })
              .catch(error => {
                toast = error instanceof Error ? error.message : 'The application could not use this attachment yet.'
              })
              .finally(() => {
                agentDecisionBusy.delete(existingRun.id)
                persistAgentRuns()
                render()
              })
          }
        } else if (existingRun.status === 'needs_context') {
          void startAgentRun(task, roonContinuationContext(task, 'A new attachment was added. Use it as the requested context and continue the application workflow.'))
        }
      } else if (task && agentRuns.get(task.id)?.status === 'needs_context') {
        void startAgentRun(task, roonContinuationContext(task, 'A new attachment was added. Inspect it as the requested context and continue only if it resolves the missing information.'))
      }
    }).catch(error => {
      toast = error instanceof Error ? error.message : 'The file could not be attached.'
    }).finally(() => {
      taskFileAssetBusy.delete(taskId)
      render()
    })
    return
  }
  const profilePhoto = (event.target as HTMLElement).closest<HTMLInputElement>('[data-profile-photo]')
  if (profilePhoto) {
    captureProfileDraft()
    const file = profilePhoto.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 3 * 1024 * 1024) {
      profileError = file.size > 3 * 1024 * 1024 ? 'Choose an image smaller than 3 MB.' : 'Choose an image file.'
      render()
      return
    }
    clearProfilePhotoPreview()
    profilePhotoFile = file
    profilePhotoPreview = URL.createObjectURL(file)
    profileError = ''
    render()
    return
  }
  if ((event.target as HTMLElement).closest('[data-profile-form]')) {
    captureProfileDraft()
    return
  }
})

app.addEventListener('click', async event => {
  const target = event.target as HTMLElement
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
  if (action === 'plan-tomorrow') {
    dailyPlanningPrompt = null
    rememberView('upcoming')
    plannerDraftGroup = 'tomorrow'
    render()
    queueMicrotask(() => document.querySelector<HTMLInputElement>('[data-planner-form="tomorrow"] input[name="title"]')?.focus())
    return
  }
  if (action === 'plan-today') {
    dailyPlanningPrompt = null
    rememberView('today')
    resetTodayComposerDraft()
    todayComposerOpen = true
    render()
    queueMicrotask(() => document.querySelector<HTMLInputElement>('[data-today-form] input[name="title"]')?.focus())
    return
  }
  if (action === 'dismiss-daily-plan') {
    dailyPlanningPrompt = null
    render()
    return
  }
  const subtaskId = target.closest<HTMLInputElement>('[data-subtask]')?.dataset.subtask
  if (subtaskId) {
    const task = selectedTask()
    const subtask = task?.subtaskItems?.find(item => item.id === subtaskId)
    if (subtask) subtask.completed = !subtask.completed
    persistPlanner()
    render()
    return
  }

  const completedTaskId = target.closest<HTMLElement>('[data-complete]')?.dataset.complete
  if (completedTaskId) {
    const task = tasks.find(item => item.id === completedTaskId)
    const wasCompleted = completedTaskIds.has(completedTaskId)
    if (wasCompleted) {
      completedTaskIds.delete(completedTaskId)
      if (task) task.completedAt = undefined
    } else {
      completedTaskIds.add(completedTaskId)
      if (task) task.completedAt = new Date().toISOString()
      triggerHaptic(65)
    }
    persistPlanner()
    refreshCounts()
    render()
    return
  }

  const nextView = target.closest<HTMLElement>('[data-view]')?.dataset.view as View | undefined
  if (nextView) {
    persistInspectorDraft()
    mobileInspectorOpen = false
    if (nextView !== 'calendar') {
      calendarComposer = null
    }
    rememberView(nextView)
    const nextUrl = new URL(window.location.href)
    const nextPathname = nextView === 'upcoming' ? '/app/upcoming' : nextView === 'calendar' ? '/app/calendar' : '/app'
    if (nextUrl.pathname !== nextPathname) {
      nextUrl.pathname = nextPathname
      window.history.pushState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
    }
    render()
    if (nextView === 'calendar') void populateGoogleCalendarForExistingUser()
    return
  }


  const agentIslandTaskId = target.closest<HTMLElement>('[data-agent-island-task]')?.dataset.agentIslandTask
  if (agentIslandTaskId) {
    const task = tasks.find(item => item.id === agentIslandTaskId)
    if (!task) return
    selectedTaskId = task.id
    mobileInspectorOpen = true
    rememberView(tasksForToday().some(item => item.id === task.id) ? 'today' : 'upcoming')
    render()
    return
  }

  const taskId = target.closest<HTMLElement>('[data-task]')?.dataset.task
  if (taskId) {
    persistInspectorDraft()
    selectedTaskId = taskId
    mobileInspectorOpen = true
    render()
    return
  }

  const nextActivityMode = target.closest<HTMLElement>('[data-activity-mode]')?.dataset.activityMode as ActivityMode | undefined
  if (nextActivityMode) {
    if (nextActivityMode === activityMode) return
    renderWithMotion(() => {
      activityMode = nextActivityMode
      render()
    })
    return
  }

  const nextCalendarMode = target.closest<HTMLElement>('[data-calendar-mode]')?.dataset.calendarMode as CalendarMode | undefined
  if (nextCalendarMode) {
    calendarMode = nextCalendarMode
    render()
    return
  }

  if (action === 'connect-google-calendar') {
    void beginGoogleCalendarConnection()
    return
  }

  if (action === 'connect-agent-google') {
    void connectGoogleAgent()
    return
  }

  if (action === 'delegate-task') {
    persistInspectorDraft()
    const task = tasks.find(item => item.id === target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId)
    if (task && taskIsExecutableToday(task)) void startAgentRun(task)
    return
  }

  if (action === 'remove-task-attachment') {
    const control = target.closest<HTMLElement>('[data-file-asset-id]')
    const taskId = control?.dataset.taskId
    const assetId = control?.dataset.fileAssetId
    if (!taskId || !assetId || taskFileAssetBusy.has(taskId)) return
    taskFileAssetBusy.add(taskId)
    render()
    void removeTaskFileAsset(assetId).then(() => {
      taskFileAssets.set(taskId, (taskFileAssets.get(taskId) ?? []).filter(asset => asset.id !== assetId))
      toast = 'Attachment removed'
    }).catch(error => {
      toast = error instanceof Error ? error.message : 'The attachment could not be removed.'
    }).finally(() => {
      taskFileAssetBusy.delete(taskId)
      render()
    })
    return
  }

  if (action === 'preview-task-file' || action === 'preview-progress-file') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const assetId = target.closest<HTMLElement>('[data-file-asset-id]')?.dataset.fileAssetId
    const asset = taskId && assetId ? (taskFileAssets.get(taskId) ?? []).find(item => item.id === assetId) : undefined
    if (!asset) return
    const placement = action === 'preview-progress-file' ? 'progress' as const : 'modal' as const
    if (filePreview?.url?.startsWith('blob:')) URL.revokeObjectURL(filePreview.url)
    filePreview = { asset, url: null, placement, loading: true }
    render()
    void (async () => {
      let url = ''
      try {
        // A signed URL lets desktop browsers and iOS hand the file to their
        // native viewer without depending on blob iframe support.
        url = await createTaskFileAssetViewUrl(asset)
      } catch {
        // Keep a blob fallback for an older storage configuration that cannot
        // create signed URLs yet. The CSP explicitly permits this preview.
        const blob = await downloadTaskFileAsset(asset)
        url = URL.createObjectURL(blob)
      }
      if (filePreview?.asset.id !== asset.id || filePreview.placement !== placement) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
        return
      }
      filePreview = {
        asset,
        url,
        placement,
        ...(asset.mimeType.includes('wordprocessingml')
          ? { message: 'Open this document in Word or Pages. iOS will hand it to the app you choose.' }
          : {}),
      }
      render()
    })().catch(error => {
      if (filePreview?.asset.id === asset.id && filePreview.placement === placement) {
        filePreview = { asset, url: null, placement, message: error instanceof Error ? error.message : 'The file could not be previewed.' }
        render()
      }
    })
    return
  }

  if (action === 'close-file-preview') {
    if (filePreview?.url?.startsWith('blob:')) URL.revokeObjectURL(filePreview.url)
    filePreview = null
    render()
    return
  }

  if (action === 'toggle-file-reusable') {
    const input = target.closest<HTMLInputElement>('[data-file-asset-id]')
    const taskId = input?.dataset.taskId
    const assetId = input?.dataset.fileAssetId
    if (!taskId || !assetId || taskFileAssetBusy.has(taskId)) return
    taskFileAssetBusy.add(taskId)
    void setFileAssetReusable(assetId, input.checked).then(() => {
      const asset = (taskFileAssets.get(taskId) ?? []).find(item => item.id === assetId)
      if (asset) asset.reusable = input.checked
      const task = tasks.find(item => item.id === taskId)
      toast = input.checked ? `Available to ${task ? specialistName(task, agentRuns.get(task.id)) : 'ShotCount'} for future tasks` : 'File limited to this task'
    }).catch(error => {
      input.checked = !input.checked
      toast = error instanceof Error ? error.message : 'The file setting could not be changed.'
    }).finally(() => {
      taskFileAssetBusy.delete(taskId)
      render()
    })
    return
  }

  if (action === 'submit-agent-context') {
    const task = tasks.find(item => item.id === target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId)
    const panel = target.closest<HTMLElement>('.task-agent-card')
    const input = panel?.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-agent-context-input]')
    const context = input?.value.trim() ?? ''
    if (!task || !context) {
      input?.focus()
      return
    }
    const run = agentRuns.get(task.id)
    if (run) roonContextDrafts.delete(run.id)
    void startAgentRun(task, context)
    return
  }

  if (action === 'submit-recommendation-interaction') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const run = task ? agentRuns.get(task.id) : null
    const interaction = run?.contextInteraction
    if (!task || !interaction) return
    const optionValue = target.closest<HTMLElement>('[data-interaction-value]')?.dataset.interactionValue
    const input = target.closest<HTMLElement>('[data-progress-detail], .recommendation-progress-detail')?.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-recommendation-input], [data-application-question-input]')
    const value = optionValue ?? input?.value.trim() ?? ''
    if (!value) {
      input?.focus()
      return
    }
    submitRecommendationInteraction(task, interaction, interaction.kind === 'date' ? value : value)
    return
  }

  if (action === 'submit-recommendation-multiple') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const run = task ? agentRuns.get(task.id) : null
    const interaction = run?.contextInteraction
    const panel = target.closest<HTMLElement>('[data-progress-detail], .recommendation-progress-detail')
    const values = [...(panel?.querySelectorAll<HTMLInputElement>('[data-recommendation-choice]:checked') ?? [])].map(input => input.dataset.interactionValue).filter((value): value is string => Boolean(value))
    const typedWorkSample = isWorkSampleProgressInteraction(interaction)
    if (task && ((isRecommendationMultipleChoiceInteraction(interaction) && values.length >= interaction.minSelections) || (typedWorkSample && interaction.kind === 'multiple_choice' && values.length >= (interaction.minSelections ?? 1)))) submitRecommendationInteraction(task, interaction, values)
    return
  }

  if (action === 'submit-recommendation-single') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const run = task ? agentRuns.get(task.id) : null
    const interaction = run?.contextInteraction
    const panel = target.closest<HTMLElement>('[data-progress-detail], .recommendation-progress-detail')
    const interactionId = panel?.dataset.recommendationInteractionId ?? interaction?.id ?? ''
    const selected = panel?.querySelector<HTMLInputElement>('[data-recommendation-choice]:checked')?.dataset.interactionValue ?? programmeSelectionDrafts.get(interactionId) ?? ''
    if (task && interaction && isApplicationProgrammeSelectionInteraction(interaction) && selected) {
      programmeSelectionDrafts.delete(interactionId)
      submitRecommendationInteraction(task, interaction, selected)
    }
    return
  }

  if (action === 'application-pending-choice') {
    const control = target.closest<HTMLElement>('[data-requirement-id]')
    const taskId = control?.dataset.taskId
    const requirementId = control?.dataset.requirementId
    const disposition = control?.dataset.applicationDisposition as (ApplicationAvailabilityDisposition | 'have_document') | undefined
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const run = taskId ? agentRuns.get(taskId) : null
    if (!task || !run || !requirementId || !disposition || agentDecisionBusy.has(run.id)) return
    if (disposition === 'have_now' || disposition === 'have_document' || disposition === 'attach_score') {
      const fileInput = [...(control.closest<HTMLElement>('.task-agent-card')?.querySelectorAll<HTMLInputElement>('[data-application-pending-file]') ?? [])]
        .find(input => input.dataset.requirementId === requirementId && input.dataset.applicationDisposition === (disposition === 'have_document' ? 'have_now' : disposition))
      fileInput?.click()
      return
    }
    submitApplicationPendingChoice(task, run, requirementId, disposition)
    return
  }

  if (action === 'submit-application-pending-input') {
    const control = target.closest<HTMLElement>('[data-requirement-id]')
    const taskId = control?.dataset.taskId
    const requirementId = control?.dataset.requirementId
    const disposition = control?.dataset.applicationDisposition as ApplicationAvailabilityDisposition | undefined
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const run = taskId ? agentRuns.get(taskId) : null
    if (!task || !run || !requirementId || !disposition || agentDecisionBusy.has(run.id)) return
    const panel = control.closest<HTMLElement>('.task-agent-pending-input')
    const values = Object.fromEntries([...panel?.querySelectorAll<HTMLInputElement>('[data-application-pending-field]') ?? []].map(input => [input.dataset.applicationPendingField ?? '', input.value.trim()]).filter(([key]) => key))
    const missingInput = [...panel?.querySelectorAll<HTMLInputElement>('[data-application-pending-field]') ?? []].find(input => input.required && !input.value.trim())
    if (missingInput) {
      missingInput.focus()
      return
    }
    submitApplicationPendingChoice(task, run, requirementId, disposition, values)
    return
  }

  if (action === 'focus-task-description') {
    const description = document.querySelector<HTMLTextAreaElement>('.inspector textarea[aria-label="Description"]')
    description?.focus()
    description?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return
  }

  if (action === 'use-attached-cv') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    if (task) void startAgentRun(task, roonContinuationContext(task, 'The user confirms that the attached PDF is their real CV. Use it as authorised applicant context and continue the application workflow.'))
    return
  }

  if (action === 'check-attached-context') {
    persistInspectorDraft()
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const panel = target.closest<HTMLElement>('.task-agent-card')
    const note = panel?.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-agent-context-input]')?.value.trim()
    if (task) {
      const run = agentRuns.get(task.id)
      if (run) roonContextDrafts.delete(run.id)
      const attachmentContext = note
        ? `The user added this note about the requested attachment: ${note}\n\nInspect the task attachments, use any relevant evidence, and continue only if it resolves the missing context.`
        : 'The user has added the requested attachment. Inspect the task attachments, use any relevant evidence, and continue only if it resolves the missing context.'
      void startAgentRun(task, roonContinuationContext(task, attachmentContext))
    }
    return
  }

  if (action === 'toggle-description-voice') {
    void toggleDescriptionVoiceInput()
    return
  }

  if (action === 'toggle-today-description-voice') {
    void toggleDescriptionVoiceInput('today-composer')
    return
  }

  if (action === 'approve-agent-approval' || action === 'reject-agent-approval') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    if (taskId) {
      void decidePendingAgentApproval(taskId, action === 'approve-agent-approval' ? 'approve' : 'reject')
    }
    return
  }

  if (action === 'undo-email-send') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const run = taskId ? agentRuns.get(taskId) : null
    const approval = run ? agentApprovals.get(run.id) : null
    const pending = approval ? pendingEmailSends.get(approval.id) : null
    if (pending && approval) {
      pendingEmailSends.delete(approval.id)
      pending(false)
      toast = 'Send cancelled'
      render()
      clearAgentToast(toast)
    }
    return
  }

  if (action === 'select-agent-recipient') {
    const control = target.closest<HTMLElement>('[data-recipient-email]')
    const taskId = control?.dataset.taskId
    const recipientEmail = control?.dataset.recipientEmail
    if (taskId && recipientEmail) void chooseAgentRecipient(taskId, recipientEmail)
    return
  }

  if (action === 'select-agent-schedule-option') {
    const control = target.closest<HTMLElement>('[data-schedule-option]')
    const taskId = control?.dataset.taskId
    const option = control?.dataset.scheduleOption
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    if (task && option) void startAgentRun(task, option)
    return
  }

  if (action === 'retry-agent') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    if (taskId) void retryAgentRun(taskId)
    return
  }

  if (action === 'refresh-application-interaction') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const run = taskId ? agentRuns.get(taskId) : null
    if (task && run && !agentDecisionBusy.has(run.id)) {
      void startAgentRun(task, 'The current typed application decision has no supported options. Re-check the verified programme requirements and repair the application plan without asking me to choose an unspecified value.')
    }
    return
  }

  if (action === 'poll-agent') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const run = taskId ? agentRuns.get(taskId) : null
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    if (!taskId || !run || agentDecisionBusy.has(run.id)) return
    agentDecisionBusy.add(run.id)
    render()
    void pollAgentRun(run.id).then(updated => {
      agentRuns.set(taskId, updated)
      void syncAgentApproval(updated).then(() => render())
      toast = updated.status === 'waiting_external'
        ? `Still waiting — ${task ? specialistName(task, updated) : 'ShotCount'} will keep checking`
        : `${task ? specialistName(task, updated) : 'ShotCount'} continued the task`
    }).catch(error => {
      toast = error instanceof Error ? error.message : `${task ? specialistName(task, run) : 'ShotCount'} could not check the external work.`
    }).finally(() => {
      agentDecisionBusy.delete(run.id)
      persistAgentRuns()
      render()
    })
    return
  }

  if (action === 'cancel-agent') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    if (taskId) cancelAgentRun(taskId)
    return
  }

  if (action === 'view-agent-progress') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    toast = `${task ? specialistName(task, taskId ? agentRuns.get(taskId) : null) : 'ShotCount'} is working through this task`
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
    return
  }

  if (action === 'add-agent-followups') {
    const task = tasks.find(item => item.id === target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId)
    if (task) addAgentFollowUps(task)
    return
  }

  if (action === 'sync-google-calendar') {
    void refreshGoogleCalendar(true)
    return
  }

  if (action === 'notification-bell') {
    if (browserPushBusy) return
    if (browserPushStatus === 'enabled') {
      toast = 'Alerts are on'
      render()
      window.setTimeout(() => { toast = ''; render() }, 1400)
      return
    }
    if (browserPushStatus === 'blocked') {
      toast = 'Allow Shotcount in this browser’s notification settings'
      render()
      window.setTimeout(() => { toast = ''; render() }, 2200)
      return
    }
    if (browserPushStatus === 'unsupported') {
      toast = /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? 'On iPhone, add Shotcount to your Home Screen first'
        : 'This browser does not support background alerts'
      render()
      window.setTimeout(() => { toast = ''; render() }, 2600)
      return
    }
    browserPushBusy = true
    render()
    try {
      browserPushStatus = showDemoData ? 'enabled' : await enableWebPush()
      toast = browserPushStatus === 'enabled' ? 'Alerts are on' : 'Alerts were not enabled'
    } catch (error) {
      toast = error instanceof Error ? error.message : 'Browser alerts could not be enabled'
    } finally {
      browserPushBusy = false
      render()
      window.setTimeout(() => { toast = ''; render() }, 2200)
    }
    return
  }
  if (action === 'continue-google') {
    if (localCloudWorkspace) {
      authState = 'checking'
      render()
      const { error } = await beginGoogleSignIn()
      if (error) {
        authState = 'error'
        render()
      }
      return
    }
    window.location.assign('https://shotcount.app/?auth=signin')
    return
  }
  if (action === 'retry-auth') {
    await verifyAuthSession()
    return
  }
  if (!action) return
  if (action === 'close-profile') {
    captureProfileDraft()
    profileModalOpen = false
    profileBusy = false
    profileError = ''
    clearProfilePhotoPreview()
    render()
    if (view === 'calendar') void populateGoogleCalendarForExistingUser()
    return
  }
  if (action === 'settings') {
    openProfileModal()
    return
  }
  if (action === 'toggle-theme') {
    toggleTheme()
    return
  }
  if (action === 'close-inspector') {
    persistInspectorDraft()
    mobileInspectorOpen = false
    render()
    return
  }
  if (action === 'enter-app') {
    setRoute('/app')
    return
  }
  if (action === 'go-home') {
    setRoute('/')
    return
  }
  if (action === 'add-task') {
    persistInspectorDraft()
    resetTodayComposerDraft()
    todayComposerOpen = true
    mobileInspectorOpen = false
    render()
    queueMicrotask(() => document.querySelector<HTMLInputElement>('[data-today-form] input[name="title"]')?.focus())
    return
  }
  if (action === 'close-today-composer') {
    captureTodayComposerDraft()
    todayComposerOpen = false
    resetTodayComposerDraft()
    render()
    return
  }
  if (action === 'open-planner') {
    plannerDraftGroup = target.closest<HTMLElement>('[data-task-group]')?.dataset.taskGroup as UpcomingGroup | undefined ?? null
    render()
    const group = plannerDraftGroup
    if (group) queueMicrotask(() => document.querySelector<HTMLInputElement>(`[data-planner-form="${group}"] input[name="title"]`)?.focus())
    return
  }
  if (action === 'close-planner') {
    plannerDraftGroup = null
    render()
    return
  }
  if (action === 'save-task') {
    const taskBeforeSave = selectedTask()
    persistInspectorDraft()
    toast = 'Changes saved'
    mobileInspectorOpen = false
    if (taskBeforeSave) refreshProgrammeShortlistAfterTaskSave(taskBeforeSave)
  } else if (action === 'delete-task') {
    const taskIndex = tasks.findIndex(task => task.id === selectedTaskId)
    if (taskIndex >= 0) tasks.splice(taskIndex, 1)
    completedTaskIds.delete(selectedTaskId)
    selectedTaskId = tasksForToday()[0]?.id ?? tasks[0]?.id ?? ''
    refreshCounts()
    persistPlanner()
    toast = 'Task deleted'
    mobileInspectorOpen = false
    subtaskComposerTaskId = null
    editingSubtaskId = null
  } else if (action === 'add-subtask') {
    persistInspectorDraft()
    const task = selectedTask()
    if (task) {
      subtaskComposerTaskId = task.id
      editingSubtaskId = null
      render()
      document.querySelector<HTMLInputElement>('[data-subtask-form] input[name="title"]')?.focus()
    }
    return
  } else if (action === 'cancel-subtask') {
    subtaskComposerTaskId = null
    render()
    return
  } else if (action === 'edit-subtask') {
    const subtaskId = target.closest<HTMLElement>('[data-subtask-id]')?.dataset.subtaskId
    if (!subtaskId) return
    persistInspectorDraft()
    subtaskComposerTaskId = null
    editingSubtaskId = subtaskId
    render()
    const editInput = document.querySelector<HTMLInputElement>('[data-subtask-edit-form] input[name="title"]')
    editInput?.focus()
    editInput?.select()
    return
  } else if (action === 'cancel-subtask-edit') {
    editingSubtaskId = null
    render()
    return
  } else if (action === 'delete-subtask') {
    const task = selectedTask()
    const subtaskId = target.closest<HTMLElement>('[data-subtask-id]')?.dataset.subtaskId
    if (!task || !subtaskId) return
    persistInspectorDraft()
    task.subtaskItems = (task.subtaskItems ?? []).filter(item => item.id !== subtaskId)
    task.subtasks = task.subtaskItems.length
    if (editingSubtaskId === subtaskId) editingSubtaskId = null
    persistPlanner()
    toast = 'Subtask deleted'
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
    return
  } else if (action === 'edit-calendar-task') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const task = tasks.find(item => item.id === taskId)
    if (task) openCalendarComposer(task.due ?? calendarDateKey(), task.time ?? '09:00', task.id)
    return
  } else if (action === 'schedule-task') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    if (taskId) openCalendarComposer(calendarDateKey(), '09:00', taskId)
    return
  } else if (action === 'close-calendar-composer') {
    calendarComposer = null
    render()
    return
  } else if (action === 'unschedule-task') {
    const task = calendarComposer?.taskId ? tasks.find(item => item.id === calendarComposer?.taskId) : undefined
    if (task) {
      task.time = undefined
      task.duration = undefined
      task.recurrence = 'none'
      task.reminder = undefined
      persistPlanner()
      toast = 'Time removed'
    }
    calendarComposer = null
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
    return
  } else if (action === 'previous-date' || action === 'next-date') {
    const direction = action === 'previous-date' ? -1 : 1
    const nextDate = new Date(calendarDate)
    if (calendarMode === 'month') nextDate.setMonth(nextDate.getMonth() + direction)
    else nextDate.setDate(nextDate.getDate() + direction * (calendarMode === 'week' ? 7 : 1))
    calendarDate = nextDate
  } else {
    const messages: Record<string, string> = { signout: 'Signed out' }
    toast = messages[action] ?? ''
    if (action === 'signout') {
      rememberView('today')
      try {
        window.sessionStorage.removeItem(viewStorageKey)
      } catch {
        // If storage is blocked, the app still resets the view.
      }
      await signOut()
      return
    }
  }
  persistPlanner()
  render()
  window.setTimeout(() => {
    toast = ''
    render()
  }, 1400)
})

app.addEventListener('dragstart', event => {
  const target = event.target as HTMLElement
  const taskId = target.closest<HTMLElement>('[data-calendar-task]')?.dataset.calendarTask
  if (!taskId) return
  draggingCalendarTaskId = taskId
  event.dataTransfer?.setData('text/plain', taskId)
  event.dataTransfer?.setData('application/x-shotcount-task', taskId)
  event.dataTransfer?.setDragImage?.(target, 12, 12)
})

app.addEventListener('dragend', () => {
  draggingCalendarTaskId = null
})

app.addEventListener('dragover', event => {
  if (draggingCalendarTaskId && (event.target as HTMLElement).closest('[data-calendar-drop-date]')) {
    event.preventDefault()
  }
})

app.addEventListener('drop', event => {
  const target = event.target as HTMLElement
  const dropDate = target.closest<HTMLElement>('[data-calendar-drop-date]')?.dataset.calendarDropDate
  const taskId = event.dataTransfer?.getData('application/x-shotcount-task') || event.dataTransfer?.getData('text/plain') || draggingCalendarTaskId
  if (!taskId || !dropDate) return
  event.preventDefault()
  scheduleTask(taskId, dropDate, '09:00')
  draggingCalendarTaskId = null
})

document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement
  const isTyping = target.matches('input, textarea, select') || target.isContentEditable
  if (event.key === 'Escape' && profileModalOpen) {
    captureProfileDraft()
    profileModalOpen = false
    profileBusy = false
    profileError = ''
    clearProfilePhotoPreview()
    render()
    return
  }
  if (event.key === 'Escape' && mobileInspectorOpen) {
    mobileInspectorOpen = false
    render()
    return
  }
  if (event.key === 'Escape' && calendarComposer) {
    calendarComposer = null
    render()
    return
  }
  if (isTyping || view !== 'calendar') return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const direction = event.key === 'ArrowLeft' ? -1 : 1
  const nextDate = new Date(calendarDate)
  if (calendarMode === 'month') nextDate.setMonth(nextDate.getMonth() + direction)
  else nextDate.setDate(nextDate.getDate() + direction * (calendarMode === 'week' ? 7 : 1))
  calendarDate = nextDate
  render()
})

if (googleAgentOAuthStatus) {
  const cleanUrl = new URL(window.location.href)
  cleanUrl.searchParams.delete('google')
  cleanUrl.searchParams.delete('reason')
  window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
  window.setTimeout(() => {
    toast = ''
    render()
  }, 2600)
}
render()
if (authRequired) void verifyAuthSession()
scheduleDateRefresh()
if (import.meta.env.MODE !== 'test') {
  window.setInterval(() => checkPlanningAndTaskReminders(), 30_000)
  queueMicrotask(() => checkPlanningAndTaskReminders())
}
window.addEventListener('popstate', () => {
  render()
})
window.addEventListener('online', () => void plannerRepository?.syncNow())
window.addEventListener('offline', () => void plannerRepository?.syncNow())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const previousTodayKey = todayKey
    refreshDateContext()
    if (todayKey !== previousTodayKey) refreshCounts()
    checkPlanningAndTaskReminders()
    void plannerRepository?.refresh()
    void refreshSignedInProfile()
    const lastGoogleSync = googleCalendarState.lastSyncedAt ? new Date(googleCalendarState.lastSyncedAt).getTime() : 0
    void refreshGoogleCalendar(googleCalendarState.status !== 'needs_permission' && Date.now() - lastGoogleSync > 5 * 60 * 1000)
    void refreshAgentRuns()
    void pollWaitingAgentRuns()
  }
})
dateStateHook.__shotcountRefreshDateState = (reference = new Date()) => {
  refreshDateContext(reference)
  calendarDate = new Date(reference)
  refreshCounts()
  render()
}
