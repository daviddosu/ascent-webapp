import { describe, expect, it } from 'vitest'
import { runCampaignSummaryQualification } from './campaign-summary-qualification'

describe('canonical campaign summary qualification', () => {
  it('passes against production projector output and emits user-facing examples', () => {
    const report = runCampaignSummaryQualification()
    expect(report.passed).toBe(true)
    expect(report.metrics.failedAssertions).toBe(0)
    expect(report.examples).toHaveLength(2)
    expect(report.examples[0]?.summary).toContain('Needs you:')
    expect(report.examples[0]?.summary).toContain('At risk:')
  })
})
