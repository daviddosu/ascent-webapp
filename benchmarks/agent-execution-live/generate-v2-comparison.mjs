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

const palette = ['#E87DB9', '#68C9C1', '#7867D8', '#F2A65A', '#B9DC73']

function editorialSvg(title, subtitle, body, note = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1160" viewBox="0 0 1600 1160">
  <rect width="1600" height="1160" fill="#FFFFFF"/>
  <style>text{font-family:Arial,Helvetica,sans-serif;fill:#111}.title{font-size:34px;font-weight:700}.subtitle{font-size:32px;font-weight:700}.axis{font-size:21px;font-weight:400}.label{font-size:23px;font-weight:400}.value{font-size:23px;font-weight:400}.note{font-size:18px;font-weight:400;fill:#555}.brand{font-size:35px;font-weight:400}</style>
  <text class="title" x="112" y="102">${esc(title)}</text>
  <text class="subtitle" x="112" y="142">${esc(subtitle)}</text>
  <text class="brand" x="1480" y="118" text-anchor="end">✦</text>
  ${body}${note ? `<text class="note" x="112" y="1110">${esc(note)}</text>` : ''}</svg>`
}

function verticalBars({ title, subtitle, values, maximum, unit, axisLabel, note = '' }) {
  const plotLeft = 240; const plotTop = 330; const plotBottom = 835
  const plotHeight = plotBottom - plotTop; const barWidth = 150
  const gap = values.length === 5 ? 74 : 126
  const ticks = maximum === 5 ? [0, 1, 2, 3, 4, 5] : [0, 20, 40, 60, 80, 100]
  const tickLabels = ticks.map(tick => {
    const y = plotBottom - (tick / maximum) * plotHeight
    return `<text class="axis" x="207" y="${y + 7}" text-anchor="end">${tick}</text>`
  }).join('')
  const bars = values.map((item, index) => {
    const x = plotLeft + index * (barWidth + gap)
    const height = Math.max(item.value === 0 ? 0 : 2, item.value / maximum * plotHeight)
    const y = plotBottom - height
    const color = palette[index % palette.length]
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="4" fill="${color}" fill-opacity="0.72" stroke="${color}" stroke-width="2"/>
      <text class="value" x="${x + barWidth / 2}" y="${Math.max(plotTop - 8, y - 14)}" text-anchor="middle">${item.display}</text>
      <text class="label" transform="translate(${x + 42} ${plotBottom + 45}) rotate(-48)" text-anchor="end">${esc(item.label)}</text>`
  }).join('')
  const axis = `<line x1="${plotLeft - 14}" y1="${plotBottom}" x2="1450" y2="${plotBottom}" stroke="#111" stroke-width="1"/>
    <text class="axis" transform="translate(145 ${plotTop + plotHeight / 2}) rotate(-90)" text-anchor="middle">${esc(axisLabel)}</text>`
  return editorialSvg(title, subtitle, `${tickLabels}${axis}${bars}`, note || `${values.length} categories · ${unit}`)
}

function render(name, content, dir = chartDir) {
  const source = resolve(dir, `${name}.svg`)
  writeFileSync(source, `${content}\n`)
  execFileSync('rsvg-convert', ['--width', '3200', '--height', '2320', '--output', resolve(dir, `${name}.png`), source])
}

const currentCategories = categories.map(key => ({ label: labels[key], value: after[key].success * 100, display: pct(after[key].success) }))
const currentWithOverall = [...currentCategories, { label: 'Overall', value: after.overall.success * 100, display: pct(after.overall.success) }]
render('01-v1-v2-success', verticalBars({ title: 'ShotCount Live Benchmark', subtitle: 'Task success across execution categories', values: currentWithOverall, maximum: 100, unit: 'success rate', axisLabel: 'Successful runs (%)', note: '20 tasks · 60 fresh production runs · three independent runs per task' }))
render('02-v1-v2-first-attempt', verticalBars({ title: 'First-attempt completion', subtitle: 'Successful before any internal retry', values: [...categories, 'overall'].map(key => ({ label: labels[key], value: after[key].firstAttempt * 100, display: pct(after[key].firstAttempt) })), maximum: 100, unit: 'first-attempt rate', axisLabel: 'First-attempt success (%)' }))
render('03-v1-v2-distance-to-done', verticalBars({ title: 'Distance to Done', subtitle: 'Average progress toward the intended outcome', values: [...categories, 'overall'].map(key => ({ label: labels[key], value: after[key].distance, display: fixed(after[key].distance, 2) })), maximum: 5, unit: 'score out of five', axisLabel: 'Distance to Done (0–5)' }))
render('04-failure-class-resolution', verticalBars({ title: 'Original failure recovery', subtitle: 'Resolved slots by failure class', values: [
  { label: 'Browser timeout / network', value: 8 / 9 * 100, display: '88.9%' },
  { label: 'Cross-tool verification', value: 100, display: '100%' },
  { label: 'Missing-context handling', value: 100, display: '100%' },
], maximum: 100, unit: 'recovered failure slots', axisLabel: 'Recovered original failures (%)', note: 'Fourteen of fifteen original failure slots recovered in the official 60-run result set' }))

render('shotcount-eval-live-v2-summary', verticalBars({ title: 'ShotCount Live Benchmark', subtitle: 'Reliability across real execution tools', values: currentCategories, maximum: 100, unit: 'success rate', axisLabel: 'Successful runs (%)', note: `Overall 98.3% · execution precision 100% · median user rescue 0 · Distance to Done 4.93 / 5` }), summaryDir)
writeFileSync(resolve(summaryDir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>ShotCount Live Benchmark</title><style>html,body{margin:0;background:#fff}img{display:block;width:100%;height:auto}</style><img src="shotcount-eval-live-v2-summary.svg" alt="ShotCount Live Benchmark summary">\n')

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
