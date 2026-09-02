import type { User } from '@supabase/supabase-js'
import { getCloudClient } from './cloud'

export type UserProfile = {
  id: string
  displayName: string
  avatarUrl: string
  timezone: string
}

export type UserProfileInput = Omit<UserProfile, 'id'>

type ProfileRow = {
  id: string
  display_name: string
  avatar_url: string | null
  timezone: string
}

export function highResolutionAvatarUrl(value: string | null | undefined) {
  const avatarUrl = String(value ?? '').trim()
  if (!avatarUrl) return ''

  try {
    const url = new URL(avatarUrl)
    if (!url.hostname.endsWith('googleusercontent.com')) return avatarUrl

    url.pathname = url.pathname.replace(/=s\d+(-c)?(-k-no)?$/, (_match, crop = '', privacy = '') => (
      `=s1024${crop || '-c'}${privacy}`
    ))
    if (url.searchParams.has('sz')) url.searchParams.set('sz', '1024')
    return url.toString()
  } catch {
    return avatarUrl
  }
}

export function detectedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function isTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function normalizeProfileInput(input: UserProfileInput): UserProfileInput {
  const timezone = input.timezone.trim()
  return {
    displayName: input.displayName.trim().slice(0, 80),
    avatarUrl: highResolutionAvatarUrl(input.avatarUrl),
    timezone: timezone && isTimezone(timezone) ? timezone : detectedTimezone(),
  }
}

export function profileDefaults(user?: User | null): UserProfileInput {
  return {
    displayName: String(user?.user_metadata?.display_name ?? user?.user_metadata?.full_name ?? '').trim(),
    avatarUrl: highResolutionAvatarUrl(String(user?.user_metadata?.avatar_url ?? '')),
    timezone: detectedTimezone(),
  }
}

function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: highResolutionAvatarUrl(row.avatar_url),
    timezone: row.timezone,
  }
}

export async function loadProfile(user: User) {
  const client = await getCloudClient()
  if (!client) throw new Error('Cloud profiles are not configured.')
  const { data, error } = await client
    .from('profiles')
    .select('id,display_name,avatar_url,timezone')
    .eq('id', user.id)
    .maybeSingle<ProfileRow>()
  if (error) throw new Error(error.message)
  return data ? mapProfile(data) : null
}

export async function saveProfile(user: User, input: UserProfileInput) {
  const client = await getCloudClient()
  if (!client) throw new Error('Cloud profiles are not configured.')
  const normalized = normalizeProfileInput(input)
  const { data, error } = await client
    .from('profiles')
    .upsert({
      id: user.id,
      display_name: normalized.displayName,
      avatar_url: normalized.avatarUrl,
      timezone: normalized.timezone,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('id,display_name,avatar_url,timezone')
    .single<ProfileRow>()

  if (error) throw new Error(error.message)
  return mapProfile(data)
}

export async function uploadProfilePhoto(user: User, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  if (file.size > 3 * 1024 * 1024) throw new Error('Choose an image smaller than 3 MB.')
  const client = await getCloudClient()
  if (!client) throw new Error('Cloud profiles are not configured.')
  const path = `${user.id}/avatar`
  const { error } = await client.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true,
  })
  if (error) throw new Error(error.message)
  const { data } = client.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
