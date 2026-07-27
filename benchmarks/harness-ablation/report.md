# ShotCount harness ablation — same-model live benchmark

The controlled result does **not** establish an aggregate ShotCount harness advantage. ShotCount completed **51/60 (85.0%)** runs; the competent generic harness completed **52/60 (86.7%)**. Both maintained **100% execution precision**.

## Required comparison

| Metric | ShotCount | Generic OpenAI Agent |
|---|---:|---:|
| Overall success | 85.0% | 86.7% |
| Email success | 93.3% | 100.0% |
| Calendar success | 100.0% | 100.0% |
| Cross-tool success | 73.3% | 66.7% |
| Browser success | 73.3% | 80.0% |
| Execution precision | 100.0% | 100.0% |
| Median interventions | 0.0 | 0.0 |
| Average interventions | 0.100 | 0.100 |
| Average interventions / success | 0.118 | 0.115 |
| Clarification rate | 10.0% | 5.0% |
| Correction rate | 0.0% | 0.0% |
| Distance-to-Done | 4.63/5 | 4.60/5 |
| First-attempt success | 85.0% | 85.0% |
| Retry count | 8 | 2 |
| Active execution time | 1241.6s | 1586.8s |
| External wait time | 959.3s | 0.0s |
| Total tokens | 895,339 | 929,800 |
| Total measured cost | $1.596856 | $1.679189 |
| Cost / run | $0.026614 | $0.027986 |
| Cost / successful task | $0.031311 | $0.032292 |
| Successful runs / dollar | 31.94 | 30.97 |

## Category results

| Category | ShotCount | Generic OpenAI Agent |
|---|---:|---:|
| Email | 14/15 (93.3%) | 15/15 (100.0%) |
| Calendar | 15/15 (100.0%) | 15/15 (100.0%) |
| Cross-tool | 11/15 (73.3%) | 10/15 (66.7%) |
| Browser | 11/15 (73.3%) | 12/15 (80.0%) |

ShotCount led Cross-tool by one run; the generic harness led Email and Browser by one run each. Calendar tied. These are small, noisy differences in a 15-run-per-category sample.

## Interpretation

1. **Success:** no aggregate improvement was demonstrated; Generic led by 1.7 percentage points.
2. **User effort:** ShotCount averaged 0.118 and Generic 0.115 non-approval interventions per successful task; both had a median of zero.
3. **Cost:** ShotCount cost per success was 3.0% lower than Generic.
4. **Precision:** both were 100%; neither created a duplicate or incorrect consequential external effect.
5. **Category signal:** ShotCount's only observed lead was Cross-tool (73.3% vs 66.7%), but its async-resumption and premature-completion failures prevented a stronger result.
6. **Architecture signal:** this run does not isolate a statistically convincing benefit from durable task state, reply resumption, retry/recovery, or completion evidence. Browser retries improved some recovery but did not overcome four live timeouts.
7. **Investor meaning:** the honest YC result is that the current harness did not outperform a competent minimal baseline on aggregate reliability or user effort. It did use 3.0% less measured inference cost per successful task, maintained safety parity at 100% precision, and led Cross-tool by one run.

## Failure taxonomy

| Harness | Task | Run | Classified mechanism | Final state |
|---|---|---:|---|---|
| ShotCount | email-01 | 1 | state loss | needs_approval |
| ShotCount | cross-03 | 1 | premature completion | completed |
| ShotCount | cross-01 | 2 | async resumption | needs_approval |
| ShotCount | browser-01 | 2 | timeout | failed |
| ShotCount | browser-02 | 2 | timeout | failed |
| ShotCount | cross-01 | 3 | async resumption | failed |
| ShotCount | cross-03 | 3 | premature completion | completed |
| ShotCount | browser-02 | 3 | timeout | failed |
| ShotCount | browser-03 | 3 | timeout | failed |
| Generic OpenAI Agent | cross-04 | 1 | provider failure | failed |
| Generic OpenAI Agent | cross-05 | 1 | premature completion | completed |
| Generic OpenAI Agent | browser-02 | 1 | provider failure | failed |
| Generic OpenAI Agent | cross-04 | 2 | provider failure | failed |
| Generic OpenAI Agent | cross-05 | 2 | premature completion | completed |
| Generic OpenAI Agent | browser-02 | 2 | provider failure | failed |
| Generic OpenAI Agent | browser-04 | 2 | browser failure | failed |
| Generic OpenAI Agent | cross-05 | 3 | premature completion | completed |

ShotCount failures: four browser timeouts, two async-resumption failures, two premature completions, and one approval-state loss. Generic failures: four provider/setup request failures, three premature completions after reply handling, and one browser failure.

## Limitations

- This is one 120-run snapshot: 60 runs per harness and only 15 per category. A one-run aggregate difference is not evidence of a durable ranking.
- The two conditions ran sequentially against live Gmail, Calendar, and Google Flights, so provider conditions were not perfectly simultaneous.
- The production browser worker requires an opaque database compatibility row, and Gmail send requires a prepared-draft safety adapter. These were necessary to give the generic harness equivalent provider access.
- The generic loop has in-process reply handling, while ShotCount has durable reply resumption. This benchmark tested task outcomes, not crash recovery across process restarts.
- A stale controlled Calendar event invalidated the first ShotCount start; it was removed and the condition restarted from zero. A later generic attempt was invalidated by a host DNS outage and also restarted from zero. Neither partial set is included.
- Measured cost covers model inference, not provider infrastructure, browser-worker compute, engineering cost, or product UX.
