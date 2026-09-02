import { describe, expect, it } from 'vitest'
import {
  buildAdmissionStrategy,
  buildApplicationExecutionPlan,
  buildFacultyOutreachDossiers,
  classifyGraduateApplicationPathway,
  projectApplicationOrchestrationWorkstreams,
  runnableApplicationPlanBatches,
  type ApplicationExecutionPlan,
  type FacultyOutreachDossier,
  type GraduateApplicationPathway,
  type OrchestrationSourceEvidence,
  type ProgrammeFacultyCandidate,
} from '../../supabase/functions/_shared/application-orchestration'

const HARVARD_PHYSICS_FIXTURE_NOW = '2026-08-23T00:00:00.000Z'

const harvardPhysicsSources: OrchestrationSourceEvidence[] = [
  {
    id: 'harvard-physics:admissions-route',
    url: 'https://physics.harvard.edu/graduate/admissions',
    excerpt: 'Applications are reviewed by the departmental admissions committee and submitted through the Harvard Griffin GSAS application portal.',
    authority: 'official',
  },
  {
    id: 'harvard-physics:faculty-contact',
    url: 'https://physics.harvard.edu/graduate/admissions',
    excerpt: 'Applicants should not contact faculty about admission before applying; no prior supervisor approval is required.',
    authority: 'official',
  },
  {
    id: 'harvard-physics:recommendations',
    url: 'https://gsas.harvard.edu/programs-of-study/physics',
    excerpt: 'Three academic letters of recommendation are required and recommenders receive invitations through the application portal.',
    authority: 'official',
  },
  {
    id: 'harvard-physics:writing',
    url: 'https://physics.harvard.edu/graduate/admissions',
    excerpt: 'A statement of purpose is required. A separate research proposal is not required.',
    authority: 'official',
  },
  {
    id: 'harvard-physics:funding',
    url: 'https://physics.harvard.edu/graduate/financial-support',
    excerpt: 'Admitted Physics PhD students receive programme funding under the department’s stated support policy.',
    authority: 'official',
  },
]

const harvardPhysicsFaculty: ProgrammeFacultyCandidate[] = [{
  id: 'harvard-physics:faculty:quantum-control',
  institution: 'Harvard University',
  programmeId: 'harvard-physics-phd',
  name: 'Dr. Example Faculty',
  title: 'Professor of Physics',
  department: 'Physics',
  officialProfileUrl: 'https://physics.harvard.edu/people/example-faculty',
  labUrl: 'https://physics.harvard.edu/research/quantum',
  researchAreas: ['quantum control', 'quantum information', 'optical physics'],
  researchSummary: 'Research in quantum control and optical physics.',
  publicEmail: null,
  emailSourceUrl: null,
  currentlyActive: true,
  acceptsStudents: 'unknown',
  sourceEvidence: [harvardPhysicsSources[0]!],
}]

export type HarvardPhysicsOrchestrationTrace = {
  query: string
  selectedProgramme: string
  stages: string[]
  pathway: Pick<GraduateApplicationPathway, 'admissionModel' | 'applicationRoute' | 'facultyContactPolicy' | 'supervisorApprovalBeforeApplication' | 'researchProposalPolicy' | 'fundingModel'>
  parallelRunnableNodes: string[]
  parallelBatches: Array<{ parallelGroup: string; nodeIds: string[] }>
  userBlockedNodes: string[]
  facultyOutreach: {
    created: boolean
    recommendation: FacultyOutreachDossier['outreachRecommendation']
    reason: string
  }
  visibleWorkstreams: string[]
  plan: ApplicationExecutionPlan
}

/**
 * A deterministic fixture for the post-selection path. The source excerpts
 * are intentionally controlled test evidence; production runs replace them
 * with the current official programme evidence captured by discovery.
 */
export function buildHarvardPhysicsOrchestrationTrace(): HarvardPhysicsOrchestrationTrace {
  const pathway = classifyGraduateApplicationPathway({ evidence: harvardPhysicsSources, now: HARVARD_PHYSICS_FIXTURE_NOW })
  const applicantSignals = [
    { id: 'cv:research:quantum-control', signal: 'Research in quantum control and quantum information', evidence: 'Attached CV: quantum-control research project.' },
    { id: 'cv:methods:simulation', signal: 'Numerical simulation and machine learning methods', evidence: 'Attached CV: simulation and machine-learning work.' },
  ]
  const facultyDossiers = buildFacultyOutreachDossiers({
    pathway,
    candidates: harvardPhysicsFaculty,
    applicantSignals,
    now: HARVARD_PHYSICS_FIXTURE_NOW,
  })
  const strategy = buildAdmissionStrategy({
    applicationCaseId: 'case:harvard-physics',
    objective: 'Help me apply to Harvard Physics PhD',
    institution: 'Harvard University',
    programmeTitle: 'Physics PhD',
    pathway,
    researchAreas: ['quantum control', 'quantum information', 'optical physics'],
    methods: ['numerical simulation', 'machine learning'],
    applicantSignals,
    facultyCandidates: harvardPhysicsFaculty,
    requirements: [
      { id: 'cv', name: 'CV', type: 'document', required: true },
      { id: 'statement', name: 'Statement of purpose', type: 'writer', required: true },
      { id: 'transcript', name: 'Official transcript', type: 'transcript', required: true, status: 'awaiting_user', exactInstructions: 'Attach an official transcript.' },
    ],
    now: HARVARD_PHYSICS_FIXTURE_NOW,
  })
  const plan = buildApplicationExecutionPlan({
    applicationCaseId: 'case:harvard-physics',
    objective: 'Help me apply to Harvard Physics PhD',
    programmeTitle: 'Physics PhD',
    pathway,
    strategy,
    requirements: [
      { id: 'cv', name: 'CV', type: 'document', required: true },
      { id: 'statement', name: 'Statement of purpose', type: 'writer', required: true },
      { id: 'transcript', name: 'Official transcript', type: 'transcript', required: true, status: 'awaiting_user', exactInstructions: 'Attach an official transcript.' },
    ],
    facultyCandidates: harvardPhysicsFaculty,
    deadline: '2026-12-01T23:59:00.000Z',
    now: HARVARD_PHYSICS_FIXTURE_NOW,
  })
  const batches = runnableApplicationPlanBatches(plan)
  const faculty = facultyDossiers[0]!
  return {
    query: 'Help me apply to Harvard Physics PhD',
    selectedProgramme: 'Physics',
    stages: [
      'programme selection',
      'bind programme to the original task',
      'application case creation/recovery',
      'official requirements refresh',
      'pathway classification',
      'faculty intelligence',
      'shared admission strategy',
      'dependency-aware plan',
      'parallel runnable work',
      'CV tailoring',
      'statement preparation',
      'recommendation analysis',
      'transcript/test verification',
      'early portal inspection',
      'deterministic readiness',
    ],
    pathway: {
      admissionModel: pathway.admissionModel,
      applicationRoute: pathway.applicationRoute,
      facultyContactPolicy: pathway.facultyContactPolicy,
      supervisorApprovalBeforeApplication: pathway.supervisorApprovalBeforeApplication,
      researchProposalPolicy: pathway.researchProposalPolicy,
      fundingModel: pathway.fundingModel,
    },
    parallelRunnableNodes: plan.currentlyRunnable,
    parallelBatches: batches.map(batch => ({ parallelGroup: batch.parallelGroup, nodeIds: batch.nodeIds })),
    userBlockedNodes: plan.userBlocked,
    facultyOutreach: {
      created: plan.nodes.some(node => node.type === 'faculty_outreach'),
      recommendation: faculty.outreachRecommendation,
      reason: faculty.outreachReason,
    },
    visibleWorkstreams: projectApplicationOrchestrationWorkstreams(plan, 5).map(workstream => workstream.title),
    plan,
  }
}

describe('David graduate-application orchestration benchmark', () => {
  it('runs the Harvard Physics fixture from selection into parallel, pathway-aware preparation', () => {
    const trace = buildHarvardPhysicsOrchestrationTrace()
    expect(trace.query).toBe('Help me apply to Harvard Physics PhD')
    expect(trace.selectedProgramme).toBe('Physics')
    expect(trace.stages).toContain('parallel runnable work')
    expect(trace.pathway).toMatchObject({
      admissionModel: 'central_committee',
      applicationRoute: 'central_portal',
      facultyContactPolicy: 'allowed_or_neutral',
      supervisorApprovalBeforeApplication: 'not_required',
      researchProposalPolicy: 'not_required',
      fundingModel: 'programme_funded',
    })
    expect(trace.parallelRunnableNodes).toEqual(expect.arrayContaining(['cv', 'portal:inspect', 'requirement:statement', 'faculty:intelligence']))
    expect(trace.userBlockedNodes).toContain('requirement:transcript')
    expect(trace.facultyOutreach).toMatchObject({ created: true, recommendation: 'optional' })
    expect(trace.facultyOutreach.reason).toMatch(/optional/i)
    expect(trace.visibleWorkstreams).toHaveLength(5)
  })

  it('keeps the same planner conditional for a supervisor-first programme', () => {
    const pathway = classifyGraduateApplicationPathway({ evidence: [
      { id: 'supervisor:route', url: 'https://physics.example.edu/admissions', excerpt: 'Applicants must obtain supervisor agreement before applying through the department portal.', authority: 'official' },
      { id: 'supervisor:proposal', url: 'https://physics.example.edu/admissions', excerpt: 'A research proposal is required and funding depends on the principal investigator.', authority: 'official' },
    ], now: HARVARD_PHYSICS_FIXTURE_NOW })
    const strategy = buildAdmissionStrategy({ applicationCaseId: 'case:supervisor', objective: 'Apply', institution: 'Example University', programmeTitle: 'Physics PhD', pathway, now: HARVARD_PHYSICS_FIXTURE_NOW })
    const plan = buildApplicationExecutionPlan({ applicationCaseId: 'case:supervisor', objective: 'Apply', programmeTitle: 'Physics PhD', pathway, strategy, now: HARVARD_PHYSICS_FIXTURE_NOW })
    expect(plan.nodes.find(node => node.id === 'faculty:outreach:send')).toMatchObject({ kind: 'required', executionMode: 'approval_required' })
    expect(plan.nodes.find(node => node.id === 'faculty:outreach:send')?.dependencies).toEqual(expect.arrayContaining(['cv', 'faculty:outreach:draft']))
    expect(plan.nodes.some(node => node.id === 'conditional:proposal')).toBe(true)
    expect(plan.nodes.some(node => node.id === 'conditional:funding')).toBe(true)
  })
})
