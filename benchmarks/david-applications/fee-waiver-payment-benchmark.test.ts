import { describe, expect, it } from 'vitest'
import { runFeeWaiverPaymentQualification } from './fee-waiver-payment-benchmark'

describe('canonical application fee-waiver and payment qualification', () => {
  it('passes the no-inference, verification, approval, reconciliation, and handoff gates', () => {
    const report = runFeeWaiverPaymentQualification()
    expect(report.passed).toBe(true)
    expect(report.metrics.failedAssertions).toBe(0)
    expect(report.metrics.noInferencePasses).toBeGreaterThan(0)
    expect(report.metrics.evidenceChecks).toBeGreaterThan(0)
    expect(report.metrics.approvalChecks).toBeGreaterThan(0)
    expect(report.metrics.duplicateChargeGuards).toBe(1)
    expect(report.examples).toHaveLength(4)
  })
})
