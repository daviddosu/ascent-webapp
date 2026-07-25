-- Durable ShotCount execution foundation.
-- Public tables are private to their owner through RLS. Model continuation
-- state is service-role only and never enters the social planner records.

alter table public.agent_runs
  alter column task_id type text using task_id::text;

alter table public.agent_runs
  drop constraint if exists agent_runs_status_check,
  drop constraint if exists agent_runs_capability_check;

alter table public.agent_runs
  add column if not exists strategy text not null default 'structured',
  add column if not exists intent jsonb not null default '{}'::jsonb,
  add column if not exists plan jsonb not null default '[]'::jsonb,
  add column if not exists current_step integer not null default 0,
  add column if not exists waiting_reason text not null default '',
  add column if not exists task_completion_policy text not null default 'prepared_result',
  add column if not exists openai_response_id text,
  add column if not exists browser_session_id uuid,
  add column if not exists external_correlation_id text,
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists retryable boolean not null default true,
  add column if not exists error_code text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists version bigint not null default 1;

update public.agent_runs
set status = case status
  when 'ready' then 'planning'
  when 'waiting_for_user' then 'waiting_for_user'
  else status
end;

alter table public.agent_runs
  add constraint agent_runs_status_check check (
    status in (
      'planning',
      'needs_context',
      'running',
      'needs_approval',
      'waiting_external',
      'waiting_for_user',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  add constraint agent_runs_capability_check check (
    capability in (
      'research',
      'draft',
      'research_draft',
      'gmail',
      'calendar',
      'scheduling',
      'browser',
      'flight_search'
    )
  ),
  add constraint agent_runs_strategy_check check (
    strategy in ('structured', 'browser', 'hybrid')
  ),
  add constraint agent_runs_completion_policy_check check (
    task_completion_policy in ('prepared_result', 'external_change', 'payment_handoff')
  ),
  add constraint agent_runs_current_step_check check (current_step >= 0),
  add constraint agent_runs_attempt_count_check check (attempt_count >= 0),
  add constraint agent_runs_intent_object_check check (jsonb_typeof(intent) = 'object'),
  add constraint agent_runs_plan_array_check check (jsonb_typeof(plan) = 'array');

create index if not exists agent_runs_resumable_idx
  on public.agent_runs (status, lease_expires_at, updated_at)
  where status in ('planning', 'running', 'waiting_external');

create index if not exists agent_runs_external_correlation_idx
  on public.agent_runs (user_id, external_correlation_id)
  where external_correlation_id is not null;

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_index integer not null check (step_index >= 0),
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  model_call_id text,
  risk text not null check (risk in ('read', 'prepare', 'external_write', 'financial')),
  status text not null check (
    status in ('queued', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled')
  ),
  arguments jsonb not null default '{}'::jsonb check (jsonb_typeof(arguments) = 'object'),
  output jsonb,
  public_summary text not null default '',
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 500),
  provider_action_id text,
  error_code text,
  error_message text,
  retryable boolean not null default true,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tool_name, idempotency_key)
);

create table if not exists public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  action_id uuid not null references public.agent_actions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')
  ),
  kind text not null check (kind in ('send_email', 'calendar_write', 'browser_submit')),
  title text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null,
  version bigint not null default 1,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_id)
);

create table if not exists public.agent_run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 120),
  status text not null,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.browser_execution_sessions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (
    status in (
      'planning',
      'working',
      'needs_context',
      'needs_approval',
      'waiting_for_user',
      'waiting_external',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  allowed_domains text[] not null default '{}',
  current_domain text,
  current_url text,
  objective text not null,
  checkpoint jsonb not null default '{}'::jsonb check (jsonb_typeof(checkpoint) = 'object'),
  payment_boundary_reached boolean not null default false,
  resumable boolean not null default true,
  worker_session_id text,
  last_observed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- This table deliberately has no user policy. It stores opaque model items
-- needed to continue a tool loop and is reachable only with the service role.
create table if not exists public.agent_model_state (
  run_id uuid primary key references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response_items jsonb not null default '[]'::jsonb check (jsonb_typeof(response_items) = 'array'),
  response_id text,
  sequence_number bigint,
  updated_at timestamptz not null default now()
);

create index if not exists agent_actions_run_step_idx
  on public.agent_actions (run_id, step_index, created_at);
create index if not exists agent_approvals_user_pending_idx
  on public.agent_approvals (user_id, created_at desc)
  where status = 'pending';
create index if not exists agent_run_events_run_idx
  on public.agent_run_events (run_id, id);
create index if not exists browser_execution_sessions_resumable_idx
  on public.browser_execution_sessions (status, updated_at)
  where resumable = true and status in ('planning', 'working', 'waiting_external');

alter table public.agent_actions enable row level security;
alter table public.agent_approvals enable row level security;
alter table public.agent_run_events enable row level security;
alter table public.browser_execution_sessions enable row level security;
alter table public.agent_model_state enable row level security;

drop policy if exists "agent actions are private to their owner" on public.agent_actions;
create policy "agent actions are private to their owner"
on public.agent_actions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "agent approvals are private to their owner" on public.agent_approvals;
create policy "agent approvals are private to their owner"
on public.agent_approvals for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "agent events are private to their owner" on public.agent_run_events;
create policy "agent events are private to their owner"
on public.agent_run_events for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "browser sessions are private to their owner" on public.browser_execution_sessions;
create policy "browser sessions are private to their owner"
on public.browser_execution_sessions for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.agent_model_state from anon, authenticated;
grant select on public.agent_actions, public.agent_approvals, public.agent_run_events,
  public.browser_execution_sessions to authenticated;

create or replace function public.decide_agent_approval(
  p_approval_id uuid,
  p_decision text,
  p_expected_version bigint
)
returns public.agent_approvals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  approval public.agent_approvals;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Approval decision must be approved or rejected';
  end if;

  update public.agent_approvals
  set status = p_decision,
      decided_at = now(),
      updated_at = now(),
      version = version + 1
  where id = p_approval_id
    and user_id = (select auth.uid())
    and status = 'pending'
    and version = p_expected_version
    and (expires_at is null or expires_at > now())
  returning * into approval;

  if approval.id is null then
    raise exception 'Approval is unavailable, expired, or already decided';
  end if;

  return approval;
end;
$$;

grant execute on function public.decide_agent_approval(uuid, text, bigint) to authenticated;

create or replace function public.complete_agent_run(
  p_run_id uuid,
  p_result jsonb,
  p_expected_version bigint,
  p_mark_task_complete boolean
)
returns public.agent_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_run public.agent_runs;
  completed_at_value timestamptz := now();
begin
  if jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object' then
    raise exception 'Agent result must be a JSON object';
  end if;

  update public.agent_runs
  set status = 'completed',
      result = p_result,
      waiting_reason = '',
      completed_at = completed_at_value,
      lease_owner = null,
      lease_expires_at = null,
      retryable = false,
      version = version + 1,
      updated_at = completed_at_value
  where id = p_run_id
    and version = p_expected_version
    and status in ('planning', 'running', 'waiting_external', 'waiting_for_user')
  returning * into completed_run;

  if completed_run.id is null then
    raise exception 'Agent run changed before it could be completed';
  end if;

  if p_mark_task_complete then
    update public.planner_records
    set data = jsonb_set(data, '{completedAt}', to_jsonb(completed_at_value::text), true),
        field_versions = jsonb_set(field_versions, '{completedAt}', to_jsonb(completed_at_value::text), true),
        revision = revision + 1,
        updated_at = completed_at_value
    where user_id = completed_run.user_id
      and record_type = 'task'
      and record_id = completed_run.task_id
      and deleted_at is null;
  end if;

  insert into public.agent_run_events (run_id, user_id, event_type, status, message)
  values (
    completed_run.id,
    completed_run.user_id,
    'agent_completed',
    'completed',
    coalesce(p_result ->> 'summary', 'Roon finished the task.')
  );

  return completed_run;
end;
$$;

revoke all on function public.complete_agent_run(uuid, jsonb, bigint, boolean) from public, anon, authenticated;
grant execute on function public.complete_agent_run(uuid, jsonb, bigint, boolean) to service_role;

create or replace function public.claim_agent_run(
  p_run_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 45
)
returns public.agent_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.agent_runs;
begin
  if coalesce(p_worker_id, '') = '' or p_lease_seconds not between 10 and 300 then
    raise exception 'Invalid worker lease';
  end if;

  update public.agent_runs
  set lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      version = version + 1,
      updated_at = now()
  where id = p_run_id
    and status in ('planning', 'running')
    and (lease_expires_at is null or lease_expires_at < now() or lease_owner = p_worker_id)
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_agent_run(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_agent_run(uuid, text, integer) to service_role;

create or replace function public.touch_agent_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_agent_runs_updated_at on public.agent_runs;
create trigger touch_agent_runs_updated_at
before update on public.agent_runs
for each row execute function public.touch_agent_updated_at();

drop trigger if exists touch_agent_actions_updated_at on public.agent_actions;
create trigger touch_agent_actions_updated_at
before update on public.agent_actions
for each row execute function public.touch_agent_updated_at();

drop trigger if exists touch_agent_approvals_updated_at on public.agent_approvals;
create trigger touch_agent_approvals_updated_at
before update on public.agent_approvals
for each row execute function public.touch_agent_updated_at();

drop trigger if exists touch_browser_execution_sessions_updated_at on public.browser_execution_sessions;
create trigger touch_browser_execution_sessions_updated_at
before update on public.browser_execution_sessions
for each row execute function public.touch_agent_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_runs'
  ) then
    alter publication supabase_realtime add table public.agent_runs;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_approvals'
  ) then
    alter publication supabase_realtime add table public.agent_approvals;
  end if;
end
$$;
