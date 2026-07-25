import chromium from '@sparticuz/chromium'
import { createHash } from 'node:crypto'
import { access } from 'node:fs/promises'
import { isIP } from 'node:net'
import { chromium as playwright, type Browser, type Page } from 'playwright-core'

export type FlightSearchInput = {
  originCode: string
  destinationCode: string
  departureDate: string
  returnDate: string
  cabin: 'economy' | 'premium_economy' | 'business' | 'first'
  maxStops: 0 | 1 | 2
  budgetAmount: number | null
  currency: 'USD' | 'GBP' | 'EUR' | 'NGN'
  preferredAirlines: string[]
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
  handoffUrl: string
  handoffProvider: string
  handoffStage: 'provider_booking' | 'google_booking_options'
  observedAt: string
  paymentBoundaryReached: true
  resumable: true
}

export class BrowserExecutionError extends Error {
  code: string
  retryable: boolean

  constructor(code: string, message: string, retryable = true) {
    super(message)
    this.name = 'BrowserExecutionError'
    this.code = code
    this.retryable = retryable
  }
}

const currencyPattern = /(?:[$£€]\s?[\d,.]+|(?:USD|GBP|EUR|NGN)\s?[\d,.]+)/i
const durationPattern = /\b(?:(\d+)\s*hr)?(?:\s*(\d+)\s*min)?\b/i

function normalizedLines(text: string) {
  return text
    .replaceAll('\u00a0', ' ')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function priceAmount(price: string) {
  const value = price.replace(/[^\d.,]/g, '').replaceAll(',', '')
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : Number.NaN
}

function durationInMinutes(value: string) {
  const match = value.match(durationPattern)
  if (!match) return Number.NaN
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const total = hours * 60 + minutes
  return total > 0 ? total : Number.NaN
}

function stableOptionId(option: Omit<FlightOption, 'id' | 'label' | 'searchUrl' | 'provider'>) {
  return createHash('sha256')
    .update([
      option.airline,
      option.departureTime,
      option.arrivalTime,
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
  const cabin = input.cabin.replaceAll('_', ' ')
  const query = [
    `Flights from ${input.originCode} to ${input.destinationCode}`,
    `on ${input.departureDate}`,
    `returning ${input.returnDate}`,
    cabin,
  ].join(' ')
  const url = new URL('https://www.google.com/travel/flights')
  url.searchParams.set('q', query)
  url.searchParams.set('curr', input.currency)
  url.searchParams.set('hl', 'en')
  return url.toString()
}

export function parseGoogleFlightListItem(
  text: string,
  currency: FlightSearchInput['currency'],
  searchUrl: string,
): Omit<FlightOption, 'label'> | null {
  const lines = normalizedLines(text)
  const durationIndex = lines.findIndex(line => /\b\d+\s*hr\b|\b\d+\s*min\b/i.test(line))
  const routeIndex = lines.findIndex(line => /\b[A-Z]{3}\s*[–-]\s*[A-Z]{3}\b/.test(line))
  const stopsIndex = lines.findIndex(line => /^(?:Nonstop|\d+\s+stops?)$/i.test(line))
  const priceIndex = lines.findIndex(line => currencyPattern.test(line))
  const times = lines.filter(line => /^\d{1,2}:\d{2}\s*(?:AM|PM)(?:\+\d+)?$/i.test(line))
  if (
    durationIndex < 1 ||
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
  const stopCount = /^Nonstop$/i.test(stops)
    ? 0
    : Number(stops.match(/\d+/)?.[0] ?? Number.NaN)
  if (!Number.isFinite(stopCount)) return null

  const base = {
    airline: lines[durationIndex - 1]!,
    departureTime: times[0]!,
    arrivalTime: times[1]!,
    duration,
    durationMinutes,
    route: lines[routeIndex]!.replace(/\s+/g, ''),
    stops,
    stopCount,
    price,
    amount,
    currency,
  }
  return {
    id: stableOptionId(base),
    ...base,
    provider: 'Google Flights',
    searchUrl,
  }
}

export function rankFlightOptions(
  listItemTexts: string[],
  input: FlightSearchInput,
  searchUrl = buildGoogleFlightsUrl(input),
) {
  const parsed = listItemTexts
    .map(text => parseGoogleFlightListItem(text, input.currency, searchUrl))
    .filter((option): option is Omit<FlightOption, 'label'> => Boolean(option))
    .filter(option => option.stopCount <= input.maxStops)
  const unique = [...new Map(parsed.map(option => [option.id, option])).values()]
  if (!unique.length) return []

  const preferred = input.preferredAirlines.map(airline => airline.toLocaleLowerCase())
  const withinBudget = input.budgetAmount === null
    ? unique
    : unique.filter(option => option.amount <= input.budgetAmount!)
  const eligible = withinBudget.length ? withinBudget : unique
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
  await page.waitForFunction(
    () => [...document.querySelectorAll('li')].some(element =>
      /(?:[$£€]\s?[\d,.]+|(?:USD|GBP|EUR|NGN)\s?[\d,.]+)/i.test(
        (element as HTMLElement).innerText ?? '',
      )
    ),
    undefined,
    { timeout: 25_000 },
  )
}

async function withBrowser<T>(operation: (browser: Browser, page: Page) => Promise<T>) {
  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'UTC',
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    return await operation(browser, page)
  } finally {
    await browser.close().catch(() => undefined)
  }
}

export async function runLiveFlightSearch(input: FlightSearchInput): Promise<FlightSearchResult> {
  const searchUrl = buildGoogleFlightsUrl(input)
  return withBrowser(async (_browser, page) => {
    await openFlightSearch(page, searchUrl)
    const listItemTexts = await page.locator('li').allInnerTexts()
    const options = rankFlightOptions(listItemTexts, input, searchUrl)
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

async function flightListItem(page: Page, option: FlightOption) {
  const exact = page.locator('li:visible')
    .filter({ hasText: option.airline })
    .filter({ hasText: option.price })
    .filter({ hasText: option.duration })
  if (await exact.count()) return exact.first()

  const changed = page.locator('li:visible')
    .filter({ hasText: option.airline })
    .filter({ hasText: option.duration })
  if (await changed.count()) {
    throw new BrowserExecutionError(
      'flight_price_or_schedule_changed',
      'This flight changed since the search. Run the search again before continuing.',
      false,
    )
  }
  throw new BrowserExecutionError(
    'flight_sold_out',
    'This flight is no longer available. Run the search again for current options.',
    false,
  )
}

async function activateFlightCard(
  page: Page,
  item: ReturnType<Page['locator']>,
  expectedText: string,
) {
  const selectLink = item.getByRole('link', { name: /Select flight/i })
  if (await selectLink.count()) {
    await selectLink.first().evaluate(element => (element as HTMLElement).click())
  }
  else await item.click()
  const ready = (text: string) =>
    text === 'Booking options'
      ? window.location.pathname.startsWith('/travel/flights/booking')
      : document.body.innerText.includes(text)
  try {
    await page.waitForFunction(
      ready,
      expectedText,
      { timeout: 5_000 },
    )
    return
  } catch {
    const select = page.locator('button[aria-label="Select flight"]')
    if (!await select.count()) {
      throw new BrowserExecutionError(
        'flight_selection_failed',
        'Google Flights did not expose a selectable itinerary.',
      )
    }
    await select.first().evaluate(element => (element as HTMLElement).click())
    await page.waitForFunction(
      ready,
      expectedText,
      { timeout: 20_000 },
    )
  }
}

function providerHandoffUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLocaleLowerCase()
    return url.protocol === 'https:' &&
      !isIP(hostname) &&
      hostname !== 'localhost' &&
      hostname !== 'www.google.com' &&
      !hostname.endsWith('.google.com')
  } catch {
    return false
  }
}

async function continueToProviderBooking(page: Page) {
  const airlineOption = page.getByRole('button', {
    name: /Continue to book with .* airline/i,
  })
  const anyOption = page.getByRole('button', {
    name: /Continue to book with/i,
  })
  await anyOption.first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined)
  const button = await airlineOption.count() ? airlineOption.first() : anyOption.first()
  if (!await button.count()) return null

  const label = await button.getAttribute('aria-label') ?? ''
  const provider = label
    .replace(/^Continue to book with\s+/i, '')
    .replace(/\s+airline\b.*$/i, '')
    .replace(/\s+for\s+[\d,.]+\s+.*$/i, '')
    .trim()
    .slice(0, 120) || 'Airline'
  const popupPromise = page.waitForEvent('popup', { timeout: 15_000 }).catch(() => null)
  const samePagePromise = page.waitForURL(
    url => providerHandoffUrl(url.toString()),
    { timeout: 15_000 },
  ).then(() => page).catch(() => null)
  await button.click()
  const target = await Promise.race([popupPromise, samePagePromise])
  if (!target) return null
  await target.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined)
  if (!providerHandoffUrl(target.url())) {
    await target.waitForURL(
      url => providerHandoffUrl(url.toString()),
      { timeout: 20_000 },
    ).catch(() => undefined)
  }
  return providerHandoffUrl(target.url())
    ? { url: target.url(), provider }
    : null
}

export async function resumeFlightSelection(
  input: FlightSearchInput,
  options: FlightOption[],
  optionId: string,
): Promise<FlightSelectionResult> {
  const selectedOption = options.find(option => option.id === optionId)
  if (!selectedOption) {
    throw new BrowserExecutionError(
      'flight_option_invalid',
      'That flight option does not belong to this search.',
      false,
    )
  }

  return withBrowser(async (_browser, page) => {
    await openFlightSearch(page, selectedOption.searchUrl)
    const outbound = await flightListItem(page, selectedOption)
    const liveOutbound = parseGoogleFlightListItem(
      await outbound.innerText(),
      input.currency,
      selectedOption.searchUrl,
    )
    if (!liveOutbound || liveOutbound.amount !== selectedOption.amount) {
      throw new BrowserExecutionError(
        'flight_price_changed',
        'The flight price changed since the search. Review fresh options before continuing.',
        false,
      )
    }
    await activateFlightCard(page, outbound, 'Returning flights')

    const returnCandidates = page.locator('li:visible')
      .filter({ hasText: selectedOption.airline })
      .filter({ hasText: selectedOption.price })
    const returnFlight = await returnCandidates.count()
      ? returnCandidates.first()
      : page.locator('li:visible').filter({ hasText: currencyPattern }).first()
    if (!await returnFlight.count()) {
      throw new BrowserExecutionError(
        'return_flight_unavailable',
        'The matching return flight is no longer available.',
        false,
      )
    }
    await activateFlightCard(page, returnFlight, 'Booking options')
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
    const providerHandoff = await continueToProviderBooking(page).catch(() => null)
    return {
      provider: 'Google Flights',
      selectedOption,
      handoffUrl: providerHandoff?.url ?? handoffUrl,
      handoffProvider: providerHandoff?.provider ?? 'Google Flights',
      handoffStage: providerHandoff ? 'provider_booking' : 'google_booking_options',
      observedAt: new Date().toISOString(),
      paymentBoundaryReached: true,
      resumable: true,
    }
  })
}
