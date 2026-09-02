import { describe, expect, it } from 'vitest'
import {
  applyApplicationPlanNodeOutcome,
  applyFacultyResearchToOrchestration,
  buildAdmissionStrategy,
  buildApplicationExecutionPlan,
  buildFacultyOutreachDossiers,
  classifyGraduateApplicationPathway,
  compileApplicationRequirementsToPlanNodes,
  projectApplicationOrchestrationWorkstreams,
  replanApplicationExecutionPlan,
  resolveFacultyContactPolicy,
  runnableApplicationPlanNodes,
  runnableApplicationPlanBatches,
  type OrchestrationSourceEvidence,
} from './application-orchestration.ts'

function evidence(excerpts: string[]): OrchestrationSourceEvidence[] {
  return excerpts.map((excerpt, index) => ({
    id: `source-${index + 1}`,
    url: `https://physics.example.edu/source-${index + 1}`,
    excerpt,
    authority: 'official',
  }))
}

function strategyFor(pathway: ReturnType<typeof classifyGraduateApplicationPathway>, requirements = []) {
  return buildAdmissionStrategy({
    applicationCaseId: 'case-1',
    objective: 'Help me apply for Physics PhD',
    institution: 'Example University',
    programmeTitle: 'Physics PhD',
    pathway,
    researchAreas: ['quantum control', 'quantum information'],
    methods: ['simulation', 'machine learning'],
    applicantSignals: [{ id: 'cv:research-1', signal: 'Research in quantum control' }],
    requirements,
  })
}

describe('graduate application orchestration', () => {
  it('classifies a committee programme without inventing a supervisor requirement', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'Applications are reviewed by the departmental admissions committee.',
      'Submit the application through the central graduate admissions portal.',
      'Please do not contact faculty before applying.',
      'No supervisor approval is required before applying.',
      'Three academic letters of recommendation are submitted through portal invitations.',
    ]) })
    expect(pathway.admissionModel).toBe('central_committee')
    expect(pathway.applicationRoute).toBe('central_portal')
    expect(pathway.facultyContactPolicy).toBe('prohibited')
    expect(pathway.supervisorApprovalBeforeApplication).toBe('not_required')
    expect(pathway.recommendationModel).toMatchObject({ count: 3, academicRequired: true, submissionMethod: 'portal_invitation' })
  })

  it('keeps downstream application work closed when the pathway has no official evidence', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: [] })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
    })
    expect(plan.currentlyRunnable).toContain('pathway:classification')
    expect(plan.currentlyRunnable).not.toContain('cv')
    expect(plan.currentlyRunnable).not.toContain('portal:inspect')
  })

  it('makes supervisor-first outreach critical and keeps it evidence-backed', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'Applicants must identify a supervisor and obtain agreement before submitting the application.',
      'After supervisor approval, apply through the department portal.',
      'A research proposal is required.',
      'Funding depends on the principal investigator and the advertised project.',
    ]) })
    expect(pathway.admissionModel).toBe('supervisor_first')
    expect(pathway.facultyContactPolicy).toBe('required')
    expect(pathway.supervisorApprovalBeforeApplication).toBe('required')
    expect(pathway.researchProposalPolicy).toBe('required')
    expect(pathway.fundingModel).toBe('pi_funded')

    const strategy = strategyFor(pathway, [{ id: 'proposal', name: 'Research proposal', type: 'research_proposal', required: true }])
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Help me apply for Physics PhD', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [{ id: 'proposal', name: 'Research proposal', type: 'research_proposal', required: true }],
    })
    expect(plan.nodes.find(node => node.id === 'faculty:outreach:send')).toMatchObject({ kind: 'required', executionMode: 'approval_required' })
    expect(plan.nodes.find(node => node.id === 'faculty:outreach:send')?.dependencies).toEqual(expect.arrayContaining(['faculty:outreach:draft', 'cv']))
    expect(plan.nodes.find(node => node.id === 'requirement:proposal')).toMatchObject({ type: 'proposal', kind: 'required' })
  })

  it('does not create cold-email work for a programme that discourages contact', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'The programme is centrally admitted by the committee.',
      'Applicants should not contact faculty about admission before applying.',
      'A statement of purpose is required.',
    ]) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [{ id: 'statement', name: 'Statement of purpose', type: 'writer', required: true }],
    })
    expect(plan.nodes.some(node => node.type === 'faculty_outreach')).toBe(false)
    expect(plan.nodes.some(node => node.type === 'faculty_intelligence')).toBe(true)

    const optionalPathway = classifyGraduateApplicationPathway({ evidence: evidence(['Contacting faculty is optional.']) })
    const optionalPlan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway: optionalPathway, strategy: strategyFor(optionalPathway),
    })
    expect(optionalPlan.nodes.some(node => node.type === 'faculty_outreach')).toBe(false)
  })

  it('distinguishes a clean neutral search from insufficient evidence and explicit discouragement', () => {
    const neutral = classifyGraduateApplicationPathway({ evidence: evidence([
      'The department describes its Physics PhD admissions process and application portal.',
      'Faculty Requests are considered when applicants identify a research area of interest.',
    ]) })
    expect(neutral.facultyContactPolicy).toBe('allowed_or_neutral')
    expect(neutral.facultyContactPolicyDetails).toMatchObject({ explicitRuleFound: false })

    const unknown = classifyGraduateApplicationPathway({ evidence: [] })
    expect(unknown.facultyContactPolicy).toBe('unknown_due_to_insufficient_evidence')

    const discouraged = classifyGraduateApplicationPathway({ evidence: evidence([
      'Contacting faculty before applying is discouraged.',
    ]) })
    expect(discouraged.facultyContactPolicy).toBe('discouraged')

    const prohibited = classifyGraduateApplicationPathway({ evidence: evidence([
      'Applicants may not contact faculty before applying.',
    ]) })
    expect(prohibited.facultyContactPolicy).toBe('prohibited')

    const recommended = classifyGraduateApplicationPathway({ evidence: evidence([
      'Faculty contact is recommended for applicants with a defined research direction.',
    ]) })
    expect(recommended.facultyContactPolicy).toBe('recommended')
  })

  it('does not mistake recommendation-letter requirements for faculty outreach guidance', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'The application requires three recommendation letters and describes a faculty-recommender condition.',
      'Applications are submitted through the central graduate admissions portal.',
    ]) })
    expect(pathway.facultyContactPolicy).toBe('allowed_or_neutral')
    expect(pathway.facultyContactPolicyDetails).toMatchObject({ explicitRuleFound: false })
  })

  it('keeps retrieval failures unknown instead of treating an error page as neutral', () => {
    const policy = resolveFacultyContactPolicy({ sources: evidence(['The official programme page could not be retrieved because the request timed out.']) })
    expect(policy.classification).toBe('unknown_due_to_insufficient_evidence')
  })

  it('keeps independent work runnable while transcript work waits', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'Applications are reviewed by the admissions committee.',
      'Submit through the department portal.',
      'A CV and statement are required.',
    ]) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [
        { id: 'transcript', name: 'Official transcript', type: 'transcript', required: true, status: 'awaiting_user', exactInstructions: 'Attach an official transcript.' },
        { id: 'statement', name: 'Statement of purpose', type: 'writer', required: true },
      ],
    })
    const runnable = runnableApplicationPlanNodes(plan).map(node => node.id)
    expect(runnable).toContain('cv')
    expect(runnable).toContain('requirement:statement')
    expect(runnable).not.toContain('requirement:transcript')
    expect(plan.userBlocked).toContain('requirement:transcript')
    expect(projectApplicationOrchestrationWorkstreams(plan, 5)).toHaveLength(5)
  })

  it('does not mistake official rule evidence for an applicant artifact', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'Applications are reviewed by the admissions committee.',
      'The application deadline is December 1.',
    ]) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [
        { id: 'deadline', name: 'Application deadline', type: 'deadline', required: true, status: 'verified', evidenceIds: ['official-deadline'] },
        { id: 'transcript', name: 'Official transcript', type: 'transcript', required: true, status: 'verified', evidenceIds: ['official-transcript-rule'] },
        { id: 'cv', name: 'CV', type: 'document', required: true, status: 'verified', evidenceIds: ['cv-checksum'], linkedArtifactId: 'artifact:cv' },
      ],
    })
    expect(plan.nodes.find(node => node.id === 'requirement:deadline')).toMatchObject({ status: 'completed' })
    expect(plan.nodes.find(node => node.id === 'requirement:transcript')).toMatchObject({ status: 'ready' })
    expect(plan.nodes.find(node => node.id === 'requirement:cv')).toMatchObject({ status: 'completed' })
  })

  it('keeps an electronic-submission rule in the portal lane instead of a user wait', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'Applications are reviewed by the admissions committee.',
      'Submit all application materials electronically through the central portal.',
    ]) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [{ id: 'submission-method', name: 'Application materials submitted electronically', type: 'official_requirement', required: true, status: 'awaiting_user' }],
    })
    expect(plan.nodes.find(node => node.id === 'requirement:submission-method')).toMatchObject({ status: 'ready', executionMode: 'autonomous' })
    expect(plan.userBlocked).not.toContain('requirement:submission-method')
    expect(projectApplicationOrchestrationWorkstreams(plan).some(item => item.title === 'Application materials submitted electronically')).toBe(false)
  })

  it('repairs a stale programme-owned wait into autonomous runnable work', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence(['Applications are reviewed by the admissions committee.']) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [{
        id: 'cycle-term', name: 'Application cycle and start term', type: 'official_requirement', required: true,
        status: 'awaiting_user', missingValueOwner: 'programme', programmeValue: 'Fall 2027 entry',
      }],
    })
    const node = plan.nodes.find(item => item.id === 'requirement:cycle-term')!
    expect(node).toMatchObject({ status: 'ready', executionMode: 'autonomous', missingValueOwner: 'programme', programmeValue: 'Fall 2027 entry' })
    expect(plan.userBlocked).not.toContain(node.id)
    expect(plan.currentlyRunnable).toContain(node.id)
    expect(projectApplicationOrchestrationWorkstreams(plan).find(item => item.title === 'Application cycle and start term')).toMatchObject({ status: 'active' })
  })

  it('uses the requirement worker owner when compiling a narrative lane', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence(['Applications are reviewed by the admissions committee.']) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [{
        id: 'statement', name: 'Statement of purpose', type: 'writer', required: true,
        status: 'awaiting_user', responsible: 'writer',
        exactInstructions: 'Prepare the statement from verified application evidence.',
      }],
    })
    expect(plan.nodes.find(node => node.id === 'requirement:statement')).toMatchObject({
      owner: 'writer', executionMode: 'autonomous', status: 'ready', missingValueOwner: 'programme',
    })
    expect(plan.userBlocked).not.toContain('requirement:statement')
  })

  it('keeps post-admission requirements out of active work and waits for missing required files', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence(['Applications are reviewed by the admissions committee.']) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [
        { id: 'later-transcript', name: 'Official transcript after admission', type: 'transcript', required: true, exactInstructions: 'Submit after admission.' },
        { id: 'missing-transcript', name: 'Unofficial transcript', type: 'transcript', required: true, status: 'unresolved', applicantState: 'missing', exactInstructions: 'Attach your unofficial transcript.' },
      ],
    })
    expect(plan.nodes.find(node => node.id === 'requirement:later-transcript')).toMatchObject({ status: 'skipped' })
    expect(plan.nodes.find(node => node.id === 'requirement:missing-transcript')).toMatchObject({ status: 'waiting' })
    expect(projectApplicationOrchestrationWorkstreams(plan).some(item => item.title.includes('after admission'))).toBe(false)
  })

  it('derives conditional recommendation, proposal, and funding work when the formal map is sparse', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'Applicants must identify a supervisor and obtain agreement before submitting the application.',
      'A research proposal is required.',
      'Funding depends on the principal investigator and the advertised project.',
      'Three academic letters are submitted through portal invitations.',
    ]) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({ applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy })
    expect(plan.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'conditional:proposal', kind: 'required', type: 'proposal' }),
      expect.objectContaining({ id: 'conditional:recommendations', kind: 'required', type: 'recommendation' }),
      expect.objectContaining({ id: 'conditional:funding', kind: 'required', type: 'funding' }),
    ]))
  })

  it('replans only for material events and preserves completed work', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence(['Submit through the department portal.']) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({ applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy })
    const completed = { ...plan.nodes.find(node => node.id === 'cv')!, status: 'completed' as const, evidenceIds: ['cv-artifact'] }
    const withCompleted = { ...plan, nodes: plan.nodes.map(node => node.id === completed.id ? completed : node) }
    expect(replanApplicationExecutionPlan({ plan: withCompleted, pathway, strategy, programmeTitle: 'Physics PhD', event: 'minor_progress_update' })).toBe(withCompleted)
    const revised = replanApplicationExecutionPlan({ plan: withCompleted, pathway, strategy, programmeTitle: 'Physics PhD', event: 'professor_replied' })
    expect(revised.revision).toBe(withCompleted.revision + 1)
    expect(revised.nodes.find(node => node.id === 'cv')).toMatchObject({ status: 'completed', evidenceIds: ['cv-artifact'] })
  })

  it('ranks faculty from verified applicant overlap and suppresses outreach when policy forbids it', () => {
    const candidates = [{
      id: 'faculty:1', institution: 'Example University', name: 'Dr. Ada Example', officialProfileUrl: 'https://physics.example.edu/ada',
      researchAreas: ['quantum control', 'optics'], currentlyActive: true, sourceEvidence: evidence(['Ada studies quantum control.']),
    }]
    const allowed = classifyGraduateApplicationPathway({ evidence: evidence(['Contacting potential supervisors is strongly recommended.']) })
    const ranked = buildFacultyOutreachDossiers({ pathway: allowed, candidates, applicantSignals: [{ id: 'cv:1', signal: 'quantum control experiment' }] })
    expect(ranked[0]).toMatchObject({ facultyId: 'faculty:1', outreachRecommendation: 'strongly_recommended', emailVerification: 'missing' })
    const discouraged = classifyGraduateApplicationPathway({ evidence: evidence(['Please do not contact faculty before applying.']) })
    expect(buildFacultyOutreachDossiers({ pathway: discouraged, candidates, applicantSignals: [{ id: 'cv:1', signal: 'quantum control experiment' }] })[0]?.outreachRecommendation).toBe('prohibited')
  })

  it('unlocks only faculty dependants when deep research completes', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence(['Applicants must identify a supervisor before applying.']) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({ applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy })
    const snapshot = {
      version: 'graduate-application-orchestration@1' as const,
      evidenceVersion: 1,
      pathway,
      strategy,
      plan,
      facultyCandidates: [],
      facultyDossiers: [],
      materialEvents: [],
      updatedAt: new Date().toISOString(),
    }
    const completed = applyFacultyResearchToOrchestration({ snapshot, dossiers: [], evidenceIds: ['faculty-source'] })
    expect(completed.plan.nodes.find(node => node.id === 'faculty:intelligence')).toMatchObject({ status: 'completed', evidenceIds: ['faculty-source'] })
    expect(completed.plan.currentlyRunnable).toContain('cv')
    expect(completed.plan.currentlyRunnable).toContain('faculty:outreach:draft')
  })

  it('adds the outreach lane when one faculty pass repairs an initially unknown policy', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'The department describes its Physics PhD admissions process and application portal.',
    ]) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
    })
    const snapshot = {
      version: 'graduate-application-orchestration@1' as const,
      evidenceVersion: 1,
      pathway: { ...classifyGraduateApplicationPathway({ evidence: [] }), facultyContactPolicy: 'unknown_due_to_insufficient_evidence' as const },
      strategy,
      plan: { ...plan, nodes: plan.nodes.filter(node => !node.id.startsWith('faculty:outreach:')) },
      facultyCandidates: [],
      facultyDossiers: [],
      materialEvents: [],
      updatedAt: new Date().toISOString(),
    }
    const dossiers = buildFacultyOutreachDossiers({
      pathway,
      candidates: [{
        id: 'faculty:1', institution: 'Example University', name: 'Dr. Ada Example', officialProfileUrl: 'https://physics.example.edu/ada',
        researchAreas: ['quantum control', 'quantum information', 'optics'], currentlyActive: true,
        sourceEvidence: evidence(['Ada studies quantum control and quantum information.']),
      }],
      applicantSignals: [{ id: 'cv:1', signal: 'quantum control and quantum information experiment' }],
    })
    const repaired = applyFacultyResearchToOrchestration({
      snapshot,
      dossiers,
      evidenceIds: ['faculty-source'],
      pathway,
    })
    expect(repaired.plan.nodes.find(node => node.id === 'faculty:outreach:draft')).toMatchObject({ kind: 'recommended', status: 'ready' })
    expect(repaired.plan.nodes.find(node => node.id === 'faculty:outreach:send')?.dependencies).toEqual(expect.arrayContaining(['faculty:outreach:draft', 'cv']))
  })

  it('records a node wait without freezing independent work, then unlocks dependants on completion', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence(['Applications are reviewed by the admissions committee.']) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [{ id: 'transcript', name: 'Transcript', type: 'transcript', required: true }],
    })
    const snapshot = {
      version: 'graduate-application-orchestration@1' as const,
      evidenceVersion: 1,
      pathway,
      strategy,
      plan,
      facultyCandidates: [],
      facultyDossiers: [],
      materialEvents: [],
      updatedAt: new Date().toISOString(),
    }
    const waiting = applyApplicationPlanNodeOutcome({ snapshot, nodeIds: ['requirement:transcript'], outcome: { status: 'waiting', waitingForUser: true, blockingReason: 'Attach the transcript.' } })
    expect(waiting.plan.userBlocked).toContain('requirement:transcript')
    expect(waiting.plan.currentlyRunnable).toContain('cv')
    const completed = applyApplicationPlanNodeOutcome({ snapshot: waiting, nodeIds: ['requirement:transcript'], outcome: { status: 'completed', evidenceIds: ['transcript:evidence'] } })
    expect(completed.plan.nodes.find(node => node.id === 'requirement:transcript')).toMatchObject({ status: 'completed', evidenceIds: ['transcript:evidence'] })
    expect(completed.plan.userBlocked).not.toContain('requirement:transcript')
  })

  it('exposes dependency-ready lanes as bounded parallel batches and prioritizes an imminent deadline', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'Applications are reviewed by the admissions committee.',
      'Submit through the department portal.',
      'Three academic letters are submitted through portal invitations.',
    ]) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      deadline: '2026-08-30T23:59:00Z',
      now: '2026-08-23T00:00:00Z',
      requirements: [
        { id: 'transcript', name: 'Official transcript', type: 'transcript', required: true, status: 'awaiting_user' },
        { id: 'statement', name: 'Statement of purpose', type: 'writer', required: true },
      ],
    })
    const batches = runnableApplicationPlanBatches(plan)
    expect(batches.length).toBeGreaterThan(0)
    expect(batches.flatMap(batch => batch.nodeIds)).toEqual(expect.arrayContaining(['cv', 'portal:inspect', 'requirement:statement']))
    expect(plan.criticalPath).toContain('readiness')
    expect(plan.nodes.find(node => node.id === 'cv')?.deadline).toBe('2026-08-30T23:59:00Z')
    expect(plan.userBlocked).toContain('requirement:transcript')
  })

  it('keeps every ready node in the execution graph while showing only five workstreams', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence([
      'Applications are reviewed by the admissions committee.',
      'Submit through the department portal.',
    ]) })
    const strategy = strategyFor(pathway)
    const requirements = Array.from({ length: 9 }, (_, index) => ({
      id: `independent-${index + 1}`,
      name: `Independent application fee check ${index + 1}`,
      type: 'fee' as const,
      required: true,
    }))
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy, requirements,
    })
    const runnable = runnableApplicationPlanNodes(plan)
    expect(runnable.length).toBeGreaterThan(5)
    expect(plan.currentlyRunnable.length).toBe(runnable.length)
    expect(runnableApplicationPlanBatches(plan).flatMap(batch => batch.nodeIds).length).toBe(runnable.length)
    expect(projectApplicationOrchestrationWorkstreams(plan, 5)).toHaveLength(5)
    expect(projectApplicationOrchestrationWorkstreams(plan).length).toBeGreaterThan(5)
  })

  it('marks optional and explicitly not-applicable requirements as durable no-ops', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence(['Applications are reviewed by the admissions committee.']) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [
        { id: 'optional-sample', name: 'Writing sample', type: 'document', required: false, requiredLevel: 'optional' },
        { id: 'not-applicable', name: 'Post-admission credential evaluation', type: 'credential_evaluation', required: true, applicantState: 'not_applicable' },
      ],
    })
    expect(plan.nodes.find(node => node.id === 'requirement:optional-sample')).toMatchObject({ status: 'skipped' })
    expect(plan.nodes.find(node => node.id === 'requirement:not-applicable')).toMatchObject({ status: 'skipped' })
    expect(projectApplicationOrchestrationWorkstreams(plan).map(item => item.title)).not.toEqual(expect.arrayContaining(['Writing sample', 'Post-admission credential evaluation']))
  })

  it('compiles a canonical requirement into a separate plan identity and preserves cardinality', () => {
    const requirementId = '10ffe014-8925-4153-ba16-e5604c5c3599'
    const nodes = compileApplicationRequirementsToPlanNodes({
      applicationCaseId: '243b76a5-5b25-4f4f-bb06-e9930705d9ec',
      strategyId: 'strategy:case-1',
      requirements: [{
        id: requirementId,
        name: 'Recommendation letters',
        type: 'recommendation',
        required: true,
        cardinality: { exact: 3 },
      }],
    })
    expect(nodes[0]).toMatchObject({
      id: `requirement:${requirementId}`,
      requirementId,
      requirementCardinality: { exact: 3 },
    })
    expect(nodes[0].id).not.toBe(nodes[0].requirementId)
  })

  it('opens a circuit after repeated identical deterministic failures', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence(['Applications are reviewed by the admissions committee.']) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [{ id: 'transcript', name: 'Transcript', type: 'transcript', required: true }],
    })
    const snapshot = {
      version: 'graduate-application-orchestration@1' as const,
      evidenceVersion: 1,
      pathway,
      strategy,
      plan,
      facultyCandidates: [],
      facultyDossiers: [],
      materialEvents: [],
      updatedAt: new Date().toISOString(),
    }
    const first = applyApplicationPlanNodeOutcome({ snapshot, nodeIds: ['requirement:transcript'], outcome: { status: 'failed', failure: 'invalid_requirement_identity' } })
    const second = applyApplicationPlanNodeOutcome({ snapshot: first, nodeIds: ['requirement:transcript'], outcome: { status: 'failed', failure: 'invalid_requirement_identity' } })
    const third = applyApplicationPlanNodeOutcome({ snapshot: second, nodeIds: ['requirement:transcript'], outcome: { status: 'failed', failure: 'invalid_requirement_identity' } })
    const node = third.plan.nodes.find(item => item.id === 'requirement:transcript')!
    expect(node.status).toBe('failed')
    expect(node.retryState).toMatchObject({ attempts: 3, circuitOpen: true })
    expect(node.blockingReason).toContain('identical failures')
  })

  it('keeps a circuit-open lane failed when a material event replans the graph', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: evidence(['Applications are reviewed by the admissions committee.']) })
    const strategy = strategyFor(pathway)
    const plan = buildApplicationExecutionPlan({
      applicationCaseId: 'case-1', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy,
      requirements: [{ id: 'cv', name: 'CV', type: 'document', required: true }],
    })
    const snapshot = {
      version: 'graduate-application-orchestration@1' as const,
      evidenceVersion: 1,
      pathway,
      strategy,
      plan,
      facultyCandidates: [],
      facultyDossiers: [],
      materialEvents: [],
      updatedAt: new Date().toISOString(),
    }
    let failed = snapshot
    for (let attempt = 0; attempt < 3; attempt += 1) {
      failed = applyApplicationPlanNodeOutcome({
        snapshot: failed,
        nodeIds: ['cv'],
        outcome: { status: 'failed', failure: 'invalid_cv_layout' },
      })
    }
    const replanned = replanApplicationExecutionPlan({
      plan: failed.plan,
      pathway,
      strategy,
      programmeTitle: 'Physics PhD',
      requirements: [{ id: 'cv', name: 'CV', type: 'document', required: true }],
      event: 'official_requirement_changed',
    })
    expect(replanned.nodes.find(node => node.id === 'cv')).toMatchObject({
      status: 'failed',
      retryState: { attempts: 3, circuitOpen: true },
    })
    expect(replanned.currentlyRunnable).not.toContain('cv')
  })
})
