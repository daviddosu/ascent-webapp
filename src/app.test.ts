// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from 'vitest'
import axe from 'axe-core'

const vibrate = vi.fn()

beforeAll(async () => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate })
  document.body.innerHTML = '<div id="app"></div>'
  await import('./main')
})

describe('reference screens', () => {
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
    form.querySelector<HTMLInputElement>('[name="tags"]')!.value = 'Tag 1, Tag 2'
    const due = form.querySelector<HTMLInputElement>('[name="due"]')!
    expect(due.min).not.toBe('')
    expect(due.max > due.min).toBe(true)
    form.requestSubmit()

    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore + 1)
    expect(document.querySelector('.task-row.selected .task-text strong')?.textContent).toBe('Plan launch review')
    expect(document.querySelector<HTMLInputElement>('.inspector-title')?.value).toBe('Plan launch review')
    expect(document.querySelector<HTMLTextAreaElement>('.inspector textarea')?.value).toBe('Gather the launch notes.')
    expect(vibrate).toHaveBeenCalledWith([35, 30, 60])
  })

  it('creates a colored goal and uses sidebar goals as task filters', () => {
    document.querySelector<HTMLButtonElement>('[data-action="open-goal-composer"]')!.click()
    const form = document.querySelector<HTMLFormElement>('[data-goal-form]')!
    form.querySelector<HTMLInputElement>('[name="name"]')!.value = 'Grow LinkedIn'
    form.querySelector<HTMLInputElement>('[name="color"]')!.value = '#2878ff'
    form.requestSubmit()

    expect([...document.querySelectorAll('.goal-row')].some(row => row.textContent?.includes('Grow LinkedIn'))).toBe(true)
    expect(window.localStorage.getItem('ascent-goals-v1')).toContain('Grow LinkedIn')

    document.querySelector<HTMLButtonElement>('[data-goal-filter="job-search"]')!.click()
    expect([...document.querySelectorAll('.today-screen .task-row strong')].some(node => node.textContent === 'Plan launch review')).toBe(true)
    expect([...document.querySelectorAll('.today-screen .task-row strong')].some(node => node.textContent === "Renew driver's license")).toBe(false)
    document.querySelector<HTMLButtonElement>('[data-goal-filter="job-search"]')!.click()
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
    document.querySelector<HTMLButtonElement>('[data-action="add-tag"]')!.click()
    expect(document.querySelector('[data-remove-tag="Tag 1"]')).not.toBeNull()

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
    form.requestSubmit()

    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore + 1)
    const tomorrowSection = document.querySelector('[data-upcoming-section="tomorrow"]')!
    expect([...tomorrowSection.querySelectorAll('.task-row strong')].some(node => node.textContent === 'Prepare tomorrow brief')).toBe(true)
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
    expect(window.sessionStorage.getItem('ascent-active-view')).toBe('calendar')

    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    expect(window.sessionStorage.getItem('ascent-active-view')).toBe('today')
  })

  it('opens the Calendar day view', () => {
    document.querySelector<HTMLButtonElement>('[data-view="calendar"]')!.click()
    expect(document.querySelector('.calendar-header h1')?.textContent).toBe('16 February 2022')
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(3)
  })

  it('adds calendar events, navigates dates, and switches calendar modes', () => {
    document.querySelector<HTMLButtonElement>('[data-action="add-event"]')!.click()
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(4)
    expect(document.querySelector('.calendar-event[data-event] strong')?.textContent).toBe('Session 1: Marketing Sprint')
    expect([...document.querySelectorAll('.calendar-event strong')].some(node => node.textContent === 'New event 4')).toBe(true)

    document.querySelector<HTMLButtonElement>('[data-action="previous-date"]')!.click()
    expect(document.querySelector('.calendar-header h1')?.textContent).toBe('15 February 2022')
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(0)
    document.querySelector<HTMLButtonElement>('[data-action="next-date"]')!.click()
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(4)

    document.querySelector<HTMLButtonElement>('[data-calendar-mode="week"]')!.click()
    expect(document.querySelector('[data-calendar-mode="week"]')?.classList.contains('active')).toBe(true)
    expect(document.querySelector('.calendar-header h1')?.textContent).toBe('14 – 20 February 2022')
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(4)
    document.querySelector<HTMLButtonElement>('[data-calendar-mode="month"]')!.click()
    expect(document.querySelector('[data-calendar-mode="month"]')?.classList.contains('active')).toBe(true)
    expect(document.querySelector('.calendar-header h1')?.textContent).toBe('February 2022')
    expect(document.querySelectorAll('.calendar-event')).toHaveLength(4)
  })

  it('opens Community and can follow a profile', () => {
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
  })

  it('has no serious automated accessibility problems', async () => {
    const results = await axe.run(document.querySelector('#app')!, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([])
  })
})
