\set ON_ERROR_STOP on

do $$
declare
  user_one uuid := '10000000-0000-0000-0000-000000000001';
  user_two uuid := '10000000-0000-0000-0000-000000000002';
  writer_one uuid := '30000000-0000-0000-0000-000000000001';
  writer_two uuid := '30000000-0000-0000-0000-000000000002';
begin
  if (select active_assignments from public.application_writers where id = writer_one) <> 2 then
    raise exception 'existing active writer count was not repaired';
  end if;
  if (select active_assignments from public.application_writers where id = writer_two) <> 0 then
    raise exception 'terminal assignments were included in repaired writer count';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.ai_usage'::regclass) then
    raise exception 'ai_usage RLS is not enabled';
  end if;
  if has_table_privilege('anon', 'public.ai_usage', 'select') or
     has_table_privilege('authenticated', 'public.ai_usage', 'insert') then
    raise exception 'client table privileges remain on ai_usage';
  end if;
  if has_function_privilege('public', 'public.claim_ai_coach_usage(uuid)', 'execute') or
     has_function_privilege('anon', 'public.claim_ai_coach_usage(uuid)', 'execute') or
     has_function_privilege('authenticated', 'public.claim_ai_coach_usage(uuid)', 'execute') then
    raise exception 'client role can execute claim_ai_coach_usage';
  end if;
  if not has_function_privilege('service_role', 'public.claim_ai_coach_usage(uuid)', 'execute') then
    raise exception 'service_role cannot execute claim_ai_coach_usage';
  end if;
  if has_function_privilege('authenticated', 'public.claim_push_delivery(text,text,uuid,uuid,integer)', 'execute') or
     has_function_privilege('anon', 'public.finish_push_delivery(text,text,uuid,uuid,uuid,boolean,boolean,text)', 'execute') then
    raise exception 'client role can execute push outbox functions';
  end if;
  if not has_function_privilege('service_role', 'public.claim_push_delivery(text,text,uuid,uuid,integer)', 'execute') or
     not has_function_privilege('service_role', 'public.finish_push_delivery(text,text,uuid,uuid,uuid,boolean,boolean,text)', 'execute') then
    raise exception 'service role cannot use push outbox functions';
  end if;
  if (select status from public.push_deliveries where completion_event_id = '50000000-0000-0000-0000-000000000001') <> 'abandoned' or
     (select delivered_at from public.push_deliveries where completion_event_id = '50000000-0000-0000-0000-000000000001') is not null then
    raise exception 'legacy completion receipt was represented as confirmed delivery';
  end if;
  if to_regclass('public.planner_records_active_tasks_user_idx') is null then
    raise exception 'scheduled reminder partial index is missing';
  end if;
  if to_regclass('public.ai_usage_user_requested_idx') is null then
    raise exception 'AI quota lookup index is missing';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_index index_row
    where index_row.indrelid = 'public.human_assignments'::regclass
      and index_row.indisunique
  ) then
    raise exception 'human assignment idempotency index is missing';
  end if;

  insert into public.human_assignments (user_id, application_case_id, writer_id, status, idempotency_key)
  values (user_two, '20000000-0000-0000-0000-000000000002', writer_one::text, 'assigned', 'cross-owner-writer');
  if (select active_assignments from public.application_writers where id = writer_one) <> 2 then
    raise exception 'cross-owner assignment changed another user writer load';
  end if;
  delete from public.human_assignments where user_id = user_two and idempotency_key = 'cross-owner-writer';

  insert into public.human_assignments (user_id, application_case_id, writer_id, status, idempotency_key)
  values (user_one, '20000000-0000-0000-0000-000000000001', writer_one::text, 'assigned', 'state-transition');
  if (select active_assignments from public.application_writers where id = writer_one) <> 3 then
    raise exception 'assignment insert did not increment writer load';
  end if;
  update public.human_assignments set status = 'approved'
  where user_id = user_one and idempotency_key = 'state-transition';
  if (select active_assignments from public.application_writers where id = writer_one) <> 2 then
    raise exception 'terminal transition did not decrement writer load';
  end if;
  delete from public.human_assignments where user_id = user_one and idempotency_key = 'state-transition';
end;
$$;

do $$
declare
  subscription uuid := '40000000-0000-0000-0000-000000000001';
  first_claim uuid;
  reclaimed uuid;
  failure_claim uuid;
begin
  delete from public.scheduled_push_deliveries where delivery_key in ('lease-test', 'failure-test');
  first_claim := public.claim_push_delivery('scheduled', 'lease-test', null, subscription, 30);
  if first_claim is null then raise exception 'initial push lease was not claimed'; end if;
  if public.claim_push_delivery('scheduled', 'lease-test', null, subscription, 30) is not null then
    raise exception 'active push lease was claimed twice';
  end if;
  update public.scheduled_push_deliveries set claimed_at = now() - interval '31 seconds'
  where delivery_key = 'lease-test' and push_subscription_id = subscription;
  reclaimed := public.claim_push_delivery('scheduled', 'lease-test', null, subscription, 30);
  if reclaimed is null or reclaimed = first_claim then raise exception 'expired push lease was not safely reclaimed'; end if;
  if public.finish_push_delivery('scheduled', 'lease-test', null, subscription, first_claim, true, false, null) then
    raise exception 'stale claim token acknowledged delivery';
  end if;
  if not public.finish_push_delivery('scheduled', 'lease-test', null, subscription, reclaimed, true, false, null) then
    raise exception 'current claim could not acknowledge delivery';
  end if;
  if public.claim_push_delivery('scheduled', 'lease-test', null, subscription, 30) is not null then
    raise exception 'delivered push was claimed again';
  end if;

  failure_claim := public.claim_push_delivery('scheduled', 'failure-test', null, subscription, 30);
  if not public.finish_push_delivery('scheduled', 'failure-test', null, subscription, failure_claim, false, true, 'provider_timeout') then
    raise exception 'retryable push failure was not persisted';
  end if;
  if (select status from public.scheduled_push_deliveries where delivery_key = 'failure-test') <> 'pending' then
    raise exception 'retryable push failure did not return to pending';
  end if;
  if public.claim_push_delivery('scheduled', 'failure-test', null, subscription, 30) is null then
    raise exception 'retryable push failure could not be reclaimed';
  end if;
end;
$$;

begin;
insert into public.human_assignments (user_id, application_case_id, writer_id, status, idempotency_key)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'assigned', 'rolled-back');
do $$
begin
  if (select active_assignments from public.application_writers where id = '30000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'writer trigger did not participate in the insertion transaction';
  end if;
end;
$$;
rollback;

do $$
begin
  if exists (select 1 from public.human_assignments where idempotency_key = 'rolled-back') then
    raise exception 'rolled-back assignment persisted';
  end if;
  if (select active_assignments from public.application_writers where id = '30000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'writer counter did not roll back with its assignment';
  end if;
end;
$$;
