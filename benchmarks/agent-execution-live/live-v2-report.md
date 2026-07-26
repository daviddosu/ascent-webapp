# SHOTCOUNT-EVAL LIVE — v1 vs v2 reliability hardening

## Result

Live v2 completed **59/60 runs (98.3%)**, up from **45/60 (75%)**, with **100% execution precision**, **0 median non-approval interventions**, **4.93/5 Distance-to-Done**, and **96.7% first-attempt success**. The task set, three-run structure, prompts, model/configuration, provider mix, scoring, success criteria, and verification logic were unchanged.

| Category | Live v1 | Live v2 | Change |
|---|---:|---:|---:|
| Email | 15/15 (100%) | 15/15 (100%) | 0.0 pp |
| Calendar | 15/15 (100%) | 15/15 (100%) | 0.0 pp |
| Cross-tool | 9/15 (60%) | 15/15 (100%) | 40.0 pp |
| Browser | 6/15 (40%) | 14/15 (93.3%) | 53.3 pp |
| Overall | 45/60 (75%) | 59/60 (98.3%) | 23.3 pp |

## Original 15 failures

| Failed run | Owner | Exact mechanism | Hardening |
|---|---|---|---|
| browser-04 · run 1 | Browser | Google Flights itinerary selection did not expose a stable selectable card before the bounded wait. | Isolated selection worker, stale-operation recovery, resilient card targeting. |
| browser-01 · run 2 | Browser | Serverless Chromium exhausted resources before returning flight cards. | Fresh browser isolation and bounded runtime recycling. |
| browser-02 · run 2 | Browser | Chromium returned ERR_INSUFFICIENT_RESOURCES during navigation. | Fresh browser isolation and transient runtime retry. |
| browser-03 · run 2 | Browser | Browser target closed during the live search. | Session recovery with safe read-only replay. |
| browser-04 · run 2 | Browser | Browser target closed during search/selection lifecycle. | Separate selection worker and resumable task-owned checkpoint. |
| browser-01 · run 3 | Browser | Serverless Chromium resource failure. | One-operation browser lifecycle and teardown delay. |
| browser-02 · run 3 | Browser | Browser context closed while loading results. | Recoverable lifecycle classification and fresh-context retry. |
| browser-03 · run 3 | Browser | Page/context closed during navigation. | Safe search retry; submit remains non-retryable. |
| browser-04 · run 3 | Browser | Repeated browser lifecycle failure prevented payment handoff. | Durable checkpoint recovery plus isolated selection worker. |
| cross-02 · run 1 | Harness | Controlled reply was not routed back into the same waiting AgentRun. | Deterministic reply injection and same-run resumption verification. |
| cross-03 · run 1 | State management | Calendar update completed while the required Gmail notification remained a draft. | Objective-derived multi-tool completion requirements. |
| cross-03 · run 3 | State management | The run could complete before both Calendar and Gmail obligations were verified. | Incomplete completion is rejected and the same model loop continues. |
| cross-05 · run 1 | Context handling | Roon drafted work instead of asking for missing meeting duration and topic. | Consequential scheduling guard returns needs_context before any write. |
| cross-05 · run 2 | Context handling | Missing duration/topic was incorrectly treated as actionable. | Explicit required-context classification and regression coverage. |
| cross-05 · run 3 | Context handling | The run completed without collecting consequential meeting context. | No-write needs_context boundary for vague scheduling requests. |

## Changes by failure class

- **Browser reliability:** isolated one browser operation per runtime, classified transient runtime failures, recovered stale safe reads, separated flight selection into its own authenticated worker, preserved task-owned checkpoints, and added bounded fresh-browser recovery for result timeouts. Form submission and payment are never automatically retried.
- **Cross-tool verification:** completion now requires every objective-derived Gmail and Calendar effect, partial completion resumes the same AgentRun, and reply-driven runs verify same-run continuity.
- **Missing context:** vague consequential meeting requests return `needs_context` for only duration and topic, before drafts or external writes.

## Remaining failure and post-v2 proof

- **browser-04 run 3:** timeout/network. Google Flights withheld result cards through three safe production retries. This official failure remains in the denominator.
- Final commit `2550bcea0e5cc16d7dcd7a018b946496b2814d00` adds one fresh-browser retry inside the read-only search worker. The preserved targeted production regression then passed through the payment handoff. No purchase was attempted.

## Cost and configuration

- Live v1 inference cost: **$1.833762**
- Live v2 inference cost: **$1.666533**
- Official v1 + v2 inference cost: **$3.500295**
- Live v2 evaluated product commit: `d9817b6ea9f8005dfcb6bfc1e85120ce78d7bf29`
- Post-v2 recovery commit: `2550bcea0e5cc16d7dcd7a018b946496b2814d00`
- Model: `gpt-5.6-sol`; reasoning effort: low

Diagnostic and targeted preflight runs are preserved separately and excluded from both official denominators and official cost figures.
