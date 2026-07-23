create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid,
  status text not null check (status in ('needs_context', 'ready', 'running', 'waiting_for_user', 'completed', 'failed', 'cancelled')),
  objective text not null,
  context jsonb not null default '{}'::jsonb,
  capability text not null check (capability in ('research', 'draft', 'research_draft')),
  progress jsonb not null default '[]'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_runs enable row level security;

drop policy if exists "agent runs are private to their owner" on public.agent_runs;
create policy "agent runs are private to their owner"
on public.agent_runs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists agent_runs_user_task_idx
on public.agent_runs (user_id, task_id, created_at desc);
