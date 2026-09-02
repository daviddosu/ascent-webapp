-- Graduate-application-only product boundary.
-- Remove the original productivity, social, visibility, and travel support
-- that is no longer part of the application workspace.

drop function if exists public.can_read_planner_task(uuid, text);
drop function if exists public.creator_directory(text);
drop function if exists public.get_creator_today(text);
drop function if exists public.creator_today(uuid);
drop function if exists public.completion_alert_feed(timestamptz);
drop function if exists public.complete_demo_flight_handoff(uuid, jsonb, bigint);
drop function if exists public.record_shotcount_completion();
drop function if exists public.claim_push_delivery(text, text, uuid, uuid, integer);
drop function if exists public.finish_push_delivery(text, text, uuid, uuid, uuid, boolean, boolean, text);

drop trigger if exists record_shotcount_completion on public.planner_records;
drop function if exists public.enforce_planner_task_visibility();

drop table if exists public.push_deliveries cascade;
drop table if exists public.completion_events cascade;

alter table public.notification_preferences
  drop column if exists completion_alerts;

alter table public.planner_records
  drop constraint if exists planner_records_record_type_check,
  drop column if exists visibility,
  add constraint planner_records_record_type_check
    check (record_type in ('workspace', 'task', 'subtask'));

alter table public.tasks
  drop column if exists goal_id,
  drop column if exists list_id,
  drop column if exists visibility;

alter table public.profiles
  drop constraint if exists profiles_username_check,
  drop constraint if exists profiles_bio_check,
  drop constraint if exists profiles_default_task_visibility_check,
  drop constraint if exists profiles_completed_fields_check,
  drop column if exists username,
  drop column if exists bio,
  drop column if exists default_task_visibility,
  drop column if exists onboarding_completed;

drop table if exists public.follows cascade;
drop table if exists public.muted_creators cascade;
drop table if exists public.reactions cascade;
drop table if exists public.shared_updates cascade;
drop table if exists public.accountability_invites cascade;
drop table if exists public.connections cascade;
drop table if exists public.daily_reviews cascade;
drop table if exists public.reviews cascade;
drop table if exists public.task_tags cascade;
drop table if exists public.tags cascade;
drop table if exists public.lists cascade;
drop table if exists public.milestones cascade;
drop table if exists public.goals cascade;

create function public.claim_push_delivery(
  p_kind text,
  p_delivery_key text,
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
  if p_subscription_id is null or p_kind <> 'scheduled' or coalesce(p_delivery_key, '') = '' then return null; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'scheduled:' || p_delivery_key || ':' || p_subscription_id::text, 0
  ));

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
  return inserted_token;
end;
$$;

create function public.finish_push_delivery(
  p_kind text,
  p_delivery_key text,
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
  if p_claim_token is null or p_kind <> 'scheduled' then return false; end if;

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
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.claim_push_delivery(text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_push_delivery(text, text, uuid, uuid, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_push_delivery(text, text, uuid, integer) to service_role;
grant execute on function public.finish_push_delivery(text, text, uuid, uuid, boolean, boolean, text) to service_role;
