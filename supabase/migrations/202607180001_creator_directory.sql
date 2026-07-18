-- Reveal only the small, completed public creator identity used by Community.
-- Emails, timezone, preferences, incomplete profiles, and private tasks stay hidden.

create or replace function public.creator_directory(p_username text default null)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  follower_count bigint,
  followed_by_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.username,
    profile.display_name,
    profile.bio,
    profile.avatar_url,
    (
      select count(*)
      from public.follows relationship
      where relationship.followed_id = profile.id
    ) as follower_count,
    coalesce(
      exists (
        select 1
        from public.follows relationship
        where relationship.follower_id = (select auth.uid())
          and relationship.followed_id = profile.id
      ),
      false
    ) as followed_by_me
  from public.profiles profile
  where profile.onboarding_completed
    and profile.username is not null
    and profile.username ~ '^[a-z0-9_]{3,30}$'
    and (p_username is null or lower(profile.username) = lower(p_username))
  order by 6 desc, profile.updated_at desc;
$$;

revoke all on function public.creator_directory(text) from public;
grant execute on function public.creator_directory(text) to anon, authenticated;

