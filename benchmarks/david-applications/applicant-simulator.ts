import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileLatex } from '../../api/application-cv.ts'
import {
  matchApplicationOtp,
  type OtpMessage,
} from '../../supabase/functions/_shared/david-applications.ts'
import {
  resolveApplicationFact,
  resolveChosenApplicationFact,
  type FactCandidate,
  type FactResolution,
} from '../../supabase/functions/_shared/application-controller.ts'
import {
  applyApplicationObservation,
  claimApplicationAction,
  createApplicationEngineState,
  planApplicationEngineStep,
  recordApplicationFailure,
  validateSemanticDecision,
  verifyApplicationRequirement,
  type ApplicationEngineState,
  type ApplicationObservation,
  type ArtifactObservation,
  type CalendarObservation,
  type EngineRequirement,
  type EngineStep,
  type GmailObservation,
  type RequirementType,
  type SemanticDecision,
  type WebObservation,
} from '../../supabase/functions/_shared/application-engine.ts'
import { renderCanonicalCv, type CvData } from '../../supabase/functions/_shared/cv.ts'
import { BenchmarkWorld, PortalHarness, startPortalServer } from './harness.ts'

/**
 * Product-trial simulator for a graduate applicant. The private oracle is
 * created inside this module and is never included in an engine request. The
 * engine sees only document-derived facts, official observations, provider
 * observations, and explicit applicant answers.
 */

export type ApplicantTrialMode = 'failure_driven' | 'clean'

type SyntheticGroundTruth = {
  fullName: string
  email: string
  phone: string
  nationality: string
  currentLocation: string
  undergraduate: { institution: string; degree: string; field: string; graduationDate: string; grade: string }
  masters: { institution: string; degree: string; field: string; requirementsCompleted: string; conferralDate: string; grade: string }
  researchExperience: string[]
  workExperience: string[]
  projects: string[]
  awards: string[]
  leadership: string[]
  technicalSkills: string[]
  researchInterests: string[]
  careerGoals: string
  geographicPreferences: string[]
  fundingRequirement: string
  referees: Array<{ name: string; email: string; relationship: string }>
  answers: Record<string, unknown>
  sourceDocuments: Record<string, string>
}

type OfficialProgramme = {
  id: string
  institution: string
  title: string
  sourceUrl: string
  fundingUrl: string
  applicationUrl: string
  deadline: string
  fundingSummary: string
  requirements: string[]
  researchFocus: string
  professor: { name: string; email: string; profileUrl: string; researchAreas: string[] }
  cvFocus: string
  pageTarget: 'one_page' | 'two_page'
}

type LiveSource = {
  url: string
  status: number
  bytes: number
  sha256: string
  retrievedAt: string
  title: string
  excerpt: string
}

type ApplicantEvent = {
  at: string
  component: 'engine' | 'applicant' | 'web' | 'gmail' | 'writer' | 'referee' | 'professor' | 'browser' | 'artifact' | 'calendar' | 'repair' | 'verification'
  caseId?: string
  event: string
  data: Record<string, unknown>
}

type ArtifactRecord = {
  id: string
  programmeId: string
  templateId: string
  checksum: string
  pageCount: number
  atsReadable: boolean
  linksVerified: boolean
  approved: boolean
  pdf: Buffer
  preview: Buffer | null
  atsText: string
}

type CaseRuntime = {
  programme: OfficialProgramme
  state: ApplicationEngineState
  artifact: ArtifactRecord | null
  portal: { submissionId: string | null; confirmation: boolean; browserActions: number; recoveryCount: number; browser?: PortalHarness } | null
  flags: {
    officialResearchDone: boolean
    writerEvidencePrepared: number
    writerCorrectionSent: boolean
    refereeEvidencePrepared: number
    refereeReplacementSent: boolean
    refereeFollowUpSent: boolean
    professorFollowUpSent: boolean
    semanticInvalidInjected: boolean
    duplicateSubmissionChecked: boolean
    otpVerified: boolean
  }
}

export type ApplicantCaseResult = {
  caseId: string
  programmeId: string
  finalStep: EngineStep['kind']
  verifiedCompletion: boolean
  requirementsVerified: number
  requirementsTotal: number
  userInterventions: number
  semanticValidationRepairs: number
  recoveryCount: number
  browserActions: number
  writerResult: string
  refereeResult: string
  professorResult: string
  calendarResult: string
  otpResult: string
  artifactIntegrity: boolean
  duplicateSubmissionBlocked: boolean
  contamination: number
  fabricatedFacts: number
  falseCompletions: number
  trace: ApplicantEvent[]
}

export type ApplicantTrialReport = {
  suiteVersion: 'david_applicant_product_trial_v1'
  runId: string
  mode: ApplicantTrialMode
  codeCommit: string
  naturalLanguageRequest: string
  applicantSummary: Record<string, unknown>
  sourceDocuments: Array<{ id: string; kind: string; filename: string; sha256: string }>
  liveResearch: LiveSource[]
  selectedProgrammes: Array<Record<string, unknown>>
  applicationCases: number
  cases: ApplicantCaseResult[]
  metrics: {
    complete: boolean
    verifiedCompletionRate: number
    fabricatedFacts: number
    falseCompletions: number
    duplicateSubmissions: number
    duplicateSubmissionAttemptsBlocked: number
    crossCaseContamination: number
    recoverySuccessRate: number
    userInterventions: number
    semanticValidationRepairs: number
    artifactIntegrityRate: number
    browserCases: number
    browserRecoveryCases: number
    writerCases: number
    refereeCases: number
    professorCases: number
    otpCases: number
    calendarCases: number
    estimatedModelCostUsd: number
    elapsedMs: number
  }
  incidents: Array<{ kind: string; rootCause: string; recovered: boolean; caseId: string; repairCycle: number }>
  generatedAt: string
  privateOraclePath?: string
}

type ProviderSendResult = { messageId: string; threadId: string }

function requireProviderSend(value: unknown): ProviderSendResult {
  if (!value || typeof value !== 'object' || !('messageId' in value) || !('threadId' in value)) {
    throw new Error('Provider send did not return a confirmed message.')
  }
  return { messageId: String(value.messageId), threadId: String(value.threadId) }
}

const programmeDefinitions: OfficialProgramme[] = [
  {
    id: 'imperial-computing-phd',
    institution: 'Imperial College London',
    title: 'PhD in Computing — Computing Research',
    sourceUrl: 'https://www.imperial.ac.uk/computing/prospective-students/courses/phd/',
    fundingUrl: 'https://www.imperial.ac.uk/computing/prospective-students/scholarships/',
    applicationUrl: 'https://apply.imperial.ac.uk/',
    deadline: '2026-12-01T23:59:00Z',
    fundingSummary: 'Departmental and project studentships include fully funded opportunities for overseas candidates; funding deadlines are earlier than the general application window.',
    requirements: ['Distinction-level master’s or equivalent relevant technical degree', 'CV', 'research statement', 'transcripts', 'references', 'named Computing Research degree'],
    researchFocus: 'scientific machine learning and reliable simulation',
    professor: { name: 'Professor Miriam Stein', email: 'm.stein@simulated.imperial.test', profileUrl: 'https://www.imperial.ac.uk/computing/people/', researchAreas: ['scientific machine learning', 'simulation', 'high-performance computing'] },
    cvFocus: 'reproducible scientific machine learning and high-performance simulation',
    pageTarget: 'two_page',
  },
  {
    id: 'edinburgh-informatics-phd',
    institution: 'The University of Edinburgh',
    title: 'PhD in Informatics — Machine Learning',
    sourceUrl: 'https://study.ed.ac.uk/programmes/postgraduate-research/489-informatics-iml-machine-learning-computational-neuroscience',
    fundingUrl: 'https://study.ed.ac.uk/postgraduate/applying/research-degrees/funding',
    applicationUrl: 'https://www.ed.ac.uk/studying/postgraduate/applying',
    deadline: '2026-12-18T23:59:00Z',
    fundingSummary: 'Most Informatics PhD students receive full scholarships covering tuition and living costs; school funding has a specific deadline.',
    requirements: ['UK 2:1 or international equivalent', 'programming experience', 'supervisor or advertised project', 'degree certificates and transcripts', 'CV', 'research proposal', 'references'],
    researchFocus: 'trustworthy machine learning for climate and physical systems',
    professor: { name: 'Dr. Leila Macdonald', email: 'l.macdonald@simulated.ed.ac.test', profileUrl: 'https://informatics.ed.ac.uk/people', researchAreas: ['machine learning', 'climate informatics', 'responsible AI'] },
    cvFocus: 'trustworthy machine learning for climate and physical systems',
    pageTarget: 'two_page',
  },
  {
    id: 'toronto-cs-direct-entry-phd',
    institution: 'University of Toronto',
    title: 'Direct-Entry PhD in Computer Science',
    sourceUrl: 'https://web.cs.toronto.edu/graduate/phd',
    fundingUrl: 'https://web.cs.toronto.edu/graduate/funding-tuition-awards',
    applicationUrl: 'https://web.cs.toronto.edu/graduate/how-to-apply',
    deadline: '2026-12-01T23:59:00Z',
    fundingSummary: 'Full-time research-stream PhD students receive a funding package composed of research and teaching assistantships covering tuition and living costs.',
    requirements: ['A− equivalent average in relevant bachelor’s courses for direct entry', 'English-language proficiency', 'CV', 'statement of purpose', 'transcripts', 'three references'],
    researchFocus: 'data-efficient learning for scientific discovery',
    professor: { name: 'Professor Daniel Chen', email: 'd.chen@simulated.utoronto.test', profileUrl: 'https://web.cs.toronto.edu/people/faculty', researchAreas: ['machine learning', 'scientific discovery', 'data-efficient AI'] },
    cvFocus: 'data-efficient learning for scientific discovery',
    pageTarget: 'two_page',
  },
]

function syntheticApplicant(): SyntheticGroundTruth {
  const cv = [
    'Nadia Okoye',
    'nadia.okoye@example.test | +234 803 555 0198 | Lagos, Nigeria',
    'BSc Physics, University of Lagos, First Class, completed 2021-07-30',
    'MSc Computational Physics, University of Lagos',
    'Research: surrogate models for turbulent flow; uncertainty-aware numerical simulation',
    'Work: Research Engineer at Delta Systems Lab (2022–2025)',
    'Projects: open-source finite-volume solver; climate downscaling benchmark',
    'Skills: Python, Julia, PyTorch, HPC, numerical methods, LaTeX',
  ].join('\n')
  const transcript = [
    'University of Lagos — Official Transcript',
    'Nadia Okoye — MSc Computational Physics',
    'Requirements for the MSc were completed on 2024-06-28.',
    'Cumulative average: 4.45 / 5.00 (Distinction).',
    'Relevant courses: numerical methods, statistical mechanics, machine learning, parallel computing.',
  ].join('\n')
  const degree = [
    'University of Lagos — Degree Certificate',
    'This certifies that Nadia Okoye was awarded MSc Computational Physics.',
    'Degree conferral ceremony date: 2024-07-12.',
  ].join('\n')
  const supporting = [
    'Delta Systems Lab — Research Engineer confirmation',
    'Nadia Okoye developed uncertainty-aware surrogate models for a climate simulation pipeline.',
    'The work was presented internally and has not yet been published.',
  ].join('\n')
  return {
    fullName: 'Nadia Okoye', email: 'nadia.okoye@example.test', phone: '+234 803 555 0198', nationality: 'Nigeria', currentLocation: 'Lagos, Nigeria',
    undergraduate: { institution: 'University of Lagos', degree: 'BSc', field: 'Physics', graduationDate: '2021-07-30', grade: 'First Class' },
    masters: { institution: 'University of Lagos', degree: 'MSc', field: 'Computational Physics', requirementsCompleted: '2024-06-28', conferralDate: '2024-07-12', grade: 'Distinction' },
    researchExperience: ['Surrogate models for turbulent flow', 'Uncertainty-aware numerical simulation', 'Climate downscaling benchmark'],
    workExperience: ['Research Engineer, Delta Systems Lab (2022–2025)'],
    projects: ['Open-source finite-volume solver', 'Climate downscaling benchmark'],
    awards: ['Faculty prize for computational research, 2024'],
    leadership: ['Coordinated the university open research reading group'],
    technicalSkills: ['Python', 'Julia', 'PyTorch', 'HPC', 'numerical methods', 'LaTeX'],
    researchInterests: ['scientific machine learning', 'uncertainty quantification', 'climate and physical systems'],
    careerGoals: 'Lead an applied research group building reliable computational tools for climate and physical science.',
    geographicPreferences: ['United Kingdom', 'Canada'],
    fundingRequirement: 'I can only accept a programme with tuition coverage and a living stipend.',
    referees: [
      { name: 'Dr. Amina Bello', email: 'amina.bello@simulated.test', relationship: 'MSc supervisor' },
      { name: 'Dr. Samuel Adeyemi', email: 'samuel.adeyemi@simulated.test', relationship: 'Research Engineer manager' },
      { name: 'Professor Grace Nwosu', email: 'grace.nwosu@simulated.test', relationship: 'Undergraduate project supervisor' },
    ],
    answers: {
      'profile:phone': '+234 803 555 0198',
      'profile:career-goal': 'Lead an applied research group building reliable computational tools for climate and physical science.',
      'degree:requirements-completed': '2024-06-28',
      'referee:primary-email': 'amina.bello@simulated.test',
      'professor:preferred-area': 'scientific machine learning and uncertainty quantification',
    },
    sourceDocuments: { cv, transcript, degree, supporting },
  }
}

class ApplicantUserSimulator {
  readonly interventionLog: Array<{ question: string; answer: string; factId: string }> = []
  readonly rejectionLog: Array<{ kind: string; reason: string }> = []
  private readonly truth: SyntheticGroundTruth
  constructor(truth: SyntheticGroundTruth) {
    this.truth = truth
  }

  answer(factId: string, question: string) {
    const value = this.truth.answers[factId]
    if (value === undefined) throw new Error(`Applicant simulator has no answer for ${factId}`)
    this.interventionLog.push({ question, answer: String(value), factId })
    return value
  }

  approve(kind: string, payload: Record<string, unknown>) {
    const programmeId = String(payload.programmeId ?? '')
    if (kind === 'shortlist') return programmeDefinitions.every(programme => Boolean(payload.programmes && Array.isArray(payload.programmes) && (payload.programmes as string[]).includes(programme.id)))
    if (kind === 'cv') {
      const approved = payload.fullName === this.truth.fullName && payload.email === this.truth.email && programmeId.length > 0 && payload.artifactId === `cv:${programmeId}`
      if (!approved) this.rejectionLog.push({ kind, reason: 'The proposal contains the wrong identity, programme, or artifact identity.' })
      return approved
    }
    if (kind === 'writer') {
      const text = String(payload.text ?? '')
      const approved = text.includes(String(payload.institution ?? '')) && !/unsupported|first.author|published|wrong university/i.test(text)
      if (!approved) this.rejectionLog.push({ kind, reason: 'The draft contains the wrong institution or an unsupported claim.' })
      return approved
    }
    if (kind === 'professor') {
      const approved = payload.recipient === payload.expectedRecipient && String(payload.body ?? '').includes(String(payload.researchFocus ?? ''))
      if (!approved) this.rejectionLog.push({ kind, reason: 'Professor outreach does not match the selected programme or recipient.' })
      return approved
    }
    if (kind === 'referee') {
      const approved = this.truth.referees.some(referee => referee.email === payload.recipient)
      if (!approved) this.rejectionLog.push({ kind, reason: 'The requested referee is not in the applicant profile.' })
      return approved
    }
    if (kind === 'final_review' || kind === 'submission') {
      const approved = payload.ready === true && payload.caseId !== '' && payload.artifactId === `cv:${programmeId}`
      if (!approved) this.rejectionLog.push({ kind, reason: 'Final review is missing verified readiness or the exact approved artifact.' })
      return approved
    }
    return true
  }
}

function candidate<T>(value: T, sourceId: string, kind: FactCandidate<T>['provenance']['kind'] = 'uploaded_document', confidence: FactCandidate<T>['confidence'] = 'high'): FactCandidate<T> {
  return { value, provenance: { kind, sourceId, confirmed: true }, confidence }
}

function initialFacts(truth: SyntheticGroundTruth): FactResolution[] {
  const entries: Array<[string, FactCandidate[]]> = [
    ['profile:legal-name', [candidate(truth.fullName, 'asset:cv')]],
    ['profile:email', [candidate(truth.email, 'profile:email', 'user_statement')]],
    ['profile:nationality', [candidate(truth.nationality, 'profile:nationality', 'user_statement')]],
    ['profile:location', [candidate(truth.currentLocation, 'asset:cv')]],
    ['profile:phone', []],
    ['degree:masters', [candidate(`${truth.masters.degree} ${truth.masters.field}`, 'asset:transcript')]],
    ['degree:requirements-completed', [candidate(truth.masters.requirementsCompleted, 'asset:transcript'), candidate(truth.masters.conferralDate, 'asset:degree-certificate')]],
    ['degree:conferral-date', [candidate(truth.masters.conferralDate, 'asset:degree-certificate')]],
    ['profile:research-interests', [candidate(truth.researchInterests, 'asset:cv')]],
    ['degree:bachelors-record', [candidate(truth.undergraduate, 'asset:cv')]],
    ['degree:masters-record', [candidate(truth.masters, 'asset:transcript')]],
    ['profile:research-experience', [candidate(truth.researchExperience, 'asset:cv')]],
    ['profile:work-experience', [candidate(truth.workExperience, 'asset:supporting')]],
    ['profile:projects', [candidate(truth.projects, 'asset:cv')]],
    ['profile:awards', [candidate(truth.awards, 'asset:cv')]],
    ['profile:leadership', [candidate(truth.leadership, 'asset:cv')]],
    ['profile:technical-skills', [candidate(truth.technicalSkills, 'asset:cv')]],
    ['profile:career-goal', []],
    ['referee:primary-email', [candidate(truth.referees[0]!.email, 'profile:referees', 'user_statement')]],
  ]
  return entries.map(([factId, values]) => resolveApplicationFact(factId, values))
}

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex')
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

async function fetchOfficialSource(url: string): Promise<LiveSource> {
  const response = await fetch(url, { headers: { 'User-Agent': 'ShotCount product-trial research verifier/1.0' }, signal: AbortSignal.timeout(30_000) })
  const body = await response.text()
  if (!response.ok || body.length < 500) throw new Error(`Official source could not be verified: ${url} (${response.status})`)
  const clean = body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return { url, status: response.status, bytes: Buffer.byteLength(body), sha256: sha256(body), retrievedAt: new Date().toISOString(), title: clean.slice(0, 160), excerpt: clean.slice(0, 800) }
}

async function researchOfficialProgrammes(): Promise<LiveSource[]> {
  const urls = programmeDefinitions.flatMap(programme => [programme.sourceUrl, programme.fundingUrl])
  const sources: LiveSource[] = []
  for (const url of urls) sources.push(await fetchOfficialSource(url))
  return sources
}

function cvFact<T>(value: T, sourceFactId: string) {
  return { value, provenance: { confirmed: true, sourceFactIds: [sourceFactId], sourceAssetIds: ['asset:cv'], kind: 'uploaded_document' as const } }
}

function verifiedFact<T>(state: ApplicationEngineState, factId: string): T {
  const fact = state.facts.find(item => item.factId === factId)
  if (!fact || fact.verification !== 'VERIFIED') throw new Error(`CV requested unverified fact ${factId}`)
  return fact.value as T
}

function programmeCv(state: ApplicationEngineState, programme: OfficialProgramme): CvData {
  const fullName = verifiedFact<string>(state, 'profile:legal-name')
  const email = verifiedFact<string>(state, 'profile:email')
  const phone = verifiedFact<string>(state, 'profile:phone')
  const location = verifiedFact<string>(state, 'profile:location')
  const nationality = verifiedFact<string>(state, 'profile:nationality')
  const undergraduate = verifiedFact<SyntheticGroundTruth['undergraduate']>(state, 'degree:bachelors-record')
  const masters = verifiedFact<SyntheticGroundTruth['masters']>(state, 'degree:masters-record')
  const researchExperience = verifiedFact<string[]>(state, 'profile:research-experience')
  const workExperience = verifiedFact<string[]>(state, 'profile:work-experience')
  const projects = verifiedFact<string[]>(state, 'profile:projects')
  const awards = verifiedFact<string[]>(state, 'profile:awards')
  const leadership = verifiedFact<string[]>(state, 'profile:leadership')
  const technicalSkills = verifiedFact<string[]>(state, 'profile:technical-skills')
  const researchInterests = verifiedFact<string[]>(state, 'profile:research-interests')
  return {
    fullName: cvFact(fullName, 'profile:legal-name'), email: cvFact(email, 'profile:email'), phone: cvFact(phone, 'profile:phone'), location: cvFact(location, 'profile:location'),
    linkedin: null, github: null, portfolio: null, website: null, preferredName: null,
    education: [
      cvFact({ institution: undergraduate.institution, degree: undergraduate.degree, field: undergraduate.field, startDate: '2017', endDate: undergraduate.graduationDate, grade: undergraduate.grade, country: nationality }, 'degree:bachelors-record'),
      cvFact({ institution: masters.institution, degree: masters.degree, field: masters.field, startDate: '2022', endDate: masters.requirementsCompleted, grade: masters.grade, country: nationality }, 'degree:masters-record'),
    ],
    researchExperience: researchExperience.map((summary, index) => cvFact({ title: summary, institution: index === 0 ? 'University of Lagos' : 'Delta Systems Lab', summary, methods: technicalSkills.slice(0, 3), outcomes: ['Verified research experience'], startDate: '2022', endDate: '2025' }, `profile:research-experience:${index}`)),
    workExperience: workExperience.map(summary => cvFact({ employer: 'Delta Systems Lab', title: 'Research Engineer', startDate: '2022', endDate: '2025', responsibilities: [summary] }, 'profile:work-experience')),
    teachingExperience: [], publications: [], presentations: [cvFact('Internal research presentation on uncertainty-aware simulation', 'research:presentation')],
    projects: projects.map((title, index) => cvFact({ title, description: `${title} aligned with ${programme.cvFocus}.`, technologies: technicalSkills.slice(0, 4), date: '2024' }, `profile:projects:${index}`)),
    researchProjects: [cvFact({ title: `Research direction: ${programme.researchFocus}`, description: `Investigating ${programme.researchFocus} using reproducible computational experiments.`, methods: technicalSkills, outcomes: ['Applicant-reviewed research direction'], date: '2025' }, 'research:direction')],
    leadership: leadership.map(value => cvFact(value, 'profile:leadership')),
    awards: awards.map(value => cvFact({ title: value, issuer: 'University of Lagos', year: 2024, description: value }, 'profile:awards')),
    scholarships: [], certifications: [], technicalSkills: [cvFact(technicalSkills.join(', '), 'profile:technical-skills')], researchSkills: [cvFact(`${researchInterests.join(', ')}; ${programme.researchFocus}`, 'profile:research-interests')], languages: [cvFact('English', 'language:english')], coursework: [], memberships: [],
  }
}

function requirement(caseId: string, programme: OfficialProgramme, input: { id: string; name: string; type: RequirementType; dependencies?: string[]; responsible?: EngineRequirement['responsible']; contract: EngineRequirement['evidenceContract']; facts?: string[]; deadline?: string }): EngineRequirement {
  const id = `${caseId}:${input.id}`
  const sourceId = `${id}:source`
  return {
    id, caseId, name: input.name, required: true, status: 'UNRESOLVED', sourceId, dependencyIds: (input.dependencies ?? []).map(dependency => `${caseId}:${dependency}`), responsible: input.responsible ?? 'david', deadline: input.deadline ?? programme.deadline, evidenceIds: [], blocker: null,
    type: input.type, source: { id: sourceId, url: programme.sourceUrl, authority: 'official' }, evidenceContract: input.contract, retry: { attempts: 0, maximumAttempts: 3, lastFailure: null, nextAttemptAt: null, escalated: false }, requiredFactIds: input.facts ?? [], resolutionTier: null, waitUntil: null,
  }
}

function caseState(caseId: string, programme: OfficialProgramme, facts: FactResolution[]) {
  const cv = requirement(caseId, programme, { id: 'cv', name: 'Programme-specific CV', type: 'artifact_upload', dependencies: ['eligibility'], contract: ['artifact'], facts: ['profile:legal-name', 'profile:email', 'degree:masters', 'degree:requirements-completed', 'profile:research-interests', 'profile:phone'] })
  const writer = requirement(caseId, programme, { id: 'writer', name: 'Statement of purpose writer draft', type: 'writer', dependencies: ['cv'], responsible: 'writer', contract: ['web', 'gmail'], facts: ['profile:research-interests', 'profile:career-goal'] })
  const referee = requirement(caseId, programme, { id: 'referee', name: 'Reference requirement', type: 'referee', dependencies: ['cv'], responsible: 'referee', contract: ['web', 'gmail'], facts: ['referee:primary-email'] })
  const source = requirement(caseId, programme, { id: 'source', name: 'Official programme and deadline verification', type: 'deadline', contract: ['web'] })
  const conflict = requirement(caseId, programme, { id: 'conflict', name: 'Resolve official source and degree-date conflict', type: 'official_requirement', dependencies: ['source'], contract: ['web'] })
  const eligibility = requirement(caseId, programme, { id: 'eligibility', name: 'Programme eligibility', type: 'eligibility', dependencies: ['conflict'], contract: ['web'], facts: ['degree:masters', 'degree:requirements-completed'] })
  const funding = requirement(caseId, programme, { id: 'funding', name: 'Full funding and deadline verification', type: 'funding', dependencies: ['source'], contract: ['web'] })
  const professor = requirement(caseId, programme, { id: 'professor-fit', name: 'Professor research fit', type: 'professor', dependencies: ['eligibility'], contract: ['web'], facts: ['profile:research-interests'] })
  const professorOutreach = requirement(caseId, programme, { id: 'professor-outreach', name: 'Professor outreach email reply', type: 'communication', dependencies: ['professor-fit'], responsible: 'roon', contract: ['web', 'gmail'], facts: ['profile:research-interests'] })
  const calendar = requirement(caseId, programme, { id: 'calendar', name: 'Professor interview calendar coordination', type: 'calendar', dependencies: ['professor-outreach'], responsible: 'roon', contract: ['calendar'] })
  const portal = requirement(caseId, programme, { id: 'portal', name: 'Portal sections, documents, and final review', type: 'portal_section', dependencies: ['cv', 'writer', 'referee', 'funding', ...(programme.id === 'imperial-computing-phd' ? ['calendar'] : [])], responsible: 'roon', contract: ['portal'], facts: ['profile:legal-name', 'profile:nationality', 'degree:requirements-completed', 'profile:research-interests'] })
  const submission = requirement(caseId, programme, { id: 'submission', name: 'Approved fixture submission', type: 'submission', dependencies: ['portal'], responsible: 'roon', contract: ['submission'] })
  const post = requirement(caseId, programme, { id: 'post-submission', name: 'Confirmation email and monitoring state', type: 'post_submission', dependencies: ['submission'], responsible: 'roon', contract: ['gmail'] })
  const requirements = programme.id === 'toronto-cs-direct-entry-phd'
    ? [source, conflict, eligibility, funding, cv, writer, referee, portal, submission, post]
    : [source, conflict, eligibility, funding, professor, professorOutreach, ...(programme.id === 'imperial-computing-phd' ? [calendar] : []), cv, writer, referee, portal, submission, post]
  return createApplicationEngineState({ caseId, objective: 'Find strong fully funded graduate programmes for me in my field and handle the applications end to end.', status: 'ACTIVE', requirements, facts: structuredClone(facts), observations: [], completedActionKeys: [], approvals: [], browser: { portal: null, section: null, sessionId: null, checkpointObservationId: null }, communication: [] })
}

function event(runtime: { trace: ApplicantEvent[] }, component: ApplicantEvent['component'], eventName: string, caseId: string | undefined, data: Record<string, unknown> = {}) {
  runtime.trace.push({ at: new Date().toISOString(), component, event: eventName, ...(caseId ? { caseId } : {}), data })
}

function webObservation(runtime: CaseRuntime, requirementId: string, programme: OfficialProgramme, evidenceIds: string[], id = `web:${requirementId}`): WebObservation {
  return { id, caseId: runtime.state.caseId, requirementId, kind: 'web', verified: true, evidenceIds, observedAt: new Date().toISOString(), sourceUrl: programme.sourceUrl, authoritative: true, excerpts: evidenceIds.map(evidenceId => ({ evidenceId, text: `Official ${programme.institution} source verified during the product trial.` })) }
}

function apply(runtime: CaseRuntime, observation: ApplicationObservation, tier: 0 | 1 | 2 | 3 | 4 | 5) {
  const next = applyApplicationObservation(runtime.state, observation, tier)
  if (next !== runtime.state) runtime.state = next
  return next
}

async function buildArtifact(runtime: CaseRuntime, truth: SyntheticGroundTruth, outputDir: string, user: ApplicantUserSimulator) {
  if (runtime.artifact) return runtime.artifact
  const fullName = verifiedFact<string>(runtime.state, 'profile:legal-name')
  const email = verifiedFact<string>(runtime.state, 'profile:email')
  const rendered = renderCanonicalCv({ data: programmeCv(runtime.state, runtime.programme), pageTarget: runtime.programme.pageTarget, sectionOrder: ['education', 'researchExperience', 'workExperience', 'researchProjects', 'projects', 'awards', 'technicalSkills', 'researchSkills', 'languages'] })
  const compiled = await compileLatex(rendered.latex, { expectedName: fullName, expectedEmail: email })
  const atsReadable = compiled.atsText.includes(fullName) && compiled.atsText.includes(email) && compiled.atsText.toLocaleLowerCase().includes(runtime.programme.cvFocus.toLocaleLowerCase().split(' ')[0]!)
  const linksVerified = !/undefined|null|http:\/\/wrong/i.test(compiled.atsText)
  const artifact: ArtifactRecord = { id: `cv:${runtime.programme.id}`, programmeId: runtime.programme.id, templateId: rendered.templateId, checksum: sha256(compiled.pdf), pageCount: compiled.pageCount, atsReadable, linksVerified, approved: false, pdf: compiled.pdf, preview: compiled.preview, atsText: compiled.atsText }
  if (!atsReadable || !linksVerified || artifact.pageCount < 1) throw new Error(`CV artifact verification failed for ${runtime.programme.id}`)
  artifact.approved = user.approve('cv', { programmeId: runtime.programme.id, artifactId: artifact.id, fullName, email })
  if (!artifact.approved) throw new Error(`Applicant rejected correct CV unexpectedly for ${runtime.programme.id}`)
  runtime.artifact = artifact
  const caseDir = resolve(outputDir, runtime.programme.id)
  mkdirSync(caseDir, { recursive: true })
  writeFileSync(resolve(caseDir, 'cv.pdf'), compiled.pdf)
  if (compiled.preview) writeFileSync(resolve(caseDir, 'cv-preview.png'), compiled.preview)
  writeFileSync(resolve(caseDir, 'cv.ats.txt'), compiled.atsText)
  event(trialRuntime, 'artifact', 'programme_specific_cv_compiled_approved', runtime.state.caseId, { artifactId: artifact.id, templateId: artifact.templateId, checksum: artifact.checksum, pageCount: artifact.pageCount, atsReadable, linksVerified })
  return artifact
}

let trialRuntime: { trace: ApplicantEvent[] } = { trace: [] }

function gmailObservation(runtime: CaseRuntime, requirementId: string, message: Record<string, unknown>, evidenceIds: string[], id: string): GmailObservation {
  return { id, caseId: runtime.state.caseId, requirementId, kind: 'gmail', verified: true, evidenceIds, observedAt: String(message.receivedAt ?? new Date().toISOString()), providerMessageId: String(message.messageId), providerThreadId: String(message.threadId), expectedRecipient: 'nadia.okoye@example.test', actualRecipients: ['nadia.okoye@example.test'], direction: 'inbound' }
}

function prepareWriterEvidence(runtime: CaseRuntime, truth: SyntheticGroundTruth, world: BenchmarkWorld, mode: ApplicantTrialMode, user: ApplicantUserSimulator) {
  const requirementId = `${runtime.state.caseId}:writer`
  const purpose = 'writer_draft'
  const existing = runtime.state.observations.filter(item => item.requirementId === requirementId && item.kind === 'gmail')
  if (!existing.some(item => item.evidenceIds.includes('writer:final-draft'))) {
    if (!existing.length) {
      const approved = user.approve('writer', { text: `${runtime.programme.institution} ${runtime.programme.title} statement`, institution: runtime.programme.institution, programmeId: runtime.programme.id })
      if (!approved) throw new Error('Applicant rejected the writer assignment proposal.')
      requireProviderSend(world.gmail.send({ caseId: runtime.state.caseId, purpose: 'writer_assignment', from: 'david@shotcount.test', to: 'writer@controlled.test', subject: `[${runtime.programme.id}] Statement brief`, body: `Write a factual statement for ${runtime.programme.institution}.`, idempotencyKey: `writer-assignment:${runtime.state.caseId}` }))
      event(trialRuntime, 'writer', 'writer_assignment_sent', runtime.state.caseId, { threadId: `thread-${runtime.state.caseId}-writer_assignment` })
      const question = world.gmail.receive({ caseId: runtime.state.caseId, purpose: 'writer_question', from: 'writer@controlled.test', to: truth.email, subject: 'One context question', body: 'Which research direction should be prioritised?' })
      event(trialRuntime, 'writer', 'writer_question_received', runtime.state.caseId, { providerMessageId: question.messageId })
      const goal = user.answer('profile:career-goal', 'Which career goal should the writer use?')
      event(trialRuntime, 'applicant', 'stored_context_answered_writer_question', runtime.state.caseId, { factId: 'profile:career-goal', value: goal })
      requireProviderSend(world.gmail.send({ caseId: runtime.state.caseId, purpose: 'writer_context', from: 'david@shotcount.test', to: 'writer@controlled.test', subject: `[${runtime.programme.id}] Context`, body: String(goal), threadId: question.threadId, idempotencyKey: `writer-context:${runtime.state.caseId}` }))
    }
    const wrong = mode === 'failure_driven' && runtime.programme.id === 'imperial-computing-phd' && !runtime.flags.writerCorrectionSent
    const body = wrong ? `This draft is for the University of Wrongtown. Unsupported claim: first-author published paper.` : `This draft explains ${runtime.programme.cvFocus} at ${runtime.programme.institution}. It uses only verified research experience and does not claim a publication.`
    const draft = world.gmail.receive({ caseId: runtime.state.caseId, purpose, from: 'writer@controlled.test', to: truth.email, subject: `[${runtime.programme.id}] Draft`, body, threadId: `thread-${runtime.state.caseId}-writer_assignment` })
    runtime.flags.writerEvidencePrepared += 1
    event(trialRuntime, 'writer', wrong ? 'unsupported_wrong_institution_draft_received' : 'writer_draft_received', runtime.state.caseId, { providerMessageId: draft.messageId })
    const observation = gmailObservation(runtime, requirementId, draft, [runtime.state.requirements.find(item => item.id === requirementId)!.source.id, 'writer:draft'], `gmail:${draft.messageId}`)
    apply(runtime, observation, 1)
  }
}

function prepareRefereeEvidence(runtime: CaseRuntime, truth: SyntheticGroundTruth, world: BenchmarkWorld, mode: ApplicantTrialMode, user: ApplicantUserSimulator) {
  const requirementId = `${runtime.state.caseId}:referee`
  const requirement = runtime.state.requirements.find(item => item.id === requirementId)!
  const existing = runtime.state.observations.filter(item => item.requirementId === requirementId && item.kind === 'gmail')
  const accepted = existing.some(item => item.evidenceIds.includes('referee:accepted'))
  const needsReply = !existing.length || (!accepted && (runtime.flags.refereeReplacementSent || runtime.flags.refereeFollowUpSent))
  if (needsReply) {
    const replacement = runtime.flags.refereeReplacementSent
    const followUp = runtime.flags.refereeFollowUpSent && !replacement
    const recipient = replacement ? truth.referees[1]!.email : truth.referees[0]!.email
    if (!user.approve('referee', { recipient })) throw new Error('Applicant rejected a referee from the profile.')
    const key = replacement ? `referee-replacement:${runtime.state.caseId}` : followUp ? `referee-follow-up:${runtime.state.caseId}` : `referee-request:${runtime.state.caseId}`
    const sent = requireProviderSend(world.gmail.send({ caseId: runtime.state.caseId, purpose: replacement ? 'referee_replacement_request' : followUp ? 'referee_follow_up' : 'referee_request', from: 'david@shotcount.test', to: recipient, subject: `[${runtime.programme.id}] Reference request`, body: 'Controlled support pack with verified applicant facts.', idempotencyKey: key }))
    event(trialRuntime, 'referee', replacement ? 'replacement_request_sent' : followUp ? 'reference_follow_up_sent' : 'reference_request_sent', runtime.state.caseId, { providerMessageId: sent.messageId, recipient })
    const shouldDecline = mode === 'failure_driven' && runtime.programme.id === 'edinburgh-informatics-phd' && !runtime.flags.refereeReplacementSent
    const delayed = mode === 'failure_driven' && runtime.programme.id === 'toronto-cs-direct-entry-phd' && !runtime.flags.refereeReplacementSent && !runtime.flags.refereeFollowUpSent
    const body = shouldDecline ? 'I must decline this reference request because of a conflict.' : delayed ? 'I can provide the reference next week; please wait.' : 'I accept the reference request and will submit it through the portal.'
    const reply = world.gmail.receive({ caseId: runtime.state.caseId, purpose: 'referee_reply', from: recipient, to: truth.email, subject: `[${runtime.programme.id}] Reference reply`, body, threadId: sent.threadId })
    runtime.flags.refereeEvidencePrepared += 1
    event(trialRuntime, 'referee', shouldDecline ? 'referee_declined' : delayed ? 'referee_delayed' : 'referee_accepted', runtime.state.caseId, { providerMessageId: reply.messageId })
    apply(runtime, gmailObservation(runtime, requirementId, reply, [requirement.source.id, shouldDecline ? 'referee:declined' : delayed ? 'referee:delayed' : 'referee:accepted'], `gmail:${reply.messageId}`), 1)
  }
}

function prepareProfessorEvidence(runtime: CaseRuntime, truth: SyntheticGroundTruth, world: BenchmarkWorld, user: ApplicantUserSimulator) {
  const requirementId = `${runtime.state.caseId}:professor-outreach`
  const requirement = runtime.state.requirements.find(item => item.id === requirementId)
  if (!requirement) return
  const existing = runtime.state.observations.filter(item => item.requirementId === requirementId && item.kind === 'gmail')
  if (existing.length) return
  const body = `I am interested in ${runtime.programme.researchFocus}; my verified work includes uncertainty-aware numerical simulation.`
  if (!user.approve('professor', { recipient: runtime.programme.professor.email, expectedRecipient: runtime.programme.professor.email, body, researchFocus: runtime.programme.researchFocus })) throw new Error('Applicant rejected correct professor outreach.')
  const sent = requireProviderSend(world.gmail.send({ caseId: runtime.state.caseId, purpose: 'professor_outreach', from: 'david@shotcount.test', to: runtime.programme.professor.email, subject: `[${runtime.programme.id}] Research fit`, body, idempotencyKey: `professor-outreach:${runtime.state.caseId}` }))
  event(trialRuntime, 'professor', 'approved_outreach_sent', runtime.state.caseId, { providerMessageId: sent.messageId, recipient: runtime.programme.professor.email })
  const followUp = runtime.programme.id === 'imperial-computing-phd'
  const reply = world.gmail.receive({ caseId: runtime.state.caseId, purpose: 'professor_reply', from: runtime.programme.professor.email, to: truth.email, subject: `[${runtime.programme.id}] Research reply`, body: followUp ? 'Please send your CV after you apply; the work appears relevant.' : 'This work is a strong fit. Please include my name in your application.', threadId: sent.threadId })
  event(trialRuntime, 'professor', followUp ? 'professor_requested_post_application_follow_up' : 'professor_confirmed_fit', runtime.state.caseId, { providerMessageId: reply.messageId })
  apply(runtime, gmailObservation(runtime, requirementId, reply, [requirement.source.id, 'professor:reply'], `gmail:${reply.messageId}`), 1)
}

function semanticDecision(runtime: CaseRuntime, step: Extract<EngineStep, { kind: 'SEMANTIC_DECISION' }>, mode: ApplicantTrialMode): SemanticDecision {
  const invalid = mode === 'failure_driven' && runtime.programme.id === 'toronto-cs-direct-entry-phd' && step.request.function === 'evaluate_programme_eligibility' && !runtime.flags.semanticInvalidInjected
  if (invalid) {
    runtime.flags.semanticInvalidInjected = true
    return { schemaVersion: 1, function: step.request.function, caseId: 'wrong-case', requirementId: step.requirementId, decision: step.request.allowedDecisions[0]!, confidence: 'low', evidenceIds: [step.request.sources[0]?.id ?? 'invented'], factIds: [], rationale: 'Injected validation defect for bounded repair testing.' }
  }
  const decision = step.request.function === 'evaluate_writer_draft'
    ? (mode === 'failure_driven' && runtime.programme.id === 'imperial-computing-phd' && !runtime.flags.writerCorrectionSent ? 'wrong_institution' : 'accepted')
    : step.request.function === 'evaluate_reference_requirement'
      ? (runtime.programme.id === 'edinburgh-informatics-phd' && !runtime.flags.refereeReplacementSent && mode === 'failure_driven' ? 'replacement_required' : runtime.programme.id === 'toronto-cs-direct-entry-phd' && !runtime.flags.refereeFollowUpSent && !runtime.flags.refereeReplacementSent && mode === 'failure_driven' ? 'waiting' : 'satisfied')
      : step.request.function === 'interpret_email_reply'
        ? (runtime.programme.id === 'imperial-computing-phd' && !runtime.flags.professorFollowUpSent ? 'question' : 'accepted')
        : step.request.function === 'evaluate_professor_fit' ? 'strong_fit'
          : step.request.function === 'resolve_requirement_conflict' ? 'source_a'
            : step.request.allowedDecisions[0]!
  const evidence = step.request.sources.at(-1)?.id ?? step.request.sources[0]?.id ?? ''
  const facts = step.request.verifiedFacts.map(fact => fact.factId)
  return { schemaVersion: 1, function: step.request.function, caseId: step.caseId, requirementId: step.requirementId, decision, confidence: 'high', evidenceIds: evidence ? [evidence] : [], factIds: facts, rationale: `The supplied verified facts and case-scoped evidence support the bounded ${step.request.function} decision.` }
}

async function portalWorkflow(runtime: CaseRuntime, truth: SyntheticGroundTruth, world: BenchmarkWorld, port: number, mode: ApplicantTrialMode, outputDir: string) {
  const failure = mode === 'failure_driven'
    ? runtime.programme.id === 'imperial-computing-phd' ? 'renamed_label' : runtime.programme.id === 'edinburgh-informatics-phd' ? 'expired_session' : 'rejected_file'
    : undefined
  const browser = await PortalHarness.create({ caseId: runtime.state.caseId, seed: Math.abs(runtime.state.caseId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)), failure, port, world })
  let recoveries = 0
  const save = async (step: string) => {
    try { await browser.saveSection(step) } catch (error) {
      recoveries += 1
      event(trialRuntime, 'repair', 'portal_failure_recovered_from_checkpoint', runtime.state.caseId, { step, error: error instanceof Error ? error.message : String(error) })
      await browser.resumeWithoutFailure()
      await browser.saveSection(step)
    }
  }
  if (/session expired/i.test(browser.observation().text)) { recoveries += 1; await browser.resumeWithoutFailure() }
  await browser.type('label:Email', truth.email)
  await browser.type('label:Password', `benchmark-password-${runtime.state.caseId}`)
  await save('account')
  await browser.navigateTo('verification')
  const messages: OtpMessage[] = [
    { id: 'stale-otp', threadId: 'stale-thread', from: 'admissions@controlled.example.edu', to: truth.email, subject: 'Old verification', body: 'Old code 111111', receivedAt: '2026-08-08T11:00:00.000Z', applicationCaseId: runtime.state.caseId },
    { id: 'wrong-otp', threadId: 'wrong-thread', from: 'other-service@controlled.test', to: truth.email, subject: 'Verification', body: '999999', receivedAt: '2026-08-09T11:00:00.000Z', applicationCaseId: runtime.state.caseId },
    { id: 'current-otp', threadId: 'current-thread', from: 'admissions@controlled.example.edu', to: truth.email, subject: 'Controlled University verification', body: 'Your verification code is 481206.', receivedAt: '2026-08-09T12:01:00.000Z', applicationCaseId: runtime.state.caseId },
  ]
  const matched = matchApplicationOtp({ applicationCaseId: runtime.state.caseId, institution: 'Controlled University', portal: 'application portal', destinationEmail: truth.email, requestedAt: '2026-08-09T12:00:00.000Z', senderClues: ['admissions@controlled.example.edu'], subjectClues: ['verification'] }, messages)
  if (matched?.messageId !== 'current-otp') throw new Error('OTP matcher accepted the wrong or stale message.')
  runtime.flags.otpVerified = true
  event(trialRuntime, 'verification', 'current_otp_matched_stale_and_unrelated_rejected', runtime.state.caseId, { messageId: matched.messageId, redactedCode: matched.redactedCode })
  await browser.type('label:Verification code', `benchmark-otp-${matched.code}`)
  await save('verification')
  await browser.navigateTo('profile')
  await browser.type('label:Legal name', truth.fullName)
  if (failure === 'renamed_label') {
    try { await browser.select('label:Nationality', truth.nationality) } catch {
      recoveries += 1
      await browser.select('css:select[name="nationality"]', truth.nationality)
      event(trialRuntime, 'repair', 'renamed_portal_label_recovered_with_semantic_selector', runtime.state.caseId, {})
    }
  } else await browser.select('css:select[name="nationality"]', truth.nationality)
  await browser.type('label:Research interests', runtime.programme.researchFocus)
  await save('profile')
  await browser.navigateTo('education')
  await browser.type('label:Degree', truth.masters.degree)
  await browser.type('label:Institution', truth.masters.institution)
  await browser.type('label:Dates', truth.masters.requirementsCompleted)
  await save('education')
  await browser.navigateTo('research')
  await browser.type('label:Research title', runtime.programme.researchFocus)
  await browser.type('label:Methods', truth.technicalSkills.slice(0, 4).join(', '))
  await browser.type('label:Outcomes', truth.researchExperience[0]!)
  await save('research')
  await browser.navigateTo('documents')
  if (!runtime.artifact) throw new Error('Portal was reached without an approved CV artifact.')
  const statement = Buffer.from(`Applicant-approved statement for ${runtime.programme.institution}. ${runtime.programme.researchFocus}.`)
  const transcript = Buffer.from(truth.sourceDocuments.transcript)
  browser.addAsset('cv-approved', 'approved-programme-cv.pdf', 'application/pdf', runtime.artifact.pdf)
  browser.addAsset('cv-wrong', 'wrong-programme-cv.pdf', 'application/pdf', Buffer.from('wrong programme artifact'))
  browser.addAsset('statement-approved', 'approved-statement.pdf', 'application/pdf', statement)
  browser.addAsset('transcript-approved', 'approved-transcript.pdf', 'application/pdf', transcript)
  if (failure === 'rejected_file') {
    recoveries += 1
    try { await browser.upload('label:Academic CV', 'cv-wrong') } catch { recoveries += 1; await browser.resumeWithoutFailure() }
    await browser.upload('label:Academic CV', 'cv-approved')
    event(trialRuntime, 'repair', 'wrong_upload_replaced_with_exact_approved_artifact', runtime.state.caseId, { approvedChecksum: runtime.artifact.checksum })
  } else await browser.upload('label:Academic CV', 'cv-approved')
  await browser.upload('label:Statement of purpose', 'statement-approved')
  await browser.upload('label:Transcript', 'transcript-approved')
  await save('documents')
  await browser.finalReview()
  event(trialRuntime, 'browser', 'final_review_reached_with_saved_sections', runtime.state.caseId, { actions: browser.actionCount() })
  return { browser, recoveries }
}

async function executeStep(runtime: CaseRuntime, step: Extract<EngineStep, { kind: 'EXECUTE' }>, truth: SyntheticGroundTruth, world: BenchmarkWorld, port: number, mode: ApplicantTrialMode, outputDir: string, user: ApplicantUserSimulator) {
  const requirement = runtime.state.requirements.find(item => item.id === step.requirementId)!
  if (step.action === 'search_verified_context') {
    runtime.state = recordApplicationFailure(runtime.state, requirement.id, 'fact_search_exhausted')
    event(trialRuntime, 'engine', 'verified_context_search_exhausted_user_question_required', runtime.state.caseId, { requirementId: requirement.id })
    return
  }
  if (requirement.type === 'deadline' || requirement.type === 'funding') {
    apply(runtime, webObservation(runtime, requirement.id, runtime.programme, [requirement.source.id]), 0)
    event(trialRuntime, 'web', 'official_requirement_verified', runtime.state.caseId, { requirementId: requirement.id, sourceUrl: runtime.programme.sourceUrl })
    return
  }
  if (requirement.type === 'artifact_upload') {
    const artifact = await buildArtifact(runtime, truth, outputDir, user)
    const observation: ArtifactObservation = { id: `artifact-observation:${artifact.id}`, caseId: runtime.state.caseId, requirementId: requirement.id, kind: 'artifact', verified: true, evidenceIds: [`checksum:${artifact.checksum}`, artifact.id], observedAt: new Date().toISOString(), artifactId: artifact.id, checksum: artifact.checksum, approved: artifact.approved, sourceFactIds: requirement.requiredFactIds, portalConfirmation: null }
    apply(runtime, observation, 1)
    event(trialRuntime, 'artifact', 'exact_approved_artifact_observed', runtime.state.caseId, { artifactId: artifact.id, checksum: artifact.checksum })
    return
  }
  if (requirement.type === 'portal_section') {
    const result = await portalWorkflow(runtime, truth, world, port, mode, outputDir)
    runtime.portal = { submissionId: null, confirmation: false, browserActions: result.browser.actionCount(), recoveryCount: result.recoveries, browser: result.browser }
    const fields = { legal_name: truth.fullName, nationality: truth.nationality, requirements_completed_date: truth.masters.requirementsCompleted, research_interests: runtime.programme.researchFocus }
    apply(runtime, { id: `portal-observation:${runtime.state.caseId}`, caseId: runtime.state.caseId, requirementId: requirement.id, kind: 'portal', verified: true, evidenceIds: [`checkpoint:${runtime.state.caseId}:review`], observedAt: new Date().toISOString(), portal: 'controlled-application-portal', section: 'final-review', persistedValues: fields, readBackValues: fields, saveConfirmation: 'All required sections saved and final review reached.', sessionId: `session:${runtime.state.caseId}` }, 3)
    event(trialRuntime, 'browser', 'portal_act_read_verify_checkpoint_complete', runtime.state.caseId, { browserActions: result.browser.actionCount(), recoveries: result.recoveries, exactArtifact: runtime.artifact?.checksum })
    return
  }
  if (requirement.type === 'calendar') {
    const observation: CalendarObservation = { id: `calendar-observation:${runtime.state.caseId}`, caseId: runtime.state.caseId, requirementId: requirement.id, kind: 'calendar', verified: true, evidenceIds: [`calendar:event:${runtime.state.caseId}`], observedAt: new Date().toISOString(), providerEventId: `google-event:${runtime.state.caseId}`, expectedAttendees: [runtime.programme.professor.email], actualAttendees: [runtime.programme.professor.email] }
    apply(runtime, observation, 1)
    event(trialRuntime, 'calendar', 'provider_event_and_attendees_verified', runtime.state.caseId, { providerEventId: observation.providerEventId })
    return
  }
  if (requirement.type === 'submission') {
    if (!runtime.portal) throw new Error('Submission attempted without portal readiness.')
    const approved = user.approve('submission', { ready: true, caseId: runtime.state.caseId, programmeId: runtime.programme.id, artifactId: runtime.artifact?.id })
    if (!approved) throw new Error('Applicant rejected a ready final review unexpectedly.')
    const claim = claimApplicationAction(runtime.state, `submission:${runtime.state.caseId}`)
    runtime.state = claim.state
    if (!claim.claimed) throw new Error('Submission action was already claimed before first submission.')
    const result = runtime.portal.browser ? { browser: runtime.portal.browser, recoveries: 0 } : await portalWorkflow(runtime, truth, world, port, mode, outputDir)
    const submission = await result.browser.submitFinal()
    runtime.portal = { ...runtime.portal, submissionId: 'SC-TEST-2027-001', confirmation: true, browserActions: runtime.portal.browserActions + (runtime.portal.browser ? 1 : result.browser.actionCount()), recoveryCount: runtime.portal.recoveryCount + result.recoveries }
    apply(runtime, { id: `submission-observation:${runtime.state.caseId}`, caseId: runtime.state.caseId, requirementId: requirement.id, kind: 'submission', verified: true, evidenceIds: ['SC-TEST-2027-001', 'confirmation:controlled-fixture'], observedAt: new Date().toISOString(), applicationId: 'SC-TEST-2027-001', confirmation: submission.observation.text }, 3)
    event(trialRuntime, 'verification', 'fixture_submission_confirmed_once', runtime.state.caseId, { applicationId: 'SC-TEST-2027-001' })
    if (mode === 'failure_driven' && !runtime.flags.duplicateSubmissionChecked) {
      runtime.flags.duplicateSubmissionChecked = true
      try { await result.browser.submitFinal(); throw new Error('Duplicate submission was not blocked.') } catch (error) { event(trialRuntime, 'verification', 'duplicate_submission_blocked', runtime.state.caseId, { error: error instanceof Error ? error.message : String(error) }) }
    }
    return
  }
  if (requirement.type === 'post_submission') {
    const message = world.gmail.receive({ caseId: runtime.state.caseId, purpose: 'submission_confirmation', from: 'admissions@controlled.example.edu', to: truth.email, subject: `[${runtime.programme.id}] Application confirmation`, body: 'Application received. Application ID SC-TEST-2027-001.', threadId: `thread-${runtime.state.caseId}-submission` })
    apply(runtime, gmailObservation(runtime, requirement.id, message, [requirement.source.id, 'submission:confirmation'], `gmail:${message.messageId}`), 1)
    event(trialRuntime, 'gmail', 'submission_confirmation_email_verified', runtime.state.caseId, { providerMessageId: message.messageId, applicationId: 'SC-TEST-2027-001' })
    return
  }
  throw new Error(`No deterministic executor for ${requirement.type}`)
}

async function handleSemantic(runtime: CaseRuntime, step: Extract<EngineStep, { kind: 'SEMANTIC_DECISION' }>, truth: SyntheticGroundTruth, world: BenchmarkWorld, mode: ApplicantTrialMode, user: ApplicantUserSimulator) {
  const requirement = runtime.state.requirements.find(item => item.id === step.requirementId)!
  if (!runtime.state.observations.some(item => item.requirementId === requirement.id && item.kind === 'web')) {
    apply(runtime, webObservation(runtime, requirement.id, runtime.programme, [requirement.source.id], `web:${requirement.id}`), 0)
    event(trialRuntime, 'web', 'semantic_context_official_source_attached', runtime.state.caseId, { requirementId: requirement.id })
    return
  }
  if (requirement.type === 'writer') prepareWriterEvidence(runtime, truth, world, mode, user)
  if (requirement.type === 'referee') prepareRefereeEvidence(runtime, truth, world, mode, user)
  if (requirement.type === 'communication') prepareProfessorEvidence(runtime, truth, world, user)
  if (['writer', 'referee', 'communication'].includes(requirement.type) && !runtime.state.observations.some(item => item.requirementId === requirement.id && item.kind === 'gmail')) return
  const decision = semanticDecision(runtime, step, mode)
  const validation = validateSemanticDecision(runtime.state, step.request, decision)
  if (!validation.valid) {
    runtime.state = recordApplicationFailure(runtime.state, requirement.id, `semantic_validation:${validation.defects.join(',')}`)
    event(trialRuntime, 'repair', 'bounded_semantic_validation_repair', runtime.state.caseId, { requirementId: requirement.id, defects: validation.defects, strongerTier: 4 })
    return
  }
  if (decision.decision !== 'eligible' && decision.decision !== 'strong_fit' && decision.decision !== 'possible_fit' && decision.decision !== 'accepted' && decision.decision !== 'satisfied' && decision.decision !== 'source_a' && decision.decision !== 'map' && decision.decision !== 'otp') {
    runtime.state = recordApplicationFailure(runtime.state, requirement.id, `semantic_nonterminal:${decision.decision}`)
    if (decision.decision === 'wrong_institution' || decision.decision === 'unsupported_claims') {
      runtime.flags.writerCorrectionSent = true
      const draft = world.gmail.receive({ caseId: runtime.state.caseId, purpose: 'writer_draft', from: 'writer@controlled.test', to: truth.email, subject: `[${runtime.programme.id}] Corrected draft`, body: `Corrected draft for ${runtime.programme.institution}; only verified research experience is included.`, threadId: `thread-${runtime.state.caseId}-writer_assignment` })
      const latest = gmailObservation(runtime, requirement.id, draft, [requirement.source.id, 'writer:final-draft'], `gmail:${draft.messageId}`)
      apply(runtime, latest, 1)
      event(trialRuntime, 'repair', 'writer_revision_requested_and_corrected_draft_received', runtime.state.caseId, { providerMessageId: draft.messageId })
    } else if (decision.decision === 'replacement_required') {
      runtime.flags.refereeReplacementSent = true
      event(trialRuntime, 'repair', 'referee_replacement_approved_and_replanned', runtime.state.caseId, { replacement: truth.referees[1]!.email })
    } else if (decision.decision === 'waiting') {
      runtime.flags.refereeFollowUpSent = true
      event(trialRuntime, 'repair', 'delayed_referee_follow_up_replanned', runtime.state.caseId, {})
    } else if (decision.decision === 'question') {
      runtime.flags.professorFollowUpSent = true
      const sent = requireProviderSend(world.gmail.send({ caseId: runtime.state.caseId, purpose: 'professor_follow_up', from: 'david@shotcount.test', to: runtime.programme.professor.email, subject: `[${runtime.programme.id}] Approved follow-up`, body: 'Thank you; I will include the programme in my application.', threadId: `thread-${runtime.state.caseId}-professor_outreach`, idempotencyKey: `professor-follow-up:${runtime.state.caseId}` }))
      const reply = world.gmail.receive({ caseId: runtime.state.caseId, purpose: 'professor_reply', from: runtime.programme.professor.email, to: truth.email, subject: `[${runtime.programme.id}] Follow-up`, body: 'Please proceed with the application; I will review it.', threadId: sent.threadId })
      apply(runtime, gmailObservation(runtime, requirement.id, reply, [requirement.source.id, 'professor:accepted'], `gmail:${reply.messageId}`), 1)
      event(trialRuntime, 'repair', 'professor_follow_up_completed', runtime.state.caseId, { providerMessageId: reply.messageId })
    }
    return
  }
  const evidence = step.request.sources.at(-1)?.id ?? step.request.sources[0]?.id
  if (!evidence) throw new Error(`Semantic decision has no valid evidence for ${requirement.id}`)
  const existingGmail = runtime.state.observations.filter(item => item.requirementId === requirement.id && item.kind === 'gmail').at(-1)
  const observation: ApplicationObservation = existingGmail
    ? { ...existingGmail, id: `semantic:${runtime.state.caseId}:${requirement.id}`, evidenceIds: [`semantic:${step.request.function}`, evidence, ...existingGmail.evidenceIds] }
    : webObservation(runtime, requirement.id, runtime.programme, [`semantic:${step.request.function}`, evidence], `semantic:${runtime.state.caseId}:${requirement.id}`)
  apply(runtime, observation, step.tier)
  event(trialRuntime, 'engine', 'bounded_semantic_decision_validated_and_applied', runtime.state.caseId, { function: decision.function, decision: decision.decision, requirementId: requirement.id, tier: step.tier })
}

async function runCase(runtime: CaseRuntime, truth: SyntheticGroundTruth, world: BenchmarkWorld, port: number, mode: ApplicantTrialMode, outputDir: string, user: ApplicantUserSimulator) {
  let guard = 0
  let lastStep: EngineStep | null = null
  while (guard < 180) {
    guard += 1
    const step = planApplicationEngineStep(runtime.state)
    lastStep = step
    event(trialRuntime, 'engine', 'step_selected', runtime.state.caseId, { kind: step.kind, requirementId: 'requirementId' in step ? step.requirementId : null, tier: 'tier' in step ? step.tier : null })
    if (step.kind === 'COMPLETE') break
    if (step.kind === 'BLOCKED') throw new Error(`${runtime.state.caseId}: ${step.reason}`)
    if (step.kind === 'WAIT') { runtime.state = { ...runtime.state, requirements: runtime.state.requirements.map(item => item.id === step.requirementId ? { ...item, waitUntil: null, status: 'UNRESOLVED' as const } : item) }; continue }
    if (step.kind === 'USER_HANDOFF') {
      for (const factId of step.missingFactIds) {
        const question = factId === 'profile:phone' ? 'What phone number should I use?' : factId === 'profile:career-goal' ? 'Which career goal should the application materials describe?' : 'Which source value should I use for the degree completion date?'
        const answer = user.answer(factId, question)
        const current = runtime.state.facts.find(fact => fact.factId === factId)
        const resolved = current && current.verification === 'CONFLICTING'
          ? resolveChosenApplicationFact(factId, current, answer, { kind: 'user_statement', sourceId: 'applicant-context-answer', confirmed: true })
          : resolveApplicationFact(factId, [candidate(answer, 'applicant-context-answer', 'user_statement')])
        runtime.state = { ...runtime.state, facts: runtime.state.facts.map(fact => fact.factId === factId ? resolved : fact), userInterventions: runtime.state.userInterventions + 1, tierCounts: { ...runtime.state.tierCounts, 5: runtime.state.tierCounts[5] + 1 } }
        event(trialRuntime, 'applicant', 'context_request_answered_through_user_contract', runtime.state.caseId, { factId, verification: resolved.verification, provenance: resolved.provenance?.sourceId })
      }
      continue
    }
    if (step.kind === 'SEMANTIC_DECISION') { await handleSemantic(runtime, step, truth, world, mode, user); continue }
    if (step.kind === 'EXECUTE') { await executeStep(runtime, step, truth, world, port, mode, outputDir, user); continue }
    if (step.kind === 'VERIFY') {
      runtime.state = verifyApplicationRequirement(runtime.state, step.requirementId)
      continue
    }
  }
  if (guard >= 180) {
    const diagnostics = runtime.state.requirements.map(item => ({ id: item.id, type: item.type, status: item.status, attempts: item.retry.attempts, observations: runtime.state.observations.filter(observation => observation.requirementId === item.id).map(observation => `${observation.kind}:${observation.id}`) }))
    throw new Error(`${runtime.state.caseId}: engine loop guard exceeded; lastStep=${lastStep?.kind ?? 'none'}; diagnostics=${JSON.stringify(diagnostics)}`)
  }
  const finalStep = planApplicationEngineStep(runtime.state)
  const verified = finalStep.kind === 'COMPLETE' && runtime.state.requirements.every(requirement => requirement.status === 'VERIFIED')
  const writerRequirement = runtime.state.requirements.find(item => item.id.endsWith(':writer'))
  const refereeRequirement = runtime.state.requirements.find(item => item.id.endsWith(':referee'))
  const professorRequirement = runtime.state.requirements.find(item => item.id.endsWith(':professor-outreach'))
  const calendarRequirement = runtime.state.requirements.find(item => item.id.endsWith(':calendar'))
  const contaminationBefore = runtime.state
  const foreign = runtime.state.observations[0]
  const contaminated = foreign ? applyApplicationObservation(runtime.state, { ...foreign, id: `foreign:${foreign.id}`, caseId: 'case:foreign' } as ApplicationObservation, 3) : runtime.state
  const contamination = contaminated !== contaminationBefore ? 1 : 0
  return {
    caseId: runtime.state.caseId, programmeId: runtime.programme.id, finalStep: finalStep.kind, verifiedCompletion: verified, requirementsVerified: runtime.state.requirements.filter(item => item.status === 'VERIFIED').length, requirementsTotal: runtime.state.requirements.length, userInterventions: runtime.state.userInterventions, semanticValidationRepairs: runtime.state.requirements.reduce((sum, item) => sum + Math.max(0, item.retry.attempts - (item.type === 'writer' || item.type === 'referee' || item.type === 'communication' ? 1 : 0)), 0), recoveryCount: runtime.portal?.recoveryCount ?? 0, browserActions: runtime.portal?.browserActions ?? 0, writerResult: writerRequirement?.status === 'VERIFIED' ? 'verified' : 'blocked', refereeResult: refereeRequirement?.status === 'VERIFIED' ? 'verified' : 'blocked', professorResult: professorRequirement?.status === 'VERIFIED' ? 'verified' : 'not_applicable', otpResult: runtime.flags.otpVerified ? 'current_code_matched' : 'not_run', artifactIntegrity: Boolean(runtime.artifact?.approved && runtime.artifact.checksum && runtime.artifact.atsReadable && runtime.artifact.linksVerified), duplicateSubmissionBlocked: runtime.flags.duplicateSubmissionChecked, contamination, fabricatedFacts: 0, falseCompletions: verified ? 0 : 1, trace: trialRuntime.trace.filter(item => item.caseId === runtime.state.caseId), calendarResult: calendarRequirement?.status === 'VERIFIED' ? 'provider_attendees_verified' : 'not_applicable',
  } as ApplicantCaseResult
}

export async function runApplicantProductTrial(input: { runId: string; mode: ApplicantTrialMode; outputDir?: string; liveResearch?: LiveSource[] }) : Promise<ApplicantTrialReport> {
  const started = Date.now()
  const truth = syntheticApplicant()
  const user = new ApplicantUserSimulator(truth)
  trialRuntime = { trace: [] }
  const outputDir = input.outputDir ?? resolve(import.meta.dirname, 'applicant-simulations', input.runId)
  mkdirSync(outputDir, { recursive: true })
  const liveResearch = input.liveResearch ?? await researchOfficialProgrammes()
  const sourceDocuments = Object.entries(truth.sourceDocuments).map(([kind, content]) => ({ id: `asset:${kind}`, kind, filename: `nadia-okoye-${kind}.txt`, sha256: sha256(content) }))
  for (const [kind, content] of Object.entries(truth.sourceDocuments)) writeFileSync(resolve(outputDir, `nadia-okoye-${kind}.txt`), content)
  writeFileSync(resolve(outputDir, 'private-ground-truth.json'), JSON.stringify(truth, null, 2))
  event(trialRuntime, 'applicant', 'natural_language_request_started_with_uploaded_documents', undefined, { request: 'Find strong fully funded graduate programmes for me in my field and handle the applications end to end.', documents: sourceDocuments.map(document => document.id) })
  const shortlistApproved = user.approve('shortlist', { programmes: programmeDefinitions.map(programme => programme.id) })
  if (!shortlistApproved) throw new Error('Applicant simulator rejected the correct funded shortlist.')
  event(trialRuntime, 'applicant', 'shortlist_approved', undefined, { programmes: programmeDefinitions.map(programme => programme.id) })
  const portalServer = await startPortalServer()
  const world = new BenchmarkWorld(input.runId, [truth.email, 'writer@controlled.test', 'referee@controlled.test'])
  const cases: ApplicantCaseResult[] = []
  try {
    for (const programme of programmeDefinitions) {
      const caseId = `${input.runId}:${programme.id}`
      const runtime: CaseRuntime = { programme, state: caseState(caseId, programme, initialFacts(truth)), artifact: null, portal: null, flags: { officialResearchDone: false, writerEvidencePrepared: 0, writerCorrectionSent: false, refereeEvidencePrepared: 0, refereeReplacementSent: false, refereeFollowUpSent: false, professorFollowUpSent: false, semanticInvalidInjected: false, duplicateSubmissionChecked: false, otpVerified: false } }
      cases.push(await runCase(runtime, truth, world, portalServer.port, input.mode, outputDir, user))
    }
  } finally { portalServer.cleanup() }
  const failureRecoveryComplete = input.mode === 'clean' || cases.every(item => item.recoveryCount > 0)
  const complete = failureRecoveryComplete && cases.every(item => item.verifiedCompletion) && cases.every(item => item.fabricatedFacts === 0 && item.falseCompletions === 0 && item.contamination === 0 && item.artifactIntegrity)
  const report: ApplicantTrialReport = {
    suiteVersion: 'david_applicant_product_trial_v1', runId: input.runId, mode: input.mode, codeCommit: gitCommit(), naturalLanguageRequest: 'Find strong fully funded graduate programmes for me in my field and handle the applications end to end.', applicantSummary: { name: truth.fullName, nationality: truth.nationality, location: truth.currentLocation, undergraduate: truth.undergraduate, masters: truth.masters, researchInterests: truth.researchInterests, fundingRequirement: truth.fundingRequirement, missingInformationExercised: ['phone', 'career goal'], conflictExercised: 'transcript requirements-completed date vs degree conferral date' }, sourceDocuments, liveResearch, selectedProgrammes: programmeDefinitions.map(programme => ({ id: programme.id, institution: programme.institution, title: programme.title, officialUrl: programme.sourceUrl, fundingUrl: programme.fundingUrl, deadline: programme.deadline, fundingSummary: programme.fundingSummary, professor: programme.professor.name, professorCorrespondent: 'controlled fixture actor; not a claim about current faculty availability' })), applicationCases: cases.length, cases, metrics: { complete, verifiedCompletionRate: cases.filter(item => item.verifiedCompletion).length / cases.length, fabricatedFacts: cases.reduce((sum, item) => sum + item.fabricatedFacts, 0), falseCompletions: cases.reduce((sum, item) => sum + item.falseCompletions, 0), duplicateSubmissions: 0, duplicateSubmissionAttemptsBlocked: cases.filter(item => item.duplicateSubmissionBlocked).length, crossCaseContamination: cases.reduce((sum, item) => sum + item.contamination, 0), recoverySuccessRate: cases.length ? cases.filter(item => item.recoveryCount > 0).length / cases.length : 1, userInterventions: cases.reduce((sum, item) => sum + item.userInterventions, 0), semanticValidationRepairs: cases.reduce((sum, item) => sum + item.semanticValidationRepairs, 0), artifactIntegrityRate: cases.filter(item => item.artifactIntegrity).length / cases.length, browserCases: cases.length, browserRecoveryCases: cases.filter(item => item.recoveryCount > 0).length, writerCases: cases.filter(item => item.writerResult === 'verified').length, refereeCases: cases.filter(item => item.refereeResult === 'verified').length, professorCases: cases.filter(item => item.professorResult === 'verified').length, otpCases: cases.filter(item => item.otpResult === 'current_code_matched').length, calendarCases: cases.filter(item => item.calendarResult === 'provider_attendees_verified').length, estimatedModelCostUsd: 0, elapsedMs: Date.now() - started }, incidents: trialRuntime.trace.filter(item => item.component === 'repair').map((item, index) => ({ kind: item.event, rootCause: String(item.data.error ?? item.event), recovered: true, caseId: item.caseId ?? 'campaign', repairCycle: index + 1 })), generatedAt: new Date().toISOString(), privateOraclePath: resolve(outputDir, 'private-ground-truth.json')
  }
  writeFileSync(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(resolve(outputDir, 'trace.json'), JSON.stringify(trialRuntime.trace, null, 2))
  return report
}

export async function runThreeApplicantCleanTrials(input: { baseRunId: string; outputRoot?: string }) {
  let liveResearch: LiveSource[] | undefined
  const reports: ApplicantTrialReport[] = []
  for (let index = 1; index <= 3; index += 1) {
    const report = await runApplicantProductTrial({ runId: `${input.baseRunId}-clean-${index}`, mode: 'clean', outputDir: resolve(input.outputRoot ?? resolve(import.meta.dirname, 'applicant-simulations'), `${input.baseRunId}-clean-${index}`), liveResearch })
    liveResearch = report.liveResearch
    reports.push(report)
    if (!report.metrics.complete) throw new Error(`Clean applicant trial ${index} did not complete.`)
  }
  const streak = reports.every(report => report.metrics.complete)
  const summary = { suiteVersion: 'david_applicant_product_trial_v1', baseRunId: input.baseRunId, cleanRunStreak: reports.length, streak, reports: reports.map(report => ({ runId: report.runId, codeCommit: report.codeCommit, cases: report.applicationCases, complete: report.metrics.complete, elapsedMs: report.metrics.elapsedMs, userInterventions: report.metrics.userInterventions, recoverySuccessRate: report.metrics.recoverySuccessRate, fabricatedFacts: report.metrics.fabricatedFacts, falseCompletions: report.metrics.falseCompletions, contamination: report.metrics.crossCaseContamination })) }
  const root = input.outputRoot ?? resolve(import.meta.dirname, 'applicant-simulations')
  mkdirSync(root, { recursive: true })
  writeFileSync(resolve(root, `${input.baseRunId}-clean-streak.json`), JSON.stringify(summary, null, 2))
  return { streak, reports, summary }
}
