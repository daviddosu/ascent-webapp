import { describe, expect, it } from 'vitest'
import handler from './application-portal-fixture.js'

function run(method: string, url = '/api/application-portal-fixture') {
  let statusCode = 0
  let body = ''
  const headers = new Map<string, string>()
  const response = {
    setHeader(name: string, value: string) { headers.set(name, value) },
    status(code: number) { statusCode = code; return response },
    send(value: string) { body = value },
  }
  handler({ method, url }, response)
  return { statusCode, body, headers }
}

describe('controlled application portal fixture', () => {
  it('exposes resumable account, verification, profile, documents, and review sections', () => {
    for (const step of ['account', 'verification', 'profile', 'education', 'research', 'documents', 'review']) {
      const result = run('GET', `/api/application-portal-fixture?step=${step}`)
      expect(result.statusCode).toBe(200)
      expect(result.headers.get('Cache-Control')).toBe('no-store')
      expect(result.body).toContain('Application sections')
    }
    expect(run('GET', '/api/application-portal-fixture?step=verification').body).toContain('Verification code')
    expect(run('GET', '/api/application-portal-fixture?step=documents').body).toContain('Academic CV')
    expect(run('GET', '/api/application-portal-fixture?step=review').body).toContain('Submission remains a separate approved action')
  })

  it('exposes deterministic session expiry, recovery, and validation states', () => {
    const expired = run('GET', '/api/application-portal-fixture?step=research&session=expired')
    expect(expired.body).toContain('Session expired')
    expect(expired.body).toContain('Resume sign in')
    const failedSubmit = run('POST', '/api/application-portal-fixture?step=review&session=expired')
    expect(failedSubmit.statusCode).toBe(409)
    expect(failedSubmit.body).toContain('expired before this action could be saved')
    expect(run('GET', '/api/application-portal-fixture?step=profile&error=validation').body).toContain('Choose a nationality')
  })

  it('returns provider evidence after one controlled submit', () => {
    const result = run('POST', '/api/application-portal-fixture?step=review')
    expect(result.statusCode).toBe(200)
    expect(result.body).toContain('SC-TEST-2027-001')
    expect(result.body).toContain('confirmation-email')
    expect(result.body).toContain('Submission confirmed once')
    expect(result.body).not.toContain('password=')
  })

  it('supports a seeded DOM-structure change without changing field semantics', () => {
    const result = run('GET', '/api/application-portal-fixture?run=fixture-test&seed=42&failure=changed_dom_structure&step=profile')
    expect(result.statusCode).toBe(200)
    expect(result.body).toContain('data-layout-version="2"')
    expect(result.body).toContain('name="legal_name"')
    expect(result.body).toContain('data-seed="42"')
  })

  it('exposes supplemental prompts and conditional questions in the canonical v2 portal', () => {
    const research = run('GET', '/api/application-portal-fixture?version=v2&step=research&seed=7')
    expect(research.body).toContain('Limit your response to 150 words.')
    expect(research.body).toContain('data-question-prompt=')
    const conduct = run('GET', '/api/application-portal-fixture?version=v2&step=conduct&seed=7')
    expect(conduct.body).toContain('conduct-detail')
    expect(conduct.body).toContain('Limit your response to 100 words.')
  })
})
