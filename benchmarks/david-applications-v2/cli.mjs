import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const args = process.argv.slice(2)
const valueAfter = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? '' : ''
}
const endpoint = process.env.DAVID_V2_PROXY_URL || 'https://bhhutexqrxzbbhatepmh.supabase.co/functions/v1/david-eval-v2-proxy'
const token = process.env.DAVID_V2_PROXY_TOKEN || ''
if (!token) {
  process.stderr.write('DAVID_V2_PROXY_TOKEN is required. See benchmarks/david-applications-v2/methodology.md.\n')
  process.exit(2)
}
const env = {
  ...process.env,
  DAVID_V2_BENCHMARK_RUN: 'true',
  DAVID_V2_PROXY_URL: endpoint,
  DAVID_V2_PROXY_TOKEN: token,
  DAVID_V2_CASE: valueAfter('--case'),
  DAVID_V2_LEVEL: valueAfter('--level'),
  DAVID_V2_REPETITIONS: valueAfter('--repetitions'),
  DAVID_V2_ATOMIC_REPETITIONS: valueAfter('--atomic-repetitions'),
  DAVID_V2_E2E_REPETITIONS: valueAfter('--e2e-repetitions'),
  DAVID_V2_SEED: valueAfter('--seed'),
  DAVID_V2_CONCURRENCY: valueAfter('--concurrency'),
  DAVID_V2_RUN_GROUP: valueAfter('--run-group'),
}
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', 'benchmarks/david-applications-v2/run-benchmark.test.ts'], {
  cwd: root,
  env,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
