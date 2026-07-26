import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { safeBrowserRetryDelayMs } from './browser-retry.ts'

Deno.test('safe browser reads back off between durable worker attempts', () => {
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'browser_worker_failed', 1), 8_000)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'browser_worker_failed', 2), 16_000)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'flight_results_timeout', 1), 15_000)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'flight_results_timeout', 2), 30_000)
})

Deno.test('consequential submissions and exhausted reads never retry automatically', () => {
  assertEquals(safeBrowserRetryDelayMs('submit', 'browser_worker_failed', 1), null)
  assertEquals(safeBrowserRetryDelayMs('search_flights', 'browser_worker_failed', 3), null)
})
