import { assertEquals } from 'jsr:@std/assert@1'
import { calendarEventBlocksTime, calendarQueryTimestamp, classifyGoogleHttpFailure, gmailRecipientHeaderLines, gmailReplyCheckpointMatches, hasConfirmedSentMessage, isValidIanaTimezone, renderGmailMimeMessage } from './google.ts'

Deno.test('calendar conflict checks ignore only transparent, cancelled, or edited events', () => {
  assertEquals(calendarEventBlocksTime({
    id: 'busy-event',
    status: 'confirmed',
    transparency: 'opaque',
  }), true)
  assertEquals(calendarEventBlocksTime({
    id: 'transparent-event',
    status: 'confirmed',
    transparency: 'transparent',
  }), false)
  assertEquals(calendarEventBlocksTime({
    id: 'cancelled-event',
    status: 'cancelled',
  }), false)
  assertEquals(calendarEventBlocksTime({
    id: 'event-being-edited',
    status: 'confirmed',
  }, 'event-being-edited'), false)
})

Deno.test('calendar query timestamps resolve local wall time through the supplied timezone', () => {
  assertEquals(
    calendarQueryTimestamp('2026-07-30T15:00:00', 'Africa/Lagos'),
    '2026-07-30T14:00:00.000Z',
  )
  assertEquals(
    calendarQueryTimestamp('2026-07-30T15:00:00+01:00', 'Africa/Lagos'),
    '2026-07-30T14:00:00.000Z',
  )
})

Deno.test('confirmed Gmail provider evidence prevents duplicate draft sends', () => {
  assertEquals(hasConfirmedSentMessage({ id: 'provider-message-id' }), true)
  assertEquals(hasConfirmedSentMessage({}), false)
  assertEquals(hasConfirmedSentMessage(null), false)
})

Deno.test('Gmail draft updates preserve To, CC, and BCC header intent', () => {
  assertEquals(gmailRecipientHeaderLines(
    ['to@example.com'],
    ['copy@example.com'],
    ['hidden@example.com'],
  ), [
    'To: to@example.com',
    'Cc: copy@example.com',
    'Bcc: hidden@example.com',
  ])
})

Deno.test('canonical Gmail MIME contains plain text, HTML, and the exact PDF attachment boundary', () => {
  const raw = renderGmailMimeMessage({
    to: ['professor@example.edu'],
    subject: 'PhD supervision inquiry - single-cell models',
    bodyText: 'Dear Professor Wang,\n\nA research-backed message.',
    bodyHtml: '<p>Dear Professor Wang,</p><p>A research-backed message.</p>',
    messageId: '<canonical@example.com>',
    idempotencyKey: 'outreach-demo-1',
    attachments: [{ name: 'Amara_Okafor_CV.pdf', mimeType: 'application/pdf', base64: 'JVBERiQ=' }],
  })
  const decoded = atob(raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '='))
  assertEquals(decoded.includes('multipart/mixed'), true)
  assertEquals(decoded.includes('multipart/alternative'), true)
  assertEquals(decoded.includes('Content-Type: text/plain; charset=UTF-8'), true)
  assertEquals(decoded.includes('Content-Type: text/html; charset=UTF-8'), true)
  assertEquals(decoded.includes('filename="Amara_Okafor_CV.pdf"'), true)
  assertEquals(decoded.includes('JVBERiQ='), true)
})

Deno.test('Google transport classification retries timeouts, quota, and transient HTTP failures', () => {
  assertEquals(classifyGoogleHttpFailure(408), { code: 'google_408', message: 'Google could not complete this step (408). Roon will retry.', retryable: true })
  assertEquals(classifyGoogleHttpFailure(403, 'userRateLimitExceeded').code, 'google_rate_limited')
  assertEquals(classifyGoogleHttpFailure(403, 'userRateLimitExceeded').retryable, true)
  assertEquals(classifyGoogleHttpFailure(403, 'insufficientPermissions').retryable, false)
  assertEquals(classifyGoogleHttpFailure(400).retryable, false)
})

Deno.test('reply checkpoints require the exact sent message and thread', () => {
  assertEquals(gmailReplyCheckpointMatches({ id: 'sent-1', threadId: 'thread-1', labelIds: ['SENT'] }, 'thread-1', 'sent-1'), true)
  assertEquals(gmailReplyCheckpointMatches({ id: 'sent-1', threadId: 'thread-2', labelIds: ['SENT'] }, 'thread-1', 'sent-1'), false)
  assertEquals(gmailReplyCheckpointMatches({ id: 'sent-1', threadId: 'thread-1', labelIds: ['INBOX'] }, 'thread-1', 'sent-1'), false)
})

Deno.test('Calendar timezone validation accepts IANA zones and rejects arbitrary strings', () => {
  assertEquals(isValidIanaTimezone('Africa/Lagos'), true)
  assertEquals(isValidIanaTimezone('not/a-timezone'), false)
})
