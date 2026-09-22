# Production readiness and completeness register

Status frozen: 2026-09-22

This is the single gap register for the graduate-application workflow. It
exists to stop “what is left?” from becoming a moving target. An item is added
after this date only when a new security defect, data-loss defect, regression,
or explicitly approved product requirement is discovered.

“Verified” means the behavior is present in the repositories and covered by
the relevant local checks. It does not mean that a live Google account,
university portal, or production deployment has been exercised.

## Definition of done

The system is ready for a controlled beta when every `C` item is verified,
every `E` item has live evidence in the target environment, and the applicant
has made the `H` decisions. “Perfect for every school” is not a testable
claim: portals, requirements, identity checks, and applicant facts vary. The
agent must therefore be complete at the workflow boundary and honest at each
provider or human boundary.

## Code and product contract

| ID | Area | Status | Acceptance evidence |
| --- | --- | --- | --- |
| C01 | Non-empty requests default to graduate-application intake | Verified | Shared routing and task-agent scope checks; web and Deno suites |
| C02 | Official programme discovery precedes selection | Verified | David application controller, source-backed opportunity records, and discovery UI |
| C03 | Requirements are stored per programme with source URLs, excerpts, and provenance | Verified | Requirement and evidence contracts plus Deno tests |
| C04 | Programme selection creates the application case and unlocks the plan | Verified | Durable campaign/case graph and application orchestration tests |
| C05 | The plan shows persisted completed work and one current operation | Verified | Orchestrator ownership rules, persisted application state, web/iOS renderers |
| C06 | CV intake preserves the original upload and gates any derived CV behind review | Verified | Private file assets, checksum identity, CV compiler and review boundary |
| C07 | Faculty matches are selected from verified programme research | Verified | Faculty contract, official identity checks, fit evidence, and response-time reconciliation |
| C08 | Tailored faculty email copy is generated only after a faculty/programme decision and verified official address | Verified | `application.research_faculty` and typed email-package contracts; no send is implied by drafting |
| C09 | Gmail draft includes the approved CV attachment and exact readback before send | Verified | Gmail draft/attachment/checksum/readback path and approval UI |
| C10 | Approve means one explicit Gmail send, with provider confirmation and no automatic resend | Verified | Roon/Gmail approval boundary, idempotency ledger, and reconciliation logic |
| C11 | Writer/editor delegation is coordinated through typed Roon handoffs and reviewable artifacts | Verified | Human-assignment and inter-agent request contracts; writer email remains an explicit external boundary |
| C12 | Browser work is task-owned, domain-allowlisted, typed, checkpointed, retried safely, and resumable | Verified | Public browser boundary, Browserbase adapter, retry logic, and browser tests |
| C13 | Credentials, CAPTCHA, identity declarations, authorship, payment, and final submission stop at human/provider gates | Verified by design | Browser boundary codes, approval records, payment handoff, and submission package checks |
| C14 | Consequential provider actions are idempotent and provider-confirmed | Verified | Database claim functions, action ledger, checksums, and execution tests |
| C15 | Run recovery cannot create a second in-flight execution for one task | Verified | Backend start guard plus `agent_runs_one_nonterminal_task_idx`; focused test, full `pnpm check`, and David gate pass |
| C16 | RLS, ownership checks, private uploads, and secret separation are enforced | Verified | Migration contract tests, service-role boundaries, and function authentication |
| C17 | Failure taxonomy, event history, elapsed action time, and recovery attempts are persisted | Verified | Agent events/actions and application control telemetry |
| C18 | Web and iOS display persisted workflow state rather than optimistic completion | Verified | Web control tower, iOS planner/detail polling, and native tests |
| C19 | Email drafting follows the cold-outreach rule: truthful, specific to verified faculty/programme fit, concise, no invented facts, CV attached only when approved, and review before send | Verified | Typed application email context and safety checks |
| C20 | The iOS client remains a compact planner/delegation client over the shared backend | Intentional scope | Native repository contract; feature parity with the web control tower is not assumed |

## Live deployment and provider gates

These cannot be solved by changing repository code alone. They require
credentials, deployment access, provider approval, or a real target account.

| ID | Gate | Status | Required evidence |
| --- | --- | --- | --- |
| E01 | Apply all forward migrations to the target Supabase project and verify schema/RLS | Open external | Migration output, `supabase db lint --local`, and target-project smoke evidence |
| E02 | Deploy Edge Functions, Vercel frontend/API, and scheduled watch sweep from the same revision | Open external | Deployment IDs and health checks for each surface |
| E03 | Run the signed-in production smoke path with a designated test user | Open external | Live task ID/run ID, persisted state, and no duplicate actions |
| E04 | Complete Google OAuth verification for the scopes actually used | Open external | Google Cloud verification status and approved production client |
| E05 | Exercise Gmail draft → approve → send → attachment/readback with the connected Gmail account | Open external | Gmail message/thread IDs and attachment checksum readback; no real outreach without approval |
| E06 | Exercise Browserbase capacity, timeout, persistence, and configured domain allowlists | Open external | Browser session evidence from the target plan/account |
| E07 | Exercise representative portal pathways for each target school/programme family | Open external | Provider-confirmed observations; a single Harvard run cannot qualify every portal |
| E08 | Confirm scheduled worker, alerting, backups, rollback, rate limits, and cost budgets in production | Open external | Operations runbook evidence and a controlled failure/recovery drill |
| E09 | Re-run the David benchmark and qualification gates in the release environment | Open external | Deterministic, stochastic, live, and deployment gates all passed; local benchmark alone is insufficient |

## Applicant or intentional-human gates

These are not defects. Automating them would make the product unsafe or would
misrepresent the applicant.

| ID | Gate | Status | Required decision/evidence |
| --- | --- | --- | --- |
| H01 | Google sign-in and any password, OTP, or CAPTCHA | Human by design | Applicant completes the provider challenge in the approved browser handoff |
| H02 | Applicant identity, factual corrections, education history, scores, dates, and declarations | Human by design | Applicant confirms or supplies the facts |
| H03 | SOP/essay authorship and final narrative direction | Human decision | Applicant chooses a writer/editor path and reviews the content |
| H04 | Writer contact and authorization to coordinate by email | Human decision | Applicant provides the writer email and approves the handoff |
| H05 | Email approval and final external send | Human approval | Applicant clicks the explicit approval after reviewing recipients, body, and attachment |
| H06 | Application fee, payment method, waiver choice, and any paid service | Human approval | Applicant authorizes the payment handoff; the agent never charges autonomously |
| H07 | Final portal submission and any legally meaningful attestation | Human approval | Applicant reviews the completed package and approves the provider submission |

## Current conclusion

The repositories now have a finite implementation checklist and a duplicate
run guard. Local code gates can establish that the deterministic workflow is
sound; they cannot establish that every university portal, Google account, or
production deployment will behave correctly. The only remaining items are the
listed `E` live qualifications and `H` intentional decisions, unless a new
security defect, data-loss defect, regression, or approved product requirement
appears.
