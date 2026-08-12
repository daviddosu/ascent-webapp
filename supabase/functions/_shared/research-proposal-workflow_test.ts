import { assert, assertEquals, assertExists, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  applyProposalRevisionPlan,
  buildProposalArtifactIdentity,
  buildProposalResearchDossier,
  buildProposalRevisionPlan,
  buildResearchProposalBrief,
  buildResearchProposalStrategy,
  canTransitionResearchProposalState,
  collectProposalContext,
  createProposalDraftApprovalInteraction,
  createResearchDirectionInteraction,
  createResearchProposalWorkflow,
  detectResearchProposalRequirement,
  evaluateResearchProposalQuality,
  formatResearchProposalBrief,
  interpretResearchProposalFeedback,
  normalizeResearchProposalRequirement,
  rankResearchDirections,
  selectResearchProposalWriter,
  transitionResearchProposalWorkflow,
  validateProposalResearchDossier,
  validateResearchProposalDraft,
  verifyApprovedProposalArtifact,
  verifyProposalDelivery,
  verifyResearchProposalCitations,
  type ProposalCitation,
  type ProposalEvidence,
  type ProposalPaperSummary,
  type ProposalResearchDirection,
  type ResearchProposalRequirement,
  type ResearchProposalStrategy,
} from './research-proposal-workflow.ts'

function source(id: string, excerpt: string, sourceType: ProposalEvidence['sourceType'] = 'official_application_instruction', authority: ProposalEvidence['authority'] = 'official', verified = true): ProposalEvidence {
  return { id, url: `https://northbridge.example/${id}`, title: id, excerpt, retrievedAt: '2026-08-12T00:00:00.000Z', sourceType, authority, verified }
}

function requirement(overrides: Partial<ResearchProposalRequirement> = {}) {
  return normalizeResearchProposalRequirement({
    id: 'proposal-1', applicationCaseId: 'case-proposal-1', institution: 'Northbridge University', programme: 'DPhil Computational Physics', degree: 'DPhil',
    proposalType: 'full_research_proposal', requirementState: 'required', required: true, stage: 'application', deadline: '2026-12-01T23:59:00Z', uploadLocation: 'Research documents', submissionMethod: 'application portal', wordLimit: 1800, pageLimit: 6,
    requiredSections: ['Background', 'Research question', 'Methodology', 'Expected contribution'], prohibitedSections: [], evaluationCriteria: ['significance', 'feasibility'], citationRules: { style: 'IEEE', referencesRequired: true, referencesIncludedInWordCount: false, identifierRequired: true, other: [] }, formatRequirements: { fileTypes: ['.pdf'], font: 'Arial', fontSize: '11pt', margins: '2.5 cm', lineSpacing: '1.15', header: null, filenamePattern: '^[A-Za-z0-9_-]+\\.pdf$', maxFileSizeBytes: null, other: [] }, supervisorReviewExpected: true, supervisorContactBeforeDrafting: false, topicMode: 'applicant_defined', sources: [source('instruction', 'A research proposal of no more than 1,800 words is required. Include Background, Research question, Methodology, and Expected contribution. Submit a PDF in Research documents.')], confidence: 0.95, retrievalDate: '2026-08-12T00:00:00.000Z', exactInstructions: 'A research proposal of no more than 1,800 words is required.', unresolvedFields: [], ...overrides,
  })
}

function direction(overrides: Partial<ProposalResearchDirection> = {}): ProposalResearchDirection {
  return {
    id: 'direction-1', workingTitle: 'Uncertainty-aware surrogate models for turbulent flow', problem: 'High-fidelity simulation is expensive for repeated climate-scale experiments.', motivation: 'Reliable reduced models could make uncertainty analysis more tractable.', likelyResearchQuestion: 'How can uncertainty-aware surrogate models preserve useful flow statistics under distribution shift?', methodologicalDirection: 'Build and evaluate calibrated surrogate models against numerical simulations.', whyApplicantFit: 'Matches the applicant’s verified numerical modelling and uncertainty-quantification experience.', whyProgrammeFit: 'Matches the programme’s verified computational physics and scientific machine learning themes.', feasibility: 'Uses available numerical data and open simulation tooling within a doctoral timeline.', noveltyHypothesis: 'This extends calibrated surrogate modelling to a different turbulent-flow setting.', evidence: ['profile-research', 'programme-theme'], status: 'verified_basis', scores: { applicantFit: 90, programmeFit: 88, supervisorFit: 84, feasibility: 82, novelty: 74, total: 0 }, ...overrides,
  }
}

function papers(): ProposalPaperSummary[] {
  const citation: ProposalCitation = { id: 'paper-1', authors: ['A. Researcher'], title: 'Calibrated surrogate models for turbulent flow', venue: 'Journal of Scientific Computing', year: 2024, identifier: 'doi:10.1000/example', url: 'https://doi.org/10.1000/example', sourceEvidenceIds: ['paper-source'], claimSupport: ['uncertainty calibration'], verified: true }
  return [{ citation, summary: 'The paper evaluates calibrated surrogate models under simulation shift.', methods: ['surrogate modelling', 'calibration'], limitations: ['limited flow regimes'], openProblems: ['robustness under a new regime'], applicantContribution: 'The applicant can test the extension with verified numerical modelling experience.', sourceEvidenceIds: ['paper-source'] }]
}

function dossier() {
  return buildProposalResearchDossier({
    id: 'dossier-1', applicationCaseId: 'case-proposal-1', institution: 'Northbridge University', programme: 'DPhil Computational Physics', department: 'Physics', supervisor: 'Professor Grace Nwosu', researchGroup: 'Scientific Modelling Group',
    sources: [source('programme-theme', 'The group studies computational physics and scientific machine learning.', 'official_department_page'), source('profile-research', 'Applicant CV verifies numerical modelling and uncertainty quantification.', 'applicant_document', 'applicant'), source('paper-source', 'Verified scholarly paper metadata and abstract.', 'scholarly_paper', 'scholarly')],
    currentResearchThemes: [{ id: 'theme-1', text: 'The group studies computational physics and scientific machine learning.', sourceIds: ['programme-theme'], confidence: 'high', claimType: 'programme_fit' }],
    relevantRecentPapers: papers(),
    methods: [{ id: 'method-1', text: 'The group uses surrogate modelling and calibration.', sourceIds: ['programme-theme', 'paper-source'], confidence: 'high', claimType: 'method' }],
    researchGaps: [{ id: 'gap-1', text: 'Existing work has limited coverage of robustness under a new flow regime.', sourceIds: ['paper-source'], confidence: 'medium', claimType: 'literature' }],
    relatedApplicantWork: [{ id: 'applicant-1', text: 'Applicant built uncertainty-aware numerical models.', sourceIds: ['profile-research'], confidence: 'high', claimType: 'applicant' }],
    candidateResearchQuestions: [{ id: 'question-1', text: 'How can calibrated surrogate models preserve useful flow statistics under distribution shift?', sourceIds: ['profile-research', 'programme-theme'], confidence: 'medium', claimType: 'method' }],
  })
}

function strategy(req = requirement(), dir = direction(), researchDossier = dossier()): ResearchProposalStrategy {
  return buildResearchProposalStrategy({
    requirement: req, direction: dir, dossier: researchDossier,
    methodology: { approach: 'Train calibrated surrogate models on verified simulation data, evaluate under a held-out flow regime, and compare uncertainty coverage with numerical baselines.', data: ['verified numerical simulation outputs'], experimentsOrAnalysis: ['calibration comparison', 'held-out regime evaluation'], tools: ['Python', 'numerical simulation'], validation: ['coverage and error metrics', 'baseline comparison'], dependencies: ['access to simulation data'] },
    expectedContribution: ['A defensible evaluation of calibrated surrogate models in a new flow regime.'], expectedOutputs: ['validated model comparison', 'reusable analysis workflow'], timeline: ['Year 1: literature and baselines', 'Year 2: experiments', 'Year 3: validation and thesis'], evaluationCriteriaMapping: { significance: 'The problem affects repeated scientific simulation studies.', feasibility: 'The scope uses available data and a bounded evaluation plan.' }, feasibility: { durationMonths: 36, dataAccess: ['verified numerical simulation outputs'], skills: ['numerical modelling'], riskLevel: 'medium', assessment: 'The project is feasible if the initial flow regime is kept narrow.' },
  })
}

Deno.test('detects required, conditional, optional, and not-required proposal states from official evidence', () => {
  const required = detectResearchProposalRequirement({ applicationCaseId: 'case-1', institution: 'Northbridge University', programme: 'DPhil Physics', officialSources: [source('required', 'A full research proposal of no more than 2,000 words is required.')] })
  assertEquals(required.requirement.requirementState, 'required')
  assertEquals(required.requirement.wordLimit, 2_000)
  const conditional = detectResearchProposalRequirement({ applicationCaseId: 'case-2', institution: 'Northbridge University', programme: 'DPhil Biology', officialSources: [source('conditional', 'A proposal may be requested after shortlisting and supervisor selection.')] })
  assertEquals(conditional.requirement.requirementState, 'conditionally_required')
  assertEquals(conditional.requirement.stage, 'shortlisting')
  const optional = detectResearchProposalRequirement({ applicationCaseId: 'case-3', institution: 'Northbridge University', programme: 'MSc Physics', officialSources: [source('optional', 'A proposal is optional but recommended for research-track applicants.')] })
  assertEquals(optional.requirement.requirementState, 'recommended')
  const absent = detectResearchProposalRequirement({ applicationCaseId: 'case-4', institution: 'Northbridge University', programme: 'MSc Chemistry', officialSources: [source('absent', 'No research proposal is required for this taught programme.')] })
  assertEquals(absent.requirement.requirementState, 'not_required')
  assertEquals(absent.evidenceBacked, true)
})

Deno.test('does not turn missing official research into an unsupported not-required decision', () => {
  const result = detectResearchProposalRequirement({ applicationCaseId: 'case-5', institution: 'Unknown University', programme: 'DPhil', officialSources: [] })
  assertEquals(result.requirement.requirementState, 'unresolved')
  assertEquals(result.evidenceBacked, false)
  assert(result.unresolvedFields.includes('official_source'))
})

Deno.test('resolves context before asking, ranks grounded directions, and produces structured Progress Detail', () => {
  const context = collectProposalContext({ sources: [
    { id: 'profile', kind: 'applicant_profile', title: 'Applicant profile', verified: true, facts: [{ id: 'profile:interest', label: 'Research interest', value: 'uncertainty quantification', sourceIds: ['profile'], provenance: 'verified_applicant', verified: true }] },
    { id: 'cv', kind: 'cv', title: 'CV', verified: true, facts: [{ id: 'profile:method', label: 'Research method', value: 'numerical modelling', sourceIds: ['cv'], provenance: 'verified_document', verified: true }] },
    { id: 'programme', kind: 'programme_research', title: 'Programme research page', verified: true, facts: [{ id: 'programme:theme', label: 'Research theme', value: 'scientific machine learning', sourceIds: ['programme'], provenance: 'verified_provider', verified: true }] },
  ] })
  assertEquals(context.unresolvedKinds, [])
  const ranked = rankResearchDirections([direction(), direction({ id: 'direction-2', workingTitle: 'Broad quantum machine learning', scores: { applicantFit: 50, programmeFit: 55, supervisorFit: 40, feasibility: 35, novelty: 80, total: 0 }, evidence: ['programme-theme'] })], ['profile-research', 'programme-theme'])
  assertEquals(ranked[0]?.id, 'direction-1')
  assertEquals(ranked[0]?.recommended, true)
  const interaction = createResearchDirectionInteraction({ applicationCaseId: 'case-proposal-1', candidates: ranked })
  assertEquals(interaction.inputMode, 'choose')
  assertEquals(interaction.allowFreeText, false)
  assertEquals(interaction.options.length, 2)
})

Deno.test('blocks ungrounded dossier claims and builds a readable evidence-linked brief', () => {
  const invalid = buildProposalResearchDossier({ applicationCaseId: 'case-1', institution: 'Northbridge', programme: 'DPhil', sources: [], currentResearchThemes: [{ id: 'claim', text: 'Unsupported lab claim', sourceIds: ['missing'], confidence: 'high', claimType: 'programme_fit' }] })
  assertEquals(validateProposalResearchDossier(invalid).valid, false)
  const req = requirement()
  const dir = direction()
  const researchDossier = dossier()
  const proposalStrategy = strategy(req, dir, researchDossier)
  const context = collectProposalContext({ sources: [{ id: 'cv', kind: 'cv', title: 'CV', verified: true, facts: [{ id: 'cv:research', label: 'Research experience', value: 'uncertainty-aware numerical modelling', sourceIds: ['cv'], provenance: 'verified_document', verified: true }] }] })
  const brief = buildResearchProposalBrief({ requirement: req, context, direction: dir, dossier: researchDossier, strategy: proposalStrategy })
  assertStringIncludes(brief.briefText, 'Northbridge University')
  assertStringIncludes(formatResearchProposalBrief(brief), 'Primary question')
  assert(brief.sourceIds.includes('paper-source'))
})

Deno.test('selects a specialised writer through the existing assignment-shaped contract', () => {
  const brief = buildResearchProposalBrief({ requirement: requirement(), context: collectProposalContext({ sources: [] }), direction: direction(), dossier: dossier(), strategy: strategy() })
  const result = selectResearchProposalWriter({ applicationCaseId: 'case-proposal-1', brief, candidates: [
    { id: 'generalist', name: 'Generalist', email: 'generalist@example.test', specialties: ['essays'], degreeFields: ['humanities'], programmeFamiliarity: [], proposalTypes: [], availability: 'available', activeAssignments: 0, qualityScore: 80, reliabilityScore: 80, revisionRate: 10, turnaroundHours: 72 },
    { id: 'specialist', name: 'Research Specialist', email: 'specialist@example.test', specialties: ['computational physics'], degreeFields: ['uncertainty-aware numerical modelling'], programmeFamiliarity: ['DPhil Computational Physics'], proposalTypes: ['full_research_proposal'], availability: 'available', activeAssignments: 0, qualityScore: 88, reliabilityScore: 90, revisionRate: 5, turnaroundHours: 48 },
  ] })
  assertEquals(result.assignment?.writerId, 'specialist')
  assert(result.assignment?.brief === brief)
})

Deno.test('rejects wrong programme, excess words, missing sections, and hallucinated citations before semantic review', () => {
  const req = requirement()
  const badCitation: ProposalCitation = { id: 'invented-paper', authors: ['Unknown'], title: 'Invented result', venue: null, year: 2026, identifier: null, url: null, sourceEvidenceIds: ['invented-source'], claimSupport: ['anything'], verified: false }
  const draft = { id: 'draft-1', version: 1, applicationCaseId: 'case-proposal-1', applicantName: 'Ada Example', institution: 'Wrong University', programme: 'MSc Wrong Programme', degree: 'DPhil', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal' as const, filename: 'proposal.pdf', fileType: 'application/pdf', body: `${'word '.repeat(1_810)}\nBackground\nMethodology`, sections: ['Background'], pageCount: 7, citations: [badCitation], sourceFactIds: [], sourceEvidenceIds: [], formatMetadata: {}, artifactId: null, checksum: null, receivedAt: '2026-08-12T00:00:00.000Z' }
  const validation = validateResearchProposalDraft({ draft, requirement: req, expected: { applicantName: 'Ada Example', institution: 'Northbridge University', programme: 'DPhil Computational Physics', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal' }, sourcePapers: [], evidence: [] })
  assertEquals(validation.valid, false)
  assert(validation.hardFailures.some(issue => issue.code === 'wrong_programme'))
  assert(validation.hardFailures.some(issue => issue.code === 'word_limit_exceeded'))
  assert(validation.hardFailures.some(issue => issue.code === 'hallucinated_citation'))
})

Deno.test('passes exact deterministic and semantic quality gates for a grounded proposal', () => {
  const req = requirement()
  const dir = direction()
  const researchDossier = dossier()
  const proposalStrategy = strategy(req, dir, researchDossier)
  const citation = papers()[0]!.citation
  const draft = { id: 'draft-2', version: 1, applicationCaseId: 'case-proposal-1', applicantName: 'Ada Example', institution: 'Northbridge University', programme: 'DPhil Computational Physics', degree: 'DPhil', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal' as const, filename: 'Ada_Northbridge_Proposal.pdf', fileType: 'application/pdf', body: 'Background\nThe problem is significant.\nResearch question\nHow can calibrated surrogate models preserve useful flow statistics?\nMethodology\nWe will evaluate calibrated surrogate models against numerical baselines.\nExpected contribution\nA bounded extension in a new flow regime.\nReferences\nCalibrated surrogate models for turbulent flow.', sections: ['Background', 'Research question', 'Methodology', 'Expected contribution'], pageCount: 4, citations: [citation], sourceFactIds: ['profile-research'], sourceEvidenceIds: ['programme-theme', 'paper-source'], formatMetadata: { font: 'Arial', fontSize: '11pt', margins: '2.5 cm', lineSpacing: '1.15' }, artifactId: 'artifact-draft-2', checksum: 'a'.repeat(64), receivedAt: '2026-08-12T00:00:00.000Z' }
  const validation = validateResearchProposalDraft({ draft, requirement: req, expected: { applicantName: 'Ada Example', institution: 'Northbridge University', programme: 'DPhil Computational Physics', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal' }, verifiedFactIds: ['profile-research'], verifiedEvidenceIds: ['programme-theme', 'paper-source'], verifiedFacts: [{ id: 'profile:research', value: 'uncertainty-aware numerical modelling' }], sourcePapers: papers(), evidence: [...researchDossier.sources], consistencyClaims: [{ field: 'research experience', value: 'uncertainty-aware numerical modelling', sourceFactId: 'profile:research' }] })
  assertEquals(validation.valid, true)
  const quality = evaluateResearchProposalQuality({ draft, validation, strategy: proposalStrategy, scores: { researchProblem: 90, literatureGrounding: 90, researchGap: 82, researchQuestion: 90, methodology: 88, contribution: 84, applicantFit: 90, supervisorProgrammeFit: 88, writing: 84, requirements: 100 } })
  assertEquals(quality.passed, true)
  assertEquals(quality.blockingDimensions, [])
  const interaction = createProposalDraftApprovalInteraction({ applicationCaseId: 'case-proposal-1', programme: req.programme, supervisor: req.sources[0]?.title, wordCount: validation.wordCount, quality })
  assertEquals(interaction.inputMode, 'approve')
})

Deno.test('allows a human writer source file before enforcing the final rendered PDF format', () => {
  const req = requirement({ formatRequirements: { fileTypes: ['.pdf'], font: null, fontSize: null, margins: null, lineSpacing: null, header: null, filenamePattern: null, maxFileSizeBytes: null, other: [] }, pageLimit: 3 })
  const sourceDraft = { id: 'draft-source', version: 1, applicationCaseId: 'case-proposal-1', applicantName: 'Ada Example', institution: 'Northbridge University', programme: 'DPhil Computational Physics', degree: 'DPhil', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal' as const, filename: 'writer-draft.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: 'Background\nA grounded problem.\nResearch question\nHow can calibrated models preserve useful flow statistics?\nMethodology\nWe will evaluate calibrated models against numerical baselines.\nExpected contribution\nA bounded extension.\nReferences\nCalibrated surrogate models for turbulent flow.', sections: ['Background', 'Research question', 'Methodology', 'Expected contribution'], pageCount: null, citations: papers().map(paper => paper.citation), sourceFactIds: [], sourceEvidenceIds: ['programme-theme', 'paper-source'], formatMetadata: {}, artifactId: null, checksum: null, receivedAt: '2026-08-12T00:00:00.000Z' }
  const sourceValidation = validateResearchProposalDraft({ draft: sourceDraft, requirement: req, checkRenderedFormat: false, expected: { applicantName: 'Ada Example', institution: 'Northbridge University', programme: 'DPhil Computational Physics', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal' }, verifiedEvidenceIds: ['programme-theme', 'paper-source'], sourcePapers: papers(), evidence: dossier().sources })
  assertEquals(sourceValidation.hardFailures.some(issue => issue.code === 'wrong_file_type'), false)
  assertEquals(sourceValidation.hardFailures.some(issue => issue.code === 'page_limit_exceeded'), false)
  const finalValidation = validateResearchProposalDraft({ draft: { ...sourceDraft, filename: 'Ada_Example_proposal.pdf', fileType: 'application/pdf', pageCount: 2 }, requirement: req, expected: { applicantName: 'Ada Example', institution: 'Northbridge University', programme: 'DPhil Computational Physics', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal' }, verifiedEvidenceIds: ['programme-theme', 'paper-source'], sourcePapers: papers(), evidence: dossier().sources })
  assertEquals(finalValidation.valid, true)
})

Deno.test('interprets supervisor scope feedback into concrete revision work and preserves conservative novelty language', () => {
  const feedback = interpretResearchProposalFeedback({ messageId: 'msg-1', threadId: 'thread-1', body: 'The scope is too broad. Please focus only on detector calibration rather than both calibration and reconstruction. Add the recent paper on uncertainty coverage.', evidenceIds: ['gmail-msg-1'] })
  assert(feedback.some(item => item.category === 'scope_change'))
  assert(feedback.some(item => item.category === 'literature_addition'))
  const plan = buildProposalRevisionPlan({ strategy: strategy(), feedback, revisionNumber: 1 })
  assertEquals(plan.priority, 2)
  assert(plan.instructions.some(item => /narrow/i.test(item)))
  const revised = applyProposalRevisionPlan(strategy(), plan)
  assert(revised.version > 1)
  assert(revised.unsupportedClaimsToAvoid.some(item => /no one/i.test(item)))
})

Deno.test('verifies exact approved artifact and resulting upload state', () => {
  const artifact = buildProposalArtifactIdentity({ applicationCaseId: 'case-proposal-1', institution: 'Northbridge University', programme: 'DPhil Computational Physics', supervisor: 'Professor Grace Nwosu', proposalVersion: 2, sourceArtifactId: 'source-2', renderedArtifactId: 'rendered-2', sourceFilename: 'proposal.txt', renderedFilename: 'Ada_Northbridge_Proposal.pdf', checksum: 'b'.repeat(64), provenanceSourceIds: ['paper-source'], approvalState: 'approved', uploadState: 'uploaded' })
  assertEquals(verifyApprovedProposalArtifact({ artifact, expected: { applicationCaseId: 'case-proposal-1', institution: 'Northbridge University', programme: 'DPhil Computational Physics', supervisor: 'Professor Grace Nwosu', proposalVersion: 2, checksum: 'b'.repeat(64) } }).valid, true)
  const delivery = verifyProposalDelivery({ artifact: { ...artifact, uploadState: 'verified' }, destination: 'Research documents', uploadedFilename: 'Ada_Northbridge_Proposal.pdf', uploadedChecksum: 'b'.repeat(64), readBackVerified: true, evidenceIds: ['portal-evidence-1'] })
  assertEquals(delivery.valid, true)
  assertEquals(verifyProposalDelivery({ artifact, destination: 'Research documents', uploadedFilename: 'wrong.pdf', uploadedChecksum: 'b'.repeat(64), readBackVerified: false, evidenceIds: [] }).valid, false)
})

Deno.test('keeps one canonical workflow and requires actual artifacts for completion', () => {
  const req = requirement()
  const initial = createResearchProposalWorkflow({ applicationCaseId: 'case-proposal-1', requirement: req })
  assertEquals(initial.currentState, 'context_collection')
  assertEquals(canTransitionResearchProposalState(initial.currentState, 'direction_resolution'), true)
  const context = collectProposalContext({ sources: [] })
  const afterContext = transitionResearchProposalWorkflow(initial, { type: 'context_collected', context })
  const candidates = rankResearchDirections([direction()], ['profile-research', 'programme-theme'])
  const afterDirections = transitionResearchProposalWorkflow(afterContext, { type: 'directions_proposed', candidates })
  assertEquals(afterDirections.currentState, 'awaiting_applicant_decision')
  const approved = transitionResearchProposalWorkflow(afterDirections, { type: 'direction_approved', directionId: 'direction-1' })
  assertEquals(approved.selectedDirectionId, 'direction-1')
  assertEquals(approved.userInterventions, 1)
  assertExists(approved.transitionHistory.at(-1))
})

Deno.test('blocks a high-risk methodology until the strategy is narrowed', () => {
  const req = requirement()
  const proposalStrategy = strategy(req, direction(), dossier())
  const riskyStrategy = { ...proposalStrategy, feasibility: { ...proposalStrategy.feasibility, riskLevel: 'high' as const, assessment: 'Requires unverified facilities across several unrelated domains.' } }
  const draft = { id: 'draft-risky', version: 1, applicationCaseId: 'case-proposal-1', applicantName: 'Ada Example', institution: 'Northbridge University', programme: 'DPhil Computational Physics', degree: 'DPhil', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal' as const, filename: 'proposal.pdf', fileType: 'application/pdf', body: 'Background\nResearch question\nMethodology\nExpected contribution\nReferences', sections: ['Background', 'Research question', 'Methodology', 'Expected contribution'], pageCount: 4, citations: papers().map(paper => paper.citation), sourceFactIds: [], sourceEvidenceIds: ['programme-theme', 'paper-source'], formatMetadata: {}, artifactId: null, checksum: null, receivedAt: '2026-08-12T00:00:00.000Z' }
  const validation = validateResearchProposalDraft({ draft, requirement: req, expected: { applicantName: 'Ada Example', institution: 'Northbridge University', programme: 'DPhil Computational Physics', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal' }, verifiedEvidenceIds: ['programme-theme', 'paper-source'], sourcePapers: papers(), evidence: dossier().sources })
  const quality = evaluateResearchProposalQuality({ draft, validation, strategy: riskyStrategy })
  assertEquals(quality.passed, false)
  assert(quality.hardFailures.some(issue => issue.code === 'infeasible_methodology'))
})
