import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import {
  attachmentMetadataFromBase64,
  attachmentsEqual,
  emailPayloadMatches,
  matchingEmailHeaderEntries,
  normalizedEmailHeader,
  persistedEmailArguments,
  retryAttemptAllowed,
  unsentPreparedDraftIds,
} from './email-integrity.ts'

Deno.test('parses every address in a mixed Gmail header', () => {
  assertEquals(normalizedEmailHeader('Alice Example <alice@example.com>, "Bob, Jr" <bob@example.com>'), [
    'alice@example.com',
    'bob@example.com',
  ])
  assertEquals(matchingEmailHeaderEntries('Alice Example <alice@example.com>, Bob <bob@example.com>', 'Bob').map(item => item.email), ['bob@example.com'])
  assertEquals(matchingEmailHeaderEntries('Joanne <joanne@example.com>', 'Ann'), [])
})

Deno.test('recipient matching folds accents and requires exact tokens', () => {
  assertEquals(matchingEmailHeaderEntries('José Álvarez <jose@example.com>', 'Jose Alvarez').map(item => item.email), ['jose@example.com'])
  assertEquals(matchingEmailHeaderEntries('Ann Smith <ann@example.com>, Ann Jones <ann.jones@example.com>', 'Ann').length, 2)
})

Deno.test('attachment metadata hashes the bytes and detects changes', async () => {
  const hello = await attachmentMetadataFromBase64('notes.txt', 'text/plain', 'aGVsbG8=')
  const helloAgain = await attachmentMetadataFromBase64('notes.txt', 'text/plain', 'aGVsbG8=')
  const goodbye = await attachmentMetadataFromBase64('notes.txt', 'text/plain', 'Z29vZGJ5ZQ==')
  assert(Boolean(hello))
  assertEquals(hello?.size, 5)
  assertEquals(hello?.sha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  assert(attachmentsEqual(hello ? [hello] : [], helloAgain ? [helloAgain] : []))
  assertFalse(attachmentsEqual(hello ? [hello] : [], goodbye ? [goodbye] : []))
})

Deno.test('canonical email matching tolerates line endings but not content drift', () => {
  const expected = {
    to: ['alice@example.com'], cc: [], bcc: [], subject: 'Hello', body_text: 'Line 1\nLine 2', attachments: [],
  }
  assert(emailPayloadMatches(expected, { ...expected, body_text: 'Line 1\r\nLine 2' }))
  assertFalse(emailPayloadMatches(expected, { ...expected, body_text: 'Line 1\nLine 3' }))
})

Deno.test('provider recovery is bounded and every prepared draft needs send evidence', () => {
  assert(retryAttemptAllowed(0))
  assert(retryAttemptAllowed(2))
  assertFalse(retryAttemptAllowed(3))
  const actions = [
    { tool_name: 'gmail.create_draft', status: 'succeeded', output: { draft_id: 'draft-a' }, arguments: {} },
    { tool_name: 'gmail.create_draft', status: 'succeeded', output: { draft_id: 'draft-b' }, arguments: {} },
    { tool_name: 'gmail.send_message', status: 'succeeded', output: { message_id: 'sent-a' }, arguments: { draft_id: 'draft-a' } },
  ]
  assertEquals(unsentPreparedDraftIds(actions), ['draft-b'])
})

Deno.test('draft persistence removes attachment bytes and retains verifiable metadata', () => {
  const persisted = persistedEmailArguments('gmail.create_draft', {
    to: ['alice@example.com'],
    attachment_base64: 'secret-bytes',
    benchmark_attachment_base64: 'benchmark-secret',
  }, {
    attachment_name: 'brief.pdf',
    attachment_mime_type: 'application/pdf',
    attachment_size: 42,
    attachment_sha256: 'a'.repeat(64),
  })
  assertEquals(persisted, {
    to: ['alice@example.com'],
    attachment_name: 'brief.pdf',
    attachment_mime_type: 'application/pdf',
    attachment_size: 42,
    attachment_sha256: 'a'.repeat(64),
  })
})
