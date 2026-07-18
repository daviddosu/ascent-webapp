import { cloud, currentUser } from './cloud'
import { getCloudClient } from './cloud'
import { normalizeTask, type Task } from './planner-model'

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
  profile?: {
    id?: unknown
    username?: unknown
    displayName?: unknown
    bio?: unknown
    avatarUrl?: unknown
    timezone?: unknown
  }
  date?: unknown
  viewerIsFollowing?: unknown
  tasks?: unknown
}

export async function loadCreatorToday(username: string): Promise<CreatorToday | null> {
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

async function clientAndUser() {
  const user = await currentUser()
  const client = cloud
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
