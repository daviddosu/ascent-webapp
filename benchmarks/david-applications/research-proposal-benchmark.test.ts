import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runResearchProposalBenchmark } from './research-proposal-benchmark'

describe('canonical research-proposal benchmark', () => {
  it('passes requirement, grounding, recovery, artifact, and delivery gates', () => {
    const outputRoot = mkdtempSync(resolve(tmpdir(), 'shotcount-research-proposals-'))
    const report = runResearchProposalBenchmark({ outputRoot })

    expect(report.metrics.cases).toBe(8)
    expect(report.metrics.passed).toBe(8)
    expect(report.metrics.requirementEvidenceBackedRate).toBe(1)
    expect(report.metrics.fabricatedApplicantFacts).toBe(0)
    expect(report.metrics.crossCaseContamination).toBe(0)
    expect(report.metrics.hallucinatedCitations).toBe(0)
    expect(report.metrics.hallucinatedCitationsRejected).toBe(1)
    expect(report.metrics.exactArtifactRate).toBe(1)
    expect(report.metrics.deliveryEvidenceRate).toBe(1)
    expect(report.cases.flatMap(result => result.failuresRecovered)).toEqual(expect.arrayContaining([
      'word_limit_exceeded',
      'hallucinated_citation',
      'stale_artifact',
      'browser_upload_interruption',
      'infeasible_methodology',
    ]))
    expect(report.cases.every(result => readFileSync(result.outputPaths.pdf).subarray(0, 4).toString() === '%PDF')).toBe(true)
  })
})
