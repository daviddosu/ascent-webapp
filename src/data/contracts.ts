export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error'

export type DataResult<T> =
  | { ok: true; data: T; sync: SyncStatus }
  | { ok: false; error: string; retryable: boolean }

/**
 * The UI talks to this boundary instead of talking directly to a database.
 * The current implementation is local-first. A Supabase implementation can
 * replace it without changing the screens or product rules.
 */
export interface ShotcountRepository<TTask, TGoal, TReview> {
  loadWorkspace(): Promise<DataResult<{ tasks: TTask[]; goals: TGoal[]; reviews: TReview[] }>>
  saveTask(task: TTask): Promise<DataResult<TTask>>
  deleteTask(id: string): Promise<DataResult<{ id: string }>>
  saveGoal(goal: TGoal): Promise<DataResult<TGoal>>
  saveReview(review: TReview): Promise<DataResult<TReview>>
}
