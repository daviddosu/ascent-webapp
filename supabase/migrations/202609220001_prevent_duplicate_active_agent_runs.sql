-- A graduate-application task owns one in-flight execution. Completed and
-- cancelled runs remain historical evidence, and legacy non-application runs
-- are deliberately excluded so this forward migration cannot rewrite them.
with ranked_runs as (
  select
    id,
    user_id,
    task_id,
    row_number() over (
      partition by user_id, task_id
      order by updated_at desc, created_at desc, id desc
    ) as run_rank
  from public.agent_runs
  where task_id is not null
    and application_state is not null
    and status in (
      'planning',
      'needs_context',
      'running',
      'needs_approval',
      'waiting_external',
      'waiting_for_user'
    )
), duplicate_runs as (
  select older.id, newest.id as superseding_run_id
  from ranked_runs older
  join ranked_runs newest
    on newest.user_id = older.user_id
   and newest.task_id = older.task_id
   and newest.run_rank = 1
  where older.run_rank > 1
)
update public.agent_runs as run
set
  status = 'cancelled',
  cancelled_at = coalesce(run.cancelled_at, now()),
  waiting_reason = 'Superseded by a newer canonical application run during duplicate-run reconciliation.',
  retryable = false,
  lease_owner = null,
  lease_expires_at = null,
  error_code = 'duplicate_run_reconciled',
  context = run.context || jsonb_build_object(
    'duplicate_run_reconciled_at', now(),
    'superseded_by_run_id', duplicate_runs.superseding_run_id,
    'superseded_error_code', run.error_code
  )
from duplicate_runs
where run.id = duplicate_runs.id;

create unique index if not exists agent_runs_one_nonterminal_task_idx
on public.agent_runs (user_id, task_id)
where task_id is not null
  and application_state is not null
  and status in (
    'planning',
    'needs_context',
    'running',
    'needs_approval',
    'waiting_external',
    'waiting_for_user'
  );
