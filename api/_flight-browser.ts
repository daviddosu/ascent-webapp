import chromium from '@sparticuz/chromium'
import { createHash } from 'node:crypto'
import { access } from 'node:fs/promises'
import { isIP } from 'node:net'
import { chromium as playwright, type Browser, type Locator, type Page } from 'playwright-core'

export type FlightSearchInput = {
  originCode: string
  destinationCode: string
  departureDate: string
  returnDate: string | null
  cabin: 'economy' | 'premium_economy' | 'business' | 'first'
  maxStops: 0 | 1 | 2 | 3
  budgetAmount: number | null
  currency: 'USD' | 'GBP' | 'EUR' | 'NGN'
  preferredAirlines: string[]
  excludedAirlines?: string[]
  adultCount?: number
  childCount?: number
  childAges?: number[]
  infantCount?: number
  infantSeatCount?: number
  allowNearbyAirports?: boolean
  departureTimeWindow?: string | null
  arrivalTimeWindow?: string | null
}

export type FlightOption = {
  id: string
  label: 'Best overall' | 'Cheapest' | 'Fastest' | 'Also worth considering'
  airline: string
  departureTime: string
  arrivalTime: string
  duration: string
  durationMinutes: number
  route: string
  stops: string
  stopCount: number
  price: string
  amount: number
  currency: FlightSearchInput['currency']
  provider: 'Google Flights'
  searchUrl: string
  departureDate?: string
  returnDate?: string | null
  arrivalDate?: string
  arrivalDayOffset?: number
}

export type FlightSearchResult = {
  provider: 'Google Flights'
  searchUrl: string
  observedAt: string
  options: FlightOption[]
}

export type FlightSelectionResult = {
  provider: 'Google Flights'
  selectedOption: FlightOption
  selectedReturnOption?: FlightOption
  handoffUrl: string
  handoffProvider: string
  handoffStage: 'provider_booking' | 'google_booking_options'
  observedAt: string
  paymentBoundaryReached: true
  resumable: true
  selectionTrace: FlightSelectionTraceEvent[]
  providerEvidence?: PublicProviderItineraryEvidence
}

export type FlightSelectionTraceEvent = {
  stage: string
  at: string
  details: Record<string, unknown>
}

export type PublicProviderLegEvidence = {
  airline: string
  departureTime: string
  arrivalTime: string
  duration: string
  durationMinutes: number
  route: string
  stopCount: number
  departureDate: string
  arrivalDate: string
  arrivalDayOffset: number
}

export type PublicProviderItineraryEvidence = {
  provider: 'KissandFly'
  searchUrl: string
  handoffUrl?: string
  price: string
  amount: number
  currency: FlightSearchInput['currency']
  legs: PublicProviderLegEvidence[]
}

export type PublicProviderCardSnapshot = {
  index: number
  airline: string
  price: string
  standardAvailable: boolean
  legs: Array<{
    airline?: string
    times: string[]
    duration: string
    routeCodes: string[]
    dateText: string
  }>
}

export class BrowserExecutionError extends Error {
  code: string
  retryable: boolean
  details?: Record<string, unknown>

  constructor(code: string, message: string, retryable = true, details?: Record<string, unknown>) {
    super(message)
    this.name = 'BrowserExecutionError'
    this.code = code
    this.retryable = retryable
    this.details = details
  }
}

const currencyPattern = /(?:[$£€₦]\s?[\d\s,.]+|(?:USD|GBP|EUR|NGN)\s?[\d\s,.]+|[\d\s,.]+\s?(?:USD|GBP|EUR|NGN))/i

const flightCabins = new Set<FlightSearchInput['cabin']>(['economy', 'premium_economy', 'business', 'first'])
const flightCurrencies = new Set<FlightSearchInput['currency']>(['USD', 'GBP', 'EUR', 'NGN'])

function normalizedLines(text: string) {
  return text
    .replaceAll('\u00a0', ' ')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function priceAmount(price: string) {
  let value = price.replace(/[^\d.,]/g, '')
  const lastDot = value.lastIndexOf('.')
  const lastComma = value.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    value = lastComma > lastDot
      ? value.replaceAll('.', '').replace(',', '.')
      : value.replaceAll(',', '')
  } else if (lastComma >= 0) {
    const fractionalDigits = value.length - lastComma - 1
    value = fractionalDigits === 3 ? value.replaceAll(',', '') : value.replace(',', '.')
  } else if (lastDot >= 0 && value.length - lastDot - 1 === 3) {
    value = value.replaceAll('.', '')
  }
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : Number.NaN
}

function durationInMinutes(value: string) {
  const hours = Number(value.match(/(\d+)\s*(?:hr|hrs|hour|hours|h)\b/i)?.[1] ?? 0)
  const minutes = Number(value.match(/(\d+)\s*(?:min|mins|minute|minutes|m)\b/i)?.[1] ?? 0)
  const total = hours * 60 + minutes
  return total > 0 ? total : Number.NaN
}

function validDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function dateAfterDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function timeOfDayMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!match) return Number.NaN
  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]?.toLocaleUpperCase()
  if (minute > 59) return Number.NaN
  if (meridiem) {
    if (hour < 1 || hour > 12) return Number.NaN
    if (meridiem === 'AM' && hour === 12) hour = 0
    if (meridiem === 'PM' && hour !== 12) hour += 12
  } else if (hour > 23) {
    return Number.NaN
  }
  return hour * 60 + minute
}

function arrivalDayOffset(value: string) {
  const match = value.match(/\+(\d+)\s*$/)
  return match ? Number(match[1]) : 0
}

function normalizedTimeWindow(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const normalized = String(value).trim().replace(/[–—]/g, '-').replace(/\s+/g, '')
  return normalized
}

function validTimeWindow(value: string | null) {
  if (value === null) return true
  const match = value.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/)
  if (!match) return false
  return [Number(match[1]), Number(match[3])].every(hour => hour >= 0 && hour <= 23) &&
    [Number(match[2]), Number(match[4])].every(minute => minute >= 0 && minute <= 59)
}

function timeMatchesWindow(value: string, window: string | null) {
  if (window === null) return true
  const minutes = timeOfDayMinutes(value)
  const match = window.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/)
  if (Number.isNaN(minutes) || !match) return false
  const start = Number(match[1]) * 60 + Number(match[2])
  const end = Number(match[3]) * 60 + Number(match[4])
  return start <= end
    ? minutes >= start && minutes <= end
    : minutes >= start || minutes <= end
}

function isStopsLine(line: string) {
  return /^(?:Nonstop|Direct|\d+\s+stops?)$/i.test(line)
}

function normalizedAirlines(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value
      .filter(item => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean))]
    : []
}

function normalizedChildAges(value: unknown) {
  return Array.isArray(value) ? value.map(item => Number(item)) : []
}

export function normalizeFlightSearchInput(input: FlightSearchInput): FlightSearchInput {
  const originCode = String(input.originCode ?? '').trim().toUpperCase()
  const destinationCode = String(input.destinationCode ?? '').trim().toUpperCase()
  const departureDate = String(input.departureDate ?? '').trim()
  const returnDateValue = input.returnDate === null || input.returnDate === undefined
    ? null
    : String(input.returnDate).trim()
  const returnDate = returnDateValue || null
  const cabin = String(input.cabin ?? '').trim().toLocaleLowerCase() as FlightSearchInput['cabin']
  const currency = String(input.currency ?? '').trim().toUpperCase() as FlightSearchInput['currency']
  const maxStops = Number(input.maxStops)
  const budgetAmount = input.budgetAmount === null || input.budgetAmount === undefined
    ? null
    : Number(input.budgetAmount)
  const adultCount = input.adultCount === undefined ? 1 : Number(input.adultCount)
  const childCount = input.childCount === undefined ? 0 : Number(input.childCount)
  const childAges = normalizedChildAges(input.childAges)
  const infantCount = input.infantCount === undefined ? 0 : Number(input.infantCount)
  const infantSeatCount = input.infantSeatCount === undefined ? 0 : Number(input.infantSeatCount)
  const departureTimeWindow = normalizedTimeWindow(input.departureTimeWindow)
  const arrivalTimeWindow = normalizedTimeWindow(input.arrivalTimeWindow)

  if (!/^[A-Z]{3}$/.test(originCode) || !/^[A-Z]{3}$/.test(destinationCode) || originCode === destinationCode) {
    throw new BrowserExecutionError('flight_input_invalid', 'Origin and destination must be different three-letter airport or city codes.', false)
  }
  if (!validDateOnly(departureDate) || (returnDate !== null && !validDateOnly(returnDate))) {
    throw new BrowserExecutionError('flight_input_invalid', 'Flight dates must use valid YYYY-MM-DD calendar dates.', false)
  }
  if (returnDate !== null && Date.parse(`${returnDate}T00:00:00Z`) <= Date.parse(`${departureDate}T00:00:00Z`)) {
    throw new BrowserExecutionError('flight_input_invalid', 'The return date must be after the departure date.', false)
  }
  if (!flightCabins.has(cabin) || !flightCurrencies.has(currency)) {
    throw new BrowserExecutionError('flight_input_invalid', 'The flight cabin or currency is not supported.', false)
  }
  if (!Number.isInteger(maxStops) || maxStops < 0 || maxStops > 3) {
    throw new BrowserExecutionError('flight_input_invalid', 'The maximum stop count must be an integer from zero through three.', false)
  }
  if (budgetAmount !== null && (!Number.isFinite(budgetAmount) || budgetAmount < 0 || budgetAmount > 1_000_000)) {
    throw new BrowserExecutionError('flight_input_invalid', 'The budget must be a finite non-negative amount.', false)
  }
  if (!Number.isInteger(adultCount) || adultCount < 1 || adultCount > 9 ||
    !Number.isInteger(childCount) || childCount < 0 || childCount > 8 ||
    childAges.length !== childCount ||
    !childAges.every(age => Number.isInteger(age) && age >= 2 && age <= 11) ||
    !Number.isInteger(infantCount) || infantCount < 0 || infantCount > 4 || infantCount > adultCount ||
    !Number.isInteger(infantSeatCount) || infantSeatCount < 0 || infantSeatCount > infantCount) {
    throw new BrowserExecutionError('flight_input_invalid', 'Passenger counts are outside the supported range.', false)
  }
  if (!validTimeWindow(departureTimeWindow) || !validTimeWindow(arrivalTimeWindow)) {
    throw new BrowserExecutionError('flight_input_invalid', 'Time windows must use HH:MM-HH:MM in local airport time.', false)
  }

  return {
    originCode,
    destinationCode,
    departureDate,
    returnDate,
    cabin,
    maxStops: maxStops as FlightSearchInput['maxStops'],
    budgetAmount,
    currency,
    preferredAirlines: normalizedAirlines(input.preferredAirlines),
    excludedAirlines: normalizedAirlines(input.excludedAirlines),
    adultCount,
    childCount,
    childAges,
    infantCount,
    infantSeatCount,
    allowNearbyAirports: input.allowNearbyAirports === true,
    departureTimeWindow,
    arrivalTimeWindow,
  }
}

export function isGoogleFlightsDomainAllowed(value: unknown) {
  if (!Array.isArray(value)) return false
  return value.some(item => {
    if (typeof item !== 'string') return false
    const raw = item.trim().toLocaleLowerCase()
    if (!raw) return false
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
      return url.protocol === 'https:' &&
        (!url.port || url.port === '443') &&
        !url.username &&
        !url.password &&
        (!url.pathname || url.pathname === '/') &&
        !url.search &&
        !url.hash &&
        (url.hostname === 'google.com' || url.hostname === 'www.google.com')
    } catch {
      return false
    }
  })
}

function stableOptionId(option: Omit<FlightOption, 'id' | 'label' | 'searchUrl' | 'provider'>) {
  return createHash('sha256')
    .update([
      option.airline,
      option.departureTime,
      option.arrivalTime,
      option.departureDate ?? '',
      option.returnDate ?? '',
      option.arrivalDate ?? '',
      option.arrivalDayOffset ?? 0,
      option.duration,
      option.route,
      option.stops,
      option.price,
      option.currency,
    ].join('|'))
    .digest('hex')
    .slice(0, 24)
}

export function buildGoogleFlightsUrl(input: FlightSearchInput) {
  const normalized = normalizeFlightSearchInput(input)
  const cabin = normalized.cabin.replaceAll('_', ' ')
  const passengerSummary = [
    `${normalized.adultCount} adult${normalized.adultCount === 1 ? '' : 's'}`,
    ...(normalized.childCount ? [
      `${normalized.childCount} child${normalized.childCount === 1 ? '' : 'ren'}`,
      `ages ${(normalized.childAges ?? []).join(',')}`,
    ] : []),
    ...(normalized.infantCount ? [
      `${normalized.infantCount} infant${normalized.infantCount === 1 ? '' : 's'}`,
      normalized.infantSeatCount
        ? `${normalized.infantSeatCount} infant seat${normalized.infantSeatCount === 1 ? '' : 's'}`
        : 'infants lap',
    ] : []),
  ].join(' ')
  const query = [
    `Flights from ${normalized.originCode} to ${normalized.destinationCode}`,
    `on ${normalized.departureDate}`,
    ...(normalized.returnDate ? [`returning ${normalized.returnDate}`] : ['one way']),
    cabin,
    passengerSummary,
    ...(normalized.allowNearbyAirports ? ['nearby airports'] : []),
    ...(normalized.departureTimeWindow ? [`depart ${normalized.departureTimeWindow}`] : []),
    ...(normalized.arrivalTimeWindow ? [`arrive ${normalized.arrivalTimeWindow}`] : []),
  ].join(' ')
  const url = new URL('https://www.google.com/travel/flights')
  url.searchParams.set('q', query)
  url.searchParams.set('curr', normalized.currency)
  url.searchParams.set('hl', 'en')
  return url.toString()
}

function isFlightTimeLine(line: string) {
  return /^\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\+\d+)?$/i.test(line)
}

function normalizedRoute(line: string) {
  const match = line.match(/\b([A-Z]{3})\s*(?:[–—-]|→|>)\s*([A-Z]{3})\b/)
  return match ? `${match[1]}–${match[2]}` : ''
}

export function isFlightResultCardText(text: string) {
  const lines = normalizedLines(text)
  return currencyPattern.test(text) &&
    lines.some(line => Boolean(normalizedRoute(line))) &&
    lines.some(line => /\b\d+\s*(?:hr|hrs|hour|hours|h|min|mins|minute|minutes|m)\b/i.test(line)) &&
    lines.filter(isFlightTimeLine).length >= 2 &&
    lines.some(isStopsLine)
}

export function parseGoogleFlightListItem(
  text: string,
  currency: FlightSearchInput['currency'],
  searchUrl: string,
  dates?: Pick<FlightSearchInput, 'departureDate' | 'returnDate'>,
): Omit<FlightOption, 'label'> | null {
  const lines = normalizedLines(text)
  const durationIndex = lines.findIndex(line => /\b\d+\s*(?:hr|hrs|hour|hours|h|min|mins|minute|minutes|m)\b/i.test(line))
  const routeIndex = lines.findIndex(line => Boolean(normalizedRoute(line)))
  const stopsIndex = lines.findIndex(isStopsLine)
  const priceIndex = lines.findIndex(line => currencyPattern.test(line))
  const times = lines.filter(isFlightTimeLine)
  const airline = durationIndex > 0
    ? [...lines.slice(0, durationIndex)].reverse().find(line =>
      !isFlightTimeLine(line) &&
      line !== '–' &&
      line !== '-' &&
      !normalizedRoute(line) &&
      !isStopsLine(line) &&
      !currencyPattern.test(line) &&
      !/\b\d+\s*(?:hr|hrs|hour|hours|h|min|mins|minute|minutes|m)\b/i.test(line),
    )
    : null
  if (
    durationIndex < 1 ||
    !airline ||
    routeIndex < 0 ||
    stopsIndex < 0 ||
    priceIndex < 0 ||
    times.length < 2
  ) return null

  const duration = lines[durationIndex]!
  const durationMinutes = durationInMinutes(duration)
  const price = lines[priceIndex]!
  const amount = priceAmount(price)
  if (!Number.isFinite(durationMinutes) || !Number.isFinite(amount)) return null

  const stops = lines[stopsIndex]!
  const stopCount = /^(?:Nonstop|Direct)$/i.test(stops)
    ? 0
    : Number(stops.match(/\d+/)?.[0] ?? Number.NaN)
  if (!Number.isFinite(stopCount)) return null

  const arrivalOffset = arrivalDayOffset(times[1]!)
  const base = {
    airline,
    departureTime: times[0]!,
    arrivalTime: times[1]!,
    duration,
    durationMinutes,
    route: normalizedRoute(lines[routeIndex]!),
    stops,
    stopCount,
    price,
    amount,
    currency,
    ...(dates ? {
      departureDate: dates.departureDate,
      returnDate: dates.returnDate,
      arrivalDayOffset: arrivalOffset,
      arrivalDate: dateAfterDays(dates.departureDate, arrivalOffset),
    } : { arrivalDayOffset: arrivalOffset }),
  }
  return {
    id: stableOptionId(base),
    ...base,
    provider: 'Google Flights',
    searchUrl,
  }
}

export function flightOptionSatisfiesConstraints(
  option: Pick<FlightOption, 'airline' | 'amount' | 'stopCount' | 'departureTime' | 'arrivalTime'>,
  input: FlightSearchInput,
) {
  const normalized = normalizeFlightSearchInput(input)
  const airline = option.airline.toLocaleLowerCase()
  const excluded = normalized.excludedAirlines?.some(value => airline.includes(value.toLocaleLowerCase())) ?? false
  return !excluded &&
    option.stopCount <= normalized.maxStops &&
    (normalized.budgetAmount === null || option.amount <= normalized.budgetAmount) &&
    timeMatchesWindow(option.departureTime, normalized.departureTimeWindow ?? null) &&
    timeMatchesWindow(option.arrivalTime, normalized.arrivalTimeWindow ?? null)
}

export function rankFlightOptions(
  listItemTexts: string[],
  input: FlightSearchInput,
  searchUrl = buildGoogleFlightsUrl(input),
) {
  const normalized = normalizeFlightSearchInput(input)
  const parsed = listItemTexts
    .map(text => parseGoogleFlightListItem(text, normalized.currency, searchUrl, normalized))
    .filter((option): option is Omit<FlightOption, 'label'> => Boolean(option))
    .filter(option => flightOptionSatisfiesConstraints(option, normalized))
  const unique = [...new Map(parsed.map(option => [option.id, option])).values()]
  if (!unique.length) return []

  const preferred = normalized.preferredAirlines.map(airline => airline.toLocaleLowerCase())
  const eligible = unique
  const best = eligible.find(option =>
    preferred.some(airline => option.airline.toLocaleLowerCase().includes(airline))
  ) ?? eligible[0]!
  const cheapest = [...eligible].sort((left, right) => left.amount - right.amount)[0]!
  const fastest = [...eligible].sort((left, right) => left.durationMinutes - right.durationMinutes)[0]!

  const selected: FlightOption[] = []
  const add = (
    option: Omit<FlightOption, 'label'>,
    label: FlightOption['label'],
  ) => {
    if (selected.some(existing => existing.id === option.id)) return
    selected.push({ ...option, label })
  }
  add(best, 'Best overall')
  add(cheapest, 'Cheapest')
  add(fastest, 'Fastest')
  for (const option of eligible) {
    if (selected.length >= 3) break
    add(option, 'Also worth considering')
  }
  return selected.slice(0, 3)
}

const publicProviderBaseUrl = 'https://kissandfly.ng'
const publicProviderClassByCabin: Record<FlightSearchInput['cabin'], string> = {
  economy: 'E',
  premium_economy: 'W',
  business: 'B',
  first: 'F',
}

function publicProviderBase() {
  const configured = String(process.env.SHOTCOUNT_FLIGHT_PROVIDER_BASE_URL ?? publicProviderBaseUrl).trim()
  const safe = safeExternalProviderHandoffUrl(configured)
  if (!safe) {
    throw new BrowserExecutionError(
      'flight_provider_not_configured',
      'The configured public flight provider is not a safe HTTPS destination.',
      false,
    )
  }
  const url = new URL(safe)
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  url.search = ''
  url.hash = ''
  return url
}

function airportCodes(route: string) {
  return route.toLocaleUpperCase().match(/\b[A-Z]{3}\b/g) ?? []
}

function providerRouteSegment(
  route: string,
  fallbackOrigin: string,
  fallbackDestination: string,
) {
  const codes = airportCodes(route)
  const origin = codes[0] ?? fallbackOrigin
  const destination = codes.at(-1) ?? fallbackDestination
  return `${origin}-${destination}`
}

function providerDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

export function buildKissAndFlySearchUrl(
  input: FlightSearchInput,
  selectedOption: Pick<FlightOption, 'route'>,
  selectedReturnOption?: Pick<FlightOption, 'route'>,
) {
  const normalized = normalizeFlightSearchInput(input)
  const outbound = providerRouteSegment(
    selectedOption.route,
    normalized.originCode,
    normalized.destinationCode,
  )
  const segments = [`${outbound}-${providerDate(normalized.departureDate)}`]
  if (normalized.returnDate) {
    const returnRoute = selectedReturnOption
      ? providerRouteSegment(selectedReturnOption.route, normalized.destinationCode, normalized.originCode)
      : `${normalized.destinationCode}-${normalized.originCode}`
    segments.push(`${returnRoute}-${providerDate(normalized.returnDate)}`)
  }
  const base = publicProviderBase()
  base.pathname = `${base.pathname.replace(/\/$/, '')}/avia/search/preloader/${segments.join('/')}`
  base.searchParams.set('adults', String(normalized.adultCount ?? 1))
  base.searchParams.set('children', String(normalized.childCount ?? 0))
  base.searchParams.set('infants', String(normalized.infantCount ?? 0))
  base.searchParams.set('class', publicProviderClassByCabin[normalized.cabin])
  return base.toString()
}

function providerMonth(value: string) {
  return {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }[value.slice(0, 3).toLocaleLowerCase()]
}

function providerDateFromText(value: string, fallback: string) {
  const match = value.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/)
  if (!match) return fallback
  const month = providerMonth(match[2]!)
  if (!month) return fallback
  const day = Number(match[1])
  const year = Number(match[3])
  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return validDateOnly(candidate) ? candidate : fallback
}

function providerAirlineName(value: string) {
  return value
    .replace(/\b(?:Premium\s+Economy|Economy|Business|First)(?:\s+Class)?\b/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseKissAndFlyCardSnapshot(
  snapshot: PublicProviderCardSnapshot,
  input: FlightSearchInput,
  searchUrl: string,
  currency: FlightSearchInput['currency'] = input.currency,
): PublicProviderItineraryEvidence | null {
  const normalized = normalizeFlightSearchInput(input)
  const airline = providerAirlineName(snapshot.airline)
  const price = snapshot.price.trim()
  const amount = priceAmount(price)
  if (
    !snapshot.standardAvailable ||
    !airline ||
    !price ||
    !Number.isFinite(amount) ||
    !flightCurrencies.has(currency) ||
    !Array.isArray(snapshot.legs) ||
    !snapshot.legs.length ||
    snapshot.legs.length > 2
  ) return null

  const legs: PublicProviderLegEvidence[] = []
  for (const [index, leg] of snapshot.legs.entries()) {
    const times = Array.isArray(leg.times) ? leg.times : []
    const routeCodes = Array.isArray(leg.routeCodes) ? leg.routeCodes.filter(Boolean) : []
    const duration = String(leg.duration ?? '').trim()
    const durationMinutes = durationInMinutes(duration)
    if (times.length < 2 || routeCodes.length < 2 || !duration || !Number.isFinite(durationMinutes)) return null
    const departureDate = index === 0
      ? normalized.departureDate
      : normalized.returnDate ?? normalized.departureDate
    const arrivalDate = providerDateFromText(String(leg.dateText ?? ''), departureDate)
    const arrivalDayOffset = Math.max(0, Math.round(
      (Date.parse(`${arrivalDate}T00:00:00Z`) - Date.parse(`${departureDate}T00:00:00Z`)) / (24 * 60 * 60 * 1000),
    ))
    const legAirline = providerAirlineName(String(leg.airline ?? snapshot.airline))
    if (!legAirline) return null
    legs.push({
      airline: legAirline,
      departureTime: times[0]!,
      arrivalTime: times[1]!,
      duration,
      durationMinutes,
      route: `${routeCodes[0]}–${routeCodes.at(-1)}`,
      stopCount: Math.max(0, routeCodes.length - 2),
      departureDate,
      arrivalDate,
      arrivalDayOffset,
    })
  }

  return {
    provider: 'KissandFly',
    searchUrl,
    price,
    amount,
    currency,
    legs,
  }
}

function normalizedAirline(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function publicProviderLegMatches(
  candidate: PublicProviderLegEvidence,
  expected: Pick<FlightOption, 'airline' | 'route' | 'departureTime' | 'arrivalTime' | 'durationMinutes' | 'stopCount'>,
) {
  const candidateAirline = normalizedAirline(candidate.airline)
  const expectedAirline = normalizedAirline(expected.airline)
  const candidateCodes = airportCodes(candidate.route)
  const expectedCodes = airportCodes(expected.route)
  const sameAirline = candidateAirline === expectedAirline ||
    candidateAirline.includes(expectedAirline) ||
    expectedAirline.includes(candidateAirline)
  const sameRoute = candidateCodes[0] === expectedCodes[0] && candidateCodes.at(-1) === expectedCodes.at(-1)
  const sameDeparture = timeOfDayMinutes(candidate.departureTime) === timeOfDayMinutes(expected.departureTime)
  const sameArrival = timeOfDayMinutes(candidate.arrivalTime) === timeOfDayMinutes(expected.arrivalTime)
  return sameAirline &&
    sameRoute &&
    sameDeparture &&
    sameArrival &&
    Math.abs(candidate.durationMinutes - expected.durationMinutes) <= 15 &&
    candidate.stopCount === expected.stopCount
}

export function chooseKissAndFlyItinerary(
  candidates: PublicProviderItineraryEvidence[],
  input: FlightSearchInput,
  selectedOption: FlightOption,
  selectedReturnOption?: FlightOption,
) {
  const normalized = normalizeFlightSearchInput(input)
  const expectedLegs = selectedReturnOption ? [selectedOption, selectedReturnOption] : [selectedOption]
  const outboundCodes = airportCodes(selectedOption.route)
  const expectedReturnRoute = selectedReturnOption?.route ?? (
    `${outboundCodes.at(-1) ?? normalized.destinationCode}–${outboundCodes[0] ?? normalized.originCode}`
  )
  return candidates
    .filter(candidate => candidate.currency === normalized.currency)
    .filter(candidate => normalized.budgetAmount === null || candidate.amount <= normalized.budgetAmount)
    .filter(candidate => candidate.legs.length === (normalized.returnDate ? 2 : 1))
    .filter(candidate => publicProviderLegMatches(candidate.legs[0]!, expectedLegs[0]!))
    .filter(candidate => !normalized.returnDate || (
      candidate.legs[1]?.route === expectedReturnRoute &&
      candidate.legs[1]?.departureDate === normalized.returnDate
    ))
    .filter(candidate => !selectedReturnOption || publicProviderLegMatches(candidate.legs[1]!, expectedLegs[1]!))
    .sort((left, right) => left.amount - right.amount)[0] ?? null
}

function providerLegAsFlightOption(
  leg: PublicProviderLegEvidence,
  evidence: PublicProviderItineraryEvidence,
  id: string,
): FlightOption {
  return {
    id,
    label: 'Also worth considering',
    airline: leg.airline,
    departureTime: leg.departureTime,
    arrivalTime: leg.arrivalTime,
    duration: leg.duration,
    durationMinutes: leg.durationMinutes,
    route: leg.route,
    stops: leg.stopCount === 0 ? 'Nonstop' : `${leg.stopCount} stop${leg.stopCount === 1 ? '' : 's'}`,
    stopCount: leg.stopCount,
    price: evidence.price,
    amount: evidence.amount,
    currency: evidence.currency,
    provider: 'Google Flights',
    searchUrl: evidence.searchUrl,
    departureDate: leg.departureDate,
    returnDate: null,
    arrivalDate: leg.arrivalDate,
    arrivalDayOffset: leg.arrivalDayOffset,
  }
}

async function executablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH
  if (process.platform === 'linux') return chromium.executablePath()
  const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  try {
    await access(macPath)
    return macPath
  } catch {
    throw new BrowserExecutionError(
      'browser_runtime_missing',
      'The browser worker does not have a compatible Chromium runtime.',
      false,
    )
  }
}

async function launchBrowser() {
  const linux = process.platform === 'linux'
  return playwright.launch({
    executablePath: await executablePath(),
    headless: true,
    args: linux ? chromium.args : [],
  })
}

export const maxSharedBrowserUses = 1

export function isRecoverableBrowserRuntimeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /target page, context or browser has been closed|browser has been closed|err_insufficient_resources|browsercontext\.newpage|page\.goto/i.test(message)
}

export function isRecoverableFlightReadError(error: unknown) {
  return error instanceof BrowserExecutionError &&
    error.retryable &&
    ['flight_results_timeout', 'browser_result_not_ready', 'browser_worker_timeout'].includes(error.code)
}

export function shouldReloadFlightResults(bodyText: string) {
  return /\b(?:something went wrong|no results?|results? unavailable|could(?:n|'t| not) load|temporarily unavailable|try again|reload results?)\b/i.test(bodyText)
}

export function flightProviderNeedsUser(bodyText: string) {
  return /\b(?:captcha|verify\s+(?:that\s+)?you(?:'re| are)\s+human|unusual\s+traffic|robot\s+check|sign\s+in\s+to\s+continue)\b/i.test(bodyText)
}

async function dismissPublicCookiePrompt(page: Page) {
  const reject = page.getByRole('button', { name: 'Reject all', exact: true })
  if (await reject.count() === 1) {
    await reject.click()
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)
  }
}

async function openFlightSearch(page: Page, searchUrl: string) {
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await dismissPublicCookiePrompt(page)
  const deadline = Date.now() + 42_000
  let reloads = 0
  while (Date.now() < deadline) {
    const listItems = await page.locator('li, [role="listitem"]').allInnerTexts().catch(error => {
      if (/execution context was destroyed|most likely because of a navigation/i.test(String(error))) return []
      throw error
    })
    if (listItems.some(isFlightResultCardText)) return
    const body = await page.locator('body').innerText().catch(() => '')
    if (flightProviderNeedsUser(body)) {
      throw new BrowserExecutionError(
        'flight_provider_challenge',
        'The flight provider requires a user verification step before it will show live results.',
        false,
      )
    }
    if (shouldReloadFlightResults(body) && reloads < 2) {
      reloads += 1
      const reload = page.getByRole('button', { name: /reload|try again|retry/i }).first()
      if (await reload.count()) {
        await reload.click({ noWaitAfter: true, timeout: 5_000 }).catch(() => undefined)
      } else {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined)
      }
      await page.waitForTimeout(2_500)
      continue
    }
    await page.waitForTimeout(750)
  }
  throw new BrowserExecutionError(
    'flight_results_timeout',
    'Google Flights took too long to return live options. Try again in a moment.',
  )
}

async function visibleButtonByText(page: Page, predicate: (value: string) => boolean) {
  const buttons = page.locator('button:visible')
  const count = await buttons.count()
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index)
    const label = (await button.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    if (predicate(label)) return button
  }
  return null
}

async function waitForKissAndFlyResults(page: Page) {
  const deadline = Date.now() + 45_000
  let reloads = 0
  while (Date.now() < deadline) {
    const cardCount = await page.locator('.avia-item:visible').count().catch(() => 0)
    if (cardCount > 0) return
    const body = await page.locator('body').innerText().catch(() => '')
    if (flightProviderNeedsUser(body)) {
      throw new BrowserExecutionError(
        'flight_provider_challenge',
        'The public flight provider requires a user verification step before it will show live results.',
        false,
      )
    }
    if (shouldReloadFlightResults(body) && reloads < 1) {
      reloads += 1
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined)
    }
    await page.waitForTimeout(750)
  }
  throw new BrowserExecutionError(
    'flight_provider_results_timeout',
    'The public flight provider took too long to return live options.',
  )
}

async function ensureKissAndFlyCurrency(page: Page, currency: FlightSearchInput['currency']) {
  const header = await visibleButtonByText(page, value => /^English\/(?:USD|GBP|EUR|NGN)$/i.test(value))
  if (!header) {
    throw new BrowserExecutionError(
      'flight_provider_currency_unavailable',
      'The public flight provider did not expose a currency selector for the requested price currency.',
      false,
    )
  }
  const current = (await header.innerText()).replace(/\s+/g, '').trim().toLocaleUpperCase().split('/')[1]
  if (current === currency) return

  await header.click()
  const desired = await visibleButtonByText(page, value => value.toLocaleUpperCase() === currency)
  if (!desired) {
    throw new BrowserExecutionError(
      'flight_provider_currency_unavailable',
      'The public flight provider does not support the requested price currency.',
      false,
    )
  }
  await desired.click()
  const confirm = await visibleButtonByText(page, value => {
    const compact = value.replace(/\s+/g, '')
    return compact === 'OK' || compact === '\u039f\u041a'
  })
  if (!confirm) {
    throw new BrowserExecutionError(
      'flight_provider_currency_unavailable',
      'The public flight provider did not expose a safe currency confirmation control.',
      false,
    )
  }
  await confirm.click()
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const updatedHeader = await visibleButtonByText(page, value => /^English\/(?:USD|GBP|EUR|NGN)$/i.test(value))
    const updated = updatedHeader
      ? (await updatedHeader.innerText()).replace(/\s+/g, '').trim().toLocaleUpperCase().split('/')[1]
      : ''
    if (updated === currency) return
    await page.waitForTimeout(500)
  }
  throw new BrowserExecutionError(
    'flight_provider_currency_unavailable',
    'The public flight provider did not apply the requested price currency.',
    false,
  )
}

async function kissAndFlyCardSnapshots(page: Page) {
  const cards = page.locator('.avia-item:visible')
  const snapshots = await cards.evaluateAll(elements => elements.map((element, index) => {
    const text = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()
    const airlines = Array.from(element.querySelectorAll('.avia-item-recommendation-general'))
      .map(item => text(item.textContent))
    const trips = Array.from(element.querySelectorAll('.avia-item-recommendation-trip')).map((trip, tripIndex) => ({
      airline: airlines[tripIndex] ?? airlines[0] ?? '',
      times: Array.from(trip.querySelectorAll('.info .time')).map(item => text(item.textContent)).filter(Boolean),
      duration: text(trip.querySelector('.info .duration')?.textContent),
      routeCodes: Array.from(trip.querySelectorAll('.iata'))
        .map(item => text(item.textContent).match(/\b[A-Z]{3}\b/)?.[0] ?? '')
        .filter(Boolean),
      dateText: text(trip.querySelector('.date')?.textContent),
    }))
    const standardButton = element.querySelector('button.t-btn.preset-2')
    const price = text(standardButton?.parentElement?.querySelector('.t-price')?.textContent)
    return {
      index,
      airline: airlines[0] ?? '',
      price,
      standardAvailable: Boolean(standardButton),
      legs: trips,
    }
  }))
  return { cards, snapshots }
}

export const maximumPublicProviderSelectionAttempts = 2

async function continueToKissAndFlyBooking(
  page: Page,
  input: FlightSearchInput,
  selectedOption: FlightOption,
  selectedReturnOption: FlightOption | undefined,
  trace: FlightSelectionTraceEvent[],
) {
  const searchUrl = buildKissAndFlySearchUrl(input, selectedOption, selectedReturnOption)
  const providerHost = new URL(publicProviderBase()).hostname.toLocaleLowerCase()
  traceEvent(trace, 'public_provider_search_started', {
    provider: 'KissandFly',
    searchUrl,
    currency: input.currency,
    tripType: input.returnDate ? 'round_trip' : 'one_way',
  })
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await waitForKissAndFlyResults(page)
  await ensureKissAndFlyCurrency(page, input.currency)
  await waitForKissAndFlyResults(page)

  for (let attempt = 1; attempt <= maximumPublicProviderSelectionAttempts; attempt += 1) {
    const { cards, snapshots } = await kissAndFlyCardSnapshots(page)
    const candidates = snapshots
      .map(snapshot => parseKissAndFlyCardSnapshot(snapshot, input, searchUrl, input.currency))
      .filter((candidate): candidate is PublicProviderItineraryEvidence => Boolean(candidate))
    const chosen = chooseKissAndFlyItinerary(candidates, input, selectedOption, selectedReturnOption)
    traceEvent(trace, 'public_provider_cards_found', {
      attempt,
      count: candidates.length,
      matching: Boolean(chosen),
      candidates: candidates.slice(0, 12).map(candidate => ({
        index: snapshots.find(snapshot => snapshot.price === candidate.price)?.index,
        airline: candidate.legs[0]?.airline,
        legs: candidate.legs.map(leg => ({
          route: leg.route,
          departureTime: leg.departureTime,
          arrivalTime: leg.arrivalTime,
          durationMinutes: leg.durationMinutes,
          stopCount: leg.stopCount,
        })),
        amount: candidate.amount,
        currency: candidate.currency,
      })),
    })
    if (!chosen) {
      if (attempt < maximumPublicProviderSelectionAttempts) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined)
        await waitForKissAndFlyResults(page)
        traceEvent(trace, 'public_provider_recovered_state', {
          attempt,
          source: 'stale_result_cards',
          url: page.url(),
        })
        continue
      }
      throw new BrowserExecutionError(
        'flight_provider_itinerary_unavailable',
        'The public flight provider no longer shows a validated match for the selected itinerary.',
        true,
        { searchUrl, candidateCount: candidates.length },
      )
    }

    const matchingIndex = snapshots.findIndex(snapshot => {
      const parsed = parseKissAndFlyCardSnapshot(snapshot, input, searchUrl, input.currency)
      return parsed?.price === chosen.price &&
        parsed.amount === chosen.amount &&
        parsed.legs.length === chosen.legs.length &&
        parsed.legs.every((leg, index) => leg.route === chosen.legs[index]?.route && leg.departureTime === chosen.legs[index]?.departureTime)
    })
    if (matchingIndex < 0) {
      if (attempt < maximumPublicProviderSelectionAttempts) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined)
        await waitForKissAndFlyResults(page)
        continue
      }
      throw new BrowserExecutionError('flight_provider_itinerary_unavailable', 'The validated provider card became stale before booking.', true)
    }

    const card = cards.nth(matchingIndex)
    const book = card.locator('button.t-btn.preset-2:visible')
    if (await book.count() !== 1) {
      throw new BrowserExecutionError(
        'flight_provider_selection_failed',
        'The validated provider card did not expose exactly one standard booking control.',
        true,
      )
    }
    await book.click({ noWaitAfter: true })
    traceEvent(trace, 'public_provider_selection_clicked', {
      attempt,
      cardIndex: matchingIndex,
      provider: 'KissandFly',
      amount: chosen.amount,
      currency: chosen.currency,
    })
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const safeUrl = safeExternalProviderHandoffUrl(page.url())
      const safeHostname = safeUrl ? new URL(safeUrl).hostname.toLocaleLowerCase() : ''
      if (safeUrl && (safeHostname === providerHost || safeHostname.endsWith(`.${providerHost}`)) &&
        new URL(safeUrl).pathname.includes('/avia/search/book')) {
        const evidence = { ...chosen, handoffUrl: safeUrl }
        traceEvent(trace, 'public_provider_handoff_verified', {
          provider: 'KissandFly',
          hostname: new URL(safeUrl).hostname,
          paymentBoundaryReached: true,
          itineraryEvidence: true,
        })
        return {
          url: safeUrl,
          provider: 'KissandFly',
          evidence,
        }
      }
      await page.waitForTimeout(500)
    }
    throw new BrowserExecutionError(
      'flight_provider_selection_timeout',
      'The public provider did not open the validated passenger-details page after one safe booking action.',
      true,
    )
  }
  throw new BrowserExecutionError('flight_provider_selection_failed', 'The public provider selection path was exhausted.', true)
}

export async function withBrowser<T>(operation: (browser: Browser, page: Page) => Promise<T>) {
  // One isolated browser per worker invocation avoids one failed read closing a
  // browser that another invocation is still using. Durable retries happen at
  // the task-owned session layer, outside this bounded serverless invocation.
  const browser = await launchBrowser()
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined
  try {
    context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'UTC',
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    return await operation(browser, page)
  } finally {
    await context?.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}

export async function runLiveFlightSearch(input: FlightSearchInput): Promise<FlightSearchResult> {
  const normalized = normalizeFlightSearchInput(input)
  const searchUrl = buildGoogleFlightsUrl(normalized)
  return withBrowser(async (_browser, page) => {
    await openFlightSearch(page, searchUrl)
    const listItemTexts = await page.locator('li, [role="listitem"]').allInnerTexts()
    const options = rankFlightOptions(listItemTexts, normalized, searchUrl)
    if (!options.length) {
      throw new BrowserExecutionError(
        'no_flight_results',
        'The live search did not return flights matching those constraints.',
      )
    }
    return {
      provider: 'Google Flights',
      searchUrl,
      observedAt: new Date().toISOString(),
      options,
    }
  })
}

type FlightCardCandidate = {
  index: number
  option: Omit<FlightOption, 'label'>
  score: number
}

export function flightOptionMatchScore(
  candidate: Pick<FlightOption, 'id' | 'airline' | 'route' | 'departureTime' | 'durationMinutes' | 'stopCount' | 'amount'>,
  expected: Pick<FlightOption, 'id' | 'airline' | 'route' | 'departureTime' | 'durationMinutes' | 'stopCount' | 'amount'>,
) {
  if (candidate.id === expected.id) return 100
  let score = 0
  if (candidate.airline.toLocaleLowerCase() === expected.airline.toLocaleLowerCase()) score += 30
  if (candidate.route === expected.route) score += 25
  if (candidate.departureTime === expected.departureTime) score += 15
  if (candidate.durationMinutes === expected.durationMinutes) score += 10
  if (candidate.stopCount === expected.stopCount) score += 10
  if (candidate.amount === expected.amount) score += 10
  return score
}

export function chooseFlightCandidate<T extends Pick<FlightOption, 'id' | 'airline' | 'route' | 'departureTime' | 'durationMinutes' | 'stopCount' | 'amount'>>(
  candidates: T[],
  expected: FlightOption,
) {
  const ranked = candidates
    .map(candidate => ({ candidate, score: flightOptionMatchScore(candidate, expected) }))
    .sort((left, right) => right.score - left.score)
  if (ranked[0] && ranked[1] && ranked[0].score === ranked[1].score && ranked[0].score < 100) return null
  return ranked[0]?.score >= 80 ? ranked[0] : null
}

export const maximumFlightSelectionAttempts = 3

function traceEvent(
  trace: FlightSelectionTraceEvent[],
  stage: string,
  details: Record<string, unknown>,
) {
  trace.push({ stage, at: new Date().toISOString(), details })
}

async function visibleFlightCandidates(
  page: Page,
  input: FlightSearchInput,
  searchUrl: string,
  expected: FlightOption,
) {
  const cards = page.locator('li:visible, [role="listitem"]:visible')
  const texts = await cards.allInnerTexts()
  const candidates: FlightCardCandidate[] = []
  const seen = new Set<string>()
  for (const [index, text] of texts.entries()) {
    const option = parseGoogleFlightListItem(text, input.currency, searchUrl, input)
    if (!option || !flightOptionSatisfiesConstraints(option, input) || seen.has(option.id)) continue
    seen.add(option.id)
    candidates.push({ index, option, score: flightOptionMatchScore(option, expected) })
  }
  return { cards, candidates }
}

async function expectedFlightStageReady(page: Page, expectedStage: 'returning_flights' | 'booking_options') {
  if (expectedStage === 'booking_options') {
    try {
      return new URL(page.url()).pathname.startsWith('/travel/flights/booking')
    } catch {
      return false
    }
  }
  return page.locator('body').innerText()
    .then(body => /\b(?:returning|return)\s+flights?\b|\b(?:select|choose)\s+(?:your\s+)?(?:a\s+)?return\b/i.test(body))
    .catch(() => false)
}

async function waitForFlightStage(page: Page, expectedStage: 'returning_flights' | 'booking_options', timeout: number) {
  await page.waitForFunction(
    stage => stage === 'booking_options'
      ? window.location.pathname.startsWith('/travel/flights/booking')
      : /\b(?:returning|return)\s+flights?\b|\b(?:select|choose)\s+(?:your\s+)?(?:a\s+)?return\b/i.test(document.body.innerText),
    expectedStage,
    { timeout },
  )
}

async function activateFlightOption(
  page: Page,
  input: FlightSearchInput,
  expected: FlightOption,
  expectedStage: 'returning_flights' | 'booking_options',
  trace: FlightSelectionTraceEvent[],
) {
  for (let attempt = 1; attempt <= maximumFlightSelectionAttempts; attempt += 1) {
    if (await expectedFlightStageReady(page, expectedStage)) {
      traceEvent(trace, 'post_click_state', { attempt, expectedStage, url: page.url(), alreadyReady: true })
      return expected
    }
    const { cards, candidates } = await visibleFlightCandidates(page, input, expected.searchUrl, expected)
    traceEvent(trace, 'candidate_cards_found', {
      attempt,
      count: candidates.length,
      candidates: candidates.slice(0, 12).map(candidate => ({
        index: candidate.index, id: candidate.option.id, airline: candidate.option.airline,
        route: candidate.option.route, departureTime: candidate.option.departureTime,
        durationMinutes: candidate.option.durationMinutes, stopCount: candidate.option.stopCount,
        amount: candidate.option.amount, score: candidate.score,
      })),
    })
    const chosen = chooseFlightCandidate(candidates.map(candidate => candidate.option), expected)
    if (!chosen) {
      if (attempt < maximumFlightSelectionAttempts) {
        await openFlightSearch(page, expected.searchUrl)
        traceEvent(trace, 'recovered_state', { attempt, url: page.url(), source: 'stale_result_cards' })
        continue
      }
      throw new BrowserExecutionError(
        'flight_sold_out',
        'This flight is no longer available. Run the search again for current options.',
        false,
      )
    }
    const selected = candidates.find(candidate => candidate.option.id === chosen.candidate.id)!
    if (selected.option.amount !== expected.amount) {
      throw new BrowserExecutionError(
        'flight_price_changed',
        'The flight price changed since the search. Review fresh options before continuing.',
        false,
      )
    }
    traceEvent(trace, 'chosen_candidate', {
      attempt, id: selected.option.id, score: chosen.score, index: selected.index,
      airline: selected.option.airline, route: selected.option.route,
      amount: selected.option.amount, expectedStage,
    })
    const item = cards.nth(selected.index)
    const targets = [
      { name: 'card_action', locator: item.locator('[jsname="BXUrOb"][jsaction*="O1htCb"]:visible').first() },
      { name: 'accessible_select_link', locator: item.locator('[role="link"][aria-label*="Select flight" i]:visible').first() },
      { name: 'select_button', locator: item.getByRole('button', { name: /select/i }).first() },
      { name: 'card', locator: item },
    ]
    const target = await (async () => {
      for (const candidate of targets) if (await candidate.locator.count()) return candidate
      return null
    })()
    if (!target) {
      if (attempt < maximumFlightSelectionAttempts) {
        await openFlightSearch(page, expected.searchUrl)
        traceEvent(trace, 'recovered_state', { attempt, url: page.url(), source: 'missing_selection_target' })
        continue
      }
      throw new BrowserExecutionError('flight_selection_failed', 'Google Flights did not expose a selectable itinerary.')
    }
    traceEvent(trace, 'selection_target', { attempt, target: target.name })
    await target.locator.click({ force: target.name !== 'select_button', noWaitAfter: true }).catch(error => {
      traceEvent(trace, 'stale_or_changed_target', { attempt, target: target.name, message: String(error).slice(0, 240) })
    })
    try {
      await waitForFlightStage(page, expectedStage, attempt === maximumFlightSelectionAttempts ? 20_000 : 10_000)
      traceEvent(trace, 'post_click_state', { attempt, expectedStage, url: page.url(), recovered: attempt > 1 })
      return { ...selected.option, label: expected.label }
    } catch (error) {
      traceEvent(trace, 'selection_retry', { attempt, reason: String(error).slice(0, 240), url: page.url() })
      if (attempt < maximumFlightSelectionAttempts) {
        await openFlightSearch(page, expected.searchUrl)
        traceEvent(trace, 'recovered_state', { attempt, url: page.url(), source: 'search_checkpoint' })
      }
    }
  }
  throw new BrowserExecutionError(
    'flight_selection_failed',
    'Google Flights did not expose a selectable itinerary after bounded safe retries.',
  )
}

/**
 * Provider links are a navigation-only handoff. Keep this separate from the
 * Google allowlist because the user may need to finish on an airline domain,
 * while still rejecting local, credential-bearing, IP, and Google redirect
 * URLs.
 */
export function safeExternalProviderHandoffUrl(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const hostname = url.hostname.toLocaleLowerCase()
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      isIP(hostname) ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      isGoogleOwnedHostname(hostname) ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname)
    ) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function isGoogleOwnedHostname(hostname: string) {
  const normalized = hostname.toLocaleLowerCase().replace(/\.$/, '')
  return normalized === 'google' ||
    normalized.endsWith('.google') ||
    normalized === 'google.com' ||
    normalized.endsWith('.google.com') ||
    normalized === 'googleusercontent.com' ||
    normalized.endsWith('.googleusercontent.com') ||
    normalized === 'googleapis.com' ||
    normalized.endsWith('.googleapis.com') ||
    normalized === 'gstatic.com' ||
    normalized.endsWith('.gstatic.com') ||
    normalized === 'googletraveladservices.com' ||
    normalized.endsWith('.googletraveladservices.com')
}

const providerHandoffControlPattern = /(?:continue\s+to\s+book(?:\s+with)?|book\s+with|view\s+(?:deal|offer)|visit\s+(?:site|airline))/i
const providerHandoffBlockedPattern = /\b(?:pay|purchase|buy|confirm|sign\s*in|log\s*in|create\s+account)\b/i
const providerLinkEvidencePattern = /(?:book|deal|offer|airline|provider|flight|travel|website|site|booking|fly)/i

/**
 * Google may expose a provider as a direct link, a Google redirect, a popup,
 * or a navigation request. Normalize all of those forms before allowing the
 * worker to leave the Google domain.
 */
export function safeProviderNavigationUrl(raw: unknown) {
  let candidate = typeof raw === 'string' ? raw.trim() : ''
  if (!candidate) return ''
  for (let depth = 0; depth < 3; depth += 1) {
    const direct = safeExternalProviderHandoffUrl(candidate)
    if (direct) return direct
    try {
      const url = new URL(candidate)
      const hostname = url.hostname.toLocaleLowerCase()
      if (hostname !== 'google.com' && !hostname.endsWith('.google.com')) return ''
      const nested = ['url', 'q', 'destination', 'redirect', 'target']
        .map(key => url.searchParams.get(key)?.trim() ?? '')
        .find(value => value.startsWith('https://'))
      if (!nested) return ''
      candidate = nested
    } catch {
      return ''
    }
  }
  return ''
}

function providerLabel(label: string, href = '') {
  return label
    .replace(/^.*?(?:continue\s+to\s+book(?:\s+with)?|book\s+with|view\s+(?:deal|offer)|visit\s+(?:site|airline))\s*/i, '')
    .replace(/^.*?\b(?:book|view)\s+(?:the\s+)?(?:deal|offer)\s*(?:with|at)?\s*/i, '')
    .replace(/\s+(?:airline|for)\b.*$/i, '')
    .trim()
    .slice(0, 120) || (() => {
      try {
        return new URL(href).hostname.replace(/^www\./i, '').slice(0, 120)
      } catch {
        return 'Airline'
      }
    })()
}

async function providerLinkTarget(page: Page) {
  const links = await page.locator('a[href]:visible').evaluateAll(elements => elements
    .map(element => ({
      href: (element as HTMLAnchorElement).href,
      label: `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.replace(/\s+/g, ' ').trim(),
      context: `${element.parentElement?.textContent ?? ''}`.replace(/\s+/g, ' ').trim().slice(0, 500),
    }))
    .slice(0, 100),
  ).catch(error => {
    if (/frame\s+was\s+detached|execution\s+context\s+was\s+destroyed|target\s+closed/i.test(String(error))) return []
    throw error
  })
  for (const link of links) {
    const safeUrl = safeProviderNavigationUrl(link.href)
    if (!safeUrl) continue
    const evidence = `${link.label} ${link.context} ${link.href}`
    if (!providerLinkEvidencePattern.test(evidence) && !/[$£€₦]\s?[\d,.]+|(?:USD|GBP|EUR|NGN)\s?[\d,.]+/i.test(link.context)) continue
    return { href: safeUrl, label: link.label || link.context }
  }
  return null
}

async function continueToProviderBooking(page: Page, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let providerLink: Awaited<ReturnType<typeof providerLinkTarget>> = null
  let providerControlReady = false
  while (Date.now() < deadline) {
    const targets = [
      page.getByRole('button', { name: providerHandoffControlPattern }).all(),
      page.getByRole('link', { name: providerHandoffControlPattern }).all(),
    ]
    for (const group of targets) {
      try {
        for (const candidate of await group) {
          const label = `${await candidate.getAttribute('aria-label').catch(() => '')} ${await candidate.innerText().catch(() => '')}`.trim()
          if (await candidate.isVisible().catch(() => false) && !providerHandoffBlockedPattern.test(label)) {
            providerControlReady = true
            break
          }
        }
      } catch (error) {
        if (!/frame\s+was\s+detached|execution\s+context\s+was\s+destroyed|target\s+closed/i.test(String(error))) throw error
      }
      if (providerControlReady) break
    }
    if (!providerControlReady) providerLink = await providerLinkTarget(page)
    if (providerControlReady || providerLink) break
    await page.waitForTimeout(500)
  }
  const targets = [
    page.getByRole('button', { name: providerHandoffControlPattern }).all(),
    page.getByRole('link', { name: providerHandoffControlPattern }).all(),
  ]
  let target: Locator | null = null
  let label = ''
  for (const group of targets) {
    for (const candidate of await group) {
      if (!await candidate.isVisible().catch(() => false)) continue
      const candidateLabel = `${await candidate.getAttribute('aria-label').catch(() => '')} ${await candidate.innerText().catch(() => '')}`.trim()
      if (providerHandoffBlockedPattern.test(candidateLabel)) continue
      target = candidate
      label = candidateLabel
      break
    }
    if (target) break
  }
  if (!target && !providerLink) {
    throw new BrowserExecutionError(
      'flight_provider_handoff_unavailable',
      'Google Flights did not expose a safe direct provider booking link for this itinerary.',
      true,
    )
  }

  const provider = providerLabel(label || providerLink?.label || '', providerLink?.href)
  const existingPages = new Set(page.context().pages())
  const safeDestination = async (candidate: Page | null) => {
    if (!candidate) return null
    const initial = safeProviderNavigationUrl(candidate.url())
    if (initial && !safeExternalProviderHandoffUrl(candidate.url())) {
      await candidate.goto(initial, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => undefined)
    }
    if (!safeProviderNavigationUrl(candidate.url())) {
      await candidate.waitForURL(
        url => Boolean(safeProviderNavigationUrl(url.toString())),
        { timeout: timeoutMs },
      ).catch(() => undefined)
    }
    const url = safeProviderNavigationUrl(candidate.url())
    if (!url) return null
    if (!safeExternalProviderHandoffUrl(candidate.url())) {
      await candidate.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => undefined)
    }
    const currentUrl = safeExternalProviderHandoffUrl(candidate.url())
    return currentUrl ? { page: candidate, url: currentUrl } : null
  }
  const popupPromise = page.waitForEvent('popup', { timeout: timeoutMs })
    .then(popup => safeDestination(popup))
    .catch(() => null)
  const samePagePromise = page.waitForURL(
    url => Boolean(safeProviderNavigationUrl(url.toString())),
    { timeout: timeoutMs },
  ).then(() => safeDestination(page)).catch(() => null)
  const contextPagePromise = page.context().waitForEvent('page', { timeout: timeoutMs })
    .then(candidate => safeDestination(candidate))
    .catch(() => null)
  const providerDocumentRequest = page.context().waitForEvent('request', {
    timeout: timeoutMs,
    predicate: request => request.isNavigationRequest() && Boolean(safeProviderNavigationUrl(request.url())),
  }).then(request => safeProviderNavigationUrl(request.url())).catch(() => null)
  if (target) await target.click({ noWaitAfter: true }).catch(() => undefined)
  else if (providerLink?.href) await page.goto(providerLink.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => undefined)
  let destination = await Promise.race([popupPromise, contextPagePromise, samePagePromise, providerDocumentRequest])
  if (typeof destination === 'string') {
    await page.goto(destination, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => undefined)
    const currentUrl = safeExternalProviderHandoffUrl(page.url())
    destination = currentUrl ? { page, url: currentUrl } : null
  }
  if (!destination) {
    const newlyOpenedPages = page.context().pages().filter(candidate => !existingPages.has(candidate))
    for (const candidate of newlyOpenedPages) {
      destination = await safeDestination(candidate)
      if (destination) break
    }
  }
  if (!destination) return null
  await destination.page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => undefined)
  const url = safeExternalProviderHandoffUrl(destination.page.url())
  return url ? { url, provider } : null
}

export async function resumeFlightSelection(
  input: FlightSearchInput,
  options: FlightOption[],
  optionId: string,
): Promise<FlightSelectionResult> {
  const normalized = normalizeFlightSearchInput(input)
  const selectedOption = options.find(option => option.id === optionId)
  if (!selectedOption) {
    throw new BrowserExecutionError(
      'flight_option_invalid',
      'That flight option does not belong to this search.',
      false,
    )
  }
  if (!flightOptionSatisfiesConstraints(selectedOption, normalized)) {
    throw new BrowserExecutionError(
      'flight_option_invalid',
      'That flight option no longer satisfies the requested flight constraints.',
      false,
    )
  }

  const selectionTrace: FlightSelectionTraceEvent[] = []
  let selectedReturnOption: FlightOption | undefined
  try {
    return await withBrowser(async (_browser, page) => {
    await openFlightSearch(page, selectedOption.searchUrl)
    traceEvent(selectionTrace, 'selection_started', {
      optionId, searchUrl: selectedOption.searchUrl, tripType: normalized.returnDate ? 'round_trip' : 'one_way',
      constraints: { maxStops: normalized.maxStops, cabin: normalized.cabin, originCode: normalized.originCode, destinationCode: normalized.destinationCode },
    })
    const selectedOutboundOption = await activateFlightOption(
      page,
      normalized,
      selectedOption,
      normalized.returnDate ? 'returning_flights' : 'booking_options',
      selectionTrace,
    )

    if (normalized.returnDate) {
      const returnDate = normalized.returnDate
      const returnInput = { ...normalized, departureDate: returnDate, returnDate: null }
      const returnCards = page.locator('li:visible, [role="listitem"]:visible')
      const texts = await returnCards.allInnerTexts()
      const parsed = texts
        .map(text => parseGoogleFlightListItem(text, normalized.currency, selectedOption.searchUrl, returnInput))
        .filter((option): option is Omit<FlightOption, 'label'> => Boolean(option))
        .filter(option => flightOptionSatisfiesConstraints(option, returnInput))
      const returnOption = parsed.find(option => option.airline === selectedOutboundOption.airline) ?? parsed[0]
      if (!returnOption) throw new BrowserExecutionError('return_flight_unavailable', 'The matching return flight is no longer available.', false)
      selectedReturnOption = { ...returnOption, label: 'Also worth considering' }
      selectedReturnOption = await activateFlightOption(page, returnInput, selectedReturnOption, 'booking_options', selectionTrace)
    }
    await page.waitForURL(
      url => url.hostname === 'www.google.com' && url.pathname.startsWith('/travel/flights/booking'),
      { timeout: 25_000 },
    )
    const handoffUrl = page.url()
    const safeUrl = new URL(handoffUrl)
    if (safeUrl.protocol !== 'https:' || safeUrl.hostname !== 'www.google.com') {
      throw new BrowserExecutionError(
        'unsafe_payment_handoff',
        'The booking handoff did not remain on the allowed flight domain.',
        false,
      )
    }
    let providerEvidence: PublicProviderItineraryEvidence | undefined
    let providerHandoff: { url: string; provider: string } | null = null
    try {
      providerHandoff = await continueToProviderBooking(page)
    } catch (error) {
      if (!(error instanceof BrowserExecutionError) || error.code !== 'flight_provider_handoff_unavailable') throw error
      traceEvent(selectionTrace, 'google_provider_handoff_unavailable', {
        reason: error.code,
        recovery: 'public_provider_fallback',
      })
    }
    if (!providerHandoff) {
      const fallback = await continueToKissAndFlyBooking(
        page,
        normalized,
        selectedOutboundOption,
        selectedReturnOption,
        selectionTrace,
      )
      providerHandoff = { url: fallback.url, provider: fallback.provider }
      providerEvidence = fallback.evidence
    }
    const finalHandoffUrl = providerHandoff.url
    const finalHandoffProvider = providerHandoff.provider
    const finalHandoffStage = 'provider_booking' as const
    // Reaching Google Flights' booking page, or a verified HTTPS airline
    // booking page reached through Google's labelled handoff, is the payment
    // boundary. Never click a provider payment or purchase control.
    traceEvent(selectionTrace, 'handoff_verified', {
      stage: finalHandoffStage,
      provider: finalHandoffProvider,
      hostname: new URL(finalHandoffUrl).hostname,
      paymentBoundaryReached: true,
    })
    return {
      provider: 'Google Flights',
      selectedOption: selectedOutboundOption,
      ...(selectedReturnOption ? { selectedReturnOption } : {}),
      handoffUrl: finalHandoffUrl,
      handoffProvider: finalHandoffProvider,
      handoffStage: finalHandoffStage,
      observedAt: new Date().toISOString(),
      paymentBoundaryReached: true,
      resumable: true,
      selectionTrace,
      ...(providerEvidence ? { providerEvidence } : {}),
    }
    })
  } catch (error) {
    if (isRecoverableFlightReadError(error)) {
      const recoveryCode = error instanceof BrowserExecutionError ? error.code : 'browser_worker_timeout'
      traceEvent(selectionTrace, 'google_selection_recovery', {
        reason: recoveryCode,
        recovery: 'public_provider_fallback',
      })
      const fallback = await withBrowser(async (_browser, page) =>
        continueToKissAndFlyBooking(
          page,
          normalized,
          selectedOption,
          selectedReturnOption,
          selectionTrace,
        ),
      )
      const fallbackReturnOption = normalized.returnDate && fallback.evidence.legs[1]
        ? providerLegAsFlightOption(fallback.evidence.legs[1], fallback.evidence, `${selectedOption.id}-return`)
        : undefined
      return {
        provider: 'Google Flights' as const,
        selectedOption,
        ...(fallbackReturnOption ? { selectedReturnOption: fallbackReturnOption } : {}),
        handoffUrl: fallback.url,
        handoffProvider: fallback.provider,
        handoffStage: 'provider_booking' as const,
        observedAt: new Date().toISOString(),
        paymentBoundaryReached: true as const,
        resumable: true as const,
        selectionTrace,
        providerEvidence: fallback.evidence,
      }
    }
    if (error instanceof BrowserExecutionError) {
      error.details = { ...(error.details ?? {}), selectionTrace }
    }
    throw error
  }
}
