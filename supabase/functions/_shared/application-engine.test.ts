import { describe, expect, it } from 'vitest'
import {
  applyApplicationObservation,
  applicationEngineDirective,
  claimApplicationAction,
  createApplicationEngineState,
  planApplicationEngineStep,
  projectApplicationWorkstreams,
  projectApplicationRequirementStates,
  verifyApplicationRequirement,
  recordApplicationFailure,
  validateSemanticDecision,
  verifyPortalExecutionContract,
  type ApplicationEngineState,
  type ArtifactObservation,
  type CalendarObservation,
  type EngineRequirement,
  type PortalObservation,
  type WebObservation,
} from './application-engine'
import { discoverApplicationQuestions } from './application-questions'

function requirement(overrides: Partial<EngineRequirement> = {}): EngineRequirement {
  return {
    id: 'req-1', caseId: 'case-1', name: 'Identity section', required: true, status: 'UNRESOLVED', sourceId: 'official-1',
    dependencyIds: [], responsible: 'david', deadline: '2027-01-01T00:00:00Z', evidenceIds: [], blocker: null,
    type: 'portal_section', source: { id: 'official-1', authority: 'official' }, evidenceContract: ['portal'],
    retry: { attempts: 0, maximumAttempts: 3, lastFailure: null, nextAttemptAt: null, escalated: false },
    requiredFactIds: ['profile:name'], resolutionTier: null, ...overrides,
  }
}

function state(requirements = [requirement()]): ApplicationEngineState {
  return createApplicationEngineState({
    caseId: 'case-1', objective: 'Apply', status: 'ACTIVE', requirements,
    facts: [{ factId: 'profile:name', value: 'Ada Doe', verification: 'VERIFIED', provenance: { kind: 'uploaded_document', sourceId: 'cv-1', confirmed: true }, confidence: 'high', conflict: false, candidates: [], reason: null }],
    observations: [], completedActionKeys: [], approvals: [], browser: { portal: null, section: null, sessionId: null, checkpointObservationId: null }, communication: [],
  })
}

it('keeps pre-case campaign control active instead of completing an empty graph', () => {
  const preCase = createApplicationEngineState({
    caseId: '', objective: 'Find and handle graduate applications', status: 'ACTIVE', requirements: [],
    facts: [], observations: [], completedActionKeys: [], approvals: [],
    browser: { portal: null, section: null, sessionId: null, checkpointObservationId: null }, communication: [],
  })
  const step = planApplicationEngineStep(preCase)
  expect(step).toEqual({ kind: 'CONTROLLER', caseId: '', action: 'continue_application_controller' })
  expect(applicationEngineDirective(preCase, step)).toContain('continue_application_controller')
  expect(applicationEngineDirective(preCase, step)).not.toContain('"kind":"COMPLETE"')
})

it('selects one dependency-ready requirement and keeps planning deterministic', () => {
  const first = requirement({ id: 'first', type: 'deadline', requiredFactIds: [], evidenceContract: ['web'] })
  const second = requirement({ id: 'second', dependencyIds: ['first'] })
  const step = planApplicationEngineStep(state([second, first]), '2026-01-01T00:00:00Z')
  expect(step).toMatchObject({ kind: 'EXECUTE', requirementId: 'first', tier: 1 })
})

it('searches before asking for an unresolved applicant fact', () => {
  const unresolved = state()
  unresolved.facts[0] = { ...unresolved.facts[0]!, value: null, verification: 'UNRESOLVED' }
  expect(planApplicationEngineStep(unresolved)).toMatchObject({ kind: 'EXECUTE', action: 'search_verified_context', tier: 0 })
  unresolved.requirements[0]!.retry.attempts = 1
  expect(planApplicationEngineStep(unresolved)).toMatchObject({ kind: 'USER_HANDOFF', missingFactIds: ['profile:name'], tier: 5 })
})

it('keeps runnable application work moving when one requirement waits on the applicant', () => {
  const transcript = requirement({
    id: 'transcript',
    name: 'Official transcript',
    type: 'transcript',
    status: 'WAITING',
    waitingOn: 'user',
    blocker: 'Attach an official transcript.',
    requiredFactIds: [],
    evidenceContract: ['artifact'],
  })
  const cv = requirement({
    id: 'tailored-cv',
    name: 'Tailored CV',
    type: 'document',
    requiredFactIds: [],
    evidenceContract: ['artifact'],
  })
  const input = state([transcript, cv])
  const step = planApplicationEngineStep(input)
  expect(step).toMatchObject({ kind: 'EXECUTE', requirementId: 'tailored-cv' })
  const projection = projectApplicationWorkstreams(input, step)
  expect(projection.pendingInputs).toMatchObject([{ requirementId: 'transcript', kind: 'document' }])
  expect(projection.workstreams.find(item => item.requirementId === 'tailored-cv')).toMatchObject({ status: 'active' })
})

it('marks every dependency-ready lane active while preserving one deterministic current step', () => {
  const transcript = requirement({
    id: 'transcript',
    name: 'Official transcript',
    type: 'transcript',
    status: 'WAITING',
    waitingOn: 'user',
    blocker: 'Attach an official transcript.',
    requiredFactIds: [],
    evidenceContract: ['artifact'],
  })
  const cv = requirement({ id: 'cv', name: 'Tailored CV', type: 'document', requiredFactIds: [], evidenceContract: ['artifact'] })
  const essay = requirement({ id: 'essay', name: 'Statement of purpose', type: 'writer', requiredFactIds: [], evidenceContract: ['artifact'] })
  const input = state([transcript, essay, cv])
  const step = planApplicationEngineStep(input)
  const projection = projectApplicationWorkstreams(input, step)
  expect(step).toMatchObject({ requirementId: 'cv' })
  expect(projection.workstreams.filter(item => item.status === 'active').map(item => item.requirementId)).toEqual(['essay', 'cv'])
  expect(projection.workstreams.find(item => item.requirementId === 'essay')?.detail).toContain('briefing the writer')
})

it('keeps writer-owned work out of the applicant question queue', () => {
  const essay = requirement({
    id: 'essay', name: 'Essay: Explain your research interests.', type: 'writer', status: 'WAITING', waitingOn: 'user',
    exactInstructions: 'Explain your research interests in no more than 1,000 words.', requiredFactIds: [], evidenceContract: ['artifact'],
  })
  const projection = projectApplicationWorkstreams(state([essay]))
  expect(projection.pendingInputs).toEqual([])
  expect(projection.workstreams[0]).toMatchObject({ status: 'active', instructions: essay.exactInstructions })
})

it('does not ask for a programme-owned cycle or term even when its old status was user-waiting', () => {
  const cycle = requirement({
    id: 'cycle-term',
    name: 'Application cycle and start term',
    type: 'official_requirement',
    status: 'WAITING',
    waitingOn: 'user',
    source: {
      id: 'official-cycle',
      authority: 'official',
      missingValueOwner: 'programme',
      programmeValue: 'Fall 2027 entry',
    },
    requiredFactIds: [],
    evidenceContract: ['web'],
  })
  const projected = projectApplicationWorkstreams(state([cycle]))
  expect(projected.pendingInputs).toEqual([])
  expect(projected.workstreams.find(item => item.requirementId === 'cycle-term')).toMatchObject({ status: 'active' })
  expect(planApplicationEngineStep(state([cycle]))).toMatchObject({ kind: 'WAIT', requirementId: 'cycle-term' })
})

it('names the exact transcript artifact in the applicant control', () => {
  const transcript = requirement({
    id: 'transcript',
    name: 'Unofficial undergraduate transcript',
    type: 'transcript',
    status: 'WAITING',
    waitingOn: 'user',
    blocker: 'Attach the transcript.',
    requiredFactIds: [],
    evidenceContract: ['artifact'],
  })
  const projected = projectApplicationWorkstreams(state([transcript]))
  expect(projected.pendingInputs[0]).toMatchObject({
    requirementId: 'transcript',
    kind: 'document',
    question: expect.stringMatching(/transcript/i),
    options: [expect.objectContaining({ value: 'have_document' })],
  })
})

it('projects the full requirement graph into explicit execution states', () => {
  const satisfied = requirement({ id: 'satisfied', status: 'VERIFIED', evidenceIds: ['e-satisfied'], requiredFactIds: [] })
  const waitingUser = requirement({
    id: 'waiting-user', name: 'Official transcript', type: 'transcript', status: 'WAITING', waitingOn: 'user',
    blocker: 'Attach an official transcript.', requiredFactIds: [], evidenceContract: ['artifact'],
  })
  const runnable = requirement({ id: 'runnable', name: 'Tailored CV', type: 'document', requiredFactIds: [], evidenceContract: ['artifact'] })
  const blocked = requirement({ id: 'blocked', name: 'Application upload', dependencyIds: ['waiting-user'], requiredFactIds: [], evidenceContract: ['portal'] })
  const optional = requirement({ id: 'optional', required: false, requiredFactIds: [] })
  const states = projectApplicationRequirementStates(state([satisfied, waitingUser, runnable, blocked, optional]), {
    kind: 'CONTROLLER', caseId: 'case-1', action: 'continue_application_controller',
  })
  expect(states).toEqual(expect.arrayContaining([
    expect.objectContaining({ requirementId: 'satisfied', state: 'satisfied' }),
    expect.objectContaining({ requirementId: 'waiting-user', state: 'waiting_on_user' }),
    expect.objectContaining({ requirementId: 'runnable', state: 'runnable' }),
    expect.objectContaining({ requirementId: 'blocked', state: 'blocked_by_dependency', dependencyIds: ['waiting-user'] }),
    expect.objectContaining({ requirementId: 'optional', state: 'not_applicable' }),
  ]))
})

it('keeps post-admission requirements represented but out of active application work', () => {
  const futureTranscript = requirement({
    id: 'future-transcript',
    name: 'Official transcripts after admission',
    type: 'transcript',
    exactInstructions: 'If admitted, submit official transcripts before enrollment.',
    requiredFactIds: [],
  })
  const input = state([futureTranscript])
  expect(projectApplicationWorkstreams(input).workstreams).toEqual([])
  expect(projectApplicationRequirementStates(input)).toEqual([
    expect.objectContaining({ requirementId: 'future-transcript', state: 'not_applicable' }),
  ])
})

it('starts an attached-CV workstream before unrelated unresolved requirements', () => {
  const transcript = requirement({
    id: 'transcript',
    name: 'Official transcript',
    type: 'transcript',
    status: 'WAITING',
    waitingOn: 'user',
    blocker: 'Attach an official transcript.',
    requiredFactIds: [],
    evidenceContract: ['artifact'],
  })
  const cv = requirement({
    id: 'cv',
    name: 'Tailored CV',
    type: 'document',
    evidenceContract: ['artifact'],
  })
  const essay = requirement({
    id: 'essay',
    name: 'Statement of purpose',
    type: 'writer',
    evidenceContract: ['artifact'],
  })
  expect(planApplicationEngineStep(state([transcript, essay, cv]))).toMatchObject({ kind: 'EXECUTE', requirementId: 'cv' })
})

it('hands back only the user-held requirement after all independent work is done', () => {
  const transcript = requirement({
    id: 'transcript',
    name: 'Official transcript',
    type: 'transcript',
    status: 'WAITING',
    waitingOn: 'user',
    requiredFactIds: [],
    evidenceContract: ['artifact'],
  })
  const input = state([transcript])
  expect(planApplicationEngineStep(input)).toMatchObject({ kind: 'USER_HANDOFF', requirementId: 'transcript', tier: 5 })
})

it('makes a discovered supplemental question a first-class engine step', () => {
  const [question] = discoverApplicationQuestions({
    applicationCaseId: 'case-1',
    portal: 'benchmark.test',
    section: 'Research direction',
    fields: [{ name: 'research_interests', label: 'Research interests', prompt: 'Describe your research interests. Limit 150 words.', type: 'textarea', value: '', checked: false, required: true }],
  })
  const supplemental = requirement({
    id: 'supplemental-1',
    type: 'supplemental_question',
    name: 'Research interests supplemental question',
    requiredFactIds: [],
    source: { id: question!.questionKey, authority: 'provider' },
  })
  const input = state([supplemental])
  input.questions = [question!]
  expect(planApplicationEngineStep(input)).toMatchObject({ kind: 'SUPPLEMENTAL_QUESTION', action: 'resolve', questionId: question!.id })
  input.questions = [{ ...question!, status: 'awaiting_user' }]
  expect(planApplicationEngineStep(input)).toMatchObject({ kind: 'SUPPLEMENTAL_QUESTION', action: 'user_decision' })
})

it('gives David one typed semantic decision with minimal context', () => {
  const semantic = requirement({ type: 'eligibility', evidenceContract: ['web'] })
  const input = state([semantic])
  input.observations.push({ id: 'official-1', caseId: 'case-1', requirementId: 'req-1', kind: 'web', verified: true, evidenceIds: ['excerpt-1'], observedAt: new Date().toISOString(), sourceUrl: 'https://example.edu', authoritative: true, excerpts: [{ evidenceId: 'excerpt-1', text: 'Requirement' }] })
  const step = planApplicationEngineStep(input)
  expect(step.kind).toBe('SEMANTIC_DECISION')
  if (step.kind !== 'SEMANTIC_DECISION') return
  expect(step.request.function).toBe('evaluate_programme_eligibility')
  expect(step.request.verifiedFacts).toHaveLength(1)
  expect(validateSemanticDecision(input, step.request, { schemaVersion: 1, function: step.request.function, caseId: 'case-1', requirementId: 'req-1', decision: 'eligible', confidence: 'high', evidenceIds: ['excerpt-1'], factIds: ['profile:name'], rationale: 'The verified degree satisfies the official requirement.' })).toEqual({ valid: true, defects: [] })
})

it('researches a broad official-requirements node before asking for conflict resolution', () => {
  const officialRequirements = requirement({
    name: 'Stanford Physics PhD admissions requirements',
    type: 'official_requirement',
    requiredFactIds: [],
    evidenceContract: ['web'],
  })
  expect(planApplicationEngineStep(state([officialRequirements]))).toMatchObject({
    kind: 'EXECUTE',
    requirementId: 'req-1',
    action: 'execute_primitive',
  })
})

it('uses source-linked official evidence for bounded conflict resolution', () => {
  const officialRequirements = requirement({
    name: 'Conflicting official admissions requirements',
    type: 'official_requirement',
    requiredFactIds: [],
    evidenceContract: ['web'],
    source: { id: 'official-source', url: 'https://example.edu/requirements', authority: 'official' },
  })
  const input = state([officialRequirements])
  input.observations = [{
    id: 'official-source',
    caseId: input.caseId,
    requirementId: 'source-requirement',
    kind: 'web',
    verified: true,
    evidenceIds: ['official-excerpt'],
    observedAt: '2026-08-16T00:00:00Z',
    sourceUrl: 'https://example.edu/requirements',
    authoritative: true,
    excerpts: [{ evidenceId: 'official-excerpt', text: 'Controlled official requirement.' }],
  }]
  expect(planApplicationEngineStep(input)).toMatchObject({
    kind: 'SEMANTIC_DECISION',
    requirementId: 'req-1',
  })
})

it('routes verified synthetic referees to the procedural harness before semantic interpretation', () => {
  const referee = requirement({ id: 'referee-1', type: 'referee', name: 'Referee contact', requiredFactIds: [], evidenceContract: ['gmail'] })
  const input = state([referee])
  input.facts.push({
    factId: 'profile:referees[0]', value: 'Dr. Amina Bello', verification: 'VERIFIED',
    provenance: { kind: 'user_statement', sourceId: 'profile-1', confirmed: true }, confidence: 'high', conflict: false, candidates: [], reason: null,
  })
  expect(planApplicationEngineStep(input)).toMatchObject({ kind: 'EXECUTE', requirementId: 'referee-1', action: 'execute_with_harness', tier: 3 })
})

it('rejects semantic answers with wrong case, unsupported decisions, or evidence', () => {
  const semantic = requirement({ type: 'eligibility', evidenceContract: ['web'] })
  const input = state([semantic])
  const request = { ...planApplicationEngineStep(input) }
  expect(request.kind).toBe('SEMANTIC_DECISION')
  if (request.kind !== 'SEMANTIC_DECISION') return
  expect(validateSemanticDecision(input, request.request, { schemaVersion: 1, function: request.request.function, caseId: 'other', requirementId: 'req-1', decision: 'maybe', confidence: 'low', evidenceIds: ['invented'], factIds: ['invented'], rationale: '' }).defects).toEqual(expect.arrayContaining(['wrong_application_case', 'decision_not_allowed', 'evidence_invalid', 'fact_unverified', 'rationale_missing']))
})

it('does not complete a requirement without verified result-state evidence', () => {
  const input = state()
  const invalid: PortalObservation = { id: 'portal-1', caseId: 'case-1', requirementId: 'req-1', kind: 'portal', verified: true, evidenceIds: ['save-1'], observedAt: new Date().toISOString(), portal: 'graduate', section: 'identity', persistedValues: { name: 'Ada Doe' }, readBackValues: { name: 'Wrong' }, saveConfirmation: 'saved', sessionId: 's1' }
  expect(applyApplicationObservation(input, invalid, 3).requirements[0]!.status).toBe('UNRESOLVED')
  const valid = { ...invalid, readBackValues: { name: 'Ada Doe' } }
  expect(applyApplicationObservation(input, valid, 3).requirements[0]!.status).toBe('VERIFIED')
})

it('blocks requirements with no evidence contract instead of completing them vacuously', () => {
  const input = state([requirement({ evidenceContract: [], requiredFactIds: [] })])
  expect(planApplicationEngineStep(input)).toMatchObject({ kind: 'BLOCKED', reason: 'Requirement req-1 has no evidence contract.' })
  const observation: PortalObservation = { id: 'portal-1', caseId: 'case-1', requirementId: 'req-1', kind: 'portal', verified: true, evidenceIds: ['save-1'], observedAt: new Date().toISOString(), portal: 'graduate', section: 'identity', persistedValues: { name: 'Ada Doe' }, readBackValues: { name: 'Ada Doe' }, saveConfirmation: 'saved', sessionId: 's1' }
  expect(applyApplicationObservation(input, observation, 3).requirements[0]!.status).toBe('IN_PROGRESS')
})

it('preserves completed work across failure and promotes recovery to the harness', () => {
  const done = requirement({ id: 'done', status: 'VERIFIED', evidenceIds: ['e1'], requiredFactIds: [] })
  const pending = requirement({ id: 'pending' })
  const failed = recordApplicationFailure(state([done, pending]), 'pending', 'session_expired')
  expect(failed.requirements.find(item => item.id === 'done')?.status).toBe('VERIFIED')
  expect(planApplicationEngineStep(failed)).toMatchObject({ kind: 'EXECUTE', requirementId: 'pending', tier: 3, action: 'execute_with_harness' })
})

it('prevents duplicate consequential actions', () => {
  const first = claimApplicationAction(state(), 'submit:case-1')
  expect(first.claimed).toBe(true)
  expect(claimApplicationAction(first.state, 'submit:case-1').claimed).toBe(false)
})

it('verifies portal read-after-write and exact approved artifacts', () => {
  const portal: PortalObservation = { id: 'p1', caseId: 'case-1', requirementId: 'req-1', kind: 'portal', verified: true, evidenceIds: ['save'], observedAt: new Date().toISOString(), portal: 'graduate', section: 'documents', persistedValues: { name: 'Ada Doe' }, readBackValues: { name: 'Ada Doe' }, saveConfirmation: 'saved', sessionId: 's1' }
  const artifact: ArtifactObservation = { id: 'a1', caseId: 'case-1', requirementId: 'req-1', kind: 'artifact', verified: true, evidenceIds: ['upload'], observedAt: new Date().toISOString(), artifactId: 'cv-1', checksum: 'sha256', approved: true, sourceFactIds: ['profile:name'], portalConfirmation: 'present' }
  expect(verifyPortalExecutionContract({ caseId: 'case-1', requirementId: 'req-1', portal: 'graduate', section: 'documents', fields: [{ name: 'name', factId: 'profile:name', expectedValue: 'Ada Doe' }], artifacts: [{ artifactId: 'cv-1', checksum: 'sha256' }], successConditions: [], saveConditions: [], evidenceConditions: [] }, portal, state().facts, [artifact])).toBe(true)
})

it('treats calendar coordination as a first-class resulting-state requirement', () => {
  const calendarRequirement = requirement({ id: 'calendar-1', type: 'calendar', name: 'Schedule supervisor interview', evidenceContract: ['calendar'], requiredFactIds: [] })
  const input = state([calendarRequirement])
  expect(planApplicationEngineStep(input)).toMatchObject({ kind: 'EXECUTE', action: 'execute_primitive', evidenceContract: ['calendar'] })
  const observation: CalendarObservation = { id: 'event-1', caseId: 'case-1', requirementId: 'calendar-1', kind: 'calendar', verified: true, evidenceIds: ['google:event-1'], observedAt: new Date().toISOString(), providerEventId: 'google-event-1', expectedAttendees: ['professor@example.edu'], actualAttendees: ['professor@example.edu'] }
  const completed = applyApplicationObservation(input, observation, 1)
  expect(completed.requirements[0]!.status).toBe('VERIFIED')
})

it('commits a VERIFY step only after the evidence contract is rechecked', () => {
  const verifyNode = requirement({ id: 'verify-1', type: 'deadline', name: 'Verify official deadline', evidenceContract: ['web'], requiredFactIds: [] })
  const input = state([verifyNode])
  const observation: WebObservation = { id: 'web-verify-1', caseId: 'case-1', requirementId: 'verify-1', kind: 'web', verified: true, evidenceIds: ['official:deadline'], observedAt: new Date().toISOString(), sourceUrl: 'https://official.example.edu', authoritative: true, excerpts: [{ evidenceId: 'official:deadline', text: 'Deadline verified.' }] }
  const applied = applyApplicationObservation(input, observation, 0)
  const withEvidence = { ...applied, requirements: applied.requirements.map(item => item.id === 'verify-1' ? { ...item, status: 'IN_PROGRESS' as const } : item) }
  expect(planApplicationEngineStep(withEvidence)).toMatchObject({ kind: 'VERIFY', requirementId: 'verify-1' })
  expect(verifyApplicationRequirement(withEvidence, 'verify-1').requirements[0]?.status).toBe('VERIFIED')
})
