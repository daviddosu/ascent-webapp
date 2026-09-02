import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// These are deliberately small source-boundary checks.  The local test suite
// does not start Supabase, so RLS and service-role grants cannot be exercised
// end to end here.  Runtime ownership, evidence, and idempotency behavior is
// covered by the application controller and Deno suites.
const executionMigration = readFileSync('supabase/migrations/202608050001_david_application_execution.sql', 'utf8')
const assetMigration = readFileSync('supabase/migrations/202608050003_application_file_case_identity.sql', 'utf8')
const writerLoadMigration = readFileSync('supabase/migrations/202608100001_atomic_writer_assignment_load.sql', 'utf8')

describe('application security boundaries', () => {
  it('scopes records to the user and application case before idempotent writes', () => {
    expect(executionMigration).toContain('using ((select auth.uid()) = user_id)')
    expect(executionMigration).toContain('unique (user_id, application_case_id, idempotency_key)')
    expect(assetMigration).toContain('where application_case_id is not null')
    expect(assetMigration).toContain('file_assets_application_case_checksum_idx')
    expect(assetMigration).toContain('file_assets_task_upload_checksum_idx')
  })

  it('makes final submission a service-role, one-attempt operation', () => {
    expect(executionMigration).toContain('create or replace function public.claim_application_submission')
    expect(executionMigration).toContain('create unique index if not exists application_submission_one_attempt_idx')
    expect(executionMigration).toContain('grant execute on function public.claim_application_submission(uuid, uuid, text) to service_role')
    expect(executionMigration).toContain('create or replace function public.record_application_submission')
    expect(executionMigration).toContain('grant execute on function public.record_application_submission(uuid, text, jsonb) to service_role')
  })

  it('keeps writer load derived from assignment changes instead of read-then-write counters', () => {
    expect(writerLoadMigration).toContain('after insert or delete or update of writer_id, user_id, status')
    expect(writerLoadMigration).toContain("assignment.status not in ('approved', 'cancelled')")
    expect(writerLoadMigration).toContain('create or replace function public.sync_application_writer_assignment_load')
  })
})
