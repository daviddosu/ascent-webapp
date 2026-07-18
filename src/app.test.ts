// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from 'vitest'
import axe from 'axe-core'

const vibrate = vi.fn()

function testDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addTestDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setHours(12, 0, 0, 0)
  next.setDate(next.getDate() + amount)
  return next
}

function refreshAppDate(reference = new Date()) {
  const hook = window as Window & { __shotcountRefreshDateState?: (reference?: Date) => void }
  hook.__shotcountRefreshDateState?.(reference)
}

beforeAll(async () => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate })
  document.body.innerHTML = '<div id="app"></div>'
  await import('./main')
})

describe('reference screens', () => {
  it('uses one short profile pop-over from Settings', () => {
    document.querySelector<HTMLButtonElement>('[data-action="settings"]')!.click()
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('Your profile')
    expect(document.querySelectorAll('[data-profile-form] input, [data-profile-form] textarea, [data-profile-form] select')).toHaveLength(6)
    expect(document.querySelector<HTMLSelectElement>('[name="defaultTaskVisibility"]')?.value).toBe('private')
    expect(document.querySelectorAll('[data-profile-field].is-missing')).toHaveLength(4)
    expect(document.querySelectorAll('.profile-required:not([hidden])')).toHaveLength(4)
    const username = document.querySelector<HTMLInputElement>('[data-profile-form] input[name="username"]')!
    const bio = document.querySelector<HTMLTextAreaElement>('[data-profile-form] textarea[name="bio"]')!
    expect(document.querySelectorAll('.profile-info-tip')).toHaveLength(2)
    expect(document.querySelector('#profile-username-tip')?.textContent).toContain('You can change it')
    expect(username.getAttribute('aria-describedby')).toBe('profile-username-tip')
    expect(bio.placeholder).toBe('What are you building?')
    expect(document.querySelector('#profile-bio-tip')?.textContent).toContain('followers on X')
    expect(bio.getAttribute('aria-describedby')).toBe('profile-bio-tip')
    expect(document.querySelector('.profile-form-actions [data-action="close-profile"]')?.textContent).toBe('Not now')
    username.value = 'David.Dosu!'
    username.dispatchEvent(new Event('input', { bubbles: true }))
    expect(username.value).toBe('daviddosu')
    expect(username.closest('[data-profile-field]')?.classList.contains('is-missing')).toBe(false)
    document.querySelector<HTMLButtonElement>('.profile-form-actions [data-action="close-profile"]')!.click()
    expect(document.querySelector('.profile-popover')).toBeNull()
  })

  it('shows the Shotcount name without the square S badge in the mobile top bar', () => {
    expect(document.querySelector('.mobile-brand')?.textContent).toBe('Shotcount')
    expect(document.querySelector('.mobile-brand span')).toBeNull()
    expect(document.querySelector<HTMLButtonElement>('.mobile-profile-button')?.getAttribute('aria-label')).toBe('Profile')
  })

  it('opens Today with its task inspector', () => {
    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    expect(document.querySelector('.screen-title h1')?.textContent).toBe('Today')
    expect(document.querySelector('.screen-count')?.getAttribute('data-count')).toBe('5')
    expect(document.querySelectorAll('.task-row')).toHaveLength(5)
    expect(document.querySelector('.inspector-title')?.getAttribute('value')).toBe("Renew driver's license")
  })

  it('adds a task on Today and advances the count wheel', () => {
    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    vibrate.mockClear()
    const countBefore = Number(document.querySelector('.screen-count')?.getAttribute('data-count'))
    document.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click()
    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore)
    const form = document.querySelector<HTMLFormElement>('[data-today-form]')!
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Plan launch review'
    form.querySelector<HTMLTextAreaElement>('[name="description"]')!.value = 'Gather the launch notes.'
    form.querySelector<HTMLSelectElement>('[name="goalId"]')!.value = 'job-search'
    form.querySelector<HTMLSelectElement>('[name="visibility"]')!.value = 'followers'
    const due = form.querySelector<HTMLInputElement>('[name="due"]')!
    expect(due.min).not.toBe('')
    expect(due.max > due.min).toBe(true)
    form.requestSubmit()

    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore + 1)
    expect(document.querySelector('.task-row.selected .task-text strong')?.textContent).toBe('Plan launch review')
    expect(document.querySelector<HTMLInputElement>('.inspector-title')?.value).toBe('Plan launch review')
    expect(document.querySelector<HTMLTextAreaElement>('.inspector textarea')?.value).toBe('Gather the launch notes.')
    expect(document.querySelector<HTMLSelectElement>('.inspector-visibility')?.value).toBe('followers')
    expect(document.querySelector('.task-row.selected .task-visibility')?.textContent).toBe('Followers')
    expect(vibrate).toHaveBeenCalledWith([35, 30, 60])
  })

  it('creates a colored goal and uses sidebar goals as task filters', () => {
    document.querySelector<HTMLButtonElement>('[data-action="open-goal-composer"]')!.click()
    const form = document.querySelector<HTMLFormElement>('[data-goal-form]')!
    form.querySelector<HTMLInputElement>('[name="name"]')!.value = 'Grow LinkedIn'
    form.querySelector<HTMLInputElement>('[name="color"]')!.value = '#2878ff'
    form.requestSubmit()

    expect([...document.querySelectorAll('.goal-row')].some(row => row.textContent?.includes('Grow LinkedIn'))).toBe(true)
    expect(window.localStorage.getItem('shotcount-workspace-current-v1:goals')).toContain('Grow LinkedIn')

    document.querySelector<HTMLButtonElement>('[data-goal-filter="job-search"]')!.click()
    expect([...document.querySelectorAll('.today-screen .task-row strong')].some(node => node.textContent === 'Plan launch review')).toBe(true)
    expect([...document.querySelectorAll('.today-screen .task-row strong')].some(node => node.textContent === "Renew driver's license")).toBe(false)
    document.querySelector<HTMLButtonElement>('[data-goal-filter="job-search"]')!.click()
  })

  it('creates and selects a new goal inside the Today task form without losing its words', () => {
    document.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click()
    let form = document.querySelector<HTMLFormElement>('[data-today-form]')!
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Record the first episode'
    form.querySelector<HTMLTextAreaElement>('[name="description"]')!.value = 'Keep this little note safe.'
    document.querySelector<HTMLButtonElement>('[data-action="open-inline-goal"]')!.click()

    form = document.querySelector<HTMLFormElement>('[data-today-form]')!
    expect(form.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Record the first episode')
    expect(form.querySelector<HTMLTextAreaElement>('[name="description"]')!.value).toBe('Keep this little note safe.')
    const suggestedColor = form.querySelector<HTMLInputElement>('[name="newGoalColor"]')!.value
    expect(['#ff666d', '#60d4dd', '#ffd331', '#2878ff']).not.toContain(suggestedColor)
    form.querySelector<HTMLInputElement>('[name="newGoalName"]')!.value = 'Launch a podcast'
    form.querySelector<HTMLInputElement>('[name="newGoalColor"]')!.value = '#2878ff'
    document.querySelector<HTMLButtonElement>('[data-action="create-inline-goal"]')!.click()

    form = document.querySelector<HTMLFormElement>('[data-today-form]')!
    const goalSelect = form.querySelector<HTMLSelectElement>('[name="goalId"]')!
    expect(goalSelect.options[goalSelect.selectedIndex]?.textContent).toBe('Launch a podcast')
    expect(form.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Record the first episode')
    expect([...document.querySelectorAll('.goal-row')].some(row => row.textContent?.includes('Launch a podcast'))).toBe(true)
    expect(window.localStorage.getItem('shotcount-workspace-current-v1:goals')).toContain('Launch a podcast')
    const savedGoals = JSON.parse(window.localStorage.getItem('shotcount-workspace-current-v1:goals')!) as Array<{ name: string; color: string }>
    const goalColors = savedGoals.map(goal => goal.color.toLowerCase())
    expect(new Set(goalColors).size).toBe(goalColors.length)
    expect(savedGoals.find(goal => goal.name === 'Launch a podcast')?.color).not.toBe('#2878ff')
    form.querySelector<HTMLButtonElement>('[data-action="close-today-composer"]')!.click()
  })

  it('marks a task done from its checkbox', () => {
    vibrate.mockClear()
    const checkbox = document.querySelector<HTMLButtonElement>('[data-complete="database"]')!
    checkbox.click()
    expect(document.querySelector('[data-complete="database"]')?.closest('.task-row')?.classList.contains('completed')).toBe(true)
    expect(document.querySelector('[data-complete="database"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(vibrate).toHaveBeenCalledWith(65)
  })

  it('runs a complete Today task workflow and keeps done tasks at the bottom', () => {
    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    const countBefore = Number(document.querySelector('.screen-count')?.getAttribute('data-count'))

    document.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click()
    const form = document.querySelector<HTMLFormElement>('[data-today-form]')!
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Write launch notes'
    form.querySelector<HTMLTextAreaElement>('[name="description"]')!.value = 'Summarize the launch decisions.'
    form.requestSubmit()

    expect(document.querySelector('.task-row.selected strong')?.textContent).toBe('Write launch notes')
    expect(document.querySelector<HTMLTextAreaElement>('.inspector textarea')?.value).toBe('Summarize the launch decisions.')
    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore + 1)

    document.querySelector<HTMLButtonElement>('[data-action="cycle-goal"]')!.click()
    expect(document.querySelector('[data-action="cycle-goal"]')?.textContent).toContain('Find a new job')
    expect(document.querySelector<HTMLInputElement>('.inspector-date')?.value).not.toBe('')
    const visibility = document.querySelector<HTMLSelectElement>('.inspector-visibility')!
    expect(visibility.value).toBe('private')
    visibility.value = 'public'
    visibility.dispatchEvent(new Event('change', { bubbles: true }))
    expect(document.querySelector('.task-row.selected .task-visibility')?.textContent).toBe('Public')
    expect(window.localStorage.getItem('shotcount-workspace-current-v1:planner')).toContain('"visibility":"public"')

    document.querySelector<HTMLButtonElement>('[data-action="add-subtask"]')!.click()
    const subtask = document.querySelector<HTMLInputElement>('[data-subtask]')!
    subtask.click()
    expect(document.querySelector('.subtask span')?.classList.contains('completed')).toBe(true)

    const newTaskCheckbox = document.querySelector<HTMLButtonElement>('.task-row.selected [data-complete]')!
    newTaskCheckbox.click()
    const rows = [...document.querySelectorAll('.task-row')]
    const completedRowIndex = rows.findIndex(row => row.querySelector('strong')?.textContent === 'Write launch notes')
    const lastActiveRowIndex = rows.map(row => row.classList.contains('completed')).lastIndexOf(false)
    expect(completedRowIndex).toBeGreaterThan(lastActiveRowIndex)

    document.querySelector<HTMLButtonElement>('[data-action="delete-task"]')!.click()
    expect([...document.querySelectorAll('.task-row strong')].some(node => node.textContent === 'Write launch notes')).toBe(false)
    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore)
  })

  it('opens Upcoming with Tomorrow, This Week, and all activity modes', () => {
    document.querySelector<HTMLButtonElement>('[data-view="upcoming"]')!.click()
    expect(document.querySelector('.screen-title h1')?.textContent).toBe('Upcoming')
    expect(document.querySelector('.screen-count')?.getAttribute('data-count')).toBe('5')
    expect([...document.querySelectorAll('.upcoming-screen h2')].map(node => node.textContent)).toEqual([
      'Tomorrow',
      'This Week',
      'Task activity',
    ])
    expect(document.querySelectorAll('.activity-cell')).toHaveLength(371)
    expect([...document.querySelectorAll('[data-activity-mode]')].map(node => node.textContent)).toEqual(['Daily', 'Weekly', 'Cumulative'])
  })

  it('routes a future-dated task from Today into This Week', () => {
    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    const todayCountBefore = Number(document.querySelector('.screen-count')?.getAttribute('data-count'))
    document.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click()
    const form = document.querySelector<HTMLFormElement>('[data-today-form]')!
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Prepare weekly handoff'
    const due = form.querySelector<HTMLInputElement>('[name="due"]')!
    due.value = due.max
    form.requestSubmit()

    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(todayCountBefore)
    document.querySelector<HTMLButtonElement>('[data-view="upcoming"]')!.click()
    const weekSection = document.querySelector('[data-upcoming-section="week"]')!
    expect([...weekSection.querySelectorAll('.task-row strong')].some(node => node.textContent === 'Prepare weekly handoff')).toBe(true)
  })

  it('adds a task to Tomorrow with tomorrow’s date', () => {
    document.querySelector<HTMLButtonElement>('[data-view="upcoming"]')!.click()
    const countBefore = Number(document.querySelector('.screen-count')?.getAttribute('data-count'))
    document.querySelector<HTMLButtonElement>('[data-task-group="tomorrow"]')!.click()
    const form = document.querySelector<HTMLFormElement>('[data-planner-form="tomorrow"]')!
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Prepare tomorrow brief'
    form.querySelector<HTMLInputElement>('[name="time"]')!.value = '09:15'
    form.requestSubmit()

    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore + 1)
    const tomorrowSection = document.querySelector('[data-upcoming-section="tomorrow"]')!
    expect([...tomorrowSection.querySelectorAll('.task-row strong')].some(node => node.textContent === 'Prepare tomorrow brief')).toBe(true)
    expect(window.localStorage.getItem('shotcount-workspace-current-v1:planner')).toContain('"time":"09:15"')
  })

  it('requires and saves a date for a This Week task', () => {
    const countBefore = Number(document.querySelector('.screen-count')?.getAttribute('data-count'))
    document.querySelector<HTMLButtonElement>('[data-task-group="week"]')!.click()
    const form = document.querySelector<HTMLFormElement>('[data-planner-form="week"]')!
    const title = form.querySelector<HTMLInputElement>('[name="title"]')!
    const due = form.querySelector<HTMLInputElement>('[name="due"]')!
    expect(due.required).toBe(true)
    title.value = 'Plan the weekly review'
    due.value = due.min
    form.requestSubmit()

    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore + 1)
    const weekSection = document.querySelector('[data-upcoming-section="week"]')!
    expect([...weekSection.querySelectorAll('.task-row strong')].some(node => node.textContent === 'Plan the weekly review')).toBe(true)
  })

  it('switches the activity graph between daily, weekly, and cumulative', () => {
    document.querySelector<HTMLButtonElement>('[data-activity-mode="weekly"]')!.click()
    expect(document.querySelector('[data-activity-mode="weekly"]')?.getAttribute('aria-pressed')).toBe('true')
    document.querySelector<HTMLButtonElement>('[data-activity-mode="cumulative"]')!.click()
    expect(document.querySelector('[data-activity-mode="cumulative"]')?.classList.contains('active')).toBe(true)
  })

  it('remembers the active page in session storage', () => {
    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    expect(window.sessionStorage.getItem('shotcount-workspace-current-v1:active-view')).toBe('calendar')

    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    expect(window.sessionStorage.getItem('shotcount-workspace-current-v1:active-view')).toBe('today')
  })

  it('refreshes Today defaults when the date changes', () => {
    const nextDay = addTestDays(new Date(), 1)
    refreshAppDate(nextDay)

    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click()

    const form = document.querySelector<HTMLFormElement>('[data-today-form]')!
    const due = form.querySelector<HTMLInputElement>('[name="due"]')!
    expect(due.value).toBe(testDateKey(nextDay))
    expect(due.min).toBe(testDateKey(nextDay))
    expect(due.max).toBe(testDateKey(addTestDays(nextDay, 7)))

    refreshAppDate()
  })

  it('opens the Calendar as a week planner with an unscheduled tray', () => {
    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    expect(document.querySelector('[data-calendar-mode="week"]')?.classList.contains('active')).toBe(true)
    expect(document.querySelector('.calendar-header h1')?.textContent).toContain(String(new Date().getFullYear()))
    expect(document.querySelectorAll('.calendar-day-head:not(.spacer)')).toHaveLength(7)
    expect(document.querySelector('.unscheduled-tray')?.textContent).toContain('To schedule')
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(1)
    expect(document.querySelectorAll('.calendar-now-line')).toHaveLength(1)
    document.querySelector<HTMLButtonElement>('[data-calendar-mode="day"]')!.click()
    expect(document.querySelectorAll('.calendar-now-line')).toHaveLength(1)
    document.querySelector<HTMLButtonElement>('[data-action="next-date"]')!.click()
    expect(document.querySelectorAll('.calendar-now-line')).toHaveLength(0)
    refreshAppDate()
    document.querySelector<HTMLButtonElement>('[data-calendar-mode="week"]')!.click()
  })

  it('uses the visible calendar date when scheduling an unscheduled task from the tray', () => {
    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    refreshAppDate()
    document.querySelector<HTMLButtonElement>('[data-calendar-mode="week"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="next-date"]')!.click()
    document.querySelector<HTMLButtonElement>('.unscheduled-task[data-task-id="research"]')!.click()

    const form = document.querySelector<HTMLFormElement>('[data-calendar-form]')!
    expect(form.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Research content ideas')
    expect(form.querySelector<HTMLInputElement>('[name="due"]')!.value).toBe(testDateKey(addTestDays(new Date(), 7)))
    form.querySelector<HTMLButtonElement>('[data-action="close-calendar-composer"]')!.click()
    refreshAppDate()
  })

  it('closes the calendar composer when leaving Calendar', () => {
    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="add-event"]')!.click()
    expect(document.querySelector('[data-calendar-form]')).not.toBeNull()

    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    expect(document.querySelector('[data-calendar-form]')).toBeNull()
    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    expect(document.querySelector('[data-calendar-form]')).toBeNull()
  })

  it('creates, filters, searches, and detects conflicts for calendar items', () => {
    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="add-event"]')!.click()
    let calendarForm = document.querySelector<HTMLFormElement>('[data-calendar-form]')!
    calendarForm.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Calendar deep work'
    calendarForm.querySelector<HTMLSelectElement>('[name="goalId"]')!.value = 'personal'
    calendarForm.querySelector<HTMLInputElement>('[name="time"]')!.value = '10:00'
    calendarForm.querySelector<HTMLSelectElement>('[name="duration"]')!.value = '60'
    calendarForm.querySelector<HTMLSelectElement>('[name="recurrence"]')!.value = 'weekly'
    calendarForm.querySelector<HTMLSelectElement>('[name="reminder"]')!.value = '30'
    calendarForm.querySelector<HTMLInputElement>('[name="location"]')!.value = 'Studio'
    calendarForm.querySelector<HTMLInputElement>('[name="attendees"]')!.value = 'Ada'
    calendarForm.requestSubmit()

    expect([...document.querySelectorAll('.calendar-event strong')].some(node => node.textContent === 'Calendar deep work')).toBe(true)
    expect(document.querySelector('.calendar-event')?.getAttribute('style')).toContain('#ff666d')
    expect(document.querySelector('.calendar-event .calendar-event-goal')?.textContent).toContain('Personal')
    expect(document.querySelector('.calendar-stats')?.textContent).toContain('1h 30m planned')
    const createdEvent = [...document.querySelectorAll<HTMLElement>('.calendar-event')]
      .find(node => node.textContent?.includes('Calendar deep work'))!
    expect(createdEvent.textContent).toContain('Weekly')
    expect(createdEvent.textContent).toContain('30m')
    expect(createdEvent.textContent).toContain('Ada')

    createdEvent.querySelector<HTMLButtonElement>('button')!.click()
    calendarForm = document.querySelector<HTMLFormElement>('[data-calendar-form]')!
    expect(calendarForm.querySelector<HTMLSelectElement>('[name="recurrence"]')!.value).toBe('weekly')
    expect(calendarForm.querySelector<HTMLSelectElement>('[name="reminder"]')!.value).toBe('30')
    expect(calendarForm.querySelector<HTMLInputElement>('[name="attendees"]')!.value).toBe('Ada')
    calendarForm.querySelector<HTMLButtonElement>('[data-action="close-calendar-composer"]')!.click()

    document.querySelector<HTMLButtonElement>('[data-action="add-event"]')!.click()
    calendarForm = document.querySelector<HTMLFormElement>('[data-calendar-form]')!
    calendarForm.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Overlapping review'
    calendarForm.querySelector<HTMLSelectElement>('[name="goalId"]')!.value = 'personal'
    calendarForm.querySelector<HTMLInputElement>('[name="time"]')!.value = '10:30'
    calendarForm.querySelector<HTMLSelectElement>('[name="duration"]')!.value = '30'
    calendarForm.requestSubmit()
    expect(document.querySelector('.calendar-stats .has-conflict')?.textContent).toContain('1')

    const search = document.querySelector<HTMLInputElement>('[data-calendar-search]')!
    search.focus()
    for (const value of ['d', 'de', 'dee', 'deep']) {
      const activeSearch = document.querySelector<HTMLInputElement>('[data-calendar-search]')!
      activeSearch.value = value
      activeSearch.setSelectionRange(value.length, value.length)
      activeSearch.dispatchEvent(new Event('input', { bubbles: true }))
      expect(document.activeElement).toBe(document.querySelector('[data-calendar-search]'))
      expect(document.querySelector<HTMLInputElement>('[data-calendar-search]')!.value).toBe(value)
    }
    expect([...document.querySelectorAll('.calendar-event strong')].map(node => node.textContent)).toEqual(['Calendar deep work'])
    document.querySelector<HTMLButtonElement>('[data-calendar-goal="personal"]')!.click()
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(0)
    document.querySelector<HTMLButtonElement>('[data-calendar-goal="personal"]')!.click()
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(1)

    const todayTitle = document.querySelector('.calendar-header h1')?.textContent
    document.querySelector<HTMLButtonElement>('[data-action="previous-date"]')!.click()
    expect(document.querySelector('.calendar-header h1')?.textContent).not.toBe(todayTitle)
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(0)
    document.querySelector<HTMLButtonElement>('[data-action="next-date"]')!.click()
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(1)

    const liveSearch = document.querySelector<HTMLInputElement>('[data-calendar-search]')!
    liveSearch.value = ''
    liveSearch.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-calendar-mode="day"]')!.click()
    expect(document.querySelector('[data-calendar-mode="day"]')?.classList.contains('active')).toBe(true)
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(2)
    document.querySelector<HTMLButtonElement>('[data-calendar-mode="month"]')!.click()
    expect(document.querySelector('[data-calendar-mode="month"]')?.classList.contains('active')).toBe(true)
    expect(document.querySelector('.calendar-header h1')?.textContent).toBe(new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))
    expect([...document.querySelectorAll('.month-event')].filter(node => node.textContent === 'Calendar deep work').length).toBeGreaterThan(1)
    expect([...document.querySelectorAll('.month-event')].some(node => node.textContent === 'Overlapping review')).toBe(true)
  })

  it('puts a timed task on Calendar in its goal color and removes it when done', () => {
    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click()
    const form = document.querySelector<HTMLFormElement>('[data-today-form]')!
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Timed focus block'
    form.querySelector<HTMLSelectElement>('[name="goalId"]')!.value = 'personal'
    form.querySelector<HTMLInputElement>('[name="time"]')!.value = '15:30'
    form.requestSubmit()

    const selectedCheckbox = document.querySelector<HTMLButtonElement>('.task-row.selected .checkbox')!
    const taskId = selectedCheckbox.dataset.complete!
    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    const search = document.querySelector<HTMLInputElement>('[data-calendar-search]')
    if (search) {
      search.value = ''
      search.dispatchEvent(new Event('input', { bubbles: true }))
    }
    document.querySelector<HTMLButtonElement>('[data-calendar-mode="day"]')!.click()
    const calendarTask = document.querySelector<HTMLElement>(`[data-calendar-task="${taskId}"]`)!
    expect(calendarTask.textContent).toContain('Timed focus block')
    expect(calendarTask.getAttribute('style')).toContain('#ff666d')

    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    document.querySelector<HTMLButtonElement>(`[data-complete="${taskId}"]`)!.click()
    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    expect(document.querySelector(`[data-calendar-task="${taskId}"]`)).toBeNull()
  })

  it('shows a monthly calendar item on the next month when the month is short', () => {
    const current = new Date()
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 12)
    const due = testDateKey(monthEnd)
    const title = `Monthly closeout ${due}`

    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    document.querySelector<HTMLInputElement>('[data-calendar-search]')!.value = ''
    document.querySelector<HTMLInputElement>('[data-calendar-search]')!.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-calendar-mode="month"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="add-event"]')!.click()

    const form = document.querySelector<HTMLFormElement>('[data-calendar-form]')!
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = title
    form.querySelector<HTMLInputElement>('[name="due"]')!.value = due
    form.querySelector<HTMLInputElement>('[name="time"]')!.value = '08:00'
    form.querySelector<HTMLSelectElement>('[name="recurrence"]')!.value = 'monthly'
    form.requestSubmit()

    document.querySelector<HTMLButtonElement>('[data-action="next-date"]')!.click()
    const matchingEvents = [...document.querySelectorAll('.month-event')].filter(node => node.textContent === title)
    expect(matchingEvents).toHaveLength(2)
  })

  it('opens Community and can follow a profile', async () => {
    document.querySelector<HTMLButtonElement>('[data-view="sticky"]')!.click()
    expect(document.querySelector('.community-title h1')?.textContent).toBe('Community')
    expect(document.querySelectorAll('.spotlight-card')).toHaveLength(1)
    expect(document.querySelector('.spotlight-card .community-launch-popover h4')?.textContent).toBe('Amara Okafor')
    expect(document.querySelectorAll('.community-card')).toHaveLength(5)
    expect(document.querySelector('.community-card .community-launch-popover h4')?.textContent).toBe('Kenji Watanabe')
    expect(document.querySelector('.community-card .community-launch-popover li')?.textContent).toBe('Creative director, independent brands')
    const follow = document.querySelector<HTMLButtonElement>('[data-follow="kenji"]')!
    expect(follow.getAttribute('aria-pressed')).toBe('false')
    follow.click()
    expect(document.querySelector('[data-follow="kenji"]')?.getAttribute('aria-pressed')).toBe('true')

    document.querySelector<HTMLButtonElement>('[data-community="maya"]')!.click()
    expect(document.querySelector('.creator-follow-card h2')?.textContent).toBe('Follow Maya Raman?')
    expect(document.querySelector('.creator-follow-copy')?.textContent).toContain('personal Shotcount link')
    expect(document.querySelector('.creator-follow-privacy')?.textContent).toBe('Private tasks always stay private.')
    expect(window.location.pathname).toBe('/maya')
    document.querySelector<HTMLButtonElement>('[data-action="cancel-creator-follow"]')!.click()
    expect(document.querySelector('.creator-follow-card')).toBeNull()
    expect(window.location.pathname).toBe('/')

    document.querySelector<HTMLButtonElement>('[data-community="maya"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-creator-follow"]')!.click()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-follow="maya"]')?.getAttribute('aria-pressed')).toBe('true')
      expect(document.querySelector('.creator-follow-card')).toBeNull()
      expect(window.location.pathname).toBe('/')
    })
  })

  it('toggles dark mode and remembers it', () => {
    const toggle = document.querySelector<HTMLButtonElement>('[data-action="toggle-theme"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    toggle.click()

    expect(document.body.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.querySelector('[data-action="toggle-theme"]')?.getAttribute('aria-checked')).toBe('true')
    expect(window.localStorage.getItem('shotcount-workspace-current-v1:theme')).toBe('dark')

    document.querySelector<HTMLButtonElement>('[data-action="toggle-theme"]')!.click()
    expect(document.body.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('shotcount-workspace-current-v1:theme')).toBe('light')
  })

  it('has no serious automated accessibility problems', async () => {
    const results = await axe.run(document.querySelector('#app')!, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([])
  })
})
