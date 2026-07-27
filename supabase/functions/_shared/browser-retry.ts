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
