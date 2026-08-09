-- One deterministic application engine; David is a bounded semantic worker.

alter table public.application_fact_resolutions
  drop constraint if exists application_fact_resolutions_verification_check;
alter table public.application_fact_resolutions
  add constraint application_fact_resolutions_verification_check
  check (verification in ('VERIFIED','UNRESOLVED','CONFLICTING'));

alter table public.application_requirements
  add column if not exists requirement_type text,
  add column if not exists retry_state jsonb not null default '{"attempts":0,"maximumAttempts":3,"lastFailure":null,"nextAttemptAt":null,"escalated":false}'::jsonb,
  add column if not exists resolution_tier integer,
  add column if not exists wait_until timestamptz;

alter table public.application_requirements
  drop constraint if exists application_requirements_resolution_tier_check;
alter table public.application_requirements
  add constraint application_requirements_resolution_tier_check
  check (resolution_tier is null or resolution_tier between 0 and 5);

alter table public.application_cases
  add column if not exists engine_version text,
  add column if not exists engine_status text,
  add column if not exists engine_updated_at timestamptz;

create table if not exists public.application_semantic_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  requirement_id uuid not null references public.application_requirements(id) on delete cascade,
  function_name text not null,
  decision text not null,
  confidence text not null check (confidence in ('high','medium','low')),
  evidence_ids text[] not null,
  fact_ids text[] not null default '{}',
  rationale text not null,
  validated boolean not null default false,
  defects text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.application_semantic_decisions enable row level security;
drop policy if exists "application semantic decisions are private" on public.application_semantic_decisions;
create policy "application semantic decisions are private" on public.application_semantic_decisions
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists application_semantic_decisions_case_idx
  on public.application_semantic_decisions (user_id, application_case_id, requirement_id, created_at desc);
revoke all on public.application_semantic_decisions from anon;
grant select, insert, update, delete on public.application_semantic_decisions to authenticated;
