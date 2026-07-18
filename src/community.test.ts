import { describe, expect, it } from 'vitest'
import { formatFollowerCount, formatFollowerLabel, normalizeCreatorSlug } from './data/community'

describe('creator links', () => {
  it('accepts small safe usernames and removes a leading at sign', () => {
    expect(normalizeCreatorSlug('@Amara_7')).toBe('amara_7')
    expect(normalizeCreatorSlug('two')).toBe('two')
    expect(normalizeCreatorSlug('no spaces')).toBe('')
    expect(normalizeCreatorSlug('../private')).toBe('')
  })

  it('keeps follower numbers short without inventing a number', () => {
    expect(formatFollowerCount(42)).toBe('42')
    expect(formatFollowerCount(1_250)).toBe('1.3k')
    expect(formatFollowerCount(15_300)).toBe('15k')
    expect(formatFollowerCount(2_400_000)).toBe('2.4m')
  })

  it('hides an empty follower count instead of showing zero', () => {
    expect(formatFollowerLabel(0)).toBe('')
    expect(formatFollowerLabel(1)).toBe('1 follower')
    expect(formatFollowerLabel(1_250)).toBe('1.3k followers')
  })
})
