import { describe, expect, it } from 'vitest'
import { CloudPlannerRepository, type PlannerCloudAdapter, type PlannerMutation, type PlannerRecord } from './sync'
import type { PlannerWorkspace } from './planner-model'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

class MemoryCloud implements PlannerCloudAdapter {
  records: PlannerRecord[] = []

  async listRecords(userId: string) {
    return copy(this.records.filter(record => record.user_id === userId))
  }

  async mergeRecord(userId: string, mutation: PlannerMutation) {
    let record = this.records.find(item =>
      item.user_id === userId && item.record_type === mutation.recordType && item.record_id === mutation.recordId)
    const now = Object.values(mutation.fieldVersions).sort().at(-1) ?? new Date().toISOString()
    if (!record) {
      record = {
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
      this.records.push(record)
    }
    for (const [field, version] of Object.entries(mutation.fieldVersions)) {
      if (field === '_deleted' || !(field in mutation.patch)) continue
      if (!record.field_versions[field] || version >= record.field_versions[field]) {
        record.data[field] = copy(mutation.patch[field])
        record.field_versions[field] = version
      }
    }
    if (mutation.recordType === 'task') {
      record.visibility = record.data.visibility === 'followers' || record.data.visibility === 'public'
        ? record.data.visibility
        : 'private'
    }
    const deleteVersion = mutation.fieldVersions._deleted
    if (deleteVersion && (!record.field_versions._deleted || deleteVersion >= record.field_versions._deleted)) {
      record.deleted_at = mutation.deletedAt
      record.field_versions._deleted = deleteVersion
    }
    record.parent_id = mutation.parentId ?? record.parent_id
    record.revision += 1
    record.updated_at = now
    return copy(record)
  }
}

function clock(start: number) {
  let tick = start
  return () => new Date(tick++).toISOString()
}

function workspace(title = 'First task'): PlannerWorkspace {
  return {
    goals: [{ id: 'goal-1', name: 'Ship it', color: '#2878ff' }],
    tasks: [{
      id: 'task-1',
      title,
      description: '',
      due: '2026-07-14',
      visibility: 'private',
      subtaskItems: [{ id: 'subtask-1', title: 'Small step', completed: false }],
    }],
  }
}

describe('cloud planner repository', () => {
  it('seeds a new account and keeps a user-scoped offline backup', async () => {
    const cloud = new MemoryCloud()
    const storage = new MemoryStorage()
    let state = ''
    const repository = new CloudPlannerRepository({
      userId: 'new-user',
      storage,
      adapter: cloud,
      now: clock(Date.UTC(2026, 6, 14)),
      isOnline: () => true,
      onState: value => { state = value.status },
    })

    const loaded = await repository.initialize(workspace())

    expect(loaded.tasks[0]?.title).toBe('First task')
    expect(cloud.records.some(record => record.record_type === 'workspace')).toBe(true)
    expect(cloud.records.some(record => record.record_type === 'task')).toBe(true)
    expect(storage.getItem('shotcount-workspace-cloud-v1:new-user')).toContain('First task')
    expect(state).toBe('saved')
  })

  it('loads a returning account from cloud instead of another local workspace', async () => {
    const cloud = new MemoryCloud()
    const first = new CloudPlannerRepository({
      userId: 'returning-user',
      storage: new MemoryStorage(),
      adapter: cloud,
      now: clock(Date.UTC(2026, 6, 14)),
      isOnline: () => true,
    })
    await first.initialize(workspace('Cloud task'))

    const returning = new CloudPlannerRepository({
      userId: 'returning-user',
      storage: new MemoryStorage(),
      adapter: cloud,
      now: clock(Date.UTC(2026, 6, 15)),
      isOnline: () => true,
    })
    const loaded = await returning.initialize(workspace('Wrong browser task'))

    expect(loaded.tasks.map(task => task.title)).toEqual(['Cloud task'])
  })

  it('merges different fields changed on two devices', async () => {
    const cloud = new MemoryCloud()
    const deviceA = new CloudPlannerRepository({
      userId: 'shared-user', storage: new MemoryStorage(), adapter: cloud,
      now: clock(Date.UTC(2026, 6, 14, 10)), isOnline: () => true,
    })
    await deviceA.initialize(workspace())
    const deviceB = new CloudPlannerRepository({
      userId: 'shared-user', storage: new MemoryStorage(), adapter: cloud,
      now: clock(Date.UTC(2026, 6, 14, 11)), isOnline: () => true,
    })
    const workspaceA = await deviceA.refresh()
    const workspaceB = await deviceB.initialize(workspace('ignored'))

    workspaceA.tasks[0]!.title = 'Title from phone'
    deviceA.save(workspaceA)
    await deviceA.syncNow()

    workspaceB.tasks[0]!.due = '2026-07-20'
    deviceB.save(workspaceB)
    await deviceB.syncNow()

    const merged = await deviceA.refresh()
    expect(merged.tasks[0]).toMatchObject({ title: 'Title from phone', due: '2026-07-20' })
  })

  it('keeps a visibility change and subtasks added independently on two devices', async () => {
    const cloud = new MemoryCloud()
    const deviceA = new CloudPlannerRepository({
      userId: 'items-user', storage: new MemoryStorage(), adapter: cloud,
      now: clock(Date.UTC(2026, 6, 14, 12)), isOnline: () => true,
    })
    await deviceA.initialize(workspace())
    const deviceB = new CloudPlannerRepository({
      userId: 'items-user', storage: new MemoryStorage(), adapter: cloud,
      now: clock(Date.UTC(2026, 6, 14, 13)), isOnline: () => true,
    })
    const a = await deviceA.refresh()
    const b = await deviceB.initialize(workspace('ignored'))

    a.tasks[0]!.visibility = 'public'
    a.tasks[0]!.subtaskItems!.push({ id: 'subtask-phone', title: 'Phone step', completed: false })
    deviceA.save(a)
    await deviceA.syncNow()

    b.tasks[0]!.subtaskItems!.push({ id: 'subtask-laptop', title: 'Laptop step', completed: false })
    deviceB.save(b)
    await deviceB.syncNow()

    const merged = await deviceA.refresh()
    expect(merged.tasks[0]!.visibility).toBe('public')
    expect(new Set(merged.tasks[0]!.subtaskItems!.map(item => item.title))).toEqual(
      new Set(['Small step', 'Phone step', 'Laptop step']),
    )
  })

  it('queues offline changes and sends them when the internet returns', async () => {
    const cloud = new MemoryCloud()
    const storage = new MemoryStorage()
    let online = false
    let state = ''
    const repository = new CloudPlannerRepository({
      userId: 'offline-user', storage, adapter: cloud,
      now: clock(Date.UTC(2026, 6, 14, 14)), isOnline: () => online,
      onState: value => { state = value.status },
    })
    const local = await repository.initialize(workspace())
    local.tasks[0]!.completedAt = '2026-07-14T14:30:00.000Z'
    repository.save(local)

    expect(state).toBe('offline')
    expect(cloud.records).toHaveLength(0)

    online = true
    await repository.syncNow()
    const saved = await repository.refresh()
    expect(state).toBe('saved')
    expect(saved.tasks[0]?.completedAt).toBe('2026-07-14T14:30:00.000Z')
  })
})
