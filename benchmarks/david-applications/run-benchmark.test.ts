import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runFrozenSuite, startPortalServer, type BenchmarkRun, type FrozenSpec } from './harness'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const spec = JSON.parse(readFileSync(resolve(here, 'spec.json'), 'utf8')) as FrozenSpec

function envValue(name: string) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function percent(value: unknown) {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'n/a'
}

function optionalJson(path: string) {
  try { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> } catch { return null }
}

function writeArtifacts(run: BenchmarkRun) {
  const resultDir = resolve(here, 'results')
  const traceDir = resolve(here, 'traces', run.runId)
  const failureDir = resolve(here, 'failures', run.runId)
  mkdirSync(resultDir, { recursive: true })
  mkdirSync(traceDir, { recursive: true })
  mkdirSync(failureDir, { recursive: true })
  writeFileSync(resolve(resultDir, `${run.runId}.json`), `${JSON.stringify(run, null, 2)}\n`)
  writeFileSync(resolve(resultDir, 'latest.json'), `${JSON.stringify(run, null, 2)}\n`)
  writeFileSync(resolve(here, 'routing-statistics.json'), `${JSON.stringify({ benchmarkVersion: run.benchmarkVersion, runId: run.runId, codeCommit: run.codeCommit, generatedAt: run.generatedAt, ...run.routingStatistics }, null, 2)}\n`)
  const rows = run.results.map(result => ({
    benchmark_version: run.benchmarkVersion,
    run_id: run.runId,
    case_id: result.caseId,
    level: result.level,
    execution_mode: result.executionMode,
    success: result.success ? 1 : 0,
    verified_completion: result.verified ? 1 : 0,
    primitive_attempted: result.primitiveAttempted ? 1 : 0,
    primitive_success: result.primitiveSuccess ? 1 : 0,
    harness_attempted: result.harnessAttempted ? 1 : 0,
    harness_success: result.harnessSuccess ? 1 : 0,
    escalated: result.escalated ? 1 : 0,
    recovery_success: result.recoverySuccess ? 1 : 0,
    false_success: result.falseSuccess ? 1 : 0,
    duplicate_action: result.duplicateAction ? 1 : 0,
    manual_intervention: result.manualIntervention ? 1 : 0,
    retries: result.retries,
    browser_actions: result.browserActions,
    gmail_actions: result.gmailActions,
    model_calls: result.modelCalls,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    estimated_cost_usd: result.estimatedCostUsd,
    elapsed_ms: result.elapsedMs,
    root_cause_category: result.rootCauseCategory ?? '',
  }))
  const headers = Object.keys(rows[0] ?? {})
  writeFileSync(resolve(resultDir, 'latest.csv'), `${headers.join(',')}\n${rows.map(row => headers.map(header => csvCell(row[header as keyof typeof row])).join(',')).join('\n')}\n`)
  for (const result of run.results) {
    writeFileSync(resolve(traceDir, `${result.caseId}.json`), `${JSON.stringify(result.trace, null, 2)}\n`)
    if (!result.success) writeFileSync(resolve(failureDir, `${result.caseId}.json`), `${JSON.stringify(result.failureReport, null, 2)}\n`)
  }
  const regressionsPath = resolve(here, 'regressions.json')
  const existing = (() => {
    try { return JSON.parse(readFileSync(regressionsPath, 'utf8')) as Array<Record<string, unknown>> } catch { return [] }
  })()
  const next = [...existing]
  for (const result of run.results.filter(item => !item.success)) {
    const key = `${run.benchmarkVersion}:${result.caseId}:${result.rootCauseCategory ?? 'unknown'}`
    if (!next.some(item => item.key === key)) next.push({ key, caseId: result.caseId, title: result.title, source: 'frozen benchmark', firstSeenRun: run.runId, failureClass: result.rootCauseCategory, expected: result.expectedResult, reproduction: { command: `pnpm benchmark:david -- --case ${result.caseId}` } })
  }
  writeFileSync(regressionsPath, `${JSON.stringify(next, null, 2)}\n`)

  const m = run.metrics
  const comparison = (kind: 'primitive' | 'harness' | 'adaptive') => {
    const rows = kind === 'primitive' ? run.results.filter(result => result.primitiveAttempted) : kind === 'harness' ? run.results.filter(result => result.harnessAttempted) : run.results
    const successful = kind === 'primitive' ? rows.filter(result => result.primitiveSuccess) : kind === 'harness' ? rows.filter(result => result.harnessSuccess) : rows.filter(result => result.success)
    return {
      attempts: rows.length,
      successRate: rows.length ? successful.length / rows.length : null,
      averageLatencyMs: rows.length ? rows.reduce((sum, result) => sum + result.elapsedMs, 0) / rows.length : null,
      averageBrowserActions: rows.length ? rows.reduce((sum, result) => sum + result.browserActions, 0) / rows.length : null,
      retries: rows.reduce((sum, result) => sum + result.retries, 0),
      estimatedCostUsd: rows.reduce((sum, result) => sum + result.estimatedCostUsd, 0),
    }
  }
  const primitiveComparison = comparison('primitive')
  const harnessComparison = comparison('harness')
  const adaptiveComparison = comparison('adaptive')
  const connectedEmail = run.liveEmail.connectedEvaluation as Record<string, unknown> | undefined
  const connectedEmailBlockers = Array.isArray(connectedEmail?.blockedCases) ? connectedEmail.blockedCases.length : 0
  const liveEmailSummary = connectedEmail
    ? `${connectedEmail.verifiedCases ?? 0}/${connectedEmail.executedCases ?? 0} executed cases provider-verified; ${connectedEmailBlockers} alternate-sender cases blocked; ${String((connectedEmail.cleanup as Record<string, unknown> | undefined)?.messagesMatched ?? 0)} messages labeled and archived.`
    : `Not run (${String(run.liveEmail.status ?? 'no status')}).`
  const liveWebSummary = run.liveReadOnlyWeb.status === 'completed_separate_suite'
    ? `${String(run.liveReadOnlyWeb.successfulCases ?? 0)}/${String(run.liveReadOnlyWeb.totalCases ?? 0)} verified with ${String(run.liveReadOnlyWeb.writeActions ?? 0)} write actions.`
    : `Not run (${String(run.liveReadOnlyWeb.status ?? 'no status')}).`
  const pairedEvaluations = Array.isArray(run.routingStatistics.pairedEvaluations)
    ? run.routingStatistics.pairedEvaluations as Array<Record<string, unknown>>
    : []
  const pairedRows = pairedEvaluations.map(item => {
    const primitive = item.primitive as Record<string, unknown>
    const harness = item.harness as Record<string, unknown>
    return `| ${String(item.caseId)} | ${primitive.success ? 'pass' : 'fail'} / ${String(primitive.latencyMs)} ms / ${String(primitive.browserActions)} | ${harness.success ? 'pass' : 'fail'} / ${String(harness.latencyMs)} ms / ${String(harness.browserActions)} | ${String(item.adaptiveSelected)} |`
  }).join('\n') || '| — | — | — | No paired case in this run |'
  const failureRows = run.results.filter(result => !result.success).map(result => `| ${result.caseId} | ${result.rootCauseCategory ?? 'unknown'} | ${result.executionMode} | ${result.escalationReason ?? '—'} |`).join('\n') || '| — | — | — | No failures |'
  const report = `# David application benchmark — ${run.benchmarkVersion}

Run **${run.runId}** at ${run.generatedAt}; evaluated commit **${run.codeCommit}**. Frozen dataset: **${run.atomicCases} atomic cases + ${run.endToEndCases} end-to-end cases**.

## Scorecard

| Metric | Result |
|---|---:|
| Primitive success rate | ${percent(m.primitiveSuccessRate)} |
| Harness success rate | ${percent(m.harnessSuccessRate)} |
| Primitive → harness rescue rate | ${percent(m.primitiveToHarnessRescueRate)} |
| Adaptive step success rate | ${percent(m.adaptiveStepSuccessRate)} |
| End-to-end application success rate | ${percent(m.endToEndSuccessRate)} |
| Verified completion rate | ${percent(m.verifiedCompletionRate)} |
| False completion rate | ${percent(m.falseCompletionRate)} (${m.falseSuccessCount ?? 0}) |
| Duplicate-action rate | ${percent(m.duplicateActionRate)} (${m.duplicateActionCount ?? 0}) |
| Manual intervention rate | ${percent(m.manualInterventionRate)} |
| Recovery success rate | ${percent(m.recoverySuccessRate)} |
| Cross-case contamination rate | ${percent(m.crossCaseContaminationRate)} |
| Average cost / completed application | $${Number(m.averageCostPerCompletedApplicationUsd ?? 0).toFixed(6)} |
| Average time / completed application | ${Number(m.averageTimePerCompletedApplicationMs ?? 0).toFixed(0)} ms |

## Primitive, harness, and adaptive comparison

| Path | Attempts | Success | Avg latency | Avg browser actions | Retries | Model cost |
|---|---:|---:|---:|---:|---:|---:|
| Primitive | ${primitiveComparison.attempts} | ${percent(primitiveComparison.successRate)} | ${Number(primitiveComparison.averageLatencyMs ?? 0).toFixed(0)} ms | ${Number(primitiveComparison.averageBrowserActions ?? 0).toFixed(1)} | ${primitiveComparison.retries} | $${primitiveComparison.estimatedCostUsd.toFixed(6)} |
| Harness | ${harnessComparison.attempts} | ${percent(harnessComparison.successRate)} | ${Number(harnessComparison.averageLatencyMs ?? 0).toFixed(0)} ms | ${Number(harnessComparison.averageBrowserActions ?? 0).toFixed(1)} | ${harnessComparison.retries} | $${harnessComparison.estimatedCostUsd.toFixed(6)} |
| Adaptive outcome | ${adaptiveComparison.attempts} | ${percent(adaptiveComparison.successRate)} | ${Number(adaptiveComparison.averageLatencyMs ?? 0).toFixed(0)} ms | ${Number(adaptiveComparison.averageBrowserActions ?? 0).toFixed(1)} | ${adaptiveComparison.retries} | $${adaptiveComparison.estimatedCostUsd.toFixed(6)} |

Controlled paired evaluation values are shown as success / latency / browser actions.

| Case | Primitive | Harness | Adaptive choice |
|---|---:|---:|---|
${pairedRows}

## Failures and regression corpus

| Case | Primary failure class | Mode | Escalation / suspected cause |
|---|---|---|---|
${failureRows}

Every failed case is written to \`failures/${run.runId}/\` and added to the versioned regression corpus. Frozen definitions are never rewritten by the runner.

## Execution accounting

- Browser actions: ${m.browserActions ?? 0}
- Gmail fixture actions: ${m.gmailActions ?? 0}
- Primitive success / failure: ${m.primitiveSuccessCount ?? 0} / ${m.primitiveFailureCount ?? 0}
- Harness success / failure: ${m.harnessSuccessCount ?? 0} / ${m.harnessFailureCount ?? 0}
- Escalations / rescued: ${m.escalationCount ?? 0} / ${m.escalationSuccessCount ?? 0}
- Manual interventions / retries: ${m.manualInterventionCount ?? 0} / ${m.retryCount ?? 0}
- Model calls / tokens / measured model cost: ${m.modelCalls ?? 0} / ${m.inputTokens ?? 0} / ${m.outputTokens ?? 0} / $${Number(m.estimatedModelCostUsd ?? 0).toFixed(6)}
- Deterministic Gmail fixture messages: ${String(run.liveEmail.messagesInDeterministicFixture ?? 0)}
- Connected Gmail evaluation: ${liveEmailSummary}
- Separate live read-only web set: ${liveWebSummary}
`
  writeFileSync(resolve(here, 'report.md'), report)
}

async function execute() {
  process.env.SHOTCOUNT_BENCHMARK_MODE = 'true'
  const selectedCase = envValue('DAVID_BENCHMARK_CASE')
  const level = (envValue('DAVID_BENCHMARK_LEVEL') as 'atomic' | 'end_to_end' | 'all' | undefined) ?? 'all'
  const seedValue = envValue('DAVID_BENCHMARK_SEED')
  const seedOverride = seedValue ? Number(seedValue) : undefined
  const runId = envValue('DAVID_BENCHMARK_RUN_ID') ?? `david-eval-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(16).slice(2, 8)}`
  const codeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const portal = await startPortalServer()
  try {
    const run = await runFrozenSuite(spec, { runId, codeCommit, port: portal.port, selectedCase, seedOverride: Number.isFinite(seedOverride) ? seedOverride : undefined, level })
    const liveWeb = optionalJson(resolve(here, 'results/live-web-latest.json'))
    const liveGmail = optionalJson(resolve(here, 'results/live-gmail-latest.json'))
    if (liveWeb) run.liveReadOnlyWeb = { status: 'completed_separate_suite', ...liveWeb }
    if (liveGmail) {
      run.liveEmail = { ...run.liveEmail, connectedEvaluation: liveGmail }
      const blockedCases = Array.isArray(liveGmail.blockedCases) ? liveGmail.blockedCases as Array<Record<string, unknown>> : []
      run.blockers.push(...blockedCases.map(item => `${String(item.caseId ?? 'connected Gmail case')}: ${String(item.reason ?? 'external connector limitation')}`))
    }
    writeArtifacts(run)
    return run
  } finally {
    portal.cleanup()
  }
}

const enabled = process.env.DAVID_BENCHMARK_RUN === 'true'

describe.skipIf(!enabled)('david_application_eval_v1', () => {
  it('runs the frozen benchmark with independent evidence checks', async () => {
    const run = await execute()
    expect(run.benchmarkVersion).toBe('david_application_eval_v1')
    if (!process.env.DAVID_BENCHMARK_CASE && (process.env.DAVID_BENCHMARK_LEVEL ?? 'all') === 'all') {
      expect(run.atomicCases + run.endToEndCases).toBeGreaterThanOrEqual(50)
    }
    const failures = run.results.filter(result => !result.success)
    expect(failures, failures.map(result => `${result.caseId}: ${result.rootCauseCategory} ${result.escalationReason ?? ''}`).join('\n')).toHaveLength(0)
  }, 900_000)
})

export { execute as runBenchmarkCommand }
