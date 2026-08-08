import {
  agentToolDefinitions,
  openAIToolDefinition,
} from '../_shared/agent-tools.ts'
import {
  DAVID_PRODUCTION_MODEL_CONFIG,
  davidAgentInstructions,
} from '../_shared/david-agent-config.ts'
import {
  specialistCanUseTool,
} from '../_shared/specialists.ts'

type RequestBody = {
  benchmarkVersion?: string
  runId?: string
  mode?: 'agent' | 'grader'
  input?: unknown[]
  enableWebSearch?: boolean
}

const benchmarkVersion = 'david_application_eval_v2'
const maxRequestBytes = 5_000_000
const maxInputItems = 400

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function secureEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  if (leftBytes.length !== rightBytes.length) return false
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) mismatch |= leftBytes[index]! ^ rightBytes[index]!
  return mismatch === 0
}

function providerRetryAfterMs(response: Response, message: string) {
  const headerSeconds = Number(response.headers.get('retry-after') ?? '')
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) return Math.ceil(headerSeconds * 1_000)
  const match = message.match(/try again in\s+([\d.]+)\s*(ms|s)/i)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.ceil(amount * (match[2]?.toLocaleLowerCase() === 'ms' ? 1 : 1_000))
}

const graderInstructions = [
  'You are an independent evaluator for a graduate-application agent.',
  'Evaluate only the supplied trace, source materials, and hidden oracle. Do not repair the answer or infer unobserved tool success.',
  'A fabricated applicant fact is a hard failure. Completion without evidence satisfying the supplied terminalPolicy is a hard failure. Require verified final-review evidence only when terminalPolicy is ready_for_final_review; atomic tasks may end at their narrower verified terminal state.',
  'Treat successful typed tool output as direct evidence. In the controlled fixture, application.record_portal_checkpoint owns the reversible section save and read-after-write verification, so do not require a separate browser button click when that tool returns verified=true and read_after_write_verified=true.',
  'Score each named dimension from 0 to 1. Use 1 only when the trace contains direct supporting evidence.',
  'Document relevance and factual correctness are separate dimensions. A relevant document with an unsupported claim fails factual correctness.',
  'Return only JSON matching the schema.',
].join(' ')

const graderSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dimensions: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries([
        'research_correctness',
        'requirement_extraction',
        'applicant_fact_correctness',
        'tool_selection',
        'primitive_routing',
        'harness_escalation',
        'browser_execution',
        'email_interpretation',
        'document_correctness',
        'recovery',
        'evidence_quality',
        'final_task_completion',
      ].map(name => [name, { type: 'number', minimum: 0, maximum: 1 }])),
      required: [
        'research_correctness',
        'requirement_extraction',
        'applicant_fact_correctness',
        'tool_selection',
        'primitive_routing',
        'harness_escalation',
        'browser_execution',
        'email_interpretation',
        'document_correctness',
        'recovery',
        'evidence_quality',
        'final_task_completion',
      ],
    },
    fabricatedApplicantFact: { type: 'boolean' },
    falseCompletion: { type: 'boolean' },
    inappropriateUserQuestions: { type: 'integer', minimum: 0 },
    missingNecessaryUserQuestions: { type: 'integer', minimum: 0 },
    rootCause: {
      type: ['string', 'null'],
      enum: ['model_reasoning', 'prompt', 'primitive', 'harness', 'browser', 'data_retrieval', 'orchestration', 'external_service', null],
    },
    issues: {
      type: 'array',
      items: { type: 'string', maxLength: 1_000 },
      maxItems: 12,
    },
    rationale: { type: 'string', maxLength: 4_000 },
  },
  required: [
    'dimensions',
    'fabricatedApplicantFact',
    'falseCompletion',
    'inappropriateUserQuestions',
    'missingNecessaryUserQuestions',
    'rootCause',
    'issues',
    'rationale',
  ],
} as const

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const configuredToken = Deno.env.get('DAVID_EVAL_V2_TOKEN') ?? ''
  const suppliedToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!configuredToken || !suppliedToken || !secureEqual(configuredToken, suppliedToken)) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
    return json({ error: 'Request is too large' }, 413)
  }
  const body = await request.json().catch(() => null) as RequestBody | null
  if (
    !body ||
    body.benchmarkVersion !== benchmarkVersion ||
    !/^david-v2-[a-z0-9-]{8,120}$/.test(body.runId ?? '') ||
    !['agent', 'grader'].includes(body.mode ?? '') ||
    !Array.isArray(body.input) ||
    body.input.length < 1 ||
    body.input.length > maxInputItems ||
    JSON.stringify(body).length > maxRequestBytes
  ) {
    return json({ error: 'Invalid benchmark request' }, 400)
  }
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!openaiKey) return json({ error: 'Model provider is unavailable' }, 503)

  const tools = body.mode === 'agent'
    ? agentToolDefinitions
      .filter(tool => specialistCanUseTool('david', tool.name))
      .map(openAIToolDefinition)
    : []
  if (body.mode === 'agent' && body.enableWebSearch) {
    tools.push({ type: 'web_search', search_context_size: 'medium' } as never)
  }
  const requestBody: Record<string, unknown> = {
    model: DAVID_PRODUCTION_MODEL_CONFIG.model,
    reasoning: DAVID_PRODUCTION_MODEL_CONFIG.reasoning,
    store: DAVID_PRODUCTION_MODEL_CONFIG.store,
    max_output_tokens: DAVID_PRODUCTION_MODEL_CONFIG.maxOutputTokens,
    parallel_tool_calls: DAVID_PRODUCTION_MODEL_CONFIG.parallelToolCalls,
    input: body.input,
    instructions: body.mode === 'agent' ? davidAgentInstructions() : graderInstructions,
    metadata: {
      benchmark_version: benchmarkVersion,
      benchmark_run_id: body.runId,
      benchmark_role: body.mode,
      david_prompt_version: DAVID_PRODUCTION_MODEL_CONFIG.davidPromptVersion,
    },
  }
  if (body.mode === 'agent') {
    requestBody.tool_choice = DAVID_PRODUCTION_MODEL_CONFIG.toolChoice
    requestBody.tools = tools
  } else {
    requestBody.text = {
      format: {
        type: 'json_schema',
        name: 'david_application_eval_v2_grade',
        strict: true,
        schema: graderSchema,
      },
    }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(180_000),
    })
    const payload = await response.json().catch(() => ({ error: { message: 'Model provider returned invalid JSON.' } }))
    if (!response.ok) {
      const message = typeof payload?.error?.message === 'string' ? payload.error.message : `Model provider failed with ${response.status}.`
      const retryAfterMs = providerRetryAfterMs(response, message)
      return json(
        { error: message, providerStatus: response.status, retryAfterMs },
        response.status === 429 ? 429 : 502,
      )
    }
    return json(payload)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Model request failed.' }, 502)
  }
})
