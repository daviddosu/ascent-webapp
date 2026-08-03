import { isIP } from 'node:net'
import type { Frame, Locator, Page } from 'playwright-core'
import { BrowserExecutionError, safeExternalProviderHandoffUrl } from './_flight-browser.js'

export type FlightCheckoutTraveler = {
  traveler_type: 'adult' | 'child' | 'infant'
  title: string | null
  given_name: string
  middle_name: string | null
  family_name: string
  date_of_birth: string
  gender: string | null
  nationality: string | null
  residence_country: string | null
  document_type: 'passport' | 'national_id' | null
  document_number: string | null
  document_issuing_country: string | null
  document_expiry: string | null
}

export type FlightCheckoutInput = {
  travelers: FlightCheckoutTraveler[]
  contact_email: string
  contact_phone: string
}

export type FlightCheckoutResult = {
  provider: string
  handoffUrl: string
  currentUrl: string
  paymentBoundaryReached: true
  checkoutStage: 'payment'
  preparedFields: string[]
  preparedTravelerCount: number
  steps: number
  observedControls: string[]
}

type CheckoutFieldKind =
  | 'title'
  | 'full_name'
  | 'given_name'
  | 'middle_name'
  | 'family_name'
  | 'date_of_birth'
  | 'date_of_birth_day'
  | 'date_of_birth_month'
  | 'date_of_birth_year'
  | 'gender'
  | 'nationality'
  | 'residence_country'
  | 'document_type'
  | 'document_number'
  | 'document_issuing_country'
  | 'document_expiry'
  | 'document_expiry_day'
  | 'document_expiry_month'
  | 'document_expiry_year'
  | 'contact_email'
  | 'contact_phone'
  | 'payment'
  | 'unknown'

type CheckoutFieldDescriptor = {
  surface: CheckoutSurface
  index: number
  tag: 'input' | 'select' | 'textarea' | 'contenteditable'
  type: string
  inputValue: string
  label: string
  name: string
  autocomplete: string
  groupKey: string
  required: boolean
  disabled: boolean
  explicitTravelerIndex: number | null
  unindexedOccurrence: number
  options: Array<{ value: string; label: string }>
  kind: CheckoutFieldKind
}

type CheckoutSurface = Page | Frame

const checkoutFieldSelector = 'input:visible, select:visible, textarea:visible, [contenteditable="true"]:visible'

const paymentControlPattern = /(?:cc[-_ ]?(?:number|name|expiry|expiration|cvc|cvv)|card|credit|debit|cvv|cvc|security\s+(?:code|number)|billing|payment|paypal|klarna|affirm|afterpay)/i
const blockedAdvancePattern = /\b(?:pay|purchase|buy|reserve|book\s+now|complete\s+booking|confirm\s+booking|place\s+order|issue\s+ticket|submit\s+order|sign\s*in|log\s*in|create\s+account)\b/i
const safeAdvancePattern = /^(?:(?:continue|next|proceed|go\s+to)\b[\s\S]{0,120}|review(?:\s+and\s+continue)?(?:\s+[\s\S]{0,100})?)$/i
const providerHandoffControlPattern = /\b(?:continue\s+to\s+book(?:\s+with)?|book\s+with|view\s+(?:deal|offer)|visit\s+(?:site|airline))\b/i

function clean(value: unknown, maximum = 300) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function isStaleCheckoutDomError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /frame\s+was\s+detached|execution\s+context\s+was\s+destroyed|frame\s+.*detached|target\s+closed/i.test(message)
}

async function waitForFreshCheckoutDom(page: Page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined)
  await page.waitForTimeout(250)
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 20 && /^\+?[0-9().\s-]+$/.test(value)
}

function validDateOfBirth(value: string) {
  return validDate(value) && value <= new Date().toISOString().slice(0, 10)
}

function safeProfileString(value: unknown, maximum: number, required = false) {
  const result = clean(value, maximum)
  if (!required && !result) return null
  if (!result || /[\u0000-\u001f\u007f]/.test(result)) return null
  return result
}

export function normalizeFlightCheckoutInput(value: unknown): FlightCheckoutInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BrowserExecutionError('flight_checkout_input_invalid', 'Traveler details are not in the supported format.', false)
  }
  const input = value as Record<string, unknown>
  const travelers = Array.isArray(input.travelers) ? input.travelers : []
  const contactEmail = clean(input.contact_email, 320).toLocaleLowerCase()
  const contactPhone = clean(input.contact_phone, 80)
  if (!travelers.length || travelers.length > 9 || !validEmail(contactEmail) || !validPhone(contactPhone)) {
    throw new BrowserExecutionError('flight_checkout_input_invalid', 'A valid traveler list, contact email, and contact phone are required.', false)
  }

  const normalizedTravelers = travelers.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BrowserExecutionError('flight_checkout_input_invalid', `Traveler ${index + 1} is not in the supported format.`, false)
    }
    const traveler = item as Record<string, unknown>
    const travelerType = clean(traveler.traveler_type, 20) as FlightCheckoutTraveler['traveler_type']
    const givenName = safeProfileString(traveler.given_name, 80, true)
    const familyName = safeProfileString(traveler.family_name, 80, true)
    const dateOfBirth = clean(traveler.date_of_birth, 10)
    if (!['adult', 'child', 'infant'].includes(travelerType) || !givenName || !familyName || !validDateOfBirth(dateOfBirth)) {
      throw new BrowserExecutionError('flight_checkout_input_invalid', `Traveler ${index + 1} needs a legal given name, family name, and date of birth.`, false)
    }
    const documentTypeValue = traveler.document_type === null || traveler.document_type === undefined
      ? null
      : clean(traveler.document_type, 20) as FlightCheckoutTraveler['document_type']
    if (documentTypeValue !== null && !['passport', 'national_id'].includes(documentTypeValue)) {
      throw new BrowserExecutionError('flight_checkout_input_invalid', `Traveler ${index + 1} has an unsupported document type.`, false)
    }
    const documentNumber = safeProfileString(traveler.document_number, 80)
    const documentIssuingCountry = safeProfileString(traveler.document_issuing_country, 80)
    const documentExpiry = safeProfileString(traveler.document_expiry, 10)
    if (documentExpiry !== null && !validDate(documentExpiry)) {
      throw new BrowserExecutionError('flight_checkout_input_invalid', `Traveler ${index + 1} has an invalid document expiry date.`, false)
    }
    const anyDocumentDetail = documentNumber !== null || documentTypeValue !== null || documentIssuingCountry !== null || documentExpiry !== null
    const completeDocument = documentNumber !== null && documentTypeValue !== null && documentIssuingCountry !== null && documentExpiry !== null
    if (anyDocumentDetail && !completeDocument) {
      throw new BrowserExecutionError('flight_checkout_input_invalid', `Traveler ${index + 1} has incomplete document details.`, false)
    }
    return {
      traveler_type: travelerType,
      title: safeProfileString(traveler.title, 30),
      given_name: givenName,
      middle_name: safeProfileString(traveler.middle_name, 80),
      family_name: familyName,
      date_of_birth: dateOfBirth,
      gender: safeProfileString(traveler.gender, 40),
      nationality: safeProfileString(traveler.nationality, 80),
      residence_country: safeProfileString(traveler.residence_country, 80),
      document_type: documentTypeValue,
      document_number: documentNumber,
      document_issuing_country: documentIssuingCountry,
      document_expiry: documentExpiry,
    }
  })

  return {
    travelers: normalizedTravelers,
    contact_email: contactEmail,
    contact_phone: contactPhone,
  }
}

export function classifyFlightCheckoutField(text: string, type = 'text'): CheckoutFieldKind {
  const rawValue = text.toLocaleLowerCase()
  const value = rawValue.replace(/[_-]+/g, ' ')
  if (paymentControlPattern.test(rawValue) || paymentControlPattern.test(value) || ['password'].includes(type.toLocaleLowerCase())) return 'payment'
  if (type === 'email' || /\b(?:e[- ]?mail|email address)\b/.test(value)) return 'contact_email'
  if (type === 'tel' || /\b(?:phone|mobile|telephone|contact number)\b/.test(value)) return 'contact_phone'
  const birthDate = /\b(?:date of birth|birth date|dob|bday|born)\b|(?:birth|dob)[-_]?(?:date|day|month|year)/.test(value)
  const documentExpiry = /\b(?:passport|document)\b[\s_-]*(?:expiry|expiration|expire|valid)|\b(?:expiry|expiration|valid until)\b|(?:passport|document)[-_]?(?:expiry|expiration)/.test(value)
  const datePart = /\bday\b|(?:birth|dob|expiry|expiration|document|passport)[-_]?day\b/.test(value)
    ? 'day'
    : /\bmonth\b|(?:birth|dob|expiry|expiration|document|passport)[-_]?month\b/.test(value)
      ? 'month'
      : /\byear\b|(?:birth|dob|expiry|expiration|document|passport)[-_]?year\b/.test(value)
        ? 'year'
        : ''
  if (birthDate) {
    if (datePart) return `date_of_birth_${datePart}` as CheckoutFieldKind
    return 'date_of_birth'
  }
  if (/\b(?:full|legal)\s+name\b/.test(value)) return 'full_name'
  if (/\b(?:first|given|forename)\s*name\b|\b(?:first|given|forename)\b|\bfname\b/.test(value)) return 'given_name'
  if (/\bmiddle(?:\s+name)?\b|\bsecond\s+given\b|\badditional(?:\s+name)?\b|\badditional-name\b/.test(value)) return 'middle_name'
  if (/\b(?:last|family|surname)\s*name\b|\b(?:last|family|surname)\b|\blname\b/.test(value)) return 'family_name'
  if (/\b(?:title|salutation)\b/.test(value)) return 'title'
  if (/\b(?:passenger|travell?er)\s+name\b|\bname\b/.test(value)) return 'full_name'
  if (/\b(?:gender|sex)\b/.test(value)) return 'gender'
  if (/\b(?:nationality|citizenship)\b/.test(value)) return 'nationality'
  if (/\b(?:country of residence|residence country|residential country)\b/.test(value)) return 'residence_country'
  if (/\b(?:document|passport|identity)\s*(?:type|kind)\b/.test(value)) return 'document_type'
  if (/\b(?:passport|document|travel document|identity)\s*(?:number|no\.?|#)\b|\b(?:passport|document)\b.*\b(?:number|no\.?|#)\b/.test(value)) return 'document_number'
  if (/\b(?:issuing|issue|issued)\s*(?:country|state)\b|\b(?:passport|document)\b.*\b(?:country|issued)\b/.test(value)) return 'document_issuing_country'
  if (documentExpiry) {
    if (datePart) return `document_expiry_${datePart}` as CheckoutFieldKind
    return 'document_expiry'
  }
  if (/\b(?:payment|billing|card|credit|debit|cvv|cvc)\b/.test(value)) return 'payment'
  return 'unknown'
}

function travelerIndexFromText(value: string) {
  const bracket = value.match(/(?:passenger|travell?er|adult|child|infant)[^\d]{0,12}[\[(]?(\d+)[\])]?(?:\.|_|-|\s|$)/i)
  if (!bracket?.[1]) return null
  const number = Number(bracket[1])
  if (!Number.isInteger(number)) return null
  return /[\[(]\d+[\])]/.test(bracket[0]) ? number : number - 1
}

function checkoutSurfaces(page: Page): CheckoutSurface[] {
  const browserPage = page as Page & { frames?: () => Frame[]; mainFrame?: () => Frame }
  const frames = typeof browserPage.frames === 'function' ? browserPage.frames() : []
  const mainFrame = typeof browserPage.mainFrame === 'function' ? browserPage.mainFrame() : null
  return [page, ...frames.filter(frame => frame !== mainFrame)]
}

async function describeFieldsOnce(page: Page): Promise<CheckoutFieldDescriptor[]> {
  const fields: Array<{
    surface: CheckoutSurface
    index: number
    tag: string
    type: string
    inputValue: string
    label: string
    name: string
    autocomplete: string
    groupKey: string
    required: boolean
    disabled: boolean
    options: Array<{ value: string; label: string }>
  }> = []

  for (const surface of checkoutSurfaces(page)) {
    const values = await surface.locator(checkoutFieldSelector).evaluateAll(elements => elements.map((element, index) => {
      const tag = element.tagName.toLocaleLowerCase()
      const input = element as HTMLInputElement
      const labels = 'labels' in input && input.labels
        ? [...input.labels].map(label => label.textContent ?? '').join(' ')
        : ''
      const parentLabel = input.closest('label')?.textContent ?? ''
      const fieldset = input.closest('fieldset')?.querySelector('legend')?.textContent ?? ''
      const label = [labels, parentLabel, input.getAttribute('aria-label') ?? '', input.getAttribute('placeholder') ?? '', input.name, input.id].join(' ')
      const select = element as HTMLSelectElement
      const options = tag === 'select'
        ? [...select.options].slice(0, 50).map(option => ({ value: option.value, label: option.textContent ?? '' }))
        : []
      const inputValue = tag === 'select'
        ? select.value || ''
        : tag === 'textarea' || tag === 'input'
          ? input.value || ''
          : element.textContent || ''
      const type = tag === 'input' ? input.type || '' : ''
      const groupKey = type === 'radio'
        ? input.name || fieldset || input.getAttribute('aria-labelledby') || label
        : ''
      return {
        index,
        tag,
        type,
        inputValue,
        label: `${label} ${fieldset}`.replace(/\s+/g, ' ').trim().slice(0, 600),
        name: input.name || '',
        autocomplete: input.autocomplete || '',
        groupKey,
        required: input.required || input.getAttribute('aria-required') === 'true',
        disabled: input.disabled || input.readOnly || input.getAttribute('aria-disabled') === 'true',
        options,
      }
    }))
    fields.push(...values.map(value => ({ ...value, surface })))
  }

  const occurrence = new Map<CheckoutFieldKind, number>()
  const radioGroupOccurrence = new Map<string, number>()
  const radioKindOccurrence = new Map<CheckoutFieldKind, number>()
  return fields.map(value => {
    const searchText = `${value.label} ${value.name} ${value.autocomplete}`
    const kind = classifyFlightCheckoutField(searchText, value.type)
    const explicitTravelerIndex = travelerIndexFromText(searchText)
    const occurrenceKey = value.type === 'radio'
      ? `radio:${kind}:${value.groupKey || value.label}`
      : kind
    let nextOccurrence: number
    if (value.type === 'radio') {
      const existingGroup = radioGroupOccurrence.get(occurrenceKey)
      if (existingGroup !== undefined) {
        nextOccurrence = existingGroup
      } else {
        nextOccurrence = radioKindOccurrence.get(kind) ?? 0
        radioKindOccurrence.set(kind, nextOccurrence + 1)
        radioGroupOccurrence.set(occurrenceKey, nextOccurrence)
      }
    } else {
      nextOccurrence = occurrence.get(kind) ?? 0
      occurrence.set(kind, nextOccurrence + 1)
    }
    return {
      ...value,
      tag: (value.tag === 'div' || value.tag === 'span' ? 'contenteditable' : value.tag) as CheckoutFieldDescriptor['tag'],
      label: clean(value.label, 600),
      name: clean(value.name, 160),
      autocomplete: clean(value.autocomplete, 160),
      explicitTravelerIndex,
      unindexedOccurrence: nextOccurrence,
      kind,
    }
  })
}

async function describeFields(page: Page): Promise<CheckoutFieldDescriptor[]> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await describeFieldsOnce(page)
    } catch (error) {
      lastError = error
      if (!isStaleCheckoutDomError(error) || attempt === 2) throw error
      await waitForFreshCheckoutDom(page)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The provider checkout DOM could not be read.')
}

function valueForTraveler(traveler: FlightCheckoutTraveler, kind: CheckoutFieldKind) {
  switch (kind) {
    case 'title': return traveler.title
    case 'full_name': return [traveler.given_name, traveler.middle_name, traveler.family_name].filter(Boolean).join(' ')
    case 'given_name': return traveler.given_name
    case 'middle_name': return traveler.middle_name
    case 'family_name': return traveler.family_name
    case 'date_of_birth': return traveler.date_of_birth
    case 'date_of_birth_day': return traveler.date_of_birth.slice(8, 10)
    case 'date_of_birth_month': return traveler.date_of_birth.slice(5, 7)
    case 'date_of_birth_year': return traveler.date_of_birth.slice(0, 4)
    case 'gender': return traveler.gender
    case 'nationality': return traveler.nationality
    case 'residence_country': return traveler.residence_country
    case 'document_type': return traveler.document_type
    case 'document_number': return traveler.document_number
    case 'document_issuing_country': return traveler.document_issuing_country
    case 'document_expiry': return traveler.document_expiry
    case 'document_expiry_day': return traveler.document_expiry?.slice(8, 10) ?? null
    case 'document_expiry_month': return traveler.document_expiry?.slice(5, 7) ?? null
    case 'document_expiry_year': return traveler.document_expiry?.slice(0, 4) ?? null
    default: return null
  }
}

function normalizedOptionValue(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

function regionDisplayName(value: string) {
  if (!/^[a-z]{2,3}$/i.test(value)) return ''
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(value.toLocaleUpperCase()) ?? ''
  } catch {
    return ''
  }
}

function optionSemanticValues(descriptor: CheckoutFieldDescriptor, value: string) {
  const values = [value, regionDisplayName(value)]
  if (descriptor.kind === 'gender') {
    const normalized = normalizedOptionValue(value)
    if (['male', 'man', 'm'].includes(normalized)) values.push('male', 'man', 'm')
    if (['female', 'woman', 'f'].includes(normalized)) values.push('female', 'woman', 'f')
    if (['nonbinary', 'nonbinarygender', 'x'].includes(normalized)) values.push('x', 'non binary', 'non-binary')
  }
  if (descriptor.kind.endsWith('_month')) {
    const month = Number(value)
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      values.push(
        String(month),
        String(month).padStart(2, '0'),
        new Date(Date.UTC(2000, month - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
        new Date(Date.UTC(2000, month - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      )
    }
  }
  return values.map(normalizedOptionValue).filter(Boolean)
}

function optionMatches(expected: string, actual: string) {
  const normalizedExpected = normalizedOptionValue(expected)
  const normalizedActual = normalizedOptionValue(actual)
  if (!normalizedExpected || !normalizedActual) return false
  if (/^\d+$/.test(normalizedExpected) && /^\d+$/.test(normalizedActual)) {
    return Number(normalizedExpected) === Number(normalizedActual)
  }
  return normalizedActual === normalizedExpected ||
    (normalizedExpected.length >= 3 && normalizedActual.includes(normalizedExpected)) ||
    (normalizedActual.length >= 3 && normalizedExpected.includes(normalizedActual))
}

function selectedOption(descriptor: CheckoutFieldDescriptor, value: string) {
  const expectedValues = optionSemanticValues(descriptor, value)
  return descriptor.options.find(option => {
    const actualValues = [option.value, option.label, regionDisplayName(option.value)]
    return expectedValues.some(expected => actualValues.some(actual => optionMatches(expected, actual)))
  }) ?? null
}

function formatDateForDescriptor(descriptor: CheckoutFieldDescriptor, value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const [, year, month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? []
  if (descriptor.type === 'month') return `${year}-${month}`
  if (descriptor.kind.endsWith('_day') || descriptor.kind.endsWith('_month') || descriptor.kind.endsWith('_year')) return value
  if (descriptor.type === 'date') return value
  const label = descriptor.label.toLocaleLowerCase()
  if (year && month && day && /(?:dd|d)[/.-](?:mm|m)[/.-](?:yyyy|yy)|\bday\b[\s,/-]+\bmonth\b/.test(label)) return `${day}/${month}/${year}`
  if (year && month && day && /(?:mm|m)[/.-](?:dd|d)[/.-](?:yyyy|yy)|\bmonth\b[\s,/-]+\bday\b/.test(label)) return `${month}/${day}/${year}`
  if (year && month && day && /(?:yyyy|yy)[/.-](?:mm|m)[/.-](?:dd|d)/.test(label)) return `${year}/${month}/${day}`
  return value
}

async function verifyField(locator: Locator, descriptor: CheckoutFieldDescriptor, expected: string) {
  const actual = await locator.evaluate(element => {
    const tag = element.tagName.toLocaleLowerCase()
    const input = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    if (tag === 'select') {
      return {
        value: (input as HTMLSelectElement).value,
        label: (input as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? '',
      }
    }
    if ('value' in element) return { value: (element as HTMLInputElement | HTMLTextAreaElement).value, label: '' }
    return { value: element.textContent ?? '', label: '' }
  })
  const actualRecord = actual && typeof actual === 'object' && !Array.isArray(actual)
    ? actual as { value?: unknown; label?: unknown }
    : { value: actual, label: '' }
  const actualValues = [actualRecord.value, actualRecord.label]
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
  const matches = descriptor.tag === 'select'
    ? optionSemanticValues(descriptor, expected).some(expectedValue =>
        actualValues.some(actualValue => optionMatches(expectedValue, actualValue)))
    : (() => {
        const normalizedActual = actualValues[0]?.toLocaleLowerCase() ?? ''
        const normalizedExpected = expected.trim().toLocaleLowerCase()
        return Boolean(normalizedActual && normalizedExpected && (
          normalizedActual === normalizedExpected ||
          normalizedActual.includes(normalizedExpected) ||
          normalizedExpected.includes(normalizedActual)
        ))
      })()
  if (!matches) {
    throw new BrowserExecutionError('flight_checkout_field_unverified', `The provider did not confirm the ${descriptor.kind.replaceAll('_', ' ')} field.`, true, {
      field: descriptor.kind,
    })
  }
}

async function fillDescriptor(descriptor: CheckoutFieldDescriptor, value: string) {
  const locator = descriptor.surface.locator(checkoutFieldSelector).nth(descriptor.index)
  if (descriptor.type === 'radio') {
    const expectedValues = optionSemanticValues(descriptor, value)
    const actualValues = [descriptor.inputValue, descriptor.label, descriptor.name]
    const matches = expectedValues.some(expected => actualValues.some(actual => descriptor.kind === 'gender'
      ? normalizedOptionValue(expected) === normalizedOptionValue(actual)
      : optionMatches(expected, actual)))
    if (!matches) return false
    await locator.check()
    const checked = await locator.evaluate(element => Boolean((element as HTMLInputElement).checked))
    if (!checked) {
      throw new BrowserExecutionError('flight_checkout_field_unverified', `The provider did not confirm the ${descriptor.kind.replaceAll('_', ' ')} field.`, true, {
        field: descriptor.kind,
      })
    }
    return true
  }
  if (descriptor.tag === 'select') {
    const option = selectedOption(descriptor, value)
    if (!option) {
      throw new BrowserExecutionError('flight_checkout_option_unmatched', `The provider's ${descriptor.kind.replaceAll('_', ' ')} choices do not contain the supplied value.`, false, {
        field: descriptor.kind,
        choices: descriptor.options.slice(0, 20).map(item => item.label).filter(Boolean),
      })
    }
    await locator.selectOption(option.value)
    await verifyField(locator, descriptor, option.label || option.value)
    return true
  }
  const formattedValue = formatDateForDescriptor(descriptor, value)
  await locator.fill(formattedValue)
  await verifyField(locator, descriptor, formattedValue)
  return true
}

function advanceLabel(value: string) {
  return clean(value, 180).replace(/\s+/g, ' ').trim()
}

export function isSafeFlightCheckoutAdvanceLabel(value: string) {
  const label = advanceLabel(value)
  return Boolean(label) &&
    !blockedAdvancePattern.test(label) &&
    !providerHandoffControlPattern.test(label) &&
    safeAdvancePattern.test(label)
}

async function paymentBoundary(page: Page) {
  const descriptors = await describeFields(page)
  const body = (await Promise.all(checkoutSurfaces(page).map(surface => surface.locator('body').innerText().catch(() => '')))).join('\n')
  const paymentControl = descriptors.some(descriptor => descriptor.kind === 'payment' && !descriptor.disabled)
  const paymentText = /\b(?:payment method|card details|billing details|billing address|credit card|debit card|card number|pay securely|enter (?:your )?card)\b/i.test(body)
  return paymentControl || paymentText
}

function providerUrlAllowed(raw: string) {
  const safe = safeExternalProviderHandoffUrl(raw)
  if (!safe) return ''
  const url = new URL(safe)
  const hostname = url.hostname.toLocaleLowerCase()
  if (isIP(hostname) || hostname === 'google.com' || hostname.endsWith('.google.com')) return ''
  return safe
}

async function checkoutUserInterventionReason(page: Page, body: string) {
  const text = body.replace(/\s+/g, ' ').trim()
  if (/\b(?:captcha|verify\s+(?:that\s+)?you(?:'re| are)\s+human|unusual\s+traffic|robot\s+check)\b/i.test(text)) {
    return 'The provider requires a user-controlled verification step before checkout can continue.'
  }
  const sensitiveControlCount = (await Promise.all(checkoutSurfaces(page).map(async surface => {
    try {
      return await surface.locator(
        'input:visible[type="password"], input:visible[autocomplete="one-time-code"], input:visible[name*="otp" i], input:visible[id*="otp" i]',
      ).count()
    } catch (error) {
      if (isStaleCheckoutDomError(error)) return 0
      throw error
    }
  }))).reduce((total, count) => total + count, 0)
  if (sensitiveControlCount > 0 || /\b(?:one[- ]?time\s+code|verification\s+code|enter\s+(?:your\s+)?otp)\b/i.test(text)) {
    return 'The provider requires a user-controlled sign-in or verification step before checkout can continue.'
  }
  if (/\b(?:sign\s*in|log\s*in|create\s+(?:an?\s+)?account)\b[\s\S]{0,100}\b(?:to\s+continue|to\s+proceed|required|before\s+(?:checkout|booking))\b/i.test(text)) {
    return 'The provider requires a user-controlled sign-in step before checkout can continue.'
  }
  return ''
}

export function safeGoogleFlightsBookingUrl(raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLocaleLowerCase()
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !['google.com', 'www.google.com'].includes(hostname) ||
      !url.pathname.startsWith('/travel/flights/booking')
    ) return ''
    return url.toString()
  } catch {
    return ''
  }
}

export function safeProviderNavigationUrl(raw: string) {
  const direct = providerUrlAllowed(raw)
  if (direct) return direct
  let candidate = raw
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      const url = new URL(candidate)
      const hostname = url.hostname.toLocaleLowerCase()
      if (hostname !== 'google.com' && !hostname.endsWith('.google.com')) return ''
      const nested = ['url', 'q', 'destination', 'redirect', 'target']
        .map(key => url.searchParams.get(key) ?? '')
        .find(value => value.startsWith('https://'))
      if (!nested) return ''
      const nestedSafe = providerUrlAllowed(nested)
      if (nestedSafe) return nestedSafe
      candidate = nested
    } catch {
      return ''
    }
  }
  return ''
}

async function locateProviderLink(page: Page) {
  const links = (await Promise.all(
    checkoutSurfaces(page).map(surface =>
      surface.locator('a[href]:visible').evaluateAll(elements => elements
        .map(element => ({
          text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
          href: (element as HTMLAnchorElement).href,
        }))
        .filter(item => /\b(?:book|select|continue|airline|provider)\b/i.test(item.text)),
      ).catch(error => {
        if (isStaleCheckoutDomError(error)) return []
        throw error
      }),
    ),
  )).flat()
  for (const item of links) {
    const href = providerUrlAllowed(item.href)
    if (href) return { ...item, href }
  }
  return null
}

function providerNameFromCheckoutLabel(value: string) {
  return clean(value, 180)
    .replace(/^.*?(?:continue\s+to\s+book(?:\s+with)?|book\s+with|visit\s+(?:site|airline))\s*/i, '')
    .replace(/\s+(?:for|at)\s+[$€£₦\d].*$/i, '')
    .trim()
    .slice(0, 120) || 'Airline provider'
}

async function openProviderBooking(page: Page) {
  const navigationTimeout = 20_000
  for (const surface of checkoutSurfaces(page)) {
    const groups = [
      surface.getByRole('button', { name: providerHandoffControlPattern }).all(),
      surface.getByRole('link', { name: providerHandoffControlPattern }).all(),
    ]
    for (const group of groups) {
      let controls: Locator[]
      try {
        controls = await group
      } catch (error) {
        if (isStaleCheckoutDomError(error)) continue
        throw error
      }
      for (const control of controls) {
        if (!await control.isVisible().catch(() => false)) continue
        const label = [
          await control.getAttribute('aria-label').catch(() => ''),
          await control.innerText().catch(() => ''),
        ].filter(Boolean).join(' ').trim()
        if (!providerHandoffControlPattern.test(label) || blockedAdvancePattern.test(label)) continue

        const existingPages = new Set(page.context().pages())
        const safeDestination = async (candidate: Page | null) => {
          if (!candidate) return null
          const existingUrl = safeProviderNavigationUrl(candidate.url())
          if (existingUrl && providerUrlAllowed(candidate.url())) return { page: candidate, url: existingUrl }
          await candidate.waitForURL(
            url => Boolean(safeProviderNavigationUrl(url.toString())),
            { timeout: navigationTimeout },
          ).catch(() => undefined)
          const url = safeProviderNavigationUrl(candidate.url())
          if (!url) return null
          if (!providerUrlAllowed(candidate.url())) {
            await candidate.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeout }).catch(() => undefined)
          }
          const currentUrl = providerUrlAllowed(candidate.url())
          return currentUrl ? { page: candidate, url: currentUrl } : null
        }
        const popupPromise = page.waitForEvent('popup', { timeout: navigationTimeout })
          .then(popup => safeDestination(popup))
          .catch(() => null)
        const samePagePromise = page.waitForURL(
          url => Boolean(safeProviderNavigationUrl(url.toString())),
          { timeout: navigationTimeout },
        ).then(() => safeDestination(page)).catch(() => null)
        const contextPagePromise = page.context().waitForEvent('page', { timeout: navigationTimeout })
          .then(candidate => safeDestination(candidate))
          .catch(() => null)
        await control.click({ noWaitAfter: true }).catch(() => undefined)
        let destination = await Promise.race([popupPromise, contextPagePromise, samePagePromise])
        if (!destination) {
          const newlyOpenedPages = page.context().pages().filter(candidate => !existingPages.has(candidate))
          for (const candidate of newlyOpenedPages) {
            destination = await safeDestination(candidate)
            if (destination) break
          }
        }
        if (destination) {
          await destination.page.waitForLoadState('domcontentloaded', { timeout: navigationTimeout }).catch(() => undefined)
          return { ...destination, provider: providerNameFromCheckoutLabel(label) }
        }
      }
    }
  }
  return null
}

async function clickSafeAdvance(page: Page) {
  for (const surface of checkoutSurfaces(page)) {
    const candidates = [
      surface.getByRole('button', { name: /^(?:continue|next|proceed|go\s+to|review)(?:\s+[\s\S]{0,120})?$/i }).all(),
      surface.getByRole('link', { name: /^(?:continue|next|proceed|go\s+to|review)(?:\s+[\s\S]{0,120})?$/i }).all(),
    ]
    for (const group of candidates) {
      const controls = await group
      for (const control of controls) {
        if (!await control.isVisible().catch(() => false)) continue
        const label = [
          await control.getAttribute('aria-label').catch(() => ''),
          await control.innerText().catch(() => ''),
        ].filter(Boolean).join(' ').trim()
        if (!isSafeFlightCheckoutAdvanceLabel(label)) continue
        await control.click({ noWaitAfter: true })
        await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)
        await page.waitForTimeout(700)
        return label
      }
    }
  }
  return ''
}

export async function prepareFlightCheckout(
  page: Page,
  input: FlightCheckoutInput,
  handoffUrl: string,
  provider: string,
): Promise<FlightCheckoutResult> {
  const normalized = normalizeFlightCheckoutInput(input)
  const safeHandoffUrl = providerUrlAllowed(handoffUrl) || safeGoogleFlightsBookingUrl(handoffUrl)
  if (!safeHandoffUrl) throw new BrowserExecutionError('unsafe_payment_handoff', 'The stored provider handoff is not a safe HTTPS provider URL.', false)

  await page.goto(safeHandoffUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  let currentUrl = page.url()
  const preparedFields = new Set<string>()
  const observedControls = new Set<string>()
  let steps = 0

  for (; steps < 6; steps += 1) {
    currentUrl = page.url()
    const safeCurrentProviderUrl = providerUrlAllowed(currentUrl)
    const safeCurrentGoogleUrl = safeGoogleFlightsBookingUrl(currentUrl)
    if (!safeCurrentProviderUrl && !safeCurrentGoogleUrl) {
      throw new BrowserExecutionError('unsafe_payment_handoff', 'The provider redirected outside the verified HTTPS booking domain.', false)
    }
    const body = (await Promise.all(checkoutSurfaces(page).map(surface => surface.locator('body').innerText().catch(() => '')))).join('\n')
    const interventionReason = await checkoutUserInterventionReason(page, body)
    if (interventionReason) {
      throw new BrowserExecutionError('flight_checkout_user_intervention', interventionReason, false, {
        currentUrl,
        stage: 'provider_intervention',
      })
    }
    if (await paymentBoundary(page)) {
      return {
        provider,
        handoffUrl: safeCurrentProviderUrl || safeHandoffUrl,
        currentUrl,
        paymentBoundaryReached: true,
        checkoutStage: 'payment',
        preparedFields: [...preparedFields],
        preparedTravelerCount: normalized.travelers.length,
        steps,
        observedControls: [...observedControls].slice(0, 40),
      }
    }

    const descriptors = await describeFields(page)
    for (const descriptor of descriptors) {
      if (descriptor.disabled) continue
      const summary = `${descriptor.kind}:${descriptor.label}`
      observedControls.add(summary.slice(0, 220))
      if (descriptor.kind === 'payment') continue
      if (descriptor.kind === 'unknown') {
        const unknownFieldText = `${descriptor.label} ${descriptor.name} ${descriptor.autocomplete}`
        const consentOrAttestation = /\b(?:agree|accept|terms|conditions|declaration|consent|confirm)\b/i.test(unknownFieldText)
        if (descriptor.required) {
          throw new BrowserExecutionError('flight_checkout_user_intervention', 'The provider exposed a sensitive or unsupported required field that must remain under user control.', false, {
            currentUrl,
            field: descriptor.label,
            consentOrAttestation,
          })
        }
        continue
      }

      let expected: string | null = null
      let fieldName: string = descriptor.kind
      if (descriptor.kind === 'contact_email') expected = normalized.contact_email
      else if (descriptor.kind === 'contact_phone') expected = normalized.contact_phone
      else {
        const candidateIndex = descriptor.explicitTravelerIndex ?? descriptor.unindexedOccurrence
        const traveler = normalized.travelers[candidateIndex]
        if (!traveler) continue
        expected = valueForTraveler(traveler, descriptor.kind)
        if (descriptor.type === 'month' && descriptor.kind === 'document_expiry_month') expected = traveler.document_expiry
        if (descriptor.type === 'month' && descriptor.kind === 'date_of_birth_month') expected = traveler.date_of_birth
        fieldName = `traveler_${candidateIndex + 1}.${descriptor.kind}`
      }

      if (!expected) {
        if (descriptor.required) {
          throw new BrowserExecutionError('flight_checkout_missing_details', `The provider requires ${fieldName.replaceAll('_', ' ')}, but it was not provided.`, false, {
            currentUrl,
            missingFields: [fieldName],
          })
        }
        continue
      }

      const locator = descriptor.surface.locator(checkoutFieldSelector).nth(descriptor.index)
      if (descriptor.type === 'radio') {
        const filled = await fillDescriptor(descriptor, expected)
        if (filled) preparedFields.add(fieldName)
        continue
      }
      if (descriptor.tag === 'select') {
        await fillDescriptor(descriptor, expected)
      } else {
        const alreadyFilled = await locator.inputValue().catch(() => '')
        if (alreadyFilled.trim()) {
          await verifyField(locator, descriptor, formatDateForDescriptor(descriptor, expected))
        } else {
          await fillDescriptor(descriptor, expected)
        }
      }
      preparedFields.add(fieldName)
    }

    if (await paymentBoundary(page)) {
      return {
        provider,
        handoffUrl: safeCurrentProviderUrl || safeHandoffUrl,
        currentUrl,
        paymentBoundaryReached: true,
        checkoutStage: 'payment',
        preparedFields: [...preparedFields],
        preparedTravelerCount: normalized.travelers.length,
        steps,
        observedControls: [...observedControls].slice(0, 40),
      }
    }

    const label = await clickSafeAdvance(page)
    if (label) continue
    if (safeCurrentGoogleUrl) {
      const providerBooking = await openProviderBooking(page)
      if (providerBooking) {
        page = providerBooking.page
        provider = providerBooking.provider
        continue
      }
    }
    const providerLink = safeCurrentGoogleUrl
      ? await locateProviderLink(page)
      : null
    if (providerLink) {
      await page.goto(providerLink.href, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      provider = provider === 'Google Flights'
        ? providerLink.text.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Airline provider'
        : provider
      continue
    }
    if (safeCurrentGoogleUrl) {
      throw new BrowserExecutionError('flight_provider_handoff_unavailable', 'Google Flights did not expose a safe direct provider booking link for this itinerary.', false, {
        currentUrl,
        stage: 'google_booking_options',
      })
    }
    throw new BrowserExecutionError('flight_checkout_user_intervention', 'The provider checkout page needs a user-controlled step before its payment page can be reached.', false, {
      currentUrl,
      stage: 'traveler_details',
      preparedFields: [...preparedFields],
      observedControls: [...observedControls].slice(0, 40),
    })
  }

  throw new BrowserExecutionError('flight_checkout_recovery_exhausted', 'The provider checkout did not reach its payment boundary within the bounded preparation path.', false, {
    currentUrl,
    preparedFields: [...preparedFields],
    steps,
  })
}
