# Luna final benchmark methodology

- Model: `gpt-5.6-luna`, reasoning effort low, storage disabled, automatic tool choice, parallel tools disabled, 2,400 maximum output tokens.
- Benchmark: the frozen 20 tasks, three independent fresh executions per task, 60 runs total.
- Providers, accounts, tools, prompts, approvals, scoring, and completion semantics were unchanged.
- The only intended variable was the model-agnostic reliability and semantic verification layer.
- Semantic verification compares canonical instants and timezone meaning, attendee/date/time/duration facts, and contradictions against provider-confirmed Calendar state. Natural but factually equivalent email subjects are accepted.
- The complete final result is `results/final-60-2/latest.json`. Earlier interrupted/preflight runs remain preserved but are excluded from final metrics.
- All failed runs are preserved. No failed result was replaced.
