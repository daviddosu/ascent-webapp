# David application benchmark methodology

`david_application_eval_v1` is a frozen deterministic benchmark for David's graduate-application execution path. Its definitions and expected outcomes live in `spec.json`; the runner never rewrites them. Live university pages and connected Gmail checks are separate because those systems can change independently of the application executor.

## Isolation and safety

- The portal uses an HTTPS fixture on `benchmark.test`, enabled only by `SHOTCOUNT_BENCHMARK_MODE=true` and mapped to loopback by the browser process.
- Synthetic credentials are accepted only on that exact fixture host. Normal browser protection still blocks credentials, private identifiers, local-network destinations, payments, and unsafe form submission.
- Deterministic email is an in-memory provider with provider-style message and thread IDs. Connected Gmail evaluation is limited to `dosudavy@gmail.com` and `daviddosuu@gmail.com` and uses a unique `[SHOTCOUNT-EVAL:<run_id>:<case_id>:<purpose>]` subject marker.
- The benchmark stops at final review except for the fixture-only duplicate-submission test. It never submits a real application.

## Execution and evidence

The router chooses `primitive`, `harness`, `primitive_then_harness`, or `human_handoff` from task complexity, consequence, durability, evidence, recovery, waiting, cross-tool coordination, uncertainty, and historical reliability inputs. Simple reversible reads and stable navigation remain primitive candidates. Stateful portal, document, email, OTP, and multi-application work enters the harness directly.

Completion requires independently observed state: saved-section text, exact uploaded filename and checksum, compiled PDF and ATS extraction, provider message/thread evidence, OTP-to-case matching, durable checkpoints, or fixture submission confirmation. A tool call or model claim alone is never completion.

Primitive escalation records the task, step, input, URL, browser state, DOM representation, attempted actions, failure class, confidence, preserved completed work, recoverable state, and recommended harness entry point. A screenshot reference is recorded when the runtime provides one; DOM evidence is always retained. The harness resumes the checkpoint and does not repeat confirmed consequential actions.

## Improvement loop

`pnpm benchmark:david` runs the frozen suite. `--case <id>`, `--seed <number>`, and `--level atomic|end_to_end|all` focus a run without changing the frozen definitions. `pnpm benchmark:david:loop` assigns a fresh run ID to every iteration and writes a root-cause-ranked report to `loop-failure-ranking.json`.

Every run writes immutable run JSON, per-case traces, latest JSON/CSV, a scorecard, routing statistics, and concise failure reports. Genuine failures are appended to `regressions.json` and stay there after the implementation turns green.

## Improvement scope recorded in v1

| Improvement | Scope |
|---|---|
| Semantic exact-label targeting with safe CSS fallback | Generic |
| Upload re-materialisation during checkpoint replay and approved submit | Generic |
| Read-after-write section and final-review verification | Portal-family-specific |
| Session/save retry from the last confirmed checkpoint | Generic |
| Exact artifact filename/checksum evidence | Generic |
| Gmail idempotency and application/thread ownership | Application-type-specific |
| Conditional graduate-application fields | Portal-family-specific |

The deterministic score is not presented as third-party portal reliability. Live read-only web results and connected Gmail results are reported separately with their own blockers.
