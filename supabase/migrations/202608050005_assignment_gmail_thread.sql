-- Store the exact Gmail conversation checkpoint on the human assignment so a
-- monitor request cannot accidentally consume a reply from another thread.

alter table public.human_assignments
  add column if not exists gmail_thread_id text,
  add column if not exists last_provider_message_id text;
