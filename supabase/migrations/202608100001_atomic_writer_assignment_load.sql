-- active_assignments is derived state. Maintain it in the same transaction as
-- the assignment mutation so concurrent retries cannot over- or under-count.
create or replace function public.sync_application_writer_assignment_load()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_is_active boolean := false;
  new_is_active boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_is_active := old.status not in ('approved', 'cancelled');
  end if;
  if tg_op <> 'DELETE' then
    new_is_active := new.status not in ('approved', 'cancelled');
  end if;

  if old_is_active and (
    not new_is_active or
    old.writer_id is distinct from new.writer_id or
    old.user_id is distinct from new.user_id
  ) then
    update public.application_writers
    set active_assignments = greatest(0, active_assignments - 1)
    where id::text = old.writer_id and user_id = old.user_id;
  end if;

  if new_is_active and (
    not old_is_active or
    old.writer_id is distinct from new.writer_id or
    old.user_id is distinct from new.user_id
  ) then
    update public.application_writers
    set active_assignments = active_assignments + 1
    where id::text = new.writer_id and user_id = new.user_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists sync_application_writer_assignment_load on public.human_assignments;
create trigger sync_application_writer_assignment_load
after insert or delete or update of writer_id, user_id, status
on public.human_assignments
for each row execute function public.sync_application_writer_assignment_load();

-- Repair counters produced by older read-then-write updates before enabling
-- the trigger for future mutations.
update public.application_writers as writer
set active_assignments = (
  select count(*)::integer
  from public.human_assignments as assignment
  where assignment.user_id = writer.user_id
    and assignment.writer_id = writer.id::text
    and assignment.status not in ('approved', 'cancelled')
);
