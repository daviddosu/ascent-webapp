import { describe, expect, it } from 'vitest'
import {
  buildGoogleFlightsUrl,
  parseGoogleFlightListItem,
  rankFlightOptions,
  type FlightSearchInput,
} from './_flight-browser'

const input: FlightSearchInput = {
  originCode: 'LOS',
  destinationCode: 'LON',
  departureDate: '2026-07-30',
  returnDate: '2026-08-02',
  cabin: 'economy',
  maxStops: 1,
  budgetAmount: 1_600,
  currency: 'USD',
  preferredAirlines: ['KLM'],
}

const results = [
  `10:45 PM
–
4:15 PM+1
Kenya Airways
17 hr 30 min
LOS–LHR
1 stop
3 hr NBO
693 kg CO2e
$1,118
round trip`,
  `10:10 PM
–
7:40 AM+1
KLM
9 hr 30 min
LOS–LHR
1 stop
1 hr 25 min AMS
429 kg CO2e
$1,526
round trip`,
  `11:40 PM
–
6:20 AM+1
Air Peace
6 hr 40 min
LOS–LGW
Nonstop
354 kg CO2e
$2,228
round trip`,
]

describe('flight browser worker', () => {
  it('builds a bounded Google Flights URL', () => {
    const url = new URL(buildGoogleFlightsUrl(input))
    expect(url.origin).toBe('https://www.google.com')
    expect(url.pathname).toBe('/travel/flights')
    expect(url.searchParams.get('q')).toContain('LOS to LON')
    expect(url.searchParams.get('curr')).toBe('USD')
  })

  it('parses a live-result list item without retaining raw page text', () => {
    const parsed = parseGoogleFlightListItem(
      results[0]!,
      'USD',
      buildGoogleFlightsUrl(input),
    )
    expect(parsed).toMatchObject({
      airline: 'Kenya Airways',
      route: 'LOS–LHR',
      durationMinutes: 1_050,
      stopCount: 1,
      amount: 1_118,
      provider: 'Google Flights',
    })
    expect(parsed?.id).toMatch(/^[a-f0-9]{24}$/)
  })

  it('returns approximately three distinct ranked options within policy constraints', () => {
    const ranked = rankFlightOptions(results, input)
    expect(ranked).toHaveLength(2)
    expect(ranked[0]).toMatchObject({ label: 'Best overall', airline: 'KLM' })
    expect(ranked[1]).toMatchObject({ label: 'Cheapest', airline: 'Kenya Airways' })
    expect(ranked.every(option => option.stopCount <= 1)).toBe(true)
    expect(ranked.every(option => option.amount <= 1_600)).toBe(true)
  })
})
