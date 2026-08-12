import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runWorkSampleQualification } from './work-sample-qualification'

const outputRoot = join(tmpdir(), `shotcount-work-sample-${Date.now()}`)
const report = runWorkSampleQualification({ outputRoot })

afterAll(() => rmSync(outputRoot, { recursive: true, force: true }))

describe('canonical work-sample / portfolio qualification', () => {
  it('passes academic, code, and multi-project portfolio production cases', () => {
    expect(report.cases).toHaveLength(3)
    expect(report.cases.every(result => result.success)).toBe(true)
    expect(report.metrics.requirementEvidenceBackedRate).toBe(1)
    expect(report.metrics.exactArtifactMatchRate).toBe(1)
    expect(report.metrics.readBackVerificationRate).toBe(1)
    expect(report.metrics.falseCompletions).toBe(0)
    expect(report.metrics.crossCaseContamination).toBe(0)
  })

  it('emits real PDF, repository supplement, and readable Progress Detail outputs', () => {
    const academic = report.cases.find(result => result.class === 'academic_writing')!
    const code = report.cases.find(result => result.class === 'code_portfolio')!
    const portfolio = report.cases.find(result => result.class === 'project_portfolio')!
    expect(readFileSync(academic.outputPaths.derived!).subarray(0, 4).toString()).toBe('%PDF')
    expect(readFileSync(portfolio.outputPaths.derived!).subarray(0, 4).toString()).toBe('%PDF')
    expect(existsSync(code.outputPaths.supplement!)).toBe(true)
    expect(academic.interactions.some(item => item.kind === 'approval' && item.renderedHtml.includes('Progress Detail'))).toBe(true)
    expect(portfolio.interactions.some(item => item.kind === 'multiple_choice')).toBe(true)
    expect(academic.failuresRecovered).toEqual(expect.arrayContaining(['page_limit_rejected_before_excerpt', 'session_expired_after_upload']))
    expect(code.failuresRecovered).toContain('secret_found_in_repository')
    expect(portfolio.failuresRecovered).toEqual(expect.arrayContaining(['broken_portfolio_url_rejected', 'portal_filename_mismatch_blocked', 'duplicate_upload_evidence_blocked']))
  })
})
