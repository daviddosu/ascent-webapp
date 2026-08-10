import { assertEquals } from 'jsr:@std/assert'
import { inNotificationQuietHours, notificationLocalParts, validNotificationTimezone } from './notification-time.ts'

Deno.test('notification time falls back safely for an invalid user timezone', () => {
  const reference = new Date('2026-08-10T12:30:00.000Z')
  assertEquals(validNotificationTimezone('not/a-timezone'), 'UTC')
  assertEquals(notificationLocalParts(reference, 'not/a-timezone'), { date: '2026-08-10', hour: 12, minute: 30 })
})

Deno.test('quiet hours handle overnight windows and malformed preferences', () => {
  const preference = { quiet_hours_enabled: true, quiet_start: '22:00', quiet_end: '07:00', timezone: 'UTC' }
  assertEquals(inNotificationQuietHours(preference, new Date('2026-08-10T23:00:00.000Z')), true)
  assertEquals(inNotificationQuietHours(preference, new Date('2026-08-10T12:00:00.000Z')), false)
  assertEquals(inNotificationQuietHours({ ...preference, quiet_start: '99:00' }, new Date()), false)
})
