import { hasCalendarIntent, hasEmailIntent, requestsPaymentHandoff } from './agent-intent.ts'
import { actionIsAffirmed, calendarCoordinationIsAffirmed, calendarInviteIsAffirmed, calendarWriteIsAffirmed } from './communication-safety.ts'

/**
 * ShotCount's specialist contract registry.
 *
 * Specialists are execution contexts around the same reasoning model. This
 * module deliberately contains no provider clients, persistence, or UI code so
 * the browser, Edge Functions, and tests can share the same contract.
 */

export const REASONING_MODEL_ID = 'gpt-5.6-luna' as const
export const SPECIALIST_REGISTRY_SCHEMA_VERSION = 1 as const

export const specialistIds = ['roon', 'caspian', 'david'] as const
export type SpecialistId = typeof specialistIds[number]
export type SpecialistVersion = `${SpecialistId}@${number}`

export const taskContracts = [
  'communication.email',
  'communication.scheduling',
  'communication.calendar',
  'travel.flight_search',
  'applications.planning',
  'applications.review_handoff',
] as const
export type TaskContract = typeof taskContracts[number]

export type SpecialistStage = {
  stageId: string
  specialistId: SpecialistId
  specialistVersion: SpecialistVersion
  taskContract: TaskContract
  label: string
}

export type RequiredEffect =
  | 'gmail_send'
  | 'calendar_write'
  | 'validated_itinerary'
  | 'booking_handoff'
  | 'application_plan'
  | 'application_submission'

export type SpecialistRegistryEntry = {
  id: SpecialistId
  version: SpecialistVersion
  displayName: string
  roleDescription: string
  iconReference: string
  supportedTaskContracts: readonly TaskContract[]
  availableTools: readonly string[]
  requiredEffectDerivation: (objective: string, taskContract: TaskContract) => RequiredEffect[]
  approvalRules: Readonly<Record<string, 'allow' | 'require_approval' | 'deny'>>
  verifier: string
  retryRecoveryPolicy: string
  handoffRules: readonly string[]
  observabilityTags: readonly string[]
  testFixtures: readonly string[]
}

export type RouteClassification = 'deterministic' | 'semantic' | 'unsupported'
export type RouteConfidence = 'high' | 'medium' | 'low'
export type ApplicationBoundary = 'supported_planning' | 'supported_execution' | 'needs_context' | 'not_supported'

export type SpecialistRoute = {
  classification: RouteClassification
  confidence: RouteConfidence
  primarySpecialistId: SpecialistId | null
  primarySpecialistVersion: SpecialistVersion | null
  taskContract: TaskContract | null
  stages: SpecialistStage[]
  supported: boolean
  needsSemanticClassification: boolean
  applicationBoundary?: ApplicationBoundary
  rationale: string
}

export type LegacySpecialistRoute = SpecialistRoute & {
  routingSource: 'legacy_migration'
}

const commonReadTools = [
  'agent.request_context',
  'agent.complete',
] as const

const roonTools = [
  ...commonReadTools,
  'web_search',
  'gmail.search_messages',
  'gmail.read_message',
  'gmail.read_thread',
  'gmail.create_draft',
  'gmail.send_message',
  'gmail.wait_for_reply',
  'contacts.find_contact',
  'contacts.resolve_recipient',
  'calendar.list_events',
  'calendar.get_availability',
  'calendar.create_event',
  'calendar.update_event',
  'calendar.delete_event',
] as const

const caspianTools = [
  ...commonReadTools,
  'browser.start_session',
  'browser.navigate',
  'browser.observe',
  'browser.search_flights',
  'browser.select_flight',
  'browser.prepare_flight_checkout',
] as const

const davidTools = [
  ...commonReadTools,
  'web_search',
  'application.evaluate_programme_eligibility',
  'application.resolve_requirement_conflict',
  'application.map_portal_field',
  'application.evaluate_professor_fit',
  'application.interpret_email_reply',
  'application.evaluate_writer_draft',
  'application.classify_application_message',
  'application.evaluate_reference_requirement',
  'application.record_opportunity',
  'application.create_case',
  'application.record_contact',
  'application.register_writer',
  'application.select_writer',
  'application.update_requirement',
  'application.record_portal_checkpoint',
  'application.record_evidence',
  'application.record_communication',
  'application.create_human_assignment',
  'application.coordinate_recommendations',
  'application.coordinate_academic_evidence',
  'application.coordinate_work_samples',
  'application.coordinate_fee',
  'application.record_fee_waiver_result',
  'application.execute_fee_payment',
  'application.reconcile_fee_payment',
  'application.build_referee_support_pack',
  'application.build_readiness_report',
  'application.generate_document',
  'application.generate_cv',
  'application.prepare_research_proposal',
  'application.review_research_proposal',
  'application.interpret_research_proposal_feedback',
  'application.finalize_research_proposal',
  'application.record_proposal_delivery',
  'application.generate_supervisor_outreach',
  'application.resolve_supplemental_questions',
  'application.submit',
  'application.request_roon',
  'browser.start_session',
  'browser.navigate',
  'browser.observe',
  'browser.act',
  'browser.submit',
] as const

function requiredEffectsForRoon(objective: string, taskContract: TaskContract): RequiredEffect[] {
  const text = objective.toLocaleLowerCase()
  const effects: RequiredEffect[] = []
  if (taskContract === 'communication.email' && actionIsAffirmed(text, 'gmail_send')) {
    effects.push('gmail_send')
  }
  if (taskContract === 'communication.calendar' || taskContract === 'communication.scheduling') {
    if (calendarWriteIsAffirmed(text)) {
      effects.push('calendar_write')
    }
    if (actionIsAffirmed(text, 'gmail_send')) {
      effects.push('gmail_send')
    }
  }
  return [...new Set(effects)]
}

function requiredEffectsForCaspian(objective: string, taskContract: TaskContract): RequiredEffect[] {
  const text = objective.toLocaleLowerCase()
  if (taskContract !== 'travel.flight_search') return []
  const asksForBooking = /\b(?:book|booking|buy|purchase|reserve|payment|handoff)\b/.test(text)
  const disallowsBooking = /\b(?:do\s+not|don't|never|without)\b[\s\S]{0,60}\b(?:book|booking|buy|purchase|reserve|payment)\b/.test(text) ||
    /\bstop\s+before\s+(?:any\s+)?booking\s+or\s+payment\b/.test(text)
  return (asksForBooking && !disallowsBooking) || requestsPaymentHandoff(text)
    ? ['booking_handoff']
    : ['validated_itinerary']
}

function requiredEffectsForDavid(objective: string, taskContract: TaskContract): RequiredEffect[] {
  if (taskContract === 'applications.review_handoff' && !/\b(?:submit|send in|final submission|finalize)\b/i.test(objective)) return ['application_plan']
  return /\b(?:submit|send in|final submission|finalize)\b/i.test(objective)
    ? ['application_submission']
    : ['application_plan']
}

export const specialistRegistry: Readonly<Record<SpecialistId, SpecialistRegistryEntry>> = {
  roon: {
    id: 'roon',
    version: 'roon@1',
    displayName: 'Roon',
    roleDescription: 'Communication and scheduling',
    iconReference: 'specialist:roon',
    supportedTaskContracts: ['communication.email', 'communication.scheduling', 'communication.calendar'],
    availableTools: roonTools,
    requiredEffectDerivation: requiredEffectsForRoon,
    approvalRules: {
      'gmail.send_message': 'require_approval',
      'calendar.create_event': 'require_approval',
      'calendar.update_event': 'require_approval',
      'calendar.delete_event': 'require_approval',
    },
    verifier: 'provider-confirmed Gmail and Calendar effects',
    retryRecoveryPolicy: 'same-run provider reconciliation with stable idempotency keys',
    handoffRules: ['may receive a typed handoff from Caspian', 'may hand off travel stages to Caspian'],
    observabilityTags: ['specialist:roon', 'domain:communication', 'domain:scheduling'],
    testFixtures: ['email-send', 'calendar-create', 'reply-resume', 'cross-domain-calendar'],
  },
  caspian: {
    id: 'caspian',
    version: 'caspian@1',
    displayName: 'Caspian',
    roleDescription: 'Travel and flight search',
    iconReference: 'specialist:caspian',
    supportedTaskContracts: ['travel.flight_search'],
    availableTools: caspianTools,
    requiredEffectDerivation: requiredEffectsForCaspian,
    approvalRules: {
      'browser.select_flight': 'allow',
      'browser.prepare_flight_checkout': 'allow',
      'browser.purchase': 'deny',
    },
    verifier: 'validated itinerary evidence and safe booking handoff',
    retryRecoveryPolicy: 'task-owned browser checkpoint, provider recovery, and stale-result refresh',
    handoffRules: ['may receive a typed travel stage from Roon', 'must hand itinerary or booking handoff back to the orchestrator'],
    observabilityTags: ['specialist:caspian', 'domain:travel', 'provider:browser'],
    testFixtures: ['flight-search', 'flight-selection', 'flight-payment-boundary', 'roon-to-caspian'],
  },
  david: {
    id: 'david',
    version: 'david@1',
    displayName: 'David',
    roleDescription: 'Applications, documents, and portal execution',
    iconReference: 'specialist:david',
    supportedTaskContracts: ['applications.planning', 'applications.review_handoff'],
    availableTools: davidTools,
    requiredEffectDerivation: requiredEffectsForDavid,
    approvalRules: {
      'application.submit': 'require_approval',
      'browser.submit': 'require_approval',
      'application.generate_document': 'allow',
      'application.generate_cv': 'allow',
      'application.register_writer': 'allow',
      'application.select_writer': 'allow',
    },
    verifier: 'grounded checklist/document state; provider-confirmed submission evidence',
    retryRecoveryPolicy: 'same-run attachment refresh, portal checkpoint replay, and evidence reconciliation',
    handoffRules: ['may stop at needs-context when applicant evidence is missing', 'delegates Gmail, contacts, Calendar, and OTP retrieval to Roon', 'may submit only through the exact approved application contract'],
    observabilityTags: ['specialist:david', 'domain:applications', 'boundary:approval-gated-submission'],
    testFixtures: ['application-checklist', 'missing-document', 'review-handoff', 'mock-portal-submit', 'otp-handoff'],
  },
}

export function getSpecialist(id: SpecialistId | string | null | undefined): SpecialistRegistryEntry | null {
  if (!id || !specialistIds.includes(id as SpecialistId)) return null
  return specialistRegistry[id as SpecialistId]
}

export function specialistVersion(id: SpecialistId): SpecialistVersion {
  return specialistRegistry[id].version
}

export function specialistCanUseTool(id: SpecialistId | string | null | undefined, toolName: string) {
  return Boolean(id && getSpecialist(id)?.availableTools.includes(toolName))
}

/**
 * Find the immediate next stage that owns a tool the current specialist tried
 * to use. The orchestrator uses this only to trigger a typed handoff; it never
 * expands the active specialist's tool contract or skips an intermediate stage.
 */
export function nextSpecialistForTool(
  stages: readonly SpecialistStage[],
  currentStageIndex: number,
  toolName: string,
) {
  const nextStage = stages[currentStageIndex + 1]
  return nextStage && specialistCanUseTool(nextStage.specialistId, toolName)
    ? nextStage
    : null
}

const capabilityToolsByContract: Readonly<Record<TaskContract, readonly string[]>> = {
  'communication.email': ['gmail.search_messages', 'gmail.create_draft', 'gmail.send_message'],
  'communication.scheduling': ['calendar.get_availability', 'calendar.create_event', 'gmail.create_draft'],
  'communication.calendar': ['calendar.get_availability', 'calendar.create_event'],
  'travel.flight_search': ['browser.search_flights'],
  'applications.planning': ['application.generate_document', 'application.generate_cv', 'application.register_writer', 'application.select_writer', 'browser.navigate'],
  'applications.review_handoff': ['application.generate_document', 'application.generate_cv', 'application.register_writer', 'application.select_writer', 'browser.navigate'],
}

const capabilityTermsByContract: Readonly<Record<TaskContract, RegExp>> = {
  'communication.email': /\b(?:email|gmail|mail|message|recipient)\b/i,
  'communication.scheduling': /\b(?:calendar|schedule|scheduling|meeting|availability|appointment|event|slot)\b/i,
  'communication.calendar': /\b(?:calendar|schedule|scheduling|meeting|availability|appointment|event|slot)\b/i,
  'travel.flight_search': /\b(?:flight|airfare|itinerary|airport|airline|air travel)\b/i,
  'applications.planning': /\b(?:application|cv|resume|document|admission|programme|program|school)\b/i,
  'applications.review_handoff': /\b(?:application|cv|resume|document|admission|programme|program|school)\b/i,
}

/**
 * Find the immediate next stage when a specialist asks for context because a
 * capability belongs to that next registered contract. This keeps capability
 * ownership in the registry instead of making the current specialist guess or
 * pause until its safe-step budget is exhausted.
 */
export function nextSpecialistForCapabilityRequest(
  stages: readonly SpecialistStage[],
  currentStageIndex: number,
  objective: string,
  question: string,
) {
  const nextStage = stages[currentStageIndex + 1]
  if (!nextStage) return null
  const registeredTools = capabilityToolsByContract[nextStage.taskContract] ?? []
  if (!registeredTools.some(toolName => specialistCanUseTool(nextStage.specialistId, toolName))) return null
  const nextContractTerms = capabilityTermsByContract[nextStage.taskContract]
  const capabilityUnavailable = /\b(?:capability|access|unavailable|not available|reconnect)\b/i.test(question)
  return capabilityUnavailable &&
    nextContractTerms.test(objective) &&
    nextContractTerms.test(question)
    ? nextStage
    : null
}

/**
 * Mixed flight tasks may register a communication stage before the travel
 * stage. That stage must not spend model turns trying to execute the flight
 * itself; the runtime can preserve the route and advance to Caspian directly.
 */
export function flightStageNeedsPreflightHandoff(
  capability: string | null | undefined,
  currentStage: SpecialistStage | null | undefined,
  nextStage: SpecialistStage | null | undefined,
) {
  return capability === 'flight_search' &&
    currentStage?.taskContract !== 'travel.flight_search' &&
    nextStage?.specialistId === 'caspian' &&
    nextStage.taskContract === 'travel.flight_search'
}

export function specialistRequiredEffects(
  id: SpecialistId,
  objective: string,
  taskContract: TaskContract,
) {
  return specialistRegistry[id].requiredEffectDerivation(objective, taskContract)
}

function stage(
  stageId: string,
  specialistId: SpecialistId,
  taskContract: TaskContract,
  label: string,
): SpecialistStage {
  return {
    stageId,
    specialistId,
    specialistVersion: specialistVersion(specialistId),
    taskContract,
    label,
  }
}

function routeTo(
  primarySpecialistId: SpecialistId,
  taskContract: TaskContract,
  stages: SpecialistStage[],
  rationale: string,
  confidence: RouteConfidence = 'high',
  extra: Partial<Pick<SpecialistRoute, 'applicationBoundary'>> = {},
): SpecialistRoute {
  return {
    classification: 'deterministic',
    confidence,
    primarySpecialistId,
    primarySpecialistVersion: specialistVersion(primarySpecialistId),
    taskContract,
    stages,
    supported: true,
    needsSemanticClassification: false,
    rationale,
    ...extra,
  }
}

function semanticRoute(rationale: string): SpecialistRoute {
  return {
    classification: 'semantic',
    confidence: 'low',
    primarySpecialistId: null,
    primarySpecialistVersion: null,
    taskContract: null,
    stages: [],
    supported: false,
    needsSemanticClassification: true,
    rationale,
  }
}

export function unsupportedRoute(rationale: string): SpecialistRoute {
  return {
    classification: 'unsupported',
    confidence: 'high',
    primarySpecialistId: null,
    primarySpecialistVersion: null,
    taskContract: null,
    stages: [],
    supported: false,
    needsSemanticClassification: false,
    rationale,
  }
}

/**
 * Route clear tasks without a model call. The classifier intentionally uses
 * domain semantics and not the exact examples in product copy or tests.
 */
export function routeTask(title: string, description = ''): SpecialistRoute {
  const text = `${title} ${description}`.trim().toLocaleLowerCase()
  const arrangedTrip = /\b(?:arrange|coordinate|organize|plan|book)\b[\s\S]{0,80}\b(?:trip|journey)\b/.test(text)
  const hasFlight = /\b(?:flight|flights|fly|airfare|airline|airlines|airport|airports|itinerary|itineraries|air travel|travel booking)\b/.test(text) ||
    /\b(?:book|find|compare)\b[\s\S]{0,60}\b(?:trip|journey)\b/.test(text) ||
    arrangedTrip
  const hasApplication = /\b(?:apply|applications?|grad(?:uate)? school|admissions?|transcripts?|personal statements?|statement of purpose|recommendation letters?|application deadlines?|application documents?|job applications?|grant applications?|referees?)\b/.test(text) ||
    /\b(?:contact|email|message|outreach|ask|follow[ -]?up)\b[\s\S]{0,100}\b(?:professors?|supervisors?|faculty|research groups?|labs?)\b/.test(text) ||
    /\b(?:professors?|supervisors?|faculty|research groups?|labs?)\b[\s\S]{0,100}\b(?:contact|email|message|outreach|ask|follow[ -]?up)\b/.test(text) ||
    /\b(?:what documents|missing documents)\b[\s\S]{0,80}\b(?:application|programme|program|school|university)\b/.test(text)
  const hasEmail = hasEmailIntent(text)
  const calendarCoordination = calendarCoordinationIsAffirmed(text) || calendarInviteIsAffirmed(text)
  const hasCalendar = hasCalendarIntent(text) || calendarCoordination

  if (hasFlight && (hasEmail || hasCalendar || /\b(?:arrange|coordinate|organize)\b/.test(text))) {
    const firstContract: TaskContract = hasCalendar ? 'communication.scheduling' : 'communication.email'
    const finalContract: TaskContract = hasCalendar ? 'communication.calendar' : 'communication.email'
    return routeTo(
      'roon',
      firstContract,
      [
        stage('communication-before-travel', 'roon', firstContract, hasCalendar ? 'Checking calendar constraints' : 'Preparing travel communication'),
        stage('travel-search', 'caspian', 'travel.flight_search', 'Searching for flights'),
        stage('communication-after-travel', 'roon', finalContract, hasCalendar ? 'Updating your calendar' : 'Sending the itinerary'),
      ],
      'The task combines travel with communication or scheduling, so ShotCount keeps one run and sequences Roon, Caspian, then Roon.',
      'medium',
    )
  }

  if (hasFlight) {
    return routeTo(
      'caspian',
      'travel.flight_search',
      [stage('travel-search', 'caspian', 'travel.flight_search', 'Searching for flights')],
      'The task contains flight or itinerary constraints.',
    )
  }

  if (hasApplication) {
    const requiresSubmission = /\b(?:submit|send in|finalize|final submission)\b/.test(text)
    return routeTo(
      'david',
      requiresSubmission ? 'applications.review_handoff' : 'applications.planning',
      [stage('application-planning', 'david', requiresSubmission ? 'applications.review_handoff' : 'applications.planning', requiresSubmission ? 'Preparing the approved submission path' : 'Preparing your application checklist')],
      requiresSubmission
        ? 'David owns the application execution path; final submission is gated by a deterministic readiness report and exact user approval.'
        : 'The task is application-oriented and belongs to David’s planning/document contract.',
      'high',
      { applicationBoundary: requiresSubmission ? 'supported_execution' : 'supported_planning' },
    )
  }

  if (hasCalendar && (calendarCoordination || (hasEmail && calendarWriteIsAffirmed(text)))) {
    return routeTo(
      'roon',
      'communication.scheduling',
      [stage('communication-scheduling', 'roon', 'communication.scheduling', 'Emailing and scheduling')],
      'The task combines email communication with a Calendar or meeting outcome.',
    )
  }
  if (hasEmail && hasCalendar && !calendarCoordination && !calendarWriteIsAffirmed(text)) {
    return routeTo(
      'roon',
      'communication.email',
      [stage('email', 'roon', 'communication.email', 'Emailing')],
      'The Calendar wording describes the message topic rather than a requested Calendar change.',
    )
  }
  if (hasCalendar) {
    return routeTo(
      'roon',
      'communication.calendar',
      [stage('calendar', 'roon', 'communication.calendar', 'Updating your calendar')],
      'The task contains a Calendar, meeting, availability, or scheduling outcome.',
    )
  }
  if (hasEmail) {
    return routeTo(
      'roon',
      'communication.email',
      [stage('email', 'roon', 'communication.email', 'Emailing')],
      'The task contains an email, reply, recipient, or follow-up outcome.',
    )
  }

  if (!text) return unsupportedRoute('The task has no usable objective.')
  return semanticRoute('The task does not identify a supported domain with enough confidence for deterministic routing.')
}

/**
 * Recover a specialist assignment for a pre-registry run. Historical runs
 * were broader than the new contracts, so only the domains that were already
 * explicit are relabelled. Unknown work stays with Roon only when its legacy
 * capability was genuinely Roon-owned; travel and applications never fall
 * back to Roon during migration.
 */
export function legacySpecialistRoute(
  title: string,
  description = '',
  legacyCapability = '',
): LegacySpecialistRoute | null {
  const deterministic = routeTask(title, description)
  if (deterministic.classification === 'deterministic') {
    return { ...deterministic, routingSource: 'legacy_migration' }
  }
  const capability = legacyCapability.toLocaleLowerCase()
  const text = `${title} ${description}`.toLocaleLowerCase()
  const specialistId: SpecialistId | null = capability === 'flight_search' || /\b(?:flight|airfare|itinerary|airport)\b/.test(text)
    ? 'caspian'
    : capability === 'browser' || /\b(?:apply|application|admission|transcript|statement of purpose|grad(?:uate)? school)\b/.test(text)
      ? 'david'
      : capability === 'gmail' || capability === 'calendar' || capability === 'scheduling' || capability === 'draft' || capability === 'research' || capability === 'research_draft'
        ? 'roon'
        : null
  if (!specialistId) return null
  return {
    ...routeTaskWithSemanticSpecialist(title, description, specialistId),
    routingSource: 'legacy_migration',
  }
}

/** Apply a trusted semantic domain label returned by Luna to the same typed route. */
export function routeTaskWithSemanticSpecialist(
  title: string,
  description: string,
  specialistId: SpecialistId,
): SpecialistRoute {
  const deterministic = routeTask(title, description)
  if (deterministic.classification === 'deterministic') return deterministic
  if (specialistId === 'caspian') {
    return {
      ...routeTo(
        'caspian',
        'travel.flight_search',
        [stage('travel-search', 'caspian', 'travel.flight_search', 'Searching for flights')],
        'Luna identified a travel intent that was not explicit enough for deterministic routing.',
        'medium',
      ),
      classification: 'semantic',
    }
  }
  if (specialistId === 'david') {
    return {
      ...routeTo(
        'david',
        'applications.planning',
        [stage('application-planning', 'david', 'applications.planning', 'Preparing your application checklist')],
        'Luna identified an application intent that was not explicit enough for deterministic routing.',
        'medium',
      ),
      classification: 'semantic',
      applicationBoundary: 'supported_planning',
    }
  }
  return {
    ...routeTo(
      'roon',
      'communication.email',
      [stage('email', 'roon', 'communication.email', 'Emailing')],
      'Luna identified a communication intent that was not explicit enough for deterministic routing.',
      'medium',
    ),
    classification: 'semantic',
  }
}

export type SpecialistHandoff = {
  taskId: string
  agentRunId: string
  objective: string
  relevantConstraints: Record<string, unknown>
  completedEffects: RequiredEffect[]
  unsatisfiedEffects: RequiredEffect[]
  providerEvidence: Array<Record<string, unknown>>
  approvalState: string
  nextRequiredStage: SpecialistStage | null
  fromSpecialistId: SpecialistId
  fromSpecialistVersion: SpecialistVersion
  toSpecialistId: SpecialistId
  toSpecialistVersion: SpecialistVersion
}

export function createSpecialistHandoff(input: Omit<SpecialistHandoff, 'fromSpecialistVersion' | 'toSpecialistVersion'>): SpecialistHandoff {
  return {
    ...input,
    fromSpecialistVersion: specialistVersion(input.fromSpecialistId),
    toSpecialistVersion: specialistVersion(input.toSpecialistId),
  }
}

export function specialistIdentity(id: SpecialistId | string | null | undefined) {
  const entry = getSpecialist(id)
  return entry
    ? { id: entry.id, version: entry.version, name: entry.displayName, role: entry.roleDescription, icon: entry.iconReference }
    : null
}

export function safeSemanticSpecialist(value: unknown): SpecialistId | null {
  return typeof value === 'string' && specialistIds.includes(value as SpecialistId)
    ? value as SpecialistId
    : null
}
