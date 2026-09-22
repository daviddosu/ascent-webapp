-- The preceding duplicate-run migration selected by last update time. A
-- resumed older checkpoint can be updated after a newer run is created, so
-- the canonical run must instead be the newest created application run.
with repairs as (
  select newer.id as restore_id, older.id as superseded_id
  from public.agent_runs newer
  join public.agent_runs older
    on older.id::text = newer.context->>'superseded_by_run_id'
  where newer.status = 'cancelled'
    and newer.error_code = 'duplicate_run_reconciled'
    and newer.application_state is not null
    and newer.created_at > older.created_at
)
update public.agent_runs as older
set
  status = 'cancelled',
  cancelled_at = coalesce(older.cancelled_at, now()),
  waiting_reason = 'Superseded by the newer canonical application run during duplicate-run reconciliation.',
  retryable = false,
  lease_owner = null,
  lease_expires_at = null,
  error_code = 'duplicate_run_reconciled',
  context = older.context || jsonb_build_object(
    'duplicate_run_reconciled_at', now(),
    'superseded_by_run_id', repairs.restore_id,
    'duplicate_run_reconciled_role', 'superseded_older_run'
  )
from repairs
where older.id = repairs.superseded_id;

with repairs as (
  select newer.id as restore_id, older.id as superseded_id
  from public.agent_runs newer
  join public.agent_runs older
    on older.id::text = newer.context->>'superseded_by_run_id'
  where newer.status = 'cancelled'
    and newer.error_code = 'duplicate_run_reconciled'
    and newer.application_state is not null
    and newer.created_at > older.created_at
)
update public.agent_runs as newer
set
  status = case
    when nullif(newer.context->>'superseded_error_code', '') is not null then 'needs_context'
    else 'planning'
  end,
  cancelled_at = null,
  waiting_reason = case
    when nullif(newer.context->>'superseded_error_code', '') is not null
      then 'Review the current application question and continue from the latest canonical checkpoint.'
    else ''
  end,
  error_code = nullif(newer.context->>'superseded_error_code', ''),
  retryable = true,
  lease_owner = null,
  lease_expires_at = null,
  context = newer.context || jsonb_build_object(
    'duplicate_run_reconciled_at', now(),
    'duplicate_run_reconciled_role', 'canonical_newer_run_restored',
    'canonical_restored_from_run_id', repairs.superseded_id
  )
from repairs
where newer.id = repairs.restore_id;
