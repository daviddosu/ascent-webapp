import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  OPPORTUNITY_SCORE_WEIGHTS,
  buildApplicantResearchProfile,
  decomposeOpportunityIntent,
  rankOpportunityCandidates,
} from './opportunity-discovery.ts'
import type { ProgrammeDiscoveryCandidate } from './application-programme-discovery.ts'

function candidate(overrides: Partial<ProgrammeDiscoveryCandidate> = {}): ProgrammeDiscoveryCandidate {
  return {
    institution: 'Harvard University',
    programmeTitle: 'PhD Physics',
    degreeLevel: 'PhD',
    location: 'United States',
    officialUrl: 'https://physics.harvard.edu/graduate/program',
    applicationUrl: 'https://gsas.harvard.edu/apply',
    deadline: null,
    deadlineTimezone: 'America/New_York',
    fitScoreTen: 0,
    confidence: 95,
    fitRationale: '',
    cvEvidence: ['Research Associate — quantum information and machine learning'],
    requirementsSummary: ['Bachelor’s degree or equivalent', 'Statement of purpose', 'Three letters of recommendation'],
    sources: [{ url: 'https://physics.harvard.edu/graduate/program', excerpt: 'The department offers doctoral study in physics.', sourceType: 'official' }],
    routeType: 'exact_programme',
    routeLabel: 'Direct programme',
    discoveryReason: 'Matches the requested physics PhD route.',
    researchAreas: ['quantum information', 'quantum control', 'computational physics'],
    methods: ['machine learning', 'simulation', 'numerical methods'],
    facultyLabs: [{ name: 'Quantum Information Group', role: 'Research group', officialUrl: 'https://physics.harvard.edu/research/quantum', researchAreas: ['quantum information'], evidence: 'The group studies quantum information and control.' }],
    eligibility: { status: 'verified', requirements: ['Physics or related degree'], uncertainties: [], evidence: ['Official admissions page lists the degree requirement.'] },
    currentCycle: { intakeYear: 2027, deadlineStatus: 'confirmed', notes: [], sourceUrls: ['https://physics.harvard.edu/graduate/program'] },
    ...overrides,
  }
}

Deno.test('decomposes institution-wide physics PhD intent and expands adjacent routes', () => {
  const intent = decomposeOpportunityIntent({ objective: 'Help me find Physics PhD programmes at Harvard, MIT, and Stanford for the next intake.' })
  assertEquals(intent.degreeLevel, 'PhD')
  assert(intent.fields.includes('physics'))
  assert(intent.institutionNames.some(name => /harvard/i.test(name)))
  assert(intent.expansionTerms.some(term => /quantum|astrophysics|applied physics/i.test(term)))
  assertEquals(intent.breadth, 'institution_wide')
})

Deno.test('builds an evidence-grounded research profile from a CV', () => {
  const profile = buildApplicantResearchProfile({ cvText: 'Research Associate\nQuantum control and quantum information\nUsed numerical simulation and machine learning to study open systems.', verifiedFacts: [] })
  assertEquals(profile.sourceState, 'cv')
  assert(profile.researchAreas.includes('physics') || profile.researchAreas.includes('quantum'))
  assert(profile.methods.some(method => /simulation|machine learning/i.test(method)))
  assert(profile.evidence.some(item => item.source === 'cv'))
})

Deno.test('ranks Harvard, MIT, and Stanford with a deterministic weighted score', () => {
  const profile = buildApplicantResearchProfile({ cvText: 'Research Associate\nQuantum control and quantum information\nUsed numerical simulation and machine learning.' })
  const intent = decomposeOpportunityIntent({ objective: 'Apply to Physics PhD programmes in the United States.' })
  const ranked = rankOpportunityCandidates([
    candidate(),
    candidate({ institution: 'Massachusetts Institute of Technology', programmeTitle: 'PhD in Physics', officialUrl: 'https://physics.mit.edu/graduate/', sources: [{ url: 'https://physics.mit.edu/graduate/', excerpt: 'Graduate physics programme.', sourceType: 'official' }], researchAreas: ['quantum information', 'condensed matter'], facultyLabs: [], currentCycle: { intakeYear: 2027, deadlineStatus: 'not_found', notes: [], sourceUrls: [] } }),
    candidate({ institution: 'Stanford University', programmeTitle: 'PhD Physics', officialUrl: 'https://physics.stanford.edu/graduate', sources: [{ url: 'https://physics.stanford.edu/graduate', excerpt: 'Graduate physics programme.', sourceType: 'official' }], researchAreas: ['astrophysics'], methods: ['observational astronomy'], eligibility: { status: 'unclear', requirements: [], uncertainties: ['Current prerequisite interpretation is unclear.'], evidence: [] } }),
  ], profile, intent)
  assertEquals(ranked.length, 3)
  assert(ranked[0].finalScoreTen >= ranked[1].finalScoreTen)
  assert(ranked.every(item => item.finalScoreTen >= 0 && item.finalScoreTen <= 10))
  assertEquals(Object.values(OPPORTUNITY_SCORE_WEIGHTS).reduce((total, weight) => total + weight, 0), 1)
  assert(Object.keys(ranked[0].dimensions).length === 10)
})

Deno.test('does not pretend an applicant without a CV has fit evidence', () => {
  const profile = buildApplicantResearchProfile({})
  const ranked = rankOpportunityCandidates([candidate({ cvEvidence: [], confidence: 90 })], decomposeApplicant(profile), decomposeOpportunityIntent({ query: 'Physics PhD' }))
  assertEquals(profile.sourceState, 'none')
  assertEquals(ranked[0].finalScoreTen, 0)
  assertEquals(ranked[0].dimensions.evidenceStrength, 0.24)
  assert(!ranked[0].matchEvidence.some(item => item.dimension === 'experienceFit'))
})

Deno.test('keeps a verified opportunity when the deadline is missing', () => {
  const ranked = rankOpportunityCandidates([candidate({ deadline: null, currentCycle: { intakeYear: 2027, deadlineStatus: 'not_found', notes: ['The current deadline was not published on the official page.'], sourceUrls: [] } })], buildApplicantResearchProfile({ cvText: 'Physics research and simulation.' }), decomposeOpportunityIntent({ query: 'Physics PhD' }))
  assertEquals(ranked.length, 1)
  assertEquals(ranked[0].currentCycle?.deadlineStatus, 'not_found')
  assert(ranked[0].dimensions.applicationFeasibility > 0)
})

function decomposeApplicant(profile: ReturnType<typeof buildApplicantResearchProfile>) {
  return profile
}
