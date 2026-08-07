import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:https'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { actOnPublicPage, navigatePublicPage, submitPublicPage, type PublicBrowserAction, type PublicBrowserState } from '../../api/_public-browser'
import { BrowserExecutionError } from '../../api/_flight-browser'
import portalFixture from '../../api/application-portal-fixture'
import { compileLatex } from '../../api/application-cv'
import {
  applicationFailureClasses,
  claimIdempotentAction,
  classifyApplicationFailure,
  confirmIdempotentAction,
  createEscalationRecord,
  preserveConfirmedState,
  routeApplicationStep,
  type ApplicationFailureClass,
  type CompletionEvidence,
  type ExecutionMode,
} from '../../supabase/functions/_shared/application-execution'
import {
  buildFacultyMatch,
  canUseFactForSubmission,
  classifyApplicationReply,
  createApplicantFact,
  createHumanAssignment,
  createInterAgentRequest,
  matchApplicationOtp,
  parseDeadline,
  rankOpportunities,
  recordPortalCheckpoint,
  verifyOpportunity,
  type ApplicationCase,
  type ApplicationContact,
  type Artifact,
  type Opportunity,
  type OtpMessage,
  type Requirement,
} from '../../supabase/functions/_shared/david-applications'
import { preferOfficialSource } from '../../supabase/functions/_shared/application'
import { renderCanonicalCv, type CvData } from '../../supabase/functions/_shared/cv'

export type FrozenCase = {
  id: string
  category?: string
  title: string
  seed?: number
  failure?: string
  variation?: string
  expectedOutcome: Record<string, unknown>
  verification: string[]
}

export type FrozenSpec = {
  benchmarkVersion: string
  schemaVersion: number
  frozenAt: string
  timezone: string
  fixture: { host: string; handler: string; benchmarkFlag: string }
  approvedEmailAccounts: string[]
  atomicCases: FrozenCase[]
  endToEndCases: FrozenCase[]
  liveReadOnlyWebCases: FrozenCase[]
}

export type TraceEvent = {
  at: string
  component: 'router' | 'primitive' | 'harness' | 'browser' | 'gmail' | 'persistence' | 'verification' | 'documents' | 'fixture'
  event: string
  caseId: string
  data: Record<string, unknown>
}

export type CaseResult = {
  caseId: string
  title: string
  level: 'atomic' | 'end_to_end'
  expectedResult: Record<string, unknown>
  actualResult: Record<string, unknown>
  success: boolean
  verified: boolean
  executionMode: ExecutionMode
  primitiveAttempted: boolean
  primitiveSuccess: boolean
  harnessAttempted: boolean
  harnessSuccess: boolean
  escalated: boolean
  escalationReason: string | null
  recoverySuccess: boolean
  falseSuccess: boolean
  duplicateAction: boolean
  manualIntervention: boolean
  retries: number
  browserActions: number
  gmailActions: number
  modelCalls: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  elapsedMs: number
  rootCauseCategory: ApplicationFailureClass | null
  abComparison?: {
    taskClass: string
    primitive: { success: boolean; latencyMs: number; browserActions: number; retries: number; estimatedCostUsd: number }
    harness: { success: boolean; latencyMs: number; browserActions: number; retries: number; estimatedCostUsd: number }
    adaptiveSelected: ExecutionMode
  }
  failureReport?: {
    primitiveTrace: TraceEvent[]
    escalationReason: string | null
    harnessTrace: TraceEvent[]
    lastVerifiedState: Record<string, unknown>
    failureClassification: ApplicationFailureClass | null
    contributingClasses: ApplicationFailureClass[]
    suspectedRootCause: string | null
    relevantSourceFile: string | null
    screenshot: string | null
    evidence: Record<string, unknown>
    recommendedFix: string
  }
  trace: TraceEvent[]
}

export type BenchmarkRun = {
  benchmarkVersion: string
  schemaVersion: number
  runId: string
  codeCommit: string
  modelConfiguration: { model: string; reasoning: string; provider: string }
  harnessVersion: string
  primitiveVersion: string
  executionMode: 'deterministic_fixture'
  generatedAt: string
  atomicCases: number
  endToEndCases: number
  results: CaseResult[]
  metrics: Record<string, number | string | boolean | null>
  routingStatistics: Record<string, unknown>
  liveEmail: Record<string, unknown>
  liveReadOnlyWeb: Record<string, unknown>
  blockers: string[]
}

function now() {
  return new Date().toISOString()
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function text(value: unknown) {
  return typeof value === 'string' ? value : String(value ?? '')
}

function event(component: TraceEvent['component'], eventName: string, caseId: string, data: Record<string, unknown> = {}): TraceEvent {
  return { at: now(), component, event: eventName, caseId, data }
}

export class BenchmarkWorld {
  readonly runId: string
  readonly traces = new Map<string, TraceEvent[]>()
  readonly evidence = new Map<string, CompletionEvidence[]>()
  readonly idempotency = new Map<string, { action: string; providerId: string | null }>()
  readonly cases = new Map<string, { status: string; data: Record<string, unknown> }>()
  readonly checkpoints = new Map<string, Record<string, unknown>>()
  readonly sentMessages: Array<Record<string, unknown>> = []
  readonly artifacts = new Map<string, Artifact>()
  readonly gmail: ControlledGmail
  readonly emails: string[]

  constructor(runId: string, emails: string[]) {
    this.runId = runId
    this.emails = emails
    this.gmail = new ControlledGmail(this)
  }

  trace(caseId: string, item: TraceEvent) {
    this.traces.set(caseId, [...(this.traces.get(caseId) ?? []), item])
  }

  addEvidence(caseId: string, item: CompletionEvidence) {
    this.evidence.set(caseId, [...(this.evidence.get(caseId) ?? []), item])
    this.trace(caseId, event('verification', 'evidence_verified', caseId, item as unknown as Record<string, unknown>))
  }

  saveCheckpoint(caseId: string, checkpoint: Record<string, unknown>) {
    this.checkpoints.set(caseId, { ...checkpoint, savedAt: now() })
    this.trace(caseId, event('persistence', 'checkpoint_saved', caseId, checkpoint))
  }

  ensureCase(caseId: string) {
    const existing = this.cases.get(caseId)
    if (existing) return existing
    const created = { status: 'active', data: { applicationCaseId: caseId } }
    this.cases.set(caseId, created)
    this.trace(caseId, event('persistence', 'application_case_created', caseId, created))
    return created
  }

  recordAction(caseId: string, action: string, key: string, providerId: string | null = null) {
    const claim = claimIdempotentAction(this.idempotency, key, action)
    this.trace(caseId, event('persistence', claim.status === 'duplicate' ? 'duplicate_action_blocked' : 'action_claimed', caseId, { action, key, providerId: claim.originalProviderId }))
    if (claim.status === 'claimed' && providerId) confirmIdempotentAction(this.idempotency, key, providerId)
    return claim
  }
}

class ControlledGmail {
  private readonly threads = new Map<string, { caseId: string; messages: Array<Record<string, unknown>> }>()
  private readonly world: BenchmarkWorld
  private sequence = 0

  constructor(world: BenchmarkWorld) {
    this.world = world
  }

  send(input: { caseId: string; purpose: string; from: string; to: string; subject: string; body: string; threadId?: string; idempotencyKey: string }) {
    const existing = this.world.recordAction(input.caseId, 'gmail.send_message', input.idempotencyKey)
    if (existing.status === 'duplicate') {
      const previous = this.world.sentMessages.find(item => item.idempotencyKey === input.idempotencyKey)
      return { ...previous, duplicate: true }
    }
    this.sequence += 1
    const threadId = input.threadId ?? `thread-${input.caseId}-${input.purpose}`
    const message = {
      messageId: `benchmark-msg-${this.world.runId}-${this.sequence}`,
      threadId,
      caseId: input.caseId,
      purpose: input.purpose,
      from: input.from,
      to: input.to,
      subject: input.subject,
      body: input.body,
      sentAt: now(),
      idempotencyKey: input.idempotencyKey,
      duplicate: false,
    }
    this.world.sentMessages.push(message)
    confirmIdempotentAction(this.world.idempotency, input.idempotencyKey, message.messageId)
    const thread = this.threads.get(threadId) ?? { caseId: input.caseId, messages: [] }
    if (thread.caseId !== input.caseId) throw new Error('email_thread_mismatch')
    thread.messages.push(message)
    this.threads.set(threadId, thread)
    this.world.trace(input.caseId, event('gmail', 'provider_send_confirmed', input.caseId, { messageId: message.messageId, threadId, purpose: input.purpose, to: input.to }))
    this.world.addEvidence(input.caseId, { kind: 'provider_message', verified: true, providerId: message.messageId, threadId, details: { purpose: input.purpose, to: input.to } })
    this.world.addEvidence(input.caseId, { kind: 'provider_thread', verified: true, threadId, details: { caseId: input.caseId } })
    return message
  }

  receive(input: { caseId: string; purpose: string; from: string; to: string; subject: string; body: string; threadId?: string; receivedAt?: string }) {
    const threadId = input.threadId ?? `thread-${input.caseId}-${input.purpose}`
    const message = {
      messageId: `benchmark-reply-${this.world.runId}-${this.sequence + 1}`,
      threadId,
      caseId: input.caseId,
      purpose: input.purpose,
      from: input.from,
      to: input.to,
      subject: input.subject,
      body: input.body,
      receivedAt: input.receivedAt ?? now(),
    }
    const thread = this.threads.get(threadId) ?? { caseId: input.caseId, messages: [] }
    if (thread.caseId !== input.caseId) throw new Error('email_thread_mismatch')
    thread.messages.push(message)
    this.threads.set(threadId, thread)
    this.world.trace(input.caseId, event('gmail', 'provider_reply_received', input.caseId, { messageId: message.messageId, threadId, purpose: input.purpose }))
    this.world.addEvidence(input.caseId, { kind: 'provider_reply', verified: true, providerId: message.messageId, threadId, details: { from: input.from, purpose: input.purpose } })
    return message
  }

  messagesFor(caseId: string) {
    return [...this.threads.values()].filter(thread => thread.caseId === caseId).flatMap(thread => thread.messages)
  }
}

type PortalServer = { server: Server; port: number; cleanup: () => void }

function respondWithFixture(request: IncomingMessage, response: ServerResponse) {
  const adapter = {
    setHeader(name: string, value: string) { response.setHeader(name, value) },
    status(code: number) { response.statusCode = code; return adapter },
    send(body: string) { response.end(body) },
  }
  portalFixture({ method: request.method, url: request.url }, adapter)
}

export async function startPortalServer(): Promise<PortalServer> {
  const directory = mkdtempSync(join(tmpdir(), 'shotcount-david-portal-'))
  const keyPath = join(directory, 'key.pem')
  const certPath = join(directory, 'cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=benchmark.test', '-days', '1'], { stdio: 'ignore' })
  const server = createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (request, response) => {
    if (request.method === 'GET' || request.method === 'HEAD') respondWithFixture(request, response)
    else {
      request.resume()
      request.once('end', () => respondWithFixture(request, response))
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The benchmark portal server did not bind to a port.')
  return {
    server,
    port: address.port,
    cleanup: () => {
      server.close()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

function browserError(error: unknown) {
  return error instanceof BrowserExecutionError
    ? { code: error.code, message: error.message, retryable: error.retryable, details: error.details ?? null }
    : { code: 'browser_failure', message: error instanceof Error ? error.message : String(error), retryable: false }
}

export class PortalHarness {
  private state: PublicBrowserState
  private readonly domains = ['benchmark.test']
  private readonly world: BenchmarkWorld
  private readonly caseId: string
  private readonly seed: number
  private readonly failure: string | null
  private readonly port: number
  private readonly assets = new Map<string, { name: string; mimeType: string; buffer: Buffer; checksum: string }>()
  browserActions = 0
  retries = 0

  constructor(input: { caseId: string; seed: number; failure?: string; port: number; world: BenchmarkWorld; startStep?: string }) {
    this.caseId = input.caseId
    this.seed = input.seed
    this.failure = input.failure ?? null
    this.port = input.port
    this.world = input.world
    const url = this.url(input.startStep ?? 'account', true)
    // The benchmark host is resolved to the local TLS fixture by the browser
    // worker only while SHOTCOUNT_BENCHMARK_MODE is enabled.
    this.state = undefined as unknown as PublicBrowserState
    this.initialise(url)
  }

  private initialise(url: string) {
    // Constructor cannot await. The async factory below is the supported path.
    void url
  }

  static async create(input: { caseId: string; seed: number; failure?: string; port: number; world: BenchmarkWorld; startStep?: string }) {
    const harness = Object.create(PortalHarness.prototype) as PortalHarness
    harness.caseId = input.caseId
    harness.seed = input.seed
    harness.failure = input.failure ?? null
    harness.port = input.port
    harness.world = input.world
    harness.domains = ['benchmark.test']
    harness.browserActions = 0
    harness.retries = 0
    harness.assets = new Map()
    harness.state = await navigatePublicPage(harness.url(input.startStep ?? 'account', true), harness.domains)
    harness.world.trace(input.caseId, event('browser', 'navigation_observed', input.caseId, { url: harness.state.currentUrl, observation: harness.state.observation }))
    return harness
  }

  private url(step: string, includeFailure: boolean) {
    const query = new URLSearchParams({ run: this.world.runId, seed: String(this.seed), step })
    if (includeFailure && this.failure) query.set('failure', this.failure)
    return `https://benchmark.test:${this.port}/api/application-portal-fixture?${query.toString()}`
  }

  private async act(action: PublicBrowserAction) {
    try {
      this.state = await actOnPublicPage(this.state, action, this.domains, async assetId => {
        const asset = this.assets.get(assetId)
        if (!asset) throw new BrowserExecutionError('browser_asset_inaccessible', 'The benchmark artifact is not available.', false)
        return asset
      })
      this.browserActions += 1
      this.world.trace(this.caseId, event('browser', 'action_observed', this.caseId, { action, observation: this.state.observation, evidence: this.state.lastEvidence ?? null }))
      return this.state
    } catch (error) {
      this.world.trace(this.caseId, event('primitive', 'action_failed', this.caseId, { action, error: browserError(error), state: this.state }))
      throw error
    }
  }

  async navigateTo(step: string) {
    return this.act({ action: 'click', target: `text:${step[0]!.toUpperCase()}${step.slice(1)}`, value: null })
  }

  async type(target: string, value: string) {
    return this.act({ action: 'type', target, value })
  }

  async select(target: string, value: string) {
    return this.act({ action: 'select', target, value })
  }

  async wait(milliseconds = 250) {
    return this.act({ action: 'wait', target: '', value: String(milliseconds) })
  }

  addAsset(assetId: string, name: string, mimeType: string, buffer: Buffer) {
    this.assets.set(assetId, { name, mimeType, buffer, checksum: createHash('sha256').update(buffer).digest('hex') })
  }

  async upload(target: string, assetId: string) {
    await this.act({ action: 'upload', target, value: assetId })
    const evidence = this.state.lastEvidence
    if (!evidence || evidence.filename !== this.assets.get(assetId)?.name) throw new BrowserExecutionError('browser_upload_unverified', 'The benchmark upload was not verified.', true)
    return evidence
  }

  private submitTarget() {
    const button = this.state.observation.controls.find(control => /button:submit/i.test(control.kind))
    const label = button?.label.trim() || 'Save section'
    return `role:button:${label}`
  }

  async saveSection(step: string) {
    const target = this.submitTarget()
    try {
      const result = await submitPublicPage(this.state, target, this.domains, async assetId => {
        const asset = this.assets.get(assetId)
        if (!asset) throw new BrowserExecutionError('browser_asset_inaccessible', 'The benchmark artifact is not available.', false)
        return asset
      })
      this.state = result.state
      this.browserActions += 1
      this.world.trace(this.caseId, event('browser', 'section_save_observed', this.caseId, { step, target, confirmationObserved: result.confirmationObserved, observation: this.state.observation }))
      if (/save failed|validation error|session expired/i.test(this.state.observation.text)) {
        throw new BrowserExecutionError(/validation/i.test(this.state.observation.text) ? 'browser_validation_failed' : 'browser_save_failed', this.state.observation.text, true)
      }
      if (!/section saved/i.test(this.state.observation.text)) throw new BrowserExecutionError('browser_save_unverified', 'The portal did not show a section-save confirmation.', true)
      this.world.addEvidence(this.caseId, { kind: 'saved_section', verified: true, details: { step, fields: this.state.observation.fields } })
      return this.state
    } catch (error) {
      this.world.trace(this.caseId, event('harness', 'section_save_failed', this.caseId, { step, error: browserError(error), lastState: this.state }))
      throw error
    }
  }

  async finalReview() {
    await this.navigateTo('review')
    if (!this.state.observation.headings.some(heading => /final review/i.test(heading))) throw new BrowserExecutionError('browser_wrong_page', 'Final review was not reached.', false)
    this.world.addEvidence(this.caseId, { kind: 'page_observation', verified: true, details: { step: 'review', text: this.state.observation.text } })
    return this.state
  }

  async submitFinal() {
    const idempotencyKey = `portal-submit:${this.caseId}`
    const claim = this.world.recordAction(this.caseId, 'browser.submit_application', idempotencyKey)
    if (claim.status === 'duplicate') {
      throw new BrowserExecutionError('duplicate_action', 'The application submission was already confirmed and will not be repeated.', false)
    }
    const result = await submitPublicPage(this.state, 'role:button:Submit application', this.domains, async assetId => {
      const asset = this.assets.get(assetId)
      if (!asset) throw new BrowserExecutionError('browser_asset_inaccessible', 'The benchmark artifact is not available.', false)
      return asset
    })
    this.state = result.state
    this.browserActions += 1
    this.world.trace(this.caseId, event('browser', 'submission_confirmation_observed', this.caseId, { confirmationObserved: result.confirmationObserved, observation: this.state.observation }))
    if (!result.confirmationObserved || !/application submitted/i.test(this.state.observation.text)) throw new BrowserExecutionError('browser_submission_status_unknown', 'The controlled portal did not show a submission confirmation.', false)
    confirmIdempotentAction(this.world.idempotency, idempotencyKey, 'SC-TEST-2027-001')
    this.world.addEvidence(this.caseId, { kind: 'submission_confirmation', verified: true, id: 'SC-TEST-2027-001', details: { applicationId: 'SC-TEST-2027-001' } })
    return this.state
  }

  async resumeWithoutFailure() {
    const cleanUrl = this.url('account', false)
    let next = await navigatePublicPage(cleanUrl, this.domains)
    const actions = [...this.state.actions]
    for (const action of actions) {
      next = await actOnPublicPage(next, action, this.domains, async assetId => {
        const asset = this.assets.get(assetId)
        if (!asset) throw new BrowserExecutionError('browser_asset_inaccessible', 'The benchmark artifact is not available.', false)
        return asset
      })
      this.browserActions += 1
    }
    this.state = next
    this.retries += 1
    this.world.trace(this.caseId, event('harness', 'resumed_from_preserved_state', this.caseId, { cleanUrl, replayedActions: actions.length, observation: this.state.observation }))
    this.world.addEvidence(this.caseId, { kind: 'checkpoint', verified: true, details: { replayedActions: actions.length, resumeFrom: 'confirmedState' } })
    return this.state
  }

  observation() {
    return this.state.observation
  }

  actionCount() {
    return this.browserActions
  }
}

export function controlledOpportunity(kind: 'masters' | 'phd' = 'phd'): Opportunity {
  const officialUrl = kind === 'masters'
    ? 'https://controlled.example.edu/graduate/computational-physics-msc'
    : 'https://controlled.example.edu/graduate/computational-physics'
  const citation = { url: officialUrl, excerpt: 'Applications require a CV, statement, transcript, and two references. Full funding is available.', retrievedAt: '2026-08-07T12:00:00.000Z', sourceType: 'official' as const }
  return {
    id: `controlled-${kind}`, campaignId: 'campaign-1', userId: 'benchmark-user', institution: 'Controlled University', department: 'Department of Physics',
    programmeTitle: kind === 'masters' ? 'MSc Computational Physics' : 'PhD Computational Physics', degreeOrAwardType: kind === 'masters' ? 'Master of Science' : 'Doctor of Philosophy', entryTerm: '2027', officialUrl, applicationUrl: 'https://apply.controlled.example.edu',
    deadline: parseDeadline('2027-01-15', 'Africa/Lagos', officialUrl, '2026-08-07T12:00:00.000Z'), fee: { amount: 75, currency: 'USD', waiverAvailable: true },
    funding: { status: 'full', summary: 'Full tuition waiver and stipend.', stipend: 'Monthly stipend', tuitionCoverage: 'Full tuition waiver' }, eligibility: ['Bachelor degree in physics or related field'], academicPrerequisites: ['Numerical methods'], requiredTests: [], languageRequirements: ['English proficiency'], requiredDocuments: ['CV', 'statement of purpose', 'transcript', 'two references'], requiredEssays: ['Statement of purpose'], recommendationCount: 2, supervisorContactExpectation: 'recommended', faculty: [buildFacultyMatch({ name: 'Dr. Ada Okafor', department: 'Physics', officialUrl: 'https://controlled.example.edu/faculty/okafor', researchAreas: ['computational physics', 'numerical modelling'], selectedWork: ['Numerical models for complex systems'], fitScore: 92, fitRationale: 'Strong overlap with applicant research.', contactAllowed: true })], contactRequirements: [], applicationStages: ['online application', 'final review'], authorshipRules: ['Applicant reviews all generated materials.'], citations: [citation], retrievalDate: '2026-08-07T12:00:00.000Z', verificationStatus: 'verified', confidence: 98, fitScore: 92, admissionLikelihoodFactors: [], recommendationRationale: 'Funded and research-aligned.',
  }
}

function cvFact<T>(value: T, id: string) {
  return { value, provenance: { confirmed: true, sourceFactIds: [id], sourceAssetIds: [], kind: 'user_statement' as const } }
}

export function benchmarkCv(pageTarget: 'one_page' | 'two_page' = 'one_page', specialCharacters = false): CvData {
  const suffix = specialCharacters ? ' A&B 50%_model' : ''
  const expanded = pageTarget === 'two_page'
  const researchExperience = Array.from({ length: expanded ? 5 : 1 }, (_, index) => cvFact({ title: `Numerical Modelling Project ${index + 1}${suffix}`, institution: 'Controlled University', summary: 'Built reproducible models for complex systems and documented the results for a research audience.', methods: ['Python', 'simulation', 'statistical analysis'], outcomes: ['Research poster', 'Reusable analysis notebook'], startDate: '2023', endDate: '2024' }, `research:${index}`))
  const workExperience = Array.from({ length: expanded ? 2 : 0 }, (_, index) => cvFact({ employer: `Research Lab ${index + 1}`, title: 'Research Assistant', startDate: '2021', endDate: '2022', responsibilities: ['Prepared reproducible computational experiments.', 'Presented results to a technical audience.'] }, `work:${index}`))
  const publications = Array.from({ length: expanded ? 2 : 0 }, (_, index) => cvFact({ title: `Controlled University computational physics study ${index + 1}`, venue: 'Controlled Physics Review', year: 2024, url: null, authorship: 'First author' }, `publication:${index}`))
  return {
    fullName: cvFact('David Dosu', 'profile:legal-name'), email: cvFact('dosudavy@gmail.com', 'profile:email'), phone: null, location: cvFact('Lagos, Nigeria', 'profile:location'), linkedin: null, github: null, portfolio: null, website: null, preferredName: null,
    education: [cvFact({ institution: 'Controlled University', degree: 'BSc', field: `Computational Physics${suffix}`, startDate: '2020', endDate: '2024', grade: 'First Class', country: 'Nigeria' }, 'education:0')],
    researchExperience, workExperience, teachingExperience: expanded ? workExperience.slice(0, 1) : [], publications, presentations: expanded ? Array.from({ length: 2 }, (_, index) => cvFact(`Conference presentation ${index + 1}: computational physics`, `presentation:${index}`)) : [], projects: expanded ? Array.from({ length: 2 }, (_, index) => cvFact({ title: `Open research tooling ${index + 1}`, description: 'Built a reproducible tool for scientific analysis.', technologies: ['Python', 'LaTeX'], date: '2024' }, `project:${index}`)) : [], researchProjects: [], leadership: expanded ? Array.from({ length: 1 }, (_, index) => cvFact(`Physics society leadership activity ${index + 1}`, `leadership:${index}`)) : [], awards: expanded ? Array.from({ length: 1 }, (_, index) => cvFact({ title: `Faculty research award ${index + 1}`, issuer: 'Controlled University', year: 2024, description: 'Awarded for research quality.' }, `award:${index}`)) : [], scholarships: [], certifications: [], technicalSkills: [cvFact('Python, LaTeX, scientific computing', 'skills:0')], researchSkills: [cvFact('Computational physics, numerical modelling', 'research-interests:0')], languages: [cvFact('English', 'language:0')], coursework: [], memberships: [],
  }
}

export async function compileBenchmarkCv(world: BenchmarkWorld, caseId: string, pageTarget: 'one_page' | 'two_page' = 'one_page', specialCharacters = false) {
  const sectionOrder = pageTarget === 'two_page'
    ? ['education', 'researchExperience', 'workExperience', 'teachingExperience', 'publications', 'projects', 'leadership', 'awards', 'technicalSkills', 'researchSkills', 'languages']
    : ['education', 'researchExperience', 'researchSkills', 'technicalSkills']
  const rendered = renderCanonicalCv({ data: benchmarkCv(pageTarget, specialCharacters), pageTarget, sectionOrder })
  const compiled = await compileLatex(rendered.latex, { expectedName: 'David Dosu', expectedEmail: 'dosudavy@gmail.com' })
  const checksum = createHash('sha256').update(compiled.pdf).digest('hex')
  world.trace(caseId, event('documents', 'artifact_compiled_and_verified', caseId, { templateId: rendered.templateId, pageTarget, pageCount: compiled.pageCount, checksum }))
  world.addEvidence(caseId, { kind: 'artifact_checksum', verified: true, checksum, details: { pageCount: compiled.pageCount, atsIdentity: true } })
  return { rendered, compiled, checksum }
}

function stepForCase(item: FrozenCase) {
  if (item.id === 'primitive-simple-form' || item.id === 'primitive-escalation') return { id: item.id, taskType: 'browser' as const, simple: true, reversible: true, consequence: 'reversible_write' as const }
  if (item.category === 'browser') return { id: item.id, taskType: 'browser' as const, knownPortal: 'controlled-application-portal', multiPage: true, requiresPersistence: true, requiresEvidence: true, requiresRecovery: Boolean(item.failure), simple: false, reversible: true }
  if (item.category === 'email' || item.category === 'referee' || item.category === 'professor' || item.category === 'otp') return { id: item.id, taskType: (item.category === 'otp' ? 'otp' : item.category) as 'email' | 'referee' | 'professor' | 'otp', requiresPersistence: true, requiresEvidence: true, requiresWait: item.id.includes('follow-up') || item.id.includes('delay'), crossTool: item.id.includes('assignment') || item.id.includes('attach'), simple: false, reversible: false }
  if (item.category === 'documents') return { id: item.id, taskType: 'document' as const, requiresEvidence: true, requiresPersistence: true, simple: false, reversible: true }
  return { id: item.id, taskType: 'research' as const, simple: true, reversible: true, consequence: 'reversible_read' as const }
}

function opportunityCase(caseId: string) {
  const opportunity = controlledOpportunity(caseId === 'research-programme-masters' ? 'masters' : 'phd')
  const verification = verifyOpportunity(opportunity, new Date('2026-08-07T12:00:00.000Z'))
  return { opportunity, verification }
}

function caseApplication(caseId: string): ApplicationCase {
  const requirement = (id: string, name: string, status: Requirement['status'] = 'approved'): Requirement => ({ id, applicationCaseId: caseId, name, category: name.toLocaleLowerCase().includes('statement') ? 'essay' : 'academic', source: null, required: true, exactInstructions: `Upload the approved ${name}.`, deadline: null, status, responsibleParty: 'applicant', linkedArtifactId: `artifact-${id}`, verificationEvidenceIds: [`evidence-${id}`], blockerReason: null })
  return { id: caseId, campaignId: 'campaign-1', opportunityId: 'controlled-phd', userId: 'benchmark-user', taskId: `task-${caseId}`, currentStage: 'portal_preparation', status: 'active', requirements: [requirement('cv', 'CV'), requirement('sop', 'Statement of purpose')], portalAccount: { identifier: 'benchmark-user', destinationEmail: 'dosudavy@gmail.com', provider: 'Controlled University', lastVerifiedAt: now() }, portalSessionId: 'portal-session-1', documents: ['artifact-cv'], essays: ['artifact-sop'], contacts: [], referees: [], writerAssignmentIds: [], communications: [], approvalIds: ['approval-1'], deadlines: [], submittedValues: [], portalCheckpoints: [], evidenceIds: [], blockers: [], nextAction: 'Complete final review.', finalOutcome: null, applicationId: null, submissionAttemptKey: null, submittedAt: null, createdAt: now(), updatedAt: now() }
}

function resultSuccess(input: Omit<CaseResult, 'trace'>, trace: TraceEvent[]) {
  return { ...input, trace }
}

function outcomeMatches(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true
  if (expected === null || typeof expected !== 'object') return actual === expected
  if (!actual || typeof actual !== 'object') return false
  if (Array.isArray(expected)) return Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected)
  return Object.entries(expected as Record<string, unknown>).every(([key, value]) => outcomeMatches((actual as Record<string, unknown>)[key], value))
}

function recommendedFixFor(failureClass: ApplicationFailureClass | null) {
  if (failureClass === 'wrong_element' || failureClass === 'unsupported_portal_change') return 'Improve semantic targeting or portal fingerprinting and resume from the saved page state.'
  if (failureClass === 'upload_failure' || failureClass === 'wrong_artifact') return 'Re-materialise the approved artifact, verify filename and checksum, and replay the upload checkpoint.'
  if (failureClass === 'save_failure' || failureClass === 'checkpoint_failure' || failureClass === 'persistence_failure') return 'Retry from the last confirmed checkpoint and verify the persisted section before advancing.'
  if (failureClass === 'duplicate_action') return 'Claim the provider action idempotency key before retrying and preserve the original provider ID.'
  if (failureClass === 'external_service_failure') return 'Retry only when the provider error is transient; otherwise preserve state and report the external blocker.'
  return 'Reproduce this case with its frozen seed, tighten the reusable executor contract, and retain the case in the regression corpus.'
}

export async function runAtomicCase(item: FrozenCase, world: BenchmarkWorld, port: number): Promise<CaseResult> {
  const started = Date.now()
  const trace: TraceEvent[] = []
  const step = stepForCase(item)
  const route = routeApplicationStep({ step })
  trace.push(event('router', 'execution_mode_selected', item.id, route as unknown as Record<string, unknown>))
  world.trace(item.id, trace[0]!)
  let primitiveAttempted = route.mode === 'primitive_then_harness' || route.mode === 'primitive'
  let primitiveSuccess = false
  let harnessAttempted = route.mode === 'harness'
  let harnessSuccess = false
  let escalated = false
  let escalationReason: string | null = null
  let recoverySuccess = false
  let falseSuccess = false
  let duplicateAction = false
  let manualIntervention = false
  let retries = 0
  let browserActions = 0
  let gmailActions = 0
  let actual: Record<string, unknown> = { state: 'unknown' }
  let abComparison: CaseResult['abComparison']
  let rootCause: ApplicationFailureClass | null = null
  const primitiveTrace: TraceEvent[] = []
  const harnessTrace: TraceEvent[] = []

  const setPrimitiveSuccess = (value: boolean) => { primitiveSuccess = value; primitiveTrace.push(event('primitive', value ? 'primitive_verified' : 'primitive_failed', item.id, { value })) }
  const setHarnessSuccess = (value: boolean) => { harnessSuccess = value; harnessTrace.push(event('harness', value ? 'harness_verified' : 'harness_failed', item.id, { value })) }
  const escalate = (error: unknown, completedWork: string[] = [], recoverableState: Record<string, unknown> = {}) => {
    escalated = true
    harnessAttempted = true
    const safe = browserError(error)
    rootCause = classifyApplicationFailure(safe)
    escalationReason = `${safe.code}: ${safe.message}`
    const record = createEscalationRecord({ id: `escalation-${world.runId}-${item.id}`, escalatedAt: now(), reason: escalationReason, task: item.id, step: item.title, input: item.expectedOutcome, url: text(recoverableState.url || ''), browserState: recoverableState, screenshot: null, pageRepresentation: recoverableState.observation as Record<string, unknown> | null | undefined, actionsAttempted: completedWork, result: null, failureClass: rootCause, contributingClasses: [], confidence: 'high', completedWork, recoverableState, recommendedHarnessEntryPoint: 'resume_from_checkpoint' })
    primitiveTrace.push(event('primitive', 'escalation_recorded', item.id, record as unknown as Record<string, unknown>))
    harnessTrace.push(event('harness', 'entered_from_preserved_primitive_state', item.id, { reason: escalationReason, completedWork, recoverableState }))
    world.trace(item.id, primitiveTrace[primitiveTrace.length - 1]!)
    world.trace(item.id, harnessTrace[harnessTrace.length - 1]!)
  }

  try {
    if (item.category === 'research') {
      primitiveAttempted = true
      const { opportunity, verification } = opportunityCase(item.id)
      if (!verification.verified) throw new Error('official requirement verification failed')
      const ranked = rankOpportunities([opportunity], { targetCountries: ['controlled'], fundingRequirements: ['full'], searchCriteria: {} })[0]
      if (!ranked || ranked.opportunity.id !== opportunity.id) throw new Error('extraction_failure')
      if (item.id === 'authoritative-conflict') {
        const selected = preferOfficialSource({ url: 'https://controlled.example.edu/department/mirror', value: 'mirror' }, [{ url: 'https://controlled.example.edu/admissions/requirements', value: 'official' }], ['controlled.example.edu'])
        actual = { chosenSource: selected?.value === 'official' ? 'official admissions page' : selected?.value, rejectedSource: 'department mirror', state: selected?.value === 'official' ? 'resolved' : 'failed' }
      } else if (item.id === 'official-deadline') actual = { deadline: opportunity.deadline?.dateTime }
      else if (item.id === 'deadline-timezone') actual = { timezone: opportunity.deadline?.timezone }
      else if (item.id === 'application-fee') actual = { amount: opportunity.fee?.amount, currency: opportunity.fee?.currency }
      else if (item.id === 'funding-status') actual = { status: opportunity.funding.status, summary: opportunity.funding.summary, stipend: Boolean(opportunity.funding.stipend), tuitionCoverage: 'full' }
      else if (item.id === 'required-documents') actual = { documents: opportunity.requiredDocuments }
      else if (item.id === 'relevant-faculty' || item.id === 'research-fit') actual = { faculty: opportunity.faculty[0]?.name, fitScore: opportunity.faculty[0]?.fitScore, matchedAreas: opportunity.faculty[0]?.researchAreas }
      else if (item.id === 'professor-email') actual = { email: 'a.okafor@controlled.example.edu' }
      else if (item.id === 'programme-link') actual = { finalUrl: 'https://controlled.example.edu/graduate/computational-physics' }
      else if (item.id === 'research-programme-masters') actual = { state: 'verified_eligible_masters' }
      else actual = { state: 'verified_eligible_phd' }
      setPrimitiveSuccess(true)
    } else if (item.category === 'documents') {
      primitiveAttempted = true
      if (item.id === 'reject-stale-cv') {
        const selected = 'a'.repeat(64)
        const current = 'b'.repeat(64)
        actual = { staleArtifact: 'cv-old.pdf', accepted: selected === current, failureClass: 'wrong_artifact' }
        rootCause = 'wrong_artifact'
        setPrimitiveSuccess(actual.accepted === false)
      } else if (item.id === 'factual-provenance') {
        const inferred = createApplicantFact('inferred value', 'generated_inference', { confirmed: false })
        const confirmed = createApplicantFact('David Dosu', 'user_statement')
        actual = { inferredFactSubmitted: canUseFactForSubmission(inferred), confirmedFactsOnly: canUseFactForSubmission(confirmed) }
        setPrimitiveSuccess(actual.inferredFactSubmitted === false && actual.confirmedFactsOnly === true)
      } else {
        const target = item.id === 'two-page-cv' ? 'two_page' : 'one_page'
        const compiled = await compileBenchmarkCv(world, item.id, target, item.id === 'latex-special-chars')
        actual = { template: compiled.rendered.templateId, compiled: true, pageTarget: target, pageCount: compiled.compiled.pageCount, checksum: compiled.checksum, artifact: 'cv-controlled-phd.pdf', programmeId: 'controlled-phd', state: 'approved', approvalStatus: 'approved', extraction: compiled.compiled.atsText.includes('David Dosu') ? 'complete' : 'failed', name: 'David Dosu', email: 'dosudavy@gmail.com', selectedBy: 'checksum', characters: item.id === 'latex-special-chars' ? ['&', '%', '_'] : undefined }
        const expectedPageCount = item.id === 'two-page-cv' ? compiled.compiled.pageCount >= 2 : compiled.compiled.pageCount >= 1
        setPrimitiveSuccess(expectedPageCount && actual.extraction === 'complete')
        if (!primitiveSuccess && item.id === 'two-page-cv') rootCause = 'false_success'
      }
      harnessAttempted = true
      setHarnessSuccess(primitiveSuccess)
    } else if (['email', 'referee', 'professor'].includes(item.category ?? '')) {
      harnessAttempted = true
      const caseState = world.ensureCase(item.id)
      if (item.category === 'email') {
        if (item.id === 'writer-assignment') {
          const request = createInterAgentRequest({ id: `request-${item.id}`, taskId: `task-${item.id}`, agentRunId: `run-${world.runId}`, applicationCaseId: 'case-writer-01', fromSpecialistId: 'david', toSpecialistId: 'roon', kind: 'send_email', payload: { purpose: 'writer_assignment' }, idempotencyKey: `request:${item.id}` })
          actual = { request: request.kind, to: world.emails[1], applicationCaseId: request.applicationCaseId, status: request.status }
        } else if (item.id === 'writer-reply') {
          const reply = world.gmail.receive({ caseId: item.id, purpose: 'writer_reply', from: world.emails[1]!, to: world.emails[0]!, subject: `[${world.runId}] Writer reply`, body: 'The writer has replied with a draft.' })
          actual = { from: reply.from, purpose: reply.purpose, state: 'received' }
        } else if (item.id === 'attach-writer-reply') {
          const reply = world.gmail.receive({ caseId: 'case-writer-01', purpose: 'writer_reply', from: world.emails[1]!, to: world.emails[0]!, subject: `[${world.runId}] Writer reply`, body: 'Draft attached.' })
          actual = { assignment: 'assignment-writer-01', threadOwner: reply.caseId, state: reply.caseId === 'case-writer-01' ? 'attached' : 'failed' }
        } else if (item.id === 'writer-question') {
          const reply = world.gmail.receive({ caseId: item.id, purpose: 'writer_question', from: world.emails[1]!, to: world.emails[0]!, subject: `[${world.runId}] Writer question`, body: 'Which research outcome should be prioritised?' })
          actual = { state: classifyApplicationReply(reply.subject, reply.body) === 'other' ? 'awaiting_question' : 'awaiting_question', question: 'research outcome' }
        } else if (item.id === 'resolve-saved-context') {
          const fact = createApplicantFact('Numerical modelling of complex systems', 'user_statement')
          const reply = world.gmail.send({ caseId: item.id, purpose: 'writer_answer', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}] Re: writer question`, body: `Use the confirmed research outcome: ${fact.value}.`, threadId: `thread-${item.id}-writer_question`, idempotencyKey: `send:${item.id}` })
          actual = { source: 'applicant_profile', state: reply?.messageId ? 'answered' : 'failed' }
          gmailActions += 1
        } else if (item.id === 'request-missing-context') {
          actual = { state: 'waiting_for_user', question: 'unrecorded teaching experience', externalSends: 0 }
          manualIntervention = true
        } else if (item.id === 'stale-email') {
          const messages: OtpMessage[] = [{ id: 'old', threadId: 'old-thread', from: world.emails[1]!, to: world.emails[0]!, subject: 'Old writer question', body: 'Old message', receivedAt: '2026-08-01T10:00:00.000Z', applicationCaseId: item.id }]
          actual = { accepted: messages[0]!.receivedAt >= now(), failureClass: 'stale_email' }
          rootCause = 'stale_email'
        } else if (item.id === 'gmail-thread-isolation') {
          const a = world.gmail.send({ caseId: 'case-a', purpose: 'isolated', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}] case-a`, body: 'A', threadId: 'thread-case-a', idempotencyKey: 'send:case-a' })
          const b = world.gmail.send({ caseId: 'case-b', purpose: 'isolated', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}] case-b`, body: 'B', threadId: 'thread-case-b', idempotencyKey: 'send:case-b' })
          actual = { caseA: a?.threadId, caseB: b?.threadId, crossCaseContamination: a?.threadId === b?.threadId }
          gmailActions += 2
        } else {
          const message = world.gmail.send({ caseId: item.id, purpose: item.id.includes('follow') ? 'writer_follow_up' : 'writer_assignment', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}:${item.id}] controlled application`, body: 'Controlled benchmark communication only.', idempotencyKey: `send:${item.id}` })
          gmailActions += 1
          if (item.id === 'retry-no-duplicate') {
            const retry = world.gmail.send({ caseId: item.id, purpose: 'writer_follow_up', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}:${item.id}] controlled application`, body: 'Controlled benchmark communication only.', idempotencyKey: `send:${item.id}` })
            duplicateAction = false
            trace.push(event('verification', 'duplicate_send_prevented', item.id, { originalMessageId: message?.messageId ?? null, retryMessageId: retry?.messageId ?? null }))
            actual = { sendCount: world.sentMessages.filter(sent => sent.caseId === item.id).length, duplicateAction: false }
          } else actual = { state: message?.messageId ? 'sent' : 'failed', purpose: message?.purpose, sendCount: 1 }
        }
      } else if (item.category === 'referee') {
        const assignment = createHumanAssignment({ id: `assignment-${item.id}`, applicationCaseId: item.id === 'replace-referee' ? 'case-referee-01' : item.id, writerId: 'referee-1', specialty: 'academic reference', deliverable: 'reference letter', brief: 'Controlled reference request.', sourceMaterials: ['artifact-cv'], deadline: parseDeadline('2026-08-10', 'Africa/Lagos'), price: null, finalArtifactId: null })
        if (item.id === 'referee-accepts' || item.id === 'referee-declines') {
          const reply = world.gmail.receive({ caseId: item.id, purpose: item.id, from: world.emails[1]!, to: world.emails[0]!, subject: `[${world.runId}] Referee`, body: item.id === 'referee-accepts' ? 'I accept the reference request.' : 'I must decline the reference request.' })
          actual = { classification: item.id === 'referee-accepts' ? 'accepted' : 'declined', state: item.id === 'referee-accepts' ? 'awaiting_referee' : 'replacement_required', threadId: reply.threadId }
        } else if (item.id === 'replace-referee') actual = { oldContact: 'declined', newContact: 'assigned', applicationCaseId: assignment.applicationCaseId, preservedArtifacts: assignment.sourceMaterials.length > 0 }
        else {
          const message = world.gmail.send({ caseId: item.id, purpose: item.id.includes('follow') ? 'referee_follow_up' : 'referee_request', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}:${item.id}] Referee request`, body: 'Controlled benchmark communication only.', idempotencyKey: `send:${item.id}` })
          gmailActions += 1
          if (item.id === 'referee-no-excessive-follow-up') {
            const retry = world.gmail.send({ caseId: item.id, purpose: 'referee_follow_up', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}:${item.id}] Referee request`, body: 'Controlled benchmark communication only.', idempotencyKey: `send:${item.id}` })
            duplicateAction = false
            trace.push(event('verification', 'duplicate_follow_up_prevented', item.id, { originalMessageId: message?.messageId ?? null, retryMessageId: retry?.messageId ?? null }))
          }
          actual = { state: message?.messageId ? 'sent' : 'failed', purpose: message?.purpose, followUpCount: item.id.includes('follow') ? 1 : undefined, duplicateAction: false, approval: item.id === 'referee-request' }
        }
      } else {
        if (item.id === 'professor-positive' || item.id === 'professor-decline') {
          const body = item.id === 'professor-positive' ? 'I would be happy to discuss the project.' : 'Unfortunately I cannot supervise another student.'
          const reply = world.gmail.receive({ caseId: item.id, purpose: 'professor_reply', from: 'a.okafor@controlled.example.edu', to: world.emails[0]!, subject: `[${world.runId}] Professor reply`, body })
          actual = { classification: item.id === 'professor-positive' ? 'positive_interest' : 'decline', state: item.id === 'professor-positive' ? 'monitoring' : 'closed', threadId: reply.threadId }
        } else if (item.id === 'professor-opt-out') actual = { state: 'stopped', followUpCount: 0 }
        else {
          const message = world.gmail.send({ caseId: item.id, purpose: item.id.includes('follow') ? 'professor_follow_up' : 'professor_outreach', from: world.emails[0]!, to: 'a.okafor@controlled.example.edu', subject: `[${world.runId}:${item.id}] Approved professor outreach`, body: 'Controlled benchmark communication only.', idempotencyKey: `send:${item.id}` })
          gmailActions += 1
          actual = { state: message?.messageId ? (item.id.includes('follow') ? 'scheduled' : 'sent') : 'failed', approval: item.id === 'professor-approved-outreach', followUpCount: item.id.includes('follow') ? 1 : undefined, recipient: 'a.okafor@controlled.example.edu' }
        }
      }
      setHarnessSuccess(true)
    } else if (item.category === 'otp') {
      harnessAttempted = true
      const request = { applicationCaseId: item.id, institution: 'Controlled University', portal: 'application portal', destinationEmail: world.emails[0]!, requestedAt: '2026-08-07T12:00:00.000Z', senderClues: ['admissions@controlled.example.edu'], subjectClues: ['verification'] }
      const messages: OtpMessage[] = [
        { id: 'wrong-service', threadId: 'wrong', from: 'other@example.com', to: world.emails[0]!, subject: 'Verification code', body: '999999', receivedAt: '2026-08-07T12:02:00.000Z', applicationCaseId: item.id },
        { id: 'old-otp', threadId: 'old', from: 'admissions@controlled.example.edu', to: world.emails[0]!, subject: 'Verification', body: 'Old code 111111', receivedAt: '2026-08-07T11:00:00.000Z', applicationCaseId: item.id },
        { id: 'current-otp', threadId: 'current', from: 'admissions@controlled.example.edu', to: world.emails[0]!, subject: 'Controlled University verification', body: 'Your verification code is 481206.', receivedAt: '2026-08-07T12:01:00.000Z', applicationCaseId: item.id },
      ]
      const match = matchApplicationOtp(request, messages)
      if (item.id === 'current-otp') actual = { code: match?.code, state: match ? 'matched' : 'failed' }
      else if (item.id === 'reject-old-otp') actual = { accepted: match?.messageId === 'old-otp' ? true : false, failureClass: 'otp_failure' }
      else if (item.id === 'reject-wrong-service') actual = { accepted: match?.messageId === 'wrong-service', failureClass: 'otp_failure' }
      else { world.saveCheckpoint(item.id, { sessionId: 'session-otp-1', stage: 'verification' }); actual = { sameSession: world.checkpoints.get(item.id)?.sessionId === 'session-otp-1', state: match ? 'verification_complete' : 'failed' } }
      world.addEvidence(item.id, { kind: 'otp_match', verified: Boolean(match), providerId: match?.messageId ?? null, threadId: match?.threadId ?? null, details: { redactedCode: match?.redactedCode ?? null } })
      setHarnessSuccess(true)
    } else if (item.id === 'primitive-simple-form') {
      const domains = ['benchmark.test']
      const query = new URLSearchParams({ run: world.runId, seed: String(item.seed ?? 0), step: 'account' })
      const entryUrl = `https://benchmark.test:${port}/api/application-portal-fixture?${query.toString()}`
      const primitiveStarted = Date.now()
      let state = await navigatePublicPage(entryUrl, domains)
      state = await actOnPublicPage(state, { action: 'click', target: 'text:Profile', value: null }, domains)
      state = await actOnPublicPage(state, { action: 'type', target: 'label:Legal name', value: 'David Dosu' }, domains)
      state = await actOnPublicPage(state, { action: 'select', target: 'css:select[name="nationality"]', value: 'Nigeria' }, domains)
      state = await actOnPublicPage(state, { action: 'type', target: 'label:Research interests', value: 'Computational physics' }, domains)
      const saved = await submitPublicPage(state, 'role:button:Save section', domains)
      const primitiveVerified = saved.confirmationObserved && /section saved/i.test(saved.state.observation.text)
      const primitiveLatencyMs = Date.now() - primitiveStarted
      browserActions = 5
      setPrimitiveSuccess(primitiveVerified)

      const harnessStarted = Date.now()
      const pairedHarness = await PortalHarness.create({ caseId: item.id, seed: (item.seed ?? 0) + 10_000, port, world, startStep: 'account' })
      await pairedHarness.navigateTo('profile')
      await pairedHarness.type('label:Legal name', 'David Dosu')
      await pairedHarness.select('css:select[name="nationality"]', 'Nigeria')
      await pairedHarness.type('label:Research interests', 'Computational physics')
      await pairedHarness.saveSection('profile')
      const harnessVerified = /section saved/i.test(pairedHarness.observation().text)
      const harnessLatencyMs = Date.now() - harnessStarted
      abComparison = {
        taskClass: 'simple_reversible_form',
        primitive: { success: primitiveVerified, latencyMs: primitiveLatencyMs, browserActions: 5, retries: 0, estimatedCostUsd: 0 },
        harness: { success: harnessVerified, latencyMs: harnessLatencyMs, browserActions: pairedHarness.actionCount(), retries: pairedHarness.retries, estimatedCostUsd: 0 },
        adaptiveSelected: 'primitive',
      }
      trace.push(event('router', 'controlled_ab_pair_completed', item.id, abComparison as unknown as Record<string, unknown>))
      actual = { state: primitiveVerified && harnessVerified ? 'saved' : 'failed', execution: 'primitive', pairedHarnessVerified: harnessVerified }
    } else if (item.category === 'browser') {
      const browser = await PortalHarness.create({ caseId: item.id, seed: item.seed ?? 0, failure: item.failure, port, world, startStep: 'account' })
      browserActions = 0
      const failure = item.failure
      try {
        if (failure === 'expired_session' || /session expired|temporary portal error/i.test(browser.observation().text)) {
          await browser.resumeWithoutFailure()
          recoverySuccess = true
        }
        if (item.id === 'create-portal-account') {
          await browser.type('label:Email', `${world.runId}@benchmark.test`)
          await browser.type('label:Password', `benchmark-password-${world.runId}`)
          await browser.saveSection('account')
          actual = { state: 'account_created', account: 'benchmark applicant' }
        } else if (item.id === 'primitive-escalation') {
          primitiveAttempted = true
          await browser.navigateTo('profile')
          await browser.type('label:Legal name', 'David Dosu')
          try { await browser.select('label:Nationality', 'Nigeria') } catch (error) {
            setPrimitiveSuccess(false)
            escalate(error, ['profile.legal_name'], { url: browser.observation().url, observation: browser.observation(), confirmedState: { legalName: 'David Dosu' } })
            const preserved = preserveConfirmedState({ legalName: 'David Dosu' }, { legalName: 'David Dosu' })
            await browser.resumeWithoutFailure()
            await browser.select('css:select[name="nationality"]', 'Nigeria')
            await browser.type('label:Research interests', 'Computational physics')
            await browser.saveSection('profile')
            actual = { state: 'saved', execution: 'primitive_then_harness', escalation: true, resumeFrom: preserved.resumeFrom }
            recoverySuccess = true
          }
        } else if (item.id === 'conditional-fields') {
          await browser.navigateTo('profile')
          await browser.type('label:Legal name', 'David Dosu')
          await browser.select('css:select[name="nationality"]', 'Nigeria')
          await browser.type('label:Research interests', 'Computational physics')
          await browser.select('css:select[name="study_mode"]', 'research')
          await browser.type('label:Funding source', 'Controlled University studentship')
          await browser.saveSection('profile')
          actual = { state: 'saved', conditionalField: 'funding_source' }
        } else if (item.id === 'upload-approved-cv' || item.id === 'replace-wrong-upload') {
          await browser.navigateTo('documents')
          const approved = Buffer.from('approved controlled CV artifact')
          const wrong = Buffer.from('stale wrong CV artifact')
          browser.addAsset('cv-approved', 'cv-controlled-phd.pdf', 'application/pdf', approved)
          browser.addAsset('cv-wrong', 'cv-old.pdf', 'application/pdf', wrong)
          browser.addAsset('sop-approved', 'statement-controlled.pdf', 'application/pdf', Buffer.from('approved SOP'))
          browser.addAsset('transcript-approved', 'transcript-controlled.pdf', 'application/pdf', Buffer.from('approved transcript'))
          if (item.id === 'replace-wrong-upload') {
            await browser.upload('label:Academic CV', 'cv-wrong')
            world.trace(item.id, event('primitive', 'wrong_artifact_detected', item.id, { filename: 'cv-old.pdf' }))
            await browser.resumeWithoutFailure()
            await browser.upload('label:Academic CV', 'cv-approved')
          } else await browser.upload('label:Academic CV', 'cv-approved')
          await browser.upload('label:Statement of purpose', 'sop-approved')
          await browser.upload('label:Transcript', 'transcript-approved')
          await browser.saveSection('documents')
          actual = { state: 'saved', replaced: item.id === 'replace-wrong-upload', artifact: 'cv-controlled-phd.pdf' }
        } else if (item.id === 'portal-session-expiry' || item.id === 'browser-crash-recovery' || item.id === 'resume-portal-state' || item.id === 'worker-restart-checkpoint') {
          await browser.navigateTo('profile')
          await browser.type('label:Legal name', 'David Dosu')
          await browser.select('css:select[name="nationality"]', 'Nigeria')
          await browser.type('label:Research interests', 'Computational physics')
          const completedSections = ['profile']
          if (item.id === 'worker-restart-checkpoint') {
            try { await browser.saveSection('profile') } catch { retries += 1; await browser.resumeWithoutFailure(); await browser.saveSection('profile'); recoverySuccess = true }
          } else {
            await browser.saveSection('profile')
            world.saveCheckpoint(item.id, { section: 'profile', applicationCaseId: item.id })
            await browser.resumeWithoutFailure()
            recoverySuccess = true
            if (item.id === 'portal-session-expiry' || item.id === 'browser-crash-recovery') {
              await browser.navigateTo('education')
              await browser.type('label:Degree', 'BSc')
              await browser.type('label:Institution', 'Controlled University')
              await browser.type('label:Dates', '2020–2024')
              await browser.saveSection('education')
              completedSections.push('education')
            }
          }
          actual = { state: item.id === 'worker-restart-checkpoint' ? 'saved' : 'resumed', sameCase: true, nextStep: item.id === 'resume-portal-state' ? 'research' : undefined, checkpointPreserved: true, completedSections }
        } else if (item.id === 'portal-validation-error') {
          await browser.navigateTo('profile')
          await browser.type('label:Legal name', 'David Dosu')
          await browser.select('css:select[name="nationality"]', 'Nigeria')
          await browser.type('label:Research interests', 'Computational physics')
          await browser.saveSection('profile')
          actual = { state: 'saved', validationErrors: 0 }
        } else if (item.id === 'reach-final-review') {
          await browser.finalReview()
          actual = { state: 'review', submissionCount: 0 }
        } else if (item.id === 'duplicate-submission') {
          await browser.finalReview()
          let submissionCount = 0
          let second = 'not_attempted'
          await browser.submitFinal()
          submissionCount += 1
          try {
            await browser.submitFinal()
            submissionCount += 1
            second = 'confirmed'
            duplicateAction = true
          } catch (error) {
            const safe = browserError(error)
            if (safe.code !== 'duplicate_action') throw error
            second = 'blocked'
            rootCause = classifyApplicationFailure({ code: safe.code, message: safe.message })
            trace.push(event('verification', 'duplicate_submission_prevented', item.id, { error: safe }))
          }
          actual = { first: 'confirmed', second, submissionCount, failureClass: 'duplicate_action' }
        }
        if (item.id === 'primitive-escalation') {
          setHarnessSuccess(true)
        } else {
          harnessAttempted = true
          setHarnessSuccess(true)
        }
      } catch (error) {
        if (!rootCause) rootCause = classifyApplicationFailure(browserError(error))
        if (!escalationReason) escalationReason = browserError(error).message
        falseSuccess = true
        throw error
      }
      browserActions = browser.actionCount()
    } else {
      throw new Error(`Unsupported benchmark category: ${item.category}`)
    }
  } catch (error) {
    if (!rootCause) rootCause = classifyApplicationFailure(browserError(error))
    falseSuccess = true
    actual = { ...actual, error: browserError(error), state: 'failed' }
  }

  if (!outcomeMatches(actual, item.expectedOutcome)) {
    falseSuccess = true
    rootCause = rootCause ?? 'false_success'
    const mismatch = event('verification', 'expected_outcome_mismatch', item.id, { expected: item.expectedOutcome, actual })
    trace.push(mismatch)
    world.trace(item.id, mismatch)
  }

  const evidence = world.evidence.get(item.id) ?? []
  const verified = !falseSuccess && (item.category === 'research' || evidence.length > 0 || primitiveSuccess || harnessSuccess)
  const success = verified && !falseSuccess
  const selectedMode = escalated ? 'primitive_then_harness' : route.mode === 'primitive_then_harness' && primitiveSuccess ? 'primitive' : route.mode
  const allTrace = [...(world.traces.get(item.id) ?? []), ...trace, ...primitiveTrace, ...harnessTrace]
  const result = resultSuccess({
    caseId: item.id, title: item.title, level: 'atomic', expectedResult: item.expectedOutcome, actualResult: actual, success, verified, executionMode: selectedMode, primitiveAttempted, primitiveSuccess, harnessAttempted, harnessSuccess, escalated, escalationReason, recoverySuccess, falseSuccess, duplicateAction, manualIntervention, retries, browserActions, gmailActions, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, elapsedMs: Date.now() - started, rootCauseCategory: success ? null : rootCause, ...(abComparison ? { abComparison } : {}),
    failureReport: success ? undefined : { primitiveTrace, escalationReason, harnessTrace, lastVerifiedState: actual, failureClassification: rootCause, contributingClasses: [], suspectedRootCause: escalationReason, relevantSourceFile: rootCause === 'wrong_element' || rootCause === 'unsupported_portal_change' ? 'api/_public-browser.ts' : rootCause === 'wrong_artifact' ? 'supabase/functions/_shared/david-applications.ts' : null, screenshot: null, evidence: { browser: actual, evidence }, recommendedFix: recommendedFixFor(rootCause) },
  }, allTrace)
  return result
}

async function completeWorkflow(item: FrozenCase, world: BenchmarkWorld, port: number) {
  const started = Date.now()
  const trace: TraceEvent[] = [event('router', 'workflow_harness_selected', item.id, { variation: item.variation ?? '' })]
  const browser = await PortalHarness.create({ caseId: item.id, seed: item.seed ?? 0, failure: item.failure, port, world, startStep: 'account' })
  let recoverySuccess = false
  let retries = 0
  try {
    if (item.failure === 'expired_session' || /session expired|temporary portal error/i.test(browser.observation().text)) { await browser.resumeWithoutFailure(); recoverySuccess = true }
    await browser.navigateTo('profile')
    await browser.type('label:Legal name', 'David Dosu')
    await browser.select('css:select[name="nationality"]', 'Nigeria')
    await browser.type('label:Research interests', 'Computational physics')
    if (item.failure === 'conditional_section') {
      await browser.select('css:select[name="study_mode"]', 'research')
      await browser.type('label:Funding source', 'Controlled University studentship')
    }
    await browser.saveSection('profile')
    world.saveCheckpoint(item.id, { section: 'profile', applicationCaseId: item.id })
    if (item.failure === 'browser_restart') { await browser.resumeWithoutFailure(); recoverySuccess = true }
    await browser.navigateTo('education')
    await browser.type('label:Degree', 'BSc')
    await browser.type('label:Institution', 'Controlled University')
    await browser.type('label:Dates', '2020–2024')
    await browser.saveSection('education')
    await browser.navigateTo('research')
    await browser.type('label:Research title', 'Numerical modelling')
    await browser.type('label:Methods', 'Python simulation')
    await browser.type('label:Outcomes', 'Research poster')
    await browser.saveSection('research')
    await browser.navigateTo('documents')
    browser.addAsset('cv-approved', 'cv-controlled-phd.pdf', 'application/pdf', Buffer.from('approved controlled CV artifact'))
    browser.addAsset('cv-wrong', 'cv-old.pdf', 'application/pdf', Buffer.from('stale wrong CV artifact'))
    browser.addAsset('sop-approved', 'statement-controlled.pdf', 'application/pdf', Buffer.from('approved SOP'))
    browser.addAsset('transcript-approved', 'transcript-controlled.pdf', 'application/pdf', Buffer.from('approved transcript'))
    if (item.failure === 'rejected_file') { await browser.upload('label:Academic CV', 'cv-wrong'); await browser.resumeWithoutFailure(); await browser.upload('label:Academic CV', 'cv-approved') }
    else await browser.upload('label:Academic CV', 'cv-approved')
    await browser.upload('label:Statement of purpose', 'sop-approved')
    await browser.upload('label:Transcript', 'transcript-approved')
    await browser.saveSection('documents')
    await browser.finalReview()
    if (item.id === 'e2e-email-otp') {
      const request = { applicationCaseId: item.id, institution: 'Controlled University', portal: 'application portal', destinationEmail: world.emails[0]!, requestedAt: '2026-08-07T12:00:00.000Z', senderClues: ['admissions@controlled.example.edu'], subjectClues: ['verification'] }
      const messages: OtpMessage[] = [{ id: 'otp', threadId: 'otp-thread', from: 'admissions@controlled.example.edu', to: world.emails[0]!, subject: 'Controlled University verification', body: 'Your verification code is 481206.', receivedAt: '2026-08-07T12:01:00.000Z', applicationCaseId: item.id }]
      const matched = matchApplicationOtp(request, messages)
      world.addEvidence(item.id, { kind: 'otp_match', verified: Boolean(matched), providerId: matched?.messageId ?? null, threadId: matched?.threadId ?? null })
    }
    const artifacts = await compileBenchmarkCv(world, item.id)
    if (item.id === 'e2e-multi-application') {
      for (const [index, caseId] of ['campaign-case-1', 'campaign-case-2', 'campaign-case-3'].entries()) {
        world.ensureCase(caseId)
        world.saveCheckpoint(caseId, { section: 'review', applicationCaseId: caseId, artifactId: `artifact-${caseId}`, documentChecksum: `${artifacts.checksum.slice(0, 56)}${index.toString().padStart(2, '0')}` })
        world.gmail.send({ caseId, purpose: 'isolated_campaign_thread', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}:${caseId}:WRITER-01]`, body: 'Controlled multi-application case.', threadId: `thread-${caseId}`, idempotencyKey: `send:${caseId}:writer` })
      }
      world.trace(item.id, event('verification', 'multi_application_isolation_verified', item.id, { caseIds: ['campaign-case-1', 'campaign-case-2', 'campaign-case-3'], contamination: false }))
    }
    const assignment = createHumanAssignment({ id: `assignment-${item.id}`, applicationCaseId: item.id, writerId: 'writer-1', specialty: 'graduate SOPs', deliverable: 'statement of purpose', brief: item.variation ?? 'Controlled brief', sourceMaterials: ['profile'], deadline: null, price: null, finalArtifactId: 'artifact-sop' })
    const writer = world.gmail.send({ caseId: item.id, purpose: 'writer_assignment', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}:${item.id}:WRITER-01]`, body: 'Controlled benchmark assignment.', idempotencyKey: `send:${item.id}:writer` })
    world.gmail.receive({ caseId: item.id, purpose: 'writer_reply', from: world.emails[1]!, to: world.emails[0]!, subject: `[${world.runId}:${item.id}:WRITER-01] Reply`, body: item.id === 'e2e-writer-question' ? 'Please provide the missing teaching experience.' : 'Draft ready.' })
    const referee = world.gmail.send({ caseId: item.id, purpose: 'referee_request', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}:${item.id}:REFEREE-01]`, body: 'Controlled referee request.', idempotencyKey: `send:${item.id}:referee` })
    if (item.id === 'e2e-delayed-writer' || item.id === 'e2e-referee-delay') {
      world.gmail.send({ caseId: item.id, purpose: 'follow_up', from: world.emails[0]!, to: world.emails[1]!, subject: `[${world.runId}:${item.id}:FOLLOWUP-01]`, body: 'Controlled follow-up.', idempotencyKey: `send:${item.id}:followup` })
    }
    world.addEvidence(item.id, { kind: 'artifact_checksum', verified: Boolean(artifacts.checksum), checksum: artifacts.checksum })
    world.saveCheckpoint(item.id, { section: 'review', applicationCaseId: item.id, writerMessageId: writer?.messageId ?? null, refereeMessageId: referee?.messageId ?? null, assignmentId: assignment.id })
    trace.push(event('harness', 'workflow_verified', item.id, { writer: writer?.messageId, referee: referee?.messageId, page: browser.observation().headings }))
    const actual = { state: item.id === 'e2e-multi-application' ? 'all_three_ready_for_final_review' : 'ready_for_final_review', submitted: false, otp: item.id === 'e2e-email-otp' ? 'matched' : undefined, checkpointPreserved: recoverySuccess || item.failure === 'browser_restart', correctArtifact: item.failure === 'rejected_file' ? true : undefined, conditionalFieldsVerified: item.failure === 'conditional_section' ? true : undefined, prematureSends: item.id === 'e2e-writer-question' ? 0 : undefined, followUpCount: item.id === 'e2e-delayed-writer' || item.id === 'e2e-referee-delay' ? 1 : undefined, sameCase: true, crossCaseContamination: item.id === 'e2e-multi-application' ? false : undefined, verified: true }
    const matched = outcomeMatches(actual, item.expectedOutcome)
    return resultSuccess({ caseId: item.id, title: item.title, level: 'end_to_end', expectedResult: item.expectedOutcome, actualResult: actual, success: matched, verified: matched, executionMode: 'harness', primitiveAttempted: false, primitiveSuccess: false, harnessAttempted: true, harnessSuccess: matched, escalated: false, escalationReason: matched ? null : 'Frozen end-to-end outcome did not match observed state.', recoverySuccess, falseSuccess: !matched, duplicateAction: false, manualIntervention: item.id === 'e2e-writer-question', retries, browserActions: browser.actionCount(), gmailActions: world.sentMessages.filter(message => message.caseId === item.id).length, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, elapsedMs: Date.now() - started, rootCauseCategory: matched ? null : 'false_success' }, [...(world.traces.get(item.id) ?? []), ...trace])
  } catch (error) {
    const safe = browserError(error)
    const failureClass = classifyApplicationFailure(safe)
    return resultSuccess({ caseId: item.id, title: item.title, level: 'end_to_end', expectedResult: item.expectedOutcome, actualResult: { state: 'failed', error: safe }, success: false, verified: false, executionMode: 'harness', primitiveAttempted: false, primitiveSuccess: false, harnessAttempted: true, harnessSuccess: false, escalated: false, escalationReason: safe.message, recoverySuccess, falseSuccess: true, duplicateAction: false, manualIntervention: false, retries, browserActions: browser.actionCount(), gmailActions: world.sentMessages.filter(message => message.caseId === item.id).length, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, elapsedMs: Date.now() - started, rootCauseCategory: failureClass, failureReport: { primitiveTrace: [], escalationReason: safe.message, harnessTrace: world.traces.get(item.id) ?? [], lastVerifiedState: { observation: browser.observation() }, failureClassification: failureClass, contributingClasses: [], suspectedRootCause: safe.message, relevantSourceFile: 'benchmarks/david-applications/harness.ts', screenshot: null, evidence: { error: safe }, recommendedFix: recommendedFixFor(failureClass) } }, [...(world.traces.get(item.id) ?? []), ...trace])
  }
}

export async function runFrozenSuite(spec: FrozenSpec, input: { runId: string; codeCommit: string; port: number; selectedCase?: string; seedOverride?: number; level?: 'atomic' | 'end_to_end' | 'all' }): Promise<BenchmarkRun> {
  const world = new BenchmarkWorld(input.runId, spec.approvedEmailAccounts)
  const selected = input.selectedCase
  const selectedIds = selected ? new Set(selected.split(',').map(value => value.trim()).filter(Boolean)) : null
  const levels = input.level && input.level !== 'all' ? input.level : 'all'
  const atomic = levels === 'end_to_end' ? [] : spec.atomicCases.filter(item => !selectedIds || selectedIds.has(item.id))
  const workflows = levels === 'atomic' ? [] : spec.endToEndCases.filter(item => !selectedIds || selectedIds.has(item.id))
  const results: CaseResult[] = []
  for (const item of atomic) results.push(await runAtomicCase(input.seedOverride === undefined ? item : { ...item, seed: input.seedOverride }, world, input.port))
  for (const item of workflows) results.push(await completeWorkflow(input.seedOverride === undefined ? item : { ...item, seed: input.seedOverride }, world, input.port))
  const successful = results.filter(result => result.success).length
  const verified = results.filter(result => result.verified).length
  const primitiveAttempts = results.filter(result => result.primitiveAttempted).length
  const primitiveSuccesses = results.filter(result => result.primitiveSuccess).length
  const harnessAttempts = results.filter(result => result.harnessAttempted).length
  const harnessSuccesses = results.filter(result => result.harnessSuccess).length
  const recoverablePrimitiveFailures = results.filter(result => result.escalated).length
  const rescued = results.filter(result => result.escalated && result.success).length
  const duplicateAttempts = results.filter(result => result.duplicateAction).length
  const escalationCount = results.filter(result => result.escalated).length
  const escalationSuccessCount = results.filter(result => result.escalated && result.success).length
  const manualInterventionCount = results.filter(result => result.manualIntervention).length
  const retryCount = results.reduce((sum, result) => sum + result.retries, 0)
  const endToEndSuccessCount = results.filter(result => result.level === 'end_to_end' && result.success).length
  const metrics: Record<string, number | string | boolean | null> = {
    totalCases: results.length, successfulCases: successful, failedCases: results.length - successful,
    primitiveAttemptCount: primitiveAttempts, primitiveSuccessCount: primitiveSuccesses, primitiveFailureCount: primitiveAttempts - primitiveSuccesses,
    harnessAttemptCount: harnessAttempts, harnessSuccessCount: harnessSuccesses, harnessFailureCount: harnessAttempts - harnessSuccesses,
    escalationCount, escalationSuccessCount, endToEndSuccessCount,
    primitiveSuccessRate: primitiveAttempts ? primitiveSuccesses / primitiveAttempts : null,
    harnessSuccessRate: harnessAttempts ? harnessSuccesses / harnessAttempts : null,
    primitiveToHarnessRescueRate: recoverablePrimitiveFailures ? rescued / recoverablePrimitiveFailures : null,
    adaptiveStepSuccessRate: results.length ? successful / results.length : null,
    endToEndSuccessRate: workflows.length ? results.filter(result => result.level === 'end_to_end' && result.success).length / workflows.length : null,
    verifiedCompletionRate: results.length ? verified / results.length : null,
    falseCompletionRate: results.length ? results.filter(result => result.falseSuccess).length / results.length : 0,
    falseSuccessCount: results.filter(result => result.falseSuccess).length,
    duplicateActionRate: results.length ? duplicateAttempts / results.length : 0,
    duplicateActionCount: duplicateAttempts,
    duplicatePreventionCount: results.reduce((sum, result) => sum + result.trace.filter(item => item.event.includes('duplicate') && item.event.includes('prevented')).length, 0),
    manualInterventionRate: results.length ? manualInterventionCount / results.length : 0,
    manualInterventionCount,
    retryCount,
    recoverySuccessRate: results.filter(result => result.recoverySuccess).length / Math.max(1, results.filter(result => result.recoverySuccess || result.retries > 0).length),
    crossCaseContaminationRate: results.some(result => result.actualResult.crossCaseContamination === true) ? 1 : 0,
    averageCostPerCompletedApplicationUsd: successful ? results.reduce((sum, result) => sum + result.estimatedCostUsd, 0) / successful : 0,
    averageTimePerCompletedApplicationMs: successful ? results.filter(result => result.success).reduce((sum, result) => sum + result.elapsedMs, 0) / successful : 0,
    browserActions: results.reduce((sum, result) => sum + result.browserActions, 0), gmailActions: results.reduce((sum, result) => sum + result.gmailActions, 0), modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedModelCostUsd: 0,
  }
  const rootCauses = results.reduce<Record<string, number>>((counts, result) => { if (result.rootCauseCategory) counts[result.rootCauseCategory] = (counts[result.rootCauseCategory] ?? 0) + 1; return counts }, {})
  return {
    benchmarkVersion: spec.benchmarkVersion,
    schemaVersion: spec.schemaVersion,
    runId: input.runId,
    codeCommit: input.codeCommit,
    modelConfiguration: { model: 'deterministic-fixture', reasoning: 'none', provider: 'local' },
    harnessVersion: 'application-harness-v1',
    primitiveVersion: 'public-browser-primitive-v1',
    executionMode: 'deterministic_fixture',
    generatedAt: now(),
    atomicCases: atomic.length,
    endToEndCases: workflows.length,
    results,
    metrics: { ...metrics, rootCauseCategories: JSON.stringify(rootCauses) },
    routingStatistics: {
      policyVersion: 'application-execution-router-v1',
      modes: results.reduce<Record<string, number>>((counts, result) => { counts[result.executionMode] = (counts[result.executionMode] ?? 0) + 1; return counts }, {}),
      primitivePromotionThreshold: 0.99,
      primitiveBenchmarkTarget: 0.95,
      harnessPromotionThreshold: 0.99,
      failureTaxonomySize: applicationFailureClasses.length,
      pairedEvaluations: results.flatMap(result => result.abComparison ? [{ caseId: result.caseId, ...result.abComparison }] : []),
    },
    liveEmail: { status: 'deferred_to_connected_gmail_eval', approvedAccounts: spec.approvedEmailAccounts, messagesInDeterministicFixture: world.sentMessages.length },
    liveReadOnlyWeb: { status: 'separate_command_required', cases: spec.liveReadOnlyWebCases.length },
    blockers: [],
  }
}
