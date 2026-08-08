import type { TraceEvent, Usage } from './types'

export type OpenAIOutputItem = {
  type?: string
  call_id?: string
  name?: string
  arguments?: string
  content?: Array<{ type?: string; text?: string; annotations?: unknown[] }>
  [key: string]: unknown
}

export type OpenAIResponse = {
  id?: string
  model?: string
  status?: string
  output?: OpenAIOutputItem[]
  output_text?: string
  error?: { message?: string; code?: string } | null
  usage?: {
    input_tokens?: number
    input_tokens_details?: {
      cached_tokens?: number
      cache_write_tokens?: number
      [key: string]: unknown
    }
    output_tokens?: number
    output_tokens_details?: {
      reasoning_tokens?: number
      [key: string]: unknown
    }
    total_tokens?: number
  }
}

type ProxyErrorPayload = OpenAIResponse & {
  error?: { message?: string; code?: string } | string | null
  providerStatus?: number
  retryAfterMs?: number | null
}

const emptyUsage = (): Usage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  inferenceCostUsd: 0,
})

/** Current standard-tier GPT-5.6 Luna token rates from the official model page. */
export const gpt56LunaTokenRatesPerMillion = {
  input: 0.20,
  cachedInput: 0.02,
  cacheWrite: 0.25,
  output: 1.20,
} as const

export function responseUsage(response: OpenAIResponse): Usage {
  const inputTokens = Number(response.usage?.input_tokens ?? 0)
  const cachedInputTokens = Number(response.usage?.input_tokens_details?.cached_tokens ?? 0)
  const cacheWriteTokens = Number(response.usage?.input_tokens_details?.cache_write_tokens ?? 0)
  const outputTokens = Number(response.usage?.output_tokens ?? 0)
  const reasoningTokens = Number(response.usage?.output_tokens_details?.reasoning_tokens ?? 0)
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens)
  const inferenceCostUsd = (
    uncachedInputTokens * gpt56LunaTokenRatesPerMillion.input +
    cachedInputTokens * gpt56LunaTokenRatesPerMillion.cachedInput +
    cacheWriteTokens * gpt56LunaTokenRatesPerMillion.cacheWrite +
    outputTokens * gpt56LunaTokenRatesPerMillion.output
  ) / 1_000_000
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: Number(response.usage?.total_tokens ?? inputTokens + outputTokens),
    inferenceCostUsd,
  }
}

export function addUsage(...items: Usage[]): Usage {
  return items.reduce((total, item) => ({
    inputTokens: total.inputTokens + item.inputTokens,
    cachedInputTokens: total.cachedInputTokens + item.cachedInputTokens,
    cacheWriteTokens: total.cacheWriteTokens + item.cacheWriteTokens,
    outputTokens: total.outputTokens + item.outputTokens,
    reasoningTokens: total.reasoningTokens + item.reasoningTokens,
    totalTokens: total.totalTokens + item.totalTokens,
    inferenceCostUsd: total.inferenceCostUsd + item.inferenceCostUsd,
  }), emptyUsage())
}

export function outputText(response: OpenAIResponse) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim()
  return (response.output ?? [])
    .flatMap(item => item.content ?? [])
    .map(item => typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n')
    .trim()
}

export function observableResponse(response: OpenAIResponse) {
  const source = response as OpenAIResponse & Record<string, unknown>
  const compact = {
    id: source.id,
    object: source.object,
    created_at: source.created_at,
    completed_at: source.completed_at,
    status: source.status,
    model: source.model,
    output: source.output,
    output_text: source.output_text,
    error: source.error,
    usage: source.usage,
    metadata: source.metadata,
  }
  return JSON.parse(JSON.stringify(compact, (key, value) =>
    key === 'encrypted_content' ? undefined : value,
  )) as OpenAIResponse
}

export class DavidV2ModelClient {
  readonly observedModels = new Set<string>()
  readonly trace: TraceEvent[]
  modelCalls = 0
  graderCalls = 0
  providerRetries = 0
  usage = emptyUsage()

  constructor(private readonly input: {
    endpoint: string
    token: string
    benchmarkVersion: string
    runId: string
    trace: TraceEvent[]
  }) {
    this.trace = input.trace
  }

  async call(mode: 'agent' | 'grader', history: unknown[], enableWebSearch = false) {
    const started = Date.now()
    let lastError = 'Model request failed.'
    const maximumAttempts = 10
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const response = await fetch(this.input.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.input.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            benchmarkVersion: this.input.benchmarkVersion,
            runId: this.input.runId,
            mode,
            input: history,
            enableWebSearch,
          }),
          signal: AbortSignal.timeout(195_000),
        })
        const payload = await response.json().catch(() => ({})) as ProxyErrorPayload
        if (!response.ok) {
          lastError = typeof payload.error === 'string'
            ? payload.error
            : payload.error?.message ?? `Eval proxy failed with ${response.status}.`
          const retryable = response.status === 429 || response.status >= 500
          if (!retryable || attempt === maximumAttempts) throw new Error(lastError)
          const retryAfterMs = Math.max(0, Number(payload.retryAfterMs ?? 0))
          const exponentialMs = Math.min(30_000, 750 * (2 ** Math.min(attempt - 1, 5)))
          const jitterMs = [...this.input.runId].reduce((sum, character) => sum + character.charCodeAt(0), attempt * 97) % 1_001
          const delayMs = Math.min(30_000, Math.max(retryAfterMs, exponentialMs) + jitterMs)
          this.providerRetries += 1
          this.trace.push({
            at: new Date().toISOString(),
            kind: 'harness',
            name: 'model_provider_backoff',
            input: { mode, attempt, providerStatus: payload.providerStatus ?? response.status },
            output: { delayMs },
            elapsedMs: 0,
            error: lastError,
          })
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
        if (payload.model) this.observedModels.add(payload.model)
        const usage = responseUsage(payload)
        this.usage = addUsage(this.usage, usage)
        if (mode === 'agent') this.modelCalls += 1
        else this.graderCalls += 1
        this.trace.push({
          at: new Date().toISOString(),
          kind: mode === 'agent' ? 'model' : 'grader',
          name: mode === 'agent' ? 'responses.create' : 'responses.grade',
          input: { itemCount: history.length, enableWebSearch, attempt },
          output: observableResponse(payload),
          elapsedMs: Date.now() - started,
          usage,
          error: null,
        })
        return payload
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (attempt === maximumAttempts || /Unauthorized|Invalid benchmark request/i.test(lastError)) break
        const delayMs = Math.min(10_000, 500 * (2 ** Math.min(attempt - 1, 4)))
        this.providerRetries += 1
        this.trace.push({
          at: new Date().toISOString(),
          kind: 'harness',
          name: 'model_provider_backoff',
          input: { mode, attempt, providerStatus: 'network' },
          output: { delayMs },
          elapsedMs: 0,
          error: lastError,
        })
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    this.trace.push({
      at: new Date().toISOString(),
      kind: mode === 'agent' ? 'model' : 'grader',
      name: mode === 'agent' ? 'responses.create' : 'responses.grade',
      input: { itemCount: history.length, enableWebSearch },
      elapsedMs: Date.now() - started,
      error: lastError,
    })
    throw new Error(lastError)
  }
}
