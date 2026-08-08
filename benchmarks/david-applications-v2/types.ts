export type RootCause =
  | 'model_reasoning'
  | 'prompt'
  | 'primitive'
  | 'harness'
  | 'browser'
  | 'data_retrieval'
  | 'orchestration'
  | 'external_service'

export type DimensionName =
  | 'research_correctness'
  | 'requirement_extraction'
  | 'applicant_fact_correctness'
  | 'tool_selection'
  | 'primitive_routing'
  | 'harness_escalation'
  | 'browser_execution'
  | 'email_interpretation'
  | 'document_correctness'
  | 'recovery'
  | 'evidence_quality'
  | 'final_task_completion'

export type DimensionScores = Record<DimensionName, number>

export type SourceMaterial = {
  assetId: string
  kind: string
  title: string
  content: string
}

export type ApplicantFixture = {
  id: string
  synthetic: true
  sourceMaterials: SourceMaterial[]
}

export type ProgrammeFixture = {
  name: string
  institution: string
  officialUrls: string[]
}

export type InboundMessage = {
  caseId: string
  threadId: string
  from: string
  subject: string
  body: string
}

export type BenchmarkCase = {
  id: string
  level: 'atomic' | 'end_to_end'
  category: string
  applicantId: string
  programmeId: string
  objective: string
  enableWebSearch?: boolean
  portalStartSection?: string
  portalFailure?: string
  terminalPolicy: string
  inboundMessages?: InboundMessage[]
  simulatedUserAnswers?: Record<string, string>
  campaignProgrammeIds?: string[]
}

export type BenchmarkSpec = {
  benchmarkVersion: 'david_application_eval_v2'
  v1BenchmarkVersion: 'david_application_eval_v1'
  title: string
  defaultRepetitions: number
  minimumEndToEndCases: number
  dimensions: DimensionName[]
  rootCauseCategories: RootCause[]
  programmes: Record<string, ProgrammeFixture>
  atomicCases: Array<Omit<BenchmarkCase, 'level'>>
  endToEndCases: Array<Omit<BenchmarkCase, 'level' | 'category' | 'terminalPolicy'>>
}

export type ProfileOracle = {
  fields: Record<string, string[]>
  missingFields: string[]
  forbiddenClaims: string[]
}

export type CaseOracle = {
  requiredEvidenceCount?: number
  requiredConcepts?: string[]
  requiredSection?: string
  requiredSections?: string[]
  optionalBlankFields?: string[]
  forbiddenFieldValues?: Record<string, string[]>
  requiredArtifact?: string
  relevanceTerms?: string[]
  expectedCaseId?: string
  forbiddenCaseIds?: string[]
  expectedThreadId?: string
  forbiddenThreadIds?: string[]
  mustAskFields?: string[]
  expectedRecovery?: boolean
  requiredCaseCount?: number
  crossCaseContaminationAutomaticFailure?: boolean
}

export type BenchmarkOracles = {
  profiles: Record<string, ProfileOracle>
  cases: Record<string, CaseOracle>
}

export type Usage = {
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
  inferenceCostUsd: number
}

export type TraceEvent = {
  at: string
  kind: 'model' | 'tool' | 'grader' | 'harness' | 'browser' | 'user'
  name: string
  input?: unknown
  output?: unknown
  elapsedMs?: number
  usage?: Usage
  error?: string | null
}

export type ModelConfiguration = {
  requestedModel: string
  observedModels: string[]
  reasoningEffort: string
  temperature: number | null
  systemPromptVersion: string
  systemPromptSha256: string
  davidPromptVersion: string
  harnessVersion: string
  primitiveVersion: string
  codeCommit: string
}

export type StochasticRunResult = {
  benchmarkVersion: 'david_application_eval_v2'
  runId: string
  caseId: string
  level: 'atomic' | 'end_to_end'
  category: string
  repetition: number
  seed: number
  success: boolean
  verifiedCompletion: boolean
  falseCompletion: boolean
  fabricatedApplicantFact: boolean
  hallucinatedFacts: string[]
  inappropriateUserQuestions: number
  missingNecessaryUserQuestions: number
  primitiveAttempts: number
  primitiveSuccesses: number
  harnessAttempts: number
  harnessSuccesses: number
  rescueAttempts: number
  rescueSuccesses: number
  retries: number
  interventions: number
  browserActions: number
  crossCaseContamination: boolean
  dimensions: DimensionScores
  applicableDimensions: DimensionName[]
  rootCause: RootCause | null
  failureReasons: string[]
  modelCalls: number
  graderCalls: number
  usage: Usage
  elapsedMs: number
  modelConfiguration: ModelConfiguration
  terminalSummary: string | null
  trace: TraceEvent[]
}

export type ConfidenceInterval = {
  successes: number
  samples: number
  rate: number | null
  lower95: number | null
  upper95: number | null
}

export type BenchmarkMetrics = {
  caseCount: number
  stochasticRuns: number
  passAt1: number | null
  passAt3: number | null
  passAt3CaseCount: number
  endToEndPassAt1: number | null
  endToEndPassAt3: number | null
  endToEndPassAt3CaseCount: number
  verifiedCompletionRate: number | null
  hallucinationRate: number | null
  falseCompletionRate: number | null
  primitiveSuccessRate: number | null
  harnessRescueRate: number | null
  averageInterventions: number | null
  totalInferenceCostUsd: number
  averageLatencyMs: number | null
  totalModelCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  passAt1Interval: ConfidenceInterval
  runPassInterval: ConfidenceInterval
  failuresByRootCause: Partial<Record<RootCause, number>>
}

export type BenchmarkResult = {
  benchmarkVersion: 'david_application_eval_v2'
  label: 'V2 — Intelligence + Execution'
  generatedAt: string
  codeCommit: string
  runGroupId: string
  repetitions: number
  repetitionsByLevel: { atomic: number; endToEnd: number }
  selectedCase: string | null
  selectedLevel: 'atomic' | 'end_to_end' | null
  modelConfiguration: ModelConfiguration
  metrics: BenchmarkMetrics
  results: StochasticRunResult[]
  v1: {
    benchmarkVersion: 'david_application_eval_v1'
    evaluatedCommit: string
    atomicCases: number
    endToEndCases: number
    successRate: number
    unchanged: boolean
  }
}
