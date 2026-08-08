import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DAVID_PRODUCTION_MODEL_CONFIG,
  davidAgentInstructions,
} from '../../supabase/functions/_shared/david-agent-config'
import { startPortalServer } from '../david-applications/harness'
import { DavidV2ModelClient, addUsage, outputText, type OpenAIResponse } from './model-client'
import {
  StochasticApplicationRuntime,
} from './runtime'
import type {
  ApplicantFixture,
  BenchmarkCase,
  BenchmarkMetrics,
  BenchmarkOracles,
  BenchmarkResult,
  BenchmarkSpec,
  ConfidenceInterval,
  DimensionName,
  DimensionScores,
  ModelConfiguration,
  RootCause,
  StochasticRunResult,
  TraceEvent,
  Usage,
} from './types'

const here = resolve(import.meta.dirname)
const root = resolve(here, '../..')

const zeroUsage = (): Usage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  inferenceCostUsd: 0,
})

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function numericSeed(value: string) {
  return Number.parseInt(hash(value).slice(0, 8), 16) >>> 0
}

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(resolve(here, filename), 'utf8')) as T
}

function loadApplicant(id: string) {
  const filename = id
    .replace(/^applicant-/, '')
    .replace('electrical-engineering', 'electrical-engineering')
  const candidates = [
    resolve(here, 'applicants', `${filename}.json`),
    resolve(here, 'applicants', `${id}.json`),
  ]
  const path = candidates.find(candidate => {
    try { readFileSync(candidate); return true } catch { return false }
  })
  if (!path) throw new Error(`Applicant fixture ${id} was not found.`)
  return JSON.parse(readFileSync(path, 'utf8')) as ApplicantFixture
}

function benchmarkCases(spec: BenchmarkSpec): BenchmarkCase[] {
  return [
    ...spec.atomicCases.map(item => ({ ...item, level: 'atomic' as const })),
    ...spec.endToEndCases.map(item => ({
      ...item,
      level: 'end_to_end' as const,
      category: 'end_to_end',
      terminalPolicy: 'ready_for_final_review',
    })),
  ]
}

function responseFunctionCalls(response: OpenAIResponse) {
  return (response.output ?? []).filter(item => item.type === 'function_call' && item.call_id && item.name)
}

function conciseTrace(trace: TraceEvent[]) {
  return trace.map(event => {
    if (event.kind === 'model') {
      const response = event.output as OpenAIResponse | undefined
      return {
        kind: event.kind,
        name: event.name,
        elapsedMs: event.elapsedMs,
        usage: event.usage,
        outputText: response ? outputText(response).slice(0, 4_000) : '',
        outputItems: (response?.output ?? []).map(item => ({
          type: item.type,
          name: item.name,
          arguments: item.arguments,
          text: item.content?.map(content => content.text ?? '').join('\n').slice(0, 2_000),
        })),
      }
    }
    return {
      kind: event.kind,
      name: event.name,
      input: event.input,
      output: event.output,
      error: event.error,
    }
  })
}

function parseGrade(response: OpenAIResponse) {
  const text = outputText(response)
  try {
    return JSON.parse(text) as {
      dimensions: DimensionScores
      fabricatedApplicantFact: boolean
      falseCompletion: boolean
      inappropriateUserQuestions: number
      missingNecessaryUserQuestions: number
      rootCause: RootCause | null
      issues: string[]
      rationale: string
    }
  } catch {
    return null
  }
}

function mergedScores(deterministic: DimensionScores, model: DimensionScores | undefined) {
  const merged = { ...deterministic }
  if (!model) return merged
  for (const name of Object.keys(merged) as DimensionName[]) {
    const modelValue = Math.max(0, Math.min(1, Number(model[name] ?? 0)))
    if (name === 'applicant_fact_correctness' || name === 'final_task_completion') merged[name] = Math.min(merged[name], modelValue)
    else merged[name] = Number(((merged[name] + modelValue) / 2).toFixed(4))
  }
  return merged
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function wilson(successes: number, samples: number): ConfidenceInterval {
  if (!samples) return { successes, samples, rate: null, lower95: null, upper95: null }
  const z = 1.959963984540054
  const rate = successes / samples
  const denominator = 1 + z ** 2 / samples
  const centre = (rate + z ** 2 / (2 * samples)) / denominator
  const margin = z * Math.sqrt((rate * (1 - rate) + z ** 2 / (4 * samples)) / samples) / denominator
  return { successes, samples, rate, lower95: Math.max(0, centre - margin), upper95: Math.min(1, centre + margin) }
}

function passAt(results: StochasticRunResult[], repetition: number, level?: 'end_to_end') {
  const byCase = new Map<string, StochasticRunResult[]>()
  for (const result of results.filter(item => !level || item.level === level)) {
    const rows = byCase.get(result.caseId) ?? []
    rows.push(result)
    byCase.set(result.caseId, rows)
  }
  const cases = [...byCase.values()].filter(rows => repetition === 1 || rows.length >= repetition)
  if (!cases.length) return null
  if (repetition === 1) return cases.filter(rows => rows.find(item => item.repetition === 1)?.success).length / cases.length
  return cases.filter(rows => rows.filter(item => item.repetition <= repetition).some(item => item.success)).length / cases.length
}

function passAtSampleCount(results: StochasticRunResult[], repetition: number, level?: 'end_to_end') {
  const byCase = new Map<string, number>()
  for (const result of results.filter(item => !level || item.level === level)) {
    byCase.set(result.caseId, Number(byCase.get(result.caseId) ?? 0) + 1)
  }
  return [...byCase.values()].filter(count => count >= repetition).length
}

function modelConfiguration(codeCommit: string): ModelConfiguration {
  return {
    requestedModel: DAVID_PRODUCTION_MODEL_CONFIG.model,
    observedModels: [],
    reasoningEffort: DAVID_PRODUCTION_MODEL_CONFIG.reasoning.effort,
    temperature: DAVID_PRODUCTION_MODEL_CONFIG.temperature,
    systemPromptVersion: DAVID_PRODUCTION_MODEL_CONFIG.systemPromptVersion,
    systemPromptSha256: hash(davidAgentInstructions()),
    davidPromptVersion: DAVID_PRODUCTION_MODEL_CONFIG.davidPromptVersion,
    harnessVersion: DAVID_PRODUCTION_MODEL_CONFIG.harnessVersion,
    primitiveVersion: DAVID_PRODUCTION_MODEL_CONFIG.primitiveVersion,
    codeCommit,
  }
}

async function runOne(input: {
  benchmarkCase: BenchmarkCase
  spec: BenchmarkSpec
  oracles: BenchmarkOracles
  repetition: number
  portalPort: number
  endpoint: string
  token: string
  codeCommit: string
  runGroupId: string
  seedOverride?: number
}) {
  const started = Date.now()
  const trace: TraceEvent[] = []
  const seed = input.seedOverride ?? numericSeed(`${input.runGroupId}:${input.benchmarkCase.id}:${input.repetition}`)
  const runId = `david-v2-${input.benchmarkCase.id}-${input.repetition}-${hash(`${seed}`).slice(0, 8)}`.slice(0, 128)
  const applicant = loadApplicant(input.benchmarkCase.applicantId)
  const profileOracle = input.oracles.profiles[input.benchmarkCase.applicantId]
  const caseOracle = input.oracles.cases[input.benchmarkCase.id] ?? {}
  const programme = input.spec.programmes[input.benchmarkCase.programmeId]
  if (!profileOracle || !programme) throw new Error(`Case ${input.benchmarkCase.id} has an invalid fixture reference.`)
  const runtime = new StochasticApplicationRuntime({
    benchmarkCase: input.benchmarkCase,
    applicant,
    profileOracle,
    caseOracle,
    programme,
    programmes: input.spec.programmes,
    seed,
    repetition: input.repetition,
    portalPort: input.portalPort,
    trace,
  })
  const client = new DavidV2ModelClient({
    endpoint: input.endpoint,
    token: input.token,
    benchmarkVersion: input.spec.benchmarkVersion,
    runId,
    trace,
  })
  const history: Array<Record<string, unknown>> = [{
    role: 'user',
    content: [{ type: 'input_text', text: JSON.stringify(runtime.initialTaskInput()) }],
  }]
  const maxTurns = input.benchmarkCase.id === 'e2e-five-application-campaign'
    ? 120
    : input.benchmarkCase.level === 'end_to_end'
      ? 72
      : 28
  let emptyTurns = 0
  try {
    for (let turn = 0; turn < maxTurns && !runtime.stopped; turn += 1) {
      const response = await client.call('agent', history, Boolean(input.benchmarkCase.enableWebSearch))
      const output = (response.output ?? []) as Array<Record<string, unknown>>
      runtime.recordBuiltInOutput(output)
      history.push(...output)
      const calls = responseFunctionCalls(response)
      if (!calls.length) {
        emptyTurns += 1
        if (emptyTurns >= 2) {
          runtime.failureReasons.push('The model stopped without invoking verified completion or a required context boundary.')
          runtime.rootCause ??= 'model_reasoning'
          break
        }
        history.push({
          role: 'user',
          content: [{
            type: 'input_text',
            text: 'Continue the same task. Use the available tools and do not claim completion until the required evidence is verified.',
          }],
        })
        continue
      }
      emptyTurns = 0
      for (const call of calls) {
        const result = await runtime.execute(call.name, call.arguments)
        history.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) })
        if (runtime.stopped) break
      }
    }
  } catch (error) {
    runtime.failureReasons.push(error instanceof Error ? error.message : String(error))
    runtime.rootCause ??= 'external_service'
  }
  if (!runtime.stopped && !runtime.failureReasons.length) {
    runtime.failureReasons.push(`The run reached its ${maxTurns}-turn safety limit.`)
    runtime.rootCause ??= 'model_reasoning'
  }

  const deterministic = runtime.deterministicScores()
  let grade: ReturnType<typeof parseGrade> = null
  try {
    const graderInput = [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: JSON.stringify({
          benchmarkCase: {
            id: input.benchmarkCase.id,
            level: input.benchmarkCase.level,
            category: input.benchmarkCase.category,
            objective: input.benchmarkCase.objective,
            terminalPolicy: input.benchmarkCase.terminalPolicy,
          },
          applicantMaterials: applicant.sourceMaterials,
          programmeContext: programme,
          hiddenOracle: { profile: profileOracle, case: caseOracle },
          deterministicSignals: {
            verifiedCompletion: runtime.verifiedCompletion,
            falseCompletion: runtime.falseCompletion,
            hallucinatedFacts: runtime.hallucinatedFacts,
            crossCaseContamination: runtime.crossCaseContamination,
            checkpoints: [...runtime.checkpoints],
            sourceUrls: [...runtime.observedSourceUrls],
            tools: [...runtime.observedToolNames],
            artifacts: [...runtime.artifacts.values()],
          },
          trace: conciseTrace(trace),
        }),
      }],
    }]
    grade = parseGrade(await client.call('grader', graderInput))
    if (!grade) {
      runtime.failureReasons.push('The independent evaluator returned invalid structured output.')
      runtime.rootCause ??= 'external_service'
    }
  } catch (error) {
    runtime.failureReasons.push(`Independent evaluator failed: ${error instanceof Error ? error.message : String(error)}`)
    runtime.rootCause ??= 'external_service'
  }

  const dimensions = mergedScores(deterministic, grade?.dimensions)
  const fabricatedApplicantFact = runtime.hallucinatedFacts.length > 0 || Boolean(grade?.fabricatedApplicantFact)
  const falseCompletion = runtime.falseCompletion || Boolean(grade?.falseCompletion)
  const inappropriateUserQuestions = runtime.inappropriateUserQuestions + Number(grade?.inappropriateUserQuestions ?? 0)
  const missingNecessaryUserQuestions = Math.max(runtime.missingNecessaryUserQuestions, Number(grade?.missingNecessaryUserQuestions ?? 0))
  const applicableScore = average(runtime.applicableDimensions.map(name => dimensions[name])) ?? 0
  const hardFailure = fabricatedApplicantFact || falseCompletion || runtime.crossCaseContamination
  const success = runtime.verifiedCompletion && !hardFailure && Boolean(grade) &&
    applicableScore >= 0.75 &&
    dimensions.applicant_fact_correctness >= 0.75 &&
    dimensions.final_task_completion >= 0.75
  if (!success && grade?.issues?.length) runtime.failureReasons.push(...grade.issues.filter(issue => !runtime.failureReasons.includes(issue)))
  const configuration = modelConfiguration(input.codeCommit)
  configuration.observedModels = [...client.observedModels].sort()
  return {
    benchmarkVersion: input.spec.benchmarkVersion,
    runId,
    caseId: input.benchmarkCase.id,
    level: input.benchmarkCase.level,
    category: input.benchmarkCase.category,
    repetition: input.repetition,
    seed,
    success,
    verifiedCompletion: runtime.verifiedCompletion,
    falseCompletion,
    fabricatedApplicantFact,
    hallucinatedFacts: runtime.hallucinatedFacts,
    inappropriateUserQuestions,
    missingNecessaryUserQuestions,
    primitiveAttempts: runtime.primitiveAttempts,
    primitiveSuccesses: runtime.primitiveSuccesses,
    harnessAttempts: runtime.harnessAttempts,
    harnessSuccesses: runtime.harnessSuccesses,
    rescueAttempts: runtime.rescueAttempts,
    rescueSuccesses: runtime.rescueSuccesses,
    retries: runtime.retries + client.providerRetries,
    interventions: runtime.interventions,
    browserActions: runtime.browserActions,
    crossCaseContamination: runtime.crossCaseContamination,
    dimensions,
    applicableDimensions: runtime.applicableDimensions,
    rootCause: success ? null : (runtime.rootCause ?? grade?.rootCause ?? 'model_reasoning'),
    failureReasons: success ? [] : runtime.failureReasons,
    modelCalls: client.modelCalls,
    graderCalls: client.graderCalls,
    usage: client.usage,
    elapsedMs: Date.now() - started,
    modelConfiguration: configuration,
    terminalSummary: runtime.terminalSummary,
    trace,
  } satisfies StochasticRunResult
}

function metrics(results: StochasticRunResult[]): BenchmarkMetrics {
  const cases = new Set(results.map(item => item.caseId))
  const firstRuns = results.filter(item => item.repetition === 1)
  const runSuccesses = results.filter(item => item.success).length
  const firstSuccesses = firstRuns.filter(item => item.success).length
  const totals = results.reduce((usage, item) => addUsage(usage, item.usage), zeroUsage())
  const rootCauses: Partial<Record<RootCause, number>> = {}
  for (const result of results.filter(item => !item.success && item.rootCause)) {
    rootCauses[result.rootCause!] = Number(rootCauses[result.rootCause!] ?? 0) + 1
  }
  const primitiveAttempts = results.reduce((sum, item) => sum + item.primitiveAttempts, 0)
  const primitiveSuccesses = results.reduce((sum, item) => sum + item.primitiveSuccesses, 0)
  const rescueAttempts = results.reduce((sum, item) => sum + item.rescueAttempts, 0)
  const rescueSuccesses = results.reduce((sum, item) => sum + item.rescueSuccesses, 0)
  return {
    caseCount: cases.size,
    stochasticRuns: results.length,
    passAt1: passAt(results, 1),
    passAt3: passAt(results, 3),
    passAt3CaseCount: passAtSampleCount(results, 3),
    endToEndPassAt1: passAt(results, 1, 'end_to_end'),
    endToEndPassAt3: passAt(results, 3, 'end_to_end'),
    endToEndPassAt3CaseCount: passAtSampleCount(results, 3, 'end_to_end'),
    verifiedCompletionRate: average(results.map(item => item.verifiedCompletion ? 1 : 0)),
    hallucinationRate: average(results.map(item => item.fabricatedApplicantFact ? 1 : 0)),
    falseCompletionRate: average(results.map(item => item.falseCompletion ? 1 : 0)),
    primitiveSuccessRate: primitiveAttempts ? primitiveSuccesses / primitiveAttempts : null,
    harnessRescueRate: rescueAttempts ? rescueSuccesses / rescueAttempts : null,
    averageInterventions: average(results.map(item => item.interventions)),
    totalInferenceCostUsd: totals.inferenceCostUsd,
    averageLatencyMs: average(results.map(item => item.elapsedMs)),
    totalModelCalls: results.reduce((sum, item) => sum + item.modelCalls + item.graderCalls, 0),
    totalInputTokens: totals.inputTokens,
    totalOutputTokens: totals.outputTokens,
    passAt1Interval: wilson(firstSuccesses, firstRuns.length),
    runPassInterval: wilson(runSuccesses, results.length),
    failuresByRootCause: rootCauses,
  }
}

function v1Summary() {
  const latest = loadJson<Record<string, unknown>>('../david-applications/results/latest.json')
  const metric = latest.metrics as Record<string, unknown> | undefined
  const atomicCases = Number(latest.atomicCases ?? 0)
  const endToEndCases = Number(latest.endToEndCases ?? 0)
  const successRate = Number(metric?.adaptiveStepSuccessRate ?? 0)
  const unchanged = (() => {
    try {
      execFileSync('git', [
        'diff', '--quiet', '64cd1fb57f0c20d879f9eb659a302ec48edc18a6', '--',
        'benchmarks/david-applications/spec.json',
        'benchmarks/david-applications/harness.ts',
        'benchmarks/david-applications/run-benchmark.test.ts',
        'benchmarks/david-applications/failure-seeds.json',
      ], { cwd: root, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()
  return {
    benchmarkVersion: 'david_application_eval_v1' as const,
    evaluatedCommit: String(latest.codeCommit ?? ''),
    atomicCases,
    endToEndCases,
    successRate,
    unchanged,
  }
}

function writeCsv(path: string, results: StochasticRunResult[]) {
  const headers = ['case_id', 'level', 'category', 'repetition', 'success', 'verified_completion', 'false_completion', 'fabricated_fact', 'root_cause', 'model_calls', 'input_tokens', 'output_tokens', 'inference_cost_usd', 'elapsed_ms']
  const rows = results.map(item => [
    item.caseId,
    item.level,
    item.category,
    item.repetition,
    item.success ? 1 : 0,
    item.verifiedCompletion ? 1 : 0,
    item.falseCompletion ? 1 : 0,
    item.fabricatedApplicantFact ? 1 : 0,
    item.rootCause ?? '',
    item.modelCalls + item.graderCalls,
    item.usage.inputTokens,
    item.usage.outputTokens,
    item.usage.inferenceCostUsd.toFixed(8),
    item.elapsedMs,
  ])
  const cell = (value: unknown) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  writeFileSync(path, `${headers.join(',')}\n${rows.map(row => row.map(cell).join(',')).join('\n')}\n`)
}

function percent(value: number | null) {
  return value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

function writeReport(result: BenchmarkResult) {
  const m = result.metrics
  const roots = Object.entries(m.failuresByRootCause).sort((a, b) => b[1] - a[1])
  const rootRows = roots.length ? roots.map(([rootCause, count]) => `| ${rootCause} | ${count} |`).join('\n') : '| — | 0 |'
  const failures = result.results.filter(item => !item.success)
  const failureRows = failures.length
    ? failures.map(item => `| ${item.caseId} | ${item.repetition} | ${item.rootCause ?? 'unknown'} | ${item.failureReasons.join('; ').replaceAll('|', '\\|').slice(0, 500)} |`).join('\n')
    : '| — | — | — | No failures |'
  const report = `# David application evaluation

## V1 — Systems Reliability

- Benchmark: \`${result.v1.benchmarkVersion}\`
- Frozen cases: ${result.v1.atomicCases} atomic + ${result.v1.endToEndCases} end-to-end
- Adaptive success: ${percent(result.v1.successRate)}
- Frozen definitions unchanged: ${result.v1.unchanged ? 'yes' : 'no'}

## V2 — Intelligence + Execution

Run group **${result.runGroupId}** at ${result.generatedAt}; evaluated commit **${result.codeCommit}**.

| Metric | Result |
|---|---:|
| Cases | ${m.caseCount} |
| Stochastic runs | ${m.stochasticRuns} |
| pass@1 | ${percent(m.passAt1)} |
| pass@3 | ${percent(m.passAt3)} |
| Cases sampled for pass@3 | ${m.passAt3CaseCount} |
| E2E pass@1 | ${percent(m.endToEndPassAt1)} |
| E2E pass@3 | ${percent(m.endToEndPassAt3)} |
| E2E cases sampled for pass@3 | ${m.endToEndPassAt3CaseCount} |
| Verified completion | ${percent(m.verifiedCompletionRate)} |
| Hallucinated applicant facts | ${percent(m.hallucinationRate)} |
| False completion | ${percent(m.falseCompletionRate)} |
| Primitive success | ${percent(m.primitiveSuccessRate)} |
| Harness rescue | ${percent(m.harnessRescueRate)} |
| Average interventions | ${m.averageInterventions?.toFixed(2) ?? 'n/a'} |
| Actual measured inference cost | $${m.totalInferenceCostUsd.toFixed(6)} |
| Average latency | ${m.averageLatencyMs?.toFixed(0) ?? 'n/a'} ms |
| Model + grader calls | ${m.totalModelCalls} |
| Input / output tokens | ${m.totalInputTokens} / ${m.totalOutputTokens} |

pass@1 95% Wilson interval: ${percent(m.passAt1Interval.lower95)}–${percent(m.passAt1Interval.upper95)} (${m.passAt1Interval.successes}/${m.passAt1Interval.samples}). Run-level interval: ${percent(m.runPassInterval.lower95)}–${percent(m.runPassInterval.upper95)}.

### Model configuration

- Requested model: \`${result.modelConfiguration.requestedModel}\`
- Observed response model(s): ${result.modelConfiguration.observedModels.map(model => `\`${model}\``).join(', ') || 'not returned'}
- Reasoning effort: \`${result.modelConfiguration.reasoningEffort}\`
- Temperature: ${result.modelConfiguration.temperature == null ? 'not set (provider default)' : result.modelConfiguration.temperature}
- System prompt: \`${result.modelConfiguration.systemPromptVersion}\` / \`${result.modelConfiguration.systemPromptSha256}\`
- David prompt: \`${result.modelConfiguration.davidPromptVersion}\`
- Harness / primitive: \`${result.modelConfiguration.harnessVersion}\` / \`${result.modelConfiguration.primitiveVersion}\`

### Failures by root cause

| Root cause | Runs |
|---|---:|
${rootRows}

### Failed stochastic samples

| Case | Repetition | Root cause | Evidence-backed reason |
|---|---:|---|---|
${failureRows}

V1 and V2 scores are deliberately separate. V1 remains the deterministic regression gate; V2 is a stochastic model-and-execution measurement.
`
  writeFileSync(resolve(here, 'report.md'), report)
}

function writeArtifacts(result: BenchmarkResult) {
  const resultDir = resolve(here, 'results')
  const traceDir = resolve(here, 'traces', result.runGroupId)
  const failureDir = resolve(here, 'failures', result.runGroupId)
  mkdirSync(resultDir, { recursive: true })
  mkdirSync(traceDir, { recursive: true })
  mkdirSync(failureDir, { recursive: true })
  writeFileSync(resolve(resultDir, `${result.runGroupId}.json`), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(resolve(resultDir, 'latest.json'), `${JSON.stringify(result, null, 2)}\n`)
  writeCsv(resolve(resultDir, 'latest.csv'), result.results)
  for (const item of result.results) {
    const filename = `${item.caseId}-r${item.repetition}.json`
    writeFileSync(resolve(traceDir, filename), `${JSON.stringify(item, null, 2)}\n`)
    if (!item.success) writeFileSync(resolve(failureDir, filename), `${JSON.stringify({
      benchmarkVersion: item.benchmarkVersion,
      runId: item.runId,
      caseId: item.caseId,
      repetition: item.repetition,
      seed: item.seed,
      rootCause: item.rootCause,
      failureReasons: item.failureReasons,
      command: `pnpm benchmark:david:v2 -- --case ${item.caseId} --repetitions 1 --seed ${item.seed}`,
      trace: `traces/${result.runGroupId}/${filename}`,
    }, null, 2)}\n`)
  }
  const regressionPath = resolve(here, 'regressions.json')
  const existing = (() => {
    try { return JSON.parse(readFileSync(regressionPath, 'utf8')) as Array<Record<string, unknown>> } catch { return [] }
  })()
  const next = [...existing]
  for (const item of result.results.filter(row => !row.success)) {
    const key = `${item.caseId}:${item.rootCause ?? 'unknown'}`
    if (!next.some(row => row.key === key)) next.push({
      key,
      caseId: item.caseId,
      failureClass: item.rootCause,
      firstSeenRun: item.runId,
      smallestReproduction: `pnpm benchmark:david:v2 -- --case ${item.caseId} --repetitions 1 --seed ${item.seed}`,
      source: 'david_application_eval_v2',
    })
  }
  writeFileSync(regressionPath, `${JSON.stringify(next, null, 2)}\n`)
  writeReport(result)
}

export async function runV2Benchmark(input: {
  endpoint: string
  token: string
  repetitions?: number
  atomicRepetitions?: number
  endToEndRepetitions?: number
  selectedCase?: string
  selectedLevel?: 'atomic' | 'end_to_end'
  seedOverride?: number
  runGroupId?: string
  concurrency?: number
}) {
  process.env.SHOTCOUNT_BENCHMARK_MODE = 'true'
  const spec = loadJson<BenchmarkSpec>('spec.json')
  const oracles = loadJson<BenchmarkOracles>('oracles.json')
  const codeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const boundedRepetitions = (value: number | undefined) => Math.max(1, Math.min(5, Number(value ?? spec.defaultRepetitions)))
  const repetitions = boundedRepetitions(input.repetitions)
  const atomicRepetitions = boundedRepetitions(input.atomicRepetitions ?? repetitions)
  const endToEndRepetitions = boundedRepetitions(input.endToEndRepetitions ?? repetitions)
  const allCases = benchmarkCases(spec)
  const selected = allCases.filter(item =>
    (!input.selectedCase || item.id === input.selectedCase) &&
    (!input.selectedLevel || item.level === input.selectedLevel),
  )
  if (!selected.length) throw new Error(`Unknown v2 benchmark case: ${input.selectedCase}`)
  if (!input.selectedCase && allCases.filter(item => item.level === 'end_to_end').length < spec.minimumEndToEndCases) {
    throw new Error('V2 must contain at least ten end-to-end cases.')
  }
  const runGroupId = input.runGroupId ?? `david-v2-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${hash(String(Math.random())).slice(0, 8)}`
  const portal = await startPortalServer()
  const work = selected.flatMap(benchmarkCase => Array.from({
    length: benchmarkCase.level === 'end_to_end' ? endToEndRepetitions : atomicRepetitions,
  }, (_, index) => ({ benchmarkCase, repetition: index + 1 })))
  const results: StochasticRunResult[] = []
  const concurrency = Math.max(1, Math.min(4, Number(input.concurrency ?? 2)))
  let cursor = 0
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, work.length) }, async () => {
      while (cursor < work.length) {
        const index = cursor
        cursor += 1
        const item = work[index]!
        const result = await runOne({
          ...item,
          spec,
          oracles,
          portalPort: portal.port,
          endpoint: input.endpoint,
          token: input.token,
          codeCommit,
          runGroupId: input.seedOverride == null ? runGroupId : `${runGroupId}-${input.seedOverride}`,
          seedOverride: input.seedOverride == null ? undefined : input.seedOverride + item.repetition - 1,
        })
        results.push(result)
      }
    }))
  } finally {
    portal.cleanup()
  }
  results.sort((left, right) => left.caseId.localeCompare(right.caseId) || left.repetition - right.repetition)
  const configuration = modelConfiguration(codeCommit)
  configuration.observedModels = [...new Set(results.flatMap(item => item.modelConfiguration.observedModels))].sort()
  const result: BenchmarkResult = {
    benchmarkVersion: spec.benchmarkVersion,
    label: 'V2 — Intelligence + Execution',
    generatedAt: new Date().toISOString(),
    codeCommit,
    runGroupId,
    repetitions: Math.max(atomicRepetitions, endToEndRepetitions),
    repetitionsByLevel: { atomic: atomicRepetitions, endToEnd: endToEndRepetitions },
    selectedCase: input.selectedCase ?? null,
    selectedLevel: input.selectedLevel ?? null,
    modelConfiguration: configuration,
    metrics: metrics(results),
    results,
    v1: v1Summary(),
  }
  writeArtifacts(result)
  return result
}

export const testing = { wilson, passAt, metrics, benchmarkCases, mergedScores }
