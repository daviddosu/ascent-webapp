import { describe, expect, it } from 'vitest'
import { completionPercent, nextRecurringDate, parseTags, reorderById } from './domain'

describe('parseTags', () => {
  it('cleans, de-duplicates, and limits tags', () => {
    expect(parseTags(' Focus, #work, focus, , Deep Work ', 3)).toEqual(['Focus', 'work', 'Deep Work'])
  })
})

describe('nextRecurringDate', () => {
  it('moves a daily task by one day', () => {
    expect(nextRecurringDate('2026-07-03', 'daily')).toBe('2026-07-04')
  })

  it('moves a weekly task across month boundaries', () => {
    expect(nextRecurringDate('2026-07-29', 'weekly')).toBe('2026-08-05')
  })

  it('does not create another date for non-recurring work', () => {
    expect(nextRecurringDate('2026-07-03', 'none')).toBeNull()
  })
})

describe('reorderById', () => {
  it('moves one item before the drop target without losing data', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(reorderById(items, 'c', 'a').map(item => item.id)).toEqual(['c', 'a', 'b'])
    expect(items.map(item => item.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('completionPercent', () => {
  it('returns a rounded percentage and handles an empty list', () => {
    expect(completionPercent([{ done: true }, { done: false }, { done: true }], item => item.done)).toBe(67)
    expect(completionPercent([], () => true)).toBe(0)
  })
})
