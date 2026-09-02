export function safeBrowserRetryDelayMs(
  operationType: string,
  _errorCode: string,
  completedAttempts: number,
) {
  if (operationType === 'submit' || completedAttempts >= 3) return null
  return 8_000 * Math.max(1, completedAttempts)
}

export function isTransientSingleObjectCoercionError(message: string) {
  return /coerce the result to a single json object/i.test(message)
}

export function normalizeBrowserDomain(value: unknown) {
  if (typeof value !== 'string') return null
  const raw = value.trim().toLocaleLowerCase()
  if (!raw) return null
  const candidate = raw.includes('://') ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      (url.pathname && url.pathname !== '/') ||
      url.search ||
      url.hash
    ) return null
    const hostname = url.hostname.replace(/\.$/, '')
    if (!hostname || hostname.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname)) return null
    return hostname
  } catch {
    return null
  }
}

export function normalizeBrowserDomains(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(values.map(normalizeBrowserDomain).filter((domain): domain is string => Boolean(domain)))]
}

export function isCompletedBrowserOperation(lastOperation: unknown, operationId: string) {
  if (!lastOperation || typeof lastOperation !== 'object' || Array.isArray(lastOperation)) return false
  const operation = lastOperation as Record<string, unknown>
  return operation.id === operationId && operation.status === 'succeeded'
}

export function browserOperationAttemptCount(checkpoint: unknown, operationId: string) {
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) return 0
  const record = checkpoint as Record<string, unknown>
  const byOperation = record.workerAttemptsByOperation
  if (byOperation && typeof byOperation === 'object' && !Array.isArray(byOperation)) {
    const attempt = Number((byOperation as Record<string, unknown>)[operationId])
    if (Number.isFinite(attempt) && attempt >= 0) return attempt
  }
  const legacyAttempt = Number(record.workerAttempts)
  return Number.isFinite(legacyAttempt) && legacyAttempt >= 0 ? legacyAttempt : 0
}

export function browserDispatchAttemptCount(checkpoint: unknown, operationId: string) {
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) return 0
  const record = checkpoint as Record<string, unknown>
  const byOperation = record.browserDispatchAttemptsByOperation
  if (!byOperation || typeof byOperation !== 'object' || Array.isArray(byOperation)) return 0
  const attempt = Number((byOperation as Record<string, unknown>)[operationId])
  return Number.isFinite(attempt) && attempt >= 0 ? attempt : 0
}

export function browserDispatchAllowed(checkpoint: unknown, operationId: string, maximum = 3) {
  return browserDispatchAttemptCount(checkpoint, operationId) < maximum
}

export function browserFailureClass(code: string) {
  if (/timeout|worker|target_closed|network|unreachable|provider|page_state/i.test(code)) return 'PROVIDER_OR_BROWSER_INFRA' as const
  return 'BROWSER_TASK' as const
}

export function isBrowserUserInterventionFailure(code: string) {
  return ['browser_sensitive_field_blocked', 'browser_submission_status_unknown'].includes(code)
}

export function shouldRecycleBrowserSession(operationType: string, code: string, completedAttempts: number) {
  return operationType !== 'submit' && browserFailureClass(code) === 'PROVIDER_OR_BROWSER_INFRA' && completedAttempts >= 2
}
