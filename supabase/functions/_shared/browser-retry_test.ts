import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { allowsGoogleFlightsDomain, browserFailureClass, browserOperationAttemptCount, canonicalFlightSearch, caspianFlightHandoffAllowed, googleFlightsBrowserDomains, isBrowserUserInterventionFailure, isCompletedBrowserOperation, isFlightConstraintFailure, isTransientSingleObjectCoercionError, normalizeBrowserDomains, preferValidatedFlightEvidence, safeBrowserRetryDelayMs, shouldRecycleBrowserSession, validatedFlightEvidence } from './browser-retry.ts'

Deno.test('safe browser reads back off between durable worker attempts', () => {
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'browser_worker_failed', 1), 8_000)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'browser_worker_failed', 2), 16_000)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'flight_results_timeout', 1), 15_000)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'flight_results_timeout', 2), 30_000)
})

Deno.test('classifies provider failures, preserves canonical search, and recycles poisoned sessions', () => {
  assertEquals(browserFailureClass('flight_results_timeout'), 'PROVIDER_OR_BROWSER_INFRA')
  assertEquals(browserFailureClass('flight_checkout_timeout'), 'PROVIDER_OR_BROWSER_INFRA')
  assertEquals(browserFailureClass('browser_result_invalid'), 'PROVIDER_OR_BROWSER_INFRA')
  assertEquals(isFlightConstraintFailure('no_flight_results'), true)
  assertEquals(isFlightConstraintFailure('browser_result_invalid'), false)
  assertEquals(isBrowserUserInterventionFailure('flight_provider_challenge'), true)
  assertEquals(isBrowserUserInterventionFailure('flight_checkout_input_invalid'), true)
  assertEquals(isBrowserUserInterventionFailure('flight_checkout_recovery_exhausted'), true)
  assertEquals(isBrowserUserInterventionFailure('flight_results_timeout'), false)
  assertEquals(shouldRecycleBrowserSession('search_flights', 'flight_results_timeout', 2), true)
  assertEquals(shouldRecycleBrowserSession('submit', 'network_timeout', 2), false)
  assertEquals(canonicalFlightSearch({
    origin_code: 'los', destination_code: 'lhr', departure_date: '2026-09-17', return_date: '2026-09-21',
    cabin: 'ECONOMY', max_stops: 1, budget_amount: 900, currency: 'usd',
  }), {
    origin: 'LOS', destination: 'LHR', departDate: '2026-09-17', returnDate: '2026-09-21',
    cabin: 'economy', maxStops: 1, maxPrice: 900, currency: 'USD', stage: 'searching',
  })
})

Deno.test('consequential submissions and exhausted reads never retry automatically', () => {
  assertEquals(safeBrowserRetryDelayMs('submit', 'browser_worker_failed', 1), null)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'browser_worker_failed', 3), null)
})

Deno.test('browser retry budgets are isolated per operation', () => {
  const checkpoint = {
    workerAttempts: 3,
    workerAttemptsByOperation: { 'search-1': 3, 'select-1': 0 },
  }
  assertEquals(browserOperationAttemptCount(checkpoint, 'search-1'), 3)
  assertEquals(browserOperationAttemptCount(checkpoint, 'select-1'), 0)
  assertEquals(browserOperationAttemptCount(checkpoint, 'legacy-operation'), 3)
})

Deno.test('immediate selection retries only the known PostgREST single-object coercion race', () => {
  assertEquals(isTransientSingleObjectCoercionError('JSON object requested, multiple (or no) rows returned: cannot coerce the result to a single JSON object'), true)
  assertEquals(isTransientSingleObjectCoercionError('duplicate key violates unique constraint'), false)
})

Deno.test('normalizes the production Google allowlist and any Caspian provider suggestion', () => {
  assertEquals(normalizeBrowserDomains([' HTTPS://WWW.GOOGLE.COM:443/', 'google.com.', 'https://google.com']), [
    'www.google.com',
    'google.com',
  ])
  assertEquals(googleFlightsBrowserDomains, ['google.com', 'www.google.com'])
  assertEquals(allowsGoogleFlightsDomain(['https://google.com:443/']), true)
  assertEquals(allowsGoogleFlightsDomain(['accounts.google.com']), false)
})

Deno.test('canonical search preserves passenger and airport constraints for recovery', () => {
  assertEquals(canonicalFlightSearch({
    origin_code: 'LOS', destination_code: 'LON', departure_date: '2026-09-17',
    cabin: 'economy', adults: 2, children: 1, infants: 1,
    children_ages: [7], infant_seats: 0,
    allow_nearby_airports: true, excluded_airlines: ['Example Air'],
    departure_time_window: '06:00-12:00', arrival_time_window: null,
  }), {
    origin: 'LOS', destination: 'LON', departDate: '2026-09-17', cabin: 'economy',
    adults: 2, children: 1, childrenAges: [7], infants: 1, infantSeatCount: 0,
    allowNearbyAirports: true, excludedAirlines: ['Example Air'],
    departureTimeWindow: '06:00-12:00', arrivalTimeWindow: null, stage: 'searching',
  })
})

const canonicalOption = {
  id: 'option-one',
  airline: 'Example Air',
  departureTime: '08:00 AM',
  arrivalTime: '03:00 PM',
  departureDate: '2026-09-17',
  arrivalDate: '2026-09-17',
  arrivalDayOffset: 0,
  duration: '7 hr',
  durationMinutes: 420,
  route: 'AAA–BBB',
  stops: 'Nonstop',
  stopCount: 0,
  price: '$500',
  amount: 500,
  currency: 'USD',
  provider: 'Google Flights',
  searchUrl: 'https://www.google.com/travel/flights?q=bounded-search',
}

Deno.test('accepts a canonical browser result and persists validated evidence', () => {
  const result = { searchUrl: canonicalOption.searchUrl, options: [canonicalOption] }
  assertEquals(validatedFlightEvidence(result), result)
  assertEquals(caspianFlightHandoffAllowed({ searchUrl: canonicalOption.searchUrl, flightOptions: [canonicalOption] }), true)
})

Deno.test('a retry payload cannot overwrite an already validated flight result', () => {
  const valid = { searchUrl: canonicalOption.searchUrl, options: [canonicalOption] }
  assertEquals(preferValidatedFlightEvidence(valid, { options: [], searchUrl: '' }), valid)
  assertEquals(caspianFlightHandoffAllowed({ searchUrl: '', flightOptions: [] }), false)
  assertEquals(validatedFlightEvidence({
    searchUrl: canonicalOption.searchUrl,
    options: [{ ...canonicalOption, amount: -1 }],
  }), null)
  assertEquals(validatedFlightEvidence({
    searchUrl: canonicalOption.searchUrl,
    options: [canonicalOption, canonicalOption],
  }), null)
  assertEquals(validatedFlightEvidence({
    searchUrl: canonicalOption.searchUrl,
    options: [{ ...canonicalOption, arrivalDate: '2026-09-16' }],
  }), null)
  assertEquals(validatedFlightEvidence({
    searchUrl: canonicalOption.searchUrl,
    options: [{ ...canonicalOption, arrivalDate: '2026-09-18', arrivalDayOffset: 0 }],
  }), null)
})

Deno.test('reuses a completed browser operation instead of creating a duplicate flight action', () => {
  assertEquals(isCompletedBrowserOperation({ id: 'flight-operation', status: 'succeeded' }, 'flight-operation'), true)
  assertEquals(isCompletedBrowserOperation({ id: 'flight-operation', status: 'failed' }, 'flight-operation'), false)
})
