import { describe, expect, it } from 'vitest'
import {
  applicationFailureClasses,
  claimIdempotentAction,
  classifyApplicationFailure,
  confirmIdempotentAction,
  preserveConfirmedState,
  routeApplicationStep,
  verifiedCompletion,
} from '../supabase/functions/_shared/application-execution'

describe('adaptive application execution policy', () => {
  it('routes simple safe reads through a recoverable primitive attempt', () => {
    const decision = routeApplicationStep({
      step: { id: 'deadline', taskType: 'research', simple: true, reversible: true, consequence: 'reversible_read' },
    })
    expect(decision.mode).toBe('primitive_then_harness')
    expect(decision.reasons.join(' ')).toMatch(/recoverable primitive/i)
  })

  it('routes stateful portal work directly to the durable harness', () => {
    const decision = routeApplicationStep({
      step: { id: 'portal', taskType: 'browser', knownPortal: 'controlled', multiPage: true, requiresPersistence: true, requiresEvidence: true },
    })
    expect(decision.mode).toBe('harness')
    expect(decision.promotion).toBe('harness_preferred')
  })

  it('preserves confirmed primitive work when a failure triggers escalation', () => {
    expect(preserveConfirmedState({ enteredName: 'David' }, { profileName: 'David' })).toMatchObject({
      enteredName: 'David',
      confirmedState: { profileName: 'David' },
      resumeFrom: 'confirmedState',
    })
  })

  it('does not count a provider action without the required evidence', () => {
    const evidence = [{ kind: 'provider_message' as const, verified: true, providerId: 'msg-1' }]
    expect(verifiedCompletion(evidence, { requiredKinds: ['provider_message', 'provider_thread'], expectedProviderId: 'msg-1' })).toBe(false)
    expect(verifiedCompletion([...evidence, { kind: 'provider_thread', verified: true, threadId: 'thread-1' }], {
      requiredKinds: ['provider_message', 'provider_thread'], expectedProviderId: 'msg-1', expectedThreadId: 'thread-1',
    })).toBe(true)
  })

  it('keeps consequential actions idempotent and returns the original provider id', () => {
    const ledger = new Map<string, { action: string; providerId: string | null }>()
    expect(claimIdempotentAction(ledger, 'send:case-1:writer', 'gmail.send_message').status).toBe('claimed')
    expect(confirmIdempotentAction(ledger, 'send:case-1:writer', 'msg-1')).toBe(true)
    expect(claimIdempotentAction(ledger, 'send:case-1:writer', 'gmail.send_message')).toMatchObject({ status: 'duplicate', originalProviderId: 'msg-1' })
  })

  it('maps stable failure signatures to the frozen taxonomy', () => {
    expect(applicationFailureClasses).toHaveLength(30)
    expect(classifyApplicationFailure({ code: 'browser_target_missing', message: 'The target element is no longer available.' })).toBe('wrong_element')
    expect(classifyApplicationFailure({ code: 'browser_submission_status_unknown', message: 'No verifiable confirmation.' })).toBe('false_success')
    expect(classifyApplicationFailure({ code: 'session_expired', message: 'The portal session expired.' })).toBe('session_expired')
  })
})
