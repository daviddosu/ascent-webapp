import { describe, expect, it } from 'vitest'
import {
  buildGoogleFlightsUrl,
  buildKissAndFlySearchUrl,
  BrowserExecutionError,
  chooseFlightCandidate,
  chooseKissAndFlyItinerary,
  isGoogleFlightsDomainAllowed,
  isRecoverableFlightReadError,
  isRecoverableBrowserRuntimeError,
  isFlightResultCardText,
  flightProviderNeedsUser,
  maxSharedBrowserUses,
  maximumPublicProviderSelectionAttempts,
  kissAndFlyResultsTimeoutMs,
  maximumFlightSelectionAttempts,
  normalizeFlightSearchInput,
  parseGoogleFlightListItem,
  parseKissAndFlyCardSnapshot,
  rankFlightOptions,
  flightOptionSatisfiesConstraints,
  safeProviderNavigationUrl,
  safeExternalProviderHandoffUrl,
  shouldReloadFlightResults,
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

  it('builds a one-way search without inventing a return date', () => {
    const url = new URL(buildGoogleFlightsUrl({ ...input, returnDate: null }))
    expect(url.searchParams.get('q')).toContain('one way')
    expect(url.searchParams.get('q')).not.toContain('returning')
  })

  it('builds provider search URLs for both round-trip and one-way itineraries', () => {
    const outbound = {
      route: 'LOS–LHR',
    }
    const returning = {
      route: 'LHR–LOS',
    }
    const roundTrip = new URL(buildKissAndFlySearchUrl({
      ...input,
      departureDate: '2026-08-20',
      returnDate: '2026-09-30',
      currency: 'USD',
    }, outbound, returning))
    expect(roundTrip.origin).toBe('https://kissandfly.ng')
    expect(roundTrip.pathname).toBe('/avia/search/preloader/LOS-LHR-20.08.2026/LHR-LOS-30.09.2026')
    expect(roundTrip.searchParams.get('class')).toBe('E')
    expect(roundTrip.searchParams.get('adults')).toBe('1')

    const oneWay = new URL(buildKissAndFlySearchUrl({
      ...input,
      departureDate: '2026-08-20',
      returnDate: null,
    }, outbound))
    expect(oneWay.pathname).toBe('/avia/search/preloader/LOS-LHR-20.08.2026')
    expect(oneWay.pathname).not.toContain('undefined')
  })

  it('carries child ages, infant seat choice, and local time windows into the provider query', () => {
    const url = new URL(buildGoogleFlightsUrl({
      ...input,
      returnDate: null,
      childCount: 1,
      childAges: [6],
      infantCount: 1,
      infantSeatCount: 1,
      departureTimeWindow: '06:00-11:30',
      arrivalTimeWindow: '18:00-23:59',
    }))
    const query = url.searchParams.get('q') ?? ''
    expect(query).toContain('ages 6')
    expect(query).toContain('1 infant seat')
    expect(query).toContain('depart 06:00-11:30')
    expect(query).toContain('arrive 18:00-23:59')
  })

  it('normalizes structured constraints and rejects impossible calendar dates', () => {
    expect(normalizeFlightSearchInput({
      ...input,
      originCode: ' los ',
      destinationCode: ' lon ',
      departureDate: '2026-08-20',
      returnDate: null,
      adultCount: 2,
      childCount: 1,
      childAges: [7],
      infantCount: 1,
      excludedAirlines: [' KLM ', 'KLM'],
      allowNearbyAirports: true,
    })).toMatchObject({
      originCode: 'LOS',
      destinationCode: 'LON',
      adultCount: 2,
      childCount: 1,
      infantCount: 1,
      infantSeatCount: 0,
      excludedAirlines: ['KLM'],
      allowNearbyAirports: true,
    })
    expect(() => normalizeFlightSearchInput({ ...input, departureDate: '2026-02-30' })).toThrow('valid YYYY-MM-DD')
    expect(() => normalizeFlightSearchInput({ ...input, returnDate: input.departureDate })).toThrow('return date')
    expect(() => normalizeFlightSearchInput({ ...input, childCount: 1, childAges: [] })).toThrow('Passenger counts')
    expect(() => normalizeFlightSearchInput({ ...input, infantCount: 1, infantSeatCount: 2 })).toThrow('Passenger counts')
    expect(() => normalizeFlightSearchInput({ ...input, departureTimeWindow: '25:00-26:00' })).toThrow('Time windows')
  })

  it('accepts either normalized Google host alias for the flight worker', () => {
    expect(isGoogleFlightsDomainAllowed(['https://google.com:443/'])).toBe(true)
    expect(isGoogleFlightsDomainAllowed(['www.google.com'])).toBe(true)
    expect(isGoogleFlightsDomainAllowed(['https://accounts.google.com'])).toBe(false)
  })

  it('recycles Chromium only for transient runtime failures', () => {
    expect(maxSharedBrowserUses).toBe(1)
    expect(isRecoverableBrowserRuntimeError(new Error('browserContext.newPage: Target page, context or browser has been closed'))).toBe(true)
    expect(isRecoverableBrowserRuntimeError(new Error('page.goto: net::ERR_INSUFFICIENT_RESOURCES'))).toBe(true)
    expect(isRecoverableBrowserRuntimeError(new Error('The flight price changed'))).toBe(false)
  })

  it('retries a timed-out flight read in a fresh browser without retrying consequential failures', () => {
    expect(isRecoverableFlightReadError(new BrowserExecutionError(
      'flight_results_timeout',
      'Google Flights took too long to return live options.',
    ))).toBe(true)
    expect(isRecoverableFlightReadError(new BrowserExecutionError(
      'flight_price_or_schedule_changed',
      'The flight changed.',
      false,
    ))).toBe(false)
    expect(isRecoverableFlightReadError(new BrowserExecutionError(
      'browser_worker_timeout',
      'The browser worker timed out.',
    ))).toBe(true)
    expect(isRecoverableFlightReadError(new Error('submit timed out'))).toBe(false)
  })

  it('keeps each worker invocation isolated to one browser lifecycle', () => {
    expect(maxSharedBrowserUses).toBe(1)
  })

  it('re-identifies a stale itinerary after result cards reorder and ids change', () => {
    const expected = rankFlightOptions(results, input)[0]!
    const changedId = { ...expected, id: 'changed-card-id' }
    const unrelated = { ...rankFlightOptions(results, input)[1]!, id: 'first-after-reorder' }
    const chosen = chooseFlightCandidate([unrelated, changedId], expected)
    expect(chosen?.candidate).toMatchObject({ id: 'changed-card-id', airline: expected.airline })
    expect(chosen!.score).toBeGreaterThanOrEqual(80)
  })

  it('keeps a semantically matching itinerary when live price changes within constraints', () => {
    const expected = rankFlightOptions(results, input)[0]!
    const repriced = { ...expected, id: 'repriced-card', amount: expected.amount + 45, price: '$1,163' }
    const chosen = chooseFlightCandidate([repriced], expected)
    expect(chosen?.candidate).toMatchObject({ id: 'repriced-card', amount: expected.amount + 45 })
    expect(flightOptionSatisfiesConstraints(repriced, input)).toBe(true)
  })

  it('does not select a reordered card that no longer matches the itinerary facts', () => {
    const expected = rankFlightOptions(results, input)[0]!
    const changed = { ...expected, id: 'changed', airline: 'Different Air', route: 'LOS–CDG' }
    expect(chooseFlightCandidate([changed], expected)).toBeNull()
  })

  it('does not auto-select an ambiguous semantic match', () => {
    const expected = rankFlightOptions(results, input)[0]!
    const candidate = {
      ...expected,
      id: 'changed-a',
      durationMinutes: expected.durationMinutes + 1,
      amount: expected.amount + 1,
    }
    const second = { ...candidate, id: 'changed-b' }
    expect(chooseFlightCandidate([candidate, second], expected)).toBeNull()
  })

  it('bounds safe selection retries', () => {
    expect(maximumFlightSelectionAttempts).toBe(3)
    expect(maximumPublicProviderSelectionAttempts).toBe(2)
    expect(kissAndFlyResultsTimeoutMs).toBe(75_000)
  })

  it('recognizes explicit Google Flights provider failure states', () => {
    expect(shouldReloadFlightResults('No results returned. Oops, something went wrong. Reload')).toBe(true)
    expect(shouldReloadFlightResults('Results unavailable. Try again')).toBe(true)
    expect(shouldReloadFlightResults('Search results 12 flights')).toBe(false)
  })

  it('requires semantic flight-card evidence before treating the page as ready', () => {
    expect(isFlightResultCardText(results[0]!)).toBe(true)
    expect(isFlightResultCardText('$1,118\nSponsored travel link')).toBe(false)
  })

  it('stops on provider verification instead of retrying a challenge forever', () => {
    expect(flightProviderNeedsUser('Please verify that you are human before continuing')).toBe(true)
    expect(flightProviderNeedsUser('Live flight results are ready')).toBe(false)
  })

  it('parses a live-result list item without retaining raw page text', () => {
    const parsed = parseGoogleFlightListItem(
      results[0]!,
      'USD',
      buildGoogleFlightsUrl(input),
      input,
    )
    expect(parsed).toMatchObject({
      airline: 'Kenya Airways',
      route: 'LOS–LHR',
      durationMinutes: 1_050,
      stopCount: 1,
      amount: 1_118,
      provider: 'Google Flights',
      departureDate: input.departureDate,
      returnDate: input.returnDate,
      arrivalDayOffset: 1,
      arrivalDate: '2026-07-31',
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

  it('returns no options rather than silently violating a hard budget', () => {
    const ranked = rankFlightOptions(results, { ...input, budgetAmount: 500 })
    expect(ranked).toEqual([])
  })

  it('enforces excluded airlines as a hard constraint', () => {
    const ranked = rankFlightOptions(results, { ...input, excludedAirlines: ['KLM', 'Kenya Airways'] })
    expect(ranked).toEqual([])
  })

  it('enforces departure and arrival time windows at ranking and selection boundaries', () => {
    const constrained = { ...input, departureTimeWindow: '22:00-23:59', arrivalTimeWindow: '07:00-08:00' }
    const ranked = rankFlightOptions(results, constrained)
    expect(ranked).toHaveLength(1)
    expect(ranked[0]).toMatchObject({ airline: 'KLM', departureTime: '10:10 PM' })
    expect(flightOptionSatisfiesConstraints(ranked[0]!, constrained)).toBe(true)
    expect(flightOptionSatisfiesConstraints({ ...ranked[0]!, departureTime: '08:00 AM' }, constrained)).toBe(false)
  })

  it('parses 24-hour times and localized decimal prices', () => {
    const parsed = parseGoogleFlightListItem(
      `08:05\n–\n16:30+1\nExample Air\n9 hr 25 min\nAAA – BBB\n1 stop\n€1.234,50`,
      'EUR',
      buildGoogleFlightsUrl({ ...input, currency: 'EUR' }),
    )
    expect(parsed).toMatchObject({
      departureTime: '08:05',
      arrivalTime: '16:30+1',
      amount: 1234.5,
      durationMinutes: 565,
      route: 'AAA–BBB',
    })
  })

  it('parses one-way provider cards into structured itinerary evidence', () => {
    const oneWayInput = { ...input, departureDate: '2026-08-20', returnDate: null, budgetAmount: 1_600 }
    const parsed = parseKissAndFlyCardSnapshot({
      index: 0,
      airline: 'Royal Air Maroc Economy Class',
      price: '$ 1,103.20',
      standardAvailable: true,
      legs: [{
        times: ['06:50', '15:50'],
        duration: '9h 00min',
        routeCodes: ['LOS', 'CMN', 'LGW'],
        dateText: '',
      }],
    }, oneWayInput, 'https://kissandfly.ng/avia/search/result?session_id=test', 'USD')
    expect(parsed).toMatchObject({
      provider: 'KissandFly',
      amount: 1103.2,
      currency: 'USD',
      legs: [{
        airline: 'Royal Air Maroc',
        route: 'LOS–LGW',
        stopCount: 1,
        departureDate: '2026-08-20',
        arrivalDate: '2026-08-20',
      }],
    })
  })

  it('matches a round-trip provider card semantically after stale-card reordering', () => {
    const roundTripInput = { ...input, departureDate: '2026-08-20', returnDate: '2026-09-30', budgetAmount: 1_600 }
    const searchUrl = 'https://kissandfly.ng/avia/search/result?session_id=test'
    const googleOutbound = {
      ...parseGoogleFlightListItem(
        `06:50\n–\n16:50\nRoyal Air Maroc\n10 hr 00 min\nLOS–LHR\n1 stop\n$1,099\nround trip`,
        'USD',
        buildGoogleFlightsUrl(roundTripInput),
        roundTripInput,
      )!,
      label: 'Best overall' as const,
    }
    const googleReturn = {
      ...parseGoogleFlightListItem(
        `18:50\n–\n5:50 AM+1\nRoyal Air Maroc\n11 hr 00 min\nLHR–LOS\n1 stop\n$1,099\nround trip`,
        'USD',
        buildGoogleFlightsUrl(roundTripInput),
        { ...roundTripInput, departureDate: roundTripInput.returnDate!, returnDate: null },
      )!,
      label: 'Also worth considering' as const,
    }
    const matching = parseKissAndFlyCardSnapshot({
      index: 3,
      airline: 'Royal Air Maroc Economy Class',
      price: '$ 1,050.00',
      standardAvailable: true,
      legs: [
        { times: ['06:50', '16:50'], duration: '10h 00min', routeCodes: ['LOS', 'CMN', 'LHR'], dateText: '' },
        { times: ['18:50', '05:50'], duration: '11h 00min', routeCodes: ['LHR', 'CMN', 'LOS'], dateText: '01 Oct 2026' },
      ],
    }, roundTripInput, searchUrl, 'USD')!
    const unrelated = { ...matching, amount: 1_200, legs: matching.legs.map(leg => ({ ...leg, route: 'LOS–LGW' })) }
    expect(chooseKissAndFlyItinerary([unrelated, matching], roundTripInput, googleOutbound, googleReturn)).toBe(matching)
    expect(chooseKissAndFlyItinerary([{ ...matching, amount: 1_601 }], roundTripInput, googleOutbound, googleReturn)).toBeNull()
    expect(chooseKissAndFlyItinerary([{ ...matching, currency: 'NGN' }], roundTripInput, googleOutbound, googleReturn)).toBeNull()
  })

  it('accepts only safe public HTTPS airline handoffs', () => {
    expect(safeExternalProviderHandoffUrl('https://www.klm.com/booking?x=1')).toBe('https://www.klm.com/booking?x=1')
    expect(safeExternalProviderHandoffUrl('http://www.klm.com/booking')).toBe('')
    expect(safeExternalProviderHandoffUrl('https://127.0.0.1/booking')).toBe('')
    expect(safeExternalProviderHandoffUrl('https://localhost/booking')).toBe('')
    expect(safeExternalProviderHandoffUrl('https://www.google.com/travel/flights/booking')).toBe('')
    expect(safeExternalProviderHandoffUrl('https://about.google/?hl=en-US')).toBe('')
    expect(safeExternalProviderHandoffUrl('https://www.googleapis.com/redirect')).toBe('')
    expect(safeExternalProviderHandoffUrl('https://user:secret@www.klm.com/booking')).toBe('')
    expect(safeExternalProviderHandoffUrl('https://www.klm.com:8443/booking')).toBe('')
  })

  it('normalizes direct and nested Google provider redirects without allowing Google as the provider', () => {
    expect(safeProviderNavigationUrl('https://www.travelwings.com/ng/en/flight-review/LOS-LHR/offer'))
      .toBe('https://www.travelwings.com/ng/en/flight-review/LOS-LHR/offer')
    expect(safeProviderNavigationUrl('https://www.google.com/url?q=https%3A%2F%2Fwww.travelwings.com%2Fng%2Fen%2Fflight-review%2Foffer'))
      .toBe('https://www.travelwings.com/ng/en/flight-review/offer')
    expect(safeProviderNavigationUrl('https://www.google.com/url?url=https%3A%2F%2Fwww.google.com%2Ftravel%2Fflights%2Fbooking'))
      .toBe('')
    expect(safeProviderNavigationUrl('https://www.google.com/url?q=https%3A%2F%2Fabout.google%2F'))
      .toBe('')
  })
})
