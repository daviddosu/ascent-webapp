function normalizedEmails(values = []) {
  const list = Array.isArray(values) ? values : String(values).split(',')
  return list.map(value => String(value).replace(/^to:\s*/i, '').trim().toLowerCase()).filter(Boolean).sort()
}

export function sameInstant(actual, expected) {
  const actualMs = Date.parse(actual ?? '')
  const expectedMs = Date.parse(expected ?? '')
  return Number.isFinite(actualMs) && Number.isFinite(expectedMs) && actualMs === expectedMs
}

function zonedParts(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(value))
  const part = type => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

function timeMinutes(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hour = Number(match[1]) % 12
  if (match[3].toUpperCase() === 'PM') hour += 12
  return hour * 60 + Number(match[2])
}

function mentionedTimes(value) {
  return [...String(value).matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi)].map(match => {
    const minute = match[2] ?? '00'
    return timeMinutes(`${match[1]}:${minute} ${match[3]}`)
  }).filter(value => value !== null)
}

export function calendarEventMatches(event, expected, timezone = 'Africa/Lagos') {
  if (!event || event.summary !== expected.summary) return false
  const providerTimezone = event.start?.timeZone || event.end?.timeZone
  if (providerTimezone !== timezone) return false
  if (!sameInstant(event.start?.dateTime, expected.start) || !sameInstant(event.end?.dateTime, expected.end)) return false
  if (zonedParts(event.start?.dateTime, timezone) !== zonedParts(expected.start, timezone)) return false
  if (zonedParts(event.end?.dateTime, timezone) !== zonedParts(expected.end, timezone)) return false
  const expectedDuration = Date.parse(expected.end) - Date.parse(expected.start)
  const observedDuration = Date.parse(event.end?.dateTime ?? '') - Date.parse(event.start?.dateTime ?? '')
  if (!Number.isFinite(expectedDuration) || expectedDuration <= 0 || observedDuration !== expectedDuration) return false
  const expectedAttendees = normalizedEmails(expected.attendees ?? [])
  if (expectedAttendees.length) {
    const actualAttendees = normalizedEmails((event.attendees ?? []).map(item => item.email))
    if (!expectedAttendees.every(email => actualAttendees.includes(email))) return false
  }
  return true
}

export function verifyScheduleEmailFacts(message, change) {
  const issues = []
  const recipients = normalizedEmails(message.to ?? [])
  const expectedRecipients = normalizedEmails(change.attendeeEmails ?? [])
  if (JSON.stringify(recipients) !== JSON.stringify(expectedRecipients)) issues.push('attendee_mismatch')
  const text = `${message.subject ?? ''}\n${message.bodyText ?? ''}`
  const lower = text.toLowerCase()
  const oldParts = zonedParts(change.oldStart, change.timezone)
  const newParts = zonedParts(change.newStart, change.timezone)
  const oldTime = timeMinutes(`${oldParts.hour}:${oldParts.minute} ${oldParts.dayPeriod}`)
  const newTime = timeMinutes(`${newParts.hour}:${newParts.minute} ${newParts.dayPeriod}`)
  const mentioned = mentionedTimes(text)
  if (!mentioned.includes(oldTime)) issues.push('old_time_missing_or_incorrect')
  if (!mentioned.includes(newTime)) issues.push('new_time_missing_or_incorrect')
  const dateVariants = [`${newParts.month} ${newParts.day}, ${newParts.year}`, `${newParts.month} ${newParts.day}`].map(value => value.toLowerCase())
  if (!dateVariants.some(value => lower.includes(value))) issues.push('date_missing_or_incorrect')
  const timezoneCity = change.timezone.split('/').at(-1).replaceAll('_', ' ').toLowerCase()
  if (!lower.includes(change.timezone.toLowerCase()) && !lower.includes(timezoneCity) && !/\b(?:wat|utc\+?1|gmt\+?1)\b/i.test(text)) issues.push('timezone_missing_or_incorrect')
  const duration = Math.round((Date.parse(change.newEnd) - Date.parse(change.newStart)) / 60_000)
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/gi)) {
    const value = Number(match[1]) * (/hour|hr/i.test(match[2]) ? 60 : 1)
    if (value !== duration) issues.push('duration_mismatch')
  }
  const allowed = new Set([
    oldTime, newTime,
    timeMinutes((() => { const p = zonedParts(change.oldEnd, change.timezone); return `${p.hour}:${p.minute} ${p.dayPeriod}` })()),
    timeMinutes((() => { const p = zonedParts(change.newEnd, change.timezone); return `${p.hour}:${p.minute} ${p.dayPeriod}` })()),
  ])
  if (mentioned.some(value => !allowed.has(value))) issues.push('contradictory_time')
  return { valid: issues.length === 0, issues: [...new Set(issues)] }
}
