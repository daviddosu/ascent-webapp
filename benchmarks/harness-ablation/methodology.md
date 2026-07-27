# ShotCount harness ablation methodology

## Frozen experiment

This is a same-model comparison between the production ShotCount execution harness and a competent minimal generic OpenAI agent loop. Both conditions use `gpt-5.6-sol` with low reasoning, `store: false`, `max_output_tokens: 2400`, `parallel_tool_calls: false`, and automatic tool choice. Both receive the identical frozen title and Description for each of 20 tasks, run three fresh times.

## Fairness audit

- Model and inference configuration: identical.
- Task inputs, generated dates, controlled provider accounts, fixtures, and external environment: identical.
- Gmail, Calendar, contacts, and live Google Flights capabilities: equivalent and backed by the same provider implementations.
- Consequential-action boundaries: identical. Gmail sends, Calendar writes, and browser submissions require approval; mandatory approvals are excluded from user-effort metrics.
- Objective verifier and failure accounting: the exact existing frozen verifier is imported by both runners.
- Task and run counts: 20 tasks × 3 independent executions per condition.
- ShotCount condition: unchanged production harness, including its AgentRun state, approval orchestration, async resumption, retries, and completion evidence.
- Generic condition: raw title and Description → model → tool observation loop. It has no ShotCount task semantics, durable workflow continuation, completion state machine, reply watcher, retry scheduler, or completion-evidence gate.

The deployed browser worker requires a database-backed session linked to an AgentRun row. The generic runner therefore creates an opaque compatibility row solely to access the same worker. The model and generic loop do not read or use ShotCount AgentRun state. The shared Gmail send implementation similarly requires a prepared-draft audit record; the generic benchmark fixture writes only that provider-safety adapter. These adapters provide equivalent tool access without providing ShotCount orchestration behavior.

## Preflight and freeze

Preflight validated read-only tools, approval-gated Gmail and Calendar writes, controlled external replies, missing-context handling, and the same live browser worker. Preflight results are excluded from the benchmark. After adapter validation, both conditions were frozen before the 120 counted runs.

The estimated incremental inference cost was $3–$5, below the $10 autonomous cost cap.

## Counted runs and invalidated starts

The final dataset contains 120 counted runs: 60 per harness. Every counted failure remains in place, and neither harness was changed after the freeze at commit `bd221bfdb0f492cfb3b13eb6123936a64b2d0d99`.

Two incomplete starts were excluded before their conditions were restarted from zero:

- The first ShotCount start found a stale controlled Calendar event in a target verification window. That made one frozen Calendar case deterministically conflict with prior benchmark state. The exact stale fixture was deleted, the window was verified empty, and all ShotCount slots were restarted fresh.
- The first Generic start ended after 20 attempted slots when host DNS resolution for the shared Supabase provider failed during external-state collection. The partial set was quarantined, connectivity was restored, and all Generic slots were restarted fresh without code or configuration changes.

These were environment-invalidated incomplete sets, not failed cases removed from the final 60-run conditions.

## Measurement and interpretation

Mandatory approvals are not counted as user intervention. Success is determined only by the shared external-state verifier. Distance-to-Done uses the frozen 0–5 definition and retains failed runs. Inference cost is calculated from measured input, cached-input, and output token use; it excludes provider infrastructure and browser-worker compute.

Failure mechanisms in the report are classified from the recorded action trace and final state using the requested common taxonomy. The raw runner reason is preserved in both JSON files.
