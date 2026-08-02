import { describe, expect, it } from 'vitest'
import { flightSearchInputFromArguments } from './browser-worker'

describe('flight browser worker argument boundary', () => {
  it('normalizes one-way passenger and airport constraints before launching Chromium', () => {
    expect(flightSearchInputFromArguments({
      origin_code: ' los ',
      destination_code: ' lon ',
      departure_date: '2026-08-20',
      return_date: null,
      cabin: 'economy',
      max_stops: 1,
      budget_amount: null,
      currency: 'USD',
      preferred_airlines: [],
      excluded_airlines: ['Example Air'],
      adults: 2,
      children: 1,
      infants: 1,
      allow_nearby_airports: true,
    })).toMatchObject({
      originCode: 'LOS',
      destinationCode: 'LON',
      returnDate: null,
      adultCount: 2,
      childCount: 1,
      infantCount: 1,
      excludedAirlines: ['Example Air'],
      allowNearbyAirports: true,
    })
  })

  it('rejects invalid dates before a provider request is made', () => {
    expect(() => flightSearchInputFromArguments({
      origin_code: 'LOS',
      destination_code: 'LON',
      departure_date: '2026-02-30',
      return_date: null,
      cabin: 'economy',
      max_stops: 1,
      budget_amount: null,
      currency: 'USD',
      preferred_airlines: [],
      excluded_airlines: [],
      adults: 1,
      children: 0,
      infants: 0,
      allow_nearby_airports: false,
    })).toThrow('valid YYYY-MM-DD')
  })
})
