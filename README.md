# Ascent

Ascent is a calm, local-first planning app built around one loop:

`Goal → Plan → Today → Finish → Review → Improve`

## Run locally

```bash
pnpm install
pnpm dev
```

The app works without a cloud account. Tasks, goals, reviews, preferences, and lists are saved on the device.

## Verify the product

```bash
pnpm check
```

This runs the domain tests, browser-like interaction journeys, automated accessibility checks, TypeScript checking, and the production build.

## Enable secure cloud accounts

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

Set `OPENAI_API_KEY` as a server-side Supabase Function secret. It must never be added to a `VITE_` environment variable or shipped to the browser.

Cloud mode adds sign-up, sign-in, secure row-level data isolation, cross-device workspace synchronization, and accountability invitation acceptance. The service-role key must never be placed in the frontend.

After deployment, verify the reachable cloud surface without printing credentials:

```bash
pnpm check:cloud
```

For a disposable test account, add `ASCENT_TEST_EMAIL` and `ASCENT_TEST_PASSWORD`, then verify signed-in RLS create/read/delete behavior:

```bash
pnpm check:cloud:auth
```

Set `ASCENT_TEST_AI=true` only when you also want this check to make one real, billable AI-coach request.

## Production behavior

- Local changes save immediately, then sync quietly when an account is connected.
- An existing cloud workspace is loaded after sign-in.
- A new account receives the current local workspace.
- The production build is installable and keeps working offline after its first successful load.
- Account data can be exported from Settings.
