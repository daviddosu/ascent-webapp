-- A provider can return the same bytes (and filename) for two separate
-- application cases. Keep task uploads deduplicated, but make generated and
-- received application assets case-scoped so an artifact can never silently
-- point at another case's file record.

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  where con.conrelid = 'public.file_assets'::regclass
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) = 'UNIQUE (user_id, task_id, checksum)'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.file_assets drop constraint %I', constraint_name);
  end if;
end
$$;

create unique index if not exists file_assets_task_upload_checksum_idx
  on public.file_assets (user_id, task_id, checksum)
  where application_case_id is null;

create unique index if not exists file_assets_application_case_checksum_idx
  on public.file_assets (user_id, task_id, checksum, application_case_id)
  where application_case_id is not null;
