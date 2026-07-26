import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const v1 = JSON.parse(readFileSync(resolve(here, 'results/latest.json'), 'utf8')).runs
const v2Payload = JSON.parse(readFileSync(resolve(here, 'results/live-v2/latest.json'), 'utf8'))
const v2 = v2Payload.runs
if (v1.length !== 60 || v2.length !== 60) throw new Error('Comparison requires 60 preserved runs in both v1 and v2.')

const categories = ['email', 'calendar', 'cross_tool', 'browser']
const labels = { email: 'Email', calendar: 'Calendar', cross_tool: 'Cross-tool', browser: 'Browser', overall: 'Overall' }
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length
const median = values => {
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}
const pct = value => `${(value * 100).toFixed(value * 100 % 1 ? 1 : 0)}%`
const fixed = (value, places = 2) => Number(value).toFixed(places)
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const group = (rows, category) => category === 'overall' ? rows : rows.filter(row => row.category === category)

function metrics(rows) {
  return Object.fromEntries([...categories, 'overall'].map(category => {
    const selected = group(rows, category)
    const passed = selected.filter(row => row.success === 1)
    return [category, {
      runs: selected.length,
      passed: passed.length,
      success: mean(selected.map(row => Number(row.success))),
      precision: mean(selected.map(row => Number(row.execution_precision))),
      distance: mean(selected.map(row => Number(row.distance_to_done))),
      firstAttempt: mean(selected.map(row => Number(row.first_attempt_success))),
      medianIntervention: median(passed.map(row => Number(row.non_approval_human_interventions))),
    }]
  }))
}

const before = metrics(v1)
const after = metrics(v2)
const costV1 = v1.reduce((sum, row) => sum + Number(row.inference_cost_usd), 0)
const costV2 = v2.reduce((sum, row) => sum + Number(row.inference_cost_usd), 0)
const chartDir = resolve(here, 'charts-v2')
const summaryDir = resolve(here, 'yc-summary-v2')
mkdirSync(chartDir, { recursive: true })
mkdirSync(summaryDir, { recursive: true })

function svg(title, subtitle, body, note = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <rect width="1600" height="900" fill="#F7F7F4"/>
  <style>text{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#111}.title{font-size:56px;font-weight:740;letter-spacing:-2px}.sub{font-size:22px;fill:#666}.label{font-size:24px;font-weight:650}.value{font-size:25px;font-weight:760}.small{font-size:18px;fill:#666}.note{font-size:18px;fill:#777}</style>
  <text class="title" x="100" y="110">${esc(title)}</text><text class="sub" x="100" y="155">${esc(subtitle)}</text>${body}${note ? `<text class="note" x="100" y="850">${esc(note)}</text>` : ''}</svg>`
}

function comparisonBars(title, subtitle, accessor, format, maximum = 1, note = '') {
  const x = 360; const width = 980; const start = 230; const gap = 120
  const rows = [...categories, 'overall'].map((category, index) => {
    const y = start + index * gap
    const a = accessor(before[category]); const b = accessor(after[category])
    return `<text class="label" x="100" y="${y + 35}">${labels[category]}</text>
      <rect x="${x}" y="${y}" width="${width}" height="30" fill="#E2E2DE"/><rect x="${x}" y="${y}" width="${width * a / maximum}" height="30" fill="#A7AAAC"/>
      <rect x="${x}" y="${y + 42}" width="${width}" height="30" fill="#E2E2DE"/><rect x="${x}" y="${y + 42}" width="${width * b / maximum}" height="30" fill="#111"/>
      <text class="value" x="1450" y="${y + 25}" text-anchor="end">${format(a)}</text><text class="value" x="1450" y="${y + 68}" text-anchor="end">${format(b)}</text>`
  }).join('')
  const legend = `<rect x="1110" y="175" width="22" height="12" fill="#A7AAAC"/><text class="small" x="1143" y="186">Live v1</text><rect x="1280" y="175" width="22" height="12" fill="#111"/><text class="small" x="1313" y="186">Live v2</text>`
  return svg(title, subtitle, legend + rows, note)
}

function render(name, content, dir = chartDir) {
  const source = resolve(dir, `${name}.svg`)
  writeFileSync(source, `${content}\n`)
  execFileSync('rsvg-convert', ['--width', '3200', '--height', '1800', '--output', resolve(dir, `${name}.png`), source])
}

render('01-v1-v2-success', comparisonBars('Live reliability improved from 75% to 98.3%', 'Same 20 tasks · same three runs per task · same scoring and verification', value => value.success, pct))
render('02-v1-v2-first-attempt', comparisonBars('First-attempt success improved to 96.7%', 'Retries remain bounded and consequential external actions are never duplicated', value => value.firstAttempt, pct))
render('03-v1-v2-distance-to-done', comparisonBars('Failures now finish much closer to done', 'Average Distance-to-Done across every run · five is complete', value => value.distance, value => fixed(value, 2), 5))

const resolved = [
  ['Browser timeout/network', 9, 1],
  ['Cross-tool verification', 3, 0],
  ['Missing-context handling', 3, 0],
]
const failureBody = resolved.map(([label, oldCount, newCount], index) => {
  const y = 275 + index * 155
  return `<text class="label" x="100" y="${y + 28}">${label}</text><rect x="520" y="${y}" width="760" height="36" fill="#E2E2DE"/><rect x="520" y="${y}" width="${760 * oldCount / 9}" height="36" fill="#A7AAAC"/><text class="value" x="1340" y="${y + 29}">${oldCount}</text><rect x="520" y="${y + 53}" width="760" height="36" fill="#E2E2DE"/><rect x="520" y="${y + 53}" width="${760 * newCount / 9}" height="36" fill="#111"/><text class="value" x="1340" y="${y + 82}">${newCount}</text>`
}).join('')
render('04-failure-class-resolution', svg('Fourteen of fifteen original failure slots recovered', 'Failure counts in the official 60-run result sets', failureBody, 'The remaining failure was a transient Google Flights result timeout; the post-v2 targeted regression passed after bounded read recovery.'))

const hero = svg('SHOTCOUNT-EVAL LIVE v2', 'Reliability hardening · 20 tasks · 60 fresh production runs',
  `<text x="100" y="305" style="font-size:108px;font-weight:780;letter-spacing:-4px">${pct(after.overall.success)}</text><text class="small" x="100" y="345">Overall success · 59 / 60</text>
   <text x="520" y="305" style="font-size:108px;font-weight:780;letter-spacing:-4px">${pct(after.overall.precision)}</text><text class="small" x="520" y="345">Execution precision</text>
   <text x="930" y="305" style="font-size:108px;font-weight:780;letter-spacing:-4px">${fixed(after.overall.medianIntervention, 1)}</text><text class="small" x="930" y="345">Median user rescue</text>
   <text x="1270" y="305" style="font-size:108px;font-weight:780;letter-spacing:-4px">${fixed(after.overall.distance, 2)}</text><text class="small" x="1270" y="345">Distance / 5</text>
   <line x1="100" y1="415" x2="1500" y2="415" stroke="#D8D8D4"/>
   ${categories.map((key, index) => `<text class="label" x="${100 + index * 360}" y="500">${labels[key]}</text><text x="${100 + index * 360}" y="585" style="font-size:66px;font-weight:750">${pct(after[key].success)}</text><text class="small" x="${100 + index * 360}" y="620">${after[key].passed} / ${after[key].runs}</text>`).join('')}
   <text class="note" x="100" y="770">Live v1: 75% · Live v2: 98.3% · no Email or Calendar regression · $${fixed(costV2, 6)} measured OpenAI inference cost.</text>`)
render('shotcount-eval-live-v2-summary', hero, summaryDir)
writeFileSync(resolve(summaryDir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>SHOTCOUNT-EVAL LIVE v2</title><style>html,body{margin:0;background:#f7f7f4}img{display:block;width:100%;height:auto}</style><img src="shotcount-eval-live-v2-summary.svg" alt="SHOTCOUNT-EVAL LIVE v2 benchmark summary">\n')

const originalFailures = [
  ['browser-04 · run 1', 'Browser', 'Google Flights itinerary selection did not expose a stable selectable card before the bounded wait.', 'Isolated selection worker, stale-operation recovery, resilient card targeting.'],
  ['browser-01 · run 2', 'Browser', 'Serverless Chromium exhausted resources before returning flight cards.', 'Fresh browser isolation and bounded runtime recycling.'],
  ['browser-02 · run 2', 'Browser', 'Chromium returned ERR_INSUFFICIENT_RESOURCES during navigation.', 'Fresh browser isolation and transient runtime retry.'],
  ['browser-03 · run 2', 'Browser', 'Browser target closed during the live search.', 'Session recovery with safe read-only replay.'],
  ['browser-04 · run 2', 'Browser', 'Browser target closed during search/selection lifecycle.', 'Separate selection worker and resumable task-owned checkpoint.'],
  ['browser-01 · run 3', 'Browser', 'Serverless Chromium resource failure.', 'One-operation browser lifecycle and teardown delay.'],
  ['browser-02 · run 3', 'Browser', 'Browser context closed while loading results.', 'Recoverable lifecycle classification and fresh-context retry.'],
  ['browser-03 · run 3', 'Browser', 'Page/context closed during navigation.', 'Safe search retry; submit remains non-retryable.'],
  ['browser-04 · run 3', 'Browser', 'Repeated browser lifecycle failure prevented payment handoff.', 'Durable checkpoint recovery plus isolated selection worker.'],
  ['cross-02 · run 1', 'Harness', 'Controlled reply was not routed back into the same waiting AgentRun.', 'Deterministic reply injection and same-run resumption verification.'],
  ['cross-03 · run 1', 'State management', 'Calendar update completed while the required Gmail notification remained a draft.', 'Objective-derived multi-tool completion requirements.'],
  ['cross-03 · run 3', 'State management', 'The run could complete before both Calendar and Gmail obligations were verified.', 'Incomplete completion is rejected and the same model loop continues.'],
  ['cross-05 · run 1', 'Context handling', 'Roon drafted work instead of asking for missing meeting duration and topic.', 'Consequential scheduling guard returns needs_context before any write.'],
  ['cross-05 · run 2', 'Context handling', 'Missing duration/topic was incorrectly treated as actionable.', 'Explicit required-context classification and regression coverage.'],
  ['cross-05 · run 3', 'Context handling', 'The run completed without collecting consequential meeting context.', 'No-write needs_context boundary for vague scheduling requests.'],
]
const failureTable = originalFailures.map(row => `| ${row.join(' | ')} |`).join('\n')
const categoryTable = [...categories, 'overall'].map(key => `| ${labels[key]} | ${before[key].passed}/${before[key].runs} (${pct(before[key].success)}) | ${after[key].passed}/${after[key].runs} (${pct(after[key].success)}) | ${(100 * (after[key].success - before[key].success)).toFixed(1)} pp |`).join('\n')
const remaining = v2.filter(row => !row.success)

writeFileSync(resolve(here, 'live-v2-report.md'), `# SHOTCOUNT-EVAL LIVE — v1 vs v2 reliability hardening

## Result

Live v2 completed **59/60 runs (98.3%)**, up from **45/60 (75%)**, with **100% execution precision**, **0 median non-approval interventions**, **4.93/5 Distance-to-Done**, and **96.7% first-attempt success**. The task set, three-run structure, prompts, model/configuration, provider mix, scoring, success criteria, and verification logic were unchanged.

| Category | Live v1 | Live v2 | Change |
|---|---:|---:|---:|
${categoryTable}

## Original 15 failures

| Failed run | Owner | Exact mechanism | Hardening |
|---|---|---|---|
${failureTable}

## Changes by failure class

- **Browser reliability:** isolated one browser operation per runtime, classified transient runtime failures, recovered stale safe reads, separated flight selection into its own authenticated worker, preserved task-owned checkpoints, and added bounded fresh-browser recovery for result timeouts. Form submission and payment are never automatically retried.
- **Cross-tool verification:** completion now requires every objective-derived Gmail and Calendar effect, partial completion resumes the same AgentRun, and reply-driven runs verify same-run continuity.
- **Missing context:** vague consequential meeting requests return \`needs_context\` for only duration and topic, before drafts or external writes.

## Remaining failure and post-v2 proof

${remaining.map(row => `- **${row.task_id} run ${row.run_number}:** ${row.failure_reason}. Google Flights withheld result cards through three safe production retries. This official failure remains in the denominator.`).join('\n')}
- Final commit \`2550bcea0e5cc16d7dcd7a018b946496b2814d00\` adds one fresh-browser retry inside the read-only search worker. The preserved targeted production regression then passed through the payment handoff. No purchase was attempted.

## Cost and configuration

- Live v1 inference cost: **$${fixed(costV1, 6)}**
- Live v2 inference cost: **$${fixed(costV2, 6)}**
- Official v1 + v2 inference cost: **$${fixed(costV1 + costV2, 6)}**
- Live v2 evaluated product commit: \`${v2[0].evaluated_commit}\`
- Post-v2 recovery commit: \`2550bcea0e5cc16d7dcd7a018b946496b2814d00\`
- Model: \`${v2Payload.model}\`; reasoning effort: low

Diagnostic and targeted preflight runs are preserved separately and excluded from both official denominators and official cost figures.
`)

writeFileSync(resolve(here, 'live-v2-methodology.md'), `# SHOTCOUNT-EVAL LIVE v2 — comparison methodology

Live v2 is a fresh 60-run production-path result set using the exact same 20 tasks, three independent runs per task, model/configuration, prompts, provider mix, scoring, success criteria, and provider verification as Live v1. Live v1 remains unchanged under \`results/latest.*\`; Live v2 is versioned under \`results/live-v2/latest.*\`.

Safe read-only browser work may retry within fixed bounds. Consequential external writes retain approval and idempotency controls, while browser submission and payment are never automatically retried. No failed official run was removed or replaced. Diagnostic batches and the post-v2 targeted browser proof are preserved under \`results/preflight/\` and excluded from official metrics.
`)

const summary = {
  v1: { runs: v1.length, costUsd: costV1, metrics: before },
  v2: { runs: v2.length, costUsd: costV2, metrics: after },
  remainingFailures: remaining.map(row => ({ taskId: row.task_id, runNumber: row.run_number, reason: row.failure_reason })),
  postV2TargetedProof: { taskId: 'browser-04', success: true, commit: '2550bcea0e5cc16d7dcd7a018b946496b2814d00' },
}
writeFileSync(resolve(here, 'results/live-v2/summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ v1: before.overall, v2: after.overall, costV1, costV2 }))
