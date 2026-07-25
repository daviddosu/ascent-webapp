-- Creator pages already read a deliberately small projection through
-- get_creator_today(). Direct row reads exposed the full task data JSON,
-- including Description, so shared task access must stay behind that RPC.

drop policy if exists "planner_records_shared_task_read" on public.planner_records;
revoke select on public.planner_records from anon;

drop policy if exists "tasks_shared_visibility_read" on public.tasks;
revoke select on public.tasks from anon;

