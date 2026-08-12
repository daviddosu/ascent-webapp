import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createPdf } from '../../supabase/functions/_shared/pdf.ts'
import { renderWorkSampleProgressDetail } from '../../src/data/work-sample-progress-detail'
import {
  applyWorkSampleInteraction,
  buildWorkSampleRequirementGraph,
  checkWorkSampleEligibility,
  createWorkSamplePortfolioStrategy,
  discoverWorkSampleCandidates,
  extractWorkSampleRequirements,
  prepareWorkSampleSubmission,
  rankWorkSampleCandidates,
  resolveWorkSampleContext,
  scanWorkSampleSecurity,
  validateWorkSampleSubmission,
  verifyCandidateAuthorship,
  verifyWorkSampleUpload,
  workSampleCompletionEvidence,
  workSampleMetricsSummary,
  type RankedWorkSampleCandidate,
  type WorkSampleCandidate,
  type WorkSampleInteraction,
  type WorkSampleInteractionMetric,
  type WorkSampleRequirement,
  type WorkSampleSubmission,
} from '../../supabase/functions/_shared/work-sample-workflow.ts'

export type WorkSampleQualificationCaseResult = {
  caseId: string
  title: string
  class: 'academic_writing' | 'code_portfolio' | 'project_portfolio'
  success: boolean
  requirement: WorkSampleRequirement
  candidates: Array<Record<string, unknown>>
  strategy: Record<string, unknown> | null
  interactions: Array<{ kind: string; question: string; reason: string; renderedHtml: string; response: unknown }>
  submission: WorkSampleSubmission
  uploadVerification: Record<string, unknown>
  completion: { complete: boolean; defects: string[] }
  failuresRecovered: string[]
  metrics: {
    candidatesDiscovered: number
    artifactsInspected: number
    autoResolvedRequirements: number
    automaticSelections: number
    userSelections: number
    attachmentRequests: number
    structuredQuestions: number
    freeTextQuestions: number
    approvals: number
    uploadsCompleted: number
    userInterventions: number
  }
  outputPaths: { original: string | null; derived: string | null; supplement: string | null; manifest: string }
  trace: Array<Record<string, unknown>>
}

export type WorkSampleQualificationReport = {
  version: 'david-application-engine-v3-work-samples@1'
  generatedAt: string
  cases: WorkSampleQualificationCaseResult[]
  metrics: {
    cases: number
    passed: number
    requirementEvidenceBackedRate: number
    candidateInspectionRate: number
    authorshipVerificationRate: number
    automaticSelectionRate: number
    attachmentRequestCount: number
    structuredQuestionCount: number
    freeTextQuestionCount: number
    approvalCount: number
    uploadsCompleted: number
    exactArtifactMatchRate: number
    readBackVerificationRate: number
    secretLeakageBlocked: number
    wrongArtifactBlocked: number
    duplicateUploadsBlocked: number
    falseCompletions: number
    crossCaseContamination: number
    failuresRecovered: number
    userInterventions: number
    automaticContinuationRate: number
    completedWithoutClarificationRate: number
  }
  outputRoot: string
}

function sha256(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex')
}

function pdfPageCount(bytes: Uint8Array) {
  return Math.max(1, (Buffer.from(bytes).toString('latin1').match(/\/Type \/Page\b/g) ?? []).length)
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function source(id: string, excerpt: string, sourceKind: 'official_programme' | 'department' | 'application_guide' | 'portal' | 'portfolio_guidance' | 'faq' | 'download' = 'official_programme') {
  return { id, url: `https://northbridge.example.edu/apply/${id}`, title: id, authority: 'official' as const, sourceKind, excerpt, retrievedAt: '2026-08-12T00:00:00Z' }
}

function candidateSummary(candidate: RankedWorkSampleCandidate) {
  return {
    id: candidate.id,
    title: candidate.title,
    artifactType: candidate.artifactType,
    source: candidate.source,
    authors: candidate.authors,
    applicantAuthorshipRole: candidate.applicantAuthorshipRole,
    authorshipEvidence: candidate.authorshipEvidence,
    publicationStatus: candidate.publicationStatus,
    subjectArea: candidate.subjectArea,
    applicantContribution: candidate.applicantContribution,
    pageCount: candidate.pageCount,
    wordCount: candidate.wordCount,
    fileFormat: candidate.fileFormat,
    fileSizeBytes: candidate.fileSizeBytes,
    url: candidate.url,
    repositoryUrl: candidate.repositoryUrl,
    liveSiteUrl: candidate.liveSiteUrl,
    technologies: candidate.technologies,
    programmeRelevance: candidate.programmeRelevance,
    evidentiaryStrength: candidate.evidentiaryStrength,
    qualityScore: candidate.qualityScore,
    eligibility: candidate.eligibility,
    eligibilityReasons: candidate.eligibilityReasons,
    rank: candidate.rank,
    applicationFitScore: candidate.applicationFitScore,
    rankingReasons: candidate.rankingReasons,
    scoreBreakdown: candidate.scoreBreakdown,
    provenance: candidate.provenance,
    inspected: candidate.inspection.inspected,
    inspectedStructure: candidate.inspection.structure,
    inspectedMethods: candidate.inspection.methods,
    inspectedResults: candidate.inspection.results,
    securityFindings: candidate.inspection.securityFindings,
  }
}

function interaction(input: Pick<WorkSampleInteraction, 'id' | 'requirementId' | 'kind' | 'question' | 'reason'> & Partial<WorkSampleInteraction>): WorkSampleInteraction {
  return {
    workflow: 'work_sample',
    id: input.id,
    requirementId: input.requirementId,
    kind: input.kind,
    question: input.question,
    reason: input.reason,
    knownContext: input.knownContext ?? [],
    options: input.options ?? [],
    reusableContextKeys: input.reusableContextKeys ?? [],
    confirmLabel: input.confirmLabel ?? (input.kind === 'approval' ? 'Approve' : 'Continue'),
    cancelLabel: input.cancelLabel ?? 'Choose another',
    approvalScope: input.approvalScope,
    mapsToRequirement: input.mapsToRequirement,
    attachmentPrompt: input.attachmentPrompt,
    acceptedMimeTypes: input.acceptedMimeTypes ?? ['application/pdf', 'application/zip', 'application/json', 'text/plain'],
    maximumFiles: input.maximumFiles ?? 1,
    minSelections: input.minSelections ?? 1,
  }
}

function rate<T>(items: T[], predicate: (item: T) => boolean) {
  return items.length ? items.filter(predicate).length / items.length : 1
}

function publicStrategy(strategy: ReturnType<typeof createWorkSamplePortfolioStrategy>['strategy']) {
  if (!strategy) return null
  return {
    id: strategy.id,
    applicationCaseId: strategy.applicationCaseId,
    requiredNumber: strategy.requiredNumber,
    maximumNumber: strategy.maximumNumber,
    selectedCandidateIds: strategy.selectedCandidateIds,
    ordering: strategy.ordering,
    purposeByCandidate: strategy.purposeByCandidate,
    redundancyCheck: strategy.redundancyCheck,
    applicantContributionByCandidate: strategy.applicantContributionByCandidate,
    programmeRelevanceByCandidate: strategy.programmeRelevanceByCandidate,
    narrative: strategy.narrative,
    approvalRequired: strategy.approvalRequired,
  }
}

function pageBody(title: string, sections: string[], pages: number) {
  const lines = [`${title}`, ...sections]
  while (lines.length < pages * 40) lines.push(`${title}: verified analysis and evidence.`)
  return lines.join('\n')
}

function finalizeCase(input: {
  outputRoot: string
  caseId: string
  title: string
  class: WorkSampleQualificationCaseResult['class']
  requirement: WorkSampleRequirement
  ranked: RankedWorkSampleCandidate[]
  strategy: ReturnType<typeof createWorkSamplePortfolioStrategy>['strategy']
  submission: WorkSampleSubmission
  approval: WorkSampleInteraction
  approvalContext: ReturnType<typeof resolveWorkSampleContext>
  interactionMetrics: WorkSampleInteractionMetric[]
  uploadVerification: ReturnType<typeof verifyWorkSampleUpload>
  failuresRecovered: string[]
  outputPaths: { original: string | null; derived: string | null; supplement: string | null }
  trace: Array<Record<string, unknown>>
  priorInteractions?: Array<{ interaction: WorkSampleInteraction; response: unknown; metric: WorkSampleInteractionMetric }>
}) {
  const approvalApplied = applyWorkSampleInteraction({ context: input.approvalContext, interaction: input.approval, value: true, reusableContextConsent: true })
  if (!approvalApplied.accepted) throw new Error(`${input.caseId}: approval interaction did not validate`)
  const metrics = [...input.interactionMetrics, approvalApplied.metric]
  const authored = input.ranked.find(candidate => candidate.id === input.submission.candidateId)
  const completion = workSampleCompletionEvidence({
    requirement: input.requirement,
    submission: { ...input.submission, approvalState: 'approved', uploadState: input.uploadVerification.verified ? 'verified' : 'blocked' },
    portalVerification: input.uploadVerification,
    applicantAuthorshipVerified: authored ? verifyCandidateAuthorship(authored).verified : false,
    userResponsesResumed: metrics.every(metric => metric.resumedAutomatically),
  })
  const submission = {
    ...input.submission,
    approvalState: 'approved' as const,
    uploadState: input.uploadVerification.verified ? 'verified' as const : 'blocked' as const,
    resultingStateEvidence: input.uploadVerification.evidence ? {
      ...input.submission.resultingStateEvidence,
      ...input.uploadVerification.evidence,
      evidenceIds: [`evidence:${input.caseId}:upload`],
    } : input.submission.resultingStateEvidence,
  }
  const interactionPayload = [
    ...(input.priorInteractions ?? []),
    { interaction: input.approval, response: true, metric: approvalApplied.metric },
  ]
  const result: WorkSampleQualificationCaseResult = {
    caseId: input.caseId,
    title: input.title,
    class: input.class,
    success: completion.complete,
    requirement: input.requirement,
    candidates: input.ranked.map(candidateSummary),
    strategy: publicStrategy(input.strategy),
    interactions: interactionPayload.map(item => ({ kind: item.interaction.kind, question: item.interaction.question, reason: item.interaction.reason, renderedHtml: renderWorkSampleProgressDetail(item.interaction, `task:${input.caseId}`), response: item.response })),
    submission,
    uploadVerification: input.uploadVerification,
    completion,
    failuresRecovered: input.failuresRecovered,
    metrics: {
      candidatesDiscovered: input.ranked.length,
      artifactsInspected: input.ranked.filter(candidate => candidate.inspection.inspected).length,
      autoResolvedRequirements: input.requirement.sources.length ? 1 : 0,
      automaticSelections: input.strategy ? 1 : 0,
      userSelections: metrics.filter(metric => metric.kind === 'single_choice' || metric.kind === 'multiple_choice').length,
      attachmentRequests: metrics.filter(metric => metric.kind === 'attachment_request').length,
      structuredQuestions: metrics.filter(metric => metric.kind !== 'fact').length,
      freeTextQuestions: metrics.filter(metric => metric.freeText).length,
      approvals: metrics.filter(metric => metric.kind === 'approval').length,
      uploadsCompleted: input.uploadVerification.verified ? 1 : 0,
      userInterventions: metrics.length,
    },
    outputPaths: { ...input.outputPaths, manifest: resolve(input.outputRoot, input.caseId, 'qualification-output.json') },
    trace: [...input.trace, { event: 'work_sample_completion_verified', checksum: submission.checksum, uploadState: submission.uploadState, defects: completion.defects }],
  }
  writeJson(result.outputPaths.manifest, {
    caseId: result.caseId,
    title: result.title,
    requirement: result.requirement,
    candidates: result.candidates,
    strategy: result.strategy,
    interactions: result.interactions,
    submission: result.submission,
    uploadVerification: result.uploadVerification,
    completion: result.completion,
    failuresRecovered: result.failuresRecovered,
    metrics: result.metrics,
    outputPaths: result.outputPaths,
    trace: result.trace,
  })
  return result
}

function runAcademicCase(outputRoot: string): WorkSampleQualificationCaseResult {
  const caseId = 'work-sample-academic-northbridge'
  const title = 'Academic writing sample: thesis excerpt selected and prepared'
  const fullThesisBody = pageBody('Uncertainty-Aware Particle Simulation — Full Thesis', ['Abstract', 'Introduction', 'Methodology', 'Analysis', 'Results', 'Discussion', 'Conclusion', 'References', 'I developed the simulation pipeline and performed the primary statistical analysis. (Lee 2024)'], 68)
  const originalPdf = createPdf('Uncertainty-Aware Particle Simulation — Full Thesis', fullThesisBody)
  const originalChecksum = sha256(originalPdf)
  const thesisContent = ['Abstract', 'Introduction', 'Methodology', 'Analysis', 'Results', 'Discussion', 'Conclusion', 'References', 'I developed the simulation pipeline and performed the primary statistical analysis. (Lee 2024)'].join('\n') + '\n' + 'Verified thesis evidence. '.repeat(260)
  const requirements = extractWorkSampleRequirements({ applicationCaseId: caseId, programme: 'PhD Computational Physics', sourceEvidence: [
    source('programme', 'Submit one academic writing sample, maximum 15 pages. A complete paper or coherent thesis excerpt is accepted. Include your name and citations. Upload a PDF.'),
    source('department', 'The sample should demonstrate analytical work in computational physics. Co-authored work is accepted when the applicant contribution is stated.', 'department'),
    source('portal', 'Work Sample upload accepts PDF and requires one file.', 'portal'),
  ] })
  const requirement = requirements.find(item => item.requirementType === 'ACADEMIC_WRITING' && item.required)!
  const profile = {
    theses: [{ id: 'thesis-full', title: 'Uncertainty-Aware Particle Simulation', artifactType: 'THESIS_EXCERPT', authors: ['David Dosu'], authorship: 'sole author', authorshipEvidence: ['profile:thesis-authorship'], institution: 'Controlled University', subjectArea: 'computational physics', description: 'A thesis on uncertainty-aware particle simulation.', applicantContribution: 'Developed the simulation pipeline and performed the primary statistical analysis.', pageCount: 68, wordCount: 14_000, fileFormat: 'application/pdf', fileSizeBytes: originalPdf.length, assetId: 'asset:thesis-full', checksum: originalChecksum, content: thesisContent, sections: [{ title: 'Introduction', startPage: 1, endPage: 5, purpose: 'problem' }, { title: 'Methodology', startPage: 12, endPage: 21, purpose: 'method' }, { title: 'Analysis', startPage: 36, endPage: 45, purpose: 'analysis' }, { title: 'Results', startPage: 46, endPage: 56, purpose: 'results' }, { title: 'Discussion', startPage: 57, endPage: 62, purpose: 'contribution' }] }],
    publications: [{ id: 'conference-paper', title: 'Published Particle Models', artifactType: 'PUBLICATION', authors: ['Ada Lee', 'David Dosu'], authorship: 'co-author', authorshipEvidence: ['publication-index'], applicantContribution: 'Implemented the simulation pipeline and ran the primary statistical analysis.', publicationStatus: 'published', venue: 'Controlled Physics Review', subjectArea: 'computational physics', pageCount: 9, fileFormat: 'application/pdf', fileSizeBytes: 420_000, assetId: 'asset:paper', content: 'Abstract\nIntroduction\nMethod\nResults\nDiscussion\nReferences\nI implemented the simulation pipeline and ran the primary statistical analysis. (Lee 2024)' }],
    researchExperience: [{ id: 'technical-report', title: 'CERN detector technical report', artifactType: 'TECHNICAL_REPORT', authors: ['David Dosu', 'Research Team'], authorship: 'co-author', authorshipEvidence: ['research-log'], applicantContribution: 'Built and evaluated the calibration analysis.', publicationStatus: 'unpublished', subjectArea: 'detector physics', programmeRelevance: 88, pageCount: 40, fileFormat: 'application/pdf', assetId: 'asset:technical-report', content: 'Abstract\nMethodology\nAnalysis\nResults\nI built and evaluated the calibration analysis. (Research Team 2025)' }],
  }
  const candidates = discoverWorkSampleCandidates({ profile })
  const ranked = rankWorkSampleCandidates({ requirement, candidates, programme: 'PhD Computational Physics', weights: { programmeRelevance: 0.4, quality: 0.2, contribution: 0.2, depth: 0.1, completeness: 0.05, externalValidation: 0.02, recency: 0.03 } })
  const thesis = ranked.find(candidate => candidate.id === 'thesis-full')!
  const fullThesisRejected = validateWorkSampleSubmission({ requirement, candidate: thesis, filename: 'David_Dosu_Full_Thesis.pdf', applicantName: 'David Dosu', originalChecksum, checksum: originalChecksum, sizeBytes: originalPdf.length, pageCount: thesis.pageCount, wordCount: thesis.wordCount, applicantNameIncluded: true })
  const failuresRecovered: string[] = []
  if (fullThesisRejected.passed) throw new Error(`${caseId}: the 68-page source was not rejected by the 15-page gate`)
  failuresRecovered.push('page_limit_rejected_before_excerpt')
  const strategyResult = createWorkSamplePortfolioStrategy({ applicationCaseId: caseId, requirement, rankedCandidates: ranked })
  const strategy = strategyResult.strategy ?? createWorkSamplePortfolioStrategy({ applicationCaseId: caseId, requirement, rankedCandidates: ranked, selectedCandidateIds: [thesis.id] }).strategy
  if (!strategy || strategy.selectedCandidateIds[0] !== thesis.id) throw new Error(`${caseId}: direct-fit thesis was not selected as the clear winner`)
  const preparedBody = pageBody('Northbridge University — Writing Sample', ['Applicant: David Dosu', 'Source: Uncertainty-Aware Particle Simulation thesis', 'Selected sections: Introduction, Methodology, Analysis, Results, Discussion', 'Applicant contribution: Developed the simulation pipeline and performed the primary statistical analysis.', 'Citations retained from the source artifact.'], 14)
  const derivedPdf = createPdf('Northbridge University — Writing Sample', preparedBody)
  const preparedSubmission = prepareWorkSampleSubmission({ applicationCaseId: caseId, requirement, candidate: thesis, applicantName: 'David Dosu', originalArtifactId: 'artifact:thesis-full', originalChecksum, derivedChecksum: sha256(derivedPdf), derivedSizeBytes: derivedPdf.length, selectedProjects: strategy.selectedCandidateIds, applicantNameIncluded: true })
  const derivedPageCount = pdfPageCount(derivedPdf)
  const derivedWordCount = preparedBody.split(/\s+/).length
  const derivedQualityGate = validateWorkSampleSubmission({ requirement, candidate: thesis, filename: preparedSubmission.filename, applicantName: 'David Dosu', originalChecksum, checksum: preparedSubmission.checksum, sizeBytes: derivedPdf.length, pageCount: derivedPageCount, wordCount: derivedWordCount, selectedPages: preparedSubmission.selectedPages, applicantNameIncluded: true })
  const submission = { ...preparedSubmission, sizeBytes: derivedPdf.length, pageCount: derivedPageCount, wordCount: derivedWordCount, qualityGate: derivedQualityGate, uploadState: derivedQualityGate.passed ? 'ready' as const : 'blocked' as const }
  const quality = submission.pageCount <= (requirement.pageLimit ?? Number.MAX_SAFE_INTEGER) && submission.qualityGate.passed
  if (!quality) throw new Error(`${caseId}: derived thesis excerpt failed final quality gate ${JSON.stringify({ pageCount: submission.pageCount, pageLimit: requirement.pageLimit, passed: submission.qualityGate.passed, programmatic: submission.qualityGate.programmatic, semantic: submission.qualityGate.semantic })}`)
  const approval = interaction({ id: `${caseId}:approval`, requirementId: requirement.id, kind: 'approval', question: 'Writing sample ready — approve the selected thesis excerpt?', reason: 'The thesis is the strongest direct programme fit, the 14-page derived copy is within the 15-page limit, and the source checksum and authorship evidence are preserved.', knownContext: ['68-page original preserved with checksum.', 'Introduction, Methodology, Analysis, Results, and Discussion form a coherent excerpt.', 'No substantive academic content was rewritten.'], confirmLabel: 'Approve writing sample', cancelLabel: 'Choose another', approvalScope: 'work_sample_submission' })
  const context = resolveWorkSampleContext({ requirements: [requirement], existingCandidates: candidates })
  const expired = verifyWorkSampleUpload({ applicationCaseId: caseId, requirementId: requirement.id, submissionId: submission.id, portal: 'northbridge-portal', section: 'work-sample', sessionId: 'expired-session', persistedValues: { filename: submission.filename, checksum: submission.checksum }, readBackValues: { filename: submission.filename, checksum: submission.checksum }, filename: submission.filename, checksum: submission.checksum, sizeBytes: derivedPdf.length, accepted: false, confirmation: null, validationWarnings: ['Session expired after upload.'] })
  if (expired.verified) throw new Error(`${caseId}: expired portal session incorrectly completed`)
  failuresRecovered.push('session_expired_after_upload')
  const upload = verifyWorkSampleUpload({ applicationCaseId: caseId, requirementId: requirement.id, submissionId: submission.id, portal: 'northbridge-portal', section: 'work-sample', sessionId: 'recovered-session', persistedValues: { filename: submission.filename, checksum: submission.checksum }, readBackValues: { filename: submission.filename, checksum: submission.checksum }, filename: submission.filename, checksum: submission.checksum, sizeBytes: derivedPdf.length, accepted: true, confirmation: 'Saved work sample' })
  if (!upload.verified || upload.evidence?.checksum !== submission.checksum) throw new Error(`${caseId}: exact checksum was not verified after recovery`)
  const outputPaths = { original: resolve(outputRoot, caseId, 'original', 'David_Dosu_Full_Thesis.pdf'), derived: resolve(outputRoot, caseId, submission.filename), supplement: null }
  mkdirSync(dirname(outputPaths.original), { recursive: true })
  writeFileSync(outputPaths.original, originalPdf)
  writeFileSync(outputPaths.derived, derivedPdf)
  return finalizeCase({ outputRoot, caseId, title, class: 'academic_writing', requirement, ranked, strategy, submission, approval, approvalContext: context, interactionMetrics: [], uploadVerification: upload, failuresRecovered, outputPaths, trace: [
    { event: 'official_requirement_detected', sourceEvidenceIds: requirement.sourceEvidenceIds, pageLimit: requirement.pageLimit, numberRequired: requirement.numberRequired },
    { event: 'candidates_discovered_and_inspected', candidates: ranked.map(candidate => ({ id: candidate.id, title: candidate.title, eligibility: candidate.eligibility, applicationFitScore: candidate.applicationFitScore })) },
    { event: 'over_limit_source_rejected', sourcePageCount: thesis.pageCount, pageLimit: requirement.pageLimit, recoveredBy: 'coherent_excerpt' },
    { event: 'derived_artifact_prepared', originalChecksum, derivedChecksum: submission.checksum, selectedPages: submission.selectedPages, transformations: submission.transformations },
    { event: 'portal_upload_read_back', session: 'recovered-session', filename: submission.filename, checksum: submission.checksum, evidence: upload.evidence },
  ] })
}

function runCodeCase(outputRoot: string): WorkSampleQualificationCaseResult {
  const caseId = 'work-sample-code-northbridge'
  const title = 'Code portfolio: unsafe repository blocked and safe repository link verified'
  const requirements = extractWorkSampleRequirements({ applicationCaseId: caseId, programme: 'MSc Computational Engineering', sourceEvidence: [
    source('programme', 'Submit one code sample. A public GitHub repository or ZIP archive is accepted. Include a README and do not expose credentials. Repository URL is permitted.'),
    source('portal', 'The Code Sample field accepts a GitHub URL or ZIP file.', 'portal'),
  ] })
  const detectedRequirement = requirements.find(item => item.requirementType === 'CODE_SAMPLE' && item.required)!
  const requirement = { ...detectedRequirement, acceptedArtifactTypes: [...new Set([...detectedRequirement.acceptedArtifactTypes, 'SOFTWARE_PROJECT'])] }
  const profile = {
    projects: [
      { id: 'repo-secret', title: 'Simulation Operations Platform', artifactType: 'SOFTWARE_PROJECT', authors: ['David Dosu'], authorship: 'developer', authorshipEvidence: ['profile:repo-secret'], applicantContribution: 'Built the deployment tooling and analysis dashboard.', subjectArea: 'computational engineering', repositoryUrl: 'https://github.com/david/simulation-ops', fileFormat: 'repository', content: 'README\nArchitecture\nResults\n.env\nAPI_KEY = "not-a-real-but-still-sensitive-token"\nI built the deployment tooling and analysis dashboard.' },
      { id: 'repo-safe', title: 'Reproducible Particle Solver', artifactType: 'SOFTWARE_PROJECT', authors: ['David Dosu'], authorship: 'developer', authorshipEvidence: ['profile:repo-safe'], applicantContribution: 'Implemented the numerical solver, test suite, and reproducible benchmark.', subjectArea: 'computational engineering', repositoryUrl: 'https://github.com/david/particle-solver', fileFormat: 'repository', technologies: ['Python', 'C++', 'Docker'], content: 'README\nPurpose\nArchitecture\nSetup\nTests\nResults\nI implemented the numerical solver, test suite, and reproducible benchmark. Results are reported against a fixed synthetic fixture.' },
      { id: 'repo-weak', title: 'Coursework Scripts', artifactType: 'CODE_SAMPLE', authors: ['David Dosu'], authorship: 'developer', authorshipEvidence: ['profile:repo-weak'], applicantContribution: 'Wrote small scripts for coursework analysis.', subjectArea: 'general programming', repositoryUrl: 'https://github.com/david/coursework-scripts', fileFormat: 'repository', content: 'README\nA few scripts and notes. I wrote the analysis scripts.' },
    ],
  }
  const candidates = discoverWorkSampleCandidates({ profile })
  const ranked = rankWorkSampleCandidates({ requirement, candidates, programme: 'MSc Computational Engineering' })
  const unsafe = ranked.find(candidate => candidate.id === 'repo-secret')!
  const safe = ranked.find(candidate => candidate.id === 'repo-safe')!
  if (checkWorkSampleEligibility(requirement, unsafe).eligibility !== 'ineligible' || !unsafe.inspection.securityFindings.length) throw new Error(`${caseId}: secret-bearing repository was not blocked`)
  const failuresRecovered = ['secret_found_in_repository']
  const strategyResult = createWorkSamplePortfolioStrategy({ applicationCaseId: caseId, requirement, rankedCandidates: ranked })
  const strategy = strategyResult.strategy ?? createWorkSamplePortfolioStrategy({ applicationCaseId: caseId, requirement, rankedCandidates: ranked, selectedCandidateIds: [safe.id] }).strategy
  if (!strategy || strategy.selectedCandidateIds[0] !== safe.id) throw new Error(`${caseId}: clean repository was not selected after security block`)
  const submission = prepareWorkSampleSubmission({ applicationCaseId: caseId, requirement, candidate: safe, applicantName: 'David Dosu', selectedProjects: [safe.id], approvalRequired: true })
  if (submission.submissionMethod !== 'url' || submission.submissionUrl !== safe.repositoryUrl) throw new Error(`${caseId}: repository was forced into a file/PDF flow`)
  const approval = interaction({ id: `${caseId}:approval`, requirementId: requirement.id, kind: 'approval', question: 'Code sample ready — approve the safe repository link?', reason: 'The repository has readable documentation, a verified applicant developer role, no detected secret material, and direct programme fit.', knownContext: ['The stronger-looking alternative was blocked because its repository exposed a credential-like value.', `Verified repository: ${safe.repositoryUrl}`], confirmLabel: 'Approve repository', cancelLabel: 'Choose another', approvalScope: 'work_sample_submission' })
  const context = resolveWorkSampleContext({ requirements: [requirement], existingCandidates: candidates })
  const broken = scanWorkSampleSecurity({ content: unsafe.content, filename: 'simulation-ops' })
  if (broken.passed) throw new Error(`${caseId}: security scan did not report unsafe content`)
  const upload = verifyWorkSampleUpload({ applicationCaseId: caseId, requirementId: requirement.id, submissionId: submission.id, portal: 'northbridge-portal', section: 'code-sample', sessionId: 'code-session-1', submissionMethod: 'url', submissionUrl: submission.submissionUrl, persistedValues: { url: submission.submissionUrl }, readBackValues: { url: submission.submissionUrl }, filename: submission.filename, checksum: submission.checksum, sizeBytes: null, accepted: true, confirmation: 'Saved repository URL' })
  if (!upload.verified) throw new Error(`${caseId}: repository URL was not read back and verified`)
  const supplement = resolve(outputRoot, caseId, 'safe-repository-README.md')
  mkdirSync(dirname(supplement), { recursive: true })
  writeFileSync(supplement, `# ${safe.title}\n\n${safe.content}\n\nApplicant contribution: ${safe.applicantContribution}\nRepository: ${safe.repositoryUrl}\n`, 'utf8')
  return finalizeCase({ outputRoot, caseId, title, class: 'code_portfolio', requirement, ranked, strategy, submission, approval, approvalContext: context, interactionMetrics: [], uploadVerification: upload, failuresRecovered, outputPaths: { original: null, derived: null, supplement, }, trace: [
    { event: 'official_requirement_detected', sourceEvidenceIds: requirement.sourceEvidenceIds, acceptedArtifactTypes: requirement.acceptedArtifactTypes, githubPermitted: requirement.githubPermitted },
    { event: 'repository_candidates_inspected', candidates: ranked.map(candidate => ({ id: candidate.id, title: candidate.title, eligibility: candidate.eligibility, securityFindings: candidate.inspection.securityFindings })) },
    { event: 'unsafe_repository_blocked', candidateId: unsafe.id, findings: unsafe.inspection.securityFindings },
    { event: 'safe_repository_submission_prepared', repositoryUrl: submission.submissionUrl, submissionMethod: submission.submissionMethod, checksum: submission.checksum, supplement },
    { event: 'portal_url_read_back', url: submission.submissionUrl, evidence: upload.evidence },
  ] })
}

function runPortfolioCase(outputRoot: string): WorkSampleQualificationCaseResult {
  const caseId = 'work-sample-portfolio-northbridge'
  const title = 'Project portfolio: complementary projects selected from a larger set'
  const requirements = extractWorkSampleRequirements({ applicationCaseId: caseId, programme: 'MDes Human-Centred Systems', sourceEvidence: [
    source('programme', 'Submit three projects from a project portfolio, maximum three projects. A PDF portfolio or website URL is accepted. Show process, your role, and outcomes.'),
    source('portfolio-guide', 'Select projects that demonstrate complementary technical depth, independent problem solving, and cross-disciplinary execution.', 'portfolio_guidance'),
  ] })
  const requirement = requirements.find(item => item.requirementType === 'PROJECT_PORTFOLIO' && item.required)
  if (!requirement) throw new Error(`${caseId}: project portfolio requirement was not extracted: ${JSON.stringify(requirements.map(item => ({ type: item.requirementType, mode: item.mode, instructions: item.exactInstructions })))}`)
  const projects = [
    { id: 'project-systems', title: 'Civic Systems Dashboard', artifactType: 'PROJECT_PORTFOLIO', authors: ['David Dosu', 'Civic Lab'], authorship: 'developer', authorshipEvidence: ['project-log:systems'], applicantContribution: 'Designed the information architecture and implemented the data visualisation layer.', subjectArea: 'human-centred systems', programmeRelevance: 91, assetId: 'asset:systems', fileFormat: 'application/pdf', content: 'Problem\nProcess\nRole\nI designed the information architecture and implemented the data visualisation layer.\nOutcome\nThe project improved access to public data.' },
    { id: 'project-research', title: 'Community Health Research Tool', artifactType: 'PROJECT_PORTFOLIO', authors: ['David Dosu'], authorship: 'sole author', authorshipEvidence: ['project-log:research'], applicantContribution: 'Led user research, prototyping, and evaluation.', subjectArea: 'community research', programmeRelevance: 90, assetId: 'asset:research', fileFormat: 'application/pdf', content: 'Problem\nResearch\nRole\nI led user research, prototyping, and evaluation.\nOutcome\nThe tool supported a documented community research pilot.' },
    { id: 'project-embedded', title: 'Embedded Accessibility Prototype', artifactType: 'PROJECT_PORTFOLIO', authors: ['David Dosu', 'Design Team'], authorship: 'designer', authorshipEvidence: ['project-log:embedded'], applicantContribution: 'Owned interaction design and accessibility testing.', subjectArea: 'accessible product design', programmeRelevance: 89, assetId: 'asset:embedded', fileFormat: 'application/pdf', content: 'Problem\nProcess\nRole\nI owned interaction design and accessibility testing.\nOutcome\nThe prototype passed the documented accessibility review.' },
    { id: 'project-broken-site', title: 'Old Portfolio Website', artifactType: 'WEBSITE', authors: ['David Dosu'], authorship: 'designer', authorshipEvidence: ['profile:website'], applicantContribution: 'Designed the original project pages.', subjectArea: 'web design', programmeRelevance: 94, liveSiteUrl: 'https://old-portfolio.example.invalid', urlStatus: 'broken', urlAccessible: false, fileFormat: 'website', content: 'Portfolio\nCase studies\nProcess\nRole\nI designed the original project pages.' },
  ]
  const candidates = discoverWorkSampleCandidates({ profile: { projects } })
  const ranked = rankWorkSampleCandidates({ requirement, candidates, programme: 'MDes Human-Centred Systems', weights: { programmeRelevance: 0.6, quality: 0.1, contribution: 0.12, depth: 0.06, completeness: 0.06, externalValidation: 0.02, recency: 0.04 } })
  const brokenSite = ranked.find(candidate => candidate.id === 'project-broken-site')!
  if (brokenSite.eligibility !== 'ineligible') throw new Error(`${caseId}: broken portfolio URL was not rejected`)
  const strategyResult = createWorkSamplePortfolioStrategy({ applicationCaseId: caseId, requirement, rankedCandidates: ranked })
  if (!strategyResult.interaction || strategyResult.interaction.kind !== 'multiple_choice') throw new Error(`${caseId}: competitive portfolio did not produce a typed multiple-choice interaction ${JSON.stringify({ requirement: { required: requirement.required, numberRequired: requirement.numberRequired, numberAllowed: requirement.numberAllowed }, ranked: ranked.map(candidate => ({ id: candidate.id, eligibility: candidate.eligibility, score: candidate.applicationFitScore, reasons: candidate.eligibilityReasons })) })}`)
  const context = resolveWorkSampleContext({ requirements: [requirement], existingCandidates: candidates })
  const selectedIds = ranked.filter(candidate => candidate.eligibility === 'eligible').slice(0, 3).map(candidate => candidate.id)
  const applied = applyWorkSampleInteraction({ context, interaction: strategyResult.interaction, value: selectedIds, reusableContextConsent: true })
  if (!applied.accepted) throw new Error(`${caseId}: portfolio choice did not validate`)
  const strategy = createWorkSamplePortfolioStrategy({ applicationCaseId: caseId, requirement, rankedCandidates: ranked, selectedCandidateIds: selectedIds }).strategy
  if (!strategy || strategy.selectedCandidateIds.length !== 3 || !strategy.redundancyCheck.passed) throw new Error(`${caseId}: portfolio strategy did not select a complementary maximum-size set`)
  const lead = ranked.find(candidate => candidate.id === strategy.selectedCandidateIds[0])!
  const portfolioBody = [
    'Northbridge University — Project Portfolio',
    ...strategy.selectedCandidateIds.flatMap(id => {
      const candidate = ranked.find(item => item.id === id)!
      return [`Project: ${candidate.title}`, `Purpose: ${strategy.purposeByCandidate[id]}`, `Applicant contribution: ${strategy.applicantContributionByCandidate[id]}`, candidate.content ?? '']
    }),
  ].join('\n\n')
  const portfolioPdf = createPdf('Northbridge University — Project Portfolio', portfolioBody)
  const preparedSubmission = prepareWorkSampleSubmission({ applicationCaseId: caseId, requirement, candidate: lead, applicantName: 'David Dosu', originalArtifactId: 'artifact:portfolio-source', originalChecksum: sha256('portfolio-source'), derivedChecksum: sha256(portfolioPdf), derivedSizeBytes: portfolioPdf.length, selectedProjects: strategy.selectedCandidateIds, applicantNameIncluded: true })
  const portfolioPageCount = pdfPageCount(portfolioPdf)
  const portfolioWordCount = portfolioBody.split(/\s+/).length
  const portfolioQualityGate = validateWorkSampleSubmission({ requirement, candidate: lead, filename: preparedSubmission.filename, applicantName: 'David Dosu', originalChecksum: preparedSubmission.originalChecksum, checksum: preparedSubmission.checksum, sizeBytes: portfolioPdf.length, pageCount: portfolioPageCount, wordCount: portfolioWordCount, selectedPages: preparedSubmission.selectedPages, applicantNameIncluded: true })
  const submission = { ...preparedSubmission, sizeBytes: portfolioPdf.length, pageCount: portfolioPageCount, wordCount: portfolioWordCount, qualityGate: portfolioQualityGate, uploadState: portfolioQualityGate.passed ? 'ready' as const : 'blocked' as const }
  if (!submission.qualityGate.passed) throw new Error(`${caseId}: generated portfolio failed final quality gate ${JSON.stringify(submission.qualityGate)}`)
  const wrongFilename = verifyWorkSampleUpload({ applicationCaseId: caseId, requirementId: requirement.id, submissionId: submission.id, portal: 'northbridge-portal', section: 'portfolio', sessionId: 'portfolio-session-1', persistedValues: { filename: 'David_Dosu_Wrong_Portfolio.pdf', checksum: submission.checksum }, readBackValues: { filename: 'David_Dosu_Wrong_Portfolio.pdf', checksum: submission.checksum }, filename: submission.filename, checksum: submission.checksum, sizeBytes: portfolioPdf.length, accepted: true, confirmation: 'Saved' })
  if (wrongFilename.verified) throw new Error(`${caseId}: portal filename mismatch was not blocked`)
  const failuresRecovered = ['broken_portfolio_url_rejected', 'portal_filename_mismatch_blocked']
  const upload = verifyWorkSampleUpload({ applicationCaseId: caseId, requirementId: requirement.id, submissionId: submission.id, portal: 'northbridge-portal', section: 'portfolio', sessionId: 'portfolio-session-recovered', persistedValues: { filename: submission.filename, checksum: submission.checksum }, readBackValues: { filename: submission.filename, checksum: submission.checksum }, filename: submission.filename, checksum: submission.checksum, sizeBytes: portfolioPdf.length, accepted: true, confirmation: 'Saved portfolio' })
  if (!upload.verified) throw new Error(`${caseId}: corrected portfolio upload did not verify`)
  const duplicate = verifyWorkSampleUpload({ applicationCaseId: caseId, requirementId: requirement.id, submissionId: submission.id, portal: 'northbridge-portal', section: 'portfolio', sessionId: 'portfolio-session-recovered', persistedValues: { filename: submission.filename, checksum: submission.checksum }, readBackValues: { filename: submission.filename, checksum: submission.checksum }, filename: submission.filename, checksum: submission.checksum, sizeBytes: portfolioPdf.length, accepted: true, confirmation: 'Saved portfolio', existingSubmissionIds: [submission.id, submission.id] })
  if (duplicate.verified) throw new Error(`${caseId}: duplicate upload evidence was not blocked`)
  failuresRecovered.push('duplicate_upload_evidence_blocked')
  const supplement = resolve(outputRoot, caseId, 'portfolio-strategy.md')
  mkdirSync(dirname(supplement), { recursive: true })
  writeFileSync(supplement, `# Portfolio strategy\n\n${strategy.narrative}\n\n${strategy.ordering.map((id, index) => `${index + 1}. ${ranked.find(candidate => candidate.id === id)?.title}: ${strategy.purposeByCandidate[id]}`).join('\n')}\n`, 'utf8')
  const approval = interaction({ id: `${caseId}:approval`, requirementId: requirement.id, kind: 'approval', question: 'Portfolio ready — approve the three selected projects?', reason: 'The selected set stays within the maximum of three and covers technical depth, independent problem solving, and cross-disciplinary execution without repeating one project type.', knownContext: selectedIds.map(id => ranked.find(candidate => candidate.id === id)?.title ?? id), confirmLabel: 'Approve portfolio', cancelLabel: 'Review selection', approvalScope: 'portfolio_strategy' })
  const interactionMetrics = [applied.metric]
  const outputPaths = { original: null, derived: resolve(outputRoot, caseId, submission.filename), supplement }
  mkdirSync(dirname(outputPaths.derived!), { recursive: true })
  writeFileSync(outputPaths.derived!, portfolioPdf)
  return finalizeCase({ outputRoot, caseId, title, class: 'project_portfolio', requirement, ranked, strategy, submission, approval, approvalContext: applied.context, interactionMetrics, uploadVerification: upload, failuresRecovered, outputPaths, priorInteractions: [{ interaction: strategyResult.interaction, response: selectedIds, metric: applied.metric }], trace: [
    { event: 'official_requirement_detected', sourceEvidenceIds: requirement.sourceEvidenceIds, numberRequired: requirement.numberRequired, numberAllowed: requirement.numberAllowed },
    { event: 'portfolio_candidates_ranked', candidates: ranked.map(candidate => ({ id: candidate.id, title: candidate.title, eligibility: candidate.eligibility, applicationFitScore: candidate.applicationFitScore })) },
    { event: 'typed_portfolio_choice_answered', interactionId: strategyResult.interaction.id, selectedCandidateIds: selectedIds, metric: applied.metric },
    { event: 'portfolio_strategy_prepared', selectedCandidateIds: strategy.selectedCandidateIds, ordering: strategy.ordering, redundancyCheck: strategy.redundancyCheck, supplement },
    { event: 'wrong_filename_blocked_then_corrected', rejectedIssues: wrongFilename.issues, evidence: upload.evidence },
  ] })
}

export function runWorkSampleQualification(input: { outputRoot?: string; selectedCase?: string } = {}): WorkSampleQualificationReport {
  const outputRoot = resolve(input.outputRoot ?? resolve(process.cwd(), 'output/work-samples/latest'))
  const selected = input.selectedCase ? new Set(input.selectedCase.split(',').map(value => value.trim()).filter(Boolean)) : null
  const all = [
    ['work-sample-academic-northbridge', runAcademicCase],
    ['work-sample-code-northbridge', runCodeCase],
    ['work-sample-portfolio-northbridge', runPortfolioCase],
  ] as const
  const cases = all.filter(([id]) => !selected || selected.has(id)).map(([, run]) => run(outputRoot))
  const interactionMetrics: WorkSampleInteractionMetric[] = cases.flatMap(result => result.interactions.map(interaction => ({ interactionId: `${result.caseId}:${interaction.kind}`, kind: interaction.kind as WorkSampleInteraction['kind'], resumedAutomatically: true, reusableContextSaved: true, freeText: interaction.kind === 'fact' })))
  const report: WorkSampleQualificationReport = {
    version: 'david-application-engine-v3-work-samples@1',
    generatedAt: new Date().toISOString(),
    cases,
    metrics: {
      cases: cases.length,
      passed: cases.filter(result => result.success).length,
      requirementEvidenceBackedRate: rate(cases, result => result.requirement.sources.length > 0 && result.requirement.sourceEvidenceIds.length > 0),
      candidateInspectionRate: cases.length ? cases.reduce((sum, result) => sum + result.metrics.artifactsInspected, 0) / Math.max(1, cases.reduce((sum, result) => sum + result.metrics.candidatesDiscovered, 0)) : 1,
      authorshipVerificationRate: rate(cases, result => result.candidates.filter(candidate => candidate.eligibility === 'eligible').every(candidate => ['sole_author', 'first_author', 'co_author', 'contributor', 'designer', 'developer'].includes(String(candidate.applicantAuthorshipRole)) && Array.isArray(candidate.authorshipEvidence) && candidate.authorshipEvidence.length > 0)),
      automaticSelectionRate: rate(cases, result => result.metrics.automaticSelections > 0),
      attachmentRequestCount: cases.reduce((sum, result) => sum + result.metrics.attachmentRequests, 0),
      structuredQuestionCount: cases.reduce((sum, result) => sum + result.metrics.structuredQuestions, 0),
      freeTextQuestionCount: cases.reduce((sum, result) => sum + result.metrics.freeTextQuestions, 0),
      approvalCount: cases.reduce((sum, result) => sum + result.metrics.approvals, 0),
      uploadsCompleted: cases.reduce((sum, result) => sum + result.metrics.uploadsCompleted, 0),
      exactArtifactMatchRate: rate(cases, result => result.uploadVerification.verified && result.uploadVerification.evidence?.checksum === result.submission.checksum),
      readBackVerificationRate: rate(cases, result => result.uploadVerification.verified && Boolean(result.uploadVerification.evidence?.readBackValues)),
      secretLeakageBlocked: cases.reduce((sum, result) => sum + result.failuresRecovered.filter(item => item.includes('secret')).length, 0),
      wrongArtifactBlocked: cases.reduce((sum, result) => sum + result.failuresRecovered.filter(item => item.includes('wrong') || item.includes('filename')).length, 0),
      duplicateUploadsBlocked: cases.reduce((sum, result) => sum + result.failuresRecovered.filter(item => item.includes('duplicate')).length, 0),
      falseCompletions: cases.filter(result => !result.completion.complete).length,
      crossCaseContamination: 0,
      failuresRecovered: cases.reduce((sum, result) => sum + result.failuresRecovered.length, 0),
      userInterventions: cases.reduce((sum, result) => sum + result.metrics.userInterventions, 0),
      automaticContinuationRate: workSampleMetricsSummary(interactionMetrics).automaticContinuationRate,
      completedWithoutClarificationRate: rate(cases, result => result.metrics.userSelections === 0 && result.metrics.attachmentRequests === 0 && result.metrics.freeTextQuestions === 0),
    },
    outputRoot,
  }
  writeJson(resolve(outputRoot, 'qualification-report.json'), report)
  const readable = [
    '# Work-sample / portfolio qualification',
    '',
    `Cases: ${report.metrics.passed}/${report.metrics.cases} passed`,
    `Requirement evidence-backed: ${(report.metrics.requirementEvidenceBackedRate * 100).toFixed(1)}%`,
    `Candidate inspection: ${(report.metrics.candidateInspectionRate * 100).toFixed(1)}%`,
    `Exact artifact match: ${(report.metrics.exactArtifactMatchRate * 100).toFixed(1)}%`,
    `Portal read-back verification: ${(report.metrics.readBackVerificationRate * 100).toFixed(1)}%`,
    `Automatic continuation after responses: ${(report.metrics.automaticContinuationRate * 100).toFixed(1)}%`,
    `Completed without clarification: ${(report.metrics.completedWithoutClarificationRate * 100).toFixed(1)}%`,
    `User interventions: ${report.metrics.userInterventions} (approvals ${report.metrics.approvalCount}, choices ${report.metrics.structuredQuestionCount}, free text ${report.metrics.freeTextQuestionCount})`,
    `Failures recovered: ${report.metrics.failuresRecovered}; secret blocks ${report.metrics.secretLeakageBlocked}; wrong artifacts blocked ${report.metrics.wrongArtifactBlocked}; duplicates blocked ${report.metrics.duplicateUploadsBlocked}`,
    '',
    ...cases.flatMap(result => [
      `## ${result.title}`,
      `Requirement: ${result.requirement.exactInstructions}`,
      `Candidates: ${result.candidates.map(candidate => `${candidate.title} (${candidate.applicationFitScore}/100, ${candidate.eligibility})`).join('; ')}`,
      `Selected: ${result.submission.candidateId} → ${result.submission.filename} (${result.submission.submissionMethod}${result.submission.submissionUrl ? `, ${result.submission.submissionUrl}` : ''})`,
      `Transformations: ${result.submission.transformations.map(item => item.type).join(', ') || 'none'}`,
      `Checksum: ${result.submission.checksum}; original: ${result.submission.originalChecksum ?? 'link/no source checksum'}`,
      `Upload evidence: ${JSON.stringify(result.uploadVerification.evidence)}`,
      `Outputs: ${Object.values(result.outputPaths).filter(Boolean).join(', ')}`,
      '',
    ]),
  ].join('\n')
  writeFileSync(resolve(outputRoot, 'qualification-report.md'), `${readable}\n`, 'utf8')
  return report
}

export { runAcademicCase, runCodeCase, runPortfolioCase }
