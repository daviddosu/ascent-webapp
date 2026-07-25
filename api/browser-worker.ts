import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import {
  BrowserExecutionError,
  resumeFlightSelection,
  runLiveFlightSearch,
  type FlightOption,
  type FlightSearchInput,
} from './_flight-browser.js'
import {
  actOnPublicPage,
  navigatePublicPage,
  submitPublicPage,
  type PublicBrowserAction,
  type PublicBrowserState,
} from './_public-browser.js'

export const maxDuration = 60

type WorkerRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type WorkerResponse = {
  status(code: number): WorkerResponse
  json(value: unknown): void
  setHeader(name: string, value: string): void
}

type BrowserOperation = {
  id: string
  type: 'navigate' | 'act' | 'submit' | 'search_flights' | 'select_flight'
  arguments: Record<string, unknown>
}

type BrowserCheckpoint = {
  pendingOperation?: BrowserOperation | null
  lastOperation?: {
    id: string
    type: BrowserOperation['type']
    status: 'succeeded' | 'failed'
    output?: Record<string, unknown>
    error?: { code: string; message: string; retryable: boolean }
    completedAt: string
  }
  flightSearch?: {
    input: FlightSearchInput
    provider: 'Google Flights'
    searchUrl: string
    observedAt: string
    options: FlightOption[]
  }
  selectedFlight?: Record<string, unknown>
  publicBrowser?: PublicBrowserState
  submissionAttempted?: {
    operationId: string
    attemptedAt: string
  }
  workerAttempts?: number
  [key: string]: unknown
}

function headerValue(request: WorkerRequest, name: string) {
  const entry = Object.entries(request.headers)
    .find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase())?.[1]
  return Array.isArray(entry) ? entry[0] ?? '' : entry ?? ''
}

function secureEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function parseBody(request: WorkerRequest) {
  if (typeof request.body === 'string') return JSON.parse(request.body) as Record<string, unknown>
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
    return request.body as Record<string, unknown>
  }
  return {}
}

function searchInput(argumentsValue: Record<string, unknown>): FlightSearchInput {
  return {
    originCode: String(argumentsValue.origin_code),
    destinationCode: String(argumentsValue.destination_code),
    departureDate: String(argumentsValue.departure_date),
    returnDate: String(argumentsValue.return_date),
    cabin: argumentsValue.cabin as FlightSearchInput['cabin'],
    maxStops: Number(argumentsValue.max_stops) as FlightSearchInput['maxStops'],
    budgetAmount: argumentsValue.budget_amount === null
      ? null
      : Number(argumentsValue.budget_amount),
    currency: argumentsValue.currency as FlightSearchInput['currency'],
    preferredAirlines: Array.isArray(argumentsValue.preferred_airlines)
      ? argumentsValue.preferred_airlines.map(value => String(value))
      : [],
  }
}

function publicError(error: unknown) {
  if (error instanceof BrowserExecutionError) {
    return { code: error.code, message: error.message, retryable: error.retryable }
  }
  return {
    code: 'browser_worker_failed',
    message: error instanceof Error
      ? error.message.slice(0, 500)
      : 'The isolated browser worker could not finish this step.',
    retryable: true,
  }
}

export default async function handler(request: WorkerRequest, response: WorkerResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const expectedToken = process.env.SHOTCOUNT_BROWSER_WORKER_TOKEN ?? ''
  const authorization = headerValue(request, 'authorization')
  const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!expectedToken || !suppliedToken || !secureEqual(suppliedToken, expectedToken)) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    response.status(500).json({ error: 'Worker configuration is incomplete' })
    return
  }

  const body = parseBody(request)
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const operationId = typeof body.operationId === 'string' ? body.operationId : ''
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || operationId.length < 8 || operationId.length > 500) {
    response.status(400).json({ error: 'Valid session and operation IDs are required' })
    return
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const sessionResult = await admin
    .from('browser_execution_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (sessionResult.error || !sessionResult.data) {
    response.status(404).json({ error: 'Browser session not found' })
    return
  }

  const session = sessionResult.data
  const checkpoint = (session.checkpoint ?? {}) as BrowserCheckpoint
  const operation = checkpoint.pendingOperation
  if (
    !operation ||
    operation.id !== operationId ||
    !['navigate', 'act', 'submit', 'search_flights', 'select_flight'].includes(operation.type)
  ) {
    if (
      checkpoint.lastOperation?.id === operationId &&
      checkpoint.lastOperation.status === 'succeeded'
    ) {
      response.status(200).json({ ok: true, duplicate: true })
      return
    }
    response.status(409).json({ error: 'Browser operation changed or was already handled' })
    return
  }
  if (
    !Array.isArray(session.allowed_domains) ||
    !session.allowed_domains.length ||
    ((operation.type === 'search_flights' || operation.type === 'select_flight') &&
      !session.allowed_domains.includes('www.google.com'))
  ) {
    response.status(403).json({ error: 'The requested domain is not allowed for this browser session' })
    return
  }
  if (operation.type === 'submit' && checkpoint.submissionAttempted?.operationId === operation.id) {
    const uncertainError = {
      code: 'browser_submission_status_unknown',
      message: 'The approved form may already have been submitted. ShotCount will not submit it again automatically.',
      retryable: false,
    }
    await admin.from('browser_execution_sessions').update({
      status: 'failed',
      checkpoint: {
        ...checkpoint,
        pendingOperation: null,
        lastOperation: {
          id: operation.id,
          type: operation.type,
          status: 'failed',
          error: uncertainError,
          completedAt: new Date().toISOString(),
        },
      },
      resumable: false,
      last_observed_at: new Date().toISOString(),
    }).eq('id', session.id)
    response.status(409).json({ error: uncertainError.code })
    return
  }

  const workerSessionId = crypto.randomUUID()
  let claimedCheckpoint: BrowserCheckpoint = {
    ...checkpoint,
    workerAttempts: Number(checkpoint.workerAttempts ?? 0) + 1,
  }
  const claim = await admin
    .from('browser_execution_sessions')
    .update({
      status: 'working',
      worker_session_id: workerSessionId,
      checkpoint: claimedCheckpoint,
      last_observed_at: new Date().toISOString(),
    })
    .eq('id', session.id)
    .eq('updated_at', session.updated_at)
    .select('id')
    .maybeSingle()
  if (claim.error || !claim.data) {
    response.status(202).json({ ok: true, claimedByAnotherWorker: true })
    return
  }

  if (operation.type === 'submit') {
    claimedCheckpoint = {
      ...claimedCheckpoint,
      submissionAttempted: {
        operationId: operation.id,
        attemptedAt: new Date().toISOString(),
      },
    }
    const marked = await admin.from('browser_execution_sessions').update({
      checkpoint: claimedCheckpoint,
      last_observed_at: new Date().toISOString(),
    }).eq('id', session.id).eq('worker_session_id', workerSessionId)
    if (marked.error) {
      response.status(500).json({ error: 'browser_submission_checkpoint_failed' })
      return
    }
  }

  try {
    let output: Record<string, unknown>
    let nextCheckpoint: BrowserCheckpoint
    let currentUrl: string
    let paymentBoundaryReached = false

    if (operation.type === 'search_flights') {
      const input = searchInput(operation.arguments)
      const result = await runLiveFlightSearch(input)
      output = result as unknown as Record<string, unknown>
      currentUrl = result.searchUrl
      nextCheckpoint = {
        ...claimedCheckpoint,
        pendingOperation: null,
        flightSearch: { input, ...result },
        lastOperation: {
          id: operation.id,
          type: operation.type,
          status: 'succeeded',
          output,
          completedAt: new Date().toISOString(),
        },
      }
    } else if (operation.type === 'select_flight') {
      const flightSearch = checkpoint.flightSearch
      const optionId = String(operation.arguments.option_id ?? '')
      if (!flightSearch?.input || !Array.isArray(flightSearch.options)) {
        throw new BrowserExecutionError(
          'flight_search_checkpoint_missing',
          'The original flight search is no longer resumable.',
          false,
        )
      }
      const result = await resumeFlightSelection(
        flightSearch.input,
        flightSearch.options,
        optionId,
      )
      output = result as unknown as Record<string, unknown>
      currentUrl = result.handoffUrl
      paymentBoundaryReached = true
      nextCheckpoint = {
        ...claimedCheckpoint,
        pendingOperation: null,
        selectedFlight: output,
        lastOperation: {
          id: operation.id,
          type: operation.type,
          status: 'succeeded',
          output,
          completedAt: new Date().toISOString(),
        },
      }
    } else if (operation.type === 'navigate') {
      const state = await navigatePublicPage(String(operation.arguments.url ?? ''), session.allowed_domains)
      output = { observation: state.observation, resumable: true }
      currentUrl = state.currentUrl
      nextCheckpoint = {
        ...claimedCheckpoint,
        pendingOperation: null,
        publicBrowser: state,
        lastOperation: {
          id: operation.id,
          type: operation.type,
          status: 'succeeded',
          output,
          completedAt: new Date().toISOString(),
        },
      }
    } else if (operation.type === 'act') {
      if (!checkpoint.publicBrowser) {
        throw new BrowserExecutionError('browser_navigation_checkpoint_missing', 'Navigate this session before acting on the page.', false)
      }
      const action: PublicBrowserAction = {
        action: String(operation.arguments.action) as PublicBrowserAction['action'],
        target: String(operation.arguments.target ?? ''),
        value: operation.arguments.value === null ? null : String(operation.arguments.value ?? ''),
      }
      const state = await actOnPublicPage(checkpoint.publicBrowser, action, session.allowed_domains)
      output = { observation: state.observation, resumable: true }
      currentUrl = state.currentUrl
      nextCheckpoint = {
        ...claimedCheckpoint,
        pendingOperation: null,
        publicBrowser: state,
        lastOperation: {
          id: operation.id,
          type: operation.type,
          status: 'succeeded',
          output,
          completedAt: new Date().toISOString(),
        },
      }
    } else {
      if (!checkpoint.publicBrowser) {
        throw new BrowserExecutionError('browser_navigation_checkpoint_missing', 'Navigate this session before submitting a form.', false)
      }
      const result = await submitPublicPage(
        checkpoint.publicBrowser,
        String(operation.arguments.target ?? ''),
        session.allowed_domains,
      )
      if (!result.confirmationObserved) {
        throw new BrowserExecutionError(
          'browser_submission_status_unknown',
          'The approved form was submitted, but the page did not show a verifiable confirmation. ShotCount will not submit it again automatically.',
          false,
        )
      }
      output = {
        submitted: result.submitted,
        confirmation_observed: result.confirmationObserved,
        expected_effect: String(operation.arguments.expected_effect ?? ''),
        observation: result.state.observation,
      }
      currentUrl = result.state.currentUrl
      nextCheckpoint = {
        ...claimedCheckpoint,
        pendingOperation: null,
        publicBrowser: result.state,
        lastOperation: {
          id: operation.id,
          type: operation.type,
          status: 'succeeded',
          output,
          completedAt: new Date().toISOString(),
        },
      }
    }

    const finished = await admin
      .from('browser_execution_sessions')
      .update({
        status: 'completed',
        current_domain: new URL(currentUrl).hostname,
        current_url: currentUrl,
        checkpoint: nextCheckpoint,
        payment_boundary_reached: paymentBoundaryReached,
        resumable: true,
        last_observed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', session.id)
      .eq('worker_session_id', workerSessionId)
    if (finished.error) throw new Error(finished.error.message)
    response.status(200).json({ ok: true })
  } catch (error) {
    const safeError = publicError(error)
    await admin
      .from('browser_execution_sessions')
      .update({
        status: 'failed',
        checkpoint: {
          ...claimedCheckpoint,
          pendingOperation: null,
          lastOperation: {
            id: operation.id,
            type: operation.type,
            status: 'failed',
            error: safeError,
            completedAt: new Date().toISOString(),
          },
        },
        resumable: safeError.retryable,
        last_observed_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .eq('worker_session_id', workerSessionId)
    response.status(safeError.retryable ? 502 : 409).json({ error: safeError.code })
  }
}
