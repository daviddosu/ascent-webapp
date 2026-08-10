-- AI usage is server-owned billing/rate-limit state. It must not be readable or
-- mutable through the public data API.
alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;

create or replace function public.claim_ai_coach_usage(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_id bigint;
begin
  if p_user_id is null then return null; end if;

  -- Serialize claims for one user without blocking unrelated users.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if (
    select count(*)
    from public.ai_usage
    where user_id = p_user_id
      and requested_at >= pg_catalog.now() - interval '24 hours'
  ) >= 10 then
    return null;
  end if;

  insert into public.ai_usage (user_id)
  values (p_user_id)
  returning id into usage_id;
  return usage_id;
end;
$$;

revoke all on function public.claim_ai_coach_usage(uuid) from public, anon, authenticated;
grant execute on function public.claim_ai_coach_usage(uuid) to service_role;
