-- Keep agent completion and the planner task update atomic, and emit the
-- product event that distinguishes an agent-completed task.

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

  if p_mark_task_complete then
    insert into public.agent_run_events (
      run_id,
      user_id,
      event_type,
      status,
      message,
      metadata
    )
    values (
      completed_run.id,
      completed_run.user_id,
      'task_completed_by_agent',
      'completed',
      'ShotCount marked the task complete after confirming the intended outcome.',
      jsonb_build_object('task_id', completed_run.task_id)
    );
  end if;

  return completed_run;
end;
$$;

revoke all on function public.complete_agent_run(uuid, jsonb, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_agent_run(uuid, jsonb, bigint, boolean)
  to service_role;
