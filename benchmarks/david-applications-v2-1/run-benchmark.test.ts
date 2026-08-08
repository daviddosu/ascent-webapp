import { expect, it } from 'vitest'
import { runV21 } from './runner'

it('runs the frozen David application v2.1 failed-E2E regression set', async () => {
  if (process.env.DAVID_V21_BENCHMARK_RUN !== 'true') return
  const result = await runV21({
    endpoint: process.env.DAVID_V21_PROXY_URL!, token: process.env.DAVID_V21_PROXY_TOKEN!,
    repetitions: Number(process.env.DAVID_V21_REPETITIONS || 5), caseId: process.env.DAVID_V21_CASE || undefined,
    concurrency: Number(process.env.DAVID_V21_CONCURRENCY || 2), runGroupId: process.env.DAVID_V21_RUN_GROUP || undefined,
  })
  expect(result.results.length).toBeGreaterThan(0)
}, 60 * 60 * 1000)
