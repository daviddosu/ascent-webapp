-- David Application Eval v2.1: deterministic end-to-end execution control.
--
-- This migration is additive. It preserves all v1/v2 benchmark data and all
-- existing application rows while making fact resolution, requirement edges,
-- controller state, and evidence contracts durable and inspectable.

create table if not exists public.application_fact_resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  campaign_id uuid references public.application_campaigns(id) on delete cascade,
  application_case_id uuid references public.application_cases(id) on delete cascade,
  fact_id text not null check (char_length(fact_id) between 1 and 500),
  value jsonb,
  verification text not null check (verification in ('VERIFIED','UNRESOLVED')),
  provenance jsonb,
  confidence text not null check (confidence in ('high','medium','low')),
  conflict boolean not null default false,
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, agent_run_id, fact_id)
);

alter table public.application_cases
  add column if not exists controller_state text,
  add column if not exists controller_version text,
  add column if not exists controller_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'application_cases_controller_state_check'
      and conrelid = 'public.application_cases'::regclass
  ) then
    alter table public.application_cases add constraint application_cases_controller_state_check
    check (controller_state is null or controller_state in (
      'INTAKE','PROFILE_RESOLUTION','OPPORTUNITY_RESEARCH','OPPORTUNITY_VERIFICATION',
      'SHORTLIST_APPROVAL','CASE_CREATION','DOCUMENT_PREPARATION','WRITER_EXECUTION',
      'REFEREE_EXECUTION','PROFESSOR_OUTREACH','PORTAL_ACCOUNT','PORTAL_EXECUTION',
      'READINESS_REVIEW','SUBMISSION_APPROVAL','SUBMISSION','POST_SUBMISSION','COMPLETE','BLOCKED'
    ));
  end if;
end
$$;

alter table public.application_requirements
  add column if not exists source_id text,
  add column if not exists dependency_ids text[] not null default '{}',
  add column if not exists evidence_contract jsonb not null default '{}'::jsonb;

alter table public.application_fact_resolutions enable row level security;

drop policy if exists "application fact resolutions are private" on public.application_fact_resolutions;
create policy "application fact resolutions are private" on public.application_fact_resolutions
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists application_fact_resolutions_run_idx
  on public.application_fact_resolutions (user_id, agent_run_id, verification, updated_at desc);
create index if not exists application_fact_resolutions_case_idx
  on public.application_fact_resolutions (user_id, application_case_id, fact_id)
  where application_case_id is not null;

drop trigger if exists touch_application_fact_resolutions_updated_at on public.application_fact_resolutions;
create trigger touch_application_fact_resolutions_updated_at
before update on public.application_fact_resolutions
for each row execute function public.touch_agent_updated_at();

revoke all on public.application_fact_resolutions from anon;
grant select, insert, update, delete on public.application_fact_resolutions to authenticated;
