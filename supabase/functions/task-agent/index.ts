import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

type RequestBody = {
  taskId?: string
  title?: string
  description?: string
  context?: string
  capability?: 'research' | 'draft' | 'research_draft'
  goalId?: string | null
  due?: string | null
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const authorization = request.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!authorization) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  if (!url || !publicKey || !serviceKey || !openaiKey) {
    return new Response('Server configuration is incomplete', { status: 500, headers: corsHeaders })
  }

  const userClient = createClient(url, publicKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const body = await request.json() as RequestBody
  const title = body.title?.trim()
  const capability = body.capability ?? 'research'
  if (!title || !body.taskId) return new Response('Task title and task ID are required', { status: 400, headers: corsHeaders })

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: run, error: createError } = await admin.from('agent_runs').insert({
    user_id: user.id,
    task_id: body.taskId,
    status: 'running',
    objective: title,
    capability,
    context: {
      description: body.description ?? '',
      user_context: body.context ?? '',
      goal_id: body.goalId ?? null,
      due: body.due ?? null,
    },
    progress: ['understanding', 'researching', 'preparing_result'],
  }).select('id,created_at').single()
  if (createError || !run) return new Response('Could not create agent run', { status: 500, headers: corsHeaders })

  try {
    const useSearch = capability !== 'draft'
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6',
        reasoning: { effort: 'low' },
        store: false,
        max_output_tokens: 2400,
        tools: useSearch ? [{ type: 'web_search', search_context_size: 'medium' }] : [],
        tool_choice: useSearch ? 'auto' : 'none',
        include: useSearch ? ['web_search_call.action.sources'] : [],
        instructions: [
          'You are Shotcount Assistant. Move the user task forward with a concrete, reviewable work product.',
          'Support research, drafting, or research plus drafting only.',
          'Never send messages, submit forms, purchase anything, edit third-party accounts, or claim an external action happened.',
          'Use only the supplied task context. Do not expose hidden reasoning.',
          'Return concise structured JSON. Sources must be real URLs actually consulted.',
          'Follow-up tasks must be short actions the user can add to their to-do list.',
        ].join(' '),
        input: JSON.stringify({
          objective: title,
          description: body.description ?? '',
          additional_context: body.context ?? '',
          capability,
          due: body.due ?? null,
        }),
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: 'shotcount_agent_result',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                summary: { type: 'string' },
                sections: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: { title: { type: 'string' }, body: { type: 'string' } },
                    required: ['title', 'body'],
                  },
                },
                drafts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: { title: { type: 'string' }, body: { type: 'string' } },
                    required: ['title', 'body'],
                  },
                },
                followUps: { type: 'array', items: { type: 'string' }, maxItems: 5 },
                sources: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: { title: { type: 'string' }, url: { type: 'string' } },
                    required: ['title', 'url'],
                  },
                },
              },
              required: ['summary', 'sections', 'drafts', 'followUps', 'sources'],
            },
          },
        },
      }),
    })
    if (!response.ok) throw new Error('OpenAI request failed')
    const payload = await response.json()
    const outputText = payload.output
      ?.flatMap((item: { content?: unknown[] }) => item.content ?? [])
      .find((item: { type?: string }) => item.type === 'output_text')
      ?.text
    if (!outputText) throw new Error('Agent response was empty')
    const result = JSON.parse(outputText)
    const updatedAt = new Date().toISOString()
    await admin.from('agent_runs').update({ status: 'completed', result, updated_at: updatedAt }).eq('id', run.id)
    return new Response(JSON.stringify({
      id: run.id,
      taskId: body.taskId,
      status: 'completed',
      objective: title,
      context: body.context ?? body.description ?? '',
      capability,
      progressIndex: 4,
      result,
      createdAt: run.created_at,
      updatedAt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch {
    const updatedAt = new Date().toISOString()
    await admin.from('agent_runs').update({ status: 'failed', error: 'Execution failed', updated_at: updatedAt }).eq('id', run.id)
    return new Response('Shotcount could not complete this task', { status: 502, headers: corsHeaders })
  }
})
