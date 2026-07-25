-- Enforce task completion semantics at the database boundary. Model output is
-- never sufficient evidence for a real-world Gmail or Calendar outcome.

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
  target_run public.agent_runs;
  completed_run public.agent_runs;
  completed_at_value timestamptz := now();
  provider_change_confirmed boolean := false;
begin
  if jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object' then
    raise exception 'Agent result must be a JSON object';
  end if;

  select *
  into target_run
  from public.agent_runs
  where id = p_run_id
    and version = p_expected_version
    and status in ('planning', 'running', 'waiting_external', 'waiting_for_user')
  for update;

  if target_run.id is null then
    raise exception 'Agent run changed before it could be completed';
  end if;

  if target_run.task_completion_policy = 'prepared_result' then
    if coalesce((p_result #>> '{outcome,preparedResult}')::boolean, false) is not true then
      raise exception 'A prepared result was not confirmed';
    end if;
  elsif target_run.task_completion_policy = 'external_change' then
    if coalesce((p_result #>> '{outcome,externalChangeConfirmed}')::boolean, false) is not true then
      raise exception 'The external change was not confirmed';
    end if;

    select exists (
      select 1
      from public.agent_actions action
      where action.run_id = target_run.id
        and action.user_id = target_run.user_id
        and action.status = 'succeeded'
        and nullif(action.provider_action_id, '') is not null
        and (
          (target_run.capability = 'gmail' and action.tool_name = 'gmail.send_message')
          or (
            target_run.capability in ('calendar', 'scheduling')
            and action.tool_name in (
              'calendar.create_event',
              'calendar.update_event',
              'calendar.delete_event'
            )
          )
          or (
            target_run.capability not in ('gmail', 'calendar', 'scheduling')
            and action.risk = 'external_write'
          )
        )
    )
    into provider_change_confirmed;

    if provider_change_confirmed is not true then
      raise exception 'No provider-confirmed external change exists for this task';
    end if;
  else
    raise exception 'A payment handoff cannot confirm that a purchase occurred';
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
  where id = target_run.id
    and version = p_expected_version
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
