# David application benchmark

This is the only active graduate-application benchmark and the canonical
qualification gate for the application-agent operating model.

Run it with:

~~~sh
pnpm benchmark:david
~~~

The benchmark evaluates the full control loop:

intent → contract → evidence graph → dependency-aware lanes → bounded action → verified result → recovery

The canonical result combines:

- 58 deterministic system cases and 10 original controlled E2E cases;
- 16 consolidated hard semantic/system regressions;
- 10 consolidated hard E2E application cases; and
- the production david-application-engine@3 requirement, fact, evidence,
  recovery, and duplicate-prevention contracts.

The primary metric is end-to-end verified completion after autonomous recovery.
A model or tool success string never completes a requirement. The engine accepts
only typed resulting-state observations scoped to the exact ApplicationCase.

The scorecard should also expose the costs and failure modes that matter to an
agent. Where a metric is not yet instrumented, that is a qualification gap:

- false-completion rate;
- duplicate consequential effects;
- cross-case contamination;
- required user interruptions and time-to-unblock;
- model calls/tokens, browser operations, provider calls, and elapsed time;
- recovery success and circuit-opened lanes;
- evidence completeness and freshness; and
- verified artifact, source, provider, and plan reuse.

The benchmark is therefore a qualification gate for both accuracy and
agent-ergonomics. A run that succeeds only through unnecessary model calls,
repeated provider actions, hidden user work, or stale evidence is not a good
system result.

benchmarks/david-applications-v2/ and benchmarks/david-applications-v2-1/ are
historical audit artifacts. Their reports, results, traces, and source code
remain available, but their package commands are retired.

Production deployment is conditional: deterministic qualification must pass
first, followed by three production-model repetitions of every E2E case and
safe live integration validation. Live provider checks remain explicit,
credentialed gates.
