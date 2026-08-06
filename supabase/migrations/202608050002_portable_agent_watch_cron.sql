-- Keep the scheduled Roon sweep portable across Supabase projects.
-- The preceding migration created the schedule; this migration only replaces
-- its target function so the URL comes from deployment state instead of a
-- repository-specific project reference.

create or replace function private.invoke_agent_watch_sweep()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cron_token text;
  supabase_url text;
  request_id bigint;
begin
  select decrypted_secret
    into cron_token
  from vault.decrypted_secrets
  where name = 'shotcount_cron_token'
  limit 1;

  select decrypted_secret
    into supabase_url
  from vault.decrypted_secrets
  where name = 'shotcount_supabase_url'
  limit 1;

  if supabase_url is null or length(trim(supabase_url)) = 0 then
    supabase_url := current_setting('app.settings.supabase_url', true);
  end if;

  if cron_token is null or length(cron_token) < 32
     or supabase_url is null or supabase_url !~ '^https://[^/]+/?$' then
    return null;
  end if;

  select net.http_post(
    url := rtrim(supabase_url, '/') || '/functions/v1/agent-watch-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-ShotCount-Cron-Token', cron_token
    ),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 5000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_agent_watch_sweep() from public, anon, authenticated;
