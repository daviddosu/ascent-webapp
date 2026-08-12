/**
 * Canonical supplemental-question workflow.
 *
 * A portal question is a requirement, not an ad-hoc text box. This module is
 * deliberately deterministic and provider-neutral so the same discovery,
 * routing, constraint, quality, consistency, and read-back rules run in the
 * browser worker, David's Edge Function, and the regression benchmark.
 */

export const applicationQuestionTypes = [
  'factual',
  'factual_with_explanation',
  'short_essay',
  'motivation',
  'programme_fit',
  'research_interest',
  'career_goals',
  'personal_background',
  'leadership',
  'challenge_adversity',
  'community',
  'diversity',
  'ethical_conduct',
  'academic_explanation',
  'employment',
  'funding',
  'previous_application',
  'additional_information',
  'disclosure',
  'yes_no',
  'select',
  'date',
  'numeric',
  'contact',
  'other',
] as const
export type ApplicationQuestionType = typeof applicationQuestionTypes[number]

export const applicationQuestionInputTypes = [
  'text',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'date',
  'number',
  'file',
  'email',
  'tel',
  'unknown',
] as const
export type ApplicationQuestionInputType = typeof applicationQuestionInputTypes[number]

export const applicationQuestionUnits = ['characters', 'words', 'bytes'] as const
export type ApplicationQuestionUnit = typeof applicationQuestionUnits[number]

export const applicationQuestionStatuses = [
  'discovered',
  'classified',
  'ready_to_answer',
  'awaiting_user',
  'awaiting_writer',
  'generated',
  'quality_checked',
  'consistency_checked',
  'ready_to_write',
  'written',
  'saved',
  'verified',
  'skipped',
  'blocked',
  'failed',
] as const
export type ApplicationQuestionStatus = typeof applicationQuestionStatuses[number]

export const supplementalAnswerRoutes = [
  'deterministic',
  'reuse',
  'david_generate',
  'writer_delegate',
  'user_decision',
  'skip',
] as const
export type SupplementalAnswerRoute = typeof supplementalAnswerRoutes[number]

export type SupplementalApprovalRequirement = 'none' | 'answer_review' | 'submission'

export type ApplicationQuestionOption = {
  value: string
  label: string
  disabled?: boolean
}

export type ApplicationQuestionSource = {
  kind: 'portal_dom' | 'portal_text' | 'saved_checkpoint' | 'prior_application' | 'applicant_context'
  portal: string
  url: string | null
  section: string
  observedAt: string | null
  evidenceIds: string[]
  fieldName?: string | null
}

export type SavedStateEvidence = {
  sessionId: string
  persistedValue: unknown
  readBackValue: unknown
  saveConfirmation: string
  evidenceIds: string[]
  observedAt: string
  verified: boolean
}

export type ApplicationQuestionRetryState = {
  attempts: number
  maximumAttempts: number
  lastFailure: string | null
  nextAttemptAt: string | null
  escalated: boolean
}

export type SupplementalAnswerStrategy = {
  questionId: string
  exactPrompt: string
  normalizedAsk: string
  answerRoute: SupplementalAnswerRoute
  questionType: ApplicationQuestionType
  sourceFactIds: string[]
  evidenceIds: string[]
  structure: string[]
  requiredElements: string[]
  prohibitedElements: string[]
  tone: string
  constraint: string
  crossCheckKeys: string[]
  writerBrief: string | null
  approvalRequirement: SupplementalApprovalRequirement
}

export type ApplicationQuestion = {
  id: string
  applicationCaseId: string
  applicationRequirementId?: string | null
  fieldName?: string | null
  questionKey: string
  portal: string
  portalSection: string
  exactPrompt: string
  normalizedPrompt: string
  questionType: ApplicationQuestionType
  inputType: ApplicationQuestionInputType
  required: boolean
  optional: boolean
  minimum: number | null
  maximum: number | null
  unit: ApplicationQuestionUnit | null
  validationRule: string | null
  options: ApplicationQuestionOption[]
  conditionalTrigger: string | null
  source: ApplicationQuestionSource
  currentValue: unknown
  status: ApplicationQuestionStatus
  answerStrategy: SupplementalAnswerStrategy | null
  evidenceDependencies: string[]
  artifactDependencies: string[]
  writerDependencies: string[]
  approvalRequirement: SupplementalApprovalRequirement
  savedStateEvidence: SavedStateEvidence | null
  answerRoute: SupplementalAnswerRoute | null
  answerValue: string | null
  lastError: string | null
  retryState?: ApplicationQuestionRetryState
}

/** Browser-facing field shape. Extra fields are optional so old checkpoints remain readable. */
export type PortalFieldObservation = {
  name: string
  label: string
  prompt?: string | null
  type: string
  value: string
  checked: boolean
  required: boolean
  fileName?: string | null
  options?: ApplicationQuestionOption[]
  minLength?: number | null
  maxLength?: number | null
  min?: number | null
  max?: number | null
  pattern?: string | null
  section?: string | null
  conditionalTrigger?: string | null
  visible?: boolean
  savedState?: boolean
}

export type DiscoverApplicationQuestionsInput = {
  applicationCaseId: string
  portal: string
  section: string
  url?: string | null
  observedAt?: string | null
  fields: PortalFieldObservation[]
  sourceEvidenceIds?: string[]
}

export type VerifiedSupplementalFact = {
  factId: string
  value: unknown
  evidenceIds?: string[]
  verified?: boolean
  source?: string | null
}

export type ReusableSupplementalAnswer = {
  key: string
  answer: string
  evidenceIds?: string[]
  approved?: boolean
}

export type SupplementalContext = {
  facts?: VerifiedSupplementalFact[]
  reusableAnswers?: ReusableSupplementalAnswer[]
  canonicalAnswers?: Record<string, string | number | boolean | null>
  profileFacts?: VerifiedSupplementalFact[]
}

export type SupplementalProgressInteraction = {
  kind: 'application_question'
  id: string
  questionId?: string
  requirementId: string
  question: string
  reason: string
  knownContext: string[]
  reusableContextKeys: string[]
  required: boolean
  priority: number
  mapsToRequirement: string
  inputType: 'text' | 'number' | 'date' | 'boolean'
  unit: ApplicationQuestionUnit | null
  minimum: number | null
  maximum: number | null
  options: ApplicationQuestionOption[]
  currentValue: string | null
  placeholder: string
}

export type SupplementalResolution = {
  question: ApplicationQuestion
  answer: string | null
  sourceFactIds: string[]
  evidenceIds: string[]
  route: SupplementalAnswerRoute
  status: ApplicationQuestionStatus
  strategy: SupplementalAnswerStrategy
  reason: string
  progressInteraction: SupplementalProgressInteraction | null
}

export type SupplementalAnswerCounts = {
  characters: number
  words: number
  bytes: number
}

export type SupplementalGateResult = {
  valid: boolean
  issues: string[]
  counts: SupplementalAnswerCounts
}

function clean(value: unknown, maximum = 4_000) {
  return String(value ?? '').trim().slice(0, maximum)
}

function normalized(value: unknown) {
  return clean(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function compactKey(value: unknown) {
  return normalized(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 180)
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function textFromField(field: PortalFieldObservation) {
  return clean(field.prompt || field.label || field.name || 'Supplemental question')
}

function isEmptyValue(value: unknown) {
  if (value === null || value === undefined) return true
  if (typeof value === 'boolean') return false
  return clean(value) === ''
}

function constraintFromPrompt(prompt: string) {
  const range = prompt.match(/\b(?:between|from)\s+(\d+)\s+(?:and|to)\s+(\d+)\s*(words?|characters?|chars?|bytes?)\b/i)
  const maximum = prompt.match(/\b(?:maximum|max(?:imum)?|no more than|at most|limit(?:ed)? to|within)\s*(\d+)\s*(words?|characters?|chars?|bytes?)\b/i)
  const minimum = prompt.match(/\b(?:minimum|min(?:imum)?|at least|no fewer than)\s*(\d+)\s*(words?|characters?|chars?|bytes?)\b/i)
  const direct = prompt.match(/\b(\d+)\s*(words?|characters?|chars?|bytes?)\b/i)
  const match = range || maximum || minimum || direct
  if (!match) return { minimum: null, maximum: null, unit: null as ApplicationQuestionUnit | null }
  const first = Number(match[1])
  const second = range ? Number(match[2]) : null
  const unitText = String(range ? match[3] : match[2]).toLocaleLowerCase()
  const unit: ApplicationQuestionUnit = unitText.startsWith('word')
    ? 'words'
    : unitText.startsWith('byte')
      ? 'bytes'
      : 'characters'
  return {
    minimum: range ? first : minimum ? first : null,
    maximum: range ? second : maximum || direct ? first : null,
    unit,
  }
}

function classifyQuestion(prompt: string, field: PortalFieldObservation, options: ApplicationQuestionOption[]): ApplicationQuestionType {
  const ask = normalized(prompt)
  const input = normalized(field.type)
  const optionValues = options.map(option => normalized(`${option.value} ${option.label}`)).join(' ')
  if (/\b(?:yes|no)\b/.test(optionValues) && options.length <= 4) return 'yes_no'
  if (input === 'date' || /\b(?:date|when did|month and year)\b/.test(ask)) return 'date'
  if (input === 'number' || /\b(?:how many|amount|gpa|score|number of|years of)\b/.test(ask)) return 'numeric'
  if (input === 'email' || /\b(?:email|e-mail|contact address)\b/.test(ask)) return 'contact'
  if (input === 'select' || input === 'radio' || input === 'checkbox') return 'select'
  if (/\b(?:disclose|disciplin|misconduct|criminal|conduct|ethical|convict|plagiar|integrity)\b/.test(ask)) return 'ethical_conduct'
  if (/\b(?:previous|prior|formerly|applied before|application history)\b/.test(ask)) return 'previous_application'
  if (/\b(?:funding|finance|financial|scholarship|sponsor|tuition|support)\b/.test(ask)) return 'funding'
  if (/\b(?:employment|employer|job|work experience|career break|gap in employment)\b/.test(ask)) return 'employment'
  if (/\b(?:academic|grade|gpa|transcript|lower mark|explain.*result|study interruption)\b/.test(ask)) return 'academic_explanation'
  if (/\b(?:diversity|identity|first-generation|underrepresented|background)\b/.test(ask)) return 'diversity'
  if (/\b(?:community|volunteer|service|contribution|impact.*community)\b/.test(ask)) return 'community'
  if (/\b(?:leadership|led|manage|team)\b/.test(ask)) return 'leadership'
  if (/\b(?:challenge|adversity|obstacle|setback|failure)\b/.test(ask)) return 'challenge_adversity'
  if (/\b(?:career|professional goal|after.*degree|future plan)\b/.test(ask)) return 'career_goals'
  if (/\b(?:research|thesis|method|topic|interest)\b/.test(ask)) return 'research_interest'
  if (/\b(?:fit|why this programme|why this program|why.*institution|suitability)\b/.test(ask)) return 'programme_fit'
  if (/\b(?:motivat|why.*apply|why.*study|purpose)\b/.test(ask)) return 'motivation'
  if (/\b(?:explain|describe|outline|give an example|provide a statement)\b/.test(ask)) return 'factual_with_explanation'
  if (field.type === 'textarea' || (field.maxLength ?? 0) > 0 || /\b(?:essay|statement|response)\b/.test(ask)) return 'short_essay'
  if (/\b(?:additional|anything else|other information|optional information)\b/.test(ask)) return 'additional_information'
  if (/\b(?:name|institution|degree|nationality|citizenship|address|title|telephone|phone)\b/.test(ask)) return 'factual'
  return 'other'
}

function answerRouteFor(question: Pick<ApplicationQuestion, 'questionType' | 'maximum' | 'unit' | 'required'>) {
  const highStakes = new Set<ApplicationQuestionType>([
    'motivation', 'programme_fit', 'personal_background', 'leadership',
    'challenge_adversity', 'community', 'diversity', 'ethical_conduct',
    'academic_explanation', 'short_essay', 'career_goals', 'funding',
  ])
  if (highStakes.has(question.questionType) && (question.maximum === null || question.unit !== 'words' || question.maximum > 250)) return 'writer_delegate' as const
  if (highStakes.has(question.questionType) || question.questionType === 'research_interest') return 'david_generate' as const
  return 'deterministic' as const
}

function constraintDescription(question: Pick<ApplicationQuestion, 'minimum' | 'maximum' | 'unit'>) {
  if (question.minimum !== null && question.maximum !== null) return `${question.minimum}-${question.maximum} ${question.unit}`
  if (question.maximum !== null) return `at most ${question.maximum} ${question.unit}`
  if (question.minimum !== null) return `at least ${question.minimum} ${question.unit}`
  return 'No explicit length limit was observed.'
}

function strategyStructure(type: ApplicationQuestionType) {
  switch (type) {
    case 'community': return ['Name the concrete community or setting.', 'Describe the contribution and actions.', 'State the observable result or learning.']
    case 'leadership': return ['Set the context and responsibility.', 'Describe the decision or action.', 'Show the outcome and reflection.']
    case 'challenge_adversity': return ['Give only the relevant context.', 'Explain the response and choices.', 'Close with outcome, learning, and present relevance.']
    case 'programme_fit': return ['Name the programme-specific fit.', 'Connect verified preparation to the opportunity.', 'End with the precise contribution or next step.']
    case 'motivation': return ['State the motivation directly.', 'Support it with verified preparation or experience.', 'Connect it to the programme and future direction.']
    case 'research_interest': return ['State the research problem or area.', 'Name grounded methods or preparation.', 'Explain the intended contribution or fit.']
    case 'career_goals': return ['State the near-term goal.', 'Connect it to verified preparation.', 'Describe the longer-term contribution.']
    case 'diversity': return ['Share only an approved personal context.', 'Explain the perspective or action it shaped.', 'Describe the contribution to the community.']
    default: return ['Answer the exact prompt directly.', 'Use only verified context.', 'Stop when the constraint is satisfied.']
  }
}

function strategyFor(question: ApplicationQuestion, route: SupplementalAnswerRoute, sourceFactIds: string[], evidenceIds: string[]): SupplementalAnswerStrategy {
  const structure = strategyStructure(question.questionType)
  const writer = route === 'writer_delegate'
    ? `Write a portal-ready response to this exact prompt: “${question.exactPrompt}”. Use only the verified evidence supplied for question ${question.id}. Constraint: ${constraintDescription(question)}. Structure: ${structure.join(' ')} Do not invent names, dates, results, identities, or motivations.`
    : null
  return {
    questionId: question.id,
    exactPrompt: question.exactPrompt,
    normalizedAsk: question.normalizedPrompt,
    answerRoute: route,
    questionType: question.questionType,
    sourceFactIds,
    evidenceIds,
    structure,
    requiredElements: structure,
    prohibitedElements: ['Unsupported achievements or personal details.', 'A response copied from a different programme or prompt.', 'Placeholder text or a claim that conflicts with the rest of the application.'],
    tone: 'specific, direct, reflective, and proportionate to the exact prompt',
    constraint: constraintDescription(question),
    crossCheckKeys: [question.questionKey, question.normalizedPrompt],
    writerBrief: writer,
    approvalRequirement: route === 'writer_delegate' || route === 'david_generate' ? 'answer_review' : 'none',
  }
}

function optionList(field: PortalFieldObservation) {
  if (Array.isArray(field.options)) return field.options.map(option => ({ value: clean(option.value, 500), label: clean(option.label, 500), ...(option.disabled ? { disabled: true } : {}) }))
  return []
}

function inputType(field: PortalFieldObservation): ApplicationQuestionInputType {
  const type = normalized(field.type)
  if (applicationQuestionInputTypes.includes(type as ApplicationQuestionInputType)) return type as ApplicationQuestionInputType
  if (type === 'select-one' || type === 'select-multiple') return 'select'
  return 'unknown'
}

function groupFields(fields: PortalFieldObservation[]) {
  const groups = new Map<string, PortalFieldObservation[]>()
  for (const field of fields) {
    if (field.visible === false || field.savedState === true) continue
    const type = inputType(field)
    if (type === 'unknown' && !field.label && !field.prompt && !field.name) continue
    const groupName = type === 'radio' || type === 'checkbox'
      ? field.name || textFromField(field)
      : `${field.name || textFromField(field)}|${textFromField(field)}`
    groups.set(groupName, [...(groups.get(groupName) ?? []), field])
  }
  return [...groups.values()]
}

export function discoverApplicationQuestions(input: DiscoverApplicationQuestionsInput): ApplicationQuestion[] {
  const now = input.observedAt ?? new Date().toISOString()
  return groupFields(input.fields).map(group => {
    const first = group[0]!
    const prompt = textFromField(first)
    const normalizedPrompt = normalized(prompt)
    const type = inputType(first)
    const options = [...new Map(group.flatMap(field => optionList(field)).map(option => [option.value, option])).values()]
    const parsed = constraintFromPrompt(prompt)
    const minimum = first.minLength ?? parsed.minimum
    const maximum = first.maxLength ?? parsed.maximum
    const unit = parsed.unit ?? ((minimum !== null || maximum !== null) ? 'characters' : null)
    const conditionalTrigger = first.conditionalTrigger || (group.find(field => field.conditionalTrigger)?.conditionalTrigger ?? null)
    const portalSection = clean(first.section || input.section, 240)
    const fieldName = clean(first.name || group.map(field => field.name).filter(Boolean).join('|'), 240)
    const questionKey = `${compactKey(input.portal)}:${compactKey(portalSection)}:${compactKey(fieldName || normalizedPrompt)}:${stableHash(normalizedPrompt)}`.slice(0, 320)
    const id = `application-question:${stableHash(`${input.applicationCaseId}:${questionKey}`)}`
    const required = group.some(field => field.required)
    const currentValue = type === 'checkbox'
      ? group.filter(field => field.checked).map(field => field.value || field.name)
      : type === 'radio'
        ? group.find(field => field.checked)?.value ?? ''
        : first.value
    const question: ApplicationQuestion = {
      id,
      applicationCaseId: input.applicationCaseId,
      questionKey,
      portal: clean(input.portal, 240),
      portalSection,
      exactPrompt: prompt,
      normalizedPrompt,
      questionType: classifyQuestion(prompt, first, options),
      inputType: type,
      required,
      optional: !required,
      minimum,
      maximum,
      unit,
      validationRule: first.pattern ? `pattern:${clean(first.pattern, 500)}` : required ? 'required' : null,
      options,
      conditionalTrigger: conditionalTrigger ? clean(conditionalTrigger, 500) : null,
      source: {
        kind: 'portal_dom',
        portal: clean(input.portal, 240),
        url: input.url ? clean(input.url, 2000) : null,
        section: portalSection,
        observedAt: now,
        evidenceIds: [...new Set(input.sourceEvidenceIds ?? [])],
        fieldName,
      },
      currentValue,
      status: 'classified',
      answerStrategy: null,
      evidenceDependencies: [],
      artifactDependencies: [],
      writerDependencies: [],
      approvalRequirement: 'none',
      savedStateEvidence: null,
      answerRoute: null,
      answerValue: isEmptyValue(currentValue) ? null : clean(currentValue, 20_000),
      lastError: null,
      retryState: { attempts: 0, maximumAttempts: 3, lastFailure: null, nextAttemptAt: null, escalated: false },
    }
    const route = answerRouteFor(question)
    question.answerRoute = route
    question.answerStrategy = strategyFor(question, route, [], [])
    question.approvalRequirement = question.answerStrategy.approvalRequirement
    question.status = isEmptyValue(currentValue) ? 'ready_to_answer' : 'written'
    return question
  })
}

function aliasesFor(question: ApplicationQuestion) {
  const ask = normalized(question.exactPrompt)
  const aliases = new Set<string>([question.questionKey, question.normalizedPrompt])
  const terms = [
    ['institution', 'education', 'university', 'undergraduate'],
    ['employer', 'employment', 'work'],
    ['research', 'thesis', 'methods', 'interest'],
    ['career', 'goal', 'future'],
    ['community', 'volunteer', 'service'],
    ['leadership', 'team'],
    ['funding', 'scholarship', 'finance'],
    ['citizenship', 'nationality', 'residence'],
    ['contact', 'email', 'phone'],
    ['gpa', 'grade', 'score'],
  ]
  for (const group of terms) if (group.some(term => ask.includes(term))) group.forEach(term => aliases.add(term))
  return aliases
}

function matchingFacts(question: ApplicationQuestion, context: SupplementalContext) {
  const all = [...(context.facts ?? []), ...(context.profileFacts ?? [])]
  const aliases = aliasesFor(question)
  return all.filter(fact => {
    if (fact.verified === false) return false
    const factKey = normalized(fact.factId)
    return [...aliases].some(alias => factKey.includes(normalized(alias)) || normalized(alias).includes(factKey))
  }).filter(fact => !isEmptyValue(fact.value))
}

function knownContextLines(facts: VerifiedSupplementalFact[]) {
  return facts.slice(0, 5).map(fact => `${fact.factId}: ${typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value)}`)
}

function interactionFor(question: ApplicationQuestion, reason: string, facts: VerifiedSupplementalFact[]): SupplementalProgressInteraction {
  const inputType = question.questionType === 'yes_no' ? 'boolean' : question.inputType === 'number' || question.questionType === 'numeric' ? 'number' : question.inputType === 'date' || question.questionType === 'date' ? 'date' : 'text'
  return {
    kind: 'application_question',
    id: `application-question-interaction:${question.id}`,
    questionId: question.id,
    requirementId: question.id,
    question: question.exactPrompt,
    reason,
    knownContext: knownContextLines(facts),
    reusableContextKeys: [],
    required: question.required,
    priority: question.required ? 1 : 4,
    mapsToRequirement: question.id,
    inputType,
    unit: question.unit,
    minimum: question.minimum,
    maximum: question.maximum,
    options: question.options,
    currentValue: question.answerValue,
    placeholder: question.unit && question.maximum !== null ? `Answer in ${question.maximum} ${question.unit} or fewer` : 'Answer the exact portal question',
  }
}

export function buildSupplementalAnswerStrategy(question: ApplicationQuestion, route: SupplementalAnswerRoute = question.answerRoute ?? answerRouteFor(question), sourceFactIds: string[] = [], evidenceIds: string[] = []) {
  return strategyFor(question, route, sourceFactIds, evidenceIds)
}

export function resolveSupplementalAnswer(question: ApplicationQuestion, context: SupplementalContext = {}): SupplementalResolution {
  const facts = matchingFacts(question, context)
  const evidenceIds = [...new Set(facts.flatMap(fact => fact.evidenceIds ?? []))]
  const sourceFactIds = facts.map(fact => fact.factId)
  const reusable = [...(context.reusableAnswers ?? [])].find(answer =>
    answer.approved !== false && [answer.key, compactKey(answer.key)].some(key => aliasesFor(question).has(key) || question.normalizedPrompt.includes(normalized(key))),
  )
  if (reusable) {
    const strategy = strategyFor(question, 'reuse', sourceFactIds, [...new Set([...evidenceIds, ...(reusable.evidenceIds ?? [])])])
    return { question: { ...question, answerRoute: 'reuse', status: 'ready_to_write', answerStrategy: strategy, approvalRequirement: strategy.approvalRequirement }, answer: reusable.answer, sourceFactIds, evidenceIds: strategy.evidenceIds, route: 'reuse', status: 'ready_to_write', strategy, reason: 'Reused an approved answer already linked to this question.', progressInteraction: null }
  }
  const canonical = Object.entries(context.canonicalAnswers ?? {}).find(([key, value]) => value !== null && value !== undefined && aliasesFor(question).has(key))
  if (canonical && question.questionType !== 'short_essay' && question.questionType !== 'additional_information') {
    const strategy = strategyFor(question, 'deterministic', sourceFactIds, evidenceIds)
    return { question: { ...question, answerRoute: 'deterministic', status: 'ready_to_write', answerStrategy: strategy, approvalRequirement: strategy.approvalRequirement }, answer: String(canonical[1]), sourceFactIds, evidenceIds, route: 'deterministic', status: 'ready_to_write', strategy, reason: 'Resolved from the canonical application answer set.', progressInteraction: null }
  }
  const route = question.answerRoute ?? answerRouteFor(question)
  if (facts.length && (route === 'deterministic' || question.questionType === 'factual' || question.questionType === 'date' || question.questionType === 'numeric' || question.questionType === 'contact' || question.questionType === 'yes_no' || question.questionType === 'select')) {
    const strategy = strategyFor(question, 'deterministic', sourceFactIds, evidenceIds)
    const value = facts[0]!.value
    return { question: { ...question, answerRoute: 'deterministic', status: 'ready_to_write', answerStrategy: strategy, evidenceDependencies: sourceFactIds, approvalRequirement: strategy.approvalRequirement }, answer: typeof value === 'string' ? value : JSON.stringify(value), sourceFactIds, evidenceIds, route: 'deterministic', status: 'ready_to_write', strategy, reason: 'Resolved from verified applicant context; no writing judgement is required.', progressInteraction: null }
  }
  if (route === 'writer_delegate') {
    const strategy = strategyFor(question, route, sourceFactIds, evidenceIds)
    const status: ApplicationQuestionStatus = facts.length ? 'awaiting_writer' : question.required ? 'awaiting_user' : 'skipped'
    const reason = facts.length ? 'This is a substantial or high-stakes narrative; delegate it through the existing writer workflow with a source-linked brief.' : 'The narrative needs verified applicant context before a writer can be briefed safely.'
    return { question: { ...question, answerRoute: facts.length ? route : 'user_decision', status, answerStrategy: strategy, evidenceDependencies: sourceFactIds, writerDependencies: facts.length ? [question.id] : [], approvalRequirement: strategy.approvalRequirement, lastError: facts.length ? null : 'Verified context is missing.' }, answer: null, sourceFactIds, evidenceIds, route: facts.length ? route : 'user_decision', status, strategy, reason, progressInteraction: facts.length ? null : question.required ? interactionFor(question, reason, facts) : null }
  }
  if (route === 'david_generate' && facts.length) {
    const strategy = strategyFor(question, route, sourceFactIds, evidenceIds)
    return { question: { ...question, answerRoute: route, status: 'ready_to_write', answerStrategy: strategy, evidenceDependencies: sourceFactIds, approvalRequirement: strategy.approvalRequirement }, answer: null, sourceFactIds, evidenceIds, route, status: 'ready_to_write', strategy, reason: 'David can construct this response from verified context, then run the answer and consistency gates.', progressInteraction: null }
  }
  const strategy = strategyFor(question, 'user_decision', sourceFactIds, evidenceIds)
  const status: ApplicationQuestionStatus = question.required ? 'awaiting_user' : 'skipped'
  const reason = question.required ? 'No verified reusable context answers this exact question. Only the missing applicant fact or judgement is requested.' : 'No verified answer is available and the portal marks this question optional; it remains explicitly skipped.'
  return { question: { ...question, answerRoute: question.required ? 'user_decision' : 'skip', status, answerStrategy: strategy, approvalRequirement: strategy.approvalRequirement, lastError: question.required ? 'Verified context is missing.' : null }, answer: null, sourceFactIds, evidenceIds, route: question.required ? 'user_decision' : 'skip', status, strategy, reason, progressInteraction: question.required ? interactionFor(question, reason, facts) : null }
}

export function countSupplementalResponse(answer: string): SupplementalAnswerCounts {
  const text = clean(answer, 100_000)
  const bytes = typeof TextEncoder === 'undefined' ? encodeURIComponent(text).replace(/%[0-9A-F]{2}/g, 'x').length : new TextEncoder().encode(text).length
  return { characters: Array.from(text).length, words: text ? text.split(/\s+/u).filter(Boolean).length : 0, bytes }
}

export function validateSupplementalAnswer(question: ApplicationQuestion, answer: string | null | undefined): SupplementalGateResult {
  const text = clean(answer, 100_000)
  const counts = countSupplementalResponse(text)
  const issues: string[] = []
  if (question.required && !text) issues.push('answer_required')
  if (text && question.minimum !== null && counts[question.unit ?? 'characters'] < question.minimum) issues.push(`minimum_${question.unit}`)
  if (text && question.maximum !== null && counts[question.unit ?? 'characters'] > question.maximum) issues.push(`maximum_${question.unit}`)
  if (question.options.length && text && !question.options.some(option => normalized(option.value) === normalized(text) || normalized(option.label) === normalized(text))) issues.push('option_not_allowed')
  if (question.validationRule?.startsWith('pattern:') && text) {
    try {
      if (!new RegExp(question.validationRule.slice(8)).test(text)) issues.push('pattern_mismatch')
    } catch {
      issues.push('invalid_validation_rule')
    }
  }
  if (text && /(?:\[\s*(?:insert|add|name|date|example)|<\s*(?:insert|name|date)|TODO|TBD)/i.test(text)) issues.push('placeholder_text')
  return { valid: issues.length === 0, issues, counts }
}

export function qualityCheckSupplementalAnswer(question: ApplicationQuestion, answer: string | null | undefined, strategy = question.answerStrategy): SupplementalGateResult {
  const result = validateSupplementalAnswer(question, answer)
  const issues = [...result.issues]
  const text = clean(answer, 100_000)
  if (text && strategy && strategy.answerRoute !== 'deterministic' && strategy.answerRoute !== 'reuse') {
    if (strategy.sourceFactIds.length === 0 && question.questionType !== 'additional_information') issues.push('no_verified_evidence_dependencies')
    if (text.length < 12 && question.inputType === 'textarea') issues.push('narrative_too_thin')
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)], counts: result.counts }
}

export function consistencyCheckSupplementalAnswer(question: ApplicationQuestion, answer: string | null | undefined, context: SupplementalContext = {}): SupplementalGateResult {
  const result = validateSupplementalAnswer(question, answer)
  const issues = [...result.issues]
  const text = normalized(answer)
  const aliases = aliasesFor(question)
  const canonical = Object.entries(context.canonicalAnswers ?? {}).filter(([key, value]) => value !== null && value !== undefined && aliases.has(key))
  for (const [, value] of canonical) if (question.questionType === 'factual' || question.questionType === 'date' || question.questionType === 'numeric' || question.questionType === 'contact') {
    if (normalized(value) !== text) issues.push('conflicts_with_canonical_answer')
  }
  for (const fact of matchingFacts(question, context)) if (['factual', 'date', 'numeric', 'contact', 'yes_no', 'select'].includes(question.questionType) && normalized(fact.value) !== text) issues.push('conflicts_with_verified_fact')
  return { valid: issues.length === 0, issues: [...new Set(issues)], counts: result.counts }
}

export function runSupplementalAnswerGates(question: ApplicationQuestion, answer: string | null | undefined, context: SupplementalContext = {}): SupplementalGateResult {
  const strategy = question.answerStrategy ?? buildSupplementalAnswerStrategy(question)
  const quality = qualityCheckSupplementalAnswer(question, answer, strategy)
  const consistency = consistencyCheckSupplementalAnswer(question, answer, context)
  return { valid: quality.valid && consistency.valid, issues: [...new Set([...quality.issues, ...consistency.issues])], counts: quality.counts }
}

export function verifySavedSupplementalAnswer(input: {
  question: ApplicationQuestion
  persistedValue: unknown
  readBackValue: unknown
  saveConfirmation: string
  sessionId: string
  evidenceIds: string[]
  observedAt?: string
}) {
  const persisted = clean(input.persistedValue, 100_000)
  const readBack = clean(input.readBackValue, 100_000)
  const answerCheck = validateSupplementalAnswer(input.question, persisted)
  const issues = [...answerCheck.issues]
  if (!input.saveConfirmation.trim()) issues.push('save_confirmation_missing')
  if (!input.sessionId.trim()) issues.push('session_id_missing')
  if (!input.evidenceIds.length) issues.push('evidence_missing')
  if (persisted !== readBack) issues.push('read_back_mismatch')
  const verified = issues.length === 0
  const evidence: SavedStateEvidence = {
    sessionId: input.sessionId,
    persistedValue: input.persistedValue,
    readBackValue: input.readBackValue,
    saveConfirmation: input.saveConfirmation,
    evidenceIds: [...new Set(input.evidenceIds)],
    observedAt: input.observedAt ?? new Date().toISOString(),
    verified,
  }
  return { verified, issues: [...new Set(issues)], evidence, status: verified ? 'verified' as const : 'failed' as const }
}

export function createSupplementalProgressInteraction(question: ApplicationQuestion, reason: string, facts: VerifiedSupplementalFact[] = []) {
  return interactionFor(question, reason, facts)
}
