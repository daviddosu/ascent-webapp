-- Canonical recommendation-letter coordination state.
--
-- The ApplicationCase remains the orchestration owner. These tables provide a
-- durable, user-scoped record for reusable recommender context, campaign
-- strategy, and typed Progress Detail interactions; provider secrets and raw
-- message bodies are intentionally excluded.

create table if not exists public.application_recommender_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_key text not null check (char_length(candidate_key) between 1 and 240),
  name text not null check (char_length(name) between 1 and 240),
  email text check (email is null or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  current_title text,
  institution text,
  department text,
  relationship_type text not null default 'other',
  relationship_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(relationship_evidence) = 'array'),
  source_ids text[] not null default '{}',
  reusable boolean not null default false,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, candidate_key)
);

create table if not exists public.application_recommendation_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  campaign_id uuid references public.application_campaigns(id) on delete cascade,
  opportunity_id uuid references public.application_opportunities(id) on delete restrict,
  status text not null default 'requirements_verified',
  requirements jsonb not null default '{}'::jsonb check (jsonb_typeof(requirements) = 'object'),
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  strategy jsonb check (strategy is null or jsonb_typeof(strategy) = 'object'),
  requirement_graph jsonb not null default '[]'::jsonb check (jsonb_typeof(requirement_graph) = 'array'),
  interaction_metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(interaction_metrics) = 'array'),
  reusable_context jsonb not null default '{}'::jsonb check (jsonb_typeof(reusable_context) = 'object'),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (user_id, application_case_id)
);

create table if not exists public.application_recommendation_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  campaign_id uuid references public.application_recommendation_campaigns(id) on delete cascade,
  interaction_id text not null check (char_length(interaction_id) between 1 and 300),
  requirement_id text not null check (char_length(requirement_id) between 1 and 300),
  kind text not null check (kind in ('approval','single_choice','multiple_choice','email','contact_select','attachment_request','attachment_selection','date','fact','short_text','confirmation','correction')),
  question text not null,
  reason text not null,
  response jsonb,
  reusable boolean not null default false,
  status text not null default 'pending' check (status in ('pending','answered','skipped','invalid')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists application_recommender_candidates_user_idx
  on public.application_recommender_candidates (user_id, updated_at desc);
create index if not exists application_recommendation_campaigns_case_idx
  on public.application_recommendation_campaigns (user_id, application_case_id, updated_at desc);
create index if not exists application_recommendation_interactions_case_idx
  on public.application_recommendation_interactions (user_id, application_case_id, created_at desc);

alter table public.application_recommender_candidates enable row level security;
alter table public.application_recommendation_campaigns enable row level security;
alter table public.application_recommendation_interactions enable row level security;

drop policy if exists "application recommender candidates are private" on public.application_recommender_candidates;
create policy "application recommender candidates are private" on public.application_recommender_candidates for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "application recommendation campaigns are private" on public.application_recommendation_campaigns;
create policy "application recommendation campaigns are private" on public.application_recommendation_campaigns for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "application recommendation interactions are private" on public.application_recommendation_interactions;
create policy "application recommendation interactions are private" on public.application_recommendation_interactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.application_recommender_candidates to authenticated;
grant select, insert, update, delete on public.application_recommendation_campaigns to authenticated;
grant select, insert, update, delete on public.application_recommendation_interactions to authenticated;

drop trigger if exists touch_application_recommender_candidates_updated_at on public.application_recommender_candidates;
create trigger touch_application_recommender_candidates_updated_at before update on public.application_recommender_candidates for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_recommendation_campaigns_updated_at on public.application_recommendation_campaigns;
create trigger touch_application_recommendation_campaigns_updated_at before update on public.application_recommendation_campaigns for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_recommendation_interactions_updated_at on public.application_recommendation_interactions;
create trigger touch_application_recommendation_interactions_updated_at before update on public.application_recommendation_interactions for each row execute function public.touch_agent_updated_at();
