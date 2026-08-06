-- Upgrade an already-applied application migration so inbound referee
-- reference letters can be selected and approved like other final documents.

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  where con.conrelid = 'public.application_artifacts'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%writer_draft%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.application_artifacts drop constraint %I', constraint_name);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'application_artifacts_kind_check'
      and conrelid = 'public.application_artifacts'::regclass
  ) then
    alter table public.application_artifacts
      add constraint application_artifacts_kind_check
      check (kind in ('immutable_original','canonical_profile_record','generated_derivative','programme_derivative','writer_draft','reference_letter','edited_version','approved_final','submitted_version'));
  end if;
end
$$;
