# ShotCount engineering guide

## Architecture

- `src/` is the Vite web client. Keep provider credentials and service-role access out of it.
- `api/` contains Vercel Node/browser workers. Browser operations must remain typed, allowlisted, task-owned, and idempotent.
- `supabase/functions/` contains Deno Edge Functions. Entry points authenticate requests; reusable deterministic logic belongs in `_shared/`.
- `supabase/migrations/` is the database source of truth. RLS means row-level security: every user-readable table must scope rows to `auth.uid()`.
- `benchmarks/david-applications/` is the canonical David regression gate. The `v2` and `v2-1` directories are historical evidence.

Agent ownership is strict:

- the orchestrator routes and is the only owner of overall `AgentRun` completion;
- David owns application cases and application workflow state;
- Roon owns Gmail, Contacts, Calendar, and communication side effects;
- Caspian owns flight search and stops before payment;
- deterministic engines own workflow truth; models make bounded semantic judgments;
- provider tools own external effects, and harnesses own verification and recovery.

## Required checks

Run before handing off a code change:

```sh
pnpm check
git diff --check
```

`pnpm check` runs Vitest, Deno unit tests, every Edge Function type check, TypeScript, and the production Vite build. Run the David gate after application, agent, browser, or orchestration changes:

```sh
pnpm benchmark:david
```

Live provider tests and production qualification are explicit, credentialed gates; never run them accidentally. Database lint requires the local Supabase Docker stack:

```sh
supabase start
supabase db lint --local
```

There is no Swift/Xcode project in this checkout. Do not claim Apple build coverage unless one is added or supplied separately.

## Database and security rules

- Never edit a migration that may already be applied. Add a timestamped forward migration and update `supabase/database.types.ts` with the resulting contract.
- Make retries idempotent at the database or provider boundary. Do not use read-then-write counters or perform consequential side effects before a durable claim.
- Service-role functions must verify user ownership or a dedicated internal secret before acting. Benchmark fixture functions are not production deployment targets.
- Never persist or log OAuth tokens, passwords, OTP values, payment data, raw browser storage, or full provider responses.
- Keep uploads private by default, validate type and size, scope them to the user/task/application case, and delete storage objects before deleting their metadata or account.
- External writes require the existing approval and evidence gates. A model success message is never completion evidence.

## Change discipline

- Preserve product behavior and existing working-tree changes.
- Prefer small deterministic helpers and direct regression tests over stringly state or broad rewrites.
- Treat `src/main.ts`, `supabase/functions/task-agent/index.ts`, migration/RLS code, browser submission code, OAuth, and benchmark fixtures as high-risk files requiring focused plus full validation.
- Do not commit secrets, generated local Supabase state, `dist/`, or live test-account data.
