import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarEventMatches, sameInstant, verifyScheduleEmailFacts } from './semantic-verifier.mjs'

const change = {
  attendeeEmails: ['person@example.com'], timezone: 'Africa/Lagos',
  oldStart: '2026-08-05T10:00:00+01:00', oldEnd: '2026-08-05T10:30:00+01:00',
  newStart: '2026-08-05T11:30:00+01:00', newEnd: '2026-08-05T12:00:00+01:00',
}

test('compares equivalent timestamp representations as the same instant', () => {
  assert.equal(sameInstant('2026-08-05T12:30:00+02:00', change.newStart), true)
  assert.equal(calendarEventMatches({
    summary: 'Meeting', start: { dateTime: '2026-08-05T12:30:00+02:00', timeZone: 'Africa/Lagos' },
    end: { dateTime: '2026-08-05T13:00:00+02:00', timeZone: 'Africa/Lagos' }, attendees: [{ email: 'person@example.com' }],
  }, { summary: 'Meeting', start: change.newStart, end: change.newEnd, attendees: change.attendeeEmails }), true)
})

test('accepts natural subject variants when structured schedule facts are correct', () => {
  assert.equal(verifyScheduleEmailFacts({
    to: ['person@example.com'], subject: 'Updated time: Meeting',
    bodyText: 'On August 5, 2026, the meeting moved from 10:00 AM to 11:30 AM Africa/Lagos. It remains 30 minutes.',
  }, change).valid, true)
})

test('rejects incorrect attendee, time, timezone, duration, and contradictions', () => {
  const result = verifyScheduleEmailFacts({
    to: ['wrong@example.com'], subject: 'Meeting changed',
    bodyText: 'On August 5, 2026, the meeting moved from 10:00 AM to 12:30 PM UTC. It is 60 minutes.',
  }, change)
  assert.equal(result.valid, false)
  assert.deepEqual(result.issues.sort(), ['attendee_mismatch', 'contradictory_time', 'duration_mismatch', 'new_time_missing_or_incorrect', 'timezone_missing_or_incorrect'].sort())
})
