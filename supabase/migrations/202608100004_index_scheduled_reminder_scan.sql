-- The reminder worker reads active task rows only for users who enabled push.
-- Match that user-scoped partial query without indexing deleted/non-task rows.
create index if not exists planner_records_active_tasks_user_idx
on public.planner_records (user_id, updated_at desc)
where record_type = 'task' and deleted_at is null;
