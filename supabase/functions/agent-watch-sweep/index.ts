import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: noStoreHeaders })
}

function secureStringEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const configuredCronToken = Deno.env.get('SHOTCOUNT_CRON_TOKEN') ?? ''
  const suppliedCronToken = request.headers.get('x-shotcount-cron-token') ?? ''
  if (!secureStringEqual(suppliedCronToken, configuredCronToken)) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const internalWorkerToken = Deno.env.get('SHOTCOUNT_INTERNAL_WORKER_TOKEN') ?? ''
  if (!supabaseUrl || !serviceRoleKey || !internalWorkerToken) {
    return jsonResponse({ error: 'Sweep configuration is incomplete' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const runsResult = await admin
    .from('agent_runs')
    .select('id')
    .eq('status', 'waiting_external')
    .order('updated_at', { ascending: true })
    .limit(8)
  if (runsResult.error) {
    return jsonResponse({ error: 'Could not load waiting runs' }, 502)
  }

  const taskAgentEndpoint = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/task-agent`
  const runIds = (runsResult.data ?? []).map(run => String(run.id))
  let continued = 0
  let unchanged = 0
  let failed = 0

  for (let index = 0; index < runIds.length; index += 2) {
    const batch = runIds.slice(index, index + 2)
    const outcomes = await Promise.all(batch.map(async runId => {
      try {
        const result = await fetch(taskAgentEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'X-ShotCount-Internal-Worker': internalWorkerToken,
          },
          body: JSON.stringify({ action: 'poll', runId }),
        })
        if (!result.ok) return 'failed'
        const payload = await result.json() as { status?: string }
        return payload.status === 'waiting_external' ? 'unchanged' : 'continued'
      } catch {
        return 'failed'
      }
    }))

    for (const outcome of outcomes) {
      if (outcome === 'continued') continued += 1
      else if (outcome === 'unchanged') unchanged += 1
      else failed += 1
    }
  }

  return jsonResponse({
    ok: failed === 0,
    checked: runIds.length,
    continued,
    unchanged,
    failed,
  }, failed ? 207 : 200)
})
