import { describe, expect, it } from 'vitest'
import { runV2Benchmark } from './runner'

const enabled = process.env.DAVID_V2_BENCHMARK_RUN === 'true'

function optionalNumber(name: string) {
  const value = process.env[name]
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

describe.skipIf(!enabled)('david_application_eval_v2', () => {
  it('runs production-model stochastic samples without combining the v1 score', async () => {
    const endpoint = process.env.DAVID_V2_PROXY_URL?.trim() ?? ''
    const token = process.env.DAVID_V2_PROXY_TOKEN?.trim() ?? ''
    expect(endpoint, 'DAVID_V2_PROXY_URL is required.').toMatch(/^https:\/\//)
    expect(token, 'DAVID_V2_PROXY_TOKEN is required.').not.toBe('')
    const result = await runV2Benchmark({
      endpoint,
      token,
      repetitions: optionalNumber('DAVID_V2_REPETITIONS'),
      atomicRepetitions: optionalNumber('DAVID_V2_ATOMIC_REPETITIONS'),
      endToEndRepetitions: optionalNumber('DAVID_V2_E2E_REPETITIONS'),
      selectedCase: process.env.DAVID_V2_CASE?.trim() || undefined,
      selectedLevel: process.env.DAVID_V2_LEVEL === 'atomic' || process.env.DAVID_V2_LEVEL === 'end_to_end'
        ? process.env.DAVID_V2_LEVEL
        : undefined,
      seedOverride: optionalNumber('DAVID_V2_SEED'),
      runGroupId: process.env.DAVID_V2_RUN_GROUP?.trim() || undefined,
      concurrency: optionalNumber('DAVID_V2_CONCURRENCY'),
    })
    expect(result.benchmarkVersion).toBe('david_application_eval_v2')
    expect(result.v1.benchmarkVersion).toBe('david_application_eval_v1')
    expect(result.v1.unchanged).toBe(true)
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.metrics.stochasticRuns).toBe(result.results.length)
    expect(result.modelConfiguration.requestedModel).toBe('gpt-5.6-luna')
    expect(result.results.every(item => item.modelCalls > 0)).toBe(true)
  }, 14_400_000)
})
