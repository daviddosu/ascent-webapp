# Durable Luna execution smoke test

## Result

There is **no evidence in this smoke test that ShotCount supplies durable execution capabilities a minimal generic Luna agent cannot reliably provide**. ShotCount passed 3/4 scenarios; the generic baseline passed 4/4. Both conditions maintained 100% execution precision, required no user re-explanation, and produced no duplicate or unintended side effects. Per the decision gate, no hardening or targeted rerun was performed.

| Scenario | ShotCount Luna | Generic Luna |
|---|---|---|
| Reply → Calendar | PASS · completed · $0.010748 | PASS · completed · $0.009552 |
| Timed follow-up | FAIL · waiting_external · $0.005946 | PASS · waiting_external · $0.011155 |
| Restart recovery | PASS · completed · $0.010721 | PASS · completed · $0.009586 |
| Approval persistence | PASS · completed · $0.004062 | PASS · completed · $0.003831 |

## What happened

- **Reply → Calendar:** both sent exactly one initial email, resumed the same logical run after a real controlled-account reply, checked Calendar, created exactly one event, and completed only after provider confirmation. Resume latency was 11.460 seconds for ShotCount and 10.516 seconds for Generic.
- **Timed follow-up:** ShotCount persisted the external wait but did not fire a two-minute deadline or send the requested follow-up. Its Gmail watch has a minimum one-day expiry and expiry transitions to user attention rather than executing an idempotent follow-up. Generic persisted a two-minute runner deadline, resumed the same model/tool history, sent exactly one follow-up, and remained waiting for the unresolved reply.
- **Restart recovery:** both survived redeployment of their temporary execution service while waiting, reconstructed context without user input, resumed after the real reply, and created one Calendar event. Resume latency was 20.462 seconds for ShotCount and 17.139 seconds for Generic.
- **Approval persistence:** both persisted an exact scoped Calendar approval across redeployment, approved only the saved action, created one event, and completed after verification.

## OpenAI-native primitives

OpenAI Background Responses continue long model generations and support polling or stream resumption. Conversations provide durable conversation objects, while webhooks notify applications when OpenAI background work completes. None of these primitives natively watches Gmail, schedules an application business deadline, stores a scoped product approval, or invokes Calendar after an external event.

The required store:false configuration also meant a Conversation identifier did not retain the function-call item needed for a later tool output in preflight. The final generic baseline therefore used OpenAI's documented stateless pattern: the minimal runner persisted the complete response output—including tool-call and encrypted reasoning items—and replayed it after pause or restart.

## Cost

| Metric | ShotCount | Generic |
|---|---:|---:|
| Successful workflows | 3/4 | 4/4 |
| Total Luna inference cost | $0.031477 | $0.034124 |
| Cost per scenario | $0.007869 | $0.008531 |
| Cost per successful workflow | $0.010492 | $0.008531 |

Total measured inference cost was **$0.065601**.

## Decision

Do not build a broader custom durability layer. The measured ShotCount primitives for external-event resumption, restart recovery, scoped approval persistence, provider verification, and idempotency worked, but the generic baseline matched them with OpenAI response-state replay plus a minimal application checkpoint.

If timed follow-up becomes a required product capability, the smallest future change is a model-agnostic deadline record handled by the existing watch sweep, with one idempotency key for the single permitted follow-up. That work was not performed because the decision gate says to stop when Generic performs roughly as well.

A 12–24 hour soak test is **not warranted yet**. First decide whether timed follow-up is an intended product requirement; if it is, implement and narrowly verify that one scheduler gap before any soak.
