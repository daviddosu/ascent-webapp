-- Canonical Academic Records & Testing evidence state.
--
-- These tables keep academic requirements, immutable evidence references,
-- provider/registrar delivery, credential-evaluation deduplication, and test
-- attempts separate from the generic application checklist. Every row is
-- applicant-owned and scoped to an ApplicationCase where a case exists.

create table if not exists public.academic_evidence_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  requirement_key text not null check (char_length(requirement_key) between 1 and 400),
  institution text not null check (char_length(institution) between 1 and 500),
  programme text not null check (char_length(programme) between 1 and 800),
  requirement_type text not null check (requirement_type in (
    'transcript','degree_certificate','proof_of_graduation','credential_evaluation',
    'english_language_test','admissions_test'
  )),
  requiredness text not null check (requiredness in ('required','conditional','optional','recommended','waived','not_accepted')),
  stage text not null check (stage in ('application','post-submission','offer-condition','enrollment')),
  official_status text not null check (official_status in ('official','unofficial','either','not_applicable')),
  deadline_at timestamptz,
  deadline_timezone text,
  accepted_evidence_types jsonb not null default '[]'::jsonb check (jsonb_typeof(accepted_evidence_types) = 'array'),
  submission_method jsonb not null default '{}'::jsonb check (jsonb_typeof(submission_method) = 'object'),
  source_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(source_evidence) = 'array'),
  confidence text not null default 'unknown' check (confidence in ('high','medium','low','unknown')),
  dependency_ids text[] not null default '{}',
  current_artifact_ids text[] not null default '{}',
  status text not null default 'requirement_detected' check (status in (
    'requirement_detected','blocked','missing','existing_copy_found','artifact_ready',
    'official_order_needed','awaiting_user_auth','order_ready','ordered',
    'institution_processing','dispatched','delivered_to_recipient','provider_selected',
    'account_needed','account_ready','evaluation_order_ready','payment_required',
    'reference_number_issued','documents_requested','awaiting_institution_documents',
    'documents_received','evaluation_in_progress','evaluation_complete',
    'report_dispatch_pending','report_sent','university_receipt_pending',
    'waiver_evidence_needed','score_ready','reporting_pending','rejected',
    'replacement_needed','complete'
  )),
  blocker text,
  external_provider jsonb check (external_provider is null or jsonb_typeof(external_provider) = 'object'),
  cost jsonb check (cost is null or jsonb_typeof(cost) = 'object'),
  approval_requirement text not null default 'none' check (approval_requirement in ('none','user_approval','payment','secure_handoff','final_submission')),
  completion_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(completion_evidence) = 'array'),
  exact_rule jsonb not null default '{}'::jsonb check (jsonb_typeof(exact_rule) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, application_case_id, requirement_key),
  unique (user_id, idempotency_key)
);

create index if not exists academic_evidence_requirements_case_idx
  on public.academic_evidence_requirements (user_id, application_case_id, status, deadline_at);
create index if not exists academic_evidence_requirements_type_idx
  on public.academic_evidence_requirements (user_id, requirement_type, status);

create table if not exists public.academic_evidence_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  requirement_key text not null,
  delivery_key text not null,
  delivery_type text not null check (delivery_type in ('transcript','degree_certificate','proof_of_graduation','credential_evaluation','language_score','admissions_score','other')),
  provider text,
  recipient text,
  provider_id text,
  tracking_id text,
  state text not null default 'not_started' check (state in ('not_started','order_ready','awaiting_user_auth','ordered','processing','dispatched','delivered','accepted','rejected','replacement_needed','blocked')),
  commitment_at timestamptz,
  commitment_due_at timestamptz,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  retry_state jsonb not null default '{"attempts":0,"maximumAttempts":3,"lastFailure":null,"nextAttemptAt":null,"escalated":false}'::jsonb,
  blocker text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists academic_evidence_deliveries_requirement_idx
  on public.academic_evidence_deliveries (user_id, application_case_id, requirement_key, state);

create table if not exists public.credential_evaluation_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evaluation_key text not null,
  provider text not null,
  evaluation_type text not null check (evaluation_type in ('course_by_course','document_by_document','gpa_evaluation','transcript_verification','icap_storage','other')),
  application_case_ids uuid[] not null default '{}',
  requirement_keys text[] not null default '{}',
  recipient_institutions text[] not null default '{}',
  required_documents text[] not null default '{}',
  required_delivery_route text not null default '',
  reference_number text,
  report_id text,
  translation_rules text[] not null default '{}',
  deadline_at timestamptz,
  expected_processing_time text,
  cost jsonb check (cost is null or jsonb_typeof(cost) = 'object'),
  state text not null default 'requirement_verified' check (state in (
    'requirement_verified','provider_selected','account_needed','awaiting_auth',
    'account_ready','evaluation_order_ready','payment_required','ordered',
    'reference_number_issued','documents_requested','awaiting_institution_documents',
    'documents_received','evaluation_in_progress','evaluation_complete',
    'report_dispatch_pending','report_sent','university_received','complete','blocked'
  )),
  institution_deliveries jsonb not null default '[]'::jsonb check (jsonb_typeof(institution_deliveries) = 'array'),
  report_dispatch_state text not null default 'not_started' check (report_dispatch_state in ('not_started','order_ready','awaiting_user_auth','ordered','processing','dispatched','delivered','accepted','rejected','replacement_needed','blocked')),
  university_receipt_states jsonb not null default '{}'::jsonb check (jsonb_typeof(university_receipt_states) = 'object'),
  source_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(source_evidence) = 'array'),
  blocker text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists credential_evaluation_cases_provider_idx
  on public.credential_evaluation_cases (user_id, provider, evaluation_type, state);

create table if not exists public.language_test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_key text not null,
  provider text not null,
  test_type text not null,
  test_version text,
  test_date timestamptz not null,
  overall_score numeric,
  section_scores jsonb not null default '{}'::jsonb check (jsonb_typeof(section_scores) = 'object'),
  candidate_or_report_number text,
  valid_until timestamptz,
  score_report_artifact_id text,
  official_report_state text not null default 'not_started' check (official_report_state in ('not_started','order_ready','awaiting_user_auth','ordered','processing','dispatched','delivered','accepted','rejected','replacement_needed','blocked')),
  recipients jsonb not null default '[]'::jsonb check (jsonb_typeof(recipients) = 'array'),
  provenance jsonb not null default '[]'::jsonb check (jsonb_typeof(provenance) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, attempt_key)
);

create index if not exists language_test_attempts_type_idx
  on public.language_test_attempts (user_id, test_type, test_date desc);

create table if not exists public.admissions_test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_key text not null,
  test_type text not null,
  test_date timestamptz not null,
  overall_score numeric,
  composite_score numeric,
  section_scores jsonb not null default '{}'::jsonb check (jsonb_typeof(section_scores) = 'object'),
  percentile numeric,
  writing_score numeric,
  candidate_or_report_number text,
  valid_until timestamptz,
  score_artifact_id text,
  official_report_state text not null default 'not_started' check (official_report_state in ('not_started','order_ready','awaiting_user_auth','ordered','processing','dispatched','delivered','accepted','rejected','replacement_needed','blocked')),
  recipients jsonb not null default '[]'::jsonb check (jsonb_typeof(recipients) = 'array'),
  provenance jsonb not null default '[]'::jsonb check (jsonb_typeof(provenance) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, attempt_key)
);

create index if not exists admissions_test_attempts_type_idx
  on public.admissions_test_attempts (user_id, test_type, test_date desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'academic_evidence_requirements',
    'academic_evidence_deliveries',
    'credential_evaluation_cases',
    'language_test_attempts',
    'admissions_test_attempts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_private', table_name);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_private', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('drop trigger if exists %I on public.%I', 'touch_' || table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_agent_updated_at()', 'touch_' || table_name || '_updated_at', table_name);
  end loop;
end
$$;
