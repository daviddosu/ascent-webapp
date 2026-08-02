export function safeBrowserRetryDelayMs(
  operationType: string,
  errorCode: string,
  completedAttempts: number,
) {
  if (operationType === 'submit' || completedAttempts < 1 || completedAttempts >= 3) return null
  const providerDelay = errorCode === 'flight_results_timeout' ? 15_000 : 8_000
  return providerDelay * completedAttempts
}

export function isTransientSingleObjectCoercionError(message: string) {
  return /coerce the result to a single json object/i.test(message)
}

export type CanonicalFlightSearch = {
  origin: string
  destination: string
  departDate: string
  returnDate?: string
  cabin: string
  maxStops?: number
  maxPrice?: number
  currency?: string
  stage: 'searching' | 'results_ready' | 'selecting' | 'handoff'
}

export const googleFlightsBrowserDomains = ['google.com', 'www.google.com'] as const

/**
 * Browser domains come from model arguments or a comma-separated server
 * secret. Normalize both forms to hostnames before comparing them. A domain
 * is not allowed to carry a path, credentials, or a non-HTTPS scheme.
 */
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
    if (
      !hostname ||
      hostname.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname)
    ) return null
    return hostname
  } catch {
    return null
  }
}

export function normalizeBrowserDomains(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  return [...new Set(values.map(normalizeBrowserDomain).filter((domain): domain is string => Boolean(domain)))]
}

export function validatedFlightEvidence(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const rawOptions = Array.isArray(record.options)
    ? record.options
    : Array.isArray(record.flightOptions)
      ? record.flightOptions
      : []
  const searchUrl = typeof record.searchUrl === 'string' ? record.searchUrl : ''
  let parsedUrl: URL
  try {
    parsedUrl = new URL(searchUrl)
  } catch {
    return null
  }
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'www.google.com' ||
    !parsedUrl.pathname.startsWith('/travel/flights') ||
    !rawOptions.length
  ) return null
  const options = rawOptions.filter((option): option is Record<string, unknown> => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return false
    const candidate = option as Record<string, unknown>
    return Boolean(
      typeof candidate.id === 'string' && candidate.id.trim() &&
      candidate.provider === 'Google Flights' &&
      typeof candidate.searchUrl === 'string' && candidate.searchUrl === searchUrl &&
      typeof candidate.airline === 'string' && candidate.airline.trim() &&
      typeof candidate.route === 'string' && candidate.route.trim() &&
      typeof candidate.departureTime === 'string' && candidate.departureTime.trim() &&
      typeof candidate.arrivalTime === 'string' && candidate.arrivalTime.trim() &&
      typeof candidate.duration === 'string' && candidate.duration.trim() &&
      Number.isFinite(Number(candidate.durationMinutes)) &&
      Number.isFinite(Number(candidate.stopCount)) &&
      Number.isFinite(Number(candidate.amount)) &&
      typeof candidate.price === 'string' && candidate.price.trim()
    )
  })
  return options.length === rawOptions.length
    ? { searchUrl, options }
    : null
}

/** Keep an already validated result when a later retry is incomplete. */
export function preferValidatedFlightEvidence(current: unknown, candidate: unknown) {
  return validatedFlightEvidence(candidate) ?? validatedFlightEvidence(current)
}

export function caspianFlightHandoffAllowed(result: unknown) {
  return Boolean(validatedFlightEvidence(result))
}

export function isCompletedBrowserOperation(lastOperation: unknown, operationId: string) {
  if (!lastOperation || typeof lastOperation !== 'object' || Array.isArray(lastOperation)) return false
  const operation = lastOperation as Record<string, unknown>
  return operation.id === operationId && operation.status === 'succeeded'
}

export function canonicalFlightSearch(argumentsValue: Record<string, unknown>, stage: CanonicalFlightSearch['stage'] = 'searching'): CanonicalFlightSearch {
  return {
    origin: String(argumentsValue.origin_code ?? argumentsValue.origin ?? '').trim().toUpperCase(),
    destination: String(argumentsValue.destination_code ?? argumentsValue.destination ?? '').trim().toUpperCase(),
    departDate: String(argumentsValue.departure_date ?? argumentsValue.depart_date ?? '').trim(),
    ...(argumentsValue.return_date ? { returnDate: String(argumentsValue.return_date).trim() } : {}),
    cabin: String(argumentsValue.cabin ?? 'economy').trim().toLocaleLowerCase(),
    ...(Number.isFinite(Number(argumentsValue.max_stops)) ? { maxStops: Number(argumentsValue.max_stops) } : {}),
    ...(Number.isFinite(Number(argumentsValue.budget_amount ?? argumentsValue.max_price)) ? { maxPrice: Number(argumentsValue.budget_amount ?? argumentsValue.max_price) } : {}),
    ...(argumentsValue.currency ? { currency: String(argumentsValue.currency).trim().toUpperCase() } : {}),
    stage,
  }
}

export function browserFailureClass(code: string) {
  if (/timeout|worker|target_closed|network|unreachable|results_not_ready|provider/i.test(code)) return 'PROVIDER_OR_BROWSER_INFRA' as const
  return 'BROWSER_TASK' as const
}

export function shouldRecycleBrowserSession(operationType: string, code: string, completedAttempts: number) {
  return operationType !== 'submit' && browserFailureClass(code) === 'PROVIDER_OR_BROWSER_INFRA' && completedAttempts >= 2
}
