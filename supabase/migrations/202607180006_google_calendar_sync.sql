-- Read-only copies of Google Calendar events let the existing Shotcount
-- calendar keep working offline. Only the signed-in owner can see or change
-- their copied events and sync status.

create table if not exists public.google_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_event_id text not null,
  calendar_id text not null,
  calendar_name text not null default 'Google Calendar',
  calendar_color text not null default '#4285f4',
  title text not null default '(No title)',
  start_at timestamptz,
  end_at timestamptz,
  start_date date,
  end_date date,
  all_day boolean not null default false,
  location text not null default '',
  html_link text not null default '',
  status text not null default 'confirmed',
  google_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, calendar_id, google_event_id),
  check ((all_day and start_date is not null) or (not all_day and start_at is not null))
);

create table if not exists public.google_calendar_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'idle' check (status in ('idle', 'syncing', 'synced', 'needs_permission', 'failed')),
  last_synced_at timestamptz,
  last_error text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists google_calendar_events_user_time_idx
  on public.google_calendar_events (user_id, start_at, start_date);

alter table public.google_calendar_events enable row level security;
alter table public.google_calendar_sync_state enable row level security;

drop policy if exists "google_calendar_events_owner" on public.google_calendar_events;
create policy "google_calendar_events_owner" on public.google_calendar_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "google_calendar_sync_state_owner" on public.google_calendar_sync_state;
create policy "google_calendar_sync_state_owner" on public.google_calendar_sync_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

