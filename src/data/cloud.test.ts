// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithOAuth = vi.fn().mockResolvedValue({ error: null })
const signInWithOtp = vi.fn().mockResolvedValue({ error: null })
const verifyOtp = vi.fn().mockResolvedValue({ data: { session: { access_token: 'access' } }, error: null })

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithOAuth, signInWithOtp, verifyOtp } }),
}))

describe('Google sign-in', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key')
    signInWithOAuth.mockClear()
    signInWithOtp.mockClear()
    verifyOtp.mockClear()
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

  it('sends a six-digit email code for any email provider', async () => {
    const { requestEmailCode } = await import('./cloud')

    await requestEmailCode('person@example.org')

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'person@example.org',
      options: {
        shouldCreateUser: true,
        emailRedirectTo: 'http://localhost:3000',
      },
    })
  })

  it('verifies an email code as an email OTP', async () => {
    const { verifyEmailCode } = await import('./cloud')

    await verifyEmailCode('person@example.org', '123456')

    expect(verifyOtp).toHaveBeenCalledWith({ email: 'person@example.org', token: '123456', type: 'email' })
  })
})
