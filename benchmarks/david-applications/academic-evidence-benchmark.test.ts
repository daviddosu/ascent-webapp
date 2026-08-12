import { describe, expect, it } from 'vitest'
import { runAcademicEvidenceQualification } from './academic-evidence-benchmark'

describe('canonical Academic Records & Testing qualification', () => {
  const report = runAcademicEvidenceQualification()

  it('passes the multi-institution evidence graph and forced-failure corpus', () => {
    expect(report.passed).toBe(true)
    expect(report.metrics.passedRegressionCases).toBe(report.metrics.forcedFailureCases)
    expect(report.metrics.falseCompletions).toBe(0)
    expect(report.metrics.duplicateCostsPrevented).toBeGreaterThan(0)
  })

  it('emits typed progress detail and production-shaped examples', () => {
    expect(Object.keys(report.progressDetailExamples).length).toBeGreaterThanOrEqual(1)
    expect(report.examples.primaryPlan.version).toBe('academic-evidence@1.0.0')
    expect(report.examples.primaryPlan.credentialEvaluationCases).toHaveLength(1)
    expect((report.examples.missingTranscriptPlan.interaction as { kind: string }).kind).toBe('attachment_request')
    expect((report.examples.missingOfficialDocumentPlan.interaction as { kind: string }).kind).toBe('confirmation')
    expect((report.examples.waiverPlan.interaction as { kind: string }).kind).toBe('attachment_request')
    expect((report.examples.testSelectionPlan.interaction as { kind: string }).kind).toBe('single_choice')
    expect((report.examples.optionalGrePlan.interaction as { kind: string }).kind).toBe('single_choice')
    expect((report.examples.testDateSelection.interaction as { kind: string }).kind).toBe('date')
  })
})
