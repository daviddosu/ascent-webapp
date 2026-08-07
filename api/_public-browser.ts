import chromium from '@sparticuz/chromium'
import { access } from 'node:fs/promises'
import { isIP } from 'node:net'
import { chromium as playwright, type Browser, type Locator, type Page } from 'playwright-core'
import { BrowserExecutionError } from './_flight-browser.js'

export type PublicBrowserAction = {
  action: 'click' | 'type' | 'select' | 'upload' | 'scroll' | 'wait'
  target: string
  value: string | null
}

export type PublicBrowserState = {
  entryUrl: string
  currentUrl: string
  actions: PublicBrowserAction[]
  observation: PublicBrowserObservation
  lastEvidence?: Record<string, unknown>
}

export type PublicBrowserObservation = {
  title: string
  url: string
  headings: string[]
  text: string
  links: Array<{ text: string; href: string }>
  controls: Array<{ label: string; kind: string }>
  fields: Array<{ name: string; label: string; type: string; value: string; checked: boolean; fileName: string | null }>
  untrustedExternalContent: true
}

const sensitivePattern = /\b(?:password|passcode|otp|one[- ]?time|card|credit|debit|cvv|cvc|security code|account number|routing|bank|ssn|social security|passport)\b/i

function benchmarkModeEnabled() {
  return process.env.SHOTCOUNT_BENCHMARK_MODE === 'true' && process.env.NODE_ENV !== 'production'
}

async function executablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH
  if (process.platform === 'linux') return chromium.executablePath()
  const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  try {
    await access(macPath)
    return macPath
  } catch {
    throw new BrowserExecutionError('browser_runtime_missing', 'The browser worker does not have a compatible Chromium runtime.', false)
  }
}

async function launchBrowser() {
  const benchmark = benchmarkModeEnabled()
  return playwright.launch({
    executablePath: await executablePath(),
    headless: true,
    args: [
      ...(process.platform === 'linux' ? chromium.args : []),
      ...(benchmark ? ['--ignore-certificate-errors', '--host-resolver-rules=MAP benchmark.test 127.0.0.1'] : []),
    ],
  })
}

function normalizedAllowedDomains(domains: unknown) {
  if (!Array.isArray(domains)) return []
  return domains
    .map(value => String(value).trim().toLocaleLowerCase())
    .filter(value => /^[a-z0-9.-]+$/.test(value) && !value.includes('..'))
}

export function allowedPublicUrl(raw: string, domains: unknown) {
  const allowed = normalizedAllowedDomains(domains)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BrowserExecutionError('browser_url_invalid', 'The browser destination is not a valid URL.', false)
  }
  const hostname = url.hostname.toLocaleLowerCase()
  const benchmarkFixture = benchmarkModeEnabled() && hostname === 'benchmark.test'
  if (
    (url.protocol !== 'https:' && !benchmarkFixture) ||
    Boolean(url.username || url.password) ||
    (hostname === 'benchmark.test' && !benchmarkFixture) ||
    (isIP(hostname) !== 0 && !benchmarkFixture) ||
    (hostname === 'localhost' && !benchmarkFixture) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    !allowed.includes(hostname)
  ) {
    throw new BrowserExecutionError('browser_domain_not_allowed', 'The browser destination is outside this task’s HTTPS domain allowlist.', false)
  }
  return url
}

function safePublicResource(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') return true
  if (url.protocol !== 'https:') return false
  const hostname = url.hostname.toLocaleLowerCase()
  const benchmarkFixture = benchmarkModeEnabled() && hostname === 'benchmark.test'
  return !url.username &&
    !url.password &&
    (hostname !== 'benchmark.test' || benchmarkFixture) &&
    isIP(hostname) === 0 &&
    (hostname.includes('.') || benchmarkFixture) &&
    (hostname !== 'localhost' || benchmarkFixture) &&
    !hostname.endsWith('.localhost') &&
    !hostname.endsWith('.local') &&
    !hostname.endsWith('.internal') &&
    !hostname.endsWith('.lan') &&
    !hostname.endsWith('.home') &&
    !hostname.endsWith('.corp')
}

async function installRequestGuard(page: Page, domains: unknown) {
  await page.route('**/*', async route => {
    const request = route.request()
    const url = request.url()
    try {
      if (request.resourceType() === 'document') allowedPublicUrl(url, domains)
      else if (!safePublicResource(url)) throw new Error('blocked')
      await route.continue()
    } catch {
      await route.abort('blockedbyclient')
    }
  })
}

async function assertPageAllowed(page: Page, domains: unknown) {
  allowedPublicUrl(page.url(), domains)
}

async function observe(page: Page): Promise<PublicBrowserObservation> {
  return page.evaluate(() => {
    const clean = (value: string | null | undefined, maximum: number) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
    const visible = (element: Element) => {
      const html = element as HTMLElement
      return html.offsetWidth > 0 && html.offsetHeight > 0
    }
    const headings = [...document.querySelectorAll('h1,h2,h3')]
      .filter(visible)
      .map(element => clean(element.textContent, 240))
      .filter(Boolean)
      .slice(0, 20)
    const links = [...document.querySelectorAll('a[href]')]
      .filter(visible)
      .map(element => ({
        text: clean(element.textContent, 240),
        href: clean((element as HTMLAnchorElement).href, 2000),
      }))
      .filter(link => link.text && link.href.startsWith('https://'))
      .slice(0, 20)
    const controls = [...document.querySelectorAll('input,textarea,select,button')]
      .filter(visible)
      .map(element => {
        const control = element as HTMLInputElement
        const idLabel = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent : ''
        const wrappedLabel = control.closest('label')?.textContent
        return {
          label: clean(control.getAttribute('aria-label') || idLabel || wrappedLabel || control.placeholder || control.textContent, 240),
          kind: clean(`${control.tagName.toLocaleLowerCase()}:${control.type || ''}`, 80),
        }
      })
      .filter(control => control.label)
      .slice(0, 20)
    const fields = [...document.querySelectorAll('input,textarea,select')]
      .filter(visible)
      .map(element => {
        const control = element as HTMLInputElement
        const label = clean(control.getAttribute('aria-label') || control.labels?.[0]?.textContent || control.placeholder || control.name, 240)
        const fileName = control.type === 'file' ? control.files?.[0]?.name ?? null : null
        return {
          name: clean(control.name, 160),
          label,
          type: clean(control.type || control.tagName.toLocaleLowerCase(), 80),
          value: control.type === 'password' || /otp|passcode|verification|security/i.test(`${control.name} ${label}`) ? '' : clean(control.value, 1_000),
          checked: Boolean(control.checked),
          fileName,
        }
      })
      .filter(field => field.name || field.label)
      .slice(0, 40)
    return {
      title: clean(document.title, 300),
      url: location.href,
      headings,
      text: clean(document.body?.innerText, 4000),
      links,
      controls,
      fields,
      untrustedExternalContent: true as const,
    }
  })
}

async function targetLocator(page: Page, target: string): Promise<Locator> {
  const value = target.trim()
  if (value.startsWith('label:')) return page.getByLabel(value.slice(6).trim(), { exact: true })
  if (value.startsWith('text:')) return page.getByText(value.slice(5).trim(), { exact: true })
  if (value.startsWith('css:')) {
    const selector = value.slice(4).trim()
    if (!selector || selector.length > 500 || /:has\(|javascript:/i.test(selector)) {
      throw new BrowserExecutionError('browser_target_invalid', 'The browser target is not supported.', false)
    }
    return page.locator(selector)
  }
  if (value.startsWith('role:')) {
    const parts = value.split(':')
    const role = parts.shift() && parts.shift()
    const name = parts.join(':').trim()
    if (!role || !name) throw new BrowserExecutionError('browser_target_invalid', 'The browser role target is incomplete.', false)
    return page.getByRole(role as never, { name, exact: true })
  }
  return page.getByText(value, { exact: true })
}

async function uniqueTarget(page: Page, target: string) {
  const locator = await targetLocator(page, target)
  const count = await locator.count()
  if (count !== 1) {
    throw new BrowserExecutionError(
      count ? 'browser_target_ambiguous' : 'browser_target_missing',
      count ? 'The browser target matched more than one element.' : 'The browser target is no longer available.',
      true,
    )
  }
  return locator
}

async function assertNonSensitive(page: Page, locator: Locator, target: string, value: string | null) {
  const metadata = await locator.evaluate(element => {
    const input = element as HTMLInputElement
    return {
      type: input.type || '',
      name: input.name || '',
      autocomplete: input.autocomplete || '',
      label: input.getAttribute('aria-label') || input.placeholder || input.closest('label')?.textContent || '',
    }
  })
  const benchmarkSyntheticCredential = benchmarkModeEnabled() &&
    new URL(page.url()).hostname === 'benchmark.test' &&
    /^benchmark-(?:password|otp|code)-/i.test(value ?? '')
  if (
    metadata.type === 'password' ||
    sensitivePattern.test([target, value ?? '', metadata.name, metadata.autocomplete, metadata.label].join(' '))
  ) {
    if (benchmarkSyntheticCredential) return
    throw new BrowserExecutionError('browser_sensitive_field_blocked', 'ShotCount will not enter credentials, payment data, or private identifiers.', false)
  }
}

type FileMaterializer = (assetId: string) => Promise<{ name: string; mimeType: string; buffer: Buffer; checksum?: string }>

async function applyAction(page: Page, action: PublicBrowserAction, domains: unknown, replay = false, materialize?: FileMaterializer) {
  if (action.action === 'wait') {
    const requested = Number(action.value ?? 500)
    await page.waitForTimeout(Number.isFinite(requested) ? Math.min(3000, Math.max(100, requested)) : 500)
    return
  }
  if (action.action === 'scroll') {
    const requested = Number(action.value ?? 600)
    const amount = Number.isFinite(requested) ? Math.min(1200, Math.max(-1200, requested)) : 600
    await page.evaluate(value => window.scrollBy({ top: value, behavior: 'auto' }), amount)
    return
  }
  let locator = await uniqueTarget(page, action.target)
  if (action.action === 'upload') {
    if (!materialize || !action.value) throw new BrowserExecutionError('browser_file_materialisation_missing', 'The private file could not be materialised for upload.', false)
    let metadata = await locator.evaluate(element => ({ tag: element.tagName.toLocaleLowerCase(), type: (element as HTMLInputElement).type }))
    if (metadata.tag !== 'input' || metadata.type !== 'file') {
      const nested = locator.locator('input[type="file"]')
      if (await nested.count() !== 1) throw new BrowserExecutionError('browser_upload_target_invalid', 'The upload target does not contain one file input.', false)
      locator = nested
      metadata = { tag: 'input', type: 'file' }
    }
    const file = await materialize(action.value)
    await locator.setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: file.buffer })
    const evidence = await locator.evaluate(element => {
      const input = element as HTMLInputElement
      const uploaded = input.files?.[0]
      return uploaded ? { filename: uploaded.name, size: uploaded.size, populated: input.files?.length === 1 } : null
    })
    if (!evidence?.populated || evidence.filename !== file.name) throw new BrowserExecutionError('browser_upload_unverified', 'The page did not acknowledge the uploaded document.', true)
    return { kind: 'file_upload', asset_id: action.value, checksum: file.checksum ?? null, ...evidence }
  } else if (action.action === 'type') {
    await assertNonSensitive(page, locator, action.target, action.value)
    await locator.fill(action.value ?? '')
  } else if (action.action === 'select') {
    await assertNonSensitive(page, locator, action.target, action.value)
    await locator.selectOption(action.value ?? '')
  } else {
    const metadata = await locator.evaluate(element => ({
      tag: element.tagName.toLocaleLowerCase(),
      type: (element as HTMLButtonElement).type || '',
      href: (element as HTMLAnchorElement).href || '',
    }))
    if (metadata.tag !== 'a' || !metadata.href) {
      throw new BrowserExecutionError('browser_click_requires_submit', 'Only safe navigation links can be clicked automatically. Form buttons require approval.', false)
    }
    allowedPublicUrl(metadata.href, domains)
    await locator.click()
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)
    await assertPageAllowed(page, domains)
  }
  if (!replay) await assertPageAllowed(page, domains)
}

async function restore(page: Page, state: PublicBrowserState, domains: unknown, materialize?: FileMaterializer) {
  const url = allowedPublicUrl(state.entryUrl || state.currentUrl, domains)
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await assertPageAllowed(page, domains)
  for (const action of state.actions.slice(0, 30)) await applyAction(page, action, domains, true, materialize)
}

export async function navigatePublicPage(rawUrl: string, domains: unknown) {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await installRequestGuard(page, domains)
    const url = allowedPublicUrl(rawUrl, domains)
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await assertPageAllowed(page, domains)
    const observation = await observe(page)
    return { entryUrl: url.toString(), currentUrl: page.url(), actions: [], observation } satisfies PublicBrowserState
  } finally {
    await browser.close()
  }
}

export async function actOnPublicPage(state: PublicBrowserState, action: PublicBrowserAction, domains: unknown, materialize?: FileMaterializer) {
  if (state.actions.length >= 30) throw new BrowserExecutionError('browser_action_limit', 'This browser session reached its safe action limit.', false)
  const browser: Browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await installRequestGuard(page, domains)
    await restore(page, state, domains, materialize)
    const evidence = await applyAction(page, action, domains, false, materialize)
    const observation = await observe(page)
    return {
      entryUrl: state.entryUrl || state.currentUrl,
      currentUrl: page.url(),
      actions: [...state.actions, action],
      observation,
      ...(evidence ? { lastEvidence: evidence } : {}),
    } satisfies PublicBrowserState
  } finally {
    await browser.close()
  }
}

export async function submitPublicPage(state: PublicBrowserState, target: string, domains: unknown, materialize?: FileMaterializer) {
  const browser: Browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await installRequestGuard(page, domains)
    // Uploads are part of the resumable browser state. Re-materialise them
    // before an approved submit so a worker restart cannot silently lose a
    // valid document or report a false submission state.
    await restore(page, state, domains, materialize)
    const before = await observe(page)
    const locator = await uniqueTarget(page, target)
    const metadata = await locator.evaluate(element => ({
      tag: element.tagName.toLocaleLowerCase(),
      type: (element as HTMLButtonElement).type || '',
      text: element.textContent || '',
    }))
    if (
      sensitivePattern.test(`${target} ${metadata.text}`) ||
      !((metadata.tag === 'button' && metadata.type === 'submit') || (metadata.tag === 'input' && metadata.type === 'submit'))
    ) {
      throw new BrowserExecutionError('browser_submit_target_invalid', 'The approved browser submission target is not a safe form submit control.', false)
    }
    await locator.click()
    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined)
    await assertPageAllowed(page, domains)
    const observation = await observe(page)
    const confirmationObserved = before.url !== observation.url || before.text !== observation.text
    return {
      state: {
        entryUrl: state.entryUrl || state.currentUrl,
        currentUrl: page.url(),
        actions: state.actions,
        observation,
      } satisfies PublicBrowserState,
      submitted: true,
      confirmationObserved,
    }
  } finally {
    await browser.close()
  }
}
