# ShotCount final Luna + harness evaluation

Frozen commit: `70227b96459ba547f3560a0f5f94e621ceb01d77`  
Model: GPT-5.6 Luna, low reasoning effort  
Runs: 60 fresh executions (20 tasks × 3)

## Result

- Overall: **55/60 (91.7%)**
- Email: **14/15 (93.3%)**
- Calendar: **15/15 (100.0%)**
- Cross-tool: **12/15 (80.0%)**
- Browser: **14/15 (93.3%)**
- Primitive-vs-harness category comparison: Email regressed **−6.7 pp**, Calendar was flat, Cross-tool was flat, and Browser improved **+13.3 pp**. The stacked chart does not claim positive uplift for the Email regression.
- Execution precision: **100.0%**
- Median non-approval interventions: **0**
- Average non-approval interventions: **0.10**
- Distance-to-Done: **4.82/5**
- First-attempt success: **90.0%**
- Retry count: **3**
- Measured inference cost: **$0.619558**
- Cost per run: **$0.010326**
- Cost per successful run: **$0.011265**

## Preserved failures

| Task | Run | Failure taxonomy | Final state |
|---|---:|---|---|
| email-04 | 1 | verification mismatch | waiting_for_user |
| cross-03 | 2 | verification mismatch | completed |
| cross-04 | 2 | asynchronous resumption | waiting_external |
| browser-01 | 2 | timeout/network | waiting_external |
| cross-03 | 3 | verification mismatch | completed |

No failed case was rerun or replaced. The historical invalid 23-run partial benchmark remains separate and untouched.

## Artifacts

- Raw result set: `latest.json` and `latest.csv`
- Charts: `charts/`
- Stacked primitive-vs-harness category chart: `charts/luna-harness-stacked-category.svg`
- YC summary graphic: `charts/yc-summary.svg`
