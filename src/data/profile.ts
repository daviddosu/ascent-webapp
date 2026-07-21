import type { User } from '@supabase/supabase-js'
import { getCloudClient } from './cloud'
import type { TaskVisibility } from './planner-model'

export type CreatorProfile = {
  id: string
  username: string
  displayName: string
  bio: string
  avatarUrl: string
  timezone: string
  defaultTaskVisibility: TaskVisibility
  onboardingCompleted: boolean
}

export type CreatorProfileInput = Omit<CreatorProfile, 'id' | 'onboardingCompleted'>
export type CreatorProfileField = 'avatarUrl' | 'displayName' | 'username' | 'bio' | 'timezone' | 'defaultTaskVisibility'

export const creatorProfileFieldLabels: Record<CreatorProfileField, string> = {
  avatarUrl: 'photo',
  displayName: 'name',
  username: 'username',
  bio: 'short bio',
  timezone: 'timezone',
  defaultTaskVisibility: 'new task privacy',
}

type ProfileRow = {
  id: string
  username: string | null
  display_name: string
  bio: string | null
  avatar_url: string | null
  timezone: string
  default_task_visibility: TaskVisibility | null
  onboarding_completed: boolean | null
}

export function normalizeUsername(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)
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

export function missingCreatorProfileFields(input: CreatorProfileInput | CreatorProfile): CreatorProfileField[] {
  const missing: CreatorProfileField[] = []
  if (!input.avatarUrl.trim()) missing.push('avatarUrl')
  if (!input.displayName.trim()) missing.push('displayName')
  if (!/^[a-z0-9_]{3,30}$/.test(normalizeUsername(input.username))) missing.push('username')
  if (!input.bio.trim()) missing.push('bio')
  if (!input.timezone.trim() || !isTimezone(input.timezone.trim())) missing.push('timezone')
  if (!['private', 'followers', 'public'].includes(input.defaultTaskVisibility)) missing.push('defaultTaskVisibility')
  return missing
}

export function isCreatorProfileComplete(input: CreatorProfileInput | CreatorProfile) {
  return missingCreatorProfileFields(input).length === 0
}

export function profileSaveState(input: CreatorProfileInput) {
  const username = normalizeUsername(input.username)
  const normalized: CreatorProfileInput = {
    ...input,
    username: /^[a-z0-9_]{3,30}$/.test(username) ? username : '',
    displayName: input.displayName.trim().slice(0, 80),
    bio: input.bio.trim().slice(0, 140),
    avatarUrl: highResolutionAvatarUrl(input.avatarUrl),
    timezone: input.timezone.trim() || detectedTimezone(),
    defaultTaskVisibility: ['private', 'followers', 'public'].includes(input.defaultTaskVisibility)
      ? input.defaultTaskVisibility
      : 'private',
  }
  return { input: normalized, complete: isCreatorProfileComplete(normalized) }
}

export function profileDefaults(user?: User | null): CreatorProfileInput {
  const metadataName = String(user?.user_metadata?.display_name ?? user?.user_metadata?.full_name ?? '').trim()
  const displayName = metadataName
  return {
    username: normalizeUsername(displayName.replace(/\s+/g, '_')),
    displayName,
    bio: '',
    avatarUrl: highResolutionAvatarUrl(String(user?.user_metadata?.avatar_url ?? '')),
    timezone: detectedTimezone(),
    defaultTaskVisibility: 'private',
  }
}

function mapProfile(row: ProfileRow): CreatorProfile {
  return {
    id: row.id,
    username: row.username ?? '',
    displayName: row.display_name,
    bio: row.bio ?? '',
    avatarUrl: highResolutionAvatarUrl(row.avatar_url),
    timezone: row.timezone,
    defaultTaskVisibility: row.default_task_visibility ?? 'private',
    onboardingCompleted: Boolean(row.onboarding_completed),
  }
}

export async function loadCreatorProfile(user: User) {
  const client = await getCloudClient()
  if (!client) throw new Error('Cloud profiles are not configured.')
  const { data, error } = await client
    .from('profiles')
    .select('id,username,display_name,bio,avatar_url,timezone,default_task_visibility,onboarding_completed')
    .eq('id', user.id)
    .maybeSingle<ProfileRow>()
  if (error) throw new Error(error.message)
  return data ? mapProfile(data) : null
}

export async function saveCreatorProfile(user: User, input: CreatorProfileInput) {
  const client = await getCloudClient()
  if (!client) throw new Error('Cloud profiles are not configured.')
  const saved = profileSaveState(input)

  const { data, error } = await client
    .from('profiles')
    .upsert({
      id: user.id,
      username: saved.input.username || null,
      display_name: saved.input.displayName,
      bio: saved.input.bio,
      avatar_url: saved.input.avatarUrl,
      timezone: saved.input.timezone,
      default_task_visibility: saved.input.defaultTaskVisibility,
      onboarding_completed: saved.complete,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('id,username,display_name,bio,avatar_url,timezone,default_task_visibility,onboarding_completed')
    .single<ProfileRow>()

  if (error?.code === '23505') throw new Error('That username is already taken.')
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
