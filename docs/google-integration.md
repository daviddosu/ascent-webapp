# Google integration

ShotCount uses Google’s official OAuth, Gmail, People, and Calendar APIs. Browser automation is not used for Gmail or Calendar.

## OAuth

The existing Google web client keeps the normal Supabase callback and also allows:

`https://bhhutexqrxzbbhatepmh.supabase.co/functions/v1/google-oauth-callback`

The app calls authenticated `google-oauth-start`. It creates a short-lived, hashed OAuth state and requests incremental offline access. Google returns to the public callback function, which validates and consumes state, exchanges the code server-side, encrypts tokens with AES-GCM, and redirects to the originating ShotCount route.

Requested scopes:

- `openid`
- `email`
- `profile`
- `gmail.readonly`
- `gmail.compose`
- `calendar.events`
- `calendar.events.freebusy`
- `contacts.readonly`

The Google app is External and In production. Gmail and Calendar APIs are enabled. Google People API and any sensitive/restricted scope changes must be accepted by the account owner in Google Cloud.

## Server secrets

Set these only as Supabase Edge Function secrets:

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_TOKEN_ENCRYPTION_KEY
SHOTCOUNT_APP_ORIGINS
SHOTCOUNT_INTERNAL_WORKER_TOKEN
```

Never prefix them with `VITE_`. Never reuse a credential exposed in chat or source control.

## Gmail tools

- Search messages with a bounded Gmail query.
- Read one message or one thread.
- Create a private draft.
- Send the exact approved draft after rechecking recipients and subject.
- Watch the confirmed sent message’s thread for a reply.

Draft creation is preparation. Sending always requires approval. The send path verifies that the draft still matches the approved envelope and checks Sent mail by RFC message ID before retrying.

## Calendar and contacts tools

- Resolve a contact through Google People.
- List bounded event windows.
- Check free/busy across one to twenty calendars.
- Create, update, or delete an exact event after approval.

Read windows must be chronological. Calendar writes store Google event IDs so retries cannot create duplicate events.

## Scheduling composition

For “Set up a meeting with Blessing next week” the planner can:

1. Resolve Blessing.
2. Read the user’s availability.
3. Prepare a Gmail draft with bounded options.
4. Pause for exact send approval.
5. Send and start an `agent_email_watches` correlation.
6. Resume the same run when the reply appears.
7. Prepare the chosen Calendar event.
8. Pause for Calendar approval.
9. Create the event and complete the original task only after Google confirms it.

Email bodies and replies are untrusted content. They may supply facts, but cannot change recipients, permissions, policy, or the task objective.

The authenticated app polls waiting runs while visible. Supabase Cron also invokes a protected Edge Function every five minutes to resume due watches while the app is closed. Both paths call the same `pollWaitingExternalRun` implementation and continue the same model history.

## Development reply simulation

For a controlled development demo only, set:

`SHOTCOUNT_ENABLE_DEMO_REPLY_SIMULATION=true`

An authenticated caller can then invoke `task-agent` with:

```json
{
  "action": "simulate_reply",
  "runId": "<waiting AgentRun id>",
  "simulationReply": "Tuesday at 2 PM works for me."
}
```

The action is rejected unless the run has an active Gmail watch. It appends a clearly marked untrusted simulated message to the same saved tool call and continues the same production AgentRun path. The flag must remain unset in production.
