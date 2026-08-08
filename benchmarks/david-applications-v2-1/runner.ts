import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { startPortalServer } from '../david-applications/harness'
import { DavidV2ModelClient, type OpenAIResponse } from '../david-applications-v2/model-client'
import type { BenchmarkOracles, BenchmarkSpec, StochasticRunResult, TraceEvent, Usage } from '../david-applications-v2/types'
import { ApplicationRuntimeV21 } from './runtime'

const here = resolve(import.meta.dirname)
const root = resolve(here, '../..')
const source = resolve(here, '../david-applications-v2')
const manifest = JSON.parse(readFileSync(resolve(here, 'frozen-cases.json'), 'utf8')) as { repetitions: number; cases: Array<{ id: string }> }
const spec = JSON.parse(readFileSync(resolve(source, 'spec.json'), 'utf8')) as BenchmarkSpec
const oracles = JSON.parse(readFileSync(resolve(source, 'oracles.json'), 'utf8')) as BenchmarkOracles

function hash(value: string) { return createHash('sha256').update(value).digest('hex') }
function seed(value: string) { return Number.parseInt(hash(value).slice(0, 8), 16) >>> 0 }
function loadApplicant(id: string) {
  const filename = id.replace(/^applicant-/, '')
  return JSON.parse(readFileSync(resolve(source, 'applicants', `${filename}.json`), 'utf8'))
}
function calls(response: OpenAIResponse) {
  return (response.output ?? []).filter(item => item.type === 'function_call').map(item => ({ name: String(item.name ?? ''), callId: String(item.call_id ?? ''), arguments: item.arguments as string | undefined }))
}
function zeroUsage(): Usage { return { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, inferenceCostUsd: 0 } }

async function runOne(input: { caseId: string; repetition: number; endpoint: string; token: string; portalPort: number; runGroupId: string; codeCommit: string }) {
  const benchmarkCaseSource = spec.endToEndCases.find(item => item.id === input.caseId)
  if (!benchmarkCaseSource) throw new Error(`Frozen case ${input.caseId} is absent from the immutable v2 spec.`)
  const benchmarkCase = { ...benchmarkCaseSource, level: 'end_to_end' as const, category: 'end_to_end', terminalPolicy: 'ready_for_final_review' }
  const trace: TraceEvent[] = []
  const numericSeed = seed(`${input.runGroupId}:${input.caseId}:${input.repetition}`)
  const runtime = new ApplicationRuntimeV21({
    benchmarkCase,
    applicant: loadApplicant(benchmarkCase.applicantId),
    profileOracle: oracles.profiles[benchmarkCase.applicantId]!,
    caseOracle: oracles.cases[input.caseId] ?? {},
    programme: spec.programmes[benchmarkCase.programmeId]!,
    programmes: spec.programmes,
    seed: numericSeed,
    repetition: input.repetition,
    portalPort: input.portalPort,
    trace,
  })
  const client = new DavidV2ModelClient({ endpoint: input.endpoint, token: input.token, benchmarkVersion: 'david_application_eval_v2_1', runId: `david-v21-${input.caseId}-${input.repetition}-${hash(String(numericSeed)).slice(0, 8)}`, trace })
  const initial = { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(runtime.initialTaskInput()) }] }
  const turns: Array<Array<Record<string, unknown>>> = []
  const maximumTurns = input.caseId === 'e2e-five-application-campaign' ? 140 : 64
  let emptyTurns = 0
  const started = Date.now()
  try {
    for (let turn = 0; turn < maximumTurns && !runtime.base.stopped; turn += 1) {
      const context = { role: 'user', content: [{ type: 'input_text', text: `AUTHORITATIVE_APPLICATION_CONTEXT_V2_1\n${JSON.stringify(runtime.authoritativeContext())}` }] }
      const history = [initial, ...turns.slice(-8).flat(), context]
      const response = await client.call('agent', history, Boolean(benchmarkCase.enableWebSearch))
      const output = (response.output ?? []) as Array<Record<string, unknown>>
      runtime.base.recordBuiltInOutput(output)
      const currentTurn: Array<Record<string, unknown>> = [...output]
      const functionCalls = calls(response)
      if (!functionCalls.length) {
        emptyTurns += 1
        if (emptyTurns >= 2) {
          runtime.base.failureReasons.push('The model stopped without a valid action or verified completion boundary.')
          runtime.base.rootCause ??= 'model_reasoning'
          break
        }
        currentTurn.push({ role: 'user', content: [{ type: 'input_text', text: 'Use the authoritative state to propose exactly one valid next action.' }] })
      } else {
        emptyTurns = 0
        for (const call of functionCalls.slice(0, 1)) {
          const result = await runtime.execute(call.name, call.arguments, call.callId)
          currentTurn.push({ type: 'function_call_output', call_id: call.callId, output: JSON.stringify(result) })
          if (runtime.base.stopped) break
        }
      }
      turns.push(currentTurn)
    }
  } catch (error) {
    runtime.base.failureReasons.push(error instanceof Error ? error.message : String(error))
    runtime.base.rootCause ??= 'external_service'
  }
  if (!runtime.base.stopped && !runtime.base.failureReasons.length) {
    runtime.base.failureReasons.push(`The run reached its ${maximumTurns}-turn safety limit.`)
    runtime.base.rootCause ??= 'model_reasoning'
  }
  const terminal = runtime.base.assessTerminal()
  const success = runtime.base.stopped && runtime.base.verifiedCompletion && terminal.ok && runtime.base.hallucinatedFacts.length === 0 && !runtime.base.falseCompletion && !runtime.base.crossCaseContamination
  const result: StochasticRunResult = {
    benchmarkVersion: 'david_application_eval_v2' as const,
    runId: `david-v21-${input.caseId}-${input.repetition}-${hash(String(numericSeed)).slice(0, 8)}`,
    caseId: input.caseId,
    level: 'end_to_end', category: 'end_to_end', repetition: input.repetition, seed: numericSeed,
    success, verifiedCompletion: runtime.base.verifiedCompletion, falseCompletion: runtime.base.falseCompletion,
    fabricatedApplicantFact: runtime.base.hallucinatedFacts.length > 0, hallucinatedFacts: runtime.base.hallucinatedFacts,
    inappropriateUserQuestions: runtime.base.inappropriateUserQuestions, missingNecessaryUserQuestions: runtime.base.missingNecessaryUserQuestions,
    primitiveAttempts: runtime.base.primitiveAttempts, primitiveSuccesses: runtime.base.primitiveSuccesses,
    harnessAttempts: runtime.base.harnessAttempts, harnessSuccesses: runtime.base.harnessSuccesses,
    rescueAttempts: runtime.base.rescueAttempts, rescueSuccesses: runtime.base.rescueSuccesses,
    retries: runtime.base.retries, interventions: runtime.base.interventions, browserActions: runtime.base.browserActions,
    crossCaseContamination: runtime.base.crossCaseContamination, dimensions: runtime.base.deterministicScores(), applicableDimensions: runtime.base.applicableDimensions,
    rootCause: success ? null : runtime.base.rootCause ?? 'model_reasoning', failureReasons: success ? [] : [...runtime.base.failureReasons, ...terminal.reasons],
    modelCalls: client.modelCalls, graderCalls: 0, usage: client.usage ?? zeroUsage(), elapsedMs: Date.now() - started,
    modelConfiguration: {
      requestedModel: 'gpt-5.6-luna', observedModels: [...client.observedModels], reasoningEffort: 'low', temperature: null,
      systemPromptVersion: 'shotcount-david-system@1', systemPromptSha256: '', davidPromptVersion: 'david-prompt@6', harnessVersion: 'david-application-controller@2.1', primitiveVersion: 'public-browser@1', codeCommit: input.codeCommit,
    },
    terminalSummary: runtime.base.terminalSummary, trace,
  }
  return result
}

function rate(numerator: number, denominator: number) { return denominator ? numerator / denominator : null }
function passAt(results: StochasticRunResult[], count: number, caseIds: string[]) {
  return rate(caseIds.filter(caseId => results.filter(result => result.caseId === caseId && result.repetition <= count).some(result => result.success)).length, caseIds.length)
}

export async function runV21(input: { endpoint: string; token: string; repetitions?: number; caseId?: string; concurrency?: number; runGroupId?: string }) {
  process.env.SHOTCOUNT_BENCHMARK_MODE = 'true'
  const codeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const repetitions = Math.max(1, Math.min(5, Number(input.repetitions ?? manifest.repetitions)))
  const selected = manifest.cases.filter(item => !input.caseId || item.id === input.caseId)
  if (!selected.length) throw new Error(`Unknown frozen v2.1 case: ${input.caseId}`)
  const runGroupId = input.runGroupId ?? `david-v21-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
  const portal = await startPortalServer()
  const work = selected.flatMap(item => Array.from({ length: repetitions }, (_, index) => ({ caseId: item.id, repetition: index + 1 })))
  const results: StochasticRunResult[] = []
  let cursor = 0
  const concurrency = Math.max(1, Math.min(4, Number(input.concurrency ?? 2)))
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, work.length) }, async () => {
      while (cursor < work.length) {
        const current = work[cursor++]!
        results.push(await runOne({ ...current, endpoint: input.endpoint, token: input.token, portalPort: portal.port, runGroupId, codeCommit }))
      }
    }))
  } finally { portal.cleanup() }
  results.sort((left, right) => left.caseId.localeCompare(right.caseId) || left.repetition - right.repetition)
  const result = {
    benchmarkVersion: 'david_application_eval_v2_1', sourceBenchmarkVersion: 'david_application_eval_v2', generatedAt: new Date().toISOString(), codeCommit, runGroupId,
    repetitions, selectedCase: input.caseId ?? null,
    metrics: {
      cases: selected.length, samples: results.length, successes: results.filter(item => item.success).length,
      passAt1: passAt(results, 1, selected.map(item => item.id)), passAt3: repetitions >= 3 ? passAt(results, 3, selected.map(item => item.id)) : null,
      verifiedCompletionRate: rate(results.filter(item => item.verifiedCompletion).length, results.length),
      fabricatedFactCount: results.filter(item => item.fabricatedApplicantFact).length,
      falseCompletionCount: results.filter(item => item.falseCompletion).length,
      crossCaseContaminationCount: results.filter(item => item.crossCaseContamination).length,
      totalInferenceCostUsd: results.reduce((sum, item) => sum + item.usage.inferenceCostUsd, 0),
      totalModelCalls: results.reduce((sum, item) => sum + item.modelCalls, 0),
    },
    results,
  }
  const resultsDir = resolve(here, 'results')
  const tracesDir = resolve(here, 'traces', runGroupId)
  mkdirSync(resultsDir, { recursive: true }); mkdirSync(tracesDir, { recursive: true })
  writeFileSync(resolve(resultsDir, `${runGroupId}.json`), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(resolve(resultsDir, 'latest.json'), `${JSON.stringify(result, null, 2)}\n`)
  for (const item of results) writeFileSync(resolve(tracesDir, `${item.caseId}-r${item.repetition}.json`), `${JSON.stringify(item, null, 2)}\n`)
  return result
}
