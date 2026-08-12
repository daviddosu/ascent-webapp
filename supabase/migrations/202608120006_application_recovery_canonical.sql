-- Canonical admissions clarification and post-submission recovery workflows.
--
-- David owns research, requirement interpretation, artifact selection, and
-- requirement-graph state. Roon owns Gmail execution. Browser workers own
-- portal ACT/READ/VERIFY/PERSIST execution. Every row is private to its user
-- and idempotent at the workflow boundary.

alter table public.application_inter_agent_requests
  drop constraint if exists application_inter_agent_requests_request_kind_check;

alter table public.application_inter_agent_requests
  add constraint application_inter_agent_requests_request_kind_check
  check (request_kind in (
    'create_draft',
    'send_email',
    'monitor_thread',
    'resolve_contact',
    'follow_up',
    'read_application_reply',
    'schedule_interview',
    'schedule_meeting',
    'create_calendar_reminder',
    'monitor_writer_deadline',
    'monitor_referee_deadline',
    'monitor_professor_reply',
    'detect_application_messages',
    'search_otp',
    'request_academic_document',
    'request_credential_evaluation_delivery',
    'monitor_academic_delivery',
    'monitor_test_score_delivery',
    'send_fee_waiver_request',
    'monitor_fee_waiver',
    'admissions_clarification',
    'post_submission_response'
  ));

create table if not exists public.application_admissions_clarifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  requirement_id uuid not null references public.application_requirements(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  campaign_id uuid references public.application_campaigns(id) on delete cascade,
  programme text not null check (char_length(programme) between 1 and 800),
  institution text not null check (char_length(institution) between 1 and 500),
  question_category text not null check (question_category in (
    'eligibility','transcript','degree_evidence','credential_evaluation',
    'language_testing','gre_gmat','recommendation','supervisor',
    'research_proposal','writing_sample','application_fee','fee_waiver',
    'document_format','deadline','portal_issue','funding',
    'application_status','other'
  )),
  unresolved_issue text not null check (char_length(unresolved_issue) between 1 and 4000),
  sources_checked text[] not null default '{}',
  conflicting_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(conflicting_evidence) = 'array'),
  why_necessary text not null check (char_length(why_necessary) between 1 and 4000),
  unresolved_reason text not null check (unresolved_reason in (
    'UNKNOWN','CONFLICTING_OFFICIAL_SOURCES','PORTAL_CONTRADICTS_GUIDANCE',
    'APPLICANT_SPECIFIC_EXCEPTION','TECHNICAL_PORTAL_ISSUE','MANUAL_APPROVAL_REQUIRED'
  )),
  admissions_contact jsonb check (admissions_contact is null or jsonb_typeof(admissions_contact) = 'object'),
  contact_source text,
  deadline_relevance text,
  deadline_at timestamptz,
  deadline_timezone text,
  risk text not null default 'medium' check (risk in ('low','medium','high','critical')),
  drafted_question text not null check (char_length(drafted_question) between 1 and 2000),
  gmail_thread_id text,
  gmail_message_id text,
  status text not null default 'awaiting_approval' check (status in (
    'researching','prepared','awaiting_approval','queued','sent','monitoring',
    'needs_more_info','referred','resolved','closed','blocked'
  )),
  resolved_interpretation jsonb check (resolved_interpretation is null or jsonb_typeof(resolved_interpretation) = 'object'),
  resulting_requirement_updates jsonb not null default '[]'::jsonb check (jsonb_typeof(resulting_requirement_updates) = 'array'),
  evidence_ids text[] not null default '{}',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.application_post_submission_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  requirement_id uuid references public.application_requirements(id) on delete set null,
  task_id uuid references public.tasks(id) on delete cascade,
  campaign_id uuid references public.application_campaigns(id) on delete cascade,
  institution text not null check (char_length(institution) between 1 and 500),
  programme text not null check (char_length(programme) between 1 and 800),
  source_message_id text not null,
  source_thread_id text,
  source_provider text not null,
  source_url text,
  exact_request_text text not null check (char_length(exact_request_text) between 1 and 8000),
  normalized_requirement text not null check (char_length(normalized_requirement) between 1 and 2000),
  request_type text not null check (request_type in (
    'DOCUMENT_MISSING','DOCUMENT_INCOMPLETE','WRONG_DOCUMENT',
    'OFFICIAL_VERSION_REQUIRED','UPDATED_VERSION_REQUIRED','TRANSLATION_REQUIRED',
    'EXPLANATION_REQUIRED','FORM_REQUIRED','TEST_SCORE_REQUIRED',
    'RECOMMENDATION_REQUIRED','IDENTITY_DOCUMENT_REQUIRED',
    'CREDENTIAL_EVALUATION_REQUIRED','PORTAL_CORRECTION_REQUIRED',
    'CLARIFICATION_REQUIRED','OTHER'
  )),
  requested_artifact_data_type text,
  official_status_required boolean not null default false,
  final_version_required boolean not null default false,
  degree_conferral_required boolean not null default false,
  translation_required boolean not null default false,
  certified_translation_required boolean not null default false,
  institution_direct_delivery_required boolean not null default false,
  deadline_at timestamptz,
  deadline_timezone text,
  urgency text not null default 'routine' check (urgency in ('routine','deadline-sensitive','critical')),
  submission_method text not null default 'unknown' check (submission_method in ('portal_upload','email','institution_direct','provider_portal','user_authentication','unknown')),
  recipient text,
  applicant_action_required boolean not null default false,
  artifact_candidates text[] not null default '{}',
  status text not null default 'artifact_ready' check (status in (
    'artifact_ready','submitted_to_portal','sent_to_institution','delivery_verified',
    'under_review','accepted','rejected','replacement_required','complete'
  )),
  response_evidence text[] not null default '{}',
  acceptance_evidence text[] not null default '{}',
  rejection_reason text,
  external_commitment_due_at timestamptz,
  version integer not null default 1 check (version >= 1),
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists application_admissions_clarifications_case_idx
  on public.application_admissions_clarifications (user_id, application_case_id, status, updated_at desc);
create index if not exists application_admissions_clarifications_deadline_idx
  on public.application_admissions_clarifications (user_id, deadline_at, status);
create index if not exists application_post_submission_requests_case_idx
  on public.application_post_submission_requests (user_id, application_case_id, status, updated_at desc);
create index if not exists application_post_submission_requests_deadline_idx
  on public.application_post_submission_requests (user_id, deadline_at, status);

alter table public.application_admissions_clarifications enable row level security;
alter table public.application_post_submission_requests enable row level security;

drop policy if exists "application admissions clarifications are private" on public.application_admissions_clarifications;
create policy "application admissions clarifications are private"
  on public.application_admissions_clarifications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "application post submission requests are private" on public.application_post_submission_requests;
create policy "application post submission requests are private"
  on public.application_post_submission_requests for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on
  public.application_admissions_clarifications,
  public.application_post_submission_requests
  to authenticated;

drop trigger if exists touch_application_admissions_clarifications_updated_at on public.application_admissions_clarifications;
create trigger touch_application_admissions_clarifications_updated_at
  before update on public.application_admissions_clarifications
  for each row execute function public.touch_agent_updated_at();

drop trigger if exists touch_application_post_submission_requests_updated_at on public.application_post_submission_requests;
create trigger touch_application_post_submission_requests_updated_at
  before update on public.application_post_submission_requests
  for each row execute function public.touch_agent_updated_at();
