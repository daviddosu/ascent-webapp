# Data-source mapping

| Claim | Exact value | Repository source |
|---|---:|---|
| Luna primitive live-task success | 54/60, 90.0% | `benchmarks/luna-final/results/luna-primitive-reference.json` |
| Luna primitive Email / Calendar / Cross-tool / Browser | 100% / 100% / 80% / 80% | `benchmarks/luna-final/results/luna-primitive-reference.json` |
| Luna primitive execution precision | 100% | `benchmarks/luna-final/results/luna-primitive-reference.json` |
| Luna primitive Distance-to-Done | 4.80/5 | `benchmarks/luna-final/results/luna-primitive-reference.json` |
| Luna primitive first-attempt success | 90.0% | `benchmarks/luna-final/results/luna-primitive-reference.json` |
| Luna primitive measured inference cost | $0.417828 | `benchmarks/luna-final/results/luna-primitive-reference.json` |
| Luna primitive cost/run | $0.0069638 | `benchmarks/luna-final/results/luna-primitive-reference.json` |
| Luna primitive cost/success | $0.00773756 | `benchmarks/luna-final/results/luna-primitive-reference.json` |
| Conservative current production-path cost/success | $0.0084093269 | `benchmarks/luna-final/results/luna-harness-v2.json` |
| Pre-acceptance 60-run result | 52/60, 86.7% | `benchmarks/luna-final/results/luna-harness-v2.json` |
| Pre-acceptance category result | Email 100%, Calendar 100%, Cross-tool 86.7%, Browser 60% | `benchmarks/luna-final/results/luna-harness-v2.json` |
| Targeted acceptance | 3/3 | `benchmarks/minimal-execution-acceptance/results/final.json` |
| Targeted execution precision | 100% | `benchmarks/minimal-execution-acceptance/results/final.json` |
| Duplicate/unintended actions | 0 / 0 | `benchmarks/minimal-execution-acceptance/results/final.json` |
| Manual rescues | 0 | `benchmarks/minimal-execution-acceptance/results/final.json` |
| Infrastructure failures invoking Sol | 0 | `benchmarks/minimal-execution-acceptance/results/final.json` |
| Targeted Luna/Sol/total inference cost | $0.031383 / $0.003210 / $0.034593 | `benchmarks/minimal-execution-acceptance/results/final.json` |
| Per-user monthly inference scenarios | $0.04205–$0.84093 | Exact multiplication of $0.0084093269 by 5/10/20/50/100 |
| 2,000-user monthly inference scenarios | $84.09–$1,681.87 | Exact multiplication of $0.0084093269 by 2,000 and 5/10/20/50/100 |
| With-harness category success | Email 93.3%, Calendar 100.0%, Cross-tool 73.3%, Browser 73.3% | `benchmarks/harness-ablation/results/summary.json` → `metrics.shotcount.category` |
| Without-harness category success | Email 100.0%, Calendar 100.0%, Cross-tool 66.7%, Browser 80.0% | `benchmarks/harness-ablation/results/summary.json` → `metrics.generic.category` |
| Harness-ablation sample size | 15 runs/category/condition; 120 total | `benchmarks/harness-ablation/results/summary.json` |

The one Sol call in targeted acceptance was deliberately forced after Luna naturally produced correct wording. It validates fallback plumbing and must not be presented as a measured production escalation rate.
