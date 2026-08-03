import { describe, expect, it } from 'vitest'
import {
  classifyFlightCheckoutField,
  isSafeFlightCheckoutAdvanceLabel,
  normalizeFlightCheckoutInput,
  prepareFlightCheckout,
  safeGoogleFlightsBookingUrl,
} from './_flight-checkout'

const traveler = {
  traveler_type: 'adult',
  title: null,
  given_name: 'Ada',
  middle_name: null,
  family_name: 'Lovelace',
  date_of_birth: '1815-12-10',
  gender: null,
  nationality: 'GB',
  residence_country: null,
  document_type: 'passport',
  document_number: 'P1234567',
  document_issuing_country: 'GB',
  document_expiry: '2030-12-10',
}

describe('flight checkout preparation', () => {
  it('validates one profile per passenger and keeps the document fields structured', () => {
    const result = normalizeFlightCheckoutInput({
      travelers: [traveler, { ...traveler, traveler_type: 'child', given_name: 'Grace', date_of_birth: '1843-12-10' }],
      contact_email: 'traveler@example.com',
      contact_phone: '+2348000000000',
    })
    expect(result.travelers).toHaveLength(2)
    expect(result.travelers[1]).toMatchObject({ traveler_type: 'child', given_name: 'Grace' })
    expect(() => normalizeFlightCheckoutInput({
      travelers: [{ ...traveler, document_number: 'P123', document_expiry: null }],
      contact_email: 'traveler@example.com',
      contact_phone: '+2348000000000',
    })).toThrow('incomplete document details')
    expect(() => normalizeFlightCheckoutInput({
      travelers: [{ ...traveler, date_of_birth: '2999-01-01' }],
      contact_email: 'traveler@example.com',
      contact_phone: '+2348000000000',
    })).toThrow('legal given name')
    expect(() => normalizeFlightCheckoutInput({
      travelers: [traveler],
      contact_email: 'traveler@example.com',
      contact_phone: 'not a phone number',
    })).toThrow('valid traveler list')
  })

  it('maps provider labels to supported traveler fields without treating payment controls as fillable', () => {
    expect(classifyFlightCheckoutField('Passenger 2 — First name', 'text')).toBe('given_name')
    expect(classifyFlightCheckoutField('Legal full name', 'text')).toBe('full_name')
    expect(classifyFlightCheckoutField('Passport number', 'text')).toBe('document_number')
    expect(classifyFlightCheckoutField('dob_day', 'text')).toBe('date_of_birth_day')
    expect(classifyFlightCheckoutField('date_of_birth', 'date')).toBe('date_of_birth')
    expect(classifyFlightCheckoutField('passport_expiry_month', 'text')).toBe('document_expiry_month')
    expect(classifyFlightCheckoutField('additional-name', 'text')).toBe('middle_name')
    expect(classifyFlightCheckoutField('Card number', 'text')).toBe('payment')
    expect(classifyFlightCheckoutField('CVV security code', 'text')).toBe('payment')
    expect(classifyFlightCheckoutField('Security question', 'text')).toBe('unknown')
    expect(classifyFlightCheckoutField('Email address', 'email')).toBe('contact_email')
  })

  it('accepts only a Google Flights booking-options handoff for provider-link recovery', () => {
    expect(safeGoogleFlightsBookingUrl('https://www.google.com/travel/flights/booking?itinerary=1')).toContain('/travel/flights/booking')
    expect(safeGoogleFlightsBookingUrl('https://google.com/travel/flights/booking?itinerary=1')).toContain('google.com')
    expect(safeGoogleFlightsBookingUrl('https://www.google.com/travel/flights?q=LOS')).toBe('')
    expect(safeGoogleFlightsBookingUrl('https://www.google.com/travel/flights/booking')).not.toBe('')
    expect(safeGoogleFlightsBookingUrl('https://user:secret@www.google.com/travel/flights/booking')).toBe('')
  })

  it('allows only non-consequential checkout progression labels', () => {
    expect(isSafeFlightCheckoutAdvanceLabel('Continue to payment')).toBe(true)
    expect(isSafeFlightCheckoutAdvanceLabel('Next')).toBe(true)
    expect(isSafeFlightCheckoutAdvanceLabel('Review passenger details')).toBe(true)
    expect(isSafeFlightCheckoutAdvanceLabel('Pay now')).toBe(false)
    expect(isSafeFlightCheckoutAdvanceLabel('Confirm and purchase')).toBe(false)
    expect(isSafeFlightCheckoutAdvanceLabel('Sign in to continue')).toBe(false)
  })

  it('fills observed traveler and contact controls, verifies them, and stops when payment controls appear', async () => {
    const values = new Map<number, string>()
    let paymentVisible = false
    const fields = [
      { index: 0, tag: 'input', type: 'text', label: 'Passenger 1 First name', name: 'passenger_1_first_name', autocomplete: '', required: true, disabled: false, options: [] },
      { index: 1, tag: 'input', type: 'text', label: 'Passenger 1 Last name', name: 'passenger_1_last_name', autocomplete: '', required: true, disabled: false, options: [] },
      { index: 2, tag: 'input', type: 'date', label: 'Passenger 1 Date of birth', name: 'passenger_1_dob', autocomplete: '', required: true, disabled: false, options: [] },
      { index: 3, tag: 'input', type: 'text', label: 'Passport number', name: 'passport_number', autocomplete: '', required: true, disabled: false, options: [] },
      { index: 4, tag: 'input', type: 'email', label: 'Contact email', name: 'email', autocomplete: 'email', required: true, disabled: false, options: [] },
      { index: 5, tag: 'input', type: 'tel', label: 'Contact phone', name: 'phone', autocomplete: 'tel', required: true, disabled: false, options: [] },
    ]
    const locator = (index: number) => ({
      async inputValue() { return values.get(index) ?? '' },
      async fill(value: string) { values.set(index, value); paymentVisible = true },
      async selectOption(value: string) { values.set(index, value) },
      async evaluate<T>(_callback: (element: unknown) => T) { return values.get(index) ?? '' as T },
      async count() { return 1 },
      async isVisible() { return true },
      async getAttribute() { return null },
      async innerText() { return '' },
    })
    const page = {
      async goto() { /* controlled page */ },
      url() { return 'https://www.example-airline.test/booking/passengers' },
      locator(selector: string) {
        if (selector === 'body') return { async innerText() { return paymentVisible ? 'Payment method Card details' : 'Passenger details' } }
        return {
          async evaluateAll<T>(_callback: (elements: unknown[]) => T) {
            return (paymentVisible
              ? [...fields, { index: 6, tag: 'input', type: 'text', label: 'Card number', name: 'card_number', autocomplete: 'cc-number', required: true, disabled: false, options: [] }]
              : fields) as T
          },
          nth(index: number) { return locator(index) },
          async count() { return 0 },
        }
      },
      getByRole() { return { async all() { return [] } } },
      async waitForLoadState() {},
      async waitForTimeout() { paymentVisible = true },
    } as never

    const result = await prepareFlightCheckout(
      page,
      {
        travelers: [traveler],
        contact_email: 'traveler@example.com',
        contact_phone: '+2348000000000',
      },
      'https://www.example-airline.test/booking/passengers',
      'Example Airline',
    )

    expect(result.paymentBoundaryReached).toBe(true)
    expect(result.preparedTravelerCount).toBe(1)
    expect(result.preparedFields).toEqual(expect.arrayContaining([
      'traveler_1.given_name',
      'traveler_1.family_name',
      'traveler_1.date_of_birth',
      'traveler_1.document_number',
      'contact_email',
      'contact_phone',
    ]))
    expect(values.get(6)).toBeUndefined()
  })
})
