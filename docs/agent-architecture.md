# Shotcount agent operating architecture

This is the canonical design for making Shotcount intuitive, ergonomic, and
accretive for an agent. The application is the product surface; the agent is a
durable controller of verified work, not a chatbot that improvises a checklist
one turn at a time.

The governing loop is:

Intent → Contract → Situation → Work graph → Bounded action → Observed effect → Replan → Accrete

The agent should always be able to answer five questions from persisted state:

1. What outcome did the user request, and which external effects are allowed?
2. What is true, for which user and application, with what authority and freshness?
3. Which lanes are runnable, waiting, blocked, or already complete?
4. What is the safest high-value next action within the remaining resource budget?
5. What independently observed result will prove the action and improve future runs?

## Design target

### Agent-intuitive

The same concept has one name and one owner everywhere. Every important record
has a stable ID, an explicit scope, a status, a dependency list, a reason for
waiting, and an evidence contract. The model receives a compact state packet
instead of reconstructing the world from raw tables or old prose.

### Agent-ergonomic

Deterministic reconciliation, cached evidence, and resumable checkpoints do the
cheap work first. The model makes one bounded semantic decision at a time.
Independent lanes run in parallel, a user question belongs to one lane, and an
external wait never freezes unrelated work. Consequential effects are claimed
once, verified once, and never repeated merely because a worker restarted.

### Agent-accretive

Every successful run leaves behind structured, scoped knowledge: verified
applicant facts, official programme evidence, artifact lineage, provider
correlations, portal observations, failure signatures, and user decisions.
Knowledge is reused only when its scope, authority, freshness, and version make
that reuse safe. A transcript is not the memory system.

## The tower of linked abstractions

The layers below are intentionally boring and composable. A higher layer may
constrain a lower layer, but a lower layer may not silently rewrite a higher
layer's intent or policy.

| Layer | Canonical object | Agent question | Authoritative owner |
| --- | --- | --- | --- |
| Intent | task title, description, user interaction | What outcome is wanted? | User, interpreted by the router |
| Contract | AgentTaskSpec on agent_runs.task_spec | What may happen, what is forbidden, and what proves success? | Orchestrator |
| Scope | user, task, AgentRun, application case, programme, provider session | Which world is this action allowed to touch? | Orchestrator and ownership checks |
| Situation | opportunities, cases, requirements, facts, artifacts, contacts, communications, portal state | What is currently known? | Domain records and their evidence links |
| Truth | evidence ledger and provenance fields | Is each claim verified, contested, stale, or merely proposed? | Deterministic engines and providers |
| Work | outer AgentRun.plan plus inner ApplicationExecutionPlan | What work exists, what depends on what, and what can run now? | Orchestrator and deterministic application engine |
| Control | specialist contract, active node, allowed tools, preconditions | What may the model do in this turn? | Tool policy and active work node |
| Effect | approval, action claim, provider operation, browser checkpoint | What external or durable change is being attempted? | Provider harness and approval boundary |
| Proof | provider read-back, resulting-state observation, artifact checksum, durable event | Did the intended effect actually happen? | Provider harness and verifier |
| Accretion | reusable knowledge record, failure signature, benchmark regression | What should make the next run cheaper or more accurate? | Deterministic admission policy, with reviewed changes |

The outer plan selects the domain and specialist stage. The application plan
then expands one selected programme into dependency-aware lanes. They are not
two competing sources of truth: the outer plan controls the run; the inner
plan controls application work. Both use the same semantics for ownership,
dependencies, evidence, retries, and waiting.

## Implementation anchors

The design maps to a small set of owning modules:

- shared specialist identity and typed handoffs: supabase/functions/_shared/specialists.ts;
- task contract and outer execution plan: supabase/functions/_shared/agent-execution-plan.ts;
- application requirement truth and semantic-step planning: supabase/functions/_shared/application-engine.ts;
- programme pathway, strategy, lanes, and re-planning: supabase/functions/_shared/application-orchestration.ts;
- applicant-question prioritization and lane-scoped context: supabase/functions/_shared/application-context-broker.ts and application-pending-input.ts;
- tool policy, approval boundaries, and scheduler decisions: supabase/functions/_shared/application-runtime-policy.ts;
- durable persistence, provider dispatch, reconciliation, and run completion: supabase/functions/task-agent/index.ts; and
- human projection of persisted progress: src/data/agent-progress.ts and src/main.ts.

When these modules disagree, deterministic state and provider evidence win over
model output, UI copy, or an older serialized projection.

## Canonical state vocabulary

Do not collapse these different kinds of state into one status string.

| Dimension | Values | Meaning |
| --- | --- | --- |
| Run lifecycle | planning, running, needs_context, needs_approval, waiting_external, waiting_for_user, completed, failed, cancelled | Whether the overall AgentRun can currently make progress |
| Work lane | planned, ready, active, waiting_user, waiting_external, completed, blocked, skipped | The state of one plan node or requirement lane |
| Truth | unknown, asserted, proposed, verified, conflicted, stale, rejected | How much confidence the system should place in a claim |
| Effect | prepared, approval-pending, claimed, provider-confirmed, ambiguous, reconciled | Whether a consequential action has crossed its external boundary |
| Freshness | current, expiring, expired, invalidated | Whether an observation is safe to reuse |

Completed is therefore never inferred from a model response. A lane is complete
only when its own evidence contract passes. A run is complete only when its
task contract, all required effects, and the completion verifier agree.

## The agent context packet

Before each model call, the orchestrator should build one bounded packet from
durable state. The packet is the agent's working memory for that turn; it is not
an unbounded transcript.

~~~text
CONTEXT_PACKET_V1
contract: objective, mode, requested effects, forbidden effects,
          approval boundaries, completion evidence
scope: user/task/run/case/programme/provider-session IDs and active specialist
truth: relevant verified facts, source citations, artifacts/checksums,
       contacts, provider observations, conflicts, and freshness
work: current lane, runnable lanes, completed outputs, user-held lanes,
      external waits, blocked lanes, dependencies, and critical-path risk
control: allowed tools, tool preconditions, expected postconditions,
         pending approvals, idempotency key, retry budget, and recovery path
proof: required evidence, present evidence, missing evidence, stale evidence,
       and the exact completion test
resources: remaining model steps/tokens, provider/browser budget, time risk,
           and user-attention budget
memory: reusable knowledge references with scope, authority, freshness, and
        the reason each reference is safe to reuse
~~~

The packet should contain relevant IDs and short excerpts, not full provider
responses, cookies, raw browser dumps, secrets, or unrelated application
cases. A missing field must be represented as a typed missing precondition,
not left for the model to infer.

The model's response should be normalized to one bounded control decision:

observe | decide | prepare | ask_user | wait_external | handoff | recover | complete

It may select an allowed tool and supply typed arguments for the active lane.
It may not create IDs, change ownership, mark evidence verified, bypass an
approval, complete a different lane, or replace the durable plan.

## The control loop

Every continuation follows the same sequence, whether it was started by the
user, a realtime event, a provider watch, a cron sweep, or a retry.

1. **Reconcile.** Load the latest run, case, plan, leases, approvals,
   checkpoints, and provider correlations. Repair stale projections before
   asking the model to reason.
2. **Classify.** Separate verified facts from proposals, applicant-owned
   missing values from programme-owned values, and reversible preparation from
   consequential effects.
3. **Prioritize.** Compute runnable lanes and choose the highest-value bounded
   action using dependency unlocks, deadline risk, external lead time,
   information gain, user attention, consequence, and historical reliability.
4. **Constrain.** Derive the exact tool surface and preconditions from the
   active node. Unknown tools, mismatched IDs, stale approvals, and out-of-scope
   providers fail closed.
5. **Act.** Perform one typed deterministic operation or one narrow semantic
   decision. Keep provider calls behind their adapter and approval boundary.
6. **Verify.** Check the postcondition independently: read the provider state
   back, validate the artifact, match the evidence to the case, or confirm the
   durable transition. A success string is only an attempt result.
7. **Commit.** Persist the action, evidence IDs, checkpoint, failure signature,
   and public summary with a stable idempotency key.
8. **Replan.** Unlock only the true dependants, preserve successful work, keep
   independent lanes moving, and choose one of continue, ask, wait, recover,
   block, or complete.
9. **Accrete.** Admit only safe reusable knowledge and record the cost and
   outcome that future scheduling and qualification can use.

## Scheduling and resource policy

The scheduler optimizes for verified progress, not activity or raw model
throughput. Treat resource use as a vector:

model tokens + model calls + browser/provider calls + elapsed time + user attention + consequence risk

Use this order of preference when the expected outcome is comparable:

1. persisted verified evidence and deterministic state;
2. a reusable, still-fresh observation or artifact;
3. a bounded provider read;
4. a targeted deterministic transformation;
5. one narrow model decision;
6. a user question or consequential provider action.

That order is not absolute. A short, high-impact user question can be cheaper
than repeated failed automation, and a deadline-critical external wait should
start early. The scheduler should therefore rank a lane by the expected value
of the work it unlocks divided by its total cost and risk, then apply hard
policy gates.

The scheduler must:

- run dependency-ready independent lanes in bounded batches;
- keep a user-held transcript, referee, or fact lane local to that lane;
- start long-lead external work early when its route is verified;
- reuse valid CVs, dossiers, source observations, and provider results;
- stop retrying a repeated failure when the lane's circuit opens;
- reconcile an ambiguous effect before attempting anything again; and
- surface a deadlock when unfinished work has neither a runnable lane nor a
  legitimate user or external wait.

The resource budget should become explicit and durable at the node level. At a
minimum it should cover model calls/tokens, browser operations, provider calls,
retry attempts, elapsed deadline risk, and user interruptions. Budgets are
policy inputs, not a reason for the model to silently lower evidence quality.

## Ownership and handoffs

Specialists are capability contracts, not independent personalities or chats.
The same reasoning model operates inside the currently active contract.

| Owner | Owns | Must not own |
| --- | --- | --- |
| Orchestrator | task contract, AgentRun lifecycle, stage routing, leases, scheduling, overall completion | domain facts, provider semantics, unapproved writes |
| Deterministic engines | requirement graph, dependency truth, status transitions, retry circuits, readiness and evidence gates | invented applicant values, provider claims, free-form intent |
| David | application case, programme strategy, requirements, documents, faculty intelligence, portal preparation, application handoff | Gmail/Contacts/Calendar side effects or unsupported final-submission claims |
| Roon | Gmail, Contacts, Calendar, application communication, watches, provider confirmation | application ownership, requirement truth, unapproved sends or scheduling |
| Browser/Google/provider harnesses | isolated sessions, typed operations, idempotent claims, provider read-back, recovery | changing the task objective or deciding that a requirement is satisfied |
| User | ambiguous personal facts, final external-action approvals, payment and submission decisions | none of the system's verification work |
| Model | bounded semantic judgments over supplied evidence | durable state mutation, policy decisions, evidence verification, plan invention |

A handoff is a typed packet on the same AgentRun. It contains the target lane,
objective, constraints, completed and unsatisfied effects, evidence IDs,
approval state, provider correlations, checkpoint, and next required stage.
Roon returns provider-evidenced results to David; David remains the application
owner. A handoff never copies a second conversation or creates a second task.

## Tools, approvals, and evidence

The active node generates the tool allow-list before every model call and the
runtime checks it again at dispatch. Every tool declares:

- scope and required record IDs;
- preconditions and the exact state it may change;
- whether it is read, reversible preparation, approval-gated, or irreversible;
- stable idempotency and provider-correlation behavior;
- expected resulting-state evidence; and
- retry, reconciliation, and failure taxonomy.

Approval is exact, versioned, and payload-bound. The approval describes the
recipient or target, the current payload/package checksum, the expected effect,
the evidence that is already present, and the one-time claim that will guard
the action. Editing the payload, changing the target, or observing a new portal
state invalidates that approval.

Evidence is typed and linked to the smallest useful scope. Official programme
evidence proves programme rules; applicant evidence proves applicant facts;
provider evidence proves provider state; derived evidence records deterministic
reasoning over those inputs. A screenshot, draft, navigation event, model
claim, or prepared browser state is not enough unless the node's evidence
contract explicitly calls for it and the independent verifier accepts it.

## Accretion without self-corruption

The reusable knowledge hierarchy is:

current task → same user/case → same programme/pathway → same portal/provider family → general policy

More local knowledge wins only when it is authoritative and current. Every
admitted knowledge item needs:

- stable type and scope;
- source/evidence IDs and authority;
- captured time and freshness/expiry policy;
- schema and policy version;
- sensitivity and retention class;
- reuse conditions; and
- an invalidation reason or superseding record.

Useful accretive records include verified applicant facts, canonical programme
requirements, source freshness, artifact lineage and quality outcomes, faculty
dossiers, portal field observations, provider correlations, recovery patterns,
user decisions, and benchmark regressions. Never admit raw credentials, OTPs,
payment data, cookies, full private provider payloads, or unscoped narrative
transcripts.

The improvement loop is:

extract → validate → normalize → scope → store → retrieve → reuse → measure → invalidate

Online runs may record evidence and failure signatures. They must not silently
rewrite policy, routing, or tool permissions. Changes to those rules require a
reviewed code/document change and a regression case in the canonical David
benchmark.

## Failure and recovery semantics

Recovery is a state transition, not another attempt to improvise.

| Failure or condition | Correct response |
| --- | --- |
| Missing applicant-owned fact or file | Ask one typed, lane-scoped question and continue independent lanes |
| Programme value missing or contradictory | Research/reconcile authoritative programme sources; never ask the applicant to supply it |
| Invalid model decision | Retry with narrower evidence and the same node; never widen authority silently |
| Transient provider or worker failure | Retry within budget from the last verified checkpoint |
| External human/provider wait | Persist a typed watch/correlation and continue other lanes |
| Changed or stale source/provider state | Re-read, rebase the lane, and invalidate affected approvals/evidence |
| Ambiguous consequential effect | Reconcile before retry; never duplicate the effect |
| Repeated failure or unsafe policy boundary | Open the lane circuit, preserve progress, and request a specific recovery |
| Unfinished graph with no runnable lane or legitimate wait | Mark a deterministic deadlock; do not present a generic Continue button |

The UI is a projection of this state. It may show persisted completed summaries,
one current operation, genuine active/queued lanes, exact approval requests,
and the precise reason a lane is waiting. It must never turn a planned step,
model intention, or wait into a completed checklist item.

## Delivery plan

The current codebase already provides the durable AgentRun, task spec,
specialist registry, application requirement graph, parallel application
orchestration, context-question broker, approval/evidence gates, browser
checkpoints, Google watches, and the canonical David benchmark. The remaining
work is to make the shared operating model explicit and measurable.

### Phase 1 — Make the state packet canonical

- Keep AgentTaskSpec, the outer plan, the inner application plan, and the
  evidence ledger as separate named layers.
- Define one serialized CONTEXT_PACKET_V1 projection with stable IDs,
  missing-precondition reasons, freshness, allowed tools, and remaining budget.
- Define one bounded model-decision envelope and reject decisions outside the
  active node.
- Add contract fixtures for stale projections, case mismatch, cross-case
  contamination, and an unfinished graph with no legal wait.

### Phase 2 — Make scheduling economical

- Persist node-level resource budgets and actual usage.
- Rank runnable lanes using unlock value, deadline/lead time, information gain,
  user attention, consequence, and historical reliability.
- Measure cache/reuse hits and ensure a verified result is not recomputed on a
  refresh, retry, or material-event replan.
- Keep independent lanes moving while one lane waits for the user or a
  provider; preserve the one-operation human projection.

### Phase 3 — Make accretion explicit

- Add a scoped knowledge-admission contract for facts, official requirements,
  artifacts, portal observations, recovery signatures, and user decisions.
- Add freshness and invalidation rules for programme pages, portal state,
  provider correlations, and derived strategy.
- Reuse knowledge only after scope/authority/version checks; record why a reuse
  was accepted or rejected.
- Promote recurring failures to reviewed benchmark regressions, not silent
  online policy changes.

### Phase 4 — Close provider and human loops

- Make every provider adapter expose prepare, claim, execute, reconcile, and
  evidence semantics with the same typed handoff shape.
- Make each user question name the blocked lane, the exact missing value, and
  the meaningful work it unlocks.
- Make approval cards show the exact payload/checksum, risk boundary, and
  resulting evidence expected after approval.
- Keep payment, OTP, credentials, CAPTCHA, and final submission boundaries
  explicit and irreversible only at the provider/user boundary.

### Phase 5 — Qualify the whole system

- Run deterministic contract tests first, then representative application
  pathways, then credentialed live checks as explicit opt-in gates.
- Report verified completion, false completion, duplicate effects,
  cross-case contamination, user interruptions, time-to-unblock, resource
  consumption, recovery success, evidence completeness, and reuse rate.
- Use the same fixtures to qualify runtime, UI projection, provider adapters,
  and documentation claims.

### Non-goals

- a marketplace of selectable agents or a second chat surface;
- an unconstrained planner that lets the model invent workflow state;
- a generic memory transcript or vector-search layer without provenance;
- blanket approval, credential handling, CAPTCHA solving, or autonomous payment;
- online self-modifying routing, policies, or tool permissions; or
- adding a new framework when a deterministic helper and a focused contract
  test are sufficient.
