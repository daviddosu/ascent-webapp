import { describe, expect, it } from 'vitest'
import { failureArtifact } from './failure-report'
import type { CaseResult } from './harness'

describe('benchmark failure artifacts', () => {
  it('always emits a complete JSON-serializable report when a case has no custom failure detail', () => {
    const result = {
      caseId: 'regression-case', title: 'Regression case', level: 'end_to_end',
      expectedResult: { submitted: false }, actualResult: { submitted: true },
      success: false, verified: false, executionMode: 'harness', primitiveAttempted: false,
      primitiveSuccess: false, harnessAttempted: true, harnessSuccess: false, escalated: false,
      escalationReason: 'Observed outcome mismatch.', recoverySuccess: false, falseSuccess: true,
      duplicateAction: true, manualIntervention: false, retries: 0, browserActions: 1, gmailActions: 0,
      modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, elapsedMs: 1,
      rootCauseCategory: 'duplicate_action', trace: [],
    } satisfies CaseResult

    const report = failureArtifact(result)
    expect(report).toMatchObject({
      caseId: 'regression-case', caseName: 'Regression case', expectedResult: { submitted: false },
      actualResult: { submitted: true }, executionMode: 'harness', failureClassification: 'duplicate_action',
      contributingClasses: ['false_success'], screenshot: null,
    })
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })
})
