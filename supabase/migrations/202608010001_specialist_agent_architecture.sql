-- Domain-specialist metadata for the existing canonical AgentRun.
-- This migration is additive and keeps every existing run, action, approval,
-- provider identifier, and continuation row intact.

alter table public.agent_runs
  add column if not exists specialist_id text not null default 'roon',
  add column if not exists specialist_version text not null default 'roon@1',
  add column if not exists active_specialist_id text not null default 'roon',
  add column if not exists active_specialist_version text not null default 'roon@1',
  add column if not exists reasoning_model text not null default 'gpt-5.6-luna',
  add column if not exists task_contract text not null default 'communication.email',
  add column if not exists routing_source text not null default 'legacy_migration',
  add column if not exists specialist_stage_index integer not null default 0,
  add column if not exists specialist_stages jsonb not null default '[]'::jsonb,
  add column if not exists completed_effects jsonb not null default '[]'::jsonb,
  add column if not exists unsatisfied_effects jsonb not null default '[]'::jsonb;

-- Classify legacy rows from their stored objective/context. Existing provider
-- state is never rewritten; only the ownership metadata is backfilled.
with legacy as (
  select
    id,
    case
      when lower(objective || ' ' || coalesce(context ->> 'description', '')) ~*
        '(^|[^a-z0-9_])(flight|flights|fly|airfare|airline|airlines|airport|airports|itinerary|itineraries|travel booking)([^a-z0-9_]|$)'
        then 'caspian'
      when lower(objective || ' ' || coalesce(context ->> 'description', '')) ~*
        '(^|[^a-z0-9_])(apply|application|grad school|graduate school|admission|transcript|statement of purpose)([^a-z0-9_]|$)'
        then 'david'
      else 'roon'
    end as specialist_id,
    case
      when lower(objective || ' ' || coalesce(context ->> 'description', '')) ~*
        '(^|[^a-z0-9_])(flight|flights|fly|airfare|airline|airlines|airport|airports|itinerary|itineraries|travel booking)([^a-z0-9_]|$)'
        then 'travel.flight_search'
      when lower(objective || ' ' || coalesce(context ->> 'description', '')) ~*
        '(^|[^a-z0-9_])(apply|application|grad school|graduate school|admission|transcript|statement of purpose)([^a-z0-9_]|$)'
        then 'applications.planning'
      when lower(objective || ' ' || coalesce(context ->> 'description', '')) ~*
        '(^|[^a-z0-9_])(calendar|meeting|schedule|availability|appointment|invite|event)([^a-z0-9_]|$)'
        then 'communication.scheduling'
      else 'communication.email'
    end as task_contract
  from public.agent_runs
  where specialist_id = 'roon'
    and specialist_version = 'roon@1'
    and routing_source = 'legacy_migration'
)
update public.agent_runs run
set specialist_id = legacy.specialist_id,
    specialist_version = legacy.specialist_id || '@1',
    active_specialist_id = legacy.specialist_id,
    active_specialist_version = legacy.specialist_id || '@1',
    task_contract = legacy.task_contract,
    specialist_stages = jsonb_build_array(jsonb_build_object(
      'stageId', 'legacy-' || replace(legacy.task_contract, '.', '-'),
      'specialistId', legacy.specialist_id,
      'specialistVersion', legacy.specialist_id || '@1',
      'taskContract', legacy.task_contract,
      'label', case legacy.specialist_id
        when 'caspian' then 'Searching for flights'
        when 'david' then 'Preparing application state'
        else 'Continuing the task'
      end
    ))
from legacy
where run.id = legacy.id;

alter table public.agent_runs
  drop constraint if exists agent_runs_specialist_id_check,
  drop constraint if exists agent_runs_active_specialist_id_check,
  drop constraint if exists agent_runs_specialist_version_check,
  drop constraint if exists agent_runs_active_specialist_version_check,
  drop constraint if exists agent_runs_reasoning_model_check,
  drop constraint if exists agent_runs_routing_source_check,
  drop constraint if exists agent_runs_specialist_stage_index_check,
  drop constraint if exists agent_runs_specialist_stages_array_check,
  drop constraint if exists agent_runs_completed_effects_array_check,
  drop constraint if exists agent_runs_unsatisfied_effects_array_check;

alter table public.agent_runs
  add constraint agent_runs_specialist_id_check check (specialist_id in ('roon', 'caspian', 'david')),
  add constraint agent_runs_active_specialist_id_check check (active_specialist_id in ('roon', 'caspian', 'david')),
  add constraint agent_runs_specialist_version_check check (specialist_version in ('roon@1', 'caspian@1', 'david@1')),
  add constraint agent_runs_active_specialist_version_check check (active_specialist_version in ('roon@1', 'caspian@1', 'david@1')),
  add constraint agent_runs_reasoning_model_check check (reasoning_model = 'gpt-5.6-luna'),
  add constraint agent_runs_routing_source_check check (routing_source in ('deterministic', 'semantic', 'legacy_migration')),
  add constraint agent_runs_specialist_stage_index_check check (specialist_stage_index >= 0),
  add constraint agent_runs_specialist_stages_array_check check (jsonb_typeof(specialist_stages) = 'array'),
  add constraint agent_runs_completed_effects_array_check check (jsonb_typeof(completed_effects) = 'array'),
  add constraint agent_runs_unsatisfied_effects_array_check check (jsonb_typeof(unsatisfied_effects) = 'array');

alter table public.agent_actions
  add column if not exists specialist_id text,
  add column if not exists specialist_version text,
  add column if not exists task_contract text,
  add column if not exists failure_taxonomy text,
  add column if not exists recovery_attempt integer not null default 0;

update public.agent_actions action
set specialist_id = run.active_specialist_id,
    specialist_version = run.active_specialist_version,
    task_contract = run.task_contract
from public.agent_runs run
where action.run_id = run.id
  and (action.specialist_id is null or action.specialist_version is null or action.task_contract is null);

alter table public.agent_run_events
  add column if not exists specialist_id text,
  add column if not exists specialist_version text,
  add column if not exists task_contract text,
  add column if not exists failure_taxonomy text,
  add column if not exists recovery_attempt integer not null default 0;

update public.agent_run_events event
set specialist_id = run.active_specialist_id,
    specialist_version = run.active_specialist_version,
    task_contract = run.task_contract
from public.agent_runs run
where event.run_id = run.id
  and (event.specialist_id is null or event.specialist_version is null or event.task_contract is null);

create table if not exists public.agent_run_handoffs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  from_specialist_id text not null check (from_specialist_id in ('roon', 'caspian', 'david')),
  from_specialist_version text not null,
  to_specialist_id text not null check (to_specialist_id in ('roon', 'caspian', 'david')),
  to_specialist_version text not null,
  objective text not null,
  relevant_constraints jsonb not null default '{}'::jsonb check (jsonb_typeof(relevant_constraints) = 'object'),
  completed_effects jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_effects) = 'array'),
  unsatisfied_effects jsonb not null default '[]'::jsonb check (jsonb_typeof(unsatisfied_effects) = 'array'),
  provider_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(provider_evidence) = 'array'),
  approval_state text not null default '',
  next_required_stage jsonb check (next_required_stage is null or jsonb_typeof(next_required_stage) = 'object'),
  from_stage_index integer not null default 0 check (from_stage_index >= 0),
  created_at timestamptz not null default now()
);

alter table public.agent_run_handoffs
  add column if not exists from_stage_index integer not null default 0;

create index if not exists agent_run_handoffs_run_idx
  on public.agent_run_handoffs (run_id, created_at);
create unique index if not exists agent_run_handoffs_transition_idx
  on public.agent_run_handoffs (run_id, from_stage_index);

alter table public.agent_run_handoffs enable row level security;
drop policy if exists "agent handoffs are private to their owner" on public.agent_run_handoffs;
create policy "agent handoffs are private to their owner"
on public.agent_run_handoffs for select to authenticated
using ((select auth.uid()) = user_id);
grant select on public.agent_run_handoffs to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_run_handoffs'
  ) then
    alter publication supabase_realtime add table public.agent_run_handoffs;
  end if;
end
$$;
