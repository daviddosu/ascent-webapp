-- Private Google execution credentials and resumable Gmail watches.
-- Token-bearing tables are service-role only; clients receive a safe status
-- projection through google_agent_connection_status().

create table if not exists public.agent_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  status text not null default 'connected' check (
    status in ('connected', 'needs_reauth', 'revoked', 'error')
  ),
  provider_user_id text,
  account_email text not null default '',
  scopes text[] not null default '{}',
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  last_refresh_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.agent_oauth_states (
  state_hash text primary key check (char_length(state_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  code_verifier_ciphertext text not null,
  return_to text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_email_watches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id text not null,
  contact_email text,
  sent_message_id text,
  last_history_id text,
  status text not null default 'active' check (status in ('active', 'matched', 'expired', 'cancelled', 'failed')),
  next_poll_at timestamptz not null default now(),
  last_checked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  matched_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  home_airport text,
  default_meeting_minutes integer not null default 30 check (default_meeting_minutes between 10 and 480),
  working_hours_start time not null default '09:00',
  working_hours_end time not null default '17:00',
  preferred_cabin text not null default 'economy' check (
    preferred_cabin in ('economy', 'premium_economy', 'business', 'first')
  ),
  preferred_currency text not null default 'USD' check (preferred_currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now()
);

create index if not exists agent_email_watches_due_idx
  on public.agent_email_watches (next_poll_at)
  where status = 'active';
create index if not exists agent_oauth_states_expiry_idx
  on public.agent_oauth_states (expires_at);

alter table public.agent_integrations enable row level security;
alter table public.agent_oauth_states enable row level security;
alter table public.agent_email_watches enable row level security;
alter table public.agent_user_preferences enable row level security;

-- No token-bearing table receives an authenticated policy.
revoke all on public.agent_integrations, public.agent_oauth_states, public.agent_email_watches
  from anon, authenticated;

drop policy if exists "agent preferences are private to their owner" on public.agent_user_preferences;
create policy "agent preferences are private to their owner"
on public.agent_user_preferences for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.agent_user_preferences to authenticated;

create or replace function public.google_agent_connection_status()
returns table (
  status text,
  account_email text,
  scopes text[],
  token_expires_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    integration.status,
    integration.account_email,
    integration.scopes,
    integration.token_expires_at,
    integration.updated_at
  from public.agent_integrations integration
  where integration.user_id = (select auth.uid())
    and integration.provider = 'google'
  limit 1;
$$;

revoke all on function public.google_agent_connection_status() from public, anon;
grant execute on function public.google_agent_connection_status() to authenticated;

drop trigger if exists touch_agent_integrations_updated_at on public.agent_integrations;
create trigger touch_agent_integrations_updated_at
before update on public.agent_integrations
for each row execute function public.touch_agent_updated_at();

drop trigger if exists touch_agent_email_watches_updated_at on public.agent_email_watches;
create trigger touch_agent_email_watches_updated_at
before update on public.agent_email_watches
for each row execute function public.touch_agent_updated_at();

drop trigger if exists touch_agent_user_preferences_updated_at on public.agent_user_preferences;
create trigger touch_agent_user_preferences_updated_at
before update on public.agent_user_preferences
for each row execute function public.touch_agent_updated_at();
