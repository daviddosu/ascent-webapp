import { assertEquals } from 'jsr:@std/assert@1'
import { assessEmailDraft } from './email-safety.ts'

Deno.test('flags attachment claims, placeholders, and sensitive values', () => {
  const result = assessEmailDraft('Follow up', 'Hi {{name}}, the deck is attached. Your OTP is 123456.')
  assertEquals(result.requiresAttachment, true)
  assertEquals(result.hasPlaceholder, true)
  assertEquals(result.possibleSensitiveContent, true)
  assertEquals(result.warnings.length, 4)
})
