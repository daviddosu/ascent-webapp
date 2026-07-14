-- Task visibility is a real database rule, not only a label in the app.
-- Private is the safe default for every old task and every incomplete request.

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create index if not exists follows_followed_idx
  on public.follows (followed_id, follower_id);

alter table public.follows enable row level security;

create policy "follows_participant_read" on public.follows for select to authenticated
  using ((select auth.uid()) in (follower_id, followed_id));
create policy "follows_self_create" on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy "follows_participant_delete" on public.follows for delete to authenticated
  using ((select auth.uid()) in (follower_id, followed_id));

grant select, insert, delete on public.follows to authenticated;

alter table public.planner_records
  add column if not exists visibility text not null default 'private';

update public.planner_records
set visibility = case
      when record_type = 'task' and data ->> 'visibility' in ('private', 'followers', 'public')
        then data ->> 'visibility'
      else 'private'
    end,
    data = case
      when record_type = 'task' then jsonb_set(
        data,
        '{visibility}',
        to_jsonb(case
          when data ->> 'visibility' in ('private', 'followers', 'public') then data ->> 'visibility'
          else 'private'
        end),
        true
      )
      else data - 'visibility'
    end;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'planner_records_visibility_check'
      and conrelid = 'public.planner_records'::regclass
  ) then
    alter table public.planner_records
      add constraint planner_records_visibility_check
      check (visibility in ('private', 'followers', 'public'));
  end if;
end
$$;

create or replace function public.enforce_planner_task_visibility()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_visibility text;
begin
  if new.record_type = 'task' then
    requested_visibility := coalesce(new.data ->> 'visibility', 'private');
    if requested_visibility not in ('private', 'followers', 'public') then
      raise exception 'Task visibility must be private, followers, or public';
    end if;
    new.visibility := requested_visibility;
    new.data := jsonb_set(new.data, '{visibility}', to_jsonb(requested_visibility), true);
  else
    new.visibility := 'private';
    new.data := new.data - 'visibility';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_planner_task_visibility on public.planner_records;
create trigger enforce_planner_task_visibility
before insert or update of data, visibility, record_type on public.planner_records
for each row execute function public.enforce_planner_task_visibility();

create or replace function public.can_read_planner_task(p_owner_id uuid, p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.planner_records task
    where task.user_id = p_owner_id
      and task.record_type = 'task'
      and task.record_id = p_task_id
      and task.deleted_at is null
      and (
        p_owner_id = (select auth.uid())
        or task.visibility = 'public'
        or (
          task.visibility = 'followers'
          and exists (
            select 1
            from public.follows relationship
            where relationship.follower_id = (select auth.uid())
              and relationship.followed_id = p_owner_id
          )
        )
      )
  );
$$;

revoke all on function public.can_read_planner_task(uuid, text) from public;
grant execute on function public.can_read_planner_task(uuid, text) to anon, authenticated;

create policy "planner_records_shared_task_read" on public.planner_records
for select to anon, authenticated
using (
  deleted_at is null
  and (
    (record_type = 'task' and public.can_read_planner_task(user_id, record_id))
    or (
      record_type = 'subtask'
      and parent_id is not null
      and public.can_read_planner_task(user_id, parent_id)
    )
  )
);

grant select on public.planner_records to anon;

-- Keep the older task table safe too while accounts move to planner_records.
alter table public.tasks
  add column if not exists visibility text not null default 'private';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_visibility_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_visibility_check
      check (visibility in ('private', 'followers', 'public'));
  end if;
end
$$;

create policy "tasks_shared_visibility_read" on public.tasks for select to anon, authenticated
  using (
    archived_at is null
    and (
      visibility = 'public'
      or (
        visibility = 'followers'
        and exists (
          select 1 from public.follows relationship
          where relationship.follower_id = (select auth.uid())
            and relationship.followed_id = tasks.user_id
        )
      )
    )
  );

grant select on public.tasks to anon;
