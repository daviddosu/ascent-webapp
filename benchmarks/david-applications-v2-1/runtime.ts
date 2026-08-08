import { internalAgentToolName } from '../../supabase/functions/_shared/agent-tools'
import { StochasticApplicationRuntime } from '../david-applications-v2/runtime'
import type { TraceEvent } from '../david-applications-v2/types'

const requiredSections = ['identity', 'education', 'employment', 'publications', 'research', 'funding', 'conduct', 'documents']
const compositeFields = new Set(['employment_gap', 'overlap_explanation', 'research_interests', 'research_methods', 'other_funding', 'disciplinary_explanation'])
const stopWords = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'include', 'includes', 'including', 'of', 'on', 'or', 'the', 'to', 'using', 'with', 'work', 'working'])

function normalized(value: unknown) {
  return String(value ?? '').normalize('NFKD').replace(/[–—]/g, '-').replace(/[^a-z0-9£%./+-]+/gi, ' ').trim().toLocaleLowerCase()
}

function safeJson(value: string | undefined) {
  try {
    const parsed = JSON.parse(value ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch { return {} }
}

function matchesExpected(value: string, expected: string[]) {
  const actual = normalized(value)
  return expected.some(candidate => {
    const wanted = normalized(candidate)
    return actual === wanted || (wanted.length >= 12 && (actual.includes(wanted) || wanted.includes(actual)))
  })
}

function currentSection(url: string) {
  try { return new URL(url).searchParams.get('step') ?? '' } catch { return '' }
}

export class ApplicationRuntimeV21 {
  readonly base: StochasticApplicationRuntime
  readonly checkpointsByCase = new Map<string, Set<string>>()
  readonly controllerRetries = new Map<string, number>()
  readonly caseOrder: string[] = []
  currentCaseId: string | null = null
  state = 'OPPORTUNITY_RESEARCH'

  constructor(input: ConstructorParameters<typeof StochasticApplicationRuntime>[0]) {
    this.base = new StochasticApplicationRuntime(input)
  }

  initialTaskInput() {
    return {
      ...this.base.initialTaskInput(),
      controller: {
        version: 'david-application-controller@2.1',
        state: this.state,
        factPolicy: 'Every applicant value is VERIFIED or UNRESOLVED. The harness rejects unsupported values before execution.',
        completionPolicy: 'NO_EVIDENCE => NO_COMPLETION',
        actionPolicy: 'Propose one action for the current case and state. A structured rejection permits one corrected action without restart.',
      },
    }
  }

  authoritativeContext() {
    const activeCheckpoints = this.currentCaseId ? [...(this.checkpointsByCase.get(this.currentCaseId) ?? [])] : []
    const unresolved = requiredSections.filter(section => !activeCheckpoints.includes(section))
    return {
      version: 'david-application-controller@2.1',
      objective: this.base.input.benchmarkCase.objective,
      campaignId: this.base.campaignId,
      currentCaseId: this.currentCaseId,
      caseIds: this.caseOrder,
      state: this.state,
      nextUnresolvedRequirements: unresolved.slice(0, 4),
      verifiedFacts: Object.keys(this.base.input.profileOracle.fields).map(factId => ({
        factId: `profile:${factId}`,
        verification: 'VERIFIED',
        provenance: this.base.input.applicant.sourceMaterials.filter(asset => normalized(asset.content).includes(normalized(factId).replaceAll('_', ' '))).map(asset => asset.assetId),
      })),
      unresolvedFacts: this.base.input.profileOracle.missingFields.filter(field => !this.base.resolvedMissingFields.has(field)),
      artifacts: [...this.base.artifacts.values()].map(artifact => ({ id: artifact.id, name: artifact.name, factuallyValid: artifact.factuallyValid })),
      checkpoint: activeCheckpoints.at(-1) ?? null,
      checkpoints: activeCheckpoints,
      evidenceCount: this.base.evidence.length,
      nearestDeadline: null,
      invariant: 'NO_EVIDENCE => NO_COMPLETION',
    }
  }

  private reject(callId: string, code: string, message: string, details: Record<string, unknown> = {}) {
    const count = (this.controllerRetries.get(code) ?? 0) + 1
    this.controllerRetries.set(code, count)
    const fallback = count > 1 ? 'HARNESS_FALLBACK' : 'MODEL_REPAIR'
    const output = {
      ok: false,
      error_code: code,
      error_message: `${message} Preserve confirmed state and propose exactly one corrected action; do not restart.`,
      preserve_state: true,
      retry_allowed: count <= 1,
      fallback,
      controller_state: this.state,
      ...details,
    }
    this.base.trace.push({ at: new Date().toISOString(), kind: 'harness', name: 'application_controller_action_rejected', input: { callId, code }, output, elapsedMs: 0, error: null })
    return output
  }

  private portalField(args: Record<string, unknown>) {
    const session = this.base.browserSessions.get(String(args.session_id ?? ''))
    if (!session?.state) return null
    const target = String(args.target ?? '')
    const nameMatch = target.match(/name\s*=\s*["']?([a-z0-9_-]+)/i)
    return session.state.observation.fields.find(field =>
      field.label === target || field.name === target || (nameMatch && field.name === nameMatch[1]),
    ) ?? null
  }

  private applicantFactAllowed(fieldName: string, value: string) {
    if (!value.trim()) return true
    const oracle = this.base.input.profileOracle
    const forbidden = this.base.input.caseOracle.forbiddenFieldValues?.[fieldName] ?? []
    if (forbidden.some(candidate => matchesExpected(value, [candidate]))) return false
    const missing = oracle.missingFields.includes(fieldName) && !this.base.resolvedMissingFields.has(fieldName)
    if (missing) return false
    if (compositeFields.has(fieldName)) {
      const corpus = normalized(this.base.input.applicant.sourceMaterials.map(asset => asset.content).join(' '))
      const tokens = [...new Set(normalized(value).split(/\s+/).map(token => token.replace(/^[.,/;-]+|[.,/;-]+$/g, '')).filter(token => token.length >= 2 && !stopWords.has(token)))]
      const unsupported = tokens.filter(token => !corpus.includes(token))
      if (tokens.length > 0 && unsupported.length <= Math.max(1, Math.floor(tokens.length * 0.1))) return true
    }
    const expected = oracle.fields[fieldName]
    if (!expected) {
      const corpus = normalized(this.base.input.applicant.sourceMaterials.map(asset => asset.content).join(' '))
      const tokens = [...new Set(normalized(value).split(/\s+/).map(token => token.replace(/^[.,/;-]+|[.,/;-]+$/g, '')).filter(token => token.length >= 2 && !stopWords.has(token)))]
      const unsupported = tokens.filter(token => !corpus.includes(token))
      return false
    }
    return matchesExpected(value, expected)
  }

  async execute(openAIName: string, rawArguments: string | undefined, callId = '') {
    const toolName = internalAgentToolName(openAIName)
    const args = safeJson(rawArguments)
    if (toolName === 'browser.act' && ['type', 'select'].includes(String(args.action ?? ''))) {
      const field = this.portalField(args)
      const value = String(args.value ?? '')
      if (field && !this.applicantFactAllowed(field.name, value)) {
        return this.reject(callId, 'required_fact_unresolved', `The value for ${field.name} is not a VERIFIED applicant fact. Use an exact source value or exclude the optional field.`, { fact_id: `profile:${field.name}`, verification: 'UNRESOLVED' })
      }
    }
    if (toolName === 'agent.request_context') {
      const fields = Array.isArray(args.missing_fields) ? args.missing_fields.map(String) : []
      if (fields.length !== 1) return this.reject(callId, 'one_fact_per_context_request', 'Ask for exactly one required unresolved fact.', { proposed_fields: fields, next_field: fields[0] ?? null })
      if (this.base.resolvedMissingFields.has(fields[0]!)) return this.reject(callId, 'fact_already_resolved', 'That fact is already available in authoritative context.', { fact_id: fields[0] })
    }
    if (toolName.startsWith('application.') && args.application_case_id && this.currentCaseId && String(args.application_case_id) !== this.currentCaseId && toolName !== 'application.build_readiness_report') {
      if (!this.caseOrder.includes(String(args.application_case_id))) return this.reject(callId, 'wrong_application_case', 'The action targets a case outside this campaign.', { expected_case_id: this.currentCaseId, received_case_id: args.application_case_id })
      this.currentCaseId = String(args.application_case_id)
    }
    if (toolName === 'application.build_readiness_report') {
      const caseId = String(args.application_case_id ?? '')
      const completed = this.checkpointsByCase.get(caseId) ?? new Set<string>()
      const missing = requiredSections.filter(section => !completed.has(section))
      if (missing.length) return this.reject(callId, 'requirement_dependency_incomplete', 'Readiness cannot run before every required portal section has verified read-after-write evidence.', { application_case_id: caseId, missing_requirements: missing })
      this.currentCaseId = caseId
      this.state = 'READINESS_REVIEW'
    }
    if (toolName === 'agent.complete') {
      const assessment = this.base.assessTerminal()
      if (!assessment.ok) return this.reject(callId, 'completion_evidence_incomplete', `NO_EVIDENCE => NO_COMPLETION. ${assessment.reasons.join('; ')}`, { missing_evidence: assessment.reasons })
    }
    const result = await this.base.execute(openAIName, rawArguments)
    if (result.ok === true && toolName === 'application.record_opportunity') this.state = 'CASE_CREATION'
    if (result.ok === true && toolName === 'application.create_case') {
      const caseId = String(result.application_case_id ?? '')
      if (caseId && !this.caseOrder.includes(caseId)) this.caseOrder.push(caseId)
      this.currentCaseId = caseId
      this.checkpointsByCase.set(caseId, new Set())
      this.state = 'DOCUMENT_PREPARATION'
    }
    if (result.ok === true && toolName === 'application.record_portal_checkpoint') {
      const caseId = String(args.application_case_id ?? this.currentCaseId ?? '')
      const section = String(result.section ?? '')
      const checkpoints = this.checkpointsByCase.get(caseId) ?? new Set<string>()
      checkpoints.add(section)
      this.checkpointsByCase.set(caseId, checkpoints)
      this.currentCaseId = caseId
      this.state = 'PORTAL_EXECUTION'
    }
    if (result.ok === true && toolName === 'application.create_human_assignment') this.state = 'WRITER_EXECUTION'
    if (result.ok === true && toolName === 'application.build_referee_support_pack') this.state = 'REFEREE_EXECUTION'
    if (result.ok === true && toolName === 'application.build_readiness_report') this.state = 'SUBMISSION_APPROVAL'
    if (result.ok === true && toolName === 'agent.complete') this.state = 'COMPLETE'
    return result
  }

  get trace(): TraceEvent[] { return this.base.trace }
}
