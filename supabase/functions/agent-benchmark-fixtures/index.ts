import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  deleteGoogleBenchmarkDraft,
  executeGoogleTool,
  GoogleIntegrationError,
} from '../_shared/google.ts'

type AdminClient = SupabaseClient<any, 'public', 'public', any, any>

type RequestBody = {
  action?: 'status' | 'google_tool' | 'send_fixture_email' | 'delete_fixture_draft' | 'cleanup_generic_adapters'
  benchmarkRunId?: string
  userId?: string
  toolName?: string
  arguments?: Record<string, unknown>
}

const allowedTools = new Set([
  'gmail.search_messages',
  'gmail.read_message',
  'gmail.read_thread',
  'gmail.create_draft',
  'gmail.send_message',
  'contacts.find_contact',
  'contacts.resolve_recipient',
  'calendar.list_events',
  'calendar.get_availability',
  'calendar.create_event',
  'calendar.update_event',
  'calendar.delete_event',
])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function validBenchmarkRunId(value: unknown) {
  const id = String(value ?? '').trim()
  return /^shotcount-eval-live-v1\/[a-z0-9-]+\/run-[1-3]\/[a-z0-9-]+$/.test(id) ? id : ''
}

async function shortHash(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(digest)].slice(0, 8).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function connectedGoogleUser(admin: AdminClient, requestedUserId: string) {
  let query = admin
    .from('agent_integrations')
    .select('user_id,account_email,scopes,status')
    .eq('provider', 'google')
    .eq('status', 'connected')
  if (requestedUserId) query = query.eq('user_id', requestedUserId)
  const { data, error } = await query.limit(2)
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('No connected Google benchmark account was found.')
  if (!requestedUserId && data.length !== 1) {
    throw new Error('Specify the controlled Google benchmark user explicitly.')
  }
  return data[0] as { user_id: string; account_email: string; scopes: string[]; status: string }
}

async function sendFixtureEmail(
  admin: AdminClient,
  userId: string,
  benchmarkRunId: string,
  argumentsValue: Record<string, unknown>,
) {
  const recipients = Array.isArray(argumentsValue.to)
    ? argumentsValue.to.map(value => String(value).trim()).filter(Boolean)
    : []
  const subject = String(argumentsValue.subject ?? '').trim()
  const bodyText = String(argumentsValue.body_text ?? '').trim()
  const controlledReply = Boolean(argumentsValue.thread_id && argumentsValue.in_reply_to_message_id)
  if (!recipients.length || recipients.length > 3 || (!subject.includes('[SC-LIVE-v1') && !controlledReply) || !bodyText) {
    throw new Error('Fixture emails require controlled recipients, a benchmark marker, and a body.')
  }
  const idempotencyKey = `fixture-${benchmarkRunId.replaceAll('/', '-')}`
  const { data: run, error: runError } = await admin.from('agent_runs').insert({
    user_id: userId,
    task_id: idempotencyKey,
    status: 'running',
    objective: `Benchmark fixture: ${subject}`,
    context: { benchmark_fixture: true, benchmark_run_id: benchmarkRunId },
    capability: 'gmail',
    strategy: 'structured',
    intent: { capability: 'gmail', strategy: 'structured', outcomeType: 'external_change' },
    task_completion_policy: 'external_change',
    plan: [],
    progress: [],
  }).select('id').single()
  if (runError || !run) throw new Error(runError?.message ?? 'Could not create fixture run.')

  try {
    const draftArguments = {
      to: recipients,
      subject,
      body_text: bodyText,
      thread_id: argumentsValue.thread_id ? String(argumentsValue.thread_id) : null,
      in_reply_to_message_id: argumentsValue.in_reply_to_message_id
        ? String(argumentsValue.in_reply_to_message_id)
        : null,
      ...(argumentsValue.attachment_name && argumentsValue.attachment_base64
        ? {
            benchmark_attachment_name: String(argumentsValue.attachment_name),
            benchmark_attachment_base64: String(argumentsValue.attachment_base64),
          }
        : {}),
    }
    const draft = await executeGoogleTool(
      admin,
      userId,
      'gmail.create_draft',
      draftArguments,
      idempotencyKey,
    )
    const { error: actionError } = await admin.from('agent_actions').insert({
      run_id: run.id,
      user_id: userId,
      step_index: 0,
      tool_name: 'gmail.create_draft',
      risk: 'prepare',
      status: 'succeeded',
      arguments: draftArguments,
      output: draft.value,
      public_summary: draft.publicSummary,
      idempotency_key: idempotencyKey,
      provider_action_id: draft.providerActionId ?? null,
      completed_at: new Date().toISOString(),
    })
    if (actionError) throw new Error(actionError.message)
    const sent = await executeGoogleTool(admin, userId, 'gmail.send_message', {
      draft_id: draft.value.draft_id,
      expected_to: recipients,
      expected_subject: subject,
    }, `${idempotencyKey}-send`)
    return sent.value
  } finally {
    await admin.from('agent_runs').delete().eq('id', run.id)
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) return json({ error: 'Server configuration is incomplete' }, 503)
  if (request.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const body = await request.json().catch(() => ({})) as RequestBody
  const benchmarkRunId = validBenchmarkRunId(body.benchmarkRunId)
  if (!benchmarkRunId) return json({ error: 'Valid benchmark run ID required' }, 400)
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  try {
    const integration = await connectedGoogleUser(admin, String(body.userId ?? ''))
    if (body.action === 'status') {
      return json({
        connected: true,
        userId: integration.user_id,
        accountEmail: integration.account_email,
        scopes: integration.scopes,
      })
    }
    if (body.action === 'google_tool') {
      const toolName = String(body.toolName ?? '')
      if (!allowedTools.has(toolName)) return json({ error: 'Tool is not allowed for fixtures' }, 400)
      const result = await executeGoogleTool(
        admin,
        integration.user_id,
        toolName,
        body.arguments ?? {},
        `fixture-${benchmarkRunId.replaceAll('/', '-')}-${toolName}-${await shortHash(body.arguments ?? {})}`,
      )
      let adapterRunId: string | null = null
      if (toolName === 'gmail.create_draft') {
        const taskId = `generic-draft-${benchmarkRunId.replaceAll('/', '-')}-${await shortHash(result.value)}`
        const runResult = await admin.from('agent_runs').insert({
          user_id: integration.user_id,
          task_id: taskId,
          status: 'running',
          objective: 'Generic benchmark Gmail provider adapter',
          context: { generic_benchmark_adapter: true, benchmark_run_id: benchmarkRunId },
          capability: 'gmail',
          strategy: 'structured',
          intent: {},
          plan: [],
          progress: [],
          task_completion_policy: 'external_change',
        }).select('id').single()
        if (runResult.error || !runResult.data) throw new Error(runResult.error?.message ?? 'Could not record generic draft adapter.')
        adapterRunId = runResult.data.id
        const actionResult = await admin.from('agent_actions').insert({
          run_id: adapterRunId,
          user_id: integration.user_id,
          step_index: 0,
          tool_name: 'gmail.create_draft',
          risk: 'prepare',
          status: 'succeeded',
          arguments: body.arguments ?? {},
          output: result.value,
          public_summary: 'Prepared a Gmail draft for review.',
          idempotency_key: taskId,
          provider_action_id: result.providerActionId ?? null,
          completed_at: new Date().toISOString(),
        })
        if (actionResult.error) throw new Error(actionResult.error.message)
      }
      return json({ value: result.value, providerActionId: result.providerActionId ?? null, adapterRunId })
    }
    if (body.action === 'send_fixture_email') {
      const value = await sendFixtureEmail(
        admin,
        integration.user_id,
        benchmarkRunId,
        body.arguments ?? {},
      )
      return json({ value })
    }
    if (body.action === 'delete_fixture_draft') {
      const draftId = String(body.arguments?.draft_id ?? '')
      if (!draftId) return json({ error: 'Draft ID required' }, 400)
      return json({ value: await deleteGoogleBenchmarkDraft(admin, integration.user_id, draftId) })
    }
    if (body.action === 'cleanup_generic_adapters') {
      const result = await admin.from('agent_runs')
        .delete()
        .eq('user_id', integration.user_id)
        .contains('context', { generic_benchmark_adapter: true, benchmark_run_id: benchmarkRunId })
      if (result.error) throw new Error(result.error.message)
      return json({ value: { deleted: true } })
    }
    return json({ error: 'Unknown fixture action' }, 400)
  } catch (error) {
    if (error instanceof GoogleIntegrationError) {
      return json({ error: error.message, code: error.code, retryable: error.retryable }, 502)
    }
    return json({ error: error instanceof Error ? error.message : 'Fixture request failed' }, 500)
  }
})
