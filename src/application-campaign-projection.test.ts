import { describe, expect, it } from 'vitest'
import {
  projectCampaign,
  type ApplicationCampaignProjectionInput,
  type ProjectionExternalCommitment,
} from '../supabase/functions/_shared/application-campaign-projection'
import type {
  ApplicationCampaign,
  ApplicationCase,
  ApplicationContact,
  Evidence,
  Opportunity,
  Requirement,
} from '../supabase/functions/_shared/david-applications'

const now = '2026-11-26T12:00:00.000Z'

function deadline(dateTime: string) {
  return { dateTime, timezone: 'UTC', label: dateTime.slice(0, 10), sourceUrl: 'https://university.example/official', retrievedAt: now }
}

function opportunity(id: string, institution: string, programmeTitle: string, dateTime: string, degreeOrAwardType = 'PhD'): Opportunity {
  return {
    id, campaignId: 'campaign-1', userId: 'user-1', institution, department: null, programmeTitle, degreeOrAwardType, entryTerm: 'Fall 2027', officialUrl: 'https://university.example/official', applicationUrl: 'https://university.example/apply', deadline: deadline(dateTime), fee: null, funding: { status: 'full', summary: 'Full funding', stipend: null, tuitionCoverage: 'Full' }, eligibility: [], academicPrerequisites: [], requiredTests: [], languageRequirements: [], requiredDocuments: [], requiredEssays: [], recommendationCount: 1, supervisorContactExpectation: 'recommended', faculty: [], contactRequirements: [], applicationStages: ['account', 'documents', 'review', 'submission'], authorshipRules: [], citations: [], retrievalDate: now, verificationStatus: 'verified', confidence: 100, fitScore: 90, admissionLikelihoodFactors: [], recommendationRationale: '',
  }
}

function requirement(applicationCaseId: string, id: string, name: string, status: Requirement['status'], overrides: Partial<Requirement> = {}): Requirement {
  return {
    id, applicationCaseId, name, category: 'other', source: null, required: true, exactInstructions: '', deadline: null, status, responsibleParty: 'david', linkedArtifactId: null, verificationEvidenceIds: [], blockerReason: null, dependencyIds: [], requirementType: null, ...overrides,
  }
}

function applicationCase(id: string, opportunityId: string, requirements: Requirement[], overrides: Partial<ApplicationCase> = {}): ApplicationCase {
  return {
    id, campaignId: 'campaign-1', opportunityId, userId: 'user-1', taskId: 'task-1', currentStage: 'document_preparation', status: 'active', requirements, portalAccount: { identifier: null, destinationEmail: null, provider: null, lastVerifiedAt: null }, portalSessionId: null, documents: [], essays: [], contacts: [], referees: [], writerAssignmentIds: [], communications: [], approvalIds: [], deadlines: [], submittedValues: [], portalCheckpoints: [], evidenceIds: [], blockers: [], nextAction: '', finalOutcome: null, applicationId: null, submissionAttemptKey: null, submittedAt: null, createdAt: now, updatedAt: now, ...overrides,
  }
}

function evidenceFor(applicationCaseId: string, id: string, capturedAt = now): Evidence {
  return { id, applicationCaseId, kind: 'portal_observation', sourceUrl: null, provider: 'portal', providerMessageId: null, providerThreadId: null, assetId: null, excerpt: 'Verified resulting state', capturedAt, metadata: {} }
}

function campaign(): ApplicationCampaign {
  return { id: 'campaign-1', userId: 'user-1', taskId: 'task-1', ownerSpecialistId: 'david', objective: 'Apply to graduate programmes', applicationKind: 'phd', targetFields: ['Physics'], targetCountries: ['US'], degreeLevel: 'PhD', intakeYear: 2027, fundingRequirements: ['full'], quantityTarget: 8, searchCriteria: {}, approvedStrategy: null, status: 'executing', opportunityIds: [], applicationCaseIds: [], deadlines: [], progress: { completed: 0, total: 1, label: '', nextAction: '', blockers: [], evidenceCount: 0 }, executionEvidenceIds: [], createdAt: now, updatedAt: now }
}

function baseInput(overrides: Partial<ApplicationCampaignProjectionInput> = {}): ApplicationCampaignProjectionInput {
  return { campaign: campaign(), opportunities: [], cases: [], evidence: [], contacts: [], assignments: [], communications: [], executions: [], interactions: [], commitments: [], now, ...overrides }
}

function commitment(requirementId: string, name = 'Professor Adeyemi', promisedAt = '2026-11-28T12:00:00.000Z'): ProjectionExternalCommitment {
  return { id: `commitment:${requirementId}`, requirementId, actor: { id: 'professor-adeyemi', kind: 'recommender', name }, promisedAt, note: 'Promised by email.' }
}

describe('canonical application campaign projection', () => {
  it('maps active work, external waits, strict user actions, and verified done state', () => {
    const stanford = applicationCase('case-stanford', 'opp-stanford', [
      requirement('case-stanford', 'req-form', 'Application form', 'in_progress', { category: 'portal', requirementType: 'portal_section' }),
      requirement('case-stanford', 'req-recommendation', 'Recommendation letter', 'awaiting_referee', { category: 'reference', requirementType: 'referee', responsibleParty: 'referee' }),
    ], { contacts: ['prof-1'], referees: ['prof-1'] })
    const mit = applicationCase('case-mit', 'opp-mit', [
      requirement('case-mit', 'req-approval', 'Supervisor outreach approval', 'awaiting_user', { requirementType: 'approval', responsibleParty: 'applicant' }),
    ])
    const ucl = applicationCase('case-ucl', 'opp-ucl', [
      requirement('case-ucl', 'req-submitted', 'Application submission', 'submitted', { category: 'portal', requirementType: 'submission', verificationEvidenceIds: ['e-submitted'] }),
    ], { currentStage: 'submitted', status: 'submitted', applicationId: 'UCL-123', submittedAt: '2026-11-24T10:00:00.000Z' })
    const contacts: ApplicationContact[] = [{ id: 'prof-1', applicationCaseId: 'case-stanford', kind: 'referee', name: 'Professor Adeyemi', email: 'prof@example.edu', institution: 'Stanford', relationship: 'Professor', specialty: 'Physics', providerContactId: null, gmailThreadId: null, lastProviderMessageId: null, consentToContact: true }]
    const projection = projectCampaign(baseInput({
      opportunities: [opportunity('opp-stanford', 'Stanford', 'Physics PhD', '2026-12-03T23:59:00Z'), opportunity('opp-mit', 'MIT', 'EECS PhD', '2026-12-15T23:59:00Z'), opportunity('opp-ucl', 'UCL', 'Computer Science PhD', '2026-12-20T23:59:00Z')],
      cases: [stanford, mit, ucl], contacts,
      interactions: [{ id: 'interaction:approval', applicationCaseId: 'case-mit', requirementId: 'req-approval', taskId: 'task-1', kind: 'approve', question: 'Approve supervisor outreach', reason: 'David prepared the exact outreach package.', status: 'pending', dedupeKey: 'supervisor-outreach:mit', deadline: deadline('2026-12-15T23:59:00Z') }],
      commitments: [commitment('req-recommendation')],
      executions: [{ applicationCaseId: 'case-stanford', requirementId: 'req-form', state: 'active', owner: 'david', runId: 'run-1' }],
      evidence: [evidenceFor('case-ucl', 'e-submitted', '2026-11-24T10:00:00.000Z')],
    }))

    expect(projection.version).toBe('application-campaign-projection@1')
    expect(projection.activeWork).toHaveLength(1)
    expect(projection.activeWork[0]).toMatchObject({ label: 'Completing application form', applicationCaseIds: ['case-stanford'] })
    expect(projection.waitingExternal[0]).toMatchObject({ label: 'Waiting on Professor Adeyemi', actor: { name: 'Professor Adeyemi' } })
    expect(projection.userActions[0]).toMatchObject({ interaction: { id: 'interaction:approval' }, references: [{ requirementId: 'req-approval', applicationCaseId: 'case-mit' }] })
    expect(projection.recentlyCompleted[0]).toMatchObject({ label: 'Application submitted', applicationCaseId: 'case-ucl', evidenceIds: ['e-submitted'] })
    expect(projection.applications.find(item => item.applicationCaseId === 'case-ucl')).toMatchObject({ overallState: 'awaiting_decision', submissionState: 'submitted' })
  })

  it('does not mark an action complete without accepted evidence and separates queued from active', () => {
    const queued = applicationCase('case-queued', 'opp-queued', [requirement('case-queued', 'req-queued', 'Application form', 'in_progress', { category: 'portal', requirementType: 'portal_section' })])
    const clickedButUnverified = applicationCase('case-unverified', 'opp-unverified', [requirement('case-unverified', 'req-clicked', 'Application submission', 'approved', { category: 'portal', requirementType: 'submission' })])
    const projection = projectCampaign(baseInput({
      opportunities: [opportunity('opp-queued', 'Oxford', 'DPhil Computer Science', '2026-12-20T23:59:00Z'), opportunity('opp-unverified', 'Cambridge', 'PhD Physics', '2026-12-20T23:59:00Z')],
      cases: [queued, clickedButUnverified],
      executions: [{ applicationCaseId: 'case-queued', requirementId: 'req-queued', state: 'queued', owner: 'david' }],
    }))
    expect(projection.activeWork).toHaveLength(1)
    expect(projection.queuedWork).toMatchObject([{ queued: true, applicationCaseIds: ['case-queued'] }])
    expect(projection.recentlyCompleted).toHaveLength(0)
    expect(projection.applications.find(item => item.applicationCaseId === 'case-unverified')?.completedRequirementCount).toBe(0)
  })

  it('requires the evidence row itself and marks an unverified submission at risk', () => {
    const missingEvidence = applicationCase('case-missing-evidence', 'opp-missing-evidence', [requirement('case-missing-evidence', 'req-missing-evidence', 'Application submission', 'submitted', { category: 'portal', requirementType: 'submission', verificationEvidenceIds: ['e-not-loaded'] })], { currentStage: 'submitted', status: 'submitted' })
    const projection = projectCampaign(baseInput({
      opportunities: [opportunity('opp-missing-evidence', 'Duke', 'Physics PhD', '2026-12-20T23:59:00Z')],
      cases: [missingEvidence],
    }))
    expect(projection.recentlyCompleted).toHaveLength(0)
    expect(projection.applications[0]).toMatchObject({ submissionState: 'unverified', overallState: 'at_risk', progressState: 'Submission needs verification' })
    expect(projection.risks[0]).toMatchObject({ reasonCodes: ['SUBMISSION_UNVERIFIED'], level: 'elevated' })
  })

  it('groups shared external waits and shared user actions without stale duplicates', () => {
    const cases = ['case-a', 'case-b', 'case-c'].map((id, index) => applicationCase(id, `opp-${id}`, [requirement(id, `req-${id}`, 'Recommendation letter', 'awaiting_referee', { category: 'reference', requirementType: 'referee', responsibleParty: 'referee' }), requirement(id, `transcript-${id}`, 'Official transcript', 'awaiting_user', { category: 'academic', requirementType: 'document' })], { contacts: [`prof-${id}`], referees: [`prof-${id}`], updatedAt: `2026-11-${String(20 + index).padStart(2, '0')}T10:00:00Z` }))
    const projection = projectCampaign(baseInput({
      opportunities: cases.map((item, index) => opportunity(`opp-${item}`, ['Stanford', 'Oxford', 'MIT'][index]!, `Programme ${index}`, `2026-12-${String(3 + index).padStart(2, '0')}T23:59:00Z`)),
      cases,
      interactions: cases.map(item => ({ id: `attachment:${item.id}`, applicationCaseId: item.id, requirementId: `transcript-${item.id}`, taskId: 'task-1', kind: 'attachment' as const, question: 'Attach your transcript', reason: 'The same transcript is required for these applications.', status: 'pending' as const, dedupeKey: 'transcript:shared' })),
      commitments: cases.map(item => commitment(`req-${item.id}`)),
      contacts: cases.map(item => ({ id: `prof-${item}`, applicationCaseId: item, kind: 'referee' as const, name: 'Professor Adeyemi', email: null, institution: null, relationship: null, specialty: null, providerContactId: 'professor-adeyemi', gmailThreadId: null, lastProviderMessageId: null, consentToContact: true })),
    }))
    expect(projection.waitingExternal).toHaveLength(1)
    expect(projection.waitingExternal[0]?.applicationCaseIds).toEqual(['case-a', 'case-b', 'case-c'])
    expect(projection.userActions).toHaveLength(1)
    expect(projection.userActions[0]?.applicationCaseIds).toEqual(['case-a', 'case-b', 'case-c'])

    const answered = projectCampaign(baseInput({ opportunities: cases.map((item, index) => opportunity(`opp-${item}`, ['Stanford', 'Oxford', 'MIT'][index]!, `Programme ${index}`, `2026-12-${String(3 + index).padStart(2, '0')}T23:59:00Z`)), cases, interactions: [{ id: 'attachment:case-a', applicationCaseId: 'case-a', requirementId: 'transcript-case-a', taskId: 'task-1', kind: 'attachment', question: 'Attach your transcript', reason: 'Resolved', status: 'answered', dedupeKey: 'transcript:shared' }] }))
    expect(answered.userActions).toHaveLength(0)
  })

  it('uses deadline slack and respects a safe external commitment', () => {
    const risky = applicationCase('case-risk', 'opp-risk', [requirement('case-risk', 'req-transcript', 'Official transcript for WES', 'awaiting_institution', { category: 'academic', requirementType: 'document', responsibleParty: 'institution', deadline: deadline('2026-12-03T23:59:00Z') })])
    const safe = applicationCase('case-safe', 'opp-safe', [requirement('case-safe', 'req-reference', 'Recommendation letter', 'awaiting_referee', { category: 'reference', requirementType: 'referee', responsibleParty: 'referee', deadline: deadline('2026-12-15T23:59:00Z') })])
    const projection = projectCampaign(baseInput({ opportunities: [opportunity('opp-risk', 'Princeton', 'Physics PhD', '2026-12-03T23:59:00Z'), opportunity('opp-safe', 'UCL', 'Physics PhD', '2026-12-15T23:59:00Z')], cases: [risky, safe], commitments: [commitment('req-reference', 'Professor Adeyemi', '2026-11-28T12:00:00Z')] }))
    const risk = projection.risks.find(item => item.requirementId === 'req-transcript')
    expect(risk).toMatchObject({ level: 'critical', reasonCodes: expect.arrayContaining(['DEADLINE_LOW_SLACK', 'EXTERNAL_REGISTRAR_WAIT']), expectedCompletionMs: 10 * 24 * 60 * 60 * 1_000, safetyBufferMs: 2 * 24 * 60 * 60 * 1_000 })
    expect(risk?.deadlineSlackMs).toBeLessThan(0)
    expect(projection.risks.some(item => item.requirementId === 'req-reference')).toBe(false)
  })

  it('converges from the current state after stale or out-of-order interaction data', () => {
    const app = applicationCase('case-race', 'opp-race', [requirement('case-race', 'req-approval', 'Final application approval', 'ready', { requirementType: 'approval', responsibleParty: 'applicant' })])
    const base = baseInput({ opportunities: [opportunity('opp-race', 'Stanford', 'Physics PhD', '2026-12-20T23:59:00Z')], cases: [app] })
    const pending = projectCampaign({ ...base, interactions: [{ id: 'approval-1', applicationCaseId: 'case-race', requirementId: 'req-approval', taskId: 'task-1', kind: 'approve', question: 'Approve final application', reason: 'Ready for your approval.', status: 'pending' }] })
    expect(pending.userActions).toHaveLength(1)
    const resolved = projectCampaign({ ...base, interactions: [{ id: 'approval-1', applicationCaseId: 'case-race', requirementId: 'req-approval', taskId: 'task-1', kind: 'approve', question: 'Approve final application', reason: 'Resolved.', status: 'answered' }] })
    expect(resolved.userActions).toHaveLength(0)
    expect(resolved.applications[0]?.userBlockedRequirements).toHaveLength(0)
    expect(resolved.integrity.valid).toBe(true)

    const stalePending = projectCampaign({ ...base, interactions: [
      { id: 'approval-1', applicationCaseId: 'case-race', requirementId: 'req-approval', taskId: 'task-1', kind: 'approve', question: 'Approve final application', reason: 'Old pending row.', status: 'pending', dedupeKey: 'approval:race' },
      { id: 'approval-1-answer', applicationCaseId: 'case-race', requirementId: 'req-approval', taskId: 'task-1', kind: 'approve', question: 'Approve final application', reason: 'Answered later.', status: 'answered', dedupeKey: 'approval:race' },
    ] })
    expect(stalePending.userActions).toHaveLength(0)

    const contaminated = projectCampaign({ ...base, interactions: [{ id: 'orphan', applicationCaseId: 'case-not-in-campaign', requirementId: 'req-approval', taskId: 'task-1', kind: 'approve', question: 'Orphan', reason: 'Invalid scope.', status: 'pending' }] })
    expect(contaminated.integrity.valid).toBe(false)
    expect(contaminated.integrity.issues).toContain('orphan_interaction:orphan')
  })
})
