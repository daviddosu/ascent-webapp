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

  it('skips weekends for weekday repeats', () => {
    expect(nextRecurringDate('2026-07-03', 'weekdays')).toBe('2026-07-06')
    expect(nextRecurringDate('2026-07-04', 'weekdays')).toBe('2026-07-06')
  })

  it('moves a weekly task across month boundaries', () => {
    expect(nextRecurringDate('2026-07-29', 'weekly')).toBe('2026-08-05')
  })

  it('moves a monthly task to the next month without overshooting', () => {
    expect(nextRecurringDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
    expect(nextRecurringDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
    expect(nextRecurringDate('2026-03-31', 'monthly', 31)).toBe('2026-04-30')
    expect(nextRecurringDate('2026-04-30', 'monthly', 31)).toBe('2026-05-31')
  })

  it('keeps non-month-end monthly repeats on their original day when possible', () => {
    expect(nextRecurringDate('2026-01-30', 'monthly', 30)).toBe('2026-02-28')
    expect(nextRecurringDate('2026-02-28', 'monthly', 30)).toBe('2026-03-30')
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
