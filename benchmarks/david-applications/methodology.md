# David application benchmark methodology

The active benchmark version is david_application_engine_v3. It qualifies the
agent operating loop, not just isolated model answers:

intent → contract → evidence graph → dependency-aware lanes → bounded action → verified result → recovery

The deterministic engine owns requirement selection, dependencies, retries,
waits, approvals, browser checkpoints, evidence, and completion. Model calls
are limited to one strict semantic function for one requirement, then validated
by code against case identity, allowed decisions, VERIFIED facts, supplied
evidence IDs, and the active node's contract.

david_application_eval_v1 is a frozen deterministic benchmark for David's
graduate-application execution path. Its definitions and expected outcomes live
in spec.json; the runner never rewrites them. Live university pages and
connected Gmail checks are separate because those systems can change
independently of the application executor.

## Qualification layers

| Layer | What it proves |
| --- | --- |
| Contract | Intent, scope, ownership, tool allow-list, approval, and completion policy are preserved |
| Truth | Facts, official sources, artifacts, provider observations, conflicts, and freshness are handled correctly |
| Work graph | Dependencies, parallel lanes, user/external waits, retry circuits, and deadlock detection are deterministic |
| Effect | Provider actions are claim-protected, approval-bound, idempotent, and reconciled |
| Recovery | Restarts, stale state, invalid model decisions, transient failures, and ambiguous effects recover without duplicates |
| Accretion | Valid knowledge is reused only within scope and freshness rules, and invalid knowledge is retired |
| Human projection | The UI shows persisted completion, one current operation, exact questions, and truthful waiting reasons |

## Isolation and safety

- The portal uses an HTTPS fixture on benchmark.test, enabled only by
  SHOTCOUNT_BENCHMARK_MODE=true and mapped to loopback by the browser process.
- Synthetic credentials are accepted only on that exact fixture host. Normal
  browser protection still blocks credentials, private identifiers,
  local-network destinations, payments, and unsafe form submission.
- Deterministic email is an in-memory provider with provider-style message and
  thread IDs. Connected Gmail evaluation is limited to the explicitly approved
  connected test accounts and uses a unique
  [SHOTCOUNT-EVAL:<run_id>:<case_id>:<purpose>] subject marker.
- The benchmark stops at final review except for the fixture-only
  duplicate-submission test. It never submits a real application.

## Execution and evidence

The router chooses primitive, harness, primitive_then_harness, or
human_handoff from task complexity, consequence, durability, evidence,
recovery, waiting, cross-tool coordination, uncertainty, and historical
reliability inputs. Simple reversible reads and stable navigation remain
primitive candidates. Stateful portal, document, email, OTP, and
multi-application work enters the harness directly.

The target evaluation sequence for new cases is the same deterministic control
sequence:

1. reconstruct the scoped context packet;
2. identify the active lane and its legal tools;
3. reuse valid evidence or choose the cheapest safe next action;
4. persist the action and checkpoint;
5. verify the resulting state independently; and
6. replan only the affected dependants while preserving independent work.

Completion requires independently observed state: saved-section text, exact
uploaded filename and checksum, compiled PDF and ATS extraction, provider
message/thread evidence, OTP-to-case matching, durable checkpoints, or fixture
submission confirmation. A tool call or model claim alone is never completion.

Primitive escalation records the task, step, input, URL, browser state, DOM
representation, attempted actions, failure class, confidence, preserved
completed work, recoverable state, and recommended harness entry point. A
screenshot reference is recorded when the runtime provides one; DOM evidence
is always retained. The harness resumes the checkpoint and does not repeat
confirmed consequential actions.

## Agent-ergonomics scorecard

The primary metric is end-to-end verified completion after autonomous recovery.
Every report should also expose:

- false-completion rate;
- duplicate consequential effects;
- cross-case contamination;
- user interruptions and time-to-unblock;
- model calls and input/output tokens;
- browser and provider operation counts;
- elapsed time and deadline-critical waits;
- recovery success, retry-circuit openings, and deadlocks;
- evidence completeness, authority, and freshness; and
- reuse of verified sources, artifacts, portal mappings, provider results, and
  prior plan work.

Resource use is part of correctness. A pathway that eventually succeeds only
after rediscovering the same source, regenerating a valid artifact, repeatedly
polling a provider, or asking the user for information already present should
be scored as an ergonomic regression even if its final state is correct.

## Accretion qualification

The next accretion-focused qualification cases should exercise this sequence:

1. Run A creates a verified source observation, artifact, provider correlation,
   or portal mapping with explicit scope, authority, freshness, and version.
2. Run B in the same eligible scope reuses that knowledge, records the reuse
   reason, and avoids unnecessary model/provider work or duplicate effects.
3. A changed source, portal identity, provider result, policy version, or
   applicant fact invalidates the stale knowledge and affected approvals.
4. A second applicant with overlapping names or facts cannot retrieve Run A's
   private evidence.
5. A repeated failure becomes a reviewed regression or failure signature; it
   cannot silently change online routing or tool permissions.

These cases should be added as small pathway-distinct contracts, not as a
large snapshot matrix.

## Execution and improvement loop

~~~sh
pnpm benchmark:david
~~~

Use --case <id>, --seed <number>, and --level atomic|end_to_end|all to focus a
run without changing the frozen definitions. Use
--stochastic --repetitions 3 for the production-model stability gate through
the temporary isolated eval endpoint.

Every run writes immutable run JSON, per-case traces, latest JSON/CSV, a
scorecard, routing statistics, and concise failure reports. Genuine failures
are appended to regressions.json and stay there after the implementation turns
green.

The improvement loop is:

extract → validate → normalize → scope → store → retrieve → reuse → measure → invalidate

## Improvement backlog

| Capability | Current contract | Qualification intent |
| --- | --- | --- |
| Semantic exact-label targeting with safe CSS fallback | In place | Preserve |
| Upload re-materialisation during checkpoint replay and approved submit | In place | Preserve |
| Read-after-write section and final-review verification | In place | Preserve |
| Session/save retry from the last confirmed checkpoint | In place | Preserve |
| Exact artifact filename/checksum evidence | In place | Preserve |
| Gmail idempotency and application/thread ownership | In place | Preserve |
| Conditional graduate-application fields | In place | Preserve |
| Scoped CONTEXT_PACKET_V1 and bounded decision envelope | Next | Measure context completeness and out-of-scope decision rejection |
| Explicit node resource budgets and reuse accounting | Next | Measure verified progress per model/provider/user cost |
| Freshness and invalidation for sources, portal state, and approvals | Next | Mutate one source/state input and verify safe re-planning |
| Cross-run knowledge reuse without cross-case leakage | Next | Run same-scope reuse and different-applicant isolation cases |

The deterministic score is not presented as third-party portal reliability.
Live read-only web results and connected Gmail results are reported separately
with their own blockers.
