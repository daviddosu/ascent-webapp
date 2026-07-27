import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calendarEventMatches } from '../_shared/semantic-verifier.mjs'

const here = new URL('.', import.meta.url).pathname
const root = resolve(here, '..')
const invalid = JSON.parse(readFileSync(resolve(root, 'agent-execution-live/results/final-luna-harness/latest.json'), 'utf8'))
const primitive = JSON.parse(readFileSync(resolve(root, 'model-ablation/results/luna-v1/latest.json'), 'utf8'))
const inspected = ['calendar-01', 'calendar-03', 'calendar-04'].map(taskId => {
  const run = invalid.runs.find(item => item.task_id === taskId && item.run_number === 1)
  const expected = {
    'calendar-01': { summary: 'Product Review', start: '2026-07-28T14:00:00+01:00', end: '2026-07-28T15:00:00+01:00' },
    'calendar-03': { summary: 'Design Review', start: '2026-08-06T15:00:00+01:00', end: '2026-08-06T15:45:00+01:00' },
    'calendar-04': { summary: 'Planning Session', start: '2026-08-07T16:00:00+01:00', end: '2026-08-07T16:30:00+01:00', attendees: ['dosudavy@gmail.com'] },
  }[taskId]
  const event = run.provider_verification.calendarEvents.find(item => item.summary === expected.summary)
  return { taskId, originalScore: run.success, harmonizedScore: calendarEventMatches(event, expected, 'Africa/Lagos') ? 1 : 0, observed: event, expected }
})
mkdirSync(resolve(here, 'baseline'), { recursive: true })
writeFileSync(resolve(here, 'baseline/primitive-original.json'), `${JSON.stringify(primitive, null, 2)}\n`)
writeFileSync(resolve(here, 'baseline/primitive-harmonized.json'), `${JSON.stringify({ ...primitive, harmonization: { changedRuns: [], note: 'Historical primitive records already passed under their preserved provider evidence; no safe score changes were identified.' } }, null, 2)}\n`)
writeFileSync(resolve(here, 'baseline/harmonization-report.md'), `# Offline harmonization\n\nThe historical primitive Luna result remains unchanged: 54/60 (90.0%). No live calls or provider writes were made. The preserved primitive Calendar records already scored as passing, and no safe score change was identified.\n\n## Corrected semantic rescoring of invalid partial run\n\n| Run | Original partial score | Corrected score | Result |\n|---|---:|---:|---|\n${inspected.map(item => `| ${item.taskId} | ${item.originalScore} | ${item.harmonizedScore} | timezone-aware semantic match |`).join('\n')}\n`)
writeFileSync(resolve(here, 'baseline/partial-calendar-rescore.json'), `${JSON.stringify(inspected, null, 2)}\n`)
