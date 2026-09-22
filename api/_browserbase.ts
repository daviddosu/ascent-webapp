type BrowserbaseSession = {
  id: string
  connectUrl: string
  contextId: string
}

type BrowserbaseProviderState = {
  contextId: string
  sessionId: string
}

const browserbaseApi = 'https://www.browserbase.com/v1'
const freePlanSessionLimitSeconds = 900

function sessionTimeoutSeconds(env: Record<string, string | undefined>) {
  const configured = Number.parseInt(env.BROWSERBASE_SESSION_TIMEOUT_SECONDS ?? '', 10)
  if (!Number.isFinite(configured)) return freePlanSessionLimitSeconds
  return Math.min(21_600, Math.max(60, configured))
}

function booleanEnvironmentValue(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLocaleLowerCase())
}

/**
 * Browser recordings and provider logs can contain applicant data. Keep them
 * off by default; beta qualification can opt in explicitly through server
 * environment configuration without changing application code.
 */
export function browserbaseSessionSettings(env: Record<string, string | undefined> = process.env) {
  return {
    timeoutSeconds: sessionTimeoutSeconds(env),
    recordSession: booleanEnvironmentValue(env.BROWSERBASE_RECORD_SESSION, false),
    logSession: booleanEnvironmentValue(env.BROWSERBASE_LOG_SESSION, false),
  }
}

function configuration() {
  const apiKey = process.env.BROWSERBASE_API_KEY?.trim() ?? ''
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim() ?? ''
  return apiKey && projectId ? { apiKey, projectId } : null
}

async function request(path: string, init: RequestInit = {}) {
  const config = configuration()
  if (!config) throw new Error('The production browser provider is not configured.')
  const response = await fetch(`${browserbaseApi}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-BB-API-Key': config.apiKey,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`The production browser provider returned ${response.status}.`)
  return response.json() as Promise<Record<string, unknown>>
}

export function browserbaseConfigured() {
  return Boolean(configuration())
}

async function createContext() {
  const config = configuration()
  if (!config) throw new Error('The production browser provider is not configured.')
  const context = await request('/contexts', {
    method: 'POST',
    body: JSON.stringify({ projectId: config.projectId }),
  })
  const id = typeof context.id === 'string' ? context.id : ''
  if (!id) throw new Error('The production browser provider did not return a context ID.')
  return id
}

async function createSession(contextId: string) {
  const config = configuration()
  if (!config) throw new Error('The production browser provider is not configured.')
  const settings = browserbaseSessionSettings()
  const session = await request('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      projectId: config.projectId,
      keepAlive: true,
      timeout: settings.timeoutSeconds,
      browserSettings: {
        context: { id: contextId, persist: true },
        solveCaptchas: false,
        recordSession: settings.recordSession,
        logSession: settings.logSession,
      },
    }),
  })
  const id = typeof session.id === 'string' ? session.id : ''
  const connectUrl = typeof session.connectUrl === 'string' ? session.connectUrl : ''
  if (!id || !connectUrl) throw new Error('The production browser provider did not return a connectable session.')
  return { id, connectUrl, contextId } satisfies BrowserbaseSession
}

async function retrieveSession(sessionId: string, contextId: string) {
  try {
    const session = await request(`/sessions/${encodeURIComponent(sessionId)}`)
    const connectUrl = typeof session.connectUrl === 'string' ? session.connectUrl : ''
    const status = typeof session.status === 'string' ? session.status.toLocaleUpperCase() : ''
    if (!connectUrl || ['COMPLETED', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(status)) return null
    return { id: sessionId, connectUrl, contextId } satisfies BrowserbaseSession
  } catch {
    return null
  }
}

export async function acquireBrowserbaseSession(previous?: Partial<BrowserbaseProviderState> | null) {
  const existingContextId = typeof previous?.contextId === 'string' ? previous.contextId : ''
  const existingSessionId = typeof previous?.sessionId === 'string' ? previous.sessionId : ''
  if (existingContextId && existingSessionId) {
    const existing = await retrieveSession(existingSessionId, existingContextId)
    if (existing) return existing
  }
  const contextId = existingContextId || await createContext()
  return createSession(contextId)
}

export async function browserbaseLiveView(sessionId: string) {
  const result = await request(`/sessions/${encodeURIComponent(sessionId)}/debug`)
  const value = typeof result.debuggerFullscreenUrl === 'string' ? result.debuggerFullscreenUrl : ''
  if (!value.startsWith('https://')) throw new Error('The production browser provider did not return a secure live view.')
  return value
}
