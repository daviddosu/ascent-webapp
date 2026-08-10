import { assertEquals } from 'jsr:@std/assert'
import { constantTimeEqual } from './crypto.ts'

Deno.test('constant-time comparison rejects empty, different-length, and different-value secrets', () => {
  assertEquals(constantTimeEqual('', ''), false)
  assertEquals(constantTimeEqual('same-secret', 'same-secret'), true)
  assertEquals(constantTimeEqual('same-secret', 'other-secret'), false)
  assertEquals(constantTimeEqual('short', 'longer'), false)
})
