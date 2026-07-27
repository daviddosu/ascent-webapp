# Luna Browser and Cross-tool diagnostic methodology

The untouched baseline used five fresh live runs through a temporary clone of the production ShotCount task agent. The clone differed only in selecting `gpt-5.6-luna` with low reasoning and in accepting an isolated benchmark telemetry namespace. Production prompts, tools, retries, browser worker configuration, timeouts, state handling, and completion policies were unchanged.

The fixed flight date was September 17, 2026. Browser search and selection used live Google Flights. Cross-tool scenarios used two controlled Google accounts and real Gmail and Calendar provider calls. All required email and Calendar approvals were exercised. No purchase or payment action occurred.

The recovery run injected one retryable `browser_target_closed` result into the task-owned browser checkpoint while the read-only search operation was waiting. It did not interrupt a write or submission.

The initial diagnostic verifier incorrectly treated the display field `stops: "1 stop"` as numeric. The preserved provider trace proves the search returned three valid options with numeric `stopCount` values and ranked the $397 one-stop result ahead of $423 and $1,171 alternatives. The baseline row is therefore reported as a pass; no run was replaced.

Two model-independent fixes were then made: negated booking language now produces a search-only prepared result, and the pre-dispatch selection record receives one bounded retry on the observed PostgREST single-object coercion race. The targeted rerun included the two failed handoff cases, the passing Browser search control, and the passing Calendar-to-email control. Existing selection-worker retries were not increased.
