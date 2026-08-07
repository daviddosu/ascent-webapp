import type { CaseResult } from './harness'

export function failureArtifact(result: CaseResult) {
  const details = result.failureReport ?? {
    primitiveTrace: result.trace.filter(item => item.component === 'primitive'),
    escalationReason: result.escalationReason,
    harnessTrace: result.trace.filter(item => item.component !== 'primitive'),
    lastVerifiedState: result.actualResult,
    failureClassification: result.rootCauseCategory,
    contributingClasses: result.falseSuccess && result.rootCauseCategory !== 'false_success' ? ['false_success'] : [],
    suspectedRootCause: result.escalationReason ?? `Observed state did not satisfy the frozen ${result.caseId} outcome.`,
    relevantSourceFile: 'benchmarks/david-applications/harness.ts',
    screenshot: null,
    evidence: { actualResult: result.actualResult, verified: result.verified },
    recommendedFix: `Reproduce with pnpm benchmark:david -- --case ${result.caseId}, fix the executor or harness, then rerun the unchanged suite.`,
  }
  return {
    caseId: result.caseId,
    caseName: result.title,
    expectedResult: result.expectedResult,
    actualResult: result.actualResult,
    executionMode: result.executionMode,
    ...details,
  }
}
