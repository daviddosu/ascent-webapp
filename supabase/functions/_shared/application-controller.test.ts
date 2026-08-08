import { describe, expect, it } from 'vitest'
import {
  buildAuthoritativeApplicationContext,
  applicationControllerStateFromLegacy,
  canTransitionApplicationState,
  recoverInvalidApplicationAction,
  resolveApplicationFact,
  selectNextApplicationAction,
  validateApplicationAction,
  validateApplicationPlan,
  validateRequirementGraph,
  verifyApplicationCompletion,
  type ProposedApplicationAction,
  type RequirementNode,
} from './application-controller.ts'

const source = (value: string, sourceId = 'asset-1') => ({
  value,
  provenance: { kind: 'uploaded_document' as const, sourceId, confirmed: true },
  confidence: 'high' as const,
})

const requirements: RequirementNode[] = [
  { id: 'identity', caseId: 'case-1', name: 'Identity', required: true, status: 'VERIFIED', sourceId: 'official-1', dependencyIds: [], responsible: 'applicant', deadline: null, evidenceIds: ['e-identity'], blocker: null },
  { id: 'education', caseId: 'case-1', name: 'Education', required: true, status: 'UNRESOLVED', sourceId: 'official-1', dependencyIds: ['identity'], responsible: 'applicant', deadline: '2026-08-09T00:00:00.000Z', evidenceIds: [], blocker: null },
  { id: 'review', caseId: 'case-1', name: 'Review', required: true, status: 'UNRESOLVED', sourceId: 'official-1', dependencyIds: ['education'], responsible: 'david', deadline: null, evidenceIds: [], blocker: null },
]

describe('David application controller v2.1', () => {
  it('returns only VERIFIED or UNRESOLVED typed facts and blocks conflicts', () => {
    expect(resolveApplicationFact('degree', [source('BEng')])).toMatchObject({ verification: 'VERIFIED', value: 'BEng', conflict: false })
    expect(resolveApplicationFact('degree', [source('BEng'), source('BSc', 'asset-2')])).toMatchObject({ verification: 'UNRESOLVED', value: null, conflict: true })
    expect(resolveApplicationFact('major_gpa', [{ value: 'Not reported', provenance: { kind: 'generated_inference', sourceId: null, confirmed: true }, confidence: 'low' }])).toMatchObject({ verification: 'UNRESOLVED', value: null })
  })

  it('rejects malformed or cross-case requirement graphs', () => {
    const graph = [...requirements, { ...requirements[0]!, id: 'case-2-node', caseId: 'case-2', dependencyIds: ['identity'] }]
    expect(validateRequirementGraph(graph)).toContainEqual({ code: 'cross_case_dependency', requirementId: 'case-2-node', dependencyId: 'identity' })
  })

  it('uses deadline and dependency priority after rejecting unsafe targets', () => {
    const fact = resolveApplicationFact('degree', [source('BEng')])
    const actions: ProposedApplicationAction[] = [
      { id: 'research', kind: 'research', toolName: 'web.search', caseId: 'case-1' },
      { id: 'review-too-early', kind: 'readiness', toolName: 'application.build_readiness_report', caseId: 'case-1', targetRequirementId: 'review' },
      { id: 'education', kind: 'portal', toolName: 'application.record_portal_checkpoint', caseId: 'case-1', targetRequirementId: 'education', requiredFactIds: ['degree'], expectedEvidenceTypes: ['PORTAL_SAVE_CONFIRMATION'], consequential: true, idempotencyKey: 'education:save' },
      { id: 'wrong-case', kind: 'portal', toolName: 'application.record_portal_checkpoint', caseId: 'case-2' },
    ]
    const result = selectNextApplicationAction({ state: 'PORTAL_EXECUTION', currentCaseId: 'case-1', actions, facts: [fact], requirements, now: '2026-08-08T00:00:00.000Z' })
    expect(result.action?.id).toBe('education')
    expect(result.rejected).toEqual(expect.arrayContaining([
      { actionId: 'review-too-early', reasons: expect.arrayContaining(['requirement_dependency_incomplete']) },
      { actionId: 'wrong-case', reasons: expect.arrayContaining(['wrong_application_case']) },
    ]))
  })

  it('validates plan order, state, fact, case, evidence, readiness, and approval', () => {
    const unresolved = resolveApplicationFact('major_gpa', [])
    const submit: ProposedApplicationAction = {
      id: 'submit', kind: 'submission', toolName: 'application.submit', caseId: 'case-2', requiredFactIds: ['major_gpa'], intendedNextState: 'POST_SUBMISSION', consequential: true, idempotencyKey: 'submit:case-2', expectedEvidenceTypes: [],
    }
    const errors = validateApplicationAction({ state: 'PORTAL_EXECUTION', currentCaseId: 'case-1', action: submit, facts: [unresolved], requirements, readinessVerified: false, submissionApproved: false })
    expect(errors.map(error => error.code)).toEqual(expect.arrayContaining([
      'wrong_application_case', 'required_fact_unresolved', 'evidence_contract_missing', 'illegal_state_transition', 'action_outside_current_state', 'readiness_required_before_submission', 'approval_required_before_submission',
    ]))
    expect(validateApplicationPlan({ state: 'SUBMISSION', currentCaseId: 'case-1', actions: [{ ...submit, caseId: 'case-1', requiredFactIds: [], expectedEvidenceTypes: ['SUBMISSION_CONFIRMATION'], intendedNextState: 'POST_SUBMISSION' }, { ...submit, id: 'duplicate', caseId: 'case-1', requiredFactIds: [], expectedEvidenceTypes: ['SUBMISSION_CONFIRMATION'], intendedNextState: 'POST_SUBMISSION' }], facts: [], requirements, readinessVerified: true, submissionApproved: true }).valid).toBe(false)
  })

  it('preserves state for one model repair then selects harness fallback', () => {
    const action: ProposedApplicationAction = { id: 'wrong', kind: 'portal', toolName: 'application.record_portal_checkpoint', caseId: 'case-2' }
    const error = validateApplicationAction({ state: 'PORTAL_EXECUTION', currentCaseId: 'case-1', action, facts: [], requirements })[0]!
    expect(recoverInvalidApplicationAction({ state: 'PORTAL_EXECUTION', error, priorRetries: 0 })).toMatchObject({ state: 'PORTAL_EXECUTION', retryAllowed: true, fallback: 'MODEL_REPAIR' })
    expect(recoverInvalidApplicationAction({ state: 'PORTAL_EXECUTION', error, priorRetries: 1 })).toMatchObject({ state: 'PORTAL_EXECUTION', retryAllowed: false, fallback: 'HARNESS_FALLBACK' })
  })

  it('enforces legal transitions and NO_EVIDENCE => NO_COMPLETION', () => {
    expect(canTransitionApplicationState('PORTAL_EXECUTION', 'READINESS_REVIEW')).toBe(true)
    expect(canTransitionApplicationState('PORTAL_EXECUTION', 'COMPLETE')).toBe(false)
    const contract = { intendedAction: 'submit', expectedState: 'POST_SUBMISSION' as const, evidenceTypes: ['SUBMISSION_CONFIRMATION' as const, 'APPLICATION_ID' as const], caseId: 'case-1', expectedProviderId: 'submission-1' }
    expect(verifyApplicationCompletion(contract, [])).toBe(false)
    expect(verifyApplicationCompletion(contract, [{ id: 'e-1', caseId: 'case-1', type: 'SUBMISSION_CONFIRMATION', verified: true, sourceId: 'provider', providerId: 'submission-1' }])).toBe(false)
    expect(verifyApplicationCompletion(contract, [
      { id: 'e-1', caseId: 'case-1', type: 'SUBMISSION_CONFIRMATION', verified: true, sourceId: 'provider', providerId: 'submission-1' },
      { id: 'e-2', caseId: 'case-1', type: 'APPLICATION_ID', verified: true, sourceId: 'provider', providerId: 'submission-1' },
    ])).toBe(true)
  })

  it('maps durable legacy case state into the v2.1 controller', () => {
    expect(applicationControllerStateFromLegacy({ caseStage: 'portal_preparation', hasCase: true })).toBe('PORTAL_EXECUTION')
    expect(applicationControllerStateFromLegacy({ caseStatus: 'awaiting_submission_approval', readinessVerified: true })).toBe('SUBMISSION_APPROVAL')
    expect(applicationControllerStateFromLegacy({ caseStatus: 'submitted', submissionConfirmed: true })).toBe('POST_SUBMISSION')
  })

  it('builds compact authoritative context without unresolved fact values', () => {
    const context = buildAuthoritativeApplicationContext({
      objective: 'Prepare one application', campaignId: 'campaign-1', caseId: 'case-1', state: 'PORTAL_EXECUTION', nextAction: 'Complete education', requirements,
      facts: [resolveApplicationFact('degree', [source('BEng')]), resolveApplicationFact('major_gpa', [])],
      artifacts: [], writer: [], referee: [], professor: [], gmail: [], checkpoint: null, approvals: [],
    })
    expect(context.verifiedFacts.map(fact => fact.factId)).toEqual(['degree'])
    expect(context.unresolvedRequirements.map(node => node.id)).toEqual(['education', 'review'])
  })
})
