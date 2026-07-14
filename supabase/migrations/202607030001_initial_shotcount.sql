-- Shotcount's production data model.
-- Every personal row is protected by Postgres Row Level Security (RLS).

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  timezone text not null default 'UTC',
  dark_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  why text not null default '',
  target_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'abandoned')),
  color text not null default '#ffd439' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  completed_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#66d6d9' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  list_id uuid references public.lists(id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  due_date date,
  due_time time,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  estimate_minutes smallint not null default 25 check (estimate_minutes between 1 and 1440),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly')),
  top_three boolean not null default false,
  carried_count smallint not null default 0 check (carried_count >= 0),
  last_carry_reason text not null default '',
  position integer not null default 0,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  completed_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  color text not null default '#dff3ed' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.task_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_date date not null,
  wins text not null default '',
  blockers text not null default '',
  stop_doing text not null default '',
  continue_doing text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_date)
);

create table public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_date date not null,
  win text not null default '',
  blocker text not null default '',
  tomorrow text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_date)
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create table public.accountability_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null default '',
  token text not null unique check (char_length(token) between 24 and 128),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create table public.shared_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 500),
  created_at timestamptz not null default now(),
  check (goal_id is not null or milestone_id is not null)
);

create table public.reactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  update_id uuid not null references public.shared_updates(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (user_id, update_id, emoji)
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

-- Foreign-key and common-filter indexes keep Today, Calendar, Goals, and feeds fast.
create index goals_user_status_idx on public.goals (user_id, status);
create index milestones_goal_position_idx on public.milestones (goal_id, position);
create index milestones_user_id_idx on public.milestones (user_id);
create index lists_user_position_idx on public.lists (user_id, position);
create index tasks_user_due_open_idx on public.tasks (user_id, due_date, position) where completed_at is null and archived_at is null;
create index tasks_user_completed_idx on public.tasks (user_id, completed_at desc) where completed_at is not null;
create index tasks_goal_id_idx on public.tasks (goal_id);
create index tasks_list_id_idx on public.tasks (list_id);
create index subtasks_task_position_idx on public.subtasks (task_id, position);
create index subtasks_user_id_idx on public.subtasks (user_id);
create index tags_user_id_idx on public.tags (user_id);
create index task_tags_user_id_idx on public.task_tags (user_id);
create index task_tags_tag_id_idx on public.task_tags (tag_id);
create index reviews_user_date_idx on public.reviews (user_id, review_date desc);
create index daily_reviews_user_date_idx on public.daily_reviews (user_id, review_date desc);
create index connections_addressee_status_idx on public.connections (addressee_id, status);
create index connections_requester_status_idx on public.connections (requester_id, status);
create index accountability_invites_inviter_idx on public.accountability_invites (inviter_id, status);
create index accountability_invites_email_idx on public.accountability_invites (lower(invitee_email)) where status = 'pending';
create index shared_updates_user_created_idx on public.shared_updates (user_id, created_at desc);
create index shared_updates_goal_id_idx on public.shared_updates (goal_id);
create index shared_updates_milestone_id_idx on public.shared_updates (milestone_id);
create index reactions_update_id_idx on public.reactions (update_id);
create index ai_usage_user_requested_idx on public.ai_usage (user_id, requested_at desc);

-- Personal tables: a signed-in user can only access their own rows.
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.milestones enable row level security;
alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.reviews enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.connections enable row level security;
alter table public.accountability_invites enable row level security;
alter table public.shared_updates enable row level security;
alter table public.reactions enable row level security;

create policy "profiles_own_rows" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "goals_own_rows" on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "milestones_own_rows" on public.milestones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "lists_own_rows" on public.lists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "tasks_own_rows" on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "subtasks_own_rows" on public.subtasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "tags_own_rows" on public.tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "task_tags_own_rows" on public.task_tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reviews_own_rows" on public.reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "daily_reviews_own_rows" on public.daily_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Accountability data is visible only to the people involved.
create policy "connections_participant_rows" on public.connections for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "connections_request" on public.connections for insert to authenticated
  with check (requester_id = (select auth.uid()));
create policy "connections_participant_update" on public.connections for update to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "connections_participant_delete" on public.connections for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy "invites_owner_rows" on public.accountability_invites for all to authenticated
  using (inviter_id = (select auth.uid())) with check (inviter_id = (select auth.uid()));

create or replace function public.accept_accountability_invite(invite_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.accountability_invites;
  user_email text;
begin
  select * into invite
  from public.accountability_invites
  where token = invite_token
    and status = 'pending'
    and expires_at > now()
  for update;

  if invite.id is null or invite.inviter_id = (select auth.uid()) then
    return false;
  end if;

  user_email := coalesce((select auth.jwt() ->> 'email'), '');
  if invite.invitee_email <> '' and lower(invite.invitee_email) <> lower(user_email) then
    return false;
  end if;

  insert into public.connections (requester_id, addressee_id, status)
  values (invite.inviter_id, (select auth.uid()), 'accepted')
  on conflict (requester_id, addressee_id)
  do update set status = 'accepted', updated_at = now();

  update public.accountability_invites
  set status = 'accepted', accepted_by = (select auth.uid())
  where id = invite.id;

  return true;
end;
$$;

create policy "updates_owner_write" on public.shared_updates for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "updates_connections_read" on public.shared_updates for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.connections
      where status = 'accepted'
        and (
          (requester_id = (select auth.uid()) and addressee_id = shared_updates.user_id)
          or (addressee_id = (select auth.uid()) and requester_id = shared_updates.user_id)
        )
    )
  );
create policy "reactions_owner_write" on public.reactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reactions_connections_read" on public.reactions for select to authenticated
  using (
    exists (
      select 1 from public.shared_updates
      where shared_updates.id = reactions.update_id
        and (
          shared_updates.user_id = (select auth.uid())
          or exists (
            select 1 from public.connections
            where status = 'accepted'
              and (
                (requester_id = (select auth.uid()) and addressee_id = shared_updates.user_id)
                or (addressee_id = (select auth.uid()) and requester_id = shared_updates.user_id)
              )
          )
        )
    )
  );

-- Authenticated users need table privileges; RLS still decides which rows are allowed.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.goals, public.milestones, public.lists, public.tasks,
  public.subtasks, public.tags, public.task_tags, public.reviews, public.daily_reviews, public.connections,
  public.accountability_invites, public.shared_updates, public.reactions
to authenticated;
grant execute on function public.accept_accountability_invite(text) to authenticated;
