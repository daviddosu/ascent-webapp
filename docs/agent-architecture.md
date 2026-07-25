# ShotCount agent architecture

ShotCount treats an ordinary task as the command. Agent work stays inside the existing Today, Upcoming, task inspector, notification bell, and Dynamic Island surfaces.

## Runtime path

1. The user delegates an existing task.
2. `task-agent` creates a private `agent_runs` row linked to that task.
3. The Responses API receives only the task objective, private task context, completion policy, and the typed ShotCount tools.
4. Every tool call is validated and recorded in `agent_actions`.
5. The deterministic policy layer allows reads and preparation, pauses external writes for approval, and denies financial actions.
6. Provider IDs and stable idempotency keys are recorded before a consequential action can be retried.
7. Realtime updates and bounded polling refresh the existing task UI.
8. `complete_agent_run` atomically completes the run and, only when its completion policy is satisfied, the underlying task.

The OpenAI key, Google tokens, Supabase service key, and browser worker token exist only in server environments.

## Durable state

`agent_runs` uses these user-visible states:

- `planning`
- `needs_context`
- `running`
- `needs_approval`
- `waiting_external`
- `waiting_for_user`
- `completed`
- `failed`
- `cancelled`

Related private tables:

- `agent_actions`: exact typed tool calls, risk class, idempotency key, provider ID, and public summary.
- `agent_approvals`: immutable approval payload, hash, version, expiry, and decision.
- `agent_run_events`: analytics and user-visible execution history.
- `agent_model_state`: service-role-only Responses continuation items; never hidden reasoning.
- `agent_integrations`: encrypted Google tokens and scopes.
- `agent_email_watches`: durable Gmail reply correlations and polling schedule.
- `browser_execution_sessions`: allowlist, objective, checkpoint, worker operation, result, and payment-boundary state.

Each new run also receives the owner’s reusable execution context from `agent_user_preferences`: timezone, home airport when known, normal meeting length, working hours, cabin, and currency. ShotCount falls back to the existing private creator-profile timezone and safe defaults, so users do not have to restate routine constraints in every task.

All user-readable tables use row-level security. Model continuation state and OAuth state are service-role only. Private agent output is separate from task visibility and never enters Community payloads.

## Completion policy

The initial intent classifier assigns one outcome:

- `prepared_result`: complete when a verified research, draft, or live-search result exists.
- `external_change`: complete only after a provider confirms the email/calendar change.
- `payment_handoff`: remain `waiting_for_user` at checkout; never infer a purchase from preparation.

The model cannot override this policy. The database completion function also emits `task_completed_by_agent`.

## Approval and idempotency

Read and preparation tools run automatically after the relevant integration is connected. Gmail send, Calendar create/update/delete, and externally visible browser submissions require an exact approval. A changed recipient, body, event, or target produces a different hash and requires a new approval.

Consequential actions use:

`agent:{run id}:{step}:{tool}:{argument hash}`

Duplicate model calls, callbacks, page refreshes, retries, and worker restarts resolve to the same recorded action instead of repeating it.

## Waiting and resume

Gmail reply watches correlate the sent Gmail message and thread. A poll reads that exact thread, treats message content as untrusted data, appends the reply to the original tool call, and continues the same AgentRun.

Browser operations persist their pending and completed operation in `browser_execution_sessions.checkpoint`. The worker can restart without losing ownership, selected option, or payment boundary. The app polls only while visible; the durable rows remain resumable after navigation or refresh.

Supabase Cron invokes the protected `agent-watch-sweep` Edge Function every five minutes. The cron credential lives in Supabase Vault and is checked again against the Edge Function secret. The sweep can only call the internal `poll` action with a separate worker token, while the Supabase gateway still receives the server key. This lets Gmail replies and completed browser jobs resume while the app is closed. It cannot start tasks, approve writes, or make user-facing decisions.

## Verification

```bash
pnpm test
pnpm build
npx --yes deno test --allow-env supabase/functions/_shared/agent-tools_test.ts
npx --yes deno check \
  supabase/functions/task-agent/index.ts \
  supabase/functions/google-oauth-start/index.ts \
  supabase/functions/google-oauth-callback/index.ts \
  supabase/functions/agent-watch-sweep/index.ts
```

`src/data/agent-flow.integration.test.ts` exercises the complete mocked Gmail,
Calendar, reply-resume, and flight-payment-boundary journeys through the same
deterministic policy, state transition, idempotency, and completion helpers used
by the app.
