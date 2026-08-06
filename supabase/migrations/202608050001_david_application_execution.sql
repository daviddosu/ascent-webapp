-- David application execution foundation.
--
-- The application tables are additive and task-owned. They reuse AgentRun,
-- approval, Gmail, Calendar, browser-session, and private file-storage
-- primitives; no existing Roon or Caspian rows are rewritten.

create table if not exists public.applicant_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile) = 'object'),
  consent jsonb not null default '{"granted": false, "scope": null}'::jsonb check (jsonb_typeof(consent) = 'object'),
  consent_granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.application_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  owner_specialist_id text not null default 'david' check (owner_specialist_id = 'david'),
  objective text not null check (char_length(objective) between 1 and 4000),
  application_kind text not null check (application_kind in ('masters','phd','scholarship','fellowship','accelerator','research_programme','internship','job','grant','other')),
  status text not null default 'intake' check (status in ('intake','researching','awaiting_shortlist_approval','approved','preparing','executing','monitoring','completed','paused','cancelled')),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  target_quantity integer check (target_quantity is null or target_quantity between 1 and 1000),
  intake_year integer check (intake_year is null or intake_year between 1900 and 2200),
  approved_strategy jsonb check (approved_strategy is null or jsonb_typeof(approved_strategy) = 'object'),
  next_action text not null default '',
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_id)
);

create table if not exists public.application_opportunities (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.application_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  institution text not null,
  programme_title text not null,
  official_url text not null check (official_url ~ '^https://'),
  application_url text,
  deadline_at timestamptz,
  deadline_timezone text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','partially_verified','verified','stale','conflicted')),
  confidence numeric not null default 0 check (confidence between 0 and 100),
  fit_score numeric not null default 0 check (fit_score between 0 and 100),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  retrieved_at timestamptz not null default now(),
  recommendation_rationale text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_cases (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.application_campaigns(id) on delete cascade,
  opportunity_id uuid not null references public.application_opportunities(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  current_stage text not null default 'intake' check (current_stage in ('intake','research','shortlist_approval','document_preparation','writer_assignment','referee_coordination','portal_preparation','submission_approval','submitted','monitoring','interview','additional_documents','offer','rejected','withdrawn','closed')),
  status text not null default 'active' check (status in ('active','awaiting_user','awaiting_writer','awaiting_referee','awaiting_institution','awaiting_submission_approval','submitted','monitoring','interview','additional_documents','offer','rejected','withdrawn','closed')),
  portal_account jsonb not null default '{}'::jsonb check (jsonb_typeof(portal_account) = 'object'),
  portal_session_id uuid references public.browser_execution_sessions(id) on delete set null,
  next_action text not null default '',
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  application_id text,
  submission_attempt_key text,
  submitted_at timestamptz,
  final_outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, opportunity_id)
);

create table if not exists public.application_requirements (
  id uuid primary key default gen_random_uuid(),
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('identity','academic','test','essay','reference','financial','portfolio','portal','other')),
  required boolean not null default true,
  exact_instructions text not null default '',
  deadline_at timestamptz,
  deadline_timezone text,
  status text not null default 'unknown' check (status in ('unknown','verified','missing','in_progress','awaiting_user','awaiting_writer','awaiting_referee','awaiting_institution','ready','approved','submitted','rejected','waived','expired')),
  responsible_party text not null default 'applicant' check (responsible_party in ('applicant','david','writer','referee','roon','institution')),
  linked_artifact_id uuid,
  verification_evidence_ids text[] not null default '{}',
  source jsonb,
  blocker_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_asset_id uuid not null references public.file_assets(id) on delete restrict,
  application_case_id uuid references public.application_cases(id) on delete set null,
  opportunity_id uuid references public.application_opportunities(id) on delete set null,
  kind text not null check (kind in ('immutable_original','canonical_profile_record','generated_derivative','programme_derivative','writer_draft','reference_letter','edited_version','approved_final','submitted_version')),
  original_asset_ids text[] not null default '{}',
  template_version text,
  prompt_version text,
  author_type text not null check (author_type in ('david','user','writer','editor','referee','institution')),
  revision_of uuid references public.application_artifacts(id) on delete set null,
  revision_history jsonb not null default '[]'::jsonb check (jsonb_typeof(revision_history) = 'array'),
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','rejected','superseded')),
  final_submission_destination text,
  created_at timestamptz not null default now(),
  unique (user_id, file_asset_id)
);

create table if not exists public.application_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid references public.application_cases(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  campaign_id uuid references public.application_campaigns(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  kind text not null check (kind in ('professor','admissions','referee','writer','editor','administrator')),
  name text not null,
  email text,
  provider_contact_id text,
  gmail_thread_id text,
  last_provider_message_id text,
  consent_to_contact boolean not null default false,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.application_writers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 240),
  email text not null check (email ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'),
  specialties text[] not null default '{}',
  degree_fields text[] not null default '{}',
  programme_familiarity text[] not null default '{}',
  price numeric check (price is null or price >= 0),
  price_currency text,
  turnaround_hours integer check (turnaround_hours is null or turnaround_hours between 1 and 8760),
  availability text not null default 'available' check (availability in ('available','busy','unavailable')),
  quality_score numeric check (quality_score is null or quality_score between 0 and 100),
  reliability_score numeric check (reliability_score is null or reliability_score between 0 and 100),
  revision_rate numeric check (revision_rate is null or revision_rate between 0 and 100),
  active_assignments integer not null default 0 check (active_assignments >= 0),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);

create table if not exists public.human_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  campaign_id uuid references public.application_campaigns(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  gmail_thread_id text,
  last_provider_message_id text,
  writer_id text not null,
  specialty text not null default '',
  deliverable text not null,
  brief text not null default '',
  source_material_ids text[] not null default '{}',
  deadline_at timestamptz,
  deadline_timezone text,
  price numeric,
  price_currency text,
  status text not null default 'draft' check (status in ('draft','assigned','awaiting_question','in_progress','revision_requested','quality_review','approved','cancelled','overdue')),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  revisions integer not null default 0 check (revisions >= 0),
  quality_review jsonb not null default '{}'::jsonb check (jsonb_typeof(quality_review) = 'object'),
  final_artifact_id uuid references public.application_artifacts(id) on delete set null,
  payment_status text not null default 'not_applicable' check (payment_status in ('not_applicable','pending','paid','failed')),
  sla_breaches jsonb not null default '[]'::jsonb check (jsonb_typeof(sla_breaches) = 'array'),
  escalation_level integer not null default 0 check (escalation_level >= 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, application_case_id, idempotency_key)
);

create table if not exists public.portal_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  portal text not null,
  account_identifier text,
  url text not null check (url ~ '^https://'),
  section text not null,
  contract jsonb not null default '{}'::jsonb check (jsonb_typeof(contract) = 'object'),
  entered_values jsonb not null default '{}'::jsonb check (jsonb_typeof(entered_values) = 'object'),
  value_sources jsonb not null default '{}'::jsonb check (jsonb_typeof(value_sources) = 'object'),
  uploaded_artifacts text[] not null default '{}',
  save_confirmation text,
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  screenshots text[] not null default '{}',
  session_information jsonb not null default '{}'::jsonb check (jsonb_typeof(session_information) = 'object'),
  completion_signal text,
  next_step text,
  idempotency_key text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (application_case_id, idempotency_key)
);

create table if not exists public.application_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  campaign_id uuid references public.application_campaigns(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  human_assignment_id uuid references public.human_assignments(id) on delete set null,
  kind text not null check (kind in ('official_requirement_source','programme_snapshot','sent_message','received_message','uploaded_file_verification','saved_section_screenshot','submission_confirmation','application_id','receipt','status_email','approval_record','otp_retrieval','calendar_event')),
  source_url text,
  provider text,
  provider_message_id text,
  provider_thread_id text,
  asset_id uuid references public.file_assets(id) on delete set null,
  excerpt text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  idempotency_key text not null,
  captured_at timestamptz not null default now(),
  unique (user_id, application_case_id, idempotency_key)
);

create table if not exists public.application_communications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  campaign_id uuid references public.application_campaigns(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  human_assignment_id uuid references public.human_assignments(id) on delete set null,
  contact_id uuid references public.application_contacts(id) on delete set null,
  provider text not null default 'gmail',
  provider_message_id text,
  provider_thread_id text,
  direction text not null check (direction in ('inbound','outbound')),
  classification text,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, provider, provider_message_id),
  unique (user_id, application_case_id, idempotency_key)
);

create table if not exists public.application_inter_agent_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  from_specialist_id text not null check (from_specialist_id in ('david','roon','caspian')),
  to_specialist_id text not null check (to_specialist_id in ('david','roon','caspian')),
  request_kind text not null check (request_kind in ('create_draft','send_email','monitor_thread','resolve_contact','follow_up','read_application_reply','schedule_interview','schedule_meeting','create_calendar_reminder','monitor_writer_deadline','monitor_referee_deadline','monitor_professor_reply','detect_application_messages','search_otp')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting_user','completed','failed','cancelled')),
  result jsonb,
  provider_action_id text,
  completion_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(completion_evidence) = 'object'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),
  human_assignment_id uuid references public.human_assignments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.application_otp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  institution text not null,
  portal text not null,
  destination_email text not null,
  requested_at timestamptz not null,
  matched_message_id text,
  matched_thread_id text,
  matched_at timestamptz,
  code_hash text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (application_case_id, idempotency_key)
);

create table if not exists public.application_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'claimed' check (status in ('claimed','succeeded','failed','cancelled')),
  application_id text,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (application_case_id, idempotency_key)
);

create unique index if not exists application_submission_one_attempt_idx
  on public.application_submission_attempts (application_case_id)
  where status in ('claimed','succeeded');

-- Extend the existing private file asset record without changing its upload
-- and delete policies. asset_kind distinguishes the immutable original from
-- every generated, edited, approved, or submitted derivative.
alter table public.file_assets
  add column if not exists asset_kind text not null default 'immutable_original',
  add column if not exists application_case_id uuid references public.application_cases(id) on delete set null,
  add column if not exists opportunity_id uuid references public.application_opportunities(id) on delete set null,
  add column if not exists source_asset_ids text[] not null default '{}',
  add column if not exists template_version text,
  add column if not exists prompt_version text,
  add column if not exists author_type text,
  add column if not exists revision_history jsonb not null default '[]'::jsonb,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists final_submission_destination text;

-- Roon may materialise a writer's or institution's private reply as a new
-- immutable source for the same application case. Keep the bucket private and
-- keep the original task-upload and generated-source meanings intact.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'file_assets_source_check' and conrelid = 'public.file_assets'::regclass) then
    alter table public.file_assets drop constraint file_assets_source_check;
  end if;
  alter table public.file_assets
    add constraint file_assets_source_check
    check (source in ('task_upload','roon_generated','roon_writer_reply','institution_reply'));
exception when duplicate_object then
  null;
end
$$;

alter table public.application_cases
  add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.application_contacts
  add column if not exists task_id uuid references public.tasks(id) on delete cascade,
  add column if not exists campaign_id uuid references public.application_campaigns(id) on delete cascade,
  add column if not exists agent_run_id uuid references public.agent_runs(id) on delete set null;
alter table public.human_assignments
  add column if not exists task_id uuid references public.tasks(id) on delete cascade,
  add column if not exists campaign_id uuid references public.application_campaigns(id) on delete cascade,
  add column if not exists agent_run_id uuid references public.agent_runs(id) on delete set null;
alter table public.application_evidence
  add column if not exists task_id uuid references public.tasks(id) on delete cascade,
  add column if not exists campaign_id uuid references public.application_campaigns(id) on delete cascade,
  add column if not exists agent_run_id uuid references public.agent_runs(id) on delete set null,
  add column if not exists human_assignment_id uuid references public.human_assignments(id) on delete set null;
alter table public.application_communications
  add column if not exists task_id uuid references public.tasks(id) on delete cascade,
  add column if not exists campaign_id uuid references public.application_campaigns(id) on delete cascade,
  add column if not exists agent_run_id uuid references public.agent_runs(id) on delete set null,
  add column if not exists human_assignment_id uuid references public.human_assignments(id) on delete set null;
alter table public.application_inter_agent_requests
  add column if not exists provider_action_id text,
  add column if not exists completion_evidence jsonb not null default '{}'::jsonb,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error jsonb,
  add column if not exists human_assignment_id uuid references public.human_assignments(id) on delete set null;
alter table public.application_artifacts
  add column if not exists metadata jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'application_requirements_linked_artifact_fk'
      and conrelid = 'public.application_requirements'::regclass
  ) then
    alter table public.application_requirements
      add constraint application_requirements_linked_artifact_fk
      foreign key (linked_artifact_id) references public.application_artifacts(id) on delete set null;
  end if;
end
$$;

update public.file_assets
set asset_kind = 'generated_derivative'
where source = 'roon_generated' and asset_kind = 'immutable_original';

alter table public.agent_runs
  add column if not exists application_state jsonb;

create index if not exists application_campaigns_user_task_idx on public.application_campaigns (user_id, task_id, created_at desc);
create index if not exists application_opportunities_campaign_idx on public.application_opportunities (user_id, campaign_id, fit_score desc);
create unique index if not exists application_opportunities_campaign_url_idx on public.application_opportunities (campaign_id, official_url);
create unique index if not exists application_contacts_provider_id_idx on public.application_contacts (user_id, provider_contact_id) where provider_contact_id is not null;
create unique index if not exists application_communications_provider_message_idx on public.application_communications (user_id, provider, provider_message_id) where provider_message_id is not null;
create index if not exists application_cases_user_status_idx on public.application_cases (user_id, status, updated_at desc);
create index if not exists application_requirements_case_idx on public.application_requirements (user_id, application_case_id, status);
create index if not exists application_evidence_case_idx on public.application_evidence (user_id, application_case_id, captured_at desc);
create index if not exists application_inter_agent_due_idx on public.application_inter_agent_requests (status, updated_at);
create index if not exists application_inter_agent_retry_idx on public.application_inter_agent_requests (status, next_attempt_at, updated_at);
create index if not exists portal_checkpoints_case_idx on public.portal_checkpoints (user_id, application_case_id, created_at desc);
create index if not exists file_assets_application_case_idx on public.file_assets (user_id, application_case_id, created_at);

alter table public.applicant_profiles enable row level security;
alter table public.application_campaigns enable row level security;
alter table public.application_opportunities enable row level security;
alter table public.application_cases enable row level security;
alter table public.application_requirements enable row level security;
alter table public.application_artifacts enable row level security;
alter table public.application_contacts enable row level security;
alter table public.application_writers enable row level security;
alter table public.human_assignments enable row level security;
alter table public.portal_checkpoints enable row level security;
alter table public.application_evidence enable row level security;
alter table public.application_communications enable row level security;
alter table public.application_inter_agent_requests enable row level security;
alter table public.application_otp_events enable row level security;
alter table public.application_submission_attempts enable row level security;

drop policy if exists "applicant profiles are private" on public.applicant_profiles;
create policy "applicant profiles are private" on public.applicant_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application campaigns are private" on public.application_campaigns;
create policy "application campaigns are private" on public.application_campaigns for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application opportunities are private" on public.application_opportunities;
create policy "application opportunities are private" on public.application_opportunities for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application cases are private" on public.application_cases;
create policy "application cases are private" on public.application_cases for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application requirements are private" on public.application_requirements;
create policy "application requirements are private" on public.application_requirements for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application artifacts are private" on public.application_artifacts;
create policy "application artifacts are private" on public.application_artifacts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application contacts are private" on public.application_contacts;
create policy "application contacts are private" on public.application_contacts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application writers are private" on public.application_writers;
create policy "application writers are private" on public.application_writers for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "human assignments are private" on public.human_assignments;
create policy "human assignments are private" on public.human_assignments for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "portal checkpoints are private" on public.portal_checkpoints;
create policy "portal checkpoints are private" on public.portal_checkpoints for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application evidence is private" on public.application_evidence;
create policy "application evidence is private" on public.application_evidence for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application communications are private" on public.application_communications;
create policy "application communications are private" on public.application_communications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "inter agent requests are private" on public.application_inter_agent_requests;
create policy "inter agent requests are private" on public.application_inter_agent_requests for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "otp events are private" on public.application_otp_events;
create policy "otp events are private" on public.application_otp_events for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "submission attempts are private" on public.application_submission_attempts;
create policy "submission attempts are private" on public.application_submission_attempts for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on
  public.applicant_profiles,
  public.application_campaigns,
  public.application_opportunities,
  public.application_cases,
  public.application_requirements,
  public.application_artifacts,
  public.application_contacts,
  public.application_writers,
  public.human_assignments,
  public.portal_checkpoints,
  public.application_evidence,
  public.application_communications,
  public.application_inter_agent_requests
  to authenticated;
grant select on public.application_otp_events, public.application_submission_attempts to authenticated;

drop trigger if exists touch_applicant_profiles_updated_at on public.applicant_profiles;
create trigger touch_applicant_profiles_updated_at before update on public.applicant_profiles for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_campaigns_updated_at on public.application_campaigns;
create trigger touch_application_campaigns_updated_at before update on public.application_campaigns for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_opportunities_updated_at on public.application_opportunities;
create trigger touch_application_opportunities_updated_at before update on public.application_opportunities for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_cases_updated_at on public.application_cases;
create trigger touch_application_cases_updated_at before update on public.application_cases for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_requirements_updated_at on public.application_requirements;
create trigger touch_application_requirements_updated_at before update on public.application_requirements for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_contacts_updated_at on public.application_contacts;
create trigger touch_application_contacts_updated_at before update on public.application_contacts for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_writers_updated_at on public.application_writers;
create trigger touch_application_writers_updated_at before update on public.application_writers for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_human_assignments_updated_at on public.human_assignments;
create trigger touch_human_assignments_updated_at before update on public.human_assignments for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_communications_updated_at on public.application_communications;
create trigger touch_application_communications_updated_at before update on public.application_communications for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_inter_agent_requests_updated_at on public.application_inter_agent_requests;
create trigger touch_application_inter_agent_requests_updated_at before update on public.application_inter_agent_requests for each row execute function public.touch_agent_updated_at();

create or replace function public.set_applicant_reuse_consent(p_granted boolean, p_scope text)
returns public.applicant_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_row public.applicant_profiles;
begin
  if p_granted and (p_scope is null or p_scope not in ('application_tasks', 'all_tasks')) then
    raise exception 'A reusable-context scope is required';
  end if;
  update public.applicant_profiles
  set consent_granted = p_granted,
      consent = jsonb_build_object(
        'granted', p_granted,
        'scope', case when p_granted then p_scope else null end,
        'grantedAt', case when p_granted then coalesce(consent ->> 'grantedAt', now()::text) else consent ->> 'grantedAt' end,
        'revokedAt', case when p_granted then null else now()::text end
      ),
      updated_at = now()
  where user_id = (select auth.uid())
  returning * into profile_row;
  if profile_row.id is null then raise exception 'Applicant profile not found'; end if;
  return profile_row;
end;
$$;

revoke all on function public.set_applicant_reuse_consent(boolean, text) from public, anon;
grant execute on function public.set_applicant_reuse_consent(boolean, text) to authenticated;

-- Claiming is the only path into a final submission. The partial unique index
-- makes retries and concurrent workers harmless for the same case.
create or replace function public.claim_application_submission(p_user_id uuid, p_case_id uuid, p_idempotency_key text)
returns table (allowed boolean, attempt_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  case_row public.application_cases;
  attempt public.application_submission_attempts;
begin
  if coalesce(p_idempotency_key, '') = '' then
    return query select false, null::uuid, 'A stable submission idempotency key is required.';
    return;
  end if;
  select * into case_row
  from public.application_cases
  where id = p_case_id and user_id = p_user_id
  for update;
  if case_row.id is null then
    return query select false, null::uuid, 'Application case not found.';
    return;
  end if;
  if case_row.status in ('submitted', 'closed', 'withdrawn') then
    return query select false, null::uuid, 'This application already has a submission attempt.';
    return;
  end if;
  if case_row.submission_attempt_key is not null and case_row.submission_attempt_key <> p_idempotency_key then
    return query select false, null::uuid, 'Another worker already claimed this application submission.';
    return;
  end if;
  insert into public.application_submission_attempts (user_id, application_case_id, idempotency_key)
  values (p_user_id, p_case_id, p_idempotency_key)
  on conflict (application_case_id, idempotency_key) do nothing
  returning * into attempt;
  if attempt.id is null then
    select * into attempt
    from public.application_submission_attempts
    where application_case_id = p_case_id and idempotency_key = p_idempotency_key;
    if attempt.id is not null and attempt.status in ('claimed', 'succeeded') then
      return query select true, attempt.id, 'The existing idempotent submission attempt was reused.';
    end if;
    return query select false, null::uuid, 'Another worker already claimed this application submission.';
    return;
  end if;
  update public.application_cases
  set submission_attempt_key = p_idempotency_key,
      current_stage = 'submission_approval',
      status = 'awaiting_submission_approval',
      updated_at = now()
  where id = p_case_id;
  return query select true, attempt.id, 'Submission claimed for one approved attempt.';
end;
$$;

revoke all on function public.claim_application_submission(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_application_submission(uuid, uuid, text) to service_role;

create or replace function public.record_application_submission(
  p_attempt_id uuid,
  p_application_id text,
  p_evidence jsonb
)
returns public.application_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.application_submission_attempts;
  case_row public.application_cases;
begin
  if jsonb_typeof(coalesce(p_evidence, '{}'::jsonb)) <> 'object' then raise exception 'Submission evidence must be an object'; end if;
  select * into attempt from public.application_submission_attempts
  where id = p_attempt_id for update;
  if attempt.id is null then raise exception 'Submission attempt is unavailable'; end if;
  if attempt.status = 'succeeded' then
    select * into case_row from public.application_cases where id = attempt.application_case_id;
    if case_row.id is null then raise exception 'Application case not found'; end if;
    return case_row;
  end if;
  if attempt.status <> 'claimed' then raise exception 'Submission attempt is unavailable or cancelled'; end if;
  update public.application_submission_attempts
  set status = 'succeeded', application_id = nullif(left(coalesce(p_application_id, ''), 255), ''), evidence = p_evidence, completed_at = now()
  where id = attempt.id;
  update public.application_cases
  set status = 'submitted', current_stage = 'submitted', application_id = nullif(left(coalesce(p_application_id, ''), 255), ''), submitted_at = now(), next_action = 'Monitor the application inbox and portal for the next update.', data = jsonb_set(data, '{submissionEvidence}', p_evidence, true), updated_at = now()
  where id = attempt.application_case_id
  returning * into case_row;
  if case_row.id is null then raise exception 'Application case not found'; end if;
  return case_row;
end;
$$;

revoke all on function public.record_application_submission(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_application_submission(uuid, text, jsonb) to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'application_campaigns') then
    alter publication supabase_realtime add table public.application_campaigns;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'application_cases') then
    alter publication supabase_realtime add table public.application_cases;
  end if;
end
$$;
