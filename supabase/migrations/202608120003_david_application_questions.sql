-- Canonical portal supplemental questions.
--
-- A question is durable application state. The exact portal prompt remains
-- authoritative while the normalized interpretation, answer strategy, and
-- resulting saved-state evidence are inspectable and retryable.

create table if not exists public.application_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  application_requirement_id uuid references public.application_requirements(id) on delete set null,
  question_key text not null check (char_length(question_key) between 1 and 400),
  portal text not null check (char_length(portal) between 1 and 240),
  portal_section text not null check (char_length(portal_section) between 1 and 400),
  exact_prompt text not null check (char_length(exact_prompt) between 1 and 12000),
  normalized_prompt text not null check (char_length(normalized_prompt) between 1 and 12000),
  question_type text not null check (question_type in (
    'factual','factual_with_explanation','short_essay','motivation','programme_fit',
    'research_interest','career_goals','personal_background','leadership',
    'challenge_adversity','community','diversity','ethical_conduct',
    'academic_explanation','employment','funding','previous_application',
    'additional_information','disclosure','yes_no','select','date','numeric',
    'contact','other'
  )),
  input_type text not null check (input_type in ('text','textarea','select','radio','checkbox','date','number','file','email','tel','unknown')),
  required boolean not null default false,
  minimum integer check (minimum is null or minimum >= 0),
  maximum integer check (maximum is null or maximum >= 0),
  unit text check (unit is null or unit in ('characters','words','bytes')),
  validation_rule text,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  conditional_trigger text,
  source jsonb not null default '{}'::jsonb check (jsonb_typeof(source) = 'object'),
  current_value jsonb,
  status text not null default 'discovered' check (status in (
    'discovered','classified','ready_to_answer','awaiting_user','awaiting_writer',
    'generated','quality_checked','consistency_checked','ready_to_write','written',
    'saved','verified','skipped','blocked','failed'
  )),
  answer_strategy jsonb check (answer_strategy is null or jsonb_typeof(answer_strategy) = 'object'),
  evidence_dependencies text[] not null default '{}',
  artifact_dependencies text[] not null default '{}',
  writer_dependencies text[] not null default '{}',
  approval_requirement text not null default 'none' check (approval_requirement in ('none','answer_review','submission')),
  answer_route text check (answer_route is null or answer_route in ('deterministic','reuse','david_generate','writer_delegate','user_decision','skip')),
  answer_value text,
  saved_state_evidence jsonb check (saved_state_evidence is null or jsonb_typeof(saved_state_evidence) = 'object'),
  last_error text,
  retry_state jsonb not null default '{"attempts":0,"maximumAttempts":3,"lastFailure":null,"nextAttemptAt":null,"escalated":false}'::jsonb,
  checkpoint_id uuid references public.portal_checkpoints(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, application_case_id, question_key),
  check (maximum is null or minimum is null or maximum >= minimum)
);

create index if not exists application_questions_case_idx
  on public.application_questions (user_id, application_case_id, status, portal_section, updated_at desc);
create index if not exists application_questions_requirement_idx
  on public.application_questions (user_id, application_requirement_id)
  where application_requirement_id is not null;

alter table public.application_questions enable row level security;

drop policy if exists "application questions are private" on public.application_questions;
create policy "application questions are private" on public.application_questions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.application_questions from anon;
grant select, insert, update, delete on public.application_questions to authenticated;

drop trigger if exists touch_application_questions_updated_at on public.application_questions;
create trigger touch_application_questions_updated_at
  before update on public.application_questions
  for each row execute function public.touch_agent_updated_at();
