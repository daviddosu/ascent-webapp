-- One user can enable Shotcount alerts on several browsers and devices.

alter table public.notification_preferences
  add column if not exists web_push_enabled boolean not null default false;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

create table if not exists public.push_deliveries (
  completion_event_id uuid not null references public.completion_events(id) on delete cascade,
  push_subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (completion_event_id, push_subscription_id)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;

create policy "push_subscriptions_own_rows" on public.push_subscriptions
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Delivery receipts are server-only. They prevent the same event being sent twice.
revoke all on public.push_deliveries from anon, authenticated;
