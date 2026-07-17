-- A small public identity for Shotcount's creator-led community.

alter table public.profiles
  add column if not exists username text,
  add column if not exists bio text not null default '',
  add column if not exists avatar_url text not null default '',
  add column if not exists default_task_visibility text not null default 'private',
  add column if not exists onboarding_completed boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_username_check,
  add constraint profiles_username_check
    check (username is null or username ~ '^[a-z0-9_]{3,30}$'),
  drop constraint if exists profiles_bio_check,
  add constraint profiles_bio_check check (char_length(bio) <= 140),
  drop constraint if exists profiles_default_task_visibility_check,
  add constraint profiles_default_task_visibility_check
    check (default_task_visibility in ('private', 'followers', 'public'));

alter table public.profiles
  drop constraint if exists profiles_completed_fields_check,
  add constraint profiles_completed_fields_check check (
    not onboarding_completed
    or (
      username ~ '^[a-z0-9_]{3,30}$'
      and char_length(btrim(display_name)) between 1 and 80
      and char_length(btrim(bio)) between 1 and 140
      and char_length(btrim(avatar_url)) > 0
      and char_length(btrim(timezone)) > 0
      and default_task_visibility in ('private', 'followers', 'public')
    )
  );

-- Repair the completion flag for older profiles that already contain every detail.
update public.profiles
set onboarding_completed = true
where not onboarding_completed
  and username ~ '^[a-z0-9_]{3,30}$'
  and char_length(btrim(display_name)) between 1 and 80
  and char_length(btrim(bio)) between 1 and 140
  and char_length(btrim(avatar_url)) > 0
  and char_length(btrim(timezone)) > 0
  and default_task_visibility in ('private', 'followers', 'public');

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar_public_read" on storage.objects;
create policy "avatar_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatar_owner_insert" on storage.objects;
create policy "avatar_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatar_owner_update" on storage.objects;
create policy "avatar_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatar_owner_delete" on storage.objects;
create policy "avatar_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
