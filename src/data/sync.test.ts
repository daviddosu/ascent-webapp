import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCurrentUser, mockClient } = vi.hoisted(() => {
  const mockCurrentUser = vi.fn()
  const createQuery = (data: unknown) => {
    const query: any = {
      data,
      error: null,
      select: () => query,
      eq: () => query,
      order: () => query,
      is: () => query,
      maybeSingle: () => query,
      upsert: () => query,
      delete: () => query,
      not: () => query,
    }
    return query
  }
  const mockClient = {
    from: vi.fn((table: string) => {
      if (table === 'profiles') return createQuery({ display_name: 'Maya', timezone: 'Africa/Lagos' })
      if (table === 'lists') return createQuery([{ id: 'list-1', name: 'Personal', color: '#ff666d' }])
      return createQuery([])
    }),
  }
  return { mockCurrentUser, mockClient }
})

vi.mock('./cloud', () => ({
  cloud: mockClient,
  currentUser: mockCurrentUser,
}))

import { loadCloudWorkspace } from './sync'

describe('loadCloudWorkspace', () => {
  beforeEach(() => {
    mockCurrentUser.mockReset()
    mockCurrentUser.mockResolvedValue({ id: 'user-1' })
    mockClient.from.mockClear()
  })

  it('keeps a profile-and-lists-only workspace instead of treating it as empty', async () => {
    const workspace = await loadCloudWorkspace()

    expect(workspace).not.toBeNull()
    expect(workspace?.profile).toEqual({ displayName: 'Maya', timezone: 'Africa/Lagos' })
    expect(workspace?.lists).toEqual([{ name: 'Personal', color: '#ff666d' }])
    expect(workspace?.goals).toEqual([])
    expect(workspace?.tasks).toEqual([])
    expect(workspace?.reviews).toEqual([])
    expect(workspace?.dailyReviews).toEqual([])
  })
})
