import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const migration = readFileSync(resolve(root, 'supabase/migrations/202607030001_initial_shotcount.sql'), 'utf8')
const plannerMigration = readFileSync(resolve(root, 'supabase/migrations/202607140001_cloud_planner_records.sql'), 'utf8')
const visibilityMigration = readFileSync(resolve(root, 'supabase/migrations/202607140002_task_visibility.sql'), 'utf8')
const profileMigration = readFileSync(resolve(root, 'supabase/migrations/202607170001_creator_profiles.sql'), 'utf8')
const creatorDirectoryMigration = readFileSync(resolve(root, 'supabase/migrations/202607180001_creator_directory.sql'), 'utf8')
const creatorTodayMigration = readFileSync(resolve(root, 'supabase/migrations/202607180002_public_creator_today.sql'), 'utf8')
const webPushMigration = readFileSync(resolve(root, 'supabase/migrations/202607180005_web_push.sql'), 'utf8')
const googleCalendarMigration = readFileSync(resolve(root, 'supabase/migrations/202607180006_google_calendar_sync.sql'), 'utf8')

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

describe('cloud planner contract', () => {
  it('protects planner records with authenticated row ownership', () => {
    expect(plannerMigration).toContain('alter table public.planner_records enable row level security;')
    expect(plannerMigration).toContain('user_id = (select auth.uid())')
    expect(plannerMigration).toContain('to authenticated')
  })

  it('merges one field at a time while holding a database row lock', () => {
    expect(plannerMigration).toContain('create or replace function public.merge_planner_record')
    expect(plannerMigration).toContain('for update;')
    expect(plannerMigration).toContain('jsonb_each_text')
    expect(plannerMigration).toContain('incoming_version::timestamptz >= current_version::timestamptz')
  })

  it('publishes planner changes for other open devices', () => {
    expect(plannerMigration).toContain('alter publication supabase_realtime add table public.planner_records')
  })

  it('stores and validates the three task visibility choices in the database', () => {
    expect(plannerMigration).toContain("visibility text not null default 'private'")
    expect(plannerMigration).toContain("visibility in ('private', 'followers', 'public')")
    expect(visibilityMigration).toContain('create trigger enforce_planner_task_visibility')
    expect(visibilityMigration).toContain('Task visibility must be private, followers, or public')
  })

  it('lets the server reveal tasks only to the allowed audience', () => {
    expect(visibilityMigration).toContain('alter table public.follows enable row level security;')
    expect(visibilityMigration).toContain('create or replace function public.can_read_planner_task')
    expect(visibilityMigration).toContain('task.visibility = \'public\'')
    expect(visibilityMigration).toContain("task.visibility = 'followers'")
    expect(visibilityMigration).toContain('create policy "planner_records_shared_task_read"')
    expect(visibilityMigration).toContain('public.can_read_planner_task(user_id, parent_id)')
  })

  it('uses the shared planner model and no longer replaces whole workspaces', () => {
    const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8')
    const sync = readFileSync(resolve(root, 'src/data/sync.ts'), 'utf8')
    expect(main).toContain("from './data/planner-model'")
    expect(sync).toContain("from './planner-model'")
    expect(sync).not.toContain('deleteMissing')
    expect(sync).not.toContain("from('task_tags').delete().eq('user_id'")
    expect(main).not.toContain('name="tags"')
    expect(sync).not.toContain("recordType: 'task_tag'")
  })
})

describe('Google Calendar account upgrade contract', () => {
  it('automatically upgrades existing Google accounts without looping OAuth', () => {
    const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8')
    const cloud = readFileSync(resolve(root, 'src/data/cloud.ts'), 'utf8')
    expect(cloud).toContain('export function hasGoogleIdentity')
    expect(cloud).toContain("identity.provider === 'google'")
    expect(main).toContain('populateGoogleCalendarForExistingUser')
    expect(main).toContain('claimGoogleCalendarConsentAttempt')
    expect(main).toContain('window.sessionStorage.getItem(key)')
    expect(main).toContain("nextView === 'calendar'")
  })
})

describe('creator profile contract', () => {
  it('stores the small profile and keeps new tasks private by default', () => {
    expect(profileMigration).toContain('add column if not exists username text')
    expect(profileMigration).toContain("default_task_visibility text not null default 'private'")
    expect(profileMigration).toContain('onboarding_completed boolean not null default false')
    expect(profileMigration).toContain('profiles_username_unique_idx')
    expect(profileMigration).toContain('profiles_completed_fields_check')
    expect(profileMigration).toContain('not onboarding_completed')
  })

  it('limits avatar uploads to the owner folder', () => {
    expect(profileMigration).toContain("values ('avatars', 'avatars', true, 3145728")
    expect(profileMigration).toContain('(storage.foldername(name))[1] = (select auth.uid())::text')
  })

  it('shares only the small public creator card and real follower state', () => {
    expect(creatorDirectoryMigration).toContain('create or replace function public.creator_directory')
    expect(creatorDirectoryMigration).toContain('security definer')
    expect(creatorDirectoryMigration).toContain("set search_path = ''")
    expect(creatorDirectoryMigration).toContain('profile.onboarding_completed')
    expect(creatorDirectoryMigration).toContain('follower_count bigint')
    expect(creatorDirectoryMigration).toContain('followed_by_me boolean')
    expect(creatorDirectoryMigration).toContain('grant execute on function public.creator_directory(text) to anon, authenticated')
    expect(creatorDirectoryMigration).not.toContain('profile.email')
    expect(creatorDirectoryMigration).not.toContain('profile.timezone')
    expect(creatorDirectoryMigration).not.toContain('planner_records')
  })

  it('returns a small read-only creator Today bundle through the server', () => {
    expect(creatorTodayMigration).toContain('create or replace function public.get_creator_today')
    expect(creatorTodayMigration).toContain('security definer')
    expect(creatorTodayMigration).toContain("set search_path = ''")
    expect(creatorTodayMigration).toContain('profile.onboarding_completed = true')
    expect(creatorTodayMigration).toContain("task.visibility in ('public', 'followers')")
    expect(creatorTodayMigration).toContain('public.can_read_planner_task(creator.id, task.record_id)')
    expect(creatorTodayMigration).not.toContain("task.data ->> 'description'")
    expect(creatorTodayMigration).toContain('revoke all on function public.get_creator_today(text) from public')
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

describe('Google Calendar sync contract', () => {
  it('keeps imported events private to their signed-in owner', () => {
    expect(googleCalendarMigration).toContain('alter table public.google_calendar_events enable row level security')
    expect(googleCalendarMigration).toContain('user_id = (select auth.uid())')
    expect(googleCalendarMigration).toContain('google_calendar_events_owner')
    expect(googleCalendarMigration).toContain('unique (user_id, calendar_id, google_event_id)')
  })

  it('stores sync health separately from calendar content', () => {
    expect(googleCalendarMigration).toContain('create table if not exists public.google_calendar_sync_state')
    expect(googleCalendarMigration).toContain("'needs_permission'")
    expect(googleCalendarMigration).toContain('last_synced_at timestamptz')
  })

  it('requests read-only access and never ships a Google client secret', () => {
    const cloud = readFileSync(resolve(root, 'src/data/cloud.ts'), 'utf8')
    const sync = readFileSync(resolve(root, 'src/data/google-calendar.ts'), 'utf8')
    expect(cloud).toContain('https://www.googleapis.com/auth/calendar.readonly')
    expect(sync).toContain('https://www.googleapis.com/calendar/v3')
    expect(sync).not.toContain('GOOGLE_CLIENT_SECRET')
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

  it('opens personal creator paths through the same small web app', () => {
    const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as { rewrites: Array<{ destination: string }> }
    expect(vercel.rewrites[0]?.destination).toBe('/index.html')
  })

  it('receives background push and opens the creator page safely', () => {
    const worker = readFileSync(resolve(root, 'public/sw.js'), 'utf8')
    expect(worker).toContain("addEventListener('push'")
    expect(worker).toContain('showNotification')
    expect(worker).toContain("addEventListener('notificationclick'")
    expect(worker).toContain("visibilityState === 'visible'")
  })
})

describe('web push contract', () => {
  it('stores a separate protected subscription for every browser', () => {
    expect(webPushMigration).toContain('create table if not exists public.push_subscriptions')
    expect(webPushMigration).toContain('alter table public.push_subscriptions enable row level security')
    expect(webPushMigration).toContain('user_id = (select auth.uid())')
    expect(webPushMigration).toContain('create table if not exists public.push_deliveries')
    expect(webPushMigration).toContain('primary key (completion_event_id, push_subscription_id)')
  })

  it('keeps VAPID private keys inside the server sender', () => {
    const sender = readFileSync(resolve(root, 'supabase/functions/send-completion-push/index.ts'), 'utf8')
    const browser = readFileSync(resolve(root, 'src/data/notifications.ts'), 'utf8')
    expect(sender).toContain("Deno.env.get('VAPID_PRIVATE_KEY')")
    expect(sender).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')")
    expect(sender).toContain('push_deliveries')
    expect(browser).not.toContain('VAPID_PRIVATE_KEY')
  })
})

describe('backend separation contract', () => {
  it('does not call the retired Shotcount backend', () => {
    const browserFiles = ['src/main.ts', 'src/data/cloud.ts']
      .map(file => readFileSync(resolve(root, file), 'utf8'))
      .join('\n')
    expect(browserFiles).not.toContain('daviddosu--shotcount-backend')
    expect(browserFiles).not.toContain('/api/auth/')
  })
})
