import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  admissionsScoreReportingKey,
  admissionsTestRegistrationKey,
  applyAcademicProgressInteraction,
  buildAcademicTestDateSelection,
  buildAcademicEvidenceCoverageMap,
  buildCredentialEvaluationCases,
  buildProfessionalTranscriptFilename,
  coordinateAcademicEvidence,
  createDerivedAcademicArtifact,
  evaluateAdmissionsTestAttempt,
  evaluateEnglishWaiver,
  evaluateLanguageTestAttempt,
  inspectTranscriptArtifact,
  languageTestBookingKey,
  rankLanguageTestDates,
  recommendOptionalAdmissionsScore,
  resolveAcademicContext,
  transitionCredentialEvaluation,
  transitionAcademicDelivery,
  type AcademicEvidenceRequirement,
  type AcademicArtifactReference,
  type AdmissionsTestAttempt,
  type AdmissionsTestPolicy,
  type CredentialEvaluationCase,
  type LanguageTestAttempt,
} from './academic-evidence.ts'

const source = {
  id: 'source:programme-guide',
  url: 'https://admissions.example.edu/graduate/guide',
  authority: 'official_programme_page' as const,
  sourceType: 'programme_guide',
  excerpt: 'The programme requires a transcript, proof of graduation, and IELTS 7.0 with no subsection below 6.5.',
  claims: ['transcript_required', 'english_threshold'],
  retrievedAt: '2026-08-01T10:00:00.000Z',
}

function transcriptArtifact(overrides: Record<string, unknown> = {}): Partial<AcademicArtifactReference> & { id: string; applicantId: string; filename: string } {
  return {
    id: 'artifact:transcript:unibenin',
    applicantId: 'applicant-1',
    artifactType: 'transcript',
    institution: 'University of Benin',
    filename: 'old-transcript.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 120_000,
    pageCount: 2,
    checksum: 'sha256:transcript-original',
    officialStatus: 'official' as const,
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
    provenance: [{ ...source, id: 'source:registrar-transcript', authority: 'uploaded_document' as const, sourceType: 'registrar_document' }],
    ...overrides,
  }
}

function rule(requirementType: AcademicEvidenceRequirement['requirementType'], overrides: Record<string, unknown> = {}) {
  return {
    requirementType,
    institution: 'University of Benin',
    sourceEvidence: [source],
    ...overrides,
  }
}

function application(caseId: string, programme: string, rules: unknown[]) {
  return { applicationCaseId: caseId, institution: 'University of Benin', programme, deadline: '2026-10-01T23:59:00.000Z', deadlineTimezone: 'Africa/Lagos', rules: rules as never[] }
}

Deno.test('academic artifacts preserve originals and reject factual transformations', async () => {
  assertEquals(buildProfessionalTranscriptFilename('Ada', 'Lovelace', 'University of Benin'), 'Ada_Lovelace_University_of_Benin_Transcript.pdf')
  const incomplete = inspectTranscriptArtifact({
    artifact: transcriptArtifact({ content: { applicantIdentityPresent: true, institutionPresent: true, courseGradeContentPresent: true, readable: true, gradingLegendPresent: false, pageNumbers: [1, 3], declaredPageCount: 3 } }),
    expectedApplicantId: 'applicant-1',
    expectedInstitution: 'University of Benin',
    requireGradingLegend: true,
    maximumBytes: 200_000,
  })
  assertEquals(incomplete.accepted, false)
  assert(incomplete.reasons.includes('missing_page'))
  assert(incomplete.reasons.includes('grading_legend_missing'))
  const translationMissing = inspectTranscriptArtifact({ artifact: transcriptArtifact(), expectedApplicantId: 'applicant-1', expectedInstitution: 'University of Benin', requireTranslation: true, requireCertifiedTranslation: true })
  assertEquals(translationMissing.accepted, false)
  assert(translationMissing.reasons.includes('translation_missing'))
  assert(translationMissing.reasons.includes('certified_translation_missing'))
  const oversized = inspectTranscriptArtifact({ artifact: transcriptArtifact({ sizeBytes: 300_000 }), expectedApplicantId: 'applicant-1', expectedInstitution: 'University of Benin', maximumBytes: 200_000 })
  assert(oversized.reasons.includes('oversized_pdf'))
  const accepted = inspectTranscriptArtifact({ artifact: transcriptArtifact(), expectedApplicantId: 'applicant-1', expectedInstitution: 'University of Benin', requireGradingLegend: true })
  assertEquals(accepted.verification, 'verified')
  await assertRejects(() => Promise.resolve().then(() => createDerivedAcademicArtifact({ original: accepted.artifact, derivedId: 'artifact:bad', derivedChecksum: 'sha256:bad', filename: 'modified.pdf', transformations: ['normalize grades'] })))
  const derived = createDerivedAcademicArtifact({ original: accepted.artifact, derivedId: 'artifact:copy', derivedChecksum: 'sha256:copy', filename: 'Ada_Lovelace_University_of_Benin_Transcript.pdf', transformations: ['compress PDF'], applicationCaseId: 'case-1' })
  assertEquals(derived.originalArtifactId, accepted.artifact.id)
  assertEquals(derived.checksum, 'sha256:copy')
  assertEquals(accepted.artifact.checksum, 'sha256:transcript-original')
})

Deno.test('source-backed multi-application evaluation is deduplicated and mapped', () => {
  const evaluationRule = rule('credential_evaluation', {
    externalProvider: { name: 'WES', product: 'course_by_course' },
    acceptedEvidenceTypes: ['transcript', 'degree_certificate'],
    exactRule: { evaluationType: 'course_by_course', institutions: ['University of Benin'] },
    cost: { amount: 205, currency: 'USD', known: true, sourceEvidenceIds: [source.id] },
  })
  const plan = coordinateAcademicEvidence({
    applications: [application('case-a', 'MSc Data Science', [evaluationRule]), application('case-b', 'MSc Computer Science', [evaluationRule])],
    context: { applicantId: 'applicant-1' },
    now: '2026-08-12T00:00:00.000Z',
  })
  assertEquals(plan.credentialEvaluationCases.length, 1)
  assertEquals(plan.credentialEvaluationCases[0]?.applicationCaseIds.sort(), ['case-a', 'case-b'])
  assert(plan.coverageMap.entries.some(entry => entry.kind === 'credential_evaluation' && entry.coverageCount === 2))
  assert(plan.metrics.duplicateCostsPrevented > 0)
  assertEquals(plan.credentialEvaluationCases[0]?.idempotencyKey.startsWith('credential-evaluation:applicant-1:wes:course_by_course'), true)
  assertEquals(plan.credentialEvaluationCases[0]?.requiredDocuments, ['transcript', 'degree_certificate'])
  assertEquals(plan.credentialEvaluationCases[0]?.sourceEvidence[0]?.id, source.id)
})

Deno.test('transcript, degree proof, and final-conferral rules remain distinct', () => {
  const transcript = transcriptArtifact()
  const degree = { ...transcript, id: 'artifact:degree', artifactType: 'degree_certificate', filename: 'degree.pdf', content: { ...transcript.content, degreeConferralPresent: true, gradingLegendPresent: false } }
  const plan = coordinateAcademicEvidence({
    applications: [application('case-degree', 'MSc Data Science', [
      rule('transcript', { officialStatus: 'official', acceptedEvidenceTypes: ['transcript'], submissionMethod: { mode: 'applicant_upload' } }),
      rule('degree_certificate', { officialStatus: 'official', acceptedEvidenceTypes: ['degree_certificate'], exactRule: { finalDocumentRequired: true, degreeConferralRequired: true }, submissionMethod: { mode: 'applicant_upload' } }),
      rule('proof_of_graduation', { stage: 'offer-condition', requiredness: 'conditional', officialStatus: 'either', acceptedEvidenceTypes: ['degree_certificate', 'proof_of_graduation'], exactRule: { finalAfterAdmission: true }, submissionMethod: { mode: 'secure_upload' } }),
    ])],
    context: { applicantId: 'applicant-1', uploadedDocuments: [transcript, degree] },
  })
  const transcriptRequirement = plan.requirements.find(item => item.requirementType === 'transcript')
  const degreeRequirement = plan.requirements.find(item => item.requirementType === 'degree_certificate')
  const proofRequirement = plan.requirements.find(item => item.requirementType === 'proof_of_graduation')
  assertEquals(transcriptRequirement?.currentArtifact?.id, transcript.id)
  assertEquals(degreeRequirement?.currentArtifact?.id, degree.id)
  assertEquals(proofRequirement?.stage, 'offer-condition')
  assertEquals(transcriptRequirement?.status, 'artifact_ready')
  assertEquals(degreeRequirement?.status, 'artifact_ready')
  assertEquals(proofRequirement?.status, 'artifact_ready')
  assert(plan.requirements.every(item => item.completionEvidence.length === 0))
})

Deno.test('an unofficial copy is preserved as context but cannot satisfy an official transcript rule', () => {
  const unofficial = transcriptArtifact({ officialStatus: 'unofficial', id: 'artifact:unofficial-transcript' })
  const plan = coordinateAcademicEvidence({
    applications: [application('case-unofficial', 'MSc Data Science', [rule('transcript', { officialStatus: 'official', acceptedEvidenceTypes: ['transcript'], submissionMethod: { mode: 'institution_direct', recipient: 'Graduate Admissions' } })])],
    context: { applicantId: 'applicant-1', uploadedDocuments: [unofficial] },
  })
  assertEquals(plan.requirements[0]?.currentArtifact?.id, unofficial.id)
  assertEquals(plan.requirements[0]?.status, 'official_order_needed')
  assertEquals(plan.nextAction?.kind, 'request_official_document')
})

Deno.test('English waiver is evaluated before a paid test and existing valid scores are report-ready', () => {
  const waiverRule = rule('english_language_test', {
    exactRule: {
      acceptedTests: [{ type: 'IELTS', minimumOverall: 7, minimumSections: { reading: 6.5, writing: 6.5 }, validityMonths: 24 }],
      waiverCriteria: [{ id: 'english-medium-degree', label: 'Degree taught in English' }],
    },
  })
  const noEvidence = coordinateAcademicEvidence({ applications: [application('case-language', 'MSc Data Science', [waiverRule])], context: { applicantId: 'applicant-1' }, now: '2026-08-12T00:00:00.000Z' })
  assertEquals(noEvidence.requirements[0]?.status, 'waiver_evidence_needed')
  assertEquals(noEvidence.nextAction?.kind, 'request_waiver_evidence')
  assertEquals(noEvidence.interaction?.kind, 'attachment_request')
  const attempt: LanguageTestAttempt = {
    id: 'ielts-2026', applicantId: 'applicant-1', testProvider: 'IELTS', testType: 'IELTS', testVersion: 'Academic', testDate: '2026-04-01', overallScore: 7.5,
    sectionScores: { reading: 7, writing: 7, listening: 8, speaking: 7 }, candidateOrReportNumber: 'IELTS-1', validUntil: '2028-04-01', scoreReportArtifactId: 'score-report-1', officialReportState: 'delivered', recipients: [], provenance: [source],
  }
  const withScore = coordinateAcademicEvidence({ applications: [application('case-language', 'MSc Data Science', [waiverRule])], context: { applicantId: 'applicant-1', scoreReports: [attempt] }, now: '2026-08-12T00:00:00.000Z' })
  assertEquals(withScore.requirements[0]?.status, 'score_ready')
  assertEquals(withScore.nextAction?.kind, 'report_language_score')
  const invalid = evaluateLanguageTestAttempt({ requirement: withScore.requirements[0]!, attempt: { ...attempt, sectionScores: { ...attempt.sectionScores, writing: 6 } }, now: '2026-08-12T00:00:00.000Z' })
  assertEquals(invalid.state, 'fails_subscore')
  const invalidButWaiverAvailable = coordinateAcademicEvidence({ applications: [application('case-language', 'MSc Data Science', [waiverRule])], context: { applicantId: 'applicant-1', scoreReports: [{ ...attempt, testType: 'TOEFL iBT', testProvider: 'TOEFL iBT' }] }, now: '2026-08-12T00:00:00.000Z' })
  assertEquals(invalidButWaiverAvailable.requirements[0]?.status, 'waiver_evidence_needed')
})

Deno.test('language dates and reporting keys are deadline-safe and idempotent', () => {
  const dates = rankLanguageTestDates({
    dates: [{ id: 'safe', label: 'Safe', date: '2026-08-20', resultDate: '2026-08-28' }, { id: 'late', label: 'Late', date: '2026-09-20', resultDate: '2026-10-02' }],
    deadlines: ['2026-09-01T00:00:00.000Z'],
    safeBufferDays: 2,
  })
  assertEquals(dates.map(item => item.id), ['safe'])
  assertEquals(languageTestBookingKey({ applicantId: 'applicant-1', testType: 'IELTS', date: '2026-08-20', location: 'Lagos' }), languageTestBookingKey({ applicantId: 'applicant-1', testType: 'IELTS', date: '2026-08-20', location: 'Lagos' }))
  assert(languageTestBookingKey({ applicantId: 'applicant-1', testType: 'IELTS', date: '2026-08-20' }).includes('online'))
  assertEquals(admissionsScoreReportingKey({ applicantId: 'applicant-1', attemptId: 'gre-1', recipient: 'University of Benin', institutionCode: 'UBN' }), admissionsScoreReportingKey({ applicantId: 'applicant-1', attemptId: 'gre-1', recipient: 'University of Benin', institutionCode: 'UBN' }))
})

Deno.test('required, optional, and not-accepted admissions-test policy is source-backed', () => {
  const policy: AdmissionsTestPolicy = { requiredness: 'required', acceptedTestTypes: ['GRE'], minimumOverall: 320, minimumSections: { quantitative: 160 }, sourceEvidence: [source] }
  const attempt: AdmissionsTestAttempt = { id: 'gre-1', applicantId: 'applicant-1', testType: 'GRE', testDate: '2026-02-01', overallScore: 325, compositeScore: null, sectionScores: { quantitative: 165 }, percentile: 90, writingScore: 4.5, candidateOrReportNumber: 'GRE-1', validUntil: '2031-02-01', scoreArtifactId: 'gre-report', officialReportState: 'delivered', recipients: [], provenance: [source] }
  assertEquals(evaluateAdmissionsTestAttempt({ policy, attempt, now: '2026-08-12T00:00:00.000Z' }).state, 'satisfies')
  assertEquals(evaluateAdmissionsTestAttempt({ policy, attempt: { ...attempt, sectionScores: { quantitative: 159 } } }).state, 'fails_subscore')
  assertEquals(evaluateAdmissionsTestAttempt({ policy: { ...policy, acceptedTestTypes: ['GMAT'] }, attempt }).state, 'wrong_test_type')
  const optional: AdmissionsTestPolicy = { ...policy, requiredness: 'optional', publishedRanges: [{ testType: 'GRE', section: 'overall', low: 320, high: 330, sourceEvidenceIds: [source.id] }] }
  assertEquals(recommendOptionalAdmissionsScore({ policy: optional, attempt }).recommendation, 'SUBMIT')
  assertEquals(recommendOptionalAdmissionsScore({ policy: { ...optional, publishedRanges: [{ ...optional.publishedRanges![0]!, low: 330, high: 340 }] }, attempt }).recommendation, 'WITHHOLD')
  assertEquals(evaluateAdmissionsTestAttempt({ policy: { ...policy, requiredness: 'not_accepted' }, attempt }).state, 'not_accepted')
  assertEquals(evaluateAdmissionsTestAttempt({ policy, attempt: { ...attempt, scoreArtifactId: null, provenance: [] } }).state, 'verification_needed')
  assert(admissionsTestRegistrationKey({ applicantId: 'applicant-1', testType: 'GRE', date: '2026-09-01' }).includes('admissions-test:applicant-1'))
})

Deno.test('test-date choices are Calendar- and deadline-safe typed interactions', () => {
  const selection = buildAcademicTestDateSelection({
    requirementId: 'english:case-a',
    dates: [
      { id: 'conflict', label: 'Conflict', date: '2026-08-20T10:00:00.000Z', resultDate: '2026-08-28', location: 'Lagos' },
      { id: 'safe', label: 'Safe', date: '2026-08-25T10:00:00.000Z', resultDate: '2026-08-29', location: 'Lagos' },
    ],
    deadlines: ['2026-09-10T00:00:00.000Z'],
    calendarEvents: [{ start: '2026-08-20T09:00:00.000Z', end: '2026-08-20T11:00:00.000Z' }],
    timezone: 'Africa/Lagos',
  })
  assertEquals(selection.rankedDates.map(item => item.id), ['safe'])
  assertEquals(selection.interaction.kind, 'date')
  assertEquals(selection.interaction.minimumDate, '2026-08-25')
})

Deno.test('credential evaluation transitions require resulting-state evidence', async () => {
  const evaluation: CredentialEvaluationCase = {
    id: 'evaluation-1', applicantId: 'applicant-1', provider: 'WES', evaluationType: 'course_by_course', applicationCaseIds: ['case-a'], requirementIds: ['req-a'], recipientInstitutions: ['University of Benin'], requiredDocuments: ['transcript'], requiredDeliveryRoute: 'Registrar sends directly', referenceNumber: null, reportId: null, translationRules: [], deadline: null, expectedProcessingTime: null, cost: null, state: 'evaluation_order_ready', institutionDeliveries: [], reportDispatchState: 'not_started', universityReceiptStates: {}, sourceEvidence: [source], blocker: null, idempotencyKey: 'eval:1',
  }
  await assertRejects(() => Promise.resolve().then(() => transitionCredentialEvaluation({ evaluation, to: 'evaluation_complete' })))
  const advanced = transitionCredentialEvaluation({ evaluation, to: 'payment_required' })
  assertEquals(advanced.state, 'payment_required')
  const complete = transitionCredentialEvaluation({ evaluation: { ...evaluation, state: 'evaluation_in_progress' }, to: 'evaluation_complete', evidence: [{ id: 'provider-confirmation', kind: 'provider_confirmation', verified: true, applicationCaseId: 'case-a', requirementId: 'req-a', provider: 'WES', providerId: 'WES-1', recipient: null, artifactId: null, checksum: null, capturedAt: '2026-08-12T00:00:00.000Z', excerpt: 'Evaluation complete.' }] })
  assertEquals(complete.state, 'evaluation_complete')
  const delivery = { institution: 'University of Benin', requiredDocumentTypes: ['transcript'], deliveryMode: 'institution_direct' as const, state: 'not_started' as const, providerId: null, trackingId: null, recipient: 'WES', commitmentAt: null, commitmentDueAt: null, evidence: [], blocker: null }
  await assertRejects(() => Promise.resolve().then(() => transitionAcademicDelivery({ delivery, to: 'ordered' })))
  const ordered = transitionAcademicDelivery({ delivery, to: 'ordered', evidence: [{ id: 'registrar-order', kind: 'registrar_confirmation', verified: true, applicationCaseId: 'case-a', requirementId: 'req-a', provider: 'WES', providerId: 'WES-1', recipient: 'WES', artifactId: null, checksum: null, capturedAt: '2026-08-12T00:00:00.000Z', excerpt: 'Registrar confirmed the order.' }] })
  assertEquals(ordered.state, 'ordered')
})

Deno.test('typed Progress Detail resumes with reusable facts and rejects credentials', () => {
  const context = resolveAcademicContext({ applicantId: 'applicant-1' })
  const plan = coordinateAcademicEvidence({ applications: [application('case-context', 'MSc Data Science', [rule('transcript')])], context: { applicantId: 'applicant-1' } })
  const interaction = plan.interaction!
  const accepted = applyAcademicProgressInteraction({ context, interaction, value: ['artifact:transcript:unibenin'], reusableContextConsent: true, submittedAt: '2026-08-12T00:00:00.000Z' })
  assertEquals(accepted.accepted, true)
  assertEquals(accepted.metric.resumedAutomatically, true)
  const forbidden = applyAcademicProgressInteraction({ context, interaction: { ...interaction, kind: 'short_text', mapsToRequirement: 'portal_password', currentValue: null, maximumCharacters: 600, placeholder: 'Do not use' }, value: 'secret', submittedAt: '2026-08-12T00:00:00.000Z' })
  assertEquals(forbidden.accepted, false)
  assert(forbidden.error?.toLocaleLowerCase().includes('credential'))
})

Deno.test('source and conflict failures remain visible instead of false completion', () => {
  const blocked = coordinateAcademicEvidence({
    applications: [application('case-blocked', 'MSc Data Science', [{ requirementType: 'transcript', institution: 'University of Benin' }])],
    context: { applicantId: 'applicant-1' },
  })
  assertEquals(blocked.requirements[0]?.status, 'blocked')
  assertEquals(blocked.requirements[0]?.completionEvidence.length, 0)
  assertEquals(blocked.interaction?.kind, 'attachment_request')
  const context = resolveAcademicContext({ applicantId: 'applicant-1', applicantProfile: { education: [{ institution: 'University of Benin', degree: 'BSc Computer Science', degreeConferralDate: '2022-07-01' }, { institution: 'University of Benin', degree: 'BSc Mathematics', degreeConferralDate: '2023-07-01' }] } })
  assert(context.conflicts.length > 0)
  assert(context.unresolvedFacts.length > 0)
  const coverage = buildAcademicEvidenceCoverageMap({ requirements: [] })
  assertEquals(coverage.duplicateActionsPrevented, 0)
})
