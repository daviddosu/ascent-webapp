# David application benchmark

This is the only active graduate-application benchmark.

Run it with:

```sh
npm run benchmark:david
```

The canonical result combines:

- 58 deterministic system cases and 10 original controlled E2E cases;
- 16 consolidated hard semantic/system regressions;
- 10 consolidated hard E2E application cases;
- the production `david-application-engine@3` requirement, fact, evidence, recovery, and duplicate-prevention contracts.

The primary metric is **end-to-end verified completion after autonomous recovery**. A model or tool success string never completes a requirement. The engine accepts only typed resulting-state observations scoped to the exact `ApplicationCase`.

`benchmarks/david-applications-v2/` and `benchmarks/david-applications-v2-1/` are historical audit artifacts. Their reports, results, traces, and source code remain available, but their package commands are retired.

Production deployment is conditional: deterministic qualification must pass first, followed by three production-model repetitions of every E2E case and safe live integration validation.
