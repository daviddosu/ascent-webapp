-- Canonical application-fee, waiver, and payment lifecycle.
--
-- The workflow JSON is a durable projection of the typed provider-neutral
-- contract. Normalized columns make state queries and deadline monitoring
-- deterministic; RLS keeps every record scoped to the owning user and case.

alter table public.agent_approvals
  drop constraint if exists agent_approvals_kind_check;

alter table public.agent_approvals
  add constraint agent_approvals_kind_check
  check (kind in ('send_email', 'calendar_write', 'browser_submit', 'payment'));

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
    'monitor_fee_waiver'
  ));

create table if not exists public.application_fee_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  campaign_id uuid references public.application_campaigns(id) on delete cascade,
  requirement_key text not null check (char_length(requirement_key) between 1 and 240),
  institution text not null default '',
  programme text not null default '',
  application_cycle text not null default '',
  fee_required boolean,
  fee_amount numeric(14,2) check (fee_amount is null or fee_amount >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  processing_service_fee numeric(14,2) check (processing_service_fee is null or processing_service_fee >= 0),
  total_payable numeric(14,2) check (total_payable is null or total_payable >= 0),
  payment_deadline timestamptz,
  deadline_timezone text,
  payment_stage text not null default 'APPLICATION' check (payment_stage in (
    'APPLICATION',
    'DETECT_APPLICATION_FEE',
    'DETECT_WAIVER_OPTIONS',
    'DETERMINE_APPLICANT_ELIGIBILITY',
    'GATHER_REUSE_EVIDENCE',
    'CLAIM_REQUEST_WAIVER',
    'MONITOR_WAIVER_DECISION',
    'VERIFY_WAIVER_RESULT',
    'PREPARE_PAYMENT',
    'PAYMENT_APPROVAL',
    'SECURE_PAYMENT_HANDOFF',
    'VERIFY_PAYMENT',
    'CAPTURE_RECEIPT',
    'UPDATE_APPLICATION_REQUIREMENT',
    'COMPLETE'
  )),
  payment_method text,
  waiver_availability text not null default 'unknown' check (waiver_availability in ('unknown','none','available','automatic','conditional','manual')),
  waiver_type text,
  waiver_eligibility_state text not null default 'NOT_RESEARCHED' check (waiver_eligibility_state in (
    'NOT_RESEARCHED','NO_WAIVER_AVAILABLE','WAIVER_AVAILABLE','POTENTIALLY_ELIGIBLE','ELIGIBLE','NOT_ELIGIBLE','EVIDENCE_REQUIRED','REQUEST_READY','AWAITING_USER_EVIDENCE','REQUEST_SUBMITTED','UNDER_REVIEW','APPROVED','DENIED','EXPIRED','WITHDRAWN','NOT_NEEDED'
  )),
  waiver_decision_state text not null default 'NOT_RESEARCHED' check (waiver_decision_state in (
    'NOT_RESEARCHED','NO_WAIVER_AVAILABLE','WAIVER_AVAILABLE','POTENTIALLY_ELIGIBLE','ELIGIBLE','NOT_ELIGIBLE','EVIDENCE_REQUIRED','REQUEST_READY','AWAITING_USER_EVIDENCE','REQUEST_SUBMITTED','UNDER_REVIEW','APPROVED','DENIED','EXPIRED','WITHDRAWN','NOT_NEEDED'
  )),
  waiver_submission_method text,
  waiver_deadline timestamptz,
  waiver_code text,
  payment_state text not null default 'NOT_REQUIRED' check (payment_state in (
    'NOT_REQUIRED','BLOCKED_ON_WAIVER','READY','AWAITING_USER_APPROVAL','APPROVED','PAYMENT_HANDOFF_REQUIRED','PROCESSING','AMBIGUOUS','SUCCEEDED','FAILED','DECLINED','CANCELLED','RECONCILIATION_REQUIRED','REFUND_PENDING','REFUNDED','COMPLETE'
  )),
  provider_portal_transaction_id text,
  receipt_artifact_id uuid references public.file_assets(id) on delete set null,
  verification_evidence_ids text[] not null default '{}',
  blocker text,
  risk_state text not null default 'NONE' check (risk_state in ('NONE','WATCH','ELEVATED','CRITICAL')),
  source_provenance jsonb not null default '[]'::jsonb check (jsonb_typeof(source_provenance) = 'array'),
  waiver_evidence_requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(waiver_evidence_requirements) = 'array'),
  workflow jsonb not null default '{}'::jsonb check (jsonb_typeof(workflow) = 'object'),
  amount_retrieved_at timestamptz,
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, application_case_id),
  unique (user_id, requirement_key)
);

create table if not exists public.application_fee_payment_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  fee_requirement_id uuid not null references public.application_fee_requirements(id) on delete cascade,
  authorization_key text not null,
  merchant text not null default '',
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  maximum_authorized_amount numeric(14,2) not null check (maximum_authorized_amount >= amount),
  reason text not null default '',
  requirement_version bigint not null check (requirement_version >= 1),
  status text not null default 'pending' check (status in ('pending','approved','invalidated','consumed','cancelled')),
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (user_id, authorization_key)
);

create unique index if not exists application_fee_one_active_authorization_idx
  on public.application_fee_payment_authorizations (user_id, fee_requirement_id)
  where status in ('pending','approved');

create table if not exists public.application_fee_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  fee_requirement_id uuid not null references public.application_fee_requirements(id) on delete cascade,
  authorization_id uuid not null references public.application_fee_payment_authorizations(id) on delete restrict,
  idempotency_key text not null,
  state text not null default 'CLAIMED' check (state in ('CLAIMED','SUBMITTED','AMBIGUOUS','SUCCEEDED','FAILED','DECLINED','CANCELLED')),
  provider_transaction_id text,
  lock_owner text,
  locked_at timestamptz not null default now(),
  claimed_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create unique index if not exists application_fee_one_live_attempt_idx
  on public.application_fee_payment_attempts (user_id, fee_requirement_id)
  where state in ('CLAIMED','SUBMITTED','AMBIGUOUS');

create table if not exists public.application_fee_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  fee_requirement_id uuid not null references public.application_fee_requirements(id) on delete cascade,
  institution text not null default '',
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  transaction_id text,
  payment_date_time timestamptz not null,
  receipt_number text,
  provider text,
  portal_state text not null check (portal_state in ('paid','fee_cleared','submitted_without_fee','unknown')),
  receipt_artifact_id uuid references public.file_assets(id) on delete set null,
  evidence_source text not null check (evidence_source in ('portal','provider','gmail','bank_return','user_handoff')),
  checksum text,
  source_evidence_ids text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, application_case_id, checksum)
);

create table if not exists public.application_fee_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  fee_requirement_id uuid not null references public.application_fee_requirements(id) on delete cascade,
  event_type text not null,
  idempotency_key text not null,
  non_sensitive_data jsonb not null default '{}'::jsonb check (jsonb_typeof(non_sensitive_data) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.application_fee_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  fee_requirement_id uuid not null references public.application_fee_requirements(id) on delete cascade,
  interaction_key text not null,
  interaction_kind text not null check (interaction_kind in ('single_choice','attachment_request','short_text','payment_approval','secure_authentication','confirmation')),
  status text not null default 'open' check (status in ('open','answered','cancelled','expired')),
  question text not null,
  reason text not null default '',
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  known_context jsonb not null default '[]'::jsonb check (jsonb_typeof(known_context) = 'array'),
  exact_amount jsonb check (exact_amount is null or jsonb_typeof(exact_amount) = 'object'),
  sensitive boolean not null default false,
  deadline timestamptz,
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, interaction_key),
  unique (user_id, application_case_id, idempotency_key)
);

create index if not exists application_fee_requirements_due_idx
  on public.application_fee_requirements (user_id, payment_deadline, waiver_deadline, payment_state);
create index if not exists application_fee_requirements_case_idx
  on public.application_fee_requirements (user_id, application_case_id, updated_at desc);
create index if not exists application_fee_attempts_state_idx
  on public.application_fee_payment_attempts (user_id, state, updated_at desc);
create index if not exists application_fee_interactions_open_idx
  on public.application_fee_interactions (user_id, status, deadline);

alter table public.application_fee_requirements enable row level security;
alter table public.application_fee_payment_authorizations enable row level security;
alter table public.application_fee_payment_attempts enable row level security;
alter table public.application_fee_payment_evidence enable row level security;
alter table public.application_fee_audit_events enable row level security;
alter table public.application_fee_interactions enable row level security;

drop policy if exists "application fee requirements are private" on public.application_fee_requirements;
create policy "application fee requirements are private" on public.application_fee_requirements for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "application fee authorizations are private" on public.application_fee_payment_authorizations;
create policy "application fee authorizations are private" on public.application_fee_payment_authorizations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "application fee attempts are private" on public.application_fee_payment_attempts;
create policy "application fee attempts are private" on public.application_fee_payment_attempts for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "application fee evidence is private" on public.application_fee_payment_evidence;
create policy "application fee evidence is private" on public.application_fee_payment_evidence for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "application fee audit is private" on public.application_fee_audit_events;
create policy "application fee audit is private" on public.application_fee_audit_events for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "application fee interactions are private" on public.application_fee_interactions;
create policy "application fee interactions are private" on public.application_fee_interactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on
  public.application_fee_requirements,
  public.application_fee_payment_authorizations,
  public.application_fee_interactions
  to authenticated;
grant select on
  public.application_fee_payment_attempts,
  public.application_fee_payment_evidence,
  public.application_fee_audit_events
  to authenticated;

drop trigger if exists touch_application_fee_requirements_updated_at on public.application_fee_requirements;
create trigger touch_application_fee_requirements_updated_at before update on public.application_fee_requirements for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_fee_payment_authorizations_updated_at on public.application_fee_payment_authorizations;
create trigger touch_application_fee_payment_authorizations_updated_at before update on public.application_fee_payment_authorizations for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_fee_payment_attempts_updated_at on public.application_fee_payment_attempts;
create trigger touch_application_fee_payment_attempts_updated_at before update on public.application_fee_payment_attempts for each row execute function public.touch_agent_updated_at();
drop trigger if exists touch_application_fee_interactions_updated_at on public.application_fee_interactions;
create trigger touch_application_fee_interactions_updated_at before update on public.application_fee_interactions for each row execute function public.touch_agent_updated_at();

-- The claim is the durable payment lock. It locks the requirement and the
-- authorization before creating an attempt and consumes the one approval.
create or replace function public.claim_application_fee_payment(
  p_user_id uuid,
  p_case_id uuid,
  p_fee_requirement_id uuid,
  p_authorization_id uuid,
  p_idempotency_key text,
  p_lock_owner text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fee_row public.application_fee_requirements;
  authorization_row public.application_fee_payment_authorizations;
  existing_attempt public.application_fee_payment_attempts;
  live_attempt public.application_fee_payment_attempts;
  created_attempt public.application_fee_payment_attempts;
begin
  if p_user_id is null or p_case_id is null or p_fee_requirement_id is null or p_authorization_id is null then
    raise exception 'fee_payment_scope_required';
  end if;
  if coalesce(length(trim(p_idempotency_key)), 0) < 8 then
    raise exception 'fee_payment_idempotency_key_required';
  end if;

  select * into fee_row
  from public.application_fee_requirements
  where id = p_fee_requirement_id and user_id = p_user_id and application_case_id = p_case_id
  for update;
  if not found then raise exception 'fee_requirement_not_found'; end if;

  select * into authorization_row
  from public.application_fee_payment_authorizations
  where id = p_authorization_id and user_id = p_user_id and application_case_id = p_case_id and fee_requirement_id = p_fee_requirement_id
  for update;
  if not found then raise exception 'fee_authorization_not_found'; end if;

  select * into existing_attempt
  from public.application_fee_payment_attempts
  where user_id = p_user_id and idempotency_key = p_idempotency_key
  for update;
  if found then return jsonb_build_object('duplicate', true, 'attempt', to_jsonb(existing_attempt)); end if;

  select * into live_attempt
  from public.application_fee_payment_attempts
  where user_id = p_user_id
    and application_case_id = p_case_id
    and fee_requirement_id = p_fee_requirement_id
    and state in ('CLAIMED','SUBMITTED','AMBIGUOUS')
  order by created_at desc
  limit 1
  for update;
  if found then return jsonb_build_object('duplicate', true, 'attempt', to_jsonb(live_attempt)); end if;

  if authorization_row.status <> 'approved' then raise exception 'fee_authorization_not_approved'; end if;
  if authorization_row.expires_at <= now() then raise exception 'fee_authorization_expired'; end if;
  if authorization_row.requirement_version > fee_row.version then raise exception 'fee_authorization_stale'; end if;
  if fee_row.payment_state not in ('APPROVED','PAYMENT_HANDOFF_REQUIRED') then raise exception 'fee_payment_not_ready'; end if;
  if authorization_row.amount <> fee_row.total_payable or authorization_row.currency <> fee_row.currency then raise exception 'fee_amount_changed'; end if;
  if authorization_row.maximum_authorized_amount < fee_row.total_payable then raise exception 'fee_authorization_limit_exceeded'; end if;

  insert into public.application_fee_payment_attempts (
    user_id, application_case_id, fee_requirement_id, authorization_id,
    idempotency_key, state, lock_owner, locked_at
  ) values (
    p_user_id, p_case_id, p_fee_requirement_id, p_authorization_id,
    p_idempotency_key, 'CLAIMED', nullif(trim(p_lock_owner), ''), now()
  ) returning * into created_attempt;

  update public.application_fee_payment_authorizations
  set status = 'consumed', updated_at = now()
  where id = p_authorization_id;

  return jsonb_build_object('duplicate', false, 'attempt', to_jsonb(created_attempt));
end;
$$;

revoke all on function public.claim_application_fee_payment(uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.claim_application_fee_payment(uuid, uuid, uuid, uuid, text, text) to service_role;
