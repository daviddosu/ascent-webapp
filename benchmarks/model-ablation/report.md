# ShotCount model-cost ablation

## Result

Terra reduced measured inference cost by **44.6%** ($0.742949) but reduced task success by **20.0 percentage points**, from **59/60 (98.3%)** to **47/60 (78.3%)**. Execution precision remained **100%**, and median non-approval interventions remained **0**. Terra does not meet the benchmark's conservative near-frontier definition.

| Category | GPT-5.6 Sol | GPT-5.6 Terra | Delta |
|---|---:|---:|---:|
| Email | 15/15 (100.0%) | 15/15 (100.0%) | +0.0 pp |
| Calendar | 15/15 (100.0%) | 14/15 (93.3%) | -6.7 pp |
| Cross-tool | 15/15 (100.0%) | 15/15 (100.0%) | +0.0 pp |
| Browser | 14/15 (93.3%) | 3/15 (20.0%) | -73.3 pp |

## Quality and economics

| Metric | Sol | Terra | Delta |
|---|---:|---:|---:|
| Overall success | 98.3% | 78.3% | -20.0 pp |
| Execution precision | 100.0% | 100.0% | +0.0 pp |
| Median interventions | 0.00 | 0.00 | 0.00 |
| Average interventions | 0.10 | 0.10 | 0.00 |
| Distance-to-Done | 4.93/5 | 4.12/5 | -0.82 |
| First-attempt success | 96.7% | 78.3% | -18.3 pp |
| Inference cost | $1.666533 | $0.923584 | -$0.742949 |
| Cost per run | $0.027776 | $0.015393 | |
| Cost per successful run | $0.028246 | $0.019651 | |

## Terra failures

- verification mismatch: 1
- timeout/network: 12

The dominant sensitivity is browser execution: Terra completed 3/15 browser runs versus Sol's 14/15. Email and cross-tool remained perfect. Calendar lost one run to an incomplete approval/resumption state. These results point to weaker browser recovery/reasoning at this model tier, not unsafe duplicate effects.

## Recommendation

**Keep Sol for everything (Option A) for now.** Terra is materially cheaper but falls too far below the current production reliability bar. The measured data does not support Terra as the default, and no dynamic routing change should be implemented from this ablation alone. Luna was not run because Terra fell more than five percentage points below Sol.
