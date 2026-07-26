# Terra harness hardening — frozen comparison

## Result

The same Terra model improved from **47/60 (78.3%)** to **55/60 (91.7%)** after model-agnostic execution hardening. Browser success rose from **20.0%** to **86.7%**; Calendar recovered from **93.3%** to **100%**. Execution precision remained **100%**. Terra v2 is **47.2% cheaper than Sol**, but its overall success remains **6.6 percentage points below Sol**, so it fails the predefined near-Sol gate and tuning stopped.

| Category | Sol | Terra v1 | Terra v2 |
|---|---:|---:|---:|
| Email | 100.0% | 100.0% | 100.0% |
| Calendar | 100.0% | 93.3% | 100.0% |
| Cross-tool | 100.0% | 100.0% | 80.0% |
| Browser | 93.3% | 20.0% | 86.7% |

## Original 13 failures

| Task | Run | Exact stage | Tool | Root cause |
|---|---:|---|---|---|
| calendar-03 | 1 | Calendar pre-write verification | calendar.create_event | Offset-less local timestamps were accepted locally but used as Google timeMin/timeMax query values; Google returned 400 before the approved write. |
| browser-01 | 1 | Flight result readiness | browser.search_flights | Three workers reached the 45-second result wait without a price-bearing list item. |
| browser-02 | 1 | Flight result readiness | browser.search_flights | Same bounded readiness timeout after three durable safe-read attempts. |
| browser-03 | 1 | Chromium launch/context | browser.search_flights | Shared Chromium was closed before newPage during the third worker attempt. |
| browser-04 | 1 | Chromium launch/context | browser.search_flights | Shared Chromium lifecycle collapsed before a page could be created. |
| browser-01 | 2 | Flight result readiness | browser.search_flights | Google Flights returned no parseable live list before all three attempts expired. |
| browser-02 | 2 | Navigation resources | browser.search_flights | page.goto returned ERR_INSUFFICIENT_RESOURCES after rapid worker recycling. |
| browser-03 | 2 | Chromium launch/context | browser.search_flights | Browser context was already closed when the worker opened a page. |
| browser-04 | 2 | Chromium launch/context | browser.search_flights | Browser context was already closed when the worker opened a page. |
| browser-01 | 3 | Navigation resources | browser.search_flights | page.goto returned ERR_INSUFFICIENT_RESOURCES on the final worker attempt. |
| browser-02 | 3 | Chromium launch/context | browser.search_flights | Browser context closed before page creation. |
| browser-03 | 3 | Chromium launch/context | browser.search_flights | Shared Chromium closed during launch/newPage. |
| browser-04 | 3 | Chromium launch/context | browser.search_flights | Shared Chromium closed during launch/newPage. |

All browser model decisions correctly selected the structured flight tool with valid origin, destination, dates, cabin and stop constraints. The failures occurred after tool selection in the worker/session layer. Each browser session retained its operation and reached three bounded worker attempts; provider verification found no completed flight result.

## Harness changes

- Isolated each browser-worker invocation to its own Chromium lifecycle, removing cross-request shared-browser closure races.
- Replaced the nested in-function retry—which could not fit inside the 60-second worker—with durable task-owned retries.
- Added bounded, state-aware backoff for safe reads only: 8/16 seconds for runtime failures and 15/30 seconds for provider readiness failures.
- Detected Google Flights’ explicit error/reload state and retried that page state without blindly extending every timeout.
- Preserved submission, payment, email-send and Calendar-write non-retry boundaries.
- Normalized offset-less Calendar wall times through the supplied IANA timezone before Google query/verification calls.

## Terra v2 metrics

| Metric | Sol | Terra v1 | Terra v2 |
|---|---:|---:|---:|
| Overall success | 98.3% | 78.3% | 91.7% |
| Execution precision | 100.0% | 100.0% | 100.0% |
| Median interventions | 0 | 0 | 0 |
| Average interventions | 0.10 | 0.10 | 0.10 |
| Distance-to-Done | 4.93/5 | 4.12/5 | 4.85/5 |
| First-attempt success | 96.7% | 78.3% | 90.0% |
| Measured inference cost | $1.666533 | $0.923584 | $0.880455 |
| Cost per run | $0.027776 | $0.015393 | $0.014674 |
| Cost per success | $0.028246 | $0.019651 | $0.016008 |

## Remaining failures

- cross-02 run 2 and cross-04 run 3 resumed after a controlled Gmail reply, then the persistence query returned “Cannot coerce the result to a single JSON object.”
- cross-03 run 2 updated Calendar but produced a Gmail draft rather than the required sent notification; the unchanged verifier correctly failed it.
- browser-04 run 2 found live options but exhausted safe selection retries before payment handoff.
- browser-04 run 3 found live options after two read retries, then a single-row persistence query failed before selection.

## Decision

Terra v2 meets the precision, intervention, Distance-to-Done, browser-success and cost thresholds, but misses the overall-success threshold. **Keep Sol as the default (Option C).** Do not run Luna and do not implement routing from this result.
