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
  loadCreatorProfile,
  isCreatorProfileComplete,
  missingCreatorProfileFields,
  normalizeUsername,
  profileDefaults,
  saveCreatorProfile,
  uploadProfilePhoto,
  type CreatorProfile,
  type CreatorProfileField,
  type CreatorProfileInput,
} from './data/profile'
import {
  formatFollowerCount,
  loadCreatorDirectory,
  formatFollowerLabel,
  normalizeCreatorSlug,
  setCreatorFollowing,
  type CommunityCreator,
} from './data/community'
import {
  defaultNotificationPreferences,
  dispatchCompletionPush,
  enableWebPush,
  loadCompletionFeed,
  loadCreatorToday,
  loadNotificationPreferences,
  setCreatorMuted,
  showLocalReminder,
  subscribeToCompletionAlerts,
  webPushStatus,
  type CreatorCompletion,
  type SharedCreatorTask,
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
import { normalizeGoal, normalizeTask, normalizeTaskVisibility, type Goal, type PlannerKind, type Task, type TaskVisibility } from './data/planner-model'
import {
  cancelAgentRunRemote,
  createAgentRun,
  decideAgentApproval,
  editAgentCalendarApproval,
  editAgentEmailApproval,
  executeAgentRun,
  generateRoonPlan,
  loadAgentApprovals,
  loadAgentRuns,
  pollAgentRun,
  resumeAgentRun,
  selectAgentRecipient,
  selectAgentFlight,
  simulateAgentReply,
  subscribeToAgentRuns,
  type AgentApproval,
  type AgentRun,
  type RoonPlanTask,
} from './data/agent'
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
  downloadTaskFileAsset,
  loadTaskFileAssets,
  removeTaskFileAsset,
  setFileAssetReusable,
  uploadTaskFileAsset,
  type FileAsset,
} from './data/file-assets'
import { isApplicationIntent } from './data/application'
import './style.css'
import heroCollage from './assets/shotcount-collage.png'
import peopleCollage from './assets/shotcount-people-collage.png'
import communityPortraits from './assets/community-portraits.png'

type View = 'today' | 'upcoming' | 'calendar' | 'sticky'
type CountKey = 'today' | 'upcoming'
type UpcomingGroup = 'tomorrow' | 'week'
type ActivityMode = 'daily' | 'weekly' | 'cumulative'
type Recurrence = SharedRecurrence
type TodayComposerDraft = {
  title: string
  description: string
  goalId: string
  due: string
  time: string
  visibility: TaskVisibility
}
type RoonPlannerStage = 'goal' | 'loading' | 'clarification' | 'preview'
type RoonPlanDraftTask = RoonPlanTask & { id: string }
type CalendarMode = 'day' | 'week' | 'month'
type Theme = 'light' | 'dark'
const previewParams = new URLSearchParams(window.location.search)
const previewView = previewParams.get('previewView')
const previewAgentState = previewParams.get('previewAgent')
const previewGoogleCalendar = previewParams.has('previewGoogleCalendar')
const googleAgentOAuthStatus = previewParams.get('google')
const isPreviewMode = previewParams.has('previewView')
const agentDevMode = previewParams.get('agentDev') === '1'
const showDemoData = isPreviewMode || import.meta.env.MODE === 'test'
type AuthState = 'checking' | 'authenticated' | 'unauthenticated' | 'error'
const authRequired = !isPreviewMode && (window.location.hostname === 'app.shotcount.app' || window.location.hostname.endsWith('.vercel.app'))
let authState: AuthState = authRequired ? 'checking' : 'authenticated'
let plannerRepository: CloudPlannerRepository | null = null
let syncState: SyncState = { status: 'loading', message: 'Loading your workspace…', pending: 0 }
let activeUser: Awaited<ReturnType<typeof currentUser>> = null
let creatorProfile: CreatorProfile | null = null
let profileDraft: CreatorProfileInput = profileDefaults()
let profileModalOpen = false
let profileBusy = false
let profileError = ''
let profilePhotoFile: File | null = null
let profilePhotoPreview = ''
let profilePromptDismissed = false
let googleAgentConnection: GoogleAgentConnection | null = null
let googleAgentConnectionBusy = false
type CommunityProfile = {
  id: string
  username: string
  name: string
  role: string
  category: string
  members: string
  tasksToday: number
  latest: string
  portraitColumn: number
  portraitRow: number
  bioLines: string[]
  avatarUrl: string
  followerCount: number
  followed: boolean
  isDemo: boolean
}

const app = document.querySelector<HTMLDivElement>('#app')!
const storagePrefix = 'shotcount-workspace-current-v1:'
const viewStorageKey = `${storagePrefix}active-view`
const googleCalendarConsentKey = `${storagePrefix}google-calendar-consent-v2`
const plannerStorageKey = `${storagePrefix}planner`
const goalsStorageKey = `${storagePrefix}goals`
const themeStorageKey = `${storagePrefix}theme`
const agentRunsStorageKey = `${storagePrefix}agent-runs`
const todayPromptStorageKey = `${storagePrefix}today-prompt-date`
const tomorrowPromptStorageKey = `${storagePrefix}tomorrow-prompt-date`
const reminderDeliveryStorageKey = `${storagePrefix}reminder-deliveries`
const creatorQueryKey = 'creator'
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
  if (previewView === 'today' || previewView === 'upcoming' || previewView === 'calendar' || previewView === 'sticky') {
    return previewView
  }

  const routeView = workspaceViewFromPathname(window.location.pathname)
  if (routeView) return routeView

  try {
    const stored = readStoredValue(window.sessionStorage, viewStorageKey)
    return stored === 'today' || stored === 'upcoming' || stored === 'calendar' || stored === 'sticky' ? stored : 'today'
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
  if (normalized === '/app/community') return 'sticky'
  return null
}

function workspacePathForView(nextView: View) {
  if (nextView === 'upcoming') return '/app/upcoming'
  if (nextView === 'calendar') return '/app/calendar'
  if (nextView === 'sticky') return '/app/community'
  return '/app'
}

function navigateWorkspaceView(nextView: View) {
  rememberView(nextView)
  const url = new URL(window.location.href)
  const pathname = workspacePathForView(nextView)
  if (url.pathname !== pathname) {
    url.pathname = pathname
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }
}

let now = new Date()
let todayKey = dateKey(now)
let tomorrowKey = dateKey(addDays(now, 1))
let weekEndKey = dateKey(addDays(now, 7))

const seedGoals: Goal[] = [
  { id: 'personal', name: 'Personal', color: '#ff666d' },
  { id: 'job-search', name: 'Find a new job', color: '#60d4dd' },
  { id: 'paper', name: 'Write a paper', color: '#ffd331' },
]
const seedGoalIds = new Set(seedGoals.map(goal => goal.id))
const goalColorPalette = [
  '#78a7ff',
  '#a879ff',
  '#ff8db3',
  '#ff9f5a',
  '#6bc48d',
  '#3bb8a5',
  '#8a9aad',
  '#d184e8',
  '#b6a43a',
  '#4b87d9',
]

function readGoals() {
  try {
    const stored = readStoredValue(window.localStorage, goalsStorageKey)
    if (!stored) return (showDemoData ? seedGoals : []).map(goal => normalizeGoal(goal))
    const parsed = JSON.parse(stored) as Goal[]
    if (!Array.isArray(parsed)) return (showDemoData ? seedGoals : []).map(goal => normalizeGoal(goal))
    if (showDemoData) return parsed.length ? parsed : seedGoals
    const cleaned = parsed.filter(goal => !seedGoalIds.has(goal.id))
    if (cleaned.length !== parsed.length) window.localStorage.setItem(goalsStorageKey, JSON.stringify(cleaned))
    return cleaned
  } catch {
    return (showDemoData ? seedGoals : []).map(goal => normalizeGoal(goal))
  }
}

const goals: Goal[] = readGoals().map(goal => normalizeGoal(goal))

function normalizeColor(color: string) {
  return color.trim().toLowerCase()
}

function isGoalColorUsed(color: string) {
  const normalized = normalizeColor(color)
  return goals.some(goal => normalizeColor(goal.color) === normalized)
}

function nextGoalColor() {
  const available = goalColorPalette.find(color => !isGoalColorUsed(color))
  if (available) return available

  // The palette can grow forever without making two goals look the same.
  for (let hue = 0; hue < 360; hue += 7) {
    const color = hslToHex(hue, 65, 62)
    if (!isGoalColorUsed(color)) return color
  }
  return '#78a7ff'
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100
  const l = lightness / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const section = hue / 60
  const second = chroma * (1 - Math.abs(section % 2 - 1))
  const [red, green, blue] =
    section < 1 ? [chroma, second, 0] :
      section < 2 ? [second, chroma, 0] :
        section < 3 ? [0, chroma, second] :
          section < 4 ? [0, second, chroma] :
            section < 5 ? [second, 0, chroma] : [chroma, 0, second]
  const match = l - chroma / 2
  return `#${[red, green, blue].map(value => Math.round((value + match) * 255).toString(16).padStart(2, '0')).join('')}`
}

const seedTasks: Task[] = [
  { id: 'research', title: 'Research content ideas', due: dateKey(addDays(now, -1)), visibility: 'private' },
  { id: 'database', title: 'Create a database of guest authors', due: todayKey, visibility: 'private' },
  {
    id: 'license',
    title: "Renew driver's license",
    goalId: 'personal',
    due: todayKey,
    subtasks: 1,
    subtaskItems: [{ id: 'license-subtask', title: 'Subtask', completed: false }],
    visibility: 'private',
  },
  { id: 'accountant', title: 'Consult accountant', goalId: 'paper', due: todayKey, subtasks: 3 },
  { id: 'business-card', title: 'Print business card', due: todayKey, time: '09:00' },
  { id: 'job-posting', title: 'Create job posting for SEO specialist', due: tomorrowKey, goalId: 'job-search' },
  { id: 'assets', title: 'Request design assets for landing page', due: tomorrowKey, goalId: 'job-search' },
  { id: 'outline', title: 'Outline the next newsletter', due: dateKey(addDays(now, 2)), goalId: 'personal' },
  { id: 'analytics', title: 'Review launch analytics', due: dateKey(addDays(now, 4)), goalId: 'job-search' },
  { id: 'invoices', title: 'Send monthly invoices', due: dateKey(addDays(now, 6)), goalId: 'paper' },
]
const seedTaskIds = new Set(seedTasks.map(task => task.id))

function readPlannerTasks() {
  try {
    const stored = readStoredValue(window.localStorage, plannerStorageKey)
    if (!stored) return (showDemoData ? seedTasks : []).map(task => normalizeTask(task))
    const parsed = JSON.parse(stored) as Array<{ goalId?: string; list?: string } & Task>
    if (!Array.isArray(parsed)) return (showDemoData ? seedTasks : []).map(task => normalizeTask(task))
    const cleaned = showDemoData ? parsed : parsed.filter(task => !seedTaskIds.has(task.id))
    if (!showDemoData && cleaned.length !== parsed.length) {
      window.localStorage.setItem(plannerStorageKey, JSON.stringify(cleaned))
    }
    return cleaned.map(task => {
      const legacyList = (task as { list?: string }).list
      const goalId =
        task.goalId ??
        (legacyList === 'Work' ? 'job-search' : legacyList === 'List 1' ? 'paper' : legacyList ? 'personal' : undefined)
      return normalizeTask({
        ...task,
        goalId,
      })
    })
  } catch {
    return (showDemoData ? seedTasks : []).map(task => normalizeTask(task))
  }
}

const tasks: Task[] = readPlannerTasks()
let view: View = readStoredView()
let selectedTaskId = showDemoData && tasks.some(task => task.id === 'license') ? 'license' : tasks[0]?.id ?? ''
let mobileInspectorOpen = false
const agentRuns = readAgentRuns()
const taskFileAssets = new Map<string, FileAsset[]>()
const loadingTaskFileAssets = new Set<string>()
const taskFileAssetBusy = new Set<string>()
let filePreview: { asset: FileAsset; url: string | null; message?: string } | null = null
const agentApprovals = new Map<string, AgentApproval>()
const agentDecisionBusy = new Set<string>()
const roonContextDrafts = new Map<string, string>()
const pendingEmailSends = new Map<string, (proceed: boolean) => void>()
let agentPollingTimer = 0
let agentPollBusy = false
let agentRunsRefreshing = false
const screenCounts: Record<CountKey, number> = { today: 5, upcoming: 12 }
const completedTaskIds = new Set(tasks.filter(task => task.completedAt).map(task => task.id))
let activityMode: ActivityMode = 'daily'
let plannerDraftGroup: UpcomingGroup | null = previewParams.get('plan') === 'tomorrow' ? 'tomorrow' : null
let todayComposerOpen = previewParams.get('plan') === 'today'
let todayComposerAttachment: File | null = null
let skipTodayComposerCapture = false
let dailyPlanningPrompt: 'today' | 'tomorrow' | null = null
let subtaskComposerTaskId: string | null = null
let editingSubtaskId: string | null = null
let roonPlannerOpen = false
let roonPlannerStage: RoonPlannerStage = 'goal'
let roonPlannerGoal = ''
let roonPlannerQuestion = ''
let roonPlannerClarification = ''
let roonPlannerError = ''
let roonPlannerTargetDue = todayKey
let roonPlanTasks: RoonPlanDraftTask[] = []
let todayGoalCreatorOpen = false
let goalComposerOpen = false
let activeGoalId: string | null = null
let todayComposerDraft: TodayComposerDraft = {
  title: '',
  description: '',
  goalId: goals[0]?.id ?? '',
  due: todayKey,
  time: '',
  visibility: 'private',
}
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
const hiddenCalendarGoalIds = new Set<string>()
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
const demoCommunityProfiles: CommunityProfile[] = [
  {
    id: 'amara',
    username: 'amara',
    name: 'Amara Okafor',
    role: 'Product founder',
    category: 'Building & creating',
    members: '12.8k',
    tasksToday: 6,
    latest: 'Reviewed the launch brief',
    portraitColumn: 0,
    portraitRow: 0,
    bioLines: ['CTO, Bumpa', 'Research intern, EPFL', 'Content creator with 18k followers'],
    avatarUrl: '',
    followerCount: 12_800,
    followed: true,
    isDemo: true,
  },
  {
    id: 'kenji',
    username: 'kenji',
    name: 'Kenji Watanabe',
    role: 'Creative director',
    category: 'Building & creating',
    members: '9.4k',
    tasksToday: 4,
    latest: 'Approved the campaign concept',
    portraitColumn: 1,
    portraitRow: 0,
    bioLines: ['Creative director, independent brands', 'Systems thinker', 'Designing in public'],
    avatarUrl: '',
    followerCount: 9_400,
    followed: false,
    isDemo: true,
  },
  {
    id: 'maya',
    username: 'maya',
    name: 'Maya Raman',
    role: 'Research scientist',
    category: 'Building & creating',
    members: '7.2k',
    tasksToday: 5,
    latest: 'Finished the weekly lab review',
    portraitColumn: 2,
    portraitRow: 0,
    bioLines: ['Research scientist, EPFL', 'Writes about deep work', '6k newsletter subscribers'],
    avatarUrl: '',
    followerCount: 7_200,
    followed: false,
    isDemo: true,
  },
  {
    id: 'malik',
    username: 'malik',
    name: 'Malik Thompson',
    role: 'Endurance athlete',
    category: 'Research & performance',
    members: '18.1k',
    tasksToday: 7,
    latest: 'Completed morning recovery',
    portraitColumn: 0,
    portraitRow: 1,
    bioLines: ['Endurance athlete', 'Coach and builder', '18.1k followers'],
    avatarUrl: '',
    followerCount: 18_100,
    followed: false,
    isDemo: true,
  },
  {
    id: 'sofia',
    username: 'sofia',
    name: 'Sofía Reyes',
    role: 'Independent filmmaker',
    category: 'Research & performance',
    members: '11.6k',
    tasksToday: 3,
    latest: 'Locked the final shot list',
    portraitColumn: 1,
    portraitRow: 1,
    bioLines: ['Independent filmmaker', 'Storytelling coach', '11.6k members'],
    avatarUrl: '',
    followerCount: 11_600,
    followed: false,
    isDemo: true,
  },
  {
    id: 'theo',
    username: 'theo',
    name: 'Theo Bennett',
    role: 'Bestselling author',
    category: 'Research & performance',
    members: '15.3k',
    tasksToday: 4,
    latest: 'Wrote 1,200 words',
    portraitColumn: 2,
    portraitRow: 1,
    bioLines: ['Bestselling author', 'Writes daily in public', '15.3k readers'],
    avatarUrl: '',
    followerCount: 15_300,
    followed: false,
    isDemo: true,
  },
]
let communityProfiles: CommunityProfile[] = showDemoData ? demoCommunityProfiles.map(profile => ({ ...profile })) : []
let communityState: 'loading' | 'ready' | 'failed' = showDemoData ? 'ready' : 'loading'
const communityBusyIds = new Set<string>()
let pendingCreatorSlug = ''
let creatorLinkTargetId = ''
let communityFollowError = ''
type CreatorTodayState = {
  profile: CommunityProfile
  tasks: SharedCreatorTask[]
  status: 'loading' | 'ready' | 'failed'
}
let creatorTodayState: CreatorTodayState | null = null
let selectedCreatorTaskId = ''
let notificationPreferences = defaultNotificationPreferences()
let browserPushStatus: WebPushStatus = 'available'
let browserPushBusy = false
let islandCompletions: CreatorCompletion[] = []
let queuedCompletions: CreatorCompletion[] = []
let completionBatchTimer = 0
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
let islandDismissTimer = 0
let completionSubscription: (() => void) | null = null
let agentRunSubscription: (() => void) | null = null
let lastCompletionCheck = new Date(Date.now() - 15_000).toISOString()
let notificationAudioContext: AudioContext | null = null
const islandPreview = previewParams.get('previewIsland')
const dynamicIslandEnabled = false
const islandHook = window as Window & {
  __shotcountShowCompletion?: (items?: CreatorCompletion[]) => void
}

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
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.25 2.46 3.4 5.46 3.4 9S14.25 18.54 12 21c-2.25-2.46-3.4-5.46-3.4-9S9.75 5.46 12 3Z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7"/>',
  paperclip: '<path d="m20.5 11.5-8.9 8.9a5 5 0 0 1-7.1-7.1l9.6-9.6a3.5 3.5 0 1 1 5 5l-9.7 9.6a2 2 0 0 1-2.8-2.8l8.9-8.8"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
}

function icon(name: string) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name]}</svg>`
}

function agentSparkleIcon() {
  return `<svg class="agent-sparkle-icon" aria-hidden="true" viewBox="0 0 24 24">
    <path d="M8.2 2.7c.65 3.72 2.14 5.2 5.85 5.86-3.71.66-5.2 2.14-5.85 5.86-.66-3.72-2.15-5.2-5.86-5.86C6.05 7.9 7.54 6.42 8.2 2.7Z"/>
    <path d="M16.55 11.25c.43 2.48 1.42 3.47 3.9 3.91-2.48.44-3.47 1.43-3.9 3.91-.44-2.48-1.43-3.47-3.91-3.91 2.48-.44 3.47-1.43 3.91-3.91Z"/>
  </svg>`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function creatorSlugFromLocation() {
  const querySlug = normalizeCreatorSlug(new URLSearchParams(window.location.search).get(creatorQueryKey))
  if (querySlug) return querySlug
  return creatorSlugFromPathname(window.location.pathname)
}

function creatorSlugFromPathname(pathname: string) {
  const pathSlug = normalizeCreatorSlug(pathname.split('/').filter(Boolean)[0])
  return pathSlug && !['app', 'workspace'].includes(pathSlug) ? pathSlug : ''
}

function rememberCreatorIntent(slug: string) {
  pendingCreatorSlug = normalizeCreatorSlug(slug)
}

function clearCreatorIntentFromUrl() {
  pendingCreatorSlug = ''
  const url = new URL(window.location.href)
  url.searchParams.delete(creatorQueryKey)
  if (creatorSlugFromPathname(url.pathname)) url.pathname = '/'
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function mapCommunityCreator(profile: CommunityCreator, index: number): CommunityProfile {
  const count = Math.max(0, profile.followerCount)
  const role = profile.bio.split('·')[0]?.trim() || 'Shotcount creator'
  return {
    id: profile.id,
    username: profile.username,
    name: profile.displayName,
    role,
    category: 'Shotcount creator',
    members: formatFollowerCount(count),
    tasksToday: 0,
    latest: profile.bio,
    portraitColumn: index % 3,
    portraitRow: Math.floor(index / 3) % 2,
    bioLines: [profile.bio],
    avatarUrl: profile.avatarUrl,
    followerCount: count,
    followed: profile.followedByMe,
    isDemo: false,
  }
}

function defaultTaskVisibility() {
  return creatorProfile?.defaultTaskVisibility ?? profileDraft.defaultTaskVisibility ?? 'private'
}

function demoCreatorTasks(profile: CommunityProfile): SharedCreatorTask[] {
  const names = profile.id === 'maya'
    ? ['Ship the homepage revision', 'Review creator interviews', 'Write tomorrow’s launch note']
    : ['Review the launch brief', 'Approve the onboarding flow', 'Founder interviews', 'Reply to the design team', 'Read the weekly numbers', 'Plan tomorrow’s focus']
  return names.map((title, index) => ({
    id: `${profile.id}-shared-${index}`,
    title,
    due: todayKey,
    time: index < 2 ? `${String(8 + index * 2).padStart(2, '0')}:${index ? '15' : '40'}` : '',
    completedAt: index < Math.max(1, names.length - 1) ? `${todayKey}T${String(9 + index).padStart(2, '0')}:10:00.000Z` : '',
    visibility: index % 2 ? 'public' : 'followers',
  }))
}

function isQuietTime(preferences = notificationPreferences, reference = new Date()) {
  if (!preferences.quietHoursEnabled) return false
  let hour = reference.getHours()
  let minute = reference.getMinutes()
  try {
    const timezone = creatorProfile?.timezone || profileDraft.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(reference)
    hour = Number(parts.find(part => part.type === 'hour')?.value ?? hour)
    minute = Number(parts.find(part => part.type === 'minute')?.value ?? minute)
  } catch {
    // A mistyped timezone falls back to the clock on this device.
  }
  const minutes = hour * 60 + minute
  const toMinutes = (value: string) => {
    const [hours = '0', minute = '0'] = value.split(':')
    return Number(hours) * 60 + Number(minute)
  }
  const start = toMinutes(preferences.quietStart)
  const end = toMinutes(preferences.quietEnd)
  if (start === end) return true
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}

function clearIsland() {
  window.clearTimeout(islandDismissTimer)
  islandDismissTimer = 0
  islandCompletions = []
  render()
  if (queuedCompletions.length) window.setTimeout(showQueuedCompletions, 240)
}

function showQueuedCompletions() {
  if (islandCompletions.length || !queuedCompletions.length) return
  islandCompletions = queuedCompletions.splice(0)
  playShotcountChime()
  triggerHaptic([22, 34, 46])
  render()
  islandDismissTimer = window.setTimeout(clearIsland, 6_000)
}

function playShotcountChime() {
  if (document.visibilityState === 'hidden' || typeof AudioContext === 'undefined') return
  try {
    notificationAudioContext ??= new AudioContext()
    const context = notificationAudioContext
    void context.resume()
    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, context.currentTime)
    master.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.018)
    master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.72)
    master.connect(context.destination)
    ;[659.25, 830.61, 987.77].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const startsAt = context.currentTime + index * 0.085
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, startsAt)
      gain.gain.setValueAtTime(0.0001, startsAt)
      gain.gain.exponentialRampToValueAtTime(0.5 - index * 0.09, startsAt + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.42)
      oscillator.connect(gain).connect(master)
      oscillator.start(startsAt)
      oscillator.stop(startsAt + 0.45)
    })
  } catch {
    // Sound is a gentle enhancement. The Island still appears if audio is blocked.
  }
}

function queueCompletionAlerts(items: CreatorCompletion[], immediate = false) {
  if (!dynamicIslandEnabled) return
  if (!notificationPreferences.completionAlerts || isQuietTime()) return
  const knownIds = new Set([...queuedCompletions, ...islandCompletions].map(item => item.id))
  const allowed = items.filter(item => !knownIds.has(item.id) && !notificationPreferences.mutedCreatorIds.includes(item.creatorId))
  if (!allowed.length) return
  queuedCompletions.push(...allowed)
  window.clearTimeout(completionBatchTimer)
  if (immediate) showQueuedCompletions()
  else completionBatchTimer = window.setTimeout(showQueuedCompletions, 1_800)
}

async function checkForCompletionAlerts() {
  const checkedAt = new Date().toISOString()
  try {
    queueCompletionAlerts(await loadCompletionFeed(lastCompletionCheck))
  } catch {
    // Alerts can retry after the next realtime nudge or app focus.
  } finally {
    lastCompletionCheck = checkedAt
  }
}

async function startNotificationSystem() {
  completionSubscription?.()
  completionSubscription = null
  try {
    const [preferences, pushStatus] = await Promise.all([loadNotificationPreferences(), webPushStatus()])
    notificationPreferences = preferences
    browserPushStatus = pushStatus
    completionSubscription = await subscribeToCompletionAlerts(() => void checkForCompletionAlerts())
    await checkForCompletionAlerts()
  } catch {
    // Notification setup must never block the task workspace.
  }
}

function applyCompletedAgentTasks(runs: AgentRun[]) {
  let changed = false
  for (const run of runs) {
    if (run.status !== 'completed') continue
    const task = tasks.find(item => item.id === run.taskId)
    if (task && isApplicationIntent(task.title, task.description)) continue
    if (!task || task.completedAt) continue
    task.completedAt = run.updatedAt || new Date().toISOString()
    completedTaskIds.add(task.id)
    changed = true
  }
  if (!changed) return
  persistPlanner()
  refreshCounts()
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
    applyCompletedAgentTasks(durableRuns)
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
  // dropped response leaves the panel saying “In progress” until the periodic
  // server sweep catches it. The server-side lease makes this safe: while the
  // original turn still owns the run, a poll only reads its durable state and
  // cannot replay the model turn.
  const staleApplicationRuns = [...agentRuns.values()].filter(run =>
    isApplicationIntent(run.objective, run.context) &&
    ['planning', 'running'].includes(run.status) &&
    Date.now() - Date.parse(run.updatedAt) >= 20_000,
  )
  const stalePaymentHandoffRuns = [...agentRuns.values()].filter(run =>
    run.capability === 'flight_search' &&
    ['planning', 'running'].includes(run.status) &&
    Boolean(run.result?.paymentHandoffUrl) &&
    Date.now() - Date.parse(run.updatedAt) >= 20_000,
  )
  const waitingRuns = [...agentRuns.values()].filter(run => run.status === 'waiting_external')
  const recoverableRuns = [...waitingRuns, ...staleApplicationRuns, ...stalePaymentHandoffRuns]
  if (!recoverableRuns.length) return
  agentPollBusy = true
  try {
    const updatedRuns = await Promise.all(recoverableRuns.map(run => pollAgentRun(run.id)))
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
  await refreshAgentRuns()
  try {
    agentRunSubscription = await subscribeToAgentRuns(() => void refreshAgentRuns())
  } catch {
    // A focus refresh can recover if realtime is temporarily unavailable.
  }
  void pollWaitingAgentRuns()
  agentPollingTimer = window.setInterval(() => void pollWaitingAgentRuns(), 5_000)
}

async function openCreatorToday(profile: CommunityProfile) {
  selectedCreatorTaskId = ''
  mobileInspectorOpen = false
  creatorTodayState = { profile, tasks: [], status: 'loading' }
  rememberView('sticky')
  const url = new URL(window.location.href)
  url.pathname = `/${profile.username}`
  url.searchParams.delete(creatorQueryKey)
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  clearIsland()
  render()
  try {
    const sharedTasks = profile.isDemo ? demoCreatorTasks(profile) : await loadCreatorToday(profile.id)
    if (!creatorTodayState || creatorTodayState.profile.id !== profile.id) return
    creatorTodayState = { profile, tasks: sharedTasks, status: 'ready' }
  } catch {
    if (!creatorTodayState || creatorTodayState.profile.id !== profile.id) return
    creatorTodayState = { profile, tasks: [], status: 'failed' }
  }
  render()
}

function closeCreatorToday() {
  creatorTodayState = null
  selectedCreatorTaskId = ''
  mobileInspectorOpen = false
  const url = new URL(window.location.href)
  if (creatorSlugFromPathname(url.pathname)) url.pathname = '/app/community'
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  rememberView('sticky')
  render()
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

const agentProgressLabels = [
  'Opened the task context',
  'Extracting key sections',
  'Summarizing main points',
  'Identifying key takeaways',
]
const agentPreviewProgressLabels = [
  'Opened the report',
  'Extracting key sections',
  'Summarizing main points',
  'Identifying key takeaways',
]
const applicationProgressLabels = [
  'Reading the attached opportunity',
  'Verifying the official programme page',
  'Checking requirements and eligibility',
  'Preparing a safe review handoff',
]

function taskSpecialistRoute(task: Pick<Task, 'title' | 'description'>): SpecialistRoute {
  return routeTask(task.title, task.description)
}

function specialistForTask(task: Pick<Task, 'title' | 'description'>, run?: AgentRun | null) {
  const route = taskSpecialistRoute(task)
  const providerFailure = run?.status === 'needs_context' && run.capability === 'flight_search' &&
    /live flight-search results were not returned|reconnect flight-search access/i.test(run.waitingReason)
  const contextOwner = run?.status === 'needs_context' && !providerFailure ? run.contextOwnerSpecialistId : null
  const assigned = contextOwner
    ? contextOwner
    : run?.activeSpecialistId ?? run?.specialistId ?? route.primarySpecialistId
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

function specialistActivity(
  task: Pick<Task, 'title' | 'description'>,
  run: AgentRun | null | undefined,
  specialist: NonNullable<ReturnType<typeof getSpecialist>>,
) {
  if (run?.status === 'needs_context') {
    return specialist.id === 'roon'
      ? 'Asking for one detail at a time'
      : specialist.id === 'caspian'
        ? 'Getting the trip details ready'
      : specialist.id === 'david'
        ? 'Waiting for the missing application detail'
        : 'Waiting for the detail that unlocks the next move'
  }
  if (run?.status === 'needs_approval') return 'Ready for your review before anything changes'
  if (run?.status === 'waiting_external') {
    return specialist.id === 'caspian'
      ? 'Checking live flight options'
      : 'Keeping watch for the next external update'
  }
  if (run?.status === 'waiting_for_user') return 'Holding the work here for your call'
  if (run?.status === 'failed') return 'Rechecking the path after an interruption'
  if (run?.status === 'completed') return 'Finished the groundwork and left it ready for you'

  const taskText = `${task.title} ${task.description}`.toLocaleLowerCase()
  const capability = run?.capability ?? (
    specialist.id === 'caspian' || /\b(?:flight|itinerary|airline|airport)\b/.test(taskText)
      ? 'flight_search'
      : specialist.id === 'david' || isApplicationIntent(task.title, task.description)
        ? 'research_draft'
        : /\b(?:calendar|schedule|meeting|availability)\b/.test(taskText)
          ? 'scheduling'
          : /\b(?:email|gmail|inbox|reply|message)\b/.test(taskText)
            ? 'gmail'
            : specialist.id === 'roon'
              ? 'research'
              : 'draft'
  )
  const activityByCapability: Record<string, string> = {
    gmail: 'Reviewing threads · preparing the next safe step',
    calendar: 'Reading your calendar · finding the cleanest opening',
    scheduling: 'Checking availability · lining up the next move',
    flight_search: 'Comparing live flights',
    browser: 'Opening the right page · working through the details',
    draft: 'Shaping a polished draft · keeping your voice intact',
    research_draft: 'Researching the signal · building a grounded draft',
    research: 'Gathering the useful signal · distilling the answer',
  }
  return activityByCapability[capability] ?? 'Preparing the next safe move for you'
}

function specialistHeader(task: Pick<Task, 'title' | 'description'>, run?: AgentRun | null) {
  const specialist = specialistForTask(task, run)
  if (!specialist) return '<strong>ShotCount</strong>'
  return `<strong><span class="agent-icon-wrap specialist-icon specialist-icon--${specialist.id}" data-specialist-id="${specialist.id}">${agentSparkleIcon()}</span><span class="specialist-identity"><b>${escapeHtml(specialist.displayName)}</b><small>${escapeHtml(specialistActivity(task, run, specialist))}</small></span></strong>`
}

function agentUpdateToast(run: AgentRun) {
  const specialist = getSpecialist(run.activeSpecialistId ?? run.specialistId)
  const name = specialist?.displayName ?? 'ShotCount'
  if (run.status === 'completed') return `${name} finished your task`
  if (run.status === 'needs_approval') return 'Ready for your approval'
  if (run.status === 'needs_context') return 'Add the requested details to continue'
  if (run.status === 'waiting_external') return `${name} will continue when the expected update arrives`
  if (run.status === 'waiting_for_user') return `${name} needs your next step`
  if (run.status === 'failed') return run.error ?? `${name} needs attention`
  return `${name} is working through this task`
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

function showTransientToast(message: string, duration = 1200) {
  toast = message
  observedToast = message
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    if (toast === message) {
      toast = ''
      render()
    }
  }, duration)
  render()
}

async function startAgentRun(task: Task, context = '') {
  const route = taskSpecialistRoute(task)
  if (!route.supported && !route.needsSemanticClassification) {
    toast = 'ShotCount cannot assign this task to a supported specialist yet.'
    render()
    clearAgentToast(toast)
    return
  }
  const existing = agentRuns.get(task.id)
  if (context && existing?.status === 'needs_context' && existing.durable && activeUser) {
    agentDecisionBusy.add(existing.id)
    existing.context = context
    existing.status = 'planning'
    existing.waitingReason = ''
    persistAgentRuns()
    render()
    try {
      const resumed = await resumeAgentRun(existing.id, context)
      agentRuns.set(task.id, resumed)
      await syncAgentApproval(resumed)
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

  const run = createAgentRun(task, context)
  agentRuns.set(task.id, run)
  selectedTaskId = task.id
  mobileInspectorOpen = true
  persistAgentRuns()
  render()
  if (run.status === 'needs_context') return

  run.status = 'running'
  run.progressIndex = 0
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
    toast = agentUpdateToast(completed)
  } catch (error) {
    if (agentRuns.get(task.id)?.status === 'cancelled') return
    run.status = 'failed'
    run.error = error instanceof Error ? error.message : `${specialistName(task, run)} could not complete this task.`
    run.updatedAt = new Date().toISOString()
    toast = run.error
  } finally {
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
  // Retry briefly so the panel does not get stuck on the generic waiting state.
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
    applyCompletedAgentTasks([updated])
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
    const updated = await resumeAgentRun(run.id)
    agentRuns.set(taskId, updated)
    await syncAgentApproval(updated)
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

async function chooseAgentFlight(taskId: string, optionId: string) {
  const run = agentRuns.get(taskId)
  const task = tasks.find(item => item.id === taskId)
  if (!run || agentDecisionBusy.has(run.id)) return
  agentDecisionBusy.add(run.id)
  render()
  try {
    const updated = await selectAgentFlight(run.id, optionId)
    agentRuns.set(taskId, updated)
    await syncAgentApproval(updated)
    if (updated.status === 'waiting_external') void monitorDemoFlightHandoff(taskId, updated.id)
    toast = updated.result?.paymentHandoffUrl ? 'Flight ready for you' : agentUpdateToast(updated)
  } catch (error) {
    toast = error instanceof Error ? error.message : `${task ? specialistName(task, run) : 'Caspian'} could not continue with this flight.`
  } finally {
    agentDecisionBusy.delete(run.id)
    persistAgentRuns()
    render()
    if (toast) clearAgentToast(toast)
  }
}

// Poll the task-owned browser selection until the bounded worker path reaches
// the provider booking/payment boundary. This monitor never starts a second
// model turn, so it cannot replay Roon's progress feed.
function monitorDemoFlightHandoff(taskId: string, runId: string) {
  let attempts = 0
  const check = async () => {
    if (attempts >= 90) return
    attempts += 1
    await new Promise(resolve => window.setTimeout(resolve, 1_000))
    const current = agentRuns.get(taskId)
    if (!current || current.id !== runId || current.status !== 'waiting_external') return
    try {
      const updated = await pollAgentRun(runId)
      agentRuns.set(taskId, updated)
      persistAgentRuns()
      render()
      if (updated.status === 'waiting_external') void check()
    } catch {
      // The regular provider polling remains a recovery path if this one call fails.
    }
  }
  void check()
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
      goalId: task.goalId,
      visibility: 'private',
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
    plannerRepository.save({ tasks, goals })
    return
  }
  try {
    window.localStorage.setItem(plannerStorageKey, JSON.stringify(tasks))
  } catch {
    // The planner still works for this visit when storage is unavailable.
  }
}

function persistGoals() {
  if (plannerRepository) {
    plannerRepository.save({ tasks, goals })
    return
  }
  try {
    window.localStorage.setItem(goalsStorageKey, JSON.stringify(goals))
  } catch {
    // Goals still work for this visit when storage is unavailable.
  }
}

function taskMatchesGoal(task: Task) {
  return !activeGoalId || task.goalId === activeGoalId
}

function belongsOnTodayList(task: Task) {
  if (!task.due || task.due > todayKey) return false
  if (!task.completedAt) return true
  const completedDate = new Date(task.completedAt)
  return !Number.isNaN(completedDate.getTime()) && dateKey(completedDate) === todayKey
}

function tasksForToday() {
  return tasks.filter(task => belongsOnTodayList(task) && taskMatchesGoal(task))
}

function tasksForUpcoming(group: UpcomingGroup) {
  return tasks.filter(task => {
    if (!task.due || !taskMatchesGoal(task)) return false
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

function landingPeopleCard(name: string, role: string, description: string, column: number, row: number) {
  return `
    <article class="landing-people-card">
      <div class="landing-person" style="--portrait-column:${column};--portrait-row:${row};background-image:url('${peopleCollage}')"></div>
      <h3>${escapeHtml(name)}</h3>
      <p>${escapeHtml(role)}</p>
      <small>${escapeHtml(description)}</small>
    </article>
  `
}

function renderLanding() {
  return `
    <main class="shotcount-landing">
      <header class="landing-nav">
        <a class="landing-brand" href="/" aria-label="Shotcount home">SHOTCOUNT</a>
        <nav aria-label="Primary">
          <a href="#people">Product</a>
          <a href="#people">Community</a>
          <a href="#focus">Pricing</a>
          <a href="#focus">Download</a>
        </nav>
        <div class="landing-nav-actions">
          <a href="#focus" class="landing-link">Log in</a>
          <button type="button" class="landing-button" data-action="enter-app">Try Shotcount Free</button>
        </div>
      </header>

      <section class="landing-hero">
        <div class="landing-hero-copy">
          <p class="landing-eyebrow">FOCUS</p>
          <h1>Your space for goals, focus, and real progress</h1>
          <p>Shotcount turns distant goals into clear daily moves. Capture what matters, choose the next step, and keep moving without losing the bigger picture.</p>
          <div class="landing-hero-actions">
            <button type="button" class="landing-button landing-button--primary" data-action="enter-app">Try Shotcount Free</button>
            <a href="#people">See how people use Shotcount →</a>
          </div>
        </div>
        <div class="landing-hero-art">
          <img src="${heroCollage}" alt="A collage-style preview of the Shotcount workspace" />
        </div>
      </section>

      <section id="people" class="landing-people">
        <h2>How people use Shotcount</h2>
        <div class="landing-people-rail">
          ${landingPeopleCard('David', 'researcher', 'Proposals, papers, training, and the next brave step', 0, 0)}
          ${landingPeopleCard('Amara', 'founder', 'Company priorities, decisions, and quick follow-through', 1, 0)}
          ${landingPeopleCard('Seoyoung', 'creator', 'Creative ideas, plans, projects, scripts', 2, 0)}
          ${landingPeopleCard('Leila', 'product designer', 'Design practice, team rituals, learning, and long-term craft', 0, 1)}
          ${landingPeopleCard('James', 'writer', 'Book chapters, reading, health, and a life beyond deadlines', 1, 1)}
          ${landingPeopleCard('Aaron', 'student', 'Course notes, project outlines, daily tasks', 2, 1)}
        </div>
      </section>

      <section id="focus" class="landing-feature">
        <div class="landing-feature-copy">
          <p class="landing-eyebrow">FOCUS</p>
          <h2>From a big ambition to today’s next move</h2>
          <p>Shotcount turns distant goals into clear daily actions. Capture what matters, choose the next step, and keep moving without losing the larger story.</p>
        </div>
        <div class="landing-feature-card">
          <div class="landing-task-card">
            <span>Today</span>
            <strong>What matters now</strong>
            <ul>
              <li><i></i>Finish fellowship proposal</li>
              <li><i></i>Prepare the experiment</li>
              <li class="checked"><i></i>Morning run</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="landing-cta">
        <h2>Make the next small step obvious.</h2>
        <button type="button" class="landing-button landing-button--primary" data-action="enter-app">Try Shotcount Free</button>
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
  const showInspector = !creatorTodayState &&
    selectedInView &&
    !todayComposerOpen &&
    (!isPhone || mobileInspectorOpen)
  const creatorSelected = creatorTodayState?.tasks.find(task => task.id === selectedCreatorTaskId) ?? creatorTodayState?.tasks[0]
  const showCreatorInspector = Boolean(creatorTodayState?.status === 'ready' && creatorSelected && (!isPhone || mobileInspectorOpen))
  app.innerHTML = `
    <div class="reference-app ${showInspector || showCreatorInspector ? 'with-inspector' : ''}">
      ${authRequired ? renderSyncStatus() : ''}
      ${renderNotificationBell()}
      ${renderSidebar()}
      <main class="workspace">
        ${renderMobileTopbar()}
        ${creatorTodayState ? renderCreatorTodayView(creatorTodayState) : view === 'today' ? renderToday() : view === 'upcoming' ? renderUpcoming() : view === 'calendar' ? renderCalendar() : renderStickyWall()}
      </main>
      ${showInspector && selected ? renderInspector(selected) : ''}
      ${showCreatorInspector && creatorSelected ? renderCreatorInspector(creatorSelected) : ''}
    </div>
    <div class="toast ${toast ? 'show' : ''}" role="status">${escapeHtml(toast)}</div>
    ${dynamicIslandEnabled ? renderAgentIsland() || renderShotcountIsland() : ''}
    ${renderDailyPlanningPrompt()}
    ${renderProfileModal()}
    ${renderRoonPlanner()}
    ${renderFilePreview()}
  `
  const nextInspectorContent = app.querySelector<HTMLElement>('.inspector-content')
  if (nextInspectorContent && inspectorScroll !== undefined) nextInspectorContent.scrollTop = inspectorScroll
  if (pageScroll.x || pageScroll.y) window.scrollTo(pageScroll.x, pageScroll.y)
  if (isPhone) queueMicrotask(alignMobileScrollSurfaces)
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
          <button type="button" class="primary" data-action="plan-${dailyPlanningPrompt}">${isToday ? 'Make today’s list' : 'Make tomorrow’s list'}</button>
        </div>
      </section>
    </div>
  `
}

function resetRoonPlanner(targetDue = todayKey) {
  roonPlannerStage = 'goal'
  roonPlannerGoal = ''
  roonPlannerQuestion = ''
  roonPlannerClarification = ''
  roonPlannerError = ''
  roonPlannerTargetDue = targetDue
  roonPlanTasks = []
}

function captureRoonPlanDraft() {
  const items = document.querySelectorAll<HTMLElement>('[data-roon-plan-item]')
  for (const item of items) {
    const draft = roonPlanTasks.find(task => task.id === item.dataset.roonPlanItem)
    if (!draft) continue
    draft.title = item.querySelector<HTMLInputElement>('input[name="title"]')?.value.trim() ?? draft.title
    draft.description = item.querySelector<HTMLTextAreaElement>('textarea[name="description"]')?.value.trim() ?? draft.description
  }
}

async function requestRoonPlan() {
  if (!roonPlannerGoal.trim()) return
  roonPlannerStage = 'loading'
  roonPlannerError = ''
  render()
  try {
    const plan = await generateRoonPlan(roonPlannerGoal.trim(), roonPlannerClarification.trim())
    if (plan.tasks.length) {
      roonPlanTasks = plan.tasks.map(task => ({ ...task, id: crypto.randomUUID() }))
      roonPlannerQuestion = ''
      roonPlannerStage = 'preview'
    } else if (plan.clarification.trim()) {
      roonPlannerQuestion = plan.clarification.trim()
      roonPlannerStage = 'clarification'
    } else {
      throw new Error('Roon could not turn that outcome into tasks.')
    }
  } catch (error) {
    roonPlannerStage = roonPlannerClarification ? 'clarification' : 'goal'
    roonPlannerError = error instanceof Error ? error.message : 'Roon could not prepare that plan.'
  }
  render()
}

function createRoonPlanTasks() {
  captureRoonPlanDraft()
  const created = roonPlanTasks
    .filter(task => task.title.trim() && task.description.trim())
    .map(task => normalizeTask({
      id: crypto.randomUUID(),
      title: task.title.trim(),
      description: task.description.trim(),
      goalId: activeGoalId ?? undefined,
      due: roonPlannerTargetDue,
      visibility: defaultTaskVisibility(),
      subtaskItems: [],
    }))
  if (!created.length) return
  tasks.unshift(...created)
  selectedTaskId = created[0]!.id
  mobileInspectorOpen = false
  roonPlannerOpen = false
  persistPlanner()
  refreshCounts()
  triggerHaptic([35, 30, 60])
  toast = `${created.length} task${created.length === 1 ? '' : 's'} created`
  resetRoonPlanner()
  render()
  window.setTimeout(() => {
    toast = ''
    render()
  }, 1600)
}

function renderRoonPlanner() {
  if (!roonPlannerOpen) return ''
  const loading = roonPlannerStage === 'loading'
  return `
    <div class="roon-planner-popover" role="presentation">
      <button type="button" class="roon-planner-backdrop" data-action="close-roon-planner" aria-label="Close Ask Roon"></button>
      <section class="roon-planner-card" role="dialog" aria-modal="true" aria-labelledby="roon-planner-title">
        <button type="button" class="roon-planner-close" data-action="close-roon-planner" aria-label="Close Ask Roon">×</button>
        <header>
          <span class="agent-icon-wrap">${agentSparkleIcon()}</span>
          <div><h2 id="roon-planner-title">Ask Roon</h2><p>Turn an outcome into tasks.</p></div>
        </header>
        ${roonPlannerStage === 'goal' || loading ? `
          <form class="roon-goal-form" data-roon-goal-form>
            <label for="roon-goal">What are you trying to get done?</label>
            <textarea id="roon-goal" name="goal" maxlength="2000" placeholder="I want to win a fully funded scholarship to study abroad." ${loading ? 'disabled' : ''}>${escapeHtml(roonPlannerGoal)}</textarea>
            ${roonPlannerError ? `<p class="roon-planner-error" role="alert">${escapeHtml(roonPlannerError)}</p>` : ''}
            <button type="submit" ${loading ? 'disabled' : ''}>${loading ? 'Making a plan…' : 'Generate tasks'}</button>
          </form>
        ` : roonPlannerStage === 'clarification' ? `
          <form class="roon-clarification-form" data-roon-clarification-form>
            <p>${escapeHtml(roonPlannerQuestion)}</p>
            <input name="clarification" maxlength="1000" value="${escapeHtml(roonPlannerClarification)}" autocomplete="off" required />
            ${roonPlannerError ? `<p class="roon-planner-error" role="alert">${escapeHtml(roonPlannerError)}</p>` : ''}
            <button type="submit">Generate tasks</button>
          </form>
        ` : `
          <form class="roon-plan-form" data-roon-plan-form>
            <div class="roon-plan-heading"><strong>Your plan</strong><span>Edit or remove anything before creating it.</span></div>
            <div class="roon-plan-list">
              ${roonPlanTasks.map((task, index) => `
                <article class="roon-plan-item" data-roon-plan-item="${task.id}">
                  <span>${index + 1}</span>
                  <div>
                    <input name="title" aria-label="Task ${index + 1} title" maxlength="90" value="${escapeHtml(task.title)}" required />
                    <details>
                      <summary>Description</summary>
                      <textarea name="description" aria-label="Task ${index + 1} description" maxlength="1200" required>${escapeHtml(task.description)}</textarea>
                    </details>
                  </div>
                  <button type="button" data-action="remove-roon-plan-task" data-plan-task-id="${task.id}" aria-label="Remove ${escapeHtml(task.title)}">×</button>
                </article>
              `).join('')}
            </div>
            <div class="roon-plan-actions">
              <button type="button" data-action="restart-roon-planner">Back</button>
              <button type="submit" ${roonPlanTasks.length ? '' : 'disabled'}>Create Tasks</button>
            </div>
          </form>
        `}
      </section>
    </div>
  `
}

function renderNotificationBell() {
  const enabled = browserPushStatus === 'enabled'
  const label = enabled ? 'Browser alerts are on' : browserPushBusy ? 'Turning on browser alerts' : 'Enable browser alerts'
  return `<button type="button" class="notification-bell ${authRequired ? 'has-sync' : ''} ${enabled ? 'is-enabled' : ''} ${browserPushBusy ? 'is-busy' : ''}" data-action="notification-bell" aria-label="${label}" aria-pressed="${enabled}">${icon('bell')}<i aria-hidden="true"></i></button>`
}

function renderShotcountIsland() {
  if (!islandCompletions.length) return ''
  const first = islandCompletions[0]!
  const profile = communityProfiles.find(item => item.id === first.creatorId)
  const many = islandCompletions.length > 1
  const firstName = first.displayName.trim().split(/\s+/)[0] || first.displayName
  const taskTitle = first.taskTitle || 'Today’s Shotcount'
  const message = many
    ? `${firstName} and ${islandCompletions.length - 1} ${islandCompletions.length === 2 ? 'other' : 'others'} completed today`
    : `${first.displayName} completed ${taskTitle}`
  const initial = first.displayName.trim().charAt(0).toUpperCase() || 'S'
  const portraitStyle = profile ? `--portrait-column:${profile.portraitColumn};--portrait-row:${profile.portraitRow};--community-portrait:url(&quot;${communityPortraits}&quot;)` : ''
  return `
    <button type="button" class="shotcount-island ${many ? 'is-batch' : ''}" data-action="open-island" aria-label="${escapeHtml(message)}. ${first.completedCount} of ${first.totalCount} tasks complete. Open ${escapeHtml(first.displayName)}’s Today screen">
      <span class="island-head">
        <span class="island-portrait portrait-frame" style="${portraitStyle}">
          ${first.avatarUrl ? `<img src="${escapeHtml(first.avatarUrl)}" alt="" />` : profile ? '<span class="community-portrait-art" aria-hidden="true"></span>' : `<span class="island-initial">${escapeHtml(initial)}</span>`}
        </span>
        <span class="island-identity">
          <small>${many ? `${islandCompletions.length} PEOPLE FINISHED` : 'SHOTCOUNT COMPLETE'}</small>
          <strong>${many ? escapeHtml(message) : escapeHtml(first.displayName)}</strong>
          <span>${many ? 'Tap to open the first update' : `@${escapeHtml(first.username)}`}</span>
        </span>
        <span class="island-result"><strong>${many ? islandCompletions.length : `${first.completedCount}/${first.totalCount}`}</strong><small>${many ? 'PEOPLE' : 'DONE'}</small></span>
      </span>
      <span class="island-task">
        <span class="island-task-check" aria-hidden="true">✓</span>
        <span><small>${many ? `${escapeHtml(firstName)}’S LAST TASK` : 'TASK COMPLETED'}</small><strong>${escapeHtml(taskTitle)}</strong></span>
        <span class="island-task-arrow" aria-hidden="true">›</span>
      </span>
      <span class="island-open">View ${escapeHtml(firstName)}’s Today <b aria-hidden="true">↗</b></span>
    </button>
  `
}

function renderAgentIsland() {
  if (isPreviewMode && !previewParams.has('previewAgentIsland')) return ''
  const priority: Partial<Record<AgentRun['status'], number>> = {
    needs_approval: 0,
    waiting_for_user: 1,
    waiting_external: 2,
    running: 3,
    planning: 4,
    completed: 5,
  }
  const candidate = [...agentRuns.values()]
    .filter(run => run.status in priority)
    .filter(run => run.status !== 'completed' || Date.now() - Date.parse(run.updatedAt) < 5 * 60 * 1000)
    .sort((left, right) =>
      (priority[left.status] ?? 99) - (priority[right.status] ?? 99) ||
      right.updatedAt.localeCompare(left.updatedAt)
    )[0]
  if (!candidate) return ''
  const task = tasks.find(item => item.id === candidate.taskId)
  if (!task) return ''
  const owner = specialistForTask(task, candidate)
  const ownerName = owner?.displayName ?? 'ShotCount'
  const ownerUpper = ownerName.toLocaleUpperCase()
  const labels: Partial<Record<AgentRun['status'], { eyebrow: string; title: string; message: string; mark: string }>> = {
    needs_approval: {
      eyebrow: 'APPROVAL NEEDED',
      title: `${ownerName} needs you`,
      message: candidate.waitingReason || 'Review the prepared action.',
      mark: '!',
    },
    waiting_for_user: {
      eyebrow: 'ACTION NEEDED',
      title: `${ownerName} needs you`,
      message: candidate.waitingReason || 'Open the task to continue.',
      mark: '!',
    },
    waiting_external: {
      eyebrow: `${ownerUpper} IS WAITING`,
      title: 'Waiting for a reply',
      message: candidate.waitingReason || 'I’ll continue automatically.',
      mark: '…',
    },
    planning: {
      eyebrow: `${ownerUpper} IS WORKING`,
      title: 'Planning the task',
      message: candidate.progress.at(-1) || 'Preparing the next safe step.',
      mark: '◔',
    },
    running: {
      eyebrow: `${ownerUpper} IS WORKING`,
      title: 'Moving your task forward',
      message: candidate.progress.at(-1) || 'Working through the task.',
      mark: '◔',
    },
    completed: {
      eyebrow: `${ownerUpper} FINISHED`,
      title: 'Done',
      message: candidate.result?.summary || 'The task reached its intended outcome.',
      mark: '✓',
    },
  }
  const state = labels[candidate.status]
  if (!state) return ''
  return `<button type="button" class="shotcount-island shotcount-agent-island" data-agent-island-task="${task.id}" aria-label="${escapeHtml(state.title)}. Open ${escapeHtml(task.title)}">
    <span class="island-head">
      <span class="island-portrait agent-island-mark specialist-icon specialist-icon--${owner?.id ?? 'roon'}"><span class="agent-icon-wrap">${agentSparkleIcon()}</span></span>
      <span class="island-identity">
        <small>${state.eyebrow}</small>
        <strong>${escapeHtml(state.title)}</strong>
        <span>${escapeHtml(owner?.roleDescription ?? '')} · ${escapeHtml(task.title)}</span>
      </span>
      <span class="island-result"><strong>${state.mark}</strong><small>AGENT</small></span>
    </span>
    <span class="island-task">
      <span class="island-task-check" aria-hidden="true">${state.mark}</span>
      <span><small>CURRENT STATUS</small><strong>${escapeHtml(state.message)}</strong></span>
      <span class="island-task-arrow" aria-hidden="true">›</span>
    </span>
    <span class="island-open">Open task <b aria-hidden="true">↗</b></span>
  </button>`
}

function renderCreatorTodayView(state: CreatorTodayState) {
  const { profile } = state
  const total = state.tasks.length
  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name
  const initial = profile.name.trim().charAt(0).toUpperCase() || 'S'
  const muted = notificationPreferences.mutedCreatorIds.includes(profile.id)
  return `
    <section class="today-screen creator-today-screen">
      <header class="screen-title"><h1>Today</h1><span class="screen-count" data-count="${total}" aria-label="${total} shared tasks">${total}</span></header>
      <header class="add-task-row creator-context-row">
        <button type="button" class="creator-context-main" data-action="close-creator-today" aria-label="Back to Community">
          <span class="creator-mini-avatar">${profile.avatarUrl ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" />` : escapeHtml(initial)}</span>
          <span><strong>${escapeHtml(profile.name)}</strong><small>@${escapeHtml(profile.username)} · Back to Community</small></span>
        </button>
        <button type="button" class="creator-today-mute" data-mute-creator="${profile.id}" aria-pressed="${muted}">${muted ? 'Unmute alerts' : 'Mute alerts'}</button>
      </header>
      <div class="task-list">
        ${state.status === 'loading' ? '<div class="planner-empty"><strong>Opening today…</strong><p>This will only take a moment.</p></div>' : ''}
        ${state.status === 'failed' ? '<div class="planner-empty"><strong>Today could not open.</strong><p>Your own tasks are safe. Please try again.</p><button data-action="retry-creator-today">Try again</button></div>' : ''}
        ${state.status === 'ready' && !total ? `<div class="planner-empty"><strong>Nothing shared today.</strong><p>${escapeHtml(firstName)} has not shared a task with you yet.</p></div>` : ''}
        ${state.status === 'ready' ? state.tasks.map(renderSharedCreatorTask).join('') : ''}
      </div>
    </section>
  `
}

function renderSharedCreatorTask(task: SharedCreatorTask) {
  const completed = Boolean(task.completedAt)
  return `<div class="task-row creator-task-row ${completed ? 'completed' : ''}">
      <span class="checkbox creator-checkbox" role="img" aria-label="${completed ? 'Done' : 'Not done'}">
        <span class="completion-badge" aria-hidden="true"><svg viewBox="0 0 24 24">${completed
          ? `<path class="completion-seal" d="M12 1.8c1.2 0 1.8 1.3 2.9 1.6 1.1.3 2.2-.6 3.1.1.9.7.4 2.1 1.1 3 .7.9 2.2.8 2.6 1.9.4 1.1-.8 2-.8 3.2s1.2 2.1.8 3.2c-.4 1.1-1.9 1-2.6 1.9-.7.9-.2 2.3-1.1 3-.9.7-2-.2-3.1.1-1.1.3-1.7 1.6-2.9 1.6s-1.8-1.3-2.9-1.6c-1.1-.3-2.2.6-3.1-.1-.9-.7-.4-2.1-1.1-3-.7-.9-2.2-.8-2.6-1.9-.4-1.1.8-2 .8-3.2s-1.2-2.1-.8-3.2c.4-1.1 1.9-1 2.6-1.9.7-.9.2-2.3 1.1-3 .9-.7 2-.2 3.1-.1C10.2 3.1 10.8 1.8 12 1.8Z"/><path class="completion-check" d="m7.4 12.1 3 2.9 6.2-6.2"/>`
          : '<circle class="completion-ring" cx="12" cy="12" r="8.4"/>'}</svg></span>
      </span>
      <button class="task-text" data-creator-task="${task.id}"><strong>${escapeHtml(task.title)}</strong><small>
        ${task.due ? `<span>${icon('calendar')}${formatTaskDate(task.due)}${task.time ? ` · ${formatTaskTime(task.time)}` : ''}</span>` : ''}
        ${renderVisibilityIndicator(task.visibility)}
      </small></button>
      <button class="task-chevron" data-creator-task="${task.id}" aria-label="Open ${escapeHtml(task.title)}">${icon('chevron')}</button>
    </div>`
}

function renderCreatorInspector(task: SharedCreatorTask) {
  return `<aside class="inspector creator-inspector">
    <button type="button" class="inspector-close" data-action="close-inspector" aria-label="Close task details">${icon('chevron')}</button>
    <div class="inspector-content">
      <h2>Task:</h2>
      <div class="inspector-title creator-inspector-title">${escapeHtml(task.title)}</div>
      <h3>Details:</h3>
      <p class="creator-no-subtasks">${task.time ? `${formatTaskDate(task.due)} · ${formatTaskTime(task.time)}` : formatTaskDate(task.due)}</p>
      <p class="creator-readonly-note">Read only · ${visibilityLabels[task.visibility]}</p>
    </div>
  </aside>`
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

function profileInput(profile: CreatorProfile): CreatorProfileInput {
  return {
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    timezone: profile.timezone,
    defaultTaskVisibility: profile.defaultTaskVisibility,
  }
}

function profileInputWithAccountDefaults(profile: CreatorProfile, user = activeUser): CreatorProfileInput {
  const input = profileInput(profile)
  const defaults = profileDefaults(user)
  return {
    ...input,
    displayName: input.displayName || defaults.displayName,
    username: input.username || defaults.username,
    avatarUrl: input.avatarUrl || defaults.avatarUrl,
    timezone: !profile.onboardingCompleted && input.timezone === 'UTC' ? defaults.timezone : input.timezone,
  }
}

function captureProfileDraft(form = document.querySelector<HTMLFormElement>('[data-profile-form]')) {
  if (!form) return
  const data = new FormData(form)
  profileDraft = {
    ...profileDraft,
    displayName: String(data.get('displayName') ?? '').trimStart(),
    username: normalizeUsername(String(data.get('username') ?? '')),
    bio: String(data.get('bio') ?? '').slice(0, 140),
    timezone: String(data.get('timezone') ?? '').trim() || profileDraft.timezone,
    defaultTaskVisibility: normalizeTaskVisibility(data.get('defaultTaskVisibility')),
  }
}

function currentProfileMissingFields() {
  return missingCreatorProfileFields({
    ...profileDraft,
    avatarUrl: profilePhotoPreview || profileDraft.avatarUrl,
  })
}

function refreshProfileMissingMarkers() {
  const missing = new Set(currentProfileMissingFields())
  document.querySelectorAll<HTMLElement>('[data-profile-field]').forEach(field => {
    const isMissing = missing.has(field.dataset.profileField as CreatorProfileField)
    field.classList.toggle('is-missing', isMissing)
    const badge = field.querySelector<HTMLElement>('.profile-required')
    if (badge) badge.hidden = !isMissing
  })
}

function clearProfilePhotoPreview() {
  if (profilePhotoPreview.startsWith('blob:')) URL.revokeObjectURL(profilePhotoPreview)
  profilePhotoPreview = ''
  profilePhotoFile = null
}

function openProfileModal() {
  profileDraft = creatorProfile ? profileInputWithAccountDefaults(creatorProfile) : profileDraft
  profilePromptDismissed = false
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
  const missing = new Set(currentProfileMissingFields())
  const fieldState = (field: CreatorProfileField) => missing.has(field) ? ' is-missing' : ''
  const required = (field: CreatorProfileField) => `<small class="profile-required" ${missing.has(field) ? '' : 'hidden'} aria-label="required">*</small>`
  const creatorSlug = normalizeCreatorSlug(profileDraft.username)
  const creatorLink = creatorSlug ? `https://app.shotcount.app/${creatorSlug}` : ''
  return `
    <div class="profile-popover" role="presentation">
      <button type="button" class="profile-popover-backdrop" data-action="close-profile" aria-label="Close profile setup"></button>
      <section class="profile-popover-card" role="dialog" aria-modal="true" aria-labelledby="profile-popover-title">
        <button type="button" class="profile-popover-close" data-action="close-profile" aria-label="Close profile setup">×</button>
        <h2 id="profile-popover-title">Your profile</h2>
        <form class="profile-form" data-profile-form>
          <div class="profile-photo-row${fieldState('avatarUrl')}" data-profile-field="avatarUrl">
            <div class="profile-photo-preview" aria-hidden="true">
              ${photo ? `<img src="${escapeHtml(photo)}" alt="" />` : `<span>${escapeHtml(initial)}</span>`}
            </div>
            <label class="profile-photo-button">
              <span>${photo ? 'Change photo' : 'Add photo'} ${required('avatarUrl')}</span>
              <input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-profile-photo />
            </label>
          </div>
          <div class="profile-form-grid">
            <label class="${fieldState('displayName')}" data-profile-field="displayName">
              <span>Name ${required('displayName')}</span>
              <input name="displayName" autocomplete="name" maxlength="80" value="${escapeHtml(profileDraft.displayName)}" />
            </label>
            <label class="${fieldState('username')}" data-profile-field="username">
              <span>Username ${required('username')}</span>
              <div class="profile-username">
                <i>@</i>
                <input name="username" autocomplete="username" minlength="3" maxlength="30" pattern="[a-z0-9_]{3,30}" value="${escapeHtml(profileDraft.username)}" aria-describedby="profile-username-tip" />
                <button type="button" class="profile-info-tip" aria-label="Username help" aria-describedby="profile-username-tip">
                  <span aria-hidden="true">i</span>
                  <small class="profile-info-tooltip" id="profile-username-tip" role="tooltip">We suggested this from your name. You can change it.</small>
                </button>
              </div>
            </label>
            <label class="profile-form-wide${fieldState('bio')}" data-profile-field="bio">
              <span>Short bio ${required('bio')}</span>
              <div class="profile-textarea">
                <textarea name="bio" maxlength="140" rows="2" placeholder="What are you building?" aria-describedby="profile-bio-tip">${escapeHtml(profileDraft.bio)}</textarea>
                <button type="button" class="profile-info-tip" aria-label="Short bio help" aria-describedby="profile-bio-tip">
                  <span aria-hidden="true">i</span>
                  <small class="profile-info-tooltip" id="profile-bio-tip" role="tooltip">Example: “Designer at Kuda · 8k followers on X · Building tools for creators.”</small>
                </button>
              </div>
            </label>
            <label class="${fieldState('timezone')}" data-profile-field="timezone">
              <span>Timezone ${required('timezone')}</span>
              <input name="timezone" autocomplete="off" value="${escapeHtml(profileDraft.timezone)}" />
            </label>
            <label class="${fieldState('defaultTaskVisibility')}" data-profile-field="defaultTaskVisibility">
              <span>New tasks ${required('defaultTaskVisibility')}</span>
              <select name="defaultTaskVisibility" aria-label="Default task visibility">
                ${renderVisibilityOptions(profileDraft.defaultTaskVisibility)}
              </select>
            </label>
          </div>
          <section class="creator-launch-card" aria-labelledby="creator-launch-title">
            <strong id="creator-launch-title">Your creator link</strong>
            <div class="creator-link-row">
              <span>${creatorLink ? escapeHtml(creatorLink.replace('https://', '')) : 'Choose a username to make your link'}</span>
              <button type="button" data-action="copy-creator-link" ${creatorLink ? '' : 'disabled'}>Copy</button>
            </div>
          </section>
          <section class="creator-launch-card agent-google-card" aria-labelledby="agent-google-title">
            <div>
              <strong id="agent-google-title">Google execution</strong>
              <small>${googleAgentConnection?.status === 'connected'
                ? `Connected as ${escapeHtml(googleAgentConnection.accountEmail || 'your Google account')}`
                : 'Connect Gmail, Calendar, and Contacts for delegated tasks.'}</small>
            </div>
            <button type="button" data-action="connect-agent-google" ${googleAgentConnectionBusy ? 'disabled' : ''}>
              ${googleAgentConnectionBusy ? 'Opening…' : googleAgentConnection?.status === 'connected' ? 'Reconnect' : 'Connect'}
            </button>
          </section>
          <p class="profile-form-error" role="alert">${escapeHtml(profileError)}</p>
          <div class="profile-form-actions">
            <button type="button" data-action="close-profile">Not now</button>
            <button type="submit" ${profileBusy ? 'disabled' : ''}>${profileBusy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </form>
      </section>
    </div>
  `
}

function replacePlannerWorkspace(workspace: { tasks: Task[]; goals: Goal[] }) {
  tasks.splice(0, tasks.length, ...workspace.tasks.map(task => normalizeTask(task)))
  goals.splice(0, goals.length, ...workspace.goals.map(goal => normalizeGoal(goal)))
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

  return `
    <main class="workspace-auth-redirect" aria-live="polite">
      <span>S</span>
      <p>We could not check your login.</p>
      <button type="button" data-action="retry-auth">Try again</button>
      <a href="https://shotcount.app/?auth=signin">Go to sign in</a>
    </main>
  `
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
      const signInUrl = new URL('https://shotcount.app/')
      signInUrl.searchParams.set('auth', 'signin')
      if (pendingCreatorSlug) signInUrl.searchParams.set(creatorQueryKey, pendingCreatorSlug)
      window.location.replace(signInUrl.toString())
      return
    }
    // The PKCE callback uses a short-lived query code. Supabase has consumed
    // it by this point, so leave the signed-in workspace at its canonical URL.
    const authQuery = new URLSearchParams(window.location.search)
    if (authQuery.has('code') || authQuery.has('auth')) {
      const cleanUrl = new URL(window.location.href)
      cleanUrl.searchParams.delete('code')
      cleanUrl.searchParams.delete('auth')
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}`)
    }
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
    const [workspace, profileResult, communityResult, googleEventsResult, googleStateResult, agentRunsResult] = await Promise.all([
      plannerRepository.initialize({ tasks: [...tasks], goals: [...goals] }),
      loadCreatorProfile(user)
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: null })),
      loadCreatorDirectory()
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: [] as CommunityCreator[] })),
      loadGoogleCalendarEvents(user)
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: [] as GoogleCalendarEvent[] })),
      loadGoogleCalendarSyncState(user)
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: { status: 'idle', lastSyncedAt: null, message: '' } as GoogleCalendarSyncState })),
      loadAgentRuns()
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: [] as AgentRun[] })),
    ])
    replacePlannerWorkspace(workspace)
    if (profileResult.ok) {
      creatorProfile = profileResult.value
      profileDraft = creatorProfile ? profileInputWithAccountDefaults(creatorProfile, user) : profileDefaults(user)
      profilePromptDismissed = false
      profileModalOpen = !isCreatorProfileComplete(profileDraft)
      resetTodayComposerDraft()
    }
    if (communityResult.ok) applyCommunityDirectory(communityResult.value)
    else communityState = 'failed'
    if (googleEventsResult.ok) googleCalendarEvents = googleEventsResult.value
    if (googleStateResult.ok) googleCalendarState = googleStateResult.value
    if (agentRunsResult.ok) {
      agentRuns.clear()
      agentRunsResult.value.forEach(run => agentRuns.set(run.taskId, run))
      persistAgentRuns()
    }
    void startNotificationSystem()
    void startAgentRunSystem()
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
    completionSubscription?.()
    completionSubscription = null
    agentRunSubscription?.()
    agentRunSubscription = null
    window.clearInterval(agentPollingTimer)
    agentPollingTimer = 0
    agentApprovals.clear()
    plannerRepository?.destroy()
    plannerRepository = null
    activeUser = null
    creatorProfile = null
    clearProfilePhotoPreview()
    window.localStorage.removeItem(plannerStorageKey)
    window.localStorage.removeItem(goalsStorageKey)
    await signOutCloud()
  } finally {
    window.location.replace('https://shotcount.app/?auth=signin')
  }
}

async function refreshSignedInProfile() {
  if (!activeUser || profileModalOpen || profileBusy) return
  try {
    const latest = await loadCreatorProfile(activeUser)
    creatorProfile = latest
    profileDraft = latest ? profileInputWithAccountDefaults(latest, activeUser) : profileDefaults(activeUser)
    if (!profilePromptDismissed && !isCreatorProfileComplete(profileDraft)) profileModalOpen = true
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

function resolveCreatorIntent() {
  if (!pendingCreatorSlug) return
  const target = communityProfiles.find(profile => profile.username === pendingCreatorSlug)
  if (!target) {
    if (communityState === 'ready') {
      showTransientToast(`We could not find @${pendingCreatorSlug}.`)
      clearCreatorIntentFromUrl()
    }
    return
  }
  communityProfiles = [target, ...communityProfiles.filter(profile => profile.id !== target.id)]
  creatorLinkTargetId = target.id
  rememberView('sticky')
  if (target.id === activeUser?.id) {
    clearCreatorIntentFromUrl()
    return
  }
  if (target.followed) {
    showTransientToast(`You already follow ${target.name}.`)
    clearCreatorIntentFromUrl()
    void openCreatorToday(target)
    return
  }
  void updateCreatorFollowing(target, true).then(async followed => {
    if (!followed) return
    toast = `You’re now following ${target.name}`
    creatorLinkTargetId = target.id
    await openCreatorToday(target)
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1800)
  })
}

function applyCommunityDirectory(directory: CommunityCreator[]) {
  communityProfiles = directory.map(mapCommunityCreator)
  communityState = 'ready'
  resolveCreatorIntent()
}

async function refreshCommunityDirectory() {
  if (showDemoData) {
    communityState = 'ready'
    resolveCreatorIntent()
    return
  }
  communityState = 'loading'
  render()
  try {
    applyCommunityDirectory(await loadCreatorDirectory())
  } catch {
    communityState = 'failed'
  }
  render()
}

async function updateCreatorFollowing(profile: CommunityProfile, following: boolean) {
  if (communityBusyIds.has(profile.id)) return false
  communityBusyIds.add(profile.id)
  communityFollowError = ''
  render()
  try {
    if (!profile.isDemo) {
      if (!activeUser) throw new Error('Sign in before following a creator.')
      await setCreatorFollowing(profile.id, following)
    }
    profile.followed = following
    profile.followerCount = Math.max(0, profile.followerCount + (following ? 1 : -1))
    profile.members = formatFollowerCount(profile.followerCount)
    if (following && creatorLinkTargetId === profile.id) clearCreatorIntentFromUrl()
    return true
  } catch (error) {
    communityFollowError = error instanceof Error ? error.message : 'We could not update this follow.'
    return false
  } finally {
    communityBusyIds.delete(profile.id)
    render()
  }
}

function renderMobileTopbar() {
  const profilePhoto = creatorProfile?.avatarUrl || profileDraft.avatarUrl
  const profileInitial = (creatorProfile?.displayName || profileDraft.displayName).trim().charAt(0).toUpperCase() || 'S'
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
      'Make today’s list in Shotcount',
      'Take two minutes to choose today’s tasks.',
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
      'Plan tomorrow in Shotcount',
      'Take two minutes to choose tomorrow’s tasks.',
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
        ${navButton('sticky', 'Community', 'sticky')}
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

      <section class="side-section">
        <h2>Goals</h2>
        ${goals.map(renderGoalRow).join('')}
        ${goalComposerOpen ? renderGoalComposer() : `<button class="side-row add-side" data-action="open-goal-composer">${icon('plus')}<span>Add New Goal</span></button>`}
      </section>

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

function renderGoalRow(goal: Goal) {
  const count = tasks.filter(task => task.goalId === goal.id && !completedTaskIds.has(task.id)).length
  const active = activeGoalId === goal.id
  return `<button class="side-row goal-row ${active ? 'active' : ''}" data-goal-filter="${goal.id}" aria-pressed="${active}"><i class="list-color" style="--list-color:${goal.color}"></i><span>${escapeHtml(goal.name)}</span><b>${count}</b></button>`
}

function renderGoalComposer() {
  const suggestedColor = nextGoalColor()
  return `
    <form class="goal-composer" data-goal-form>
      <input name="name" aria-label="Goal name" placeholder="Goal name" autocomplete="off" required />
      <input name="color" aria-label="Goal color" type="color" value="${suggestedColor}" title="A fresh color is picked for you" />
      <button type="submit">Add</button>
      <button type="button" data-action="close-goal-composer" aria-label="Cancel">×</button>
    </form>
  `
}

function renderToday() {
  const allTodayTasks = sortTasks(tasksForToday())
  const carriedOverTasks = allTodayTasks.filter(task => !completedTaskIds.has(task.id) && task.due! < todayKey)
  const todayTasks = allTodayTasks.filter(task => !carriedOverTasks.includes(task))
  const hasTasks = allTodayTasks.length > 0
  return `
    <section class="today-screen">
      <header class="screen-title"><h1>Today</h1><span class="screen-count" data-count="${screenCounts.today}" aria-label="${screenCounts.today} open tasks">${screenCounts.today}</span></header>
      ${todayComposerOpen ? renderTodayComposer() : `<div class="today-command-row">
        <button class="add-task-row" data-action="add-task">${icon('plus')}<span>Add New Task</span></button>
        <button class="ask-shotcount-button" data-action="open-roon-planner"><span class="agent-icon-wrap">${agentSparkleIcon()}</span>Ask Roon</button>
      </div>`}
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
  const suggestedGoalColor = nextGoalColor()
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
            <div class="description-tools">
              <label class="description-attachment-input" aria-label="Add attachment">
                <input type="file" data-today-task-file accept="${acceptedTaskFileTypes.join(',')}">
                ${icon('paperclip')}
              </label>
              <button type="button" class="description-voice-input ${descriptionRecordingTaskId === 'today-composer' ? 'is-recording' : ''}" data-action="toggle-today-description-voice" aria-label="${descriptionRecordingTaskId === 'today-composer' ? 'Stop voice input' : descriptionTranscribingTaskId === 'today-composer' ? 'Transcribing description' : 'Add voice input to description'}" aria-pressed="${descriptionRecordingTaskId === 'today-composer'}" ${descriptionTranscribingTaskId === 'today-composer' ? 'disabled' : ''}>
                ${descriptionRecordingTaskId === 'today-composer' ? '<span aria-hidden="true">■</span>' : descriptionTranscribingTaskId === 'today-composer' ? '<span aria-hidden="true">…</span>' : icon('mic')}
              </button>
            </div>
          </div>
          ${todayComposerAttachment ? `<small class="today-composer-attachment">${icon('paperclip')}${escapeHtml(todayComposerAttachment.name)}</small>` : ''}
        </label>
        <label class="today-field today-goal-field">
          <span>Goal</span>
          <select name="goalId" aria-label="Goal">${renderGoalOptions(todayComposerDraft.goalId)}</select>
          ${todayGoalCreatorOpen ? `
            <div class="inline-goal-creator">
              <input name="newGoalName" aria-label="New goal name" placeholder="Goal name" autocomplete="off" />
              <input name="newGoalColor" aria-label="New goal color" type="color" value="${suggestedGoalColor}" title="A fresh color is picked for you" />
              <button type="button" data-action="create-inline-goal">Add</button>
              <button type="button" data-action="close-inline-goal" aria-label="Cancel">×</button>
            </div>
          ` : `
            <button type="button" class="inline-goal-trigger" data-action="open-inline-goal">
              ${icon('plus')}<span>Create new goal</span>
            </button>
          `}
        </label>
        <label class="today-field">
          <span>Due date</span>
          <input name="due" type="date" value="${escapeHtml(todayComposerDraft.due)}" min="${todayKey}" max="${weekEndKey}" required />
        </label>
        <label class="today-field">
          <span>Due time <small>Optional · reminder 15 min before</small></span>
          <input name="time" type="time" value="${escapeHtml(todayComposerDraft.time)}" />
        </label>
        <label class="today-field">
          <span>Visibility</span>
          <select name="visibility" aria-label="Task visibility" required>${renderVisibilityOptions(todayComposerDraft.visibility)}</select>
        </label>
      </div>
      <div class="today-composer-actions">
        <button type="button" data-action="close-today-composer">Cancel</button>
        <button type="submit">Add task</button>
      </div>
    </form>
  `
}

function resetTodayComposerDraft() {
  todayComposerAttachment = null
  todayComposerDraft = {
    title: '',
    description: '',
    goalId: activeGoalId ?? goals[0]?.id ?? '',
    due: todayKey,
    time: '',
    visibility: defaultTaskVisibility(),
  }
}

function captureTodayComposerDraft() {
  const form = document.querySelector<HTMLFormElement>('[data-today-form]')
  if (!form) return
  const data = new FormData(form)
  todayComposerDraft = {
    title: String(data.get('title') ?? ''),
    description: String(data.get('description') ?? ''),
    goalId: String(data.get('goalId') ?? goals[0]?.id ?? ''),
    due: String(data.get('due') ?? todayKey),
    time: String(data.get('time') ?? ''),
    visibility: normalizeTaskVisibility(data.get('visibility')),
  }
}

function renderGoalOptions(selectedId?: string) {
  return `<option value="" ${selectedId ? '' : 'selected'}>No goal</option>${goals.map(goal => `<option value="${goal.id}" ${goal.id === selectedId ? 'selected' : ''}>${escapeHtml(goal.name)}</option>`).join('')}`
}

const visibilityLabels: Record<TaskVisibility, string> = {
  private: 'Private',
  followers: 'Followers',
  public: 'Public',
}

function renderVisibilityOptions(selected?: TaskVisibility) {
  const current = normalizeTaskVisibility(selected)
  return (Object.keys(visibilityLabels) as TaskVisibility[])
    .map(value => `<option value="${value}" ${value === current ? 'selected' : ''}>${visibilityLabels[value]}</option>`)
    .join('')
}

function renderVisibilityIndicator(visibility?: TaskVisibility) {
  const current = normalizeTaskVisibility(visibility)
  const iconName = current === 'public' ? 'globe' : current === 'followers' ? 'plus' : 'lock'
  return `<span class="task-visibility-icon task-visibility-icon--${current}" aria-label="${visibilityLabels[current]}" title="${visibilityLabels[current]}">${icon(iconName)}</span>`
}

function renderTaskRow(task: Task, selected = false) {
  const goal = goals.find(item => item.id === task.goalId)
  const completed = completedTaskIds.has(task.id)
  const subtaskCount = task.subtaskItems?.length ?? task.subtasks ?? 0
  return `
    <div class="task-row ${selected ? 'selected' : ''} ${completed ? 'completed' : ''}">
      <button class="checkbox" data-complete="${task.id}" aria-label="${completed ? 'Mark as not done' : 'Mark as done'}: ${escapeHtml(task.title)}" aria-pressed="${completed}">
        <span class="completion-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            ${completed
              ? `<path class="completion-seal" d="M12 1.8c1.2 0 1.8 1.3 2.9 1.6 1.1.3 2.2-.6 3.1.1.9.7.4 2.1 1.1 3 .7.9 2.2.8 2.6 1.9.4 1.1-.8 2-.8 3.2s1.2 2.1.8 3.2c-.4 1.1-1.9 1-2.6 1.9-.7.9-.2 2.3-1.1 3-.9.7-2-.2-3.1.1-1.1.3-1.7 1.6-2.9 1.6s-1.8-1.3-2.9-1.6c-1.1-.3-2.2.6-3.1-.1-.9-.7-.4-2.1-1.1-3-.7-.9-2.2-.8-2.6-1.9-.4-1.1.8-2 .8-3.2s-1.2-2.1-.8-3.2c.4-1.1 1.9-1 2.6-1.9.7-.9.2-2.3 1.1-3 .9-.7 2 .2 3.1-.1C10.2 3.1 10.8 1.8 12 1.8Z"/><path class="completion-check" d="m7.4 12.1 3 2.9 6.2-6.2"/>`
              : `<circle class="completion-ring" cx="12" cy="12" r="8.4"/>`}
          </svg>
        </span>
      </button>
      <button class="task-text" data-task="${task.id}">
        <strong>${escapeHtml(task.title)}</strong>
        <small>
          ${task.due ? `<span>${icon('calendar')}${formatTaskDate(task.due)}${task.time ? ` · ${formatTaskTime(task.time)}` : ''}</span>` : ''}
          ${task.due && subtaskCount ? `<span><b>${subtaskCount}</b> Subtasks</span>` : ''}
          ${goal ? `<span><i class="list-color" style="--list-color:${goal.color}"></i>${escapeHtml(goal.name)}</span>` : ''}
          ${!task.due && subtaskCount ? `<span><b>${subtaskCount}</b> Subtasks</span>` : ''}
          ${renderVisibilityIndicator(task.visibility)}
        </small>
      </button>
      ${renderTaskTrailingAction(task)}
    </div>
  `
}

function renderTaskTrailingAction(task: Task) {
  const agentAction = renderAgentPill(task)
  if (agentAction) return `<div class="task-trailing-action">${agentAction}</div>`
  return `<button class="task-chevron" data-task="${task.id}" aria-label="Open ${escapeHtml(task.title)}">${icon('chevron')}</button>`
}

function taskIsExecutableToday(task: Task) {
  return Boolean(task.due && task.due <= todayKey)
}

function renderAgentPill(task: Task) {
  const run = agentRuns.get(task.id)
  if (!taskIsExecutableToday(task)) return ''
  const route = taskSpecialistRoute(task)
  if (!run && !route.supported && !roonCapabilityForTask(task)) return ''
  const owner = specialistForTask(task, run)
  const ownerName = owner?.displayName ?? 'ShotCount'
  const displayStatus = isPreviewMode && previewAgentState !== 'error' && run?.status === 'failed' ? 'running' : run?.status
  // Task completion is already shown by the normal checkbox. Do not add a
  // second Roon-specific completion control to the same row.
  if (displayStatus === 'completed') return ''
  const label =
    displayStatus === 'planning' || displayStatus === 'running' ? 'In progress' :
        displayStatus === 'needs_approval' ? 'Approval needed' :
          displayStatus === 'waiting_external' ? 'Waiting' :
            displayStatus === 'waiting_for_user' ? 'Needs you' :
        displayStatus === 'needs_context' ? 'Needs context' :
          displayStatus === 'failed' ? 'Needs attention' :
            'Delegate'
  const mark = displayStatus === 'planning' || displayStatus === 'running' ? '<span aria-hidden="true">◔</span>' :
      ['needs_approval', 'waiting_for_user', 'failed'].includes(displayStatus ?? '') ? '<span class="agent-state-alert" aria-hidden="true">!</span>' :
      `<span class="agent-icon-wrap">${agentSparkleIcon()}</span>`
  return `<button type="button" class="task-agent-icon task-agent-icon--${displayStatus ?? 'available'} specialist-icon specialist-icon--${owner?.id ?? 'unassigned'}" data-agent-task="${task.id}" aria-label="${escapeHtml(ownerName)} — ${label}: ${escapeHtml(task.title)}" title="${escapeHtml(ownerName)} — ${label}">${mark}</button>`
}

function safeAgentUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? escapeHtml(url.toString()) : '#'
  } catch {
    return '#'
  }
}

function safeAgentHandoffUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLocaleLowerCase()
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      hostname !== 'localhost' &&
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i.test(hostname)
      ? escapeHtml(url.toString())
      : ''
  } catch {
    return ''
  }
}

function renderAgentProgressPanel(task: Task, progressIndex: number, placeholder = false, run?: AgentRun) {
  // Provider/realtime retries can report the same checkpoint more than once.
  // Keep the feed stable rather than visually replaying an already shown step.
  const completedProgress = (run?.progress.filter(Boolean) ?? []).filter((label, index, steps) =>
    index === 0 || label !== steps[index - 1],
  )
  const fallbackLabels = isApplicationIntent(task.title, task.description)
    ? applicationProgressLabels
    : placeholder ? agentPreviewProgressLabels : agentProgressLabels
  const currentLabel = run?.status === 'planning'
    ? 'Planning the next safe step'
    : run?.status === 'waiting_external'
      ? 'Monitoring for the next update'
      : 'Continuing the task'
  const progressLabels = completedProgress.length
    ? [...completedProgress.slice(-3), currentLabel]
    : fallbackLabels
  const activeIndex = completedProgress.length ? progressLabels.length - 1 : progressIndex
  const owner = specialistForTask(task, run)
  const ownerMessage = owner?.id === 'caspian'
    ? 'I’m checking live flights and comparing the best matches.'
    : owner?.id === 'david'
      ? 'I’m organizing the application requirements, deadlines, and missing documents.'
      : ''
  const canCheckExternalWork = run?.status === 'waiting_external' && !placeholder
  const checkExternalBusy = canCheckExternalWork && agentDecisionBusy.has(run?.id ?? '')
  const capabilityMessage: Record<string, string> = {
    gmail: 'I’m reviewing the relevant Gmail threads and preparing the next safe step.',
    calendar: 'I’m checking your calendar and looking for a conflict-free next step.',
    scheduling: 'I’m checking availability and preparing the scheduling outreach.',
    flight_search: 'I’m checking live flights and comparing the best matches.',
    browser: 'I’m working through the relevant website for you.',
    draft: 'I’m preparing the requested draft for your review.',
    research_draft: 'I’m researching and preparing the requested draft.',
    research: 'I’m reading and summarizing the relevant material for you.',
  }
  return `<section class="task-agent-card task-agent-card--progress${placeholder ? ' task-agent-card--placeholder' : ''}">
    <header>${specialistHeader(task, run)}<em><i aria-hidden="true">◔</i> In progress</em></header>
    <p>${placeholder ? 'I’m reading and summarizing the report for you.' : escapeHtml(ownerMessage || (capabilityMessage[run?.capability ?? 'research'] ?? capabilityMessage.research))}</p>
    <div class="task-agent-progress">
      ${progressLabels.map((label, index) => `<div class="${index < activeIndex ? 'done' : index === activeIndex ? 'active' : ''}"><i>${index < activeIndex ? '✓' : index === activeIndex ? '◔' : ''}</i><span>${escapeHtml(label)}</span></div>`).join('')}
    </div>
    ${renderRoonGeneratedFiles(task)}
    <footer><button type="button" data-action="view-agent-progress" data-task-id="${task.id}">View progress</button>${canCheckExternalWork ? `<button class="agent-primary" type="button" data-action="poll-agent" data-task-id="${task.id}" ${checkExternalBusy ? 'disabled' : ''}>${checkExternalBusy ? 'Checking…' : 'Check now'}</button>` : ''}<button type="button" data-action="cancel-agent" data-task-id="${task.id}">Cancel</button></footer>
  </section>
  <aside class="task-agent-notification">${icon('bell')}<span>You’ll be notified when this is ready.</span></aside>`
}

function renderAgentErrorPanel(task: Task, error: string) {
  const needsSignIn = error.toLowerCase().includes('sign in')
  return `<section class="task-agent-card task-agent-card--error" role="alert">
    <header>${specialistHeader(task, agentRuns.get(task.id))}<em><i aria-hidden="true">!</i> Needs attention</em></header>
    <p>I couldn’t start this task.</p>
    <div class="task-agent-error-detail">
      <span aria-hidden="true">!</span>
      <div><strong>${needsSignIn ? 'Sign in required' : 'Something interrupted the task'}</strong><p>${escapeHtml(error)}</p></div>
    </div>
    ${renderRoonGeneratedFiles(task)}
    <footer><button type="button" data-action="cancel-agent" data-task-id="${task.id}">Dismiss</button><button class="agent-primary" type="button" data-action="retry-agent" data-task-id="${task.id}">Try again</button></footer>
  </section>
  <aside class="task-agent-notification task-agent-notification--error">${icon('bell')}<span>No task changes were made. You can safely try again.</span></aside>`
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
  const preparedValues = approvalPreviewValue(approval, 'prepared_values')
  const attachment = approvalPreviewValue(approval, 'attachment') as { name?: string; mime_type?: string; size?: number } | null
  const safety = approvalPreviewValue(approval, 'safety') as { warnings?: unknown } | null
  const busy = agentDecisionBusy.has(approval.id)
  const undoing = pendingEmailSends.has(approval.id)
  const confirmLabel = approval.kind === 'send_email'
    ? 'Send'
    : approval.kind === 'calendar_write'
      ? 'Confirm'
      : 'Submit'
  return `<section class="task-agent-card task-agent-card--approval">
    <header>${specialistHeader(task, agentRuns.get(task.id))}<em><i aria-hidden="true">!</i> Approval needed</em></header>
    <p>${escapeHtml(approval.title)}</p>
    <div class="task-agent-approval-detail">
      ${Array.isArray(recipients) && recipients.length ? `<dl><dt>To</dt><dd>${escapeHtml(recipients.join(', '))}</dd></dl>` : ''}
      ${Array.isArray(ccRecipients) && ccRecipients.length ? `<dl><dt>CC</dt><dd>${escapeHtml(ccRecipients.join(', '))}</dd></dl>` : ''}
      ${Array.isArray(bccRecipients) && bccRecipients.length ? `<dl><dt>BCC</dt><dd>${escapeHtml(bccRecipients.join(', '))}</dd></dl>` : ''}
      ${approval.kind === 'send_email' && attachment?.name ? `<dl><dt>Attachment</dt><dd>${escapeHtml(String(attachment.name))}${attachment.size ? ` (${Math.ceil(Number(attachment.size) / 1024)} KB)` : ''}</dd></dl>` : ''}
      ${approval.kind === 'calendar_write' && Array.isArray(calendarAttendees) && calendarAttendees.length ? `<dl><dt>Attendees</dt><dd>${escapeHtml(calendarAttendees.join(', '))}</dd></dl>` : ''}
      ${approval.kind === 'calendar_write' && typeof notifyAttendees === 'boolean' ? `<dl><dt>Notifications</dt><dd>${notifyAttendees ? 'Attendees will be notified.' : 'No attendee notifications.'}</dd></dl>` : ''}
      ${title || approval.kind === 'calendar_write' ? approval.kind === 'send_email'
        ? `<label class="task-agent-email-field"><span>Subject</span><input type="text" data-agent-email-subject="${task.id}" value="${escapeHtml(String(title))}" maxlength="998" aria-label="Email subject" ${busy || undoing ? 'disabled' : ''}></label>`
        : approval.kind === 'calendar_write'
          ? `<label class="task-agent-email-field"><span>Event <strong class="task-agent-review-value">${escapeHtml(String(title))}</strong></span><input type="text" data-agent-calendar-summary="${task.id}" value="${escapeHtml(String(title))}" maxlength="1000" aria-label="Calendar event title" ${busy ? 'disabled' : ''}></label>`
          : `<dl><dt>Event</dt><dd>${escapeHtml(String(title))}</dd></dl>` : ''}
      ${approval.kind === 'calendar_write' ? `<div class="task-agent-calendar-times"><label class="task-agent-email-field"><span>Starts <small>ISO 8601</small></span><input type="text" data-agent-calendar-start="${task.id}" value="${escapeHtml(String(startsAt ?? ''))}" maxlength="64" aria-label="Calendar event start" ${busy ? 'disabled' : ''}><output class="task-agent-review-value">${escapeHtml(String(startsAt ?? ''))}</output></label><label class="task-agent-email-field"><span>Ends <small>ISO 8601</small></span><input type="text" data-agent-calendar-end="${task.id}" value="${escapeHtml(String(endsAt ?? ''))}" maxlength="64" aria-label="Calendar event end" ${busy ? 'disabled' : ''}><output class="task-agent-review-value">${escapeHtml(String(endsAt ?? ''))}</output></label></div>` : startsAt ? `<dl><dt>When</dt><dd>${escapeHtml(String(startsAt))}${endsAt ? ` → ${escapeHtml(String(endsAt))}` : ''}</dd></dl>` : ''}
      ${destination ? `<dl><dt>Page</dt><dd>${escapeHtml(String(destination))}</dd></dl>` : ''}
      ${browserTarget ? `<dl><dt>Submit</dt><dd>${escapeHtml(String(browserTarget))}</dd></dl>` : ''}
      ${Array.isArray(preparedValues) ? preparedValues.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
        const value = item as Record<string, unknown>
        return `<dl><dt>${escapeHtml(String(value.field ?? 'Field'))}</dt><dd>${escapeHtml(String(value.value ?? ''))}</dd></dl>`
      }).join('') : ''}
      ${Array.isArray(safety?.warnings) && safety.warnings.length ? `<div class="task-agent-waiting-detail"><span>${escapeHtml(safety.warnings.join(' '))}</span></div>` : ''}
      ${approval.kind === 'calendar_write'
        ? `<label class="task-agent-email-field"><span>Description</span><textarea data-agent-calendar-description="${task.id}" rows="5" maxlength="12000" aria-label="Calendar event description" ${busy ? 'disabled' : ''}>${escapeHtml(String(body ?? ''))}</textarea></label>`
        : body ? approval.kind === 'send_email'
        ? `<label class="task-agent-email-field"><span>Message</span><textarea data-agent-email-body="${task.id}" rows="9" maxlength="20000" aria-label="Email body" ${busy || undoing ? 'disabled' : ''}>${escapeHtml(String(body))}</textarea></label><label class="task-agent-email-field"><span>Attachment <small>${attachment?.name ? 'Choose another to replace it' : 'Optional · from your computer'}</small></span><input type="file" data-agent-email-attachment="${task.id}" aria-label="Email attachment" ${busy || undoing ? 'disabled' : ''}></label>`
        : `<blockquote>${escapeHtml(String(body)).replaceAll('\n', '<br>')}</blockquote>` : browserEffect ? `<blockquote>${escapeHtml(String(browserEffect))}</blockquote>` : `<p>${escapeHtml(approval.summary)}</p>`}
    </div>
    <small>Only this exact action is approved. Any change requires a new review.</small>
    <footer>
      <button type="button" data-action="reject-agent-approval" data-task-id="${task.id}" ${(busy || undoing) ? 'disabled' : ''}>Not now</button>
      <button class="agent-primary" type="button" data-action="${undoing ? 'undo-email-send' : 'approve-agent-approval'}" data-task-id="${task.id}" ${busy ? 'disabled' : ''}>${undoing ? 'Undo send' : busy ? 'Working…' : confirmLabel}</button>
    </footer>
  </section>`
}

function renderAgentWaitingPanel(task: Task, run: AgentRun) {
  const external = run.status === 'waiting_external'
  const busy = agentDecisionBusy.has(run.id)
  const flightOptions = run.result?.flightOptions ?? []
  const paymentHandoffUrl = run.result?.paymentHandoffUrl
    ? safeAgentHandoffUrl(run.result.paymentHandoffUrl)
    : ''
  const flightTask = run.capability === 'flight_search'
  const flightCheckoutRequired = flightTask && run.intent.outcomeType === 'payment_handoff'
  const flightCheckoutReady = run.result?.flightCheckout?.paymentBoundaryReached === true
  const paymentHandoffAvailable = Boolean(paymentHandoffUrl && (!flightCheckoutRequired || flightCheckoutReady))
  const manualCheckoutStep = Boolean(paymentHandoffUrl && flightCheckoutRequired && !flightCheckoutReady && run.status === 'waiting_for_user')
  const flightHandoffLabel = 'Continue to payment'
  const awaitingFlightSelection = run.status === 'waiting_for_user' && flightOptions.length > 0 && !paymentHandoffAvailable && !manualCheckoutStep
  const staleFlightSelection = awaitingFlightSelection &&
    ['flight_option_invalid', 'flight_search_checkpoint_missing'].includes(run.errorCode ?? '')
  const needsGoogle = run.errorCode?.startsWith('google_') ||
    /connect google|reconnect google/i.test(run.waitingReason)
  const owner = specialistForTask(task, run)
  const ownerName = owner?.displayName ?? 'ShotCount'
  const title = external ? 'Waiting' : `${ownerName} needs you`
  const userFacingWaitingReason = flightTask && /live provider timed out after bounded recovery/i.test(run.waitingReason)
    ? 'The live flight site is taking too long. Your options are saved—choose one to try again.'
    : flightTask && /provider checkout is temporarily unavailable/i.test(run.waitingReason)
      ? 'The flight site is taking too long. Your itinerary and traveler details are saved.'
      : run.waitingReason
  const detail = external
    ? flightTask
      ? 'The isolated browser worker is continuing this same task. You can leave this screen.'
      : 'I’ll continue this same task automatically when the expected reply or external update arrives.'
    : 'Review the message below, then retry when you’re ready.'
  const replySimulation = agentDevMode && external && run.capability === 'scheduling'
    ? `<div class="task-agent-reply-simulation">
        <label for="agent-reply-simulation-${escapeHtml(run.id)}">Development reply</label>
        <textarea id="agent-reply-simulation-${escapeHtml(run.id)}" class="task-agent-simulated-reply" rows="2">Thursday at 2:30 PM works for me.</textarea>
        <button type="button" data-action="simulate-agent-reply" data-task-id="${task.id}" ${busy ? 'disabled' : ''}>${busy ? 'Resuming…' : 'Simulate reply'}</button>
      </div>`
    : ''
  return `<section class="task-agent-card task-agent-card--waiting">
    <header>${specialistHeader(task, run)}<em>${external ? 'Waiting' : 'Needs you'}</em></header>
    <p>${escapeHtml(userFacingWaitingReason || title)}</p>
    ${awaitingFlightSelection ? `
      <div class="task-agent-flight-options">
        ${flightOptions.map(option => `<button type="button" data-action="select-agent-flight" data-task-id="${task.id}" data-flight-option-id="${escapeHtml(option.id)}" ${busy ? 'disabled' : ''}>
          <span><strong>${escapeHtml(option.label)}</strong><em>${escapeHtml(option.price)}</em></span>
          <b>${escapeHtml(option.airline)}</b>
          <small>${escapeHtml(option.route)} · ${escapeHtml(option.stops)} · ${escapeHtml(option.duration)}</small>
        </button>`).join('')}
      </div>
      <small>Live prices can change. ${escapeHtml(ownerName)} rechecks the selected option before handing it back.</small>
    ` : paymentHandoffAvailable ? `
      <div class="task-agent-payment-handoff">
        <strong>Ready for you</strong>
        <span>Your itinerary is selected. Payment and the final purchase remain under your control.</span>
        <a class="agent-primary" href="${paymentHandoffUrl}" target="_blank" rel="noreferrer">${flightHandoffLabel}</a>
      </div>
    ` : manualCheckoutStep ? `
      <div class="task-agent-payment-handoff">
        <strong>Provider needs you</strong>
        <span>${escapeHtml(userFacingWaitingReason || 'Complete the provider step before payment can continue.')}</span>
        <a class="agent-primary" href="${paymentHandoffUrl}" target="_blank" rel="noreferrer">Open provider step</a>
      </div>
    ` : `<div class="task-agent-waiting-detail">${icon(external ? 'bell' : 'settings')}<span>${escapeHtml(external && flightTask && flightOptions.length ? 'Rechecking the selected itinerary. You can leave this screen.' : detail)}</span></div>`}
    ${replySimulation}
    ${renderRoonGeneratedFiles(task)}
    <footer>
      <button type="button" data-action="cancel-agent" data-task-id="${task.id}">Cancel</button>
     ${paymentHandoffAvailable || manualCheckoutStep ? '' : awaitingFlightSelection && !staleFlightSelection ? '' : `<button class="agent-primary" type="button" data-action="${needsGoogle ? 'connect-agent-google' : external ? 'poll-agent' : 'retry-agent'}" data-task-id="${task.id}" ${(busy || googleAgentConnectionBusy) ? 'disabled' : ''}>${googleAgentConnectionBusy ? 'Opening…' : busy ? 'Refreshing…' : needsGoogle ? 'Connect Google' : external ? 'Check now' : staleFlightSelection ? 'Refresh options' : 'Try again'}</button>`}
    </footer>
  </section>`
}

function agentFlightDetail(option: Record<string, unknown>) {
  const departureDate = String(option.departureDate ?? '').trim()
  const arrivalDate = String(option.arrivalDate ?? '').trim()
  const arrivalDayOffset = Number(option.arrivalDayOffset)
  return [
    String(option.airline ?? '').trim(),
    String(option.route ?? '').trim(),
    String(option.stops ?? '').trim(),
    String(option.duration ?? '').trim(),
    String(option.price ?? '').trim(),
    departureDate ? `departs ${departureDate}` : '',
    arrivalDate && arrivalDate !== departureDate ? `arrives ${arrivalDate}` : '',
    Number.isInteger(arrivalDayOffset) && arrivalDayOffset > 0
      ? `arrival +${arrivalDayOffset} day${arrivalDayOffset === 1 ? '' : 's'}`
      : '',
  ].filter(Boolean).join(' · ')
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

function renderAgentPanel(task: Task) {
  const run = agentRuns.get(task.id)
  if (!run || run.status === 'cancelled') return ''

  if (run.status === 'needs_context') {
    const contextPrompt = (run.waitingReason.trim() || 'Share the missing details so I can continue.')
      .replace(/\bRoon\b/gi, specialistName(task, run))
    const owner = specialistForTask(task, run)
    const ownerName = owner?.displayName ?? 'ShotCount'
    const canUseAttachedCv = isApplicationIntent(task.title, task.description) &&
      /NOT A REAL APPLICANT|authoritative CV/i.test(contextPrompt) &&
      (taskFileAssets.get(task.id) ?? []).some(asset => asset.source === 'task_upload' && asset.mimeType === 'application/pdf')
    const candidates = run.recipientResolution?.state === 'ambiguous'
      ? (run.recipientResolution.candidates ?? []).filter(candidate => candidate.email)
      : []
    const schedulingOptions = run.schedulingOptions ?? []
    const tripTypeOptions = run.capability === 'flight_search' && schedulingOptions.some(option =>
      /\b(?:one-way|round trip)\b/i.test(option.label),
    )
    const sopAuthoringOptions = isApplicationIntent(task.title, task.description) && schedulingOptions.length === 2 &&
      schedulingOptions.some(option => /human expert/i.test(option.label)) &&
      schedulingOptions.some(option => /(?:roon|david) draft/i.test(option.label))
    const sopAuthoringPrompt = `Your CV is my home turf: facts in, unfairly sharp tailoring out. An SOP deserves human editorial firepower for the final narrative. Want me to bring in a human application expert, or should ${ownerName} draft it? If we bring one in, I’ll quarterback the whole thing—brief them, handle the messages, drive the revisions, and get the final application pack submission-ready for your approval.`
    const formattedPrompt = formatAgentContextPrompt(sopAuthoringOptions ? sopAuthoringPrompt : contextPrompt)
    const asksForConfirmation = /\b(?:please\s+)?confirm\b/i.test(contextPrompt)
    const requestsAttachment = !sopAuthoringOptions && /\b(?:attach(?:ment)?|upload|file|document|CV|résumé|resume|passport|certificate|transcript)\b/i.test(contextPrompt)
    const hasDirectChoice = candidates.length > 0
    const needsFlightDescription = run.capability === 'flight_search' && !hasDirectChoice && !schedulingOptions.length
    const canReplyInPanel = !hasDirectChoice && !canUseAttachedCv
    const draft = roonContextDrafts.get(run.id) ?? ''
    const flightContext = run.capability === 'flight_search' && owner?.id === 'roon'
    const replyLabel = asksForConfirmation ? 'Your confirmation' : requestsAttachment ? 'Add a note (optional)' : flightContext ? 'Your answer' : 'Your reply'
    const replyPlaceholder = asksForConfirmation ? 'Confirm or correct these details' : requestsAttachment ? `Anything ${ownerName} should know about this file` : sopAuthoringOptions ? `Anything ${ownerName} should share with the expert` : tripTypeOptions ? 'Add a return date if needed' : schedulingOptions.length ? 'Enter another airport or city' : flightContext ? 'Type your answer' : `Write the details ${ownerName} needs`
    const attachmentHint = 'Roon checks it automatically once it is attached.'.replace('Roon', ownerName)
    const contextStatus = flightContext ? 'One detail at a time' : 'Needs context'
    return `<section class="task-agent-card task-agent-card--context">
      <header>${specialistHeader(task, run)}<em>${contextStatus}</em></header>
      ${formattedPrompt}
      ${flightContext ? '<small class="task-agent-context-hint">Roon asks the questions. Caspian continues as soon as you answer.</small>' : ''}
      ${candidates.length ? `<div class="task-agent-recipient-options">${candidates.map(candidate => `<button type="button" data-action="select-agent-recipient" data-task-id="${task.id}" data-recipient-email="${escapeHtml(candidate.email ?? '')}" ${agentDecisionBusy.has(run.id) ? 'disabled' : ''}><strong>${escapeHtml(candidate.name || run.recipientResolution?.recipient || 'Unknown recipient')}</strong><span>${escapeHtml(candidate.email ?? '')}</span></button>`).join('')}</div><small>Choose the person you mean. ${escapeHtml(ownerName)} will continue this same task.</small>` : schedulingOptions.length ? `<div class="task-agent-recipient-options">${schedulingOptions.map(option => `<button type="button" data-action="select-agent-schedule-option" data-task-id="${task.id}" data-schedule-option="${escapeHtml(option.value)}" ${agentDecisionBusy.has(run.id) ? 'disabled' : ''}><strong>${escapeHtml(option.label.replace(/Roon/gi, ownerName))}</strong><span>${sopAuthoringOptions ? 'Choose this path' : 'Use this option'}</span></button>`).join('')}</div><small>${sopAuthoringOptions ? `${escapeHtml(ownerName)} stays in the driver’s seat—from expert brief to final submission-ready pack.` : tripTypeOptions ? 'Choose your trip type, or add the return date below.' : `Choose an option, or give ${escapeHtml(ownerName)} a different airport or city below.`}</small>` : ''}
      ${canReplyInPanel ? `<label class="task-agent-context-input"><span>${replyLabel}</span><textarea class="task-agent-context" data-agent-context-input data-run-id="${run.id}" placeholder="${replyPlaceholder}" ${agentDecisionBusy.has(run.id) ? 'disabled' : ''}>${escapeHtml(draft)}</textarea></label>` : ''}
      ${requestsAttachment ? `<small class="task-agent-attachment-hint">Use the attachment control in Description to add the file. ${escapeHtml(attachmentHint)}</small>` : ''}
      <footer><button type="button" data-action="cancel-agent" data-task-id="${task.id}">Cancel</button>${candidates.length ? '' : canUseAttachedCv ? '<button class="agent-primary" type="button" data-action="use-attached-cv" data-task-id="' + task.id + '">Use attached CV</button>' : requestsAttachment ? '<button type="button" data-action="focus-task-description" data-task-id="' + task.id + '">Attach file</button><button class="agent-primary" type="button" data-action="check-attached-context" data-task-id="' + task.id + '">Check attachment</button>' : needsFlightDescription ? '<button type="button" data-action="focus-task-description" data-task-id="' + task.id + '">Add details</button><button class="agent-primary" type="button" data-action="submit-agent-context" data-task-id="' + task.id + '" ' + (agentDecisionBusy.has(run.id) ? 'disabled' : '') + '>Continue</button>' : '<button class="agent-primary" type="button" data-action="submit-agent-context" data-task-id="' + task.id + '" ' + (agentDecisionBusy.has(run.id) ? 'disabled' : '') + '>' + (asksForConfirmation ? 'Confirm' : 'Continue') + '</button>'}</footer>
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
    const flightHandoffUrl = run.capability === 'flight_search' && run.result.paymentHandoffUrl
      ? safeAgentHandoffUrl(run.result.paymentHandoffUrl)
      : ''
    const resultLabel = run.intent.outcomeType === 'external_change' || flightHandoffUrl ? 'Done' : 'Ready to review'
    const flightHandoffLabel = 'Continue to payment'
    const selectedFlight = run.result.selectedFlight && typeof run.result.selectedFlight === 'object'
      ? run.result.selectedFlight as Record<string, unknown>
      : null
    const selectedReturnFlight = run.result.selectedReturnFlight && typeof run.result.selectedReturnFlight === 'object'
      ? run.result.selectedReturnFlight as Record<string, unknown>
      : null
    const flightCheckout = run.result.flightCheckout && typeof run.result.flightCheckout === 'object'
      ? run.result.flightCheckout
      : null
    const preparedTravelerCount = Number(flightCheckout?.preparedTravelerCount ?? 0)
    const selectedFlightDetail = selectedFlight ? agentFlightDetail(selectedFlight) : ''
    const selectedReturnFlightDetail = selectedReturnFlight ? agentFlightDetail(selectedReturnFlight) : ''
    return `<section class="task-agent-card task-agent-card--result">
      <header>${specialistHeader(task, run)}<em>${resultLabel}</em></header>
      <p>${escapeHtml(run.result.summary)}</p>
      <div class="task-agent-result">
        ${flightHandoffUrl && selectedFlight ? `<article class="agent-selected-flight"><span>Selected flight</span><strong>${escapeHtml(String(selectedFlight.label ?? 'Your selected option'))}</strong><p>${escapeHtml(selectedFlightDetail || 'Ready to continue to payment.')}</p></article>` : ''}
        ${flightHandoffUrl && selectedReturnFlight ? `<article class="agent-selected-flight"><span>Return flight</span><strong>${escapeHtml(String(selectedReturnFlight.label ?? 'Selected return option'))}</strong><p>${escapeHtml(selectedReturnFlightDetail || 'Return leg included in the booking handoff.')}</p></article>` : ''}
        ${run.result.sections.map(section => `<article><strong>${escapeHtml(section.title)}</strong><p>${escapeHtml(section.body)}</p></article>`).join('')}
        ${run.result.drafts.map(draft => `<article class="agent-draft"><strong>${escapeHtml(draft.title)}</strong><p>${escapeHtml(draft.body).replaceAll('\n', '<br>')}</p></article>`).join('')}
      </div>
      ${renderRoonGeneratedFiles(task)}
      ${run.result.sources.length ? `<div class="agent-sources"><strong>Sources</strong>${run.result.sources.map(source => `<a href="${safeAgentUrl(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)} ↗</a>`).join('')}</div>` : ''}
      ${run.result.followUps.length ? `<div class="agent-followups"><strong>Suggested next actions</strong>${run.result.followUps.map(title => `<span>＋ ${escapeHtml(title)}</span>`).join('')}</div><button class="agent-add-followups" type="button" data-action="add-agent-followups" data-task-id="${task.id}">Add follow-up tasks</button>` : ''}
      ${run.result.applicationReviewUrl ? `<a class="agent-primary agent-review-application" href="${safeAgentUrl(run.result.applicationReviewUrl)}" target="_blank" rel="noreferrer">Review application</a>` : ''}
      ${flightHandoffUrl ? `<a class="agent-primary agent-review-application" href="${flightHandoffUrl}" target="_blank" rel="noreferrer">${flightHandoffLabel}</a><small>${preparedTravelerCount > 0 ? `${preparedTravelerCount} traveler${preparedTravelerCount === 1 ? '' : 's'} prepared. ` : ''}Payment and any purchase remain entirely yours.</small>` : ''}
      <small>Private to you · Agent context and output never appear in the community feed.</small>
    </section>`
  }

  if (run.status === 'failed') {
    if (
      run.capability === 'flight_search' &&
      (run.result?.flightOptions?.length ?? 0) > 0 &&
      !run.result?.selectedFlight
    ) {
      return renderAgentWaitingPanel(task, {
        ...run,
        status: 'waiting_for_user',
        waitingReason: run.error || 'Choose a saved itinerary to retry the provider handoff.',
      })
    }
    if (isPreviewMode && previewAgentState !== 'error') return renderAgentProgressPanel(task, 2, true)
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
    id: `${task.id}-subtask-${index}`,
    title: index === 0 ? 'Subtask' : `Subtask ${index + 1}`,
    completed: false,
  }))
  task.subtaskItems = subtasks
  const goal = goals.find(item => item.id === task.goalId)
  const recording = descriptionRecordingTaskId === task.id
  const transcribing = descriptionTranscribingTaskId === task.id
  const run = agentRuns.get(task.id)
  return `
    <aside class="inspector">
      <button type="button" class="inspector-close" data-action="close-inspector" aria-label="Close task details">${icon('chevron')}</button>
      <div class="inspector-content">
        <h2>Task:</h2>
        <input class="inspector-title" value="${escapeHtml(task.title)}" aria-label="Task title" />
        <div class="inspector-description-wrap">
          <textarea class="inspector-description" aria-label="Description" placeholder="Description" rows="3">${escapeHtml(task.description ?? '')}</textarea>
          <div class="description-tools">
            <label class="description-attachment-input ${taskFileAssetBusy.has(task.id) ? 'is-busy' : ''}" aria-label="${taskFileAssetBusy.has(task.id) ? 'Uploading attachment' : 'Add attachment'}">
              <input type="file" data-task-file-input="${task.id}" accept="${acceptedTaskFileTypes.join(',')}" ${taskFileAssetBusy.has(task.id) ? 'disabled' : ''}>
              ${taskFileAssetBusy.has(task.id) ? '<span aria-hidden="true">…</span>' : icon('paperclip')}
            </label>
            <button type="button" class="description-voice-input ${recording ? 'is-recording' : ''}" data-action="toggle-description-voice" aria-label="${recording ? 'Stop voice input' : transcribing ? 'Transcribing description' : 'Add voice input to description'}" aria-pressed="${recording}" ${transcribing ? 'disabled' : ''}>
              ${recording ? '<span aria-hidden="true">■</span>' : transcribing ? '<span aria-hidden="true">…</span>' : icon('mic')}
            </button>
          </div>
        </div>
        ${run?.capability === 'flight_search' ? '<small class="flight-context-hint">Roon will ask for missing trip or traveler details here, one question at a time.</small>' : ''}
        ${renderTaskAttachments(task)}
        ${renderInspectorRoonAction(task)}

        <div class="inspector-fields">
          <label><span>Goal</span><button data-action="cycle-goal">${escapeHtml(goal?.name ?? goals[0]?.name ?? 'No goal')} ${icon('down')}</button></label>
          <label><span>Due date</span><input class="inspector-date" type="date" value="${task.due ?? ''}" aria-label="Due date" /></label>
          <label><span>Due time · reminds 15 min before</span><input class="inspector-time" type="time" value="${task.time ?? ''}" aria-label="Due time, optional; reminder 15 minutes before" /></label>
          <label><span>Visibility</span><select class="inspector-visibility" data-task-visibility="${task.id}" aria-label="Task visibility" required>${renderVisibilityOptions(task.visibility)}</select></label>
        </div>

        ${renderAgentPanel(task)}

        <h3>Subtasks:</h3>
        ${subtaskComposerTaskId === task.id ? `
          <form class="subtask-composer" data-subtask-form="${task.id}">
            <input name="title" aria-label="Subtask title" placeholder="What needs doing?" autocomplete="off" required />
            <button type="submit">Add</button>
            <button type="button" data-action="cancel-subtask" aria-label="Cancel subtask">Cancel</button>
          </form>
        ` : `<button class="add-subtask" data-action="add-subtask">${icon('plus')}<span>Add New Subtask</span></button>`}
        ${subtasks.map(subtask => renderSubtask(task, subtask)).join('')}
      </div>
      <div class="inspector-actions">
        <button data-action="delete-task">Delete Task</button>
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
  const assets = (taskFileAssets.get(task.id) ?? []).filter(asset => asset.source !== 'roon_generated')
  const busy = taskFileAssetBusy.has(task.id)
  if (!assets.length) return ''
  return `<section class="task-attachments" aria-label="Task attachments">
    <div class="task-attachment-list">
      ${assets.map(asset => `<article class="task-attachment-chip">
        <span class="task-attachment-kind">${icon('paperclip')}</span>
        <button class="task-attachment-preview" type="button" data-action="preview-task-file" data-task-id="${task.id}" data-file-asset-id="${asset.id}" title="Open ${escapeHtml(asset.originalFilename)}" aria-label="Open ${escapeHtml(asset.originalFilename)}">${escapeHtml(asset.originalFilename)}</button>
        <label class="task-attachment-reuse" title="Make available to ${escapeHtml(specialistName(task, agentRuns.get(task.id)))} in future tasks"><input type="checkbox" data-action="toggle-file-reusable" data-task-id="${task.id}" data-file-asset-id="${asset.id}" ${asset.reusable ? 'checked' : ''} ${busy ? 'disabled' : ''}><span>Reuse</span></label>
        <button class="task-attachment-remove" type="button" data-action="remove-task-attachment" data-task-id="${task.id}" data-file-asset-id="${asset.id}" aria-label="Remove ${escapeHtml(asset.originalFilename)}" ${busy ? 'disabled' : ''}>×</button>
      </article>`).join('')}
    </div>
  </section>`
}

function renderRoonGeneratedFiles(task: Task) {
  const assets = (taskFileAssets.get(task.id) ?? []).filter(asset => asset.source === 'roon_generated')
  if (!assets.length) return ''
  const ownerName = specialistName(task, agentRuns.get(task.id))
  return `<section class="task-agent-files" aria-label="Files prepared by ${escapeHtml(ownerName)}">
    <header><strong>Prepared files</strong><span>${assets.length} ready</span></header>
    ${assets.map(asset => `<button type="button" data-action="preview-task-file" data-task-id="${task.id}" data-file-asset-id="${asset.id}" aria-label="Preview ${escapeHtml(asset.originalFilename)}">
      <span class="task-agent-file-icon">${icon('sticky')}</span>
      <span><b title="${escapeHtml(asset.originalFilename)}">${escapeHtml(asset.originalFilename)}</b><small>${fileKind(asset)}</small></span>
      <em>Ready</em>
    </button>`).join('')}
  </section>`
}

function renderFilePreview() {
  if (!filePreview) return ''
  const isPdf = filePreview.asset.mimeType === 'application/pdf'
  const isImage = filePreview.asset.mimeType.startsWith('image/')
  const isText = filePreview.asset.mimeType === 'text/plain'
  const canPreviewInline = isPdf || isImage || isText
  const previewTask = tasks.find(task => task.id === filePreview?.asset.taskId)
  const sourceLabel = filePreview.asset.source === 'roon_generated'
    ? `Prepared by ${specialistName(previewTask ?? { title: '', description: '' }, previewTask ? agentRuns.get(previewTask.id) : null)}`
    : 'Attachment'
  return `<div class="file-preview-backdrop" data-action="close-file-preview">
    <section class="file-preview-card" role="dialog" aria-modal="true" aria-labelledby="file-preview-title" data-action-stop>
      <header><div><small>${sourceLabel}</small><strong id="file-preview-title">${escapeHtml(filePreview.asset.originalFilename)}</strong></div><button type="button" data-action="close-file-preview" aria-label="Close preview">×</button></header>
      ${filePreview.url && canPreviewInline
        ? isImage
          ? `<div class="file-preview-image"><img alt="Preview of ${escapeHtml(filePreview.asset.originalFilename)}" src="${escapeHtml(filePreview.url)}"></div>`
          : `<iframe title="Preview of ${escapeHtml(filePreview.asset.originalFilename)}" src="${escapeHtml(filePreview.url)}"></iframe>`
        : `<div class="file-preview-notice"><strong>${filePreview.asset.mimeType.includes('wordprocessingml') ? 'DOCX preview' : 'Preview unavailable'}</strong><p>${escapeHtml(filePreview.message ?? 'Download this file to open it in its native app.')}</p></div>`}
      <footer><span>Private to you</span>${filePreview.url ? `<a href="${escapeHtml(filePreview.url)}" download="${escapeHtml(filePreview.asset.originalFilename)}">Download ${fileKind(filePreview.asset)}</a>` : ''}</footer>
    </section>
  </div>`
}

function renderInspectorRoonAction(task: Task) {
  const run = agentRuns.get(task.id)
  if (run && run.status !== 'failed' && run.status !== 'cancelled') return ''
  const route = taskSpecialistRoute(task)
  if (!route.supported && !roonCapabilityForTask(task)) return ''
  const owner = specialistForTask(task, run)
  const ownerName = owner?.displayName ?? 'ShotCount'
  return `<button type="button" class="inspector-roon-delegate" data-action="delegate-task" data-task-id="${task.id}"><span class="agent-icon-wrap specialist-icon specialist-icon--${owner?.id ?? 'unassigned'}">${agentSparkleIcon()}</span>Delegate to ${escapeHtml(ownerName)}</button>`
}

function renderSubtask(task: Task, subtask: NonNullable<Task['subtaskItems']>[number]) {
  const editing = editingSubtaskId === subtask.id
  return `<div class="subtask">
    <input type="checkbox" data-subtask="${subtask.id}" aria-label="Mark ${escapeHtml(subtask.title)} as ${subtask.completed ? 'not done' : 'done'}" ${subtask.completed ? 'checked' : ''}/>
    ${editing ? `<form class="subtask-edit-form" data-subtask-edit-form="${task.id}" data-subtask-id="${subtask.id}">
      <input name="title" value="${escapeHtml(subtask.title)}" aria-label="Edit subtask" autocomplete="off" required />
      <button type="submit">Save</button>
      <button type="button" data-action="cancel-subtask-edit" aria-label="Cancel editing">Cancel</button>
    </form>` : `<button type="button" class="subtask-title ${subtask.completed ? 'completed' : ''}" data-action="edit-subtask" data-subtask-id="${subtask.id}" aria-label="Edit ${escapeHtml(subtask.title)}">${escapeHtml(subtask.title)}</button>`}
    <button type="button" class="subtask-delete" data-action="delete-subtask" data-subtask-id="${subtask.id}" aria-label="Delete ${escapeHtml(subtask.title)}">${icon('trash')}</button>
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
    return `<div class="upcoming-command-row">
      <button class="add-task-row" data-action="open-planner" data-task-group="${group}">${icon('plus')}<span>Add New Task</span></button>
      <button class="ask-shotcount-button" data-action="open-roon-planner" data-task-group="${group}"><span class="agent-icon-wrap">${agentSparkleIcon()}</span>Ask Roon</button>
    </div>`
  }
  const isWeek = group === 'week'
  return `
    <form class="planner-composer" data-planner-form="${group}">
      <input name="title" aria-label="Task name" placeholder="What needs doing?" autocomplete="off" required />
      ${isWeek ? `<input name="due" aria-label="Task date" type="date" min="${dateKey(addDays(now, 2))}" max="${weekEndKey}" value="${dateKey(addDays(now, 2))}" required />` : `<span class="planner-date">${formatTaskDate(tomorrowKey)}</span>`}
      <input name="time" aria-label="Task time, optional; reminder 15 minutes before" title="Adds a reminder 15 minutes before" type="time" />
      <select name="goalId" aria-label="Goal">${renderGoalOptions(activeGoalId ?? goals[0]?.id)}</select>
      <select name="visibility" aria-label="Task visibility" required>${renderVisibilityOptions(defaultTaskVisibility())}</select>
      <button type="submit">Add</button>
      <button type="button" class="planner-cancel" data-action="close-planner" aria-label="Cancel">×</button>
    </form>
  `
}

function demoCompletionCount(day: Date) {
  const daysAgo = Math.floor((new Date(`${todayKey}T12:00:00`).getTime() - day.getTime()) / 86_400_000)
  if (daysAgo < 0 || daysAgo > 190) return 0
  const wave = Math.sin(daysAgo * 0.43) + Math.cos(daysAgo * 0.17)
  if ((daysAgo * 7 + day.getDate()) % 11 < 3) return 0
  return Math.max(0, Math.min(6, Math.round(2.2 + wave + (190 - daysAgo) / 120)))
}

function activityDates() {
  const end = addDays(now, 6 - now.getDay())
  return Array.from({ length: 371 }, (_, index) => addDays(end, index - 370))
}

function completionCountForDate(day: Date) {
  const key = dateKey(day)
  const saved = tasks.filter(task => task.completedAt && dateKey(new Date(task.completedAt)) === key).length
  return (showDemoData ? demoCompletionCount(day) : 0) + saved
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
    let label = `${value} task${value === 1 ? '' : 's'} completed on ${day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    const completedTasks = completedTasksForDate(day)
    if (completedTasks.length) label += `\n${completedTasks.map(task => `• ${task.title}`).join('\n')}`
    if (activityMode === 'weekly') {
      value = weeklyCounts[column] ?? 0
      const filledRows = Math.ceil(value / maxWeekly * 7)
      level = row >= 7 - filledRows ? activityLevel(value, maxWeekly) : 0
      label = `${value} task${value === 1 ? '' : 's'} completed in the week of ${dates[column * 7]?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    } else if (activityMode === 'cumulative') {
      value = cumulativeCounts[index] ?? 0
      const filledRows = Math.ceil(value / maxCumulative * 7)
      level = row >= 7 - filledRows ? 3 : 0
      label = `${value} tasks completed by ${day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return `<span class="activity-cell level-${isFuture ? 0 : level} ${isFuture ? 'is-future' : ''}" role="img" data-activity-date="${dateKey(day)}" style="--column:${column + 1};--row:${row + 1}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>`
  }).join('')

  return `
    <section class="activity-panel" aria-labelledby="activity-title">
      <div class="activity-header">
        <div><h2 id="activity-title">Task activity</h2><p>Your completed work, one square at a time.</p></div>
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
    : !hiddenCalendarGoalIds.has(item.task.goalId ?? '') && taskMatchesCalendarSearch(item.task))
  const unscheduled = tasks.filter(task =>
    !task.time &&
    !completedTaskIds.has(task.id) &&
    !hiddenCalendarGoalIds.has(task.goalId ?? '') &&
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
          <button class="add-event" data-action="add-event">+ New</button>
        </div>
      </header>
      <div class="calendar-toolbar">
        <div class="calendar-nav"><button aria-label="Previous ${calendarMode}" data-action="previous-date">‹</button><button aria-label="Next ${calendarMode}" data-action="next-date">›</button></div>
        <div class="calendar-goal-filters">
          ${goals.map(goal => `<button class="${hiddenCalendarGoalIds.has(goal.id) ? 'muted' : ''}" data-calendar-goal="${goal.id}" aria-pressed="${!hiddenCalendarGoalIds.has(goal.id)}"><i style="--goal-color:${goal.color}"></i>${escapeHtml(goal.name)}</button>`).join('')}
        </div>
        <span class="calendar-mobile-hint">Swipe to see every goal</span>
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
          ${hours.map(hour => `<button class="calendar-slot" data-calendar-slot="${date}|${String(hour).padStart(2, '0')}:00" aria-label="Add at ${formatTaskTime(`${String(hour).padStart(2, '0')}:00`)}"></button>`).join('')}
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
  const goal = goals.find(candidate => candidate.id === task.goalId)
  const start = timeToMinutes(task.time!)
  const duration = task.duration ?? 30
  const top = Math.max(0, (start - 360) / 60 * 64)
  const height = Math.max(28, duration / 60 * 64)
  const conflict = all.some(other =>
    other !== item && other.date === date && !calendarOccurrenceAllDay(other) &&
    rangesOverlap(start, start + duration, timeToMinutes(calendarOccurrenceTime(other)), timeToMinutes(calendarOccurrenceTime(other)) + calendarOccurrenceDuration(other))
  )
  return `
    <article class="calendar-event ${conflict ? 'conflict' : ''}" draggable="true" data-calendar-task="${task.id}" data-occurrence-date="${date}" style="--event-color:${goal?.color ?? '#8a9aad'};--event-top:${top}px;--event-height:${height}px">
      <button data-action="edit-calendar-task" data-task-id="${task.id}">
        <strong>${escapeHtml(task.title)}</strong>
        <span>${formatTaskTime(task.time!)} · ${formatDuration(duration)}</span>
        ${goal ? `<small class="calendar-event-goal"><i aria-hidden="true"></i>${escapeHtml(goal.name)}</small>` : ''}
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
    <article class="calendar-event google-calendar-event ${conflict ? 'conflict' : ''}" data-google-event="${escapeHtml(event.googleEventId)}" style="--event-color:${event.calendarColor};--event-top:${top}px;--event-height:${height}px">
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
          <button data-calendar-slot="${date}|09:00">${day.getDate()}</button>
          ${dayItems.slice(0, 3).map(item => {
            if (item.source === 'google') {
              const content = `${item.event.allDay ? '' : `${formatTaskTime(item.time)} `}${escapeHtml(item.event.title)}`
              return item.event.htmlLink
                ? `<a class="month-event google-month-event" href="${escapeHtml(item.event.htmlLink)}" target="_blank" rel="noreferrer" style="--event-color:${item.event.calendarColor}">${content}</a>`
                : `<span class="month-event google-month-event" style="--event-color:${item.event.calendarColor}">${content}</span>`
            }
            const goal = goals.find(candidate => candidate.id === item.task.goalId)
            return `<button class="month-event" draggable="true" data-calendar-task="${item.task.id}" data-action="edit-calendar-task" data-task-id="${item.task.id}" style="--event-color:${goal?.color ?? '#8a9aad'}">${escapeHtml(item.task.title)}</button>`
          }).join('')}
          ${dayItems.length > 3 ? `<span class="month-more">+${dayItems.length - 3} more</span>` : ''}
        </div>`
      }).join('')}
    </div>
  `
}

function renderUnscheduledTask(task: Task) {
  const goal = goals.find(item => item.id === task.goalId)
  return `<button class="unscheduled-task" draggable="true" data-calendar-task="${task.id}" data-action="schedule-task" data-task-id="${task.id}"><i style="--goal-color:${goal?.color ?? '#8a9aad'}"></i><span>${escapeHtml(task.title)}</span>${task.due ? `<small>${formatTaskDate(task.due)}</small>` : ''}</button>`
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
      <div class="calendar-composer-head"><div><strong>${editing ? 'Edit schedule' : 'New calendar item'}</strong><span>Keep it simple. Add only what helps.</span></div><button type="button" data-action="close-calendar-composer" aria-label="Close">×</button></div>
      <input class="calendar-composer-title" name="title" aria-label="Title" placeholder="What is happening?" value="${escapeHtml(editing?.title ?? '')}" required />
      <div class="calendar-composer-row">
        <label><span>Date</span><input name="due" type="date" value="${formDate}" required /></label>
        <label><span>Start</span><input name="time" type="time" value="${editing?.time ?? time}" required /></label>
        <label><span>Duration</span><select name="duration">${[15, 30, 45, 60, 90, 120, 180].map(value => `<option value="${value}" ${value === (editing?.duration ?? 30) ? 'selected' : ''}>${formatDuration(value)}</option>`).join('')}</select></label>
      </div>
      <div class="calendar-composer-row">
        <label><span>Goal</span><select name="goalId">${renderGoalOptions(editing?.goalId ?? activeGoalId ?? goals[0]?.id)}</select></label>
        <label><span>Type</span><select name="kind"><option value="task" ${(editing?.kind ?? 'task') === 'task' ? 'selected' : ''}>Task</option><option value="event" ${editing?.kind === 'event' ? 'selected' : ''}>Event</option></select></label>
        <label><span>Repeat</span><select name="recurrence">${(['none', 'daily', 'weekdays', 'weekly', 'monthly'] as Recurrence[]).map(value => `<option value="${value}" ${value === (editing?.recurrence ?? 'none') ? 'selected' : ''}>${value[0]!.toUpperCase()}${value.slice(1)}</option>`).join('')}</select></label>
      </div>
      <div class="calendar-composer-row">
        <label><span>Reminder</span><select name="reminder">${[0, 5, 15, 30, 60].map(value => `<option value="${value}" ${value === reminder ? 'selected' : ''}>${formatReminder(value)}</option>`).join('')}</select></label>
        <label><span>Location</span><input name="location" value="${escapeHtml(editing?.location ?? '')}" placeholder="Optional" /></label>
        <label><span>People</span><input name="attendees" value="${escapeHtml(editing?.attendees ?? '')}" placeholder="Optional" /></label>
      </div>
      <div class="calendar-composer-row calendar-composer-row--visibility">
        <label><span>Visibility</span><select name="visibility" aria-label="Task visibility" required>${renderVisibilityOptions(editing?.visibility ?? defaultTaskVisibility())}</select></label>
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

function renderStickyWall() {
  const spotlight = communityProfiles[0]
  return `
    <section class="sticky-screen community-screen">
      <header class="sticky-title community-title">
        <div>
          <h1>Community</h1>
          <p>Follow remarkable people and watch how their best work gets done.</p>
        </div>
        <button class="community-discover" data-action="discover-people">Discover people</button>
      </header>
      <div class="community-content">
        ${communityState === 'loading' ? `<div class="community-state"><strong>Finding creators…</strong><p>Bringing the Community up to date.</p></div>` : ''}
        ${communityState === 'failed' ? `<div class="community-state"><strong>Community could not load.</strong><p>Your tasks are safe. Try again when your connection is steadier.</p><button data-action="retry-community">Try again</button></div>` : ''}
        ${communityState === 'ready' && !spotlight ? `<div class="community-state"><strong>No creators are public yet.</strong><p>Complete your profile to become one of the first.</p><button data-action="settings">Complete profile</button></div>` : ''}
        ${spotlight ? `
        <section class="spotlight-section" aria-labelledby="spotlight-title">
          <div class="community-section-heading">
            <div><h2 id="spotlight-title">This week’s spotlight</h2><p>Step inside the working rhythm of someone exceptional.</p></div>
            <span>Updated live</span>
          </div>
          ${renderSpotlight(spotlight)}
        </section>

        ${communityProfiles.length > 1 ? `<section class="explore-section" aria-labelledby="explore-title">
          <div class="community-section-heading">
            <div><h2 id="explore-title">Explore communities</h2><p>Find a person whose way of working helps you move.</p></div>
            <button data-action="discover-people">View all</button>
          </div>
          <div class="community-grid explore-grid">
            ${communityProfiles.slice(1).map(renderCommunityCard).join('')}
          </div>
        </section>` : ''}
        ` : ''}
      </div>
    </section>
  `
}

function renderSpotlight(profile: CommunityProfile) {
  const busy = communityBusyIds.has(profile.id)
  const isCreatorLinkTarget = creatorLinkTargetId === profile.id
  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name
  const followerLabel = formatFollowerLabel(profile.followerCount)
  return `
    <article class="spotlight-card ${isCreatorLinkTarget ? 'creator-link-target' : ''}">
      ${renderLaunchPopover(profile, true)}
      <div class="spotlight-portrait portrait-frame" style="--portrait-column:${profile.portraitColumn};--portrait-row:${profile.portraitRow};--community-portrait:url(&quot;${communityPortraits}&quot;)">
        ${renderCommunityPortrait(profile)}
        ${profile.isDemo ? `<span class="spotlight-members">${profile.members} people learning alongside them</span>` : followerLabel ? `<span class="spotlight-members">${followerLabel}</span>` : ''}
      </div>
      <div class="spotlight-body">
        <p class="spotlight-role">${isCreatorLinkTarget ? `CREATOR LINK · @${escapeHtml(profile.username)}` : profile.isDemo ? `${escapeHtml(profile.role)} · Lagos` : `@${escapeHtml(profile.username)}`}</p>
        <h3>${escapeHtml(profile.name)}</h3>
        ${profile.isDemo || profile.latest ? `<p class="spotlight-intro">${escapeHtml(profile.isDemo ? 'Building useful products without losing the quiet routines that make ambitious work possible.' : profile.latest)}</p>` : ''}
        ${profile.isDemo ? `<div class="spotlight-tasks">
          <div class="spotlight-tasks-heading"><strong>Today’s focus</strong><span>${profile.tasksToday} tasks · 3 complete</span></div>
          <div><i class="done">✓</i><span>Review the launch brief</span><time>8:40</time></div>
          <div><i class="done">✓</i><span>Approve the onboarding flow</span><time>10:15</time></div>
          <div><i></i><span>Founder interviews</span><time>14:00</time></div>
        </div>` : `<div class="creator-profile-facts">${followerLabel ? `<strong>${escapeHtml(followerLabel)}</strong>` : ''}<small>Only tasks marked Followers or Public can be shared.</small></div>`}
        <div class="spotlight-actions">
          <button class="spotlight-open" data-community="${profile.id}">${profile.isDemo ? `Enter ${escapeHtml(firstName)}’s community` : 'Open creator link'} ${icon('chevron')}</button>
          <button class="spotlight-follow ${profile.followed ? 'is-following' : ''}" data-follow="${profile.id}" aria-pressed="${profile.followed}" ${busy ? 'disabled' : ''}>
            ${busy ? 'Saving…' : profile.followed ? 'Following' : 'Follow'}
          </button>
        </div>
      </div>
    </article>
  `
}

function renderCommunityCard(profile: CommunityProfile) {
  const busy = communityBusyIds.has(profile.id)
  const followerLabel = formatFollowerLabel(profile.followerCount)
  return `
    <article class="community-card">
      ${renderLaunchPopover(profile)}
      <div class="community-portrait portrait-frame" style="--portrait-column:${profile.portraitColumn};--portrait-row:${profile.portraitRow};--community-portrait:url(&quot;${communityPortraits}&quot;)">
        ${renderCommunityPortrait(profile)}
        ${profile.isDemo ? `<span>${profile.members} members</span>` : followerLabel ? `<span>${followerLabel}</span>` : ''}
        <button class="community-follow ${profile.followed ? 'is-following' : ''}" data-follow="${profile.id}" aria-label="${profile.followed ? 'Unfollow' : 'Follow'} ${escapeHtml(profile.name)}" aria-pressed="${profile.followed}" ${busy ? 'disabled' : ''}>
          ${busy ? '…' : profile.followed ? '✓' : icon('plus')}
        </button>
      </div>
      <div class="community-card-body">
        <p class="community-role">${profile.isDemo ? escapeHtml(profile.role) : `@${escapeHtml(profile.username)}`}</p>
        <h3>${escapeHtml(profile.name)}</h3>
        <div class="community-activity">
          ${profile.isDemo ? `<span><b>${profile.tasksToday}</b> tasks today</span><span class="activity-dot"></span><span>Active now</span>` : `${followerLabel ? `<span><b>${escapeHtml(followerLabel)}</b></span><span class="activity-dot"></span>` : ''}<span>Public profile</span>`}
        </div>
        ${profile.latest ? `<p class="community-latest">${profile.isDemo ? '<span>✓</span>' : ''}${escapeHtml(profile.latest)}</p>` : ''}
        <button class="community-open" data-community="${profile.id}">${profile.isDemo ? 'View community' : 'Open creator link'} ${icon('chevron')}</button>
      </div>
    </article>
  `
}

function renderCommunityPortrait(profile: CommunityProfile) {
  return profile.avatarUrl
    ? `<img class="community-profile-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="" />`
    : '<div class="community-portrait-art" aria-hidden="true"></div>'
}

function renderLaunchPopover(profile: CommunityProfile, spotlight = false) {
  return `
    <div class="community-launch-popover ${spotlight ? 'spotlight-launch-popover' : ''}" aria-hidden="true">
      <p class="community-launch-label">${profile.isDemo ? 'Public launch page' : 'Personal creator link'}</p>
      <h4>${escapeHtml(profile.name)}</h4>
      ${profile.isDemo ? `<ul>
        ${profile.bioLines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
      </ul><button class="community-launch-subscribe">Subscribe with Plus</button>` : `<p class="community-launch-bio">${escapeHtml(profile.latest)}</p><small class="community-launch-link">app.shotcount.app/${escapeHtml(profile.username)}</small>`}
    </div>
  `
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
  const visibility = document.querySelector<HTMLSelectElement>('.inspector-visibility')?.value
  if (title) task.title = title
  if (description !== undefined) task.description = description
  if (due !== undefined) task.due = due || undefined
  if (time !== undefined) {
    task.time = time || undefined
    task.reminder = time ? task.reminder ?? DEFAULT_TASK_REMINDER_MINUTES : undefined
  }
  if (visibility !== undefined) task.visibility = normalizeTaskVisibility(visibility)
  persistPlanner()
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
  const sourceRate = descriptionPcmSampleRate || 48_000
  const targetRate = 16_000
  const sourceLength = descriptionPcmChunks.reduce((total, chunk) => total + chunk.length, 0)
  const source = new Float32Array(sourceLength)
  let sourceOffset = 0
  for (const chunk of descriptionPcmChunks) { source.set(chunk, sourceOffset); sourceOffset += chunk.length }
  const ratio = sourceRate / targetRate
  const sampleCount = Math.floor(source.length / ratio)
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  writeText(0, 'RIFF'); view.setUint32(4, 36 + sampleCount * 2, true); writeText(8, 'WAVE'); writeText(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  writeText(36, 'data'); view.setUint32(40, sampleCount * 2, true)
  for (let index = 0; index < sampleCount; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio))
    let sample = 0
    for (let cursor = start; cursor < end && cursor < source.length; cursor += 1) sample += source[cursor]
    sample = Math.max(-1, Math.min(1, sample / (end - start)))
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

async function toggleDescriptionVoiceInput(target = 'task') {
  const task = target === 'today-composer' ? null : selectedTask()
  const targetId = target === 'today-composer' ? target : task?.id
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
  if (target === 'today-composer') captureTodayComposerDraft()
  else persistInspectorDraft()
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    toast = 'Voice input is not available in this browser.'
    render()
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
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
    void prepareDescriptionTranscription()
    descriptionRecordingTimer = window.setTimeout(() => {
      toast = 'Recording stopped after two minutes.'
      if (recorder.state === 'recording') recorder.stop()
    }, MAX_DESCRIPTION_RECORDING_MS)
    render()
  } catch (error) {
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
      // The Today draft is snapshotted on every keystroke. Do not re-read a
      // potentially replaced composer DOM node after async transcription.
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
    goalId: String(data.get('goalId') ?? goals[0]?.id ?? '') || undefined,
    kind: String(data.get('kind') ?? 'task') as PlannerKind,
    recurrence: String(data.get('recurrence') ?? 'none') as Recurrence,
    reminder: Number(data.get('reminder') ?? 15),
    location: String(data.get('location') ?? '').trim() || undefined,
    attendees: String(data.get('attendees') ?? '').trim() || undefined,
    visibility: normalizeTaskVisibility(data.get('visibility')),
  }
  if (task) {
    Object.assign(task, patch)
    selectedTaskId = task.id
  } else {
    const newTask: Task = normalizeTask({
      id: crypto.randomUUID(),
      description: '',
      subtaskItems: [],
      ...patch,
      title,
    })
    tasks.unshift(newTask)
    selectedTaskId = newTask.id
  }
  calendarComposer = null
  persistPlanner()
  refreshCounts()
  triggerHaptic([35, 30, 60])
  toast = task ? 'Calendar updated' : 'Added to calendar'
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
  const roonGoalForm = target.closest<HTMLFormElement>('[data-roon-goal-form]')
  if (roonGoalForm) {
    event.preventDefault()
    roonPlannerGoal = String(new FormData(roonGoalForm).get('goal') ?? '').trim()
    await requestRoonPlan()
    return
  }
  const roonClarificationForm = target.closest<HTMLFormElement>('[data-roon-clarification-form]')
  if (roonClarificationForm) {
    event.preventDefault()
    roonPlannerClarification = String(new FormData(roonClarificationForm).get('clarification') ?? '').trim()
    await requestRoonPlan()
    return
  }
  const roonPlanForm = target.closest<HTMLFormElement>('[data-roon-plan-form]')
  if (roonPlanForm) {
    event.preventDefault()
    createRoonPlanTasks()
    return
  }
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
      creatorProfile = await saveCreatorProfile(activeUser, profileDraft)
      profileDraft = profileInput(creatorProfile)
      profileModalOpen = false
      profilePromptDismissed = false
      profileBusy = false
      clearProfilePhotoPreview()
      resetTodayComposerDraft()
      toast = creatorProfile.onboardingCompleted ? 'Profile saved' : 'Profile saved — finish the remaining details next time'
      render()
      void refreshCommunityDirectory()
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

  const goalForm = target.closest<HTMLFormElement>('[data-goal-form]')
  if (goalForm) {
    event.preventDefault()
    captureTodayComposerDraft()
    const data = new FormData(goalForm)
    const name = String(data.get('name') ?? '').trim()
    const requestedColor = String(data.get('color') ?? nextGoalColor())
    const color = isGoalColorUsed(requestedColor) ? nextGoalColor() : normalizeColor(requestedColor)
    if (!name) return
    goals.push(normalizeGoal({ id: crypto.randomUUID(), name, color }))
    goalComposerOpen = false
    persistGoals()
    triggerHaptic([35, 30, 60])
    toast = 'Goal added'
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
    return
  }

  const todayForm = target.closest<HTMLFormElement>('[data-today-form]')
  if (todayForm) {
    event.preventDefault()
    const data = new FormData(todayForm)
    const title = String(data.get('title') ?? '').trim()
    const due = String(data.get('due') ?? todayKey)
    const goalId = String(data.get('goalId') ?? activeGoalId ?? goals[0]?.id ?? '').trim()
    if (!title || !due) return
    const attachment = todayComposerAttachment
    const time = String(data.get('time') ?? '').trim()
    const newTask: Task = normalizeTask({
      id: crypto.randomUUID(),
      title,
      description: String(data.get('description') ?? '').trim(),
      goalId: goalId || undefined,
      due,
      time: time || undefined,
      reminder: time ? DEFAULT_TASK_REMINDER_MINUTES : undefined,
      visibility: attachment && isApplicationIntent(title) ? 'private' : normalizeTaskVisibility(data.get('visibility')),
      subtaskItems: [],
    })
    tasks.unshift(newTask)
    selectedTaskId = newTask.id
    todayComposerOpen = false
    todayGoalCreatorOpen = false
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

  const form = target.closest<HTMLFormElement>('[data-planner-form]')
  if (!form) return
  event.preventDefault()
  const group = form.dataset.plannerForm as UpcomingGroup
  const data = new FormData(form)
  const title = String(data.get('title') ?? '').trim()
  const due = group === 'tomorrow' ? tomorrowKey : String(data.get('due') ?? '')
  const goalId = String(data.get('goalId') ?? activeGoalId ?? goals[0]?.id ?? '').trim()
  const time = String(data.get('time') ?? '').trim()
  if (!title || !due) return
  tasks.unshift(normalizeTask({
    id: crypto.randomUUID(),
    title,
    due,
    time: time || undefined,
    reminder: time ? DEFAULT_TASK_REMINDER_MINUTES : undefined,
    goalId: goalId || undefined,
    visibility: normalizeTaskVisibility(data.get('visibility')),
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
})

app.addEventListener('input', event => {
  const target = event.target as HTMLElement
  if (target.closest('[data-today-form]')) {
    // Cloud/realtime renders can arrive while someone is composing. Keep this
    // small local draft current on every keystroke so those renders never
    // erase title or description text.
    captureTodayComposerDraft()
    return
  }
  const agentContextInput = target.closest<HTMLTextAreaElement>('[data-agent-context-input]')
  if (agentContextInput) {
    const runId = agentContextInput.dataset.runId
    if (runId) roonContextDrafts.set(runId, agentContextInput.value)
    return
  }
  const usernameInput = target.closest<HTMLInputElement>('[data-profile-form] input[name="username"]')
  if (usernameInput) {
    usernameInput.value = normalizeUsername(usernameInput.value)
    captureProfileDraft()
    refreshProfileMissingMarkers()
    return
  }
  if (target.closest('[data-profile-form]')) {
    captureProfileDraft()
    refreshProfileMissingMarkers()
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
  const todayTaskFileInput = (event.target as HTMLElement).closest<HTMLInputElement>('[data-today-task-file]')
  if (todayTaskFileInput) {
    const file = todayTaskFileInput.files?.[0]
    if (!file) return
    captureTodayComposerDraft()
    if (!acceptedTaskFileTypes.includes(file.type as typeof acceptedTaskFileTypes[number])) {
      toast = 'Choose a PNG, JPEG, PDF, DOCX, or TXT file.'
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
    refreshProfileMissingMarkers()
    return
  }
  const select = (event.target as HTMLElement).closest<HTMLSelectElement>('[data-task-visibility]')
  if (!select) return
  const task = tasks.find(item => item.id === select.dataset.taskVisibility)
  if (!task) return
  persistInspectorDraft()
  task.visibility = normalizeTaskVisibility(select.value)
  persistPlanner()
  toast = `Visibility changed to ${visibilityLabels[task.visibility]}`
  render()
  window.setTimeout(() => {
    toast = ''
    render()
  }, 1400)
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
  if (action === 'close-roon-planner') {
    roonPlannerOpen = false
    resetRoonPlanner()
    render()
    return
  }
  if (action === 'restart-roon-planner') {
    const goal = roonPlannerGoal
    const due = roonPlannerTargetDue
    resetRoonPlanner(due)
    roonPlannerGoal = goal
    render()
    document.querySelector<HTMLTextAreaElement>('[data-roon-goal-form] textarea')?.focus()
    return
  }
  if (action === 'remove-roon-plan-task') {
    captureRoonPlanDraft()
    const taskId = target.closest<HTMLElement>('[data-plan-task-id]')?.dataset.planTaskId
    roonPlanTasks = roonPlanTasks.filter(task => task.id !== taskId)
    render()
    return
  }
  const muteCreatorId = target.closest<HTMLElement>('[data-mute-creator]')?.dataset.muteCreator
  const unmuteCreatorId = target.closest<HTMLElement>('[data-unmute-creator]')?.dataset.unmuteCreator
  const creatorMuteId = muteCreatorId || unmuteCreatorId
  if (creatorMuteId) {
    const muted = muteCreatorId ? !notificationPreferences.mutedCreatorIds.includes(creatorMuteId) : false
    try {
      if (!showDemoData) await setCreatorMuted(creatorMuteId, muted)
      notificationPreferences.mutedCreatorIds = muted
        ? [...new Set([...notificationPreferences.mutedCreatorIds, creatorMuteId])]
        : notificationPreferences.mutedCreatorIds.filter(id => id !== creatorMuteId)
      if (muted && islandCompletions.some(item => item.creatorId === creatorMuteId)) clearIsland()
      toast = muted ? 'Creator alerts muted' : 'Creator alerts unmuted'
      render()
      window.setTimeout(() => {
        toast = ''
        render()
      }, 1400)
    } catch (error) {
      toast = error instanceof Error ? error.message : 'That alert could not be changed.'
      render()
    }
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
    if (!wasCompleted) {
      const todayTasks = tasksForToday()
      if (todayTasks.length && todayTasks.every(item => completedTaskIds.has(item.id))) {
        window.setTimeout(() => void dispatchCompletionPush().catch(() => undefined), 3_200)
      }
    }
    render()
    return
  }

  const nextView = target.closest<HTMLElement>('[data-view]')?.dataset.view as View | undefined
  if (nextView) {
    persistInspectorDraft()
    pendingCreatorSlug = ''
    creatorTodayState = null
    mobileInspectorOpen = false
    if (nextView !== 'calendar') {
      calendarComposer = null
    }
    if (nextView !== 'today') {
      todayComposerOpen = false
      todayGoalCreatorOpen = false
      resetTodayComposerDraft()
    }
    navigateWorkspaceView(nextView)
    render()
    if (nextView === 'calendar') void populateGoogleCalendarForExistingUser()
    return
  }

  const goalFilterId = target.closest<HTMLElement>('[data-goal-filter]')?.dataset.goalFilter
  if (goalFilterId) {
    activeGoalId = activeGoalId === goalFilterId ? null : goalFilterId
    if (view !== 'today' && view !== 'upcoming') rememberView('today')
    render()
    return
  }

  const followId = target.closest<HTMLElement>('[data-follow]')?.dataset.follow
  if (followId) {
    const profile = communityProfiles.find(item => item.id === followId)
    if (!profile) return
    const following = !profile.followed
    if (await updateCreatorFollowing(profile, following)) {
      toast = following ? `Following ${profile.name}` : `Unfollowed ${profile.name}`
      render()
      window.setTimeout(() => {
        toast = ''
        render()
      }, 1400)
    } else if (communityFollowError) {
      toast = communityFollowError
      render()
      window.setTimeout(() => {
        toast = ''
        render()
      }, 2200)
    }
    return
  }

  const communityId = target.closest<HTMLElement>('[data-community]')?.dataset.community
  if (communityId) {
    const profile = communityProfiles.find(item => item.id === communityId)
    if (profile) await openCreatorToday(profile)
    return
  }

  const creatorTaskId = target.closest<HTMLElement>('[data-creator-task]')?.dataset.creatorTask
  if (creatorTaskId) {
    selectedCreatorTaskId = creatorTaskId
    mobileInspectorOpen = true
    render()
    return
  }

  const agentTaskId = target.closest<HTMLElement>('[data-agent-task]')?.dataset.agentTask
  if (agentTaskId) {
    const task = tasks.find(item => item.id === agentTaskId)
    if (!task) return
    selectedTaskId = task.id
    mobileInspectorOpen = true
    const run = agentRuns.get(task.id)
    const route = taskSpecialistRoute(task)
    if ((!run || run.status === 'failed' || run.status === 'cancelled') && (route.supported || route.needsSemanticClassification)) void startAgentRun(task)
    else render()
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

  if (action === 'preview-task-file') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const assetId = target.closest<HTMLElement>('[data-file-asset-id]')?.dataset.fileAssetId
    const asset = taskId && assetId ? (taskFileAssets.get(taskId) ?? []).find(item => item.id === assetId) : undefined
    if (!asset) return
    void downloadTaskFileAsset(asset).then(blob => {
      if (filePreview?.url) URL.revokeObjectURL(filePreview.url)
      filePreview = {
        asset,
        url: URL.createObjectURL(blob),
        ...(asset.mimeType.includes('wordprocessingml')
          ? { message: 'This Word document is ready to download and open in Word or Pages.' }
          : {}),
      }
      render()
    }).catch(error => {
      toast = error instanceof Error ? error.message : 'The file could not be previewed.'
      render()
    })
    return
  }

  if (action === 'close-file-preview') {
    if (filePreview?.url) URL.revokeObjectURL(filePreview.url)
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
    const input = panel?.querySelector<HTMLTextAreaElement>('[data-agent-context-input]')
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
    const note = panel?.querySelector<HTMLTextAreaElement>('[data-agent-context-input]')?.value.trim()
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
    // Today deliberately calls the same recorder/transcriber pipeline as the
    // task inspector; only its destination draft is different.
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

  if (action === 'select-agent-flight') {
    const control = target.closest<HTMLElement>('[data-flight-option-id]')
    const taskId = control?.dataset.taskId
    const optionId = control?.dataset.flightOptionId
    if (taskId && optionId) void chooseAgentFlight(taskId, optionId)
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

  if (action === 'simulate-agent-reply') {
    const taskId = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const run = taskId ? agentRuns.get(taskId) : null
    const task = taskId ? tasks.find(item => item.id === taskId) : null
    const reply = target
      .closest<HTMLElement>('.task-agent-reply-simulation')
      ?.querySelector<HTMLTextAreaElement>('.task-agent-simulated-reply')
      ?.value.trim() ?? ''
    if (!taskId || !run || !reply || agentDecisionBusy.has(run.id)) return
    agentDecisionBusy.add(run.id)
    render()
    void simulateAgentReply(run.id, reply).then(updated => {
      agentRuns.set(taskId, updated)
      void syncAgentApproval(updated).then(() => render())
      toast = `Development reply received — ${task ? specialistName(task, updated) : 'ShotCount'} resumed the same task`
    }).catch(error => {
      toast = error instanceof Error ? error.message : `${task ? specialistName(task, run) : 'ShotCount'} could not simulate this development reply.`
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

  const calendarGoalId = target.closest<HTMLElement>('[data-calendar-goal]')?.dataset.calendarGoal
  if (calendarGoalId) {
    if (hiddenCalendarGoalIds.has(calendarGoalId)) hiddenCalendarGoalIds.delete(calendarGoalId)
    else hiddenCalendarGoalIds.add(calendarGoalId)
    render()
    return
  }

  const calendarSlot = target.closest<HTMLElement>('[data-calendar-slot]')?.dataset.calendarSlot
  if (calendarSlot) {
    const [date = calendarDateKey(), time = '09:00'] = calendarSlot.split('|')
    openCalendarComposer(date, time)
    return
  }

  if (action === 'copy-creator-link') {
    captureProfileDraft()
    const username = normalizeCreatorSlug(profileDraft.username)
    if (!username) return
    try {
      await navigator.clipboard.writeText(`https://app.shotcount.app/${username}`)
      toast = 'Creator link copied'
    } catch {
      toast = 'Could not copy the link'
    }
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1600)
    return
  }
  if (action === 'open-island') {
    const first = islandCompletions[0]
    const profile = first && communityProfiles.find(item => item.id === first.creatorId)
    if (profile) await openCreatorToday(profile)
    return
  }
  if (action === 'close-creator-today') {
    closeCreatorToday()
    return
  }
  if (action === 'retry-creator-today' && creatorTodayState) {
    await openCreatorToday(creatorTodayState.profile)
    return
  }
  if (action === 'notification-bell') {
    if (browserPushBusy) return
    if (browserPushStatus === 'enabled') {
      playShotcountChime()
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
    playShotcountChime()
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
    window.location.assign('https://shotcount.app/?auth=signin')
    return
  }
  if (action === 'retry-auth') {
    await verifyAuthSession()
    return
  }
  if (!action) return
  if (action === 'retry-community') {
    await refreshCommunityDirectory()
    return
  }
  if (action === 'close-profile') {
    captureProfileDraft()
    profilePromptDismissed = true
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
  if (action === 'open-planner') {
    plannerDraftGroup = target.closest<HTMLElement>('[data-task-group]')?.dataset.taskGroup as UpcomingGroup
    render()
    document.querySelector<HTMLInputElement>('[data-planner-form] input[name="title"]')?.focus()
    return
  }
  if (action === 'open-roon-planner') {
    const group = target.closest<HTMLElement>('[data-task-group]')?.dataset.taskGroup as UpcomingGroup | undefined
    const targetDue = group === 'tomorrow'
      ? tomorrowKey
      : group === 'week'
        ? dateKey(addDays(now, 2))
        : todayKey
    resetRoonPlanner(targetDue)
    roonPlannerOpen = true
    render()
    document.querySelector<HTMLTextAreaElement>('[data-roon-goal-form] textarea')?.focus()
    return
  }
  if (action === 'close-planner') {
    plannerDraftGroup = null
    render()
    return
  }
  if (action === 'open-goal-composer') {
    captureTodayComposerDraft()
    goalComposerOpen = true
    render()
    document.querySelector<HTMLInputElement>('[data-goal-form] input[name="name"]')?.focus()
    return
  }
  if (action === 'close-goal-composer') {
    captureTodayComposerDraft()
    goalComposerOpen = false
    render()
    return
  }
  if (action === 'close-today-composer') {
    renderWithMotion(() => {
      todayComposerOpen = false
      todayGoalCreatorOpen = false
      resetTodayComposerDraft()
      render()
    })
    return
  }
  if (action === 'add-task') {
    renderWithMotion(() => {
      resetTodayComposerDraft()
      todayComposerOpen = true
      todayGoalCreatorOpen = false
      render()
      document.querySelector<HTMLInputElement>('[data-today-form] input[name="title"]')?.focus()
    })
    return
  }
  if (action === 'open-inline-goal') {
    captureTodayComposerDraft()
    todayGoalCreatorOpen = true
    render()
    document.querySelector<HTMLInputElement>('[name="newGoalName"]')?.focus()
    return
  }
  if (action === 'close-inline-goal') {
    captureTodayComposerDraft()
    todayGoalCreatorOpen = false
    render()
    return
  }
  if (action === 'create-inline-goal') {
    const nameInput = document.querySelector<HTMLInputElement>('[name="newGoalName"]')
    const colorInput = document.querySelector<HTMLInputElement>('[name="newGoalColor"]')
    const name = nameInput?.value.trim() ?? ''
    if (!name) {
      nameInput?.focus()
      return
    }
    captureTodayComposerDraft()
    const requestedColor = colorInput?.value ?? nextGoalColor()
    const color = isGoalColorUsed(requestedColor) ? nextGoalColor() : normalizeColor(requestedColor)
    const newGoal = normalizeGoal({ id: crypto.randomUUID(), name, color })
    goals.push(newGoal)
    todayComposerDraft.goalId = newGoal.id
    todayGoalCreatorOpen = false
    skipTodayComposerCapture = true
    persistGoals()
    triggerHaptic([35, 30, 60])
    toast = 'Goal added'
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
    return
  }
  if (action === 'save-task') {
    persistInspectorDraft()
    toast = 'Changes saved'
    mobileInspectorOpen = false
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
  } else if (action === 'cycle-goal') {
    persistInspectorDraft()
    const task = selectedTask()
    if (task && goals.length) {
      const currentIndex = goals.findIndex(goal => goal.id === task.goalId)
      task.goalId = goals[(currentIndex + 1 + goals.length) % goals.length]?.id
      persistPlanner()
    }
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
  } else if (action === 'add-event') {
    openCalendarComposer(calendarDateKey(), '09:00')
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
    const messages: Record<string, string> = {
      'discover-people': 'More communities coming soon',
      signout: 'Signed out',
    }
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
  if (action === 'open-goal-composer' || action === 'close-goal-composer') persistGoals()
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
  if (draggingCalendarTaskId && (event.target as HTMLElement).closest('[data-calendar-drop-date], [data-calendar-slot]')) {
    event.preventDefault()
  }
})

app.addEventListener('drop', event => {
  const target = event.target as HTMLElement
  const slot = target.closest<HTMLElement>('[data-calendar-slot]')?.dataset.calendarSlot
  const dropDate = target.closest<HTMLElement>('[data-calendar-drop-date]')?.dataset.calendarDropDate
  const taskId = event.dataTransfer?.getData('application/x-shotcount-task') || event.dataTransfer?.getData('text/plain') || draggingCalendarTaskId
  if (!taskId || (!slot && !dropDate)) return
  event.preventDefault()
  const [date = dropDate ?? calendarDateKey(), time = '09:00'] = slot ? slot.split('|') : [dropDate, '09:00']
  scheduleTask(taskId, date, time)
  draggingCalendarTaskId = null
})

document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement
  const isTyping = target.matches('input, textarea, select') || target.isContentEditable
  if (event.key === 'Escape' && roonPlannerOpen) {
    roonPlannerOpen = false
    resetRoonPlanner()
    render()
    return
  }
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
  if (event.key.toLowerCase() === 'c') {
    event.preventDefault()
    openCalendarComposer(calendarDateKey(), '09:00')
    return
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const direction = event.key === 'ArrowLeft' ? -1 : 1
  const nextDate = new Date(calendarDate)
  if (calendarMode === 'month') nextDate.setMonth(nextDate.getMonth() + direction)
  else nextDate.setDate(nextDate.getDate() + direction * (calendarMode === 'week' ? 7 : 1))
  calendarDate = nextDate
  render()
})

rememberCreatorIntent(creatorSlugFromLocation())
if (!authRequired) resolveCreatorIntent()
const previewCompletion = (name: string, id: string, completedCount = 6, taskTitle = 'Approve the onboarding flow'): CreatorCompletion => ({
  id: `preview-${id}`,
  creatorId: id,
  username: id,
  displayName: name,
  avatarUrl: '',
  completedCount,
  totalCount: completedCount,
  completedAt: new Date().toISOString(),
  taskTitle,
})
islandHook.__shotcountShowCompletion = (items = [previewCompletion('Amara Okafor', 'amara')]) => queueCompletionAlerts(items, true)
if (islandPreview === 'single') islandCompletions = [previewCompletion('Amara Okafor', 'amara')]
if (islandPreview === 'batch') islandCompletions = [
  previewCompletion('Amara Okafor', 'amara'),
  previewCompletion('Kenji Watanabe', 'kenji', 4, 'Send the campaign boards'),
  previewCompletion('Maya Raman', 'maya', 3, 'Ship the homepage revision'),
]
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
  rememberCreatorIntent(creatorSlugFromLocation())
  if (!creatorSlugFromLocation()) creatorTodayState = null
  resolveCreatorIntent()
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
    void checkForCompletionAlerts()
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
