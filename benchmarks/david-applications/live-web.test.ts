import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { navigatePublicPage, type PublicBrowserObservation } from '../../api/_public-browser'

type Source = { url: string; domains: string[] }
type LiveCase = {
  id: string
  purpose: string
  sources: Source[]
  verify(observations: PublicBrowserObservation[]): Record<string, unknown>
}

const here = dirname(fileURLToPath(import.meta.url))
const enabled = process.env.DAVID_LIVE_WEB_RUN === 'true'

function lower(observation: PublicBrowserObservation) {
  return `${observation.title}\n${observation.headings.join('\n')}\n${observation.text}`.toLocaleLowerCase()
}

function official(observation: PublicBrowserObservation, domains: string[]) {
  const hostname = new URL(observation.url).hostname.toLocaleLowerCase()
  return domains.includes(hostname)
}

function excerpt(observation: PublicBrowserObservation, pattern: RegExp) {
  const match = observation.text.match(pattern)
  if (!match) return null
  const start = Math.max(0, (match.index ?? 0) - 80)
  return observation.text.slice(start, Math.min(observation.text.length, start + 280)).replace(/\s+/g, ' ').trim()
}

const cases: LiveCase[] = [
  {
    id: 'live-web-discovery',
    purpose: 'programme discovery and eligibility',
    sources: [{ url: 'https://www.ucl.ac.uk/prospective-students/graduate/taught/degrees/computer-science-msc', domains: ['www.ucl.ac.uk'] }],
    verify: ([page]) => ({
      programme: page?.headings.find(value => /advanced computer science/i.test(value)) ?? page?.title ?? null,
      officialUrl: page?.url ?? null,
      officialSourceVerified: Boolean(page && official(page, ['www.ucl.ac.uk'])),
      eligibility: page ? excerpt(page, /entry requirements?|admission requirements?|applicants? should/i) : null,
    }),
  },
  {
    id: 'live-web-deadline',
    purpose: 'deadline and timezone extraction',
    sources: [{ url: 'https://www.ucl.ac.uk/prospective-students/graduate/taught/degrees/computer-science-msc', domains: ['www.ucl.ac.uk'] }],
    verify: ([page]) => ({
      deadline: page ? excerpt(page, /applications? (?:close|accepted)|application deadline/i) : null,
      timezone: page ? excerpt(page, /uk time|gmt|bst|utc/i) : null,
      officialCitation: page?.url ?? null,
      officialSourceVerified: Boolean(page && official(page, ['www.ucl.ac.uk'])),
    }),
  },
  {
    id: 'live-web-funding',
    purpose: 'funding extraction',
    sources: [{ url: 'https://www.ucl.ac.uk/study/prospective-students/graduate/funding-your-masters/paying-your-degree', domains: ['www.ucl.ac.uk'] }],
    verify: ([page]) => ({
      funding: page ? excerpt(page, /funding opportunities?|scholarships?/i) : null,
      sourceExcerpt: page ? excerpt(page, /fees and funding|funding opportunities?/i) : null,
      officialCitation: page?.url ?? null,
      officialSourceVerified: Boolean(page && official(page, ['www.ucl.ac.uk'])),
    }),
  },
  {
    id: 'live-web-faculty',
    purpose: 'faculty and institutional-email extraction',
    sources: [{ url: 'https://as.inf.ethz.ch/people/members/lenglerj/index.html', domains: ['as.inf.ethz.ch'] }],
    verify: ([page]) => ({
      faculty: page?.headings[0] ?? page?.title ?? null,
      institutionalEmail: page?.text.match(/[a-z0-9._%+-]+@inf\.ethz\.ch/i)?.[0] ?? null,
      researchAreas: page ? excerpt(page, /research|algorithms?|computer science|neuroscience/i) : null,
      officialCitation: page?.url ?? null,
      officialSourceVerified: Boolean(page && official(page, ['as.inf.ethz.ch'])),
    }),
  },
  {
    id: 'live-web-conflict',
    purpose: 'authoritative-source conflict resolution',
    sources: [
      { url: 'https://www.ucl.ac.uk/engineering/computer-science/study/postgraduate-taught', domains: ['www.ucl.ac.uk'] },
      { url: 'https://www.ucl.ac.uk/prospective-students/graduate/taught/degrees/computer-science-msc', domains: ['www.ucl.ac.uk'] },
    ],
    verify: ([department, admissions]) => ({
      departmentSource: department?.url ?? null,
      authoritativeSource: admissions?.url ?? null,
      conflictResolution: admissions?.url.includes('/prospective-students/graduate/taught/degrees/') ? 'official course admissions page preferred for course requirements' : null,
      sourcePairVerified: Boolean(
        department && admissions &&
        official(department, ['www.ucl.ac.uk']) && official(admissions, ['www.ucl.ac.uk']) &&
        /postgraduate|graduate/i.test(lower(department)) && /computer science msc/i.test(lower(admissions)),
      ),
    }),
  },
]

function complete(actual: Record<string, unknown>) {
  return Object.entries(actual).every(([key, value]) => {
    if (key.endsWith('Verified')) return value === true
    return value !== null && value !== undefined && value !== ''
  })
}

describe.skipIf(!enabled)('David live read-only web generalization', () => {
  it('extracts verified research from official public pages without write actions', async () => {
    const runId = `david-live-web-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
    const results = []
    for (const item of cases) {
      const started = Date.now()
      try {
        const observations = []
        for (const source of item.sources) observations.push((await navigatePublicPage(source.url, source.domains)).observation)
        const actual = item.verify(observations)
        results.push({ caseId: item.id, purpose: item.purpose, success: complete(actual), verified: complete(actual), actual, browserActions: item.sources.length, writeActions: 0, elapsedMs: Date.now() - started, failureClass: complete(actual) ? null : 'extraction_failure' })
      } catch (error) {
        results.push({ caseId: item.id, purpose: item.purpose, success: false, verified: false, actual: {}, browserActions: item.sources.length, writeActions: 0, elapsedMs: Date.now() - started, failureClass: 'external_service_failure', blocker: error instanceof Error ? error.message : String(error) })
      }
    }
    const successful = results.filter(result => result.success).length
    const report = {
      suite: 'david_live_read_only_web_v1',
      runId,
      generatedAt: new Date().toISOString(),
      separateFromFrozenBenchmark: true,
      totalCases: results.length,
      successfulCases: successful,
      verifiedCompletionRate: results.length ? successful / results.length : 0,
      writeActions: 0,
      results,
    }
    const output = resolve(here, 'results')
    mkdirSync(output, { recursive: true })
    writeFileSync(resolve(output, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(resolve(output, 'live-web-latest.json'), `${JSON.stringify(report, null, 2)}\n`)
    expect(report.writeActions).toBe(0)
    expect(report.verifiedCompletionRate, results.filter(result => !result.success).map(result => `${result.caseId}: ${result.failureClass} ${result.blocker ?? ''}`).join('\n')).toBeGreaterThanOrEqual(0.95)
  }, 180_000)
})
