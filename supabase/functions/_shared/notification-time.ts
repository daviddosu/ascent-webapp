export type NotificationLocalParts = {
  date: string
  hour: number
  minute: number
}

type QuietHoursPreference = {
  quiet_hours_enabled: boolean
  quiet_start: string
  quiet_end: string
  timezone: string | null
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timezone: string) {
  const cached = formatterCache.get(timezone)
  if (cached) return cached
  const next = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  formatterCache.set(timezone, next)
  return next
}

export function validNotificationTimezone(value: string | null | undefined) {
  const timezone = value || 'UTC'
  try {
    formatter(timezone).format()
    return timezone
  } catch {
    return 'UTC'
  }
}

export function notificationLocalParts(reference: Date, timezoneValue: string | null | undefined): NotificationLocalParts {
  const parts = formatter(validNotificationTimezone(timezoneValue)).formatToParts(reference)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  }
}

function clockMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null
}

export function inNotificationQuietHours(preference: QuietHoursPreference | undefined, reference = new Date()) {
  if (!preference?.quiet_hours_enabled) return false
  const start = clockMinutes(preference.quiet_start)
  const end = clockMinutes(preference.quiet_end)
  if (start === null || end === null) return false
  const local = notificationLocalParts(reference, preference.timezone)
  const current = local.hour * 60 + local.minute
  return start === end || (start < end ? current >= start && current < end : current >= start || current < end)
}
