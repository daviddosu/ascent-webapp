import { describe, expect, it } from 'vitest'
import { roonCapabilityForTask } from './roon-capabilities'

describe('Roon capability index', () => {
  it('recognizes supported existing task work', () => {
    expect(roonCapabilityForTask({ title: 'Book London flight', description: 'Return from Lagos next Thursday.' })?.capability).toBe('flight_search')
    expect(roonCapabilityForTask({ title: 'Research supervisors', description: '' })?.capability).toBe('research')
  })

  it('does not offer delegation for unsupported work', () => {
    expect(roonCapabilityForTask({ title: 'Go to the gym', description: '' })).toBeNull()
  })
})
