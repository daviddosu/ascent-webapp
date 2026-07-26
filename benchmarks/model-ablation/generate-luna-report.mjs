import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const load = path => JSON.parse(readFileSync(resolve(here, path), 'utf8')).runs
const sets = {
  sol: load('results/sol-reference/latest.json'),
  terra: load('results/terra-v2/latest.json'),
  luna: load('results/luna-v1/latest.json'),
}
if (Object.values(sets).some(rows => rows.length !== 60)) throw new Error('Three complete 60-run sets are required.')

const categories = ['email', 'calendar', 'cross_tool', 'browser']
const categoryLabels = { email: 'Email', calendar: 'Calendar', cross_tool: 'Cross-tool', browser: 'Browser' }
const names = { sol: 'GPT-5.6 Sol', terra: 'GPT-5.6 Terra', luna: 'GPT-5.6 Luna' }
const colors = { sol: '#7057D9', terra: '#18A999', luna: '#F28E2B' }
const mean = values => values.reduce((sum, value) => sum + Number(value), 0) / values.length
const median = values => { const sorted = [...values].map(Number).sort((a, b) => a - b); return (sorted[29] + sorted[30]) / 2 }
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key]), 0)
const summarize = rows => {
  const passed = rows.filter(row => row.success).length
  const category = Object.fromEntries(categories.map(key => {
    const selected = rows.filter(row => row.category === key)
    const categoryPassed = selected.filter(row => row.success).length
    return [key, { runs: selected.length, passed: categoryPassed, success: categoryPassed / selected.length }]
  }))
  const cost = sum(rows, 'inference_cost_usd')
  return {
    runs: rows.length, passed, success: passed / rows.length, category,
    precision: mean(rows.map(row => row.execution_precision)),
    medianInterventions: median(rows.map(row => row.non_approval_human_interventions)),
    averageInterventions: mean(rows.map(row => row.non_approval_human_interventions)),
    distance: mean(rows.map(row => row.distance_to_done)),
    firstAttempt: mean(rows.map(row => row.first_attempt_success)),
    retries: sum(rows, 'retry_count'),
    activeExecutionSeconds: {
      total: sum(rows, 'active_execution_time_seconds'),
      average: mean(rows.map(row => row.active_execution_time_seconds)),
      median: median(rows.map(row => row.active_execution_time_seconds)),
    },
    tokens: {
      input: sum(rows, 'input_tokens'), cachedInput: sum(rows, 'cached_input_tokens'),
      cacheWrite: sum(rows, 'cache_write_tokens'), output: sum(rows, 'output_tokens'),
      total: sum(rows, 'input_tokens') + sum(rows, 'output_tokens'),
    },
    cost, costPerRun: cost / rows.length, costPerSuccess: cost / passed,
  }
}
const metrics = Object.fromEntries(Object.entries(sets).map(([key, rows]) => [key, summarize(rows)]))
const failures = sets.luna.filter(row => !row.success)
const failureTaxonomy = Object.fromEntries([...new Set(failures.map(row => row.failure_reason))].map(reason => [reason, failures.filter(row => row.failure_reason === reason).length]))
const summary = {
  ...metrics,
  lunaFailureTaxonomy: failureTaxonomy,
  lunaFailures: failures.map(row => ({ taskId: row.task_id, runNumber: row.run_number, reason: row.failure_reason, finalState: row.final_state })),
  costReduction: {
    versusSol: 1 - metrics.luna.cost / metrics.sol.cost,
    versusTerra: 1 - metrics.luna.cost / metrics.terra.cost,
  },
}

const chartDir = resolve(here, 'charts-three-model')
const summaryDir = resolve(here, 'yc-summary-three-model')
mkdirSync(chartDir, { recursive: true })
mkdirSync(summaryDir, { recursive: true })
const logo = readFileSync(resolve(here, '../agent-execution-live/assets/shotcount-logo-transparent.png')).toString('base64')
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const pct = value => `${(value * 100).toFixed(1)}%`
const money = value => `$${value.toFixed(6)}`
const shell = (title, subtitle, body, footnote = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100"><rect width="1600" height="1100" fill="#FFFFFF"/><style>text{font-family:Inter,Arial,Helvetica,sans-serif;fill:#111}.title{font-size:38px;font-weight:700}.subtitle{font-size:23px;fill:#555}.axis{font-size:18px;fill:#555}.label{font-size:21px;font-weight:600}.value{font-size:20px;font-weight:600}.small{font-size:17px;fill:#666}.big{font-size:48px;font-weight:700}.grid{stroke:#DDD;stroke-width:1}</style><text class="title" x="105" y="88">${esc(title)}</text><text class="subtitle" x="105" y="128">${esc(subtitle)}</text><image href="data:image/png;base64,${logo}" x="1418" y="54" width="78" height="78"/>${body}${footnote ? `<text class="small" x="105" y="1060">${esc(footnote)}</text>` : ''}</svg>`
const render = (name, svg, directory = chartDir) => {
  const svgPath = resolve(directory, `${name}.svg`)
  writeFileSync(svgPath, `${svg}\n`)
  execFileSync('rsvg-convert', ['--width', '3200', '--height', '2200', '--output', resolve(directory, `${name}.png`), svgPath])
}

function scatter({ title, subtitle, yLabel, yDomain, yTicks, value, valueLabel, footnote, labelOffsets }) {
  const left = 195, right = 1490, top = 255, bottom = 855
  const x = cost => left + (cost / 1.75) * (right - left)
  const y = metric => bottom - ((metric - yDomain[0]) / (yDomain[1] - yDomain[0])) * (bottom - top)
  const grids = yTicks.map(tick => `<line class="grid" x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}"/><text class="axis" x="190" y="${y(tick) + 6}" text-anchor="end">${valueLabel(tick)}</text>`).join('')
  const xTicks = [0, .4, .8, 1.2, 1.6].map(tick => `<text class="axis" x="${x(tick)}" y="900" text-anchor="middle">$${tick.toFixed(1)}</text>`).join('')
  const line = ['luna', 'terra', 'sol'].map(key => `${x(metrics[key].cost)},${y(value(metrics[key]))}`).join(' ')
  const points = Object.entries(metrics).map(([key, model]) => {
    const [dx, dy] = labelOffsets[key]
    return `<circle cx="${x(model.cost)}" cy="${y(value(model))}" r="14" fill="${colors[key]}"/><text class="label" x="${x(model.cost) + dx}" y="${y(value(model)) + dy}">${names[key]}</text><text class="small" x="${x(model.cost) + dx}" y="${y(value(model)) + dy + 27}">${money(model.cost)} · ${valueLabel(value(model))}</text>`
  }).join('')
  return shell(title, subtitle, `${grids}${xTicks}<polyline points="${line}" fill="none" stroke="#222" stroke-width="2.5"/><text class="axis" x="842" y="962" text-anchor="middle">Measured inference cost · 60 live runs</text><text class="axis" transform="translate(78 565) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>${points}`, footnote)
}

render('01-cost-vs-live-task-success', scatter({
  title: 'Live task performance vs inference cost', subtitle: 'Same frozen ShotCount benchmark · model is the only changed variable',
  yLabel: 'Live task success rate', yDomain: [.75, 1], yTicks: [.75, .80, .85, .90, .95, 1],
  value: model => model.success, valueLabel: pct,
  labelOffsets: { sol: [-270, -48], terra: [24, -62], luna: [24, 32] },
  footnote: '20 tasks × 3 independent executions per model · measured token usage and inference cost',
}))

function categoryChart() {
  const left = 195, top = 285, bottom = 855, groupWidth = 325, barWidth = 62
  const y = value => bottom - value * (bottom - top)
  const grids = [.8, .9, 1].map(tick => `<line class="grid" x1="${left}" x2="1490" y1="${y(tick)}" y2="${y(tick)}"/><text class="axis" x="170" y="${y(tick) + 6}" text-anchor="end">${pct(tick)}</text>`).join('')
  const bars = categories.map((category, index) => {
    const groupX = left + index * groupWidth
    const modelBars = Object.entries(metrics).map(([key, model], modelIndex) => {
      const value = model.category[category].success, x = groupX + modelIndex * 82, height = value * (bottom - top), topY = bottom - height
      return `<rect x="${x}" y="${topY}" width="${barWidth}" height="${height}" rx="3" fill="${colors[key]}"/>`
    }).join('')
    return `${modelBars}<text class="label" x="${groupX + 113}" y="910" text-anchor="middle">${categoryLabels[category]}</text>`
  }).join('')
  const legend = Object.keys(metrics).map((key, index) => `<circle cx="${390 + index * 310}" cy="212" r="10" fill="${colors[key]}"/><text class="label" x="${412 + index * 310}" y="220">${names[key]}</text>`).join('')
  return shell('Model performance by category', 'Live success rate across Email, Calendar, Cross-tool, and Browser', `${legend}${grids}${bars}<text class="axis" transform="translate(88 565) rotate(-90)" text-anchor="middle">Successful runs</text>`, 'Each category contains 15 live runs per model')
}
render('02-model-performance-by-category', categoryChart())

render('03-execution-precision-vs-cost', scatter({
  title: 'Execution precision vs inference cost', subtitle: 'Correct external effects without duplicate writes',
  yLabel: 'Execution precision', yDomain: [.96, 1.005], yTicks: [.96, .98, 1],
  value: model => model.precision, valueLabel: pct,
  labelOffsets: { sol: [-250, 88], terra: [24, -54], luna: [24, 76] },
  footnote: 'All three models maintained 100% execution precision in this 60-run sample',
}))

render('04-distance-to-done-vs-cost', scatter({
  title: 'Distance-to-Done vs inference cost', subtitle: 'How close each run finished to the verified task outcome',
  yLabel: 'Distance-to-Done score', yDomain: [4.6, 5], yTicks: [4.6, 4.7, 4.8, 4.9, 5],
  value: model => model.distance, valueLabel: value => `${value.toFixed(2)}/5`,
  labelOffsets: { sol: [-270, -48], terra: [24, -62], luna: [24, 34] },
  footnote: 'Higher is better · failed runs remain included',
}))

function ycSummary() {
  const x = { sol: 185, terra: 650, luna: 1115 }
  const columns = Object.entries(metrics).map(([key, model]) => `<circle cx="${x[key]}" cy="245" r="10" fill="${colors[key]}"/><text class="label" x="${x[key] + 22}" y="253">${names[key]}</text><text class="big" x="${x[key]}" y="365">${pct(model.success)}</text><text class="small" x="${x[key]}" y="400">live success</text><text class="big" x="${x[key]}" y="525">${money(model.cost)}</text><text class="small" x="${x[key]}" y="560">measured cost · 60 runs</text><text class="big" x="${x[key]}" y="685">${pct(model.precision)}</text><text class="small" x="${x[key]}" y="720">execution precision</text>`).join('')
  const costX = cost => 220 + cost / 1.8 * 1160
  const successY = success => 945 - (success - .85) / .15 * 120
  const frontier = ['luna', 'terra', 'sol'].map(key => `${costX(metrics[key].cost)},${successY(metrics[key].success)}`).join(' ')
  const marks = Object.keys(metrics).map(key => `<circle cx="${costX(metrics[key].cost)}" cy="${successY(metrics[key].success)}" r="9" fill="${colors[key]}"/>`).join('')
  return shell('ShotCount’s three-model cost–capability curve', 'Live execution quality, measured cost, and safety on one frozen benchmark', `${columns}<line class="grid" x1="220" x2="1380" y1="945" y2="945"/><polyline points="${frontier}" fill="none" stroke="#222" stroke-width="2"/>${marks}<text class="small" x="220" y="995">Lower cost</text><text class="small" x="1380" y="995" text-anchor="end">Higher success</text>`, 'Luna costs 74.9% less than Sol while retaining 90.0% live success and 100% execution precision')
}
render('shotcount-three-model-summary', ycSummary(), summaryDir)
writeFileSync(resolve(summaryDir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>ShotCount model frontier</title><style>html,body{margin:0;background:#fff}img{display:block;width:100%;height:auto}</style><img src="shotcount-three-model-summary.svg" alt="ShotCount three-model cost and capability summary">\n')

const failureLines = failures.map(row => `| ${row.task_id} | ${row.run_number} | ${row.failure_reason} | ${row.final_state} |`).join('\n')
const categoryRows = categories.map(key => `| ${categoryLabels[key]} | ${pct(metrics.sol.category[key].success)} | ${pct(metrics.terra.category[key].success)} | ${pct(metrics.luna.category[key].success)} |`).join('\n')
writeFileSync(resolve(here, 'luna-v1-report.md'), `# GPT-5.6 Luna v1 — frozen model substitution\n\nLuna completed **54/60 runs (90.0%)**. Production was not modified, and failures were preserved.\n\n| Category | Sol | Terra hardened | Luna v1 |\n|---|---:|---:|---:|\n${categoryRows}\n\n| Metric | Sol | Terra hardened | Luna v1 |\n|---|---:|---:|---:|\n| Overall success | ${pct(metrics.sol.success)} | ${pct(metrics.terra.success)} | ${pct(metrics.luna.success)} |\n| Execution precision | ${pct(metrics.sol.precision)} | ${pct(metrics.terra.precision)} | ${pct(metrics.luna.precision)} |\n| Median interventions | ${metrics.sol.medianInterventions} | ${metrics.terra.medianInterventions} | ${metrics.luna.medianInterventions} |\n| Average interventions | ${metrics.sol.averageInterventions.toFixed(2)} | ${metrics.terra.averageInterventions.toFixed(2)} | ${metrics.luna.averageInterventions.toFixed(2)} |\n| Distance-to-Done | ${metrics.sol.distance.toFixed(2)}/5 | ${metrics.terra.distance.toFixed(2)}/5 | ${metrics.luna.distance.toFixed(2)}/5 |\n| First-attempt success | ${pct(metrics.sol.firstAttempt)} | ${pct(metrics.terra.firstAttempt)} | ${pct(metrics.luna.firstAttempt)} |\n| Measured inference cost | ${money(metrics.sol.cost)} | ${money(metrics.terra.cost)} | ${money(metrics.luna.cost)} |\n| Cost per run | ${money(metrics.sol.costPerRun)} | ${money(metrics.terra.costPerRun)} | ${money(metrics.luna.costPerRun)} |\n| Cost per successful run | ${money(metrics.sol.costPerSuccess)} | ${money(metrics.terra.costPerSuccess)} | ${money(metrics.luna.costPerSuccess)} |\n\n## Preserved Luna failures\n\n| Task | Run | Taxonomy | Final state |\n|---|---:|---|---|\n${failureLines}\n\nThe failures comprise three Cross-tool runs and three Browser runs. Cross-tool failures were one incomplete reply-to-Calendar resumption and two Calendar updates that produced drafts instead of required sent notifications. Browser failures were one selection timeout, one unavailable worker, and one post-handoff run-state failure despite the browser reaching the payment boundary. No hardening was performed.\n`)
writeFileSync(resolve(here, 'results/luna-v1/summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
