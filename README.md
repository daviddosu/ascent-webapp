# Shotcount

Shotcount is a social to-do list. The core product idea is simple: people already
know how to make task lists, but they often follow through better when their
daily tasks and progress are visible to people in their circle.

The main differentiation is the social layer added to everyday task management:

- Users can add and complete normal to-do items.
- People in a user's circle can be notified when that user completes a task.
- Completed work becomes a visible progress signal instead of a private checkmark.
- Users can follow highly productive people and see the rate at which they
  execute.
- Influencers, builders, creators, students, founders, and other visible
  high-agency people can make their execution patterns observable.
- The app turns task completion into shared momentum instead of a private list
  that is easy to ignore.

In one sentence: Shotcount helps people get things done by making their to-do list
social, visible, and motivating.

The launch wedge is social proof around execution. Shotcount should launch around
influencers and people others already see as highly productive. By letting users
see those people's to-do lists and get a feel for how quickly they execute, the
app can make agency feel learnable. "Agency" here means the ability to decide,
move, and get things done. The bet is that technical know-how is becoming less
of a bottleneck, so the harder problem is helping people act.

This repository has two product surfaces:

- The landing page, which introduces the product and sends people into the app.
- The workspace app, which is where the actual planning happens.

The app still supports a personal execution loop:

`Goal → Plan → Today → Finish → Review → Improve`

That loop is useful, but it is not the headline. The headline is that Shotcount
adds social visibility and accountability to task completion.

## What the app does

- `Today` is the main work area.
- `Community` shows progress from other people so work feels visible.
- `Feed` lets users see completed tasks and cheer each other on.
- Notifications can tell a user's circle when that user completes a task.
- Accountability invitations connect users with people who can see and support
  their progress.
- `Upcoming` groups future work into `Tomorrow` and `This Week`.
- `Calendar` shows dated work on a weekly planner.
- `Reviews` help users look back and plan better.
- Tasks can be tied to a goal, and goal color is used to help users scan the page faster.
- The workspace is local-first, so changes save on the device right away.

## Repo shape

This repo is meant to hold both the public landing page and the workspace app.

- `main` and `landing-page` point at the landing-page line.
- `workspace-routing` holds the workspace-app line.

That split lets us keep improving both surfaces without mixing them into one blob.

## Run locally

```bash
pnpm install
pnpm dev
```

The default dev experience opens the landing page. From there, `Try Shotcount Free` sends users into the workspace app.

## Verify the product

```bash
pnpm check
```

This runs the domain tests, browser-style interaction tests, accessibility checks, TypeScript checking, and the production build.

## Cloud accounts

Cloud mode adds sign-up, sign-in, secure row-level data isolation, cross-device workspace synchronization, and accountability invitation acceptance.

To enable cloud accounts:

1. Create a Supabase project.
2. Apply [`supabase/migrations/202607030001_initial_shotcount.sql`](supabase/migrations/202607030001_initial_shotcount.sql).
3. Copy `.env.example` to `.env.local`.
4. Add the project URL and public anonymous key.
5. Restart the development server.

Deploy the account-deletion function before launch:

```bash
supabase functions deploy delete-account
supabase functions deploy ai-coach
```

Set `OPENAI_API_KEY` as a server-side Supabase Function secret. Do not put it in a `VITE_` variable or ship it to the browser.

After deployment, verify the cloud surface:

```bash
pnpm check:cloud
```

For a disposable test account, add `SHOTCOUNT_TEST_EMAIL` and `SHOTCOUNT_TEST_PASSWORD`, then verify signed-in create/read/delete behavior:

```bash
pnpm check:cloud:auth
```

Set `SHOTCOUNT_TEST_AI=true` only when you want that check to make one real, billable AI-coach request.

## Production behavior

- Local changes save immediately, then sync quietly when an account is connected.
- An existing cloud workspace is loaded after sign-in.
- A new account receives the current local workspace.
- The production build is installable and keeps working offline after its first successful load.
- Account data can be exported from Settings.
