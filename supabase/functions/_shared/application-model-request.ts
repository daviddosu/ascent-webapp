/**
 * One bounded transport for graduate-application model calls. Retries are
 * limited to provider/network conditions that are safe to repeat because a
 * model request has no external side effect. Provider tools keep their own
 * durable idempotency and recovery path.
 */
export const APPLICATION_MODEL_REQUEST_VERSION = 'application-model-request@1' as const

export type ApplicationModelRequestResult<T> = {
  payload: T
  attempts: number
  retryCount: number
  latencyMs: number
}

export class ApplicationModelRequestError extends Error {
  readonly status: number | null
  readonly retryCount: number
  readonly retryable: boolean

  constructor(message: string, input: { status?: number | null; retryCount?: number; retryable?: boolean } = {}) {
    super(message)
    this.name = 'ApplicationModelRequestError'
    this.status = input.status ?? null
    this.retryCount = input.retryCount ?? 0
    this.retryable = input.retryable ?? false
  }
}

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function retryableStatus(status: number, response: Response) {
  const explicit = response.headers.get('x-should-retry')?.trim().toLocaleLowerCase()
  if (explicit === 'false' || explicit === '0') return false
  if (explicit === 'true' || explicit === '1') return true
  return status === 408 || status === 409 || status === 429 || status >= 500
}

export function retryDelayMs(response: Response, retryNumber: number, now = Date.now()) {
  const retryAfterMs = Number(response.headers.get('retry-after-ms') ?? '')
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return Math.min(8_000, Math.trunc(retryAfterMs))
  const retryAfter = response.headers.get('retry-after')?.trim() ?? ''
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(8_000, Math.trunc(seconds * 1_000))
  if (retryAfter) {
    const date = Date.parse(retryAfter)
    if (Number.isFinite(date)) return Math.min(8_000, Math.max(0, date - now))
  }
  return Math.min(8_000, 250 * (2 ** Math.max(0, retryNumber - 1)))
}

async function responsePayload(response: Response) {
  try {
    return await response.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function errorMessage(payload: Record<string, unknown>, status: number) {
  const error = payload.error
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return `OpenAI request failed with ${status}.`
}

export async function requestApplicationModel<T>(input: {
  apiKey: string
  body: Record<string, unknown>
  timeoutMs?: number
  maxRetries?: number
  fetchImpl?: FetchImplementation
  sleep?: (milliseconds: number) => Promise<void>
}): Promise<ApplicationModelRequestResult<T>> {
  const fetchImpl = input.fetchImpl ?? fetch
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))
  const timeoutMs = Math.max(1_000, Math.trunc(input.timeoutMs ?? 45_000))
  const maxRetries = Math.max(0, Math.min(8, Math.trunc(input.maxRetries ?? 1)))
  const startedAt = performance.now()
  let retryCount = 0
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    let response: Response
    try {
      response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input.body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (attempt > maxRetries) {
        throw new ApplicationModelRequestError(error instanceof Error ? error.message : 'The model request failed.', {
          retryCount,
          retryable: true,
        })
      }
      retryCount += 1
      await sleep(Math.min(8_000, 250 * (2 ** Math.max(0, retryCount - 1))))
      continue
    }
    const payload = await responsePayload(response)
    if (response.ok) {
      return {
        payload: payload as T,
        attempts: attempt,
        retryCount,
        latencyMs: Math.round(performance.now() - startedAt),
      }
    }
    const retryable = retryableStatus(response.status, response)
    if (!retryable || attempt > maxRetries) {
      throw new ApplicationModelRequestError(errorMessage(payload, response.status), {
        status: response.status,
        retryCount,
        retryable,
      })
    }
    retryCount += 1
    await sleep(retryDelayMs(response, retryCount))
  }
  throw new ApplicationModelRequestError('The model request ended without a provider response.', { retryCount, retryable: true })
}
