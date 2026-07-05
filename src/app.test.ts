// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from 'vitest'
import axe from 'axe-core'

beforeAll(async () => {
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
    document.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click()
    expect(document.querySelector('.screen-count')?.getAttribute('data-count')).toBe('6')
    expect(document.querySelector('.task-row .task-text strong')?.textContent).toBe('New task 6')
  })

  it('marks a task done from its checkbox', () => {
    const checkbox = document.querySelector<HTMLButtonElement>('[data-complete="database"]')!
    checkbox.click()
    expect(document.querySelector('[data-complete="database"]')?.closest('.task-row')?.classList.contains('completed')).toBe(true)
    expect(document.querySelector('[data-complete="database"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('runs a complete Today task workflow and keeps done tasks at the bottom', () => {
    document.querySelector<HTMLButtonElement>('[data-view="today"]')!.click()
    const countBefore = Number(document.querySelector('.screen-count')?.getAttribute('data-count'))

    document.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click()
    const title = document.querySelector<HTMLInputElement>('.inspector-title')!
    const description = document.querySelector<HTMLTextAreaElement>('.inspector textarea')!
    title.value = 'Write launch notes'
    description.value = 'Summarize the launch decisions.'
    document.querySelector<HTMLButtonElement>('[data-action="save-task"]')!.click()

    expect(document.querySelector('.task-row.selected strong')?.textContent).toBe('Write launch notes')
    expect(document.querySelector<HTMLTextAreaElement>('.inspector textarea')?.value).toBe('Summarize the launch decisions.')
    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore + 1)

    document.querySelector<HTMLButtonElement>('[data-action="cycle-list"]')!.click()
    expect(document.querySelector('[data-action="cycle-list"]')?.textContent).toContain('Work')
    document.querySelector<HTMLButtonElement>('[data-action="cycle-due-date"]')!.click()
    expect(document.querySelector('[data-action="cycle-due-date"]')?.textContent).toContain('22-03-22')
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

  it('opens Upcoming with all three groups', () => {
    document.querySelector<HTMLButtonElement>('[data-view="upcoming"]')!.click()
    expect(document.querySelector('.screen-title h1')?.textContent).toBe('Upcoming')
    expect(document.querySelector('.screen-count')?.getAttribute('data-count')).toBe('12')
    expect([...document.querySelectorAll('.upcoming-screen h2')].map(node => node.textContent)).toEqual([
      'Today',
      'Tomorrow',
      'This Week',
    ])
  })

  it('adds a task on Upcoming and advances the count wheel', () => {
    document.querySelector<HTMLButtonElement>('[data-view="upcoming"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click()
    expect(document.querySelector('.screen-count')?.getAttribute('data-count')).toBe('13')
    expect(document.querySelector('.upcoming-screen .task-row .task-text strong')?.textContent).toBe('New task 13')
  })

  it('adds to a chosen Upcoming group and moves the completed task to that group’s bottom', () => {
    const countBefore = Number(document.querySelector('.screen-count')?.getAttribute('data-count'))
    document.querySelector<HTMLButtonElement>('[data-task-group="tomorrow"]')!.click()
    expect(Number(document.querySelector('.screen-count')?.getAttribute('data-count'))).toBe(countBefore + 1)

    const tomorrowSection = document.querySelector('[data-task-group="tomorrow"]')!.parentElement!
    const createdTitle = tomorrowSection.querySelector('.task-row strong')?.textContent
    expect(createdTitle).toBe(`New task ${countBefore + 1}`)

    tomorrowSection.querySelector<HTMLButtonElement>('.task-row [data-complete]')!.click()
    const tomorrowTitles = [...document.querySelector('[data-task-group="tomorrow"]')!.parentElement!.querySelectorAll('.task-row strong')]
      .map(node => node.textContent)
    expect(tomorrowTitles.at(-1)).toBe(createdTitle)
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
