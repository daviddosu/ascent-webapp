-- Conflict-safe cloud planner records.
-- Each field has its own timestamp, so two devices can edit different fields
-- without replacing one another's work.

create table if not exists public.planner_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type in ('workspace', 'task', 'goal', 'subtask')),
  record_id text not null check (char_length(record_id) between 1 and 500),
  parent_id text,
  visibility text not null default 'private' check (visibility in ('private', 'followers', 'public')),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  field_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(field_versions) = 'object'),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_type, record_id)
);

create index if not exists planner_records_user_parent_idx
  on public.planner_records (user_id, parent_id, record_type);
create index if not exists planner_records_user_updated_idx
  on public.planner_records (user_id, updated_at desc);

alter table public.planner_records enable row level security;

create policy "planner_records_own_rows" on public.planner_records for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.merge_planner_record(
  p_record_type text,
  p_record_id text,
  p_parent_id text,
  p_patch jsonb,
  p_field_versions jsonb,
  p_deleted_at timestamptz
)
returns public.planner_records
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_row public.planner_records;
  merged_data jsonb;
  merged_versions jsonb;
  field_name text;
  incoming_version text;
  current_version text;
  delete_version text;
begin
  if (select auth.uid()) is null then
    raise exception 'A signed-in user is required';
  end if;
  if p_record_type not in ('workspace', 'task', 'goal', 'subtask') then
    raise exception 'Unknown planner record type';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_field_versions, '{}'::jsonb)) <> 'object' then
    raise exception 'Planner patches and versions must be JSON objects';
  end if;

  insert into public.planner_records (
    user_id, record_type, record_id, parent_id, data, field_versions, deleted_at
  ) values (
    (select auth.uid()), p_record_type, p_record_id, p_parent_id,
    coalesce(p_patch, '{}'::jsonb), coalesce(p_field_versions, '{}'::jsonb), p_deleted_at
  )
  on conflict (user_id, record_type, record_id) do nothing;

  select * into current_row
  from public.planner_records
  where user_id = (select auth.uid())
    and record_type = p_record_type
    and record_id = p_record_id
  for update;

  if current_row.user_id is null then
    raise exception 'Planner record is not available';
  end if;

  merged_data := current_row.data;
  merged_versions := current_row.field_versions;

  for field_name, incoming_version in
    select key, value from jsonb_each_text(coalesce(p_field_versions, '{}'::jsonb))
  loop
    if field_name = '_deleted' or not (coalesce(p_patch, '{}'::jsonb) ? field_name) then
      continue;
    end if;
    current_version := merged_versions ->> field_name;
    if current_version is null or incoming_version::timestamptz >= current_version::timestamptz then
      merged_data := jsonb_set(merged_data, array[field_name], p_patch -> field_name, true);
      merged_versions := jsonb_set(merged_versions, array[field_name], to_jsonb(incoming_version), true);
    end if;
  end loop;

  delete_version := p_field_versions ->> '_deleted';
  current_version := merged_versions ->> '_deleted';
  if delete_version is not null
     and (current_version is null or delete_version::timestamptz >= current_version::timestamptz) then
    current_row.deleted_at := p_deleted_at;
    merged_versions := jsonb_set(merged_versions, array['_deleted'], to_jsonb(delete_version), true);
  end if;

  update public.planner_records
  set parent_id = coalesce(p_parent_id, parent_id),
      data = merged_data,
      field_versions = merged_versions,
      deleted_at = current_row.deleted_at,
      revision = revision + 1,
      updated_at = now()
  where user_id = (select auth.uid())
    and record_type = p_record_type
    and record_id = p_record_id
  returning * into current_row;

  return current_row;
end;
$$;

grant select, insert, update, delete on public.planner_records to authenticated;
grant execute on function public.merge_planner_record(text, text, text, jsonb, jsonb, timestamptz) to authenticated;

-- Realtime lets another open device receive changes quickly.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planner_records'
  ) then
    alter publication supabase_realtime add table public.planner_records;
  end if;
end
$$;
