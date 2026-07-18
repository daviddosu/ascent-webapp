-- A creator page gets one small, read-only bundle. Private profile columns and
-- private task details never cross this database doorway.

create or replace function public.get_creator_today(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  creator public.profiles%rowtype;
  creator_date date;
  viewer_follows boolean;
  visible_tasks jsonb;
begin
  select profile.*
  into creator
  from public.profiles profile
  where lower(profile.username) = lower(trim(p_username))
    and profile.onboarding_completed = true
  limit 1;

  if creator.id is null then
    return null;
  end if;

  creator_date := (now() at time zone creator.timezone)::date;
  viewer_follows := exists (
    select 1
    from public.follows relationship
    where relationship.follower_id = (select auth.uid())
      and relationship.followed_id = creator.id
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', task.record_id,
      'title', task.data ->> 'title',
      'due', task.data ->> 'due',
      'time', task.data ->> 'time',
      'completedAt', task.data ->> 'completedAt',
      'subtasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', subtask.record_id,
          'title', subtask.data ->> 'title',
          'completed', coalesce((subtask.data ->> 'completed')::boolean, false)
        ) order by subtask.created_at)
        from public.planner_records subtask
        where subtask.user_id = creator.id
          and subtask.record_type = 'subtask'
          and subtask.parent_id = task.record_id
          and subtask.deleted_at is null
      ), '[]'::jsonb)
    ) order by
      case when nullif(task.data ->> 'completedAt', '') is null then 0 else 1 end,
      coalesce(task.data ->> 'time', ''),
      task.created_at
  ), '[]'::jsonb)
  into visible_tasks
  from public.planner_records task
  where task.user_id = creator.id
    and task.record_type = 'task'
    and task.deleted_at is null
    and task.visibility in ('public', 'followers')
    and nullif(task.data ->> 'due', '')::date <= creator_date
    and public.can_read_planner_task(creator.id, task.record_id);

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', creator.id,
      'username', creator.username,
      'displayName', creator.display_name,
      'bio', creator.bio,
      'avatarUrl', creator.avatar_url,
      'timezone', creator.timezone
    ),
    'date', creator_date,
    'viewerIsFollowing', viewer_follows,
    'tasks', visible_tasks
  );
end;
$$;

revoke all on function public.get_creator_today(text) from public;
grant execute on function public.get_creator_today(text) to anon, authenticated;
