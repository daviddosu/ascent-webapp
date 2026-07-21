import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TASK_REMINDER_MINUTES,
  isTaskReminderDue,
  nextTomorrowPlanningTime,
  shouldPromptForTomorrow,
  taskReminderAt,
} from './data/reminders'

describe('daily planning and task reminders', () => {
  it('prompts once at or after 6:30 PM local time', () => {
    const before = new Date(2026, 6, 21, 18, 29)
    const onTime = new Date(2026, 6, 21, 18, 30)
    expect(shouldPromptForTomorrow(before, '')).toBe(false)
    expect(shouldPromptForTomorrow(onTime, '')).toBe(true)
    expect(shouldPromptForTomorrow(onTime, '2026-07-21')).toBe(false)
    expect(nextTomorrowPlanningTime(onTime)).toEqual(new Date(2026, 6, 22, 18, 30))
  })

  it('defaults timed tasks to a reminder 15 minutes before they are due', () => {
    const task = { id: 'task-1', title: 'Call Maya', due: '2026-07-21', time: '19:00' }
    expect(DEFAULT_TASK_REMINDER_MINUTES).toBe(15)
    expect(taskReminderAt(task)).toEqual(new Date(2026, 6, 21, 18, 45))
    expect(isTaskReminderDue(task, new Date(2026, 6, 21, 18, 45))).toBe(true)
    expect(isTaskReminderDue(task, new Date(2026, 6, 21, 18, 44))).toBe(false)
  })

  it('never reminds for completed or previous-day tasks', () => {
    const completed = { id: 'task-1', title: 'Call Maya', due: '2026-07-21', time: '19:00', completedAt: '2026-07-21T18:00:00.000Z' }
    expect(isTaskReminderDue(completed, new Date(2026, 6, 21, 18, 50))).toBe(false)
    expect(isTaskReminderDue({ ...completed, completedAt: undefined }, new Date(2026, 6, 22, 18, 50))).toBe(false)
  })
})
