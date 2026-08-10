import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/202608050001_david_application_execution.sql', 'utf8')
const cronMigration = readFileSync('supabase/migrations/202608050002_portable_agent_watch_cron.sql', 'utf8')
const assetMigration = readFileSync('supabase/migrations/202608050003_application_file_case_identity.sql', 'utf8')
const referenceMigration = readFileSync('supabase/migrations/202608050004_application_reference_artifact.sql', 'utf8')
const assignmentMigration = readFileSync('supabase/migrations/202608050005_assignment_gmail_thread.sql', 'utf8')
const writerLoadMigration = readFileSync('supabase/migrations/202608100001_atomic_writer_assignment_load.sql', 'utf8')
const taskAgent = readFileSync('supabase/functions/task-agent/index.ts', 'utf8')
const watchSweep = readFileSync('supabase/functions/agent-watch-sweep/index.ts', 'utf8')

describe('David application persistence contract', () => {
  it('defines the durable case graph and private storage controls', () => {
    for (const table of [
      'applicant_profiles',
      'application_campaigns',
      'application_opportunities',
      'application_cases',
      'application_requirements',
      'application_artifacts',
      'application_contacts',
      'application_writers',
      'human_assignments',
      'portal_checkpoints',
      'application_evidence',
      'application_communications',
      'application_inter_agent_requests',
      'application_otp_events',
      'application_submission_attempts',
    ]) expect(migration).toContain(`create table if not exists public.${table}`)
    expect(migration).toContain('alter table public.application_evidence enable row level security')
    expect(migration).toContain('using ((select auth.uid()) = user_id)')
    expect(migration).toContain('unique (user_id, application_case_id, idempotency_key)')
    expect(migration).toContain("'calendar_event'")
    expect(migration).toContain("'roon_writer_reply'")
    expect(migration).toContain('application_inter_agent_retry_idx')
    expect(migration).toContain('task_id uuid references public.tasks(id)')
    expect(migration).toContain('alter table public.application_writers enable row level security')
  })

  it('makes final submission service-role-only and one-attempt claimable', () => {
    expect(migration).toContain('create or replace function public.claim_application_submission')
    expect(migration).toContain('create unique index if not exists application_submission_one_attempt_idx')
    expect(migration).toContain('grant execute on function public.claim_application_submission(uuid, uuid, text) to service_role')
    expect(migration).toContain('create or replace function public.record_application_submission')
    expect(migration).toContain('grant execute on function public.record_application_submission(uuid, text, jsonb) to service_role')
  })

  it('keeps the scheduled worker target deployment-portable', () => {
    expect(cronMigration).toContain("where name = 'shotcount_supabase_url'")
    expect(cronMigration).toContain("current_setting('app.settings.supabase_url', true)")
    expect(cronMigration).toContain("rtrim(supabase_url, '/') || '/functions/v1/agent-watch-sweep'")
    expect(cronMigration).not.toContain('bhhutexqrxzbbhatepmh')
  })

  it('keeps received and generated files isolated by application case', () => {
    expect(assetMigration).toContain('file_assets_application_case_checksum_idx')
    expect(assetMigration).toContain('where application_case_id is not null')
    expect(assetMigration).toContain('file_assets_task_upload_checksum_idx')
    expect(assetMigration).toContain('where application_case_id is null')
  })

  it('supports reference-letter artifacts on fresh and already-applied schemas', () => {
    expect(migration).toContain("'reference_letter'")
    expect(referenceMigration).toContain('application_artifacts_kind_check')
    expect(referenceMigration).toContain("'reference_letter'")
    expect(referenceMigration).toContain('if not exists (')
  })

  it('stores a strict Gmail thread checkpoint per human assignment', () => {
    expect(migration).toContain('gmail_thread_id text')
    expect(assignmentMigration).toContain('last_provider_message_id text')
  })

  it('claims writer assignments idempotently and maintains load atomically', () => {
    expect(writerLoadMigration).toContain('after insert or delete or update of writer_id, user_id, status')
    expect(writerLoadMigration).toContain("assignment.status not in ('approved', 'cancelled')")
    expect(taskAgent).toContain("persisted.error?.code === '23505'")
    expect(taskAgent).not.toContain("update({ active_assignments:")
    expect(watchSweep).not.toContain('releaseWriterLoad')
  })
})
