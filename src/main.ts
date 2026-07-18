import { nextRecurringDate, type Recurrence as SharedRecurrence } from './domain'
import { cloudEnabled, currentUser, getCloudClient, signOut as signOutCloud } from './data/cloud'
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
  normalizeCreatorSlug,
  setCreatorFollowing,
  type CommunityCreator,
} from './data/community'
import {
  defaultNotificationPreferences,
  loadCompletionFeed,
  loadCreatorToday,
  loadNotificationPreferences,
  saveNotificationPreferences,
  setCreatorMuted,
  subscribeToCompletionAlerts,
  type CreatorCompletion,
  type SharedCreatorTask,
} from './data/notifications'
import { CloudPlannerRepository, createSupabasePlannerAdapter } from './data/sync'
import type { SyncState } from './data/contracts'
import { normalizeGoal, normalizeTask, normalizeTaskVisibility, type Goal, type PlannerKind, type Task, type TaskVisibility } from './data/planner-model'
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
type CalendarMode = 'day' | 'week' | 'month'
type Theme = 'light' | 'dark'
const previewParams = new URLSearchParams(window.location.search)
const previewView = previewParams.get('previewView')
const isPreviewMode = previewParams.has('previewView')
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
const plannerStorageKey = `${storagePrefix}planner`
const goalsStorageKey = `${storagePrefix}goals`
const themeStorageKey = `${storagePrefix}theme`
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
  if (previewView === 'today' || previewView === 'upcoming' || previewView === 'calendar' || previewView === 'sticky') {
    return previewView
  }

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
  { id: 'business-card', title: 'Print business card', due: todayKey },
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
const screenCounts: Record<CountKey, number> = { today: 5, upcoming: 12 }
const completedTaskIds = new Set(tasks.filter(task => task.completedAt).map(task => task.id))
let activityMode: ActivityMode = 'daily'
let plannerDraftGroup: UpcomingGroup | null = null
let todayComposerOpen = false
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
let toast = ''
let calendarMode: CalendarMode = 'week'
let calendarDate = new Date(now)
let calendarComposer: { date: string; time: string; taskId?: string } | null = null
let calendarSearch = ''
let draggingCalendarTaskId: string | null = null
const hiddenCalendarGoalIds = new Set<string>()
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
let notificationPreferences = defaultNotificationPreferences()
let notificationSettingsOpen = false
let notificationSettingsBusy = false
let notificationSettingsError = ''
let islandCompletions: CreatorCompletion[] = []
let queuedCompletions: CreatorCompletion[] = []
let completionBatchTimer = 0
let islandDismissTimer = 0
let completionSubscription: (() => void) | null = null
let lastCompletionCheck = new Date(Date.now() - 15_000).toISOString()
const islandPreview = previewParams.get('previewIsland')
const notificationPreview = previewParams.has('previewNotifications')
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
  back: '<path d="m15 18-6-6 6-6"/>',
}

function icon(name: string) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name]}</svg>`
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
  render()
  islandDismissTimer = window.setTimeout(clearIsland, 6_000)
}

function queueCompletionAlerts(items: CreatorCompletion[], immediate = false) {
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
    notificationPreferences = await loadNotificationPreferences()
    completionSubscription = await subscribeToCompletionAlerts(() => void checkForCompletionAlerts())
    await checkForCompletionAlerts()
  } catch {
    // Notification setup must never block the task workspace.
  }
}

async function openCreatorToday(profile: CommunityProfile) {
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
  const url = new URL(window.location.href)
  if (creatorSlugFromPathname(url.pathname)) url.pathname = '/'
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  rememberView('sticky')
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

function tasksForToday() {
  return tasks.filter(task => task.due && task.due <= todayKey && taskMatchesGoal(task))
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
  screenCounts.today = tasksForToday().length
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
  if (authState !== 'authenticated') {
    app.innerHTML = renderAuthGate()
    return
  }
  if (isLandingRoute()) {
    app.innerHTML = renderLanding()
    return
  }
  refreshDateContext(now)
  refreshCounts()
  const selected = tasks.find(task => task.id === selectedTaskId) ?? tasks[0]
  const isPhone = window.matchMedia?.('(max-width: 620px)').matches ?? false
  const showInspector = !creatorTodayState && Boolean(selected) && view === 'today' && !todayComposerOpen && (!isPhone || mobileInspectorOpen)
  app.innerHTML = `
    <div class="reference-app ${showInspector ? 'with-inspector' : ''}">
      ${authRequired ? renderSyncStatus() : ''}
      ${renderSidebar()}
      <main class="workspace">
        ${renderMobileTopbar()}
        ${creatorTodayState ? renderCreatorTodayView(creatorTodayState) : view === 'today' ? renderToday() : view === 'upcoming' ? renderUpcoming() : view === 'calendar' ? renderCalendar() : renderStickyWall()}
      </main>
      ${showInspector && selected ? renderInspector(selected) : ''}
    </div>
    <div class="toast ${toast ? 'show' : ''}" role="status">${escapeHtml(toast)}</div>
    ${renderShotcountIsland()}
    ${renderProfileModal()}
    ${renderNotificationSettings()}
  `
  if (isPhone) queueMicrotask(alignMobileScrollSurfaces)
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

function renderCreatorTodayView(state: CreatorTodayState) {
  const { profile } = state
  const completed = state.tasks.filter(task => task.completedAt).length
  const total = state.tasks.length
  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name
  const initial = profile.name.trim().charAt(0).toUpperCase() || 'S'
  const muted = notificationPreferences.mutedCreatorIds.includes(profile.id)
  return `
    <section class="today-screen creator-today-screen">
      <header class="creator-today-header">
        <button type="button" class="creator-today-back" data-action="close-creator-today" aria-label="Back to Community">${icon('back')}</button>
        <span class="creator-today-avatar">${profile.avatarUrl ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" />` : escapeHtml(initial)}</span>
        <div><h1>${escapeHtml(firstName)}’s Today</h1><p>@${escapeHtml(profile.username)} · Read only</p></div>
        <button type="button" class="creator-today-mute" data-mute-creator="${profile.id}" aria-pressed="${muted}">${muted ? 'Unmute alerts' : 'Mute alerts'}</button>
      </header>
      <div class="creator-today-progress" aria-label="${completed} of ${total} shared tasks complete">
        <div><strong>${state.status === 'loading' ? 'Opening today…' : `${completed}/${total} shared tasks complete`}</strong><span>${state.status === 'ready' ? 'Only tasks marked Followers or Public are shown.' : 'Getting the safe, shared part of this list.'}</span></div>
        <i style="--creator-progress:${total ? Math.round(completed / total * 100) : 0}%"><b></b></i>
      </div>
      <div class="task-list creator-task-list">
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
  return `
    <div class="task-row creator-task-row ${completed ? 'completed' : ''}">
      <span class="checkbox" aria-hidden="true">
        <span class="completion-badge"><svg viewBox="0 0 24 24">${completed
          ? `<path class="completion-seal" d="M12 1.8c1.2 0 1.8 1.3 2.9 1.6 1.1.3 2.2-.6 3.1.1.9.7.4 2.1 1.1 3 .7.9 2.2.8 2.6 1.9.4 1.1-.8 2-.8 3.2s1.2 2.1.8 3.2c-.4 1.1-1.9 1-2.6 1.9-.7.9-.2 2.3-1.1 3-.9.7-2-.2-3.1.1-1.1.3-1.7 1.6-2.9 1.6s-1.8-1.3-2.9-1.6c-1.1-.3-2.2.6-3.1-.1-.9-.7-.4-2.1-1.1-3-.7-.9-2.2-.8-2.6-1.9-.4-1.1.8-2 .8-3.2s-1.2-2.1-.8-3.2c.4-1.1 1.9-1 2.6-1.9.7-.9.2-2.3 1.1-3 .9-.7 2-.2 3.1-.1C10.2 3.1 10.8 1.8 12 1.8Z"/><path class="completion-check" d="m7.4 12.1 3 2.9 6.2-6.2"/>`
          : '<circle class="completion-ring" cx="12" cy="12" r="8.4"/>'}</svg></span>
      </span>
      <span class="task-text">
        <strong>${escapeHtml(task.title)}</strong>
        <small>${task.time ? `<span>${icon('calendar')}${formatTaskTime(task.time)}</span>` : ''}<span class="task-visibility task-visibility--${task.visibility}">${visibilityLabels[task.visibility]}</span></small>
      </span>
    </div>
  `
}

function renderNotificationSettings() {
  if (!notificationSettingsOpen) return ''
  const mutedProfiles = communityProfiles.filter(profile => notificationPreferences.mutedCreatorIds.includes(profile.id))
  return `
    <div class="profile-popover notification-popover" role="presentation">
      <button type="button" class="profile-popover-backdrop" data-action="close-notification-settings" aria-label="Close notification settings"></button>
      <section class="profile-popover-card notification-card" role="dialog" aria-modal="true" aria-labelledby="notification-settings-title">
        <button type="button" class="profile-popover-close" data-action="close-notification-settings" aria-label="Close notification settings">×</button>
        <p class="notification-eyebrow">Shotcount Island</p>
        <h2 id="notification-settings-title">Notification settings</h2>
        <p class="notification-intro">Choose when the little completion pill can say hello.</p>
        <form class="notification-form" data-notification-form>
          <label class="notification-switch-row">
            <span><strong>Completion alerts</strong><small>Show when people you follow finish today.</small></span>
            <input type="checkbox" name="completionAlerts" ${notificationPreferences.completionAlerts ? 'checked' : ''} />
          </label>
          <label class="notification-switch-row">
            <span><strong>Quiet hours</strong><small>Keep the Island hidden while you rest or focus.</small></span>
            <input type="checkbox" name="quietHoursEnabled" ${notificationPreferences.quietHoursEnabled ? 'checked' : ''} />
          </label>
          <div class="quiet-hours-fields">
            <label><span>From</span><input type="time" name="quietStart" value="${escapeHtml(notificationPreferences.quietStart)}" /></label>
            <span aria-hidden="true">→</span>
            <label><span>Until</span><input type="time" name="quietEnd" value="${escapeHtml(notificationPreferences.quietEnd)}" /></label>
          </div>
          <section class="muted-creators">
            <div><strong>Muted creators</strong><small>They stay followed. Their completion pills stay quiet.</small></div>
            ${mutedProfiles.length ? mutedProfiles.map(profile => `<div class="muted-creator-row"><span>${escapeHtml(profile.name)} <small>@${escapeHtml(profile.username)}</small></span><button type="button" data-unmute-creator="${profile.id}">Unmute</button></div>`).join('') : '<p>No one is muted.</p>'}
          </section>
          <p class="profile-form-error" role="alert">${escapeHtml(notificationSettingsError)}</p>
          <div class="notification-actions">
            <button type="button" data-action="close-notification-settings">Cancel</button>
            <button type="submit" ${notificationSettingsBusy ? 'disabled' : ''}>${notificationSettingsBusy ? 'Saving…' : 'Save settings'}</button>
          </div>
        </form>
      </section>
    </div>
  `
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
  queueMicrotask(() => document.querySelector<HTMLInputElement>('[data-profile-form] input[name="displayName"]')?.focus())
}

function renderProfileModal() {
  if (!profileModalOpen) return ''
  const photo = profilePhotoPreview || profileDraft.avatarUrl
  const initial = profileDraft.displayName.trim().charAt(0).toUpperCase() || 'S'
  const missing = new Set(currentProfileMissingFields())
  const fieldState = (field: CreatorProfileField) => missing.has(field) ? ' is-missing' : ''
  const required = (field: CreatorProfileField) => `<small class="profile-required" ${missing.has(field) ? '' : 'hidden'} aria-label="required">*</small>`
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
              <input name="displayName" autocomplete="name" maxlength="80" value="${escapeHtml(profileDraft.displayName)}" required />
            </label>
            <label class="${fieldState('username')}" data-profile-field="username">
              <span>Username ${required('username')}</span>
              <div class="profile-username">
                <i>@</i>
                <input name="username" autocomplete="username" minlength="3" maxlength="30" pattern="[a-z0-9_]{3,30}" value="${escapeHtml(profileDraft.username)}" aria-describedby="profile-username-tip" required />
                <button type="button" class="profile-info-tip" aria-label="Username help" aria-describedby="profile-username-tip">
                  <span aria-hidden="true">i</span>
                  <small class="profile-info-tooltip" id="profile-username-tip" role="tooltip">We suggested this from your name. You can change it.</small>
                </button>
              </div>
            </label>
            <label class="profile-form-wide${fieldState('bio')}" data-profile-field="bio">
              <span>Short bio ${required('bio')}</span>
              <div class="profile-textarea">
                <textarea name="bio" maxlength="140" rows="2" placeholder="What are you building?" aria-describedby="profile-bio-tip" required>${escapeHtml(profileDraft.bio)}</textarea>
                <button type="button" class="profile-info-tip" aria-label="Short bio help" aria-describedby="profile-bio-tip">
                  <span aria-hidden="true">i</span>
                  <small class="profile-info-tooltip" id="profile-bio-tip" role="tooltip">Try: “Designer at Kuda · 8k followers on X · Building tools for creators.”</small>
                </button>
              </div>
            </label>
            <label class="${fieldState('timezone')}" data-profile-field="timezone">
              <span>Timezone ${required('timezone')}</span>
              <input name="timezone" autocomplete="off" value="${escapeHtml(profileDraft.timezone)}" required />
            </label>
            <label class="${fieldState('defaultTaskVisibility')}" data-profile-field="defaultTaskVisibility">
              <span>New tasks ${required('defaultTaskVisibility')}</span>
              <select name="defaultTaskVisibility" aria-label="Default task visibility">
                ${renderVisibilityOptions(profileDraft.defaultTaskVisibility)}
              </select>
            </label>
          </div>
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
    const [user, client] = await Promise.all([currentUser(), getCloudClient()])
    if (!user) {
      const signInUrl = new URL('https://shotcount.app/')
      signInUrl.searchParams.set('auth', 'signin')
      if (pendingCreatorSlug) signInUrl.searchParams.set(creatorQueryKey, pendingCreatorSlug)
      window.location.replace(signInUrl.toString())
      return
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
    const [workspace, profileResult, communityResult] = await Promise.all([
      plannerRepository.initialize({ tasks: [...tasks], goals: [...goals] }),
      loadCreatorProfile(user)
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: null })),
      loadCreatorDirectory()
        .then(value => ({ ok: true as const, value }))
        .catch(() => ({ ok: false as const, value: [] as CommunityCreator[] })),
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
    authState = 'authenticated'
    void startNotificationSystem()
  } catch {
    authState = 'error'
  }
  render()
}

async function signOut() {
  try {
    completionSubscription?.()
    completionSubscription = null
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

function resolveCreatorIntent() {
  if (!pendingCreatorSlug) return
  const target = communityProfiles.find(profile => profile.username === pendingCreatorSlug)
  if (!target) {
    if (communityState === 'ready') {
      toast = `We could not find @${pendingCreatorSlug}.`
      clearCreatorIntentFromUrl()
    }
    return
  }
  communityProfiles = [target, ...communityProfiles.filter(profile => profile.id !== target.id)]
  creatorLinkTargetId = target.id
  rememberView('sticky')
  if (target.id === activeUser?.id) {
    toast = 'This is your creator link.'
    clearCreatorIntentFromUrl()
    return
  }
  if (target.followed) {
    toast = `You already follow ${target.name}.`
    clearCreatorIntentFromUrl()
    return
  }
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
        <button type="button" class="mobile-alert-button" data-action="notification-settings" aria-label="Notification settings">${icon('bell')}</button>
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
    if (todayKey !== previousTodayKey) render()
    scheduleDateRefresh()
  }, Math.max(1_000, nextMidnight.getTime() - Date.now()))
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
        <button class="side-row" data-action="notification-settings">${icon('bell')}<span>Alerts</span></button>
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
  const todayTasks = sortTasks(tasksForToday())
  return `
    <section class="today-screen">
      <header class="screen-title"><h1>Today</h1><span class="screen-count" data-count="${screenCounts.today}" aria-label="${screenCounts.today} tasks">${screenCounts.today}</span></header>
      ${todayComposerOpen ? renderTodayComposer() : `<button class="add-task-row" data-action="add-task">${icon('plus')}<span>Add New Task</span></button>`}
      <div class="task-list">
        ${todayTasks.length
          ? todayTasks.map(task => renderTaskRow(task, task.id === selectedTaskId)).join('')
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
          <textarea name="description" placeholder="Add a short note or useful context">${escapeHtml(todayComposerDraft.description)}</textarea>
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
          <span>Due time <small>Optional</small></span>
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
          <span class="task-visibility task-visibility--${normalizeTaskVisibility(task.visibility)}">${visibilityLabels[normalizeTaskVisibility(task.visibility)]}</span>
        </small>
      </button>
      <button class="task-chevron" data-task="${task.id}" aria-label="Open ${escapeHtml(task.title)}">${icon('chevron')}</button>
    </div>
  `
}

function renderInspector(task: Task) {
  const subtasks = task.subtaskItems ?? Array.from({ length: task.subtasks ?? 0 }, (_, index) => ({
    id: `${task.id}-subtask-${index}`,
    title: index === 0 ? 'Subtask' : `Subtask ${index + 1}`,
    completed: false,
  }))
  task.subtaskItems = subtasks
  const goal = goals.find(item => item.id === task.goalId)
  return `
    <aside class="inspector">
      <button type="button" class="inspector-close" data-action="close-inspector" aria-label="Close task details">${icon('chevron')}</button>
      <div class="inspector-content">
        <h2>Task:</h2>
        <input class="inspector-title" value="${escapeHtml(task.title)}" aria-label="Task title" />
        <textarea aria-label="Description" placeholder="Description">${escapeHtml(task.description ?? '')}</textarea>

        <div class="inspector-fields">
          <label><span>Goal</span><button data-action="cycle-goal">${escapeHtml(goal?.name ?? goals[0]?.name ?? 'No goal')} ${icon('down')}</button></label>
          <label><span>Due date</span><input class="inspector-date" type="date" value="${task.due ?? ''}" aria-label="Due date" /></label>
          <label><span>Due time</span><input class="inspector-time" type="time" value="${task.time ?? ''}" aria-label="Due time, optional" /></label>
          <label><span>Visibility</span><select class="inspector-visibility" data-task-visibility="${task.id}" aria-label="Task visibility" required>${renderVisibilityOptions(task.visibility)}</select></label>
        </div>

        <h3>Subtasks:</h3>
        <button class="add-subtask" data-action="add-subtask">${icon('plus')}<span>Add New Subtask</span></button>
        ${subtasks.map(subtask => `<label class="subtask"><input type="checkbox" data-subtask="${subtask.id}" ${subtask.completed ? 'checked' : ''}/><span class="${subtask.completed ? 'completed' : ''}">${escapeHtml(subtask.title)}</span></label>`).join('')}
      </div>
      <div class="inspector-actions">
        <button data-action="delete-task">Delete Task</button>
        <button class="save" data-action="save-task">Save changes</button>
      </div>
    </aside>
  `
}

function renderUpcoming() {
  const renderGroup = (group: UpcomingGroup) => sortTasks(tasksForUpcoming(group))
    .map(task => renderTaskRow(task))
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
      <input name="time" aria-label="Task time, optional" type="time" />
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
    return `<span class="activity-cell level-${isFuture ? 0 : level} ${isFuture ? 'is-future' : ''}" role="img" style="--column:${column + 1};--row:${row + 1}" title="${label}" aria-label="${label}"></span>`
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
  const scheduled = calendarOccurrences()
  const visible = scheduled.filter(item => !hiddenCalendarGoalIds.has(item.task.goalId ?? '') && taskMatchesCalendarSearch(item.task))
  const unscheduled = tasks.filter(task =>
    !task.time &&
    !completedTaskIds.has(task.id) &&
    !hiddenCalendarGoalIds.has(task.goalId ?? '') &&
    taskMatchesCalendarSearch(task)
  )
  const conflicts = countCalendarConflicts(visible)
  const plannedMinutes = visible.reduce((total, item) => total + (item.task.duration ?? 30), 0)
  return `
    <section class="calendar-screen">
      <header class="calendar-header">
        <div>
          <div class="calendar-title-row">
            <h1>${formatCalendarTitle()}</h1>
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

type CalendarOccurrence = { task: Task; date: string }

function calendarOccurrences(): CalendarOccurrence[] {
  const dates = calendarMode === 'month' ? monthGridDates(calendarDate) : visibleCalendarDates()
  return dates.flatMap(date => tasks
    .filter(task => task.time && !completedTaskIds.has(task.id) && taskOccursOn(task, date))
    .map(task => ({ task, date })))
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
  const { task, date } = item
  const goal = goals.find(candidate => candidate.id === task.goalId)
  const start = timeToMinutes(task.time!)
  const duration = task.duration ?? 30
  const top = Math.max(0, (start - 360) / 60 * 64)
  const height = Math.max(28, duration / 60 * 64)
  const conflict = all.some(other =>
    other !== item &&
    other.date === date &&
    rangesOverlap(start, start + duration, timeToMinutes(other.task.time!), timeToMinutes(other.task.time!) + (other.task.duration ?? 30))
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

function countCalendarConflicts(items: CalendarOccurrence[]) {
  return items.filter((item, index) => {
    const start = timeToMinutes(item.task.time!)
    return items.slice(0, index).some(other =>
      other.date === item.date &&
      rangesOverlap(start, start + (item.task.duration ?? 30), timeToMinutes(other.task.time!), timeToMinutes(other.task.time!) + (other.task.duration ?? 30))
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
  return `
    <article class="spotlight-card ${isCreatorLinkTarget ? 'creator-link-target' : ''}">
      ${renderLaunchPopover(profile, true)}
      <div class="spotlight-portrait portrait-frame" style="--portrait-column:${profile.portraitColumn};--portrait-row:${profile.portraitRow};--community-portrait:url(&quot;${communityPortraits}&quot;)">
        ${renderCommunityPortrait(profile)}
        <span class="spotlight-members">${profile.members} ${profile.isDemo ? 'people learning alongside them' : profile.followerCount === 1 ? 'follower' : 'followers'}</span>
      </div>
      <div class="spotlight-body">
        <p class="spotlight-role">${isCreatorLinkTarget ? `CREATOR LINK · @${escapeHtml(profile.username)}` : profile.isDemo ? `${escapeHtml(profile.role)} · Lagos` : `@${escapeHtml(profile.username)}`}</p>
        <h3>${escapeHtml(profile.name)}</h3>
        <p class="spotlight-intro">${escapeHtml(profile.isDemo ? 'Building useful products without losing the quiet routines that make ambitious work possible.' : profile.latest)}</p>
        ${profile.isDemo ? `<div class="spotlight-tasks">
          <div class="spotlight-tasks-heading"><strong>Today’s focus</strong><span>${profile.tasksToday} tasks · 3 complete</span></div>
          <div><i class="done">✓</i><span>Review the launch brief</span><time>8:40</time></div>
          <div><i class="done">✓</i><span>Approve the onboarding flow</span><time>10:15</time></div>
          <div><i></i><span>Founder interviews</span><time>14:00</time></div>
        </div>` : `<div class="creator-profile-facts"><strong>${profile.members}</strong><span>${profile.followerCount === 1 ? 'follower' : 'followers'}</span><small>Only tasks marked Followers or Public can be shared.</small></div>`}
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
  return `
    <article class="community-card">
      ${renderLaunchPopover(profile)}
      <div class="community-portrait portrait-frame" style="--portrait-column:${profile.portraitColumn};--portrait-row:${profile.portraitRow};--community-portrait:url(&quot;${communityPortraits}&quot;)">
        ${renderCommunityPortrait(profile)}
        <span>${profile.members} ${profile.isDemo ? 'members' : profile.followerCount === 1 ? 'follower' : 'followers'}</span>
        <button class="community-follow ${profile.followed ? 'is-following' : ''}" data-follow="${profile.id}" aria-label="${profile.followed ? 'Unfollow' : 'Follow'} ${escapeHtml(profile.name)}" aria-pressed="${profile.followed}" ${busy ? 'disabled' : ''}>
          ${busy ? '…' : profile.followed ? '✓' : icon('plus')}
        </button>
      </div>
      <div class="community-card-body">
        <p class="community-role">${profile.isDemo ? escapeHtml(profile.role) : `@${escapeHtml(profile.username)}`}</p>
        <h3>${escapeHtml(profile.name)}</h3>
        <div class="community-activity">
          <span>${profile.isDemo ? `<b>${profile.tasksToday}</b> tasks today` : `<b>${profile.members}</b> ${profile.followerCount === 1 ? 'follower' : 'followers'}`}</span>
          <span class="activity-dot"></span>
          <span>${profile.isDemo ? 'Active now' : 'Public profile'}</span>
        </div>
        <p class="community-latest">${profile.isDemo ? '<span>✓</span>' : ''}${escapeHtml(profile.latest)}</p>
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
  const title = document.querySelector<HTMLInputElement>('.inspector-title')?.value.trim()
  const description = document.querySelector<HTMLTextAreaElement>('.inspector textarea')?.value
  const due = document.querySelector<HTMLInputElement>('.inspector-date')?.value
  const time = document.querySelector<HTMLInputElement>('.inspector-time')?.value
  const visibility = document.querySelector<HTMLSelectElement>('.inspector-visibility')?.value
  if (title) task.title = title
  if (description !== undefined) task.description = description
  if (due !== undefined) task.due = due || undefined
  if (time !== undefined) task.time = time || undefined
  if (visibility !== undefined) task.visibility = normalizeTaskVisibility(visibility)
  persistPlanner()
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
  const notificationForm = target.closest<HTMLFormElement>('[data-notification-form]')
  if (notificationForm) {
    event.preventDefault()
    const data = new FormData(notificationForm)
    notificationPreferences = {
      ...notificationPreferences,
      completionAlerts: data.get('completionAlerts') === 'on',
      quietHoursEnabled: data.get('quietHoursEnabled') === 'on',
      quietStart: String(data.get('quietStart') ?? '22:00'),
      quietEnd: String(data.get('quietEnd') ?? '08:00'),
    }
    notificationSettingsBusy = true
    notificationSettingsError = ''
    render()
    try {
      if (!showDemoData) await saveNotificationPreferences(notificationPreferences, creatorProfile?.timezone ?? profileDraft.timezone)
      notificationSettingsBusy = false
      notificationSettingsOpen = false
      if (!notificationPreferences.completionAlerts) clearIsland()
      toast = 'Notification settings saved'
      render()
      window.setTimeout(() => {
        toast = ''
        render()
      }, 1400)
    } catch (error) {
      notificationSettingsBusy = false
      notificationSettingsError = error instanceof Error ? error.message : 'Notification settings could not be saved.'
      render()
    }
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
      profileBusy = false
      clearProfilePhotoPreview()
      resetTodayComposerDraft()
      toast = 'Profile saved'
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
    const newTask: Task = normalizeTask({
      id: crypto.randomUUID(),
      title,
      description: String(data.get('description') ?? '').trim(),
      goalId: goalId || undefined,
      due,
      time: String(data.get('time') ?? '') || undefined,
      visibility: normalizeTaskVisibility(data.get('visibility')),
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

app.addEventListener('change', event => {
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
    render()
    return
  }

  const nextView = target.closest<HTMLElement>('[data-view]')?.dataset.view as View | undefined
  if (nextView) {
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
    rememberView(nextView)
    render()
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

  const taskId = target.closest<HTMLElement>('[data-task]')?.dataset.task
  if (taskId) {
    selectedTaskId = taskId
    if (view === 'upcoming') {
      toast = 'This task is planned for a future day'
      render()
      window.setTimeout(() => {
        toast = ''
        render()
      }, 1400)
      return
    }
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

  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
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
  if (action === 'notification-settings') {
    notificationSettingsError = ''
    notificationSettingsOpen = true
    render()
    return
  }
  if (action === 'close-notification-settings') {
    notificationSettingsBusy = false
    notificationSettingsError = ''
    notificationSettingsOpen = false
    render()
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
      const subtaskNumber = (task.subtaskItems?.length ?? 0) + 1
      task.subtaskItems = [
        ...(task.subtaskItems ?? []),
        { id: crypto.randomUUID(), title: subtaskNumber === 1 ? 'Subtask' : `Subtask ${subtaskNumber}`, completed: false },
      ]
      task.subtasks = task.subtaskItems.length
    }
    toast = 'New subtask ready'
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
if (notificationPreview) notificationSettingsOpen = true
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
render()
if (authRequired) void verifyAuthSession()
scheduleDateRefresh()
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
    void plannerRepository?.refresh()
    void refreshSignedInProfile()
    void checkForCompletionAlerts()
  }
})
dateStateHook.__shotcountRefreshDateState = (reference = new Date()) => {
  refreshDateContext(reference)
  calendarDate = new Date(reference)
  render()
}
