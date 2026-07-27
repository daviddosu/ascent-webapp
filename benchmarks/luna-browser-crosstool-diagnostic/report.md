# GPT-5.6 Luna Browser and Cross-tool diagnostic

## Untouched baseline

| Scenario | Result | Primary failure class | Exact mechanism | Harness fix justified? |
|---|---|---|---|---|
| Browser search | PASS | NONE | Returned three live valid options and ranked the cheapest observed option first. | No |
| Browser handoff | FAIL | D. TOOL / DATA COERCION | The immediate selection request collided with a transient PostgREST single-object response boundary and failed with “Cannot coerce the result to a single JSON object” before browser.select_flight was recorded. | Yes |
| Browser recovery | FAIL | B. BROWSER INFRASTRUCTURE | The injected read-only target closure was detected and the search recovered from its checkpoint, but the selection worker later exhausted its bounded retries because Google Flights exposed no selectable itinerary. | Yes |
| Email → Calendar | PASS | NONE | Same AgentRun resumed after a controlled real reply and created one verified event. | No |
| Calendar → Email | PASS | NONE | One event was updated, one notification was sent, and both were provider-verified. | No |

Baseline: **3/5 passed**, 100% execution precision, no duplicate or unintended effects, **$0.035181** measured inference cost.

## Targeted rerun

| Scenario | Result | Finding |
|---|---|---|
| Browser search control | PASS | Search-only intent completed with live valid results. |
| Browser handoff | FAIL | The coercion race disappeared, but the selection worker could not expose a selectable Google Flights itinerary after bounded retries. |
| Browser recovery | FAIL | Read-only target closure recovered correctly; downstream itinerary selection still failed after bounded retries. |
| Calendar → Email control | FAIL | Calendar changed at the correct instant, but Luna described the old/new local times incorrectly in the email, then claimed successful verification. |

Targeted reruns cost **$0.023810**. Total diagnostic cost was **$0.058991**.

## Decision

**Browser:** Luna is not ready as the default for full browser execution. Its search planning and arguments were correct, but the current selection worker failed both handoff attempts. This is browser infrastructure, so Sol escalation would not fix it.

**Cross-tool:** Luna is viable for the tested basic async email-to-Calendar flow, but not yet an unconditional default for Calendar-to-email changes. The untouched run passed; the control rerun exposed a model reasoning error when converting provider timestamps into notification wording. Escalate to Sol after one invalid time interpretation or a mismatch between intended and drafted schedule details.

Do not increase all browser timeouts or retries. The next engineering step is to instrument and repair the external selection worker's itinerary-card targeting against the preserved search URL and option ID, then rerun only the two handoff scenarios.
