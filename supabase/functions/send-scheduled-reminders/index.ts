import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type Subscription = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

type Profile = { id: string; timezone: string | null }
type Preference = { user_id: string; web_push_enabled: boolean; timezone: string | null }
type TaskRecord = { user_id: string; record_id: string; data: Record<string, unknown> }

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timezone: string) {
  const cached = dateFormatterCache.get(timezone)
  if (cached) return cached
  const next = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  dateFormatterCache.set(timezone, next)
  return next
}

function validTimezone(value: string | null | undefined) {
  const timezone = value || 'UTC'
  try {
    formatter(timezone).format()
    return timezone
  } catch {
    return 'UTC'
  }
}

function localParts(reference: Date, timezone: string) {
  const parts = formatter(timezone).formatToParts(reference)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  }
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
    const local = localParts(new Date(result), timezone)
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
  return !Number.isNaN(completed.getTime()) && localParts(completed, timezone).date === today
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
  admin: ReturnType<typeof createClient>,
  subscription: Subscription,
  deliveryKey: string,
  payload: Record<string, unknown>,
) {
  const { error: receiptError } = await admin.from('scheduled_push_deliveries').insert({
    delivery_key: deliveryKey,
    push_subscription_id: subscription.id,
  })
  if (receiptError) return false

  try {
    await webpush.sendNotification({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' })
    return true
  } catch (error) {
    const status = Number((error as { statusCode?: number }).statusCode ?? 0)
    if (status === 404 || status === 410) {
      await admin.from('push_subscriptions').delete().eq('id', subscription.id)
    } else {
      await admin.from('scheduled_push_deliveries').delete()
        .eq('delivery_key', deliveryKey).eq('push_subscription_id', subscription.id)
    }
    return false
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const cronSecret = Deno.env.get('REMINDER_CRON_SECRET')
  if (!cronSecret || request.headers.get('x-shotcount-cron') !== cronSecret) return new Response('Unauthorized', { status: 401 })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@shotcount.app'
  if (!vapidPublic || !vapidPrivate) return new Response('Push is not configured', { status: 503 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const [{ data: subscriptions }, { data: preferences }, { data: profiles }, { data: taskRecords }] = await Promise.all([
    admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth'),
    admin.from('notification_preferences').select('user_id,web_push_enabled,timezone').eq('web_push_enabled', true),
    admin.from('profiles').select('id,timezone'),
    admin.from('planner_records').select('user_id,record_id,data').eq('record_type', 'task').is('deleted_at', null),
  ])

  const enabledUsers = new Set((preferences ?? []).filter(item => item.web_push_enabled).map(item => item.user_id))
  const subscriptionsByUser = new Map<string, Subscription[]>()
  for (const subscription of (subscriptions ?? []) as Subscription[]) {
    if (!enabledUsers.has(subscription.user_id)) continue
    const current = subscriptionsByUser.get(subscription.user_id) ?? []
    current.push(subscription)
    subscriptionsByUser.set(subscription.user_id, current)
  }
  const timezoneByUser = new Map((profiles ?? []).map((profile: Profile) => [profile.id, validTimezone(profile.timezone)]))
  for (const preference of (preferences ?? []) as Preference[]) {
    if (!timezoneByUser.has(preference.user_id)) timezoneByUser.set(preference.user_id, validTimezone(preference.timezone))
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
    const local = localParts(now, timezone)
    const tasks = tasksByUser.get(userId) ?? []
    const deliveries: Array<{ key: string; payload: Record<string, unknown> }> = []

    if (local.hour === 7 && local.minute === 30 && !tasks.some(task => taskAppearsOnToday(task, local.date, timezone))) {
      deliveries.push({
        key: `today-plan:${userId}:${local.date}`,
        payload: { title: 'Make today’s list', body: 'Take two minutes to choose what matters today.', tag: `shotcount-plan-today-${local.date}`, url: '/?plan=today' },
      })
    }
    if (local.hour === 18 && local.minute === 30 && !tasks.some(task => taskIsIncompleteTomorrow(task, addLocalDays(local.date, 1)))) {
      deliveries.push({
        key: `tomorrow-plan:${userId}:${local.date}`,
        payload: { title: 'Set up tomorrow', body: 'Take two minutes to choose tomorrow’s tasks.', tag: `shotcount-plan-tomorrow-${local.date}`, url: '/?plan=tomorrow' },
      })
    }
    for (const task of tasks) {
      const reminder = taskReminder(task, now, timezone)
      if (!reminder) continue
      const title = String(task.data.title ?? 'Task reminder').trim() || 'Task reminder'
      deliveries.push({
        key: `task:${userId}:${task.record_id}:${reminder.due}:${reminder.time}:${reminder.reminderMinutes}`,
        payload: {
          title,
          body: `Due at ${reminder.time} · ${reminder.reminderMinutes} minute reminder`,
          tag: `shotcount-task-${task.record_id}-${reminder.due}-${reminder.time}`,
          url: '/?plan=today',
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
