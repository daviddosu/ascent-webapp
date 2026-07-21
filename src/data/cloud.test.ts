// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithOAuth = vi.fn().mockResolvedValue({ error: null })

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithOAuth } }),
}))

describe('Google sign-in', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key')
    signInWithOAuth.mockClear()
  })

  it('requests identity only and never access to Google user data', async () => {
    const { continueWithGoogle } = await import('./cloud')

    await continueWithGoogle()

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000',
        scopes: 'openid email profile',
      },
    })
  })
})
