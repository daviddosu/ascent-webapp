# Methodology

This is a frozen model-cost ablation of SHOTCOUNT-EVAL LIVE v2. The same 20 tasks were executed three independent times through the same production ShotCount harness, tools, Gmail/Calendar/browser integrations, approvals, retries, prompts, tool schemas, scoring, verification, provider mix, external-state reset, and success criteria. The only intended independent variable was the OpenAI model: GPT-5.6 Sol low reasoning versus GPT-5.6 Terra low reasoning.

All 60 Terra executions are preserved. Failed runs were not replaced. The isolated benchmark endpoint changed only the model identifier; production routing remained on Sol. Costs use measured token usage and each model's corresponding input, cached-input, cache-write, and output rates.

Terra is considered to preserve Sol-level quality only if success is within five percentage points, precision remains 100% or statistically indistinguishable, median interventions remains zero, and Distance-to-Done falls by no more than 0.25. Terra failed the success and Distance-to-Done gates, so Luna was not automatically run.
