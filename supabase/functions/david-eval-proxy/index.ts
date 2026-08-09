import { agentToolDefinitions, openAIToolDefinition } from '../_shared/agent-tools.ts'
import { DAVID_APPLICATION_V21_MODEL_CONFIG } from '../_shared/david-agent-config.ts'
import { applicationSemanticFunctions } from '../_shared/application-engine.ts'

type RequestBody = { benchmarkVersion?: string; runId?: string; mode?: 'semantic'; request?: { function?: string } }

function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }) }
function secureEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right)
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!
  return difference === 0
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const token = Deno.env.get('DAVID_EVAL_TOKEN') ?? ''
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !secureEqual(token, supplied)) return json({ error: 'Unauthorized' }, 401)
  const body = await request.json().catch(() => null) as RequestBody | null
  const functionName = body?.request?.function ?? ''
  if (!body || body.benchmarkVersion !== 'david_application_engine_v3' || body.mode !== 'semantic' || !body.runId || body.runId.length > 220 || !applicationSemanticFunctions.includes(functionName as typeof applicationSemanticFunctions[number])) return json({ error: 'Invalid benchmark request' }, 400)
  const tool = agentToolDefinitions.find(item => item.name === `application.${functionName}`)
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!tool || !openaiKey) return json({ error: 'Provider unavailable' }, 503)
  const wireTool = openAIToolDefinition(tool)
  const provider = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: DAVID_APPLICATION_V21_MODEL_CONFIG.model, reasoning: { effort: 'low' }, store: false, max_output_tokens: 1200, parallel_tool_calls: false,
      tool_choice: { type: 'function', name: wireTool.name }, tools: [wireTool],
      instructions: 'Answer exactly one bounded application-engine semantic question. Use only supplied VERIFIED facts and evidence IDs. Return the forced function; do not plan or execute workflow.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(body.request) }] }],
      metadata: { benchmark_version: 'david_application_engine_v3', benchmark_run_id: body.runId, engine_version: 'david-application-engine@3' },
    }),
  })
  const payload = await provider.json().catch(() => ({ error: { message: 'Invalid provider response' } }))
  if (!provider.ok) return json({ error: payload?.error?.message ?? `Provider failed with ${provider.status}`, retryAfterMs: Number(provider.headers.get('retry-after') ?? 0) * 1000 }, provider.status === 429 ? 429 : 502)
  return json(payload)
})
