import { it } from 'vitest'
import { runApplicantProductTrial, runThreeApplicantCleanTrials } from './applicant-simulator.ts'

it.skipIf(process.env.DAVID_APPLICANT_TRIAL !== 'true')('runs David as a synthetic graduate applicant through failure recovery and a three-run clean streak', async () => {
  process.env.SHOTCOUNT_BENCHMARK_MODE = 'true'
  const runId = process.env.DAVID_APPLICANT_RUN_ID || `david-applicant-${Date.now()}`
  const outputRoot = process.env.DAVID_APPLICANT_OUTPUT_ROOT || undefined
  const failureDriven = await runApplicantProductTrial({
    runId: `${runId}-failure-driven`,
    mode: 'failure_driven',
    outputDir: outputRoot ? `${outputRoot}/${runId}-failure-driven` : undefined,
  })
  if (process.env.DAVID_APPLICANT_FAILURE_ONLY === 'true') {
    console.log(JSON.stringify({ runId, failureDriven }, null, 2))
    if (!failureDriven.metrics.complete) throw new Error('The failure-driven applicant trial did not complete.')
    return
  }
  const clean = await runThreeApplicantCleanTrials({ baseRunId: runId, outputRoot })
  console.log(JSON.stringify({ runId, failureDriven: { complete: failureDriven.metrics.complete, cases: failureDriven.applicationCases, metrics: failureDriven.metrics, incidents: failureDriven.incidents }, cleanStreak: clean.summary }, null, 2))
  if (!failureDriven.metrics.complete || !clean.streak) throw new Error('The applicant benchmark did not qualify.')
}, 900_000)
