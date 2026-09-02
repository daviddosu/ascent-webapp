# Google provider adapter

Shotcount uses Google's official OAuth, Gmail, People, and Calendar APIs.
Browser automation is not used for Gmail or Calendar. Google is a provider
boundary inside the agent operating architecture: Roon prepares and executes
approved communication work, while David remains the owner of the application
case and its requirement state.

## Provider contract

Every Google operation belongs to one user, AgentRun, application case or
communication task, and provider correlation. The adapter separates:

1. **Read.** Fetch the smallest bounded set of messages, contacts, events, or
   availability needed by the active lane.
2. **Prepare.** Resolve identity, create a draft, or build an exact Calendar
   change without claiming that an external effect occurred.
3. **Approve.** Bind approval to the exact recipients, subject/body, event
   fields, operation, and current evidence version.
4. **Claim.** Atomically record the one-time idempotency key before the provider
   write.
5. **Execute.** Call Gmail or Calendar and retain only safe provider IDs.
6. **Reconcile.** Read the provider state back and return typed evidence to the
   same run or handoff.

The model never changes recipients, permissions, provider scope, or task
objective from email content. Email bodies and replies are untrusted input:
they can supply candidate facts for review, but cannot advance application
workflow state by themselves.

## OAuth

The existing Google web client keeps the normal Supabase callback and also
allows:

https://bhhutexqrxzbbhatepmh.supabase.co/functions/v1/google-oauth-callback

The app calls authenticated google-oauth-start. It creates a short-lived,
hashed OAuth state and requests incremental offline access. Google returns to
the public callback function, which validates and consumes state, exchanges the
code server-side, encrypts tokens with AES-GCM, and redirects to the
originating Shotcount route. The callback verifies the complete required scope
set before recording the integration as connected; partial consent returns a
reconnectable error rather than a false Connected state.

Requested scopes:

- openid
- https://www.googleapis.com/auth/userinfo.email
- https://www.googleapis.com/auth/userinfo.profile
- https://www.googleapis.com/auth/gmail.readonly
- https://www.googleapis.com/auth/gmail.compose
- https://www.googleapis.com/auth/calendar.events
- https://www.googleapis.com/auth/calendar.events.freebusy
- https://www.googleapis.com/auth/contacts.readonly

## Verification and release status

Google approved the shotcount-production OAuth App Verification request for
brand verification on 7 August 2026. That approval covers the consent-screen
branding and public URLs; it does not approve new sensitive or restricted
scopes.

The production Google Auth Platform project contains the Ascent Shotcount
Supabase web client, and the Supabase OAuth start/callback functions are
deployed. The production Data access configuration includes the complete
execution scope set listed above, including Gmail, Calendar, and Contacts.
The Gmail and Calendar/Contacts execution scopes are still under data-access
review and cannot be offered to general users until Google completes that
review. The scope justifications and the current demo video
(https://youtu.be/9NdB7rjzPNI) are retained for resubmission. The OAuth
audience remains In production during review; changing it to Testing would
cancel the current verification request. Google verification is not inherited
by newly added scopes or later consent-screen changes.

The investor-demo OAuth client remains in the dedicated
shotcount-agent-staging Google Cloud project. Its consent screen is External
and in Testing, the Shotcount development account is an explicit test user,
and Gmail, Calendar, and People APIs are enabled. The complete execution scope
set has been granted to that controlled development account.

Keep the staging client out of public production traffic. Keep the same
controlled callback URL and server-only token handling, and do not claim that
Gmail, Calendar, or Contacts access is production-verified until the separate
scope review is approved.

## Server secrets

Set these only as Supabase Edge Function secrets:

~~~text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_TOKEN_ENCRYPTION_KEY
SHOTCOUNT_APP_ORIGINS
SHOTCOUNT_INTERNAL_WORKER_TOKEN
~~~

Never prefix them with VITE_. Never reuse a credential exposed in chat or
source control.

## Gmail tools and evidence

- Search messages with a bounded Gmail query scoped to the active lane.
- Read one message or one thread and retain its stable IDs and retrieval
  context, not the entire unrelated inbox.
- Resolve a recipient through Google People and confirm the intended identity.
- Create a private draft.
- Send the exact approved draft after rechecking recipients and subject.
- Watch the confirmed sent message's thread for a reply.

Draft creation is preparation, not communication completion. Sending always
requires approval. The approval hash covers the exact preview, including
recipients, subject, and body. The send path rereads the live Gmail draft and
rejects any changed field.

If a worker restarts after Gmail accepted the send, Shotcount resolves the
original draft's stable RFC message ID from its private action record and
checks Sent mail before retrying. Concurrent approval clicks are claimed
atomically. A sent-message ID and thread ID are provider evidence; a model
claim or draft ID is not.

## Calendar and contacts tools

- Resolve a contact through Google People.
- List bounded event windows.
- Check free/busy across one to twenty calendars.
- Create, update, or delete an exact event after approval.

Read windows must be chronological. Calendar writes store Google event IDs and
read back the resulting event so retries cannot create duplicate events.
Contact resolution is evidence of identity only; it does not authorize a send.

## Typed handoffs and monitoring

For an application communication handoff, Roon returns the same-run packet
with the affected requirement or lane, provider message/thread or event IDs,
approval state, external correlation, expected next event, and evidence IDs.
David applies the typed result to application state. Roon never marks a
requirement satisfied merely because an email was sent.

Watches are durable external waits, not a global task pause. The authenticated
app polls waiting runs while visible. Supabase Cron also invokes a protected
Edge Function every five minutes to resume due watches while the app is closed.
Both paths call the same pollWaitingExternalRun implementation and continue
the same model history.

An OTP may be matched to the correct case, sender, recipient, institution or
portal, subject, and time window. The raw code exists only in the ephemeral
provider-to-worker boundary and is never persisted, logged, or admitted to
reusable memory.

## Scheduling composition

For “Set up a meeting with Blessing next week” the planner can:

1. resolve Blessing;
2. read the user's availability;
3. prepare a Gmail draft with bounded options;
4. pause for exact send approval;
5. send and start an agent_email_watches correlation;
6. resume the same run when the reply appears;
7. prepare the chosen Calendar event;
8. pause for Calendar approval; and
9. create the event and complete the original task only after Google confirms it.

This sequence is a typed dependency graph. If the reply is pending, unrelated
application lanes remain runnable. If a send or Calendar result is ambiguous,
Shotcount reconciles the provider before any retry.

## Accretive provider knowledge

The adapter may retain scoped, useful knowledge such as a verified contact
mapping, a confirmed thread correlation, or a provider failure signature. Each
record needs the user/case scope, provider ID, source and retrieval time,
policy/version, freshness, and invalidation rule. Provider content does not
become general application truth, and raw messages, tokens, or private payloads
are never stored as generic memory.
