import { expect, it } from 'vitest'
import {
  resumeFlightSelection,
  runLiveFlightSearch,
  type FlightSearchInput,
} from './_flight-browser'

function futureDate(offsetDays: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

it.runIf(process.env.SHOTCOUNT_LIVE_FLIGHT_TEST === 'true')(
  'searches real Google Flights results and stops at the payment handoff',
  { timeout: 150_000 },
  async () => {
    const input: FlightSearchInput = {
      originCode: 'LOS',
      destinationCode: 'LON',
      // Keep the live smoke far enough ahead for Google Flights to expose a
      // stable round-trip result window; dates remain generated at runtime.
      departureDate: futureDate(49),
      returnDate: futureDate(56),
      cabin: 'economy',
      maxStops: 2,
      budgetAmount: null,
      currency: 'USD',
      preferredAirlines: [],
    }

    const search = await runLiveFlightSearch(input)
    expect(search.provider).toBe('Google Flights')
    expect(search.options.length).toBeGreaterThan(0)
    expect(search.options.length).toBeLessThanOrEqual(3)
    expect(search.options.every(option => option.searchUrl.startsWith('https://www.google.com/'))).toBe(true)
    expect(search.options.every(option => option.departureDate === input.departureDate)).toBe(true)

    const selection = await resumeFlightSelection(input, search.options, search.options[0]!.id)
    const handoff = new URL(selection.handoffUrl)
    expect(handoff.protocol).toBe('https:')
    expect(selection.handoffStage).toMatch(/^(provider_booking|google_booking_options)$/)
    if (selection.handoffStage === 'provider_booking') {
      expect(handoff.hostname).not.toBe('www.google.com')
      expect(selection.handoffProvider).not.toBe('Google Flights')
    } else {
      expect(handoff.hostname).toBe('www.google.com')
      expect(handoff.pathname).toMatch(/^\/travel\/flights\/booking/)
    }
    expect(selection.paymentBoundaryReached).toBe(true)
    expect(selection.resumable).toBe(true)
  },
)

it.runIf(process.env.SHOTCOUNT_LIVE_FLIGHT_TEST === 'true')(
  'searches and selects a live one-way itinerary without a return leg',
  { timeout: 150_000 },
  async () => {
    const input: FlightSearchInput = {
      originCode: 'LOS',
      destinationCode: 'LON',
      departureDate: futureDate(21),
      returnDate: null,
      cabin: 'economy',
      maxStops: 2,
      budgetAmount: null,
      currency: 'USD',
      preferredAirlines: [],
    }
    const search = await runLiveFlightSearch(input)
    expect(search.options.length).toBeGreaterThan(0)
    expect(search.options.every(option => option.departureDate === input.departureDate)).toBe(true)

    const selection = await resumeFlightSelection(input, search.options, search.options[0]!.id)
    expect(selection.selectedReturnOption).toBeUndefined()
    expect(selection.paymentBoundaryReached).toBe(true)
    expect(selection.resumable).toBe(true)
    expect(selection.handoffUrl.startsWith('https://')).toBe(true)
  },
)
