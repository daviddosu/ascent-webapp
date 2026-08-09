# David application benchmark — david_application_engine_v3

Run **david-engine-v3-qualification** at 2026-08-09T00:17:10.331Z; evaluated commit **5813f3aa578e6159b30e93f35dea82a192f03a16**. Frozen dataset: **74 atomic cases + 20 end-to-end cases**.

## Scorecard

| Metric | Result |
|---|---:|
| Primitive success rate | 95.5% |
| Harness success rate | 100.0% |
| Primitive → harness rescue rate | 100.0% |
| Adaptive step success rate | 100.0% |
| End-to-end application success rate | 100.0% |
| Verified completion rate | 100.0% |
| False completion rate | 0.0% (0) |
| Duplicate-action rate | 0.0% (0) |
| Manual intervention rate | 2.9% |
| Recovery success rate | 100.0% |
| Cross-case contamination rate | 0.0% |
| Average cost / completed application | $0.000000 |
| Average time / completed application | 7689 ms |

## Deterministic application engine

- Engine: david-application-engine@3
- Consolidated hard cases: 26
- Semantic validation: 100.0%
- E2E verified completion after autonomous recovery: 100.0%
- Recovery success: 100.0%
- Fabricated facts / false completions / duplicates / contamination: 0 / 0 / 0 / 0
- User interventions: 0
- Production qualification: NOT YET — deterministic and stochastic gates pass; authenticated live validation is blocked

## Production-model stability

- Run: david-engine-v3-stochastic-qualification
- Samples passed: 30/30 across 10 E2E cases × 3 repetitions
- Verified completion: 100.0%
- Fabricated facts / false completions / contamination: 0 / 0 / 0
- Total cost / average cost per E2E decision: $0.007890 / $0.000263
- Average model latency: 2023 ms

## Live and deployment gate

- Current safe public-source validation: 5/5 verified, zero writes (`david-live-web-20260809001157`).
- Preserved connected Gmail validation: 6/6 executed cases provider-verified; three genuine alternate-sender reply cases remain externally unavailable.
- Current authenticated cloud checks: blocked because this workspace lacks `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SHOTCOUNT_TEST_EMAIL`, and `SHOTCOUNT_TEST_PASSWORD`.
- Production migration/function/frontend deployment: not performed because authenticated RLS, Calendar, durable-restart, and exact-upload smoke could not be rerun.
- Production smoke result: blocked by the same missing controlled credentials.

## Primitive, harness, and adaptive comparison

| Path | Attempts | Success | Avg latency | Avg browser actions | Retries | Model cost |
|---|---:|---:|---:|---:|---:|---:|
| Primitive | 22 | 95.5% | 1393 ms | 0.5 | 0 | $0.000000 |
| Harness | 55 | 100.0% | 9232 ms | 5.7 | 1 | $0.000000 |
| Adaptive outcome | 68 | 100.0% | 7689 ms | 4.7 | 1 | $0.000000 |

Controlled paired evaluation values are shown as success / latency / browser actions.

| Case | Primitive | Harness | Adaptive choice |
|---|---:|---:|---|
| primitive-simple-form | pass / 7778 ms / 5 | pass / 7311 ms / 5 | primitive |

## Failures and regression corpus

| Case | Primary failure class | Mode | Escalation / suspected cause |
|---|---|---|---|
| — | — | — | No failures |

Every failed case is written to `failures/david-engine-v3-qualification/` and added to the versioned regression corpus. Frozen definitions are never rewritten by the runner.

## Execution accounting

- Browser actions: 321
- Gmail fixture actions: 32
- Primitive success / failure: 21 / 1
- Harness success / failure: 55 / 0
- Escalations / rescued: 1 / 1
- Manual interventions / retries: 2 / 1
- Model calls / tokens / measured model cost: 0 / 0 / 0 / $0.000000
- Deterministic Gmail fixture messages: 35
- Connected Gmail evaluation: 6/6 executed cases provider-verified; 3 alternate-sender cases blocked; 7 messages labeled and archived.
- Separate live read-only web set: 5/5 verified with 0 write actions.

## Final architecture

`david-application-engine@3` is the sole owner of workflow state, requirement dependencies, deadlines, waits, retries, approvals, artifacts, communication/browser checkpoints, evidence, idempotency, and completion. It selects one unresolved dependency-ready requirement and one resolution tier. Deterministic code and provider primitives run first. David receives one typed minimal semantic request only when judgment is required, and its strict answer is validated for schema, evidence IDs, VERIFIED facts, case identity, requirement relevance, and allowed decisions. A single stronger repair is permitted before a preserved-state operator handoff.

Tool outputs enter the engine as case-scoped `WebObservation`, `GmailObservation`, `PortalObservation`, `ArtifactObservation`, `CalendarObservation`, or `SubmissionObservation`. No observation means no completion. Portal work uses ACT → READ → VERIFY → CHECKPOINT, exact fact sources, artifact IDs, checksums, and read-after-write values.

## Final acceptance accounting

| Item | Result |
|---|---:|
| Canonical cases | 94/94 verified |
| System success | 100% |
| Semantic validation success | 100% |
| E2E cases | 20/20 verified |
| Stochastic E2E stability | 30/30 across 10 cases × 3 |
| Recovery success | 100% |
| Fabricated facts | 0 |
| False completions | 0 |
| Duplicate actions | 0 |
| Cross-case contamination | 0 |
| Engine-corpus user interventions | 0 |
| Average model cost per E2E semantic decision | $0.000263 |
| Average production-model latency | 2023 ms |
| Regression corpus | 42 entries |
| Current live official-source validation | 5/5, zero writes |
| Preserved connected Gmail validation | 6/6 executed, provider-verified |
| Focused tests | 291/291 qualification checks; 24/24 final evidence-guard checks passed |
| Repository-wide tests | 671 passed, 2 pending, 2 unrelated Calendar fixture failures |
| Production build | passed |
| Deployment | not performed; live gate blocked |
| Production smoke | blocked by unavailable controlled credentials |

Failure classes repaired by the engine include long-horizon model drift, wrong-case actions, fabricated missing facts, unresolved fact use, official-source conflicts, wrong-university/unsupported writer claims, stale or wrong Gmail threads, duplicate sends/submissions, wrong artifacts, upload rejection, session/browser restart, stale checkpoints, conditional fields, OTP mismatch, provider-state waits, referee replanning, professor affiliation changes, and false completion without resulting-state evidence.

The exact external limitation is credential availability. This workspace does not contain `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SHOTCOUNT_TEST_EMAIL`, or `SHOTCOUNT_TEST_PASSWORD`. Therefore current authenticated RLS ownership, Calendar, durable production restart, exact approved-artifact upload, migration application, affected-function deployment, and final production smoke were not run. Deployment is intentionally blocked until those checks can pass.
