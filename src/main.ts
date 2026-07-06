import './style.css'
import communityPortraits from './assets/community-portraits.png'

type View = 'today' | 'upcoming' | 'calendar' | 'sticky'
type CountKey = 'today' | 'upcoming'
type Subtask = { id: string; title: string; completed: boolean }
type UpcomingGroup = 'tomorrow' | 'week'
type ActivityMode = 'daily' | 'weekly' | 'cumulative'
type Goal = { id: string; name: string; color: string }
type CalendarMode = 'day' | 'week' | 'month'
type CalendarEvent = {
  id: string
  title: string
  date: string
  hour: string
  period: 'AM' | 'PM'
  color: 'aqua' | 'pink'
  tall?: boolean
}
type Task = {
  id: string
  title: string
  description?: string
  goalId?: string
  due?: string
  subtasks?: number
  subtaskItems?: Subtask[]
  tags?: string[]
  completedAt?: string
}
type CommunityProfile = {
  id: string
  name: string
  role: string
  category: string
  members: string
  tasksToday: number
  latest: string
  portraitColumn: number
  portraitRow: number
  bioLines: string[]
}

const app = document.querySelector<HTMLDivElement>('#app')!
const viewStorageKey = 'ascent-active-view'
const plannerStorageKey = 'ascent-planner-v1'
const goalsStorageKey = 'ascent-goals-v1'

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

function formatTaskDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function readStoredView(): View {
  try {
    const stored = window.sessionStorage.getItem(viewStorageKey)
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

const now = new Date()
const todayKey = dateKey(now)
const tomorrowKey = dateKey(addDays(now, 1))
const weekEndKey = dateKey(addDays(now, 7))

const seedGoals: Goal[] = [
  { id: 'personal', name: 'Personal', color: '#ff666d' },
  { id: 'job-search', name: 'Find a new job', color: '#60d4dd' },
  { id: 'paper', name: 'Write a paper', color: '#ffd331' },
]

function readGoals() {
  try {
    const stored = window.localStorage.getItem(goalsStorageKey)
    if (!stored) return seedGoals
    const parsed = JSON.parse(stored) as Goal[]
    return Array.isArray(parsed) && parsed.length ? parsed : seedGoals
  } catch {
    return seedGoals
  }
}

const goals: Goal[] = readGoals()

const seedTasks: Task[] = [
  { id: 'research', title: 'Research content ideas', due: dateKey(addDays(now, -1)), tags: [] },
  { id: 'database', title: 'Create a database of guest authors', due: todayKey, tags: [] },
  {
    id: 'license',
    title: "Renew driver's license",
    goalId: 'personal',
    due: todayKey,
    subtasks: 1,
    subtaskItems: [{ id: 'license-subtask', title: 'Subtask', completed: false }],
    tags: ['Tag 1'],
  },
  { id: 'accountant', title: 'Consult accountant', goalId: 'paper', due: todayKey, subtasks: 3 },
  { id: 'business-card', title: 'Print business card', due: todayKey },
  { id: 'job-posting', title: 'Create job posting for SEO specialist', due: tomorrowKey, goalId: 'job-search' },
  { id: 'assets', title: 'Request design assets for landing page', due: tomorrowKey, goalId: 'job-search' },
  { id: 'outline', title: 'Outline the next newsletter', due: dateKey(addDays(now, 2)), goalId: 'personal' },
  { id: 'analytics', title: 'Review launch analytics', due: dateKey(addDays(now, 4)), goalId: 'job-search' },
  { id: 'invoices', title: 'Send monthly invoices', due: dateKey(addDays(now, 6)), goalId: 'paper' },
]

function readPlannerTasks() {
  try {
    const stored = window.localStorage.getItem(plannerStorageKey)
    if (!stored) return seedTasks
    const parsed = JSON.parse(stored) as Array<{ goalId?: string; list?: string } & Task>
    if (!Array.isArray(parsed) || !parsed.length) return seedTasks
    return parsed.map(task => {
      const legacyList = (task as { list?: string }).list
      const goalId =
        task.goalId ??
        (legacyList === 'Work' ? 'job-search' : legacyList === 'List 1' ? 'paper' : legacyList ? 'personal' : undefined)
      return {
        ...task,
        goalId,
      }
    })
  } catch {
    return seedTasks
  }
}

const tasks: Task[] = readPlannerTasks()
let view: View = readStoredView()
let selectedTaskId = 'license'
const screenCounts: Record<CountKey, number> = { today: 5, upcoming: 12 }
const countAnimations: Partial<Record<CountKey, { from: number; to: number; token: number }>> = {}
let countAnimationSequence = 0
const completedTaskIds = new Set(tasks.filter(task => task.completedAt).map(task => task.id))
let activityMode: ActivityMode = 'daily'
let plannerDraftGroup: UpcomingGroup | null = null
let todayComposerOpen = false
let goalComposerOpen = false
let activeGoalId: string | null = null
let toast = ''
let calendarMode: CalendarMode = 'day'
let calendarDate = new Date(2022, 1, 16)
const calendarEvents: CalendarEvent[] = [
  { id: 'marketing-sprint', title: 'Session 1: Marketing Sprint', date: '2022-02-16', hour: '09:00', period: 'AM', color: 'aqua', tall: true },
  { id: 'sales-catchup', title: 'Sales Catchup', date: '2022-02-16', hour: '10:00', period: 'AM', color: 'aqua' },
  { id: 'license-event', title: "Renew driver's license", date: '2022-02-16', hour: '11:00', period: 'AM', color: 'pink', tall: true },
]
const communityProfiles: CommunityProfile[] = [
  {
    id: 'amara',
    name: 'Amara Okafor',
    role: 'Product founder',
    category: 'Building & creating',
    members: '12.8k',
    tasksToday: 6,
    latest: 'Reviewed the launch brief',
    portraitColumn: 0,
    portraitRow: 0,
    bioLines: ['CTO, Bumpa', 'Research intern, EPFL', 'Content creator with 18k followers'],
  },
  {
    id: 'kenji',
    name: 'Kenji Watanabe',
    role: 'Creative director',
    category: 'Building & creating',
    members: '9.4k',
    tasksToday: 4,
    latest: 'Approved the campaign concept',
    portraitColumn: 1,
    portraitRow: 0,
    bioLines: ['Creative director, independent brands', 'Systems thinker', 'Designing in public'],
  },
  {
    id: 'maya',
    name: 'Maya Raman',
    role: 'Research scientist',
    category: 'Building & creating',
    members: '7.2k',
    tasksToday: 5,
    latest: 'Finished the weekly lab review',
    portraitColumn: 2,
    portraitRow: 0,
    bioLines: ['Research scientist, EPFL', 'Writes about deep work', '6k newsletter subscribers'],
  },
  {
    id: 'malik',
    name: 'Malik Thompson',
    role: 'Endurance athlete',
    category: 'Research & performance',
    members: '18.1k',
    tasksToday: 7,
    latest: 'Completed morning recovery',
    portraitColumn: 0,
    portraitRow: 1,
    bioLines: ['Endurance athlete', 'Coach and builder', '18.1k followers'],
  },
  {
    id: 'sofia',
    name: 'Sofía Reyes',
    role: 'Independent filmmaker',
    category: 'Research & performance',
    members: '11.6k',
    tasksToday: 3,
    latest: 'Locked the final shot list',
    portraitColumn: 1,
    portraitRow: 1,
    bioLines: ['Independent filmmaker', 'Storytelling coach', '11.6k members'],
  },
  {
    id: 'theo',
    name: 'Theo Bennett',
    role: 'Bestselling author',
    category: 'Research & performance',
    members: '15.3k',
    tasksToday: 4,
    latest: 'Wrote 1,200 words',
    portraitColumn: 2,
    portraitRow: 1,
    bioLines: ['Bestselling author', 'Writes daily in public', '15.3k readers'],
  },
]
const followedCommunityIds = new Set<string>(['amara'])

const icons: Record<string, string> = {
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
  upcoming: '<path d="m7 7 5 5-5 5M13 7l5 5-5 5"/>',
  today: '<path d="M7 6h12M7 12h12M7 18h12"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="1"/><path d="M8 3v4M16 3v4M4 9h16M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/>',
  sticky: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>',
  logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m8 10 4 4 4-4"/>',
}

function icon(name: string) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name]}</svg>`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function persistPlanner() {
  try {
    window.localStorage.setItem(plannerStorageKey, JSON.stringify(tasks))
  } catch {
    // The planner still works for this visit when storage is unavailable.
  }
}

function persistGoals() {
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

function render() {
  refreshCounts()
  const selected = tasks.find(task => task.id === selectedTaskId) ?? tasks[2]!
  const showInspector = view === 'today' && !todayComposerOpen
  app.innerHTML = `
    <div class="reference-app ${showInspector ? 'with-inspector' : ''}">
      ${renderSidebar()}
      <main class="workspace">
        ${view === 'today' ? renderToday() : view === 'upcoming' ? renderUpcoming() : view === 'calendar' ? renderCalendar() : renderStickyWall()}
      </main>
      ${showInspector ? renderInspector(selected) : ''}
    </div>
    <div class="toast ${toast ? 'show' : ''}" role="status">${escapeHtml(toast)}</div>
  `
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
        ${navButton('today', 'Today', 'today', String(screenCounts.today))}
        ${navButton('upcoming', 'Upcoming', 'upcoming', String(screenCounts.upcoming))}
        ${navButton('calendar', 'Calendar', 'calendar')}
        ${navButton('sticky', 'Community', 'sticky')}
      </nav>

      <section class="side-section">
        <h2>Goals</h2>
        ${goals.map(renderGoalRow).join('')}
        ${goalComposerOpen ? renderGoalComposer() : `<button class="side-row add-side" data-action="open-goal-composer">${icon('plus')}<span>Add New Goal</span></button>`}
      </section>

      <section class="side-section tags-section">
        <h2>Tags</h2>
        <div class="tags"><button class="tag aqua">Tag 1</button><button class="tag pink">Tag 2</button><button class="tag neutral">+ Add Tag</button></div>
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
  return `
    <form class="goal-composer" data-goal-form>
      <input name="name" aria-label="Goal name" placeholder="Goal name" autocomplete="off" required />
      <input name="color" aria-label="Goal color" type="color" value="#78a7ff" />
      <button type="submit">Add</button>
      <button type="button" data-action="close-goal-composer" aria-label="Cancel">×</button>
    </form>
  `
}

function triggerCountAnimation(key: CountKey, from: number, to: number) {
  const token = ++countAnimationSequence
  countAnimations[key] = { from, to, token }
  window.setTimeout(() => {
    if (countAnimations[key]?.token === token) delete countAnimations[key]
  }, 580)
}

function renderCountWheel(key: CountKey) {
  const value = screenCounts[key]
  const animation = countAnimations[key]
  const fromValue = animation?.from ?? value
  const toValue = animation?.to ?? value
  const digits = String(value).split('')
  const previousDigits = String(fromValue).padStart(digits.length, '0')

  return `
    <span class="screen-count" data-count="${value}" aria-label="${value} tasks">
      ${digits.map((digit, index) => {
        const fromDigit = previousDigits[index] ?? digit
        const animate = Boolean(animation) && fromDigit !== digit && toValue === value
        return `
          <span class="screen-count__digit ${animate ? 'is-animating' : ''}" style="--from-digit:${fromDigit};--to-digit:${digit};--digit:${animate ? fromDigit : digit};">
            <span class="screen-count__track" aria-hidden="true">
              ${Array.from({ length: 10 }, (_, number) => `<span>${number}</span>`).join('')}
            </span>
          </span>
        `
      }).join('')}
    </span>
  `
}

function renderToday() {
  const todayTasks = sortTasks(tasksForToday())
  return `
    <section class="today-screen">
      <header class="screen-title"><h1>Today</h1>${renderCountWheel('today')}</header>
      ${todayComposerOpen ? renderTodayComposer() : `<button class="add-task-row" data-action="add-task">${icon('plus')}<span>Add New Task</span></button>`}
      <div class="task-list">
        ${todayTasks.map(task => renderTaskRow(task, task.id === selectedTaskId)).join('')}
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
          <input name="title" placeholder="What needs doing?" autocomplete="off" required />
        </label>
        <label class="today-field today-field-description">
          <span>Description</span>
          <textarea name="description" placeholder="Add a short note or useful context"></textarea>
        </label>
        <label class="today-field">
          <span>Goal</span>
          <select name="goalId" aria-label="Goal" required>${renderGoalOptions(activeGoalId ?? goals[0]?.id)}</select>
        </label>
        <label class="today-field">
          <span>Due date</span>
          <input name="due" type="date" value="${todayKey}" min="${todayKey}" max="${weekEndKey}" required />
        </label>
        <label class="today-field">
          <span>Tags</span>
          <input name="tags" placeholder="Tag 1, Tag 2" />
        </label>
      </div>
      <div class="today-composer-actions">
        <button type="button" data-action="close-today-composer">Cancel</button>
        <button type="submit">Add task</button>
      </div>
    </form>
  `
}

function renderGoalOptions(selectedId?: string) {
  return goals.map(goal => `<option value="${goal.id}" ${goal.id === selectedId ? 'selected' : ''}>${escapeHtml(goal.name)}</option>`).join('')
}

function renderTaskRow(task: Task, selected = false) {
  const goal = goals.find(item => item.id === task.goalId)
  const completed = completedTaskIds.has(task.id)
  const subtaskCount = task.subtaskItems?.length ?? task.subtasks ?? 0
  return `
    <div class="task-row ${selected ? 'selected' : ''} ${completed ? 'completed' : ''}">
      <button class="checkbox" data-complete="${task.id}" aria-label="${completed ? 'Mark as not done' : 'Mark as done'}: ${escapeHtml(task.title)}" aria-pressed="${completed}"></button>
      <button class="task-text" data-task="${task.id}">
        <strong>${escapeHtml(task.title)}</strong>
        ${task.due || goal || subtaskCount ? `<small>
          ${task.due ? `<span>${icon('calendar')}${formatTaskDate(task.due)}</span>` : ''}
          ${task.due && subtaskCount ? `<span><b>${subtaskCount}</b> Subtasks</span>` : ''}
          ${goal ? `<span><i class="list-color" style="--list-color:${goal.color}"></i>${escapeHtml(goal.name)}</span>` : ''}
          ${!task.due && subtaskCount ? `<span><b>${subtaskCount}</b> Subtasks</span>` : ''}
        </small>` : ''}
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
  const tags = task.tags ?? (task.id === 'license' ? ['Tag 1'] : [])
  task.tags = tags
  const goal = goals.find(item => item.id === task.goalId)
  return `
    <aside class="inspector">
      <div class="inspector-content">
        <h2>Task:</h2>
        <input class="inspector-title" value="${escapeHtml(task.title)}" aria-label="Task title" />
        <textarea aria-label="Description" placeholder="Description">${escapeHtml(task.description ?? '')}</textarea>

        <div class="inspector-fields">
          <label><span>Goal</span><button data-action="cycle-goal">${escapeHtml(goal?.name ?? goals[0]?.name ?? 'No goal')} ${icon('down')}</button></label>
          <label><span>Due date</span><input class="inspector-date" type="date" value="${task.due ?? ''}" aria-label="Due date" /></label>
          <label><span>Tags</span><span>${tags.map(tag => `<button class="tag aqua" data-remove-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}<button class="tag neutral" data-action="add-tag">+ Add Tag</button></span></label>
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
  return `
    <section class="upcoming-screen">
      <header class="screen-title"><h1>Upcoming</h1>${renderCountWheel('upcoming')}</header>
      <div class="upcoming-columns">
        <section data-upcoming-section="tomorrow">
          <h2>Tomorrow</h2>
          ${renderUpcomingComposer('tomorrow')}
          ${renderGroup('tomorrow')}
        </section>
        <section data-upcoming-section="week">
          <h2>This Week</h2>
          ${renderUpcomingComposer('week')}
          ${renderGroup('week')}
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
      <select name="goalId" aria-label="Goal" required>${renderGoalOptions(activeGoalId ?? goals[0]?.id)}</select>
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
  return demoCompletionCount(day) + saved
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
    return `<button class="activity-cell level-${isFuture ? 0 : level} ${isFuture ? 'is-future' : ''}" style="--column:${column + 1};--row:${row + 1}" title="${label}" aria-label="${label}"></button>`
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
      <div class="activity-legend"><span>Less</span>${[0, 1, 2, 3, 4].map(level => `<i class="level-${level}"></i>`).join('')}<span>More</span></div>
    </section>
  `
}

function renderCalendar() {
  const dateTitle = formatCalendarTitle()
  const dayLabel = calendarMode === 'day'
    ? calendarDate.toLocaleDateString('en-GB', { weekday: 'long' })
    : calendarMode === 'week' ? 'This week' : 'This month'
  return `
    <section class="calendar-screen">
      <header class="calendar-header">
        <div><h1>${dateTitle}</h1><div class="calendar-tabs"><button class="${calendarMode === 'day' ? 'active' : ''}" data-calendar-mode="day">Day</button><button class="${calendarMode === 'week' ? 'active' : ''}" data-calendar-mode="week">Week</button><button class="${calendarMode === 'month' ? 'active' : ''}" data-calendar-mode="month">Month</button></div></div>
        <button class="add-event" data-action="add-event">Add Event</button>
      </header>
      <div class="calendar-nav"><button aria-label="Previous ${calendarMode}" data-action="previous-date">‹</button><button aria-label="Next ${calendarMode}" data-action="next-date">›</button></div>
      <div class="day-label">${dayLabel}</div>
      <div class="timeline">
        ${renderCalendarTimeline()}
      </div>
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

function renderCalendarTimeline() {
  const hours: Array<[string, 'AM' | 'PM']> = [
    ['09:00', 'AM'],
    ['10:00', 'AM'],
    ['11:00', 'AM'],
    ['12:00', 'PM'],
    ['01:00', 'PM'],
    ['02:00', 'PM'],
  ]
  const eventsForDate = calendarEvents.filter(event => {
    const eventDate = new Date(`${event.date}T12:00:00`)
    if (calendarMode === 'day') return event.date === calendarDateKey()
    if (calendarMode === 'month') {
      return eventDate.getFullYear() === calendarDate.getFullYear() && eventDate.getMonth() === calendarDate.getMonth()
    }
    const monday = new Date(calendarDate)
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 7)
    return eventDate >= monday && eventDate < sunday
  })
  return hours.map(([hour, period]) => {
    const matchingEvents = eventsForDate.filter(event => event.hour === hour && event.period === period)
    const content = matchingEvents.map(event => `
      <article class="calendar-event ${event.color}-event ${event.tall ? 'tall' : ''}" data-event="${event.id}"><strong>${escapeHtml(event.title)}</strong></article>
    `).join('')
    const currentTime = hour === '09:00' && calendarDateKey() === '2022-02-16' ? '<div class="current-time"><i></i></div>' : ''
    return timelineHour(hour, period, `${content}${currentTime}`)
  }).join('')
}

function timelineHour(time: string, period: string, content: string) {
  return `<div class="timeline-row"><time>${time}<br/>${period}</time><div class="timeline-slot">${content}</div></div>`
}

function renderStickyWall() {
  const spotlight = communityProfiles[0]!
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
        <section class="spotlight-section" aria-labelledby="spotlight-title">
          <div class="community-section-heading">
            <div><h2 id="spotlight-title">This week’s spotlight</h2><p>Step inside the working rhythm of someone exceptional.</p></div>
            <span>Updated live</span>
          </div>
          ${renderSpotlight(spotlight)}
        </section>

        <section class="explore-section" aria-labelledby="explore-title">
          <div class="community-section-heading">
            <div><h2 id="explore-title">Explore communities</h2><p>Find a person whose way of working helps you move.</p></div>
            <button data-action="discover-people">View all</button>
          </div>
          <div class="community-grid explore-grid">
            ${communityProfiles.slice(1).map(renderCommunityCard).join('')}
          </div>
        </section>
      </div>
    </section>
  `
}

function renderSpotlight(profile: CommunityProfile) {
  const followed = followedCommunityIds.has(profile.id)
  return `
    <article class="spotlight-card">
      <div class="community-launch-popover spotlight-launch-popover" aria-hidden="true">
        <p class="community-launch-label">Public launch page</p>
        <h4>${escapeHtml(profile.name)}</h4>
        <ul>
          ${profile.bioLines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
        </ul>
        <button class="community-launch-subscribe">Subscribe with Plus</button>
      </div>
      <div class="spotlight-portrait portrait-frame" style="--portrait-column:${profile.portraitColumn};--portrait-row:${profile.portraitRow};--community-portrait:url(&quot;${communityPortraits}&quot;)">
        <div class="community-portrait-art" aria-hidden="true"></div>
        <span class="spotlight-members">${profile.members} people learning alongside her</span>
      </div>
      <div class="spotlight-body">
        <p class="spotlight-role">${escapeHtml(profile.role)} · Lagos</p>
        <h3>${escapeHtml(profile.name)}</h3>
        <p class="spotlight-intro">Building useful products without losing the quiet routines that make ambitious work possible.</p>
        <div class="spotlight-tasks">
          <div class="spotlight-tasks-heading"><strong>Today’s focus</strong><span>${profile.tasksToday} tasks · 3 complete</span></div>
          <div><i class="done">✓</i><span>Review the launch brief</span><time>8:40</time></div>
          <div><i class="done">✓</i><span>Approve the onboarding flow</span><time>10:15</time></div>
          <div><i></i><span>Founder interviews</span><time>14:00</time></div>
        </div>
        <div class="spotlight-actions">
          <button class="spotlight-open" data-community="${profile.id}">Enter Amara’s community ${icon('chevron')}</button>
          <button class="spotlight-follow ${followed ? 'is-following' : ''}" data-follow="${profile.id}" aria-pressed="${followed}">
            ${followed ? 'Following' : 'Follow'}
          </button>
        </div>
      </div>
    </article>
  `
}

function renderCommunityCard(profile: CommunityProfile) {
  const followed = followedCommunityIds.has(profile.id)
  return `
    <article class="community-card">
      ${renderLaunchPopover(profile)}
      <div class="community-portrait portrait-frame" style="--portrait-column:${profile.portraitColumn};--portrait-row:${profile.portraitRow};--community-portrait:url(&quot;${communityPortraits}&quot;)">
        <div class="community-portrait-art" aria-hidden="true"></div>
        <span>${profile.members} members</span>
        <button class="community-follow ${followed ? 'is-following' : ''}" data-follow="${profile.id}" aria-label="${followed ? 'Unfollow' : 'Follow'} ${escapeHtml(profile.name)}" aria-pressed="${followed}">
          ${followed ? '✓' : icon('plus')}
        </button>
      </div>
      <div class="community-card-body">
        <p class="community-role">${escapeHtml(profile.role)}</p>
        <h3>${escapeHtml(profile.name)}</h3>
        <div class="community-activity">
          <span><b>${profile.tasksToday}</b> tasks today</span>
          <span class="activity-dot"></span>
          <span>Active now</span>
        </div>
        <p class="community-latest"><span>✓</span>${escapeHtml(profile.latest)}</p>
        <button class="community-open" data-community="${profile.id}">View community ${icon('chevron')}</button>
      </div>
    </article>
  `
}

function renderLaunchPopover(profile: CommunityProfile) {
  return `
    <div class="community-launch-popover" aria-hidden="true">
      <p class="community-launch-label">Public launch page</p>
      <h4>${escapeHtml(profile.name)}</h4>
      <ul>
        ${profile.bioLines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
      </ul>
      <button class="community-launch-subscribe">Subscribe with Plus</button>
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
  if (title) task.title = title
  if (description !== undefined) task.description = description
  if (due !== undefined) task.due = due || undefined
  persistPlanner()
}

app.addEventListener('submit', event => {
  const target = event.target as HTMLElement
  const goalForm = target.closest<HTMLFormElement>('[data-goal-form]')
  if (goalForm) {
    event.preventDefault()
    const data = new FormData(goalForm)
    const name = String(data.get('name') ?? '').trim()
    const color = String(data.get('color') ?? '#78a7ff')
    if (!name) return
    goals.push({ id: crypto.randomUUID(), name, color })
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
    const todayCountBefore = screenCounts.today
    const upcomingCountBefore = screenCounts.upcoming
    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      description: String(data.get('description') ?? '').trim(),
      goalId: goalId || undefined,
      due,
      tags: String(data.get('tags') ?? '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 8),
      subtaskItems: [],
    }
    tasks.unshift(newTask)
    selectedTaskId = newTask.id
    todayComposerOpen = false
    persistPlanner()
    refreshCounts()
    if (due === todayKey) triggerCountAnimation('today', todayCountBefore, screenCounts.today)
    else triggerCountAnimation('upcoming', upcomingCountBefore, screenCounts.upcoming)
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

  const form = target.closest<HTMLFormElement>('[data-planner-form]')
  if (!form) return
  event.preventDefault()
  const group = form.dataset.plannerForm as UpcomingGroup
  const data = new FormData(form)
  const title = String(data.get('title') ?? '').trim()
  const due = group === 'tomorrow' ? tomorrowKey : String(data.get('due') ?? '')
  const goalId = String(data.get('goalId') ?? activeGoalId ?? goals[0]?.id ?? '').trim()
  if (!title || !due) return
  const from = screenCounts.upcoming
  tasks.unshift({
    id: crypto.randomUUID(),
    title,
    due,
    goalId: goalId || undefined,
    tags: [],
    subtaskItems: [],
  })
  persistPlanner()
  triggerHaptic([35, 30, 60])
  plannerDraftGroup = null
  refreshCounts()
  triggerCountAnimation('upcoming', from, screenCounts.upcoming)
  toast = group === 'tomorrow' ? 'Added to tomorrow' : `Added for ${formatTaskDate(due)}`
  render()
  window.setTimeout(() => {
    toast = ''
    render()
  }, 1400)
})

app.addEventListener('click', event => {
  const target = event.target as HTMLElement
  const subtaskId = target.closest<HTMLInputElement>('[data-subtask]')?.dataset.subtask
  if (subtaskId) {
    const task = selectedTask()
    const subtask = task?.subtaskItems?.find(item => item.id === subtaskId)
    if (subtask) subtask.completed = !subtask.completed
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

  const removeTag = target.closest<HTMLElement>('[data-remove-tag]')?.dataset.removeTag
  if (removeTag) {
    persistInspectorDraft()
    const task = selectedTask()
    if (task) task.tags = (task.tags ?? []).filter(tag => tag !== removeTag)
    render()
    return
  }

  const nextView = target.closest<HTMLElement>('[data-view]')?.dataset.view as View | undefined
  if (nextView) {
    if (nextView !== 'today') todayComposerOpen = false
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
    if (followedCommunityIds.has(followId)) followedCommunityIds.delete(followId)
    else followedCommunityIds.add(followId)
    render()
    return
  }

  const communityId = target.closest<HTMLElement>('[data-community]')?.dataset.community
  if (communityId) {
    const profile = communityProfiles.find(item => item.id === communityId)
    toast = profile ? `Opening ${profile.name}'s community` : ''
    render()
    window.setTimeout(() => {
      toast = ''
      render()
    }, 1400)
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

  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
  if (!action) return
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
    goalComposerOpen = true
    render()
    document.querySelector<HTMLInputElement>('[data-goal-form] input[name="name"]')?.focus()
    return
  }
  if (action === 'close-goal-composer') {
    goalComposerOpen = false
    render()
    return
  }
  if (action === 'close-today-composer') {
    renderWithMotion(() => {
      todayComposerOpen = false
      render()
    })
    return
  }
  if (action === 'add-task') {
    renderWithMotion(() => {
      todayComposerOpen = true
      render()
      document.querySelector<HTMLInputElement>('[data-today-form] input[name="title"]')?.focus()
    })
    return
  }
  if (action === 'save-task') {
    persistInspectorDraft()
    toast = 'Changes saved'
  } else if (action === 'delete-task') {
    const taskIndex = tasks.findIndex(task => task.id === selectedTaskId)
    if (taskIndex >= 0) tasks.splice(taskIndex, 1)
    const from = screenCounts.today
    completedTaskIds.delete(selectedTaskId)
    selectedTaskId = tasksForToday()[0]?.id ?? tasks[0]?.id ?? ''
    refreshCounts()
    triggerCountAnimation('today', from, screenCounts.today)
    persistPlanner()
    toast = 'Task deleted'
  } else if (action === 'cycle-goal') {
    persistInspectorDraft()
    const task = selectedTask()
    if (task && goals.length) {
      const currentIndex = goals.findIndex(goal => goal.id === task.goalId)
      task.goalId = goals[(currentIndex + 1 + goals.length) % goals.length]?.id
      persistPlanner()
    }
  } else if (action === 'add-tag') {
    persistInspectorDraft()
    const task = selectedTask()
    if (task) {
      const tags = task.tags ?? []
      const tagToAdd = !tags.includes('Tag 1') ? 'Tag 1' : !tags.includes('Tag 2') ? 'Tag 2' : null
      if (tagToAdd) task.tags = [...tags, tagToAdd]
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
    const eventsOnDate = calendarEvents.filter(event => event.date === calendarDateKey()).length
    const slots: Array<[string, 'AM' | 'PM']> = [['12:00', 'PM'], ['01:00', 'PM'], ['02:00', 'PM']]
    const [hour, period] = slots[Math.min(eventsOnDate > 2 ? eventsOnDate - 3 : 0, slots.length - 1)]
    calendarEvents.push({
      id: crypto.randomUUID(),
      title: `New event ${calendarEvents.length + 1}`,
      date: calendarDateKey(),
      hour,
      period,
      color: eventsOnDate % 2 === 0 ? 'aqua' : 'pink',
    })
    toast = 'New event ready'
  } else if (action === 'previous-date' || action === 'next-date') {
    const direction = action === 'previous-date' ? -1 : 1
    const nextDate = new Date(calendarDate)
    if (calendarMode === 'month') nextDate.setMonth(nextDate.getMonth() + direction)
    else nextDate.setDate(nextDate.getDate() + direction * (calendarMode === 'week' ? 7 : 1))
    calendarDate = nextDate
  } else {
    const messages: Record<string, string> = {
      'discover-people': 'More communities coming soon',
      settings: 'Settings',
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

render()
