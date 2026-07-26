# Terra v2 hardening methodology

Terra v1 remains frozen under `results/terra/`. Terra v2 is a separate set under `results/terra-v2/`: the same 20 tasks, three independent runs, Terra low reasoning, prompts, tools, schemas, providers, approvals, scoring, verification and success criteria. Only model-agnostic execution-layer fixes were applied. Failed Terra v2 runs were preserved. Three slots that never created an AgentRun during a transient DNS interruption were executed once when connectivity returned.

Targeted development validation preceded the full run: the exact failed Calendar scenario plus browser-01 through browser-04 all passed in `results/preflight-terra-v2/`. The full result, not the preflight, determines the recommendation.
