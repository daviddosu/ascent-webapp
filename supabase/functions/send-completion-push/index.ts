import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type Preference = {
  user_id: string
  completion_alerts: boolean
  web_push_enabled: boolean
  quiet_hours_enabled: boolean
  quiet_start: string
  quiet_end: string
  timezone: string
}

function inQuietHours(preference: Preference | undefined) {
  if (!preference?.quiet_hours_enabled) return false
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: preference.timezone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const current = Number(parts.find(part => part.type === 'hour')?.value ?? 0) * 60
    + Number(parts.find(part => part.type === 'minute')?.value ?? 0)
  const minutes = (value: string) => {
    const [hour = '0', minute = '0'] = value.slice(0, 5).split(':')
    return Number(hour) * 60 + Number(minute)
  }
  const start = minutes(preference.quiet_start)
  const end = minutes(preference.quiet_end)
  return start === end || (start < end ? current >= start && current < end : current >= start || current < end)
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@shotcount.app'
  if (!vapidPublic || !vapidPrivate) return new Response('Push is not configured', { status: 503 })

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) return new Response('Unauthorized', { status: 401 })

  const after = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: event } = await admin.from('completion_events').select('*')
    .eq('creator_id', authData.user.id).gte('completed_at', after).order('completed_at', { ascending: false }).limit(1).maybeSingle()
  if (!event) return Response.json({ sent: 0, reason: 'no-recent-completion' })

  const { data: creator } = await admin.from('profiles').select('username,display_name,avatar_url').eq('id', authData.user.id).single()
  const { data: follows } = await admin.from('follows').select('follower_id').eq('followed_id', authData.user.id)
  const followerIds = (follows ?? []).map(row => row.follower_id)
  if (!followerIds.length) return Response.json({ sent: 0 })

  const [{ data: muted }, { data: preferences }, { data: subscriptions }] = await Promise.all([
    admin.from('muted_creators').select('viewer_id').eq('creator_id', authData.user.id).in('viewer_id', followerIds),
    admin.from('notification_preferences').select('*').in('user_id', followerIds),
    admin.from('push_subscriptions').select('*').in('user_id', followerIds),
  ])
  const mutedIds = new Set((muted ?? []).map(row => row.viewer_id))
  const preferenceByUser = new Map((preferences ?? []).map(row => [row.user_id, row as Preference]))
  webpush.setVapidDetails(subject, vapidPublic, vapidPrivate)
  const payload = JSON.stringify({
    title: `${creator?.display_name ?? 'Someone you follow'} finished today`,
    body: `${event.completed_count} of ${event.total_count} shared tasks complete.`,
    icon: creator?.avatar_url || '/favicon.svg',
    badge: '/favicon.svg',
    tag: `shotcount-completion-${event.id}`,
    url: `/${creator?.username ?? ''}`,
  })

  let sent = 0
  for (const subscription of subscriptions ?? []) {
    const preference = preferenceByUser.get(subscription.user_id)
    if (mutedIds.has(subscription.user_id) || preference?.completion_alerts === false || preference?.web_push_enabled === false || inQuietHours(preference)) continue
    const { error: receiptError } = await admin.from('push_deliveries').insert({
      completion_event_id: event.id, push_subscription_id: subscription.id,
    })
    if (receiptError) continue
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 3600, urgency: 'normal' })
      sent += 1
    } catch (error) {
      const status = Number((error as { statusCode?: number }).statusCode ?? 0)
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', subscription.id)
      else await admin.from('push_deliveries').delete().eq('completion_event_id', event.id).eq('push_subscription_id', subscription.id)
    }
  }
  return Response.json({ sent })
})
