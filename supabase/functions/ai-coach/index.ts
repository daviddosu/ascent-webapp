import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
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

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('requested_at', since)
  if ((count ?? 0) >= 10) return new Response('Daily coaching limit reached', { status: 429, headers: corsHeaders })

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [tasksResult, reviewsResult] = await Promise.all([
    userClient.from('tasks').select('title,due_date,priority,estimate_minutes,completed_at,carried_count,last_carry_reason').gte('due_date', cutoff).limit(120),
    userClient.from('reviews').select('review_date,wins,blockers,stop_doing,continue_doing').order('review_date', { ascending: false }).limit(4),
  ])
  if (tasksResult.error || reviewsResult.error) return new Response('Could not read planning summary', { status: 500, headers: corsHeaders })

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      reasoning: { effort: 'low' },
      store: false,
      max_output_tokens: 500,
      instructions: [
        'You are Shotcount’s calm planning coach.',
        'Find one useful pattern in the supplied task and review summary.',
        'Be warm, specific, non-judgmental, and concise.',
        'Never diagnose health, infer protected traits, or claim certainty.',
        'Do not change plans. Offer up to three optional next actions.',
      ].join(' '),
      input: JSON.stringify({ tasks: tasksResult.data ?? [], reviews: reviewsResult.data ?? [] }),
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'shotcount_coaching',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              detail: { type: 'string' },
              actions: { type: 'array', items: { type: 'string' }, maxItems: 3 },
            },
            required: ['title', 'detail', 'actions'],
          },
        },
      },
    }),
  })
  if (!response.ok) return new Response('Coaching service is unavailable', { status: 502, headers: corsHeaders })

  const result = await response.json()
  const outputText = result.output
    ?.flatMap((item: { content?: unknown[] }) => item.content ?? [])
    .find((item: { type?: string }) => item.type === 'output_text')
    ?.text
  if (!outputText) return new Response('Coaching response was empty', { status: 502, headers: corsHeaders })

  const insight = JSON.parse(outputText)
  await admin.from('ai_usage').insert({ user_id: user.id })
  return new Response(JSON.stringify(insight), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
