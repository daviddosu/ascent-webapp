-- Canonical work-sample / portfolio execution records.
--
-- These rows extend ApplicationCase, application_requirements,
-- file_assets/application_artifacts, portal_checkpoints, and
-- application_evidence. They do not create a second document store.

create table if not exists public.application_work_sample_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  opportunity_id uuid references public.application_opportunities(id) on delete set null,
  requirement_key text not null check (char_length(requirement_key) between 1 and 200),
  requirement_type text not null check (requirement_type in ('ACADEMIC_WRITING','RESEARCH_PAPER','THESIS_EXCERPT','PUBLICATION','PREPRINT','TECHNICAL_REPORT','POLICY_WRITING','CODE_SAMPLE','SOFTWARE_PROJECT','DATA_NOTEBOOK','DESIGN_PORTFOLIO','VISUAL_PORTFOLIO','PROJECT_PORTFOLIO','PUBLICATION_LIST','WEBSITE','OTHER')),
  mode text not null check (mode in ('required','recommended','optional','prohibited','not_applicable')),
  status text not null default 'detected' check (status in ('detected','verified','needs_context','ready','blocked','submitted','not_required')),
  source_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(source_evidence) = 'array'),
  requirement_data jsonb not null default '{}'::jsonb check (jsonb_typeof(requirement_data) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, application_case_id, requirement_key),
  unique (user_id, idempotency_key)
);

create table if not exists public.application_work_sample_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid references public.application_cases(id) on delete cascade,
  candidate_key text not null check (char_length(candidate_key) between 1 and 240),
  title text not null,
  artifact_type text not null,
  source_asset_ids text[] not null default '{}',
  source_ids text[] not null default '{}',
  eligibility text not null default 'unknown' check (eligibility in ('eligible','ineligible','unknown')),
  quality_score numeric not null default 0 check (quality_score between 0 and 100),
  application_fit_score numeric not null default 0 check (application_fit_score between 0 and 100),
  selected boolean not null default false,
  candidate_data jsonb not null default '{}'::jsonb check (jsonb_typeof(candidate_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, application_case_id, candidate_key)
);

create table if not exists public.application_work_sample_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  work_sample_requirement_id uuid not null references public.application_work_sample_requirements(id) on delete cascade,
  candidate_id uuid references public.application_work_sample_candidates(id) on delete set null,
  original_artifact_id uuid references public.application_artifacts(id) on delete set null,
  derived_artifact_id uuid references public.application_artifacts(id) on delete set null,
  artifact_type text not null,
  transformations jsonb not null default '[]'::jsonb check (jsonb_typeof(transformations) = 'array'),
  selected_pages jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_pages) = 'array'),
  selected_projects jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_projects) = 'array'),
  submission_method text not null default 'file_upload' check (submission_method in ('file_upload','url','portal_entry')),
  submission_url text,
  filename text not null,
  size_bytes bigint,
  page_count integer,
  word_count integer,
  checksum text not null check (checksum ~ '^[a-f0-9]{32,128}$'),
  original_checksum text,
  approval_state text not null default 'pending' check (approval_state in ('not_required','pending','approved','rejected')),
  upload_state text not null default 'not_started' check (upload_state in ('not_started','ready','uploaded','verified','blocked')),
  quality_gate jsonb not null default '{}'::jsonb check (jsonb_typeof(quality_gate) = 'object'),
  resulting_state_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(resulting_state_evidence) = 'object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, application_case_id, idempotency_key)
);

create table if not exists public.application_work_sample_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  work_sample_requirement_id uuid references public.application_work_sample_requirements(id) on delete set null,
  interaction_id text not null,
  kind text not null check (kind in ('approval','single_choice','multiple_choice','attachment_request','fact','confirmation')),
  question text not null,
  reason text not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  response jsonb,
  reusable boolean not null default false,
  status text not null default 'pending' check (status in ('pending','answered','cancelled')),
  metric jsonb not null default '{}'::jsonb check (jsonb_typeof(metric) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, application_case_id, interaction_id),
  unique (user_id, idempotency_key)
);

alter table public.application_work_sample_requirements enable row level security;
alter table public.application_work_sample_candidates enable row level security;
alter table public.application_work_sample_submissions enable row level security;
alter table public.application_work_sample_interactions enable row level security;

drop policy if exists "work sample requirements are private" on public.application_work_sample_requirements;
create policy "work sample requirements are private" on public.application_work_sample_requirements for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "work sample candidates are private" on public.application_work_sample_candidates;
create policy "work sample candidates are private" on public.application_work_sample_candidates for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "work sample submissions are private" on public.application_work_sample_submissions;
create policy "work sample submissions are private" on public.application_work_sample_submissions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "work sample interactions are private" on public.application_work_sample_interactions;
create policy "work sample interactions are private" on public.application_work_sample_interactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists work_sample_requirements_case_idx on public.application_work_sample_requirements (user_id, application_case_id, status);
create index if not exists work_sample_candidates_case_idx on public.application_work_sample_candidates (user_id, application_case_id, application_fit_score desc);
create index if not exists work_sample_submissions_case_idx on public.application_work_sample_submissions (user_id, application_case_id, upload_state, updated_at desc);
create index if not exists work_sample_interactions_case_idx on public.application_work_sample_interactions (user_id, application_case_id, status, updated_at desc);

drop trigger if exists touch_work_sample_requirements_updated_at on public.application_work_sample_requirements;
create trigger touch_work_sample_requirements_updated_at before update on public.application_work_sample_requirements for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_work_sample_candidates_updated_at on public.application_work_sample_candidates;
create trigger touch_work_sample_candidates_updated_at before update on public.application_work_sample_candidates for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_work_sample_submissions_updated_at on public.application_work_sample_submissions;
create trigger touch_work_sample_submissions_updated_at before update on public.application_work_sample_submissions for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_work_sample_interactions_updated_at on public.application_work_sample_interactions;
create trigger touch_work_sample_interactions_updated_at before update on public.application_work_sample_interactions for each row execute function public.touch_agent_updated_at();

revoke all on public.application_work_sample_requirements from anon;
revoke all on public.application_work_sample_candidates from anon;
revoke all on public.application_work_sample_submissions from anon;
revoke all on public.application_work_sample_interactions from anon;
grant select, insert, update, delete on public.application_work_sample_requirements to authenticated;
grant select, insert, update, delete on public.application_work_sample_candidates to authenticated;
grant select, insert, update, delete on public.application_work_sample_submissions to authenticated;
grant select, insert, update, delete on public.application_work_sample_interactions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'application_work_sample_requirements') = false then
    alter publication supabase_realtime add table public.application_work_sample_requirements;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'application_work_sample_submissions') = false then
    alter publication supabase_realtime add table public.application_work_sample_submissions;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'application_work_sample_interactions') = false then
    alter publication supabase_realtime add table public.application_work_sample_interactions;
  end if;
end
$$;
