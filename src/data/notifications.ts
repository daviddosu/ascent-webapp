import type { RealtimeChannel } from '@supabase/supabase-js'
import { currentUser, getCloudClient } from './cloud'

export type NotificationPreferences = {
  completionAlerts: boolean
  quietHoursEnabled: boolean
  quietStart: string
  quietEnd: string
  mutedCreatorIds: string[]
}

export type WebPushStatus = 'unsupported' | 'blocked' | 'available' | 'enabled'

export type CreatorCompletion = {
  id: string
  creatorId: string
  username: string
  displayName: string
  avatarUrl: string
  completedCount: number
  totalCount: number
  completedAt: string
  taskTitle: string
}

export type SharedCreatorTask = {
  id: string
  title: string
  due: string
  time: string
  completedAt: string
  visibility: 'followers' | 'public'
}

type CompletionRow = {
  id: string
  creator_id: string
  username: string
  display_name: string
  avatar_url: string
  completed_count: number | string
  total_count: number | string
  completed_at: string
  task_title: string | null
}

type SharedTaskRow = {
  id: string
  title: string
  due: string
  time: string | null
  completed_at: string | null
  visibility: 'followers' | 'public'
}

export const defaultNotificationPreferences = (): NotificationPreferences => ({
  completionAlerts: true,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '08:00',
  mutedCreatorIds: [],
})

async function clientAndUser() {
  const [client, user] = await Promise.all([getCloudClient(), currentUser()])
  if (!client || !user) throw new Error('Sign in to manage Shotcount alerts.')
  return { client, user }
}

function mapCompletion(row: CompletionRow): CreatorCompletion {
  return {
    id: row.id,
    creatorId: row.creator_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    completedCount: Number(row.completed_count) || 0,
    totalCount: Number(row.total_count) || 0,
    completedAt: row.completed_at,
    taskTitle: row.task_title ?? '',
  }
}

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  const { client, user } = await clientAndUser()
  const [preferences, muted] = await Promise.all([
    client.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    client.from('muted_creators').select('creator_id').eq('viewer_id', user.id),
  ])
  if (preferences.error) throw new Error(preferences.error.message)
  if (muted.error) throw new Error(muted.error.message)
  const defaults = defaultNotificationPreferences()
  return {
    completionAlerts: preferences.data?.completion_alerts ?? defaults.completionAlerts,
    quietHoursEnabled: preferences.data?.quiet_hours_enabled ?? defaults.quietHoursEnabled,
    quietStart: String(preferences.data?.quiet_start ?? defaults.quietStart).slice(0, 5),
    quietEnd: String(preferences.data?.quiet_end ?? defaults.quietEnd).slice(0, 5),
    mutedCreatorIds: (muted.data ?? []).map(row => String(row.creator_id)),
  }
}

export async function saveNotificationPreferences(preferences: NotificationPreferences, timezone: string) {
  const { client, user } = await clientAndUser()
  const { error } = await client.from('notification_preferences').upsert({
    user_id: user.id,
    completion_alerts: preferences.completionAlerts,
    quiet_hours_enabled: preferences.quietHoursEnabled,
    quiet_start: preferences.quietStart,
    quiet_end: preferences.quietEnd,
    timezone: timezone || 'UTC',
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function setCreatorMuted(creatorId: string, muted: boolean) {
  const { client, user } = await clientAndUser()
  const query = muted
    ? client.from('muted_creators').upsert({ viewer_id: user.id, creator_id: creatorId }, { onConflict: 'viewer_id,creator_id', ignoreDuplicates: true })
    : client.from('muted_creators').delete().eq('viewer_id', user.id).eq('creator_id', creatorId)
  const { error } = await query
  if (error) throw new Error(error.message)
}

export async function loadCompletionFeed(after: string) {
  const { client } = await clientAndUser()
  const { data, error } = await client.rpc('completion_alert_feed', { p_after: after })
  if (error) throw new Error(error.message)
  return ((data ?? []) as CompletionRow[]).map(mapCompletion)
}

export async function loadCreatorToday(creatorId: string) {
  const { client } = await clientAndUser()
  const { data, error } = await client.rpc('creator_today', { p_creator_id: creatorId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as SharedTaskRow[]).map(row => ({
    id: row.id,
    title: row.title,
    due: row.due,
    time: row.time ?? '',
    completedAt: row.completed_at ?? '',
    visibility: row.visibility,
  }))
}

export async function subscribeToCompletionAlerts(onChange: () => void) {
  const { client, user } = await clientAndUser()
  const channel: RealtimeChannel = client
    .channel(`shotcount-completions:${user.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'completion_events' }, onChange)
  await channel.subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function applicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const decoded = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(decoded, character => character.charCodeAt(0))
}

function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function webPushStatus(): Promise<WebPushStatus> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return subscription ? 'enabled' : 'available'
}

export async function enableWebPush(): Promise<WebPushStatus> {
  if (!pushSupported()) return 'unsupported'
  if (!vapidPublicKey) throw new Error('Background alerts are not configured yet.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'available'
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(vapidPublicKey),
  })
  const json = subscription.toJSON()
  const { client, user } = await clientAndUser()
  const { error } = await client.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent.slice(0, 500),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
  await client.from('notification_preferences').upsert({ user_id: user.id, web_push_enabled: true, updated_at: new Date().toISOString() })
  return 'enabled'
}

export async function showLocalReminder(title: string, body: string, tag: string, url = '/') {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const registration = await navigator.serviceWorker.getRegistration() ?? await navigator.serviceWorker.register('/sw.js')
  await registration.showNotification(title, {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag,
    data: { url },
    silent: false,
  })
  return true
}

export async function disableWebPush(): Promise<WebPushStatus> {
  if (!pushSupported()) return 'unsupported'
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  const { client, user } = await clientAndUser()
  if (subscription) {
    const { error } = await client.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', subscription.endpoint)
    if (error) throw new Error(error.message)
    await subscription.unsubscribe()
  }
  await client.from('notification_preferences').upsert({ user_id: user.id, web_push_enabled: false, updated_at: new Date().toISOString() })
  return Notification.permission === 'denied' ? 'blocked' : 'available'
}

export async function showWebPushTest() {
  if (!pushSupported() || Notification.permission !== 'granted') throw new Error('Enable browser alerts first.')
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification('Shotcount alerts are ready', {
    body: 'You will hear from the people you follow when they finish today.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'shotcount-test',
    silent: false,
  })
}

export async function dispatchCompletionPush() {
  const { client } = await clientAndUser()
  const { error } = await client.functions.invoke('send-completion-push', { method: 'POST', body: {} })
  if (error) throw new Error(error.message)
}
