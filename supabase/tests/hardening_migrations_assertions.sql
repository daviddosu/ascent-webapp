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
