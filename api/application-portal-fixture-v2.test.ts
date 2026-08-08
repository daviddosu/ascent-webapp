import { describe, expect, it } from 'vitest'
import portalFixture from './application-portal-fixture'

function render(url: string) {
  let status = 200
  let body = ''
  const response = {
    setHeader() {},
    status(code: number) { status = code; return response },
    send(value: string) { body = value },
  }
  portalFixture({ method: 'GET', url }, response)
  return { status, body }
}

describe('David v2 stochastic portal fixture', () => {
  it('varies natural-language labels while preserving semantic field names', () => {
    const first = render('/api/application-portal-fixture?version=v2&step=education&seed=11&run=a')
    const second = render('/api/application-portal-fixture?version=v2&step=education&seed=12&run=b')
    expect(first.status).toBe(200)
    expect(first.body).toContain('name="requirements_completed_date"')
    expect(first.body).toContain('name="ceremony_date"')
    expect(first.body).toContain('name="cumulative_gpa"')
    expect(first.body).not.toBe(second.body)
  })

  it('keeps final review distinct from submission confirmation', () => {
    const review = render('/api/application-portal-fixture?version=v2&step=review&seed=99&run=c')
    expect(review.body).toContain('separate verified readiness report')
    expect(review.body).not.toContain('Application ID:')
  })
})
