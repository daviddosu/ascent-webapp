import { assertEquals } from 'jsr:@std/assert@1'
import { calendarEventBlocksTime } from './google.ts'

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
