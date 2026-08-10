\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;

create table auth.users (
  id uuid primary key
);

create table public.application_writers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  active_assignments integer not null default 0 check (active_assignments >= 0),
  unique (user_id, id)
);

create table public.application_cases (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade
);

create table public.human_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  writer_id text not null,
  deliverable text not null default 'test deliverable',
  status text not null default 'draft' check (status in ('draft','assigned','awaiting_question','in_progress','revision_requested','quality_review','approved','cancelled','overdue')),
  idempotency_key text not null,
  unique (user_id, application_case_id, idempotency_key)
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index ai_usage_user_requested_idx on public.ai_usage (user_id, requested_at desc);
grant all on table public.ai_usage to anon, authenticated;
grant usage, select on sequence public.ai_usage_id_seq to anon, authenticated;

insert into auth.users (id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');

insert into public.application_cases (id, user_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');

insert into public.application_writers (id, user_id, active_assignments) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 99),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 7);

insert into public.human_assignments (user_id, application_case_id, writer_id, status, idempotency_key) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'assigned', 'existing-active-1'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'quality_review', 'existing-active-2'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'approved', 'existing-terminal'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'cancelled', 'existing-cancelled');
