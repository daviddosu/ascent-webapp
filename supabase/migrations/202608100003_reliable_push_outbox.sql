-- Legacy receipt rows were inserted before the provider call, so they cannot
-- prove delivery. Preserve them as abandoned evidence and use leased claims
-- for every new attempt.
alter table public.push_deliveries
  alter column delivered_at drop not null,
  alter column delivered_at drop default,
  add column if not exists status text not null default 'abandoned'
    check (status in ('pending', 'sending', 'delivered', 'abandoned')),
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_error text;

alter table public.scheduled_push_deliveries
  alter column delivered_at drop not null,
  alter column delivered_at drop default,
  add column if not exists status text not null default 'abandoned'
    check (status in ('pending', 'sending', 'delivered', 'abandoned')),
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_error text;

update public.push_deliveries
set status = 'abandoned', delivered_at = null, claim_token = null, claimed_at = null
where status = 'abandoned';
update public.scheduled_push_deliveries
set status = 'abandoned', delivered_at = null, claim_token = null, claimed_at = null
where status = 'abandoned';

alter table public.push_deliveries alter column status set default 'pending';
alter table public.scheduled_push_deliveries alter column status set default 'pending';

create index if not exists push_deliveries_reclaim_idx
on public.push_deliveries (status, claimed_at)
where status in ('pending', 'sending');
create index if not exists scheduled_push_deliveries_reclaim_idx
on public.scheduled_push_deliveries (status, claimed_at)
where status in ('pending', 'sending');

create or replace function public.claim_push_delivery(
  p_kind text,
  p_delivery_key text,
  p_completion_event_id uuid,
  p_subscription_id uuid,
  p_lease_seconds integer default 120
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_token uuid := gen_random_uuid();
  inserted_token uuid;
  lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  if p_subscription_id is null or p_kind not in ('completion', 'scheduled') then return null; end if;
  if p_kind = 'completion' and p_completion_event_id is null then return null; end if;
  if p_kind = 'scheduled' and coalesce(p_delivery_key, '') = '' then return null; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_kind || ':' || coalesce(p_delivery_key, p_completion_event_id::text) || ':' || p_subscription_id::text, 0
  ));

  if p_kind = 'completion' then
    insert into public.push_deliveries (
      completion_event_id, push_subscription_id, status, claim_token, claimed_at, attempt_count, delivered_at
    ) values (
      p_completion_event_id, p_subscription_id, 'sending', next_token, pg_catalog.now(), 1, null
    ) on conflict (completion_event_id, push_subscription_id) do nothing
    returning claim_token into inserted_token;
    if inserted_token is not null then return inserted_token; end if;

    update public.push_deliveries
    set status = 'sending', claim_token = next_token, claimed_at = pg_catalog.now(),
        attempt_count = attempt_count + 1, last_error = null
    where completion_event_id = p_completion_event_id
      and push_subscription_id = p_subscription_id
      and (
        status = 'pending' or
        (status = 'sending' and claimed_at < pg_catalog.now() - pg_catalog.make_interval(secs => lease_seconds))
      )
    returning claim_token into inserted_token;
  else
    insert into public.scheduled_push_deliveries (
      delivery_key, push_subscription_id, status, claim_token, claimed_at, attempt_count, delivered_at
    ) values (
      p_delivery_key, p_subscription_id, 'sending', next_token, pg_catalog.now(), 1, null
    ) on conflict (delivery_key, push_subscription_id) do nothing
    returning claim_token into inserted_token;
    if inserted_token is not null then return inserted_token; end if;

    update public.scheduled_push_deliveries
    set status = 'sending', claim_token = next_token, claimed_at = pg_catalog.now(),
        attempt_count = attempt_count + 1, last_error = null
    where delivery_key = p_delivery_key
      and push_subscription_id = p_subscription_id
      and (
        status = 'pending' or
        (status = 'sending' and claimed_at < pg_catalog.now() - pg_catalog.make_interval(secs => lease_seconds))
      )
    returning claim_token into inserted_token;
  end if;
  return inserted_token;
end;
$$;

create or replace function public.finish_push_delivery(
  p_kind text,
  p_delivery_key text,
  p_completion_event_id uuid,
  p_subscription_id uuid,
  p_claim_token uuid,
  p_delivered boolean,
  p_retryable boolean default true,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer := 0;
begin
  if p_claim_token is null or p_kind not in ('completion', 'scheduled') then return false; end if;
  if p_kind = 'completion' then
    update public.push_deliveries
    set status = case when p_delivered then 'delivered' when p_retryable then 'pending' else 'abandoned' end,
        delivered_at = case when p_delivered then pg_catalog.now() else null end,
        claim_token = null,
        claimed_at = null,
        last_error = case when p_delivered then null else left(coalesce(p_error_code, 'push_failed'), 160) end
    where completion_event_id = p_completion_event_id
      and push_subscription_id = p_subscription_id
      and status = 'sending'
      and claim_token = p_claim_token;
  else
    update public.scheduled_push_deliveries
    set status = case when p_delivered then 'delivered' when p_retryable then 'pending' else 'abandoned' end,
        delivered_at = case when p_delivered then pg_catalog.now() else null end,
        claim_token = null,
        claimed_at = null,
        last_error = case when p_delivered then null else left(coalesce(p_error_code, 'push_failed'), 160) end
    where delivery_key = p_delivery_key
      and push_subscription_id = p_subscription_id
      and status = 'sending'
      and claim_token = p_claim_token;
  end if;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.claim_push_delivery(text, text, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_push_delivery(text, text, uuid, uuid, uuid, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_push_delivery(text, text, uuid, uuid, integer) to service_role;
grant execute on function public.finish_push_delivery(text, text, uuid, uuid, uuid, boolean, boolean, text) to service_role;
