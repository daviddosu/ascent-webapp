# Luna + ShotCount Harness — final evidence

## Decision

Luna + Harness is **not sufficient as the sole default** for current use cases under the pre-registered gates. It achieved 52/60 (86.7%), 100% precision, and zero median non-approval interventions, but missed overall success, Cross-tool, Browser, and Distance-to-Done gates.

## Before and after

| Category | Luna primitive | Luna + Harness | Change |
|---|---:|---:|---:|
| Email | 100.0% | 100.0% | 0.0 pp |
| Calendar | 100.0% | 100.0% | 0.0 pp |
| Cross-tool | 80.0% | 86.7% | 6.7 pp |
| Browser | 80.0% | 60.0% | -20.0 pp |

Overall success moved from 90.0% to 86.7%. Cross-tool improved by 6.7 percentage points. Browser fell by 20.0 points because repeated Google Flights timeouts dominated the final sample. The measured harness cost rose 4.7%, from $0.417828 to $0.437285.

## Production gates

- FAIL — overallSuccessAtLeast95
- PASS — executionPrecision100
- PASS — medianInterventionsZero
- FAIL — distanceToDoneAtLeast485
- PASS — emailAtLeast95
- PASS — calendarAtLeast95
- FAIL — crossToolAtLeast90
- FAIL — browserAtLeast90
- PASS — noSystemicDuplicateSideEffects

## Preserved failures

| Task | Run | Category | Failure | Final state |
|---|---:|---|---|---|
| browser-04 | 1 | Browser | timeout/network | failed |
| cross-03 | 2 | Cross-tool | verification mismatch | waiting_for_user |
| cross-04 | 2 | Cross-tool | verification mismatch | running |
| browser-04 | 2 | Browser | timeout/network | failed |
| browser-01 | 3 | Browser | timeout/network | failed |
| browser-02 | 3 | Browser | timeout/network | failed |
| browser-03 | 3 | Browser | timeout/network | failed |
| browser-04 | 3 | Browser | timeout/network | failed |

The failures are primarily systems/provider failures, not evidence that a stronger language model would resolve browser-provider availability. The cross-tool failures expose one provider-state read failure and one orchestration ordering/state issue. Sol or Terra therefore cannot be retired on this evidence, but model escalation alone is not a demonstrated remedy for these failures.

## Investor interpretation

1. Luna + ShotCount cannot yet replace Sol/Terra as the sole default under the frozen production criteria.
2. The measured reliability change was -3.3 points overall, +6.7 Cross-tool, and -20.0 Browser; no overall uplift should be claimed.
3. Inference cost increased 4.7%, which is modest in absolute dollars but did not buy higher observed success.
4. Execution precision remained 100%.
5. Cross-tool benefited most; Browser regressed because of provider timeouts.
6. A verified successful task cost $0.008409 in model inference.
7. At 20 successful tasks per month, model inference is about $0.168 per active user.
8. Investors can confidently be shown 100% execution precision, perfect Email/Calendar results, low inference cost, and the honest remaining Browser/provider reliability risk.
