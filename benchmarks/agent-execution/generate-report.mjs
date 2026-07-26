import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const payload = JSON.parse(readFileSync(resolve(here, 'results/latest.json'), 'utf8'))
const tasks = JSON.parse(readFileSync(resolve(here, 'tasks.json'), 'utf8')).tasks
const runs = payload.runs
const chartsDir = resolve(here, 'charts')
mkdirSync(chartsDir, { recursive: true })

const categoryOrder = ['email', 'calendar', 'cross_tool', 'browser']
const labels = { email: 'Email', calendar: 'Calendar', cross_tool: 'Cross-tool', browser: 'Browser' }
const colors = { email: '#0D6B5E', calendar: '#3F6FB6', cross_tool: '#7955A3', browser: '#C75B39', overall: '#181A1B' }
const avg = values => values.reduce((sum, value) => sum + value, 0) / values.length
const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const pct = value => `${Math.round(value * 100)}%`
const wilson95 = (successes, total) => {
  const z = 1.959963984540054
  const proportion = successes / total
  const denominator = 1 + z * z / total
  const center = (proportion + z * z / (2 * total)) / denominator
  const margin = z * Math.sqrt(proportion * (1 - proportion) / total + z * z / (4 * total * total)) / denominator
  return [center - margin, center + margin]
}
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const byCategory = Object.fromEntries(categoryOrder.map(category => [category, runs.filter(run => run.category === category)]))
const stats = {
  successRate: avg(runs.map(run => run.success)),
  precision: avg(runs.map(run => run.execution_precision)),
  successByCategory: Object.fromEntries(categoryOrder.map(category => [category, avg(byCategory[category].map(run => run.success))])),
  precisionByCategory: Object.fromEntries(categoryOrder.map(category => [category, avg(byCategory[category].map(run => run.execution_precision))])),
  averageInterventionsSuccessful: avg(runs.filter(run => run.success).map(run => run.human_interventions)),
  medianInterventions: median(runs.map(run => run.human_interventions)),
  medianActiveTime: median(runs.map(run => run.active_time_seconds)),
  averageDistance: avg(runs.map(run => run.distance_to_done)),
  distanceByCategory: Object.fromEntries(categoryOrder.map(category => [category, avg(byCategory[category].map(run => run.distance_to_done))])),
  interventionsByCategory: Object.fromEntries(categoryOrder.map(category => {
    const successful = byCategory[category].filter(run => run.success)
    return [category, avg(successful.map(run => run.human_interventions))]
  })),
  clarificationRate: avg(runs.map(run => run.clarifications > 0 ? 1 : 0)),
  successWilson95: wilson95(runs.filter(run => run.success).length, runs.length),
  precisionWilson95: wilson95(runs.filter(run => run.execution_precision).length, runs.length),
}

function shell(title, subtitle, content, footnote = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <rect width="1600" height="1000" fill="#FBFBF8"/>
  <style>
    text { font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #181A1B; }
    .title { font-size: 48px; font-weight: 650; letter-spacing: -1.4px; }
    .subtitle { font-size: 23px; fill: #626866; }
    .label { font-size: 22px; font-weight: 560; }
    .value { font-size: 25px; font-weight: 680; }
    .axis { font-size: 18px; fill: #777D7A; }
    .note { font-size: 17px; fill: #777D7A; }
  </style>
  <text x="120" y="110" class="title">${esc(title)}</text>
  <text x="120" y="155" class="subtitle">${esc(subtitle)}</text>
  ${content}
  ${footnote ? `<text x="120" y="948" class="note">${esc(footnote)}</text>` : ''}
</svg>`
}

function writeChart(name, svg) {
  const svgPath = resolve(chartsDir, `${name}.svg`)
  const pngPath = resolve(chartsDir, `${name}.png`)
  writeFileSync(svgPath, svg)
  execFileSync('rsvg-convert', ['--width', '3200', '--height', '2000', '--output', pngPath, svgPath])
}

function successChart() {
  const entries = [...categoryOrder.map(category => ({ key: category, label: labels[category], value: stats.successByCategory[category] })), { key: 'overall', label: 'Overall', value: stats.successRate }]
  const left = 190, top = 265, width = 1250, chartHeight = 560
  let content = ''
  for (const tick of [0, .25, .5, .75, 1]) {
    const y = top + chartHeight - tick * chartHeight
    content += `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="#E4E5E1" stroke-width="1"/>`
    content += `<text x="${left - 28}" y="${y + 7}" text-anchor="end" class="axis">${Math.round(tick * 100)}%</text>`
  }
  const barWidth = 150, gap = 90
  entries.forEach((entry, index) => {
    const x = left + 70 + index * (barWidth + gap)
    const height = entry.value * chartHeight
    const y = top + chartHeight - height
    content += `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="5" fill="${colors[entry.key]}"/>`
    content += `<text x="${x + barWidth / 2}" y="${y - 18}" text-anchor="middle" class="value">${pct(entry.value)}</text>`
    content += `<text x="${x + barWidth / 2}" y="${top + chartHeight + 44}" text-anchor="middle" class="label">${entry.label}</text>`
  })
  return shell('ShotCount completes real-world tasks across tools', 'Task success across 60 controlled AgentRun executions · 20 tasks × 3 runs', content, 'Required approvals are excluded from intervention counts. All failed runs remain included.')
}

function distanceChart() {
  const left = 390, top = 280, width = 980
  let content = ''
  for (let tick = 0; tick <= 5; tick += 1) {
    const x = left + tick / 5 * width
    content += `<line x1="${x}" y1="${top - 45}" x2="${x}" y2="${top + 450}" stroke="#E4E5E1" stroke-width="1"/>`
    content += `<text x="${x}" y="${top + 500}" text-anchor="middle" class="axis">${tick}</text>`
  }
  categoryOrder.forEach((category, index) => {
    const y = top + index * 120
    const value = stats.distanceByCategory[category]
    const x = left + value / 5 * width
    content += `<text x="${left - 35}" y="${y + 8}" text-anchor="end" class="label">${labels[category]}</text>`
    content += `<line x1="${left}" y1="${y}" x2="${x}" y2="${y}" stroke="${colors[category]}" stroke-width="5" opacity=".26"/>`
    content += `<circle cx="${x}" cy="${y}" r="15" fill="${colors[category]}"/>`
    content += `<text x="${x - 28}" y="${y - 25}" text-anchor="end" class="value">${value.toFixed(1)}</text>`
  })
  content += `<text x="${left}" y="${top + 555}" class="note">0 = no useful progress</text><text x="${left + width}" y="${top + 555}" text-anchor="end" class="note">5 = requested outcome completed</text>`
  return shell('ShotCount moves tasks close to their intended outcome', `Average Distance-to-Done score · overall ${stats.averageDistance.toFixed(1)} of 5`, content)
}

function interventionChart() {
  const left = 410, top = 280, width = 900, max = .5
  let content = ''
  for (const tick of [0, .1, .2, .3, .4, .5]) {
    const x = left + tick / max * width
    content += `<line x1="${x}" y1="${top - 50}" x2="${x}" y2="${top + 450}" stroke="#E4E5E1" stroke-width="1"/>`
    content += `<text x="${x}" y="${top + 505}" text-anchor="middle" class="axis">${tick.toFixed(1)}</text>`
  }
  categoryOrder.forEach((category, index) => {
    const y = top + index * 120
    const value = stats.interventionsByCategory[category]
    const x = left + value / max * width
    content += `<text x="${left - 35}" y="${y + 8}" text-anchor="end" class="label">${labels[category]}</text>`
    content += `<line x1="${left}" y1="${y}" x2="${x}" y2="${y}" stroke="${colors[category]}" stroke-width="8" opacity=".7"/>`
    content += `<circle cx="${x}" cy="${y}" r="13" fill="${colors[category]}"/>`
    content += `<text x="${Math.max(x + 28, left + 35)}" y="${y + 8}" class="value">${value.toFixed(1)}</text>`
  })
  content += `<text x="${left}" y="${top + 565}" class="note">← Lower is better</text>`
  return shell('Most tasks require little user rescue', 'Average non-approval interventions per successful run', content, 'Intentional send/calendar approvals are safety boundaries, not interventions.')
}

function frictionChart() {
  const left = 270, top = 250, width = 1060, height = 550, maxX = .4
  let content = `<rect x="${left}" y="${top}" width="${width * .5}" height="${height * .25}" fill="#EAF4EF" opacity=".75"/><text x="${left + 30}" y="${top + 42}" class="note" fill="#3F6B57">IDEAL REGION</text>`
  for (const tick of [0, .1, .2, .3, .4]) {
    const x = left + tick / maxX * width
    content += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + height}" stroke="#E4E5E1"/><text x="${x}" y="${top + height + 42}" text-anchor="middle" class="axis">${tick.toFixed(1)}</text>`
  }
  for (const tick of [0, .25, .5, .75, 1]) {
    const y = top + height - tick * height
    content += `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="#E4E5E1"/><text x="${left - 25}" y="${y + 7}" text-anchor="end" class="axis">${Math.round(tick * 100)}%</text>`
  }
  const categoryPoints = categoryOrder.map(category => ({
    category,
    x: stats.interventionsByCategory[category],
    y: stats.successByCategory[category],
  }))
  categoryPoints.forEach(({ category, x, y }, index) => {
    const cx = left + x / maxX * width
    const cy = top + height - y * height
    const overlapping = category === 'email' || category === 'cross_tool'
    content += overlapping
      ? `<circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="${colors[category]}" stroke-width="8"/>`
      : `<circle cx="${cx}" cy="${cy}" r="14" fill="${colors[category]}" stroke="#FBFBF8" stroke-width="3"/>`
    const labelX = cx + 38
    const labelY = category === 'email' ? cy - 28 : category === 'calendar' ? cy + 48 : category === 'cross_tool' ? cy + 54 : cy + 88
    content += `<line x1="${cx + 12}" y1="${cy}" x2="${labelX - 8}" y2="${labelY - 7}" stroke="${colors[category]}" stroke-width="2" opacity=".6"/>`
    content += `<text x="${labelX}" y="${labelY}" class="label">${labels[category]} · ${pct(y)} success · ${x.toFixed(1)} interventions</text>`
  })
  content += `<text x="${left + width / 2}" y="${top + height + 100}" text-anchor="middle" class="label">Non-approval human interventions per run →</text>`
  content += `<text x="80" y="${top + height / 2}" text-anchor="middle" class="label" transform="rotate(-90 80 ${top + height / 2})">Task success rate →</text>`
  return shell('Execution quality improves without adding user work', 'Each marker is one category · high success and low intervention is better', content)
}

writeChart('01-task-success-rate', successChart())
writeChart('02-distance-to-done', distanceChart())
writeChart('03-human-intervention', interventionChart())
writeChart('04-success-vs-friction', frictionChart())

const failureCounts = Object.entries(runs.reduce((counts, run) => {
  if (run.failure_reason) counts[run.failure_reason] = (counts[run.failure_reason] ?? 0) + 1
  return counts
}, {}))
const summary = {
  ...stats,
  taskCount: tasks.length,
  runCount: runs.length,
  failureDistribution: Object.fromEntries(failureCounts),
}
writeFileSync(resolve(here, 'results/summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

const report = `# ShotCount agent-execution benchmark

**Benchmark:** v${payload.benchmarkVersion}  
**Evaluated commit:** \`${payload.evaluatedCommit}\`  
**Task set:** 20 tasks, 3 runs each, 60 total runs  
**Execution mode:** controlled AgentRun/provider fixtures

## Result

ShotCount achieved **${pct(stats.successRate)} task success** (95% Wilson interval ${pct(stats.successWilson95[0])}–${pct(stats.successWilson95[1])}) and **${pct(stats.precision)} execution precision** (95% Wilson interval ${pct(stats.precisionWilson95[0])}–${pct(stats.precisionWilson95[1])}) across the frozen benchmark. Average Distance-to-Done was **${stats.averageDistance.toFixed(2)} / 5**. Successful runs required **${stats.averageInterventionsSuccessful.toFixed(2)}** non-approval human interventions on average; the median across all runs was **${stats.medianInterventions.toFixed(1)}**.

![Task success rate](charts/01-task-success-rate.svg)

| Category | Runs | Success | Precision | Distance to Done | Interventions / success |
|---|---:|---:|---:|---:|---:|
${categoryOrder.map(category => `| ${labels[category]} | ${byCategory[category].length} | ${pct(stats.successByCategory[category])} | ${pct(stats.precisionByCategory[category])} | ${stats.distanceByCategory[category].toFixed(1)} | ${stats.interventionsByCategory[category].toFixed(2)} |`).join('\n')}

## Distance to done

The five-point scale measures progress toward the requested real-world outcome: 0 means no useful progress; 5 means the requested outcome was achieved. A safe flight payment handoff is scored 4 because ShotCount deliberately does not purchase.

![Distance to done](charts/02-distance-to-done.svg)

## Human intervention

Required approvals for email sends and Calendar writes are recorded separately and are not counted as intervention. Clarifications, corrections, retries, rescue, or takeover beyond that boundary do count.

![Human intervention](charts/03-human-intervention.svg)

![Success versus friction](charts/04-success-vs-friction.svg)

## Methodology

The task set was frozen before execution: five Email, five Calendar, five cross-tool, and five browser/flight cases. Each case ran three times. The harness uses ShotCount's production intent classifier, tool policy, idempotency-key generator, completion-evidence gate, and context requirement logic. A controlled in-memory provider supplies Gmail, Calendar, reply, and flight fixtures under reserved \`benchmark.invalid\` identities. Deterministic verifiers inspect action logs and resulting state; no LLM judge is used.

Active time in this controlled run is a deterministic virtual-clock measure of harness steps, not live network latency. Cross-tool reply waits are simulated and recorded separately. Raw results contain no message bodies, OAuth data, credentials, or real contact information.

## Failure modes

Six of 60 runs failed, covering two tasks:

- **Prepare-vs-send intent (3 runs):** “Follow up with investors” requested prepared drafts, but the classifier assigned an external-send completion policy because “follow up” is treated as a write action.
- **Negated Calendar write (3 runs):** “Find a free hour” said “Do not create an event,” but the classifier matched the word “create” without understanding the negation and required Calendar-write evidence.

Both failures made useful, precise progress and scored 3/5, but the execution loop could not truthfully complete under its assigned evidence policy. No incorrect recipient, duplicate write, unsafe purchase, or other incorrect side effect occurred, so execution precision remained 100%.

## Reproducibility

Run:

\`pnpm exec vitest run benchmarks/agent-execution/run-benchmark.test.ts\`  
\`node benchmarks/agent-execution/generate-report.mjs\`

The machine-readable outputs are \`results/latest.json\`, \`results/latest.csv\`, and \`results/summary.json\`. Competitor fields are present but null; no competitor scores were fabricated.

## Limitations

This is a **controlled-fixture baseline**, not a live Gmail/Calendar/OpenAI benchmark. Authentication for a dedicated benchmark account was unavailable in the local workspace, so the run did not measure model variability, provider latency, changing inbox/calendar state, CAPTCHA behavior, or real Google Flights availability. The fixtures exercise ShotCount's deterministic execution and safety layers, but they do not establish end-to-end live-service reliability. Public claims should use the phrase “controlled AgentRun benchmark” and should not imply superiority over another agent.
`
writeFileSync(resolve(here, 'report.md'), report)
console.log(JSON.stringify(summary, null, 2))
