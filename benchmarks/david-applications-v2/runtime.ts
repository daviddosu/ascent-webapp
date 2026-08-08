import { createHash } from 'node:crypto'
import {
  actOnPublicPage,
  navigatePublicPage,
  submitPublicPage,
  type PublicBrowserState,
} from '../../api/_public-browser'
import { BrowserExecutionError } from '../../api/_flight-browser'
import { internalAgentToolName } from '../../supabase/functions/_shared/agent-tools'
import {
  classifyApplicationFailure,
  routeApplicationStep,
  type ApplicationFailureClass,
} from '../../supabase/functions/_shared/application-execution'
import type {
  ApplicantFixture,
  BenchmarkCase,
  CaseOracle,
  DimensionName,
  DimensionScores,
  ProgrammeFixture,
  ProfileOracle,
  RootCause,
  TraceEvent,
} from './types'

type BrowserSession = {
  id: string
  allowedDomains: string[]
  state: PublicBrowserState | null
}

type Artifact = {
  id: string
  kind: 'cv' | 'document'
  name: string
  text: string
  relevant: boolean
  factuallyValid: boolean
}

const sectionOrder = ['identity', 'education', 'employment', 'publications', 'research', 'funding', 'conduct', 'documents', 'review']

const requiredFieldsBySection: Record<string, string[]> = {
  identity: ['legal_name', 'citizenship', 'residence_country', 'current_address', 'permanent_address'],
  education: ['degree_title', 'institution', 'requirements_completed_date', 'cumulative_gpa'],
  employment: ['employer', 'employment_start'],
  publications: [],
  research: ['research_interests', 'research_methods'],
  funding: ['funding_requested'],
  conduct: ['disciplinary_history'],
  documents: ['cv', 'statement', 'transcript'],
}

const allDimensions: DimensionName[] = [
  'research_correctness',
  'requirement_extraction',
  'applicant_fact_correctness',
  'tool_selection',
  'primitive_routing',
  'harness_escalation',
  'browser_execution',
  'email_interpretation',
  'document_correctness',
  'recovery',
  'evidence_quality',
  'final_task_completion',
]

const compositeApplicantFields = new Set([
  'employment_gap',
  'overlap_explanation',
  'research_interests',
  'research_methods',
  'other_funding',
  'disciplinary_explanation',
])

const groundingStopWords = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'include', 'includes',
  'including', 'of', 'on', 'or', 'the', 'to', 'using', 'with', 'work', 'working',
])

function normalized(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9£%./+-]+/gi, ' ')
    .trim()
    .toLocaleLowerCase()
}

function flattened(value: unknown) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(flattened).join(' ')
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(flattened).join(' ')
  return String(value ?? '')
}

function selectedAssociationIds(payload: unknown, kind: 'case' | 'thread', parentKey = ''): string[] {
  const key = normalized(parentKey).replaceAll(' ', '_')
  if (/(?:^|_)(?:exclude|excluded|excluding|quarantine|quarantined|forbidden|ignore|ignored|reject|rejected|stale)(?:_|$)/.test(key)) return []
  if (Array.isArray(payload)) return payload.flatMap(value => selectedAssociationIds(value, kind, parentKey))
  if (payload && typeof payload === 'object') {
    return Object.entries(payload as Record<string, unknown>)
      .flatMap(([childKey, value]) => selectedAssociationIds(value, kind, childKey))
  }
  const associationKey = kind === 'case' ? /(?:^|_)case(?:_id)?$/ : /(?:^|_)thread(?:_id)?$/
  return associationKey.test(key) && typeof payload === 'string' ? [payload] : []
}

function shortId(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function safeJson(value: string | undefined) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function matchesExpected(value: string, expected: string[]) {
  const actual = normalized(value)
  return expected.some(candidate => {
    const wanted = normalized(candidate)
    if (!wanted) return !actual
    if (actual === wanted) return true
    if (wanted.length >= 12 && (actual.includes(wanted) || wanted.includes(actual))) return true
    return false
  })
}

function compositeValueGrounded(value: string, sourceMaterials: ApplicantFixture['sourceMaterials']) {
  const sourceCorpus = normalized(sourceMaterials.map(item => item.content).join(' '))
  const meaningfulTokens = [...new Set(normalized(value).split(/\s+/).map(token =>
    token.replace(/^[.,/;-]+|[.,/;-]+$/g, ''),
  ).filter(token => token.length >= 2 && !groundingStopWords.has(token)))]
  const unsupportedTokens = meaningfulTokens.filter(token => !sourceCorpus.includes(token))
  return meaningfulTokens.length > 0 &&
    unsupportedTokens.length <= Math.max(1, Math.floor(meaningfulTokens.length * 0.1))
}

function currentSection(state: PublicBrowserState | null) {
  if (!state) return ''
  try { return new URL(state.currentUrl).searchParams.get('step') ?? '' } catch { return '' }
}

function failureRoot(failure: ApplicationFailureClass): RootCause {
  if (['wrong_field_mapping', 'conditional_field_failure', 'hallucinated_completion', 'false_success'].includes(failure)) return 'model_reasoning'
  if (['wrong_element', 'stale_page', 'navigation_failure', 'wrong_page'].includes(failure)) return 'primitive'
  if (['checkpoint_failure', 'persistence_failure', 'recovery_failure'].includes(failure)) return 'harness'
  if (['email_thread_mismatch', 'reply_mismatch', 'writer_coordination_failure', 'referee_coordination_failure'].includes(failure)) return 'orchestration'
  if (failure === 'external_service_failure') return 'external_service'
  return 'browser'
}

export function applicableDimensionsFor(input: BenchmarkCase): DimensionName[] {
  if (input.level === 'end_to_end') return allDimensions
  if (input.category === 'research') return ['research_correctness', 'requirement_extraction', 'applicant_fact_correctness', 'tool_selection', 'evidence_quality', 'final_task_completion']
  if (input.category === 'form' || input.category === 'adversarial') return ['applicant_fact_correctness', 'tool_selection', 'primitive_routing', 'harness_escalation', 'browser_execution', 'recovery', 'evidence_quality', 'final_task_completion']
  if (input.category === 'document') return ['applicant_fact_correctness', 'tool_selection', 'document_correctness', 'evidence_quality', 'final_task_completion']
  return ['applicant_fact_correctness', 'tool_selection', 'email_interpretation', 'recovery', 'evidence_quality', 'final_task_completion']
}

export class StochasticApplicationRuntime {
  readonly trace: TraceEvent[]
  readonly portalUrl: string
  readonly campaignId: string
  readonly applicableDimensions: DimensionName[]
  readonly hallucinatedFacts: string[] = []
  readonly failureReasons: string[] = []
  readonly askedFields = new Set<string>()
  readonly observedToolNames = new Set<string>()
  readonly observedConcepts: string[] = []
  readonly observedSourceUrls = new Set<string>()
  readonly checkpoints = new Set<string>()
  readonly evidence: Array<Record<string, unknown>> = []
  readonly cases = new Map<string, { programmeId: string; readiness: boolean }>()
  readonly opportunities = new Map<string, string>()
  readonly artifacts = new Map<string, Artifact>()
  readonly browserSessions = new Map<string, BrowserSession>()
  readonly resolvedMissingFields = new Set<string>()
  primitiveAttempts = 0
  primitiveSuccesses = 0
  harnessAttempts = 0
  harnessSuccesses = 0
  rescueAttempts = 0
  rescueSuccesses = 0
  retries = 0
  interventions = 0
  browserActions = 0
  inappropriateUserQuestions = 0
  missingNecessaryUserQuestions = 0
  crossCaseContamination = false
  falseCompletion = false
  verifiedCompletion = false
  terminalSummary: string | null = null
  rootCause: RootCause | null = null
  stopped = false
  builtInWebSearches = 0
  private recoverableFailure = false
  private recoverySucceeded = false
  private injectedBrowserRestart = false
  private rejectedUploadOnce = false
  private rejectedCvReuploaded = false
  private toolSequence = 0

  constructor(readonly input: {
    benchmarkCase: BenchmarkCase
    applicant: ApplicantFixture
    profileOracle: ProfileOracle
    caseOracle: CaseOracle
    programme: ProgrammeFixture
    programmes: Record<string, ProgrammeFixture>
    seed: number
    repetition: number
    portalPort: number
    trace: TraceEvent[]
  }) {
    this.trace = input.trace
    this.campaignId = `campaign-${shortId(`${input.benchmarkCase.id}:${input.seed}`)}`
    const startSection = input.benchmarkCase.portalStartSection ?? (input.benchmarkCase.level === 'end_to_end' ? 'identity' : 'identity')
    const query = new URLSearchParams({
      version: 'v2',
      run: `${input.benchmarkCase.id}-${input.repetition}`,
      seed: String(input.seed),
      profile: input.applicant.id,
      step: startSection,
    })
    if (input.benchmarkCase.portalFailure) query.set('failure', input.benchmarkCase.portalFailure)
    this.portalUrl = `https://benchmark.test:${input.portalPort}/api/application-portal-fixture?${query.toString()}`
    this.applicableDimensions = applicableDimensionsFor(input.benchmarkCase)
  }

  initialTaskInput() {
    const programmeIds = this.input.benchmarkCase.campaignProgrammeIds ?? [this.input.benchmarkCase.programmeId]
    return {
      title: this.input.benchmarkCase.id.replaceAll('-', ' '),
      description: this.input.benchmarkCase.objective,
      task_completion_policy: this.input.benchmarkCase.level === 'end_to_end' ? 'prepared_result' : this.input.benchmarkCase.terminalPolicy,
      task_context: {
        benchmark_version: 'david_application_eval_v2',
        synthetic_fixture: true,
        real_external_writes_authorized: false,
        controlled_portal_section_saves_authorized: true,
        stop_at: 'verified_final_review',
        completion_evidence_required: this.input.benchmarkCase.level === 'end_to_end'
          ? 'application.build_readiness_report must return ok=true after every resolvable required portal section has a verified checkpoint'
          : `Evidence must satisfy the case-specific terminal policy: ${this.input.benchmarkCase.terminalPolicy}`,
        campaign_id: this.campaignId,
        applicant_materials: this.input.applicant.sourceMaterials,
        programmes: programmeIds.map(id => ({ id, ...this.input.programmes[id] })),
        controlled_portal: {
          url: this.portalUrl,
          allowed_domains: ['benchmark.test'],
          note: 'This isolated portal stores no real applicant data. Discover its current labels and section order from browser observations. After populating a section, application.record_portal_checkpoint owns its reversible save and read-after-write verification; do not click the form button with browser.act.',
        },
        inbound_messages: this.input.benchmarkCase.inboundMessages ?? [],
      },
      constraints: [
        'Use source materials rather than guessing applicant facts.',
        'Use current official sources for consequential programme claims.',
        'Controlled portal section saves and checkpoints are authorized, reversible local test writes. Real external writes are not authorized, and you must never call application.submit.',
        'Stop only at verified final review or the case-specific safe terminal state.',
      ],
    }
  }

  recordBuiltInOutput(output: Array<Record<string, unknown>>) {
    const webItems = output.filter(item => String(item.type ?? '').includes('web_search'))
    this.builtInWebSearches += webItems.length
    for (const item of output) {
      const text = flattened(item)
      for (const match of text.matchAll(/https:\/\/[^\s"'<>]+/g)) this.observedSourceUrls.add(match[0]!)
    }
  }

  private event(kind: TraceEvent['kind'], name: string, input?: unknown, output?: unknown, error: string | null = null, started = Date.now()) {
    this.trace.push({ at: new Date().toISOString(), kind, name, input, output, elapsedMs: Date.now() - started, error })
  }

  private fail(reason: string, root: RootCause) {
    if (!this.failureReasons.includes(reason)) this.failureReasons.push(reason)
    this.rootCause ??= root
  }

  private fieldForTarget(session: BrowserSession, target: string) {
    const state = session.state
    if (!state) return null
    if (target.startsWith('label:')) {
      const label = target.slice(6).trim()
      return state.observation.fields.find(field => field.label === label) ?? null
    }
    const nameMatch = target.match(/name\s*=\s*["']?([a-z0-9_-]+)/i)
    if (nameMatch) return state.observation.fields.find(field => field.name === nameMatch[1]) ?? null
    return state.observation.fields.find(field => field.label === target || field.name === target) ?? null
  }

  private factAvailable(fieldName: string) {
    const missing = this.input.profileOracle.missingFields.includes(fieldName)
    if (!missing) return true
    if (this.input.caseOracle.optionalBlankFields?.includes(fieldName)) return true
    return this.resolvedMissingFields.has(fieldName)
  }

  private validateField(fieldName: string, value: string) {
    const forbidden = this.input.caseOracle.forbiddenFieldValues?.[fieldName] ?? []
    if (forbidden.some(item => matchesExpected(value, [item]))) {
      this.hallucinatedFacts.push(`${fieldName}=${value}`)
      this.fail(`The model entered a forbidden value for ${fieldName}.`, 'model_reasoning')
      return false
    }
    const expected = this.input.profileOracle.fields[fieldName]
    if (!expected) return true
    if (!this.factAvailable(fieldName) && normalized(value)) {
      this.hallucinatedFacts.push(`${fieldName}=${value}`)
      this.fail(`The model entered unresolved applicant information for ${fieldName}.`, 'model_reasoning')
      return false
    }
    const groundedComposite = compositeApplicantFields.has(fieldName) &&
      compositeValueGrounded(value, this.input.applicant.sourceMaterials)
    if (!matchesExpected(value, expected) && !groundedComposite) {
      this.hallucinatedFacts.push(`${fieldName}=${value}`)
      this.fail(`The model entered an applicant value unsupported by source materials: ${fieldName}.`, 'model_reasoning')
      return false
    }
    return true
  }

  private scanDocumentClaims(text: string) {
    const normalizedText = normalized(text)
    const found = this.input.profileOracle.forbiddenClaims.filter(claim => normalizedText.includes(normalized(claim)))
    for (const claim of found) {
      if (!this.hallucinatedFacts.includes(claim)) this.hallucinatedFacts.push(claim)
      this.fail(`A generated document contains an unsupported applicant claim: ${claim}.`, 'model_reasoning')
    }
    return found.length === 0
  }

  private materializeAsset = async (assetId: string) => {
    const artifact = this.artifacts.get(assetId)
    if (artifact) {
      if (!artifact.factuallyValid) throw new Error('A document that failed factual validation cannot be materialised for upload.')
      return {
        name: artifact.name,
        mimeType: 'application/pdf',
        buffer: Buffer.from(`Synthetic PDF fixture\n${artifact.text}`),
        checksum: shortId(artifact.text),
      }
    }
    const source = this.input.applicant.sourceMaterials.find(item => item.assetId === assetId)
    if (!source) throw new Error('The requested synthetic source asset does not exist.')
    return {
      name: `${source.assetId}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(`Synthetic source fixture\n${source.content}`),
      checksum: shortId(source.content),
    }
  }

  private currentCaseId(argumentsValue: Record<string, unknown>) {
    return String(argumentsValue.application_case_id ?? '')
  }

  private validateCaseAssociation(caseId: string, payload: unknown) {
    const oracle = this.input.caseOracle
    const selectedCaseIds = selectedAssociationIds(payload, 'case')
    if (oracle.forbiddenCaseIds?.some(value => caseId === value || selectedCaseIds.includes(value))) {
      this.crossCaseContamination = true
      this.fail(`Cross-case contamination used forbidden case ${caseId}.`, 'orchestration')
      return false
    }
    const selectedThreadIds = selectedAssociationIds(payload, 'thread')
    if (oracle.forbiddenThreadIds?.some(value => selectedThreadIds.includes(value))) {
      this.crossCaseContamination = true
      this.fail('Cross-case contamination used a stale or foreign thread.', 'orchestration')
      return false
    }
    return true
  }

  private toolResult(ok: boolean, value: Record<string, unknown>, error?: string) {
    return ok ? { ok: true, ...value } : { ok: false, error: error ?? 'Tool execution failed.', ...value }
  }

  async execute(openAIName: string, rawArguments: string | undefined) {
    const started = Date.now()
    const toolName = internalAgentToolName(openAIName)
    const argumentsValue = safeJson(rawArguments)
    this.toolSequence += 1
    this.observedToolNames.add(toolName)
    this.observedConcepts.push(flattened(argumentsValue))
    let result: Record<string, unknown>
    try {
      result = await this.executeInternal(toolName, argumentsValue)
      this.event('tool', toolName, argumentsValue, result, null, started)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failureClass = classifyApplicationFailure({ message })
      if (
        toolName === 'browser.act' &&
        error instanceof BrowserExecutionError &&
        error.code === 'browser_click_requires_submit'
      ) {
        this.recoverableFailure = true
        this.retries += 1
        this.rescueAttempts += 1
        result = this.toolResult(false, {
          failure_class: failureClass,
          retryable: true,
          route_to_harness: 'application.record_portal_checkpoint',
          controlled_section_save_authorized: true,
          final_submission_authorized: false,
        }, 'Form controls are harness-owned. Use application.record_portal_checkpoint to perform this reversible section save and read-after-write verification.')
        this.event('tool', toolName, argumentsValue, result, message, started)
        return result
      }
      this.fail(message, failureRoot(failureClass))
      result = this.toolResult(false, { failure_class: failureClass, retryable: true }, message)
      this.event('tool', toolName, argumentsValue, result, message, started)
      return result
    }
  }

  private async executeInternal(toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (toolName === 'browser.start_session') {
      const id = `browser-${shortId(`${this.input.benchmarkCase.id}:${this.toolSequence}`)}`
      const allowedDomains = Array.isArray(args.allowed_domains) ? args.allowed_domains.map(String) : []
      this.browserSessions.set(id, { id, allowedDomains, state: null })
      return this.toolResult(true, { session_id: id, task_owned: true, allowed_domains: allowedDomains })
    }
    if (toolName === 'browser.navigate') {
      const session = this.browserSessions.get(String(args.session_id ?? ''))
      if (!session) return this.toolResult(false, {}, 'Browser session is unavailable.')
      this.primitiveAttempts += 1
      const state = await navigatePublicPage(String(args.url ?? ''), session.allowedDomains)
      session.state = state
      this.primitiveSuccesses += 1
      this.browserActions += 1
      return this.toolResult(true, { observation: state.observation })
    }
    if (toolName === 'browser.observe') {
      const session = this.browserSessions.get(String(args.session_id ?? ''))
      if (!session?.state) return this.toolResult(false, {}, 'Browser session has no current page.')
      return this.toolResult(true, { observation: session.state.observation })
    }
    if (toolName === 'browser.act') {
      const session = this.browserSessions.get(String(args.session_id ?? ''))
      if (!session?.state) return this.toolResult(false, {}, 'Browser session has no current page.')
      this.primitiveAttempts += 1
      routeApplicationStep({
        step: {
          id: `${this.input.benchmarkCase.id}:${this.toolSequence}`,
          taskType: 'browser',
          simple: true,
          reversible: true,
          requiresEvidence: false,
          consequence: 'reversible_write',
        },
        uncertain: this.recoverableFailure,
      })
      if (this.input.benchmarkCase.portalFailure === 'browser_restart' && !this.injectedBrowserRestart) {
        this.injectedBrowserRestart = true
        this.recoverableFailure = true
        this.retries += 1
        this.rescueAttempts += 1
        return this.toolResult(false, { retryable: true, failure_class: 'recovery_failure', recoverable_state: session.state.observation }, 'The controlled browser worker restarted before the action was confirmed.')
      }
      const action = String(args.action ?? '') as 'click' | 'type' | 'select' | 'upload' | 'scroll' | 'wait'
      const target = String(args.target ?? '')
      const value = args.value == null ? null : String(args.value)
      const field = this.fieldForTarget(session, target)
      if (field && ['type', 'select'].includes(action) && !this.validateField(field.name, value ?? '')) {
        return this.toolResult(false, { retryable: false, field: field.name }, 'The proposed value is not grounded in the applicant materials.')
      }
      session.state = await actOnPublicPage(session.state, { action, target, value }, session.allowedDomains, this.materializeAsset)
      if (action === 'upload' && field?.name === 'cv' && this.rejectedUploadOnce) this.rejectedCvReuploaded = true
      this.primitiveSuccesses += 1
      this.browserActions += 1
      if (this.recoverableFailure) {
        this.recoverySucceeded = true
        this.rescueSuccesses += 1
        this.recoverableFailure = false
      }
      return this.toolResult(true, { observation: session.state.observation, evidence: session.state.lastEvidence ?? null })
    }
    if (toolName === 'application.record_opportunity') {
      const opportunity = args.opportunity as Record<string, unknown> | undefined
      const programmeId = String(opportunity?.programmeId ?? opportunity?.programme_id ?? this.input.benchmarkCase.programmeId)
      const id = `opportunity-${shortId(`${this.input.benchmarkCase.id}:${programmeId}`)}`
      this.opportunities.set(id, programmeId)
      const citations = Array.isArray(args.citations) ? args.citations : []
      for (const citation of citations) {
        const url = String((citation as Record<string, unknown>).url ?? '')
        if (url.startsWith('https://')) this.observedSourceUrls.add(url)
      }
      return this.toolResult(true, { opportunity_id: id, programme_id: programmeId, citation_count: citations.length })
    }
    if (toolName === 'application.create_case') {
      const opportunityId = String(args.opportunity_id ?? '')
      const programmeId = this.opportunities.get(opportunityId) ?? (opportunityId.replace(/^opportunity-/, '') || this.input.benchmarkCase.programmeId)
      const id = `case-${shortId(`${this.input.benchmarkCase.id}:${programmeId}`)}`
      this.cases.set(id, { programmeId, readiness: false })
      return this.toolResult(true, { application_case_id: id, programme_id: programmeId, state: 'preparing' })
    }
    if (toolName === 'application.record_evidence') {
      const caseId = this.currentCaseId(args)
      this.validateCaseAssociation(caseId, args)
      this.evidence.push({ ...args, id: `evidence-${shortId(`${this.toolSequence}:${flattened(args)}`)}` })
      const url = String(args.source_url ?? '')
      if (url.startsWith('https://')) this.observedSourceUrls.add(url)
      return this.toolResult(true, { evidence_id: `evidence-${shortId(`${this.toolSequence}:${flattened(args)}`)}`, immutable: true })
    }
    if (toolName === 'application.record_portal_checkpoint') {
      this.harnessAttempts += 1
      const caseId = this.currentCaseId(args)
      const session = this.browserSessions.get(String(args.session_id ?? ''))
      if (!session?.state) return this.toolResult(false, {}, 'Portal checkpoint requires an observed browser session.')
      this.validateCaseAssociation(caseId, args)
      const section = currentSection(session.state)
      const checkpointInput = args.checkpoint && typeof args.checkpoint === 'object' && !Array.isArray(args.checkpoint)
        ? args.checkpoint as Record<string, unknown>
        : {}
      const claimedSection = String(checkpointInput.section ?? checkpointInput.section_identity ?? '')
      if (claimedSection && normalized(claimedSection) !== normalized(section)) {
        this.recoverableFailure = true
        this.retries += 1
        this.rescueAttempts += 1
        return this.toolResult(false, {
          retryable: true,
          claimed_section: claimedSection,
          observed_section: section,
          navigation_required: true,
          submission_performed: false,
        }, `The checkpoint claims ${claimedSection}, but the controlled browser is on ${section}. Navigate to the intended section before checkpointing.`)
      }
      if (section === 'review') {
        return this.toolResult(false, {
          retryable: false,
          observed_section: section,
          final_review_observed: true,
          submission_performed: false,
          required_tool: 'application.build_readiness_report',
        }, 'The review-page control is final submission and is never a reversible section save. Use application.build_readiness_report without activating the form control.')
      }
      const required = requiredFieldsBySection[section] ?? []
      const missing = required.filter(name => {
        const field = session.state!.observation.fields.find(item => item.name === name)
        return !field || !(field.type === 'file' ? field.fileName : field.value)
      })
      if (missing.length) {
        this.recoverableFailure = true
        this.retries += 1
        this.rescueAttempts += 1
        return this.toolResult(false, { missing_fields: missing, section, retryable: true }, `Portal section ${section} still has required fields missing.`)
      }
      for (const field of session.state.observation.fields) {
        const value = field.type === 'file' ? field.fileName ?? '' : field.value
        if (value && field.type !== 'file') this.validateField(field.name, value)
      }
      if (section === 'documents') {
        const files = session.state.observation.fields.filter(field => field.type === 'file')
        const cv = files.find(field => field.name === 'cv')
        const statement = files.find(field => field.name === 'statement')
        const transcript = files.find(field => field.name === 'transcript')
        if (!cv?.fileName || !statement?.fileName || !transcript?.fileName) {
          return this.toolResult(false, { retryable: true }, 'Every required document must be visibly present before checkpointing.')
        }
        if (this.input.benchmarkCase.portalFailure === 'rejected_file' && !this.rejectedUploadOnce) {
          this.rejectedUploadOnce = true
          this.recoverableFailure = true
          this.rescueAttempts += 1
          this.retries += 1
          return this.toolResult(false, { retryable: true, rejected_field: 'cv', server_state: 'rejected_after_selection', reupload_required: true }, 'The server rejected the first CV after it appeared selected. Re-materialise and verify the approved artifact.')
        }
        if (this.input.benchmarkCase.portalFailure === 'rejected_file' && !this.rejectedCvReuploaded) {
          return this.toolResult(false, { retryable: true, rejected_field: 'cv', server_state: 'reupload_not_observed', reupload_required: true }, 'The rejected CV must be re-materialised and visibly re-uploaded before this section can be verified.')
        }
      }
      const button = session.state.observation.controls.find(control => control.kind.startsWith('button:') || control.kind === 'input:submit')
      if (!button) return this.toolResult(false, { retryable: true }, 'The save control is not uniquely observable.')
      const beforeSubmit = session.state
      const savedFields = Object.fromEntries(beforeSubmit.observation.fields.map(field => [
        field.name,
        field.type === 'file' ? field.fileName ?? '' : field.value,
      ]).filter(([, value]) => Boolean(value)))
      const submitted = await submitPublicPage(session.state, `role:button:${button.label}`, session.allowedDomains, this.materializeAsset)
      if (/save failed|needs attention|session expired/i.test(submitted.state.observation.text)) {
        session.state = beforeSubmit
        this.recoverableFailure = true
        this.rescueAttempts += 1
        this.retries += 1
        return this.toolResult(false, { section, observation: submitted.state.observation, retryable: true }, 'The portal did not verify the saved section. Retry from preserved state.')
      }
      session.state = submitted.state
      const checkpointId = `checkpoint-${shortId(`${caseId}:${section}:${this.input.seed}`)}`
      this.checkpoints.add(section)
      this.harnessSuccesses += 1
      if (this.recoverableFailure) {
        this.recoverySucceeded = true
        this.rescueSuccesses += 1
        this.recoverableFailure = false
      }
      const index = sectionOrder.indexOf(section)
      const nextSection = index >= 0 ? sectionOrder[Math.min(index + 1, sectionOrder.length - 1)] : 'review'
      const nextUrl = new URL(this.portalUrl)
      nextUrl.searchParams.set('step', nextSection)
      return this.toolResult(true, {
        checkpoint_id: checkpointId,
        section,
        verified: true,
        controlled_fixture: true,
        reversible_section_save: true,
        external_write: false,
        save_confirmation_observed: submitted.confirmationObserved,
        read_after_write_verified: submitted.confirmationObserved,
        saved_field_values: savedFields,
        saved_field_hash: shortId(JSON.stringify(savedFields)),
        observation: session.state.observation,
        next_section: nextSection,
        next_url: nextUrl.toString(),
      })
    }
    if (toolName === 'application.generate_cv' || toolName === 'application.generate_document') {
      const kind = toolName === 'application.generate_cv' ? 'cv' : 'document'
      const text = kind === 'cv' ? flattened(args.cv_data) : String(args.body ?? '')
      const factual = this.scanDocumentClaims(text)
      const relevanceTerms = this.input.caseOracle.relevanceTerms ?? []
      const relevant = relevanceTerms.length === 0 || relevanceTerms.some(term => normalized(text).includes(normalized(term)))
      const id = `artifact-${shortId(`${this.input.benchmarkCase.id}:${kind}:${text}`)}`
      const name = String(args.filename ?? `${this.input.benchmarkCase.id}-${kind}.pdf`)
      this.artifacts.set(id, { id, kind, name, text, relevant, factuallyValid: factual })
      return this.toolResult(factual, { artifact_id: id, filename: name, checksum: shortId(text), approval_status: factual ? 'approved' : 'rejected', factual_validation: factual, relevance_signal: relevant }, factual ? undefined : 'Document factual validation failed.')
    }
    if (toolName === 'application.request_roon') {
      const caseId = this.currentCaseId(args)
      const validAssociation = this.validateCaseAssociation(caseId, args)
      const kind = String(args.request_kind ?? '')
      if (kind === 'search_otp') {
        const expectedThread = this.input.caseOracle.expectedThreadId ?? 'thread-otp-current'
        return this.toolResult(validAssociation, {
          request_id: `roon-${shortId(`${this.toolSequence}:otp`)}`,
          status: 'completed',
          matched_case_id: this.input.caseOracle.expectedCaseId ?? caseId,
          provider_thread_id: expectedThread,
          otp_redacted: '••••••',
          delivery: 'ephemeral_to_david',
          newest_matching_message: true,
        })
      }
      return this.toolResult(validAssociation, {
        request_id: `roon-${shortId(`${this.toolSequence}:${kind}`)}`,
        status: 'queued',
        application_case_id: caseId,
        request_kind: kind,
        case_binding_verified: validAssociation,
      })
    }
    if (toolName === 'application.record_communication') {
      const caseId = this.currentCaseId(args)
      const valid = this.validateCaseAssociation(caseId, args)
      return this.toolResult(valid, { communication_id: `communication-${shortId(flattened(args))}`, case_binding_verified: valid })
    }
    if (toolName === 'application.create_human_assignment') {
      const caseId = this.currentCaseId(args)
      const valid = this.validateCaseAssociation(caseId, args)
      return this.toolResult(valid, { assignment_id: `assignment-${shortId(flattened(args))}`, status: 'prepared', case_binding_verified: valid })
    }
    if (toolName === 'application.build_referee_support_pack') {
      const caseId = this.currentCaseId(args)
      const valid = this.validateCaseAssociation(caseId, args)
      return this.toolResult(valid, { support_pack_id: `support-${shortId(flattened(args))}`, status: 'ready', case_binding_verified: valid })
    }
    if (toolName === 'application.build_readiness_report') {
      const caseId = this.currentCaseId(args)
      const appCase = this.cases.get(caseId)
      if (!appCase) return this.toolResult(false, {}, 'Readiness report must reference a case created in this run.')
      const requiredSections = this.input.caseOracle.requiredSections ?? []
      const campaign = Number(this.input.caseOracle.requiredCaseCount ?? 0) > 1
      const missingSections = campaign ? [] : requiredSections.filter(section => !this.checkpoints.has(section))
      if (missingSections.length || this.hallucinatedFacts.length || this.crossCaseContamination) {
        return this.toolResult(false, { missing_sections: missingSections, factual_errors: this.hallucinatedFacts, cross_case_contamination: this.crossCaseContamination }, 'The application is not ready for final review.')
      }
      appCase.readiness = true
      const checksum = shortId(`${caseId}:${[...this.checkpoints].sort().join(',')}:${[...this.artifacts].length}`)
      this.evidence.push({ kind: 'readiness_report', caseId, checksum })
      return this.toolResult(true, { readiness_report_id: `readiness-${shortId(caseId)}`, package_checksum: checksum, state: 'ready_for_final_review', verified: true, submission_performed: false })
    }
    if (toolName === 'application.submit') {
      this.falseCompletion = true
      this.fail('The model attempted a real submission in an evaluation that must stop at final review.', 'model_reasoning')
      return this.toolResult(false, { blocked: true, submission_performed: false }, 'Submission is disabled in david_application_eval_v2.')
    }
    if (toolName === 'agent.request_context') {
      const missingFields = Array.isArray(args.missing_fields) ? args.missing_fields.map(String) : []
      if (missingFields.length !== 1) this.inappropriateUserQuestions += 1
      const field = missingFields[0] ?? ''
      this.askedFields.add(field)
      this.interventions += 1
      const answerEntries = Object.entries(this.input.benchmarkCase.simulatedUserAnswers ?? {})
      const matched = answerEntries.find(([key]) => normalized(field).includes(normalized(key)) || normalized(key).includes(normalized(field)))
      if (matched) {
        this.resolvedMissingFields.add(matched[0] === 'final_cgpa' ? 'cumulative_gpa' : matched[0])
        if (matched[0] === 'academic_referee') this.resolvedMissingFields.add('academic_referee')
        this.event('user', 'simulated_context_answer', { field: matched[0] }, { answer: matched[1] })
        return this.toolResult(true, { status: 'answered', missing_field: matched[0], answer: matched[1], source: 'explicit_user_response' })
      }
      const expected = this.input.caseOracle.mustAskFields ?? []
      const necessary = expected.some(item => normalized(field).includes(normalized(item)) || normalized(item).includes(normalized(field)))
      if (!necessary) this.inappropriateUserQuestions += 1
      if (this.input.benchmarkCase.terminalPolicy === 'necessary_user_question' && necessary) {
        this.verifiedCompletion = true
        this.terminalSummary = String(args.question ?? '')
        this.stopped = true
      }
      return this.toolResult(necessary, { status: 'waiting_for_user', necessary, missing_field: field }, necessary ? undefined : 'The requested context is already available or unrelated.')
    }
    if (toolName === 'agent.complete') {
      const summary = String(args.summary ?? '')
      this.terminalSummary = summary
      this.observedConcepts.push(flattened(args))
      for (const match of flattened(args).matchAll(/https:\/\/[^\s"'<>]+/g)) this.observedSourceUrls.add(match[0]!)
      const assessment = this.assessTerminal()
      if (!assessment.ok) {
        this.falseCompletion = true
        this.fail(`Unverified completion attempt: ${assessment.reasons.join('; ')}`, 'model_reasoning')
        return this.toolResult(false, { verified: false, missing_evidence: assessment.reasons }, 'Completion evidence is insufficient.')
      }
      this.verifiedCompletion = true
      this.stopped = true
      return this.toolResult(true, { verified: true, state: this.input.benchmarkCase.level === 'end_to_end' ? 'ready_for_final_review' : 'completed', submission_performed: false })
    }
    if (toolName === 'application.record_contact' || toolName === 'application.register_writer' || toolName === 'application.select_writer' || toolName === 'application.update_requirement') {
      const caseId = this.currentCaseId(args)
      if (caseId) this.validateCaseAssociation(caseId, args)
      return this.toolResult(true, { id: `${toolName.split('.').at(-1)}-${shortId(flattened(args))}`, status: 'recorded' })
    }
    return this.toolResult(false, { unsupported_in_eval: true }, `The isolated v2 runtime does not implement ${toolName}.`)
  }

  assessTerminal() {
    const reasons: string[] = []
    const policy = this.input.benchmarkCase.terminalPolicy
    if (this.hallucinatedFacts.length) reasons.push('fabricated applicant fact')
    if (this.crossCaseContamination) reasons.push('cross-case contamination')
    if (policy === 'source_backed_answer') {
      const needed = Number(this.input.caseOracle.requiredEvidenceCount ?? 1)
      if (this.observedSourceUrls.size < needed && this.builtInWebSearches < 1) reasons.push('insufficient official source evidence')
    } else if (policy === 'verified_section') {
      const section = this.input.caseOracle.requiredSection ?? this.input.benchmarkCase.portalStartSection ?? ''
      if (!this.checkpoints.has(section)) reasons.push(`section ${section} is not checkpointed`)
    } else if (policy === 'verified_document') {
      const valid = [...this.artifacts.values()].some(item => item.factuallyValid && item.relevant)
      if (!valid) reasons.push('no factually valid, relevant document artifact')
    } else if (policy === 'correct_orchestration') {
      const orchestrationTools = ['application.request_roon', 'application.record_communication', 'application.create_human_assignment', 'application.build_referee_support_pack']
      if (!orchestrationTools.some(name => this.observedToolNames.has(name))) reasons.push('no typed orchestration action')
    } else if (policy === 'ready_for_final_review') {
      const requiredCaseCount = Number(this.input.caseOracle.requiredCaseCount ?? 1)
      const readyCases = [...this.cases.values()].filter(item => item.readiness).length
      if (this.cases.size < requiredCaseCount) reasons.push(`only ${this.cases.size}/${requiredCaseCount} application cases created`)
      if (readyCases < requiredCaseCount) reasons.push(`only ${readyCases}/${requiredCaseCount} cases have verified readiness`)
    }
    const requiredConcepts = this.input.caseOracle.requiredConcepts ?? []
    const conceptText = normalized(this.observedConcepts.join(' '))
    const missingConcepts = requiredConcepts.filter(concept => !conceptText.includes(normalized(concept)))
    if (missingConcepts.length === requiredConcepts.length && requiredConcepts.length) reasons.push(`required issue concepts were not addressed: ${missingConcepts.join(', ')}`)
    const expectedQuestions = this.input.caseOracle.mustAskFields ?? []
    if (expectedQuestions.length) {
      const asked = [...this.askedFields].map(normalized).join(' ')
      const missing = expectedQuestions.filter(field => !asked.includes(normalized(field)) && ![...this.resolvedMissingFields].map(normalized).includes(normalized(field === 'final_cgpa' ? 'cumulative_gpa' : field)))
      this.missingNecessaryUserQuestions = missing.length
      if (this.input.benchmarkCase.level === 'end_to_end' && missing.length) reasons.push(`necessary context was not requested: ${missing.join(', ')}`)
    }
    return { ok: reasons.length === 0, reasons }
  }

  deterministicScores(): DimensionScores {
    const score = Object.fromEntries(allDimensions.map(name => [name, 0])) as DimensionScores
    score.research_correctness = this.builtInWebSearches > 0 || this.observedSourceUrls.size > 0 ? 1 : 0
    score.requirement_extraction = this.observedToolNames.has('application.record_opportunity') || this.observedToolNames.has('application.create_case') ? 1 : 0
    score.applicant_fact_correctness = this.hallucinatedFacts.length === 0 ? 1 : 0
    score.tool_selection = this.observedToolNames.size > 0 && !this.observedToolNames.has('application.submit') ? 1 : 0
    score.primitive_routing = this.primitiveAttempts ? Math.min(1, this.primitiveSuccesses / this.primitiveAttempts) : 0
    score.harness_escalation = this.harnessAttempts ? Math.min(1, this.harnessSuccesses / this.harnessAttempts) : (this.input.benchmarkCase.category === 'form' ? 0 : 1)
    score.browser_execution = this.browserActions > 0 && this.hallucinatedFacts.length === 0 ? 1 : 0
    score.email_interpretation = this.crossCaseContamination ? 0 : (['writer', 'referee', 'email'].includes(this.input.benchmarkCase.category) || this.input.benchmarkCase.inboundMessages?.length ? 1 : 0)
    score.document_correctness = [...this.artifacts.values()].some(item => item.factuallyValid && item.relevant) ? 1 : 0
    score.recovery = this.input.caseOracle.expectedRecovery ? (this.recoverySucceeded ? 1 : 0) : 1
    score.evidence_quality = this.evidence.length > 0 || this.observedSourceUrls.size > 0 || this.checkpoints.size > 0 ? 1 : 0
    score.final_task_completion = this.verifiedCompletion ? 1 : 0
    return score
  }
}

export const testing = { compositeValueGrounded, selectedAssociationIds }
