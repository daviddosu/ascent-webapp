import { describe, expect, it } from 'vitest'
import { highResolutionAvatarUrl, isCreatorProfileComplete, missingCreatorProfileFields, normalizeUsername, profileDefaults } from './data/profile'

describe('creator profile helpers', () => {
  it('keeps usernames short, simple, and link-safe', () => {
    expect(normalizeUsername(' David.Dosu! ')).toBe('daviddosu')
    expect(normalizeUsername('Creator_Name')).toBe('creator_name')
    expect(normalizeUsername('Sofía_Reyes')).toBe('sofia_reyes')
    expect(normalizeUsername('a'.repeat(40))).toHaveLength(30)
  })

  it('starts new tasks as private', () => {
    expect(profileDefaults().defaultTaskVisibility).toBe('private')
  })

  it('asks Google for a sharp profile photo instead of its tiny thumbnail', () => {
    expect(highResolutionAvatarUrl('https://lh3.googleusercontent.com/a/example=s96-c')).toBe(
      'https://lh3.googleusercontent.com/a/example=s1024-c',
    )
    expect(highResolutionAvatarUrl('https://lh3.googleusercontent.com/a/example=s96-c-k-no')).toBe(
      'https://lh3.googleusercontent.com/a/example=s1024-c-k-no',
    )
    expect(highResolutionAvatarUrl('https://example.com/avatar.jpg')).toBe('https://example.com/avatar.jpg')
  })

  it('names the exact details an email-only account still needs', () => {
    expect(missingCreatorProfileFields(profileDefaults())).toEqual(['avatarUrl', 'displayName', 'username', 'bio'])
  })

  it('accepts account details from a completed Google profile', () => {
    const profile = {
      ...profileDefaults({
        user_metadata: { full_name: 'Amara Okafor', avatar_url: 'https://example.com/amara.jpg' },
      } as never),
      bio: 'Building useful products.',
    }
    expect(profile.username).toBe('amara_okafor')
    expect(isCreatorProfileComplete(profile)).toBe(true)
  })
})
