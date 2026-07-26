# GPT-5.6 Luna v1 methodology

Luna v1 is an untouched model-substitution baseline. It uses the same frozen 20 tasks, three independent executions per task, production-path tools, prompts, approvals, retries, scoring, verification, provider mix, runtime settings, and model-agnostic execution hardening used by Terra v2. The only changed inference setting was the model identifier, `gpt-5.6-luna`, with reasoning effort `low`.

All 60 slots are preserved under `results/luna-v1/`. No failed execution was replaced. The temporary isolated Luna benchmark endpoint was removed after the run, and ShotCount production routing remained on Sol throughout.

Measured inference cost is calculated from each recorded model response's uncached input, cached input, cache-write, and output token usage. Luna's applied rates per million tokens were $1.25, $0.125, $1.5625, and $7.50 respectively.
