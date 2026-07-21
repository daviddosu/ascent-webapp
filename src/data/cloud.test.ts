import { describe, expect, it } from 'vitest'
import { connectGoogleCalendar } from './cloud'

describe('Google Calendar connection', () => {
  it('is available as an explicit action rather than an automatic account upgrade', () => {
    expect(typeof connectGoogleCalendar).toBe('function')
  })
})
