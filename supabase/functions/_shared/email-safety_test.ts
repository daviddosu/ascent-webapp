import { assertEquals } from 'jsr:@std/assert@1'
import { assessEmailDraft } from './email-safety.ts'

Deno.test('flags attachment claims, placeholders, and sensitive values', () => {
  const result = assessEmailDraft('Follow up', 'Hi {{name}}, the deck is attached. Your OTP is 123456.')
  assertEquals(result.requiresAttachment, true)
  assertEquals(result.hasPlaceholder, true)
  assertEquals(result.possibleSensitiveContent, true)
  assertEquals(result.warnings.length, 4)
})

Deno.test('does not demand an attachment when the message explicitly says none is needed', () => {
  assertEquals(assessEmailDraft('Re: Update', 'No attachment is needed for this update.').requiresAttachment, false)
  assertEquals(assessEmailDraft('Re: Update', 'The requested file is attached.').requiresAttachment, true)
})
