import { afterEach, describe, expect, it } from 'vitest'
import { allowedPublicUrl, extractSubmissionConfirmation, publicBrowserHumanBoundary, retainPublicBrowserLinks } from './_public-browser.js'

describe('public browser URL policy', () => {
  const allowed = ['example.com', 'forms.example.org']
  const originalNodeEnv = process.env.NODE_ENV
  const originalBenchmarkMode = process.env.SHOTCOUNT_BENCHMARK_MODE

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalBenchmarkMode === undefined) delete process.env.SHOTCOUNT_BENCHMARK_MODE
    else process.env.SHOTCOUNT_BENCHMARK_MODE = originalBenchmarkMode
  })

  it('accepts only exact allowlisted HTTPS hosts', () => {
    expect(allowedPublicUrl('https://example.com/path?q=1', allowed).hostname).toBe('example.com')
    expect(allowedPublicUrl('https://forms.example.org/form', allowed).hostname).toBe('forms.example.org')
    expect(() => allowedPublicUrl('https://sub.example.com/path', allowed)).toThrow(/allowlist/i)
    expect(() => allowedPublicUrl('https://example.com.evil.test/path', allowed)).toThrow(/allowlist/i)
  })

  it('blocks insecure, local, IP, and credential-bearing destinations', () => {
    for (const url of [
      'http://example.com/path',
      'https://127.0.0.1/path',
      'https://2130706433/path',
      'https://0x7f000001/path',
      'https://[::1]/path',
      'https://[::ffff:127.0.0.1]/path',
      'https://localhost/path',
      'https://service.local/path',
      'https://user:secret@example.com/path',
    ]) {
      expect(() => allowedPublicUrl(url, [...allowed, '127.0.0.1', '[::1]', 'localhost', 'service.local']))
        .toThrow(/allowlist/i)
    }
  })

  it('rejects malformed destinations and malformed allowlists', () => {
    expect(() => allowedPublicUrl('not a URL', allowed)).toThrow(/valid URL/i)
    expect(() => allowedPublicUrl('https://example.com/path', ['example.com/evil', 'example..com']))
      .toThrow(/allowlist/i)
  })

  it('allows the exact benchmark fixture only outside production with the explicit flag', () => {
    process.env.NODE_ENV = 'test'
    process.env.SHOTCOUNT_BENCHMARK_MODE = 'true'
    expect(allowedPublicUrl('https://benchmark.test/form', ['benchmark.test']).hostname).toBe('benchmark.test')
    expect(() => allowedPublicUrl('https://sub.benchmark.test/form', ['benchmark.test'])).toThrow(/allowlist/i)

    process.env.NODE_ENV = 'production'
    expect(() => allowedPublicUrl('https://benchmark.test/form', ['benchmark.test'])).toThrow(/allowlist/i)
  })

  it('retains recommendation instructions that appear after global navigation without expanding the snapshot unboundedly', () => {
    const navigation = Array.from({ length: 20 }, (_, index) => ({
      text: `Navigation ${index + 1}`,
      href: `https://example.com/navigation-${index + 1}`,
    }))
    const links = retainPublicBrowserLinks([
      ...navigation,
      { text: 'Recommendations', href: 'https://example.com/apply/recommendations' },
      ...Array.from({ length: 60 }, (_, index) => ({ text: `Archive ${index + 1}`, href: `https://example.com/archive-${index + 1}` })),
    ])

    expect(links).toContainEqual({ text: 'Recommendations', href: 'https://example.com/apply/recommendations' })
    expect(links).toHaveLength(21)
  })

  it('accepts a submission only when the confirmation page includes a durable identity', () => {
    expect(extractSubmissionConfirmation({
      url: 'https://example.com/application/confirmation',
      title: 'Application submitted',
      text: 'Thank you. Your application has been submitted. Confirmation number: PHY-2027-1842',
      links: [], fields: [], buttons: [], headings: [],
    })).toMatchObject({ confirmed: true, confirmationId: 'PHY-2027-1842' })

    expect(extractSubmissionConfirmation({
      url: 'https://example.com/application',
      title: 'Application',
      text: 'Your changes were saved successfully.',
      links: [], fields: [], buttons: [], headings: [],
    }).confirmed).toBe(false)
  })

  it('classifies authentication, CAPTCHA, and sensitive-field boundaries for secure takeover', () => {
    const base = {
      url: 'https://example.com/apply', title: '', headings: [], text: '', links: [], controls: [],
      fields: [], questions: [], untrustedExternalContent: true as const,
    }
    expect(publicBrowserHumanBoundary({
      ...base,
      title: 'Sign in with Google',
      fields: [{ name: 'password', label: 'Password', prompt: 'Password', type: 'password', value: '', checked: false, required: true, fileName: null, options: [], minLength: null, maxLength: null, min: null, max: null, pattern: null, section: 'Sign in', conditionalTrigger: null, visible: true, savedState: false }],
    })).toBe('authentication')
    expect(publicBrowserHumanBoundary({ ...base, text: 'Please complete the CAPTCHA to continue.' })).toBe('captcha')
    expect(publicBrowserHumanBoundary({
      ...base,
      fields: [{ name: 'ssn', label: 'Social Security Number', prompt: 'Social Security Number', type: 'text', value: '', checked: false, required: true, fileName: null, options: [], minLength: null, maxLength: null, min: null, max: null, pattern: null, section: 'Identity', conditionalTrigger: null, visible: true, savedState: false }],
    })).toBe('sensitive_field')
    expect(publicBrowserHumanBoundary({ ...base, text: 'This portal uses CAPTCHA protection.' })).toBeNull()
    expect(publicBrowserHumanBoundary({
      ...base,
      title: 'Application portal',
      text: 'Application form',
      fields: [{ name: 'password', label: 'Password', prompt: 'Password', type: 'password', value: '', checked: false, required: true, fileName: null, options: [], minLength: null, maxLength: null, min: null, max: null, pattern: null, section: 'Hidden', conditionalTrigger: null, visible: false, savedState: false }],
    })).toBeNull()
  })
})
