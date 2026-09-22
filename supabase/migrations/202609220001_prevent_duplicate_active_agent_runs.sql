-- A task owns one in-flight execution. Completed and cancelled runs remain
-- historical evidence, while a retry or second device reconnects to the
-- existing non-terminal run instead of creating a parallel workflow.
create unique index if not exists agent_runs_one_nonterminal_task_idx
on public.agent_runs (user_id, task_id)
where task_id is not null
  and status in (
    'planning',
    'needs_context',
    'running',
    'needs_approval',
    'waiting_external',
    'waiting_for_user'
  );
