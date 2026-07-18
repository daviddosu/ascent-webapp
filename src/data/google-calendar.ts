import type { User } from '@supabase/supabase-js'
import { currentGoogleProviderToken, getCloudClient } from './cloud'

export type GoogleCalendarEvent = {
  id: string
  googleEventId: string
  calendarId: string
  calendarName: string
  calendarColor: string
  title: string
  startAt: string | null
  endAt: string | null
  startDate: string | null
  endDate: string | null
  allDay: boolean
  location: string
  htmlLink: string
}

export type GoogleCalendarSyncStatus = 'idle' | 'syncing' | 'synced' | 'needs_permission' | 'failed'

export type GoogleCalendarSyncState = {
  status: GoogleCalendarSyncStatus
  lastSyncedAt: string | null
  message: string
}

type CalendarListItem = {
  id?: string
  summary?: string
  backgroundColor?: string
  deleted?: boolean
}

type GoogleEventItem = {
  id?: string
  summary?: string
  status?: string
  location?: string
  htmlLink?: string
  updated?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

type GoogleListResponse<T> = { items?: T[]; nextPageToken?: string }

type GoogleCalendarRow = {
  id: string
  google_event_id: string
  calendar_id: string
  calendar_name: string
  calendar_color: string
  title: string
  start_at: string | null
  end_at: string | null
  start_date: string | null
  end_date: string | null
  all_day: boolean
  location: string
  html_link: string
}

const syncPastYears = 2
const syncFutureYears = 5

function mapRow(row: GoogleCalendarRow): GoogleCalendarEvent {
  return {
    id: row.id,
    googleEventId: row.google_event_id,
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    calendarColor: row.calendar_color,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    startDate: row.start_date,
    endDate: row.end_date,
    allDay: row.all_day,
    location: row.location,
    htmlLink: row.html_link,
  }
}

function safeGoogleCalendarLink(value: string | undefined) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !(url.hostname === 'google.com' || url.hostname.endsWith('.google.com'))) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function syncWindow(now = new Date()) {
  const start = new Date(now)
  const end = new Date(now)
  start.setUTCFullYear(start.getUTCFullYear() - syncPastYears)
  end.setUTCFullYear(end.getUTCFullYear() + syncFutureYears)
  return { start, end }
}

async function googleGet<T>(path: string, token: string) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401 || response.status === 403) {
    const error = new Error('Reconnect Google Calendar to continue syncing.')
    error.name = 'GoogleCalendarPermissionError'
    throw error
  }
  if (!response.ok) throw new Error('Google Calendar could not be reached.')
  return response.json() as Promise<T>
}

async function pagedGoogleList<T>(path: string, token: string) {
  const items: T[] = []
  let pageToken = ''
  do {
    const join = path.includes('?') ? '&' : '?'
    const page = await googleGet<GoogleListResponse<T>>(`${path}${pageToken ? `${join}pageToken=${encodeURIComponent(pageToken)}` : ''}`, token)
    items.push(...(page.items ?? []))
    pageToken = page.nextPageToken ?? ''
  } while (pageToken && items.length < 10_000)
  return items
}

export async function loadGoogleCalendarEvents(user: User) {
  const client = await getCloudClient()
  if (!client) return []
  const { start, end } = syncWindow()
  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)
  const { data, error } = await client
    .from('google_calendar_events')
    .select('id,google_event_id,calendar_id,calendar_name,calendar_color,title,start_at,end_at,start_date,end_date,all_day,location,html_link')
    .eq('user_id', user.id)
    .or(`and(all_day.eq.false,start_at.gte.${start.toISOString()},start_at.lt.${end.toISOString()}),and(all_day.eq.true,start_date.gte.${startDate},start_date.lt.${endDate})`)
    .order('start_at', { ascending: true, nullsFirst: false })
    .limit(10_000)
    .returns<GoogleCalendarRow[]>()
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRow)
}

export async function loadGoogleCalendarSyncState(user: User): Promise<GoogleCalendarSyncState> {
  const client = await getCloudClient()
  if (!client) return { status: 'idle', lastSyncedAt: null, message: '' }
  const { data } = await client.from('google_calendar_sync_state')
    .select('status,last_synced_at,last_error').eq('user_id', user.id).maybeSingle()
  return {
    status: (data?.status as GoogleCalendarSyncStatus | undefined) ?? 'idle',
    lastSyncedAt: data?.last_synced_at ?? null,
    message: data?.last_error ?? '',
  }
}

async function saveSyncState(user: User, state: GoogleCalendarSyncState) {
  const client = await getCloudClient()
  if (!client) return
  await client.from('google_calendar_sync_state').upsert({
    user_id: user.id,
    status: state.status,
    last_synced_at: state.lastSyncedAt,
    last_error: state.message.slice(0, 240),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

export async function syncGoogleCalendar(user: User): Promise<GoogleCalendarSyncState> {
  const client = await getCloudClient()
  if (!client) return { status: 'failed', lastSyncedAt: null, message: 'Cloud sync is unavailable.' }
  const token = await currentGoogleProviderToken()
  if (!token) {
    const state = { status: 'needs_permission' as const, lastSyncedAt: null, message: 'Connect Google Calendar to import events.' }
    await saveSyncState(user, state)
    return state
  }

  const startedAt = new Date().toISOString()
  await saveSyncState(user, { status: 'syncing', lastSyncedAt: null, message: '' })
  try {
    const calendars = (await pagedGoogleList<CalendarListItem>('/users/me/calendarList?maxResults=250', token))
      .filter(calendar => calendar.id && !calendar.deleted)
    const { start, end } = syncWindow()
    for (const calendar of calendars) {
      const calendarId = calendar.id!
      const params = new URLSearchParams({
        singleEvents: 'true',
        showDeleted: 'true',
        maxResults: '2500',
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
      })
      const events = await pagedGoogleList<GoogleEventItem>(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, token)
      const rows = events.filter(event => event.id).map(event => ({
        user_id: user.id,
        google_event_id: event.id!,
        calendar_id: calendarId,
        calendar_name: calendar.summary?.trim() || 'Google Calendar',
        calendar_color: /^#[0-9a-f]{6}$/i.test(calendar.backgroundColor ?? '') ? calendar.backgroundColor : '#4285f4',
        title: event.summary?.trim() || '(No title)',
        start_at: event.start?.dateTime ?? null,
        end_at: event.end?.dateTime ?? null,
        start_date: event.start?.date ?? null,
        end_date: event.end?.date ?? null,
        all_day: Boolean(event.start?.date),
        location: event.location?.trim() ?? '',
        html_link: safeGoogleCalendarLink(event.htmlLink),
        status: event.status ?? 'confirmed',
        google_updated_at: event.updated ?? null,
        last_seen_at: startedAt,
        updated_at: startedAt,
      }))
      for (let index = 0; index < rows.length; index += 200) {
        const { error } = await client.from('google_calendar_events').upsert(rows.slice(index, index + 200), {
          onConflict: 'user_id,calendar_id,google_event_id',
        })
        if (error) throw new Error(error.message)
      }
      const { error: staleError } = await client.from('google_calendar_events')
        .delete().eq('user_id', user.id).eq('calendar_id', calendarId).lt('last_seen_at', startedAt)
      if (staleError) throw new Error(staleError.message)
      const cancelledIds = rows.filter(row => row.status === 'cancelled').map(row => row.google_event_id)
      if (cancelledIds.length) await client.from('google_calendar_events')
        .delete().eq('user_id', user.id).eq('calendar_id', calendarId).in('google_event_id', cancelledIds)
    }
    const completedAt = new Date().toISOString()
    const state = { status: 'synced' as const, lastSyncedAt: completedAt, message: '' }
    await saveSyncState(user, state)
    return state
  } catch (error) {
    const needsPermission = error instanceof Error && error.name === 'GoogleCalendarPermissionError'
    const state = {
      status: needsPermission ? 'needs_permission' as const : 'failed' as const,
      lastSyncedAt: null,
      message: error instanceof Error ? error.message : 'Google Calendar could not sync.',
    }
    await saveSyncState(user, state)
    return state
  }
}
