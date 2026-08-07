# David application benchmark — david_application_eval_v1

Run **david-eval-20260807233420-37904d** at 2026-08-07T23:44:59.151Z; evaluated commit **9ce85c61530dda2858b40fbfef5101eb54165830**. Frozen dataset: **58 atomic cases + 10 end-to-end cases**.

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
| Average time / completed application | 9387 ms |

## Primitive, harness, and adaptive comparison

| Path | Attempts | Success | Avg latency | Avg browser actions | Retries | Model cost |
|---|---:|---:|---:|---:|---:|---:|
| Primitive | 22 | 95.5% | 1485 ms | 0.5 | 0 | $0.000000 |
| Harness | 55 | 100.0% | 11314 ms | 5.7 | 1 | $0.000000 |
| Adaptive outcome | 68 | 100.0% | 9387 ms | 4.7 | 1 | $0.000000 |

Controlled paired evaluation values are shown as success / latency / browser actions.

| Case | Primitive | Harness | Adaptive choice |
|---|---:|---:|---|
| primitive-simple-form | pass / 7830 ms / 5 | pass / 8144 ms / 5 | primitive |

## Failures and regression corpus

| Case | Primary failure class | Mode | Escalation / suspected cause |
|---|---|---|---|
| — | — | — | No failures |

Every failed case is written to `failures/david-eval-20260807233420-37904d/` and added to the versioned regression corpus. Frozen definitions are never rewritten by the runner.

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
