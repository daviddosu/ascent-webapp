import { describe, expect, it } from 'vitest'
import { calendarEventMatches } from './semantic-verifier.mjs'

const expected = {
  summary: 'Product Review',
  start: '2026-07-28T14:00:00+01:00',
  end: '2026-07-28T15:00:00+01:00',
  attendees: ['person@example.com'],
}

const equivalent = {
  summary: 'Product Review',
  start: { dateTime: '2026-07-28T15:00:00+02:00', timeZone: 'Africa/Lagos' },
  end: { dateTime: '2026-07-28T16:00:00+02:00', timeZone: 'Africa/Lagos' },
  attendees: [{ email: 'person@example.com' }],
}

describe('semantic calendar schedule verification', () => {
  it('accepts an equivalent instant represented with another offset', () => {
    expect(calendarEventMatches(equivalent, expected)).toBe(true)
  })
  it('accepts a normalized representation in the requested named timezone', () => {
    expect(calendarEventMatches({ ...equivalent, start: { ...equivalent.start, dateTime: expected.start }, end: { ...equivalent.end, dateTime: expected.end } }, expected)).toBe(true)
  })
  it.each([
    ['wrong instant', { start: '2026-07-28T15:00:00+01:00' }],
    ['wrong local time', { start: '2026-07-28T13:00:00+01:00' }],
    ['wrong date', { start: '2026-07-29T14:00:00+01:00' }],
    ['wrong duration', { end: '2026-07-28T16:00:00+01:00' }],
  ])('rejects %s', (_, change) => {
    expect(calendarEventMatches({ ...equivalent, start: { ...equivalent.start, dateTime: change.start ?? equivalent.start.dateTime }, end: { ...equivalent.end, dateTime: change.end ?? equivalent.end.dateTime } }, expected)).toBe(false)
  })
  it('rejects a wrong attendee', () => {
    expect(calendarEventMatches({ ...equivalent, attendees: [{ email: 'other@example.com' }] }, expected)).toBe(false)
  })
  it('rejects a wrong event identity', () => {
    expect(calendarEventMatches({ ...equivalent, summary: 'Other event' }, expected)).toBe(false)
  })
})
