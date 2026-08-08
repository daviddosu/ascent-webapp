# David Application Eval v2 methodology

`david_application_eval_v2` is a stochastic, model-in-the-loop benchmark. It is separate from the frozen deterministic `david_application_eval_v1` regression suite.

## What is evaluated

- The exact production David model, reasoning effort, prompt, tool definitions, serial tool-call policy, harness version, and public-browser primitive.
- Five synthetic applicants represented by realistic source documents. Expected values live only in hidden evaluator oracles.
- Research, form interpretation, unseen portal variation, documents, writer/referee/email orchestration, adversarial recovery, and a five-application campaign.
- Twelve independent dimensions plus hard failures for fabricated applicant facts, false completion, and cross-case contamination.

Every successful run must end through `agent.complete` after the runtime verifies the case-specific terminal policy. End-to-end cases stop at a successful readiness report and never call `application.submit`.

## Isolation and security

The local runtime uses the production public-browser implementation against `benchmark.test`, a local HTTPS fixture that stores no real applicant data. Application persistence, Roon, Gmail, and submissions are isolated typed simulations. Hidden oracles are never included in the agent input.

Real model requests pass through the temporary `david-eval-v2-proxy` Edge Function. The proxy requires a random bearer token, exposes no database or provider credentials, and supports only the benchmark version, agent mode, and independent-grader mode. Delete the function and its `DAVID_EVAL_V2_TOKEN` secret after the run.

Observable model messages, function calls, outputs, usage, and errors are saved. Opaque encrypted reasoning payloads are deliberately excluded from persisted traces.

## Running

Set `DAVID_V2_PROXY_URL` and `DAVID_V2_PROXY_TOKEN`, then run:

```sh
pnpm benchmark:david:v2 -- --atomic-repetitions 3 --e2e-repetitions 1 --concurrency 2
```

Useful slices:

```sh
pnpm benchmark:david:v2 -- --level atomic --repetitions 3
pnpm benchmark:david:v2 -- --case form-degree-requirements-versus-ceremony --repetitions 1 --seed 922813289
```

Provider 429 and transient 5xx responses use bounded Retry-After-aware backoff. Provider retries are counted in each run. Actual API usage fields determine token and inference cost; text length is never used as a proxy.

## Outputs

- `results/latest.json` and `results/latest.csv`: aggregate metrics and stochastic samples.
- `traces/<run-group>/`: complete observable per-run traces.
- `failures/<run-group>/`: minimal replay metadata for failed samples.
- `regressions.json`: deduplicated smallest reproductions for general failure classes.
- `report.md`: separate V1 and V2 results, confidence intervals, model configuration, and root causes.

Mixed sampling reports pass@3 only across cases with at least three samples and records the eligible case count. E2E pass@3 is `n/a` when only one E2E repetition was practical.
