-- Canonical bundle-level workflow for graduate applications.
--
-- application_cases remain the durable per-target execution boundary. This
-- migration adds the campaign graph that explains how those cases relate:
-- required selections, alternatives, shared evidence, and prerequisite order.
-- The graph is JSON because its source-backed structure varies by provider;
-- the shared application-workflow module is the schema and validator.

alter table public.application_campaigns
  add column if not exists workflow_version text not null default 'graduate-application-workflow@1',
  add column if not exists workflow_graph jsonb not null default '{}'::jsonb;

alter table public.application_campaigns
  drop constraint if exists application_campaigns_workflow_graph_object_check;

alter table public.application_campaigns
  add constraint application_campaigns_workflow_graph_object_check
  check (jsonb_typeof(workflow_graph) = 'object');

alter table public.application_cases
  add column if not exists workflow_target_key text,
  add column if not exists workflow_target_role text;

alter table public.application_cases
  drop constraint if exists application_cases_workflow_target_role_check;

alter table public.application_cases
  add constraint application_cases_workflow_target_role_check
  check (workflow_target_role is null or workflow_target_role in ('primary', 'required', 'choice', 'alternative', 'linked'));

update public.application_campaigns
set workflow_graph = case
  when jsonb_typeof(coalesce(data->'application_workflow', '{}'::jsonb)) = 'object'
    then coalesce(data->'application_workflow', '{}'::jsonb)
  else '{}'::jsonb
end,
workflow_version = coalesce(nullif(data->>'application_workflow_version', ''), 'graduate-application-workflow@1')
where workflow_graph = '{}'::jsonb;

create index if not exists application_campaigns_workflow_status_idx
  on public.application_campaigns (user_id, status, updated_at desc);
create index if not exists application_cases_workflow_target_idx
  on public.application_cases (user_id, campaign_id, workflow_target_key);
