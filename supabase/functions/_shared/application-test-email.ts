/**
 * Controlled email routing for local/qualification application runs.
 *
 * This is deliberately opt-in at the durable run level. A normal production
 * application never reaches this route, even when the applicant happens to
 * use one of the two test accounts.
 */
export const CONTROLLED_TEST_EMAIL_SENDER = 'dosudavy@gmail.com'
export const CONTROLLED_TEST_EMAIL_RECIPIENT = 'daviddosuu@gmail.com'
export const CONTROLLED_TEST_EMAIL_ROUTE_VERSION = 'controlled-test-email@1'

type RecordValue = Record<string, unknown>

function recordValue(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : {}
}

function safeText(value: unknown, maximum = 320) {
  return typeof value === 'string' ? value.slice(0, maximum).trim() : ''
}

function normalizeEmail(value: unknown) {
  const candidate = safeText(value).toLocaleLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : ''
}

/** Returns true only for the local browser origins used for focused testing. */
export function isLocalBrowserOrigin(value: unknown) {
  return /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/i.test(safeText(value, 2_000))
}

/**
 * A run is controlled-test mail only when the orchestrator persisted the
 * marker. The benchmark ID remains a supported server-side qualification
 * marker; it is not inferred from a task title or an email address.
 */
export function isControlledTestEmailRun(value: unknown) {
  const run = recordValue(value)
  const context = recordValue(run.context ?? value)
  if (context.email_test_mode === true || context.emailTestMode === true) return true
  const benchmarkRunId = safeText(context.benchmark_run_id ?? context.benchmarkRunId, 240)
  return Boolean(benchmarkRunId)
}

export type ControlledTestEmailRoute = {
  version: typeof CONTROLLED_TEST_EMAIL_ROUTE_VERSION
  sender: typeof CONTROLLED_TEST_EMAIL_SENDER
  recipient: typeof CONTROLLED_TEST_EMAIL_RECIPIENT
}

export function controlledTestEmailRoute(value: unknown): ControlledTestEmailRoute | null {
  return isControlledTestEmailRun(value)
    ? {
        version: CONTROLLED_TEST_EMAIL_ROUTE_VERSION,
        sender: CONTROLLED_TEST_EMAIL_SENDER,
        recipient: CONTROLLED_TEST_EMAIL_RECIPIENT,
      }
    : null
}
