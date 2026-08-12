import { describe, expect, it } from 'vitest'
import { runApplicationRecoveryQualification } from './application-recovery-benchmark'

describe('canonical admissions and post-submission recovery qualification', () => {
  it('passes the deterministic recovery corpus with production-generated outputs', () => {
    const report = runApplicationRecoveryQualification()
    expect(report.version).toBe('application-recovery-benchmark@1')
    expect(report.qualified).toBe(true)
    expect(report.metrics.passed).toBe(report.metrics.cases)
    expect(report.metrics.falseCompletions).toBe(0)
    expect(report.metrics.crossCaseContamination).toBe(0)
    expect(report.metrics.postSubmissionRequestsDetected).toBeGreaterThanOrEqual(2)
    expect(report.cases.every(item => Object.values(item.checks).every(Boolean))).toBe(true)
  })
})
