import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { applicationEmailHtmlFromText } from './application-email.ts'
import {
  FACULTY_OUTREACH_RESOLUTION_VERSION,
  FACULTY_RESULT_CONTRACT_VERSION,
  facultyOutreachResolutionSchema,
  facultyOutreachResolutionPurpose,
  calculateFacultyFitScore,
  extractExplicitEmailFromSource,
  normalizeFacultyOutreachResolutionScores,
  selectFacultyDraftCandidates,
  trustedFacultyFromResolution,
  validateFacultyOutreachResolution,
  type FacultyOutreachResolutionPackage,
} from './faculty-outreach-resolution.ts'

const body = 'Dear Professor Example,\n\nYour official profile describes quantum control research that connects directly to my verified work on open quantum systems. Would you be open to a brief conversation about doctoral supervision?\n\nKind regards,\nAda Applicant'

function packageValue(overrides: Partial<FacultyOutreachResolutionPackage> = {}): FacultyOutreachResolutionPackage {
  return {
    version: FACULTY_OUTREACH_RESOLUTION_VERSION,
    resultContractVersion: FACULTY_RESULT_CONTRACT_VERSION,
    applicationCaseId: 'case-1', programmeId: 'programme-1', strategyId: 'strategy-1', strategyRevision: 2, purpose: 'outreach', cvArtifactId: 'cv-1', cvChecksum: 'a'.repeat(64),
    faculty: [{
      facultyId: 'faculty-1', name: 'Ada Example', title: 'Professor', department: 'Physics', identityVerification: 'official_verified', identityEvidence: { name: 'Ada Example', institution: 'Example University', department: 'Physics', title: 'Professor', officialProfileUrl: 'https://physics.example.edu/faculty/ada-example', identitySourceUrl: 'https://physics.example.edu/faculty/ada-example', currentAffiliation: 'verified', retrievedAt: '2026-08-25T00:00:00.000Z' }, officialProfileUrl: 'https://physics.example.edu/faculty/ada-example', labUrl: null,
      email: 'ada@example.edu', emailSourceKey: 'profile', emailSourceUrl: 'https://physics.example.edu/faculty/ada-example', emailVerification: 'official_source_supplied', researchDomain: 'Quantum Information', researchSubdomains: ['Quantum control'], researchSummary: 'Researches quantum control in open systems.', researchThemes: ['Quantum control'],
      relevantCurrentWork: [{ title: 'Quantum control in open systems', year: 2025, url: 'https://doi.org/10.1000/example', relevanceToApplicant: 'Matches verified open-systems work.' }],
      applicantFit: { score: 94, researchAreaFit: 96, methodsFit: 92, experienceFit: 94, facultySpecificFit: 94, strongestConnections: [{ facultySignal: 'Quantum control', applicantEvidenceId: 'fact-1', explanation: 'Both concern open quantum systems.' }] },
      outreachRecommendation: 'recommended', outreachReason: 'Strong verified fit and programme policy recommends contact.',
      sources: [
        { sourceKey: 'profile', url: 'https://physics.example.edu/faculty/ada-example', type: 'faculty_profile', excerpt: 'Professor Ada Example researches quantum control. Email: ada@example.edu' },
        { sourceKey: 'paper', url: 'https://doi.org/10.1000/example', type: 'publication', excerpt: 'Quantum control in open systems (2025).' },
      ],
      emailAction: {
        subject: 'Prospective PhD research in quantum control', textBody: body, htmlBody: applicationEmailHtmlFromText(body), communicationGoal: 'Ask about doctoral supervision.', strongestConnection: 'Open quantum systems and quantum control.', attachmentArtifactIds: ['cv-1'],
        claims: [{ claim: 'Professor Example researches quantum control.', evidenceIds: ['profile'] }, { claim: 'The applicant has open quantum systems experience.', evidenceIds: ['fact-1'] }],
        followUp: { recommended: true, afterDays: 10, purpose: 'Check whether supervision capacity is known.' },
        quality: { specific: true, concise: true, recipientSpecific: true, programmeSpecific: true, applicantEvidenceUsed: true },
      },
    }],
    ...overrides,
  }
}

function validationContext(overrides: Record<string, unknown> = {}) {
  return {
    applicationCaseId: 'case-1', programmeId: 'programme-1', strategyId: 'strategy-1', strategyRevision: 2, purpose: 'outreach' as const,
    facultySeeds: [{ facultyId: 'faculty-1', name: 'Ada Example' }], applicantEvidenceIds: ['fact-1'], programmeEvidenceIds: ['policy-1'], outreachPermitted: true,
    cvArtifactId: 'cv-1', cvChecksum: 'a'.repeat(64), isApprovedInstitutionalUrl: (url: string) => new URL(url).hostname.endsWith('example.edu'),
    ...overrides,
  }
}

Deno.test('one package contains batch faculty research, fit, decision, and final email', () => {
  const second = { ...packageValue().faculty[0]!, facultyId: 'faculty-2', name: 'Grace Example', identityEvidence: { ...packageValue().faculty[0]!.identityEvidence, name: 'Grace Example', officialProfileUrl: 'https://physics.example.edu/faculty/grace-example', identitySourceUrl: 'https://physics.example.edu/faculty/grace-example' }, email: null, emailSourceKey: null, emailSourceUrl: null, emailVerification: 'missing' as const, researchDomain: 'Astrophysics', researchSubdomains: [], researchSummary: 'Researches astrophysics.', outreachRecommendation: 'skip' as const, emailAction: null, officialProfileUrl: 'https://physics.example.edu/faculty/grace-example', sources: [{ sourceKey: 'grace-profile', url: 'https://physics.example.edu/faculty/grace-example', type: 'faculty_profile' as const, excerpt: 'Professor Grace Example researches astrophysics.' }] }
  const result = validateFacultyOutreachResolution(packageValue({ faculty: [...packageValue().faculty, second] }), validationContext({ facultySeeds: [{ facultyId: 'faculty-1', name: 'Ada Example' }, { facultyId: 'faculty-2', name: 'Grace Example' }] }))
  assertEquals(result.valid, true)
})

Deno.test('strict faculty schema requires every faculty decision field', () => {
  const facultySchema = (facultyOutreachResolutionSchema.properties.faculty as Record<string, unknown>)
  const itemSchema = (facultySchema.items as Record<string, unknown>)
  const required = new Set(itemSchema.required as string[])
  for (const field of ['contactPolicy', 'draftRecommendation', 'sendRecommendation']) assert(required.has(field))
  const policySchema = (facultyOutreachResolutionSchema.properties.programmeContactPolicyDetails as Record<string, unknown>)
  const policyRequired = new Set((policySchema.required ?? []) as string[])
  assert(policyRequired.has('cycle'))
  const rootRequired = new Set(facultyOutreachResolutionSchema.required as readonly string[])
  assert(rootRequired.has('programmeContactPolicy'))
  assert(rootRequired.has('programmeContactPolicyDetails'))
})

Deno.test('drops an inferred institutional email and closes the unsafe outreach path', () => {
  const value = packageValue()
  value.faculty[0]!.sources[0]!.excerpt = 'Professor Ada Example researches quantum control.'
  const result = validateFacultyOutreachResolution(value, validationContext())
  assertEquals(result.valid, true)
  assertEquals(value.faculty[0]!.email, null)
  assertEquals(value.faculty[0]!.outreachRecommendation, 'skip')
  assertEquals(value.faculty[0]!.draftRecommendation, 'skip')
  assertEquals(value.faculty[0]!.sendRecommendation, 'skip')
})

Deno.test('normalizes an email explicitly published in an obfuscated official excerpt', () => {
  const value = packageValue()
  value.faculty[0]!.email = null
  value.faculty[0]!.emailSourceKey = null
  value.faculty[0]!.emailSourceUrl = null
  value.faculty[0]!.emailVerification = 'missing'
  value.faculty[0]!.sources[0]!.excerpt = 'Professor Ada Example researches quantum control. Email: ada[at]example.edu'
  assertEquals(extractExplicitEmailFromSource(value.faculty[0]!.sources[0]!.excerpt), 'ada@example.edu')
  const result = validateFacultyOutreachResolution(value, validationContext())
  assertEquals(result.valid, true)
  assertEquals(value.faculty[0]!.email, 'ada@example.edu')
  assertEquals(value.faculty[0]!.emailVerification, 'official_source_supplied')
})

Deno.test('generic methods cannot produce an excellent fit when research overlap is weak', () => {
  assertEquals(calculateFacultyFitScore({ researchAreaFit: 35, methodsFit: 100, experienceFit: 100, facultySpecificFit: 100 }), 62)
  assertEquals(calculateFacultyFitScore({ researchAreaFit: 90, methodsFit: 100, experienceFit: 90, facultySpecificFit: 92 }), 92)
})

Deno.test('skip pathway retains faculty intelligence without email', () => {
  const value = packageValue({ purpose: 'application_context', cvArtifactId: null, cvChecksum: null })
  value.faculty[0] = { ...value.faculty[0]!, outreachRecommendation: 'skip', emailAction: null }
  const result = validateFacultyOutreachResolution(value, validationContext({ purpose: 'application_context', outreachPermitted: false, cvArtifactId: null, cvChecksum: null }))
  assertEquals(result.valid, true)
  assertEquals(facultyOutreachResolutionPurpose('discouraged'), 'application_context')
})

Deno.test('rejects stale strategy and cross-application CV artifacts', () => {
  const result = validateFacultyOutreachResolution(packageValue({ strategyRevision: 1, cvArtifactId: 'other-cv' }), validationContext())
  assertEquals(result.valid, false)
  assert(result.issues.some(issue => issue.includes('stale')))
  assert(result.issues.some(issue => issue.includes('current CV')))
})

Deno.test('allows email preparation while the final CV is pending', () => {
  const value = packageValue({ cvArtifactId: null, cvChecksum: null })
  value.faculty[0]!.emailAction!.attachmentArtifactIds = []
  const result = validateFacultyOutreachResolution(value, validationContext({ cvArtifactId: null, cvChecksum: null }))
  assertEquals(result.valid, true)
})

Deno.test('discovers an official faculty set when programme discovery supplied no seeds', () => {
  const value = packageValue({ purpose: 'application_context', cvArtifactId: null, cvChecksum: null })
  value.faculty[0] = {
    ...value.faculty[0]!,
    facultyId: 'faculty:programme-1:ada-example',
    outreachRecommendation: 'skip',
    emailAction: null,
  }
  const result = validateFacultyOutreachResolution(value, validationContext({
    purpose: 'application_context',
    outreachPermitted: false,
    cvArtifactId: null,
    cvChecksum: null,
    facultySeeds: [],
    facultyDiscoveryRequired: true,
  }))
  assertEquals(result.valid, true)
})

Deno.test('does not accept an empty faculty batch for a selected research programme', () => {
  const result = validateFacultyOutreachResolution(packageValue({ faculty: [] }), validationContext({ facultySeeds: [], facultyDiscoveryRequired: true }))
  assertEquals(result.valid, false)
  assertStringIncludes(result.repairReason ?? '', 'discover at least one current faculty member')
})

Deno.test('normalizes ratio-style model fit scores onto the canonical percentage scale', () => {
  const value = packageValue()
  value.faculty[0]!.applicantFit.score = 0.91
  normalizeFacultyOutreachResolutionScores(value)
  assertEquals(value.faculty[0]!.applicantFit.score, 94)
})

Deno.test('withholds a faculty record whose current institutional identity is uncertain', () => {
  const value = packageValue({ purpose: 'application_context', cvArtifactId: null, cvChecksum: null })
  value.faculty[0] = {
    ...value.faculty[0]!,
    identityVerification: 'uncertain',
    identityEvidence: { ...value.faculty[0]!.identityEvidence, currentAffiliation: 'uncertain' },
    outreachRecommendation: 'skip',
    email: null,
    emailSourceKey: null,
    emailSourceUrl: null,
    emailVerification: 'missing',
    emailAction: null,
  }
  const result = validateFacultyOutreachResolution(value, validationContext({ purpose: 'application_context', outreachPermitted: false, cvArtifactId: null, cvChecksum: null }))
  assertEquals(result.valid, true)
  assertEquals(trustedFacultyFromResolution(value).length, 0)
})

Deno.test('trusted faculty are ordered by deterministic research fit', () => {
  const value = packageValue()
  const second = { ...value.faculty[0]!, facultyId: 'faculty-2', name: 'Zed Example', applicantFit: { ...value.faculty[0]!.applicantFit, score: 96, researchAreaFit: 97 } }
  const trusted = trustedFacultyFromResolution({ ...value, faculty: [value.faculty[0]!, second] })
  assertEquals(trusted.map(faculty => faculty.facultyId), ['faculty-2', 'faculty-1'])
})

Deno.test('faculty outreach drafts are capped and skip stale or prohibited contacts', () => {
  const value = packageValue()
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    ...value.faculty[0]!,
    facultyId: `faculty-${index + 1}`,
    name: `Faculty ${index + 1}`,
    applicantFit: { ...value.faculty[0]!.applicantFit, score: 90 - index },
    email: `faculty${index + 1}@example.edu`,
    emailAction: index === 4 ? null : value.faculty[0]!.emailAction,
    outreachRecommendation: index === 3 ? 'skip' as const : 'recommended' as const,
  }))
  const selected = selectFacultyDraftCandidates(candidates, { purpose: 'outreach', outreachPermitted: true })
  assertEquals(selected.map(faculty => faculty.facultyId), ['faculty-1', 'faculty-2', 'faculty-3'])
})

Deno.test('neutral policy drafts require a strong specific research match', () => {
  const strong = {
    ...packageValue().faculty[0]!,
    contactPolicy: 'allowed_or_neutral' as const,
    outreachRecommendation: 'optional' as const,
    draftRecommendation: 'useful' as const,
  }
  const weak = {
    ...strong,
    facultyId: 'faculty-weak',
    name: 'Weak Example',
    applicantFit: { ...strong.applicantFit, score: 72, researchAreaFit: 45, facultySpecificFit: 40 },
  }
  const prohibited = {
    ...strong,
    facultyId: 'faculty-prohibited',
    name: 'Prohibited Example',
    contactPolicy: 'prohibited' as const,
    draftRecommendation: 'skip' as const,
    sendRecommendation: 'skip' as const,
    emailAction: null,
  }
  const unknown = {
    ...strong,
    facultyId: 'faculty-unknown',
    name: 'Unknown Example',
    contactPolicy: 'unknown_due_to_insufficient_evidence' as const,
    draftRecommendation: 'skip' as const,
    sendRecommendation: 'skip' as const,
    emailAction: null,
  }
  const selected = selectFacultyDraftCandidates([strong, weak, prohibited, unknown], { purpose: 'outreach', outreachPermitted: true })
  assertEquals(selected.map(faculty => faculty.facultyId), ['faculty-1'])
})
