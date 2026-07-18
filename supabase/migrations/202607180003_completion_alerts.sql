-- Shotcount Island: a small in-app alert when a followed creator finishes.
-- The database only shares a creator's tasks when their visibility allows it.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completion_alerts boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

create table if not exists public.muted_creators (
  viewer_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (viewer_id, creator_id),
  check (viewer_id <> creator_id)
);

create table if not exists public.completion_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  completed_count integer not null check (completed_count > 0),
  total_count integer not null check (total_count >= completed_count),
  task_title text not null default '' check (char_length(task_title) <= 500),
  completed_at timestamptz not null default now(),
  unique (creator_id, local_date)
);

create index if not exists completion_events_recent_idx
  on public.completion_events (completed_at desc);

alter table public.completion_events
  add column if not exists task_title text not null default '';

alter table public.notification_preferences enable row level security;
alter table public.muted_creators enable row level security;
alter table public.completion_events enable row level security;

drop policy if exists "notification_preferences_own_rows" on public.notification_preferences;
create policy "notification_preferences_own_rows" on public.notification_preferences
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "muted_creators_own_rows" on public.muted_creators;
create policy "muted_creators_own_rows" on public.muted_creators
for all to authenticated
using (viewer_id = (select auth.uid()))
with check (viewer_id = (select auth.uid()));

drop policy if exists "completion_events_followed_read" on public.completion_events;
create policy "completion_events_followed_read" on public.completion_events
for select to authenticated
using (
  exists (
    select 1 from public.follows relationship
    where relationship.follower_id = (select auth.uid())
      and relationship.followed_id = completion_events.creator_id
  )
  and not exists (
    select 1 from public.muted_creators muted
    where muted.viewer_id = (select auth.uid())
      and muted.creator_id = completion_events.creator_id
  )
);

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, delete on public.muted_creators to authenticated;
grant select on public.completion_events to authenticated;

create or replace function public.record_shotcount_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_day date;
  creator_timezone text;
  task_total integer;
  unfinished_total integer;
  shared_total integer;
begin
  if new.record_type <> 'task' or new.deleted_at is not null then
    return new;
  end if;

  select case
    when exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = profile.timezone)
      then profile.timezone
    else 'UTC'
  end
  into creator_timezone
  from public.profiles profile
  where profile.id = new.user_id;
  creator_day := (now() at time zone coalesce(creator_timezone, 'UTC'))::date;

  select
    count(*),
    count(*) filter (where task.data ->> 'completedAt' is null),
    count(*) filter (where task.visibility in ('followers', 'public'))
  into task_total, unfinished_total, shared_total
  from public.planner_records task
  where task.user_id = new.user_id
    and task.record_type = 'task'
    and task.deleted_at is null
    and task.data ->> 'due' is not null
    and (task.data ->> 'due')::date <= creator_day;

  if task_total > 0 and unfinished_total = 0 and shared_total > 0 then
    insert into public.completion_events (
      creator_id, local_date, completed_count, total_count, task_title
    ) values (
      new.user_id,
      creator_day,
      shared_total,
      shared_total,
      case when new.visibility in ('followers', 'public') then left(coalesce(new.data ->> 'title', ''), 500) else '' end
    ) on conflict (creator_id, local_date) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists record_shotcount_completion on public.planner_records;
create trigger record_shotcount_completion
after insert or update of data, deleted_at, visibility on public.planner_records
for each row execute function public.record_shotcount_completion();

drop function if exists public.completion_alert_feed(timestamptz);
create function public.completion_alert_feed(p_after timestamptz)
returns table (
  id uuid,
  creator_id uuid,
  username text,
  display_name text,
  avatar_url text,
  completed_count integer,
  total_count integer,
  completed_at timestamptz,
  task_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    event.id,
    event.creator_id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    event.completed_count,
    event.total_count,
    event.completed_at,
    event.task_title
  from public.completion_events event
  join public.profiles profile on profile.id = event.creator_id
  join public.follows relationship
    on relationship.follower_id = (select auth.uid())
   and relationship.followed_id = event.creator_id
  left join public.muted_creators muted
    on muted.viewer_id = (select auth.uid())
   and muted.creator_id = event.creator_id
  left join public.notification_preferences preference
    on preference.user_id = (select auth.uid())
  where (select auth.uid()) is not null
    and event.completed_at > p_after
    and muted.creator_id is null
    and coalesce(preference.completion_alerts, true)
  order by event.completed_at;
$$;

revoke all on function public.completion_alert_feed(timestamptz) from public;
grant execute on function public.completion_alert_feed(timestamptz) to authenticated;

create or replace function public.creator_today(p_creator_id uuid)
returns table (
  id text,
  title text,
  due text,
  "time" text,
  completed_at text,
  visibility text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    task.record_id,
    task.data ->> 'title',
    task.data ->> 'due',
    coalesce(task.data ->> 'time', ''),
    coalesce(task.data ->> 'completedAt', ''),
    task.visibility
  from public.planner_records task
  join public.profiles profile on profile.id = task.user_id
  where task.user_id = p_creator_id
    and task.record_type = 'task'
    and task.deleted_at is null
    and task.data ->> 'due' is not null
    and (task.data ->> 'due')::date <= (
      now() at time zone case
        when exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = profile.timezone)
          then profile.timezone
        else 'UTC'
      end
    )::date
    and task.visibility in ('followers', 'public')
    and public.can_read_planner_task(p_creator_id, task.record_id)
  order by (task.data ->> 'completedAt' is not null), task.data ->> 'time', task.created_at;
$$;

revoke all on function public.creator_today(uuid) from public;
grant execute on function public.creator_today(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'completion_events'
  ) then
    alter publication supabase_realtime add table public.completion_events;
  end if;
end
$$;
