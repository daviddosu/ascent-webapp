-- A graduate-application task owns one in-flight execution. Completed and
-- cancelled runs remain historical evidence, and legacy non-application runs
-- are deliberately excluded so this forward migration cannot rewrite them.
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
