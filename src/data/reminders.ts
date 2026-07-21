import type { Task } from './planner-model'

export const DEFAULT_TASK_REMINDER_MINUTES = 15
export const TOMORROW_PLANNING_HOUR = 18
export const TOMORROW_PLANNING_MINUTE = 30

export function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function taskReminderDeliveryKey(task: Task) {
  return `${task.id}:${task.due ?? ''}:${task.time ?? ''}:${task.reminder ?? DEFAULT_TASK_REMINDER_MINUTES}`
}

export function taskReminderAt(task: Task) {
  if (!task.due || !task.time || task.completedAt) return null
  const dueAt = new Date(`${task.due}T${task.time}:00`)
  if (Number.isNaN(dueAt.getTime())) return null
  return new Date(dueAt.getTime() - (task.reminder ?? DEFAULT_TASK_REMINDER_MINUTES) * 60_000)
}

export function isTaskReminderDue(task: Task, reference = new Date()) {
  const reminderAt = taskReminderAt(task)
  if (!reminderAt || task.due !== localDateKey(reference)) return false
  const dueAt = new Date(`${task.due}T${task.time}:00`)
  return reference >= reminderAt && reference.getTime() <= dueAt.getTime() + 60 * 60_000
}

export function shouldPromptForTomorrow(reference = new Date(), lastPromptDate = '') {
  const today = localDateKey(reference)
  const minutes = reference.getHours() * 60 + reference.getMinutes()
  return lastPromptDate !== today && minutes >= TOMORROW_PLANNING_HOUR * 60 + TOMORROW_PLANNING_MINUTE
}

export function nextTomorrowPlanningTime(reference = new Date()) {
  const next = new Date(reference)
  next.setHours(TOMORROW_PLANNING_HOUR, TOMORROW_PLANNING_MINUTE, 0, 0)
  if (next <= reference) next.setDate(next.getDate() + 1)
  return next
}
