import chromium from '@sparticuz/chromium'
import { createHash } from 'node:crypto'
import { access } from 'node:fs/promises'
import { chromium as playwright, type Browser, type Page } from 'playwright-core'

export type FlightSearchInput = {
  originCode: string
  destinationCode: string
  departureDate: string
  returnDate: string | null
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
  selectionTrace: FlightSelectionTraceEvent[]
}

export type FlightSelectionTraceEvent = {
  stage: string
  at: string
  details: Record<string, unknown>
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
    ...(input.returnDate ? [`returning ${input.returnDate}`] : ['one way']),
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

export const maxSharedBrowserUses = 1

export function isRecoverableBrowserRuntimeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /target page, context or browser has been closed|browser has been closed|err_insufficient_resources|browsercontext\.newpage|page\.goto/i.test(message)
}

export function isRecoverableFlightReadError(error: unknown) {
  return error instanceof BrowserExecutionError &&
    error.retryable &&
    ['flight_results_timeout'].includes(error.code)
}

export function shouldReloadFlightResults(bodyText: string) {
  return /Oops, something went wrong\.|No results returned\./i.test(bodyText)
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
    if (listItems.some(text => currencyPattern.test(text))) return
    const body = await page.locator('body').innerText().catch(() => '')
    if (shouldReloadFlightResults(body) && reloads < 2) {
      const reload = page.getByText('Reload', { exact: true })
      if (await reload.count()) {
        reloads += 1
        await reload.click({ noWaitAfter: true, timeout: 5_000 }).catch(() => undefined)
        await page.waitForTimeout(2_500)
        continue
      }
    }
    await page.waitForTimeout(750)
  }
  throw new BrowserExecutionError(
    'flight_results_timeout',
    'Google Flights took too long to return live options. Try again in a moment.',
  )
}

async function withBrowser<T>(operation: (browser: Browser, page: Page) => Promise<T>) {
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
  const searchUrl = buildGoogleFlightsUrl(input)
  return withBrowser(async (_browser, page) => {
    await openFlightSearch(page, searchUrl)
    const listItemTexts = await page.locator('li, [role="listitem"]').allInnerTexts()
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
    const option = parseGoogleFlightListItem(text, input.currency, searchUrl)
    if (!option || option.stopCount > input.maxStops || seen.has(option.id)) continue
    seen.add(option.id)
    candidates.push({ index, option, score: flightOptionMatchScore(option, expected) })
  }
  return { cards, candidates }
}

async function expectedFlightStageReady(page: Page, expectedStage: 'returning_flights' | 'booking_options') {
  if (expectedStage === 'booking_options') {
    return new URL(page.url()).pathname.startsWith('/travel/flights/booking')
  }
  return page.getByText(/Returning flights/i).count().then(count => count > 0).catch(() => false)
}

async function waitForFlightStage(page: Page, expectedStage: 'returning_flights' | 'booking_options', timeout: number) {
  await page.waitForFunction(
    stage => stage === 'booking_options'
      ? window.location.pathname.startsWith('/travel/flights/booking')
      : /Returning flights/i.test(document.body.innerText),
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
      return
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
    if (!target) throw new BrowserExecutionError('flight_selection_failed', 'Google Flights did not expose a selectable itinerary.')
    traceEvent(trace, 'selection_target', { attempt, target: target.name })
    await target.locator.click({ force: target.name !== 'select_button', noWaitAfter: true }).catch(error => {
      traceEvent(trace, 'stale_or_changed_target', { attempt, target: target.name, message: String(error).slice(0, 240) })
    })
    try {
      await waitForFlightStage(page, expectedStage, attempt === maximumFlightSelectionAttempts ? 20_000 : 10_000)
      traceEvent(trace, 'post_click_state', { attempt, expectedStage, url: page.url(), recovered: attempt > 1 })
      return
    } catch (error) {
      traceEvent(trace, 'selection_retry', { attempt, reason: String(error).slice(0, 240), url: page.url() })
      if (attempt < maximumFlightSelectionAttempts && !page.url().startsWith('https://www.google.com/travel/flights')) {
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

  const selectionTrace: FlightSelectionTraceEvent[] = []
  try {
    return await withBrowser(async (_browser, page) => {
    await openFlightSearch(page, selectedOption.searchUrl)
    traceEvent(selectionTrace, 'selection_started', {
      optionId, searchUrl: selectedOption.searchUrl, tripType: input.returnDate ? 'round_trip' : 'one_way',
      constraints: { maxStops: input.maxStops, cabin: input.cabin, originCode: input.originCode, destinationCode: input.destinationCode },
    })
    await activateFlightOption(
      page,
      input,
      selectedOption,
      input.returnDate ? 'returning_flights' : 'booking_options',
      selectionTrace,
    )

    if (input.returnDate) {
      const returnCards = page.locator('li:visible, [role="listitem"]:visible')
      const texts = await returnCards.allInnerTexts()
      const parsed = texts.map(text => parseGoogleFlightListItem(text, input.currency, selectedOption.searchUrl)).filter((option): option is Omit<FlightOption, 'label'> => Boolean(option))
      const returnOption = parsed.find(option => option.airline === selectedOption.airline && option.stopCount <= input.maxStops) ?? parsed.find(option => option.stopCount <= input.maxStops)
      if (!returnOption) throw new BrowserExecutionError('return_flight_unavailable', 'The matching return flight is no longer available.', false)
      await activateFlightOption(page, input, { ...returnOption, label: 'Also worth considering' }, 'booking_options', selectionTrace)
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
    // Reaching Google Flights' booking page is the verified payment boundary.
    // Do not wait for (or follow) an airline's own checkout transition: it is
    // both variable across providers and beyond Roon's authorised scope.
    traceEvent(selectionTrace, 'handoff_verified', {
      stage: 'google_booking_options',
      provider: 'Google Flights',
      hostname: new URL(handoffUrl).hostname,
      paymentBoundaryReached: true,
    })
    return {
      provider: 'Google Flights',
      selectedOption,
      handoffUrl,
      handoffProvider: 'Google Flights',
      handoffStage: 'google_booking_options',
      observedAt: new Date().toISOString(),
      paymentBoundaryReached: true,
      resumable: true,
      selectionTrace,
    }
    })
  } catch (error) {
    if (error instanceof BrowserExecutionError) {
      error.details = { ...(error.details ?? {}), selectionTrace }
    }
    throw error
  }
}
