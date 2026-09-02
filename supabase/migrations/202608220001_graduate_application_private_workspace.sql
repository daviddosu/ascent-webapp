-- Graduate-application-only product boundary.
--
-- Community sharing and public task visibility are retired. Keep the old
-- columns and tables temporarily for backwards-compatible reads, but make
-- every current and future planner/profile write private and remove the
-- grants that powered the retired social surface.

update public.profiles
set default_task_visibility = 'private'
where default_task_visibility is distinct from 'private';

alter table public.profiles
  drop constraint if exists profiles_default_task_visibility_check,
  add constraint profiles_default_task_visibility_check
    check (default_task_visibility = 'private');

update public.planner_records
set visibility = 'private',
    data = case
      when record_type = 'task' then data - 'visibility'
      else data
    end
where visibility is distinct from 'private'
   or (record_type = 'task' and data ? 'visibility');

alter table public.planner_records
  drop constraint if exists planner_records_visibility_check,
  add constraint planner_records_visibility_check
    check (visibility = 'private');

create or replace function public.enforce_planner_task_visibility()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.visibility := 'private';
  new.data := new.data - 'visibility';
  return new;
end;
$$;

update public.tasks
set visibility = 'private'
where visibility is distinct from 'private';

alter table public.tasks
  drop constraint if exists tasks_visibility_check,
  add constraint tasks_visibility_check
    check (visibility = 'private');

drop policy if exists "planner_records_shared_task_read" on public.planner_records;
drop policy if exists "tasks_shared_visibility_read" on public.tasks;
revoke select on public.planner_records, public.tasks from anon;

revoke all on function public.can_read_planner_task(uuid, text) from public, anon, authenticated;
revoke all on function public.creator_directory(text) from public, anon, authenticated;
revoke all on function public.get_creator_today(text) from public, anon, authenticated;
revoke all on function public.creator_today(uuid) from public, anon, authenticated;
revoke all on function public.completion_alert_feed(timestamptz) from public, anon, authenticated;

drop trigger if exists record_shotcount_completion on public.planner_records;
revoke all on public.follows, public.muted_creators, public.completion_events from anon, authenticated;
