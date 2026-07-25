-- Resume waiting AgentRuns while the web app is closed.
-- The cron token is intentionally stored outside migrations in Supabase Vault
-- under the name `shotcount_cron_token`.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.invoke_agent_watch_sweep()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cron_token text;
  request_id bigint;
begin
  select decrypted_secret
    into cron_token
  from vault.decrypted_secrets
  where name = 'shotcount_cron_token'
  limit 1;

  -- Deployments remain safe before the server-only token is configured.
  if cron_token is null or length(cron_token) < 32 then
    return null;
  end if;

  select net.http_post(
    url := 'https://bhhutexqrxzbbhatepmh.supabase.co/functions/v1/agent-watch-sweep',
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

select cron.schedule(
  'shotcount-agent-watch-sweep',
  '*/5 * * * *',
  $cron$select private.invoke_agent_watch_sweep();$cron$
);
