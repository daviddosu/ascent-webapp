# Application-agent capability contract

This is the production contract for graduate-application work. It is the
application-specific layer of the agent operating architecture in
agent-architecture.md.

David owns the application case and its workflow. Roon owns Gmail, Contacts,
Calendar, and communication side effects. Deterministic engines own workflow
truth. Provider harnesses own external effects and verification. The model
makes bounded semantic judgments over supplied evidence; it does not invent
the application plan or decide that a provider action succeeded.

## Agent-facing contract

Every application continuation receives a bounded context packet containing:

- one user, task, AgentRun, and selected-programme scope;
- the task objective, requested effects, forbidden effects, and approval gates;
- verified facts and their provenance, relevant official sources, artifacts and
  checksums, provider observations, conflicts, and freshness;
- the current requirement/lane, dependency-ready lanes, user-held lanes,
  external waits, blockers, and critical-path risk;
- the active deterministic engine step, allowed tools, preconditions,
  idempotency key, retry budget, and expected evidence; and
- the exact missing input or approval, if one is the only reason this lane is
  waiting.

The model may choose one narrow action inside the active lane. It may not:

- use a fact, file, contact, portal session, or evidence record from another
  user or application case;
- convert a programme question into an applicant question;
- mark a requirement, artifact, communication, payment, or submission complete
  without the required evidence;
- broaden the task from research to application execution, or from preparation
  to an external write, without the corresponding contract and approval; or
- bypass the deterministic controller, provider adapter, approval, or
  reconciliation boundary.

## Ownership of missing values

The owner of a missing value is not necessarily the worker that executes the
lane.

| Missing value | Resolve from | Correct agent behavior |
| --- | --- | --- |
| Programme metadata, deadline, fee, policy, or required count | Selected opportunity and authoritative official source | Research and reconcile; never ask the applicant to supply it |
| Applicant fact, identity, education, preference, or document | Applicant-provided evidence | Ask one typed question or request an attachment |
| Referee or faculty contact | Verified applicant input plus official contact source | Prepare the contact and hand off communication to Roon |
| Portal field or saved section | Grounded applicant fact plus current portal observation | Map, fill, save, and read back within the task-owned session |
| Provider state or reply | First-party provider read or watch | Poll/reconcile; never infer from a draft or model text |
| Semantic interpretation | Supplied verified facts and evidence IDs | Make one allowed decision, then let code validate and persist it |

## Intake, routing, and safety

- Detect application, admissions, graduate-school, scholarship, fellowship,
  internship, job, grant, statement, referee, supervisor-outreach, document,
  and deadline work and route it to David when the intent is supported.
- Repair legacy or misrouted application runs into the canonical David runtime
  before model work starts.
- Keep research-only tasks out of portals and stop after a bounded,
  official-source-verified shortlist. Honor an explicit quantity; otherwise
  return a reviewable set rather than searching without a finish line.
- Treat an explicit apply, prepare, fill, or finish request as permission for
  reversible case preparation, never as permission for final submission,
  communication, payment, or a blanket approval.
- Keep one programme per ApplicationCase. If research finds several verified
  programmes, present a typed multi-select and create one private, idempotent
  case per selected programme.
- Scope every campaign, opportunity, case, requirement, fact, artifact,
  communication, approval, provider action, and checkpoint to the user and
  appropriate task/case.
- Reject credentials, OTPs, card data, bank details, passwords, cookies, and
  other secrets from durable application payloads and logs.

## Research and programme selection

- Search official programme, department, university, and government sources in
  a task-owned, HTTPS allowlisted browser session.
- Persist institution, programme title, official and application URLs,
  deadlines and time zones, pathway, funding model, fit signals, confidence,
  citations, retrieval times, and rationale.
- Mark an opportunity verified only when the citation is authoritative, the
  URL matches the official domain, and the excerpt supports the claim.
- Store source freshness and invalidate derived strategy when a material source
  or deadline changes.
- Deduplicate opportunity and evidence writes with stable idempotency keys.
- Distinguish research/checklist completion from application execution;
  research cannot silently create a case or portal session.

## Applicant facts and requirement graph

- Resolve applicant facts with provenance, confidence, scope, and verification
  state. Conflicts remain explicit until the applicant or an authoritative
  source selects the winning value.
- Never use an official programme page as proof of the applicant's identity,
  education, employment, documents, referees, or portal state.
- Build a durable requirement graph with canonical keys, conditions,
  cardinality, dependencies, owners, deadlines, blockers, evidence contracts,
  source links, applicant state, and verification state.
- Expand broad application-requirements containers into actionable deadline,
  test, essay, recommendation, supervisor, CV/supporting-document, transcript,
  supplemental-question, fee, and portal-section requirements.
- Represent optional, conditional, prohibited, and post-admission work without
  letting it become an artificial blocker before its condition is true.
- Select the next requirement from dependencies, deadline risk, downstream
  impact, external lead time, information gain, user availability, and
  historical reliability.
- Run dependency-ready lanes in bounded parallel groups. A missing transcript,
  referee response, or applicant preference pauses only its dependent lane.
- Make bounded semantic judgments only for the selected requirement: eligibility,
  requirement conflicts, portal-field mapping, supervisor fit, email
  interpretation, writer-draft review, message classification, and reference
  status.

## Documents, CVs, proposals, and work samples

- Read task-attached applicant files as authoritative for that task and prevent
  facts from another applicant profile leaking into a document.
- Generate private, source-grounded PDFs and CVs with checksums, source-asset
  lineage, template and prompt versions, approval state, and revision history.
- Enforce word and character limits, deterministic formatting checks, and
  factual coverage; block unsupported or invented claims.
- Reuse a valid artifact when the source, programme brief, and policy version
  have not changed. A retry must not regenerate a known-good artifact merely
  because the worker restarted.
- Detect, rank, prepare, approve, upload, and read back work-sample, portfolio,
  or code-sample requirements. Record verified not-required or prohibited
  outcomes rather than creating a task for them.
- Run the complete research-proposal workflow: verify the requirement, resolve
  context, rank research directions, build the dossier and methodology, select
  a writer, create a source-linked brief, review deterministic quality gates,
  interpret feedback, revise, obtain applicant approvals, render the final
  artifact, and record verified delivery.
- Discover and resolve supplemental questions with deterministic answer gates,
  applicant decisions, writer delegation where appropriate, portal writing,
  and read-back verification.
- Preserve authorship and programme policy. If a programme limits AI assistance,
  keep the applicant or human writer as the author and use the agent only for
  permitted checking or minor edits.

## Referees, supervisors, admissions, and academic evidence

- Record verified contacts without sending anything.
- Coordinate recommendation requirements, referee selection, support packs,
  reminders, reply monitoring, and replacement-referee states.
- Build supervisor dossiers and outreach packages from official affiliation,
  research fit, the canonical CV, and verified applicant facts. First contact
  remains approval-gated through Roon.
- Request and monitor transcripts, degree certificates, proof of graduation,
  credential evaluations, English tests, admissions tests, and score/document
  delivery.
- Ask admissions for clarification and classify replies without allowing an
  email claim to advance workflow state by itself.
- Return typed, provider-evidenced communication results to David; Roon never
  takes over case state.

## Fees and payment boundaries

- Verify whether a fee exists, the exact amount and currency, source, waiver
  eligibility, waiver route, deadline, and current provider state.
- Prepare and send approval-gated fee-waiver requests through Roon, monitor
  replies, and record the verified decision.
- Prepare a one-time fee-payment handoff only after exact amount, requirement
  version, provider, authorization, and durable payment-lock checks.
- Never ingest card numbers, CVV, bank passwords, PINs, or OTPs.
- Reconcile ambiguous payment results before any retry and prevent duplicate
  charges with idempotent claims. Record receipts only from verified resulting
  state.

## Portal execution and final submission

- Start or reuse an isolated browser session scoped to one user, AgentRun,
  ApplicationCase, and allowlisted official domain set.
- Navigate, observe, fill, select, upload, and preserve resumable checkpoints.
  The browser worker receives structured operations, never arbitrary
  JavaScript or unrestricted page data.
- Ground every entered portal value in a verified fact and every uploaded
  artifact in an exact checksum.
- Record portal identity, section, entered and read-back values, save
  confirmation, session identity, completion signal, and next step.
- Permit generic browser submit only for an explicitly preparatory effect such
  as save-and-continue, an upload, or an academic request. It cannot count as
  final application submission.
- Build a deterministic readiness report over requirements, artifacts,
  referees, declarations, portal validation, approvals, and blockers.
- Require the exact approved package checksum, verified latest checkpoint,
  task-owned session, one-time durable submission claim, and explicit user
  approval before application.submit.
- Mark submission complete only from provider-confirmed submission evidence and
  an application or confirmation ID. Model text and preparatory saves never
  count.

## Roon communication and monitoring

- Resolve contacts; create drafts; send approved email; follow up; read and
  classify application replies; and monitor Gmail threads.
- Schedule approved interviews and meetings and create reminders with
  provider-confirmed Calendar evidence.
- Monitor writer, referee, professor, fee-waiver, academic-delivery,
  test-score, and post-submission deadlines or replies.
- Detect application messages and retrieve a matching OTP from the correct
  case, sender, recipient, institution or portal, subject, and time window
  without persisting or logging the raw code.
- Use typed handoffs that include only the relevant lane, evidence IDs,
  provider correlation, approval state, and next required stage.

## Recovery, evidence, and explicit limits

- Pin model-generated case and requirement IDs to the deterministic engine's
  exact scope and reject tools outside the current engine step.
- Preserve completed effects across retries, deduplicate consequential actions,
  resume task-owned browser checkpoints, recycle failed sessions where safe,
  and reconcile stale provider state.
- Retry bounded model or controller mistakes from preserved durable state.
  Fail closed after the recovery budget instead of looping or inventing
  progress.
- Show only persisted completed summaries and one persisted current operation;
  waiting and approval states retain their exact reason.
- Treat verified facts, official evidence, provider evidence, derived
  decisions, proposed artifacts, and user choices as different record types.
- Admit reusable knowledge only with scope, authority, freshness, policy
  version, evidence IDs, and invalidation conditions.
- Keep final submission, outbound messages, Calendar writes, and fee payments
  behind explicit approval boundaries. The agents cannot bypass provider
  authentication, solve CAPTCHAs, invent missing applicant facts, guarantee
  admission, or spend money without the approved provider handoff.
