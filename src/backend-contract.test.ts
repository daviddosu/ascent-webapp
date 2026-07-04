import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const migration = readFileSync(resolve(root, 'supabase/migrations/202607030001_initial_ascent.sql'), 'utf8')

const privateTables = [
  'profiles',
  'goals',
  'milestones',
  'lists',
  'tasks',
  'subtasks',
  'tags',
  'task_tags',
  'reviews',
  'daily_reviews',
  'connections',
  'accountability_invites',
  'shared_updates',
  'reactions',
]

describe('database security contract', () => {
  it.each(privateTables)('enables row-level security for %s', table => {
    expect(migration).toContain(`alter table public.${table} enable row level security;`)
  })

  it.each(privateTables)('defines at least one policy for %s', table => {
    expect(migration).toMatch(new RegExp(`create policy [\\s\\S]*? on public\\.${table}\\b`, 'i'))
  })

  it('uses authenticated identity checks in personal-data policies', () => {
    expect(migration.match(/select auth\.uid\(\)/g)?.length).toBeGreaterThan(12)
  })

  it('protects invite acceptance inside a security-definer function', () => {
    const inviteFunction = migration.slice(
      migration.indexOf('create or replace function public.accept_accountability_invite'),
      migration.indexOf('create policy "updates_owner_write"'),
    )
    expect(inviteFunction).toContain('security definer')
    expect(inviteFunction).toContain("set search_path = ''")
    expect(inviteFunction).toContain('for update')
    expect(inviteFunction).toContain("status = 'pending'")
  })

  it('indexes the main ownership and relationship paths', () => {
    for (const index of [
      'tasks_user_due_open_idx',
      'tasks_goal_id_idx',
      'subtasks_task_position_idx',
      'reviews_user_date_idx',
      'connections_addressee_status_idx',
      'accountability_invites_inviter_idx',
    ]) {
      expect(migration).toContain(`create index ${index}`)
    }
  })
})

describe('secret isolation', () => {
  it('never references the service-role or OpenAI secret in browser source', () => {
    const browserFiles = [
      'src/main.ts',
      'src/data/ai.ts',
      'src/data/cloud.ts',
      'src/data/community.ts',
      'src/data/sync.ts',
    ].map(file => readFileSync(resolve(root, file), 'utf8')).join('\n')
    expect(browserFiles).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(browserFiles).not.toContain('OPENAI_API_KEY')
  })

  it('keeps powerful keys inside server functions', () => {
    const deleteFunction = readFileSync(resolve(root, 'supabase/functions/delete-account/index.ts'), 'utf8')
    const coachFunction = readFileSync(resolve(root, 'supabase/functions/ai-coach/index.ts'), 'utf8')
    expect(deleteFunction).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')")
    expect(coachFunction).toContain("Deno.env.get('OPENAI_API_KEY')")
  })
})

describe('offline application contract', () => {
  it('has a valid standalone web manifest', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'))
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.icons.length).toBeGreaterThan(0)
  })

  it('caches the app shell and provides a navigation fallback', () => {
    const worker = readFileSync(resolve(root, 'public/sw.js'), 'utf8')
    expect(worker).toContain("'/index.html'")
    expect(worker).toContain("caches.match('/index.html')")
    expect(worker).toContain("event.request.method !== 'GET'")
  })
})
