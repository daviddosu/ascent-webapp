import { assertEquals } from 'jsr:@std/assert@1'
import { verifyScheduleNotificationDraft } from './schedule-notification.ts'

const change = {
  attendeeEmails: ['attendee@example.com'],
  oldStart: '2026-08-05T10:00:00+01:00',
  oldEnd: '2026-08-05T10:30:00+01:00',
  newStart: '2026-08-05T11:30:00+01:00',
  newEnd: '2026-08-05T12:00:00+01:00',
  timezone: 'Africa/Lagos',
}

Deno.test('accepts a notification that matches the canonical Calendar change', () => {
  assertEquals(verifyScheduleNotificationDraft({
    to: ['attendee@example.com'],
    subject: 'Meeting moved on August 5, 2026',
    bodyText: 'The meeting moved from 10:00 AM to 11:30 AM Africa/Lagos. Its 30-minute duration is unchanged.',
  }, change), {
    valid: true,
    issues: [],
    canonical: {
      date: 'August 5, 2026', oldTime: '10:00 AM', newTime: '11:30 AM',
      oldEndTime: '10:30 AM', newEndTime: '12:00 PM', durationMinutes: 30,
      timezone: 'Africa/Lagos',
    },
  })
})

Deno.test('rejects incorrect schedule times before send', () => {
  const result = verifyScheduleNotificationDraft({
    to: ['attendee@example.com'],
    subject: 'Meeting moved on August 5, 2026',
    bodyText: 'The meeting moved from 11:00 AM to 12:30 PM Lagos time. Its 30-minute duration is unchanged.',
  }, change)
  assertEquals(result.valid, false)
  assertEquals(result.issues.includes('old_time_missing_or_incorrect'), true)
  assertEquals(result.issues.includes('new_time_missing_or_incorrect'), true)
  assertEquals(result.issues.includes('contradictory_time'), true)
})

Deno.test('rejects timezone, attendee, and duration mismatches', () => {
  const result = verifyScheduleNotificationDraft({
    to: ['wrong@example.com'],
    subject: 'Meeting moved on August 5, 2026',
    bodyText: 'The meeting moved from 10:00 AM to 11:30 AM Europe/Paris and now lasts 45 minutes.',
  }, change)
  assertEquals(result.valid, false)
  assertEquals(result.issues.includes('attendee_mismatch'), true)
  assertEquals(result.issues.includes('timezone_missing_or_incorrect'), true)
  assertEquals(result.issues.includes('duration_mismatch'), true)
})
