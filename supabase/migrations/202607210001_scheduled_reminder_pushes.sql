-- One row per device prevents duplicate scheduled pushes when the cron job retries.
create table if not exists public.scheduled_push_deliveries (
  delivery_key text not null check (char_length(delivery_key) between 1 and 500),
  push_subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (delivery_key, push_subscription_id)
);

create index if not exists scheduled_push_deliveries_delivered_at_idx
  on public.scheduled_push_deliveries (delivered_at desc);

alter table public.scheduled_push_deliveries enable row level security;

-- Delivery receipts are server-only. They make scheduled retries safe.
revoke all on public.scheduled_push_deliveries from anon, authenticated;
