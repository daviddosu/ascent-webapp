import { describe, expect, it } from 'vitest'
import { cloudEnabled } from './cloud'

describe('cloud setup', () => {
  it('exposes whether cloud accounts are configured', () => {
    expect(typeof cloudEnabled).toBe('boolean')
  })
})
