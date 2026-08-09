import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { internalAgentToolName } from '../../supabase/functions/_shared/agent-tools.ts'
import { validateSemanticDecision, type SemanticDecision } from '../../supabase/functions/_shared/application-engine.ts'
import { buildCanonicalSemanticFixture, type CanonicalEngineCase } from './engine-corpus.ts'

const here = resolve(import.meta.dirname)
const root = resolve(here, '../..')

type OpenAIResponse = { id?: string; model?: string; output?: Array<{ type?: string; name?: string; arguments?: string }>; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } } }
type Usage = { inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningTokens: number; totalTokens: number; inferenceCostUsd: number }
const emptyUsage = (): Usage => ({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, inferenceCostUsd: 0 })
function responseUsage(response: OpenAIResponse): Usage {
  const inputTokens = Number(response.usage?.input_tokens ?? 0); const cachedInputTokens = Number(response.usage?.input_tokens_details?.cached_tokens ?? 0); const outputTokens = Number(response.usage?.output_tokens ?? 0)
  return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens: Number(response.usage?.output_tokens_details?.reasoning_tokens ?? 0), totalTokens: Number(response.usage?.total_tokens ?? inputTokens + outputTokens), inferenceCostUsd: ((inputTokens - cachedInputTokens) * 0.20 + cachedInputTokens * 0.02 + outputTokens * 1.20) / 1_000_000 }
}
function addUsage(...items: Usage[]) { return items.reduce((sum, item) => ({ inputTokens: sum.inputTokens + item.inputTokens, cachedInputTokens: sum.cachedInputTokens + item.cachedInputTokens, outputTokens: sum.outputTokens + item.outputTokens, reasoningTokens: sum.reasoningTokens + item.reasoningTokens, totalTokens: sum.totalTokens + item.totalTokens, inferenceCostUsd: sum.inferenceCostUsd + item.inferenceCostUsd }), emptyUsage()) }

function sleep(milliseconds: number) { return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds)) }

async function call(endpoint: string, token: string, body: Record<string, unknown>) {
  let lastError = 'Model request failed.'
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) })
    const payload = await response.json().catch(() => ({})) as OpenAIResponse & { error?: string | { message?: string }; retryAfterMs?: number }
    if (response.ok) return payload
    lastError = typeof payload.error === 'string' ? payload.error : payload.error?.message ?? `Proxy failed with ${response.status}`
    if ((response.status !== 429 && response.status < 500) || attempt === 8) break
    await sleep(Math.min(30_000, Math.max(Number(payload.retryAfterMs ?? 0), 750 * 2 ** (attempt - 1))))
  }
  throw new Error(lastError)
}

export async function runCanonicalStochastic(input: { endpoint: string; token: string; repetitions?: number; runId?: string }) {
  const spec = JSON.parse(readFileSync(resolve(here, 'spec.json'), 'utf8')) as { engineCases: CanonicalEngineCase[] }
  const cases = spec.engineCases.filter(item => item.level === 'end_to_end')
  const repetitions = Math.max(3, Math.min(5, input.repetitions ?? 3))
  const runId = input.runId ?? `david-engine-stochastic-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
  const results: Array<Record<string, unknown>> = []
  let usage = addUsage()
  for (const testCase of cases) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const started = Date.now()
      const fixture = buildCanonicalSemanticFixture(testCase)
      try {
        const response = await call(input.endpoint, input.token, { benchmarkVersion: 'david_application_engine_v3', runId: `${runId}-${testCase.id}-r${repetition}`, mode: 'semantic', request: fixture.request })
        usage = addUsage(usage, responseUsage(response))
        const output = response.output?.find(item => item.type === 'function_call')
        const args = JSON.parse(String(output?.arguments ?? '{}')) as Record<string, unknown>
        const decision: SemanticDecision = {
          schemaVersion: Number(args.schema_version) as 1,
          function: internalAgentToolName(String(output?.name ?? '')).slice('application.'.length) as SemanticDecision['function'],
          caseId: String(args.application_case_id ?? ''), requirementId: String(args.requirement_id ?? ''), decision: String(args.decision ?? ''),
          confidence: String(args.confidence ?? '') as SemanticDecision['confidence'], evidenceIds: Array.isArray(args.evidence_ids) ? args.evidence_ids.map(String) : [],
          factIds: Array.isArray(args.fact_ids) ? args.fact_ids.map(String) : [], rationale: String(args.rationale ?? ''),
        }
        const validation = validateSemanticDecision(fixture.state, fixture.request, decision)
        results.push({ caseId: testCase.id, repetition, success: validation.valid, verifiedCompletion: validation.valid, fabricatedFacts: validation.defects.includes('fact_unverified') ? 1 : 0, falseCompletions: validation.valid ? 0 : 1, contamination: validation.defects.includes('wrong_application_case') ? 1 : 0, defects: validation.defects, responseId: response.id, model: response.model, elapsedMs: Date.now() - started })
      } catch (error) {
        results.push({ caseId: testCase.id, repetition, success: false, verifiedCompletion: false, fabricatedFacts: 0, falseCompletions: 0, contamination: 0, defects: [error instanceof Error ? error.message : String(error)], elapsedMs: Date.now() - started })
      }
    }
  }
  const report = {
    benchmarkVersion: 'david_application_engine_v3', runId, codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    model: 'gpt-5.6-luna', repetitions, cases: cases.length, samples: results.length,
    passed: results.filter(item => item.success).length, verifiedCompletionRate: results.filter(item => item.verifiedCompletion).length / results.length,
    fabricatedFacts: results.reduce((sum, item) => sum + Number(item.fabricatedFacts), 0), falseCompletions: results.reduce((sum, item) => sum + Number(item.falseCompletions), 0),
    contamination: results.reduce((sum, item) => sum + Number(item.contamination), 0), totalCostUsd: usage.inferenceCostUsd,
    averageCostPerE2ECaseUsd: usage.inferenceCostUsd / results.length, averageE2ETimeMs: results.reduce((sum, item) => sum + Number(item.elapsedMs), 0) / results.length,
    qualified: results.every(item => item.success) && results.every(item => item.verifiedCompletion) && results.every(item => Number(item.fabricatedFacts) === 0 && Number(item.falseCompletions) === 0 && Number(item.contamination) === 0),
    usage, results,
  }
  const resultsDir = resolve(here, 'results'); mkdirSync(resultsDir, { recursive: true })
  writeFileSync(resolve(resultsDir, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(resolve(resultsDir, 'stochastic-latest.json'), `${JSON.stringify(report, null, 2)}\n`)
  return report
}
