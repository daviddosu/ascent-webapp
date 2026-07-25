import { describe, expect, it } from 'vitest'
import handler from './browser-fixture.js'

function run(method: string) {
  let statusCode = 0
  let body = ''
  const headers = new Map<string, string>()
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value)
    },
    status(code: number) {
      statusCode = code
      return response
    },
    send(value: string) {
      body = value
    },
  }
  handler({ method }, response)
  return { statusCode, body, headers }
}

describe('controlled browser fixture', () => {
  it('serves a labeled, non-sensitive form without caching', () => {
    const result = run('GET')
    expect(result.statusCode).toBe(200)
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(result.body).toContain('Customer name')
    expect(result.body).toContain('Comments')
    expect(result.body).toContain('Submit form')
  })

  it('confirms a submission without echoing or persisting values', () => {
    const result = run('POST')
    expect(result.statusCode).toBe(200)
    expect(result.body).toContain('Submission confirmed')
    expect(result.body).toContain('No submitted values were stored')
    expect(result.body).not.toContain('customer_name=')
  })
})
