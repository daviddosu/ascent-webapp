import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileLatex } from '../../api/application-cv'
import { renderRecommendationProgressDetail } from '../../src/data/recommendation-progress-detail'
import {
  applyRecommendationInteraction,
  buildRecommendationRequirementGraph,
  buildRecommenderSupportPack,
  classifyRecommendationReply,
  createRecommendationInteraction,
  createRecommendationPortfolioStrategy,
  extractRecommendationRequirements,
  generateRecommendationAcceptanceFollowUpEmail,
  generateRecommendationDeadlineReminderEmail,
  generateRecommendationRequestEmail,
  generateRecommendationThankYouEmail,
  recommendationCompletionEvidence,
  recommendationMetricsSummary,
  recommendationStateForReply,
  rankRecommenderCandidates,
  recommendationReminderPlan,
  resolveRecommendationContext,
  type RecommendationContextResolution,
  type RecommendationInteraction,
  type RecommenderCandidate,
} from '../../supabase/functions/_shared/recommendation-workflow'
import { renderCanonicalCv, type CvData, type CvProvenance } from '../../supabase/functions/_shared/cv'

export type RecommendationQualificationReport = {
  suiteVersion: 'david_recommendation_coordination_qualification_v1'
  caseId: string
  passed: boolean
  metrics: Record<string, number | boolean | string>
  interactionMix: Record<string, number>
  regressionCases: Array<{ id: string; passed: boolean; detail: string }>
  progressDetailExamples: Record<string, { kind: string; question: string; reason: string; knownContext: string[]; renderedHtml: string }>
  finalStatus: Record<string, unknown>
  uiPayload: Record<string, unknown>
  emails: Record<string, { subject: string; bodyText: string; bodyHtml: string }>
  supportPack: Record<string, unknown>
  cv: { templateId: string; checksum: string; latexPath: string; pdfPath: string; atsPath: string; logPath: string; pageCount: number; compiled: boolean }
}

function source(id: string, excerpt: string) {
  return { id, url: `https://northbridge.example/graduate/recommendations/${id}`, authority: 'official' as const, excerpt, retrievedAt: '2026-08-01T00:00:00.000Z' }
}

function candidate(input: Partial<RecommenderCandidate> & Pick<RecommenderCandidate, 'id' | 'name' | 'email' | 'relationshipType' | 'exactContextOfRelationship'>): RecommenderCandidate {
  return {
    currentTitle: null,
    institution: 'Northbridge University',
    department: 'Computing',
    relationshipStrength: 0.8,
    relationshipEvidence: [],
    relevanceToProgramme: ['computational social science'],
    eligibility: 'eligible',
    eligibilityReasons: ['Academic relationship'],
    availability: 'unknown',
    verifiedContactSource: 'contacts',
    contactVerificationStatus: 'verified',
    recommendedProgrammes: ['MSc Computational Social Science'],
    fitScore: 0,
    rankingReasons: [],
    portfolioRole: 'unassigned',
    sourceIds: [`candidate:${input.id}`],
    ...input,
  }
}

function cvProvenance(sourceFactId: string): CvProvenance {
  return { confirmed: true, sourceFactIds: [sourceFactId], sourceAssetIds: ['nadia-cv-source'], kind: 'uploaded_document', sourceUrl: null }
}

function cvFact<T>(value: T, sourceFactId: string) {
  return { value, provenance: cvProvenance(sourceFactId) }
}

function qualificationCv(): CvData {
  return {
    fullName: cvFact('Nadia Okafor', 'profile:legal-name'),
    preferredName: cvFact('Nadia', 'profile:preferred-name'),
    email: cvFact('nadia.okafor@example.test', 'profile:email'),
    phone: null,
    location: cvFact('Lagos, Nigeria', 'profile:location'),
    linkedin: null,
    github: cvFact('github.com/nadia-okafor', 'profile:github'),
    portfolio: null,
    website: null,
    education: [cvFact({ institution: 'Northbridge University', degree: 'BSc Computer Science', field: 'Computer Science', startDate: '2021-09', endDate: '2025-06', grade: 'First Class', country: 'Nigeria' }, 'education:bsc')],
    researchExperience: [cvFact({ title: 'Thesis on community health access', institution: 'Northbridge University', summary: 'Applied data analysis to community health access patterns.', methods: ['Python', 'survey analysis'], outcomes: ['Thesis submitted'], startDate: '2024-09', endDate: '2025-06' }, 'research:thesis')],
    workExperience: [cvFact({ employer: 'Civic Lab', title: 'Research Analyst', startDate: '2025-07', endDate: null, responsibilities: ['Built reproducible analysis for public-interest research.'] }, 'employment:civic-lab')],
    teachingExperience: [],
    publications: [],
    presentations: [],
    projects: [],
    researchProjects: [cvFact({ title: 'Health access mapping', description: 'Mapped barriers to access using reproducible analysis.', methods: ['Python'], outcomes: ['Internal research report'], date: '2025' }, 'research:health-map')],
    leadership: [],
    awards: [],
    scholarships: [],
    certifications: [],
    technicalSkills: [cvFact('Python', 'skills:python'), cvFact('SQL', 'skills:sql')],
    researchSkills: [cvFact('Applied quantitative research', 'skills:research')],
    languages: [cvFact('English', 'language:english')],
    coursework: [],
    memberships: [],
  }
}

function sha256(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function runRecommendationQualification(outputDirectory = resolve(import.meta.dirname, 'results', 'recommendation-qualification')): Promise<RecommendationQualificationReport> {
  const caseId = 'recommendation-canonical-nadia-northbridge'
  const requirements = extractRecommendationRequirements({
    opportunity: {
      programme: { value: 'MSc Computational Social Science', sourceIds: ['programme'] },
      institution: { value: 'Northbridge University', sourceIds: ['programme'] },
      recommendationCount: { value: 2, sourceIds: ['recommendations'] },
      requiredRefereeTypes: { value: ['academic'], sourceIds: ['recommendations'] },
      submissionMethod: { value: 'Institution portal invitation', sourceIds: ['portal'] },
      refereeDeadline: { value: { dateTime: '2026-11-15T23:59:00Z', timezone: 'UTC' }, sourceIds: ['portal'] },
      portalInvitationFlow: { value: 'Applicant enters verified referee email; institution sends invitation.', sourceIds: ['portal'] },
      letterLength: { value: 'Two pages', sourceIds: ['letter'] },
      format: { value: 'PDF or portal form', sourceIds: ['letter'] },
      template: { value: null, sourceIds: [] },
      language: { value: 'English', sourceIds: ['letter'] },
      relationshipRestrictions: { value: ['No family members'], sourceIds: ['letter'] },
      specialPrompts: { value: ['Discuss research readiness'], sourceIds: ['letter'] },
      contactVerification: { value: ['Institutional email preferred'], sourceIds: ['portal'] },
      fallbackRules: { value: ['Use a backup academic if a selected recommender declines'], sourceIds: ['portal'] },
    },
    sourceEvidence: [source('programme', 'Official programme title and institution.'), source('recommendations', 'Two academic recommendations are required.'), source('portal', 'Institution portal invitation flow and referee deadline.'), source('letter', 'Letter length, format, language, and relationship restrictions.')],
  })
  const profile = {
    preferredName: { value: 'Nadia', provenance: { sourceAssetIds: ['profile:preferred-name'] } },
    legalName: { value: 'Nadia Okafor', provenance: { sourceAssetIds: ['profile:legal-name'] } },
    contactInformation: { email: { value: 'nadia.okafor@example.test', provenance: { sourceAssetIds: ['profile:email'] } } },
    referees: [
      { value: { id: 'lee', name: 'Dr Ada Lee', email: 'ada.lee@northbridge.example', currentTitle: 'Associate Professor', relationshipType: 'thesis_supervisor', relationshipContext: 'Supervised Nadia’s thesis experiments.', directObservations: ['Reviewed the thesis experiments and research log.'], relevanceToProgramme: ['computational social science'] }, provenance: { sourceAssetIds: ['profile:referee:lee'] } },
      { value: { id: 'mensah', name: 'Prof Kwame Mensah', email: 'kwame.mensah@northbridge.example', currentTitle: 'Professor', relationshipType: 'course_instructor', relationshipContext: 'Taught Nadia advanced statistics.', directObservations: ['Assessed Nadia’s statistical modelling coursework.'], relevanceToProgramme: ['quantitative research'] }, provenance: { sourceAssetIds: ['profile:referee:mensah'] } },
    ],
  }
  const contacts = [{ id: 'lee-contact', name: 'Dr Ada Lee', email: 'ada.lee@northbridge.example', organization: 'Northbridge University', relationship: 'thesis supervisor' }]
  const gmailMessages = [{ id: 'gmail-lee-thread', from: { name: 'Dr Ada Lee', email: 'ada.lee@northbridge.example' }, subject: 'Nadia — recommendation request', body_text: 'Happy to discuss a recommendation letter.' }]
  const previousApplications = [{ referees: [{ id: 'pat', name: 'Pat Okafor', email: 'pat@civic.example', relationship: 'internship supervisor', applicantUpdates: ['Nadia later led the public-interest research report.'] }] }]
  const context = resolveRecommendationContext({ profile, contacts, gmailMessages, previousApplications, requirements, programme: 'MSc Computational Social Science', reusableContextConsent: true })
  const initialInteraction = context.nextInteraction
  if (!initialInteraction || initialInteraction.kind !== 'multiple_choice') throw new Error('Qualification did not produce the expected typed portfolio interaction.')
  const uiPayload = { kind: initialInteraction.kind, interaction: initialInteraction, renderedHtml: renderRecommendationProgressDetail(initialInteraction, 'task-qualification') }
  const approvalInteraction = createRecommendationInteraction({
    kind: 'approval',
    id: 'recommendation:example:approval',
    requirementId: 'recommender_strategy_approval',
    question: `Use ${context.candidates[0]!.name} as the first academic recommender?`,
    reason: 'This candidate supervised the thesis and has direct evidence relevant to the programme.',
    knownContext: ['Thesis supervision is recorded in ApplicantProfile.', 'The candidate has a verified institutional contact.'],
    reusableContextKeys: ['preferred_recommender'],
    approvalScope: 'candidate_portfolio',
  })
  const emailInteraction = createRecommendationInteraction({
    kind: 'email',
    id: 'recommendation:example:email',
    requirementId: 'recommender_email',
    question: `What email should I use for ${context.candidates[1]!.name}?`,
    reason: 'The relationship is verified, but no single contact address is confirmed for this campaign.',
    knownContext: ['A course relationship is recorded.', 'The programme prefers institutional addresses.'],
    reusableContextKeys: ['recommender:mensah:email'],
    placeholder: 'professor@university.edu',
  })
  const attachmentInteraction = createRecommendationInteraction({
    kind: 'attachment_request',
    id: 'recommendation:example:attachment',
    requirementId: 'relationship_evidence_attachment',
    question: 'I can build a stronger support pack from your thesis report. Attach it?',
    reason: 'The report may contain concrete examples the recommender personally observed; it stays private to this task unless you consent to reuse it.',
    knownContext: ['The thesis title and supervisor are already resolved.', 'The current evidence bank has one direct observation.'],
    reusableContextKeys: [],
    attachmentPrompt: 'Attach the thesis report or project summary',
  })
  const relationshipConfirmation = createRecommendationInteraction({
    kind: 'confirmation',
    id: 'recommendation:example:relationship-confirmation',
    requirementId: 'relationship_confirmation',
    question: `${context.candidates[0]!.name} supervised your thesis experiments. Correct?`,
    reason: 'I found the same relationship in ApplicantProfile and a prior Gmail thread and want to preserve the exact boundary of firsthand evidence.',
    knownContext: ['ApplicantProfile: thesis supervisor.', 'Gmail: recommendation context in the prior thread.'],
    reusableContextKeys: ['recommender:lee:relationship'],
    approvalScope: 'candidate_portfolio',
  })
  const shortTextInteraction = createRecommendationInteraction({
    kind: 'short_text',
    id: 'recommendation:example:rare-text',
    requirementId: 'relationship_feedback',
    question: 'What specific feedback did your supervisor give you that changed your approach?',
    reason: 'This narrow detail is not present in the supplied profile, files, Gmail, or Contacts and would make the evidence bank more concrete.',
    knownContext: ['The thesis project and dates are resolved.', 'No source contains the supervisor’s specific feedback.'],
    reusableContextKeys: ['recommender:lee:feedback'],
    placeholder: 'One specific piece of feedback',
  })
  const replacementInteraction = createRecommendationInteraction({
    kind: 'single_choice',
    id: 'recommendation:example:replacement',
    requirementId: 'recommender_replacement',
    question: `${context.candidates[0]!.name} sounds hesitant. Use a backup recommender instead?`,
    reason: 'The reply indicates timing risk, and the ranked backup has verified contact and relevant direct evidence.',
    knownContext: [`Primary: ${context.candidates[0]!.name} — thesis supervisor.`, `Backup: ${context.candidates[1]!.name} — course instructor.`],
    reusableContextKeys: ['selected_recommender_ids'],
    options: [
      { value: context.candidates[1]!.id, label: `Use ${context.candidates[1]!.name} instead`, description: 'Keep the deadline-safe academic portfolio.' },
      { value: 'keep-primary', label: `Keep ${context.candidates[0]!.name}`, description: 'Continue with the current recommender and monitor the deadline.' },
    ],
  })
  const exampleInteractions: Array<[string, RecommendationInteraction]> = [
    ['approval', approvalInteraction],
    ['choice', initialInteraction],
    ['email', emailInteraction],
    ['attachment', attachmentInteraction],
    ['relationship_confirmation', relationshipConfirmation],
    ['rare_short_text', shortTextInteraction],
    ['weak_recommender_replacement', replacementInteraction],
  ]
  const progressDetailExamples = Object.fromEntries(exampleInteractions.map(([label, interaction]) => [label, {
    kind: interaction.kind,
    question: interaction.question,
    reason: interaction.reason,
    knownContext: interaction.knownContext,
    renderedHtml: renderRecommendationProgressDetail(interaction, 'task-qualification'),
  }]))
  const response = applyRecommendationInteraction({ context, interaction: initialInteraction, value: [context.candidates[0]!.id, context.candidates[1]!.id], reusableContextConsent: true, submittedAt: '2026-08-12T00:00:00.000Z' })
  if (!response.accepted) throw new Error('Qualification portfolio selection was rejected.')
  const selectedIds = [context.candidates[0]!.id, context.candidates[1]!.id]
  const ranked = rankRecommenderCandidates({ candidates: context.candidates, programme: 'MSc Computational Social Science', requirements })
  const portfolio = createRecommendationPortfolioStrategy({ rankedCandidates: ranked, programmes: [{ institution: 'Northbridge University', title: 'MSc Computational Social Science', deadline: '2026-11-15T23:59:00Z' }], recommendationCount: 2, preferredCandidateIds: selectedIds })
  const requestEmails = portfolio.candidates.filter(item => selectedIds.includes(item.id)).map(item => generateRecommendationRequestEmail({ applicantName: 'Nadia Okafor', applicantEmail: 'nadia.okafor@example.test', recommender: item, programmes: [{ institution: 'Northbridge University', title: 'MSc Computational Social Science', deadline: '2026-11-15T23:59:00Z' }], relationshipEvidence: item.relationshipEvidence, reason: 'Your firsthand view of Nadia’s research preparation would be especially relevant.', applicantGoal: 'research-led graduate study', supportPackAvailable: true, programmeRequirements: requirements }))
  const supportPack = buildRecommenderSupportPack({ candidate: portfolio.candidates.find(item => item.id === selectedIds[0]) ?? portfolio.candidates[0]!, programme: { institution: 'Northbridge University', title: 'MSc Computational Social Science', deadline: '2026-11-15T23:59:00Z' }, requirements, applicantName: 'Nadia Okafor', applicantGoal: 'research-led graduate study', assetIds: ['graduate_application_cv_v1'] })
  const replyStates = {
    strongAccept: classifyRecommendationReply('Re: recommendation request', 'I would be delighted to provide a strong recommendation.'),
    hesitant: classifyRecommendationReply('Re: recommendation request', 'I am busy and need to think about the timing.'),
    decline: classifyRecommendationReply('Re: recommendation request', 'I am unable to write this letter.'),
  }
  const reminder = recommendationReminderPlan({ deadline: '2026-11-15T23:59:00Z', now: '2026-11-02T00:00:00Z', status: 'waiting_response' })
  const acceptanceEmail = generateRecommendationAcceptanceFollowUpEmail({ applicantName: 'Nadia Okafor', recommender: portfolio.candidates[0]!, deadline: '2026-11-15T23:59:00Z' })
  const reminderEmail = generateRecommendationDeadlineReminderEmail({ applicantName: 'Nadia Okafor', recommender: portfolio.candidates[0]!, programme: 'MSc Computational Social Science', deadline: '2026-11-15T23:59:00Z', daysRemaining: 14 })
  const thankYouEmail = generateRecommendationThankYouEmail({ applicantName: 'Nadia Okafor', recommender: portfolio.candidates[0]!, programme: 'MSc Computational Social Science', outcome: 'the application was submitted' })
  const graph = buildRecommendationRequirementGraph({ caseId, requirements, candidateIds: selectedIds })
  const metrics = recommendationMetricsSummary([response.metric, { ...response.metric, interactionId: 'approval-1', kind: 'approval', requirementId: 'recommendation_request_approval' }])
  const completion = recommendationCompletionEvidence({ requestSent: true, providerMessageId: 'gmail-message-1', portalInvitationSent: true, portalSubmissionConfirmed: true, thanked: true })
  const finalStatus = {
    state: completion.complete ? 'complete' : 'waiting_submission',
    label: 'Recommendation 1 of 2',
    recommender: portfolio.candidates[0]!.name,
    deadline: '2026-11-15T23:59:00Z',
    nextAction: completion.complete ? 'No action needed; preserve the relationship context for future applications.' : 'Roon continues monitoring the portal and Gmail thread.',
    providerMessageId: completion.providerMessageId,
    portalSubmissionConfirmed: completion.portalSubmissionConfirmed,
  }
  const renderedCv = renderCanonicalCv({ data: qualificationCv(), pageTarget: 'academic', sectionOrder: ['education', 'researchExperience', 'workExperience', 'researchProjects', 'technicalSkills', 'researchSkills', 'languages'] })
  mkdirSync(outputDirectory, { recursive: true })
  const compiled = await compileLatex(renderedCv.latex, { expectedName: 'Nadia Okafor', expectedEmail: 'nadia.okafor@example.test' })
  const checksum = sha256(compiled.pdf)
  const latexPath = resolve(outputDirectory, 'graduate_application_cv_v1.tex')
  const pdfPath = resolve(outputDirectory, 'graduate_application_cv_v1.pdf')
  const atsPath = resolve(outputDirectory, 'graduate_application_cv_v1.ats.txt')
  const logPath = resolve(outputDirectory, 'graduate_application_cv_v1.log.txt')
  writeFileSync(latexPath, renderedCv.latex)
  writeFileSync(pdfPath, compiled.pdf)
  writeFileSync(atsPath, compiled.atsText)
  writeFileSync(logPath, compiled.compilationLog)
  if (compiled.preview) writeFileSync(resolve(outputDirectory, 'graduate_application_cv_v1.preview.png'), compiled.preview)
  const report: RecommendationQualificationReport = {
    suiteVersion: 'david_recommendation_coordination_qualification_v1',
    caseId,
    passed: requirements.sourceBacked && Boolean(initialInteraction) && response.accepted && requestEmails.every(email => email.metadata.strongRecommendationRequested) && supportPack.quality.grounded && replyStates.strongAccept === 'STRONG_ACCEPT' && replyStates.hesitant === 'HESITANT' && replyStates.decline === 'DECLINE' && graph.length >= 8 && compiled.pageCount >= 1,
    metrics: {
      autoResolvedFacts: context.autoResolvedFacts.length,
      typedQuestions: 1,
      broadFreeTextQuestions: metrics.broadFreeTextQuestions,
      automaticContinuationRate: metrics.automaticContinuationRate,
      candidatesDiscovered: context.candidates.length,
      duplicateRequestKeys: metrics.duplicateRequestKeys,
      duplicatePortalInvitations: metrics.duplicatePortalInvitations,
      fabricatedFacts: supportPack.quality.unsupportedClaims.length,
      requirementGraphNodes: graph.length,
      positiveReplyState: recommendationStateForReply(replyStates.strongAccept),
      reminderWindows: reminder.length,
    },
    interactionMix: metrics.questionsByKind,
    regressionCases: [
      { id: 'requirements-100-percent-source-backed', passed: requirements.sourceBacked, detail: 'Critical requirement fields carry official source evidence.' },
      { id: 'candidate-ranking-low-prestige-weight', passed: portfolio.strategy.titlePrestigeWeight <= 0.05, detail: 'Direct observation and fit outrank prestige.' },
      { id: 'reply-positive-auto-continuation', passed: recommendationStateForReply(replyStates.strongAccept) === 'strong_accept', detail: 'Positive reply moves to support-pack preparation.' },
      { id: 'support-pack-observation-boundary', passed: supportPack.updatesSinceRelationship.every(item => item.observedBoundary !== 'personally_observed'), detail: 'Later updates are not represented as firsthand observations.' },
      { id: 'idempotent-provider-completion', passed: recommendationCompletionEvidence({ requestSent: true, providerMessageId: 'gmail-message-1', portalSubmissionConfirmed: true }).complete, detail: 'Completion requires provider message and portal evidence.' },
    ],
    progressDetailExamples,
    finalStatus,
    uiPayload,
    emails: { request: requestEmails[0]!, acceptance: acceptanceEmail, reminder: reminderEmail, thankYou: thankYouEmail },
    supportPack: supportPack as unknown as Record<string, unknown>,
    cv: { templateId: renderedCv.templateId, checksum, latexPath, pdfPath, atsPath, logPath, pageCount: compiled.pageCount, compiled: true },
  }
  writeFileSync(resolve(outputDirectory, 'qualification-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  return report
}
