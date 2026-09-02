import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runFrozenSuite, startPortalServer, type BenchmarkRun, type FrozenSpec } from './harness'
import { failureArtifact } from './failure-report'
import { runCanonicalEngineCorpus, type CanonicalEngineCase } from './engine-corpus'
import { runRecommendationQualification } from './recommendation-qualification'
import { runWorkSampleQualification, type WorkSampleQualificationReport } from './work-sample-qualification'
import { runAcademicEvidenceQualification } from './academic-evidence-benchmark'
import { researchProposalBenchmarkCases, runResearchProposalBenchmark, type ResearchProposalBenchmarkReport } from './research-proposal-benchmark'
import { runCampaignSummaryQualification, type CampaignSummaryQualificationReport } from './campaign-summary-qualification'
import { runApplicationRecoveryQualification, type ApplicationRecoveryQualificationReport } from './application-recovery-benchmark'
import { runFeeWaiverPaymentQualification, type FeeWaiverPaymentQualificationReport } from './fee-waiver-payment-benchmark'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const spec = JSON.parse(readFileSync(resolve(here, 'spec.json'), 'utf8')) as FrozenSpec

function envValue(name: string) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function percent(value: unknown) {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'n/a'
}

function optionalJson(path: string) {
  try { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> } catch { return null }
}

function writeArtifacts(run: BenchmarkRun) {
  const resultDir = resolve(here, 'results')
  const traceDir = resolve(here, 'traces', run.runId)
  const failureDir = resolve(here, 'failures', run.runId)
  mkdirSync(resultDir, { recursive: true })
  mkdirSync(traceDir, { recursive: true })
  mkdirSync(failureDir, { recursive: true })
  writeFileSync(resolve(resultDir, `${run.runId}.json`), `${JSON.stringify(run, null, 2)}\n`)
  writeFileSync(resolve(resultDir, 'latest.json'), `${JSON.stringify(run, null, 2)}\n`)
  if (run.academicEvidence) writeFileSync(resolve(resultDir, 'academic-evidence-latest.json'), `${JSON.stringify(run.academicEvidence, null, 2)}\n`)
  const feeWorkflowArtifact = (run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow
  if (feeWorkflowArtifact) writeFileSync(resolve(resultDir, 'application-fee-latest.json'), `${JSON.stringify(feeWorkflowArtifact, null, 2)}\n`)
  const campaignSummaryArtifact = (run as BenchmarkRun & { campaignSummary?: CampaignSummaryQualificationReport }).campaignSummary
  if (campaignSummaryArtifact) writeFileSync(resolve(resultDir, 'campaign-summary-latest.json'), `${JSON.stringify(campaignSummaryArtifact, null, 2)}\n`)
  const applicationRecoveryArtifact = (run as BenchmarkRun & { applicationRecovery?: ApplicationRecoveryQualificationReport }).applicationRecovery
  if (applicationRecoveryArtifact) writeFileSync(resolve(resultDir, 'application-recovery-latest.json'), `${JSON.stringify(applicationRecoveryArtifact, null, 2)}\n`)
  writeFileSync(resolve(here, 'routing-statistics.json'), `${JSON.stringify({ benchmarkVersion: run.benchmarkVersion, runId: run.runId, codeCommit: run.codeCommit, generatedAt: run.generatedAt, ...run.routingStatistics }, null, 2)}\n`)
  const rows = run.results.map(result => ({
    benchmark_version: run.benchmarkVersion,
    run_id: run.runId,
    case_id: result.caseId,
    level: result.level,
    execution_mode: result.executionMode,
    success: result.success ? 1 : 0,
    verified_completion: result.verified ? 1 : 0,
    primitive_attempted: result.primitiveAttempted ? 1 : 0,
    primitive_success: result.primitiveSuccess ? 1 : 0,
    harness_attempted: result.harnessAttempted ? 1 : 0,
    harness_success: result.harnessSuccess ? 1 : 0,
    escalated: result.escalated ? 1 : 0,
    recovery_success: result.recoverySuccess ? 1 : 0,
    false_success: result.falseSuccess ? 1 : 0,
    duplicate_action: result.duplicateAction ? 1 : 0,
    manual_intervention: result.manualIntervention ? 1 : 0,
    retries: result.retries,
    browser_actions: result.browserActions,
    gmail_actions: result.gmailActions,
    model_calls: result.modelCalls,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    estimated_cost_usd: result.estimatedCostUsd,
    elapsed_ms: result.elapsedMs,
    root_cause_category: result.rootCauseCategory ?? '',
  }))
  const headers = Object.keys(rows[0] ?? {})
  writeFileSync(resolve(resultDir, 'latest.csv'), `${headers.join(',')}\n${rows.map(row => headers.map(header => csvCell(row[header as keyof typeof row])).join(',')).join('\n')}\n`)
  for (const result of run.results) {
    writeFileSync(resolve(traceDir, `${result.caseId}.json`), `${JSON.stringify(result.trace, null, 2)}\n`)
    if (!result.success) writeFileSync(resolve(failureDir, `${result.caseId}.json`), `${JSON.stringify(failureArtifact(result), null, 2)}\n`)
  }
  // Older iterations are part of the permanent corpus. Rebuild their concise
  // failure artifacts with the current schema so an early missing detail can
  // never leave an invalid `undefined` file behind.
  for (const filename of readdirSync(resultDir).filter(name => /^david-eval-.+\.json$/.test(name))) {
    try {
      const historical = JSON.parse(readFileSync(resolve(resultDir, filename), 'utf8')) as BenchmarkRun
      if (historical.benchmarkVersion !== run.benchmarkVersion || !Array.isArray(historical.results)) continue
      const historicalFailureDir = resolve(here, 'failures', historical.runId)
      mkdirSync(historicalFailureDir, { recursive: true })
      for (const result of historical.results.filter(item => !item.success)) {
        writeFileSync(resolve(historicalFailureDir, `${result.caseId}.json`), `${JSON.stringify(failureArtifact(result), null, 2)}\n`)
      }
    } catch {
      // Live-result files and interrupted external writes are not deterministic
      // benchmark runs and are intentionally ignored here.
    }
  }
  const regressionsPath = resolve(here, 'regressions.json')
  const existing = (() => {
    try { return JSON.parse(readFileSync(regressionsPath, 'utf8')) as Array<Record<string, unknown>> } catch { return [] }
  })()
  const next = [...existing]
  for (const item of spec.engineCases ?? []) {
    const key = `david_application_engine_v3:${item.id}:coverage`
    if (!next.some(entry => entry.key === key)) next.push({
      key,
      caseId: item.id,
      title: item.id.replaceAll('-', ' '),
      source: 'david_application_eval_v2 consolidated into canonical engine corpus',
      failureClass: item.features.join(','),
      status: 'covered',
      reproduction: { command: `npm run benchmark:david -- --case ${item.id}` },
    })
  }
  for (const item of spec.workSampleCases ?? []) {
    const key = `david_application_engine_v3:${item.id}:coverage`
    if (!next.some(entry => entry.key === key)) next.push({
      key,
      caseId: item.id,
      title: item.id.replaceAll('-', ' '),
      source: 'canonical writing-sample / portfolio qualification',
      failureClass: item.features.join(','),
      status: 'covered',
      reproduction: { command: `pnpm benchmark:david -- --case ${item.id}` },
    })
  }
  for (const result of run.results.filter(item => !item.success)) {
    const key = `${run.benchmarkVersion}:${result.caseId}:${result.rootCauseCategory ?? 'unknown'}`
    if (!next.some(item => item.key === key)) next.push({ key, caseId: result.caseId, title: result.title, source: 'frozen benchmark', firstSeenRun: run.runId, failureClass: result.rootCauseCategory, expected: result.expectedResult, reproduction: { command: `pnpm benchmark:david -- --case ${result.caseId}` } })
  }
  writeFileSync(regressionsPath, `${JSON.stringify(next, null, 2)}\n`)

  const m = run.metrics
  const proposal = (run as BenchmarkRun & { researchProposal?: ResearchProposalBenchmarkReport }).researchProposal
  const campaignSummary = (run as BenchmarkRun & { campaignSummary?: CampaignSummaryQualificationReport }).campaignSummary
  const applicationRecovery = (run as BenchmarkRun & { applicationRecovery?: ApplicationRecoveryQualificationReport }).applicationRecovery
  const engineMetrics = run.engine?.metrics ?? {}
  const stochastic = optionalJson(resolve(here, 'results/stochastic-latest.json'))
  const comparison = (kind: 'primitive' | 'harness' | 'adaptive') => {
    const rows = kind === 'primitive' ? run.results.filter(result => result.primitiveAttempted) : kind === 'harness' ? run.results.filter(result => result.harnessAttempted) : run.results
    const successful = kind === 'primitive' ? rows.filter(result => result.primitiveSuccess) : kind === 'harness' ? rows.filter(result => result.harnessSuccess) : rows.filter(result => result.success)
    return {
      attempts: rows.length,
      successRate: rows.length ? successful.length / rows.length : null,
      averageLatencyMs: rows.length ? rows.reduce((sum, result) => sum + result.elapsedMs, 0) / rows.length : null,
      averageBrowserActions: rows.length ? rows.reduce((sum, result) => sum + result.browserActions, 0) / rows.length : null,
      retries: rows.reduce((sum, result) => sum + result.retries, 0),
      estimatedCostUsd: rows.reduce((sum, result) => sum + result.estimatedCostUsd, 0),
    }
  }
  const primitiveComparison = comparison('primitive')
  const harnessComparison = comparison('harness')
  const adaptiveComparison = comparison('adaptive')
  const connectedEmail = run.liveEmail.connectedEvaluation as Record<string, unknown> | undefined
  const connectedEmailBlockers = Array.isArray(connectedEmail?.blockedCases) ? connectedEmail.blockedCases.length : 0
  const liveEmailSummary = connectedEmail
    ? `${connectedEmail.verifiedCases ?? 0}/${connectedEmail.executedCases ?? 0} executed cases provider-verified; ${connectedEmailBlockers} alternate-sender cases blocked; ${String((connectedEmail.cleanup as Record<string, unknown> | undefined)?.messagesMatched ?? 0)} messages labeled and archived.`
    : `Not run (${String(run.liveEmail.status ?? 'no status')}).`
  const liveWebSummary = run.liveReadOnlyWeb.status === 'completed_separate_suite'
    ? `${String(run.liveReadOnlyWeb.successfulCases ?? 0)}/${String(run.liveReadOnlyWeb.totalCases ?? 0)} verified with ${String(run.liveReadOnlyWeb.writeActions ?? 0)} write actions.`
    : `Not run (${String(run.liveReadOnlyWeb.status ?? 'no status')}).`
  const pairedEvaluations = Array.isArray(run.routingStatistics.pairedEvaluations)
    ? run.routingStatistics.pairedEvaluations as Array<Record<string, unknown>>
    : []
  const pairedRows = pairedEvaluations.map(item => {
    const primitive = item.primitive as Record<string, unknown>
    const harness = item.harness as Record<string, unknown>
    return `| ${String(item.caseId)} | ${primitive.success ? 'pass' : 'fail'} / ${String(primitive.latencyMs)} ms / ${String(primitive.browserActions)} | ${harness.success ? 'pass' : 'fail'} / ${String(harness.latencyMs)} ms / ${String(harness.browserActions)} | ${String(item.adaptiveSelected)} |`
  }).join('\n') || '| — | — | — | No paired case in this run |'
  const failureRows = run.results.filter(result => !result.success).map(result => `| ${result.caseId} | ${result.rootCauseCategory ?? 'unknown'} | ${result.executionMode} | ${result.escalationReason ?? '—'} |`).join('\n') || '| — | — | — | No failures |'
  const report = `# David application benchmark — ${run.benchmarkVersion}

Run **${run.runId}** at ${run.generatedAt}; evaluated commit **${run.codeCommit}**. Frozen dataset: **${run.atomicCases} atomic cases + ${run.endToEndCases} end-to-end cases**.

## Scorecard

| Metric | Result |
|---|---:|
| Primitive success rate | ${percent(m.primitiveSuccessRate)} |
| Harness success rate | ${percent(m.harnessSuccessRate)} |
| Primitive → harness rescue rate | ${percent(m.primitiveToHarnessRescueRate)} |
| Adaptive step success rate | ${percent(m.adaptiveStepSuccessRate)} |
| End-to-end application success rate | ${percent(m.endToEndSuccessRate)} |
| Verified completion rate | ${percent(m.verifiedCompletionRate)} |
| False completion rate | ${percent(m.falseCompletionRate)} (${m.falseSuccessCount ?? 0}) |
| Duplicate-action rate | ${percent(m.duplicateActionRate)} (${m.duplicateActionCount ?? 0}) |
| Manual intervention rate | ${percent(m.manualInterventionRate)} |
| Recovery success rate | ${percent(m.recoverySuccessRate)} |
| Cross-case contamination rate | ${percent(m.crossCaseContaminationRate)} |
| Average cost / completed application | $${Number(m.averageCostPerCompletedApplicationUsd ?? 0).toFixed(6)} |
| Average time / completed application | ${Number(m.averageTimePerCompletedApplicationMs ?? 0).toFixed(0)} ms |

## Deterministic application engine

- Engine: ${run.engine?.version ?? 'not run'}
- Consolidated hard cases: ${String(engineMetrics.cases ?? 0)}
- Semantic validation: ${percent(engineMetrics.semanticSuccessRate)}
- E2E verified completion after autonomous recovery: ${percent(engineMetrics.endToEndVerifiedCompletionRate)}
- Recovery success: ${percent(engineMetrics.recoverySuccessRate)}
- Fabricated facts / false completions / duplicates / contamination: ${String(engineMetrics.fabricatedFacts ?? 0)} / ${String(engineMetrics.falseCompletions ?? 0)} / ${String(engineMetrics.duplicateActions ?? 0)} / ${String(engineMetrics.contamination ?? 0)}
- User interventions: ${String(engineMetrics.userInterventions ?? 0)}
- Production qualification: ${run.productionReadiness?.qualified ? 'PASS' : 'NOT YET — stochastic and live gates remain conditional'}

## Production-model stability

- Run: ${String(stochastic?.runId ?? 'not run')}
- Samples passed: ${String(stochastic?.passed ?? 0)}/${String(stochastic?.samples ?? 0)}
- Verified completion: ${percent(stochastic?.verifiedCompletionRate)}
- Fabricated facts / false completions / contamination: ${String(stochastic?.fabricatedFacts ?? 0)} / ${String(stochastic?.falseCompletions ?? 0)} / ${String(stochastic?.contamination ?? 0)}
- Total cost / average cost per E2E decision: $${Number(stochastic?.totalCostUsd ?? 0).toFixed(6)} / $${Number(stochastic?.averageCostPerE2ECaseUsd ?? 0).toFixed(6)}
- Average model latency: ${Number(stochastic?.averageE2ETimeMs ?? 0).toFixed(0)} ms

## Canonical research-proposal execution

${proposal ? `- Qualification: ${proposal.metrics.passed}/${proposal.metrics.cases} cases passed (${proposal.version})
- Requirement evidence-backed / formatting / citation verification: ${percent(proposal.metrics.requirementEvidenceBackedRate)} / ${percent(proposal.metrics.formattingGateRate)} / ${percent(proposal.metrics.citationVerificationRate)}
- Exact artifact / delivery evidence: ${percent(proposal.metrics.exactArtifactRate)} / ${percent(proposal.metrics.deliveryEvidenceRate)}
- Failures recovered / unresolved hallucinated citations / rejected hallucinated citations: ${proposal.metrics.failuresRecovered} / ${proposal.metrics.hallucinatedCitations} / ${proposal.metrics.hallucinatedCitationsRejected}
- Fabricated applicant facts / cross-case contamination: ${proposal.metrics.fabricatedApplicantFacts} / ${proposal.metrics.crossCaseContamination}
- Autonomous context resolution: ${percent(proposal.metrics.autonomousContextResolutionRate)}
- Readable report: ${proposal.outputRoot}/benchmark-report.md
- Production outputs: ${proposal.cases.map(item => item.outputPaths.pdf).join(', ')}` : 'Not run for a selected non-proposal case.'}

## Canonical recommendation-letter qualification

${run.recommendation ? `- Qualification: ${run.recommendation.passed ? 'PASS' : 'FAIL'} (${run.recommendation.suiteVersion})
- Auto-resolved facts / typed questions / broad free-text questions: ${String(run.recommendation.metrics.autoResolvedFacts)} / ${String(run.recommendation.metrics.typedQuestions)} / ${String(run.recommendation.metrics.broadFreeTextQuestions)}
- Candidates discovered / requirement graph nodes: ${String(run.recommendation.metrics.candidatesDiscovered)} / ${String(run.recommendation.metrics.requirementGraphNodes)}
- Automatic continuation rate: ${percent(run.recommendation.metrics.automaticContinuationRate)}
- Duplicate request keys / portal invitations / fabricated facts: ${String(run.recommendation.metrics.duplicateRequestKeys)} / ${String(run.recommendation.metrics.duplicatePortalInvitations)} / ${String(run.recommendation.metrics.fabricatedFacts)}
- Interaction mix: ${Object.entries(run.recommendation.interactionMix).map(([kind, count]) => `${kind}=${count}`).join(', ') || 'none'}
- UI payload kind: ${run.recommendation.uiPayload.interaction && typeof run.recommendation.uiPayload.interaction === 'object' ? String((run.recommendation.uiPayload.interaction as Record<string, unknown>).kind) : 'not generated'}
- Progress Detail examples: ${Object.keys(run.recommendation.progressDetailExamples).join(', ')}
- Final recommendation status: ${String(run.recommendation.finalStatus.state ?? 'unknown')} (${String(run.recommendation.finalStatus.recommender ?? 'unknown')})
- Email/support-pack/CV examples: ${run.recommendation.cv.pdfPath}, ${run.recommendation.cv.latexPath}, and the qualification report in the same output directory.` : 'Not run for a selected non-recommendation case.'}

## Canonical Academic Records & Testing qualification

${run.academicEvidence ? `- Qualification: ${run.academicEvidence.passed ? 'PASS' : 'FAIL'} (${run.academicEvidence.suiteVersion})
- Institutions / applications / detected requirements: ${String(run.academicEvidence.metrics.institutionsCovered)} / ${String(run.academicEvidence.metrics.applicationsCovered)} / ${String(run.academicEvidence.metrics.requirementsDetected)}
- Credential-evaluation cases / duplicate costs prevented: ${String(run.academicEvidence.metrics.credentialEvaluationCases)} / ${String(run.academicEvidence.metrics.duplicateCostsPrevented)}
- Typed Progress Detail interactions / sensitive interaction rejections: ${String(run.academicEvidence.metrics.typedInteractions)} / ${String(run.academicEvidence.metrics.sensitiveInteractionsRejected)}
- Forced-failure regressions: ${String(run.academicEvidence.metrics.passedRegressionCases)}/${String(run.academicEvidence.metrics.forcedFailureCases)}; false completions: ${String(run.academicEvidence.metrics.falseCompletions)}
- Generated examples: \`results/academic-evidence-latest.json\`.` : 'Not run.'}

## Canonical application fee-waiver and payment qualification

${(run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow ? `- Qualification: ${(run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.passed ? 'PASS' : 'FAIL'} (${(run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.suiteVersion})
- Cases / passed cases / failed assertions: ${String((run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.metrics.cases)} / ${String((run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.metrics.passedCases)} / ${String((run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.metrics.failedAssertions)}
- No-inference passes / evidence checks / exact approval checks / duplicate guards: ${String((run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.metrics.noInferencePasses)} / ${String((run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.metrics.evidenceChecks)} / ${String((run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.metrics.approvalChecks)} / ${String((run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.metrics.duplicateChargeGuards)}
- Generated manual waiver email examples: ${String((run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow!.metrics.generatedEmailExamples)}
- Production-generated examples: \`results/application-fee-latest.json\`.` : 'Not run.'}

## Canonical user-facing campaign summary qualification

${campaignSummary ? `- Qualification: ${campaignSummary.passed ? 'PASS' : 'FAIL'} (${campaignSummary.suiteVersion})
- Cases / passed cases / failed assertions: ${String(campaignSummary.metrics.cases)} / ${String(campaignSummary.metrics.passedCases)} / ${String(campaignSummary.metrics.failedAssertions)}
- Generated counts — Doing / Waiting / Needs you / At risk / Submitted: ${String(campaignSummary.metrics.doingItems)} / ${String(campaignSummary.metrics.waitingItems)} / ${String(campaignSummary.metrics.userActions)} / ${String(campaignSummary.metrics.risks)} / ${String(campaignSummary.metrics.submittedApplications)}
- Integrity: ${campaignSummary.metrics.integrityValid ? 'valid' : 'invalid'}
- Production-generated examples: \`results/campaign-summary-latest.json\`.` : 'Not run.'}

## Canonical admissions clarification and post-submission recovery qualification

${applicationRecovery ? `- Qualification: ${applicationRecovery.qualified ? 'PASS' : 'FAIL'} (${applicationRecovery.version})
- Cases / passed cases: ${String(applicationRecovery.metrics.cases)} / ${String(applicationRecovery.metrics.passed)}
- Admissions research resolved without email / targeted approvals: ${String(applicationRecovery.metrics.admissionsResearchResolvedWithoutEmail)} / ${String(applicationRecovery.metrics.clarificationsRequiringApproval)}
- Typed post-submission requests / automatic artifact resolution / attachment handoffs: ${String(applicationRecovery.metrics.postSubmissionRequestsDetected)} / ${String(applicationRecovery.metrics.artifactsResolvedAutomatically)} / ${String(applicationRecovery.metrics.attachmentHandoffs)}
- Duplicate actions prevented / false completions / cross-case contamination: ${String(applicationRecovery.metrics.duplicateActionsPrevented)} / ${String(applicationRecovery.metrics.falseCompletions)} / ${String(applicationRecovery.metrics.crossCaseContamination)}
- Rejection recovery cases / admissions escalations: ${String(applicationRecovery.metrics.rejectionRecoveryCases)} / ${String(applicationRecovery.metrics.deliveryEscalations)}
- Production-generated examples: \`results/application-recovery-latest.json\`.` : 'Not run.'}

## Canonical writing-sample / portfolio qualification

${run.workSample ? `- Qualification: ${String(run.workSample.metrics.passed ?? 0)}/${String(run.workSample.metrics.cases ?? 0)} cases passed (${run.workSample.version})
- Requirement evidence-backed / candidate inspection / exact artifact match / portal read-back: ${percent(run.workSample.metrics.requirementEvidenceBackedRate)} / ${percent(run.workSample.metrics.candidateInspectionRate)} / ${percent(run.workSample.metrics.exactArtifactMatchRate)} / ${percent(run.workSample.metrics.readBackVerificationRate)}
- Automatic continuation / completed without clarification: ${percent(run.workSample.metrics.automaticContinuationRate)} / ${percent(run.workSample.metrics.completedWithoutClarificationRate)}
- Approvals / structured choices / free-text questions / uploads: ${String(run.workSample.metrics.approvalCount ?? 0)} / ${String(run.workSample.metrics.structuredQuestionCount ?? 0)} / ${String(run.workSample.metrics.freeTextQuestionCount ?? 0)} / ${String(run.workSample.metrics.uploadsCompleted ?? 0)}
- Secret blocks / wrong artifacts blocked / duplicate uploads blocked / false completions: ${String(run.workSample.metrics.secretLeakageBlocked ?? 0)} / ${String(run.workSample.metrics.wrongArtifactBlocked ?? 0)} / ${String(run.workSample.metrics.duplicateUploadsBlocked ?? 0)} / ${String(run.workSample.metrics.falseCompletions ?? 0)}
- Qualification report: ${run.workSample.outputRoot}/qualification-report.md
- Production outputs: ${run.workSample.cases.map(item => String((item.outputPaths as Record<string, unknown> | undefined)?.derived ?? (item.outputPaths as Record<string, unknown> | undefined)?.supplement ?? '')).filter(Boolean).join(', ')}` : 'Not run for a selected non-work-sample case.'}

## Deployment and live gate

- Production migration/function/frontend deployment: ${run.productionReadiness?.deploymentGatePassed ? 'completed' : 'not performed; qualification policy blocked deployment'}
- Production smoke: ${run.productionReadiness?.liveGatePassed ? 'passed' : 'blocked'}
- External limitation: current authenticated RLS, Calendar, durable-restart, and exact-upload smoke requires \`VITE_SUPABASE_URL\`, \`VITE_SUPABASE_ANON_KEY\`, \`SHOTCOUNT_TEST_EMAIL\`, and \`SHOTCOUNT_TEST_PASSWORD\`, which are unavailable in this workspace.

## Primitive, harness, and adaptive comparison

| Path | Attempts | Success | Avg latency | Avg browser actions | Retries | Model cost |
|---|---:|---:|---:|---:|---:|---:|
| Primitive | ${primitiveComparison.attempts} | ${percent(primitiveComparison.successRate)} | ${Number(primitiveComparison.averageLatencyMs ?? 0).toFixed(0)} ms | ${Number(primitiveComparison.averageBrowserActions ?? 0).toFixed(1)} | ${primitiveComparison.retries} | $${primitiveComparison.estimatedCostUsd.toFixed(6)} |
| Harness | ${harnessComparison.attempts} | ${percent(harnessComparison.successRate)} | ${Number(harnessComparison.averageLatencyMs ?? 0).toFixed(0)} ms | ${Number(harnessComparison.averageBrowserActions ?? 0).toFixed(1)} | ${harnessComparison.retries} | $${harnessComparison.estimatedCostUsd.toFixed(6)} |
| Adaptive outcome | ${adaptiveComparison.attempts} | ${percent(adaptiveComparison.successRate)} | ${Number(adaptiveComparison.averageLatencyMs ?? 0).toFixed(0)} ms | ${Number(adaptiveComparison.averageBrowserActions ?? 0).toFixed(1)} | ${adaptiveComparison.retries} | $${adaptiveComparison.estimatedCostUsd.toFixed(6)} |

Controlled paired evaluation values are shown as success / latency / browser actions.

| Case | Primitive | Harness | Adaptive choice |
|---|---:|---:|---|
${pairedRows}

## Failures and regression corpus

| Case | Primary failure class | Mode | Escalation / suspected cause |
|---|---|---|---|
${failureRows}

Every failed case is written to \`failures/${run.runId}/\` and added to the versioned regression corpus. Frozen definitions are never rewritten by the runner.

## Execution accounting

- Browser actions: ${m.browserActions ?? 0}
- Gmail fixture actions: ${m.gmailActions ?? 0}
- Primitive success / failure: ${m.primitiveSuccessCount ?? 0} / ${m.primitiveFailureCount ?? 0}
- Harness success / failure: ${m.harnessSuccessCount ?? 0} / ${m.harnessFailureCount ?? 0}
- Escalations / rescued: ${m.escalationCount ?? 0} / ${m.escalationSuccessCount ?? 0}
- Manual interventions / retries: ${m.manualInterventionCount ?? 0} / ${m.retryCount ?? 0}
- Model calls / tokens / measured model cost: ${m.modelCalls ?? 0} / ${m.inputTokens ?? 0} / ${m.outputTokens ?? 0} / $${Number(m.estimatedModelCostUsd ?? 0).toFixed(6)}
- Deterministic Gmail fixture messages: ${String(run.liveEmail.messagesInDeterministicFixture ?? 0)}
- Connected Gmail evaluation: ${liveEmailSummary}
- Separate live read-only web set: ${liveWebSummary}
`
  writeFileSync(resolve(here, 'report.md'), report)
}

async function execute() {
  process.env.SHOTCOUNT_BENCHMARK_MODE = 'true'
  const selectedCase = envValue('DAVID_BENCHMARK_CASE')
  const level = (envValue('DAVID_BENCHMARK_LEVEL') as 'atomic' | 'end_to_end' | 'all' | undefined) ?? 'all'
  const seedValue = envValue('DAVID_BENCHMARK_SEED')
  const seedOverride = seedValue ? Number(seedValue) : undefined
  const runId = envValue('DAVID_BENCHMARK_RUN_ID') ?? `david-eval-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(16).slice(2, 8)}`
  const codeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const portal = await startPortalServer()
  try {
    const run = await runFrozenSuite(spec, { runId, codeCommit, port: portal.port, selectedCase, seedOverride: Number.isFinite(seedOverride) ? seedOverride : undefined, level })
    const engineCases = (spec.engineCases ?? []) as CanonicalEngineCase[]
    const selectedEngineCases = selectedCase
      ? engineCases.filter(item => selectedCase.split(',').map(value => value.trim()).includes(item.id))
      : engineCases
    const engine = runCanonicalEngineCorpus(selectedEngineCases)
    run.engine = engine as unknown as BenchmarkRun['engine']
    const academicEvidence = runAcademicEvidenceQualification()
    run.academicEvidence = academicEvidence as BenchmarkRun['academicEvidence']
    const campaignSummary = runCampaignSummaryQualification()
    ;(run as BenchmarkRun & { campaignSummary?: CampaignSummaryQualificationReport }).campaignSummary = campaignSummary
    const applicationRecovery = runApplicationRecoveryQualification()
    ;(run as BenchmarkRun & { applicationRecovery?: ApplicationRecoveryQualificationReport }).applicationRecovery = applicationRecovery
    const feeWorkflow = runFeeWaiverPaymentQualification()
    ;(run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow = feeWorkflow
    run.atomicCases += engine.results.filter(item => item.level !== 'end_to_end').length
    run.endToEndCases += engine.results.filter(item => item.level === 'end_to_end').length
    run.metrics = {
      ...run.metrics,
      canonicalSystemSuccessRate: engine.metrics.systemSuccessRate,
      canonicalSemanticSuccessRate: engine.metrics.semanticSuccessRate,
      canonicalEndToEndVerifiedCompletionRate: engine.metrics.endToEndVerifiedCompletionRate,
      canonicalRecoverySuccessRate: engine.metrics.recoverySuccessRate,
      canonicalFabricatedFacts: engine.metrics.fabricatedFacts,
      canonicalFalseCompletions: engine.metrics.falseCompletions,
      canonicalDuplicateActions: engine.metrics.duplicateActions,
      canonicalContamination: engine.metrics.contamination,
      canonicalUserInterventions: engine.metrics.userInterventions,
      academicEvidencePassed: academicEvidence.passed,
      academicEvidenceRequirementsDetected: Number(academicEvidence.metrics.requirementsDetected ?? 0),
      academicEvidenceDuplicateCostsPrevented: Number(academicEvidence.metrics.duplicateCostsPrevented ?? 0),
      academicEvidenceForcedFailurePassRate: Number(academicEvidence.metrics.forcedFailureCases ?? 0) > 0 ? Number(academicEvidence.metrics.passedRegressionCases ?? 0) / Number(academicEvidence.metrics.forcedFailureCases ?? 1) : 1,
      campaignSummaryPassed: campaignSummary.passed,
      campaignSummaryCases: campaignSummary.metrics.cases,
      campaignSummaryFailedAssertions: campaignSummary.metrics.failedAssertions,
      applicationRecoveryPassed: applicationRecovery.qualified,
      applicationRecoveryCases: applicationRecovery.metrics.cases,
      applicationRecoveryFalseCompletions: applicationRecovery.metrics.falseCompletions,
      applicationRecoveryCrossCaseContamination: applicationRecovery.metrics.crossCaseContamination,
      applicationFeeQualificationPassed: feeWorkflow.passed,
      applicationFeeQualificationCases: feeWorkflow.metrics.cases,
      applicationFeeFailedAssertions: feeWorkflow.metrics.failedAssertions,
      applicationFeeDuplicateGuards: feeWorkflow.metrics.duplicateChargeGuards,
    }
    const selectedValues = selectedCase ? selectedCase.split(',').map(value => value.trim()).filter(Boolean) : []
    const proposalCaseSelection = selectedValues.length
      ? researchProposalBenchmarkCases.filter(item => selectedValues.includes(item.id)).map(item => item.id)
      : undefined
    const shouldRunProposalBenchmark = !selectedValues.length || Boolean(proposalCaseSelection?.length)
    const proposal = shouldRunProposalBenchmark
      ? runResearchProposalBenchmark({ selectedCase: proposalCaseSelection?.join(',') })
      : null
    const runWithProposal = run as BenchmarkRun & { researchProposal?: ResearchProposalBenchmarkReport }
    if (proposal) {
      runWithProposal.researchProposal = proposal
      run.atomicCases += proposal.cases.length
      run.metrics = {
        ...run.metrics,
        researchProposalCases: proposal.metrics.cases,
        researchProposalPassed: proposal.metrics.passed,
        researchProposalRequirementEvidenceBackedRate: proposal.metrics.requirementEvidenceBackedRate,
        researchProposalExactArtifactRate: proposal.metrics.exactArtifactRate,
        researchProposalDeliveryEvidenceRate: proposal.metrics.deliveryEvidenceRate,
        researchProposalHallucinatedCitations: proposal.metrics.hallucinatedCitations,
        researchProposalFabricatedApplicantFacts: proposal.metrics.fabricatedApplicantFacts,
        researchProposalCrossCaseContamination: proposal.metrics.crossCaseContamination,
        researchProposalFailuresRecovered: proposal.metrics.failuresRecovered,
      }
    }
    const workSampleCaseSelection = selectedValues.length
      ? (spec.workSampleCases ?? []).filter(item => selectedValues.includes(item.id)).map(item => item.id)
      : undefined
    const shouldRunWorkSampleQualification = !selectedValues.length || Boolean(workSampleCaseSelection?.length)
    const workSample = shouldRunWorkSampleQualification
      ? runWorkSampleQualification({ selectedCase: workSampleCaseSelection?.join(',') })
      : null
    const runWithWorkSample = run as BenchmarkRun & { workSample?: WorkSampleQualificationReport }
    if (workSample) {
      runWithWorkSample.workSample = workSample
      run.atomicCases += workSample.cases.length
      run.metrics = {
        ...run.metrics,
        workSampleCases: workSample.metrics.cases,
        workSamplePassed: workSample.metrics.passed,
        workSampleRequirementEvidenceBackedRate: workSample.metrics.requirementEvidenceBackedRate,
        workSampleCandidateInspectionRate: workSample.metrics.candidateInspectionRate,
        workSampleAuthorshipVerificationRate: workSample.metrics.authorshipVerificationRate,
        workSampleAutomaticSelectionRate: workSample.metrics.automaticSelectionRate,
        workSampleApprovalCount: workSample.metrics.approvalCount,
        workSampleStructuredQuestionCount: workSample.metrics.structuredQuestionCount,
        workSampleFreeTextQuestionCount: workSample.metrics.freeTextQuestionCount,
        workSampleUploadsCompleted: workSample.metrics.uploadsCompleted,
        workSampleExactArtifactMatchRate: workSample.metrics.exactArtifactMatchRate,
        workSampleReadBackVerificationRate: workSample.metrics.readBackVerificationRate,
        workSampleSecretLeakageBlocked: workSample.metrics.secretLeakageBlocked,
        workSampleWrongArtifactBlocked: workSample.metrics.wrongArtifactBlocked,
        workSampleDuplicateUploadsBlocked: workSample.metrics.duplicateUploadsBlocked,
        workSampleFalseCompletions: workSample.metrics.falseCompletions,
        workSampleFailuresRecovered: workSample.metrics.failuresRecovered,
        workSampleUserInterventions: workSample.metrics.userInterventions,
        workSampleAutomaticContinuationRate: workSample.metrics.automaticContinuationRate,
        workSampleCompletedWithoutClarificationRate: workSample.metrics.completedWithoutClarificationRate,
      }
    }
    const proposalGatePassed = !proposal || (
      proposal.metrics.passed === proposal.metrics.cases &&
      proposal.metrics.hallucinatedCitations === 0 &&
      proposal.metrics.fabricatedApplicantFacts === 0 &&
      proposal.metrics.crossCaseContamination === 0 &&
      proposal.metrics.exactArtifactRate === 1 &&
      proposal.metrics.deliveryEvidenceRate === 1
    )
    const workSampleGatePassed = !workSample || (
      workSample.metrics.passed === workSample.metrics.cases &&
      workSample.metrics.requirementEvidenceBackedRate === 1 &&
      workSample.metrics.authorshipVerificationRate === 1 &&
      workSample.metrics.exactArtifactMatchRate === 1 &&
      workSample.metrics.readBackVerificationRate === 1 &&
      workSample.metrics.secretLeakageBlocked > 0 &&
      workSample.metrics.falseCompletions === 0 &&
      workSample.metrics.crossCaseContamination === 0
    )
    const deterministicGatePassed = engine.results.every(item => item.success) &&
      engine.metrics.fabricatedFacts === 0 && engine.metrics.falseCompletions === 0 &&
      engine.metrics.duplicateActions === 0 && engine.metrics.contamination === 0 && proposalGatePassed && workSampleGatePassed && academicEvidence.passed && campaignSummary.passed && applicationRecovery.qualified && feeWorkflow.passed
    run.productionReadiness = {
      qualified: false,
      deterministicGatePassed,
      stochasticGatePassed: optionalJson(resolve(here, 'results/stochastic-latest.json'))?.qualified === true,
      liveGatePassed: false,
      deploymentGatePassed: false,
    }
    run.blockers.push('Live production gate blocked: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SHOTCOUNT_TEST_EMAIL, and SHOTCOUNT_TEST_PASSWORD are unavailable; authenticated RLS, Calendar, durable-restart, and exact-upload smoke were not rerun.')
    if (proposal && !proposalGatePassed) run.blockers.push('Canonical research-proposal qualification failed.')
    if (workSample && !workSampleGatePassed) run.blockers.push('Canonical writing-sample / portfolio qualification failed.')
    if (!academicEvidence.passed) run.blockers.push('Canonical Academic Records & Testing qualification failed.')
    if (!campaignSummary.passed) run.blockers.push('Canonical user-facing campaign summary qualification failed.')
    if (!applicationRecovery.qualified) run.blockers.push('Canonical admissions clarification and post-submission recovery qualification failed.')
    if (!feeWorkflow.passed) run.blockers.push('Canonical application fee-waiver and payment qualification failed.')
    const liveWeb = optionalJson(resolve(here, 'results/live-web-latest.json'))
    const liveGmail = optionalJson(resolve(here, 'results/live-gmail-latest.json'))
    if (liveWeb) run.liveReadOnlyWeb = { status: 'completed_separate_suite', ...liveWeb }
    if (liveGmail) {
      run.liveEmail = { ...run.liveEmail, connectedEvaluation: liveGmail }
      const blockedCases = Array.isArray(liveGmail.blockedCases) ? liveGmail.blockedCases as Array<Record<string, unknown>> : []
      run.blockers.push(...blockedCases.map(item => `${String(item.caseId ?? 'connected Gmail case')}: ${String(item.reason ?? 'external connector limitation')}`))
    }
    if (!selectedCase || selectedCase.split(',').map(value => value.trim()).includes('recommendation-canonical-nadia-northbridge')) {
      run.recommendation = await runRecommendationQualification()
      if (!run.recommendation.passed) run.blockers.push('Canonical recommendation-letter qualification failed.')
    }
    writeArtifacts(run)
    return run
  } finally {
    portal.cleanup()
  }
}

const enabled = process.env.DAVID_BENCHMARK_RUN === 'true'

describe.skipIf(!enabled)('david_application_engine_v3', () => {
  it('runs the frozen benchmark with independent evidence checks', async () => {
    const run = await execute()
    expect(run.benchmarkVersion).toBe('david_application_engine_v3')
    if (!process.env.DAVID_BENCHMARK_CASE && (process.env.DAVID_BENCHMARK_LEVEL ?? 'all') === 'all') {
      expect(run.atomicCases + run.endToEndCases).toBeGreaterThanOrEqual(50)
    }
    const failures = run.results.filter(result => !result.success)
    expect(failures, failures.map(result => `${result.caseId}: ${result.rootCauseCategory} ${result.escalationReason ?? ''}`).join('\n')).toHaveLength(0)
    const engineFailures = run.engine?.results.filter(result => result.success !== true) ?? []
    expect(engineFailures).toHaveLength(0)
    expect(run.academicEvidence?.passed).toBe(true)
    expect((run as BenchmarkRun & { campaignSummary?: CampaignSummaryQualificationReport }).campaignSummary?.passed).toBe(true)
    expect((run as BenchmarkRun & { feeWorkflow?: FeeWaiverPaymentQualificationReport }).feeWorkflow?.passed).toBe(true)
    expect((run as BenchmarkRun & { applicationRecovery?: ApplicationRecoveryQualificationReport }).applicationRecovery?.qualified).toBe(true)
  // The frozen suite runs every browser-heavy application case sequentially,
  // then performs the canonical evidence qualifications in the same process.
  // Keep the gate bounded, but give the full suite enough room to finish so a
  // passing qualification is not misreported as a timeout.
  }, 1_800_000)
})

export { execute as runBenchmarkCommand }
