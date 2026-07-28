# Final Luna architecture evaluation

## Engineering result

The harness is conditional: Luna follows the direct provider path by default; ShotCount activates recovery, reconciliation, ordering, idempotency, and completion-gate logic only at an evidenced reliability boundary.

- Historical precision failure: cross-03 run 3 replayed the same Calendar update after a step change. Stable consequential idempotency keys and confirmed-action reuse prevent replay.
- Calendar regressions: all three were calendar-02 read-only availability runs. Broad capability-based ledger enforcement incorrectly demanded a Calendar write. Contract-derived effects now leave read-only Calendar on the direct path.
- Cross-tool: required effects are contract-derived; Calendar + Gmail must both be provider-confirmed before completion.
- Browser: healthy paths remain direct; timeout/session recovery remains bounded and activates only after a real failure.

Targeted acceptance: calendar-02 PASS; precision/cross-03 PASS after final correction; browser-01 PASS; browser-02 PASS.

## Final 60-run benchmark

| Metric | Primitive Luna | Luna + conditional harness | Change |
|---|---:|---:|---:|
| Overall success | 90.0% | 96.7% | 6.7 pp |
| Email | 100.0% | 100.0% | 0.0 pp |
| Calendar | 100.0% | 100.0% | 0.0 pp |
| Cross-tool | 80.0% | 93.3% | 13.3 pp |
| Browser | 80.0% | 93.3% | 13.3 pp |
| Execution precision | 100.0% | 100.0% | 0.0 pp |
| Distance-to-Done | 4.80/5 | 4.93/5 | 0.13 |
| First-attempt success | 90.0% | 96.7% | 6.7 pp |
| Median interventions | 0 | 0 | — |
| Inference cost | $0.417828 | $0.566067 | 35.5% |

Successes: 58/60. Precision: 100%. Total tokens: 1,286,132. Cost/run: $0.009434. Cost/success: $0.009760. Retries: 1. Active execution time: 1491.2s.

### Preserved failures

- cross-04 run 3: verification mismatch (needs_approval)
- browser-04 run 3: browser/page change (waiting_for_user)

The final result supports: “Using the same GPT-5.6 Luna model, ShotCount’s conditional execution layer increased live task success from 90.0% to 96.7% while maintaining 100% execution precision.” Cross-tool uplift is also supported (80.0% to 93.3%). Browser uplift is supported in this final sample (80.0% to 93.3%), but remains provider-sensitive.
