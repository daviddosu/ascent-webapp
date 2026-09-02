import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { notificationLocalParts, validNotificationTimezone } from '../_shared/notification-time.ts'
import { constantTimeEqual } from '../_shared/crypto.ts'
import { deliverPushWithOutbox } from '../_shared/push-delivery.ts'

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
type Profile = { id: string; timezone: string | null }
type Preference = { user_id: string; web_push_enabled: boolean; timezone: string | null }
type TaskRecord = { user_id: string; record_id: string; data: Record<string, unknown> }

function batches<T>(items: T[], size = 200) {
  const result: T[][] = []
  for (let offset = 0; offset < items.length; offset += size) result.push(items.slice(offset, offset + size))
  return result
}

function addLocalDays(date: string, amount: number) {
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + amount)
  return next.toISOString().slice(0, 10)
}

function localTimeToUtc(date: string, time: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match || !timeMatch) return null
  const [year, month, day] = match.slice(1).map(Number)
  const [hour, minute] = timeMatch.slice(1).map(Number)
  const intended = Date.UTC(year!, month! - 1, day!, hour!, minute!)
  let result = intended
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = notificationLocalParts(new Date(result), timezone)
    const observed = Date.UTC(
      Number(local.date.slice(0, 4)), Number(local.date.slice(5, 7)) - 1, Number(local.date.slice(8, 10)), local.hour, local.minute,
    )
    result += intended - observed
  }
  return new Date(result)
}

function taskAppearsOnToday(task: TaskRecord, today: string, timezone: string) {
  const due = typeof task.data.due === 'string' ? task.data.due : ''
  if (!due || due > today) return false
  const completedAt = typeof task.data.completedAt === 'string' ? task.data.completedAt : ''
  if (!completedAt) return true
  const completed = new Date(completedAt)
  return !Number.isNaN(completed.getTime()) && notificationLocalParts(completed, timezone).date === today
}

function taskIsIncompleteTomorrow(task: TaskRecord, tomorrow: string) {
  return task.data.due === tomorrow && !task.data.completedAt
}

function taskReminder(task: TaskRecord, reference: Date, timezone: string) {
  const due = typeof task.data.due === 'string' ? task.data.due : ''
  const time = typeof task.data.time === 'string' ? task.data.time : ''
  if (!due || !time || task.data.completedAt) return null
  const dueAt = localTimeToUtc(due, time, timezone)
  if (!dueAt) return null
  const configuredReminder = Number(task.data.reminder)
  const reminderMinutes = Number.isFinite(configuredReminder) && configuredReminder >= 0 ? configuredReminder : 15
  const reminderAt = dueAt.getTime() - reminderMinutes * 60_000
  const elapsed = reference.getTime() - reminderAt
  if (elapsed < 0 || elapsed >= 5 * 60_000) return null
  return { due, time, reminderMinutes }
}

async function sendOnce(
  admin: SupabaseClient<any>,
  subscription: Subscription,
  deliveryKey: string,
  payload: Record<string, unknown>,
) {
  const result = await deliverPushWithOutbox({
    admin,
    identity: { deliveryKey, subscriptionId: subscription.id },
    send: () => webpush.sendNotification({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' }).then(() => undefined),
    classifyError: error => {
      const status = Number((error as { statusCode?: number }).statusCode ?? 0)
      return { retryable: status !== 404 && status !== 410, code: status ? `web_push_${status}` : 'web_push_provider_failure' }
    },
  })
  if (result.outcome === 'permanent_failure') {
    await admin.from('push_subscriptions').delete().eq('id', subscription.id)
  }
  return result.outcome === 'delivered'
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const cronSecret = Deno.env.get('REMINDER_CRON_SECRET')
  if (!constantTimeEqual(request.headers.get('x-shotcount-cron') ?? '', cronSecret ?? '')) return new Response('Unauthorized', { status: 401 })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@shotcount.app'
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) return new Response('Push is not configured', { status: 503 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const preferencesResult = await admin.from('notification_preferences')
    .select('user_id,web_push_enabled,timezone').eq('web_push_enabled', true)
  if (preferencesResult.error) {
    return new Response('Could not load scheduled reminder data', { status: 502 })
  }
  const preferences = preferencesResult.data
  const enabledUsers = new Set((preferences ?? []).filter(item => item.web_push_enabled).map(item => item.user_id))
  if (!enabledUsers.size) return Response.json({ sent: 0 })
  const userBatches = batches([...enabledUsers])
  const [subscriptionResults, profileResults, taskResults] = await Promise.all([
    Promise.all(userBatches.map(userIds => admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id', userIds))),
    Promise.all(userBatches.map(userIds => admin.from('profiles').select('id,timezone').in('id', userIds))),
    Promise.all(userBatches.map(userIds => admin.from('planner_records').select('user_id,record_id,data')
      .in('user_id', userIds).eq('record_type', 'task').is('deleted_at', null))),
  ])
  if ([...subscriptionResults, ...profileResults, ...taskResults].some(result => result.error)) {
    return new Response('Could not load scheduled reminder data', { status: 502 })
  }
  const subscriptions = subscriptionResults.flatMap(result => result.data ?? [])
  const profiles = profileResults.flatMap(result => result.data ?? [])
  const taskRecords = taskResults.flatMap(result => result.data ?? [])

  const subscriptionsByUser = new Map<string, Subscription[]>()
  for (const subscription of (subscriptions ?? []) as Subscription[]) {
    if (!enabledUsers.has(subscription.user_id)) continue
    const current = subscriptionsByUser.get(subscription.user_id) ?? []
    current.push(subscription)
    subscriptionsByUser.set(subscription.user_id, current)
  }
  const timezoneByUser = new Map((profiles ?? []).map((profile: Profile) => [profile.id, validNotificationTimezone(profile.timezone)]))
  for (const preference of (preferences ?? []) as Preference[]) {
    if (!timezoneByUser.has(preference.user_id)) timezoneByUser.set(preference.user_id, validNotificationTimezone(preference.timezone))
  }
  const tasksByUser = new Map<string, TaskRecord[]>()
  for (const task of (taskRecords ?? []) as TaskRecord[]) {
    const current = tasksByUser.get(task.user_id) ?? []
    current.push(task)
    tasksByUser.set(task.user_id, current)
  }

  webpush.setVapidDetails(subject, vapidPublic, vapidPrivate)
  const now = new Date()
  let sent = 0
  for (const [userId, userSubscriptions] of subscriptionsByUser) {
    const timezone = timezoneByUser.get(userId) ?? 'UTC'
    const local = notificationLocalParts(now, timezone)
    const tasks = tasksByUser.get(userId) ?? []
    const deliveries: Array<{ key: string; payload: Record<string, unknown> }> = []

    if (local.hour === 7 && local.minute === 30 && !tasks.some(task => taskAppearsOnToday(task, local.date, timezone))) {
      deliveries.push({
        key: `today-plan:${userId}:${local.date}`,
        payload: { title: 'Review today’s application steps', body: 'Take two minutes to choose the graduate-application work that matters today.', tag: `shotcount-plan-today-${local.date}`, url: '/app?plan=today' },
      })
    }
    if (local.hour === 18 && local.minute === 30 && !tasks.some(task => taskIsIncompleteTomorrow(task, addLocalDays(local.date, 1)))) {
      deliveries.push({
        key: `tomorrow-plan:${userId}:${local.date}`,
        payload: { title: 'Plan tomorrow’s application steps', body: 'Choose the graduate-application work you want ready tomorrow.', tag: `shotcount-plan-tomorrow-${local.date}`, url: '/app?plan=tomorrow' },
      })
    }
    for (const task of tasks) {
      const reminder = taskReminder(task, now, timezone)
      if (!reminder) continue
      const title = String(task.data.title ?? 'Application step reminder').trim() || 'Application step reminder'
      deliveries.push({
        key: `task:${userId}:${task.record_id}:${reminder.due}:${reminder.time}:${reminder.reminderMinutes}`,
        payload: {
          title,
          body: `Due at ${reminder.time} · ${reminder.reminderMinutes} minute reminder`,
          tag: `shotcount-task-${task.record_id}-${reminder.due}-${reminder.time}`,
          url: '/app?plan=today',
        },
      })
    }
    for (const delivery of deliveries) {
      for (const subscription of userSubscriptions) {
        if (await sendOnce(admin, subscription, delivery.key, delivery.payload)) sent += 1
      }
    }
  }
  return Response.json({ sent })
})
