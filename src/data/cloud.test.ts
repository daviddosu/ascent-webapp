import { describe, expect, it } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { hasGoogleIdentity } from './cloud'

function user(overrides: Partial<User>): User {
  return {
    id: 'existing-user',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-07-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('existing Google account detection', () => {
  it('recognizes the provider metadata used by existing Google sign-ins', () => {
    expect(hasGoogleIdentity(user({ app_metadata: { provider: 'google' } }))).toBe(true)
    expect(hasGoogleIdentity(user({ app_metadata: { providers: ['email', 'google'] } }))).toBe(true)
    expect(hasGoogleIdentity(user({ identities: [{ provider: 'google' }] as User['identities'] }))).toBe(true)
  })

  it('does not redirect email-only users into Google OAuth', () => {
    expect(hasGoogleIdentity(user({ app_metadata: { provider: 'email', providers: ['email'] } }))).toBe(false)
  })
})
