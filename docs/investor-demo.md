# Investor demo

## Preflight

1. Use the ShotCount development account.
2. Confirm Google execution says Connected in Settings.
3. Confirm the server-side OpenAI project has API credits. A connected Google
   account alone is not enough for the planner to run.
4. Confirm browser alerts are allowed if the demo should show native notifications.
5. Keep Today selected; Upcoming uses the same task inspector and agent states.
6. Run:

```bash
pnpm check
pnpm check:cloud
pnpm test:e2e:ui
npx --yes deno test supabase/functions/_shared/*_test.ts
npx --yes deno check \
  supabase/functions/task-agent/index.ts \
  supabase/functions/google-oauth-start/index.ts \
  supabase/functions/google-oauth-callback/index.ts \
  supabase/functions/agent-watch-sweep/index.ts
```

Do not demo with a personal inbox containing unrelated private material.

## Gmail follow-up scenario

Create:

> Follow up with everyone I emailed about ShotCount last week who hasn’t replied.

Use a controlled development inbox containing a small, known set of relevant
threads. Delegate from the normal task inspector.

Show:

1. ShotCount searches last week’s sent mail and reads only the relevant threads.
2. Threads with a reply are excluded.
3. The exact recipients, subjects, and follow-up bodies appear for review.
4. ShotCount remains at Approval needed; no email has been sent yet.
5. Approve the exact outreach.
6. Gmail confirms each send and the original task becomes done.

If the draft changes after the review, ShotCount must request a new approval.
Do not use this scenario against a personal inbox or a broad unreviewed result
set.

## Scheduling scenario

Create:

> Set up a meeting with Blessing next week to discuss the ShotCount launch.

Add a private description if needed with Blessing’s email and desired meeting length. Delegate from the normal task inspector.

Show:

1. The task pill and Dynamic Island move to In progress.
2. ShotCount resolves the contact and checks Calendar.
3. The exact outreach draft appears in the existing inspector.
4. Approve Send.
5. The same task becomes Waiting.
6. Reply from the development contact in the same Gmail thread.
7. Click Check now only if the automatic poll has not fired.
8. Review and approve the exact Calendar event.
9. Google confirms the event and the original task becomes done.

Never claim the task is complete before the provider confirmation.

## Flight scenario

Create:

> Find me a return flight from Lagos to London next Thursday, returning Sunday. Economy, maximum one stop, preferably under $1,000.

Delegate. Show that the user never had to write a prompt or open an AI screen.

Expected flow:

1. The task shows a calm live-search progress state.
2. Approximately three current Google Flights options return in the same inspector.
3. Each option shows airline, route, stops, duration, and observed price.
4. Choose one.
5. Roon rechecks the option and resumes the same durable browser session.
6. The task stops at Ready for you.
7. Continue to payment opens the verified airline handoff or Google Flights booking page.
8. Point out that ShotCount has not clicked a provider purchase button and the original task is not falsely marked booked.

Live fares can change. A changed or sold-out option should produce a calm recoverable message, not a false success.

## Product points to call out

- The to-do item is the command.
- There is no Agents page, chat home, or workflow builder.
- Reads and private preparation happen automatically.
- Email and Calendar writes are exact, versioned approvals.
- Payment is always user-controlled.
- Agent context remains private even when the task itself is public.
- Today and Upcoming share the same execution states.
- Navigation and refresh do not lose a running or waiting task.
