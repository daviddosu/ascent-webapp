import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createApplicationEngineState, planApplicationEngineStep } from './application-engine.ts'
import { applicationResearchTargetQuantity, applicationTaskAuthorizesCaseCreation, canonicalApplicationBrowserSubmitIsPreparatory, canonicalApplicationToolAllowed, toolsForCanonicalApplicationStep } from './application-runtime-policy.ts'

Deno.test('distinguishes application execution from research-only planning', () => {
  assert(applicationTaskAuthorizesCaseCreation('Apply to Stanford Physics PhD', 'Use my attached CV.'))
  assert(applicationTaskAuthorizesCaseCreation('Finish my application', 'Take it through final review.'))
  assertEquals(applicationTaskAuthorizesCaseCreation('Build an application checklist', 'Research documents and deadlines only.'), false)
  assertEquals(applicationTaskAuthorizesCaseCreation('Research Stanford admissions', 'Do not apply or start the portal.'), false)
  assertEquals(applicationResearchTargetQuantity('Find five verified programmes'), 5)
  assertEquals(applicationResearchTargetQuantity('Build me a graduate shortlist'), 3)
})

Deno.test('pre-case application work remains inside the canonical controller tool surface', () => {
  const engine = createApplicationEngineState({
    caseId: '',
    objective: 'Apply to the verified programme',
    status: 'ACTIVE',
    requirements: [],
    facts: [],
    observations: [],
    completedActionKeys: [],
    approvals: [],
    browser: { portal: null, section: null, sessionId: null, checkpointObservationId: null },
    communication: [],
  })
  const step = planApplicationEngineStep(engine)
  const research = toolsForCanonicalApplicationStep({ state: 'OPPORTUNITY_RESEARCH', step })
  assert(research.has('web_search'))
  assert(research.has('application.record_opportunity'))
  assertEquals(research.has('agent.complete'), false)
  assertEquals(research.has('application.submit'), false)

  const caseCreation = toolsForCanonicalApplicationStep({ state: 'CASE_CREATION', step })
  assertEquals([...caseCreation].sort(), ['agent.request_context', 'application.create_case', 'application.record_evidence'])
})

Deno.test('a bounded verified research shortlist can complete without creating a case', () => {
  const engine = createApplicationEngineState({
    caseId: '',
    objective: 'Find three verified graduate programmes; do not apply.',
    status: 'COMPLETE',
    requirements: [],
    facts: [],
    observations: [],
    completedActionKeys: [],
    approvals: [],
    browser: { portal: null, section: null, sessionId: null, checkpointObservationId: null },
    communication: [],
  })
  const step = planApplicationEngineStep(engine)
  assertEquals(step.kind, 'COMPLETE')
  assertEquals([...toolsForCanonicalApplicationStep({ state: 'COMPLETE', step })], ['agent.complete'])
})

Deno.test('canonical requirement policies expose the specialised Wednesday workflows', () => {
  const execute = {
    kind: 'EXECUTE' as const,
    caseId: 'case-1',
    requirementId: 'requirement-1',
    tier: 1 as const,
    action: 'execute_primitive',
    evidenceContract: ['artifact' as const],
    idempotencyKey: 'requirement:case-1:requirement-1',
  }
  const proposal = toolsForCanonicalApplicationStep({ state: 'DOCUMENT_PREPARATION', step: execute, requirementType: 'research_proposal' })
  const fee = toolsForCanonicalApplicationStep({ state: 'DOCUMENT_PREPARATION', step: execute, requirementType: 'application_fee' })
  const supplemental = toolsForCanonicalApplicationStep({ state: 'PORTAL_EXECUTION', step: execute, requirementType: 'supplemental_question' })
  assert(canonicalApplicationToolAllowed(proposal, 'application.prepare_research_proposal'))
  assert(canonicalApplicationToolAllowed(proposal, 'application.finalize_research_proposal'))
  assert(canonicalApplicationToolAllowed(fee, 'application.coordinate_fee'))
  assert(canonicalApplicationToolAllowed(fee, 'application.execute_fee_payment'))
  assert(canonicalApplicationToolAllowed(supplemental, 'application.resolve_supplemental_questions'))
})

Deno.test('generic browser submit cannot impersonate final application submission', () => {
  assert(canonicalApplicationBrowserSubmitIsPreparatory('Save and continue', 'Persist the education section and open the next section.'))
  assert(canonicalApplicationBrowserSubmitIsPreparatory('Request transcript', 'Send the approved transcript request to the registrar.'))
  assertEquals(canonicalApplicationBrowserSubmitIsPreparatory('Submit application', 'Send the final admission application.'), false)
  assertEquals(canonicalApplicationBrowserSubmitIsPreparatory('Continue', 'Complete the application.'), false)
})
