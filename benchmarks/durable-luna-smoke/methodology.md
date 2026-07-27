# Durable Luna smoke-test methodology

This is a compressed-time, eight-run live smoke test: four durable workflows are each run once through the unchanged ShotCount execution architecture and a competent minimal generic OpenAI agent. Both conditions use `gpt-5.6-luna`, low reasoning, automatic tool choice, parallel tool calls disabled, response storage disabled, and a 2,400-token output ceiling.

The ShotCount condition is deployed temporarily from the frozen production `task-agent` source with only the model identifier and benchmark telemetry prefix changed. The production `task-agent` deployment is not replaced. The generic condition uses OpenAI's stateless continuation pattern for model/tool history and the same Gmail, Calendar, contacts, approval boundaries, provider accounts, and tool schemas. It does not use ShotCount AgentRun state, completion evidence, email watches, approval tables, or recovery workers.

Long waits are compressed to two minutes. Controlled-account email and Calendar state are verified directly. Mandatory safety approvals are exercised but are not treated as user rescue.

## OpenAI-native capability audit

- Background Responses can continue model generation after client disconnects and can be polled later.
- Background response streams can be resumed from an event cursor.
- Conversations persist messages, tool calls, and tool outputs under a durable identifier across sessions, devices, and jobs.
- Webhooks can notify an application when an OpenAI background response completes and may be retried for up to 72 hours; consumers must deduplicate deliveries.
- These primitives do not natively monitor Gmail, schedule an application deadline, store a scoped product approval, or invoke Calendar after a third-party event. The application still owns those triggers and side-effect idempotency.

Preflight showed that, under the required `store: false` setting, a Conversation identifier did not retain the function-call item required to accept its later tool output. The counted generic baseline therefore uses OpenAI's documented stateless continuation pattern: it persists and replays the complete response output, including tool-call and encrypted reasoning items. The same minimum runner-owned checkpoint holds an external wait, a two-minute deadline, or a pending approval. That checkpoint is intentionally not ShotCount-specific.

## Preflight exclusions

Three incomplete setup attempts are excluded from the eight counted runs:

1. A transient 502 interrupted the benchmark caller during the first ShotCount approval. The identical persisted approval succeeded on retry, demonstrating a driver retry omission; the incomplete run was deleted and the driver restarted from zero.
2. The live fixture initially rejected the smoke-test identifier before a controlled reply could be sent. Identifiers were mapped into the fixture's existing accepted benchmark namespace and the incomplete run was deleted.
3. The first approval-persistence wording said only “Wednesday,” causing Luna to request a date before reaching approval. The scenario was invalid for its intended boundary, so an exact date was added before either valid condition was compared. The malformed attempt is excluded.

One extra controlled preflight email was sent during these excluded setup attempts. No uncontrolled recipient was contacted.
