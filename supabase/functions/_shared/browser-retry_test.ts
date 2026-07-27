import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { browserFailureClass, canonicalFlightSearch, isTransientSingleObjectCoercionError, safeBrowserRetryDelayMs, shouldRecycleBrowserSession } from './browser-retry.ts'

Deno.test('safe browser reads back off between durable worker attempts', () => {
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'browser_worker_failed', 1), 8_000)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'browser_worker_failed', 2), 16_000)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'flight_results_timeout', 1), 15_000)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'flight_results_timeout', 2), 30_000)
})

Deno.test('classifies provider failures, preserves canonical search, and recycles poisoned sessions', () => {
  assertEquals(browserFailureClass('flight_results_timeout'), 'PROVIDER_OR_BROWSER_INFRA')
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

Deno.test('immediate selection retries only the known PostgREST single-object coercion race', () => {
  assertEquals(isTransientSingleObjectCoercionError('JSON object requested, multiple (or no) rows returned: cannot coerce the result to a single JSON object'), true)
  assertEquals(isTransientSingleObjectCoercionError('duplicate key violates unique constraint'), false)
})
