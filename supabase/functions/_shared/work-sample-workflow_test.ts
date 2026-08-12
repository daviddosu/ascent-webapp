import { assert, assertEquals, assertFalse, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  applyWorkSampleInteraction,
  buildWorkSampleRequirementGraph,
  checkWorkSampleEligibility,
  createWorkSamplePortfolioStrategy,
  discoverWorkSampleCandidates,
  extractWorkSampleRequirements,
  prepareWorkSampleSubmission,
  rankWorkSampleCandidates,
  resolveWorkSampleContext,
  scanWorkSampleSecurity,
  verifyCandidateAuthorship,
  verifyWorkSampleUpload,
  workSampleCompletionEvidence,
  workSampleMetricsSummary,
  type WorkSampleCandidate,
  type WorkSampleRequirement,
} from './work-sample-workflow.ts'

function sources() {
  return [
    { id: 'programme', url: 'https://northbridge.example.edu/phd/apply', authority: 'official', sourceKind: 'official_programme', excerpt: 'Submit one academic writing sample, maximum 15 pages. A complete paper or coherent thesis excerpt is accepted. Include your name and citations.', retrievedAt: '2026-08-01T00:00:00Z' },
    { id: 'department', url: 'https://northbridge.example.edu/physics', authority: 'official', sourceKind: 'department', excerpt: 'A technical report or research paper demonstrating analytical work is recommended.', retrievedAt: '2026-08-01T00:00:00Z' },
  ]
}

function requirement(overrides: Partial<WorkSampleRequirement> = {}): WorkSampleRequirement {
  return {
    ...extractWorkSampleRequirements({ applicationCaseId: 'case-1', programme: 'PhD Computational Physics', sourceEvidence: sources() })[0]!,
    ...overrides,
  }
}

function contextCandidates() {
  return discoverWorkSampleCandidates({
    profile: {
      theses: [{ id: 'thesis-record', title: 'Uncertainty-Aware Particle Simulation', artifactType: 'THESIS_EXCERPT', authors: ['David Dosu'], authorship: 'sole author', authorshipEvidence: ['profile:thesis'], institution: 'Controlled University', subjectArea: 'computational physics', description: 'A complete thesis on uncertainty-aware particle simulation.', pageCount: 64, fileFormat: 'application/pdf', fileSizeBytes: 900_000, assetId: 'asset-thesis', content: 'Abstract\nIntroduction\nMethodology\nAnalysis\nResults\nDiscussion\nConclusion\nReferences\nI developed the simulation pipeline and evaluated the model. (Smith 2024)'.repeat(20), sections: [{ title: 'Introduction', startPage: 1, endPage: 4, purpose: 'problem' }, { title: 'Methods', startPage: 5, endPage: 10, purpose: 'method' }, { title: 'Analysis', startPage: 24, endPage: 32, purpose: 'analysis' }, { title: 'Results', startPage: 33, endPage: 40, purpose: 'results' }] }],
      publications: [{ id: 'publication-record', title: 'Published Study of Particle Models', artifactType: 'PUBLICATION', authors: ['David Dosu', 'Ada Lee'], authorship: 'co-author', authorshipEvidence: ['profile:publication'], applicantContribution: 'Developed the simulation pipeline and performed the primary statistical analysis.', publicationStatus: 'published', venue: 'Controlled Physics Review', subjectArea: 'computational physics', pageCount: 10, fileFormat: 'application/pdf', fileSizeBytes: 500_000, assetId: 'asset-paper', content: 'Abstract\nIntroduction\nMethod\nResults\nDiscussion\nConclusion\nReferences\nI developed the simulation pipeline and performed the primary statistical analysis. (Lee 2024)' }],
      projects: [{ id: 'project-record', title: 'Open Research Dashboard', artifactType: 'SOFTWARE_PROJECT', authorship: 'developer', authorshipEvidence: ['profile:project'], applicantContribution: 'Built the data pipeline and dashboard.', repositoryUrl: 'https://github.com/david/open-dashboard', subjectArea: 'scientific computing', technologies: ['Python', 'TypeScript'], content: 'README\nSetup\nArchitecture\nResults\nI built the data pipeline.' }],
    },
  })
}

Deno.test('extracts authoritative requirements, constraints, modes, and exact evidence', () => {
  const result = extractWorkSampleRequirements({ applicationCaseId: 'case-1', programme: 'PhD Computational Physics', sourceEvidence: sources() })
  assert(result.some(item => item.requirementType === 'ACADEMIC_WRITING'))
  const writing = result.find(item => item.requirementType === 'ACADEMIC_WRITING')!
  assertEquals(writing.mode, 'required')
  assertEquals(writing.pageLimit, 15)
  assert(writing.applicantNameRequired)
  assert(writing.sources.every(source => source.authority === 'official'))
  assert(writing.sourceEvidenceIds.includes('programme'))
})

Deno.test('detects no sample, optional evidence, and prohibited complete thesis separately', () => {
  const none = extractWorkSampleRequirements({ applicationCaseId: 'case-none', sourceEvidence: [{ id: 'guide', authority: 'official', excerpt: 'No writing sample is accepted for this application.' }] })
  assert(none.some(item => item.mode === 'prohibited'))
  const optional = extractWorkSampleRequirements({ applicationCaseId: 'case-optional', sourceEvidence: [{ id: 'guide', authority: 'official', excerpt: 'A writing sample is optional and may be submitted.' }] })
  assert(optional.some(item => item.mode === 'optional'))
  const thesis = extractWorkSampleRequirements({ applicationCaseId: 'case-thesis', sourceEvidence: [{ id: 'guide', authority: 'official', excerpt: 'Submit a thesis excerpt up to 20 pages; do not submit the complete thesis.' }] })
  const excerpt = thesis.find(item => item.requirementType === 'THESIS_EXCERPT')!
  assert(excerpt.excerptPermitted)
  assertEquals(excerpt.pageLimit, 20)
  assert(excerpt.exactInstructions.includes('complete thesis'))
})

Deno.test('discovers, inspects, and preserves authorship boundaries across profile work', () => {
  const candidates = contextCandidates()
  assertEquals(candidates.length, 3)
  const thesis = candidates.find(item => item.title.startsWith('Uncertainty'))!
  assert(thesis.inspection.inspected)
  assert(thesis.inspection.structure.includes('methodology'))
  assertEquals(thesis.applicantAuthorshipRole, 'sole_author')
  assert(verifyCandidateAuthorship(thesis).verified)
  const publication = candidates.find(item => item.artifactType === 'PUBLICATION')!
  assertEquals(publication.applicantAuthorshipRole, 'co_author')
  assert(publication.applicantContribution?.includes('simulation pipeline'))
})

Deno.test('ranks an eligible direct-fit thesis ahead of a prestigious but less-fit co-authored paper', () => {
  const candidates = contextCandidates()
  const ranked = rankWorkSampleCandidates({ requirement: requirement(), candidates, programme: 'PhD Computational Physics' })
  assertEquals(ranked[0]?.title, 'Uncertainty-Aware Particle Simulation')
  assert(ranked[0]!.eligibility === 'eligible')
  assert(ranked[0]!.rankingReasons.some(reason => /programme-fit/i.test(reason)))
  assert(ranked[0]!.applicationFitScore > ranked[1]!.applicationFitScore)
})

Deno.test('selects a clear winner, asks for a genuine choice, or asks only for a missing file', () => {
  const candidates = contextCandidates()
  const clear = rankWorkSampleCandidates({ requirement: requirement({ numberRequired: 1 }), candidates })
  const winner = createWorkSamplePortfolioStrategy({ applicationCaseId: 'case-1', requirement: requirement(), rankedCandidates: clear })
  assert(winner.strategy || winner.interaction)
  const choice = createWorkSamplePortfolioStrategy({ applicationCaseId: 'case-1', requirement: requirement({ expectedSubjectArea: null }), rankedCandidates: clear.map(item => ({ ...item, applicationFitScore: 80 })) })
  assertEquals(choice.interaction?.kind, 'single_choice')
  const missingCandidate = { ...candidates[0]!, assetAvailable: false, sourceAssetIds: [], url: null, repositoryUrl: null, liveSiteUrl: null, eligibility: 'unknown' as const }
  const missing = createWorkSamplePortfolioStrategy({ applicationCaseId: 'case-1', requirement: requirement(), rankedCandidates: [{ ...clear[0]!, ...missingCandidate, eligibility: 'unknown', rank: 1 }] })
  assertEquals(missing.interaction?.kind, 'attachment_request')
})

Deno.test('blocks a complete thesis when excerpts are prohibited and chooses a coherent excerpt when allowed', () => {
  const thesis = contextCandidates().find(item => item.artifactType === 'THESIS_EXCERPT')!
  const prohibited = requirement({ pageLimit: 15, excerptPermitted: false, acceptedArtifactTypes: ['THESIS_EXCERPT'] })
  assertEquals(checkWorkSampleEligibility(prohibited, thesis).eligibility, 'ineligible')
  const allowed = requirement({ pageLimit: 15, excerptPermitted: true, acceptedArtifactTypes: ['THESIS_EXCERPT'] })
  const prepared = prepareWorkSampleSubmission({ applicationCaseId: 'case-1', requirement: allowed, candidate: thesis, applicantName: 'David Dosu', originalArtifactId: 'artifact-original', originalChecksum: 'a'.repeat(64), derivedChecksum: 'b'.repeat(64), derivedSizeBytes: 120_000, applicantNameIncluded: true })
  assert(prepared.transformations.some(item => item.type === 'page_extraction'))
  assert(prepared.selectedPages.length <= 15)
  assert(prepared.selectedPages.some(page => page >= 24))
  assert(prepared.filename === 'David_Dosu_Thesis_Excerpt.pdf')
})

Deno.test('prepares provenance-preserving publication, code, and portfolio candidates', () => {
  const candidates = contextCandidates()
  const publication = candidates.find(item => item.artifactType === 'PUBLICATION')!
  const paper = prepareWorkSampleSubmission({ applicationCaseId: 'case-1', requirement: requirement({ requirementType: 'PUBLICATION', acceptedArtifactTypes: ['PUBLICATION'], publicationRequirement: 'published', pageLimit: 12 }), candidate: publication, applicantName: 'David Dosu', originalArtifactId: 'artifact-paper', originalChecksum: 'c'.repeat(64), derivedChecksum: 'd'.repeat(64), derivedSizeBytes: 80_000, applicantNameIncluded: true })
  assert(paper.qualityGate.passed)
  assertEquals(paper.provenance.sourceArtifactId, 'artifact-paper')
  assert(paper.transformations.every(item => !item.substantiveContentChanged))
  const code = candidates.find(item => item.artifactType === 'SOFTWARE_PROJECT')!
  assertEquals(code.repositoryUrl, 'https://github.com/david/open-dashboard')
  assertEquals(checkWorkSampleEligibility(requirement({ requirementType: 'CODE_SAMPLE', acceptedArtifactTypes: ['SOFTWARE_PROJECT'], githubPermitted: true }), code).eligibility, 'eligible')
})

Deno.test('blocks secrets in code and notebook submissions before an external write', () => {
  const result = scanWorkSampleSecurity({ repositoryFiles: [{ path: '.env', content: 'API_KEY=not-a-real-but-still-sensitive-token' }, { path: 'notebook.ipynb', content: 'password = "unsafe-value"' }] })
  assertFalse(result.passed)
  assert(result.findings.some(item => /sensitive file path/i.test(item)))
  assert(result.findings.some(item => /API key|password/i.test(item)))
})

Deno.test('typed Progress Detail responses resume automatically and preserve reusable context only with consent', () => {
  const context = resolveWorkSampleContext({ requirements: [requirement()], profile: {}, existingCandidates: contextCandidates() })
  const interaction = createWorkSamplePortfolioStrategy({ applicationCaseId: 'case-1', requirement: requirement(), rankedCandidates: rankWorkSampleCandidates({ requirement: requirement(), candidates: context.candidates }).map(item => ({ ...item, applicationFitScore: 80 })) }).interaction!
  const applied = applyWorkSampleInteraction({ context, interaction, value: interaction.options[0]!.value, reusableContextConsent: true })
  assert(applied.accepted)
  assert(applied.metric.resumedAutomatically)
  assert(applied.metric.reusableContextSaved)
  assertEquals(workSampleMetricsSummary([applied.metric]).broadFreeTextQuestions, 0)
})

Deno.test('verifies exact portal read-back and rejects wrong filename, checksum, or stale duplicate state', () => {
  const verified = verifyWorkSampleUpload({ applicationCaseId: 'case-1', requirementId: 'req-1', submissionId: 'sub-1', portal: 'controlled', section: 'work-sample', sessionId: 'session-1', persistedValues: { filename: 'David_Dosu_Writing_Sample.pdf', checksum: 'e'.repeat(64) }, readBackValues: { filename: 'David_Dosu_Writing_Sample.pdf', checksum: 'e'.repeat(64) }, filename: 'David_Dosu_Writing_Sample.pdf', checksum: 'e'.repeat(64), sizeBytes: 100_000, accepted: true, confirmation: 'Saved', existingSubmissionIds: ['sub-1'] })
  assert(verified.verified)
  const wrong = verifyWorkSampleUpload({ applicationCaseId: 'case-1', requirementId: 'req-1', submissionId: 'sub-1', portal: 'controlled', section: 'work-sample', sessionId: 'session-1', persistedValues: { filename: 'wrong.pdf' }, readBackValues: { filename: 'wrong.pdf' }, filename: 'David_Dosu_Writing_Sample.pdf', checksum: 'f'.repeat(64), sizeBytes: 100_000, accepted: true, confirmation: 'Saved' })
  assertFalse(wrong.verified)
  assert(wrong.issues.some(issue => /filename/i.test(issue)))
})

Deno.test('verifies URL submissions with exact persisted and read-back links', () => {
  const url = 'https://github.com/david/open-dashboard'
  const verified = verifyWorkSampleUpload({ applicationCaseId: 'case-code', requirementId: 'req-code', submissionId: 'sub-code', portal: 'controlled', section: 'code-sample', sessionId: 'session-code', submissionMethod: 'url', submissionUrl: url, persistedValues: { url }, readBackValues: { url }, filename: 'David_Dosu_Code_Sample.url', checksum: 'a'.repeat(64), sizeBytes: null, accepted: true, confirmation: 'Saved repository URL' })
  assert(verified.verified)
  assertEquals(verified.evidence?.url, url)
  const broken = verifyWorkSampleUpload({ applicationCaseId: 'case-code', requirementId: 'req-code', submissionId: 'sub-code', portal: 'controlled', section: 'code-sample', sessionId: 'session-code', submissionMethod: 'url', submissionUrl: 'not-a-url', persistedValues: { url: 'not-a-url' }, readBackValues: { url: 'not-a-url' }, filename: 'David_Dosu_Code_Sample.url', checksum: 'a'.repeat(64), sizeBytes: null, accepted: true, confirmation: 'Saved repository URL' })
  assertFalse(broken.verified)
  assert(broken.issues.some(issue => /URL/i.test(issue)))
})

Deno.test('builds the canonical graph and does not report completion without resulting-state evidence', () => {
  const req = requirement({ status: 'ready' })
  const candidate = contextCandidates()[0]!
  const submission = prepareWorkSampleSubmission({ applicationCaseId: 'case-1', requirement: req, candidate, applicantName: 'David Dosu', originalChecksum: 'a'.repeat(64), derivedChecksum: 'b'.repeat(64), derivedSizeBytes: 100_000, applicantNameIncluded: true })
  const graph = buildWorkSampleRequirementGraph({ caseId: 'case-1', requirements: [req], submissions: [submission] })
  assertEquals(graph.length, 4)
  assert(graph.some(node => node.action === 'verify_work_sample_upload'))
  const incomplete = workSampleCompletionEvidence({ requirement: req, submission, portalVerification: null, applicantAuthorshipVerified: true, userResponsesResumed: true })
  assertFalse(incomplete.complete)
  assert(incomplete.defects.includes('portal_upload_unverified'))
})
