import { assertEquals } from 'jsr:@std/assert@1'
import { calendarEventBlocksTime, calendarQueryTimestamp } from './google.ts'

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
