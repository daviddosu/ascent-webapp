# Application-agent production capabilities

This is the production contract for application work. The orchestrator owns the overall run, David owns every application case and workflow transition, Roon owns Gmail, Contacts, Calendar, and communication side effects, deterministic engines own workflow truth, and provider harnesses own verification and recovery.

## Intake, routing, and safety

- Detect application, admissions, graduate-school, scholarship, fellowship, internship, job, grant, statement, referee, and supervisor-outreach work and route it to David.
- Repair legacy or misrouted application runs into the canonical David runtime before model work starts.
- Keep research-only tasks out of portals and stop after a bounded official-source-verified shortlist (an explicit requested quantity, otherwise three).
- Treat an explicit “apply/prepare/finish/fill the application” request as permission for reversible case preparation, but never as permission for final submission, communication, or payment.
- Keep one programme per task. If research finds several verified programmes, present a typed multi-select and create one private, idempotent task per selected programme.
- Keep every campaign, opportunity, case, requirement, fact, artifact, communication, approval, provider action, and checkpoint scoped to the user and task.
- Reject credentials, OTPs, card data, bank details, passwords, and other sensitive fields from durable application payloads.

## Research and programme selection

- Search official programme and government sources in a task-owned, allowlisted browser session.
- Persist institutions, programme titles, official and application URLs, deadlines, time zones, confidence, fit scores, citations, retrieval times, and recommendation rationale.
- Mark an opportunity verified only when its citation is authoritative and matches the official domain.
- Deduplicate opportunity writes and recover retries with stable idempotency keys.
- Distinguish research/checklist completion from application execution; research cannot silently create a case.

## Applicant facts and requirement graphs

- Resolve applicant facts with provenance and confidence; conflicts stay unresolved until the applicant or an authoritative source chooses the winning value.
- Never use an official programme page as proof of the applicant’s identity, education, employment, documents, referees, or portal state.
- Build a durable requirement graph with dependencies, owners, deadlines, blockers, evidence contracts, and statuses.
- Expand broad “application requirements” containers into actionable deadline, test, essay, recommendation, supervisor, CV/supporting-document, transcript, and portal-section requirements.
- Select exactly one next requirement using dependencies, deadline risk, downstream impact, user availability, external lead time, and workflow state.
- Make bounded semantic judgments only for the selected requirement: eligibility, requirement conflicts, portal-field mapping, supervisor fit, email interpretation, writer-draft review, message classification, and reference status.

## Documents, CVs, proposals, and work samples

- Read task-attached applicant files as authoritative for that task and prevent facts from another applicant profile leaking into a document.
- Generate private, source-grounded PDFs and CVs with checksums, source-asset lineage, template and prompt versions, approval state, and revision history.
- Enforce word/character limits and block unsupported or invented facts.
- Detect, rank, prepare, approve, upload, and read back work-sample/portfolio/code-sample requirements; also record verified not-required or prohibited outcomes.
- Run the complete research-proposal workflow: verify the requirement, resolve context, rank research directions, build the dossier and methodology, select a writer, create a source-linked brief, review deterministic quality gates, interpret feedback, revise, obtain applicant approvals, render the final artifact, and record verified delivery.
- Discover and resolve supplemental questions, including deterministic answer gates, applicant decisions, writer delegation, portal writing, and read-back verification.

## Referees, supervisors, admissions, and academic evidence

- Record verified contacts without sending anything.
- Coordinate recommendation requirements, referee selection, support packs, reminders, reply monitoring, and replacement-referee states.
- Build supervisor dossiers and outreach packages from official affiliation, research fit, the canonical CV, and verified applicant facts; first contact remains approval-gated through Roon.
- Request and monitor transcripts, degree certificates, proof of graduation, credential evaluations, English tests, admissions tests, and score/document delivery.
- Ask admissions for clarification and classify replies without allowing an email claim to advance workflow state by itself.

## Fees and payment boundaries

- Verify whether a fee exists, the exact amount/currency/source, waiver eligibility, waiver route, deadlines, and current provider state.
- Prepare and send approval-gated fee-waiver requests through Roon, monitor replies, and record the verified decision.
- Prepare a one-time fee-payment handoff only after exact amount, requirement version, provider, authorization, and durable payment lock checks.
- Never ingest card numbers, CVV, bank passwords, PINs, or OTPs.
- Reconcile ambiguous payment results before any retry and prevent duplicate charges with idempotent claims; record receipts only from verified resulting-state evidence.

## Portal execution and final submission

- Start/reuse an isolated browser session, enforce allowed domains, navigate, observe, fill/select/upload, and preserve resumable checkpoints.
- Ground every entered portal value in a verified fact and every uploaded artifact in an exact checksum.
- Record portal identity, section, entered and read-back values, save confirmation, session identity, completion signal, and next step.
- Permit generic browser submit only for an explicitly preparatory effect such as save-and-continue, an upload, or an academic request. It cannot count as final application submission.
- Build a deterministic readiness report over requirements, artifacts, referees, declarations, portal validation, and blockers.
- Require the exact approved package checksum, verified latest checkpoint, task-owned session, one-time durable submission claim, and explicit user approval before `application.submit`.
- Mark submission complete only from provider-confirmed submission evidence and an application/confirmation ID. Model text and preparatory browser saves never count.

## Roon communication and monitoring

- Resolve contacts; create drafts; send approved email; follow up; read and classify application replies; and monitor Gmail threads.
- Schedule approved interviews/meetings and create reminders with provider-confirmed Calendar evidence.
- Monitor writer, referee, professor, fee-waiver, academic-delivery, test-score, and post-submission deadlines or replies.
- Detect application messages and retrieve a matching OTP from the correct case, sender, recipient, institution/portal, subject, and time window without persisting or logging the raw code.
- Preserve David as application owner: Roon returns typed, provider-evidenced results and never takes over case state.

## Recovery, evidence, and explicit limits

- Pin model-generated case and requirement IDs to the deterministic engine’s exact scope and reject tools outside the current engine step.
- Preserve completed external effects across retries, deduplicate consequential actions, resume task-owned browser checkpoints, recycle failed browser sessions where safe, and reconcile stale provider state.
- Retry bounded model/controller mistakes automatically from preserved durable state; fail closed after the recovery budget instead of looping or inventing progress.
- Show only persisted completed summaries and the one persisted current operation; waiting and approval states retain their exact reason.
- Final submission, outbound messages, Calendar writes, and fee payments remain explicit approval boundaries. The agents cannot bypass provider authentication, solve CAPTCHAs, invent missing applicant facts, guarantee admission, or spend money without the approved provider handoff.
