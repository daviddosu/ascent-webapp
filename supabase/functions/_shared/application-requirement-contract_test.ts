import {
  assertUuid,
  canonicalRequirementKey,
  canonicalRequirementType,
  inferRequirementCardinality,
  inferRequirementLevel,
  normalizeCanonicalApplicationRequirement,
  resolveRequirementIdFromPlanNode,
  resolveWriterReference,
  writerSourceMaterialIds,
} from './application-requirement-contract.ts'

const requirementId = '10ffe014-8925-4153-ba16-e5604c5c3599'
const caseId = '243b76a5-5b25-4f4f-bb06-e9930705d9ec'

Deno.test('plan identity and requirement identity remain separate', () => {
  const known = new Set([requirementId])
  const resolved = resolveRequirementIdFromPlanNode({
    planNodeId: `application-plan:requirement:${requirementId}`,
    knownRequirementIds: known,
  })
  if (resolved !== requirementId) throw new Error('The validated legacy plan node did not resolve to the canonical UUID.')
  let failed = false
  try {
    resolveRequirementIdFromPlanNode({ requirementId: `application-plan:requirement:${requirementId}`, knownRequirementIds: known })
  } catch {
    failed = true
  }
  if (!failed) throw new Error('A display ID was accepted as a RequirementId.')
})

Deno.test('normalization keeps official evidence separate from applicant satisfaction', () => {
  const normalized = normalizeCanonicalApplicationRequirement({
    id: requirementId,
    applicationCaseId: caseId,
    institution: 'Harvard University',
    programme: 'Physics',
    cycle: '2027',
    name: 'Recommendation letters',
    requirementType: 'referee',
    required: true,
    status: 'verified',
    exactInstructions: 'Three academic letters of recommendation are required.',
    sourceEvidenceIds: ['evidence-official-recommendations'],
    source: { authority: 'official', cardinality: { exact: 3 } },
  })
  if (normalized.verificationState !== 'verified') throw new Error('Official source evidence was not retained.')
  if (normalized.applicantState !== 'unknown') throw new Error('Official rule evidence incorrectly satisfied the applicant requirement.')
  if (normalized.cardinality?.exact !== 3) throw new Error('Recommendation cardinality was lost.')
  if (normalized.canonicalKey !== canonicalRequirementKey({ institution: 'Harvard University', programme: 'Physics', cycle: '2027', type: normalized.type, title: normalized.title, officialWording: normalized.officialWording })) throw new Error('Canonical key is not deterministic.')
})

Deno.test('recommendation cardinality reads exact and minimum rules', () => {
  const exact = inferRequirementCardinality({ name: 'Recommendations', officialWording: 'Three academic letters of recommendation are required.' })
  const minimum = inferRequirementCardinality({ name: 'Recommendations', officialWording: 'At least three letters are required.' })
  const strongerThanModel = inferRequirementCardinality({ name: 'Recommendations', officialWording: 'Three academic letters of recommendation are required.', cardinality: { min: 1 } })
  if (exact?.exact !== 3 || minimum?.min !== 3 || strongerThanModel?.exact !== 3) throw new Error('Recommendation cardinality inference is incorrect.')
})

Deno.test('programme-specific test obligations stay distinct and preserve optionality', () => {
  const general = canonicalRequirementType('GRE General Test', 'test')
  const subject = canonicalRequirementType('GRE Physics Subject Test', 'test')
  if (general !== 'gre' || subject !== 'subject_gre') throw new Error('General and subject GRE obligations were not classified separately.')
  const generalKey = canonicalRequirementKey({ institution: 'Harvard University', programme: 'Physics', cycle: '2027', type: general, title: 'GRE General Test', officialWording: 'GRE General Test scores are optional.' })
  const subjectKey = canonicalRequirementKey({ institution: 'Harvard University', programme: 'Physics', cycle: '2027', type: subject, title: 'GRE Physics Subject Test', officialWording: 'The Physics GRE is required.' })
  if (generalKey === subjectKey) throw new Error('General and subject GRE obligations share an identity key.')
  if (inferRequirementLevel({ required: true, officialWording: 'GRE General Test scores are optional. If submitted, send official scores.' }) !== 'optional') throw new Error('Explicitly optional test evidence became a blocker.')
  if (inferRequirementLevel({ required: false, officialWording: 'English proficiency is required unless the applicant qualifies for an exemption.' }) !== 'conditional') throw new Error('Conditional test evidence was flattened into optional.')
})

Deno.test('unrelated non-standard requirements do not collapse into one other key', () => {
  const first = canonicalRequirementKey({ institution: 'Harvard University', programme: 'Physics', cycle: '2027', type: 'other', title: 'Six most advanced undergraduate courses', officialWording: 'List four physics and two mathematics courses.' })
  const second = canonicalRequirementKey({ institution: 'Harvard University', programme: 'Physics', cycle: '2027', type: 'other', title: 'Electronic submission of all components', officialWording: 'Submit all components electronically.' })
  if (first === second) throw new Error('Distinct non-standard requirements were deduplicated by the broad other type.')
})

Deno.test('invalid database identity fails before a database operation', () => {
  let failed = false
  try {
    assertUuid(`application-plan:requirement:${requirementId}`, 'RequirementId')
  } catch {
    failed = true
  }
  if (!failed) throw new Error('The synthetic plan ID was accepted as a database UUID.')
})

Deno.test('managed writer aliases are explicit non-database references', () => {
  const managed = resolveWriterReference('David-managed-writer')
  if (!managed || managed.kind !== 'managed' || managed.id !== 'david-managed-writer') throw new Error('The supported managed writer route was not normalized.')
  const unknown = resolveWriterReference('writer-display-label')
  if (unknown !== null) throw new Error('An arbitrary writer display label was accepted as an identity.')
  const record = resolveWriterReference('10ffe014-8925-4153-ba16-e5604c5c3599')
  if (!record || record.kind !== 'record') throw new Error('A canonical writer UUID was not recognized as a database record reference.')
})

Deno.test('known legacy managed-writer aliases normalize without accepting display labels', () => {
  const managed = resolveWriterReference('roon-assigned-writer')
  if (!managed || managed.kind !== 'managed' || managed.id !== 'roon-managed-writer') throw new Error('The recoverable Roon writer route was not normalized.')
  if (resolveWriterReference('Roon writer') !== null) throw new Error('A writer display label was accepted as an identity.')
})

Deno.test('writer source handoff includes only the current same-case CV artifact once', () => {
  const cvId = '7c657586-72ad-4d81-96ef-4e84b00cc80d'
  const caseId = 'ffcacd79-dc58-4cbb-a768-cd23bf968a5b'
  const sources = writerSourceMaterialIds({
    suppliedIds: ['source-profile', cvId],
    expectedApplicationCaseId: caseId,
    currentCvArtifact: { id: cvId, applicationCaseId: caseId, kind: 'programme_derivative', approvalStatus: 'pending', finalSubmissionDestination: 'CV / resume upload' },
  })
  if (sources.filter(id => id === cvId).length !== 1) throw new Error('The final CV was not handed to the writer exactly once.')
  let rejected = false
  try {
    writerSourceMaterialIds({
      suppliedIds: [],
      expectedApplicationCaseId: caseId,
      currentCvArtifact: { id: cvId, applicationCaseId: '1f4ac225-5fca-4e94-8719-970b09f5a581', kind: 'programme_derivative', approvalStatus: 'pending', finalSubmissionDestination: 'CV / resume upload' },
    })
  } catch {
    rejected = true
  }
  if (!rejected) throw new Error('A cross-application CV artifact reached the writer handoff.')
})
