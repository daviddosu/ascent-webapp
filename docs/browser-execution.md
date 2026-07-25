# Browser execution

ShotCount uses a signed Vercel Node worker for tasks without a first-party API. The MVP’s production browser capability is a real Google Flights search and payment handoff.

## Boundaries

- The model receives structured browser tools, never Playwright or arbitrary JavaScript.
- Each session belongs to one user, AgentRun, and ShotCount task.
- The Supabase function enforces an environment allowlist; the flight worker additionally requires `www.google.com`.
- A random bearer token authenticates Edge Function to worker.
- The worker uses a fresh isolated browser context and never returns cookies, storage, raw page dumps, or credentials.
- Public cookie consent is rejected rather than accepted.
- No card data is entered or stored.
- No provider Continue/payment button is clicked.

## Flight search

`browser.search_flights` accepts:

- IATA origin and destination codes;
- exact outbound and return dates;
- cabin;
- maximum stops;
- optional budget;
- currency;
- optional preferred airlines.

The worker opens a real Google Flights result page, parses structured visible itineraries, enforces the stops and budget constraints, and returns at most three distinct choices labelled Best overall, Cheapest, and Fastest where possible.

The saved option contains only the observed airline, times, route, stops, duration, price, currency, provider, stable option ID, and search URL. The normal ShotCount task inspector renders these options.

## Resume and handoff

When the user chooses an option:

1. The app sends the exact option ID to `task-agent`.
2. The same durable `browser_execution_sessions` row receives a new idempotent operation.
3. The worker reruns the persisted search and matches airline, observed price, and duration.
4. If price or availability changed, it stops and returns a recoverable state.
5. It selects the outbound and return legs.
6. It verifies the `https://www.google.com/travel/flights/booking` itinerary.
7. Where Google exposes a direct airline booking option, it opens that fixed “Continue to book with … airline” control and verifies the resulting HTTPS provider handoff. If the provider handoff does not load safely, it falls back to the verified Google booking-options URL.
8. It sets `payment_boundary_reached = true`.
9. ShotCount shows Continue to payment and leaves the task `waiting_for_user`.

The Chromium process may be fresh after a serverless restart, but the task-owned session, checkpoint, option, provider URL, and operation identity are the same durable browser run. ShotCount does not automate further after the external provider handoff.

## Server configuration

Supabase Edge Function secrets:

```text
SHOTCOUNT_BROWSER_ALLOWED_DOMAINS=www.google.com
SHOTCOUNT_BROWSER_WORKER_URL=https://<deployment>/api/browser-worker
SHOTCOUNT_BROWSER_WORKER_TOKEN=<random shared token>
```

Vercel server environment:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SHOTCOUNT_BROWSER_WORKER_TOKEN
```

The two worker-token values must match. The service key and worker token must never be sent to the frontend.

## Failure handling

The worker records stable public codes for runtime missing, no results, changed fare/schedule, sold out, missing return, unsafe handoff, timeout, and worker connectivity. A failed selection returns to the existing options when safe; a failed search is retryable. No browser form can be submitted twice because every operation ID is persisted before dispatch.

## Live verification

The normal test suite uses deterministic result text. To exercise Google Flights itself with future dates, run:

```bash
pnpm test:flight:live
```

This performs a real search, selects one returned itinerary, verifies the booking handoff, and stops without entering passenger details or clicking a payment action.
