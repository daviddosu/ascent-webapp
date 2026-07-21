import type { Session, SupabaseClient, User } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudEnabled = Boolean(url && publicKey)
export let cloud: SupabaseClient | null = null

async function ensureCloud() {
  if (!cloudEnabled) return null
  if (cloud) return cloud
  const { createClient } = await import('@supabase/supabase-js')
  cloud = createClient(url!, publicKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return cloud
}

function workspaceAuthUrl() {
  const configured = import.meta.env.VITE_WORKSPACE_URL as string | undefined
  if (configured) return configured
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return window.location.origin
  }
  return 'https://app.shotcount.app/'
}

export async function currentUser(): Promise<User | null> {
  const client = await ensureCloud()
  if (!client) return null
  const { data, error } = await client.auth.getUser()
  if (error) return null
  return data.user
}

export async function signIn(email: string, password: string) {
  const client = await ensureCloud()
  if (!client) return { data: { user: null, session: null }, error: new Error('Cloud accounts are not configured.') }
  return client.auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string, displayName: string) {
  const client = await ensureCloud()
  if (!client) return { data: { user: null, session: null }, error: new Error('Cloud accounts are not configured.') }
  return client.auth.signUp({ email, password, options: { data: { display_name: displayName } } })
}

export async function signOut() {
  const client = await ensureCloud()
  if (!client) return
  await client.auth.signOut()
}

export async function requestEmailCode(email: string) {
  const client = await ensureCloud()
  if (!client) return { error: new Error('Shotcount accounts are not connected yet.') }
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: workspaceAuthUrl(),
    },
  })
  return { error }
}

export async function verifyEmailCode(email: string, token: string) {
  const client = await ensureCloud()
  if (!client) return { data: { session: null }, error: new Error('Shotcount accounts are not connected yet.') }
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' })
  return { data: { session: data.session }, error }
}

export async function continueWithGoogle() {
  const client = await ensureCloud()
  if (!client) return { error: new Error('Shotcount accounts are not connected yet.') }
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: workspaceAuthUrl(),
      // Sign-in only needs identity. Keeping this explicit prevents future
      // provider changes from silently requesting access to Google user data.
      scopes: 'openid email profile',
    },
  })
  return { error }
}

export function openWorkspaceWithSession(session: Session) {
  const hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in ?? 3600),
    token_type: session.token_type,
    type: 'magiclink',
  })
  window.location.replace(`${workspaceAuthUrl().replace(/#.*$/, '')}#${hash.toString()}`)
}

export async function deleteCloudAccount() {
  const client = await ensureCloud()
  if (!client) throw new Error('Cloud accounts are not configured.')
  const { error } = await client.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw new Error(error.message)
}
