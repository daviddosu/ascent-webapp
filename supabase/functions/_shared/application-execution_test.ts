import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  claimIdempotentAction,
  confirmIdempotentAction,
  routeApplicationStep,
  verifiedCompletion,
} from './application-execution.ts'

Deno.test('adaptive routing keeps simple reads primitive-capable and stateful portals in the harness', () => {
  const simple = routeApplicationStep({
    step: { id: 'research-page', taskType: 'research', simple: true, reversible: true, consequence: 'reversible_read' },
    history: { primitiveAttempts: 100, primitiveSuccesses: 99 },
  })
  assertEquals(simple.mode, 'primitive_then_harness')
  assertEquals(simple.promotion, 'primitive_candidate')

  const portal = routeApplicationStep({
    step: { id: 'portal', taskType: 'browser', knownPortal: 'university', multiPage: true, requiresPersistence: true, requiresEvidence: true },
  })
  assertEquals(portal.mode, 'harness')
  assertEquals(portal.promotion, 'harness_preferred')
})

Deno.test('completion and retries require provider evidence and stable idempotency', () => {
  assertEquals(verifiedCompletion([
    { kind: 'provider_message', verified: true, providerId: 'message-1', threadId: 'thread-1' },
  ], { requiredKinds: ['provider_message'], expectedProviderId: 'message-1', expectedThreadId: 'thread-1' }), true)
  assertEquals(verifiedCompletion([
    { kind: 'provider_message', verified: false, providerId: 'message-1', threadId: 'thread-1' },
  ], { requiredKinds: ['provider_message'], expectedProviderId: 'message-1' }), false)

  const ledger = new Map<string, { action: string; providerId: string | null }>()
  assertEquals(claimIdempotentAction(ledger, 'submit:case-1', 'submit').status, 'claimed')
  assertEquals(confirmIdempotentAction(ledger, 'submit:case-1', 'SC-1'), true)
  assertEquals(claimIdempotentAction(ledger, 'submit:case-1', 'submit'), {
    key: 'submit:case-1',
    action: 'submit',
    status: 'duplicate',
    originalProviderId: 'SC-1',
  })
})
