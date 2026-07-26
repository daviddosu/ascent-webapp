# SHOTCOUNT-EVAL LIVE v1 — Methodology

## Objective

Measure how reliably ShotCount moves ordinary human to-do items toward their intended real-world outcomes under live model and provider conditions. The unit under evaluation is the **ShotCount agent system**, not the OpenAI foundation model in isolation.

## System boundaries

- **Foundation model:** OpenAI `gpt-5.6-sol`, reasoning effort low, tool choice auto, parallel tool calls disabled, maximum output 2,400 tokens, response storage disabled.
- **Agent system:** ShotCount task title + Description, intent classification, durable AgentRun state, tool policy, approval gates, retries, asynchronous resumption, provider verification, and browser isolation.
- **Environment:** real Gmail and Google Calendar APIs on controlled accounts, plus real Google Flights pages through the production browser worker.

Evaluated ShotCount commit: `8dbe01b4077a13c980ddb2953ae62dc941355d91`.

## Task set and runs

The task structure matches Controlled v1: 5 Email, 5 Calendar, 5 Cross-tool, and 5 Browser tasks. Each task was run independently three times for 60 official runs. Fresh nonces, task IDs, model responses, provider fixtures, and AgentRuns prevented replay of cached successful outputs. Diagnostic preflight runs were excluded from aggregate metrics but preserved.

## Tools and approvals

The production tool set included Gmail search/read/draft/send/reply-watch, Google Contacts lookup, Calendar list/free-busy/create/update/delete, and isolated browser flight search/selection. Read and private preparation steps ran without approval. Email sends and Calendar writes required the normal user approval. Required safety approvals are reported separately and excluded from non-approval human intervention counts.

## Controlled accounts and state reset

Dedicated Gmail/Calendar accounts and uniquely marked messages were used so no unrelated person was contacted. Calendar fixtures were created before a run, verified through Google after execution, and deleted after the run. Drafts were deleted where the granted Gmail compose scope permitted it. At least one Cross-tool scenario used a genuine incoming Gmail reply; repeated reply cases used the controlled second account and are disclosed in the raw metadata.

## Verification

- **Email:** Gmail message/thread/draft/send state, recipient, subject/body requirements, and duplicate-send count.
- **Calendar:** exact provider event ID/state, date/time/duration, attendees, conflict state, and duplicate count.
- **Cross-tool:** Gmail + Calendar state and continuity of the same AgentRun across waiting and reply resumption.
- **Browser:** the production browser checkpoint and live Google Flights options, including origin, destination, date, cabin, stops, ranking constraints, HTTPS handoff, and zero purchases.

Programmatic provider state was the primary success judge whenever available. A model was not used as an outcome judge.

## Metrics and scoring

Task Success and Execution Precision are binary. Execution Precision records whether externally visible mutations were intended, idempotent, and free of duplicates; it does not substitute for Task Success or judge prose quality. Non-approval interventions, clarifications, corrections, retries, active execution time, and external wait time are recorded per run. Distance-to-Done uses a 0–5 scale: 0 means no useful progress and 5 means the requested outcome is complete. A booking task that safely reaches the verified payment boundary is scored according to the published intentional-boundary rule; payment itself is neither required nor attempted.

Every failure receives one primary cause from the fixed taxonomy. First-attempt success requires success with zero internal retries. Provider, model-decision, and harness contribution flags are stored separately.

## Cost

Before scaling, a real Calendar pilot cost $0.0143. A conservative 10× extrapolation was $8.57, below the $31.25 conservative equivalent used for the £25 gate. Actual measured OpenAI inference cost for the official batch was $1.8338. Token accounting includes regular input, cached input, cache writes, and output using [official OpenAI API pricing](https://developers.openai.com/api/docs/pricing). Google APIs and existing hosting were used; no evaluation product, other model provider, paid benchmark infrastructure, or purchase was added.

## Retry policy

Fresh official runs were never replaced by successful reruns. Safe retryable browser reads and itinerary preparation were retried automatically with a fixed bound; externally visible form submission and payment were never automatically retried. Original failures remain in the denominator.

## Limitations

This is a 20-task product benchmark, not a frontier-intelligence benchmark. Controlled accounts improve safety and repeatability but do not reproduce every inbox or calendar. Live webpage results can vary over time. Controlled v1 and Live v1 share task structure but are not identical environments. No cross-provider or generic-agent baseline is claimed.
