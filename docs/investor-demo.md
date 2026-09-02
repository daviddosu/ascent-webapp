# Graduate-application system demo

The demo should make the system's control model visible: one natural-language
request becomes a scoped contract, verified application state, parallel work
lanes, exact human decisions, provider evidence, and a resumable result.

## Preflight

1. Use the Shotcount development account.
2. Confirm Google execution says Connected in Settings.
3. Confirm the server-side OpenAI project has API credits.
4. Confirm browser alerts are allowed if the demo should show deadline reminders.
5. Keep Today selected.
6. Use only controlled application documents and development contacts.
7. Run:

~~~bash
pnpm check
pnpm check:cloud
pnpm benchmark:david
npx --yes deno test supabase/functions/_shared/*_test.ts
~~~

## Scene 1 — One request becomes a contract

Start with:

> I'm applying to the Stanford Physics PhD programme. Help me track the
> requirements, tailor my research statement, request recommendations, and
> prepare the portal materials. Do not submit anything or send messages without
> showing me the exact action first.

Show that Shotcount derives:

- one user-owned task and one application scope;
- application preparation as the requested effect;
- final submission and outbound communication as forbidden until their exact
  approval boundaries are reached; and
- David as the application owner, with no specialist selector or separate
  agent chat.

The programme becomes the centre of the workspace. A research-only request
should produce a bounded, official-source-verified shortlist and stop for
selection; it should not silently create application cases.

## Scene 2 — The agent sees the situation, not a checklist

Open the selected application step and let the system work. Point out:

1. official programme evidence is attached to requirements;
2. applicant facts and uploaded documents remain private and provenance-linked;
3. programme-owned values such as deadlines, fees, and policy are researched
   rather than asked back to the applicant;
4. the detail panel shows one persisted current operation; and
5. the application view projects real active, waiting, blocked, and reviewable
   lanes instead of pretending the work is one sequential questionnaire.

The underlying requirement graph may contain more nodes than the human view.
That is intentional: the graph is for deterministic control, while the view
shows the few decisions and outcomes that matter now.

## Scene 3 — Independent work continues

Show David starting genuinely independent lanes such as:

- faculty intelligence and a source-backed dossier;
- programme-specific CV preparation;
- academic-evidence checking;
- official portal inspection;
- fee and waiver verification; and
- recommendation planning.

Then show one lane waiting for a transcript, referee detail, or applicant
choice. The important behavior is that the user-held lane is visible and
scoped, while the other dependency-ready lanes keep moving without a generic
Continue button.

When a user question appears, show the exact missing value, why it is needed,
the lane it unblocks, and a compact attachment/choice control. Do not show a
generic routing quiz or ask the applicant to supply programme metadata.

## Scene 4 — Typed Roon handoff

Use a recommendation-letter or supervisor-outreach lane with a controlled
development contact. Show:

1. David prepares the evidence-backed contact package;
2. Roon resolves the intended recipient through Google People;
3. the exact draft appears with recipient, subject, body, and attachments;
4. sending remains Approval needed;
5. approval is bound to that exact payload; and
6. Gmail returns a message ID and thread ID before the application lane
   advances.

If the provider reports an existing send after a worker restart, Shotcount
reconciles the original message instead of sending a duplicate.

## Scene 5 — Portal preparation and submission boundary

Show David:

1. opening an isolated, allowlisted official portal session;
2. grounding a field in a verified applicant fact;
3. saving a section and reading the value back;
4. preserving the task-owned checkpoint; and
5. preparing a readiness report with blockers, evidence, artifact checksums,
   and the exact package that would be submitted.

The demo must stop at the final approval boundary. Submission requires the
exact package checksum, current checkpoint, one-time claim, explicit user
approval, and provider-confirmed application ID. A draft, navigation event,
screenshot, or model statement is never presented as submission evidence.

## Scene 6 — Recovery and accretion

Refresh or resume the task at a safe checkpoint. Show that:

- the same AgentRun and application case continue;
- completed artifacts and provider effects are reused;
- an external wait does not erase independent progress;
- an ambiguous effect is reconciled before retry;
- a repeated lane failure is parked without blocking unrelated work; and
- the visible status remains truthful after recovery.

Call out that the run leaves behind reusable, scoped evidence: verified
programme requirements, artifact lineage, portal observations, provider
correlations, user decisions, and failure signatures. No raw credentials,
OTPs, cookies, or unscoped transcript is retained.

## Product points to call out

- One private workspace per applicant and programme.
- Requirements, documents, references, deadlines, and portal progress stay
  together.
- The agent operates from a durable evidence graph and dependency-aware work
  lanes.
- David handles application preparation; Roon handles application-related
  communication and scheduling.
- External email, Calendar, portal, payment, and final-submission effects use
  exact approvals and provider confirmation.
- The system becomes cheaper and more accurate through verified, scoped
  knowledge and regression evidence.
- The app is intentionally focused on graduate-school applications.
