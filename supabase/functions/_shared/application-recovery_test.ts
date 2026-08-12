import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  admissionsClarificationToRequirement,
  admissionsFollowUpDecision,
  applyAdmissionsReplyToRequirementGraph,
  applyPostSubmissionDeliveryEvidence,
  bindPostSubmissionRequestToCase,
  classifyAdmissionsReply,
  classifyPostSubmissionRequest,
  createAdmissionsClarification,
  createSafeDerivedArtifactPlan,
  detectPostSubmissionRequests,
  findRelevantAdmissionsThread,
  generateAdditionalInformationResponse,
  generateAdmissionsClarificationEmail,
  inspectArtifactForPostSubmissionRequest,
  admissionsClarificationRow,
  planPostSubmissionResponse,
  postSubmissionRequestRow,
  rankArtifactCandidates,
  reconcilePostSubmissionDelivery,
  researchAdmissionsRequirement,
  resolveAdmissionsContact,
  type AdmissionsClarification,
  type PostSubmissionRequest,
} from './application-recovery.ts'

const now = '2026-08-12T10:00:00.000Z'

function requirement(overrides: Partial<Parameters<typeof applyAdmissionsReplyToRequirementGraph>[0]['requirements'][number]> = {}) {
  return {
    id: 'requirement-1',
    applicationCaseId: 'case-1',
    name: 'Transcript format',
    category: 'academic' as const,
    source: null,
    required: true,
    exactInstructions: 'Confirm whether the registrar transcript is acceptable.',
    deadline: null,
    status: 'awaiting_institution' as const,
    responsibleParty: 'institution' as const,
    linkedArtifactId: null,
    verificationEvidenceIds: [],
    blockerReason: 'The official guidance is unresolved.',
    ...overrides,
  }
}

function clarification(overrides: Partial<AdmissionsClarification> = {}): AdmissionsClarification {
  return {
    id: 'clarification-1',
    applicationCaseId: 'case-1',
    programme: 'MSc Artificial Intelligence',
    institution: 'Northbridge University',
    underlyingRequirementId: 'requirement-1',
    questionCategory: 'transcript',
    unresolvedIssue: 'The portal asks for an official transcript but the programme page permits a student copy.',
    sourcesAlreadyChecked: ['programme', 'portal'],
    conflictingEvidence: [{ sourceId: 'programme', answer: 'A student copy is accepted.', excerpt: 'Student copies are accepted.', url: 'https://northbridge.example/programme' }],
    whyClarificationIsNecessary: 'The source hierarchy does not produce one safe submission action.',
    unresolvedReason: 'CONFLICTING_OFFICIAL_SOURCES',
    admissionsContact: {
      id: 'contact-1', name: 'Graduate Admissions', email: 'admissions@northbridge.example', office: 'Graduate Admissions', role: 'Admissions officer', institution: 'Northbridge University', programme: 'MSc Artificial Intelligence', sourceId: 'contact-source', sourceUrl: 'https://northbridge.example/contact', verified: true, current: true,
    },
    contactSource: 'contact-source',
    deadlineRelevance: null,
    deadline: null,
    risk: 'medium',
    draftedQuestion: 'Could you confirm which transcript version I should submit?',
    gmailThreadId: 'thread-1',
    gmailMessageId: 'message-1',
    status: 'sent',
    resolvedInterpretation: null,
    resultingRequirementUpdates: [],
    evidenceIds: [],
    idempotencyKey: 'clarification:case-1:requirement-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function postRequest(overrides: Partial<PostSubmissionRequest> = {}): PostSubmissionRequest {
  return {
    id: 'request-1',
    applicationCaseId: 'case-1',
    institution: 'Northbridge University',
    programme: 'MSc Artificial Intelligence',
    sourceMessageId: 'message-2',
    sourceThreadId: 'thread-1',
    sourceProvider: 'gmail',
    sourceUrl: null,
    exactRequestText: 'Please provide an official final transcript with a certified translation by 2026-08-20.',
    normalizedRequirement: 'official version required: transcript',
    requestType: 'OFFICIAL_VERSION_REQUIRED',
    requestedArtifactDataType: 'transcript',
    officialStatusRequired: true,
    finalVersionRequired: true,
    degreeConferralRequired: false,
    translationRequired: true,
    certifiedTranslationRequired: true,
    institutionDirectDeliveryRequired: false,
    deadline: { dateTime: '2026-08-20T23:59:00.000Z', timezone: 'UTC', label: '2026-08-20', sourceUrl: null, retrievedAt: now },
    urgency: 'deadline-sensitive',
    submissionMethod: 'portal_upload',
    recipient: 'admissions@northbridge.example',
    applicantActionRequired: true,
    artifactCandidates: [],
    status: 'under_review',
    responseEvidence: [],
    acceptanceEvidence: [],
    rejectionReason: null,
    externalCommitmentDueAt: null,
    version: 1,
    history: [{ at: now, event: 'request_detected', exactRequestText: 'Please provide an official final transcript with a certified translation by 2026-08-20.' }],
    idempotencyKey: 'post-submission:case-1:message-2:OFFICIAL_VERSION_REQUIRED',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'artifact-1',
    fileAssetId: 'asset-1',
    applicantId: 'user-1',
    institution: 'Northbridge University',
    artifactType: 'transcript',
    filename: 'official-final-transcript.pdf',
    mimeType: 'application/pdf',
    checksum: 'a'.repeat(64),
    officialStatus: 'official' as const,
    final: true,
    degreeConferralPresent: true,
    complete: true,
    readable: true,
    translated: true,
    certifiedTranslation: true,
    institutionDirect: false,
    current: true,
    issueDate: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

Deno.test('official research resolves without admissions outreach', () => {
  const result = researchAdmissionsRequirement({
    requirementId: 'requirement-1',
    questionCategory: 'transcript',
    unresolvedIssue: 'Which transcript version is accepted?',
    sources: [
      { id: 'programme', kind: 'programme_guidance', title: 'Programme guidance', url: 'https://northbridge.example/guide', answer: 'An official transcript is required.', scope: 'programme', authority: 'official', current: true },
      { id: 'contact', kind: 'graduate_admissions', title: 'Graduate admissions', url: 'https://northbridge.example/admissions', answer: 'An official transcript is required.', scope: 'graduate_school', authority: 'official', current: true },
    ],
    now,
  })
  assertEquals(result.status, 'RESOLVED')
  assertEquals(result.reason, null)
  assertEquals(result.selectedSourceIds, ['programme', 'contact'])
})

Deno.test('conflicting official sources and portal contradictions remain unresolved', () => {
  const conflict = researchAdmissionsRequirement({
    requirementId: 'requirement-1', questionCategory: 'transcript', unresolvedIssue: 'Which copy is accepted?', now,
    sources: [
      { id: 'programme', kind: 'programme_guidance', title: 'Programme', url: 'https://northbridge.example/programme', answer: 'An unofficial copy is accepted.', authority: 'official', current: true },
      { id: 'graduate', kind: 'graduate_admissions', title: 'Graduate admissions', url: 'https://northbridge.example/graduate', answer: 'An official transcript is required.', authority: 'official', current: true },
    ],
  })
  assertEquals(conflict.status, 'UNRESOLVED')
  assertEquals(conflict.reason, 'CONFLICTING_OFFICIAL_SOURCES')
  const portal = researchAdmissionsRequirement({
    requirementId: 'requirement-1', questionCategory: 'transcript', unresolvedIssue: 'Portal disagrees with guidance', now,
    sources: [{ id: 'programme', kind: 'programme_guidance', title: 'Programme', url: 'https://northbridge.example/programme', answer: 'An official transcript is required.', authority: 'official', current: true }],
    portalObservation: { answer: 'An unofficial copy is accepted.', contradictsGuidance: true },
  })
  assertEquals(portal.reason, 'PORTAL_CONTRADICTS_GUIDANCE')
})

Deno.test('contact resolution rejects stale, inferred, and wrong-institution contacts', () => {
  const result = resolveAdmissionsContact({
    institution: 'Northbridge University', programme: 'MSc Artificial Intelligence', category: 'transcript', candidates: [
      { name: 'Wrong', email: 'admissions@other.example', office: 'Admissions', role: 'Officer', institution: 'Other University', sourceId: 'other', sourceUrl: 'https://other.example/contact', verified: true, current: true },
      { name: 'Inferred', email: 'guess@northbridge.example', office: 'Admissions', role: 'Officer', institution: 'Northbridge University', sourceId: 'inferred', sourceUrl: 'https://northbridge.example/contact', sourceKind: 'inferred', verified: true, current: true },
      { name: 'Stale', email: 'old@northbridge.example', office: 'Admissions', role: 'Officer', institution: 'Northbridge University', sourceId: 'old', sourceUrl: 'https://northbridge.example/old', verified: true, current: false },
    ],
  })
  assertEquals(result.contact, null)
  assertEquals(result.verified, false)
  assert(result.rejected.some(item => item.reason === 'institution_mismatch'))
})

Deno.test('existing Gmail thread is reused only for the same case and contact', () => {
  const selected = findRelevantAdmissionsThread({ clarification: clarification(), contactEmail: 'admissions@northbridge.example', communications: [
    { id: 'wrong-case', applicationCaseId: 'case-2', providerMessageId: 'm2', providerThreadId: 'wrong-thread', direction: 'outbound', excerpt: 'clarification', createdAt: now, contactEmail: 'admissions@northbridge.example' },
    { id: 'wrong-contact', applicationCaseId: 'case-1', providerMessageId: 'm3', providerThreadId: 'wrong-contact-thread', direction: 'outbound', excerpt: 'clarification', createdAt: '2026-08-12T11:00:00.000Z', contactEmail: 'other@northbridge.example' },
    { id: 'right', applicationCaseId: 'case-1', providerMessageId: 'm1', providerThreadId: 'right-thread', direction: 'outbound', excerpt: 'clarification', createdAt: now, contactEmail: 'admissions@northbridge.example' },
  ] })
  assertEquals(selected, { threadId: 'right-thread', inReplyToMessageId: 'm1', sourceCommunicationId: 'right' })
})

Deno.test('clarification email is concise, plain/html, escaped, and targeted to one question', () => {
  const email = generateAdmissionsClarificationEmail({ clarification: clarification({ unresolvedIssue: 'Whether <script> is accepted' }), requirement: 'transcript', programme: 'MSc AI', institution: 'Northbridge <University>', applicantName: 'Ada <Applicant>', contact: clarification().admissionsContact, sources: [{ id: 'guide', title: 'Official guide', kind: 'programme_guidance', url: 'https://northbridge.example/guide', answer: null }], question: 'Could you confirm which transcript version I should upload?' })
  assertEquals(email.to, ['admissions@northbridge.example'])
  assert(email.textPlain.includes('Could you confirm which transcript version I should upload?'))
  assert(email.textHtml.includes('&lt;Applicant&gt;'))
  assert(!email.textPlain.includes('**'))
  assertEquals(email.question.endsWith('?'), true)
})

Deno.test('admissions replies classify and update the requirement graph conservatively', () => {
  assertEquals(classifyAdmissionsReply('Re: transcript', 'Yes, an official transcript is required before the deadline.'), 'ANSWERED_CLEARLY')
  assertEquals(classifyAdmissionsReply('Re: transcript', 'Please send your application ID and a screenshot.'), 'REQUESTS_MORE_INFO')
  const result = applyAdmissionsReplyToRequirementGraph({
    requirements: [requirement()],
    clarification: clarification(),
    interpretation: { classification: 'ANSWERED_CLEARLY', actualAnswer: 'An official transcript is required.', requirementId: 'requirement-1', requirementUpdates: [{ requirementId: 'requirement-1', status: 'verified', note: 'Confirmed.' }], deadlineImplications: null, newEvidenceRequired: [], referredOffice: null, definitive: true, confidence: 'high', evidenceExcerpt: 'An official transcript is required.' },
    evidenceId: 'evidence-1', now,
  })
  assertEquals(result.requirements[0]!.status, 'verified')
  assertEquals(result.requirements[0]!.verificationEvidenceIds, ['evidence-1'])
  assertEquals(result.clarification.status, 'resolved')
})

Deno.test('follow-up policy is bounded and deadline-aware', () => {
  assertEquals(admissionsFollowUpDecision({ clarification: { status: 'sent', risk: 'medium', deadline: null, createdAt: '2026-08-10T00:00:00.000Z' }, now, publishedResponseTimeHours: 24 }).action, 'follow_up')
  assertEquals(admissionsFollowUpDecision({ clarification: { status: 'sent', risk: 'medium', deadline: null, createdAt: now }, now, followUpCount: 2 }).action, 'escalate')
})

Deno.test('post-submission detection preserves exact text, separates requests, and binds the application', () => {
  const detection = detectPostSubmissionRequests({
    source: { messageId: 'message-2', threadId: 'thread-1', provider: 'gmail', from: 'admissions@northbridge.example', subject: 'Additional documents', body: 'Please provide an official transcript. Please upload a certified translation by 2026-08-20.', receivedAt: now, applicationId: 'APP-1', institution: 'Northbridge University', programme: 'MSc Artificial Intelligence' },
    cases: [{ applicationCaseId: 'case-1', institution: 'Northbridge University', programme: 'MSc Artificial Intelligence', applicationId: 'APP-1', submittedAt: '2026-08-01T00:00:00.000Z' }, { applicationCaseId: 'case-2', institution: 'Northbridge University', programme: 'MSc Data Science', applicationId: 'APP-2', submittedAt: '2026-08-01T00:00:00.000Z' }],
    now,
  })
  assertEquals(detection.ambiguous, false)
  assertEquals(detection.case?.applicationCaseId, 'case-1')
  assert(detection.requests.length >= 2)
  assert(detection.requests.every(request => request.exactRequestText.length > 0 && request.applicationCaseId === 'case-1'))
  assertEquals(bindPostSubmissionRequestToCase({ request: detection.requests[0]!, applicationCase: { applicationCaseId: 'case-2', institution: 'Northbridge University', programme: 'MSc Data Science', applicationId: 'APP-2' } }).valid, false)
  assertEquals(classifyPostSubmissionRequest('The institution requires an updated official transcript.'), 'UPDATED_VERSION_REQUIRED')
})

Deno.test('artifact ranking rejects wrong institution and prefers a valid official final artifact', () => {
  const request = postRequest()
  const ranked = rankArtifactCandidates({ request, expectedApplicantId: 'user-1', artifacts: [artifact({ id: 'wrong', institution: 'Other University', issueDate: '2026-08-10T00:00:00.000Z' }), artifact({ id: 'right', issueDate: '2026-07-01T00:00:00.000Z' })] })
  assertEquals(ranked[0]!.artifact.id, 'right')
  assertEquals(ranked[0]!.inspection.satisfies, true)
  assertEquals(inspectArtifactForPostSubmissionRequest({ request, artifact: artifact({ institution: 'Other University' }), expectedApplicantId: 'user-1' }).satisfies, false)
})

Deno.test('safe derivatives allow only non-substantive transforms', async () => {
  const plan = createSafeDerivedArtifactPlan({ original: artifact(), derivedId: 'derived-1', derivedChecksum: 'b'.repeat(64), filename: 'transcript-compressed.pdf', transformations: ['compress_pdf', 'rename'], applicationCaseId: 'case-1' })
  assertEquals(plan.substantiveContentUnchanged, true)
  assertThrows(() => createSafeDerivedArtifactPlan({ original: artifact(), derivedId: 'derived-2', derivedChecksum: 'c'.repeat(64), filename: 'edited.pdf', transformations: ['edit_grades'] }))
})

Deno.test('post-submission plan distinguishes user handoff, portal preparation, and external processing', () => {
  const request = postRequest()
  assertEquals(planPostSubmissionResponse({ request, artifacts: [], expectedApplicantId: 'user-1' }).action, 'USER_HANDOFF')
  assertEquals(planPostSubmissionResponse({ request, artifacts: [artifact()], expectedApplicantId: 'user-1' }).action, 'PREPARE_PORTAL_UPLOAD')
  assertEquals(planPostSubmissionResponse({ request: postRequest({ submissionMethod: 'institution_direct', institutionDirectDeliveryRequired: true }), artifacts: [artifact({ institutionDirect: true })], expectedApplicantId: 'user-1' }).action, 'WAIT_FOR_PROCESSING')
})

Deno.test('additional-information response preserves institution wording and Gmail threading', () => {
  const response = generateAdditionalInformationResponse({ request: postRequest(), applicationId: 'APP-1', applicantName: 'Ada', artifact: artifact() })
  assertEquals(response.threadId, 'thread-1')
  assertEquals(response.inReplyToMessageId, 'message-2')
  assert(response.textPlain.includes('Please provide an official final transcript'))
  assertEquals(response.attachmentIds, ['artifact-1'])
})

Deno.test('sent or delivered evidence is not accepted evidence, and rejection requires a replacement', () => {
  const sent = applyPostSubmissionDeliveryEvidence({ request: postRequest(), evidence: { providerStatus: 'sent', receiptVerified: false, acceptanceVerified: false, evidenceIds: ['sent-1'], observedAt: now } })
  assertEquals(sent.status, 'submitted_to_portal')
  const accepted = applyPostSubmissionDeliveryEvidence({ request: sent, evidence: { providerStatus: 'delivered', receiptVerified: true, acceptanceVerified: true, evidenceIds: ['accepted-1'], observedAt: now } })
  assertEquals(accepted.status, 'accepted')
  const complete = applyPostSubmissionDeliveryEvidence({ request: accepted, evidence: { portalStatus: 'accepted', receiptVerified: true, acceptanceVerified: true, evidenceIds: ['complete-1'], observedAt: now } })
  assertEquals(complete.status, 'complete')
  const rejected = applyPostSubmissionDeliveryEvidence({ request: complete, evidence: { providerStatus: 'rejected', receiptVerified: true, acceptanceVerified: false, evidenceIds: ['rejected-1'], observedAt: now, note: 'The translation is not certified.' } })
  assertEquals(rejected.status, 'replacement_required')
  assertEquals(rejected.applicantActionRequired, true)
})

Deno.test('delivery reconciliation waits, then escalates only after the processing window', () => {
  assertEquals(reconcilePostSubmissionDelivery({ request: postRequest(), providerDelivered: false, portalStatus: 'unknown', now, evidenceIds: [] }).state, 'WAIT_FOR_PROCESSING')
  assertEquals(reconcilePostSubmissionDelivery({ request: postRequest(), providerDelivered: true, providerDeliveredAt: '2026-08-12T00:00:00.000Z', portalStatus: 'processing', expectedProcessingDays: 3, now: '2026-08-13T00:00:00.000Z', evidenceIds: ['delivery-1'] }).state, 'WAIT_FOR_PROCESSING')
  assertEquals(reconcilePostSubmissionDelivery({ request: postRequest(), providerDelivered: true, providerDeliveredAt: '2026-08-01T00:00:00.000Z', portalStatus: 'missing', expectedProcessingDays: 3, now: '2026-08-10T00:00:00.000Z', evidenceIds: ['delivery-1'] }).state, 'ADMISSIONS_ESCALATION_REQUIRED')
})

Deno.test('recovery requirements project into the existing requirement graph', () => {
  assertEquals(admissionsClarificationToRequirement(clarification()).requirementType, 'admissions_clarification')
})

Deno.test('durable recovery rows use the canonical requirement foreign key', () => {
  const admissionsRow = admissionsClarificationRow(clarification(), 'user-1')
  assertEquals(admissionsRow.requirement_id, 'requirement-1')
  assertEquals('underlying_requirement_id' in admissionsRow, false)
  const postRow = postSubmissionRequestRow(postRequest(), 'user-1', 'requirement-2')
  assertEquals(postRow.requirement_id, 'requirement-2')
})
