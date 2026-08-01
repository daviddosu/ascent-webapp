# ShotCount domain-specialist agent architecture

ShotCount keeps one canonical AgentRun for every delegated task. Domain
specialists are versioned execution contracts around the single reasoning
model, gpt-5.6-luna; they are not separate chats, agents, screens, or user
selectable marketplace entries.

## Specialist registry

The shared, data-only registry is
supabase/functions/_shared/specialists.ts. The browser re-exports it from
src/data/specialists.ts, so routing, the Edge Function, and tests use the same
definitions.

| Specialist | Contract | Tools and boundary |
| --- | --- | --- |
| Roon roon@1 | Communication, Gmail, Calendar, and scheduling | Gmail/contacts/Calendar tools; send and Calendar writes remain approval-gated |
| Caspian caspian@1 | Flight search and itinerary validation | Task-owned browser search/selection only; no Gmail, Calendar, purchase, payment entry, or purchase claim |
| David david@1 | Application planning, checklists, deadlines, missing documents, and document preparation | Grounded application/document tools and safe browser preparation; no Gmail, Calendar, or browser.submit in v1 |

Each registry entry owns its supported task contracts, tool allow-list,
approval rules, required-effect derivation, verifier, retry/recovery policy,
handoff rules, observability tags, and fixtures. Adding a specialist means
adding a versioned registry entry and contract tests; it does not add a new
model or runtime.

## Routing

routeTask(title, description) performs deterministic semantic routing first.
It recognizes domain intent rather than relying on product-copy examples:

1. Communication and scheduling go to Roon.
2. Flight and itinerary work goes to Caspian.
3. Application, admission, programme, document, and deadline work goes to
   David.
4. Mixed travel plus communication is represented as typed stages on one run:
   Roon → Caspian → Roon.
5. An ambiguous non-empty task receives one bounded Luna classification. An
   unsupported or empty task stops for context.

There is no selector in the UI. The task pill and task inspector show the
assigned specialist only as a small identity treatment. The existing Today,
Upcoming, inspector, notification, progress, approval, waiting, and Dynamic
Island surfaces remain the product surface.

Legacy runs are migrated additively by
202608010001_specialist_agent_architecture.sql. Explicit flight work becomes
Caspian, application work becomes David, and only historically Roon-owned
legacy work remains Roon. Provider IDs, actions, approvals, model state,
leases, and recovery state are not rewritten.

## Durable execution

The existing lifecycle remains authoritative:

planning → running → needs_context / needs_approval / waiting_external /
waiting_for_user → completed / failed / cancelled

agent_runs now persists:

- primary and active specialist ID/version;
- the active task contract and routing source;
- stage index and typed specialist stages;
- the fixed reasoning model ID;
- completed and unsatisfied required effects.

agent_actions and agent_run_events record specialist ID/version, task
contract, failure taxonomy, and recovery attempt. agent_run_handoffs stores
the typed handoff on the same run: objective, constraints, completed and
unsatisfied effects, provider evidence, approval state, and next stage.

Only the orchestrator can complete the overall run. A specialist may complete
its stage; the orchestrator persists the handoff, advances the stage on the
same AgentRun, clears only the model continuation state for the new contract,
and resumes with the next specialist. Handoffs are idempotent per run and
stage.

## Tools, approvals, and evidence

The Edge Function filters the existing agentToolDefinitions through the active
registry contract before each Luna call and checks the same boundary again when
handling a function call. A specialist cannot silently call another domain’s
tool or create a second run.

Approvals remain authoritative. Gmail send, Calendar writes, and externally
visible browser submissions require the existing exact approval flow. Financial
tools remain denied; flight work stops at a validated itinerary or safe booking
handoff. David can prepare an application review pack but cannot claim final
submission without provider-confirmed evidence, and its v1 contract does not
expose browser.submit.

Required effects are derived from the typed contract and task objective, then
reconciled from succeeded actions with provider IDs. A model statement, draft,
navigation, screenshot, or prepared browser state is not external evidence.
Completion is accepted only when the persisted effect ledger and the database
completion RPC agree.

Existing idempotency keys, provider correlation IDs, approval versions, leases,
browser checkpoints, Gmail watches, and recovery workers remain in the path.
The specialist metadata is additive, so refreshes, retries, worker restarts,
and provider-response races continue through the same durable harness.

## Failure attribution and recovery

Failures are attributed to the active specialist and contract, with a stable
taxonomy such as SPECIALIST_TOOL_NOT_ALLOWED, MODEL_REASONING_LUNA,
PROVIDER_OR_BROWSER_INFRA, STATE_ORDERING, or BROWSER_SUBMISSION_UNVERIFIED.
Events and actions carry the recovery attempt. Transient model, provider, and
browser failures retain the run, release its lease safely, and use the
existing bounded continuation or watch sweep.

The application boundary is explicit:

- Caspian validates constraints and hands the user to payment; it never
  enters payment or claims purchase.
- David asks for missing applicant evidence, grounds documents and deadlines,
  and stops at a truthful review handoff.
- Roon keeps the existing approval, reply-watch, Calendar conflict, and
  provider-confirmed Gmail behavior.

## Verification

Run the focused contract tests while changing specialist behavior:

    pnpm exec vitest run src/data/specialists.test.ts src/data/agent.test.ts

Run the complete local checks before deployment:

    pnpm test
    pnpm build
    npx --yes deno test supabase/functions/_shared/*_test.ts
    npx --yes deno check \
      supabase/functions/task-agent/index.ts \
      supabase/functions/agent-watch-sweep/index.ts

The specialist fixtures cover deterministic routing, ambiguous Luna routing,
tool isolation, cross-domain stage sequencing, typed handoff effects, legacy
migration, Gmail/Calendar approval, flight payment boundaries, and grounded
application evidence. Frozen benchmark artifacts under benchmarks/ are not
edited or rerun as part of this architecture change.
