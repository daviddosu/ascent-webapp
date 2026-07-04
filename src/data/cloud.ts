import type { SupabaseClient, User } from '@supabase/supabase-js'

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

export async function deleteCloudAccount() {
  const client = await ensureCloud()
  if (!client) throw new Error('Cloud accounts are not configured.')
  const { error } = await client.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw new Error(error.message)
}
