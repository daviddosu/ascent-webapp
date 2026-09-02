-- Make the long-horizon task contract durable. The existing plan column is
-- retained as the canonical ordered execution graph; task_spec describes the
-- requested outcome and its effect/approval boundaries.

alter table public.agent_runs
  add column if not exists task_spec jsonb not null default '{}'::jsonb;

alter table public.agent_runs
  drop constraint if exists agent_runs_task_spec_object,
  add constraint agent_runs_task_spec_object check (jsonb_typeof(task_spec) = 'object');

create index if not exists agent_runs_task_spec_version_idx
  on public.agent_runs ((task_spec ->> 'schemaVersion'))
  where task_spec <> '{}'::jsonb;
