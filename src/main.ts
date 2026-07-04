import './style.css'
import communityPortraits from './assets/community-portraits.png'

type View = 'today' | 'upcoming' | 'calendar' | 'sticky'
type CountKey = 'today' | 'upcoming'
type TaskList = 'Personal' | 'Work' | 'List 1'
type Subtask = { id: string; title: string; completed: boolean }
type UpcomingGroup = 'today' | 'tomorrow' | 'week'
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
  list?: TaskList
  due?: string
  subtasks?: number
  subtaskItems?: Subtask[]
  tags?: string[]
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

const tasks: Task[] = [
  { id: 'research', title: 'Research content ideas', tags: [] },
  { id: 'database', title: 'Create a database of guest authors', tags: [] },
  {
    id: 'license',
    title: "Renew driver's license",
    list: 'Personal',
    due: '22-03-22',
    subtasks: 1,
    subtaskItems: [{ id: 'license-subtask', title: 'Subtask', completed: false }],
    tags: ['Tag 1'],
  },
  { id: 'accountant', title: 'Consult accountant', list: 'List 1', subtasks: 3 },
  { id: 'business-card', title: 'Print business card' },
  { id: 'job-posting', title: 'Create job posting for SEO specialist', list: 'Work' },
  { id: 'assets', title: 'Request design assets for landing page', list: 'Work' },
]

let view: View = 'today'
let selectedTaskId = 'license'
const todayTaskIds = ['research', 'database', 'license', 'accountant', 'business-card']
const upcomingTaskIds: Record<UpcomingGroup, string[]> = {
  today: ['research', 'database', 'license', 'accountant'],
  tomorrow: ['job-posting', 'assets'],
  week: ['research', 'database', 'license', 'accountant', 'business-card'],
}
const screenCounts: Record<CountKey, number> = { today: 5, upcoming: 12 }
const countAnimations: Partial<Record<CountKey, { from: number; to: number; token: number }>> = {}
let countAnimationSequence = 0
const completedTaskIds = new Set<string>()
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

function render() {
  const selected = tasks.find(task => task.id === selectedTaskId) ?? tasks[2]!
  app.innerHTML = `
    <div class="reference-app ${view === 'today' ? 'with-inspector' : ''}">
      ${renderSidebar()}
      <main class="workspace">
        ${view === 'today' ? renderToday() : view === 'upcoming' ? renderUpcoming() : view === 'calendar' ? renderCalendar() : renderStickyWall()}
      </main>
      ${view === 'today' ? renderInspector(selected) : ''}
    </div>
    <div class="toast ${toast ? 'show' : ''}" role="status">${escapeHtml(toast)}</div>
  `
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="menu-heading"><h1>Menu</h1><button aria-label="Menu">${icon('menu')}</button></div>
      <label class="search">${icon('search')}<input aria-label="Search" placeholder="Search" /></label>

      <nav aria-label="Tasks">
        <h2>Tasks</h2>
        ${navButton('upcoming', 'Upcoming', 'upcoming', String(screenCounts.upcoming))}
        ${navButton('today', 'Today', 'today', String(screenCounts.today))}
        ${navButton('calendar', 'Calendar', 'calendar')}
        ${navButton('sticky', 'Community', 'sticky')}
      </nav>

      <section class="side-section">
        <h2>Lists</h2>
        ${listRow('Personal', '#ff666d', '3')}
        ${listRow('Work', '#60d4dd', '3')}
        ${listRow('List 1', '#ffd331', '3')}
        <button class="side-row add-side" data-action="add-list">${icon('plus')}<span>Add New List</span></button>
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

function listRow(name: string, color: string, count: string) {
  return `<button class="side-row"><i class="list-color" style="--list-color:${color}"></i><span>${name}</span><b>${count}</b></button>`
}

function triggerCountAnimation(key: CountKey, from: number, to: number) {
  const token = ++countAnimationSequence
  countAnimations[key] = { from, to, token }
  window.setTimeout(() => {
    if (countAnimations[key]?.token === token) delete countAnimations[key]
  }, 420)
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
  const todayTasks = todayTaskIds
    .map(id => tasks.find(task => task.id === id))
    .filter((task): task is Task => Boolean(task))
    .sort((first, second) => Number(completedTaskIds.has(first.id)) - Number(completedTaskIds.has(second.id)))
  return `
    <section class="today-screen">
      <header class="screen-title"><h1>Today</h1>${renderCountWheel('today')}</header>
      <button class="add-task-row" data-action="add-task">${icon('plus')}<span>Add New Task</span></button>
      <div class="task-list">
        ${todayTasks.map(task => renderTaskRow(task, task.id === selectedTaskId)).join('')}
      </div>
    </section>
  `
}

function renderTaskRow(task: Task, selected = false) {
  const color = task.list === 'Personal' ? '#ff666d' : task.list === 'Work' ? '#60d4dd' : '#ffd331'
  const completed = completedTaskIds.has(task.id)
  const subtaskCount = task.subtaskItems?.length ?? task.subtasks ?? 0
  return `
    <div class="task-row ${selected ? 'selected' : ''} ${completed ? 'completed' : ''}">
      <button class="checkbox" data-complete="${task.id}" aria-label="${completed ? 'Mark as not done' : 'Mark as done'}: ${escapeHtml(task.title)}" aria-pressed="${completed}"></button>
      <button class="task-text" data-task="${task.id}">
        <strong>${escapeHtml(task.title)}</strong>
        ${task.due || task.list || subtaskCount ? `<small>
          ${task.due ? `<span>${icon('calendar')}${task.due}</span>` : ''}
          ${task.due && subtaskCount ? `<span><b>${subtaskCount}</b> Subtasks</span>` : ''}
          ${task.list ? `<span><i class="list-color" style="--list-color:${color}"></i>${task.list === 'List 1' ? 'List' : task.list}</span>` : ''}
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
  return `
    <aside class="inspector">
      <div class="inspector-content">
        <h2>Task:</h2>
        <input class="inspector-title" value="${escapeHtml(task.title)}" aria-label="Task title" />
        <textarea aria-label="Description" placeholder="Description">${escapeHtml(task.description ?? '')}</textarea>

        <div class="inspector-fields">
          <label><span>List</span><button data-action="cycle-list">${task.list ?? 'Personal'} ${icon('down')}</button></label>
          <label><span>Due date</span><button data-action="cycle-due-date">${task.due ?? '11-03-22'} ${icon('down')}</button></label>
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
  const renderGroup = (group: UpcomingGroup) => upcomingTaskIds[group]
    .map(id => tasks.find(task => task.id === id))
    .filter((task): task is Task => Boolean(task))
    .sort((first, second) => Number(completedTaskIds.has(first.id)) - Number(completedTaskIds.has(second.id)))
    .map(task => renderTaskRow(task))
    .join('')
  return `
    <section class="upcoming-screen">
      <header class="screen-title"><h1>Upcoming</h1>${renderCountWheel('upcoming')}</header>
      <section class="upcoming-today">
        <h2>Today</h2>
        <button class="add-task-row" data-action="add-task" data-task-group="today">${icon('plus')}<span>Add New Task</span></button>
        ${renderGroup('today')}
      </section>
      <div class="upcoming-columns">
        <section>
          <h2>Tomorrow</h2>
          <button class="add-task-row" data-action="add-task" data-task-group="tomorrow">${icon('plus')}<span>Add New Task</span></button>
          ${renderGroup('tomorrow')}
        </section>
        <section>
          <h2>This Week</h2>
          <button class="add-task-row" data-action="add-task" data-task-group="week">${icon('plus')}<span>Add New Task</span></button>
          ${renderGroup('week')}
        </section>
      </div>
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
      <div class="spotlight-portrait portrait-frame" style="--portrait-column:${profile.portraitColumn};--portrait-row:${profile.portraitRow}">
        <div class="community-launch-popover spotlight-launch-popover" aria-hidden="true">
          <p class="community-launch-label">Public launch page</p>
          <h4>${escapeHtml(profile.name)}</h4>
          <ul>
            ${profile.bioLines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
          </ul>
          <button class="community-launch-subscribe">Subscribe with Plus</button>
        </div>
        <img src="${communityPortraits}" alt="" />
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
      <div class="community-portrait portrait-frame" style="--portrait-column:${profile.portraitColumn};--portrait-row:${profile.portraitRow}">
        <img src="${communityPortraits}" alt="" />
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
  if (title) task.title = title
  if (description !== undefined) task.description = description
}

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
    if (completedTaskIds.has(completedTaskId)) completedTaskIds.delete(completedTaskId)
    else completedTaskIds.add(completedTaskId)
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
    view = nextView
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
    if (view === 'upcoming') view = 'today'
    render()
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
  if (action === 'add-task') {
    const countKey: CountKey | null = view === 'today' ? 'today' : view === 'upcoming' ? 'upcoming' : null
    if (countKey) {
      const from = screenCounts[countKey]
      screenCounts[countKey] = from + 1
      const newTask: Task = {
        id: crypto.randomUUID(),
        title: `New task ${screenCounts[countKey]}`,
        list: view === 'today' ? 'Personal' : 'Work',
        description: '',
        tags: [],
        subtaskItems: [],
      }
      tasks.unshift(newTask)
      if (view === 'today') {
        todayTaskIds.unshift(newTask.id)
        selectedTaskId = newTask.id
      } else if (view === 'upcoming') {
        const group = target.closest<HTMLElement>('[data-task-group]')?.dataset.taskGroup as UpcomingGroup | undefined
        upcomingTaskIds[group ?? 'today'].unshift(newTask.id)
      }
      triggerCountAnimation(countKey, from, screenCounts[countKey])
    }
    toast = 'New task ready'
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
  } else if (action === 'delete-task') {
    const taskIndex = tasks.findIndex(task => task.id === selectedTaskId)
    if (taskIndex >= 0) tasks.splice(taskIndex, 1)
    const todayIndex = todayTaskIds.indexOf(selectedTaskId)
    if (todayIndex >= 0) {
      todayTaskIds.splice(todayIndex, 1)
      const from = screenCounts.today
      screenCounts.today = todayTaskIds.length
      triggerCountAnimation('today', from, screenCounts.today)
    }
    completedTaskIds.delete(selectedTaskId)
    selectedTaskId = todayTaskIds[0] ?? tasks[0]?.id ?? ''
    toast = 'Task deleted'
  } else if (action === 'cycle-list') {
    persistInspectorDraft()
    const task = selectedTask()
    if (task) {
      const lists: TaskList[] = ['Personal', 'Work', 'List 1']
      task.list = lists[(lists.indexOf(task.list ?? 'Personal') + 1) % lists.length]
    }
  } else if (action === 'cycle-due-date') {
    persistInspectorDraft()
    const task = selectedTask()
    if (task) {
      const dates = ['11-03-22', '22-03-22', 'No date']
      const nextDate = dates[(dates.indexOf(task.due ?? '11-03-22') + 1) % dates.length]
      task.due = nextDate === 'No date' ? undefined : nextDate
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
      'add-list': 'New list ready',
      'discover-people': 'More communities coming soon',
      settings: 'Settings',
      signout: 'Signed out',
    }
    toast = messages[action] ?? ''
  }
  render()
  window.setTimeout(() => {
    toast = ''
    render()
  }, 1400)
})

render()
