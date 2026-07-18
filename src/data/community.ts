import { currentUser, getCloudClient } from './cloud'
import { normalizeTask, type Task } from './planner-model'

export type CommunityCreator = {
  id: string
  username: string
  displayName: string
  bio: string
  avatarUrl: string
  followerCount: number
  followedByMe: boolean
}

export type CreatorTodayProfile = {
  id: string
  username: string
  displayName: string
  bio: string
  avatarUrl: string
  timezone: string
}

export type CreatorToday = {
  profile: CreatorTodayProfile
  date: string
  viewerIsFollowing: boolean
  tasks: Task[]
}

type CreatorTodayPayload = {
  profile?: Record<string, unknown>
  date?: unknown
  viewerIsFollowing?: unknown
  tasks?: unknown
}

type CommunityCreatorRow = {
  id: string
  username: string
  display_name: string
  bio: string
  avatar_url: string
  follower_count: number | string
  followed_by_me: boolean
}

function mapCommunityCreator(row: CommunityCreatorRow): CommunityCreator {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    followerCount: Number(row.follower_count) || 0,
    followedByMe: Boolean(row.followed_by_me),
  }
}

export function normalizeCreatorSlug(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/^@/, '')
  return /^[a-z0-9_]{3,30}$/.test(normalized) ? normalized : ''
}

export function formatFollowerCount(count: number) {
  if (count < 1_000) return String(Math.max(0, count))
  if (count < 1_000_000) return `${(count / 1_000).toFixed(count < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`
  return `${(count / 1_000_000).toFixed(count < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}m`
}

export function formatFollowerLabel(count: number) {
  if (count <= 0) return ''
  return `${formatFollowerCount(count)} ${count === 1 ? 'follower' : 'followers'}`
}

export async function loadCreatorDirectory(username?: string) {
  const client = await getCloudClient()
  if (!client) throw new Error('Shotcount Community is not configured.')
  const slug = normalizeCreatorSlug(username)
  const { data, error } = await client.rpc('creator_directory', { p_username: slug || null })
  if (error) throw new Error(error.message)
  return ((data ?? []) as CommunityCreatorRow[]).map(mapCommunityCreator)
}

export async function loadPublicCreatorToday(username: string): Promise<CreatorToday | null> {
  const client = await getCloudClient()
  if (!client) throw new Error('Creator pages are not connected yet.')
  const { data, error } = await client.rpc('get_creator_today', { p_username: username })
  if (error) throw new Error(error.message)
  if (!data) return null

  const payload = data as CreatorTodayPayload
  if (!payload.profile || !Array.isArray(payload.tasks)) return null
  const profile = payload.profile
  return {
    profile: {
      id: String(profile.id ?? ''),
      username: String(profile.username ?? ''),
      displayName: String(profile.displayName ?? ''),
      bio: String(profile.bio ?? ''),
      avatarUrl: String(profile.avatarUrl ?? ''),
      timezone: String(profile.timezone ?? 'UTC'),
    },
    date: String(payload.date ?? ''),
    viewerIsFollowing: Boolean(payload.viewerIsFollowing),
    tasks: payload.tasks.map((task, index) => {
      const value = task && typeof task === 'object' ? task as Record<string, unknown> : {}
      return normalizeTask({
        id: String(value.id ?? `creator-task-${index}`),
        title: String(value.title ?? ''),
        due: typeof value.due === 'string' ? value.due : undefined,
        time: typeof value.time === 'string' ? value.time : undefined,
        completedAt: typeof value.completedAt === 'string' ? value.completedAt : undefined,
        subtaskItems: Array.isArray(value.subtasks) ? value.subtasks.map((subtask, subtaskIndex) => {
          const item = subtask && typeof subtask === 'object' ? subtask as Record<string, unknown> : {}
          return {
            id: String(item.id ?? `creator-subtask-${index}-${subtaskIndex}`),
            title: String(item.title ?? ''),
            completed: Boolean(item.completed),
          }
        }) : [],
      })
    }),
  }
}

export async function setCreatorFollowing(creatorId: string, following: boolean) {
  const { client, user } = await clientAndUser()
  const query = following
    ? client.from('follows').upsert({ follower_id: user.id, followed_id: creatorId }, { onConflict: 'follower_id,followed_id', ignoreDuplicates: true })
    : client.from('follows').delete().eq('follower_id', user.id).eq('followed_id', creatorId)
  const { error } = await query
  if (error) throw new Error(error.message)
}

async function clientAndUser() {
  const user = await currentUser()
  const client = await getCloudClient()
  if (!client || !user) throw new Error('Sign in before using cloud invitations.')
  return { client, user }
}

export async function createCloudInvite(email: string, token: string) {
  const { client, user } = await clientAndUser()
  const { error } = await client.from('accountability_invites').insert({
    inviter_id: user.id,
    invitee_email: email.trim().toLowerCase(),
    token,
  })
  if (error) throw new Error(error.message)
}

export async function acceptCloudInvite(token: string) {
  const { client } = await clientAndUser()
  const { data, error } = await client.rpc('accept_accountability_invite', { invite_token: token })
  if (error) throw new Error(error.message)
  return Boolean(data)
}
