import type { ApplicationControllerState } from './application-controller.ts'
import type { EngineStep, RequirementType } from './application-engine.ts'

export const APPLICATION_RUNTIME_POLICY_VERSION = 'canonical-application-runtime@1' as const

/** Case creation is reversible preparation, but it must still follow an
 * execution request. A research/checklist task must not silently become an
 * application campaign merely because it mentions admissions. */
export function applicationTaskAuthorizesCaseCreation(title: string, description = '') {
  const value = `${title} ${description}`.replace(/\s+/g, ' ').trim()
  if (/\b(?:do not|don't|never|without)\b[^.]{0,80}\b(?:apply|start|begin|prepare|complete|fill(?: out)?|continue|finish)\b/i.test(value)) return false
  return /\bapply(?:ing)?\s+(?:me\s+)?to\b/i.test(value) ||
    /\b(?:start|begin|prepare|complete|fill(?: out)?|work on|continue|finish)\b[^.]{0,100}\b(?:application|admission form|portal)\b/i.test(value) ||
    /\b(?:application|admission form|portal)\b[^.]{0,100}\b(?:start|begin|prepare|complete|fill(?: out)?|work on|continue|finish)\b/i.test(value)
}

/** A bounded research task needs an objective finish line. Honour an explicit
 * shortlist quantity and otherwise produce a useful three-option shortlist. */
export function applicationResearchTargetQuantity(title: string, description = '') {
  const value = `${title} ${description}`.replace(/\s+/g, ' ').trim()
  const numeric = value.match(/\b(?:top\s+)?([1-9]|1\d|20)\s+(?:verified\s+)?(?:programmes?|programs?|courses?|universities|schools|opportunities|options|applications?)\b/i)
  if (numeric) return Number(numeric[1])
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
  const word = value.match(/\b(?:top\s+)?(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:verified\s+)?(?:programmes?|programs?|courses?|universities|schools|opportunities|options|applications?)\b/i)
  return word ? words[word[1]!.toLocaleLowerCase()]! : 3
}

const controllerResearchTools = [
  'application.record_opportunity',
  'application.record_evidence',
  'agent.request_context',
  'web_search',
  'browser.start_session',
  'browser.navigate',
  'browser.observe',
  'browser.act',
] as const

const requirementTools: Readonly<Partial<Record<RequirementType, readonly string[]>>> = {
  profile_fact: ['application.record_evidence', 'agent.request_context'],
  eligibility: ['application.record_evidence', 'application.update_requirement'],
  official_requirement: ['application.record_evidence', 'application.update_requirement', 'web_search', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act'],
  deadline: ['application.record_evidence', 'application.update_requirement', 'web_search', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act'],
  // A funding requirement must be grounded in a funding-specific official
  // source. Give David the same bounded research surface as other official
  // requirements so it can be verified rather than guessed or waived.
  funding: ['application.record_evidence', 'application.update_requirement', 'web_search', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act'],
  document: ['application.generate_document', 'application.generate_cv', 'application.coordinate_work_samples', 'application.update_requirement'],
  transcript: ['application.coordinate_academic_evidence', 'application.update_requirement', 'application.record_evidence', 'application.request_roon', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'browser.submit'],
  degree_certificate: ['application.coordinate_academic_evidence', 'application.update_requirement', 'application.record_evidence', 'application.request_roon', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'browser.submit'],
  proof_of_graduation: ['application.coordinate_academic_evidence', 'application.update_requirement', 'application.record_evidence', 'application.request_roon', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'browser.submit'],
  credential_evaluation: ['application.coordinate_academic_evidence', 'application.request_roon', 'application.update_requirement', 'application.record_evidence', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'browser.submit'],
  english_language_test: ['application.coordinate_academic_evidence', 'application.request_roon', 'application.update_requirement', 'application.record_evidence', 'calendar.list_events', 'calendar.get_availability'],
  admissions_test: ['application.coordinate_academic_evidence', 'application.request_roon', 'application.update_requirement', 'application.record_evidence', 'calendar.list_events', 'calendar.get_availability'],
  academic_evidence: ['application.coordinate_academic_evidence', 'application.request_roon', 'application.update_requirement', 'application.record_evidence'],
  research_proposal: ['application.prepare_research_proposal', 'application.create_human_assignment', 'application.review_research_proposal', 'application.interpret_research_proposal_feedback', 'application.finalize_research_proposal', 'application.record_proposal_delivery', 'application.update_requirement', 'application.request_roon', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'application.record_portal_checkpoint', 'application.record_evidence'],
  writer: ['application.create_human_assignment', 'application.request_roon', 'application.update_requirement'],
  referee: ['application.coordinate_recommendations', 'application.build_referee_support_pack', 'application.request_roon', 'application.update_requirement'],
  professor: ['application.record_contact', 'application.generate_supervisor_outreach', 'application.request_roon', 'application.update_requirement'],
  communication: ['application.request_roon', 'application.record_communication', 'application.update_requirement'],
  application_fee: ['application.coordinate_fee', 'application.record_fee_waiver_result', 'application.reconcile_fee_payment', 'application.update_requirement', 'application.record_evidence', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'application.execute_fee_payment'],
  fee_waiver: ['application.coordinate_fee', 'application.record_fee_waiver_result', 'application.request_roon', 'application.update_requirement', 'application.record_evidence', 'agent.request_context'],
  payment: ['application.coordinate_fee', 'application.execute_fee_payment', 'application.reconcile_fee_payment', 'application.record_evidence', 'application.update_requirement', 'browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act'],
  portal_field: ['browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'browser.submit', 'application.record_portal_checkpoint'],
  portal_section: ['browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'browser.submit', 'application.record_portal_checkpoint'],
  supplemental_question: ['browser.start_session', 'browser.navigate', 'browser.observe', 'browser.act', 'browser.submit', 'application.resolve_supplemental_questions', 'application.record_portal_checkpoint', 'application.create_human_assignment', 'agent.request_context'],
  artifact_upload: ['application.coordinate_work_samples', 'browser.observe', 'browser.act', 'browser.submit', 'application.record_portal_checkpoint', 'application.record_evidence'],
  approval: ['application.build_readiness_report', 'application.update_requirement'],
  submission: ['application.submit'],
  post_submission: ['application.request_roon', 'application.record_evidence', 'application.update_requirement'],
  calendar: ['application.request_roon', 'application.update_requirement'],
}

/**
 * Return the complete and exclusive tool surface for one deterministic engine
 * step. This policy applies before and after ApplicationCase creation; an empty
 * case ID must never fall back to David's broad specialist tool registry.
 */
export function toolsForCanonicalApplicationStep(input: {
  state: ApplicationControllerState
  step: EngineStep
  requirementType?: RequirementType | null
}) {
  const { state, step } = input
  if (step.kind === 'CONTROLLER') {
    if (state === 'CASE_CREATION') {
      // A verified, approved programme has reached the only legal next move:
      // create or reuse its durable case. Letting the model ask for the same
      // strategy approval here can consume a whole turn without advancing the
      // controller, especially after a resumed run.
      return new Set(['application.create_case'])
    }
    if (state === 'SHORTLIST_APPROVAL') return new Set(['agent.request_context'])
    return new Set(controllerResearchTools)
  }
  if (step.kind === 'SEMANTIC_DECISION') return new Set([`application.${step.request.function}`])
  if (step.kind === 'SUPPLEMENTAL_QUESTION') return new Set(requirementTools.supplemental_question)
  if (step.kind === 'COMPLETE') return new Set(['agent.complete'])
  if (step.kind === 'USER_HANDOFF') return new Set(['agent.request_context'])
  if (step.kind === 'WAIT') return new Set(['application.request_roon'])
  if (step.kind === 'BLOCKED') return new Set(['agent.request_context'])
  if (step.kind === 'VERIFY') return new Set(['application.update_requirement', 'application.build_readiness_report', 'application.record_evidence'])
  return new Set(requirementTools[input.requirementType ?? 'official_requirement'] ?? ['application.update_requirement'])
}

export function canonicalApplicationToolAllowed(allowedTools: ReadonlySet<string>, toolName: string) {
  return allowedTools.has(toolName)
}

/**
 * `browser.submit` is also the browser worker's mechanism for an approved
 * preparatory form effect such as Save and continue or a transcript request.
 * It must never be allowed to impersonate the dedicated `application.submit`
 * path, which re-verifies the package, checkpoint, approval and durable claim.
 */
export function canonicalApplicationBrowserSubmitIsPreparatory(target: string, expectedEffect: string) {
  const value = `${target} ${expectedEffect}`.replace(/\s+/g, ' ').trim()
  if (!value) return false
  if (/\b(?:submit|send|complete|finali[sz]e)\b[^.]{0,80}\b(?:the\s+)?(?:final\s+)?(?:application|admission)\b/i.test(value) ||
      /\b(?:application|admission)\b[^.]{0,80}\b(?:submit|send|complete|finali[sz]e)(?:ted|s|ting)?\b/i.test(value)) return false
  return /\b(?:save|save and continue|continue to (?:the )?next|next section|upload|request|order|schedule|book|register)\b/i.test(value)
}
