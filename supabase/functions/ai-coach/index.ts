import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GRADUATE_APPLICATION_ONLY_CODE, GRADUATE_APPLICATION_ONLY_MESSAGE, isGraduateApplicationTask } from '../_shared/application.ts'
import { requestApplicationModel } from '../_shared/application-model-request.ts'

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
    userClient.from('tasks').select('title,description,due_date,priority,estimate_minutes,completed_at,carried_count,last_carry_reason').gte('due_date', cutoff).limit(120),
    userClient.from('reviews').select('review_date,wins,blockers,stop_doing,continue_doing').order('review_date', { ascending: false }).limit(4),
  ])
  if (tasksResult.error || reviewsResult.error) return new Response('Could not read planning summary', { status: 500, headers: corsHeaders })
  const applicationTasks = (tasksResult.data ?? []).filter(task => isGraduateApplicationTask(task.title, task.description ?? ''))
  const applicationContext = applicationTasks.map(task => `${task.title} ${task.description ?? ''}`).join(' ')
  if (!applicationTasks.length) {
    return new Response(JSON.stringify({ error: GRADUATE_APPLICATION_ONLY_MESSAGE, code: GRADUATE_APPLICATION_ONLY_CODE }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let result: Record<string, unknown>
  try {
    const response = await requestApplicationModel<Record<string, unknown>>({
      apiKey: openaiKey,
      maxRetries: 1,
      body: {
      model: 'gpt-5.4-mini',
      reasoning: { effort: 'low' },
      store: false,
      max_output_tokens: 500,
      instructions: [
        'You are Shotcount’s calm graduate-school application planning coach.',
        'Find one useful pattern in the supplied graduate-school application tasks and review summary.',
        'Be warm, specific, non-judgmental, and concise.',
        'Never diagnose health, infer protected traits, or claim certainty.',
        'Do not change plans. Offer up to three optional next actions, and keep every action inside the graduate-school application workflow.',
      ].join(' '),
      input: JSON.stringify({ tasks: applicationTasks, reviews: reviewsResult.data ?? [] }),
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
      },
    })
    result = response.payload
  } catch {
    return new Response('Coaching service is unavailable', { status: 502, headers: corsHeaders })
  }

  const outputItems = Array.isArray(result.output) ? result.output as Array<{ content?: Array<{ type?: string; text?: string }> }> : []
  const outputText = outputItems
    .flatMap(item => item.content ?? [])
    .find((item: { type?: string }) => item.type === 'output_text')
    ?.text
  if (!outputText) return new Response('Coaching response was empty', { status: 502, headers: corsHeaders })

  const insight = JSON.parse(outputText) as { actions?: unknown }
  const scopedInsight = {
    ...insight,
    actions: (Array.isArray(insight.actions) ? insight.actions : [])
      .filter((action): action is string => typeof action === 'string' && isGraduateApplicationTask(action, applicationContext))
      .slice(0, 3),
  }
  await admin.from('ai_usage').insert({ user_id: user.id })
  return new Response(JSON.stringify(scopedInsight), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
