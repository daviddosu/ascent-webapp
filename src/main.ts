import './style.css'
import { continueWithGoogle, openWorkspaceWithSession, requestEmailCode as requestCloudEmailCode, verifyEmailCode as verifyCloudEmailCode } from './data/cloud'

type View = 'today' | 'feed' | 'profile' | 'review'

type Task = {
  id: string
  title: string
  createdAt: string
  plannedFor: string
  completedAt: string | null
  archivedAt: string | null
  carryPending: boolean
  carryHistory: Array<{ date: string; reason: string }>
}

type FeedItem = {
  id: string
  author: string
  action: string
  timestamp: string
  reacted: boolean
  kind: 'execution' | 'lesson' | 'review'
}

type NotificationItem = {
  id: string
  text: string
  timestamp: string
  read: boolean
}

type ReviewAnswers = {
  whatWentWell: string
  blockers: string
  stopDoing: string
  doubleDownOn: string
}

type ReviewState = {
  submittedFor: string | null
  submittedAt: string | null
  answers: ReviewAnswers
}

type Session = {
  name: string
  email: string
}

type AppState = {
  signedIn: boolean
  session: Session | null
  view: View
  tasks: Task[]
  feed: FeedItem[]
  notifications: NotificationItem[]
  review: ReviewState
  draftOpen: boolean
  draftValue: string
  notificationPanelOpen: boolean
  carryPromptTaskIds: string[]
  lastCheckedDate: string
}

const STORAGE_PREFIX = 'shotcount-current-v1:'
const STORAGE_KEY = `${STORAGE_PREFIX}state`
const ORIGIN_CLEANUP_MARKER = `${STORAGE_PREFIX}previous-app-cleared`
const ROBUST_WORKSPACE_URL = 'https://app.shotcount.app/'
const DAY_MS = 24 * 60 * 60 * 1000
let fallbackId = 0
let focusMotionFrame = 0
let peopleRailFrame = 0
let peopleRailDragging = false
let peopleRailPointerId: number | null = null
let peopleRailStartX = 0
let peopleRailStartScrollLeft = 0
let authModalOpen = new URLSearchParams(window.location.search).get('auth') === 'signin'
let authError = new URLSearchParams(window.location.search).get('error') ?? ''
let authStep: 'email' | 'code' = 'email'
let authEmail = ''
let authBusy = false
let authNotice = ''
let workspaceNavigationScheduled = false

function isolateCurrentAppStorage() {
  try {
    if (localStorage.getItem(ORIGIN_CLEANUP_MARKER) === 'yes') return

    Object.keys(localStorage)
      .filter(key => !key.startsWith(STORAGE_PREFIX))
      .forEach(key => localStorage.removeItem(key))
    sessionStorage.clear()

    localStorage.setItem(ORIGIN_CLEANUP_MARKER, 'yes')
  } catch {
    // A blocked storage API cannot make the new app read the previous app's data.
  }
}

async function retirePreviousDomainRuntime() {
  try {
    if ('caches' in window) {
      const keys = await window.caches.keys()
      await Promise.all(keys.map(key => window.caches.delete(key)))
    }
  } catch {
    // Cache cleanup is best-effort on older browsers.
  }

  try {
    const databases = await indexedDB.databases?.() ?? []
    databases.forEach(database => {
      if (database.name) indexedDB.deleteDatabase(database.name)
    })
  } catch {
    // IndexedDB discovery is not available in every browser.
  }

  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? []
    await Promise.all(registrations.map(registration => registration.unregister()))
  } catch {
    // Service workers are optional and may already be absent.
  }
}

isolateCurrentAppStorage()
void retirePreviousDomainRuntime()

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  fallbackId += 1
  return `shotcount-${Date.now().toString(36)}-${fallbackId.toString(36)}`
}

const todayDate = () => toDateKey(new Date())

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const emptyAnswers = (): ReviewAnswers => ({
  whatWentWell: '',
  blockers: '',
  stopDoing: '',
  doubleDownOn: '',
})

const seedState = (): AppState => {
  const today = todayDate()
  const yesterday = shiftDate(today, -1)
  const twoDaysAgo = shiftDate(today, -2)

  return {
    signedIn: false,
    session: null,
    view: 'today',
    tasks: [
      {
        id: createId(),
        title: 'Finish grant proposal',
        createdAt: `${today}T08:20:00.000Z`,
        plannedFor: today,
        completedAt: null,
        archivedAt: null,
        carryPending: false,
        carryHistory: [],
      },
      {
        id: createId(),
        title: 'Email Professor Müller',
        createdAt: `${today}T08:35:00.000Z`,
        plannedFor: today,
        completedAt: null,
        archivedAt: null,
        carryPending: false,
        carryHistory: [],
      },
      {
        id: createId(),
        title: 'Gym',
        createdAt: `${today}T07:00:00.000Z`,
        plannedFor: today,
        completedAt: `${today}T10:10:00.000Z`,
        archivedAt: null,
        carryPending: false,
        carryHistory: [],
      },
      {
        id: createId(),
        title: 'Record YouTube video',
        createdAt: `${today}T09:15:00.000Z`,
        plannedFor: today,
        completedAt: null,
        archivedAt: null,
        carryPending: false,
        carryHistory: [],
      },
      {
        id: createId(),
        title: 'Read reinforcement learning paper',
        createdAt: `${yesterday}T12:20:00.000Z`,
        plannedFor: yesterday,
        completedAt: `${yesterday}T18:00:00.000Z`,
        archivedAt: null,
        carryPending: false,
        carryHistory: [],
      },
      {
        id: createId(),
        title: 'Call collaborator',
        createdAt: `${twoDaysAgo}T11:10:00.000Z`,
        plannedFor: twoDaysAgo,
        completedAt: `${twoDaysAgo}T16:40:00.000Z`,
        archivedAt: null,
        carryPending: false,
        carryHistory: [],
      },
    ],
    feed: [
      {
        id: createId(),
        author: 'Sarah',
        action: '✓ Submitted scholarship application',
        timestamp: shiftDateTime(today, 'T12:02:00.000Z'),
        reacted: false,
        kind: 'execution',
      },
      {
        id: createId(),
        author: 'Michael',
        action: '✓ Published first article',
        timestamp: shiftDateTime(today, 'T11:52:00.000Z'),
        reacted: false,
        kind: 'execution',
      },
      {
        id: createId(),
        author: 'David',
        action: '✓ Finished CERN proposal',
        timestamp: shiftDateTime(today, 'T11:42:00.000Z'),
        reacted: true,
        kind: 'execution',
      },
      {
        id: createId(),
        author: 'Coach',
        action: 'Weekly lesson is ready',
        timestamp: shiftDateTime(today, 'T08:15:00.000Z'),
        reacted: false,
        kind: 'lesson',
      },
    ],
    notifications: [
      {
        id: createId(),
        text: 'Sarah completed "Submit application".',
        timestamp: shiftDateTime(today, 'T12:02:00.000Z'),
        read: false,
      },
      {
        id: createId(),
        text: 'Weekly review is ready for Sunday.',
        timestamp: shiftDateTime(today, 'T08:15:00.000Z'),
        read: false,
      },
    ],
    review: {
      submittedFor: null,
      submittedAt: null,
      answers: emptyAnswers(),
    },
    draftOpen: false,
    draftValue: '',
    notificationPanelOpen: false,
    carryPromptTaskIds: [],
    lastCheckedDate: today,
  }
}

function shiftDate(dateKey: string, deltaDays: number) {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return toDateKey(date)
}

function shiftDateTime(dateKey: string, timeSuffix: string) {
  return `${dateKey}${timeSuffix}`
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatShortDate(dateKey: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00Z`))
}

function formatClock(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function formatRelativeTime(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.max(1, Math.floor(diff / 60000))
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function loadState(): AppState {
  const seeded = seedState()
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return seeded
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      ...seeded,
      ...parsed,
      session: parsed.session ?? null,
      tasks: parsed.tasks ?? seeded.tasks,
      feed: parsed.feed ?? seeded.feed,
      notifications: parsed.notifications ?? seeded.notifications,
      review: parsed.review ?? seeded.review,
      carryPromptTaskIds: parsed.carryPromptTaskIds ?? [],
      draftOpen: parsed.draftOpen ?? false,
      draftValue: parsed.draftValue ?? '',
      notificationPanelOpen: false,
      lastCheckedDate: parsed.lastCheckedDate ?? todayDate(),
      view: parsed.view ?? 'today',
      signedIn: parsed.signedIn ?? false,
    }
  } catch {
    return seeded
  }
}

let state = loadState()
const appNode = document.querySelector<HTMLDivElement>('#app')

if (!appNode) {
  throw new Error('App root not found')
}

const app = appNode

hydrateStateForToday()
queueMicrotask(render)

function isWorkspaceRoute() {
  return window.location.pathname === '/workspace'
}

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    state = loadState()
    hydrateStateForToday()
    render()
  }
})

window.addEventListener('popstate', () => {
  render()
})

setInterval(() => {
  const before = state.lastCheckedDate
  hydrateStateForToday()
  if (before !== state.lastCheckedDate) {
    render()
  }
}, 60_000)

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null
  if (!target) return

  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
  if (!action) return

  if (action === 'switch-view') {
    state.view = target.closest<HTMLElement>('[data-view]')?.dataset.view as View
    state.notificationPanelOpen = false
    persistAndRender()
    return
  }

  if (action === 'signin') {
    openAuthModal()
    return
  }

  if (action === 'close-auth') {
    closeAuthModal()
    return
  }

  if (action === 'continue-google') {
    void startGoogleSignIn()
    return
  }

  if (action === 'change-auth-email') {
    authStep = 'email'
    authEmail = ''
    authError = ''
    authNotice = ''
    render()
    return
  }

  if (action === 'resend-email-code') {
    if (authEmail) void sendEmailCode(authEmail, true)
    return
  }

  if (action === 'toggle-notifications') {
    state.notificationPanelOpen = !state.notificationPanelOpen
    persistAndRender()
    return
  }

  if (action === 'open-draft') {
    state.draftOpen = true
    state.draftValue = ''
    persistAndRender()
    queueMicrotask(() => {
      app.querySelector<HTMLInputElement>('#task-draft')?.focus()
    })
    return
  }

  if (action === 'cancel-draft') {
    state.draftOpen = false
    state.draftValue = ''
    persistAndRender()
    return
  }

  if (action === 'add-task') {
    const input = app.querySelector<HTMLInputElement>('#task-draft')
    const value = input?.value.trim() ?? state.draftValue.trim()
    if (!value) {
      return
    }
    addTask(value)
    return
  }

  if (action === 'complete-task') {
    const id = target.dataset.taskId
    if (id) completeTask(id)
    return
  }

  if (action === 'carry-reason') {
    const taskId = target.dataset.taskId
    const reason = target.dataset.reason
    if (taskId && reason) resolveCarryForward(taskId, reason)
    return
  }

  if (action === 'toggle-reaction') {
    const feedId = target.dataset.feedId
    if (feedId) toggleReaction(feedId)
    return
  }

  if (action === 'mark-notification-read') {
    const notificationId = target.dataset.notificationId
    if (notificationId) markNotificationRead(notificationId)
    return
  }
})

app.addEventListener('submit', async (event) => {
  const form = event.target as HTMLFormElement
  if (form.id === 'email-auth-form') {
    event.preventDefault()
    await requestEmailCode(form)
    return
  }

  if (form.id === 'email-code-form') {
    event.preventDefault()
    await verifyEmailCode(form)
    return
  }

  if (form.id === 'review-form') {
    event.preventDefault()
    submitReview(form)
    return
  }

  if (form.id === 'draft-form') {
    event.preventDefault()
    const input = form.querySelector<HTMLInputElement>('#task-draft')
    const value = input?.value.trim() ?? ''
    if (value) addTask(value)
  }
})

app.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null
  if (!target) return

  if (target.id === 'task-draft') {
    state.draftValue = target.value
    persist()
  }

  if (target.id === 'auth-email') {
    authEmail = target.value
    return
  }

  if (target.id === 'email-code') {
    const code = target.value.replace(/\D/g, '').slice(0, 6)
    if (target.value !== code) target.value = code
    if (code.length === 6 && !authBusy) target.form?.requestSubmit()
  }
})

app.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.draftOpen) {
    state.draftOpen = false
    state.draftValue = ''
    persistAndRender()
  }
})

window.addEventListener('scroll', scheduleFocusMotionUpdate, { passive: true })
window.addEventListener('resize', scheduleFocusMotionUpdate)

function hydrateStateForToday() {
  const today = todayDate()
  if (state.lastCheckedDate === today) {
    ensureSundayReviewState(today)
    return
  }

  const daysBetween = Math.max(1, Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${state.lastCheckedDate}T00:00:00`).getTime()) / DAY_MS))
  let cursor = state.lastCheckedDate

  for (let i = 0; i < daysBetween; i += 1) {
    const nextDay = shiftDate(cursor, 1)
    carryForwardOpenTasks(nextDay)
    cursor = nextDay
  }

  state.lastCheckedDate = today
  archiveOldTasks(today)
  ensureSundayReviewState(today)
  persist()
}

function carryForwardOpenTasks(today: string) {
  const carryReason = 'This task was carried forward.'
  const openTasks = state.tasks.filter(
    (task) => !task.completedAt && !task.archivedAt && task.plannedFor < today && !task.carryPending,
  )

  for (const task of openTasks) {
    task.plannedFor = today
    task.carryPending = true
    task.carryHistory.push({ date: today, reason: carryReason })
    if (!state.carryPromptTaskIds.includes(task.id)) {
      state.carryPromptTaskIds.push(task.id)
    }
  }
}

function archiveOldTasks(today: string) {
  const cutoff = new Date(`${today}T00:00:00`).getTime() - 30 * DAY_MS
  for (const task of state.tasks) {
    if (!task.completedAt || task.archivedAt) continue
    const completedAt = new Date(task.completedAt).getTime()
    if (completedAt < cutoff) {
      task.archivedAt = new Date().toISOString()
    }
  }
}

function ensureSundayReviewState(today: string) {
  if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 0) {
    return
  }

  if (state.review.submittedFor === today) {
    return
  }

  const hasNotice = state.notifications.some((item) => item.text === 'Weekly review is ready for Sunday.')
  if (!hasNotice) {
    state.notifications.unshift({
      id: createId(),
      text: 'Weekly review is ready for Sunday.',
      timestamp: `${today}T08:00:00.000Z`,
      read: false,
    })
  }
}

function addTask(title: string) {
  const today = todayDate()
  state.tasks.unshift({
    id: createId(),
    title,
    createdAt: `${today}T${new Date().toISOString().slice(11)}`,
    plannedFor: today,
    completedAt: null,
    archivedAt: null,
    carryPending: false,
    carryHistory: [],
  })
  state.draftOpen = false
  state.draftValue = ''
  state.notifications.unshift({
    id: createId(),
    text: `Task added: "${title}".`,
    timestamp: new Date().toISOString(),
    read: false,
  })
  persistAndRender()
}

function completeTask(taskId: string) {
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task || task.completedAt) return
  const now = new Date().toISOString()
  task.completedAt = now
  task.carryPending = false
  state.carryPromptTaskIds = state.carryPromptTaskIds.filter((id) => id !== taskId)

  const actor = state.session?.name ?? 'David'
  state.feed.unshift({
    id: createId(),
    author: actor,
    action: `✓ Completed "${task.title}"`,
    timestamp: now,
    reacted: false,
    kind: 'execution',
  })
  state.notifications.unshift({
    id: createId(),
    text: `${actor} completed "${task.title}".`,
    timestamp: now,
    read: false,
  })

  persistAndRender()
}

function resolveCarryForward(taskId: string, reason: string) {
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task) return
  task.carryPending = false
  task.carryHistory.push({ date: todayDate(), reason })
  state.carryPromptTaskIds = state.carryPromptTaskIds.filter((id) => id !== taskId)
  state.notifications.unshift({
    id: createId(),
    text: `Carry-forward noted: "${task.title}" - ${reason}.`,
    timestamp: new Date().toISOString(),
    read: false,
  })
  persistAndRender()
}

function toggleReaction(feedId: string) {
  const item = state.feed.find((entry) => entry.id === feedId)
  if (!item) return
  item.reacted = !item.reacted
  persistAndRender()
}

function markNotificationRead(notificationId: string) {
  const item = state.notifications.find((entry) => entry.id === notificationId)
  if (!item) return
  item.read = true
  persistAndRender()
}

function submitReview(form: HTMLFormElement) {
  const today = todayDate()
  const data = new FormData(form)
  state.review = {
    submittedFor: today,
    submittedAt: new Date().toISOString(),
    answers: {
      whatWentWell: String(data.get('whatWentWell') ?? '').trim(),
      blockers: String(data.get('blockers') ?? '').trim(),
      stopDoing: String(data.get('stopDoing') ?? '').trim(),
      doubleDownOn: String(data.get('doubleDownOn') ?? '').trim(),
    },
  }
  state.notifications.unshift({
    id: createId(),
    text: 'Weekly review completed.',
    timestamp: new Date().toISOString(),
    read: false,
  })
  persistAndRender()
}

function persistAndRender() {
  persist()
  render()
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function render() {
  document.body.dataset.view = state.view
  document.body.dataset.signedIn = String(state.signedIn)
  void [renderHeader, renderSidebar, renderTodayView, renderFeedView, renderProfileView, renderReviewView, renderNotificationPanel, renderReviewOverlay]

  if (isWorkspaceRoute()) {
    showLoadingThenOpenWorkspace(true)
    return
  }

  app.innerHTML = renderAuth()
  scheduleFocusMotionUpdate()
  schedulePeopleRailMotion()
}

function renderAuthLoadingScreen() {
  return `
    <main class="auth-loading-screen" role="status" aria-live="polite" aria-label="Loading Shotcount">
      <img src="/shotcount-loading.gif" alt="" />
    </main>
  `
}

function showLoadingThenOpenWorkspace(replace = false) {
  if (workspaceNavigationScheduled) return
  workspaceNavigationScheduled = true
  authBusy = true
  app.innerHTML = renderAuthLoadingScreen()
  window.requestAnimationFrame(() => {
    if (replace) window.location.replace(ROBUST_WORKSPACE_URL)
    else window.location.assign(ROBUST_WORKSPACE_URL)
  })
}

function openAuthModal(error = '') {
  authModalOpen = true
  authError = error
  authNotice = ''
  const url = new URL(window.location.href)
  url.searchParams.set('auth', 'signin')
  if (error) url.searchParams.set('error', error)
  else url.searchParams.delete('error')
  window.history.replaceState({}, '', url)
  render()
}

function closeAuthModal() {
  authModalOpen = false
  authError = ''
  authStep = 'email'
  authEmail = ''
  authNotice = ''
  const url = new URL(window.location.href)
  url.searchParams.delete('auth')
  url.searchParams.delete('error')
  window.history.replaceState({}, '', url)
  render()
}

async function requestEmailCode(form: HTMLFormElement) {
  const email = String(new FormData(form).get('email') ?? '').trim().toLowerCase()
  await sendEmailCode(email)
}

function friendlyEmailAuthError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  const lower = message.toLowerCase()
  if (lower.includes('rate') || lower.includes('too many')) return 'Too many attempts. Wait a minute, then try again.'
  if (lower.includes('expired')) return 'That code has expired. Send a new code and try again.'
  if (lower.includes('invalid') || lower.includes('token')) return 'That code is not correct. Check the email and try again.'
  return message || fallback
}

async function sendEmailCode(email: string, resend = false) {
  email = email.trim().toLowerCase()
  if (!email || authBusy) return
  authEmail = email
  authBusy = true
  authError = ''
  authNotice = ''
  render()
  try {
    const { error } = await requestCloudEmailCode(email)
    if (error) throw error
    authStep = 'code'
    if (resend) authNotice = 'A fresh code is on its way.'
  } catch (error) {
    authError = friendlyEmailAuthError(error, 'We could not send the code. Check the address and try again.')
  } finally {
    authBusy = false
    render()
    if (authStep === 'code') queueMicrotask(() => app.querySelector<HTMLInputElement>('#email-code')?.focus())
  }
}

async function verifyEmailCode(form: HTMLFormElement) {
  const code = String(new FormData(form).get('code') ?? '').replace(/\D/g, '').slice(0, 6)
  if (code.length !== 6 || authBusy) {
    authError = 'Enter the six numbers from your email.'
    render()
    return
  }
  authBusy = true
  authError = ''
  authNotice = ''
  render()
  try {
    const { data, error } = await verifyCloudEmailCode(authEmail, code)
    if (error || !data.session) throw error ?? new Error('That code did not work.')
    openWorkspaceWithSession(data.session)
  } catch (error) {
    authBusy = false
    authError = friendlyEmailAuthError(error, 'That code did not work. Send a new one and try again.')
    render()
  }
}

async function startGoogleSignIn() {
  if (authBusy) return
  authBusy = true
  authError = ''
  render()
  const { error } = await continueWithGoogle()
  if (error) {
    authBusy = false
    authError = error.message || 'Google could not sign you in just now.'
    render()
  }
}

function renderGoogleAuthModal() {
  if (!authModalOpen) return ''
  const errorMessage = authError === 'google-signin-unavailable'
    ? 'Google could not sign you in just now. Please try again.'
    : authError

  const emailStep = authStep === 'email'

  return `
    <div class="google-auth" role="presentation">
      <button type="button" class="google-auth-backdrop" data-action="close-auth" aria-label="Close sign in"></button>
      <section class="google-auth-card simple-auth-card" role="dialog" aria-modal="true" aria-labelledby="google-auth-title">
        <button type="button" class="google-auth-close" data-action="close-auth" aria-label="Close sign in">×</button>
        <h2 id="google-auth-title">Shotcount: your space for real progress.</h2>
        <p>${emailStep ? 'Sign up or log in with your email' : `We sent a six-digit code to <strong>${escapeHtml(authEmail)}</strong>`}</p>
        ${emailStep ? `
          <form class="simple-auth-form" id="email-auth-form">
            <label for="auth-email">Email</label>
            <input id="auth-email" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com" value="${escapeHtml(authEmail)}" required />
            <button type="submit" ${authBusy ? 'disabled' : ''}>${authBusy ? 'Sending…' : 'Continue with email'}</button>
          </form>
          <div class="simple-auth-divider"><span>or continue with</span></div>
          <button type="button" class="google-auth-button" data-action="continue-google" ${authBusy ? 'disabled' : ''}>
            <span aria-hidden="true">G</span>${authBusy ? 'Opening Google…' : 'Continue with Google'}
          </button>
        ` : `
          <form class="simple-auth-form code-form" id="email-code-form">
            <label for="email-code">Login code</label>
            <input id="email-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required />
            <button type="submit" ${authBusy ? 'disabled' : ''}>${authBusy ? 'Checking…' : 'Open Shotcount'}</button>
          </form>
          <div class="simple-auth-code-actions">
            <button type="button" class="simple-auth-back" data-action="change-auth-email">Use a different email</button>
            <button type="button" class="simple-auth-back" data-action="resend-email-code" ${authBusy ? 'disabled' : ''}>Send a new code</button>
          </div>
        `}
        <p class="simple-auth-notice" role="status">${escapeHtml(authNotice)}</p>
        <p class="google-auth-error" data-auth-error role="alert">${escapeHtml(errorMessage)}</p>
        <small>By continuing, you agree to the Shotcount Terms &amp; Conditions and Privacy Policy.</small>
      </section>
    </div>
  `
}

function scheduleFocusMotionUpdate() {
  if (focusMotionFrame) return

  focusMotionFrame = window.requestAnimationFrame(() => {
    focusMotionFrame = 0
    updateFocusMotion()
  })
}

function updateFocusMotion() {
  const panels = app.querySelectorAll<HTMLElement>('.focus-demo, .orbit-demo')
  if (!panels.length) return

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true) {
    panels.forEach((panel) => {
      panel.style.setProperty('--focus-scale', '1')
      panel.style.setProperty('--focus-tilt-x', '0deg')
      panel.style.setProperty('--focus-tilt-y', '0deg')
      panel.style.setProperty('--focus-lift', '0px')
      panel.querySelectorAll<HTMLElement>('.orbit-center, .orbit-person, :scope > span').forEach((node) => {
        node.style.setProperty('--node-scale', '1')
        node.style.setProperty('--node-opacity', '1')
        node.style.setProperty('--node-blur', '0px')
        node.style.setProperty('--node-rotate', '0deg')
        node.style.setProperty('--node-y', '0px')
      })
    })
    return
  }

  panels.forEach((panel) => {
    const section = panel.closest<HTMLElement>('.shotcount-feature')
    if (!section) return

    const rect = section.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportCenter = viewportHeight / 2
    const sectionCenter = rect.top + rect.height / 2
    const offset = clamp((sectionCenter - viewportCenter) / viewportCenter, -1, 1)
    const visibleTop = Math.max(rect.top, 0)
    const visibleBottom = Math.min(rect.bottom, viewportHeight)
    const focus = clamp((visibleBottom - visibleTop) / Math.max(rect.height, 1), 0, 1)

    const scale = 0.82 + focus * 0.26
    const tiltX = -offset * (8 + focus * 10)
    const tiltY = offset * (6 + focus * 8)
    const lift = focus * -24

    panel.style.setProperty('--focus-scale', scale.toFixed(3))
    panel.style.setProperty('--focus-tilt-x', `${tiltX.toFixed(2)}deg`)
    panel.style.setProperty('--focus-tilt-y', `${tiltY.toFixed(2)}deg`)
    panel.style.setProperty('--focus-lift', `${lift.toFixed(2)}px`)

    if (panel.classList.contains('orbit-demo')) {
      panel.querySelectorAll<HTMLElement>('.orbit-center, .orbit-person').forEach((node, index) => {
        const start = index * 0.045
        const progress = clamp((focus - start) / (0.82 - start), 0, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        const pop = Math.sin(progress * Math.PI) * 0.22
        const nodeScale = 0.16 + eased * 0.84 + pop

        node.style.setProperty('--node-scale', nodeScale.toFixed(3))
        node.style.setProperty('--node-opacity', clamp(progress * 2.2, 0, 1).toFixed(3))
        node.style.setProperty('--node-blur', `${((1 - progress) * 9).toFixed(2)}px`)
        node.style.setProperty('--node-rotate', `${(offset * (index % 2 ? -10 : 10) * (1 - progress)).toFixed(2)}deg`)
      })

      panel.querySelectorAll<HTMLElement>(':scope > span').forEach((badge, index) => {
        const start = 0.12 + index * 0.1
        const progress = clamp((focus - start) / (0.78 - start), 0, 1)
        const eased = 1 - Math.pow(1 - progress, 4)
        const pop = Math.sin(progress * Math.PI) * 0.38
        const nodeScale = 0.06 + eased * 0.94 + pop

        badge.style.setProperty('--node-scale', nodeScale.toFixed(3))
        badge.style.setProperty('--node-opacity', clamp(progress * 2.6, 0, 1).toFixed(3))
        badge.style.setProperty('--node-blur', `${((1 - progress) * 12).toFixed(2)}px`)
        badge.style.setProperty('--node-y', `${((1 - progress) * 28).toFixed(2)}px`)
      })
    }
  })
}

function schedulePeopleRailMotion() {
  if (peopleRailFrame) return

  peopleRailFrame = window.requestAnimationFrame(() => {
    peopleRailFrame = 0
    updatePeopleRailMotion()
  })
}

function updatePeopleRailMotion() {
  const rail = app.querySelector<HTMLElement>('.people-rail')
  if (!rail) {
    peopleRailDragging = false
    peopleRailPointerId = null
    return
  }

  wirePeopleRail(rail)

  if (!(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true) && !peopleRailDragging) {
    rail.scrollLeft += 0.35
    wrapPeopleRailScroll(rail)
  }

  peopleRailFrame = window.requestAnimationFrame(() => {
    peopleRailFrame = 0
    updatePeopleRailMotion()
  })
}

function wrapPeopleRailScroll(rail: HTMLElement) {
  const halfWidth = rail.scrollWidth / 2
  if (halfWidth <= 0) return

  if (rail.scrollLeft >= halfWidth) {
    rail.scrollLeft -= halfWidth
  } else if (rail.scrollLeft < 0) {
    rail.scrollLeft += halfWidth
  }
}

function wirePeopleRail(rail: HTMLElement) {
  if (rail.dataset.dragBound === 'true') return
  rail.dataset.dragBound = 'true'
  rail.style.scrollBehavior = 'auto'

  const beginDrag = (event: PointerEvent) => {
    if (event.button !== 0) return
    peopleRailDragging = true
    peopleRailPointerId = event.pointerId
    peopleRailStartX = event.clientX
    peopleRailStartScrollLeft = rail.scrollLeft
    rail.classList.add('is-dragging')
    try {
      rail.setPointerCapture(event.pointerId)
    } catch {
      // Some browsers do not support capture here; dragging still works.
    }
  }

  const moveDrag = (event: PointerEvent) => {
    if (!peopleRailDragging || peopleRailPointerId !== event.pointerId) return
    const delta = event.clientX - peopleRailStartX
    rail.scrollLeft = peopleRailStartScrollLeft - delta
    wrapPeopleRailScroll(rail)
  }

  const endDrag = (event: PointerEvent) => {
    if (peopleRailPointerId !== event.pointerId) return
    peopleRailDragging = false
    peopleRailPointerId = null
    rail.classList.remove('is-dragging')
    try {
      rail.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore release errors when capture was never granted.
    }
  }

  rail.addEventListener('pointerdown', beginDrag)
  rail.addEventListener('pointermove', moveDrag)
  rail.addEventListener('pointerup', endDrag)
  rail.addEventListener('pointercancel', endDrag)
  rail.addEventListener('pointerleave', () => {
    if (!peopleRailDragging) {
      rail.classList.remove('is-dragging')
    }
  })
}

function renderAuth() {
  if (authBusy) return renderAuthLoadingScreen()

  return `
    <main class="craft-landing">
      <section class="craft-hero">
        <header class="craft-nav">
          <a class="craft-logo" href="#" aria-label="Shotcount home">SHOTCOUNT</a>
          <nav class="craft-links" aria-label="Main navigation">
            <a class="craft-nav-item" href="#product">Product</a>
            <a class="craft-nav-item" href="#community">Community</a>
            <a class="craft-nav-item" href="#pricing">Pricing</a>
            <a class="craft-nav-item" href="#download">Download</a>
          </nav>
          <div class="craft-account">
            <button type="button" class="craft-login craft-nav-item" data-action="signin" data-variant="email">Log in</button>
            <button type="button" class="craft-try" data-action="signin" data-variant="email">Try Shotcount Free</button>
          </div>
        </header>

        <div class="craft-copy" id="product">
          <h1>Your space for goals,<br />focus, and real progress</h1>
          <button type="button" class="craft-cta" data-action="signin" data-variant="email">Try Shotcount Free</button>
        </div>

        <section class="craft-app-window" aria-label="Shotcount app preview">
          <iframe
            class="craft-static-frame"
            title="Frozen Shotcount Upcoming workspace preview"
            src="/upcoming-workspace-preview.html"
            loading="eager"
            tabindex="-1"
          ></iframe>
        </section>
      </section>

      <section class="shotcount-purpose">
        <h2>Shotcount isn’t just for one goal,<br />it’s for your whole climb.</h2>
        <div class="purpose-tabs" role="tablist" aria-label="Shotcount features">
          <button class="is-active" role="tab" aria-selected="true">Daily focus</button><button role="tab" aria-selected="false">Tasks</button><button role="tab" aria-selected="false">Reviews</button><button role="tab" aria-selected="false">Community</button><button role="tab" aria-selected="false">Streaks</button>
        </div>
        <div class="purpose-canvas">
          <div class="purpose-note note-a"><small>TODAY</small><h3>What matters now</h3><p>Finish grant proposal</p><p>Email Professor Müller</p><p>Record YouTube video</p></div>
          <div class="purpose-note note-b"><small>WEEKLY REVIEW</small><h3>Keep tomorrow honest</h3><p>What worked?</p><p>What got in the way?</p></div>
          <div class="purpose-note note-c"><small>STREAK</small><strong>12</strong><p>days of showing up</p></div>
        </div>
      </section>

      <section class="shotcount-people" id="community">
        <h2>How people use Shotcount</h2>
        <div class="people-rail">
          <article><div class="person-art portrait portrait-1" role="img" aria-label="David, researcher"></div><h3>David, researcher</h3><p>Proposals, papers, training, and the next brave step</p></article>
          <article><div class="person-art portrait portrait-2" role="img" aria-label="Amara, founder"></div><h3>Amara, founder</h3><p>Company priorities, launches, hiring, and hard decisions</p></article>
          <article><div class="person-art portrait portrait-3" role="img" aria-label="Michael, creator"></div><h3>Michael, creator</h3><p>Scripts, publishing plans, ideas, and daily practice</p></article>
          <article><div class="person-art portrait portrait-4" role="img" aria-label="Sarah, student"></div><h3>Sarah, student</h3><p>Applications, study plans, projects, and small wins</p></article>
          <article><div class="person-art portrait portrait-5" role="img" aria-label="Leila, product designer"></div><h3>Leila, product designer</h3><p>Design practice, team rituals, learning, and long-term craft</p></article>
          <article><div class="person-art portrait portrait-6" role="img" aria-label="James, writer"></div><h3>James, writer</h3><p>Book chapters, reading, health, and a life beyond deadlines</p></article>
          <article aria-hidden="true"><div class="person-art portrait portrait-1"></div><h3>David, researcher</h3><p>Proposals, papers, training, and the next brave step</p></article>
          <article aria-hidden="true"><div class="person-art portrait portrait-2"></div><h3>Amara, founder</h3><p>Company priorities, launches, hiring, and hard decisions</p></article>
          <article aria-hidden="true"><div class="person-art portrait portrait-3"></div><h3>Michael, creator</h3><p>Scripts, publishing plans, ideas, and daily practice</p></article>
          <article aria-hidden="true"><div class="person-art portrait portrait-4"></div><h3>Sarah, student</h3><p>Applications, study plans, projects, and small wins</p></article>
          <article aria-hidden="true"><div class="person-art portrait portrait-5"></div><h3>Leila, product designer</h3><p>Design practice, team rituals, learning, and long-term craft</p></article>
          <article aria-hidden="true"><div class="person-art portrait portrait-6"></div><h3>James, writer</h3><p>Book chapters, reading, health, and a life beyond deadlines</p></article>
        </div>
      </section>

      <section class="shotcount-feature feature-write">
        <div class="feature-copy"><span>Focus</span><h2>From a big ambition<br />to today’s next move</h2><p>Shotcount turns distant goals into clear daily actions. Capture what matters, choose the next step, and keep moving without losing the larger story.</p><a href="#product">Learn more →</a></div>
        <div class="feature-demo focus-demo">
          <div class="demo-top">Today <b>July 2</b></div>
          <h3>What matters now</h3>
          <label><i></i> Finish fellowship proposal</label>
          <label><i></i> Prepare the experiment</label>
          <label><i class="done"></i> Morning run</label>
          <button>＋ Add task</button>
        </div>
      </section>

      <section class="shotcount-quote"><p>“Shotcount gives my ambition somewhere to land every morning.”</p><span>— Amina, founder</span></section>

      <section class="shotcount-feature feature-connect">
        <div class="feature-copy"><span>Connect</span><h2>Progress feels stronger<br />when it isn’t lonely</h2><p>See the people you care about do the work. Celebrate completed tasks, share momentum, and build a circle that makes follow-through normal.</p><a href="#community">Learn more →</a></div>
        <div class="orbit-demo">
          <div class="orbit-center portrait portrait-2" role="img" aria-label="Amara"></div>
          <div class="orbit-person op-1 portrait portrait-5" role="img" aria-label="Leila"></div><div class="orbit-person op-2 portrait portrait-4" role="img" aria-label="Sarah"></div><div class="orbit-person op-3 portrait portrait-1" role="img" aria-label="David"></div><div class="orbit-person op-4 portrait portrait-6" role="img" aria-label="James"></div>
          <span>✓ Submitted application</span><span>✓ Published first article</span>
        </div>
      </section>

      <section class="shotcount-awards">
        <article><strong>01</strong><h3>Designed for clarity</h3><p>A calm place for important work.</p></article>
        <article><strong>02</strong><h3>Built for momentum</h3><p>Small actions stay visible.</p></article>
        <article><strong>03</strong><h3>Made for reflection</h3><p>Weekly reviews turn effort into learning.</p></article>
        <article><strong>04</strong><h3>Better together</h3><p>Accountability without the noise.</p></article>
      </section>

      <section class="shotcount-feature feature-plan">
        <div class="feature-copy"><span>Watch</span><h2>Ideas for building<br />a life that moves</h2><p>Join David on YouTube for honest lessons on ambition, thoughtful work, and turning the big things you want into small steps you can take today.</p><a href="https://www.youtube.com/@thedaviddosu">Visit the YouTube channel →</a></div>
        <div class="youtube-board">
          <a class="youtube-featured" href="https://www.youtube.com/@thedaviddosu" aria-label="Watch David Dosu on YouTube">
            <span class="youtube-kicker">THE DAVID DOSU</span>
            <strong>Ambition is good.<br />A life is better.</strong>
            <i class="youtube-play" aria-hidden="true">▶</i>
          </a>
          <div class="youtube-meta">
            <span><b>New ideas</b><small>Work, growth, and the life around them</small></span>
            <span class="youtube-mark" aria-hidden="true">YouTube</span>
          </div>
        </div>
      </section>

      <section class="shotcount-organize">
        <div class="organize-head"><span>Organize</span><h2>Structure that adapts<br />to your ambition</h2><p>Keep personal goals, work, learning, and health separate—without losing sight of how they support the same life.</p></div>
        <div class="organize-cards">
          <article><small>SPACES</small><h3>Switch between the parts of your life</h3><div class="space-list"><b>Personal</b><p>Health</p><p>Learning</p><p>Family</p><b>Work</b><p>Research</p><p>Projects</p></div></article>
          <article><small>GOALS & TAGS</small><h3>Clear homes for every commitment</h3><div class="tag-cloud"><span>#deep-work</span><span>#health</span><span>#writing</span><span>#money</span></div></article>
          <article><small>PROGRESS</small><h3>See the pattern, not just the list</h3><div class="mini-table"><b>Goal</b><b>Week</b><p>Research paper</p><p>82%</p><p>Fitness</p><p>67%</p><p>Writing</p><p>91%</p></div></article>
        </div>
      </section>

      <section class="shotcount-community">
        <h2>Stay in the loop</h2><p>Learn how thoughtful people turn intention into action.</p>
        <div class="community-links"><a href="#">Community <span>Discuss and share →</span></a><a href="#">Newsletter <span>Get the weekly note →</span></a><a href="#">YouTube <span>Watch practical guides →</span></a></div>
      </section>

      <section class="shotcount-pricing" id="pricing">
        <span>Pricing</span><h2>Your pace, your plan</h2><p>Use it now and then, or integrate it<br />into your daily flow.</p>
        <div class="pricing-grid">
          <article class="pricing-card">
            <div class="pricing-card-head"><h3>Free</h3></div>
            <p>Full access, great if you use it<br />occasionally each week.</p>
            <div class="pricing-card-action">
              <s aria-hidden="true">$8.0</s>
              <strong>$0 <em>/month</em></strong>
              <button data-action="signin" data-variant="email">Get Started</button>
            </div>
          </article>
          <article class="pricing-card price-plus">
            <div class="pricing-card-head"><b class="pricing-brand">SHOTCOUNT</b><small>PLUS</small></div>
            <p>Designed to effortlessly fit into<br />your everyday flow.</p>
            <div class="pricing-card-action">
              <s>$8.0</s>
              <strong>$3.7 <em>/month</em></strong>
              <button data-action="signin" data-variant="email">Upgrade to Plus</button>
            </div>
          </article>
        </div>
        <a class="pricing-note" href="#">Learn more about group discounts →</a>
      </section>

      <section class="shotcount-final" id="download">
        <h2>Let’s get started</h2><p>Start for free. No credit card required.</p><button data-action="signin" data-variant="email">Continue on web</button>
      </section>

      <footer class="shotcount-footer">
        <div class="footer-brand"><b>SHOTCOUNT</b><p>Gain mileage</p></div>
        <div><h3>Product</h3><a href="#product">Features</a><a href="#pricing">Pricing</a><a href="#">Releases</a></div>
        <div><h3>Community</h3><a href="#community">Stories</a><a href="#">Newsletter</a><a href="#">Guides</a></div>
        <div><h3>Support</h3><a href="#">Help center</a><a href="#">Contact</a><a href="#">Privacy</a></div>
        <div><h3>Company</h3><a href="#">About us</a><a href="#">Careers</a><a href="#">Terms</a></div>
        <p class="footer-copy">© 2026 Shotcount. All rights reserved.</p>
      </footer>
      ${renderGoogleAuthModal()}
    </main>
  `
}

function renderHeader(unread: number) {
  return `
    <header class="doc-bar">
      <div class="doc-breadcrumbs">
        <span>${escapeHtml(pageMeta[state.view].label)}</span>
      </div>
      <div class="doc-actions">
        <button type="button" class="ghost" data-action="toggle-notifications">
          Inbox${unread ? ` <strong>${unread}</strong>` : ''}
        </button>
      </div>
    </header>
  `
}

function renderSidebar(unread: number) {
  return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="topbar-mark" aria-hidden="true">S</div>
        <div>
          <p class="topbar-title">Shotcount</p>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="Pages">
        ${Object.entries(pageMeta)
          .map(
            ([key, page]) => `
              <button type="button" class="side-link ${state.view === key ? 'is-active' : ''}" data-action="switch-view" data-view="${key}">
                <span>${page.icon}</span>
                <em>${page.label}</em>
                ${key === 'review' && unread ? `<strong>${unread}</strong>` : ''}
              </button>
            `,
          )
          .join('')}
      </nav>
    </aside>
  `
}

function renderTodayView(carryPromptTasks: Task[]) {
  const today = todayDate()
  const visibleTasks = state.tasks.filter(
    (task) => !task.archivedAt && task.plannedFor === today && !task.completedAt && !task.carryPending,
  )
  const completedTasks = state.tasks.filter(
    (task) => !task.archivedAt && Boolean(task.completedAt) && task.plannedFor <= today,
  )

  return `
    <section class="panel today-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Today</p>
          <h2>What matters now</h2>
        </div>
      </div>

      ${renderCarryForwardPrompt(carryPromptTasks)}

      <div class="task-list">
        ${visibleTasks.length ? visibleTasks.map(renderTaskRow).join('') : renderEmptyState()}
      </div>

      <div class="divider"></div>

      <section class="completed-section">
        <div class="section-label">
          <h3>Completed</h3>
          <span>${completedTasks.length}</span>
        </div>
        <div class="task-list compact">
          ${completedTasks.length ? completedTasks.map(renderCompletedRow).join('') : '<p class="empty-line">Nothing completed yet today.</p>'}
        </div>
      </section>

      <div class="composer ${state.draftOpen ? 'is-open' : ''}">
        ${state.draftOpen
          ? `
            <form id="draft-form" class="draft-form">
              <input
                id="task-draft"
                name="task"
                type="text"
                placeholder="Add a task"
                value="${escapeHtml(state.draftValue)}"
                autocomplete="off"
                autofocus
              />
              <div class="draft-actions">
                <button type="button" class="ghost" data-action="cancel-draft">Cancel</button>
                <button type="submit" class="primary" data-action="add-task">Enter</button>
              </div>
            </form>
          `
          : `
            <button type="button" class="add-task-button" data-action="open-draft">
              <span>+</span>
              Add Task
            </button>
          `}
      </div>
    </section>
  `
}

function renderCarryForwardPrompt(tasks: Task[]) {
  if (!tasks.length) {
    return ''
  }

  return `
    <section class="carry-card">
      <div class="section-label">
        <h3>Carried forward</h3>
        <span>${tasks.length}</span>
      </div>
      <p class="muted">This task was carried forward. What stopped you?</p>
      <div class="carry-stack">
        ${tasks
          .map(
            (task) => `
              <article class="carry-item">
                <p class="carry-title">${escapeHtml(task.title)}</p>
                <div class="reason-grid">
                  ${carryReasons
                    .map(
                      (reason) => `
                        <button
                          type="button"
                          class="reason-chip"
                          data-action="carry-reason"
                          data-task-id="${task.id}"
                          data-reason="${escapeHtml(reason)}"
                        >
                          ${escapeHtml(reason)}
                        </button>
                      `,
                    )
                    .join('')}
                </div>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderTaskRow(task: Task) {
  return `
    <article class="task-row">
      <button
        type="button"
        class="checkbox"
        data-action="complete-task"
        data-task-id="${task.id}"
        aria-label="Complete ${escapeHtml(task.title)}"
      >
        <span></span>
      </button>
      <div class="task-copy">
        <p>${escapeHtml(task.title)}</p>
      </div>
    </article>
  `
}

function renderCompletedRow(task: Task) {
  return `
    <article class="task-row completed">
      <div class="checkbox checked" aria-hidden="true">
        <span></span>
      </div>
      <div class="task-copy">
        <p>${escapeHtml(task.title)}</p>
        <span>${formatClock(task.completedAt ?? task.createdAt)}</span>
      </div>
    </article>
  `
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <p>No open tasks yet.</p>
      <span>Tap plus and start with one real thing.</span>
    </div>
  `
}

function renderFeedView() {
  return `
    <section class="panel feed-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Feed</p>
          <h2>Movement from other people</h2>
        </div>
      </div>

      <div class="feed-list">
        ${state.feed
          .map(
            (item) => `
              <article class="feed-item">
                <div class="feed-meta">
                  <p class="feed-author">${escapeHtml(item.author)}</p>
                  <p class="feed-time">${formatRelativeTime(item.timestamp)}</p>
                </div>
                <p class="feed-action">${escapeHtml(item.action)}</p>
                <div class="feed-footer">
                  <span class="feed-clock">${formatClock(item.timestamp)}</span>
                  <button
                    type="button"
                    class="reaction-pill ${item.reacted ? 'is-on' : ''}"
                    data-action="toggle-reaction"
                    data-feed-id="${item.id}"
                  >
                    ${item.reacted ? 'Cheered' : 'Cheer'}
                  </button>
                </div>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderProfileView() {
  const name = state.session?.name ?? 'David'
  const mission = 'Reduce the gap between intention and execution.'
  const recentCompleted = state.tasks
    .filter((task) => task.completedAt && !task.archivedAt)
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())
    .slice(0, 5)
  const streak = calculateStreak()
  const graph = buildContributionGraph()

  return `
    <section class="panel profile-panel">
      <div class="profile-hero">
        <div class="profile-photo" aria-hidden="true">
          <span>${name.slice(0, 1).toUpperCase()}</span>
        </div>
        <div>
          <p class="eyebrow">Profile</p>
          <h2>${escapeHtml(name)}</h2>
        </div>
      </div>

      <p class="profile-mission">${escapeHtml(mission)}</p>

      <div class="profile-stats">
        <article class="stat-card">
          <span>Execution streak</span>
          <strong>${streak} day${streak === 1 ? '' : 's'}</strong>
        </article>
        <article class="stat-card">
          <span>Recent completions</span>
          <strong>${recentCompleted.length}</strong>
        </article>
      </div>

      <section class="graph-card">
        <div class="section-label">
          <h3>Contribution graph</h3>
          <span>Hover for details</span>
        </div>
        <div class="graph-grid">
          ${graph}
        </div>
      </section>

      <section class="recent-card">
        <div class="section-label">
          <h3>Recent completed tasks</h3>
          <span>${recentCompleted.length}</span>
        </div>
        <div class="recent-list">
          ${
            recentCompleted.length
              ? recentCompleted
                  .map(
                    (task) => `
                      <article class="recent-item">
                        <p>${escapeHtml(task.title)}</p>
                        <span>${formatClock(task.completedAt ?? task.createdAt)}</span>
                      </article>
                    `,
                  )
                  .join('')
              : '<p class="empty-line">No completions yet.</p>'
          }
        </div>
      </section>
    </section>
  `
}

function renderReviewView() {
  const today = todayDate()
  const isSunday = new Date(`${today}T12:00:00Z`).getUTCDay() === 0
  const due = isSunday && state.review.submittedFor !== today

  return `
    <section class="panel review-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Weekly review</p>
          <h2>${due ? 'Ready now' : 'Quiet check-in'}</h2>
        </div>
      </div>

      <div class="review-summary">
        <article class="summary-card">
          <span>Status</span>
          <strong>${due ? 'Due today' : state.review.submittedFor === today ? 'Done' : 'Waiting for Sunday'}</strong>
        </article>
        <article class="summary-card">
          <span>Five minute cap</span>
          <strong>Keep it short</strong>
        </article>
      </div>
      ${
        due
          ? '<p class="muted">The review form is locked into place until you finish it on Sunday.</p>'
          : renderReviewHistory()
      }
    </section>
  `
}

function renderReviewField(label: string, name: keyof ReviewAnswers, value: string) {
  return `
    <label class="review-field">
      <span>${escapeHtml(label)}</span>
      <textarea name="${name}" rows="3" placeholder="Type your answer here">${escapeHtml(value)}</textarea>
    </label>
  `
}

function renderReviewHistory() {
  if (!state.review.submittedAt) {
    return '<p class="muted">Your Sunday review will show up here after you submit it.</p>'
  }

  return `
    <div class="review-history">
      ${renderReviewSummary('What went well?', state.review.answers.whatWentWell)}
      ${renderReviewSummary('What repeatedly stopped you?', state.review.answers.blockers)}
      ${renderReviewSummary('What should you stop doing?', state.review.answers.stopDoing)}
      ${renderReviewSummary('What should you double down on next week?', state.review.answers.doubleDownOn)}
      <p class="muted">Submitted ${formatRelativeTime(state.review.submittedAt)}</p>
    </div>
  `
}

function renderReviewSummary(label: string, value: string) {
  return `
    <article class="review-summary-card">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value || 'No answer yet.')}</p>
    </article>
  `
}

function renderNotificationPanel() {
  const open = state.notificationPanelOpen
  return `
    <aside class="notification-panel ${open ? 'is-open' : ''}">
      <div class="notification-head">
        <h3>Notifications</h3>
        <button type="button" class="ghost" data-action="toggle-notifications">Close</button>
      </div>
      <div class="notification-list">
        ${state.notifications
          .slice(0, 6)
          .map(
            (item) => `
              <button
                type="button"
                class="notification-item ${item.read ? 'is-read' : ''}"
                data-action="mark-notification-read"
                data-notification-id="${item.id}"
              >
                <p>${escapeHtml(item.text)}</p>
                <span>${formatRelativeTime(item.timestamp)}</span>
              </button>
            `,
          )
          .join('')}
      </div>
    </aside>
  `
}

function renderReviewOverlay() {
  const today = todayDate()
  const isSunday = new Date(`${today}T12:00:00Z`).getUTCDay() === 0
  const due = isSunday && state.review.submittedFor !== today
  if (!due) return ''

  return `
    <div class="review-overlay" role="dialog" aria-modal="true" aria-label="Weekly review">
      <div class="review-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Weekly review</p>
            <h2>Sunday check-in</h2>
          </div>
          <p class="muted">This closes the week and opens the next one.</p>
        </div>
        ${renderReviewForm()}
      </div>
    </div>
  `
}

function renderReviewForm() {
  return `
    <form id="review-form" class="review-form">
      ${renderReviewField('What went well?', 'whatWentWell', state.review.answers.whatWentWell)}
      ${renderReviewField('What repeatedly stopped you?', 'blockers', state.review.answers.blockers)}
      ${renderReviewField('What should you stop doing?', 'stopDoing', state.review.answers.stopDoing)}
      ${renderReviewField('What should you double down on next week?', 'doubleDownOn', state.review.answers.doubleDownOn)}
      <button type="submit" class="primary review-submit">Save review</button>
    </form>
  `
}

function calculateStreak() {
  const counts = new Map<string, number>()
  for (const task of state.tasks) {
    if (!task.completedAt || task.archivedAt) continue
    const day = toDateKey(new Date(task.completedAt))
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }

  let streak = 0
  let cursor = todayDate()
  while (counts.get(cursor)) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }
  return streak
}

function buildContributionGraph() {
  const counts = new Map<string, number>()
  for (const task of state.tasks) {
    if (!task.completedAt || task.archivedAt) continue
    const day = toDateKey(new Date(task.completedAt))
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }

  const cells: string[] = []
  const end = new Date(`${todayDate()}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() - (end.getUTCDay() || 7))

  for (let week = 0; week < 12; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const cellDate = new Date(end)
      cellDate.setUTCDate(end.getUTCDate() - ((11 - week) * 7 + (6 - day)))
      const key = toDateKey(cellDate)
      const count = counts.get(key) ?? 0
      const intensity = Math.min(4, count)
      cells.push(`
        <div
          class="graph-cell level-${intensity}"
          title="${formatShortDate(key)} · ${count} completed task${count === 1 ? '' : 's'}"
        ></div>
      `)
    }
  }

  return cells.join('')
}

const pageMeta: Record<View, { label: string; icon: string }> = {
  today: { label: 'Today', icon: '□' },
  feed: { label: 'Feed', icon: '↗' },
  profile: { label: 'Profile', icon: '◌' },
  review: { label: 'Weekly Review', icon: '☰' },
}

const carryReasons = ['Avoided it', "Didn't know how", 'Too tired', 'Waiting on someone', 'Changed priorities', 'Other']
