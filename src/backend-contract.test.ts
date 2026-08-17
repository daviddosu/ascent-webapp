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
const scheduledReminderMigration = readFileSync(resolve(root, 'supabase/migrations/202607210001_scheduled_reminder_pushes.sql'), 'utf8')
const googleCalendarMigration = readFileSync(resolve(root, 'supabase/migrations/202607180006_google_calendar_sync.sql'), 'utf8')
const initialAgentMigration = readFileSync(resolve(root, 'supabase/migrations/202607230001_agent_runs.sql'), 'utf8')
const agentFoundationMigration = readFileSync(resolve(root, 'supabase/migrations/202607240001_agent_execution_foundation.sql'), 'utf8')
const agentGoogleMigration = readFileSync(resolve(root, 'supabase/migrations/202607240002_google_agent_integrations.sql'), 'utf8')
const agentCompletionMigration = readFileSync(resolve(root, 'supabase/migrations/202607240003_agent_completion_analytics.sql'), 'utf8')
const agentCompletionEvidenceMigration = readFileSync(resolve(root, 'supabase/migrations/202607250001_agent_completion_evidence.sql'), 'utf8')
const agentMutationLockMigration = readFileSync(resolve(root, 'supabase/migrations/202607250002_lock_agent_run_mutations.sql'), 'utf8')
const demoFlightHandoffMigration = readFileSync(resolve(root, 'supabase/migrations/202607310001_demo_flight_handoff.sql'), 'utf8')
const activeDemoFlightHandoffMigration = readFileSync(resolve(root, 'supabase/migrations/202607310002_complete_active_demo_flight_handoffs.sql'), 'utf8')
const taskDescriptionPrivacyMigration = readFileSync(resolve(root, 'supabase/migrations/202607250003_keep_task_descriptions_private.sql'), 'utf8')
const aiUsageQuotaMigration = readFileSync(resolve(root, 'supabase/migrations/202608100002_secure_ai_usage_quota.sql'), 'utf8')
const reminderScanMigration = readFileSync(resolve(root, 'supabase/migrations/202608100004_index_scheduled_reminder_scan.sql'), 'utf8')
const reliablePushMigration = readFileSync(resolve(root, 'supabase/migrations/202608100003_reliable_push_outbox.sql'), 'utf8')
const taskAgentFunction = readFileSync(resolve(root, 'supabase/functions/task-agent/index.ts'), 'utf8')
const specialistSource = readFileSync(resolve(root, 'supabase/functions/_shared/specialists.ts'), 'utf8')
const googleOAuthStartFunction = readFileSync(resolve(root, 'supabase/functions/google-oauth-start/index.ts'), 'utf8')
const googleOAuthCallbackFunction = readFileSync(resolve(root, 'supabase/functions/google-oauth-callback/index.ts'), 'utf8')
const googleScopes = readFileSync(resolve(root, 'supabase/functions/_shared/google-scopes.ts'), 'utf8')
const googleToolFunction = readFileSync(resolve(root, 'supabase/functions/_shared/google.ts'), 'utf8')
const agentTools = readFileSync(resolve(root, 'supabase/functions/_shared/agent-tools.ts'), 'utf8')
const agentWatchSweepFunction = readFileSync(resolve(root, 'supabase/functions/agent-watch-sweep/index.ts'), 'utf8')
const scheduledReminderFunction = readFileSync(resolve(root, 'supabase/functions/send-scheduled-reminders/index.ts'), 'utf8')
const browserWorker = readFileSync(resolve(root, 'api/browser-worker.ts'), 'utf8')
const browserSelectWorker = readFileSync(resolve(root, 'api/browser-select-worker.ts'), 'utf8')
const flightBrowser = readFileSync(resolve(root, 'api/_flight-browser.ts'), 'utf8')
const flightCheckout = readFileSync(resolve(root, 'api/_flight-checkout.ts'), 'utf8')
const publicBrowser = readFileSync(resolve(root, 'api/_public-browser.ts'), 'utf8')
const agentClient = readFileSync(resolve(root, 'src/data/agent.ts'), 'utf8')
const mainUi = readFileSync(resolve(root, 'src/main.ts'), 'utf8')
const transcriptionFunction = readFileSync(resolve(root, 'supabase/functions/transcribe-description/index.ts'), 'utf8')
const supabaseConfig = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8')

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

describe('description transcription contract', () => {
  it('keeps OpenAI transcription server-side and requires an authenticated user', () => {
    expect(transcriptionFunction).toContain("Deno.env.get('OPENAI_API_KEY')")
    expect(transcriptionFunction).toContain('userClient.auth.getUser()')
    expect(transcriptionFunction).toContain('gpt-4o-mini-transcribe')
    expect(transcriptionFunction).toContain('MAX_AUDIO_BYTES')
  })

  it('does not expose the transcription secret in browser code', () => {
    expect(mainUi).not.toContain('OPENAI_API_KEY')
  })
})

describe('Roon airport-choice contract', () => {
  it('recognises departure questions in either word order and keeps them as selectable options', () => {
    expect(taskAgentFunction).toContain('function airportContextOptions')
    expect(taskAgentFunction).toContain('(?:airport|city)')
    expect(taskAgentFunction).toContain('Lagos — Murtala Muhammed International (LOS)')
    expect(mainUi).toContain('data-action="select-agent-schedule-option"')
    expect(mainUi).toContain('Use this option')
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

  it('lets the creator RPC reveal only the allowed task projection', () => {
    expect(visibilityMigration).toContain('alter table public.follows enable row level security;')
    expect(visibilityMigration).toContain('create or replace function public.can_read_planner_task')
    expect(visibilityMigration).toContain('task.visibility = \'public\'')
    expect(visibilityMigration).toContain("task.visibility = 'followers'")
    expect(creatorTodayMigration).toContain("'title', task.data ->> 'title'")
    expect(creatorTodayMigration).not.toContain("'description', task.data ->> 'description'")
    expect(taskDescriptionPrivacyMigration).toContain('drop policy if exists "planner_records_shared_task_read"')
    expect(taskDescriptionPrivacyMigration).toContain('revoke select on public.planner_records from anon')
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

describe('scheduled reminder contract', () => {
  it('uses custom cron authentication without an incompatible gateway JWT check', () => {
    expect(supabaseConfig).toMatch(/\[functions\.send-scheduled-reminders\]\s+verify_jwt = false/)
    expect(scheduledReminderFunction).toContain("Deno.env.get('REMINDER_CRON_SECRET')")
  })

  it('scans active tasks only for users with push enabled', () => {
    expect(scheduledReminderFunction).toContain('if (!enabledUsers.size) return Response.json({ sent: 0 })')
    expect(scheduledReminderFunction).toContain(".in('user_id', userIds).eq('record_type', 'task').is('deleted_at', null)")
    expect(reminderScanMigration).toContain('planner_records_active_tasks_user_idx')
    expect(reminderScanMigration).toContain("where record_type = 'task' and deleted_at is null")
  })

  it('uses a leased outbox and acknowledges only confirmed provider delivery', () => {
    const completionPush = readFileSync(resolve(root, 'supabase/functions/send-completion-push/index.ts'), 'utf8')
    expect(reliablePushMigration).toContain('claim_push_delivery')
    expect(reliablePushMigration).toContain("status in ('pending', 'sending', 'delivered', 'abandoned')")
    expect(reliablePushMigration).toContain("status = 'sending' and claimed_at <")
    expect(reliablePushMigration).toContain('finish_push_delivery')
    expect(scheduledReminderFunction).toContain('deliverPushWithOutbox')
    expect(completionPush).toContain('deliverPushWithOutbox')
    expect(scheduledReminderFunction).not.toContain("from('scheduled_push_deliveries').insert")
    expect(completionPush).not.toContain("from('push_deliveries').insert")
  })

  it('deduplicates closed-app reminders per device', () => {
    expect(scheduledReminderMigration).toContain('primary key (delivery_key, push_subscription_id)')
    expect(scheduledReminderMigration).toContain('enable row level security')
    expect(scheduledReminderFunction).toContain('deliverPushWithOutbox')
  })

  it('uses each profile timezone and skips completed tasks', () => {
    expect(scheduledReminderFunction).toContain('validNotificationTimezone(profile.timezone)')
    expect(scheduledReminderFunction).toContain('if (!due || !time || task.data.completedAt) return null')
    expect(scheduledReminderFunction).toContain("url: '/app?plan=today'")
    expect(scheduledReminderFunction).toContain("url: '/app?plan=tomorrow'")
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

  it('captures the short-lived provider token during the OAuth callback', () => {
    const cloud = readFileSync(resolve(root, 'src/data/cloud.ts'), 'utf8')
    const calendar = readFileSync(resolve(root, 'src/data/google-calendar.ts'), 'utf8')
    expect(cloud).toContain('client.auth.onAuthStateChange')
    expect(cloud).toContain('captureGoogleProviderToken(session)')
    expect(cloud).toContain('export async function currentGoogleProviderToken')
    expect(calendar).toContain('await currentGoogleProviderToken()')
    expect(calendar).not.toContain('session?.provider_token')
  })

  it('shares one authentication client across concurrent startup requests', () => {
    const cloud = readFileSync(resolve(root, 'src/data/cloud.ts'), 'utf8')
    expect(cloud).toContain('let cloudPromise: Promise<SupabaseClient | null> | null = null')
    expect(cloud).toContain('if (cloudPromise) return cloudPromise')
    expect(cloud).toContain("cloudPromise = import('@supabase/supabase-js')")
    expect(cloud.match(/createClient\(url!/g)).toHaveLength(1)
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
    expect(deleteFunction.indexOf("from('private-file-assets').remove")).toBeLessThan(deleteFunction.indexOf('admin.auth.admin.deleteUser'))
    expect(deleteFunction.indexOf("from('avatars').remove")).toBeLessThan(deleteFunction.indexOf('admin.auth.admin.deleteUser'))
  })

  it('keeps AI usage server-only and claims the daily quota atomically', () => {
    const coachFunction = readFileSync(resolve(root, 'supabase/functions/ai-coach/index.ts'), 'utf8')
    expect(aiUsageQuotaMigration).toContain('alter table public.ai_usage enable row level security')
    expect(aiUsageQuotaMigration).toContain('pg_advisory_xact_lock')
    expect(aiUsageQuotaMigration).toContain('grant execute on function public.claim_ai_coach_usage(uuid) to service_role')
    expect(coachFunction).toContain("admin.rpc('claim_ai_coach_usage'")
    expect(coachFunction).not.toContain("from('ai_usage').select")
  })
})

describe('agent execution security contract', () => {
  it('keeps every user-readable execution table scoped by row-level security', () => {
    expect(initialAgentMigration).toContain('alter table public.agent_runs enable row level security')
    for (const table of ['agent_actions', 'agent_approvals', 'agent_run_events', 'browser_execution_sessions']) {
      expect(agentFoundationMigration).toContain(`alter table public.${table} enable row level security`)
      expect(agentFoundationMigration).toMatch(new RegExp(`create policy [\\s\\S]*? on public\\.${table}\\b`, 'i'))
    }
    expect(agentGoogleMigration).toContain('alter table public.agent_user_preferences enable row level security')
    expect(agentGoogleMigration).toContain('user_id = (select auth.uid())')
  })

  it('keeps AgentRun and approval mutations behind the server harness', () => {
    expect(agentMutationLockMigration).toContain(
      'on public.agent_runs for select to authenticated',
    )
    expect(agentMutationLockMigration).toContain(
      'revoke insert, update, delete, truncate, references, trigger',
    )
    expect(agentMutationLockMigration).toContain(
      'drop function if exists public.decide_agent_approval',
    )
    expect(agentMutationLockMigration).toContain(
      'grant select on public.agent_runs to authenticated',
    )
  })

  it('keeps model history, OAuth state, provider tokens, and reply watches server-only', () => {
    expect(agentFoundationMigration).toContain('revoke all on public.agent_model_state from anon, authenticated')
    expect(agentGoogleMigration).toContain(
      'revoke all on public.agent_integrations, public.agent_oauth_states, public.agent_email_watches',
    )
    expect(agentGoogleMigration).toContain('refresh_token_ciphertext text')
    expect(googleToolFunction).toContain("Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')")
    expect(googleOAuthCallbackFunction).toContain('refresh_token_ciphertext: encryptedRefreshToken')
  })

  it('rejects unauthenticated agent calls before reporting secret health', () => {
    expect(taskAgentFunction.indexOf("if (!internalPoll && !authorization)"))
      .toBeLessThan(taskAgentFunction.indexOf("if (!url || !publicKey || !serviceKey)"))
    expect(taskAgentFunction.indexOf('if (userError || !user)'))
      .toBeLessThan(taskAgentFunction.lastIndexOf("if (!openaiKey)"))
  })

  it('loads reusable timezone context from the deployed profile table', () => {
    expect(taskAgentFunction).toContain(".from('profiles')")
    expect(taskAgentFunction).not.toContain(".from('creator_profiles')")
  })

  it('maps internal dotted tool names to the OpenAI-safe wire format', () => {
    expect(taskAgentFunction).toContain('.map(openAIToolDefinition)')
    expect(taskAgentFunction).toContain(
      'internalAgentToolName(safeString(call.name, 120))',
    )
  })

  it('hands a next-stage tool to its registered specialist before denying it locally', () => {
    const toolGuard = taskAgentFunction.slice(
      taskAgentFunction.indexOf('if (!specialistCanUseTool(current.active_specialist_id, toolName))'),
      taskAgentFunction.indexOf("if (toolName === 'gmail.create_draft')"),
    )
    expect(toolGuard).toContain('nextSpecialistForTool')
    expect(toolGuard).toContain("'specialist_handoff_triggered'")
    expect(toolGuard).toContain('handoffToNextSpecialist(admin, current, openaiKey)')
    expect(toolGuard).toContain("'HANDOFF_TRIGGER_FAILURE'")
  })

  it('hands a capability-unavailable context request to the next typed stage', () => {
    expect(taskAgentFunction).toContain('nextSpecialistForCapabilityRequest')
    expect(taskAgentFunction).toContain("toolName === 'agent.request_context'")
    expect(taskAgentFunction).toContain("error_code: 'specialist_capability_handoff'")
    expect(taskAgentFunction).toContain("trigger_source: 'saved_context_request_recovery'")
    expect(taskAgentFunction).toContain('return handoffToNextSpecialist(admin, current, openaiKey)')
  })

  it('preflights the mixed flight route before Roon can exhaust its model-step budget', () => {
    expect(taskAgentFunction).toContain('flightStageNeedsPreflightHandoff')
    expect(taskAgentFunction).toContain("trigger_source: 'flight_stage_preflight'")
    expect(taskAgentFunction).toContain('return handoffToNextSpecialist(admin, current, openaiKey)')
  })

  it('keeps Caspian flight sessions on the registered Google destination', () => {
    expect(taskAgentFunction).toContain('googleFlightsBrowserDomains')
    expect(taskAgentFunction).toContain('normalizeBrowserDomains')
    expect(taskAgentFunction).toContain('Picked up the secure workspace.')
    expect(taskAgentFunction).toContain('upsertHistoryToolOutput')
  })

  it('keeps Ask Roon limited to concise title-and-description task planning', () => {
    expect(taskAgentFunction).toContain("action === 'plan_tasks'")
    expect(taskAgentFunction).toContain("name: 'shotcount_task_plan'")
    expect(taskAgentFunction).toContain('Every title must be a plain, concise action of at most 5 words')
    expect(taskAgentFunction).toContain('Prefer 5 decisive tasks over a long checklist')
    expect(taskAgentFunction).toContain("required: ['title', 'description']")
    expect(taskAgentFunction).toContain('Do not include explanations, categories, dependencies, scores, or scheduling.')
  })

  it('allows task execution only when the task belongs in Today', () => {
    expect(taskAgentFunction).toContain("Roon can execute tasks only when they appear in Today.")
    expect(taskAgentFunction).toContain('due > todayInExecutionTimezone')
    expect(mainUi).toContain("if (!taskIsExecutableToday(task)) return ''")
    expect(mainUi).toContain("if (!run || run.status === 'cancelled') return ''")
    expect(mainUi).not.toContain('Available on the due date')
  })

  it('resolves named scheduling contacts before asking the user for an email address', () => {
    expect(taskAgentFunction).toContain('call contacts__find_contact before asking the user for an email address')
    expect(taskAgentFunction).toContain('Never call agent__request_context to ask permission or approval')
    expect(agentTools).toContain("name: 'contacts.find_contact'")
  })

  it('uses expiring, single-use OAuth state with PKCE and controlled returns', () => {
    expect(googleOAuthStartFunction).toContain("authorizationUrl.searchParams.set('code_challenge_method', 'S256')")
    expect(googleOAuthStartFunction).toContain('state_hash: await sha256Hex(state)')
    expect(googleOAuthStartFunction).toContain('expires_at:')
    expect(googleOAuthStartFunction).toContain('origins.includes(url.origin)')
    expect(googleOAuthCallbackFunction).toContain('.update({ used_at: claimedAt })')
    expect(googleOAuthCallbackFunction).toContain(".is('used_at', null)")
    expect(googleOAuthCallbackFunction).toContain(".gt('expires_at', claimedAt)")
    expect(googleOAuthCallbackFunction).toContain("grant_type: 'authorization_code'")
    expect(googleOAuthCallbackFunction).toContain('code_verifier:')
    expect(googleOAuthStartFunction).toContain("origin === 'https://app.shotcount.app'")
    expect(googleOAuthCallbackFunction).toContain("origin === 'https://app.shotcount.app'")
  })

  it('does not report Google connected after partial consent', () => {
    expect(googleScopes).toContain('googleExecutionScopes')
    expect(googleScopes).toContain('gmail.compose')
    expect(googleScopes).toContain('calendar.events.freebusy')
    expect(googleScopes).toContain('contacts.readonly')
    expect(googleOAuthCallbackFunction).toContain('missingGoogleExecutionScopes')
    expect(googleOAuthCallbackFunction).toContain("'required_scopes_missing'")
  })

  it('requires exact approval and idempotency before external writes', () => {
    expect(agentFoundationMigration).toContain('unique (user_id, tool_name, idempotency_key)')
    expect(agentFoundationMigration).toContain('payload_hash text not null')
    expect(agentFoundationMigration).toContain('p_expected_version bigint')
    expect(taskAgentFunction).toContain('policy.approvalKind')
    expect(taskAgentFunction).toContain('pauseForApproval')
    expect(taskAgentFunction).toContain('actionIdempotencyKey')
    expect(taskAgentFunction).toContain('expectedHash !== approval.payload_hash')
    expect(taskAgentFunction).toContain("toolName === 'browser.submit'")
    expect(taskAgentFunction).toContain('preparedState')
    expect(taskAgentFunction).toContain('const payloadHash = await hashValue(payload)')
    expect(taskAgentFunction).toContain(".eq('status', 'pending')")
    expect(taskAgentFunction).toContain("'This approval was already decided. Refresh the task.'")
    expect(googleToolFunction).toContain('existingGmailDraft')
    expect(googleToolFunction).toContain('preparedDraftRecord')
    expect(googleToolFunction).toContain('sentMessageForPreparedDraft')
    expect(googleToolFunction).toContain('emailPayloadMatches')
    expect(googleToolFunction).toContain('canonicalEmailBody')
    expect(googleToolFunction).toContain('already_created: true')
    expect(googleToolFunction).toContain('already_updated: true')
    expect(googleToolFunction).toContain('already_deleted: true')
    expect(googleToolFunction).toContain('shotcount_idempotency_key: idempotencyKey')
  })

  it('rechecks approved Calendar times before creating or rescheduling', () => {
    expect(googleToolFunction).toContain('assertCalendarWindowAvailable')
    expect(googleToolFunction).toContain("'calendar_conflict'")
    expect(googleToolFunction).toContain('excludedEventId')
    expect(googleToolFunction).toContain("event.transparency !== 'transparent'")
  })

  it('reclaims stalled workers through the same saved action', () => {
    expect(agentWatchSweepFunction).toContain(".in('status', ['planning', 'running'])")
    expect(agentWatchSweepFunction).toContain('staleCutoff')
    expect(taskAgentFunction).toContain('recoverStalledRun')
    expect(taskAgentFunction).toContain('retryWaitingProviderAction')
    expect(taskAgentFunction).toContain("tool_name', 'agent.complete'")
    expect(taskAgentFunction).toContain('action.idempotency_key')
    expect(taskAgentFunction).toContain("status: 'succeeded'")
    expect(taskAgentFunction).toContain('historyHasToolOutput(history, callId)')
    expect(taskAgentFunction).toContain("type: 'function_call_output'")
    expect(taskAgentFunction).toContain('recoverSavedAction')
    expect(taskAgentFunction).toContain('? await recoverStalledRun(admin, run, openaiKey)')
  })

  it('atomically completes only the real policy outcome and emits analytics', () => {
    expect(agentCompletionMigration).toContain('create or replace function public.complete_agent_run')
    expect(agentCompletionMigration).toContain('update public.agent_runs')
    expect(agentCompletionMigration).toContain('returning * into completed_run')
    expect(agentCompletionMigration).toContain("status in ('planning', 'running', 'waiting_external', 'waiting_for_user')")
    expect(agentCompletionMigration).toContain('p_expected_version')
    expect(agentCompletionMigration).toContain("'task_completed_by_agent'")
    expect(taskAgentFunction).toContain("run.task_completion_policy === 'external_change'")
    expect(taskAgentFunction).toContain("run.task_completion_policy === 'payment_handoff'")
    expect(taskAgentFunction).toContain('purchase_confirmed === true')
  })

  it('uses the payment-handoff completion RPC after the final specialist stage', () => {
    const completion = taskAgentFunction.slice(
      taskAgentFunction.indexOf('async function completeRun'),
      taskAgentFunction.indexOf('function roonAgentInstructions'),
    )
    expect(completion).toContain("run.task_completion_policy === 'payment_handoff'")
    expect(completion).toContain("admin.rpc('complete_demo_flight_handoff'")
    expect(completion).toContain('p_result: finalResult')
    expect(completion).toContain("admin.rpc('complete_agent_run'")
  })

  it('requires provider-confirmed evidence before a real-world task becomes done', () => {
    expect(agentCompletionEvidenceMigration).toContain('for update')
    expect(agentCompletionEvidenceMigration).toContain("action.status = 'succeeded'")
    expect(agentCompletionEvidenceMigration).toContain("nullif(action.provider_action_id, '') is not null")
    expect(agentCompletionEvidenceMigration).toContain("action.tool_name = 'gmail.send_message'")
    expect(agentCompletionEvidenceMigration).toContain("'calendar.create_event'")
    expect(agentCompletionEvidenceMigration).toContain(
      "raise exception 'A payment handoff cannot confirm that a purchase occurred'",
    )
    expect(taskAgentFunction).toContain('agentCompletionEvidenceSatisfied')
    expect(taskAgentFunction).toContain(".not('provider_action_id', 'is', null)")
    expect(taskAgentFunction).not.toMatch(/addEvent\([^)]*'agent_completed'/s)
  })

  it('keeps browser control structured and stops before payment', () => {
    expect(browserWorker).toContain("operation.type === 'search_flights'")
    expect(browserWorker).toContain("type: 'navigate' | 'act' | 'submit' | 'search_flights' | 'select_flight'")
    expect(browserWorker).toContain('resumeFlightSelection(')
    expect(browserWorker).toContain('submissionAttempted')
    expect(browserWorker).toContain('browser_submission_status_unknown')
    expect(browserWorker).toContain("process.env.SHOTCOUNT_BROWSER_WORKER_TOKEN")
    expect(browserWorker).not.toContain('cookie')
    expect(publicBrowser).toContain('untrustedExternalContent: true')
    expect(publicBrowser).toContain('browser_sensitive_field_blocked')
    expect(publicBrowser).toContain("url.protocol !== 'https:'")
    expect(publicBrowser).toContain('normalizedIpLiteral(hostname)')
    expect(publicBrowser).toContain('pinnedHostResolverRules')
    expect(publicBrowser).toContain('await resolvePublicHostname(hostname)')
    expect(publicBrowser).toContain("request.resourceType() === 'document'")
    expect(flightBrowser).toContain("paymentBoundaryReached: true")
    expect(flightBrowser).toContain('safeExternalProviderHandoffUrl')
    expect(flightBrowser).toContain('finalHandoffStage')
    expect(flightBrowser).not.toMatch(/card(?:Number|_number)|cvv|securityCode/i)
    expect(taskAgentFunction).toContain("policy.risk === 'financial'")
    expect(taskAgentFunction).toContain('Payment must be completed by you.')
    expect(taskAgentFunction).toContain('A verified handoff is the defined flight-search outcome.')
    expect(taskAgentFunction).toContain('purchaseConfirmed: false')
  })

  it('requires a verified provider booking page before the payment handoff', () => {
    expect(flightBrowser).toContain("'provider_booking' as const")
    expect(flightBrowser).toContain('flight_provider_handoff_unavailable')
    expect(flightBrowser).toContain("safeProviderNavigationUrl")
    expect(taskAgentFunction).toContain('p_mark_task_complete: true')
    expect(taskAgentFunction).toContain('Your flight handoff is ready. Payment remains under your control.')
    expect(taskAgentFunction).toContain("checkpoint.pendingOperation?.type === 'select_flight'")
    expect(taskAgentFunction).toContain('135_000')
  })

  it('recovers a missing Gmail draft within the same run instead of failing the task', () => {
    expect(taskAgentFunction).toContain("error_code: 'gmail_draft_required'")
    expect(taskAgentFunction).toContain('Prepare the Gmail draft with gmail.create_draft before requesting send approval.')
    expect(taskAgentFunction).toContain("'agent_email_draft_required'")
    expect(taskAgentFunction).toContain("'agent_email_draft_sequence_recovered'")
    expect(taskAgentFunction).toContain(".eq('tool_name', 'gmail.send_message')")
  })

  it('lets people revise a pending calendar event before approving that exact revision', () => {
    expect(taskAgentFunction).toContain("action === 'edit_calendar_approval'")
    expect(taskAgentFunction).toContain('async function editCalendarApproval')
    expect(taskAgentFunction).toContain('Add an event title and valid ISO start and end times')
    expect(mainUi).toContain('data-agent-calendar-summary')
    expect(mainUi).toContain('data-agent-calendar-description')
    expect(mainUi).toContain('notify_attendees')
    expect(mainUi).toContain('Attendees will be notified.')
    expect(mainUi).toContain('editAgentCalendarApproval')
  })

  it('resumes an ambiguous-recipient choice from durable context, not stale model history', () => {
    expect(taskAgentFunction).toContain("'recipient_selected'")
    expect(taskAgentFunction).toContain('Recipient resolution happens before the model can safely continue.')
    expect(taskAgentFunction).toContain(".eq('run_id', run.id)")
  })

  it('serializes active-run recovery so reply polling cannot replay a model turn', () => {
    expect(taskAgentFunction).toContain('async function claimRunForContinuation')
    expect(taskAgentFunction).toContain("p_lease_seconds: 45")
    expect(taskAgentFunction).toContain('Another request already owns this same continuation.')
  })

  it('continues bounded official recommendation-source research before asking the applicant', () => {
    const recovery = taskAgentFunction.slice(
      taskAgentFunction.indexOf('function applicationRecommendationSourceCanRecover'),
      taskAgentFunction.indexOf('function applicationCvGroundingCanRecover'),
    )
    expect(recovery).toContain("safeString(interaction.id, 300) === 'recommendation:requirements-source'")
    expect(recovery).toContain("safeString(run.error_code, 120) === 'recommendation_source_not_found'")
    expect(recovery).toContain('/recommendation rules aren.t clear yet/i.test(run.waiting_reason)')
    expect(recovery).toContain("strategyVersion === 'recommendation-public-route@2'")
    expect(recovery).toContain("recommendation_source_research_strategy_version: 'recommendation-public-route@2'")
    expect(recovery).toContain("recommendation_source_research_required: true")
    expect(recovery).toContain(".eq('status', 'needs_context')")
    expect(recovery).toContain(".eq('version', run.version)")
    expect(recovery).toContain("'Checking the programme’s recommendation instructions.'")
    expect(mainUi).toContain("run.errorCode === 'recommendation_source_not_found'")
    expect(mainUi).toContain('/recommendation rules aren.t clear yet/i.test(run.waitingReason)')
    expect(mainUi).toContain('const internalAgentRecoveryFingerprints = new Map<string, string>()')
    expect(mainUi).toContain('internalAgentRecoveryFingerprints.get(run.id) === recoveryFingerprint')
    expect(taskAgentFunction).toContain("error_code: toolOutput.status === 'waiting_external' ? null : toolOutput.code")
  })

  it('relinks a resumed application run to its task-owned case before planning again', () => {
    const relink = taskAgentFunction.slice(
      taskAgentFunction.indexOf('async function relinkTaskApplicationCase'),
      taskAgentFunction.indexOf('async function ensureCanonicalApplicationRuntime'),
    )
    expect(relink).toContain(".eq('task_id', run.task_id)")
    expect(relink).toContain(".eq('campaign_id', campaignId)")
    expect(relink).toContain('resolveTaskApplicationCaseLink')
    expect(relink).toContain('application_case_id: resolution.caseId')
    expect(relink).toContain("admin.from('agent_model_state').delete()")
    expect(relink).toContain("'application_case_relinked'")
    expect(taskAgentFunction).toContain("if (!['planning', 'running'].includes(current.status)) return current")
  })

  it('keeps official university research bounded while preserving links from earlier pages', () => {
    const research = taskAgentFunction.slice(
      taskAgentFunction.indexOf('function isProgrammeOfficialSource'),
      taskAgentFunction.indexOf('function decodeWorkSamplePdfText'),
    )
    expect(research).toContain(".eq('tool_name', 'browser.navigate')")
    expect(research).toContain('const recommendationProgrammeSourcePageLimit = 6')
    expect(research).toContain('sameOfficialInstitutionDomain(officialUrl, sourceUrl)')
    expect(research).toContain('historicalLinks: history.links')
    expect(research).toContain('deriveOfficialRecommendationRoutes')
    expect(research).toContain("label: 'Official recommendations instructions'")
    expect(research).toContain('const inferredRouteAlreadyVisited')
    expect(research).toContain("destination.kind !== 'inferred'")
    expect(research).toContain('visitedUrls.size >= recommendationProgrammeSourcePageLimit')
  })

  it('preserves the original Gmail thread for scheduling replies', () => {
    expect(taskAgentFunction).toContain('const schedulingReply = Boolean(')
    expect(taskAgentFunction).toContain('!replyRequested && !schedulingReply && hasThread')
  })

  it('preserves an in-progress task composer through unrelated realtime renders', () => {
    expect(mainUi).toContain("target.closest('[data-today-form]')")
    expect(mainUi).toContain('captureTodayComposerDraft()')
    expect(mainUi).toContain("if (todayComposerOpen && !skipTodayComposerCapture && document.querySelector('[data-today-form]')) captureTodayComposerDraft()")
  })

  it('waits for scheduling replies only when a remaining action depends on them', () => {
    expect(taskAgentFunction).toContain('only when a reply is still required')
    expect(taskAgentFunction).toContain('notification-only email after a completed Calendar change does not require a reply watch')
  })

  it('uses the established background polling cadence for scheduling runs', () => {
    expect(taskAgentFunction).toContain('auto_started_after_send: true')
    expect(taskAgentFunction).toContain("tool_name: 'gmail.wait_for_reply'")
    expect(taskAgentFunction).toContain('event: \'gmail_reply_received\'')
    expect(taskAgentFunction).toContain('Date.now() + 1_500')
    expect(mainUi).toContain("run.status === 'waiting_external'")
    expect(mainUi).toContain('setInterval(() => void pollWaitingAgentRuns(), 5_000)')
  })

  it('exposes a same-run new-instruction path after a scheduling decline', () => {
    expect(taskAgentFunction).toContain('restartingDeclinedNegotiation')
    expect(taskAgentFunction).toContain('New authoritative scheduling instruction: ${value}')
    expect(taskAgentFunction).toContain('recoverable_with_new_user_instruction: true')
    const terminalDecline = taskAgentFunction.slice(
      taskAgentFunction.indexOf('safeString(current.context?.negotiation_status, 40) === \'declined\''),
      taskAgentFunction.indexOf('let history = await loadModelHistory(admin, current)'),
    )
    expect(terminalDecline).toContain("status: 'needs_context'")
    expect(mainUi).toContain("context && existing?.status === 'needs_context' && existing.durable")
  })

  it('blocks exact context-question loops after the user has already answered', () => {
    expect(taskAgentFunction).toContain('answered_context_questions')
    expect(taskAgentFunction).toContain('answeredQuestions.includes(normalizedQuestion)')
    expect(taskAgentFunction).toContain("error_code: 'duplicate_context_question'")
  })

  it('does not allow a scheduling Calendar write before attendee agreement exists', () => {
    const guard = taskAgentFunction.slice(
      taskAgentFunction.indexOf('function schedulingToolGuard'),
      taskAgentFunction.indexOf('function calendarMustPrecedeEmail'),
    )
    expect(guard).toContain("if (run.capability !== 'scheduling') return null")
    expect(guard).toContain("'calendar.create_event', 'calendar.update_event', 'calendar.delete_event'")
    expect(guard).toContain('!negotiationIsAgreed(run)')
  })

  it('does not route personal Calendar availability checks through attendee negotiation', () => {
    expect(specialistSource).toContain('calendarCoordinationIsAffirmed')
    expect(specialistSource).not.toContain('if (hasCalendar && hasScheduling && (')
    expect(taskAgentFunction).toContain('calendarAttendeeCoordinationIsAffirmed')
  })

  it('never starts an unscoped reply watch that could accept an unknown sender', () => {
    expect(taskAgentFunction).toContain('negotiationWatchAttendees')
    expect(taskAgentFunction).toContain("error_code: 'negotiation_recipient_required'")
    expect(taskAgentFunction).toContain("expected_to.map(normalizeEmail)")
  })

  it('blocks external communication writes that the task explicitly negates', () => {
    expect(taskAgentFunction).toContain('function requestedCommunicationToolGuard')
    expect(taskAgentFunction).toContain("error_code: 'gmail_send_not_requested'")
    expect(taskAgentFunction).toContain("error_code: 'calendar_write_not_requested'")
    expect(taskAgentFunction).toContain("actionIsNegated(text, 'gmail_send')")
  })

  it('makes Calendar attendee notification intent explicit on both model and approval paths', () => {
    expect(taskAgentFunction).toContain('function calendarNotificationGuard')
    expect(taskAgentFunction).toContain("error_code: 'calendar_notification_required'")
    expect(taskAgentFunction).toContain("error_code: 'calendar_notification_not_requested'")
    expect(taskAgentFunction).toContain("requestedCommunicationToolGuard(current, toolName, argumentsValue)")
    expect(taskAgentFunction).toContain("requestedCommunicationToolGuard(run, action.tool_name, action.arguments as Record<string, unknown>)")
  })

  it('resolves named Roon recipients from a generic title plus its Description', () => {
    expect(taskAgentFunction).toContain('function namedRecipientsFromObjective(objective: string, description = \'\')')
    expect(taskAgentFunction).toContain('safeString(run.context?.description, 4_000)')
    expect(taskAgentFunction).toContain("evidence: 'user_provided_context'")
  })

  it('keeps selected-flight recovery bounded until the browser proves the handoff', () => {
    expect(taskAgentFunction).not.toContain('selectionElapsedMs')
    expect(taskAgentFunction).toContain('flightSelectionRecoveryCount')
    expect(taskAgentFunction).toContain("'flight_selection_failed'")
    expect(taskAgentFunction).toContain("p_run_id: run.id")
    expect(demoFlightHandoffMigration).toContain('create or replace function public.complete_demo_flight_handoff')
    expect(activeDemoFlightHandoffMigration).toContain("status in ('planning', 'running', 'waiting_external', 'waiting_for_user')")
    expect(demoFlightHandoffMigration).toContain("task_completion_policy = 'payment_handoff'")
    expect(mainUi).toContain('monitorDemoFlightHandoff(taskId, updated.id)')
    expect(mainUi).toContain("const flightHandoffLabel = 'Continue to payment'")
    expect(activeDemoFlightHandoffMigration).toContain("status in ('planning', 'running', 'waiting_external', 'waiting_for_user')")
  })

  it('routes every selected flight through the task-owned browser worker', () => {
    const selection = taskAgentFunction.slice(
      taskAgentFunction.indexOf('async function selectFlightOption'),
      taskAgentFunction.indexOf('async function advanceRun'),
    )
    expect(selection).toContain('return queueFlightSelectionOperation')
    expect(selection).not.toContain("complete_demo_flight_handoff")
    expect(taskAgentFunction).toContain("type: 'select_flight'")
    expect(taskAgentFunction).toContain('SHOTCOUNT_BROWSER_SELECTION_WORKER_URL')
  })

  it('keeps the selected flight visible in the completed payment handoff', () => {
    expect(mainUi).toContain('class="agent-selected-flight"')
    expect(mainUi).toContain('Selected flight')
    expect(mainUi).toContain('selectedReturnFlight')
    expect(mainUi).toContain('Return flight')
  })

  it('routes both visible microphone buttons through one capture pipeline', () => {
    expect(mainUi).toContain('data-action="toggle-description-voice"')
    expect(mainUi).toContain('data-action="toggle-today-description-voice"')
    expect(mainUi).toContain("toggleDescriptionVoiceInput('today-composer')")
  })

  it('does not let the background sweep replay isolated flight progress', () => {
    expect(agentWatchSweepFunction).toContain(".neq('capability', 'flight_search')")
    expect(mainUi).toContain('agentProgressTimeline')
    expect(mainUi).not.toContain('Continuing the task')
  })

  it('keeps active recovery work out of the completed progress history', () => {
    expect(taskAgentFunction).toContain('is correcting the saved portal section after the site reported required fields.')
    expect(taskAgentFunction).not.toContain('The portal reported required fields; David is correcting the saved section.')
    expect(taskAgentFunction).toContain('progressCurrent(retryRun, toolProgressLabel(retryRun, toolName))')
    expect(taskAgentFunction).toContain('progressCurrent(run, toolProgressLabel(run, action.tool_name))')
  })

  it('persists browser search and selection evidence on the same run', () => {
    expect(taskAgentFunction).toContain('preferValidatedFlightEvidence')
    expect(taskAgentFunction).toContain('Could not persist the validated flight result.')
    expect(taskAgentFunction).toContain('Could not persist the verified flight handoff.')
    expect(taskAgentFunction).toContain("context: { ...(run.context ?? {}),")
    expect(taskAgentFunction).toContain('flight_search_evidence')
    expect(taskAgentFunction).toContain('flight_handoff_evidence')
    expect(taskAgentFunction).toContain('providerEvidence')
    expect(browserWorker).toContain('payment_boundary_reached: paymentBoundaryReached')
  })

  it('does not overwrite a verified flight handoff with a retry payload', () => {
    expect(taskAgentFunction).toContain('A later search response is never allowed to replace a verified payment')
    expect(taskAgentFunction).toContain('if (run.result?.selectedFlight && existingHandoff) return run')
    expect(taskAgentFunction).toContain('payment_boundary_reached: output.paymentBoundaryReached === true')
    expect(taskAgentFunction).toContain('workerSelectedId !== safeString(expectedOption.id, 128)')
  })

  it('keeps flight selection idempotent and never follows a payment action', () => {
    expect(taskAgentFunction).toContain("'browser.select_flight', 'browser.prepare_flight_checkout'")
    expect(taskAgentFunction).toContain("'browser.submit', 'browser.search_flights'")
    expect(taskAgentFunction).toContain('operation again')
    expect(taskAgentFunction).toContain("complete_demo_flight_handoff")
    expect(taskAgentFunction).toContain("policy.risk === 'financial'")
    expect(agentTools).toContain("'browser.purchase'")
    expect(flightBrowser).toContain('public_provider_selection_clicked')
    expect(flightBrowser).toContain('maximumPublicProviderSelectionAttempts')
  })

  it('reopens an explicit flight retry without creating a second action row', () => {
    expect(taskAgentFunction).toContain("let action = await recordAction(admin, run, 'browser.select_flight'")
    expect(taskAgentFunction).toContain(".eq('id', action.id).eq('status', 'failed')")
    expect(taskAgentFunction).toContain("error_code: 'browser_worker_pending'")
    expect(taskAgentFunction).toContain('recovery_attempt: Number(action.recovery_attempt ?? 0) + 1')
  })

  it('uses the canonical payment-handoff intent when accepting a saved flight choice', () => {
    const selector = taskAgentFunction.slice(
      taskAgentFunction.indexOf('async function selectFlightOption'),
      taskAgentFunction.indexOf('async function advanceRun'),
    )
    expect(selector).toContain('flightPaymentHandoffRequested(run)')
    expect(selector).toContain("'browser_retry_exhausted', 'agent_execution_error', 'flight_provider_handoff_unavailable'")
    expect(selector).not.toContain("run.task_completion_policy !== 'payment_handoff'")
  })

  it('keeps validated flight choices visible after a bounded provider retry failure', () => {
    expect(mainUi).toContain("run.capability === 'flight_search'")
    expect(mainUi).toContain('!run.result?.selectedFlight')
    expect(mainUi).toContain("Choose a saved itinerary to retry the provider handoff.")
    expect(mainUi).toContain("status: 'waiting_for_user'")
    expect(taskAgentFunction).toContain('bounded recovery. Choose a saved itinerary')
    expect(taskAgentFunction).toContain('bounded_recovery_exhausted: true')
  })

  it('continues automatic flight selection into checkout on the same model turn', () => {
    expect(taskAgentFunction).toContain('continuationCallId = \'\'')
    expect(taskAgentFunction).toContain("recordAction(admin, run, 'browser.select_flight', continuationCallId")
    expect(taskAgentFunction).toContain('safeString(actionResult.data?.model_call_id, 256)')
    expect(taskAgentFunction).toContain('function browserContinuationCallId')
    expect(taskAgentFunction).toContain(".eq('tool_name', 'browser.search_flights')")
    expect(taskAgentFunction).toContain("run.capability === 'flight_search'")
  })

  it('prepares airline traveler details without crossing the payment boundary', () => {
    expect(agentTools).toContain("name: 'browser.prepare_flight_checkout'")
    expect(agentTools).toContain('Never provide payment details to this tool')
    expect(taskAgentFunction).toContain('flightCheckoutRequested')
    expect(taskAgentFunction).toContain('flight_checkout_evidence')
    expect(taskAgentFunction).toContain("flight_checkout_missing_details")
    expect(taskAgentFunction).toContain("flight_checkout_passenger_mismatch")
    expect(flightCheckout).toContain("flight_checkout_user_intervention")
    expect(flightCheckout).toContain('export async function prepareFlightCheckout')
    expect(flightCheckout).toContain('isSafeFlightCheckoutAdvanceLabel')
    expect(flightCheckout).toContain('safeGoogleFlightsBookingUrl')
    expect(flightCheckout).toContain('date_of_birth_month')
    expect(browserWorker).toContain("flight_checkout_timeout")
    expect(taskAgentFunction).toContain("flight_checkout_retry_exhausted")
    expect(taskAgentFunction).toContain('!result.flightCheckout')
    expect(mainUi).toContain('preparedTravelerCount')
    expect(mainUi).toContain('flightCheckoutReady')
    expect(mainUi).toContain('manualCheckoutStep')
  })

  it('replaces stale airport choices with trip-type choices', () => {
    expect(taskAgentFunction).toContain('function flightTripTypeContextOptions')
    expect(taskAgentFunction).toContain('const flightAirportOptions = run.capability === \'flight_search\'')
    expect(taskAgentFunction).toContain('run.capability === \'flight_search\' && !flightAirportOptions.length')
    expect(taskAgentFunction).toContain('suggestedOptions = flightTripOptions')
    expect(taskAgentFunction).toContain('scheduling_options: suggestedOptions')
    expect(mainUi).toContain("tripTypeOptions ? 'Choose your trip type, or add the return date below.'")
    expect(mainUi).toContain('todayComposerDraft.description = appendTranscript(todayComposerDraft.description, transcript)')
  })

  it('reclaims stalled safe browser work without retrying submissions', () => {
    expect(taskAgentFunction).toContain("code: 'browser_worker_timeout'")
    expect(taskAgentFunction).toContain("retryable: checkpoint.pendingOperation!.type !== 'submit'")
    expect(taskAgentFunction).toContain('workerTimeoutMs')
    expect(taskAgentFunction).toContain('browserSelectionWorkerTimeoutMs')
    expect(taskAgentFunction).toContain('? browserSelectionWorkerTimeoutMs')
    expect(taskAgentFunction).toContain('Date.now() - updatedAt > workerTimeoutMs')
    expect(taskAgentFunction).toContain('safeBrowserRetryDelayMs')
    expect(taskAgentFunction).toContain('browserRetryPrerequisiteSatisfied')
    expect(taskAgentFunction).toContain('A stale checkout action can sit later in the ledger')
    expect(flightBrowser).toContain('const browser = await launchBrowser()')
    expect(flightBrowser).not.toContain('sharedBrowserPromise')
  })

  it('reaches the configured provider fallback after an exhausted Google handoff', () => {
    expect(taskAgentFunction).toContain('providerFallbackRecoveryAvailable')
    expect(taskAgentFunction).toContain('Trying the configured public flight provider fallback.')
    expect(taskAgentFunction).toContain('flight_provider_fallback_recovery_attempts')
    expect(taskAgentFunction).toContain('function configuredFlightProviderDomains')
    expect(taskAgentFunction).toContain('SHOTCOUNT_FLIGHT_PROVIDER_BASE_URL')
    expect(taskAgentFunction).toContain('allowed_domains: expandedDomains')
    expect(flightBrowser).toContain('const currentSelector = await visibleButtonByText')
    expect(flightBrowser).toContain('currency list behind a second control')
  })

  it('isolates flight selection from the search worker process pool', () => {
    expect(taskAgentFunction).toContain('SHOTCOUNT_BROWSER_SELECTION_WORKER_URL')
    expect(taskAgentFunction).toContain("['select_flight', 'prepare_flight_checkout'].includes(operation.type)")
    expect(browserSelectWorker).toContain("from './browser-worker.js'")
  })

  it('refreshes a stale flight selection instead of stranding the user on an invalid option', () => {
    expect(taskAgentFunction).toContain('function flightSearchArgumentsFromCheckpoint')
    expect(taskAgentFunction).toContain('async function refreshFlightOptions')
    expect(taskAgentFunction).toContain("'selection_checkpoint_mismatch'")
    expect(taskAgentFunction).toContain("'flight_option_invalid'")
    expect(taskAgentFunction).toContain("'flight_search_checkpoint_missing'")
    expect(taskAgentFunction).toContain("waiting_reason: 'Refreshing live flight options.'")
    expect(taskAgentFunction).toContain("'user_requested_refresh'")
  })

  it('does not repeat answered pre-search flight context or hand back before selection', () => {
    expect(taskAgentFunction).toContain('flight_context_answers')
    expect(taskAgentFunction).toContain('flight_context_pending')
    expect(taskAgentFunction).toContain('flightContextFields')
    expect(taskAgentFunction).toContain('pendingFlightFields')
    expect(taskAgentFunction).toContain('remainingFlightFields')
    expect(taskAgentFunction).toContain('context_already_provided')
    expect(taskAgentFunction).toContain('Used the flight detail already provided.')
    expect(taskAgentFunction).toContain('flightPaymentHandoffRequested')
    expect(taskAgentFunction).toContain('best_matching_live_option')
    expect(taskAgentFunction).toContain('flight_handoff_evidence')
    expect(taskAgentFunction).toContain('payment_boundary_reached: true')
    expect(taskAgentFunction).toContain('preserveFlightResult')
    expect(taskAgentFunction).toContain('flight_context_owner_specialist_id')
    expect(taskAgentFunction).toContain('flightContextQuestion')
    expect(taskAgentFunction).toContain('fields: [requestedFlightField]')
    expect(taskAgentFunction).toContain('flight_context_owner_specialist_id: remainingFlightFields.length ? \'roon\' : null')
    expect(taskAgentFunction).toContain('Roon owns traveler and contact questions.')
  })

  it('keeps flight recovery bounded and separates provider intervention from retries', () => {
    expect(taskAgentFunction).toContain('workerAttemptsByOperation')
    expect(taskAgentFunction).toContain('browserOperationAttemptCount')
    expect(taskAgentFunction).toContain('isBrowserUserInterventionFailure')
    expect(taskAgentFunction).toContain('isFlightConstraintFailure')
    expect(taskAgentFunction).toContain('flightTripShapeNeedsUserDecision')
    expect(taskAgentFunction).toContain('unsupportedFlightConstraint')
    expect(taskAgentFunction).toContain('flight_flexible_dates_unsupported')
    expect(taskAgentFunction).toContain('flight_constraint_unsupported')
    expect(taskAgentFunction).toContain('children_ages')
    expect(taskAgentFunction).toContain('departure_time_window')
    expect(taskAgentFunction).toContain('selectedReturnFlight')
    expect(flightBrowser).toContain('isFlightResultCardText')
    expect(flightBrowser).toContain('flight_provider_challenge')
    expect(flightBrowser).toContain('stale_result_cards')
    expect(flightBrowser).toContain('arrivalDayOffset')
    expect(flightBrowser).toContain('flightOptionSatisfiesConstraints')
    expect(flightBrowser).toContain('safeExternalProviderHandoffUrl')
  })

  it('keeps delayed-reply simulation behind explicit development gates', () => {
    expect(taskAgentFunction).toContain("Deno.env.get('SHOTCOUNT_ENABLE_DEMO_REPLY_SIMULATION') !== 'true'")
    expect(agentClient).toContain("{ action: 'simulate_reply', runId, simulationReply }")
    expect(mainUi).toContain("previewParams.get('agentDev') === '1'")
    expect(mainUi).toContain("data-action=\"simulate-agent-reply\"")
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

  it('ships a restrictive browser security policy', () => {
    const deployment = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as { headers?: Array<{ headers: Array<{ key: string; value: string }> }> }
    const headers = new Map(deployment.headers?.flatMap(rule => rule.headers).map(header => [header.key, header.value]))
    expect(headers.get('Content-Security-Policy')).toContain("script-src 'self'")
    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(headers.get('Content-Security-Policy')).toContain("frame-src 'self' blob: https://*.supabase.co")
    expect(headers.get('Content-Security-Policy')).toContain("object-src 'none'")
    expect(headers.get('Content-Security-Policy')).toContain("style-src-elem 'self'")
    expect(headers.get('Content-Security-Policy')).toContain("style-src-attr 'unsafe-inline'")
    expect(headers.get('Content-Security-Policy')).not.toContain("style-src 'self' 'unsafe-inline'")
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
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
    expect(sender).toContain('deliverPushWithOutbox')
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
