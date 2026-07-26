# SHOTCOUNT-EVAL LIVE v2 — comparison methodology

Live v2 is a fresh 60-run production-path result set using the exact same 20 tasks, three independent runs per task, model/configuration, prompts, provider mix, scoring, success criteria, and provider verification as Live v1. Live v1 remains unchanged under `results/latest.*`; Live v2 is versioned under `results/live-v2/latest.*`.

Safe read-only browser work may retry within fixed bounds. Consequential external writes retain approval and idempotency controls, while browser submission and payment are never automatically retried. No failed official run was removed or replaced. Diagnostic batches and the post-v2 targeted browser proof are preserved under `results/preflight/` and excluded from official metrics.
