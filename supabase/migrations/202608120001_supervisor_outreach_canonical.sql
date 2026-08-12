-- Canonical evidence-backed first-contact packages for prospective-supervisor
-- outreach. David prepares one package; Roon may only materialise and send
-- the exact approved package.

create table if not exists public.application_outreach_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  opportunity_id uuid not null references public.application_opportunities(id) on delete restrict,
  supervisor_id text not null check (char_length(supervisor_id) between 1 and 200),
  contact_id uuid references public.application_contacts(id) on delete set null,
  contact_mode text not null default 'first_contact' check (contact_mode = 'first_contact'),
  verified_email text not null check (verified_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  package_data jsonb not null check (jsonb_typeof(package_data) = 'object'),
  quality_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(quality_metadata) = 'object'),
  approved_email_version text,
  approved_cv_artifact_id uuid references public.application_artifacts(id) on delete set null,
  approved_cv_checksum text check (approved_cv_checksum is null or approved_cv_checksum ~ '^[a-f0-9]{64}$'),
  user_approval boolean not null default false,
  user_approved_at timestamptz,
  status text not null default 'quality_checked' check (status in ('quality_checked','approved','sent','rejected','closed')),
  idempotency_key text not null,
  sent_message_id text,
  sent_thread_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (user_id, application_case_id, supervisor_id, contact_mode)
);

create index if not exists application_outreach_packages_case_idx
  on public.application_outreach_packages (user_id, application_case_id, status, updated_at desc);

alter table public.application_outreach_packages enable row level security;

drop policy if exists "application outreach packages are private" on public.application_outreach_packages;
create policy "application outreach packages are private" on public.application_outreach_packages for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.application_outreach_packages to authenticated;

drop trigger if exists touch_application_outreach_packages_updated_at on public.application_outreach_packages;
create trigger touch_application_outreach_packages_updated_at
  before update on public.application_outreach_packages
  for each row execute function public.touch_agent_updated_at();
