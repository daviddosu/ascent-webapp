import type { PlannerWorkspace } from './planner-model'

export type SyncStatus = 'loading' | 'offline' | 'saving' | 'saved' | 'failed'

export type SyncState = {
  status: SyncStatus
  message: string
  pending: number
}

export interface PlannerRepository {
  initialize(localFallback: PlannerWorkspace): Promise<PlannerWorkspace>
  save(workspace: PlannerWorkspace): void
  syncNow(): Promise<void>
  refresh(): Promise<PlannerWorkspace>
  destroy(): void
}
