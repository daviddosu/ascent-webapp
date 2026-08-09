# David application benchmark — david_application_engine_v3

Run **david-eval-20260809120909-5ae32a** at 2026-08-09T12:16:42.901Z; evaluated commit **7926e39e30ed19cbce36aaac03e305e1693f99db**. Frozen dataset: **74 atomic cases + 20 end-to-end cases**.

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
| Average time / completed application | 6660 ms |

## Deterministic application engine

- Engine: david-application-engine@3
- Consolidated hard cases: 26
- Semantic validation: 100.0%
- E2E verified completion after autonomous recovery: 100.0%
- Recovery success: 100.0%
- Fabricated facts / false completions / duplicates / contamination: 0 / 0 / 0 / 0
- User interventions: 0
- Production qualification: NOT YET — stochastic and live gates remain conditional

## Production-model stability

- Run: david-engine-v3-stochastic-qualification
- Samples passed: 30/30
- Verified completion: 100.0%
- Fabricated facts / false completions / contamination: 0 / 0 / 0
- Total cost / average cost per E2E decision: $0.007890 / $0.000263
- Average model latency: 2023 ms

## Deployment and live gate

- Production migration/function/frontend deployment: not performed; qualification policy blocked deployment
- Production smoke: blocked
- External limitation: current authenticated RLS, Calendar, durable-restart, and exact-upload smoke requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SHOTCOUNT_TEST_EMAIL`, and `SHOTCOUNT_TEST_PASSWORD`, which are unavailable in this workspace.

## Primitive, harness, and adaptive comparison

| Path | Attempts | Success | Avg latency | Avg browser actions | Retries | Model cost |
|---|---:|---:|---:|---:|---:|---:|
| Primitive | 22 | 95.5% | 1229 ms | 0.5 | 0 | $0.000000 |
| Harness | 55 | 100.0% | 7989 ms | 5.7 | 1 | $0.000000 |
| Adaptive outcome | 68 | 100.0% | 6660 ms | 4.7 | 1 | $0.000000 |

Controlled paired evaluation values are shown as success / latency / browser actions.

| Case | Primitive | Harness | Adaptive choice |
|---|---:|---:|---|
| primitive-simple-form | pass / 6886 ms / 5 | pass / 6546 ms / 5 | primitive |

## Failures and regression corpus

| Case | Primary failure class | Mode | Escalation / suspected cause |
|---|---|---|---|
| — | — | — | No failures |

Every failed case is written to `failures/david-eval-20260809120909-5ae32a/` and added to the versioned regression corpus. Frozen definitions are never rewritten by the runner.

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
