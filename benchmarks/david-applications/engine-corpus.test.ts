import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCanonicalEngineCorpus, type CanonicalEngineCase } from './engine-corpus'

const spec = JSON.parse(readFileSync(resolve(import.meta.dirname, 'spec.json'), 'utf8')) as { engineCases: CanonicalEngineCase[] }

describe('canonical deterministic application-engine corpus', () => {
  const run = runCanonicalEngineCorpus(spec.engineCases)

  it('imports all hard v2 coverage with at least ten complete E2E cases', () => {
    expect(run.metrics.cases).toBe(26)
    expect(run.metrics.endToEndCases).toBeGreaterThanOrEqual(10)
  })

  it('passes every deterministic, semantic-validation, recovery, and E2E gate', () => {
    expect(run.results.filter(item => !item.success)).toEqual([])
    expect(run.metrics.systemSuccessRate).toBe(1)
    expect(run.metrics.semanticSuccessRate).toBe(1)
    expect(run.metrics.endToEndVerifiedCompletionRate).toBe(1)
    expect(run.metrics.recoverySuccessRate).toBe(1)
  })

  it('has no safety or isolation violations', () => {
    expect(run.metrics.fabricatedFacts).toBe(0)
    expect(run.metrics.falseCompletions).toBe(0)
    expect(run.metrics.duplicateActions).toBe(0)
    expect(run.metrics.contamination).toBe(0)
    expect(run.metrics.userInterventions).toBe(0)
  })
})
