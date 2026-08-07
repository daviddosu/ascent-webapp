/**
 * Shared execution policy for David's application workflows.
 *
 * The policy is intentionally provider-neutral. The browser worker, Roon
 * workers, and the benchmark all use the same decision vocabulary and the
 * same completion/evidence rules. This keeps a benchmark result meaningful:
 * a test cannot pass by claiming that an unverified provider call completed.
 */

export const executionModes = ['primitive', 'harness', 'primitive_then_harness', 'human_handoff'] as const
export type ExecutionMode = typeof executionModes[number]

export const applicationFailureClasses = [
  'navigation_failure',
  'wrong_page',
  'wrong_element',
  'stale_page',
  'session_expired',
  'authentication_failure',
  'otp_failure',
  'extraction_failure',
  'wrong_field_mapping',
  'conditional_field_failure',
  'validation_failure',
  'upload_failure',
  'wrong_artifact',
  'save_failure',
  'persistence_failure',
  'duplicate_action',
  'email_thread_mismatch',
  'reply_mismatch',
  'stale_email',
  'writer_coordination_failure',
  'referee_coordination_failure',
  'professor_coordination_failure',
  'approval_resume_failure',
  'checkpoint_failure',
  'recovery_failure',
  'unsupported_portal_change',
  'hallucinated_completion',
  'false_success',
  'external_service_failure',
  'genuine_human_handoff',
] as const
export type ApplicationFailureClass = typeof applicationFailureClasses[number]

export type ConsequenceClass =
  | 'reversible_read'
  | 'reversible_write'
  | 'external_message'
  | 'portal_save'
  | 'final_submission'
  | 'payment'
  | 'signature'
  | 'legal_declaration'

export type ExecutionStep = {
  id: string
  taskType: 'research' | 'document' | 'email' | 'referee' | 'professor' | 'otp' | 'browser' | 'workflow'
  knownPortal?: string | null
  simple?: boolean
  reversible?: boolean
  multiPage?: boolean
  requiresPersistence?: boolean
  requiresRecovery?: boolean
  requiresEvidence?: boolean
  requiresWait?: boolean
  crossTool?: boolean
  requiresHuman?: boolean
  consequence?: ConsequenceClass
}

export type RoutingHistory = {
  primitiveAttempts?: number
  primitiveSuccesses?: number
  harnessAttempts?: number
  harnessSuccesses?: number
  priorFailureSignatures?: string[]
  harnessProvenHigherSuccess?: boolean
}

export type RoutingInput = {
  step: ExecutionStep
  history?: RoutingHistory
  failureSignature?: string | null
  uncertain?: boolean
}

export type RoutingDecision = {
  mode: ExecutionMode
  reasons: string[]
  primitiveSuccessRate: number | null
  harnessSuccessRate: number | null
  promotion: 'primitive_candidate' | 'harness_preferred' | 'not_applicable'
}

function rate(attempts: number, successes: number) {
  return attempts > 0 ? Math.max(0, Math.min(1, successes / attempts)) : null
}

function hasHistoryFailure(history: RoutingHistory, failureSignature: string | null | undefined) {
  if (!failureSignature) return false
  return (history.priorFailureSignatures ?? []).some(signature => signature === failureSignature)
}

/**
 * Select an execution path before each executable step.
 *
 * A simple step may start with a primitive, but the returned
 * `primitive_then_harness` contract is deliberate: the caller must preserve
 * confirmed state and enter the harness after uncertainty or failure.
 */
export function routeApplicationStep(input: RoutingInput): RoutingDecision {
  const step = input.step
  const history = input.history ?? {}
  const primitiveSuccessRate = rate(Number(history.primitiveAttempts ?? 0), Number(history.primitiveSuccesses ?? 0))
  const harnessSuccessRate = rate(Number(history.harnessAttempts ?? 0), Number(history.harnessSuccesses ?? 0))
  const reasons: string[] = []

  if (step.requiresHuman || ['payment', 'signature', 'legal_declaration'].includes(step.consequence ?? '')) {
    reasons.push('The consequence requires an explicit human boundary.')
    return { mode: 'human_handoff', reasons, primitiveSuccessRate, harnessSuccessRate, promotion: 'not_applicable' }
  }

  const stateful = Boolean(
    step.knownPortal || step.multiPage || step.requiresPersistence || step.requiresRecovery ||
    step.requiresEvidence || step.requiresWait || step.crossTool || input.uncertain,
  )
  if (stateful) {
    if (step.knownPortal) reasons.push('Known portal workflow is stateful.')
    if (step.multiPage) reasons.push('The step spans multiple pages.')
    if (step.requiresPersistence) reasons.push('Durable persistence is required.')
    if (step.requiresRecovery) reasons.push('Recovery or restart handling is required.')
    if (step.requiresEvidence) reasons.push('Read-after-write evidence is required.')
    if (step.requiresWait) reasons.push('The step crosses an external wait.')
    if (step.crossTool) reasons.push('The step coordinates more than one provider.')
    if (input.uncertain) reasons.push('The previous state is uncertain.')
    if (hasHistoryFailure(history, input.failureSignature) || Boolean(input.failureSignature)) {
      reasons.push('A previous primitive failure signature is present.')
    }
    if (history.harnessProvenHigherSuccess) reasons.push('Historical harness success is higher for this step class.')
    return { mode: 'harness', reasons, primitiveSuccessRate, harnessSuccessRate, promotion: 'harness_preferred' }
  }

  const simpleSafe = step.simple !== false && step.reversible !== false && step.consequence !== 'final_submission'
  if (simpleSafe && (primitiveSuccessRate === null || primitiveSuccessRate >= 0.95)) {
    reasons.push('Simple, reversible, stateless step with a safe primitive path.')
    if (primitiveSuccessRate === null) reasons.push('No history exists; begin with a recoverable primitive attempt.')
    else reasons.push(`Primitive historical success is ${(primitiveSuccessRate * 100).toFixed(1)}%.`)
    return {
      mode: 'primitive_then_harness',
      reasons,
      primitiveSuccessRate,
      harnessSuccessRate,
      promotion: primitiveSuccessRate !== null && primitiveSuccessRate >= 0.99 ? 'primitive_candidate' : 'not_applicable',
    }
  }

  reasons.push('Primitive reliability is below the promotion threshold or the step is not safely reversible.')
  return { mode: 'harness', reasons, primitiveSuccessRate, harnessSuccessRate, promotion: 'harness_preferred' }
}

export type EvidenceKind =
  | 'page_observation'
  | 'saved_section'
  | 'upload_presence'
  | 'provider_message'
  | 'provider_thread'
  | 'provider_reply'
  | 'otp_match'
  | 'artifact_checksum'
  | 'approval_record'
  | 'checkpoint'
  | 'submission_confirmation'

export type CompletionEvidence = {
  kind: EvidenceKind
  verified: boolean
  id?: string | null
  providerId?: string | null
  threadId?: string | null
  checksum?: string | null
  details?: Record<string, unknown>
}

export type VerificationContract = {
  requiredKinds: EvidenceKind[]
  expectedProviderId?: string | null
  expectedThreadId?: string | null
  expectedChecksum?: string | null
}

/** Never infer completion from a worker/model status string. */
export function verifiedCompletion(evidence: CompletionEvidence[], contract: VerificationContract) {
  if (contract.expectedProviderId && !evidence.some(item => item.verified && item.providerId === contract.expectedProviderId)) return false
  if (contract.expectedThreadId && !evidence.some(item => item.verified && item.threadId === contract.expectedThreadId)) return false
  if (contract.expectedChecksum && !evidence.some(item => item.verified && item.checksum === contract.expectedChecksum)) return false
  return contract.requiredKinds.every(kind => evidence.some(item => item.kind === kind && item.verified))
}

export type PrimitiveFailureSnapshot = {
  task: string
  step: string
  input: Record<string, unknown>
  browserState?: Record<string, unknown> | null
  url?: string | null
  screenshot?: string | null
  pageRepresentation?: Record<string, unknown> | null
  actionsAttempted: string[]
  result?: Record<string, unknown> | null
  failureClass: ApplicationFailureClass
  contributingClasses?: ApplicationFailureClass[]
  confidence: 'high' | 'medium' | 'low'
  completedWork: string[]
  recoverableState: Record<string, unknown>
  recommendedHarnessEntryPoint: string
}

export type EscalationRecord = PrimitiveFailureSnapshot & {
  id: string
  escalatedAt: string
  reason: string
  mode: 'primitive_then_harness'
}

export function createEscalationRecord(input: PrimitiveFailureSnapshot & { id: string; escalatedAt: string; reason: string }): EscalationRecord {
  return { ...input, mode: 'primitive_then_harness' }
}

const failureMatchers: Array<[ApplicationFailureClass, RegExp]> = [
  ['session_expired', /session[_ -]?expired|stale session|login expired/i],
  ['authentication_failure', /unauthori[sz]ed|invalid password|sign[ -]?in failed|authentication/i],
  ['otp_failure', /otp|one[- ]?time|verification code/i],
  ['wrong_page', /wrong page|unexpected page|page identity/i],
  ['wrong_element', /target.*(?:missing|ambiguous)|element.*(?:missing|not found)|wrong element/i],
  ['stale_page', /stale page|stale target|outdated page/i],
  ['navigation_failure', /navigation|goto|navigate|net::|url/i],
  ['extraction_failure', /extract|parse|deadline.*missing|could not read/i],
  ['wrong_field_mapping', /field mapping|wrong field|field.*mismatch/i],
  ['conditional_field_failure', /conditional|dynamic field/i],
  ['validation_failure', /validation|invalid|required field/i],
  ['upload_failure', /upload|file input|materiali[sz]e/i],
  ['wrong_artifact', /wrong artifact|stale artifact|checksum.*mismatch|artifact.*mismatch/i],
  ['save_failure', /save.*(?:failed|failure)|could not save/i],
  ['persistence_failure', /persist|database|checkpoint.*missing|durable state/i],
  ['duplicate_action', /duplicate|already sent|already submitted|idempotenc/i],
  ['email_thread_mismatch', /thread.*mismatch|wrong thread|thread ownership/i],
  ['reply_mismatch', /reply.*mismatch|unexpected reply/i],
  ['stale_email', /stale email|old message|before.*request/i],
  ['writer_coordination_failure', /writer/i],
  ['referee_coordination_failure', /referee|recommendation/i],
  ['professor_coordination_failure', /professor|supervisor|faculty outreach/i],
  ['approval_resume_failure', /approval.*resume|approval state/i],
  ['checkpoint_failure', /checkpoint/i],
  ['recovery_failure', /recover|restart|crash/i],
  ['unsupported_portal_change', /unsupported portal|dom changed|renamed label|moved button/i],
  ['hallucinated_completion', /hallucinated|claimed.*complete|self-report/i],
  ['false_success', /false success|unverified completion|no evidence|no verifiable confirmation/i],
  ['external_service_failure', /provider|gmail|service unavailable|500|timeout/i],
  ['genuine_human_handoff', /human handoff|requires user|needs user/i],
]

export function classifyApplicationFailure(input: { code?: string | null; message?: string | null; details?: string | null }): ApplicationFailureClass {
  const value = `${input.code ?? ''} ${input.message ?? ''} ${input.details ?? ''}`
  return failureMatchers.find(([, matcher]) => matcher.test(value))?.[0] ?? 'false_success'
}

export type IdempotencyClaim = {
  key: string
  action: string
  status: 'claimed' | 'duplicate'
  originalProviderId?: string | null
}

/** A small pure helper used by both provider adapters and the benchmark. */
export function claimIdempotentAction(
  ledger: Map<string, { action: string; providerId: string | null }>,
  key: string,
  action: string,
): IdempotencyClaim {
  const existing = ledger.get(key)
  if (existing) return { key, action, status: 'duplicate', originalProviderId: existing.providerId }
  ledger.set(key, { action, providerId: null })
  return { key, action, status: 'claimed', originalProviderId: null }
}

export function confirmIdempotentAction(ledger: Map<string, { action: string; providerId: string | null }>, key: string, providerId: string) {
  const existing = ledger.get(key)
  if (!existing) return false
  ledger.set(key, { ...existing, providerId })
  return true
}

export function preserveConfirmedState<T extends Record<string, unknown>>(primitiveState: T, confirmedState: Record<string, unknown>) {
  return {
    ...primitiveState,
    confirmedState: { ...(primitiveState.confirmedState as Record<string, unknown> | undefined), ...confirmedState },
    resumeFrom: Object.keys(confirmedState).length ? 'confirmedState' : 'primitiveState',
  }
}
