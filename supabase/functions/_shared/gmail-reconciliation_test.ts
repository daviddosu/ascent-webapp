import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { providerStateIsFresh, reconcileGmailIdentity } from './gmail-reconciliation.ts'

Deno.test('reconciles a stale message to the current canonical thread message', () => {
  assertEquals(reconcileGmailIdentity('old', [{ id: 'old', thread_id: 'thread-1' }], [
    { id: 'old', thread_id: 'thread-1' }, { id: 'current', thread_id: 'thread-1' },
  ]), { id: 'current', thread_id: 'thread-1' })
  assertEquals(reconcileGmailIdentity('unknown', [], [{ id: 'current', thread_id: 'thread-1' }]), null)
  assertEquals(providerStateIsFresh('42', '42'), true)
  assertEquals(providerStateIsFresh('42', '43'), false)
})
