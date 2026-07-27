# Cross-03 single live acceptance

The one permitted targeted live acceptance was preserved at `benchmarks/agent-execution-live/results/cross-03-acceptance/` and failed.

Root cause: the AgentRun was classified as `capability: gmail` with `task_completion_policy: prepared_result`. Its completion evidence therefore accepted `prepared_result: true` after read-only Calendar/Gmail inspection, even though the objective required a Calendar change and a sent Gmail notification. No Calendar mutation, Gmail draft, or Gmail send occurred in this acceptance.

The deterministic fix now forces provider evidence whenever the objective-derived required effects include `calendar_write` or `gmail_send`, even if the run was initially classified as `prepared_result`. A draft can never satisfy a send requirement.

No second live acceptance was run, per the frozen instruction to perform exactly one targeted rerun.
