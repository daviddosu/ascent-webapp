import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const valueAfter = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] ?? '' : ''
}
if (args.includes('--stochastic')) {
  const endpoint = process.env.DAVID_EVAL_ENDPOINT || ''
  const token = process.env.DAVID_EVAL_TOKEN || ''
  if (!endpoint || !token) {
    console.error('DAVID_EVAL_ENDPOINT and DAVID_EVAL_TOKEN are required for stochastic qualification.')
    process.exit(2)
  }
  const { runCanonicalStochastic } = await import('./stochastic-runner.ts')
  const report = await runCanonicalStochastic({ endpoint, token, repetitions: Number(valueAfter('--repetitions') || 3), runId: valueAfter('--run-id') || undefined })
  console.log(JSON.stringify({ runId: report.runId, qualified: report.qualified, passed: report.passed, samples: report.samples, totalCostUsd: report.totalCostUsd }, null, 2))
  process.exit(report.qualified ? 0 : 1)
}
const caseId = valueAfter('--case')
const seed = valueAfter('--seed')
const level = valueAfter('--level')
const loop = args.includes('--loop')
const iterations = loop ? Number(process.env.DAVID_BENCHMARK_LOOP_COUNT || 2) : 1
const statuses = []
const iterationReports = []

for (let index = 0; index < iterations; index += 1) {
  const env = {
    ...process.env,
    DAVID_BENCHMARK_RUN: 'true',
    DAVID_BENCHMARK_CASE: caseId,
    DAVID_BENCHMARK_SEED: seed,
    DAVID_BENCHMARK_LEVEL: level || 'all',
    DAVID_BENCHMARK_RUN_ID: loop ? `david-eval-loop-${index + 1}-${Date.now()}` : process.env.DAVID_BENCHMARK_RUN_ID,
  }
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', 'benchmarks/david-applications/run-benchmark.test.ts'], {
    cwd: resolve(here, '../..'),
    env,
    stdio: 'inherit',
  })
  statuses.push(result.status ?? 1)
  try {
    iterationReports.push(JSON.parse(readFileSync(resolve(here, 'results/latest.json'), 'utf8')))
  } catch {
    iterationReports.push({ runId: env.DAVID_BENCHMARK_RUN_ID, results: [], artifactReadFailure: true })
  }
  if (result.status !== 0 && !loop) process.exit(result.status ?? 1)
}

if (loop) {
  const clusters = new Map()
  for (const report of iterationReports) {
    for (const item of report.results || []) {
      if (item.success) continue
      const failureClass = item.rootCauseCategory || 'unknown'
      const cluster = clusters.get(failureClass) || { failureClass, occurrences: 0, cases: new Set(), escalationReasons: new Set() }
      cluster.occurrences += 1
      cluster.cases.add(item.caseId)
      if (item.escalationReason) cluster.escalationReasons.add(item.escalationReason)
      clusters.set(failureClass, cluster)
    }
  }
  const ranked = [...clusters.values()]
    .sort((left, right) => right.occurrences - left.occurrences || left.failureClass.localeCompare(right.failureClass))
    .map((item, index) => ({ rank: index + 1, failureClass: item.failureClass, occurrences: item.occurrences, cases: [...item.cases].sort(), escalationReasons: [...item.escalationReasons].sort() }))
  const report = iterationReports.at(-1) || {}
  writeFileSync(resolve(here, 'loop-failure-ranking.json'), `${JSON.stringify({ benchmarkVersion: report.benchmarkVersion || 'david_application_eval_v1', iterations, runIds: iterationReports.map(item => item.runId), allIterationsPassed: statuses.every(status => status === 0), ranked }, null, 2)}\n`)
}

process.exit(statuses.some(status => status !== 0) ? 1 : 0)
