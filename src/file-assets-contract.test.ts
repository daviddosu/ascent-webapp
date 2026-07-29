import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202607300001_application_file_assets.sql'), 'utf8')
const client = readFileSync(resolve('src/data/file-assets.ts'), 'utf8')

describe('private file asset contract', () => {
  it('keeps assets private, owner scoped, immutable, and provenance aware', () => {
    expect(migration).toContain('public = false')
    expect(migration).toContain('(select auth.uid()) = user_id')
    expect(migration).toContain('original_asset_id uuid references public.file_assets')
    expect(migration).toContain("source in ('task_upload','roon_generated')")
    expect(migration).toContain('where reusable = true')
    expect(migration).toContain('unique (user_id, task_id, checksum)')
    expect(migration).toContain('revoke all on public.file_assets from anon')
  })

  it('accepts only scoped formats and uses checksum idempotency', () => {
    for (const mime of ['image/png', 'image/jpeg', 'application/pdf', 'wordprocessingml.document', 'text/plain']) expect(client).toContain(mime)
    expect(client).toContain("digest('SHA-256'")
    expect(client).toContain(".eq('checksum', checksum)")
    expect(client).not.toContain('getPublicUrl')
  })
})
