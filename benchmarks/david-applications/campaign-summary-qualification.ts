import {
  projectCampaign,
  type ApplicationCampaignProjection,
  type ApplicationCampaignProjectionInput,
  type ProjectionExternalCommitment,
} from '../../supabase/functions/_shared/application-campaign-projection'
import type {
  ApplicationCampaign,
  ApplicationCase,
  ApplicationContact,
  Evidence,
  Opportunity,
  Requirement,
} from '../../supabase/functions/_shared/david-applications'

export type CampaignSummaryQualificationCase = {
  id: string
  passed: boolean
  assertions: Array<{ id: string; passed: boolean; detail: string }>
  projection: ApplicationCampaignProjection
  generatedSummary: string
}

export type CampaignSummaryQualificationReport = {
  suiteVersion: 'david_campaign_summary_qualification_v1'
  passed: boolean
  metrics: Record<string, number | boolean | string>
  cases: CampaignSummaryQualificationCase[]
  examples: Array<{
    caseId: string
    status: string
    summary: string
    nextMeaningfulEvent: string | null
  }>
}

const now = '2026-11-26T12:00:00.000Z'

function deadline(dateTime: string) {
  return { dateTime, timezone: 'UTC', label: dateTime.slice(0, 10), sourceUrl: 'https://university.example/official', retrievedAt: now }
}

function campaign(): ApplicationCampaign {
  return {
    id: 'campaign-qualification-1', userId: 'benchmark-applicant', taskId: 'task-qualification-1', ownerSpecialistId: 'david', objective: 'Apply to graduate programmes', applicationKind: 'phd', targetFields: ['Physics'], targetCountries: ['US', 'UK'], degreeLevel: 'PhD', intakeYear: 2027, fundingRequirements: ['full'], quantityTarget: 4, searchCriteria: {}, approvedStrategy: null, status: 'executing', opportunityIds: [], applicationCaseIds: [], deadlines: [], progress: { completed: 0, total: 4, label: '', nextAction: '', blockers: [], evidenceCount: 0 }, executionEvidenceIds: [], createdAt: now, updatedAt: now,
  }
}

function opportunity(id: string, institution: string, programmeTitle: string, due: string): Opportunity {
  return {
    id, campaignId: 'campaign-qualification-1', userId: 'benchmark-applicant', institution, department: null, programmeTitle, degreeOrAwardType: 'PhD', entryTerm: 'Fall 2027', officialUrl: 'https://university.example/official', applicationUrl: 'https://university.example/apply', deadline: deadline(due), fee: null, funding: { status: 'full', summary: 'Full funding', stipend: null, tuitionCoverage: 'Full' }, eligibility: [], academicPrerequisites: [], requiredTests: [], languageRequirements: [], requiredDocuments: [], requiredEssays: [], recommendationCount: 1, supervisorContactExpectation: 'recommended', faculty: [], contactRequirements: [], applicationStages: ['account', 'documents', 'review', 'submission'], authorshipRules: [], citations: [], retrievalDate: now, verificationStatus: 'verified', confidence: 100, fitScore: 90, admissionLikelihoodFactors: [], recommendationRationale: '',
  }
}

function requirement(applicationCaseId: string, id: string, name: string, status: Requirement['status'], overrides: Partial<Requirement> = {}): Requirement {
  return {
    id, applicationCaseId, name, category: 'other', source: null, required: true, exactInstructions: '', deadline: null, status, responsibleParty: 'david', linkedArtifactId: null, verificationEvidenceIds: [], blockerReason: null, dependencyIds: [], requirementType: null, ...overrides,
  }
}

function applicationCase(id: string, opportunityId: string, requirements: Requirement[], overrides: Partial<ApplicationCase> = {}): ApplicationCase {
  return {
    id, campaignId: 'campaign-qualification-1', opportunityId, userId: 'benchmark-applicant', taskId: 'task-qualification-1', currentStage: 'document_preparation', status: 'active', requirements, portalAccount: { identifier: null, destinationEmail: null, provider: null, lastVerifiedAt: null }, portalSessionId: null, documents: [], essays: [], contacts: [], referees: [], writerAssignmentIds: [], communications: [], approvalIds: [], deadlines: [], submittedValues: [], portalCheckpoints: [], evidenceIds: [], blockers: [], nextAction: '', finalOutcome: null, applicationId: null, submissionAttemptKey: null, submittedAt: null, createdAt: now, updatedAt: now, ...overrides,
  }
}

function evidence(applicationCaseId: string, id: string): Evidence {
  return { id, applicationCaseId, kind: 'submission_confirmation', sourceUrl: 'https://university.example/apply', provider: 'portal', providerMessageId: null, providerThreadId: null, assetId: null, excerpt: 'Submission confirmation and application ID recorded.', capturedAt: now, metadata: {} }
}

function contact(applicationCaseId: string, id: string, name: string): ApplicationContact {
  return { id, applicationCaseId, kind: 'referee', name, email: `${id}@example.edu`, providerContactId: id, gmailThreadId: null, lastProviderMessageId: null, consentToContact: true }
}

function commitment(requirementId: string): ProjectionExternalCommitment {
  return { id: `commitment:${requirementId}`, requirementId, actor: { id: 'professor-adeyemi', kind: 'recommender', name: 'Professor Adeyemi' }, promisedAt: '2026-11-28T12:00:00.000Z', sourceEvidenceId: `email:${requirementId}`, note: 'Promised by email.' }
}

function projectionInput(): ApplicationCampaignProjectionInput {
  const stanford = applicationCase('case-stanford', 'opp-stanford', [
    requirement('case-stanford', 'req-stanford-form', 'Application form', 'in_progress', { category: 'portal', requirementType: 'portal_section' }),
    requirement('case-stanford', 'req-stanford-referee', 'Recommendation letter', 'awaiting_referee', { category: 'reference', requirementType: 'referee', responsibleParty: 'referee' }),
  ], { contacts: ['prof-1'], referees: ['prof-1'] })
  const mit = applicationCase('case-mit', 'opp-mit', [
    requirement('case-mit', 'req-mit-approval', 'Final application approval', 'ready', { requirementType: 'approval', responsibleParty: 'applicant' }),
  ])
  const oxford = applicationCase('case-oxford', 'opp-oxford', [
    requirement('case-oxford', 'req-oxford-transcript', 'Official transcript', 'awaiting_institution', { category: 'academic', requirementType: 'transcript', responsibleParty: 'institution', deadline: deadline('2026-12-03T23:59:00Z') }),
  ])
  const ucl = applicationCase('case-ucl', 'opp-ucl', [
    requirement('case-ucl', 'req-ucl-submission', 'Application submission', 'submitted', { category: 'portal', requirementType: 'submission', verificationEvidenceIds: ['e-ucl-submitted'] }),
  ], { currentStage: 'submitted', status: 'submitted', applicationId: 'UCL-123', submittedAt: '2026-11-24T10:00:00.000Z' })
  const contacts = [contact('case-stanford', 'prof-1', 'Professor Adeyemi')]
  return {
    campaign: campaign(),
    opportunities: [
      opportunity('opp-stanford', 'Stanford', 'Physics PhD', '2026-12-03T23:59:00Z'),
      opportunity('opp-mit', 'MIT', 'EECS PhD', '2026-12-15T23:59:00Z'),
      opportunity('opp-oxford', 'Oxford', 'DPhil Computer Science', '2026-12-03T23:59:00Z'),
      opportunity('opp-ucl', 'UCL', 'Computer Science PhD', '2026-12-20T23:59:00Z'),
    ],
    cases: [stanford, mit, oxford, ucl],
    contacts,
    evidence: [evidence('case-ucl', 'e-ucl-submitted')],
    commitments: [commitment('req-stanford-referee')],
    executions: [{ applicationCaseId: 'case-stanford', requirementId: 'req-stanford-form', state: 'active', owner: 'david', runId: 'run-stanford-form' }],
    interactions: [{ id: 'interaction:mit-approval', applicationCaseId: 'case-mit', requirementId: 'req-mit-approval', taskId: 'task-qualification-1', kind: 'approve', question: 'Approve final application', reason: 'The application is ready for your review.', status: 'pending', dedupeKey: 'approval:mit' }],
    now,
  }
}

function generatedSummary(projection: ApplicationCampaignProjection) {
  const applicationLine = projection.applications.map(item => `${item.institution}: ${item.progressState}`).join('; ')
  const doing = projection.activeWork.map(item => item.label).join(', ') || 'nothing'
  const waiting = projection.waitingExternal.map(item => item.label).join(', ') || 'nothing'
  const needsYou = projection.userActions.map(item => item.label).join(', ') || 'nothing'
  const risks = projection.risks.map(item => `${item.reason} (${item.level})`).join(', ') || 'none'
  const completed = projection.recentlyCompleted.map(item => item.label).join(', ') || 'none'
  return `${projection.counts.applications} applications; ${applicationLine}. Doing: ${doing}. Waiting: ${waiting}. Needs you: ${needsYou}. At risk: ${risks}. Completed recently: ${completed}.`
}

function qualificationCase(id: string, projection: ApplicationCampaignProjection, assertions: Array<{ id: string; passed: boolean; detail: string }>): CampaignSummaryQualificationCase {
  return { id, passed: assertions.every(item => item.passed), assertions, projection, generatedSummary: generatedSummary(projection) }
}

export function runCampaignSummaryQualification(): CampaignSummaryQualificationReport {
  const input = projectionInput()
  const projection = projectCampaign(input)
  const transitionProjection = projectCampaign({
    ...input,
    interactions: input.interactions?.map(interaction => ({ ...interaction, status: 'answered' as const })),
  })
  const cases = [qualificationCase('campaign-summary-canonical', projection, [
    { id: 'strict-done-evidence', passed: projection.recentlyCompleted.some(item => item.requirementId === 'req-ucl-submission' && item.evidenceIds.includes('e-ucl-submitted')), detail: 'Submitted work appears in DONE only with matching verification evidence.' },
    { id: 'grouped-wait', passed: projection.waitingExternal.some(item => item.actor?.name === 'Professor Adeyemi' && item.applicationCaseIds.includes('case-stanford')), detail: 'External recommender work is grouped with the responsible actor.' },
    { id: 'typed-user-action', passed: projection.userActions.some(item => item.interaction?.kind === 'approve' && item.references[0]?.requirementId === 'req-mit-approval'), detail: 'The approval is a typed, referenceable user action.' },
    { id: 'deadline-risk', passed: projection.risks.some(item => item.requirementId === 'req-oxford-transcript' && item.reasonCodes.includes('DEADLINE_LOW_SLACK')), detail: 'The transcript risk uses expected completion time plus a safety buffer.' },
    { id: 'post-submission', passed: projection.applications.some(item => item.applicationCaseId === 'case-ucl' && item.submissionState === 'submitted' && item.postSubmissionState === 'monitoring'), detail: 'Submitted applications remain visible in decision monitoring.' },
    { id: 'integrity', passed: projection.integrity.valid, detail: 'The generated projection has no cross-case or orphan references.' },
  ]), qualificationCase('campaign-summary-transition', transitionProjection, [
    { id: 'answered-action-disappears', passed: transitionProjection.userActions.length === 0, detail: 'The same projection converges after the persisted interaction becomes answered.' },
    { id: 'submitted-state-persists', passed: transitionProjection.counts.submittedApplications === 1, detail: 'Submission state is derived from current application rows, not stale narration.' },
  ])]
  const passed = cases.every(item => item.passed)
  const metrics = {
    cases: cases.length,
    passedCases: cases.filter(item => item.passed).length,
    failedAssertions: cases.flatMap(item => item.assertions).filter(item => !item.passed).length,
    doingItems: projection.counts.doing,
    waitingItems: projection.counts.waitingExternal,
    userActions: projection.counts.needsUser,
    risks: projection.counts.risks,
    submittedApplications: projection.counts.submittedApplications,
    integrityValid: projection.integrity.valid,
  } satisfies Record<string, number | boolean | string>
  return {
    suiteVersion: 'david_campaign_summary_qualification_v1',
    passed,
    metrics,
    cases,
    examples: cases.map(item => ({ caseId: item.id, status: item.projection.status, summary: item.generatedSummary, nextMeaningfulEvent: item.projection.nextMeaningfulEvent && 'reason' in item.projection.nextMeaningfulEvent ? item.projection.nextMeaningfulEvent.reason : item.projection.nextMeaningfulEvent?.label ?? null })),
  }
}
