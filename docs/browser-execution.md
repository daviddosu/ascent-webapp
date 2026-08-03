# Browser execution

ShotCount uses a signed Vercel Node worker for tasks without a first-party API. It supports constrained public-web navigation and approved form submission, plus a purpose-built Google Flights search and payment handoff.

## Boundaries

- The model receives structured browser tools, never Playwright or arbitrary JavaScript.
- Each session belongs to one user, AgentRun, and ShotCount task.
- The Supabase function enforces an environment allowlist; the flight worker additionally requires `www.google.com`.
- A random bearer token authenticates Edge Function to worker.
- The worker uses a fresh isolated browser context and never returns cookies, storage, raw page dumps, or credentials.
- Public page content is bounded, sanitized, and explicitly labelled as untrusted external content before the model sees it.
- Navigation is HTTPS-only, exact-domain allowlisted, and rejects IP, local-network, credential-bearing, and unsafe redirect destinations.
- Generic actions can type or select only non-sensitive fields. Password, one-time-code, payment, banking, and private-identifier fields are blocked. The flight-specific checkout action is the only exception: it can fill explicitly user-provided traveler identity fields on an observed airline checkout page, and it never exposes those values as result evidence.
- Generic clicks can only follow safe links. Form submission is a separate typed tool that always requires exact approval.
- Public cookie consent is rejected rather than accepted.
- No card data is entered or stored.
- No provider payment or purchase button is clicked. A single labelled Google-to-airline booking handoff may be opened so the user is left at the provider's payment-ready page; if Google exposes only booking options first, Caspian resolves one safe provider link before filling checkout.

## Public-web tasks

`browser.start_session` creates a task-owned session with only the configured domains needed for that objective. `browser.navigate`, `browser.observe`, and `browser.act` prepare the page. Each observation contains only the page title, URL, short visible text, headings, links, and labelled controls.

State is replayable rather than tied to a long-lived Chromium process: the initial URL and at most 30 validated actions are stored in the session checkpoint. A serverless restart can recreate the same public page state and continue the same AgentRun.

`browser.submit` is the only generic externally visible write. The exact session, target, and expected effect are hashed into the approval. Immediately before clicking, the worker persists a submission-attempt marker. A retry can therefore never click twice. Completion requires a visible post-submit page change; when confirmation is ambiguous, ShotCount stops for review and refuses to resubmit automatically.

## Flight search

`browser.search_flights` accepts:

- IATA origin and destination codes;
- exact outbound and return dates;
- cabin;
- maximum stops;
- optional budget;
- currency;
- optional preferred airlines.
- optional excluded airlines;
- passenger counts, child ages, and infant lap-versus-seat choice;
- optional local departure and arrival time windows;
- optional nearby-airport preference.

The worker opens a real Google Flights result page, parses structured visible itineraries, enforces the stops and budget constraints, and returns at most three distinct choices labelled Best overall, Cheapest, and Fastest where possible.

The saved option contains only the observed airline, times, route, stops, duration, price, currency, provider, stable option ID, search URL, and verified date/overnight metadata. Hard constraints are applied again during selection, so an over-budget, excluded-airline, out-of-window, or over-stop card cannot be selected.

Flexible date ranges, baggage or fare-brand guarantees, seat selection, accessibility or pet handling, mixed cabins, stopovers, and multi-city/open-jaw itineraries are explicit recoverable stops. The worker does not silently claim those constraints were enforced.

## Resume and handoff

When the user chooses an option:

1. The app sends the exact option ID to `task-agent`.
2. The same durable `browser_execution_sessions` row receives a new idempotent operation.
3. The worker reruns the persisted search and matches airline, observed price, and duration.
4. If price or availability changed, it stops and returns a recoverable state.
5. It selects the outbound and return legs.
6. It verifies the `https://www.google.com/travel/flights/booking` itinerary.
7. Where Google exposes a labelled direct airline booking option, it opens that one navigation-only control and verifies the resulting public HTTPS provider handoff. If Google exposes booking options first, the checkout worker can recover one safe provider link from that page. If no provider handoff loads safely, it stops with a recoverable provider-handoff state.
8. For a payment-handoff task, Caspian asks once for the missing traveler/contact details, uses `browser.prepare_flight_checkout` to fill only observed passenger and contact fields, verifies each fill, and advances only through safe review/continue controls.
9. It stops at the first payment/card boundary, persists the prepared-field evidence without raw identity values, and sets `payment_boundary_reached = true`.
10. ShotCount shows Continue to payment and leaves the task waiting for the user. It never enters card details, CVV, passwords, OTPs, or clicks purchase/payment/confirm-booking controls.

The Chromium process may be fresh after a serverless restart, but the task-owned session, checkpoint, option, provider URL, and operation identity are the same durable browser run. ShotCount does not automate further after the external provider handoff.

## Server configuration

Supabase Edge Function secrets:

```text
SHOTCOUNT_BROWSER_ALLOWED_DOMAINS=www.google.com,app.shotcount.app
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

The worker records stable public codes for runtime missing, unsafe URLs or fields, missing or ambiguous targets, ambiguous submission confirmation, no results, changed fare/schedule, sold out, missing return, unsafe handoff, timeout, and worker connectivity. A failed selection returns to the existing options when safe; a failed search is retryable. No browser form can be submitted twice because its operation ID and attempt marker are persisted before the side effect.

## Live verification

The normal test suite uses deterministic result text and a controlled checkout-page fixture. To exercise Google Flights itself with future dates, run:

```bash
pnpm test:flight:live
```

This performs a real search, selects one returned itinerary, verifies the booking handoff, and stops without using real traveler identity or payment data. Checkout field mapping, verification, bounded progression, and payment stopping are covered by the controlled browser tests.
