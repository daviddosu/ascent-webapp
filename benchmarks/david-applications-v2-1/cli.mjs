import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const args = process.argv.slice(2)
const valueAfter = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] ?? '' : '' }
const token = process.env.DAVID_V21_PROXY_TOKEN || ''
if (!token) { process.stderr.write('DAVID_V21_PROXY_TOKEN is required.\n'); process.exit(2) }
const env = { ...process.env, DAVID_V21_BENCHMARK_RUN: 'true', DAVID_V21_PROXY_URL: process.env.DAVID_V21_PROXY_URL || 'https://bhhutexqrxzbbhatepmh.supabase.co/functions/v1/david-eval-v21-proxy', DAVID_V21_PROXY_TOKEN: token, DAVID_V21_CASE: valueAfter('--case'), DAVID_V21_REPETITIONS: valueAfter('--repetitions'), DAVID_V21_CONCURRENCY: valueAfter('--concurrency'), DAVID_V21_RUN_GROUP: valueAfter('--run-group') }
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', 'benchmarks/david-applications-v2-1/run-benchmark.test.ts'], { cwd: root, env, stdio: 'inherit' })
process.exit(result.status ?? 1)
