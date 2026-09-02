# Application portal execution

Shotcount uses a signed Vercel Node worker for official graduate-application
portals that do not expose a first-party API. The browser is an effect adapter
inside the application control loop, not an independent agent. It observes a
bounded page, performs one typed operation, verifies the resulting state, and
returns evidence to the same AgentRun.

## Boundaries

- The model receives structured browser tools, never Playwright or arbitrary
  JavaScript.
- Each session belongs to one user, AgentRun, ApplicationCase, task, and
  allowlisted official-domain set.
- The Supabase function enforces an exact HTTPS domain allowlist derived from
  the verified programme evidence.
- A random bearer token authenticates the Edge Function to the worker.
- The worker uses a fresh isolated browser context and never returns cookies,
  storage, raw page dumps, or credentials.
- Passwords, one-time codes, payment fields, and private identifiers are
  blocked from generic browser actions.
- Public page content is bounded, sanitized, and explicitly labelled as
  untrusted external content before the model sees it.
- Generic navigation and safe field preparation may continue only until an
  externally visible write. The dedicated application submission path has its
  own stricter contract.

## Browser operating contract

Every operation is scoped to the current case and includes:

- the session and operation IDs;
- the observed target and current page identity;
- the typed action and expected effect;
- the applicant fact or artifact evidence supporting the action;
- the approval version when a write is required;
- the idempotency key and attempt number; and
- the resulting-state evidence the worker must return.

The safe sequence is:

1. **Scope.** Reuse the task-owned session only if its case, domain, and
   checkpoint still match the current plan.
2. **Observe.** Read the bounded title, URL, visible text, headings, links, and
   labelled controls. Treat all page content as untrusted instructions.
3. **Ground.** Match the target field or control to a verified applicant fact,
   artifact checksum, or explicit preparatory intent.
4. **Act.** Use one typed navigation, field, selection, upload, or safe-control
   operation. Do not guess when the target is missing or ambiguous.
5. **Read back.** Confirm the entered value, selected option, uploaded file,
   saved section, or expected page transition.
6. **Commit.** Persist the checkpoint, evidence IDs, operation result, and
   public summary with the same idempotency key.
7. **Replan.** Unlock only the dependent requirement or lane. A model success
   statement never substitutes for the read-back.

## Application portal tasks

browser.start_session creates a task-owned session with only the official
domains needed for the application. browser.navigate, browser.observe, and
browser.act prepare the portal. Each observation is deliberately small so the
agent can reason over the current control surface without spending tokens on
irrelevant page state.

State is replayable rather than tied to a long-lived Chromium process. The
initial URL and at most 30 validated actions are stored in the session
checkpoint, so a serverless restart can continue the same AgentRun. Replay
starts from the last confirmed checkpoint and never repeats an already
confirmed consequential operation.

browser.submit is the only generic externally visible write. It is allowed
only for an explicitly preparatory effect such as save-and-continue, an upload,
or an academic request, and it still uses exact approval and provider
confirmation. It must never impersonate application.submit.

For final application submission, the dedicated path requires the exact
approved package checksum, latest verified checkpoint, task-owned session,
one-time durable submission claim, and explicit user approval. Immediately
before clicking, the worker persists a submission-attempt marker. A retry can
therefore never click twice. Completion requires a visible post-submit
confirmation and an application or confirmation ID. When confirmation is
ambiguous, Shotcount stops for review and refuses to resubmit automatically.

## Accretive portal knowledge

Successful observations may improve future runs only as scoped knowledge. A
portal field map or page pattern must record:

- programme, portal family, and source URL;
- the observed section/control label and page identity;
- the fact or artifact evidence used;
- the observation time and freshness policy;
- the portal or adapter version;
- whether the mapping was read-back verified; and
- the failure or invalidation conditions.

The system may reuse a verified mapping to reduce observation and model cost,
but a changed page identity, missing control, conflicting source, or failed
read-back invalidates it. Never persist selectors, cookies, credentials, raw
storage, or unscoped page text as reusable memory.

## Resource discipline

- Prefer the last verified observation and checkpoint over a fresh page load.
- Observe only the page and controls needed for the active requirement.
- Batch independent read-only portal work when the provider permits it; keep
  writes serial and claim-protected.
- Do not invoke a model to rediscover a mapped field or verified artifact.
- Stop at CAPTCHAs, authentication, payment, unsafe redirects, ambiguous
  controls, or unsupported portal behavior and preserve the exact recovery
  reason.

## Server configuration

Supabase Edge Function secrets:

~~~text
SHOTCOUNT_BROWSER_ALLOWED_DOMAINS=app.shotcount.app,www.imperial.ac.uk,study.ed.ac.uk,web.cs.toronto.edu,www.grad.ubc.ca,www.cs.ubc.ca
SHOTCOUNT_BROWSER_WORKER_URL=https://<deployment>/api/browser-worker
SHOTCOUNT_BROWSER_WORKER_TOKEN=<random shared token>
~~~

Hosts must be official programme sources required by the verified application
case. A new campaign may append only the exact HTTPS hosts required by its
evidence.

Vercel server environment:

~~~text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SHOTCOUNT_BROWSER_WORKER_TOKEN
~~~

The service key and worker token must never be sent to the frontend.

## Failure handling

The worker records stable public codes for runtime failures, unsafe URLs or
fields, missing or ambiguous controls, ambiguous submission confirmation,
changed portal state, timeouts, and worker connectivity. Failed preparation is
retryable when safe from the last checkpoint; failed submission remains under
user review. An ambiguous external effect is reconciled before any retry.

## Verification

The normal test suite uses deterministic official-portal fixtures. David's
application benchmark and the browser-worker contract tests cover
official-source verification, document preparation, exact approvals, submission
evidence, duplicate prevention, checkpoint replay, and bounded recovery.
