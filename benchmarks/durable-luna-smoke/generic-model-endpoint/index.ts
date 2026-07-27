type RequestBody = {
  action?: 'create_conversation' | 'model' | 'delete_conversation'
  conversationId?: string
  instructions?: string
  input?: unknown[]
  tools?: unknown[]
  metadata?: Record<string, string>
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
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!openaiKey) return json({ error: 'OpenAI is not configured' }, 503)
  const body = await request.json().catch(() => ({})) as RequestBody
  const headers = { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }

  if (body.action === 'create_conversation') {
    const response = await fetch('https://api.openai.com/v1/conversations', {
      method: 'POST', headers,
      body: JSON.stringify({ metadata: body.metadata ?? {} }),
    })
    return json(await response.json(), response.status)
  }

  if (body.action === 'delete_conversation' && body.conversationId) {
    const response = await fetch(`https://api.openai.com/v1/conversations/${body.conversationId}`, {
      method: 'DELETE', headers,
    })
    return json(await response.json(), response.status)
  }

  if (body.action === 'model') {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers,
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        reasoning: { effort: 'low' },
        store: false,
        max_output_tokens: 2400,
        parallel_tool_calls: false,
        tool_choice: 'auto',
        ...(body.conversationId ? { conversation: body.conversationId } : {}),
        tools: Array.isArray(body.tools) ? body.tools : [],
        instructions: String(body.instructions ?? ''),
        input: Array.isArray(body.input) ? body.input : [],
        metadata: body.metadata ?? {},
      }),
    })
    return json(await response.json(), response.status)
  }

  return json({ error: 'Unknown action' }, 400)
})
