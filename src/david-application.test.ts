import { describe, expect, it } from 'vitest'
import {
  buildFacultyMatch,
  buildReadinessReport,
  canSubmitApplication,
  canUseFactForSubmission,
  classifyApplicationIntent,
  classifyApplicationReply,
  createApplicantFact,
  createEmptyApplicantProfile,
  createHumanAssignment,
  createInterAgentRequest,
  createPortalExecutionContract,
  matchApplicationOtp,
  nextApplicationCaseState,
  parseDeadline,
  rankOpportunities,
  recordPortalCheckpoint,
  resolveFactConflict,
  submissionIdempotencyKey,
  verifyOpportunity,
  type ApplicationCase,
  type Opportunity,
} from './data/david-application'

const opportunity: Opportunity = {
  id: 'opportunity-1',
  campaignId: 'campaign-1',
  userId: 'user-1',
  institution: 'Controlled University',
  department: 'Physics',
  programmeTitle: 'PhD in Computational Physics',
  degreeOrAwardType: 'PhD',
  entryTerm: 'Fall 2027',
  officialUrl: 'https://physics.controlled.example/phd',
  applicationUrl: 'https://apply.controlled.example/phd',
  deadline: parseDeadline('2027-01-15', 'Africa/Lagos', 'https://physics.controlled.example/phd'),
  fee: { amount: 0, currency: 'USD', waiverAvailable: true },
  funding: { status: 'full', summary: 'Full tuition and stipend.', stipend: 'Annual stipend', tuitionCoverage: 'Full' },
  eligibility: ['Computational physics background'],
  academicPrerequisites: ['Relevant degree'],
  requiredTests: [],
  languageRequirements: [],
  requiredDocuments: ['CV', 'Transcript'],
  requiredEssays: ['Statement of purpose'],
  recommendationCount: 3,
  supervisorContactExpectation: 'recommended',
  faculty: [buildFacultyMatch({ name: 'Dr. Ada Example', department: 'Physics', officialUrl: 'https://physics.controlled.example/faculty/ada', researchAreas: ['simulation'], selectedWork: ['Sparse solvers'], fitScore: 92, fitRationale: 'Matches the applicant project.', contactAllowed: true })],
  contactRequirements: [],
  applicationStages: ['account', 'documents', 'review', 'submission'],
  authorshipRules: ['Applicant must approve final statements.'],
  citations: [{ url: 'https://physics.controlled.example/phd', excerpt: 'Full funding and deadline.', retrievedAt: '2026-08-05T10:00:00Z', sourceType: 'official' }],
  retrievalDate: '2026-08-05T10:00:00Z',
  verificationStatus: 'verified',
  confidence: 96,
  fitScore: 88,
  admissionLikelihoodFactors: ['Strong research fit'],
  recommendationRationale: 'Verified full funding and strong research fit.',
}

function applicationCase(): ApplicationCase {
  return {
    id: 'case-1', campaignId: 'campaign-1', opportunityId: opportunity.id, userId: 'user-1', taskId: 'task-1',
    currentStage: 'portal_preparation', status: 'awaiting_submission_approval', requirements: [
      { id: 'requirement-cv', applicationCaseId: 'case-1', name: 'CV', category: 'academic', source: opportunity.citations[0]!, required: true, exactInstructions: 'Upload PDF', deadline: opportunity.deadline, status: 'approved', responsibleParty: 'applicant', linkedArtifactId: 'artifact-cv', verificationEvidenceIds: ['evidence-upload'], blockerReason: null },
      { id: 'requirement-sop', applicationCaseId: 'case-1', name: 'Statement of purpose', category: 'essay', source: opportunity.citations[0]!, required: true, exactInstructions: 'Upload PDF', deadline: opportunity.deadline, status: 'approved', responsibleParty: 'applicant', linkedArtifactId: 'artifact-sop', verificationEvidenceIds: ['evidence-upload'], blockerReason: null },
    ],
    portalAccount: { identifier: 'applicant@example.com', destinationEmail: 'applicant@example.com', provider: 'controlled', lastVerifiedAt: '2026-08-05T10:00:00Z' },
    portalSessionId: 'session-1', documents: ['artifact-cv'], essays: ['artifact-sop'], contacts: [], referees: ['referee-1'], writerAssignmentIds: [], communications: [], approvalIds: ['approval-final'], deadlines: [opportunity.deadline!], submittedValues: [{ field: 'degree', value: 'PhD', provenance: createApplicantFact('PhD', 'user_statement').provenance }], portalCheckpoints: ['checkpoint-1'], evidenceIds: ['evidence-upload'], blockers: [], nextAction: 'Submit after approval.', finalOutcome: null, applicationId: null, submissionAttemptKey: null, submittedAt: null, createdAt: '2026-08-05T10:00:00Z', updatedAt: '2026-08-05T10:00:00Z',
  }
}

describe('David application execution domain', () => {
  it('routes application outcomes to David and identifies delegated Roon work', () => {
    expect(classifyApplicationIntent('Find and apply to ten PhD programmes', 'Ask professors, coordinate referees, and retrieve portal OTPs')).toMatchObject({ owner: 'david', applicationKind: 'phd', delegatesToRoon: true })
    expect(classifyApplicationIntent('Apply for Chevening')).toMatchObject({ owner: 'david', applicationKind: 'scholarship' })
  })

  it('preserves provenance and flags conflicting facts instead of choosing silently', () => {
    const profile = createEmptyApplicantProfile('user-1')
    profile.legalName = createApplicantFact('David Dosu', 'uploaded_document', { sourceAssetIds: ['cv-1'] })
    expect(profile.legalName?.provenance.sourceAssetIds).toEqual(['cv-1'])
    const result = resolveFactConflict('graduationDate', [
      createApplicantFact('2023-07-01', 'uploaded_document', { sourceAssetIds: ['transcript-1'] }),
      createApplicantFact('2023-09-01', 'uploaded_document', { sourceAssetIds: ['cv-1'] }),
    ])
    expect(result.status).toBe('conflict')
  })

  it('verifies official sources and ranks funded, research-aligned options', () => {
    expect(verifyOpportunity(opportunity).verified).toBe(true)
    const ranked = rankOpportunities([opportunity], { targetCountries: ['controlled'], fundingRequirements: ['full funding'], searchCriteria: {} })
    expect(ranked[0]?.score).toBeGreaterThan(70)
    expect(ranked[0]?.rationale).toContain('official requirements verified')
  })

  it('creates verified section checkpoints and blocks ambiguous saves', () => {
    const contract = createPortalExecutionContract({ portalIdentity: 'controlled', sectionIdentity: 'documents', expectedFields: [{ field: 'cv', source: 'artifact-cv', required: true }], requiredUploads: [{ assetId: 'artifact-cv', destination: 'CV document' }], ambiguousFields: [], completionCriteria: ['Documents accepted'], saveCriteria: ['Saved section banner'], evidenceRequirements: ['Screenshot'], allowedUserHandoffs: ['CAPTCHA'] })
    const checkpoint = recordPortalCheckpoint({ id: 'checkpoint-1', applicationCaseId: 'case-1', portal: 'controlled', accountIdentifier: 'applicant@example.com', url: 'https://apply.controlled.example/documents', section: 'documents', contract, enteredValues: { cv: 'artifact-cv' }, valueSources: { cv: 'artifact-cv' }, uploadedArtifacts: ['artifact-cv'], saveConfirmation: 'Saved section', validationErrors: [], screenshots: ['screenshot-1'], sessionInformation: { sessionId: 'session-1', fingerprint: 'fingerprint-1', expiresAt: null }, completionSignal: 'Documents accepted', nextStep: 'Review' })
    expect(checkpoint.verified).toBe(true)
  })

  it('matches only fresh, institution-specific OTPs', () => {
    const matched = matchApplicationOtp({ applicationCaseId: 'case-1', institution: 'Controlled University', portal: 'application portal', destinationEmail: 'applicant@example.com', requestedAt: '2026-08-05T12:00:00Z', senderClues: ['controlled.example'], subjectClues: ['verification'] }, [
      { id: 'stale', threadId: 'old', from: 'no-reply@controlled.example', to: 'applicant@example.com', subject: 'Verification', body: 'Your code is 111111', receivedAt: '2026-08-05T11:59:00Z' },
      { id: 'fresh', threadId: 'thread-1', from: 'no-reply@controlled.example', to: 'applicant@example.com', subject: 'Verification for Controlled University', body: 'Use verification code 482913 to continue.', receivedAt: '2026-08-05T12:01:00Z', applicationCaseId: 'case-1' },
    ])
    expect(matched).toMatchObject({ code: '482913', messageId: 'fresh' })
    expect(matchApplicationOtp({ applicationCaseId: 'case-1', institution: 'Other University', portal: 'portal', destinationEmail: 'applicant@example.com', requestedAt: '2026-08-05T12:00:00Z', senderClues: [], subjectClues: [] }, [{ id: 'unrelated', threadId: null, from: 'other@example.com', to: 'applicant@example.com', subject: 'Verification', body: '999999', receivedAt: '2026-08-05T12:01:00Z' }])).toBeNull()
    expect(matchApplicationOtp({ applicationCaseId: 'case-1', institution: 'Controlled University', portal: 'portal', destinationEmail: 'applicant@example.com', requestedAt: '2026-08-05T12:00:00Z', senderClues: ['controlled.example'], subjectClues: [] }, [{ id: 'spoofed', threadId: null, from: 'attacker.example', to: 'applicant@example.com', subject: 'Controlled University verification', body: 'controlled.example code 482913', receivedAt: '2026-08-05T12:01:00Z' }])).toBeNull()
  })

  it('builds a deterministic readiness report and gates one final submission', () => {
    const report = buildReadinessReport({ applicationCase: applicationCase(), opportunity, artifacts: [
      { id: 'artifact-cv', fileAssetId: 'file-cv', kind: 'approved_final', originalAssetIds: ['cv'], programmeId: opportunity.id, applicationCaseId: 'case-1', templateVersion: 'cv@1', promptVersion: 'cv-prompt@1', author: 'david', revisionOf: null, revisionHistory: [], checksum: 'a'.repeat(64), approvalStatus: 'approved', finalSubmissionDestination: 'CV document' },
      { id: 'artifact-sop', fileAssetId: 'file-sop', kind: 'approved_final', originalAssetIds: [], programmeId: opportunity.id, applicationCaseId: 'case-1', templateVersion: null, promptVersion: 'sop-prompt@1', author: 'writer', revisionOf: null, revisionHistory: [], checksum: 'b'.repeat(64), approvalStatus: 'approved', finalSubmissionDestination: 'Statement of purpose' },
    ], refereeStatus: ['referee-1: submitted'], portalValidationState: ['No errors'] })
    expect(report.ready).toBe(true)
    expect(canSubmitApplication(report, false)).toMatchObject({ allowed: false })
    expect(canSubmitApplication(report, true)).toMatchObject({ allowed: true })
    expect(canSubmitApplication(report, true, submissionIdempotencyKey('case-1', 'checkpoint-1', 'package'))).toMatchObject({ allowed: false })
  })

  it('does not declare readiness while a contextual application answer is unresolved', () => {
    const report = buildReadinessReport({
      applicationCase: applicationCase(),
      opportunity,
      artifacts: [],
      pendingInputs: [{
        id: 'application-input:phone',
        requirementId: 'phone',
        title: 'Add mobile phone',
        question: 'What should I enter for mobile phone?',
        detail: 'This appears in Personal details.',
        deadline: null,
        kind: 'fact',
        status: 'parked',
      }],
      refereeStatus: ['referee-1: submitted'],
      portalValidationState: ['No errors'],
    })
    expect(report.ready).toBe(false)
    expect(report.blockers).toContain('1 application detail still needs an answer.')
  })

  it('classifies post-submission mail into the next application stage', () => {
    expect(classifyApplicationReply('Interview invitation', 'We would like to invite you to an interview.')).toBe('interview_invitation')
    expect(nextApplicationCaseState('interview_invitation')).toMatchObject({ currentStage: 'interview', status: 'interview' })
  })

  it('keeps inferred facts out of submission packages and surfaces them for confirmation', () => {
    const inferred = createApplicantFact('Quantum computing', 'generated_inference')
    expect(canUseFactForSubmission(inferred)).toBe(false)
    expect(canUseFactForSubmission(createApplicantFact('Quantum computing', 'user_statement'))).toBe(true)
  })

  it('creates durable writer and Roon handoff contracts without losing idempotency', () => {
    const assignment = createHumanAssignment({
      id: 'assignment-1', applicationCaseId: 'case-1', writerId: 'writer-1', specialty: 'graduate SOPs',
      deliverable: 'Statement of purpose', brief: 'Use only the attached factual sources.', sourceMaterials: ['asset-cv'],
      deadline: opportunity.deadline, price: null, questions: [], finalArtifactId: null,
    })
    expect(assignment.status).toBe('draft')
    const request = createInterAgentRequest({ id: 'request-1', taskId: 'task-1', agentRunId: 'run-1', applicationCaseId: 'case-1', fromSpecialistId: 'david', toSpecialistId: 'roon', kind: 'read_application_reply', payload: { requestedAt: '2026-08-05T12:00:00Z' }, idempotencyKey: 'reply-1' })
    expect(request.status).toBe('queued')
    expect(request.idempotencyKey).toBe('reply-1')
  })
})
