-- Agent execution state is readable by its owner but mutable only through the
-- server-side harness. This prevents clients from bypassing policy, approval,
-- provider evidence, or completion semantics through PostgREST.

drop policy if exists "agent runs are private to their owner"
  on public.agent_runs;

create policy "agent runs are readable by their owner"
on public.agent_runs for select to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete, truncate, references, trigger
  on public.agent_runs
  from anon, authenticated;
grant select on public.agent_runs to authenticated;

-- Approval decisions must pass through task-agent, which validates the
-- immutable preview hash, expiry, version, owning user, and live provider data
-- before applying the exact action.
revoke all on function public.decide_agent_approval(uuid, text, bigint)
  from public, anon, authenticated;
drop function if exists public.decide_agent_approval(uuid, text, bigint);
