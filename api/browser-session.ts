import { createClient } from '@supabase/supabase-js'
import { browserbaseLiveView } from './_browserbase.js'

type BrowserSessionRequest = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
}

type BrowserSessionResponse = {
  status(code: number): BrowserSessionResponse
  json(value: unknown): void
  setHeader(name: string, value: string): void
}

function headerValue(request: BrowserSessionRequest, name: string) {
  const value = Object.entries(request.headers).find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default async function handler(request: BrowserSessionRequest, response: BrowserSessionResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }
  const authorization = headerValue(request, 'authorization')
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const supabaseUrl = process.env.SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!token || !supabaseUrl || !serviceRoleKey) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const auth = await admin.auth.getUser(token)
  if (auth.error || !auth.data.user) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const requestUrl = new URL(request.url ?? '/', 'https://app.shotcount.app')
  const sessionId = requestUrl.searchParams.get('session_id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    response.status(400).json({ error: 'A valid browser session is required' })
    return
  }
  const session = await admin.from('browser_execution_sessions')
    .select('id,status,checkpoint,expires_at')
    .eq('id', sessionId)
    .eq('user_id', auth.data.user.id)
    .maybeSingle()
  if (session.error || !session.data) {
    response.status(404).json({ error: 'Browser session not found' })
    return
  }
  const checkpoint = session.data.checkpoint && typeof session.data.checkpoint === 'object' && !Array.isArray(session.data.checkpoint)
    ? session.data.checkpoint as Record<string, unknown>
    : {}
  const status = typeof session.data.status === 'string' ? session.data.status : ''
  const expiresAt = Date.parse(String(session.data.expires_at ?? ''))
  const lastOperation = checkpoint.lastOperation && typeof checkpoint.lastOperation === 'object' && !Array.isArray(checkpoint.lastOperation)
    ? checkpoint.lastOperation as Record<string, unknown>
    : {}
  const lastError = lastOperation.error && typeof lastOperation.error === 'object' && !Array.isArray(lastOperation.error)
    ? lastOperation.error as Record<string, unknown>
    : {}
  const lastErrorCode = typeof lastError.code === 'string' ? lastError.code : ''
  const humanBoundaryFailure = new Set([
    'browser_authentication_required',
    'browser_captcha_required',
    'browser_sensitive_field_blocked',
  ]).has(lastErrorCode)
  const takeoverEligible = ['planning', 'working', 'waiting_external', 'waiting_for_user', 'needs_context'].includes(status) || humanBoundaryFailure
  if ((Number.isFinite(expiresAt) && expiresAt <= Date.now()) || !takeoverEligible) {
    response.status(409).json({ error: 'The secure browser session is no longer awaiting a human step' })
    return
  }
  const provider = checkpoint.browserProvider && typeof checkpoint.browserProvider === 'object' && !Array.isArray(checkpoint.browserProvider)
    ? checkpoint.browserProvider as Record<string, unknown>
    : {}
  const providerSessionId = typeof provider.sessionId === 'string' ? provider.sessionId : ''
  if (!providerSessionId) {
    response.status(409).json({ error: 'This browser session does not support secure takeover' })
    return
  }
  try {
    const liveViewUrl = await browserbaseLiveView(providerSessionId)
    response.status(200).json({ session_id: session.data.id, live_view_url: liveViewUrl, expires_at: session.data.expires_at })
  } catch {
    response.status(409).json({ error: 'The secure browser session has expired; resume the task to create a new session' })
  }
}
