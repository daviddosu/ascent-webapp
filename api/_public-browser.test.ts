import { afterEach, describe, expect, it } from 'vitest'
import { allowedPublicUrl } from './_public-browser.js'

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
})
