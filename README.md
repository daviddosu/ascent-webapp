# Ascent

Ascent is a planning system with two parts that live in the same repository:

- The landing page, which introduces the product and sends people into the app.
- The workspace app, which is where the actual planning happens.

The app is built around one loop:

`Goal → Plan → Today → Finish → Review → Improve`

## What the app does

- `Today` is the main work area.
- `Upcoming` groups work into `Tomorrow` and `This Week`.
- `Calendar` shows dated work on a weekly planner.
- `Community` shows progress from other people.
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

The default dev experience opens the landing page. From there, `Try Ascent Free` sends users into the workspace app.

## Verify the product

```bash
pnpm check
```

This runs the domain tests, browser-style interaction tests, accessibility checks, TypeScript checking, and the production build.

## Cloud accounts

Cloud mode adds sign-up, sign-in, secure row-level data isolation, cross-device workspace synchronization, and accountability invitation acceptance.

To enable cloud accounts:

1. Create a Supabase project.
2. Apply [`supabase/migrations/202607030001_initial_ascent.sql`](supabase/migrations/202607030001_initial_ascent.sql).
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

For a disposable test account, add `ASCENT_TEST_EMAIL` and `ASCENT_TEST_PASSWORD`, then verify signed-in create/read/delete behavior:

```bash
pnpm check:cloud:auth
```

Set `ASCENT_TEST_AI=true` only when you want that check to make one real, billable AI-coach request.

## Production behavior

- Local changes save immediately, then sync quietly when an account is connected.
- An existing cloud workspace is loaded after sign-in.
- A new account receives the current local workspace.
- The production build is installable and keeps working offline after its first successful load.
- Account data can be exported from Settings.
