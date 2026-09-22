-- A visual page change is not proof of a consequential application submit.
-- The orchestrator must provide the portal's durable application or
-- confirmation identity before the case can enter submitted state.

create or replace function public.record_application_submission(
  p_attempt_id uuid,
  p_application_id text,
  p_evidence jsonb
)
returns public.application_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.application_submission_attempts;
  case_row public.application_cases;
  application_identity text;
begin
  if jsonb_typeof(coalesce(p_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'Submission evidence must be an object';
  end if;
  application_identity := nullif(left(trim(coalesce(p_application_id, '')), 255), '');
  if application_identity is null then
    raise exception 'A verified portal application or confirmation ID is required';
  end if;
  if nullif(trim(coalesce(p_evidence->>'confirmation_id', '')), '') is null then
    raise exception 'A verified portal confirmation ID is required';
  end if;
  select * into attempt from public.application_submission_attempts
  where id = p_attempt_id for update;
  if attempt.id is null then raise exception 'Submission attempt is unavailable'; end if;
  if attempt.status = 'succeeded' then
    select * into case_row from public.application_cases where id = attempt.application_case_id;
    if case_row.id is null then raise exception 'Application case not found'; end if;
    return case_row;
  end if;
  if attempt.status <> 'claimed' then raise exception 'Submission attempt is unavailable or cancelled'; end if;
  update public.application_submission_attempts
  set status = 'succeeded', application_id = application_identity, evidence = p_evidence, completed_at = now()
  where id = attempt.id;
  update public.application_cases
  set status = 'submitted', current_stage = 'submitted', application_id = application_identity,
      submitted_at = now(), next_action = 'Monitor the application inbox and portal for the next update.',
      data = jsonb_set(data, '{submissionEvidence}', p_evidence, true), updated_at = now()
  where id = attempt.application_case_id
  returning * into case_row;
  if case_row.id is null then raise exception 'Application case not found'; end if;
  return case_row;
end;
$$;

revoke all on function public.record_application_submission(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_application_submission(uuid, text, jsonb) to service_role;
