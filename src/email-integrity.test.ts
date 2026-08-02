import { describe, expect, it } from 'vitest'
import {
  attachmentMetadataFromBase64,
  emailPayloadMatches,
  matchingEmailHeaderEntries,
  normalizedEmailHeader,
  persistedEmailArguments,
  retryAttemptAllowed,
  unsentPreparedDraftIds,
} from '../supabase/functions/_shared/email-integrity'

describe('email integrity', () => {
  it('parses all recipient buckets without first-address drift', () => {
    expect(normalizedEmailHeader('Alice <alice@example.com>, Bob <bob@example.com>')).toEqual([
      'alice@example.com',
      'bob@example.com',
    ])
    expect(matchingEmailHeaderEntries('Alice <alice@example.com>, Bob <bob@example.com>', 'Bob')).toHaveLength(1)
    expect(matchingEmailHeaderEntries('Joanne <joanne@example.com>', 'Ann')).toEqual([])
  })

  it('uses content hashes and rejects a modified sent payload', async () => {
    const attachment = await attachmentMetadataFromBase64('notes.txt', 'text/plain', 'aGVsbG8=')
    expect(attachment?.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    const expected = {
      to: ['alice@example.com'], cc: [], bcc: [], subject: 'Hello', body_text: 'Approved', attachments: attachment ? [attachment] : [],
    }
    expect(emailPayloadMatches(expected, { ...expected, body_text: 'Changed' })).toBe(false)
    expect(emailPayloadMatches(expected, { ...expected, body_text: 'Approved' })).toBe(true)
  })

  it('bounds transport recovery and blocks completion with an unsent draft', () => {
    expect(retryAttemptAllowed(3)).toBe(false)
    expect(unsentPreparedDraftIds([
      { tool_name: 'gmail.create_draft', status: 'succeeded', output: { draft_id: 'draft-1' }, arguments: {} },
      { tool_name: 'gmail.send_message', status: 'succeeded', output: { message_id: 'sent-1' }, arguments: { draft_id: 'draft-1' } },
      { tool_name: 'gmail.create_draft', status: 'succeeded', output: { draft_id: 'draft-2' }, arguments: {} },
    ])).toEqual(['draft-2'])
  })

  it('never persists attachment bytes in a draft action', () => {
    expect(persistedEmailArguments('gmail.create_draft', {
      to: ['alice@example.com'],
      attachment_base64: 'secret-bytes',
      benchmark_attachment_base64: 'benchmark-secret',
    }, {
      attachment_name: 'brief.pdf',
      attachment_mime_type: 'application/pdf',
      attachment_size: 42,
      attachment_sha256: 'a'.repeat(64),
    })).toEqual({
      to: ['alice@example.com'],
      attachment_name: 'brief.pdf',
      attachment_mime_type: 'application/pdf',
      attachment_size: 42,
      attachment_sha256: 'a'.repeat(64),
    })
  })
})
