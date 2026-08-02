import { assertEquals } from 'jsr:@std/assert@1'
import { calendarEventBlocksTime, calendarQueryTimestamp, gmailRecipientHeaderLines, hasConfirmedSentMessage, isValidIanaTimezone } from './google.ts'

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

Deno.test('Calendar timezone validation accepts IANA zones and rejects arbitrary strings', () => {
  assertEquals(isValidIanaTimezone('Africa/Lagos'), true)
  assertEquals(isValidIanaTimezone('not/a-timezone'), false)
})
