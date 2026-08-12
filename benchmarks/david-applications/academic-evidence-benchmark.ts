import {
  applyAcademicProgressInteraction,
  buildAcademicTestDateSelection,
  chooseEnglishTest,
  coordinateAcademicEvidence,
  createDerivedAcademicArtifact,
  evaluateAdmissionsTestAttempt,
  evaluateEnglishWaiver,
  evaluateLanguageTestAttempt,
  inspectTranscriptArtifact,
  recommendOptionalAdmissionsScore,
  transitionAcademicDelivery,
  transitionCredentialEvaluation,
  type AcademicCompletionEvidence,
  type AcademicEvidenceRequirement,
  type AdmissionsTestAttempt,
  type AdmissionsTestPolicy,
  type CredentialEvaluationCase,
  type LanguageTestAttempt,
} from '../../supabase/functions/_shared/academic-evidence'

export type AcademicEvidenceRegression = {
  id: string
  passed: boolean
  detail: string
}

export type AcademicEvidenceQualification = {
  suiteVersion: string
  passed: boolean
  metrics: Record<string, number | boolean | string>
  regressionCases: AcademicEvidenceRegression[]
  progressDetailExamples: Record<string, { kind: string; question: string; reason: string; knownContext: string[] }>
  examples: {
    primaryPlan: Record<string, unknown>
    missingOfficialDocumentPlan: Record<string, unknown>
    missingTranscriptPlan: Record<string, unknown>
    waiverPlan: Record<string, unknown>
    testSelectionPlan: Record<string, unknown>
    optionalGrePlan: Record<string, unknown>
    transcriptMatrix: Record<string, unknown>
    credentialEvaluationTracking: Record<string, unknown>
    languageDecision: Record<string, unknown>
    optionalGreDecision: Record<string, unknown>
    testDateSelection: Record<string, unknown>
    forcedFailures: Record<string, unknown>
  }
}

const SUITE_VERSION = 'academic-evidence-qualification@1.0.0'
const applicantId = 'academic-benchmark-applicant'
const source = {
  id: 'benchmark:official:academic-guide',
  url: 'https://admissions.example.edu/graduate/academic-records',
  authority: 'official_programme_page' as const,
  sourceType: 'official_academic_guide',
  excerpt: 'Applicants must provide complete transcripts, degree evidence, and the exact published test or evaluation result before the application is complete.',
  claims: ['complete_transcript', 'degree_evidence', 'published_test_policy'],
  retrievedAt: '2026-08-12T00:00:00.000Z',
}

function transcript(id: string, institution: string, filename: string) {
  return {
    id,
    applicantId,
    artifactType: 'transcript',
    institution,
    filename,
    mimeType: 'application/pdf',
    sizeBytes: 180_000,
    pageCount: 2,
    checksum: `sha256:${id}`,
    officialStatus: 'official',
    source: 'registrar_upload',
    content: {
      applicantIdentityPresent: true,
      institutionPresent: true,
      courseGradeContentPresent: true,
      readable: true,
      gradingLegendPresent: true,
      degreeConferralPresent: false,
      pageNumbers: [1, 2],
      declaredPageCount: 2,
    },
    provenance: [{ ...source, id: `${id}:provenance`, authority: 'uploaded_document' as const, sourceType: 'registrar_document' }],
  }
}

function degree(id: string, institution: string) {
  return {
    ...transcript(id, institution, `${id}.pdf`),
    artifactType: 'degree_certificate',
    content: { ...transcript(id, institution, `${id}.pdf`).content, degreeConferralPresent: true, gradingLegendPresent: false },
  }
}

function rule(requirementType: AcademicEvidenceRequirement['requirementType'], institution: string, overrides: Record<string, unknown> = {}) {
  return { requirementType, institution, sourceEvidence: [source], ...overrides }
}

function application(applicationCaseId: string, institution: string, programme: string, rules: unknown[]) {
  return { applicationCaseId, institution, programme, deadline: '2026-10-01T23:59:00.000Z', deadlineTimezone: 'Africa/Lagos', rules: rules as never[] }
}

function languageAttempt(): LanguageTestAttempt {
  return {
    id: 'ielts:academic-benchmark:2026-04-01', applicantId, testProvider: 'IELTS', testType: 'IELTS', testVersion: 'Academic', testDate: '2026-04-01', overallScore: 7.5,
    sectionScores: { reading: 7, writing: 7, listening: 8, speaking: 7 }, candidateOrReportNumber: 'IELTS-BENCHMARK-1', validUntil: '2028-04-01', scoreReportArtifactId: 'artifact:ielts-report', officialReportState: 'delivered', recipients: [], provenance: [source],
  }
}

function admissionsAttempt(): AdmissionsTestAttempt {
  return {
    id: 'gre:academic-benchmark:2026-03-01', applicantId, testType: 'GRE', testDate: '2026-03-01', overallScore: 326, compositeScore: null,
    sectionScores: { quantitative: 165, verbal: 161 }, percentile: 93, writingScore: 4.5, candidateOrReportNumber: 'GRE-BENCHMARK-1', validUntil: '2031-03-01', scoreArtifactId: 'artifact:gre-report', officialReportState: 'delivered', recipients: [], provenance: [source],
  }
}

function primaryRules(institution: string) {
  return [
    rule('transcript', institution, { officialStatus: 'official', acceptedEvidenceTypes: ['transcript'], submissionMethod: { mode: 'applicant_upload' } }),
    rule('degree_certificate', institution, { officialStatus: 'official', acceptedEvidenceTypes: ['degree_certificate'], exactRule: { finalDocumentRequired: true, degreeConferralRequired: true }, submissionMethod: { mode: 'applicant_upload' } }),
    rule('credential_evaluation', institution, { externalProvider: { name: 'WES', product: 'course_by_course' }, acceptedEvidenceTypes: ['transcript', 'degree_certificate'], exactRule: { evaluationType: 'course_by_course', institutions: [institution], requiredDocuments: ['transcript', 'degree_certificate'] }, cost: { amount: 205, currency: 'USD', known: true, sourceEvidenceIds: [source.id] } }),
    rule('english_language_test', institution, { exactRule: { acceptedTests: [{ type: 'IELTS', minimumOverall: 7, minimumSections: { reading: 6.5, writing: 6.5 }, validityMonths: 24 }] } }),
    rule('admissions_test', institution, { requiredness: 'optional', exactRule: { acceptedTestTypes: ['GRE'], publishedRanges: [{ testType: 'GRE', section: 'overall', low: 320, high: 330, sourceEvidenceIds: [source.id] }] } }),
  ]
}

export function runAcademicEvidenceQualification(): AcademicEvidenceQualification {
  const now = '2026-08-12T00:00:00.000Z'
  const primaryPlan = coordinateAcademicEvidence({
    applications: [
      application('academic-case-a', 'University of Benin', 'MSc Data Science', primaryRules('University of Benin')),
      application('academic-case-b', 'University of Lagos', 'MSc Computer Science', [
        ...primaryRules('University of Lagos').filter(item => item.requirementType !== 'english_language_test'),
        rule('english_language_test', 'University of Lagos', { exactRule: { acceptedTests: [{ type: 'TOEFL iBT', minimumOverall: 95, minimumSections: { writing: 22 }, validityMonths: 24 }], waiverCriteria: [{ id: 'english-medium-degree', label: 'Degree taught in English' }] } }),
        rule('admissions_test', 'University of Lagos', { requiredness: 'not_accepted', exactRule: { acceptedTestTypes: ['GRE'] } }),
      ]),
    ],
    context: {
      applicantId,
      applicantProfile: { legalName: 'Benchmark Applicant', education: [{ institution: 'University of Benin', degree: 'BSc Computer Science', degreeConferralDate: '2022-07-01' }, { institution: 'University of Lagos', degree: 'BSc Computer Science', degreeConferralDate: '2022-07-01' }] },
      canonicalCv: { education: [{ institution: 'University of Benin', degree: 'BSc Computer Science' }] },
      uploadedDocuments: [transcript('artifact:transcript:benin', 'University of Benin', 'benchmark_transcript_benin.pdf'), transcript('artifact:transcript:lagos', 'University of Lagos', 'benchmark_transcript_lagos.pdf'), degree('artifact:degree:benin', 'University of Benin')],
      scoreReports: [languageAttempt(), admissionsAttempt()],
      previousApplicationCases: [{ applicationCaseId: 'old-case', institution: 'University of Benin', uploadedDocuments: [{ id: 'artifact:old-transcript', artifactType: 'transcript' }] }],
      previousProviderConfirmations: [{ provider: 'WES', evaluationType: 'course_by_course', state: 'provider_selected' }],
    },
    now,
  })
  const missingOfficialDocumentPlan = coordinateAcademicEvidence({
    applications: [application('academic-case-c', 'University of Ibadan', 'MSc Statistics', [rule('transcript', 'University of Ibadan', { officialStatus: 'official', submissionMethod: { mode: 'institution_direct', recipient: 'Graduate Admissions' } })])],
    context: { applicantId, applicantProfile: { education: [{ institution: 'University of Ibadan', degree: 'BSc Statistics' }] } },
    now,
  })
  const missingTranscriptPlan = coordinateAcademicEvidence({
    applications: [application('academic-case-d', 'University of Rwanda', 'MSc Statistics', [rule('transcript', 'University of Rwanda', { officialStatus: 'either', submissionMethod: { mode: 'applicant_upload' } })])],
    context: { applicantId, applicantProfile: { education: [{ institution: 'University of Rwanda', degree: 'BSc Statistics' }] } },
    now,
  })
  const waiverPlan = coordinateAcademicEvidence({
    applications: [application('academic-case-e', 'University of Cambridge', 'MPhil Data Intensive Science', [rule('english_language_test', 'University of Cambridge', { exactRule: { acceptedTests: [{ type: 'IELTS', minimumOverall: 7, minimumSections: { writing: 6.5 } }], waiverCriteria: [{ id: 'english-medium-degree', label: 'Degree taught in English' }] } })])],
    context: { applicantId, applicantProfile: { education: [{ institution: 'University of Benin', degree: 'BSc Computer Science' }] } },
    now,
  })
  const testSelectionPlan = coordinateAcademicEvidence({
    applications: [application('academic-case-f', 'University of Oxford', 'MSc Statistical Science', [rule('english_language_test', 'University of Oxford', { exactRule: { acceptedTests: [{ type: 'IELTS', resultDays: 13 }, { type: 'TOEFL iBT', resultDays: 8 }] } })])],
    context: { applicantId },
    now,
  })
  const optionalGrePlan = coordinateAcademicEvidence({
    applications: [application('academic-case-g', 'University of Chicago', 'MS Computer Science', [rule('admissions_test', 'University of Chicago', { requiredness: 'optional', exactRule: { acceptedTestTypes: ['GRE'], publishedRanges: [{ testType: 'GRE', section: 'overall', low: 330, high: 340, sourceEvidenceIds: [source.id] }] } })])],
    context: { applicantId, scoreReports: [admissionsAttempt()] },
    now,
  })
  const testDateSelection = buildAcademicTestDateSelection({
    requirementId: 'academic-case-f:english-language-test',
    dates: [
      { id: 'ielts-2026-09-12', label: '12 September — Lagos', date: '2026-09-12T09:00:00.000Z', resultDate: '2026-09-25', location: 'Lagos' },
      { id: 'ielts-2026-09-19', label: '19 September — Lagos', date: '2026-09-19T09:00:00.000Z', resultDate: '2026-10-02', location: 'Lagos' },
    ],
    deadlines: ['2026-10-10T23:59:00.000Z'],
    calendarEvents: [{ start: '2026-09-19T08:00:00.000Z', end: '2026-09-19T12:00:00.000Z' }],
    timezone: 'Africa/Lagos',
  })
  const testChoice = chooseEnglishTest({
    acceptedTests: [{ type: 'IELTS' }, { type: 'TOEFL iBT' }],
    applicationRequirements: [
      { applicationCaseId: 'academic-case-a', acceptedTestTypes: ['IELTS', 'TOEFL iBT'], deadline: '2026-10-01T23:59:00.000Z' },
      { applicationCaseId: 'academic-case-b', acceptedTestTypes: ['TOEFL iBT'], deadline: '2026-10-15T23:59:00.000Z' },
    ],
    options: [
      { testType: 'IELTS', resultDays: 13, preparationScore: 8, cost: { amount: 250, currency: 'USD', known: true, sourceEvidenceIds: [source.id] } },
      { testType: 'TOEFL iBT', resultDays: 8, preparationScore: 4, cost: { amount: 245, currency: 'USD', known: true, sourceEvidenceIds: [source.id] } },
    ],
    now,
  })
  const transcriptFailure = inspectTranscriptArtifact({
    artifact: { ...transcript('artifact:broken-transcript', 'University of Benin', 'broken.pdf'), pageCount: 3, content: { ...transcript('artifact:broken-transcript', 'University of Benin', 'broken.pdf').content, pageNumbers: [1, 3], gradingLegendPresent: false } },
    expectedApplicantId: applicantId,
    expectedInstitution: 'University of Benin',
    requireGradingLegend: true,
  })
  const languageRequirement = primaryPlan.requirements.find(item => item.requirementType === 'english_language_test' && item.institution === 'University of Benin')
  const languageFailure = languageRequirement ? evaluateLanguageTestAttempt({ requirement: languageRequirement, attempt: { ...languageAttempt(), sectionScores: { ...languageAttempt().sectionScores, writing: 6 } }, now }) : null
  const admissionsPolicy: AdmissionsTestPolicy = { requiredness: 'optional', acceptedTestTypes: ['GRE'], publishedRanges: [{ testType: 'GRE', section: 'overall', low: 330, high: 340, sourceEvidenceIds: [source.id] }], sourceEvidence: [source] }
  const optionalDecision = recommendOptionalAdmissionsScore({ policy: admissionsPolicy, attempt: admissionsAttempt() })
  const waiverDecision = waiverPlan.requirements[0] ? evaluateEnglishWaiver({ requirement: waiverPlan.requirements[0], evidence: [] }) : null
  const evaluation = primaryPlan.credentialEvaluationCases[0]
  const evaluationEvidence: AcademicCompletionEvidence = { id: 'evidence:wes-complete', kind: 'provider_confirmation', verified: true, applicationCaseId: evaluation?.applicationCaseIds[0] ?? 'academic-case-a', requirementId: evaluation?.requirementIds[0] ?? 'evaluation', provider: 'WES', providerId: 'WES-BENCHMARK', recipient: null, artifactId: null, checksum: null, capturedAt: now, excerpt: 'Provider confirms evaluation complete.' }
  const illegalTransition = evaluation ? (() => { try { transitionCredentialEvaluation({ evaluation, to: 'complete' }) ; return false } catch { return true } })() : false
  const completedTransition = evaluation ? transitionCredentialEvaluation({ evaluation: { ...evaluation, state: 'evaluation_in_progress' }, to: 'evaluation_complete', evidence: [evaluationEvidence] }).state === 'evaluation_complete' : false
  const derivedFailure = (() => { try { createDerivedAcademicArtifact({ original: transcript('artifact:immutable', 'University of Benin', 'original.pdf') as never, derivedId: 'artifact:tampered', derivedChecksum: 'sha256:tampered', filename: 'tampered.pdf', transformations: ['rewrite grades'] }); return false } catch { return true } })()
  const translationFailure = inspectTranscriptArtifact({ artifact: transcript('artifact:translation-missing', 'University of Benin', 'translation-missing.pdf'), expectedApplicantId: applicantId, expectedInstitution: 'University of Benin', requireTranslation: true, requireCertifiedTranslation: true })
  const unverifiedAdmissionsScore = evaluateAdmissionsTestAttempt({ policy: admissionsPolicy, attempt: { ...admissionsAttempt(), scoreArtifactId: null, provenance: [] } })
  const interaction = missingOfficialDocumentPlan.interaction
  const typedInteractionAccepted = interaction ? applyAcademicProgressInteraction({ context: missingOfficialDocumentPlan.context, interaction, value: true, submittedAt: now }).accepted : false
  const sensitiveInteractionRejected = interaction ? applyAcademicProgressInteraction({ context: missingOfficialDocumentPlan.context, interaction: { ...interaction, mapsToRequirement: 'provider_password' }, value: true, submittedAt: now }).accepted === false : false
  const evaluationTracking = evaluation ? (() => {
    let current = evaluation
    const events: Array<Record<string, unknown>> = []
    let institutionDeliveries = evaluation.institutionDeliveries
    for (const [index, delivery] of institutionDeliveries.entries()) {
      let currentDelivery = transitionAcademicDelivery({ delivery, to: 'ordered', evidence: [{ ...evaluationEvidence, id: `evidence:registrar-order:${index + 1}`, kind: 'registrar_confirmation', recipient: delivery.recipient ?? 'WES', excerpt: `Registrar confirmed the ${delivery.institution} delivery order.` }] })
      currentDelivery = transitionAcademicDelivery({ delivery: currentDelivery, to: 'processing' })
      currentDelivery = transitionAcademicDelivery({ delivery: currentDelivery, to: 'dispatched', evidence: [{ ...evaluationEvidence, id: `evidence:registrar-dispatched:${index + 1}`, kind: 'delivery_acknowledgement', recipient: delivery.recipient ?? 'WES', excerpt: `WES confirms ${delivery.institution} documents were dispatched.` }] })
      currentDelivery = transitionAcademicDelivery({ delivery: currentDelivery, to: 'delivered', evidence: [{ ...evaluationEvidence, id: `evidence:registrar-delivered:${index + 1}`, kind: 'delivery_acknowledgement', recipient: delivery.recipient ?? 'WES', excerpt: `WES confirms receipt of ${delivery.institution} documents.` }] })
      currentDelivery = transitionAcademicDelivery({ delivery: currentDelivery, to: 'accepted', evidence: [{ ...evaluationEvidence, id: `evidence:registrar-accepted:${index + 1}`, kind: 'provider_confirmation', recipient: delivery.recipient ?? 'WES', excerpt: `WES accepts ${delivery.institution} documents.` }] })
      institutionDeliveries = institutionDeliveries.map((candidate, candidateIndex) => candidateIndex === index ? currentDelivery : candidate)
    }
    const advance = (to: CredentialEvaluationCase['state'], evidence?: AcademicCompletionEvidence) => {
      current = transitionCredentialEvaluation({ evaluation: current, to, evidence: evidence ? [evidence] : undefined })
      events.push({ state: to, evidence: evidence?.id ?? null })
    }
    advance('provider_selected')
    advance('evaluation_order_ready')
    advance('ordered')
    advance('reference_number_issued')
    advance('documents_requested')
    advance('awaiting_institution_documents')
    advance('documents_received')
    advance('evaluation_in_progress')
    advance('evaluation_complete', { ...evaluationEvidence, id: 'evidence:wes-evaluation-complete', excerpt: 'WES confirms the evaluation is complete.' })
    advance('report_dispatch_pending')
    advance('report_sent', { ...evaluationEvidence, id: 'evidence:wes-report-sent', kind: 'delivery_acknowledgement', excerpt: 'WES confirms the report was sent to the university.' })
    advance('university_received', { ...evaluationEvidence, id: 'evidence:university-received', kind: 'portal_acceptance', recipient: 'University of Benin', excerpt: 'The university portal marks the WES report received.' })
    advance('complete', { ...evaluationEvidence, id: 'evidence:university-accepted', kind: 'portal_acceptance', recipient: 'University of Lagos', excerpt: 'The dependent application portal accepts the report.' })
    return { provider: current.provider, evaluationType: current.evaluationType, requiredDocuments: current.requiredDocuments, institutionDeliveries, events, finalState: current.state, reportDispatchState: current.reportDispatchState, universityReceiptStates: current.universityReceiptStates }
  })() : {}
  const regressionCases: AcademicEvidenceRegression[] = [
    { id: 'transcript-missing-page-and-legend', passed: !transcriptFailure.accepted && transcriptFailure.reasons.includes('missing_page') && transcriptFailure.reasons.includes('grading_legend_missing'), detail: transcriptFailure.reasons.join(', ') },
    { id: 'english-subsection-threshold', passed: languageFailure?.state === 'fails_subscore', detail: languageFailure?.reasons.join(' ') ?? 'No language requirement found' },
    { id: 'optional-gre-withhold-below-published-range', passed: optionalDecision.recommendation === 'WITHHOLD', detail: optionalDecision.rationale },
    { id: 'credential-illegal-transition', passed: illegalTransition, detail: 'Completion without provider evidence was rejected.' },
    { id: 'credential-provider-evidence-transition', passed: completedTransition, detail: 'Provider evidence advanced the evaluation to evaluation_complete.' },
    { id: 'derived-artifact-fact-mutation', passed: derivedFailure, detail: 'Grade mutation was rejected while preserving the original artifact.' },
    { id: 'typed-progress-detail-boundary', passed: Boolean(interaction && typedInteractionAccepted && sensitiveInteractionRejected), detail: interaction?.question ?? 'No typed interaction generated.' },
    { id: 'institution-direct-official-order', passed: missingOfficialDocumentPlan.nextAction?.kind === 'request_official_document' && missingOfficialDocumentPlan.interaction?.kind === 'confirmation', detail: missingOfficialDocumentPlan.nextAction?.rationale ?? 'No official request action.' },
    { id: 'multi-case-evaluation-deduplication', passed: primaryPlan.credentialEvaluationCases.length === 1 && primaryPlan.coverageMap.entries.some(entry => entry.kind === 'credential_evaluation' && entry.coverageCount === 2), detail: `${primaryPlan.credentialEvaluationCases.length} evaluation case; ${primaryPlan.metrics.duplicateCostsPrevented} duplicate actions prevented.` },
    { id: 'translation-and-certification-gate', passed: !translationFailure.accepted && translationFailure.reasons.includes('translation_missing') && translationFailure.reasons.includes('certified_translation_missing'), detail: translationFailure.reasons.join(', ') },
    { id: 'unverified-admissions-score-not-submitted', passed: unverifiedAdmissionsScore.state === 'verification_needed', detail: unverifiedAdmissionsScore.reasons.join(' ') },
    { id: 'waiver-before-invalid-score', passed: waiverPlan.requirements[0]?.status === 'waiver_evidence_needed' && waiverPlan.nextAction?.kind === 'request_waiver_evidence', detail: waiverDecision?.rationale ?? 'No waiver decision.' },
    { id: 'optional-gre-strategy-is-typed', passed: optionalGrePlan.nextAction?.kind === 'submit_optional_score' && optionalGrePlan.interaction?.kind === 'single_choice', detail: optionalGrePlan.nextAction?.rationale ?? 'No optional-score decision.' },
    { id: 'test-date-selection-is-calendar-safe', passed: testDateSelection.rankedDates.length === 1 && testDateSelection.rankedDates[0]?.id === 'ielts-2026-09-12' && testDateSelection.interaction.kind === 'date', detail: testDateSelection.interaction.question },
  ]
  const progressDetailExamples = [primaryPlan.interaction, missingOfficialDocumentPlan.interaction, missingTranscriptPlan.interaction, waiverPlan.interaction, testSelectionPlan.interaction, optionalGrePlan.interaction, testDateSelection.interaction].filter(Boolean).reduce<Record<string, { kind: string; question: string; reason: string; knownContext: string[] }>>((result, current, index) => {
    if (current) result[`${index + 1}:${current.id}`] = { kind: current.kind, question: current.question, reason: current.reason, knownContext: current.knownContext }
    return result
  }, {})
  const falseCompletions = primaryPlan.requirements.filter(requirement => requirement.status === 'complete' && !['not_accepted', 'waived'].includes(requirement.requiredness)).length
  const passed = regressionCases.every(item => item.passed) && falseCompletions === 0 && primaryPlan.context.checkedSources.length >= 10 && primaryPlan.coverageMap.duplicateActionsPrevented > 0
  return {
    suiteVersion: SUITE_VERSION,
    passed,
    metrics: {
      requirementsDetected: primaryPlan.metrics.requirementsDetected,
      institutionsCovered: new Set(primaryPlan.requirements.map(item => item.institution)).size,
      applicationsCovered: new Set(primaryPlan.requirements.map(item => item.applicationCaseId)).size,
      credentialEvaluationCases: primaryPlan.credentialEvaluationCases.length,
      duplicateCostsPrevented: primaryPlan.metrics.duplicateCostsPrevented,
      sourceCheckedSources: primaryPlan.context.checkedSources.length,
      typedInteractions: Object.keys(progressDetailExamples).length,
      sensitiveInteractionsRejected: sensitiveInteractionRejected ? 1 : 0,
      falseCompletions,
      forcedFailureCases: regressionCases.length,
      passedRegressionCases: regressionCases.filter(item => item.passed).length,
      passed,
    },
    regressionCases,
    progressDetailExamples,
    examples: {
      primaryPlan: {
        version: primaryPlan.version,
        nextAction: primaryPlan.nextAction,
        interaction: primaryPlan.interaction,
        requirements: primaryPlan.requirements.map(item => ({ id: item.id, institution: item.institution, type: item.requirementType, status: item.status, requiredness: item.requiredness, sourceEvidenceIds: item.sourceEvidence.map(evidence => evidence.id), artifactId: item.currentArtifact?.id ?? null })),
        credentialEvaluationCases: primaryPlan.credentialEvaluationCases,
        coverageMap: primaryPlan.coverageMap,
      },
      missingOfficialDocumentPlan: { nextAction: missingOfficialDocumentPlan.nextAction, interaction: missingOfficialDocumentPlan.interaction, blockers: missingOfficialDocumentPlan.blockers },
      missingTranscriptPlan: { nextAction: missingTranscriptPlan.nextAction, interaction: missingTranscriptPlan.interaction, blockers: missingTranscriptPlan.blockers },
      waiverPlan: { requirement: waiverPlan.requirements[0], nextAction: waiverPlan.nextAction, interaction: waiverPlan.interaction, decision: waiverDecision },
      testSelectionPlan: { requirement: testSelectionPlan.requirements[0], nextAction: testSelectionPlan.nextAction, interaction: testSelectionPlan.interaction, recommendedTest: testChoice.recommendation, rankedTests: testChoice.ranked },
      optionalGrePlan: { requirement: optionalGrePlan.requirements[0], nextAction: optionalGrePlan.nextAction, interaction: optionalGrePlan.interaction },
      transcriptMatrix: primaryPlan.requirements.filter(item => ['transcript', 'degree_certificate', 'proof_of_graduation'].includes(item.requirementType)).map(item => ({ applicationCaseId: item.applicationCaseId, institution: item.institution, type: item.requirementType, requiredness: item.requiredness, status: item.status, officialStatus: item.officialStatus, artifactId: item.currentArtifact?.id ?? null, submissionMethod: item.submissionMethod.mode })),
      credentialEvaluationTracking: evaluationTracking,
      languageDecision: { benin: primaryPlan.requirements.find(item => item.requirementType === 'english_language_test' && item.institution === 'University of Benin'), cambridgeWaiver: waiverDecision, newTestChoice: testChoice },
      optionalGreDecision: { recommendation: optionalDecision.recommendation, rationale: optionalDecision.rationale, sourceEvidenceIds: optionalDecision.sourceEvidenceIds, output: optionalGrePlan.nextAction, interaction: optionalGrePlan.interaction },
      testDateSelection: { rankedDates: testDateSelection.rankedDates, interaction: testDateSelection.interaction },
      forcedFailures: { transcriptFailure: transcriptFailure.reasons, translationFailure: translationFailure.reasons, languageFailure, unverifiedAdmissionsScore, optionalDecision, illegalTransition, completedTransition, derivedFailure },
    },
  }
}
