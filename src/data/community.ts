import { currentUser, getCloudClient } from './cloud'

export type CommunityCreator = {
  id: string
  username: string
  displayName: string
  bio: string
  avatarUrl: string
  followerCount: number
  followedByMe: boolean
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

export async function loadCreatorDirectory(username?: string) {
  const client = await getCloudClient()
  if (!client) throw new Error('Shotcount Community is not configured.')
  const slug = normalizeCreatorSlug(username)
  const { data, error } = await client.rpc('creator_directory', { p_username: slug || null })
  if (error) throw new Error(error.message)
  return ((data ?? []) as CommunityCreatorRow[]).map(mapCommunityCreator)
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
