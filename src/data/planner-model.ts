import type { Recurrence } from '../domain'

export type PlannerKind = 'task' | 'event'
export type TaskVisibility = 'private' | 'followers' | 'public'

export type Subtask = {
  id: string
  title: string
  completed: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * The one task shape used by the planner, offline backup, and cloud adapter.
 * Optional fields are kept for old local backups; normalizeTask fills them in.
 */
export type Task = {
  id: string
  title: string
  description?: string
  goalId?: string
  due?: string
  time?: string
  duration?: number
  kind?: PlannerKind
  recurrence?: Recurrence
  reminder?: number
  location?: string
  attendees?: string
  visibility?: TaskVisibility
  subtasks?: number
  subtaskItems?: Subtask[]
  completedAt?: string
  createdAt?: string
  updatedAt?: string
}

export type Goal = {
  id: string
  name: string
  color: string
  createdAt?: string
  updatedAt?: string
}

export type PlannerWorkspace = {
  tasks: Task[]
  goals: Goal[]
}

export const taskCloudFields = [
  'title',
  'description',
  'goalId',
  'due',
  'time',
  'duration',
  'kind',
  'recurrence',
  'reminder',
  'location',
  'attendees',
  'visibility',
  'completedAt',
  'createdAt',
  'updatedAt',
] as const

export const goalCloudFields = ['name', 'color', 'createdAt', 'updatedAt'] as const
export const subtaskCloudFields = ['title', 'completed', 'createdAt', 'updatedAt'] as const

export function normalizeTaskVisibility(value: unknown): TaskVisibility {
  return value === 'followers' || value === 'public' ? value : 'private'
}

export function normalizeTask(task: Task, now = new Date().toISOString()): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? '',
    goalId: task.goalId,
    due: task.due,
    time: task.time,
    duration: task.duration,
    kind: task.kind ?? 'task',
    recurrence: task.recurrence ?? 'none',
    reminder: task.reminder,
    location: task.location,
    attendees: task.attendees,
    visibility: normalizeTaskVisibility(task.visibility),
    subtasks: task.subtaskItems?.length ?? task.subtasks ?? 0,
    subtaskItems: (task.subtaskItems ?? []).map(item => ({
      ...item,
      createdAt: item.createdAt ?? task.createdAt ?? now,
      updatedAt: item.updatedAt ?? task.updatedAt ?? now,
    })),
    completedAt: task.completedAt,
    createdAt: task.createdAt ?? now,
    updatedAt: task.updatedAt ?? task.createdAt ?? now,
  }
}

export function normalizeGoal(goal: Goal, now = new Date().toISOString()): Goal {
  return {
    ...goal,
    createdAt: goal.createdAt ?? now,
    updatedAt: goal.updatedAt ?? goal.createdAt ?? now,
  }
}
