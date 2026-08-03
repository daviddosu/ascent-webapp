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
  adults?: number
  children?: number
  childrenAges?: number[]
  infants?: number
  infantSeatCount?: number
  allowNearbyAirports?: boolean
  excludedAirlines?: string[]
  departureTimeWindow?: string | null
  arrivalTimeWindow?: string | null
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

export function allowsGoogleFlightsDomain(value: unknown) {
  const domains = normalizeBrowserDomains(value)
  return domains.some(domain => googleFlightsBrowserDomains.includes(domain as typeof googleFlightsBrowserDomains[number]))
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
  const validDate = (date: unknown) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
    const parsed = new Date(`${date}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
  }
  const ids = new Set<string>()
  const options = rawOptions.filter((option): option is Record<string, unknown> => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return false
    const candidate = option as Record<string, unknown>
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
    const departureDateValid = candidate.departureDate === undefined || validDate(candidate.departureDate)
    const returnDateValid = candidate.returnDate === undefined || candidate.returnDate === null || validDate(candidate.returnDate)
    const arrivalDateValid = candidate.arrivalDate === undefined || validDate(candidate.arrivalDate)
    const arrivalOffsetValid = candidate.arrivalDayOffset === undefined ||
      (Number.isInteger(Number(candidate.arrivalDayOffset)) && Number(candidate.arrivalDayOffset) >= 0)
    const datesOrdered = typeof candidate.departureDate !== 'string' || candidate.returnDate === undefined || candidate.returnDate === null ||
      Date.parse(`${String(candidate.returnDate)}T00:00:00Z`) > Date.parse(`${candidate.departureDate}T00:00:00Z`)
    const arrivalDateOrdered = typeof candidate.arrivalDate !== 'string' || typeof candidate.departureDate !== 'string' ||
      Date.parse(`${candidate.arrivalDate}T00:00:00Z`) >= Date.parse(`${candidate.departureDate}T00:00:00Z`)
    const arrivalDateMatchesOffset = typeof candidate.arrivalDate !== 'string' ||
      typeof candidate.departureDate !== 'string' ||
      candidate.arrivalDayOffset === undefined ||
      Date.parse(`${candidate.arrivalDate}T00:00:00Z`) - Date.parse(`${candidate.departureDate}T00:00:00Z`) ===
        Number(candidate.arrivalDayOffset) * 24 * 60 * 60 * 1000
    const valid = Boolean(
      id && !ids.has(id) &&
      candidate.provider === 'Google Flights' &&
      typeof candidate.searchUrl === 'string' && candidate.searchUrl === searchUrl &&
      typeof candidate.airline === 'string' && candidate.airline.trim() &&
      typeof candidate.route === 'string' && candidate.route.trim() &&
      typeof candidate.departureTime === 'string' && candidate.departureTime.trim() &&
      typeof candidate.arrivalTime === 'string' && candidate.arrivalTime.trim() &&
      typeof candidate.duration === 'string' && candidate.duration.trim() &&
      Number.isInteger(Number(candidate.durationMinutes)) && Number(candidate.durationMinutes) > 0 &&
      Number.isInteger(Number(candidate.stopCount)) && Number(candidate.stopCount) >= 0 &&
      Number.isFinite(Number(candidate.amount)) && Number(candidate.amount) >= 0 &&
      typeof candidate.price === 'string' && candidate.price.trim() &&
      departureDateValid && returnDateValid && arrivalDateValid && arrivalOffsetValid && datesOrdered && arrivalDateOrdered && arrivalDateMatchesOffset
    )
    if (valid) ids.add(id)
    return valid
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
    ...(Number.isFinite(Number(argumentsValue.adults)) ? { adults: Number(argumentsValue.adults) } : {}),
    ...(Number.isFinite(Number(argumentsValue.children)) ? { children: Number(argumentsValue.children) } : {}),
    ...(Array.isArray(argumentsValue.children_ages)
      ? { childrenAges: argumentsValue.children_ages.map(value => Number(value)) }
      : {}),
    ...(Number.isFinite(Number(argumentsValue.infants)) ? { infants: Number(argumentsValue.infants) } : {}),
    ...(Number.isFinite(Number(argumentsValue.infant_seats))
      ? { infantSeatCount: Number(argumentsValue.infant_seats) }
      : {}),
    ...(typeof argumentsValue.allow_nearby_airports === 'boolean'
      ? { allowNearbyAirports: argumentsValue.allow_nearby_airports }
      : {}),
    ...(Array.isArray(argumentsValue.excluded_airlines)
      ? { excludedAirlines: argumentsValue.excluded_airlines.map(value => String(value).trim()).filter(Boolean) }
      : {}),
    ...(typeof argumentsValue.departure_time_window === 'string' || argumentsValue.departure_time_window === null
      ? { departureTimeWindow: argumentsValue.departure_time_window as string | null }
      : {}),
    ...(typeof argumentsValue.arrival_time_window === 'string' || argumentsValue.arrival_time_window === null
      ? { arrivalTimeWindow: argumentsValue.arrival_time_window as string | null }
      : {}),
    stage,
  }
}

export function browserFailureClass(code: string) {
  if (/timeout|worker|target_closed|network|unreachable|results_not_ready|result_invalid|provider|page_state/i.test(code)) return 'PROVIDER_OR_BROWSER_INFRA' as const
  return 'BROWSER_TASK' as const
}

export function isFlightConstraintFailure(code: string) {
  return ['flight_input_invalid', 'no_flight_results', 'flight_option_invalid', 'flight_price_changed', 'flight_sold_out', 'return_flight_unavailable'].includes(code)
}

export function isBrowserUserInterventionFailure(code: string) {
  return [
    'flight_provider_challenge',
    'browser_sensitive_field_blocked',
    'browser_submission_status_unknown',
    'flight_checkout_user_intervention',
    'flight_checkout_missing_details',
    'flight_checkout_option_unmatched',
    'flight_checkout_input_invalid',
    'flight_checkout_recovery_exhausted',
    'flight_provider_handoff_unavailable',
  ].includes(code)
}

export function shouldRecycleBrowserSession(operationType: string, code: string, completedAttempts: number) {
  return operationType !== 'submit' && browserFailureClass(code) === 'PROVIDER_OR_BROWSER_INFRA' && completedAttempts >= 2
}
