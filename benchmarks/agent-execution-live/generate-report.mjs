import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const controlled = JSON.parse(readFileSync(resolve(here, '../agent-execution/results/latest.json'), 'utf8')).runs
const livePayload = JSON.parse(readFileSync(resolve(here, 'results/latest.json'), 'utf8'))
const live = livePayload.runs
const categories = ['email', 'calendar', 'cross_tool', 'browser']
const labels = { email: 'Email', calendar: 'Calendar', cross_tool: 'Cross-tool', browser: 'Browser', overall: 'Overall' }
const chartDir = resolve(here, 'charts')
const summaryDir = resolve(here, 'yc-summary')
mkdirSync(chartDir, { recursive: true })
mkdirSync(summaryDir, { recursive: true })

if (live.length !== 60 && !process.argv.includes('--allow-partial')) {
  throw new Error(`Refusing to publish a final report with ${live.length}/60 live runs.`)
}

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const median = values => {
  const ordered = [...values].sort((a, b) => a - b)
  if (!ordered.length) return 0
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}
const group = (rows, category) => category === 'overall' ? rows : rows.filter(row => row.category === category)
const rate = (rows, field) => mean(rows.map(row => Number(row[field] ?? 0)))
const pct = value => `${Math.round(value * 100)}%`
const fixed = (value, places = 2) => Number(value).toFixed(places)
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const metrics = Object.fromEntries([...categories, 'overall'].map(category => {
  const rows = group(live, category)
  const successful = rows.filter(row => row.success === 1)
  return [category, {
    runs: rows.length,
    success: rate(rows, 'success'),
    precision: rate(rows, 'execution_precision'),
    intervention: successful.length ? mean(successful.map(row => Number(row.non_approval_human_interventions ?? 0))) : 0,
    medianIntervention: successful.length ? median(successful.map(row => Number(row.non_approval_human_interventions ?? 0))) : 0,
    distance: mean(rows.map(row => Number(row.distance_to_done ?? 0))),
    firstAttempt: rate(rows, 'first_attempt_success'),
    activeMedian: median(rows.map(row => Number(row.active_execution_time_seconds ?? 0))),
  }]
}))

const controlledMetrics = Object.fromEntries([...categories, 'overall'].map(category => {
  const rows = group(controlled, category)
  return [category, {
    success: rate(rows, 'success'), precision: rate(rows, 'execution_precision'),
    intervention: mean(rows.filter(row => row.success === 1).map(row => Number(row.human_interventions ?? 0))),
    distance: mean(rows.map(row => Number(row.distance_to_done ?? 0))),
  }]
}))

function baseSvg(title, subtitle, body, note = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <rect width="1600" height="900" fill="#F7F7F4"/>
  <style>text{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#111}.title{font-size:58px;font-weight:720;letter-spacing:-2.2px}.subtitle{font-size:23px;fill:#666}.label{font-size:24px;font-weight:620}.value{font-size:30px;font-weight:760}.note{font-size:18px;fill:#777}.small{font-size:19px;fill:#666}</style>
  <text class="title" x="100" y="110">${escape(title)}</text>
  <text class="subtitle" x="100" y="158">${escape(subtitle)}</text>
  ${body}
  ${note ? `<text class="note" x="100" y="852">${escape(note)}</text>` : ''}
  </svg>`
}

function horizontalBars({ title, subtitle, values, max = 1, percent = false, note = '', overall = false }) {
  const startY = 250
  const gap = 108
  const barX = 330
  const barW = 1080
  const body = values.map((item, index) => {
    const y = startY + index * gap
    const prominent = overall && item.key === 'overall'
    const width = Math.max(2, barW * Math.min(max, item.value) / max)
    const fill = prominent ? '#111111' : '#767C83'
    return `<text class="label" x="100" y="${y + 27}">${escape(item.label)}</text>
      <rect x="${barX}" y="${y}" width="${barW}" height="38" rx="2" fill="#E3E3DF"/>
      <rect x="${barX}" y="${y}" width="${width}" height="38" rx="2" fill="${fill}"/>
      <text class="value" x="1450" y="${y + 30}" text-anchor="end">${percent ? pct(item.value) : fixed(item.value, 2)}</text>`
  }).join('\n')
  return baseSvg(title, subtitle, body, note)
}

function pairedBars() {
  const startY = 245
  const gap = 112
  const x = 360
  const width = 1020
  const rows = [...categories, 'overall'].map((category, index) => {
    const y = startY + index * gap
    const controlledValue = controlledMetrics[category].success
    const liveValue = metrics[category].success
    return `<text class="label" x="100" y="${y + 29}">${labels[category]}</text>
      <rect x="${x}" y="${y}" width="${width * controlledValue}" height="28" fill="#C7C9C7"/>
      <rect x="${x}" y="${y + 38}" width="${width * liveValue}" height="28" fill="#171717"/>
      <text class="small" x="${x + width * controlledValue + 14}" y="${y + 23}">${pct(controlledValue)}</text>
      <text class="small" x="${x + width * liveValue + 14}" y="${y + 62}">${pct(liveValue)}</text>`
  }).join('\n')
  const legend = `<rect x="1120" y="170" width="22" height="12" fill="#C7C9C7"/><text class="small" x="1154" y="181">Controlled</text><rect x="1320" y="170" width="22" height="12" fill="#171717"/><text class="small" x="1354" y="181">Live</text>`
  return baseSvg('Controlled vs live execution performance', 'Same 20-task structure · three runs per task', `${legend}${rows}`, 'Controlled fixtures and live provider conditions are different evaluation environments.')
}

const hero = horizontalBars({
  title: 'ShotCount completes real-world tasks across tools',
  subtitle: '60 live AgentRun executions · 20 tasks × 3 runs',
  values: [...categories, 'overall'].map(key => ({ key, label: labels[key], value: metrics[key].success })),
  percent: true, overall: true,
  note: 'Live OpenAI inference and provider integrations; controlled test accounts used for safe repeatability.',
})
const comparison = pairedBars()
const precision = horizontalBars({
  title: metrics.overall.precision >= 0.95 ? 'ShotCount executes the intended action precisely' : 'Execution precision across live tools',
  subtitle: 'Correct external action with no duplicate or unintended write',
  values: [...categories, 'overall'].map(key => ({ key, label: labels[key], value: metrics[key].precision })),
  percent: true, overall: true,
})
const effort = horizontalBars({
  title: 'Successful tasks require little user rescue',
  subtitle: 'Mean non-approval interventions per successful run · required safety approvals excluded',
  values: categories.map(key => ({ key, label: labels[key], value: metrics[key].intervention })),
  max: Math.max(1, ...categories.map(key => metrics[key].intervention)),
})
const distance = horizontalBars({
  title: 'Distance to done by live task category',
  subtitle: 'Average score across every live run',
  values: categories.map(key => ({ key, label: labels[key], value: metrics[key].distance })),
  max: 5,
  note: '0 = no useful progress · 5 = requested outcome completed; intentional payment boundary uses the published scoring rule.',
})

function render(name, svg, directory = chartDir) {
  const svgPath = resolve(directory, `${name}.svg`)
  const pngPath = resolve(directory, `${name}.png`)
  writeFileSync(svgPath, `${svg}\n`)
  execFileSync('rsvg-convert', ['--width', '3200', '--height', '1800', '--output', pngPath, svgPath])
}

render('01-live-task-success', hero)
render('02-controlled-vs-live', comparison)
render('03-execution-precision', precision)
render('04-user-effort', effort)
render('05-distance-to-done', distance)

const totalCost = live.reduce((sum, row) => sum + Number(row.inference_cost_usd ?? 0), 0)
const failureCounts = live.filter(row => !row.success).reduce((counts, row) => {
  const key = row.failure_reason || 'other'
  counts[key] = (counts[key] ?? 0) + 1
  return counts
}, {})
const failureRows = Object.entries(failureCounts).sort((a, b) => b[1] - a[1])
const summarySvg = baseSvg(
  'SHOTCOUNT-EVAL LIVE',
  '20 tasks · 60 runs',
  `<text x="100" y="270" style="font-size:92px;font-weight:760;letter-spacing:-3px">${pct(metrics.overall.success)}</text><text class="small" x="100" y="310">Overall success</text>
   <text x="470" y="270" style="font-size:92px;font-weight:760;letter-spacing:-3px">${pct(metrics.overall.precision)}</text><text class="small" x="470" y="310">Execution precision</text>
   <text x="860" y="270" style="font-size:92px;font-weight:760;letter-spacing:-3px">${fixed(metrics.overall.medianIntervention, 1)}</text><text class="small" x="860" y="310">Median user rescue</text>
   <text x="1210" y="270" style="font-size:92px;font-weight:760;letter-spacing:-3px">${fixed(metrics.overall.distance, 1)}</text><text class="small" x="1210" y="310">Distance to done / 5</text>
   <line x1="100" y1="385" x2="1500" y2="385" stroke="#D8D8D4"/>
   ${categories.map((key, index) => `<text class="label" x="${100 + index * 360}" y="470">${labels[key]}</text><text x="${100 + index * 360}" y="555" style="font-size:66px;font-weight:740">${pct(metrics[key].success)}</text><text class="small" x="${100 + index * 360}" y="590">${metrics[key].runs} runs</text>`).join('')}
   <text class="note" x="100" y="750">Live OpenAI inference with real Gmail, Calendar, and browser execution.</text>
   <text class="note" x="100" y="783">Controlled test accounts used for safe repeatability. No comparison to other foundation-model providers is claimed.</text>`,
)
render('shotcount-eval-live-summary', summarySvg, summaryDir)
writeFileSync(resolve(summaryDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>SHOTCOUNT-EVAL LIVE</title><style>html,body{margin:0;background:#f7f7f4}img{display:block;width:100%;height:auto}</style><img src="shotcount-eval-live-summary.svg" alt="SHOTCOUNT-EVAL LIVE benchmark summary">\n`)

const byCategoryTable = categories.map(key => `| ${labels[key]} | ${metrics[key].runs} | ${pct(metrics[key].success)} | ${pct(metrics[key].precision)} | ${fixed(metrics[key].intervention, 2)} | ${fixed(metrics[key].distance, 2)} | ${fixed(metrics[key].activeMedian, 1)}s |`).join('\n')
const comparisonTable = [...categories, 'overall'].map(key => `| ${labels[key]} | ${pct(controlledMetrics[key].success)} | ${pct(metrics[key].success)} | ${(100 * (metrics[key].success - controlledMetrics[key].success)).toFixed(1)} pp |`).join('\n')
const evaluatedCommit = live[0]?.evaluated_commit ?? 'unavailable'
const report = `# SHOTCOUNT-EVAL LIVE v1

Across ${live.length} live production-path AgentRun executions, ShotCount completed **${pct(metrics.overall.success)}** of tasks with **${pct(metrics.overall.precision)} execution precision**. This benchmark evaluates ShotCount's end-to-end execution system—not foundation-model superiority.

ShotCount uses **OpenAI ${livePayload.model ?? 'gpt-5.6-sol'}** underneath. The measured system includes task title and Description context, intent classification, the agent harness, tool selection, approval policy, durable state, Gmail and Calendar integrations, and browser execution.

## Live results

| Category | Runs | Success | Precision | Non-approval interventions / successful run | Distance to done | Median active time |
|---|---:|---:|---:|---:|---:|---:|
${byCategoryTable}
| **Overall** | **${metrics.overall.runs}** | **${pct(metrics.overall.success)}** | **${pct(metrics.overall.precision)}** | **${fixed(metrics.overall.intervention, 2)}** | **${fixed(metrics.overall.distance, 2)}** | **${fixed(metrics.overall.activeMedian, 1)}s** |

First-attempt success was **${pct(metrics.overall.firstAttempt)}**. Median non-approval intervention count was **${fixed(metrics.overall.medianIntervention, 1)}**. Required safety approvals are excluded from user-rescue metrics.

## Controlled vs live

| Category | Controlled success | Live success | Gap |
|---|---:|---:|---:|
${comparisonTable}

Controlled v1 proves the harness under deterministic provider fixtures. Live v1 adds real model variance, real Google provider state, real network latency, and changing live webpages. The environments are deliberately comparable in task structure, not identical in difficulty.

## Failures

${failureRows.length ? failureRows.map(([reason, count]) => `- ${reason}: ${count} run${count === 1 ? '' : 's'}`).join('\n') : '- No failed runs.'}

Every failed official run remains in the raw CSV and JSON. Diagnostic preflight failures from benchmark development are preserved separately under \`results/preflight/\` and are not included in the 60-run denominator.

## Cost and configuration

- Evaluated ShotCount commit: \`${evaluatedCommit}\`
- OpenAI model: \`${livePayload.model ?? 'gpt-5.6-sol'}\`
- Reasoning: low
- Tool choice: auto; parallel tool calls disabled; maximum output 2,400 tokens
- Measured inference cost: **$${fixed(totalCost, 4)}**
- Pricing source: [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- Optional generic OpenAI baseline: not run; equivalent orchestration and safe provider parity could not be guaranteed within this evaluation without creating another harness.

## Claim discipline

The defensible claim is that **ShotCount is an execution system for ordinary to-do tasks**. This benchmark does not compare ShotCount with ChatGPT, Claude, Gemini, or public computer-use benchmarks, and it does not claim that ShotCount trained or uses a smarter foundation model.

## Limitations

- Controlled Google test accounts were used to avoid contacting unrelated people.
- Live webpage and provider behavior can change after the evaluation window.
- The 20-task set is intentionally small and product-shaped; it is not a general intelligence benchmark.
- Email wording quality was inspected but was not a primary success judge when provider state could be verified programmatically.
- Execution precision measures unintended or duplicate externally visible mutations; it is not a score of prose quality or overall task success.
- No flight purchase was attempted. Booking success ends at the verified user-controlled payment handoff.
`
writeFileSync(resolve(here, 'report.md'), report)

const methodology = `# SHOTCOUNT-EVAL LIVE v1 — Methodology

## Objective

Measure how reliably ShotCount moves ordinary human to-do items toward their intended real-world outcomes under live model and provider conditions. The unit under evaluation is the **ShotCount agent system**, not the OpenAI foundation model in isolation.

## System boundaries

- **Foundation model:** OpenAI \`${livePayload.model ?? 'gpt-5.6-sol'}\`, reasoning effort low, tool choice auto, parallel tool calls disabled, maximum output 2,400 tokens, response storage disabled.
- **Agent system:** ShotCount task title + Description, intent classification, durable AgentRun state, tool policy, approval gates, retries, asynchronous resumption, provider verification, and browser isolation.
- **Environment:** real Gmail and Google Calendar APIs on controlled accounts, plus real Google Flights pages through the production browser worker.

Evaluated ShotCount commit: \`${evaluatedCommit}\`.

## Task set and runs

The task structure matches Controlled v1: 5 Email, 5 Calendar, 5 Cross-tool, and 5 Browser tasks. Each task was run independently three times for 60 official runs. Fresh nonces, task IDs, model responses, provider fixtures, and AgentRuns prevented replay of cached successful outputs. Diagnostic preflight runs were excluded from aggregate metrics but preserved.

## Tools and approvals

The production tool set included Gmail search/read/draft/send/reply-watch, Google Contacts lookup, Calendar list/free-busy/create/update/delete, and isolated browser flight search/selection. Read and private preparation steps ran without approval. Email sends and Calendar writes required the normal user approval. Required safety approvals are reported separately and excluded from non-approval human intervention counts.

## Controlled accounts and state reset

Dedicated Gmail/Calendar accounts and uniquely marked messages were used so no unrelated person was contacted. Calendar fixtures were created before a run, verified through Google after execution, and deleted after the run. Drafts were deleted where the granted Gmail compose scope permitted it. At least one Cross-tool scenario used a genuine incoming Gmail reply; repeated reply cases used the controlled second account and are disclosed in the raw metadata.

## Verification

- **Email:** Gmail message/thread/draft/send state, recipient, subject/body requirements, and duplicate-send count.
- **Calendar:** exact provider event ID/state, date/time/duration, attendees, conflict state, and duplicate count.
- **Cross-tool:** Gmail + Calendar state and continuity of the same AgentRun across waiting and reply resumption.
- **Browser:** the production browser checkpoint and live Google Flights options, including origin, destination, date, cabin, stops, ranking constraints, HTTPS handoff, and zero purchases.

Programmatic provider state was the primary success judge whenever available. A model was not used as an outcome judge.

## Metrics and scoring

Task Success and Execution Precision are binary. Execution Precision records whether externally visible mutations were intended, idempotent, and free of duplicates; it does not substitute for Task Success or judge prose quality. Non-approval interventions, clarifications, corrections, retries, active execution time, and external wait time are recorded per run. Distance-to-Done uses a 0–5 scale: 0 means no useful progress and 5 means the requested outcome is complete. A booking task that safely reaches the verified payment boundary is scored according to the published intentional-boundary rule; payment itself is neither required nor attempted.

Every failure receives one primary cause from the fixed taxonomy. First-attempt success requires success with zero internal retries. Provider, model-decision, and harness contribution flags are stored separately.

## Cost

Before scaling, a real Calendar pilot cost $0.0143. A conservative 10× extrapolation was $8.57, below the $31.25 conservative equivalent used for the £25 gate. Actual measured OpenAI inference cost for the official batch was $${fixed(totalCost, 4)}. Token accounting includes regular input, cached input, cache writes, and output using [official OpenAI API pricing](https://developers.openai.com/api/docs/pricing). Google APIs and existing hosting were used; no evaluation product, other model provider, paid benchmark infrastructure, or purchase was added.

## Retry policy

Fresh official runs were never replaced by successful reruns. Safe retryable browser reads and itinerary preparation were retried automatically with a fixed bound; externally visible form submission and payment were never automatically retried. Original failures remain in the denominator.

## Limitations

This is a 20-task product benchmark, not a frontier-intelligence benchmark. Controlled accounts improve safety and repeatability but do not reproduce every inbox or calendar. Live webpage results can vary over time. Controlled v1 and Live v1 share task structure but are not identical environments. No cross-provider or generic-agent baseline is claimed.
`
writeFileSync(resolve(here, 'methodology.md'), methodology)

const summary = {
  runs: live.length,
  totalCostUsd: totalCost,
  metrics,
  controlledMetrics,
  failures: Object.fromEntries(failureRows),
}
writeFileSync(resolve(here, 'results/summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ runs: live.length, success: metrics.overall.success, precision: metrics.overall.precision, cost: totalCost }))
