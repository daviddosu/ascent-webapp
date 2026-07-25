import { currentUser, getCloudClient } from './cloud'

export type GoogleAgentConnection = {
  status: 'connected' | 'needs_reauth' | 'revoked' | 'error'
  accountEmail: string
  scopes: string[]
  tokenExpiresAt: string | null
  updatedAt: string
}

type GoogleAgentConnectionRow = {
  status: GoogleAgentConnection['status']
  account_email: string
  scopes: string[]
  token_expires_at: string | null
  updated_at: string
}

export async function loadGoogleAgentConnection(): Promise<GoogleAgentConnection | null> {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return null
  const { data, error } = await client.rpc('google_agent_connection_status')
  if (error) throw new Error(error.message)
  const row = (Array.isArray(data) ? data[0] : data) as GoogleAgentConnectionRow | null
  if (!row) return null
  return {
    status: row.status,
    accountEmail: row.account_email,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    tokenExpiresAt: row.token_expires_at,
    updatedAt: row.updated_at,
  }
}

export async function beginGoogleAgentConnection(returnTo = window.location.href) {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in before connecting Google.')
  const safeReturn = new URL(returnTo)
  safeReturn.searchParams.delete('google')
  safeReturn.searchParams.delete('reason')
  const { data, error } = await client.functions.invoke<{ authorizationUrl?: string; error?: string }>(
    'google-oauth-start',
    {
      method: 'POST',
      body: { returnTo: `${safeReturn.origin}${safeReturn.pathname}` },
    },
  )
  if (error || !data?.authorizationUrl) {
    throw new Error(data?.error || error?.message || 'Roon could not start the Google connection.')
  }
  const authorizationUrl = new URL(data.authorizationUrl)
  if (authorizationUrl.protocol !== 'https:' || authorizationUrl.hostname !== 'accounts.google.com') {
    throw new Error('Roon rejected an unsafe Google authorization URL.')
  }
  window.location.assign(authorizationUrl.toString())
}
