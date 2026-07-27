export type ScheduleNotificationChange = {
  attendeeEmails: string[]
  oldStart: string
  oldEnd: string
  newStart: string
  newEnd: string
  timezone: string
}

export type ScheduleNotificationDraft = {
  to: string[]
  subject: string
  bodyText: string
}

type CanonicalScheduleValues = {
  date: string
  oldTime: string
  newTime: string
  oldEndTime: string
  newEndTime: string
  durationMinutes: number
  timezone: string
}

const normalizeEmails = (values: string[]) => values.map(value => value.trim().toLocaleLowerCase()).filter(Boolean).sort()

function zonedParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(new Date(value))
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''
  return {
    year: part('year'), month: part('month'), day: part('day'),
    hour: part('hour'), minute: part('minute'), dayPeriod: part('dayPeriod').toLocaleUpperCase(),
  }
}

function canonicalTime(value: string, timezone: string) {
  const parts = zonedParts(value, timezone)
  return `${parts.hour}:${parts.minute} ${parts.dayPeriod}`
}

function timeMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (!match) return null
  let hour = Number(match[1]) % 12
  if (match[3]!.toLocaleUpperCase() === 'PM') hour += 12
  return hour * 60 + Number(match[2] ?? 0)
}

function mentionedTimes(value: string) {
  return [...value.matchAll(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi)]
    .map(match => timeMinutes(match[0]))
    .filter((minutes): minutes is number => minutes !== null)
}

export function canonicalScheduleValues(change: ScheduleNotificationChange): CanonicalScheduleValues {
  const date = zonedParts(change.newStart, change.timezone)
  return {
    date: `${date.month} ${date.day}, ${date.year}`,
    oldTime: canonicalTime(change.oldStart, change.timezone),
    newTime: canonicalTime(change.newStart, change.timezone),
    oldEndTime: canonicalTime(change.oldEnd, change.timezone),
    newEndTime: canonicalTime(change.newEnd, change.timezone),
    durationMinutes: Math.round((Date.parse(change.newEnd) - Date.parse(change.newStart)) / 60_000),
    timezone: change.timezone,
  }
}

export function verifyScheduleNotificationDraft(
  draft: ScheduleNotificationDraft,
  change: ScheduleNotificationChange,
) {
  const issues: string[] = []
  const canonical = canonicalScheduleValues(change)
  const text = `${draft.subject}\n${draft.bodyText}`
  const lower = text.toLocaleLowerCase()
  const expectedRecipients = normalizeEmails(change.attendeeEmails)
  const actualRecipients = normalizeEmails(draft.to)
  if (JSON.stringify(actualRecipients) !== JSON.stringify(expectedRecipients)) issues.push('attendee_mismatch')

  const date = zonedParts(change.newStart, change.timezone)
  const dateVariants = [
    `${date.month} ${date.day}, ${date.year}`,
    `${date.month} ${date.day}`,
    `${date.year}-${String(new Date(change.newStart).toLocaleString('en-US', { timeZone: change.timezone, month: '2-digit' })).padStart(2, '0')}-${date.day.padStart(2, '0')}`,
  ].map(value => value.toLocaleLowerCase())
  if (!dateVariants.some(value => lower.includes(value))) issues.push('date_missing_or_incorrect')

  const oldMinutes = timeMinutes(canonical.oldTime)!
  const newMinutes = timeMinutes(canonical.newTime)!
  const allowedTimes = new Set([
    oldMinutes,
    timeMinutes(canonical.oldEndTime)!,
    newMinutes,
    timeMinutes(canonical.newEndTime)!,
  ])
  const times = mentionedTimes(text)
  if (!times.includes(oldMinutes)) issues.push('old_time_missing_or_incorrect')
  if (!times.includes(newMinutes)) issues.push('new_time_missing_or_incorrect')
  if (times.some(value => !allowedTimes.has(value))) issues.push('contradictory_time')

  const timezoneCity = change.timezone.split('/').at(-1)?.replaceAll('_', ' ').toLocaleLowerCase() ?? ''
  const timezonePresent = lower.includes(change.timezone.toLocaleLowerCase()) ||
    (timezoneCity.length > 2 && lower.includes(timezoneCity)) ||
    /\b(?:wat|gmt\+?1|utc\+?1)\b/i.test(text)
  if (!timezonePresent) issues.push('timezone_missing_or_incorrect')

  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/gi)) {
    const value = Number(match[1]) * (/hour|hr/i.test(match[2]!) ? 60 : 1)
    if (value !== canonical.durationMinutes) issues.push('duration_mismatch')
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)], canonical }
}
