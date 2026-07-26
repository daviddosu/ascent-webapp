# SHOTCOUNT-EVAL LIVE v1

Across 60 live production-path AgentRun executions, ShotCount completed **75%** of tasks with **100% execution precision**. This benchmark evaluates ShotCount's end-to-end execution system—not foundation-model superiority.

ShotCount uses **OpenAI gpt-5.6-sol** underneath. The measured system includes task title and Description context, intent classification, the agent harness, tool selection, approval policy, durable state, Gmail and Calendar integrations, and browser execution.

## Live results

| Category | Runs | Success | Precision | Non-approval interventions / successful run | Distance to done | Median active time |
|---|---:|---:|---:|---:|---:|---:|
| Email | 15 | 100% | 100% | 0.00 | 5.00 | 25.6s |
| Calendar | 15 | 100% | 100% | 0.00 | 5.00 | 14.2s |
| Cross-tool | 15 | 60% | 100% | 0.00 | 4.60 | 38.7s |
| Browser | 15 | 40% | 100% | 0.50 | 2.67 | 10.7s |
| **Overall** | **60** | **75%** | **100%** | **0.07** | **4.32** | **18.6s** |

First-attempt success was **75%**. Median non-approval intervention count was **0.0**. Required safety approvals are excluded from user-rescue metrics.

## Controlled vs live

| Category | Controlled success | Live success | Gap |
|---|---:|---:|---:|
| Email | 80% | 100% | 20.0 pp |
| Calendar | 80% | 100% | 20.0 pp |
| Cross-tool | 100% | 60% | -40.0 pp |
| Browser | 100% | 40% | -60.0 pp |
| Overall | 90% | 75% | -15.0 pp |

Controlled v1 proves the harness under deterministic provider fixtures. Live v1 adds real model variance, real Google provider state, real network latency, and changing live webpages. The environments are deliberately comparable in task structure, not identical in difficulty.

## Failures

- timeout/network: 9 runs
- verification mismatch: 3 runs
- missing-context handling: 3 runs

Every failed official run remains in the raw CSV and JSON. Diagnostic preflight failures from benchmark development are preserved separately under `results/preflight/` and are not included in the 60-run denominator.

## Cost and configuration

- Evaluated ShotCount commit: `8dbe01b4077a13c980ddb2953ae62dc941355d91`
- OpenAI model: `gpt-5.6-sol`
- Reasoning: low
- Tool choice: auto; parallel tool calls disabled; maximum output 2,400 tokens
- Measured inference cost: **$1.8338**
- Pricing source: [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- Optional generic OpenAI baseline: not run; equivalent orchestration and safe provider parity could not be guaranteed within this evaluation without creating another harness.

## Claim discipline

The defensible claim is that **ShotCount is an execution system for ordinary to-do tasks**. This benchmark does not compare ShotCount with ChatGPT, Claude, Gemini, or public computer-use benchmarks, and it does not claim that ShotCount trained or uses a smarter foundation model.

## Limitations

- Controlled Google test accounts were used to avoid contacting unrelated people.
- Live webpage and provider behavior can change after the evaluation window.
- The 20-task set is intentionally small and product-shaped; it is not a general intelligence benchmark.
- Email wording quality was inspected but was not a primary success judge when provider state could be verified programmatically.
- Execution precision measures unintended or duplicate externally visible mutations; it is not a score of prose quality or overall task success.
- No flight purchase was attempted. Booking success ends at the verified user-controlled payment handoff.
