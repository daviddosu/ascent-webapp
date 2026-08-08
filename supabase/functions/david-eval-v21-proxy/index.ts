import { agentToolDefinitions, openAIToolDefinition } from '../_shared/agent-tools.ts'
import { DAVID_APPLICATION_V21_MODEL_CONFIG, davidApplicationV21Instructions } from '../_shared/david-agent-config.ts'
import { specialistCanUseTool } from '../_shared/specialists.ts'

type RequestBody = { benchmarkVersion?: string; runId?: string; mode?: 'agent'; input?: unknown[]; enableWebSearch?: boolean }
const benchmarkVersion = 'david_application_eval_v2_1'
const maximumBytes = 5_000_000

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
function secureEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right)
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!
  return difference === 0
}
function retryAfterMs(response: Response, message: string) {
  const seconds = Number(response.headers.get('retry-after') ?? '')
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1_000)
  const match = message.match(/try again in\s+([\d.]+)\s*(ms|s)/i)
  return match ? Math.ceil(Number(match[1]) * (match[2]?.toLocaleLowerCase() === 'ms' ? 1 : 1_000)) : null
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const configuredToken = Deno.env.get('DAVID_EVAL_V21_TOKEN') ?? ''
  const suppliedToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!configuredToken || !secureEqual(configuredToken, suppliedToken)) return json({ error: 'Unauthorized' }, 401)
  if (Number(request.headers.get('Content-Length') ?? 0) > maximumBytes) return json({ error: 'Request is too large' }, 413)
  const body = await request.json().catch(() => null) as RequestBody | null
  if (!body || body.benchmarkVersion !== benchmarkVersion || !/^david-v21-[a-z0-9-]{8,120}$/.test(body.runId ?? '') || body.mode !== 'agent' || !Array.isArray(body.input) || body.input.length < 1 || body.input.length > 200 || JSON.stringify(body).length > maximumBytes) return json({ error: 'Invalid benchmark request' }, 400)
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!openaiKey) return json({ error: 'Model provider is unavailable' }, 503)
  const tools: Array<Record<string, unknown>> = agentToolDefinitions.filter(tool => specialistCanUseTool('david', tool.name)).map(openAIToolDefinition)
  if (body.enableWebSearch) tools.push({ type: 'web_search', search_context_size: 'medium' })
  const requestBody = {
    model: DAVID_APPLICATION_V21_MODEL_CONFIG.model,
    reasoning: DAVID_APPLICATION_V21_MODEL_CONFIG.reasoning,
    store: false,
    max_output_tokens: DAVID_APPLICATION_V21_MODEL_CONFIG.maxOutputTokens,
    parallel_tool_calls: false,
    tool_choice: 'auto',
    tools,
    input: body.input,
    instructions: davidApplicationV21Instructions(),
    metadata: { benchmark_version: benchmarkVersion, benchmark_run_id: body.runId, benchmark_role: 'agent', david_prompt_version: DAVID_APPLICATION_V21_MODEL_CONFIG.davidPromptVersion, harness_version: DAVID_APPLICATION_V21_MODEL_CONFIG.harnessVersion },
  }
  try {
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(180_000) })
    const payload = await response.json().catch(() => ({ error: { message: 'Model provider returned invalid JSON.' } }))
    if (!response.ok) {
      const message = typeof payload?.error?.message === 'string' ? payload.error.message : `Model provider failed with ${response.status}.`
      return json({ error: message, providerStatus: response.status, retryAfterMs: retryAfterMs(response, message) }, response.status === 429 ? 429 : 502)
    }
    return json(payload)
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Model request failed.' }, 502) }
})
