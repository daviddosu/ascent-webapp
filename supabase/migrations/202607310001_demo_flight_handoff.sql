-- A flight-search demo is complete when ShotCount has a safe booking handoff;
-- payment itself remains exclusively under the traveller's control.
create or replace function public.complete_demo_flight_handoff(
  p_run_id uuid,
  p_result jsonb,
  p_expected_version bigint
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
begin
  select * into target_run from public.agent_runs
  where id = p_run_id and version = p_expected_version
    and task_completion_policy = 'payment_handoff'
    and status in ('waiting_external', 'waiting_for_user')
  for update;
  if target_run.id is null then raise exception 'Flight run changed before its demo handoff could be completed'; end if;
  if coalesce((p_result #>> '{outcome,paymentBoundaryReached}')::boolean, false) is not true then
    raise exception 'A booking handoff is required';
  end if;
  update public.agent_runs set
    status = 'completed', result = p_result, waiting_reason = '', completed_at = completed_at_value,
    lease_owner = null, lease_expires_at = null, retryable = false,
    version = version + 1, updated_at = completed_at_value
  where id = target_run.id and version = p_expected_version
  returning * into completed_run;
  update public.planner_records set
    data = jsonb_set(data, '{completedAt}', to_jsonb(completed_at_value::text), true),
    field_versions = jsonb_set(field_versions, '{completedAt}', to_jsonb(completed_at_value::text), true),
    revision = revision + 1, updated_at = completed_at_value
  where user_id = completed_run.user_id and record_type = 'task' and record_id = completed_run.task_id and deleted_at is null;
  insert into public.agent_run_events (run_id, user_id, event_type, status, message)
  values (completed_run.id, completed_run.user_id, 'agent_completed', 'completed', 'Booking handoff ready for confirmation.');
  return completed_run;
end;
$$;

revoke all on function public.complete_demo_flight_handoff(uuid, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.complete_demo_flight_handoff(uuid, jsonb, bigint) to service_role;
