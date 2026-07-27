type RequestBody = {
  action?: 'model' | 'dispatch_browser'
  instructions?: string
  input?: unknown[]
  tools?: unknown[]
  metadata?: Record<string, string>
  sessionId?: string
  operationId?: string
  selection?: boolean
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceKey || request.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const body = await request.json().catch(() => ({})) as RequestBody
  if (body.action === 'model') {
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
    if (!openaiKey) return json({ error: 'OpenAI is not configured' }, 503)
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-sol',
        reasoning: { effort: 'low' },
        store: false,
        max_output_tokens: 2400,
        parallel_tool_calls: false,
        tool_choice: 'auto',
        tools: Array.isArray(body.tools) ? body.tools : [],
        instructions: String(body.instructions ?? ''),
        input: Array.isArray(body.input) ? body.input : [],
        metadata: body.metadata ?? {},
      }),
    })
    const payload = await response.json()
    return json(payload, response.status)
  }
  if (body.action === 'dispatch_browser') {
    const workerUrl = Deno.env.get(body.selection
      ? 'SHOTCOUNT_BROWSER_SELECTION_WORKER_URL'
      : 'SHOTCOUNT_BROWSER_WORKER_URL') ?? ''
    const token = Deno.env.get('SHOTCOUNT_BROWSER_WORKER_TOKEN') ?? ''
    if (!workerUrl || !token) return json({ error: 'Browser worker is not configured' }, 503)
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: body.sessionId, operationId: body.operationId }),
    })
    const payload = await response.json().catch(() => ({}))
    return json({ workerStatus: response.status, payload }, response.ok || response.status === 202 ? 200 : 502)
  }
  return json({ error: 'Unknown action' }, 400)
})
