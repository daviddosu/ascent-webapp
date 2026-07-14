import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlannerRepository, SyncState, SyncStatus } from './contracts'
import {
  goalCloudFields,
  normalizeGoal,
  normalizeTask,
  normalizeTaskVisibility,
  subtaskCloudFields,
  taskCloudFields,
  type Goal,
  type PlannerWorkspace,
  type Subtask,
  type Task,
} from './planner-model'

export type PlannerRecordType = 'workspace' | 'task' | 'goal' | 'subtask'

export type PlannerRecord = {
  user_id: string
  record_type: PlannerRecordType
  record_id: string
  parent_id: string | null
  visibility?: 'private' | 'followers' | 'public'
  data: Record<string, unknown>
  field_versions: Record<string, string>
  deleted_at: string | null
  revision: number
  created_at: string
  updated_at: string
}

export type PlannerMutation = {
  operationId: string
  recordType: PlannerRecordType
  recordId: string
  parentId: string | null
  patch: Record<string, unknown>
  fieldVersions: Record<string, string>
  deletedAt: string | null
}

export interface PlannerCloudAdapter {
  listRecords(userId: string): Promise<PlannerRecord[]>
  mergeRecord(userId: string, mutation: PlannerMutation): Promise<PlannerRecord>
  loadLegacyWorkspace?(userId: string): Promise<PlannerWorkspace | null>
  subscribe?(userId: string, onChange: () => void): () => void
}

type PlannerCache = {
  version: 1
  records: PlannerRecord[]
  pending: PlannerMutation[]
}

type DesiredRecord = {
  recordType: PlannerRecordType
  recordId: string
  parentId: string | null
  data: Record<string, unknown>
}

type PlannerSyncOptions = {
  userId: string
  storage: Storage
  adapter: PlannerCloudAdapter
  onWorkspace?: (workspace: PlannerWorkspace) => void
  onState?: (state: SyncState) => void
  isOnline?: () => boolean
  now?: () => string
}

const cachePrefix = 'shotcount-workspace-cloud-v1:'
const syncedFields = new Set<string>([
  ...taskCloudFields,
  ...goalCloudFields,
  ...subtaskCloudFields,
])

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function valuesEqual(first: unknown, second: unknown) {
  return JSON.stringify(first ?? null) === JSON.stringify(second ?? null)
}

function operationId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function recordKey(type: PlannerRecordType, id: string) {
  return `${type}:${id}`
}

function taskData(task: Task, now: string): Record<string, unknown> {
  const normalized = normalizeTask(task, now)
  return {
    title: normalized.title,
    description: normalized.description ?? '',
    goalId: normalized.goalId ?? null,
    due: normalized.due ?? null,
    time: normalized.time ?? null,
    duration: normalized.duration ?? null,
    kind: normalized.kind ?? 'task',
    recurrence: normalized.recurrence ?? 'none',
    reminder: normalized.reminder ?? null,
    location: normalized.location ?? null,
    attendees: normalized.attendees ?? null,
    visibility: normalized.visibility ?? 'private',
    completedAt: normalized.completedAt ?? null,
    createdAt: normalized.createdAt,
  }
}

function desiredRecords(workspace: PlannerWorkspace, now: string): DesiredRecord[] {
  const records: DesiredRecord[] = [{
    recordType: 'workspace',
    recordId: 'current',
    parentId: null,
    data: { schemaVersion: 1 },
  }]

  for (const goalValue of workspace.goals) {
    const goal = normalizeGoal(goalValue, now)
    records.push({
      recordType: 'goal',
      recordId: goal.id,
      parentId: null,
      data: { name: goal.name, color: goal.color, createdAt: goal.createdAt },
    })
  }

  for (const taskValue of workspace.tasks) {
    const task = normalizeTask(taskValue, now)
    records.push({ recordType: 'task', recordId: task.id, parentId: null, data: taskData(task, now) })

    for (const subtaskValue of task.subtaskItems ?? []) {
      const subtask: Subtask = {
        ...subtaskValue,
        createdAt: subtaskValue.createdAt ?? task.createdAt ?? now,
      }
      records.push({
        recordType: 'subtask',
        recordId: subtask.id,
        parentId: task.id,
        data: {
          title: subtask.title,
          completed: subtask.completed,
          createdAt: subtask.createdAt,
        },
      })
    }
  }

  return records
}

function active(records: PlannerRecord[], type: PlannerRecordType) {
  return records.filter(record => record.record_type === type && !record.deleted_at)
}

export function workspaceFromRecords(records: PlannerRecord[]): PlannerWorkspace {
  const goalRecords = active(records, 'goal')
  const taskRecords = active(records, 'task')
  const subtaskRecords = active(records, 'subtask')

  const goals: Goal[] = goalRecords.map(record => normalizeGoal({
    id: record.record_id,
    name: String(record.data.name ?? ''),
    color: String(record.data.color ?? '#78a7ff'),
    createdAt: String(record.data.createdAt ?? record.created_at),
    updatedAt: record.updated_at,
  })).sort((first, second) => (first.createdAt ?? '').localeCompare(second.createdAt ?? ''))

  const tasks: Task[] = taskRecords.map(record => normalizeTask({
    id: record.record_id,
    title: String(record.data.title ?? ''),
    description: String(record.data.description ?? ''),
    goalId: typeof record.data.goalId === 'string' ? record.data.goalId : undefined,
    due: typeof record.data.due === 'string' ? record.data.due : undefined,
    time: typeof record.data.time === 'string' ? record.data.time : undefined,
    duration: typeof record.data.duration === 'number' ? record.data.duration : undefined,
    kind: record.data.kind === 'event' ? 'event' : 'task',
    recurrence: record.data.recurrence === 'daily' || record.data.recurrence === 'weekdays' || record.data.recurrence === 'weekly' || record.data.recurrence === 'monthly'
      ? record.data.recurrence
      : 'none',
    reminder: typeof record.data.reminder === 'number' ? record.data.reminder : undefined,
    location: typeof record.data.location === 'string' ? record.data.location : undefined,
    attendees: typeof record.data.attendees === 'string' ? record.data.attendees : undefined,
    visibility: normalizeTaskVisibility(record.visibility ?? record.data.visibility),
    completedAt: typeof record.data.completedAt === 'string' ? record.data.completedAt : undefined,
    createdAt: String(record.data.createdAt ?? record.created_at),
    updatedAt: record.updated_at,
    subtaskItems: subtaskRecords
      .filter(subtask => subtask.parent_id === record.record_id)
      .sort((first, second) => first.created_at.localeCompare(second.created_at))
      .map(subtask => ({
        id: subtask.record_id,
        title: String(subtask.data.title ?? ''),
        completed: Boolean(subtask.data.completed),
        createdAt: String(subtask.data.createdAt ?? subtask.created_at),
        updatedAt: subtask.updated_at,
      })),
  })).sort((first, second) => (second.createdAt ?? '').localeCompare(first.createdAt ?? ''))

  return { tasks, goals }
}

function applyMutation(records: PlannerRecord[], mutation: PlannerMutation, userId: string, now: string) {
  const index = records.findIndex(record => record.record_type === mutation.recordType && record.record_id === mutation.recordId)
  const previous = index >= 0 ? records[index]! : null
  const next: PlannerRecord = previous ? clone(previous) : {
    user_id: userId,
    record_type: mutation.recordType,
    record_id: mutation.recordId,
    parent_id: mutation.parentId,
    visibility: 'private',
    data: {},
    field_versions: {},
    deleted_at: null,
    revision: 0,
    created_at: now,
    updated_at: now,
  }

  for (const [field, incomingVersion] of Object.entries(mutation.fieldVersions)) {
    if (field === '_deleted' || !(field in mutation.patch)) continue
    const currentVersion = next.field_versions[field]
    if (!currentVersion || incomingVersion >= currentVersion) {
      next.data[field] = clone(mutation.patch[field])
      next.field_versions[field] = incomingVersion
    }
  }
  if (mutation.recordType === 'task') {
    next.visibility = normalizeTaskVisibility(next.data.visibility)
  }
  const deleteVersion = mutation.fieldVersions._deleted
  if (deleteVersion && (!next.field_versions._deleted || deleteVersion >= next.field_versions._deleted)) {
    next.deleted_at = mutation.deletedAt
    next.field_versions._deleted = deleteVersion
  }
  next.parent_id = mutation.parentId ?? next.parent_id
  next.updated_at = now
  next.revision += 1
  if (index >= 0) records[index] = next
  else records.push(next)
}

export class CloudPlannerRepository implements PlannerRepository {
  private readonly options: PlannerSyncOptions
  private readonly cacheKey: string
  private records: PlannerRecord[] = []
  private pending: PlannerMutation[] = []
  private unsubscribe: (() => void) | null = null
  private state: SyncState = { status: 'loading', message: 'Loading your workspace…', pending: 0 }
  private syncing: Promise<void> | null = null

  constructor(options: PlannerSyncOptions) {
    this.options = options
    this.cacheKey = `${cachePrefix}${options.userId}`
  }

  private online() {
    return this.options.isOnline?.() ?? (typeof navigator === 'undefined' || navigator.onLine)
  }

  private timestamp() {
    return this.options.now?.() ?? new Date().toISOString()
  }

  private setState(status: SyncStatus, message: string) {
    this.state = { status, message, pending: this.pending.length }
    this.options.onState?.(this.state)
  }

  private notifyWorkspace() {
    this.options.onWorkspace?.(workspaceFromRecords(this.records))
  }

  private readCache() {
    try {
      const raw = this.options.storage.getItem(this.cacheKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<PlannerCache>
      if (parsed.version !== 1 || !Array.isArray(parsed.records) || !Array.isArray(parsed.pending)) return
      this.records = parsed.records
      this.pending = parsed.pending
    } catch {
      // A broken backup is ignored; the cloud copy can rebuild it.
    }
  }

  private writeCache() {
    try {
      const cache: PlannerCache = { version: 1, records: this.records, pending: this.pending }
      this.options.storage.setItem(this.cacheKey, JSON.stringify(cache))
    } catch {
      // The live planner can still work when browser storage is blocked.
    }
  }

  private queueWorkspace(workspace: PlannerWorkspace) {
    const timestamp = this.timestamp()
    const desired = desiredRecords(workspace, timestamp)
    const desiredByKey = new Map(desired.map(record => [recordKey(record.recordType, record.recordId), record]))
    const existingByKey = new Map(this.records.map(record => [recordKey(record.record_type, record.record_id), record]))
    const mutations: PlannerMutation[] = []

    for (const item of desired) {
      const previous = existingByKey.get(recordKey(item.recordType, item.recordId))
      const patch: Record<string, unknown> = {}
      const fieldVersions: Record<string, string> = {}
      for (const [field, value] of Object.entries(item.data)) {
        if (!syncedFields.has(field) && item.recordType !== 'workspace') continue
        if (!previous || previous.deleted_at || !valuesEqual(previous.data[field], value)) {
          patch[field] = value
          fieldVersions[field] = timestamp
        }
      }
      if (!previous || previous.deleted_at) fieldVersions._deleted = timestamp
      if (Object.keys(fieldVersions).length) {
        mutations.push({
          operationId: operationId(),
          recordType: item.recordType,
          recordId: item.recordId,
          parentId: item.parentId,
          patch,
          fieldVersions,
          deletedAt: null,
        })
      }
    }

    for (const previous of this.records) {
      const key = recordKey(previous.record_type, previous.record_id)
      if (previous.deleted_at || desiredByKey.has(key)) continue
      mutations.push({
        operationId: operationId(),
        recordType: previous.record_type,
        recordId: previous.record_id,
        parentId: previous.parent_id,
        patch: {},
        fieldVersions: { _deleted: timestamp },
        deletedAt: timestamp,
      })
    }

    for (const mutation of mutations) {
      applyMutation(this.records, mutation, this.options.userId, timestamp)
      this.pending.push(mutation)
    }
    this.writeCache()
  }

  async initialize(localFallback: PlannerWorkspace) {
    this.setState('loading', 'Loading your workspace…')
    this.readCache()

    if (!this.online()) {
      if (!this.records.length) this.queueWorkspace(localFallback)
      this.setState('offline', 'Offline — changes stay on this device')
      this.notifyWorkspace()
      return workspaceFromRecords(this.records)
    }

    try {
      if (this.pending.length) await this.flushPending()
      const remote = await this.options.adapter.listRecords(this.options.userId)
      const initialized = remote.some(record => record.record_type === 'workspace' && !record.deleted_at)
      if (initialized) {
        this.records = remote
        this.pending = []
      } else {
        const legacy = await this.options.adapter.loadLegacyWorkspace?.(this.options.userId)
        const seed = legacy && (legacy.tasks.length || legacy.goals.length) ? legacy : localFallback
        this.records = []
        this.pending = []
        this.queueWorkspace(seed)
        await this.flushPending()
      }
      this.writeCache()
      this.setState('saved', 'Saved to cloud')
      this.notifyWorkspace()
      this.unsubscribe = this.options.adapter.subscribe?.(this.options.userId, () => {
        void this.refresh()
      }) ?? null
      return workspaceFromRecords(this.records)
    } catch (error) {
      if (!this.records.length) this.queueWorkspace(localFallback)
      this.writeCache()
      this.setState('failed', error instanceof Error ? error.message : 'Cloud save failed')
      this.notifyWorkspace()
      return workspaceFromRecords(this.records)
    }
  }

  save(workspace: PlannerWorkspace) {
    this.queueWorkspace(workspace)
    if (!this.pending.length) return
    if (!this.online()) {
      this.setState('offline', 'Offline — changes stay on this device')
      return
    }
    this.setState('saving', 'Saving…')
    void this.syncNow()
  }

  private async flushPending() {
    while (this.pending.length) {
      const mutation = this.pending[0]!
      const merged = await this.options.adapter.mergeRecord(this.options.userId, mutation)
      const index = this.records.findIndex(record => record.record_type === merged.record_type && record.record_id === merged.record_id)
      if (index >= 0) this.records[index] = merged
      else this.records.push(merged)
      this.pending.shift()
      this.writeCache()
    }
  }

  async syncNow() {
    if (this.syncing) return this.syncing
    this.syncing = (async () => {
      if (!this.online()) {
        this.setState('offline', 'Offline — changes stay on this device')
        return
      }
      try {
        if (this.pending.length) this.setState('saving', 'Saving…')
        await this.flushPending()
        this.records = await this.options.adapter.listRecords(this.options.userId)
        this.writeCache()
        this.setState('saved', 'Saved to cloud')
        this.notifyWorkspace()
      } catch (error) {
        this.writeCache()
        this.setState('failed', error instanceof Error ? error.message : 'Cloud save failed')
      }
    })().finally(() => {
      this.syncing = null
    })
    return this.syncing
  }

  async refresh() {
    await this.syncNow()
    return workspaceFromRecords(this.records)
  }

  destroy() {
    this.unsubscribe?.()
    this.unsubscribe = null
  }
}

function throwResultError(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message)
}

export function createSupabasePlannerAdapter(client: SupabaseClient): PlannerCloudAdapter {
  return {
    async listRecords(userId) {
      const result = await client.from('planner_records').select('*').eq('user_id', userId)
      throwResultError(result)
      return (result.data ?? []) as PlannerRecord[]
    },

    async mergeRecord(_userId, mutation) {
      const result = await client.rpc('merge_planner_record', {
        p_record_type: mutation.recordType,
        p_record_id: mutation.recordId,
        p_parent_id: mutation.parentId,
        p_patch: mutation.patch,
        p_field_versions: mutation.fieldVersions,
        p_deleted_at: mutation.deletedAt,
      })
      throwResultError(result)
      if (!result.data) throw new Error('Supabase returned no planner record.')
      return result.data as PlannerRecord
    },

    async loadLegacyWorkspace(userId) {
      const [tasksResult, goalsResult, subtasksResult] = await Promise.all([
        client.from('tasks').select('*').eq('user_id', userId).is('archived_at', null),
        client.from('goals').select('*').eq('user_id', userId),
        client.from('subtasks').select('*').eq('user_id', userId),
      ])
      ;[tasksResult, goalsResult, subtasksResult].forEach(throwResultError)
      const rows = (tasksResult.data ?? []) as Array<Record<string, unknown>>
      const goalRows = (goalsResult.data ?? []) as Array<Record<string, unknown>>
      if (!rows.length && !goalRows.length) return null
      const subtaskRows = (subtasksResult.data ?? []) as Array<Record<string, unknown>>
      return {
        goals: goalRows.map(row => normalizeGoal({
          id: String(row.id),
          name: String(row.title ?? ''),
          color: String(row.color ?? '#78a7ff'),
          createdAt: String(row.created_at ?? new Date().toISOString()),
          updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
        })),
        tasks: rows.map(row => normalizeTask({
          id: String(row.id),
          title: String(row.title ?? ''),
          description: String(row.description ?? ''),
          goalId: typeof row.goal_id === 'string' ? row.goal_id : undefined,
          due: typeof row.due_date === 'string' ? row.due_date : undefined,
          time: typeof row.due_time === 'string' ? row.due_time.slice(0, 5) : undefined,
          recurrence: row.recurrence === 'daily' || row.recurrence === 'weekly' ? row.recurrence : 'none',
          visibility: normalizeTaskVisibility(row.visibility),
          completedAt: typeof row.completed_at === 'string' ? row.completed_at : undefined,
          createdAt: String(row.created_at ?? new Date().toISOString()),
          updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
          subtaskItems: subtaskRows
            .filter(subtask => subtask.task_id === row.id)
            .map(subtask => ({
              id: String(subtask.id),
              title: String(subtask.title ?? ''),
              completed: Boolean(subtask.completed_at),
              createdAt: String(subtask.created_at ?? new Date().toISOString()),
              updatedAt: String(subtask.updated_at ?? subtask.created_at ?? new Date().toISOString()),
            })),
        })),
      }
    },

    subscribe(userId, onChange) {
      const channel = client
        .channel(`planner:${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'planner_records',
          filter: `user_id=eq.${userId}`,
        }, onChange)
        .subscribe()
      return () => {
        void client.removeChannel(channel)
      }
    },
  }
}
