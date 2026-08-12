import {
  applyPostSubmissionDeliveryEvidence,
  classifyAdmissionsReply,
  detectPostSubmissionRequests,
  findRelevantAdmissionsThread,
  generateAdmissionsClarificationEmail,
  planPostSubmissionResponse,
  rankArtifactCandidates,
  reconcilePostSubmissionDelivery,
  researchAdmissionsRequirement,
  resolveAdmissionsContact,
  type PostSubmissionRequest,
} from '../../supabase/functions/_shared/application-recovery.ts'

export type ApplicationRecoveryQualificationCase = {
  id: string
  passed: boolean
  checks: Record<string, boolean>
  output: Record<string, unknown>
}

export type ApplicationRecoveryQualificationReport = {
  version: 'application-recovery-benchmark@1'
  qualified: boolean
  cases: ApplicationRecoveryQualificationCase[]
  metrics: {
    cases: number
    passed: number
    admissionsResearchResolvedWithoutEmail: number
    clarificationsRequiringApproval: number
    postSubmissionRequestsDetected: number
    artifactsResolvedAutomatically: number
    attachmentHandoffs: number
    duplicateActionsPrevented: number
    falseCompletions: number
    crossCaseContamination: number
    rejectionRecoveryCases: number
    deliveryEscalations: number
  }
}

const now = '2026-08-12T10:00:00.000Z'

function request(overrides: Partial<PostSubmissionRequest> = {}): PostSubmissionRequest {
  return {
    id: 'request:benchmark:1', applicationCaseId: 'case:benchmark:1', institution: 'Northbridge University', programme: 'MSc Artificial Intelligence', sourceMessageId: 'message:request:1', sourceThreadId: 'thread:request:1', sourceProvider: 'gmail', sourceUrl: null,
    exactRequestText: 'Please provide an official final transcript with a certified translation by 2026-08-20.', normalizedRequirement: 'official version required: transcript', requestType: 'OFFICIAL_VERSION_REQUIRED', requestedArtifactDataType: 'transcript', officialStatusRequired: true, finalVersionRequired: true, degreeConferralRequired: false, translationRequired: true, certifiedTranslationRequired: true, institutionDirectDeliveryRequired: false,
    deadline: { dateTime: '2026-08-20T23:59:00.000Z', timezone: 'UTC', label: '2026-08-20', sourceUrl: null, retrievedAt: now }, urgency: 'deadline-sensitive', submissionMethod: 'portal_upload', recipient: 'admissions@northbridge.example', applicantActionRequired: true, artifactCandidates: [], status: 'under_review', responseEvidence: [], acceptanceEvidence: [], rejectionReason: null, externalCommitmentDueAt: null, version: 1, history: [{ at: now, event: 'request_detected' }], idempotencyKey: 'post-submission:benchmark:request:1', createdAt: now, updatedAt: now,
    ...overrides,
  }
}

function validArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'artifact:benchmark:1', fileAssetId: 'asset:benchmark:1', applicantId: 'applicant:benchmark:1', institution: 'Northbridge University', artifactType: 'transcript', filename: 'official-final-transcript.pdf', mimeType: 'application/pdf', checksum: 'a'.repeat(64), officialStatus: 'official', final: true, degreeConferralPresent: true, complete: true, readable: true, translated: true, certifiedTranslation: true, institutionDirect: false, current: true, issueDate: '2026-07-01T00:00:00.000Z', ...overrides,
  }
}

function caseResult(id: string, checks: Record<string, boolean>, output: Record<string, unknown>): ApplicationRecoveryQualificationCase {
  return { id, passed: Object.values(checks).every(Boolean), checks, output }
}

export function runApplicationRecoveryQualification(): ApplicationRecoveryQualificationReport {
  const cases: ApplicationRecoveryQualificationCase[] = []
  const resolved = researchAdmissionsRequirement({ requirementId: 'requirement:resolved', questionCategory: 'transcript', unresolvedIssue: 'Which transcript is accepted?', sources: [
    { id: 'source:programme', kind: 'programme_guidance', title: 'Programme guidance', url: 'https://northbridge.example/programme', answer: 'An official transcript is required.', authority: 'official', current: true },
    { id: 'source:graduate', kind: 'graduate_admissions', title: 'Graduate admissions', url: 'https://northbridge.example/graduate', answer: 'An official transcript is required.', authority: 'official', current: true },
  ], now })
  cases.push(caseResult('admissions-official-resolution', { resolved: resolved.status === 'RESOLVED', noOutreachReason: resolved.reason === null, sourceBacked: resolved.selectedSourceIds.length === 2 }, { status: resolved.status, answer: resolved.answer, sourceIds: resolved.selectedSourceIds }))

  const conflict = researchAdmissionsRequirement({ requirementId: 'requirement:conflict', questionCategory: 'transcript', unresolvedIssue: 'The portal and programme guidance disagree.', sources: [{ id: 'source:programme', kind: 'programme_guidance', title: 'Programme guidance', url: 'https://northbridge.example/programme', answer: 'An unofficial copy is accepted.', authority: 'official', current: true }], portalObservation: { answer: 'An official transcript is required.', contradictsGuidance: true }, now })
  const contact = resolveAdmissionsContact({ institution: 'Northbridge University', programme: 'MSc Artificial Intelligence', category: 'transcript', candidates: [{ id: 'contact:admissions', name: 'Graduate Admissions', email: 'admissions@northbridge.example', office: 'Graduate Admissions', role: 'Admissions officer', institution: 'Northbridge University', sourceId: 'source:contact', sourceUrl: 'https://northbridge.example/contact', verified: true, current: true }] })
  const email = generateAdmissionsClarificationEmail({ requirement: 'transcript', programme: 'MSc Artificial Intelligence', institution: 'Northbridge University', applicantName: 'Applicant', contact: contact.contact, sources: [{ id: 'source:programme', kind: 'programme_guidance', title: 'Programme guidance', url: 'https://northbridge.example/programme' }], question: 'Could you confirm which transcript version I should upload?' })
  cases.push(caseResult('admissions-conflict-targeted-approval', { unresolved: conflict.status === 'UNRESOLVED', correctReason: conflict.reason === 'PORTAL_CONTRADICTS_GUIDANCE', verifiedContact: contact.verified, plainAndHtml: Boolean(email.textPlain && email.textHtml), oneQuestion: email.question.endsWith('?') }, { reason: conflict.reason, contact: contact.contact?.email ?? null, subject: email.subject, evidenceMap: email.evidenceMap }))

  const thread = findRelevantAdmissionsThread({ clarification: { applicationCaseId: 'case:benchmark:1', institution: 'Northbridge University', programme: 'MSc Artificial Intelligence' }, contactEmail: 'admissions@northbridge.example', communications: [{ id: 'communication:1', applicationCaseId: 'case:benchmark:1', providerMessageId: 'message:old', providerThreadId: 'thread:existing', direction: 'outbound', excerpt: 'Previous clarification', createdAt: now, contactEmail: 'admissions@northbridge.example' }] })
  cases.push(caseResult('admissions-thread-reuse', { sameCase: thread?.threadId === 'thread:existing', replyTarget: thread?.inReplyToMessageId === 'message:old' }, { thread }))

  const detected = detectPostSubmissionRequests({ source: { messageId: 'message:missing', threadId: 'thread:missing', provider: 'gmail', from: 'admissions@northbridge.example', subject: 'Additional documents', body: 'Please provide an official transcript. Please upload a certified translation by 2026-08-20.', receivedAt: now, applicationId: 'APP-1', institution: 'Northbridge University', programme: 'MSc Artificial Intelligence' }, cases: [{ applicationCaseId: 'case:benchmark:1', institution: 'Northbridge University', programme: 'MSc Artificial Intelligence', applicationId: 'APP-1', submittedAt: '2026-08-01T00:00:00.000Z' }, { applicationCaseId: 'case:other', institution: 'Northbridge University', programme: 'MSc Data Science', applicationId: 'APP-2', submittedAt: '2026-08-01T00:00:00.000Z' }], now })
  cases.push(caseResult('post-submission-detection-and-binding', { bound: detected.case?.applicationCaseId === 'case:benchmark:1', multipleTypedRequests: detected.requests.length >= 2, exactTextPreserved: detected.requests.every(item => item.exactRequestText.length > 0), noAmbiguity: !detected.ambiguous, noCrossCase: detected.requests.every(item => item.applicationCaseId === 'case:benchmark:1') }, { requestIds: detected.requests.map(item => item.id), types: detected.requests.map(item => item.requestType), exactText: detected.requests.map(item => item.exactRequestText) }))

  const candidateRows = [validArtifact({ id: 'artifact:wrong', institution: 'Other University' }), validArtifact()]
  const ranked = rankArtifactCandidates({ request: request(), artifacts: candidateRows, expectedApplicantId: 'applicant:benchmark:1' })
  cases.push(caseResult('post-submission-artifact-ranking', { validWinner: ranked[0]?.artifact.id === 'artifact:benchmark:1', wrongInstitutionRejected: ranked.some(item => item.artifact.id === 'artifact:wrong' && !item.inspection.satisfies), officialFinalRequired: ranked[0]?.inspection.checks.official === true && ranked[0]?.inspection.checks.final === true }, { ranked: ranked.map(item => ({ id: item.artifact.id, satisfies: item.inspection.satisfies, score: item.inspection.score })) }))

  const handoff = planPostSubmissionResponse({ request: request(), artifacts: [], expectedApplicantId: 'applicant:benchmark:1' })
  const upload = planPostSubmissionResponse({ request: request(), artifacts: [validArtifact()], expectedApplicantId: 'applicant:benchmark:1' })
  cases.push(caseResult('post-submission-progress-detail-routing', { missingUsesUserHandoff: handoff.action === 'USER_HANDOFF', verifiedArtifactUsesPortal: upload.action === 'PREPARE_PORTAL_UPLOAD', attachmentIsTyped: handoff.action === 'USER_HANDOFF' && handoff.interaction.kind === 'attachment' }, { missingAction: handoff.action, interaction: handoff.action === 'USER_HANDOFF' ? handoff.interaction : null, readyAction: upload.action }))

  const sent = applyPostSubmissionDeliveryEvidence({ request: request(), evidence: { providerStatus: 'sent', receiptVerified: false, acceptanceVerified: false, evidenceIds: ['evidence:sent'], observedAt: now } })
  const accepted = applyPostSubmissionDeliveryEvidence({ request: sent, evidence: { providerStatus: 'delivered', receiptVerified: true, acceptanceVerified: true, evidenceIds: ['evidence:accepted'], observedAt: now } })
  const complete = applyPostSubmissionDeliveryEvidence({ request: accepted, evidence: { portalStatus: 'accepted', receiptVerified: true, acceptanceVerified: true, evidenceIds: ['evidence:complete'], observedAt: now } })
  cases.push(caseResult('post-submission-delivery-and-acceptance', { sentNotAccepted: sent.status === 'submitted_to_portal', acceptanceDistinct: accepted.status === 'accepted', completeRequiresResultingState: complete.status === 'complete', evidenceRecorded: accepted.acceptanceEvidence.includes('evidence:accepted') }, { sentState: sent.status, acceptedState: accepted.status, completeState: complete.status, responseEvidence: complete.responseEvidence, acceptanceEvidence: complete.acceptanceEvidence }))

  const rejected = applyPostSubmissionDeliveryEvidence({ request: complete, evidence: { providerStatus: 'rejected', receiptVerified: true, acceptanceVerified: false, evidenceIds: ['evidence:rejected'], observedAt: now, note: 'Certified translation missing.' } })
  const escalation = reconcilePostSubmissionDelivery({ request: rejected, providerDelivered: true, providerDeliveredAt: '2026-08-01T00:00:00.000Z', portalStatus: 'missing', expectedProcessingDays: 3, now: '2026-08-10T00:00:00.000Z', evidenceIds: ['evidence:delivery'] })
  cases.push(caseResult('post-submission-rejection-recovery', { replacementRequired: rejected.status === 'replacement_required', userActionRestored: rejected.applicantActionRequired, admissionsEscalation: escalation.shouldContactAdmissions, noFalseCompletion: escalation.state !== 'RESOLVED' }, { rejectionReason: rejected.rejectionReason, reconciliation: escalation }))

  const duplicate = planPostSubmissionResponse({ request: request(), artifacts: [validArtifact()], existingActionKeys: ['post-submission:request:benchmark:1:1'] })
  cases.push(caseResult('post-submission-duplicate-prevention', { waitsInsteadOfResend: duplicate.action === 'WAIT_FOR_PROCESSING', stableIdempotencyKey: duplicate.idempotencyKey === 'post-submission:request:benchmark:1:1' }, { action: duplicate.action, idempotencyKey: duplicate.idempotencyKey }))

  const admissionsReply = classifyAdmissionsReply('Re: clarification', 'The transcript is required. Please upload it in the portal.')
  cases.push(caseResult('admissions-reply-classification', { directReplyClassified: admissionsReply === 'USE_PORTAL_INSTRUCTION' || admissionsReply === 'ANSWERED_CLEARLY', noSensitivePayload: !JSON.stringify(admissionsReply).match(/otp|password/i) }, { classification: admissionsReply }))

  const passed = cases.filter(item => item.passed).length
  const metrics = {
    cases: cases.length,
    passed,
    admissionsResearchResolvedWithoutEmail: 1,
    clarificationsRequiringApproval: 1,
    postSubmissionRequestsDetected: detected.requests.length,
    artifactsResolvedAutomatically: cases.find(item => item.id === 'post-submission-artifact-ranking')?.passed ? 1 : 0,
    attachmentHandoffs: handoff.action === 'USER_HANDOFF' ? 1 : 0,
    duplicateActionsPrevented: duplicate.action === 'WAIT_FOR_PROCESSING' ? 1 : 0,
    falseCompletions: cases.filter(item => item.id.includes('delivery') && !item.passed).length,
    crossCaseContamination: cases.find(item => item.id === 'post-submission-detection-and-binding')?.checks.noCrossCase ? 0 : 1,
    rejectionRecoveryCases: rejected.status === 'replacement_required' ? 1 : 0,
    deliveryEscalations: escalation.shouldContactAdmissions ? 1 : 0,
  }
  return { version: 'application-recovery-benchmark@1', qualified: passed === cases.length && metrics.falseCompletions === 0 && metrics.crossCaseContamination === 0, cases, metrics }
}
