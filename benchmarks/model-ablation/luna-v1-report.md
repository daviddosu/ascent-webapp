# GPT-5.6 Luna v1 — frozen model substitution

Luna completed **54/60 runs (90.0%)**. Production was not modified, and failures were preserved.

| Category | Sol | Terra hardened | Luna v1 |
|---|---:|---:|---:|
| Email | 100.0% | 100.0% | 100.0% |
| Calendar | 100.0% | 100.0% | 100.0% |
| Cross-tool | 100.0% | 80.0% | 80.0% |
| Browser | 93.3% | 86.7% | 80.0% |

| Metric | Sol | Terra hardened | Luna v1 |
|---|---:|---:|---:|
| Overall success | 98.3% | 91.7% | 90.0% |
| Execution precision | 100.0% | 100.0% | 100.0% |
| Median interventions | 0 | 0 | 0 |
| Average interventions | 0.10 | 0.10 | 0.10 |
| Distance-to-Done | 4.93/5 | 4.85/5 | 4.80/5 |
| First-attempt success | 96.7% | 90.0% | 90.0% |
| Measured inference cost | $1.666533 | $0.880455 | $0.417828 |
| Cost per run | $0.027776 | $0.014674 | $0.006964 |
| Cost per successful run | $0.028246 | $0.016008 | $0.007738 |

## Preserved Luna failures

| Task | Run | Taxonomy | Final state |
|---|---:|---|---|
| cross-04 | 1 | verification mismatch | failed |
| cross-03 | 2 | verification mismatch | completed |
| browser-04 | 2 | timeout/network | waiting_for_user |
| cross-03 | 3 | verification mismatch | completed |
| browser-03 | 3 | verification mismatch | waiting_for_user |
| browser-04 | 3 | verification mismatch | failed |

The failures comprise three Cross-tool runs and three Browser runs. Cross-tool failures were one incomplete reply-to-Calendar resumption and two Calendar updates that produced drafts instead of required sent notifications. Browser failures were one selection timeout, one unavailable worker, and one post-handoff run-state failure despite the browser reaching the payment boundary. No hardening was performed.
