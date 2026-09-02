import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.full.config.ts', 'benchmarks/david-applications/live-web.test.ts'], {
  cwd: resolve(here, '../..'),
  env: { ...process.env, DAVID_LIVE_WEB_RUN: 'true' },
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
