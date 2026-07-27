import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  agentToolDefinitions,
  internalAgentToolName,
  openAIToolName,
  policyForAgentTool,
  validateAgentToolArguments,
} from '../../supabase/functions/_shared/agent-tools.ts'
import { apiKeys, fixture as liveFixture } from '../agent-execution-live/run-live.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const projectRef = 'bhhutexqrxzbbhatepmh'
const supabaseUrl = `https://${projectRef}.supabase.co`
const shotcountUrl = `${supabaseUrl}/functions/v1/task-agent-luna-smoke`
const genericUrl = `${supabaseUrl}/functions/v1/durable-luna-generic`
const pricing = { input: 1.25, cachedInput: 0.125, cacheWrite: 1.5625, output: 7.5 }
const resultsDir = resolve(here, 'results')
const checkpointDir = resolve(resultsDir, 'checkpoints')
mkdirSync(checkpointDir, { recursive: true })

type Integration = { user_id: string; account_email: string; scopes: string[]; status: string }
type Scenario = { id: 'reply-calendar' | 'timed-follow-up' | 'restart-recovery' | 'approval-persistence'; title: string; description: string; subject: string; calendarSummary?: string; start?: string; end?: string; restart: boolean; approvalRestart: boolean; timer: boolean }
type Action = { tool: string; status: string; providerActionId: string | null; arguments: Record<string, any>; output: Record<string, any> | null; idempotencyKey: string }
type Usage = { input: number; cached: number; cacheWrite: number; output: number; calls: number }
type GenericState = {
  id: string; scenarioId: string; conversationId: string; status: string; actions: Action[]; events: Array<Record<string, any>>;
  approvals: Array<Record<string, any>>; pendingCall: null | { callId: string; tool: string; arguments: Record<string, any>; hash: string };
  waitingCall: null | { callId: string; threadId: string; sentMessageId: string; contactEmail: string; since: string };
  usage: Usage; history: any[]; completedSummary: string; failure: string;
}

const sleep = (ms: number) => new Promise(resolvePromise => setTimeout(resolvePromise, ms))
const nonce = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10)
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const isoDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const futureWeekday = (weekday: number, hour: number) => {
  const now = new Date()
  const local = new Date(`${isoDay(now)}T12:00:00+01:00`)
  let delta = (weekday - local.getDay() + 7) % 7
  if (delta < 2) delta += 7
  const day = new Date(local.getTime() + delta * 86_400_000)
  return `${isoDay(day)}T${String(hour).padStart(2, '0')}:00:00+01:00`
}
const plusMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString().replace('.000Z', '+00:00')
const todayLagos = () => isoDay(new Date())
async function fixture(secret: string, body: Record<string, any>) {
  const sourceId = String(body.benchmarkRunId ?? 'durable-luna-smoke')
  return liveFixture(secret, {
    ...body,
    benchmarkRunId: `shotcount-eval-live-v1/durable-smoke/run-1/${sha(sourceId).slice(0, 12)}`,
  })
}

function scenarios(secondaryEmail: string): Scenario[] {
  const tuesday = futureWeekday(2, 14)
  const wednesday = futureWeekday(3, 15)
  const stamp = nonce()
  return [
    {
      id: 'reply-calendar', restart: false, approvalRestart: false, timer: false,
      title: 'Coordinate a 30-minute meeting', subject: `[Durable Luna ${stamp}] Reply calendar`, calendarSummary: `Durable Luna reply calendar ${stamp}`,
      start: tuesday, end: plusMinutes(tuesday, 30),
      description: `Email ${secondaryEmail} with subject "[Durable Luna ${stamp}] Reply calendar" asking for availability next week. Wait for the reply. When they confirm Tuesday at 2:00 PM Africa/Lagos, check Calendar and create exactly one 30-minute event titled "Durable Luna reply calendar ${stamp}" with them as attendee.`,
    },
    {
      id: 'timed-follow-up', restart: false, approvalRestart: false, timer: true,
      title: 'Follow up once after two minutes', subject: `[Durable Luna ${stamp}] Timed follow-up`,
      description: `Email ${secondaryEmail} with subject "[Durable Luna ${stamp}] Timed follow-up" asking for availability. If no reply arrives within 2 minutes, send exactly one follow-up in the same thread. Do not send another follow-up. Keep the task waiting because the dependency remains unresolved.`,
    },
    {
      id: 'restart-recovery', restart: true, approvalRestart: false, timer: false,
      title: 'Coordinate a meeting across restart', subject: `[Durable Luna ${stamp}] Restart recovery`, calendarSummary: `Durable Luna restart recovery ${stamp}`,
      start: tuesday, end: plusMinutes(tuesday, 30),
      description: `Email ${secondaryEmail} with subject "[Durable Luna ${stamp}] Restart recovery" asking for availability next week. Wait for the reply. When they confirm Tuesday at 2:00 PM Africa/Lagos, check Calendar and create exactly one 30-minute event titled "Durable Luna restart recovery ${stamp}" with them as attendee.`,
    },
    {
      id: 'approval-persistence', restart: false, approvalRestart: true, timer: false,
      title: 'Create an approved calendar event', subject: '', calendarSummary: `Durable Luna approval persistence ${stamp}`,
      start: wednesday, end: plusMinutes(wednesday, 30),
      description: `Create exactly one 30-minute Calendar event titled "Durable Luna approval persistence ${stamp}" on ${wednesday.slice(0, 10)} at 3:00 PM Africa/Lagos and add ${secondaryEmail} as attendee. Use the normal approval boundary and do not complete until Calendar confirms creation.`,
    },
  ]
}

function deploy(slug: 'task-agent-luna-smoke' | 'durable-luna-generic') {
  execFileSync('npx', ['supabase', 'functions', 'deploy', slug, '--project-ref', projectRef, '--no-verify-jwt'], { cwd: root, stdio: 'pipe' })
}

async function endpoint(url: string, secret: string, body: Record<string, unknown>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, apikey: secret, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json().catch(() => ({})) as Record<string, any>
      if (!response.ok) throw new Error(String(payload.error?.message ?? payload.error ?? `Endpoint ${response.status}`))
      return payload
    } catch (error) {
      lastError = error
      if (attempt < 2) await sleep(800 * (attempt + 1))
    }
  }
  throw lastError
}

async function userSession(admin: any, publicKey: string, userId: string) {
  const userResult = await admin.auth.admin.getUserById(userId)
  const email = userResult.data.user?.email
  if (!email) throw new Error('Benchmark user email unavailable.')
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link.data.properties?.hashed_token
  const publicClient = createClient(supabaseUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const verified = await publicClient.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (!verified.data.session?.access_token) throw new Error('Could not create benchmark user session.')
  return verified.data.session.access_token
}

async function invokeShotCount(accessToken: string, publicKey: string, body: Record<string, unknown>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(shotcountUrl, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json().catch(() => ({})) as Record<string, any>
      if (!response.ok) throw new Error(String(payload.error?.message ?? payload.error ?? `ShotCount endpoint ${response.status}`))
      return payload
    } catch (error) {
      lastError = error
      if (attempt < 2) await sleep(800 * (attempt + 1))
    }
  }
  throw lastError
}

async function loadShotCount(admin: any, runId: string) {
  const [run, actions, approvals, events, watches] = await Promise.all([
    admin.from('agent_runs').select('*').eq('id', runId).single(),
    admin.from('agent_actions').select('*').eq('run_id', runId).order('created_at'),
    admin.from('agent_approvals').select('*').eq('run_id', runId).order('created_at'),
    admin.from('agent_run_events').select('*').eq('run_id', runId).order('created_at'),
    admin.from('agent_email_watches').select('*').eq('run_id', runId),
  ])
  if (run.error) throw new Error(run.error.message)
  return { run: run.data, actions: actions.data ?? [], approvals: approvals.data ?? [], events: events.data ?? [], watches: watches.data ?? [] }
}

async function sendReply(secret: string, id: string, primary: Integration, secondary: Integration, subject: string) {
  const search = await fixture(secret, { action: 'google_tool', benchmarkRunId: id, userId: secondary.user_id, toolName: 'gmail.search_messages', arguments: { query: `from:${primary.account_email} subject:${JSON.stringify(subject)} newer_than:1d`, max_results: 10 } })
  const candidate = search.value?.messages?.[0]
  if (!candidate?.id) throw new Error(`Controlled recipient did not receive ${subject}.`)
  const message = await fixture(secret, { action: 'google_tool', benchmarkRunId: id, userId: secondary.user_id, toolName: 'gmail.read_message', arguments: { message_id: candidate.id } })
  await fixture(secret, { action: 'send_fixture_email', benchmarkRunId: `${id}-reply`, userId: secondary.user_id, arguments: { to: [primary.account_email], subject: `Re: ${subject}`, body_text: 'Tuesday at 2:00 PM Africa/Lagos works for me.', thread_id: candidate.thread_id, in_reply_to_message_id: candidate.id } })
  return { threadId: candidate.thread_id, sentMessageId: candidate.id, receivedSubject: message.value?.subject }
}

function usageFromEvents(events: Array<Record<string, any>>): Usage {
  return events.filter(event => event.event_type === 'agent_model_response').reduce((total, event) => {
    const usage = event.metadata?.usage ?? {}; total.calls += 1; total.input += Number(usage.input_tokens ?? 0); total.cached += Number(usage.input_tokens_details?.cached_tokens ?? 0); total.cacheWrite += Number(usage.input_tokens_details?.cache_write_tokens ?? 0); total.output += Number(usage.output_tokens ?? 0); return total
  }, { input: 0, cached: 0, cacheWrite: 0, output: 0, calls: 0 })
}
function cost(usage: Usage) { return ((Math.max(0, usage.input - usage.cached - usage.cacheWrite) * pricing.input) + usage.cached * pricing.cachedInput + usage.cacheWrite * pricing.cacheWrite + usage.output * pricing.output) / 1_000_000 }

const genericTools = agentToolDefinitions.map(tool => ({ ...tool, name: openAIToolName(tool.name), description: tool.name === 'gmail.wait_for_reply' ? 'Pause this same task until the Gmail thread receives a reply or the application deadline fires.' : tool.description }))
function genericInstructions() {
  return [
    'You are a competent minimal execution agent. Treat TITLE and DESCRIPTION together as the complete task.',
    'Use observed tool results only. Never claim an external action occurred without provider confirmation.',
    'The application pauses and later resumes this same OpenAI Conversation for external replies, deadlines, restarts, and approvals.',
    'Sending email and writing Calendar require approval, which the tool layer will pause for.',
    'For a timed follow-up, send the initial email, wait for reply, then if the deadline output says no reply, send exactly one follow-up in the same thread and wait again.',
    'A reply-to-Calendar workflow is complete only after the reply is observed and the Calendar event is provider-confirmed.',
    'Call agent__complete only after the requested real-world state is achieved. Keep unresolved dependencies waiting.',
    'Do not expose hidden reasoning.',
  ].join(' ')
}

const checkpointName = (id: string) => `${id.replaceAll('/', '-')}.json`
async function saveGeneric(state: GenericState) { writeFileSync(resolve(checkpointDir, checkpointName(state.id)), `${JSON.stringify(state, null, 2)}\n`) }
function reloadGeneric(id: string): GenericState { return JSON.parse(readFileSync(resolve(checkpointDir, checkpointName(id)), 'utf8')) }

async function executeGenericTool(state: GenericState, secret: string, primary: Integration, tool: string, args: Record<string, any>, callId: string) {
  const idempotencyKey = `${state.id}:${state.actions.length}:${tool}`
  const policy = policyForAgentTool(tool)
  if (policy.approvalKind) {
    const hash = sha({ tool, args })
    state.pendingCall = { callId, tool, arguments: args, hash }
    state.approvals.push({ tool, status: 'pending', hash, createdAt: new Date().toISOString() })
    state.status = 'needs_approval'; await saveGeneric(state); return null
  }
  if (tool === 'gmail.wait_for_reply') {
    state.waitingCall = { callId, threadId: String(args.thread_id), sentMessageId: String(args.sent_message_id), contactEmail: String(args.contact_email ?? ''), since: new Date().toISOString() }
    state.status = 'waiting_external'; state.events.push({ type: 'waiting_external', at: new Date().toISOString() }); await saveGeneric(state); return null
  }
  if (tool === 'agent.complete') {
    state.status = 'completed'; state.completedSummary = String(args.summary ?? ''); state.events.push({ type: 'completed', at: new Date().toISOString() }); await saveGeneric(state); return null
  }
  if (tool === 'agent.request_context') {
    state.status = 'needs_context'; state.failure = 'The model requested user re-explanation.'; await saveGeneric(state); return null
  }
  const result = await fixture(secret, { action: 'google_tool', benchmarkRunId: state.id, userId: primary.user_id, toolName: tool, arguments: args })
  const value = result.value ?? {}
  state.actions.push({ tool, status: 'succeeded', providerActionId: result.providerActionId ?? null, arguments: args, output: value, idempotencyKey })
  await saveGeneric(state)
  return { type: 'function_call_output', call_id: callId, output: JSON.stringify(value) }
}

async function continueGeneric(state: GenericState, secret: string, primary: Integration, input: any[]) {
  state.status = 'running'
  for (let turn = 0; turn < 20; turn += 1) {
    const requestInput = [...state.history, ...input]
    const payload = await endpoint(genericUrl, secret, { action: 'model', instructions: genericInstructions(), input: requestInput, tools: genericTools, metadata: { smoke_run_id: state.id } })
    const usage = payload.usage ?? {}; state.usage.calls += 1; state.usage.input += Number(usage.input_tokens ?? 0); state.usage.cached += Number(usage.input_tokens_details?.cached_tokens ?? 0); state.usage.cacheWrite += Number(usage.input_tokens_details?.cache_write_tokens ?? 0); state.usage.output += Number(usage.output_tokens ?? 0)
    state.history = [...requestInput, ...(payload.output ?? [])]
    await saveGeneric(state)
    const call = (payload.output ?? []).find((item: any) => item.type === 'function_call')
    if (!call) { input = [{ role: 'user', content: [{ type: 'input_text', text: 'Continue with the appropriate tool. Do not stop while the real task remains unresolved.' }] }]; continue }
    const tool = internalAgentToolName(String(call.name ?? ''))
    let args: Record<string, any>; try { args = JSON.parse(String(call.arguments ?? '{}')) } catch { args = {} }
    if (tool !== 'agent.complete' && !validateAgentToolArguments(tool, args)) { input = [{ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ error: 'bad_tool_arguments' }) }]; continue }
    const next = await executeGenericTool(state, secret, primary, tool, args, call.call_id)
    if (!next || !['running'].includes(state.status)) return state
    input = [next]
  }
  state.status = 'failed'; state.failure = 'Model loop exhausted.'; await saveGeneric(state); return state
}

async function approveGeneric(state: GenericState, secret: string, primary: Integration) {
  const pending = state.pendingCall
  if (!pending || sha({ tool: pending.tool, args: pending.arguments }) !== pending.hash) throw new Error('Generic approval scope changed.')
  const approval = state.approvals.find(item => item.status === 'pending' && item.hash === pending.hash)
  if (!approval) throw new Error('Generic approval was not persisted.')
  approval.status = 'approved'; approval.decidedAt = new Date().toISOString()
  const result = await fixture(secret, { action: 'google_tool', benchmarkRunId: state.id, userId: primary.user_id, toolName: pending.tool, arguments: pending.arguments })
  const value = result.value ?? {}; state.actions.push({ tool: pending.tool, status: 'succeeded', providerActionId: result.providerActionId ?? null, arguments: pending.arguments, output: value, idempotencyKey: `${state.id}:${state.actions.length}:${pending.tool}` })
  state.pendingCall = null; await saveGeneric(state)
  return continueGeneric(state, secret, primary, [{ type: 'function_call_output', call_id: pending.callId, output: JSON.stringify(value) }])
}

async function startGeneric(scenario: Scenario, secret: string, primary: Integration) {
  const id = `durable-luna-smoke/${scenario.id}/generic/${nonce()}`
  const state: GenericState = { id, scenarioId: scenario.id, conversationId: '', status: 'running', actions: [], events: [{ type: 'started', at: new Date().toISOString() }], approvals: [], pendingCall: null, waitingCall: null, usage: { input: 0, cached: 0, cacheWrite: 0, output: 0, calls: 0 }, history: [], completedSummary: '', failure: '' }
  await saveGeneric(state)
  return continueGeneric(state, secret, primary, [{ role: 'user', content: [{ type: 'input_text', text: `TITLE\n${scenario.title}\n\nDESCRIPTION\n${scenario.description}\n\nCURRENT CONTEXT\nDate: ${todayLagos()}\nTimezone: Africa/Lagos` }] }])
}

async function resumeGenericReply(state: GenericState, secret: string, primary: Integration) {
  const waiting = state.waitingCall; if (!waiting) throw new Error('Generic run has no persisted reply wait.')
  const thread = await fixture(secret, { action: 'google_tool', benchmarkRunId: state.id, userId: primary.user_id, toolName: 'gmail.read_thread', arguments: { thread_id: waiting.threadId } })
  const messages = thread.value?.messages ?? []
  const reply = messages.find((message: any) => !((message.labels ?? []).includes('SENT')) && String(message.id) !== waiting.sentMessageId)
  if (!reply) throw new Error('Controlled reply was not observed in the persisted thread.')
  state.waitingCall = null; state.events.push({ type: 'resumed_external', at: new Date().toISOString(), messageId: reply.id }); await saveGeneric(state)
  return continueGeneric(state, secret, primary, [{ type: 'function_call_output', call_id: waiting.callId, output: JSON.stringify({ reply_received: true, thread_id: waiting.threadId, message: reply, untrusted_external_content: true }) }])
}

async function resumeGenericDeadline(state: GenericState, secret: string, primary: Integration) {
  const waiting = state.waitingCall; if (!waiting) throw new Error('Generic run has no persisted deadline wait.')
  state.waitingCall = null; state.events.push({ type: 'deadline_fired', at: new Date().toISOString() }); await saveGeneric(state)
  return continueGeneric(state, secret, primary, [{ type: 'function_call_output', call_id: waiting.callId, output: JSON.stringify({ reply_received: false, deadline_elapsed: true, elapsed_minutes: 2, thread_id: waiting.threadId }) }])
}

async function sentThread(secret: string, id: string, primary: Integration, subject: string) {
  const search = await fixture(secret, { action: 'google_tool', benchmarkRunId: id, userId: primary.user_id, toolName: 'gmail.search_messages', arguments: { query: `in:sent subject:${JSON.stringify(subject)} newer_than:1d`, max_results: 20 } })
  const messages = search.value?.messages ?? []
  if (!messages[0]?.thread_id) return { messages: [], threadId: '' }
  const thread = await fixture(secret, { action: 'google_tool', benchmarkRunId: id, userId: primary.user_id, toolName: 'gmail.read_thread', arguments: { thread_id: messages[0].thread_id } })
  return { messages: thread.value?.messages ?? [], threadId: messages[0].thread_id }
}

async function calendarEvents(secret: string, id: string, primary: Integration, scenario: Scenario) {
  if (!scenario.start || !scenario.end) return []
  const result = await fixture(secret, { action: 'google_tool', benchmarkRunId: id, userId: primary.user_id, toolName: 'calendar.list_events', arguments: { calendar_id: 'primary', time_min: new Date(Date.parse(scenario.start) - 3_600_000).toISOString(), time_max: new Date(Date.parse(scenario.end) + 3_600_000).toISOString(), max_results: 50 } })
  return (result.value?.events ?? []).filter((event: any) => event.summary === scenario.calendarSummary)
}

async function verify(scenario: Scenario, harness: 'shotcount' | 'generic', state: any, secret: string, primary: Integration) {
  const id = harness === 'shotcount' ? String(state.run.context?.benchmark_run_id ?? state.run.id) : state.id
  const thread = scenario.subject ? await sentThread(secret, id, primary, scenario.subject) : { messages: [], threadId: '' }
  const sent = thread.messages.filter((message: any) => (message.labels ?? []).includes('SENT'))
  const events = await calendarEvents(secret, id, primary, scenario)
  const actions = harness === 'shotcount' ? state.actions.map((action: any) => ({ tool: action.tool_name, status: action.status, providerActionId: action.provider_action_id, arguments: action.arguments })) : state.actions
  const writes = actions.filter((action: any) => action.status === 'succeeded' && ['gmail.send_message', 'calendar.create_event', 'calendar.update_event'].includes(action.tool))
  const duplicate = new Set(writes.map((action: any) => `${action.tool}:${action.providerActionId ?? ''}`)).size !== writes.length || events.length > 1
  let success = false
  if (scenario.id === 'timed-follow-up') success = sent.length === 2 && events.length === 0 && (harness === 'shotcount' ? state.run.status : state.status) === 'waiting_external'
  else if (scenario.id === 'approval-persistence') success = events.length === 1 && (harness === 'shotcount' ? state.run.status : state.status) === 'completed'
  else success = sent.length === 1 && events.length === 1 && (harness === 'shotcount' ? state.run.status : state.status) === 'completed'
  return { success: success && !duplicate, sentCount: sent.length, calendarCount: events.length, duplicate, writes, threadId: thread.threadId, events }
}

async function cleanup(secret: string, id: string, primary: Integration, verification: any) {
  for (const event of verification.events ?? []) await fixture(secret, { action: 'google_tool', benchmarkRunId: id, userId: primary.user_id, toolName: 'calendar.delete_event', arguments: { calendar_id: 'primary', event_id: event.id, notify_attendees: false } }).catch(() => {})
}

async function runShotCount(scenario: Scenario, admin: any, accessToken: string, publicKey: string, secret: string, primary: Integration, secondary: Integration) {
  const id = `durable-luna-smoke/${scenario.id}/shotcount/${nonce()}`
  const started = Date.now()
  const start = await invokeShotCount(accessToken, publicKey, { action: 'start', taskId: crypto.randomUUID(), title: scenario.title, description: scenario.description, context: '', due: todayLagos(), timezone: 'Africa/Lagos', benchmarkRunId: id })
  let state = await loadShotCount(admin, start.id); let replied = false; let restarted = false; let approvalRestarted = false; let deadlineWaited = false
  for (let turn = 0; turn < 80; turn += 1) {
    if (state.run.status === 'needs_approval') {
      const pending = state.approvals.find((approval: any) => approval.status === 'pending')
      if (!pending) break
      if (scenario.approvalRestart && !approvalRestarted) { deploy('task-agent-luna-smoke'); approvalRestarted = true; state = await loadShotCount(admin, start.id) }
      await invokeShotCount(accessToken, publicKey, { action: 'approve', approvalId: pending.id, approvalVersion: pending.version })
      state = await loadShotCount(admin, start.id); continue
    }
    if (state.run.status === 'waiting_external') {
      const waitAction = state.actions.find((action: any) => action.tool_name === 'gmail.wait_for_reply' && action.status === 'succeeded')
      if (scenario.timer && waitAction && !deadlineWaited) { deadlineWaited = true; await sleep(125_000); await invokeShotCount(accessToken, publicKey, { action: 'poll', runId: start.id }).catch(() => null); state = await loadShotCount(admin, start.id); break }
      if (waitAction && !replied) {
        if (scenario.restart && !restarted) { deploy('task-agent-luna-smoke'); restarted = true; state = await loadShotCount(admin, start.id) }
        await sendReply(secret, id, primary, secondary, scenario.subject); replied = true; await sleep(4_000)
      }
      await invokeShotCount(accessToken, publicKey, { action: 'poll', runId: start.id }).catch(() => null); await sleep(2_000); state = await loadShotCount(admin, start.id); continue
    }
    if (['completed', 'failed', 'cancelled', 'needs_context', 'waiting_for_user'].includes(state.run.status)) break
    await invokeShotCount(accessToken, publicKey, { action: 'poll', runId: start.id }).catch(() => null); await sleep(1_500); state = await loadShotCount(admin, start.id)
  }
  const verification = await verify(scenario, 'shotcount', state, secret, primary)
  const usage = usageFromEvents(state.events)
  const waitingEvent = state.events.find((event: any) => event.status === 'waiting_external')
  const resumedEvent = state.events.find((event: any) => event.event_type === 'agent_resumed')
  const result = { scenario: scenario.id, harness: 'ShotCount', model: 'gpt-5.6-luna', success: verification.success, execution_precision: verification.duplicate ? 0 : 1, user_reexplanation_required: state.run.status === 'needs_context', duplicate_or_unintended_side_effects: verification.duplicate, same_logical_run_resumed: scenario.id.includes('reply') || scenario.restart ? Boolean(resumedEvent && state.run.id === start.id) : true, restart_survival: scenario.restart ? Boolean(restarted && resumedEvent) : null, approval_state_survival: scenario.approvalRestart ? Boolean(approvalRestarted && state.approvals.some((approval: any) => approval.status === 'approved')) : null, time_to_resume_seconds: waitingEvent && resumedEvent ? Math.max(0, (Date.parse(resumedEvent.created_at) - Date.parse(waitingEvent.created_at)) / 1000) : null, inference_cost_usd: Number(cost(usage).toFixed(6)), final_state: state.run.status, failure_reason: verification.success ? '' : scenario.timer ? 'timer/deadline handling' : state.run.status === 'needs_approval' ? 'approval persistence' : state.run.status === 'completed' ? 'verification mismatch' : scenario.restart ? 'worker restart' : 'external-event resumption', run_id: state.run.id, usage, verification, actions: state.actions, approvals: state.approvals, events: state.events }
  await cleanup(secret, id, primary, verification)
  return result
}

async function runGeneric(scenario: Scenario, secret: string, primary: Integration, secondary: Integration) {
  const started = Date.now(); let state = await startGeneric(scenario, secret, primary); let restarted = false; let approvalRestarted = false
  for (let turn = 0; turn < 40; turn += 1) {
    if (state.status === 'needs_approval') {
      if (scenario.approvalRestart && !approvalRestarted) { deploy('durable-luna-generic'); approvalRestarted = true; state = reloadGeneric(state.id) }
      state = await approveGeneric(state, secret, primary); continue
    }
    if (state.status === 'waiting_external') {
      if (scenario.timer) { await sleep(Math.max(0, 125_000 - (Date.now() - started))); state = reloadGeneric(state.id); state = await resumeGenericDeadline(state, secret, primary); if (state.status === 'needs_approval') continue; break }
      if (scenario.restart && !restarted) { deploy('durable-luna-generic'); restarted = true; state = reloadGeneric(state.id) }
      await sendReply(secret, state.id, primary, secondary, scenario.subject); await sleep(4_000); state = reloadGeneric(state.id); state = await resumeGenericReply(state, secret, primary); continue
    }
    if (['completed', 'failed', 'needs_context', 'waiting_for_user'].includes(state.status)) break
  }
  const verification = await verify(scenario, 'generic', state, secret, primary)
  const waitingEvent = state.events.find(event => event.type === 'waiting_external')
  const resumedEvent = state.events.find(event => event.type === 'resumed_external' || event.type === 'deadline_fired')
  const result = { scenario: scenario.id, harness: 'Minimal generic OpenAI agent', model: 'gpt-5.6-luna', success: verification.success, execution_precision: verification.duplicate ? 0 : 1, user_reexplanation_required: state.status === 'needs_context', duplicate_or_unintended_side_effects: verification.duplicate, same_logical_run_resumed: scenario.id.includes('reply') || scenario.restart ? Boolean(resumedEvent && state.id) : true, restart_survival: scenario.restart ? Boolean(restarted && resumedEvent) : null, approval_state_survival: scenario.approvalRestart ? Boolean(approvalRestarted && state.approvals.some(item => item.status === 'approved')) : null, time_to_resume_seconds: waitingEvent && resumedEvent ? Math.max(0, (Date.parse(resumedEvent.at) - Date.parse(waitingEvent.at)) / 1000) : null, inference_cost_usd: Number(cost(state.usage).toFixed(6)), final_state: state.status, failure_reason: verification.success ? '' : scenario.timer ? 'timer/deadline handling' : state.status === 'completed' ? 'premature completion' : scenario.restart ? 'worker restart' : 'external-event resumption', run_id: state.id, conversation_id: state.conversationId, usage: state.usage, verification, actions: state.actions, approvals: state.approvals, events: state.events }
  await cleanup(secret, state.id, primary, verification)
  if (state.conversationId) await endpoint(genericUrl, secret, { action: 'delete_conversation', conversationId: state.conversationId }).catch(() => {})
  return result
}

async function main() {
  const { secret, publicKey } = apiKeys()
  const admin = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const integrations = await admin.from('agent_integrations').select('user_id,account_email,scopes,status').eq('provider', 'google').eq('status', 'connected')
  if (integrations.error || (integrations.data ?? []).length < 2) throw new Error('Two controlled connected Google accounts are required.')
  const requestedPrimary = process.env.SHOTCOUNT_BENCHMARK_PRIMARY_EMAIL?.toLowerCase()
  const requestedSecondary = process.env.SHOTCOUNT_BENCHMARK_SECONDARY_EMAIL?.toLowerCase()
  const primary = (integrations.data as Integration[]).find(item => !requestedPrimary || item.account_email.toLowerCase() === requestedPrimary) ?? integrations.data![0] as Integration
  const secondary = (integrations.data as Integration[]).find(item => item.user_id !== primary.user_id && (!requestedSecondary || item.account_email.toLowerCase() === requestedSecondary)) as Integration
  if (!secondary) throw new Error('Controlled secondary Google account unavailable.')
  const accessToken = await userSession(admin, publicKey, primary.user_id)
  const scenarioPath = resolve(resultsDir, 'scenarios.json')
  let cases: Scenario[]
  try { cases = JSON.parse(readFileSync(scenarioPath, 'utf8')) } catch { cases = scenarios(secondary.account_email); writeFileSync(scenarioPath, `${JSON.stringify(cases, null, 2)}\n`) }
  const rawPath = resolve(resultsDir, 'raw.json')
  let allResults: any[] = []
  try { allResults = JSON.parse(readFileSync(rawPath, 'utf8')).runs ?? [] } catch {}
  for (const scenario of cases) {
    if (allResults.some(result => result.scenario === scenario.id && result.harness === 'ShotCount')) continue
    process.stdout.write(`ShotCount · ${scenario.id}\n`)
    const result = await runShotCount(scenario, admin, accessToken, publicKey, secret, primary, secondary)
    allResults.push(result); writeFileSync(rawPath, `${JSON.stringify({ generated_at: new Date().toISOString(), compressed_time: true, runs: allResults }, null, 2)}\n`)
    process.stdout.write(`  ${result.success ? 'PASS' : 'FAIL'} · ${result.failure_reason || 'verified'} · $${result.inference_cost_usd.toFixed(6)}\n`)
  }
  for (const scenario of cases) {
    if (allResults.some(result => result.scenario === scenario.id && result.harness === 'Minimal generic OpenAI agent')) continue
    process.stdout.write(`Generic · ${scenario.id}\n`)
    const result = await runGeneric(scenario, secret, primary, secondary)
    allResults.push(result); writeFileSync(rawPath, `${JSON.stringify({ generated_at: new Date().toISOString(), compressed_time: true, runs: allResults }, null, 2)}\n`)
    process.stdout.write(`  ${result.success ? 'PASS' : 'FAIL'} · ${result.failure_reason || 'verified'} · $${result.inference_cost_usd.toFixed(6)}\n`)
  }
}

await main()
