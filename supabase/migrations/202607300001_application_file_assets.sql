-- Private, immutable assets attached to ordinary tasks and their existing AgentRuns.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-file-assets',
  'private-file-assets',
  false,
  20971520,
  array['image/png','image/jpeg','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']
)
on conflict (id) do update set public = false;

create table if not exists public.file_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null,
  storage_key text not null unique,
  size_bytes bigint not null check (size_bytes between 0 and 20971520),
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  source text not null default 'task_upload' check (source in ('task_upload','roon_generated')),
  reusable boolean not null default false,
  original_asset_id uuid references public.file_assets(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, task_id, checksum)
);

alter table public.file_assets enable row level security;
create policy "file assets are private to owner" on public.file_assets
for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners insert task uploads" on public.file_assets
for insert to authenticated with check (
  (select auth.uid()) = user_id and source = 'task_upload' and original_asset_id is null
);
create policy "owners delete task uploads" on public.file_assets
for delete to authenticated using ((select auth.uid()) = user_id and source = 'task_upload');

create policy "owners upload private file assets" on storage.objects
for insert to authenticated with check (
  bucket_id = 'private-file-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "owners read private file assets" on storage.objects
for select to authenticated using (
  bucket_id = 'private-file-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "owners delete private file assets" on storage.objects
for delete to authenticated using (
  bucket_id = 'private-file-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
);

create index file_assets_task_idx on public.file_assets (user_id, task_id, created_at);
create index file_assets_reusable_idx on public.file_assets (user_id, created_at) where reusable = true;

alter table public.agent_runs add column if not exists application_state jsonb;
alter table public.agent_runs add constraint agent_runs_application_state_object
check (application_state is null or jsonb_typeof(application_state) = 'object');

create or replace function public.set_file_asset_reusable(p_asset_id uuid, p_reusable boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.file_assets set reusable = p_reusable
  where id = p_asset_id and user_id = (select auth.uid()) and source = 'task_upload';
  if not found then raise exception 'File asset not found'; end if;
end;
$$;

revoke all on public.file_assets from anon;
grant select, insert, delete on public.file_assets to authenticated;
grant execute on function public.set_file_asset_reusable(uuid, boolean) to authenticated;
