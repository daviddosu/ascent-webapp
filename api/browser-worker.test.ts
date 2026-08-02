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
      children_ages: [7],
      infants: 1,
      infant_seats: 0,
      allow_nearby_airports: true,
    })).toMatchObject({
      originCode: 'LOS',
      destinationCode: 'LON',
      returnDate: null,
      adultCount: 2,
      childCount: 1,
      childAges: [7],
      infantCount: 1,
      infantSeatCount: 0,
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
      children_ages: [],
      infants: 0,
      infant_seats: 0,
      allow_nearby_airports: false,
    })).toThrow('valid YYYY-MM-DD')
  })

  it('rejects passenger-detail and time-window mismatches before a provider request', () => {
    const base = {
      origin_code: 'LOS',
      destination_code: 'LON',
      departure_date: '2026-08-20',
      return_date: null,
      cabin: 'economy',
      max_stops: 1,
      budget_amount: null,
      currency: 'USD',
      preferred_airlines: [],
      excluded_airlines: [],
      adults: 1,
      children: 1,
      children_ages: [],
      infants: 0,
      infant_seats: 0,
      allow_nearby_airports: false,
      departure_time_window: '06:00-10:00',
      arrival_time_window: null,
    }
    expect(() => flightSearchInputFromArguments(base)).toThrow('Passenger counts')
    expect(() => flightSearchInputFromArguments({ ...base, children: 0, children_ages: [], departure_time_window: '25:00-26:00' })).toThrow('Time windows')
  })
})
