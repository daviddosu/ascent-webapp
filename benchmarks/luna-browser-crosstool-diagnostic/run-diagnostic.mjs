import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { fixture as liveFixture } from '../agent-execution-live/run-live.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const projectRef = 'bhhutexqrxzbbhatepmh'
const supabaseUrl = `https://${projectRef}.supabase.co`
const endpointUrl = `${supabaseUrl}/functions/v1/task-agent-luna-smoke`
const pricing = { input: 1.25, cachedInput: 0.125, cacheWrite: 1.5625, output: 7.5 }
const resultsDir = resolve(here, 'results')
const tracesDir = resolve(here, 'traces')
mkdirSync(resultsDir, { recursive: true })
mkdirSync(tracesDir, { recursive: true })
const rerun = process.argv.includes('--rerun')
const resultName = process.argv.find(value => value.startsWith('--result-name='))?.split('=')[1] || (rerun ? 'rerun' : 'raw')
const scenarioArg = process.argv.find(value => value.startsWith('--scenarios='))?.split('=')[1]
const selectedScenarios = scenarioArg ? new Set(scenarioArg.split(',').filter(Boolean)) : null

const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms))
const nonce = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10)
const runIdFor = (scenario, stamp) => `durable-luna-smoke/${scenario}/shotcount/${stamp}`
const fixtureId = source => `shotcount-eval-live-v1/diagnostic/run-1/${source.replaceAll(/[^a-z0-9]/gi, '').slice(-18)}`
const calendarDescription = 'Controlled Luna diagnostic fixture. Safe to delete.'

function diagnosticApiKeys() {
  const command = spawnSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output', 'json'], { cwd: root, encoding: 'utf8' })
  if (!command.stdout) throw new Error('Supabase benchmark credentials are unavailable.')
  const payload = JSON.parse(command.stdout)
  const secret = payload.find(item => item.type === 'secret')?.api_key
  const publicKey = payload.find(item => item.type === 'publishable')?.api_key || payload.find(item => item.name === 'anon')?.api_key
  if (!secret || !publicKey) throw new Error('Supabase benchmark credentials are unavailable.')
  return { secret, publicKey }
}

const scenarios = secondaryEmail => {
  const stamp = nonce()
  const flightDate = '2026-09-17'
  const replySubject = `[Luna diagnostic ${stamp}] availability`
  const eventSummary = `Luna diagnostic meeting ${stamp}`
  const movedSummary = `Luna diagnostic move ${stamp}`
  return [
    {
      id: 'browser-search', category: 'Browser', expected: 'options',
      title: 'Find cheapest valid London flight',
      description: `Find a one-way economy flight from Lagos to London on ${flightDate}. Maximum one stop. Return the cheapest valid option among the live results you observe and stop before any booking or payment step.`,
      flightDate,
    },
    {
      id: 'browser-handoff', category: 'Browser', expected: 'handoff',
      title: 'Prepare London flight handoff',
      description: `Find a one-way economy flight from Lagos to London on ${flightDate}. Maximum one stop. Choose a valid result and continue only to the final safe booking or payment handoff. Do not purchase or enter payment details.`,
      flightDate,
    },
    {
      id: 'browser-recovery', category: 'Browser', expected: 'handoff', injectRecovery: true,
      title: 'Prepare recoverable London flight',
      description: `Find a one-way economy flight from Lagos to London on ${flightDate}. Maximum one stop. Choose a valid result and continue only to the final safe booking or payment handoff. Do not purchase or enter payment details.`,
      flightDate,
    },
    {
      id: 'email-calendar', category: 'Cross-tool', expected: 'email-calendar',
      title: 'Coordinate controlled meeting', subject: replySubject, eventSummary,
      description: `Email ${secondaryEmail} with subject "${replySubject}" asking whether they are available for a 30-minute meeting next week. Wait for their reply. When they reply that Tuesday, August 4, 2026 at 2:00 PM Africa/Lagos works, check my Calendar and create exactly one 30-minute event titled "${eventSummary}" with them as attendee.`,
      start: '2026-08-04T14:00:00+01:00', end: '2026-08-04T14:30:00+01:00',
    },
    {
      id: 'calendar-email', category: 'Cross-tool', expected: 'calendar-email', movedSummary,
      title: 'Move controlled meeting and notify attendee',
      description: `Move the controlled Calendar event titled "${movedSummary}" on August 5, 2026 from 10:00 AM to 11:30 AM Africa/Lagos. Preserve its 30-minute duration and ${secondaryEmail} as attendee. Then email ${secondaryEmail} to notify them of the specific change. Verify both Calendar and Gmail before completing.`,
      originalStart: '2026-08-05T10:00:00+01:00', originalEnd: '2026-08-05T10:30:00+01:00',
      start: '2026-08-05T11:30:00+01:00', end: '2026-08-05T12:00:00+01:00',
    },
  ]
}

async function fixture(secret, runId, body) {
  return liveFixture(secret, { ...body, benchmarkRunId: fixtureId(runId) })
}

async function userSession(admin, publicKey, userId) {
  const user = await admin.auth.admin.getUserById(userId)
  const email = user.data.user?.email
  if (!email) throw new Error('Benchmark user email unavailable.')
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const client = createClient(supabaseUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const verified = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties?.hashed_token })
  if (!verified.data.session?.access_token) throw new Error('Could not create benchmark session.')
  return verified.data.session.access_token
}

async function invoke(accessToken, publicKey, body) {
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, apikey: publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message ?? payload.error ?? `Agent request failed (${response.status})`)
  return payload
}

async function loadState(admin, runId) {
  const [run, actions, approvals, events, browser, watches] = await Promise.all([
    admin.from('agent_runs').select('*').eq('id', runId).single(),
    admin.from('agent_actions').select('*').eq('run_id', runId).order('created_at'),
    admin.from('agent_approvals').select('*').eq('run_id', runId).order('created_at'),
    admin.from('agent_run_events').select('*').eq('run_id', runId).order('created_at'),
    admin.from('browser_execution_sessions').select('*').eq('run_id', runId).maybeSingle(),
    admin.from('agent_email_watches').select('*').eq('run_id', runId),
  ])
  if (run.error) throw new Error(run.error.message)
  return { run: run.data, actions: actions.data ?? [], approvals: approvals.data ?? [], events: events.data ?? [], browser: browser.data, watches: watches.data ?? [] }
}

async function setupFixture(secret, primary, secondary, scenario, runId) {
  const cleanup = []
  if (scenario.id === 'calendar-email') {
    const existing = await fixture(secret, runId, {
      action: 'google_tool', userId: primary.user_id, toolName: 'calendar.list_events',
      arguments: { calendar_id: 'primary', time_min: '2026-08-05T09:00:00+01:00', time_max: '2026-08-05T13:00:00+01:00', max_results: 100 },
    })
    for (const event of existing.value?.events ?? []) {
      if (event.description !== calendarDescription || !event.id) continue
      await fixture(secret, `${runId}-stale-fixture`, {
        action: 'google_tool', userId: primary.user_id, toolName: 'calendar.delete_event',
        arguments: { calendar_id: 'primary', event_id: event.id, notify_attendees: false },
      })
    }
    const created = await fixture(secret, runId, {
      action: 'google_tool', userId: primary.user_id, toolName: 'calendar.create_event',
      arguments: {
        calendar_id: 'primary', summary: scenario.movedSummary, description: calendarDescription,
        start: scenario.originalStart, end: scenario.originalEnd, timezone: 'Africa/Lagos',
        attendee_emails: [secondary.account_email], add_google_meet: false,
      },
    })
    cleanup.push(created.providerActionId)
  }
  return cleanup
}

async function sendControlledReply(secret, primary, secondary, scenario, runId) {
  const search = await fixture(secret, runId, {
    action: 'google_tool', userId: secondary.user_id, toolName: 'gmail.search_messages',
    arguments: { query: `from:${primary.account_email} subject:${JSON.stringify(scenario.subject)} newer_than:1d`, max_results: 10 },
  })
  const message = search.value?.messages?.[0]
  if (!message?.id) throw new Error('Controlled availability email was not received.')
  const read = await fixture(secret, runId, {
    action: 'google_tool', userId: secondary.user_id, toolName: 'gmail.read_message', arguments: { message_id: message.id },
  })
  await fixture(secret, `${runId}-reply`, {
    action: 'send_fixture_email', userId: secondary.user_id,
    arguments: {
      to: [primary.account_email], subject: `Re: ${scenario.subject}`,
      body_text: 'Tuesday, August 4, 2026 at 2:00 PM Africa/Lagos works for me.',
      thread_id: read.value?.thread_id ?? message.thread_id, in_reply_to_message_id: message.id,
    },
  })
}

async function injectSafeRecovery(admin, state) {
  const session = state.browser
  const checkpoint = session?.checkpoint ?? {}
  const operation = checkpoint.pendingOperation
  if (!session?.id || !operation || operation.type !== 'search_flights') return false
  const injected = {
    ...checkpoint,
    pendingOperation: null,
    lastOperation: {
      id: operation.id, type: operation.type, status: 'failed', completedAt: new Date().toISOString(),
      error: { code: 'browser_target_closed', message: 'Controlled diagnostic recycle during read-only flight search.', retryable: true },
    },
  }
  const updated = await admin.from('browser_execution_sessions').update({
    status: 'failed', checkpoint: injected, resumable: true, last_observed_at: new Date().toISOString(),
  }).eq('id', session.id).eq('run_id', state.run.id)
  if (updated.error) throw new Error(updated.error.message)
  return true
}

async function drive({ admin, accessToken, publicKey, secret, primary, secondary, scenario, runId }) {
  const started = Date.now()
  let replied = false
  let selected = false
  let recoveryInjected = false
  let lastStatus = ''
  while (Date.now() - started < 12 * 60_000) {
    let state = await loadState(admin, runId)
    if (state.run.status !== lastStatus) {
      process.stdout.write(`  ${scenario.id}: ${state.run.status}\n`)
      lastStatus = state.run.status
    }
    if (scenario.injectRecovery && !recoveryInjected && state.run.status === 'waiting_external') {
      recoveryInjected = await injectSafeRecovery(admin, state)
      if (recoveryInjected) {
        await invoke(accessToken, publicKey, { action: 'poll', runId }).catch(() => null)
        await sleep(1000)
        continue
      }
    }
    if (state.run.status === 'needs_approval') {
      const approval = state.approvals.find(item => item.status === 'pending')
      if (!approval) throw new Error('Approval state has no pending approval.')
      await invoke(accessToken, publicKey, { action: 'approve', approvalId: approval.id, approvalVersion: approval.version })
      continue
    }
    if (state.run.status === 'waiting_external') {
      if (scenario.id === 'email-calendar' && !replied && state.watches.length) {
        await sendControlledReply(secret, primary, secondary, scenario, runId)
        replied = true
        await sleep(4000)
      }
      await invoke(accessToken, publicKey, { action: 'poll', runId }).catch(() => null)
      await sleep(2500)
      continue
    }
    if (state.run.status === 'waiting_for_user' && scenario.expected === 'handoff' && !selected) {
      const options = state.run.result?.flightOptions ?? []
      if (options[0]?.id) {
        await invoke(accessToken, publicKey, { action: 'select_flight', runId, optionId: options[0].id })
        selected = true
        continue
      }
    }
    if (['completed', 'failed', 'cancelled', 'needs_context', 'waiting_for_user'].includes(state.run.status)) {
      return { state, recoveryInjected, replied, selected }
    }
    await invoke(accessToken, publicKey, { action: 'poll', runId }).catch(() => null)
    await sleep(2000)
  }
  return { state: await loadState(admin, runId), recoveryInjected, replied, selected }
}

async function providerEvidence(secret, primary, secondary, scenario, runId, state) {
  const evidence = {}
  if (scenario.category === 'Cross-tool') {
    const listed = await fixture(secret, runId, {
      action: 'google_tool', userId: primary.user_id, toolName: 'calendar.list_events',
      arguments: { calendar_id: 'primary', time_min: '2026-08-03T00:00:00+01:00', time_max: '2026-08-07T23:59:59+01:00', max_results: 100 },
    })
    evidence.calendarEvents = (listed.value?.events ?? []).map(event => ({
      id: event.id, summary: event.summary, start: event.start, end: event.end,
      attendees: (event.attendees ?? []).map(attendee => ({ email: attendee.email, responseStatus: attendee.responseStatus })),
    }))
    const sent = await fixture(secret, runId, {
      action: 'google_tool', userId: primary.user_id, toolName: 'gmail.search_messages',
      arguments: { query: `in:sent to:${secondary.account_email} ${scenario.subject ? `subject:${JSON.stringify(scenario.subject)}` : `subject:${JSON.stringify(`Updated meeting time: ${scenario.movedSummary}`)}`} newer_than:1d`, max_results: 10 },
    })
    evidence.sentMessages = (sent.value?.messages ?? []).map(message => ({ id: message.id, thread_id: message.thread_id, subject: message.subject }))
  } else {
    evidence.browserCheckpoint = state.browser?.checkpoint ?? null
    evidence.browserResult = state.run.result ?? null
  }
  return evidence
}

function classify(scenario, state, evidence, controls) {
  const succeeded = tool => state.actions.filter(action => action.tool_name === tool && action.status === 'succeeded')
  const writes = state.actions.filter(action => action.status === 'succeeded' && ['gmail.send_message', 'calendar.create_event', 'calendar.update_event', 'browser.submit'].includes(action.tool_name))
  const duplicates = new Set(writes.map(action => `${action.tool_name}:${action.provider_action_id || action.idempotency_key}`)).size !== writes.length
  let success = false
  let exactMechanism = ''
  if (scenario.expected === 'options') {
    const options = state.run.result?.flightOptions ?? state.browser?.checkpoint?.flightSearch?.options ?? []
    const cheapest = [...options].sort((a, b) => Number(a.amount ?? Infinity) - Number(b.amount ?? Infinity))[0]
    const selected = state.run.result?.selectedFlight
    success = options.length > 0 && succeeded('browser.search_flights').length === 1 && !selected && !succeeded('browser.submit').length &&
      options.every(option => Number(option.stopCount) <= 1) && cheapest?.id === options[0]?.id
  } else if (scenario.expected === 'handoff') {
    success = state.run.status === 'waiting_for_user' && state.run.result?.outcome?.paymentBoundaryReached === true &&
      succeeded('browser.search_flights').length === 1 && succeeded('browser.select_flight').length === 1 && !succeeded('browser.submit').length
    if (scenario.injectRecovery) success = success && controls.recoveryInjected && state.events.some(event => event.metadata?.automatic_retry === true || event.metadata?.retried === true)
  } else if (scenario.expected === 'email-calendar') {
    const matching = (evidence.calendarEvents ?? []).filter(event => event.summary === scenario.eventSummary)
    success = controls.replied && succeeded('gmail.send_message').length === 1 && succeeded('calendar.create_event').length === 1 &&
      matching.length === 1 && matching[0]?.start?.dateTime === scenario.start && matching[0]?.end?.dateTime === scenario.end && state.run.status === 'completed'
  } else {
    const matching = (evidence.calendarEvents ?? []).filter(event => event.summary === scenario.movedSummary)
    success = succeeded('calendar.update_event').length === 1 && succeeded('gmail.send_message').length === 1 &&
      matching.length === 1 && matching[0]?.start?.dateTime === scenario.start && matching[0]?.end?.dateTime === scenario.end && state.run.status === 'completed'
  }
  if (!success) {
    const browserError = state.browser?.checkpoint?.lastOperation?.error
    const failedAction = state.actions.find(action => action.status === 'failed')
    if (browserError && /timeout|closed|network|resource|worker/i.test(`${browserError.code} ${browserError.message}`)) exactMechanism = `${browserError.code}: ${browserError.message}`
    else if (/coerce the result to a single json object/i.test(state.run.error ?? '')) exactMechanism = `tool result coercion: ${state.run.error}`
    else if (state.run.status === 'completed') exactMechanism = 'Completion verifier did not find every required provider outcome.'
    else if (failedAction?.error_code) exactMechanism = `${failedAction.error_code}: ${failedAction.error_message ?? 'tool action failed'}`
    else exactMechanism = `${state.run.status}: the required objective was not fully achieved.`
  }
  const primaryClass = success ? 'NONE' :
    /coercion|coerce.*json/i.test(exactMechanism) ? 'D. TOOL / DATA COERCION' :
      /browser|timeout|closed|network|resource|worker|flight_selection_failed|selectable itinerary/i.test(exactMechanism) ? 'B. BROWSER INFRASTRUCTURE' :
      state.run.status === 'completed' ? 'E. VERIFICATION / COMPLETION' :
        state.run.status === 'waiting_external' ? 'C. STATE / ORCHESTRATION' : 'A. MODEL / REASONING'
  return { success, primaryClass, exactMechanism, duplicates, executionPrecision: duplicates ? 0 : 1 }
}

function traceFor(scenario, state, evidence, controls, verification) {
  const events = [
    { at: state.run.created_at, type: 'model_decision', status: 'run_started', detail: { title: scenario.title, category: scenario.category } },
    ...state.actions.map(action => ({
      at: action.created_at, type: 'tool', tool: action.tool_name, arguments: action.arguments,
      resultType: action.status, providerActionId: action.provider_action_id, retryAttempted: action.retry_count > 0,
    })),
    ...state.events.map(event => ({
      at: event.created_at, type: event.event_type, status: event.status,
      checkpointSaved: /waiting|resumed|model_response/.test(event.event_type), retryAttempted: event.metadata?.retried === true,
      recoveryAttempted: event.metadata?.automatic_retry === true, metadata: event.metadata,
    })),
    { at: new Date().toISOString(), type: 'provider_verification', result: evidence },
    { at: new Date().toISOString(), type: 'completion_decision', status: state.run.status, verification },
  ]
  return { scenario: scenario.id, model: 'gpt-5.6-luna', reasoningEffort: 'low', runId: state.run.id, browserSessionId: state.browser?.id ?? null, controls, events }
}

function usage(events) {
  return events.filter(event => event.event_type === 'agent_model_response').reduce((sum, event) => {
    const value = event.metadata?.usage ?? {}
    sum.calls += 1; sum.input += Number(value.input_tokens ?? 0); sum.cached += Number(value.input_tokens_details?.cached_tokens ?? 0); sum.cacheWrite += Number(value.input_tokens_details?.cache_write_tokens ?? 0); sum.output += Number(value.output_tokens ?? 0)
    return sum
  }, { calls: 0, input: 0, cached: 0, cacheWrite: 0, output: 0 })
}

function inferenceCost(value) {
  const uncached = Math.max(0, value.input - value.cached - value.cacheWrite)
  return (uncached * pricing.input + value.cached * pricing.cachedInput + value.cacheWrite * pricing.cacheWrite + value.output * pricing.output) / 1_000_000
}

async function cleanup(secret, primary, scenario, runId, state, initialIds) {
  const ids = new Set(initialIds.filter(Boolean))
  for (const action of state.actions.filter(action => ['calendar.create_event', 'calendar.update_event'].includes(action.tool_name) && action.provider_action_id)) ids.add(action.provider_action_id)
  for (const id of ids) await fixture(secret, runId, { action: 'google_tool', userId: primary.user_id, toolName: 'calendar.delete_event', arguments: { calendar_id: 'primary', event_id: id, notify_attendees: false } }).catch(() => {})
}

async function main() {
  const { secret, publicKey } = diagnosticApiKeys()
  const admin = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const connected = await admin.from('agent_integrations').select('user_id,account_email,scopes,status').eq('provider', 'google').eq('status', 'connected')
  if (connected.error || connected.data.length < 2) throw new Error('Two connected controlled Google accounts are required.')
  const primary = connected.data.find(item => item.account_email.toLowerCase() === (process.env.SHOTCOUNT_BENCHMARK_PRIMARY_EMAIL ?? '').toLowerCase()) ?? connected.data[0]
  const secondary = connected.data.find(item => item.user_id !== primary.user_id && item.account_email.toLowerCase() === (process.env.SHOTCOUNT_BENCHMARK_SECONDARY_EMAIL ?? '').toLowerCase()) ?? connected.data.find(item => item.user_id !== primary.user_id)
  const accessToken = await userSession(admin, publicKey, primary.user_id)
  const benchmarkCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const results = []
  for (const scenario of scenarios(secondary.account_email).filter(item => !selectedScenarios || selectedScenarios.has(item.id))) {
    const stamp = nonce()
    const benchmarkRunId = runIdFor(scenario.id, stamp)
    const initialIds = await setupFixture(secret, primary, secondary, scenario, benchmarkRunId)
    const startedAt = Date.now()
    let start
    let driven
    try {
      start = await invoke(accessToken, publicKey, {
        action: 'start', taskId: crypto.randomUUID(), title: scenario.title, description: scenario.description,
        context: '', due: '2026-07-27', timezone: 'Africa/Lagos', benchmarkRunId,
      })
      driven = await drive({ admin, accessToken, publicKey, secret, primary, secondary, scenario, runId: start.id })
      const evidence = await providerEvidence(secret, primary, secondary, scenario, benchmarkRunId, driven.state)
      const verification = classify(scenario, driven.state, evidence, driven)
      const measuredUsage = usage(driven.state.events)
      const trace = traceFor(scenario, driven.state, evidence, driven, verification)
      writeFileSync(resolve(tracesDir, `${scenario.id}-${resultName}.json`), `${JSON.stringify(trace, null, 2)}\n`)
      results.push({
        scenario: scenario.id, category: scenario.category, result: verification.success ? 'PASS' : 'FAIL',
        primaryFailureClass: verification.primaryClass, exactMechanism: verification.exactMechanism,
        harnessFixJustified: !verification.success && /^[BCDE]\./.test(verification.primaryClass),
        executionPrecision: verification.executionPrecision, duplicateOrUnintendedSideEffects: verification.duplicates,
        inferenceCostUsd: Number(inferenceCost(measuredUsage).toFixed(6)), usage: measuredUsage,
        finalState: driven.state.run.status, runId: driven.state.run.id,
        browserSessionId: driven.state.browser?.id ?? null, recoveryInjected: driven.recoveryInjected,
        startedAt: new Date(startedAt).toISOString(), finishedAt: new Date().toISOString(),
      })
      process.stdout.write(`${scenario.id}: ${verification.success ? 'PASS' : 'FAIL'} · ${verification.primaryClass} · $${results.at(-1).inferenceCostUsd.toFixed(6)}\n`)
      await cleanup(secret, primary, scenario, benchmarkRunId, driven.state, initialIds)
    } catch (error) {
      const state = start?.id ? await loadState(admin, start.id).catch(() => null) : null
      results.push({ scenario: scenario.id, category: scenario.category, result: 'FAIL', primaryFailureClass: 'F. PROVIDER', exactMechanism: error.message, harnessFixJustified: false, executionPrecision: 1, duplicateOrUnintendedSideEffects: false, inferenceCostUsd: state ? Number(inferenceCost(usage(state.events)).toFixed(6)) : 0, finalState: state?.run?.status ?? 'setup_failed', runId: state?.run?.id ?? '', browserSessionId: state?.browser?.id ?? null, recoveryInjected: false, startedAt: new Date(startedAt).toISOString(), finishedAt: new Date().toISOString() })
      if (state) await cleanup(secret, primary, scenario, benchmarkRunId, state, initialIds)
      process.stdout.write(`${scenario.id}: FAIL · F. PROVIDER · ${error.message}\n`)
    }
    writeFileSync(resolve(resultsDir, `${resultName}.json`), `${JSON.stringify({ model: 'gpt-5.6-luna', reasoningEffort: 'low', evaluatedCommit: benchmarkCommit, runs: results }, null, 2)}\n`)
  }
}

await main()
