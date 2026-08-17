import { assert, assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  applyRecommendationInteraction,
  buildRecommendationRequirementGraph,
  buildRecommenderSupportPack,
  classifyRecommendationReply,
  createRecommendationInteraction,
  createRecommendationPortfolioStrategy,
  deriveOfficialRecommendationRoutes,
  discoverRecommenderCandidates,
  extractRecommendationRequirements,
  generateRecommendationRequestEmail,
  recommendationCompletionEvidence,
  recommendationMetricsSummary,
  recommendationStateForReply,
  rankRecommenderCandidates,
  resolveRecommendationContext,
  type RecommendationContextResolution,
  type RecommendationProgrammeRequirements,
  type RecommenderCandidate,
} from './recommendation-workflow.ts'

Deno.test('derives one bounded same-origin recommendations route from an official application page', () => {
  assertEquals(
    deriveOfficialRecommendationRoutes([
      'https://gradadmissions.stanford.edu/apply/faq?view=all#recommendations',
      'https://physics.stanford.edu/graduate/graduate-admissions',
      'http://gradadmissions.stanford.edu/apply/faq',
      'not a URL',
    ]),
    ['https://gradadmissions.stanford.edu/apply/recommendations'],
  )
})

function source(id: string, excerpt: string) {
  return { id, url: `https://university.example/${id}`, authority: 'official' as const, excerpt, retrievedAt: '2026-08-01T00:00:00.000Z' }
}

function requirements(): RecommendationProgrammeRequirements {
  return extractRecommendationRequirements({
    opportunity: {
      programme: { value: 'MSc Computational Social Science', sourceIds: ['programme'] },
      institution: { value: 'Northbridge University', sourceIds: ['programme'] },
      recommendationCount: { value: 2, sourceIds: ['recommendations'] },
      requiredRefereeTypes: { value: ['academic'], sourceIds: ['recommendations'] },
      submissionMethod: { value: 'institution portal invitation', sourceIds: ['portal'] },
      refereeDeadline: { value: { dateTime: '2026-11-15T23:59:00Z', timezone: 'UTC' }, sourceIds: ['portal'] },
      portalInvitationFlow: { value: 'Applicant enters verified referee email; institution sends invitation.', sourceIds: ['portal'] },
      letterLength: { value: 'Two pages', sourceIds: ['letter'] },
      format: { value: 'PDF or portal form', sourceIds: ['letter'] },
      template: { value: null, sourceIds: [] },
      language: { value: 'English', sourceIds: ['letter'] },
      relationshipRestrictions: { value: ['No family members'], sourceIds: ['letter'] },
      specialPrompts: { value: ['Discuss research readiness'], sourceIds: ['letter'] },
      contactVerification: { value: ['Email must be institutionally verifiable'], sourceIds: ['portal'] },
      fallbackRules: { value: ['Use a backup academic if a selected referee declines'], sourceIds: ['portal'] },
    },
    sourceEvidence: [
      source('programme', 'Programme title and institution.'),
      source('recommendations', 'Two academic recommendations are required.'),
      source('portal', 'Referee deadline, invitation flow, and contact verification.'),
      source('letter', 'Letter format, language, restrictions, and prompts.'),
    ],
  })
}

function candidate(overrides: Partial<RecommenderCandidate> = {}): RecommenderCandidate {
  return {
    id: 'dr-lee',
    name: 'Dr Ada Lee',
    email: 'ada.lee@northbridge.example',
    currentTitle: 'Associate Professor',
    institution: 'Northbridge University',
    department: 'Computing',
    relationshipType: 'thesis_supervisor',
    relationshipStrength: 0.95,
    exactContextOfRelationship: 'Thesis supervisor for the applicant’s applied research project.',
    relationshipEvidence: [{ id: 'obs-1', text: 'Reviewed the applicant’s thesis experiments.', sourceId: 'thesis-report', sourceKind: 'direct_observation', observedBoundary: 'personally_observed', confidence: 'high', observedAt: '2025-07-01' }],
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
    sourceIds: ['thesis-report', 'contacts:dr-lee'],
    ...overrides,
  }
}

Deno.test('extracts source-backed programme requirements and keeps unknown fields explicit', () => {
  const result = requirements()
  assert(result.sourceBacked)
  assertEquals(result.recommendationCount.value, 2)
  assertEquals(result.refereeDeadline.value?.dateTime, '2026-11-15T23:59:00Z')
  assert(result.sourceEvidence.length >= 4)
  assertEquals(result.template.value, null)
  assert(result.unresolvedFields.includes('template'))
})

Deno.test('derives the minimum recommendation workflow facts from an official programme snapshot', () => {
  const result = extractRecommendationRequirements({
    opportunity: {
      institution: 'Northbridge University',
      programmeTitle: 'PhD in Computational Science',
    },
    sourceEvidence: [
      source('official-recommendations', 'PhD applicants must provide three letters of recommendation. Enter each recommender in the online application portal; the system emails them directly.'),
    ],
  })

  assertEquals(result.recommendationCount.value, 3)
  assertEquals(result.recommendationCount.verified, true)
  assertEquals(result.submissionMethod.value, 'Enter each recommender in the application system.')
  assertEquals(result.submissionMethod.verified, true)
  assertEquals(result.programme.verified, true)
  assertEquals(result.institution.verified, true)
  assertEquals(result.sourceBacked, true)
})

Deno.test('does not treat a generic official page as recommendation instructions', () => {
  const result = extractRecommendationRequirements({
    opportunity: {
      institution: 'Northbridge University',
      programmeTitle: 'PhD in Computational Science',
    },
    sourceEvidence: [source('general-admissions', 'Learn more about graduate study at Northbridge University.')],
  })

  assertEquals(result.sourceBacked, false)
  assertEquals(result.recommendationCount.value, null)
  assertEquals(result.submissionMethod.value, null)
})

Deno.test('keeps missing programme-source research out of the upload-style progress UI', () => {
  const requirements = extractRecommendationRequirements({
    opportunity: {
      institution: 'Northbridge University',
      programmeTitle: 'PhD in Computational Science',
    },
    sourceEvidence: [source('general-admissions', 'Learn more about graduate study at Northbridge University.')],
  })
  const context = resolveRecommendationContext({ requirements, programme: 'PhD in Computational Science' })

  assertEquals(context.nextInteraction, null)
  assert(context.unresolved.includes('programme_requirements_source_evidence'))
})

Deno.test('keeps a detailed browser snapshot when the opportunity already cites the same official page', () => {
  const result = extractRecommendationRequirements({
    opportunity: {
      institution: 'Northbridge University',
      programmeTitle: 'PhD in Computational Science',
      citations: [{
        id: 'opportunity-citation',
        url: 'https://university.example/admissions',
        authority: 'official',
        excerpt: 'Graduate admissions information.',
      }],
    },
    sourceEvidence: [{
      id: 'browser-snapshot',
      url: 'https://university.example/admissions',
      authority: 'official',
      excerpt: 'Applicants must provide three letters of recommendation. Enter each recommender in the online application portal.',
    }],
  })

  assertEquals(result.recommendationCount.value, 3)
  assertEquals(result.submissionMethod.value, 'Enter each recommender in the application system.')
  assertEquals(result.sourceBacked, true)
})

Deno.test('discovers and merges profile, Gmail, Contacts, and previous-application candidates', () => {
  const candidates = discoverRecommenderCandidates({
    profile: {
      referees: [{ value: { id: 'lee', name: 'Dr Ada Lee', email: 'ada.lee@northbridge.example', relationship: 'thesis supervisor', relationshipContext: 'Supervised the thesis.' }, provenance: { sourceAssetIds: ['profile'] } }],
    },
    contacts: [{ id: 'pat', name: 'Pat Okafor', email: 'pat@example.org', organization: 'Civic Lab', relationship: 'internship supervisor' }],
    gmailMessages: [{ id: 'thread-1', from: { name: 'Dr Ada Lee', email: 'ada.lee@northbridge.example' }, subject: 'Recommendation request', body_text: 'Happy to discuss a reference letter.' }],
    previousApplications: [{ referees: [{ name: 'Prof Sam Green', email: 'sam@example.edu', relationship: 'course instructor', applicantUpdates: ['Published a paper after the course.'] }] }],
  })
  assertEquals(candidates.length, 3)
  const ada = candidates.find(item => item.email === 'ada.lee@northbridge.example')
  assert(ada)
  assert(ada.relationshipEvidence.some(item => item.sourceKind === 'direct_observation'))
  assert(candidates.find(item => item.name === 'Prof Sam Green')?.relationshipEvidence.some(item => item.sourceKind === 'applicant_update'))
})

Deno.test('ranks observed relationship evidence ahead of title prestige and builds a complementary portfolio', () => {
  const ranked = rankRecommenderCandidates({ candidates: [candidate(), candidate({ id: 'director', name: 'Director Famous', currentTitle: 'Director', relationshipStrength: 0.3, relationshipEvidence: [], relevanceToProgramme: ['computational social science'], email: 'director@example.edu', sourceIds: ['contacts:director'] })], programme: 'MSc Computational Social Science', requirements: requirements() })
  assertEquals(ranked[0]?.id, 'dr-lee')
  assert(ranked[0]!.fitScore > ranked[1]!.fitScore)
  const result = createRecommendationPortfolioStrategy({ rankedCandidates: ranked, programmes: [{ institution: 'Northbridge University', title: 'MSc Computational Social Science', deadline: '2026-11-15T23:59:00Z' }, { institution: 'Eastlake University', title: 'MSc Data and Society', deadline: '2026-12-01T23:59:00Z' }], recommendationCount: 2 })
  assertEquals(result.strategy.titlePrestigeWeight, 0.05)
  assert(result.strategy.approvalRequired)
  assert(result.strategy.selectedCandidateIds.length >= 1)
})

Deno.test('generates one clean request email with an explicit strong recommendation ask', () => {
  const email = generateRecommendationRequestEmail({
    applicantName: 'Nadia Okafor',
    applicantEmail: 'nadia@example.com',
    recommender: candidate(),
    programmes: [{ institution: 'Northbridge University', title: 'MSc Computational Social Science', deadline: '2026-11-15T23:59:00Z' }],
    relationshipEvidence: candidate().relationshipEvidence,
    reason: 'Your firsthand view of my research preparation would be especially relevant.',
    applicantGoal: 'research-led graduate study',
    supportPackAvailable: true,
  })
  assertMatch(email.bodyText, /strong recommendation letter/i)
  assertMatch(email.bodyText, /2026-11-15/)
  assertMatch(email.bodyHtml, /<p>/)
  assert(!email.bodyHtml.includes('<script'))
  assertEquals(email.metadata.programmeCount, 1)
})

Deno.test('separates direct observations from later applicant updates in the support pack', () => {
  const pack = buildRecommenderSupportPack({
    candidate: candidate(),
    programme: { institution: 'Northbridge University', title: 'MSc Computational Social Science', deadline: '2026-11-15T23:59:00Z' },
    requirements: requirements(),
    applicantName: 'Nadia Okafor',
    applicantGoal: 'research-led graduate study',
    directObservedEvidence: [{ claim: 'Reviewed the applicant’s thesis experiments.', sourceIds: ['thesis-report'], sourceKind: 'direct_observation', observedBoundary: 'personally_observed', provenance: 'Thesis report' }],
    applicantUpdates: [{ claim: 'Published a paper after the relationship ended.', sourceIds: ['publication'], sourceKind: 'applicant_update', observedBoundary: 'reported_after_relationship', provenance: 'Publication record' }],
    assetIds: ['graduate_application_cv_v1'],
  })
  assertEquals(pack.evidenceBank[0]?.sourceKind, 'direct_observation')
  assertEquals(pack.updatesSinceRelationship[0]?.sourceKind, 'applicant_update')
  assertEquals(pack.materials[0]?.assetId, 'graduate_application_cv_v1')
  assert(pack.quality.grounded)
})

Deno.test('reply classification drives positive continuation and all required semantic states', () => {
  assertEquals(classifyRecommendationReply('Re: request', 'I would be delighted to provide a strong letter.'), 'STRONG_ACCEPT')
  assertEquals(classifyRecommendationReply('Re: request', 'Yes, I can write the reference.'), 'ACCEPT')
  assertEquals(classifyRecommendationReply('Re: request', 'I am very busy and need to think about the timing.'), 'HESITANT')
  assertEquals(classifyRecommendationReply('Re: request', 'I am unable to write this letter.'), 'DECLINE')
  assertEquals(classifyRecommendationReply('Re: request', 'Could you send me the CV and programme details?'), 'REQUESTS_MATERIALS')
  assertEquals(classifyRecommendationReply('Re: request', 'Please send a draft or bullet points.'), 'REQUESTS_DRAFT')
  assertEquals(classifyRecommendationReply('Re: request', 'Could we have a short call to discuss?'), 'REQUESTS_MEETING')
  assertEquals(classifyRecommendationReply('Re: request', 'I cannot meet the deadline this month.'), 'CANNOT_MEET_DEADLINE')
  assertEquals(classifyRecommendationReply('Re: request', 'I only provide a general letter.'), 'GENERAL_LETTER_ONLY')
  assertEquals(recommendationStateForReply('STRONG_ACCEPT'), 'strong_accept')
})

Deno.test('typed interactions validate, persist reusable context only with consent, and produce metrics', () => {
  const context: RecommendationContextResolution = {
    version: 'recommendation-coordination@1.0.0',
    checkedSources: [],
    autoResolvedFacts: [],
    candidates: [],
    reusableContext: {},
    reusableContextConsent: false,
    unresolved: ['recommender_selection'],
    nextInteraction: null,
    automaticContinuationRate: 0,
  }
  const interaction = createRecommendationInteraction({ kind: 'single_choice', id: 'choice-1', requirementId: 'recommender_selection', question: 'Which recommender should I prepare?', reason: 'I found two eligible candidates.', options: [{ value: 'lee', label: 'Dr Ada Lee' }], reusableContextKeys: ['selected_recommender_ids'] })
  const applied = applyRecommendationInteraction({ context, interaction, value: 'lee', reusableContextConsent: true, submittedAt: '2026-08-01T00:00:00Z' })
  assert(applied.accepted)
  assertEquals(applied.context.reusableContext.selected_recommender_ids, 'lee')
  assert(applied.metric.resumedAutomatically)
  const summary = recommendationMetricsSummary([applied.metric])
  assertEquals(summary.questionsByKind.single_choice, 1)
  assertEquals(summary.broadFreeTextQuestions, 0)
})

Deno.test('requirement graph is dependency-ordered and completion requires provider evidence', () => {
  const graph = buildRecommendationRequirementGraph({ caseId: 'case-1', requirements: requirements(), candidateIds: ['dr-lee'] })
  assertEquals(graph[0]?.status, 'verified')
  assert(graph.every((node, index) => index === 0 || node.dependencyIds.length > 0))
  assert(!recommendationCompletionEvidence({ requestSent: true, providerMessageId: null, portalSubmissionConfirmed: true }).complete)
  assert(recommendationCompletionEvidence({ requestSent: true, providerMessageId: 'msg-1', portalSubmissionConfirmed: true }).complete)
})
