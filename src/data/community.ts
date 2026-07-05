import { cloud, currentUser } from './cloud'

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
