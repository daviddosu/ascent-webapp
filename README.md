# Shotcount

Internally, the system runs one durable control loop:
Intent → Contract → Situation → Work graph → Bounded action → Observed effect
→ Replan → Accrete. The agent works from scoped evidence and dependency-aware
lanes, so it can keep useful work moving without treating preparation, waiting,
or model text as proof of completion.

Shotcount is a private, cloud-based workspace for graduate-school applications.
It keeps each programme’s requirements, documents, references, deadlines, and
portal steps together:

`Programme → Requirements → Documents → Review → Submit`

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

This runs the compact high-signal application tier, Deno tests and Edge Function
type checks, TypeScript checking, and the production build. Use `pnpm test:application`
for the broader application integration tier, `pnpm test:full` for all active Vitest
tests, and `pnpm test:qualification` for qualification.

## Enable secure cloud accounts

1. Create a Supabase project.
2. Apply the SQL files in [`supabase/migrations`](supabase/migrations) in filename order. The `202607140001` migration adds conflict-safe planner records and realtime updates.
3. Copy `.env.example` to `.env.local`.
4. Add the project URL and public anonymous key.
5. Restart the development server.

Deploy the database, application workers, and account functions before launch. Replace
`<project-ref>` and `<vercel-project>` with the real deployment values; these commands
are intentionally not run from this repository because they change cloud state.

```bash
export SUPABASE_PROJECT_REF=<project-ref>
supabase login
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push
supabase functions deploy delete-account
supabase functions deploy transcribe-description
supabase functions deploy send-scheduled-reminders
supabase functions deploy task-agent
supabase functions deploy agent-watch-sweep
supabase functions deploy google-oauth-start
supabase functions deploy google-oauth-callback

vercel link --yes --project <vercel-project>
vercel deploy --prod
```

Set the server-only Supabase Function secrets from `.env.example`, including
`SHOTCOUNT_LATEX_COMPILER_URL=https://<vercel-project>.vercel.app/api/application-cv`
and the matching `SHOTCOUNT_LATEX_COMPILER_TOKEN`. The Vercel route runs the approved
`pdflatex` renderer and always requires that server-only token.
`OPENAI_API_KEY` must never be added to a `VITE_` environment variable or shipped to
the browser.

The watch-sweep migration also expects a Vault secret named
`shotcount_cron_token` containing the same value as `SHOTCOUNT_CRON_TOKEN`. If the
Supabase project URL is not available through the database runtime setting, create a
second Vault secret named `shotcount_supabase_url` containing the project URL before
the cron migration runs. Verify the deployed worker without printing secrets:

Run these two statements in the Supabase SQL editor after linking the project
(do not commit the literal values):

```sql
select vault.create_secret('<32+ character cron token>', 'shotcount_cron_token');
select vault.create_secret('https://<project-ref>.supabase.co', 'shotcount_supabase_url');
```

```bash
curl -fsS -X POST "https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/agent-watch-sweep" \
  -H "X-ShotCount-Cron-Token: ${SHOTCOUNT_CRON_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"scheduled_at":"manual-readiness-check"}'
```

The durable execution layer also uses server-only Google OAuth and signed
browser-worker values listed in `.env.example`. The canonical operating model,
provider contracts, demo plan, and qualification methodology are below.

Cloud mode adds sign-up, sign-in, secure row-level data isolation, private
cross-device application-workspace synchronization, and Google execution access.
The service-role key must never be placed in the frontend.

The canonical documents are:

- [Agent operating architecture](docs/agent-architecture.md)
- [Application-agent capability contract](docs/application-agent-capabilities.md)
- [Application portal execution](docs/browser-execution.md)
- [Google provider adapter](docs/google-integration.md)
- [David benchmark methodology](benchmarks/david-applications/methodology.md)
- [Graduate-application system demo](docs/investor-demo.md)

After deployment, verify the reachable cloud surface without printing credentials:

```bash
pnpm check:cloud
```

## Production behavior

- Local changes save immediately to a user-scoped offline backup, then sync to Supabase.
- An existing cloud workspace is loaded before the planner is shown after sign-in.
- A new account receives its current local workspace, and an older account is imported once from the original task tables when needed.
- Application steps, requirements, documents, subtasks, and completions merge by field so independent changes from two devices are kept.
- The planner shows Loading, Offline, Saving, Saved, and Save failed states.
- The production build is installable and keeps working offline after its first successful load.
- Application workspace settings can be updated from Settings.
