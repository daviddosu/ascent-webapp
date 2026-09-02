import { currentUser, getCloudClient } from './cloud'

/** Browser notification state for private application reminders. */
export type WebPushStatus = 'unsupported' | 'blocked' | 'available' | 'enabled'

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

async function clientAndUser() {
  const [client, user] = await Promise.all([getCloudClient(), currentUser()])
  if (!client || !user) throw new Error('Sign in to manage ShotCount alerts.')
  return { client, user }
}

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

export async function showLocalReminder(title: string, body: string, tag: string, url = '/app') {
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

export async function showWebPushTest() {
  if (!pushSupported() || Notification.permission !== 'granted') throw new Error('Enable browser alerts first.')
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification('ShotCount alerts are ready', {
    body: 'You will receive reminders for your application workspace.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'shotcount-test',
    silent: true,
  })
}
