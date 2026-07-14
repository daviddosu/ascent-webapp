# Shotcount

Shotcount is a calm, cloud-based planning app built around one loop:

`Goal → Plan → Today → Finish → Review → Improve`

## Run locally

```bash
pnpm install
pnpm dev
```

The production planner loads the signed-in user's Supabase workspace first. It also keeps a user-scoped local copy, so an already-loaded workspace keeps working offline and sends queued changes when the internet returns.

## Verify the product

```bash
pnpm check
```

This runs the domain tests, browser-like interaction journeys, automated accessibility checks, TypeScript checking, and the production build.

## Enable secure cloud accounts

1. Create a Supabase project.
2. Apply the SQL files in [`supabase/migrations`](supabase/migrations) in filename order. The `202607140001` migration adds conflict-safe planner records and realtime updates.
3. Copy `.env.example` to `.env.local`.
4. Add the project URL and public anonymous key.
5. Restart the development server.

Deploy the account-deletion function before launch:

```bash
supabase functions deploy delete-account
supabase functions deploy ai-coach
```

Set `OPENAI_API_KEY` as a server-side Supabase Function secret. It must never be added to a `VITE_` environment variable or shipped to the browser.

Cloud mode adds sign-up, sign-in, secure row-level data isolation, cross-device workspace synchronization, and accountability invitation acceptance. The service-role key must never be placed in the frontend.

After deployment, verify the reachable cloud surface without printing credentials:

```bash
pnpm check:cloud
```

For a disposable test account, add `SHOTCOUNT_TEST_EMAIL` and `SHOTCOUNT_TEST_PASSWORD`, then verify signed-in RLS create/read/delete behavior:

```bash
pnpm check:cloud:auth
```

Set `SHOTCOUNT_TEST_AI=true` only when you also want this check to make one real, billable AI-coach request.

## Production behavior

- Local changes save immediately to a user-scoped offline backup, then sync to Supabase.
- An existing cloud workspace is loaded before the planner is shown after sign-in.
- A new account receives its current local workspace, and an older account is imported once from the original task tables when needed.
- Tasks, goals, visibility choices, subtasks, and completions merge by field so independent changes from two devices are kept.
- The planner shows Loading, Offline, Saving, Saved, and Save failed states.
- The production build is installable and keeps working offline after its first successful load.
- Account data can be exported from Settings.
