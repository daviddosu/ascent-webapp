import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildLiveTasks, liveTaskIds } from './live-tasks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const projectRef = 'bhhutexqrxzbbhatepmh'
const supabaseUrl = `https://${projectRef}.supabase.co`
const taskAgentUrl = `${supabaseUrl}/functions/v1/task-agent`
const fixtureUrl = `${supabaseUrl}/functions/v1/agent-benchmark-fixtures`
const model = 'gpt-5.6-sol'
const pricing = { input: 5, cachedInput: 0.5, cacheWrite: 6.25, output: 30 }
const maxCostUsd = 31.25 // Conservative £25 gate at $1.25/£.

function parseArgs() {
  const args = process.argv.slice(2)
  const value = name => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : ''
  }
  const selected = value('--tasks') || process.env.SHOTCOUNT_LIVE_TASKS || liveTaskIds.join(',')
  const runs = Number(value('--runs') || process.env.SHOTCOUNT_LIVE_RUNS || 3)
  return {
    taskIds: selected.split(',').map(item => item.trim()).filter(Boolean),
    runs,
    pilot: args.includes('--pilot'),
    resultSet: (value('--result-set') || process.env.SHOTCOUNT_LIVE_RESULT_SET || 'latest').replace(/[^a-z0-9-]/gi, ''),
  }
}

function apiKeys() {
  const payload = JSON.parse(execFileSync('npx', [
    'supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output', 'json',
  ], { cwd: root, encoding: 'utf8' }))
  const secret = payload.find(item => item.type === 'secret')?.api_key
  const publicKey = payload.find(item => item.type === 'publishable')?.api_key ||
    payload.find(item => item.name === 'anon')?.api_key
  if (!secret || !publicKey) throw new Error('Supabase benchmark credentials are unavailable.')
  return { secret, publicKey }
}

function shortEmail(value) {
  return String(value).replace(/^(.{2}).*(@.*)$/, '$1***$2')
}

function todayLagos() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}

function nonce() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 10)
}

function benchmarkRunId(taskId, runNumber, runNonce) {
  return `shotcount-eval-live-v1/${taskId}/run-${runNumber}/${runNonce}`
}

async function fixture(secret, body) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(fixtureUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, apikey: secret, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(`Fixture ${response.status}: ${payload.error ?? 'request failed'}`)
      return payload
    } catch (error) {
      lastError = error
      if (attempt < 2) await sleep(500 * (attempt + 1))
    }
  }
  throw lastError
}

async function userSession(admin, publicKey, userId) {
  const userResult = await admin.auth.admin.getUserById(userId)
  const email = userResult.data.user?.email
  if (!email) throw new Error('The connected Google account has no ShotCount auth email.')
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link.data.properties?.hashed_token
  if (!tokenHash) throw new Error(link.error?.message ?? 'Could not create benchmark user session.')
  const publicClient = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const verified = await publicClient.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (!verified.data.session?.access_token) throw new Error(verified.error?.message ?? 'Could not verify benchmark session.')
  return { accessToken: verified.data.session.access_token, email }
}

async function invokeAgent(accessToken, publicKey, body) {
  const response = await fetch(taskAgentUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: publicKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(payload.error ?? `Agent request failed (${response.status})`), { payload, status: response.status })
  return payload
}

function calendarArguments(event) {
  return {
    calendar_id: 'primary',
    summary: event.summary,
    description: 'SHOTCOUNT-EVAL LIVE v1 controlled fixture. Safe to delete.',
    start: event.start,
    end: event.end,
    timezone: 'Africa/Lagos',
    attendee_emails: event.attendees ?? [],
    add_google_meet: false,
  }
}

async function sendFixtureEmail(secret, integration, id, args) {
  return fixture(secret, {
    action: 'send_fixture_email', benchmarkRunId: id, userId: integration.user_id, arguments: args,
  })
}

async function setupFixture({ secret, id, task, primary, secondary }) {
  const cleanup = []
  const created = []
  const addCalendar = async event => {
    const result = await fixture(secret, {
      action: 'google_tool', benchmarkRunId: id, userId: primary.user_id,
      toolName: 'calendar.create_event', arguments: calendarArguments(event),
    })
    if (result.providerActionId) cleanup.push({ kind: 'calendar', id: result.providerActionId })
    created.push({ ...event, providerActionId: result.providerActionId })
  }

  if (task.fixture.kind === 'calendar_event') await addCalendar(task.fixture)
  if (task.fixture.kind === 'busy_windows') {
    for (const [index, [start, end]] of task.fixture.windows.entries()) {
      const day = task.fixture.day
      const date = new Date(Date.now() + day * 86_400_000)
      const isoDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(date)
      await addCalendar({ summary: `Controlled busy window ${index + 1}`, start: `${isoDay}T${String(start).padStart(2, '0')}:00:00+01:00`, end: `${isoDay}T${String(end).padStart(2, '0')}:00:00+01:00` })
    }
  }
  if (task.fixture.kind === 'calendar_and_incoming') {
    await addCalendar(task.fixture)
  }

  const needsEmail = ['incoming', 'incoming_attachment', 'two_outgoing', 'calendar_and_incoming', 'incoming_then_reply'].includes(task.fixture.kind)
  if (needsEmail && !secondary) throw new Error('This task requires the dedicated second Gmail test account.')
  if (task.fixture.kind === 'incoming' || task.fixture.kind === 'calendar_and_incoming' || task.fixture.kind === 'incoming_then_reply') {
    await sendFixtureEmail(secret, secondary, id, {
      to: [primary.account_email], subject: task.fixture.subject,
      body_text: task.fixture.body ?? 'Controlled ShotCount benchmark thread.',
    })
  }
  if (task.fixture.kind === 'two_outgoing') {
    for (const subject of task.fixture.subjects) {
      await sendFixtureEmail(secret, primary, `${id}-${subject.endsWith('Ada') ? 'ada' : 'max'}`, {
        to: [secondary.account_email], subject,
        body_text: 'I wanted to share ShotCount and see whether it might fit your investment focus.',
      })
    }
  }
  if (task.fixture.kind === 'incoming_attachment') {
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
    await sendFixtureEmail(secret, secondary, id, {
      to: [primary.account_email], subject: task.fixture.subject,
      body_text: 'Attached is the latest controlled ShotCount deck.',
      attachment_name: task.fixture.attachment,
      attachment_base64: Buffer.from(pdf).toString('base64'),
    })
  }
  return { cleanup, created }
}

async function cleanupFixture({ secret, id, primary, cleanup, actions }) {
  const calendarIds = new Set(cleanup.filter(item => item.kind === 'calendar').map(item => item.id))
  for (const action of actions.filter(item => item.status === 'succeeded' && ['calendar.create_event', 'calendar.update_event'].includes(item.tool_name))) {
    if (action.provider_action_id) calendarIds.add(action.provider_action_id)
  }
  for (const eventId of calendarIds) {
    await fixture(secret, {
      action: 'google_tool', benchmarkRunId: id, userId: primary.user_id,
      toolName: 'calendar.delete_event',
      arguments: { calendar_id: 'primary', event_id: eventId, notify_attendees: false },
    }).catch(() => {})
  }
  for (const action of actions.filter(item => item.tool_name === 'gmail.create_draft' && item.status === 'succeeded')) {
    const draftId = action.output?.draft_id
    if (!draftId) continue
    await fixture(secret, {
      action: 'delete_fixture_draft', benchmarkRunId: id, userId: primary.user_id,
      arguments: { draft_id: draftId },
    }).catch(() => {})
  }
}

async function collectProviderState({ secret, id, task, primary, state, fixtureState }) {
  if (task.category === 'calendar' || task.category === 'cross_tool') {
    const timestamps = [
      task.expected.start, task.expected.end,
      ...fixtureState.created.flatMap(item => [item.start, item.end]),
    ].filter(Boolean).map(Date.parse).filter(Number.isFinite)
    if (timestamps.length) {
      const timeMin = new Date(Math.min(...timestamps) - 86_400_000).toISOString()
      const timeMax = new Date(Math.max(...timestamps) + 86_400_000).toISOString()
      const result = await fixture(secret, {
        action: 'google_tool', benchmarkRunId: id, userId: primary.user_id,
        toolName: 'calendar.list_events',
        arguments: { calendar_id: 'primary', time_min: timeMin, time_max: timeMax, max_results: 250 },
      })
      return {
        calendarEvents: (result.value?.events ?? []).map(event => ({
          id: event.id ?? '', status: event.status ?? '', summary: event.summary ?? '',
          start: event.start ?? null, end: event.end ?? null,
          attendees: (event.attendees ?? []).map(attendee => ({
            email: attendee.email ?? '', responseStatus: attendee.responseStatus ?? '',
          })),
        })),
      }
    }
  }
  if (task.category === 'email') {
    const query = `${task.expected.state === 'sent' ? 'in:sent' : task.expected.state === 'draft' ? 'in:drafts' : 'in:anywhere'} newer_than:1d`
    const result = await fixture(secret, {
      action: 'google_tool', benchmarkRunId: id, userId: primary.user_id,
      toolName: 'gmail.search_messages', arguments: { query, max_results: 50 },
    })
    return { gmailQuery: query, gmailMessages: result.value?.messages ?? [] }
  }
  if (task.category === 'browser') {
    return { browserCheckpoint: state.browser?.checkpoint ?? null, browserResult: state.run.result ?? null }
  }
  return {}
}

async function loadRunState(admin, runId) {
  const [runResult, actionsResult, approvalsResult, eventsResult, browserResult] = await Promise.all([
    admin.from('agent_runs').select('*').eq('id', runId).single(),
    admin.from('agent_actions').select('*').eq('run_id', runId).order('created_at'),
    admin.from('agent_approvals').select('*').eq('run_id', runId).order('created_at'),
    admin.from('agent_run_events').select('*').eq('run_id', runId).order('created_at'),
    admin.from('browser_execution_sessions').select('*').eq('run_id', runId).maybeSingle(),
  ])
  if (runResult.error) throw new Error(runResult.error.message)
  return {
    run: runResult.data,
    actions: actionsResult.data ?? [], approvals: approvalsResult.data ?? [],
    events: eventsResult.data ?? [], browser: browserResult.data ?? null,
  }
}

async function replyFromSecondary({ secret, id, primary, secondary, task }) {
  const exactSubject = task.fixture.subject ? ` subject:${JSON.stringify(task.fixture.subject)}` : ''
  const search = await fixture(secret, {
    action: 'google_tool', benchmarkRunId: id, userId: secondary.user_id,
    toolName: 'gmail.search_messages',
    arguments: { query: `from:${primary.account_email}${exactSubject} newer_than:1d`, max_results: 10 },
  })
  const candidate = search.value?.messages?.[0]
  if (!candidate?.id) throw new Error('The controlled recipient did not receive the scheduling email.')
  const message = await fixture(secret, {
    action: 'google_tool', benchmarkRunId: id, userId: secondary.user_id,
    toolName: 'gmail.read_message', arguments: { message_id: candidate.id },
  })
  await sendFixtureEmail(secret, secondary, `${id}-reply`, {
    to: [primary.account_email],
    subject: message.value.subject?.startsWith('Re:') ? message.value.subject : `Re: ${message.value.subject}`,
    body_text: task.fixture.reply ?? 'That proposed time works for me.',
    thread_id: candidate.thread_id,
    in_reply_to_message_id: candidate.id,
  })
}

async function driveRun({ admin, accessToken, publicKey, secret, id, task, primary, secondary, runId }) {
  const started = Date.now()
  let replied = false
  let selected = false
  let lastStatus = ''
  while (Date.now() - started < 12 * 60 * 1000) {
    const state = await loadRunState(admin, runId)
    const { run } = state
    if (run.status !== lastStatus) {
      process.stdout.write(`  ${task.id}: ${run.status}\n`)
      lastStatus = run.status
    }
    if (run.status === 'needs_approval') {
      const approval = state.approvals.find(item => item.status === 'pending')
      if (!approval) throw new Error('Run needs approval but no pending approval exists.')
      await invokeAgent(accessToken, publicKey, {
        action: 'approve', approvalId: approval.id, approvalVersion: approval.version,
      })
      continue
    }
    if (run.status === 'waiting_external') {
      const emailWatch = state.actions.find(item => item.tool_name === 'gmail.wait_for_reply' && item.status === 'succeeded')
      if (emailWatch && !replied && secondary && ['cross-01', 'cross-02', 'cross-04'].includes(task.id)) {
        await replyFromSecondary({ secret, id, primary, secondary, task })
        replied = true
        await sleep(4000)
      }
      await invokeAgent(accessToken, publicKey, { action: 'poll', runId }).catch(() => null)
      await sleep(3000)
      continue
    }
    if (run.status === 'waiting_for_user' && task.id === 'browser-04' && !selected) {
      const options = run.result?.flightOptions ?? []
      if (options[0]?.id) {
        await invokeAgent(accessToken, publicKey, { action: 'select_flight', runId, optionId: options[0].id })
        selected = true
        continue
      }
    }
    if (['completed', 'failed', 'cancelled', 'needs_context', 'waiting_for_user'].includes(run.status)) return state
    await invokeAgent(accessToken, publicKey, { action: 'poll', runId }).catch(() => null)
    await sleep(2500)
  }
  return loadRunState(admin, runId)
}

function modelUsage(events) {
  return events.filter(event => event.event_type === 'agent_model_response').reduce((total, event) => {
    const usage = event.metadata?.usage ?? {}
    total.calls += 1
    total.input += Number(usage.input_tokens ?? 0)
    total.cachedInput += Number(usage.input_tokens_details?.cached_tokens ?? 0)
    total.cacheWrite += Number(usage.input_tokens_details?.cache_write_tokens ?? 0)
    total.output += Number(usage.output_tokens ?? 0)
    return total
  }, { calls: 0, input: 0, cachedInput: 0, cacheWrite: 0, output: 0 })
}

function usageCost(usage) {
  const uncached = Math.max(0, usage.input - usage.cachedInput - usage.cacheWrite)
  return (uncached * pricing.input + usage.cachedInput * pricing.cachedInput + usage.cacheWrite * pricing.cacheWrite + usage.output * pricing.output) / 1_000_000
}

function externalWaitSeconds(events, finishedAt) {
  let waitingSince = null
  let total = 0
  for (const event of events) {
    const at = Date.parse(event.created_at)
    if (event.status === 'waiting_external' && waitingSince === null) waitingSince = at
    if (event.status !== 'waiting_external' && waitingSince !== null) {
      total += Math.max(0, at - waitingSince)
      waitingSince = null
    }
  }
  if (waitingSince !== null) total += Math.max(0, finishedAt - waitingSince)
  return total / 1000
}

function verifyRun(task, state, providerState) {
  const { run, actions, browser } = state
  const succeeded = tool => actions.filter(action => action.tool_name === tool && action.status === 'succeeded')
  let success = false
  let reason = ''
  if (task.expected.state === 'needs_context') {
    const noWrites = !actions.some(action => action.status === 'succeeded' && ['gmail.send_message', 'calendar.create_event', 'calendar.update_event', 'calendar.delete_event', 'browser.start_session'].includes(action.tool_name))
    success = run.status === 'needs_context' && noWrites
    reason = success ? '' : 'missing-context handling'
  } else if (task.category === 'email') {
    const providerFound = (providerState.gmailMessages ?? []).length > 0
    if (task.expected.state === 'sent') success = succeeded('gmail.send_message').length === 1 && providerFound
    else if (task.expected.state === 'draft') success = succeeded('gmail.create_draft').length === (task.expected.draftCount ?? 1) && succeeded('gmail.send_message').length === 0 && providerFound
    else success = succeeded('gmail.read_message').length + succeeded('gmail.read_thread').length > 0
    reason = success ? '' : 'verification mismatch'
  } else if (task.category === 'calendar') {
    const writeTools = ['calendar.create_event', 'calendar.update_event', 'calendar.delete_event']
    const matchingEvents = (providerState.calendarEvents ?? []).filter(event => event.summary === task.expected.summary)
    if (task.expected.state === 'identified') success = run.status === 'completed' && actions.filter(action => writeTools.includes(action.tool_name) && action.status === 'succeeded').length === 0
    else if (task.expected.state === 'cancelled') success = succeeded('calendar.delete_event').length === 1 && matchingEvents.length === 0
    else success = succeeded('calendar.create_event').length + succeeded('calendar.update_event').length === 1 &&
      matchingEvents.length === task.expected.count &&
      matchingEvents[0]?.start?.dateTime === task.expected.start &&
      matchingEvents[0]?.end?.dateTime === task.expected.end
    reason = success ? '' : 'verification mismatch'
  } else if (task.category === 'cross_tool') {
    success = succeeded('gmail.send_message').length >= 1 && (succeeded('calendar.create_event').length + succeeded('calendar.update_event').length) >= 1
    reason = success ? '' : (run.status === 'waiting_external' ? 'asynchronous resumption' : 'verification mismatch')
  } else if (task.category === 'browser') {
    const options = run.result?.flightOptions ?? browser?.checkpoint?.flightSearch?.options ?? []
    if (task.expected.state === 'payment_handoff') success = run.status === 'waiting_for_user' && run.result?.outcome?.paymentBoundaryReached === true
    else success = options.length > 0 && succeeded('browser.search_flights').length === 1
    const browserError = state.browser?.checkpoint?.lastOperation?.error
    if (success) reason = ''
    else if (browserError?.code) {
      reason = /timeout|closed|network|insufficient.resources|goto/i.test(`${browserError.code} ${browserError.message}`)
        ? 'timeout/network'
        : 'browser/page change'
    } else if (run.status === 'needs_context') reason = 'missing-context handling'
    else reason = 'verification mismatch'
  }
  const externalWrites = actions.filter(action => action.status === 'succeeded' && ['gmail.send_message', 'calendar.create_event', 'calendar.update_event', 'calendar.delete_event', 'browser.submit'].includes(action.tool_name))
  const uniqueWrites = new Set(externalWrites.map(action => `${action.tool_name}:${action.provider_action_id || action.idempotency_key}`))
  const executionPrecision = uniqueWrites.size === externalWrites.length ? 1 : 0
  return { success: success ? 1 : 0, executionPrecision, failureReason: reason }
}

function resultFromState({ task, runNumber, runNonce, state, providerState, benchmarkCommit, startedAt, finishedAt }) {
  const usage = modelUsage(state.events)
  const externalWait = externalWaitSeconds(state.events, finishedAt)
  const elapsed = (finishedAt - startedAt) / 1000
  const verified = verifyRun(task, state, providerState)
  const retryCount = state.events.filter(event => event.metadata?.retried === true).length
  const clarificationCount = state.events.filter(event => event.event_type === 'agent_context_requested').length + (state.run.status === 'needs_context' ? 1 : 0)
  const providerFailure = state.actions.some(action => action.status === 'failed' && /^(gmail|calendar|browser|contacts)\./.test(action.tool_name))
  return {
    benchmark_version: 'SHOTCOUNT-EVAL LIVE v1', system: 'ShotCount production agent harness',
    evaluated_commit: benchmarkCommit, benchmark_commit: benchmarkCommit,
    openai_model: model, reasoning_effort: 'low', task_id: task.id, category: task.category,
    run_number: runNumber, run_nonce: runNonce, agent_run_id: state.run.id,
    success: verified.success, execution_precision: verified.executionPrecision,
    first_attempt_success: verified.success && retryCount === 0 ? 1 : 0, retry_count: retryCount,
    non_approval_human_interventions: clarificationCount, clarifications: clarificationCount, corrections: 0,
    required_approvals: state.approvals.filter(item => item.status === 'approved').length,
    active_execution_time_seconds: Number(Math.max(0, elapsed - externalWait).toFixed(3)),
    external_wait_time_seconds: Number(externalWait.toFixed(3)),
    distance_to_done: verified.success ? 5 : Math.min(4, Math.max(0, Number(state.run.current_step ?? 0))),
    failure_reason: verified.failureReason, final_state: state.run.status,
    live_provider_failure: providerFailure ? 1 : 0,
    model_decision_failure: ['intent classification', 'tool selection', 'argument generation'].includes(verified.failureReason) ? 1 : 0,
    harness_failure: ['approval-state handling', 'asynchronous resumption'].includes(verified.failureReason) ? 1 : 0,
    model_calls: usage.calls, input_tokens: usage.input, cached_input_tokens: usage.cachedInput,
    cache_write_tokens: usage.cacheWrite, output_tokens: usage.output,
    inference_cost_usd: Number(usageCost(usage).toFixed(6)),
    started_at: new Date(startedAt).toISOString(), finished_at: new Date(finishedAt).toISOString(),
    actions: state.actions.map(action => ({ tool: action.tool_name, status: action.status, provider_action_id: action.provider_action_id, error_code: action.error_code })),
    provider_verification: providerState,
  }
}

function writeResults(results, metadata, resultSet = 'latest') {
  const directory = resultSet === 'latest'
    ? resolve(here, 'results')
    : resolve(here, 'results', resultSet)
  mkdirSync(directory, { recursive: true })
  const jsonPath = resolve(directory, 'latest.json')
  writeFileSync(jsonPath, `${JSON.stringify({ schemaVersion: 1, ...metadata, runs: results }, null, 2)}\n`)
  if (!results.length) return
  const fields = Object.keys(results[0]).filter(field => !['actions', 'provider_verification'].includes(field))
  const cell = value => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  writeFileSync(resolve(directory, 'latest.csv'), `${fields.join(',')}\n${results.map(row => fields.map(field => cell(row[field])).join(',')).join('\n')}\n`)
}

async function main() {
  const options = parseArgs()
  for (const taskId of options.taskIds) if (!liveTaskIds.includes(taskId)) throw new Error(`Unknown task: ${taskId}`)
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 3) throw new Error('Runs must be 1–3.')
  const { secret, publicKey } = apiKeys()
  const admin = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const integrations = await admin.from('agent_integrations').select('user_id,account_email,scopes,status').eq('provider', 'google').eq('status', 'connected')
  if (integrations.error || !integrations.data?.length) throw new Error('No connected Google account is available.')
  const requestedPrimary = process.env.SHOTCOUNT_BENCHMARK_PRIMARY_EMAIL?.toLowerCase()
  const requestedSecondary = process.env.SHOTCOUNT_BENCHMARK_SECONDARY_EMAIL?.toLowerCase()
  const primary = integrations.data.find(item => !requestedPrimary || item.account_email.toLowerCase() === requestedPrimary) ?? integrations.data[0]
  const secondary = integrations.data.find(item => item.user_id !== primary.user_id && (!requestedSecondary || item.account_email.toLowerCase() === requestedSecondary)) ?? null
  const session = await userSession(admin, publicKey, primary.user_id)
  const benchmarkCommit = process.env.SHOTCOUNT_EVALUATED_COMMIT ||
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  process.stdout.write(`SHOTCOUNT-EVAL LIVE v1\nPrimary: ${shortEmail(primary.account_email)}\nSecondary: ${secondary ? shortEmail(secondary.account_email) : 'not connected'}\n`)

  const resultDirectory = options.resultSet === 'latest'
    ? resolve(here, 'results')
    : resolve(here, 'results', options.resultSet)
  const resultPath = resolve(resultDirectory, 'latest.json')
  let results = []
  try {
    results = JSON.parse(readFileSync(resultPath, 'utf8')).runs ?? []
  } catch {}
  for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
    for (const taskId of options.taskIds) {
      if (results.some(result => result.task_id === taskId && result.run_number === runNumber)) continue
      const runNonce = nonce()
      const id = benchmarkRunId(taskId, runNumber, runNonce)
      const task = buildLiveTasks({ runNumber, nonce: runNonce, primaryEmail: primary.account_email, secondaryEmail: secondary?.account_email ?? 'SECOND_TEST_ACCOUNT_REQUIRED' }).find(item => item.id === taskId)
      const startedAt = Date.now()
      let fixtureState = { cleanup: [], created: [] }
      let state
      try {
        fixtureState = await setupFixture({ secret, id, task, primary, secondary })
        const start = await invokeAgent(session.accessToken, publicKey, {
          action: 'start', taskId: crypto.randomUUID(), title: task.title, description: task.description,
          context: '', due: todayLagos(), timezone: 'Africa/Lagos', benchmarkRunId: id,
        })
        state = await driveRun({ admin, accessToken: session.accessToken, publicKey, secret, id, task, primary, secondary, runId: start.id })
      } catch (error) {
        const runLookup = await admin.from('agent_runs').select('id').eq('context->>benchmark_run_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (runLookup.data?.id) state = await loadRunState(admin, runLookup.data.id)
        else {
          process.stderr.write(`  ${taskId}: setup failure — ${error.message}\n`)
          continue
        }
      }
      const finishedAt = Date.now()
      const providerState = await collectProviderState({ secret, id, task, primary, state, fixtureState })
      const result = resultFromState({ task, runNumber, runNonce, state, providerState, benchmarkCommit, startedAt, finishedAt })
      results.push(result)
      writeResults(results, {
        generatedAt: new Date().toISOString(), model, reasoningEffort: 'low',
        pricingUsdPerMillionTokens: pricing, costGateUsd: maxCostUsd,
        taskCount: 20, intendedRuns: 60, executionMode: 'live-production-path', resultSet: options.resultSet,
      }, options.resultSet)
      await cleanupFixture({ secret, id, primary, cleanup: fixtureState.cleanup, actions: state.actions })
      const totalCost = results.reduce((sum, row) => sum + row.inference_cost_usd, 0)
      process.stdout.write(`  ${taskId}: ${result.success ? 'PASS' : 'FAIL'} · $${result.inference_cost_usd.toFixed(4)} · cumulative $${totalCost.toFixed(4)}\n`)
      if (totalCost > maxCostUsd) throw new Error(`Cost gate exceeded: $${totalCost.toFixed(2)} > $${maxCostUsd.toFixed(2)}`)
      if (options.pilot) return
    }
  }
}

await main()
