import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const load = name => JSON.parse(readFileSync(resolve(here, `results/${name}.json`), 'utf8')).runs
const sets = { shotcount: load('shotcount'), generic: load('generic-agent') }
const labels = { shotcount: 'ShotCount', generic: 'Generic OpenAI Agent' }
const shortLabels = { shotcount: 'ShotCount', generic: 'Generic agent' }
const colors = { shotcount: '#7557D5', generic: '#1AA6A6' }
const categories = ['email', 'calendar', 'cross_tool', 'browser']
const categoryLabels = { email: 'Email', calendar: 'Calendar', cross_tool: 'Cross-tool', browser: 'Browser' }
const expected = new Set(categories.flatMap(category => Array.from({ length: 5 }, (_, task) => Array.from({ length: 3 }, (_, run) => `${category}:${String(task + 1).padStart(2, '0')}:${run + 1}`))).flat())

for (const [system, rows] of Object.entries(sets)) {
  const actual = new Set(rows.map(row => `${row.category}:${row.task_id.split('-').at(-1)}:${row.run_number}`))
  if (rows.length !== 60 || actual.size !== 60 || [...expected].some(key => !actual.has(key))) throw new Error(`${system} does not contain the exact 60-run matrix`)
  if (rows.some(row => row.openai_model !== 'gpt-5.6-sol' || row.reasoning_effort !== 'low')) throw new Error(`${system} model configuration drifted`)
}

const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0)
const mean = values => values.length ? values.reduce((total, value) => total + Number(value), 0) / values.length : 0
const median = values => { const sorted = values.map(Number).sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 }
const pct = value => `${(value * 100).toFixed(1)}%`
const money = value => `$${value.toFixed(6)}`
const classify = (system, row) => {
  if (system === 'shotcount') {
    if (row.task_id === 'email-01') return 'state loss'
    if (row.task_id === 'cross-01') return 'async resumption'
    if (row.task_id === 'cross-03') return 'premature completion'
    if (row.failure_reason === 'timeout/network') return 'timeout'
  } else {
    if (!row.actions.length) return 'provider failure'
    if (row.task_id === 'cross-05') return 'premature completion'
    if (row.failure_reason === 'browser failure') return 'browser failure'
  }
  return row.failure_reason || 'other'
}
const summarize = (system, rows) => {
  const successes = rows.filter(row => row.success)
  const category = Object.fromEntries(categories.map(key => {
    const selected = rows.filter(row => row.category === key)
    const passed = selected.filter(row => row.success).length
    return [key, { runs: selected.length, passed, success: passed / selected.length, distance: mean(selected.map(row => row.distance_to_done)) }]
  }))
  const cost = sum(rows, 'inference_cost_usd')
  const failures = rows.filter(row => !row.success).map(row => ({ task: row.task_id, run: row.run_number, taxonomy: classify(system, row), recordedReason: row.failure_reason, finalState: row.final_state }))
  const taxonomy = Object.fromEntries([...new Set(failures.map(row => row.taxonomy))].sort().map(key => [key, failures.filter(row => row.taxonomy === key).length]))
  return {
    runs: rows.length,
    passed: successes.length,
    success: successes.length / rows.length,
    category,
    precision: mean(rows.map(row => row.execution_precision)),
    interventions: {
      median: median(rows.map(row => row.non_approval_human_interventions)),
      average: mean(rows.map(row => row.non_approval_human_interventions)),
      averageSuccessful: mean(successes.map(row => row.non_approval_human_interventions)),
    },
    clarificationRate: rows.filter(row => Number(row.clarifications) > 0).length / rows.length,
    correctionRate: rows.filter(row => Number(row.corrections) > 0).length / rows.length,
    distance: mean(rows.map(row => row.distance_to_done)),
    firstAttempt: mean(rows.map(row => row.first_attempt_success)),
    retries: sum(rows, 'retry_count'),
    time: { activeTotal: sum(rows, 'active_execution_time_seconds'), activeAverage: mean(rows.map(row => row.active_execution_time_seconds)), externalTotal: sum(rows, 'external_wait_time_seconds') },
    tokens: { input: sum(rows, 'input_tokens'), cachedInput: sum(rows, 'cached_input_tokens'), cacheWrite: sum(rows, 'cache_write_tokens'), output: sum(rows, 'output_tokens'), total: sum(rows, 'input_tokens') + sum(rows, 'output_tokens') },
    cost,
    costPerRun: cost / rows.length,
    costPerSuccess: cost / successes.length,
    successPerDollar: successes.length / cost,
    failures,
    taxonomy,
  }
}
const metrics = Object.fromEntries(Object.entries(sets).map(([key, rows]) => [key, summarize(key, rows)]))
const costDifference = metrics.shotcount.costPerSuccess / metrics.generic.costPerSuccess - 1
const summary = { frozenCommit: sets.shotcount[0].evaluated_commit, model: 'gpt-5.6-sol', reasoningEffort: 'low', totalRuns: 120, metrics, costPerSuccessDifferenceShotCountVsGeneric: costDifference }

mkdirSync(resolve(here, 'charts'), { recursive: true })
mkdirSync(resolve(here, 'yc-summary'), { recursive: true })
writeFileSync(resolve(here, 'results/summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

const csvRows = [
  ['metric', 'shotcount', 'generic_openai_agent'],
  ['overall_success', metrics.shotcount.success, metrics.generic.success],
  ...categories.map(key => [`${key}_success`, metrics.shotcount.category[key].success, metrics.generic.category[key].success]),
  ['execution_precision', metrics.shotcount.precision, metrics.generic.precision],
  ['median_interventions', metrics.shotcount.interventions.median, metrics.generic.interventions.median],
  ['average_interventions', metrics.shotcount.interventions.average, metrics.generic.interventions.average],
  ['average_interventions_per_success', metrics.shotcount.interventions.averageSuccessful, metrics.generic.interventions.averageSuccessful],
  ['clarification_rate', metrics.shotcount.clarificationRate, metrics.generic.clarificationRate],
  ['correction_rate', metrics.shotcount.correctionRate, metrics.generic.correctionRate],
  ['distance_to_done', metrics.shotcount.distance, metrics.generic.distance],
  ['first_attempt_success', metrics.shotcount.firstAttempt, metrics.generic.firstAttempt],
  ['retry_count', metrics.shotcount.retries, metrics.generic.retries],
  ['active_execution_time_seconds', metrics.shotcount.time.activeTotal, metrics.generic.time.activeTotal],
  ['external_wait_time_seconds', metrics.shotcount.time.externalTotal, metrics.generic.time.externalTotal],
  ['total_tokens', metrics.shotcount.tokens.total, metrics.generic.tokens.total],
  ['total_cost_usd', metrics.shotcount.cost, metrics.generic.cost],
  ['cost_per_run_usd', metrics.shotcount.costPerRun, metrics.generic.costPerRun],
  ['cost_per_success_usd', metrics.shotcount.costPerSuccess, metrics.generic.costPerSuccess],
  ['successful_runs_per_dollar', metrics.shotcount.successPerDollar, metrics.generic.successPerDollar],
]
writeFileSync(resolve(here, 'results/comparison.csv'), `${csvRows.map(row => row.join(',')).join('\n')}\n`)

const logo = readFileSync(resolve(here, '../agent-execution-live/assets/shotcount-logo-transparent.png')).toString('base64')
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const shell = (title, subtitle, body, footnote = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1050" viewBox="0 0 1600 1050"><rect width="1600" height="1050" fill="#fff"/><style>text{font-family:Inter,Arial,sans-serif;fill:#111}.title{font-size:38px;font-weight:700}.subtitle{font-size:22px;fill:#555}.axis{font-size:18px;fill:#555}.label{font-size:21px;font-weight:600}.value{font-size:20px;font-weight:600}.small{font-size:17px;fill:#666}.big{font-size:46px;font-weight:700}.grid{stroke:#dedede;stroke-width:1}</style><text class="title" x="105" y="82">${esc(title)}</text><text class="subtitle" x="105" y="121">${esc(subtitle)}</text><image href="data:image/png;base64,${logo}" x="1420" y="48" width="72" height="72"/>${body}${footnote ? `<text class="small" x="105" y="1015">${esc(footnote)}</text>` : ''}</svg>`
const render = (directory, name, svg) => {
  const svgPath = resolve(here, directory, `${name}.svg`)
  writeFileSync(svgPath, `${svg}\n`)
  execFileSync('rsvg-convert', ['--width', '3200', '--height', '2100', '--output', resolve(here, directory, `${name}.png`), svgPath])
}
const legend = (y = 190) => Object.keys(metrics).map((key, index) => `<circle cx="${500 + index * 340}" cy="${y}" r="10" fill="${colors[key]}"/><text class="label" x="${523 + index * 340}" y="${y + 7}">${labels[key]}</text>`).join('')

function groupedSuccess() {
  const items = ['overall', ...categories], left = 185, bottom = 850, top = 270, group = 250, bar = 72
  const y = value => bottom - value * (bottom - top)
  const grids = [.5, .75, 1].map(tick => `<line class="grid" x1="${left}" x2="1450" y1="${y(tick)}" y2="${y(tick)}"/><text class="axis" x="160" y="${y(tick) + 6}" text-anchor="end">${pct(tick)}</text>`).join('')
  const bars = items.map((item, index) => {
    const gx = left + index * group
    const values = { shotcount: item === 'overall' ? metrics.shotcount.success : metrics.shotcount.category[item].success, generic: item === 'overall' ? metrics.generic.success : metrics.generic.category[item].success }
    const marks = Object.keys(metrics).map((key, i) => { const x = gx + i * 90, value = values[key], yy = y(value); return `<rect x="${x}" y="${yy}" width="${bar}" height="${bottom - yy}" rx="4" fill="${colors[key]}"/><text class="value" x="${x + bar / 2}" y="${yy - 13}" text-anchor="middle">${pct(value)}</text>` }).join('')
    return `${marks}<text class="label" x="${gx + 81}" y="900" text-anchor="middle">${item === 'overall' ? 'Overall' : categoryLabels[item]}</text>`
  }).join('')
  return shell('Same model, different execution harness', 'Same OpenAI model, task set, tools, and verification.', `${legend()}${grids}${bars}<text class="axis" transform="translate(72 560) rotate(-90)" text-anchor="middle">Verified task success</text>`, '20 tasks × 3 independent live runs per harness · all failures retained')
}

function twoBars(title, subtitle, value, format, note) {
  const max = Math.max(...Object.values(metrics).map(value)) * 1.25 || 1, bottom = 835, top = 300, xs = { shotcount: 480, generic: 960 }
  const y = amount => bottom - amount / max * (bottom - top)
  const bars = Object.keys(metrics).map(key => { const amount = value(metrics[key]), yy = y(amount); return `<rect x="${xs[key]}" y="${yy}" width="190" height="${bottom - yy}" rx="5" fill="${colors[key]}"/><text class="big" x="${xs[key] + 95}" y="${yy - 24}" text-anchor="middle">${format(amount)}</text><text class="label" x="${xs[key] + 95}" y="885" text-anchor="middle">${shortLabels[key]}</text>` }).join('')
  return shell(title, subtitle, bars, note)
}

function efficiencyScatter() {
  const left = 240, right = 1400, top = 285, bottom = 840
  const xValues = Object.values(metrics).map(model => model.costPerSuccess), xMin = Math.min(...xValues) * .96, xMax = Math.max(...xValues) * 1.04
  const yMin = .82, yMax = .89
  const x = value => left + (value - xMin) / (xMax - xMin) * (right - left)
  const y = value => bottom - (value - yMin) / (yMax - yMin) * (bottom - top)
  const grids = [.82, .84, .86, .88].map(tick => `<line class="grid" x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}"/><text class="axis" x="215" y="${y(tick) + 6}" text-anchor="end">${pct(tick)}</text>`).join('')
  const line = ['shotcount', 'generic'].sort((a, b) => metrics[a].costPerSuccess - metrics[b].costPerSuccess).map(key => `${x(metrics[key].costPerSuccess)},${y(metrics[key].success)}`).join(' ')
  const points = Object.keys(metrics).map(key => { const dx = key === 'shotcount' ? -300 : 28, dy = key === 'shotcount' ? -32 : -16; return `<circle cx="${x(metrics[key].costPerSuccess)}" cy="${y(metrics[key].success)}" r="15" fill="${colors[key]}"/><text class="label" x="${x(metrics[key].costPerSuccess) + dx}" y="${y(metrics[key].success) + dy}">${labels[key]}</text><text class="small" x="${x(metrics[key].costPerSuccess) + dx}" y="${y(metrics[key].success) + dy + 28}">${money(metrics[key].costPerSuccess)} / success · ${pct(metrics[key].success)}</text>` }).join('')
  return shell('Execution efficiency with the same underlying model', 'Higher and farther left is better', `${grids}<polyline points="${line}" fill="none" stroke="#222" stroke-width="2.5"/>${points}<text class="axis" x="820" y="930" text-anchor="middle">Measured inference cost per successful task</text><text class="axis" transform="translate(83 560) rotate(-90)" text-anchor="middle">Verified task success</text>`, 'Generic was slightly higher-success; ShotCount had slightly lower measured cost per success')
}

function distanceChart() {
  const items = ['overall', ...categories], left = 190, bottom = 850, top = 280, group = 250, bar = 72
  const y = value => bottom - value / 5 * (bottom - top)
  const grids = [3, 4, 5].map(tick => `<line class="grid" x1="${left}" x2="1450" y1="${y(tick)}" y2="${y(tick)}"/><text class="axis" x="160" y="${y(tick) + 6}" text-anchor="end">${tick}</text>`).join('')
  const bars = items.map((item, index) => { const gx = left + index * group; const marks = Object.keys(metrics).map((key, i) => { const value = item === 'overall' ? metrics[key].distance : metrics[key].category[item].distance, x = gx + i * 90, yy = y(value); return `<rect x="${x}" y="${yy}" width="${bar}" height="${bottom - yy}" rx="4" fill="${colors[key]}"/><text class="value" x="${x + bar / 2}" y="${yy - 13}" text-anchor="middle">${value.toFixed(2)}</text>` }).join(''); return `${marks}<text class="label" x="${gx + 81}" y="900" text-anchor="middle">${item === 'overall' ? 'Overall' : categoryLabels[item]}</text>` }).join('')
  return shell('Distance-to-Done by execution harness', 'Average progress toward the objectively verified outcome · 0–5 scale', `${legend()}${grids}${bars}<text class="axis" transform="translate(73 560) rotate(-90)" text-anchor="middle">Distance-to-Done</text>`, 'Higher is better · failed runs remain included')
}

render('charts', '01-success-comparison', groupedSuccess())
render('charts', '02-user-effort', twoBars('User intervention by execution harness', 'Average non-approval interventions per successful task', model => model.interventions.averageSuccessful, value => value.toFixed(3), 'Mandatory safety approvals are excluded'))
render('charts', '03-cost-per-success', twoBars('Cost per successful real-world task', 'Measured inference cost divided by objectively verified successes', model => model.costPerSuccess, money, 'Same GPT-5.6 Sol configuration in both conditions'))
render('charts', '04-success-vs-cost', efficiencyScatter())
render('charts', '05-distance-to-done', distanceChart())

function ycSummary() {
  const columns = { shotcount: 180, generic: 850 }
  const blocks = Object.keys(metrics).map(key => `<circle cx="${columns[key]}" cy="245" r="11" fill="${colors[key]}"/><text class="label" x="${columns[key] + 25}" y="253">${labels[key]}</text><text class="big" x="${columns[key]}" y="370">${pct(metrics[key].success)}</text><text class="small" x="${columns[key]}" y="405">verified live success</text><text class="big" x="${columns[key]}" y="535">${money(metrics[key].costPerSuccess)}</text><text class="small" x="${columns[key]}" y="570">inference cost per success</text><text class="big" x="${columns[key]}" y="700">${metrics[key].interventions.averageSuccessful.toFixed(3)}</text><text class="small" x="${columns[key]}" y="735">non-approval interventions per success</text><text class="big" x="${columns[key]}" y="865">${pct(metrics[key].precision)}</text><text class="small" x="${columns[key]}" y="900">execution precision</text>`).join('')
  return shell('The harness advantage was not established', 'Same model and tools; the generic baseline narrowly led this 120-run sample', blocks, 'Same model · same 20 tasks · same tools · 3 runs each · objective external-state verification')
}
render('yc-summary', 'harness-ablation-summary', ycSummary())
writeFileSync(resolve(here, 'yc-summary/index.html'), '<!doctype html><meta charset="utf-8"><title>ShotCount harness ablation</title><style>html,body{margin:0;background:#fff}img{display:block;width:100%;height:auto}</style><img src="harness-ablation-summary.svg" alt="ShotCount and generic OpenAI agent harness comparison">\n')

const categoryRows = categories.map(key => `| ${categoryLabels[key]} | ${metrics.shotcount.category[key].passed}/15 (${pct(metrics.shotcount.category[key].success)}) | ${metrics.generic.category[key].passed}/15 (${pct(metrics.generic.category[key].success)}) |`).join('\n')
const failureRows = Object.keys(metrics).flatMap(system => metrics[system].failures.map(row => `| ${labels[system]} | ${row.task} | ${row.run} | ${row.taxonomy} | ${row.finalState} |`)).join('\n')
writeFileSync(resolve(here, 'report.md'), `# ShotCount harness ablation — same-model live benchmark\n\nThe controlled result does **not** establish an aggregate ShotCount harness advantage. ShotCount completed **51/60 (85.0%)** runs; the competent generic harness completed **52/60 (86.7%)**. Both maintained **100% execution precision**.\n\n## Required comparison\n\n| Metric | ShotCount | Generic OpenAI Agent |\n|---|---:|---:|\n| Overall success | ${pct(metrics.shotcount.success)} | ${pct(metrics.generic.success)} |\n| Email success | ${pct(metrics.shotcount.category.email.success)} | ${pct(metrics.generic.category.email.success)} |\n| Calendar success | ${pct(metrics.shotcount.category.calendar.success)} | ${pct(metrics.generic.category.calendar.success)} |\n| Cross-tool success | ${pct(metrics.shotcount.category.cross_tool.success)} | ${pct(metrics.generic.category.cross_tool.success)} |\n| Browser success | ${pct(metrics.shotcount.category.browser.success)} | ${pct(metrics.generic.category.browser.success)} |\n| Execution precision | ${pct(metrics.shotcount.precision)} | ${pct(metrics.generic.precision)} |\n| Median interventions | ${metrics.shotcount.interventions.median.toFixed(1)} | ${metrics.generic.interventions.median.toFixed(1)} |\n| Average interventions | ${metrics.shotcount.interventions.average.toFixed(3)} | ${metrics.generic.interventions.average.toFixed(3)} |\n| Average interventions / success | ${metrics.shotcount.interventions.averageSuccessful.toFixed(3)} | ${metrics.generic.interventions.averageSuccessful.toFixed(3)} |\n| Distance-to-Done | ${metrics.shotcount.distance.toFixed(2)}/5 | ${metrics.generic.distance.toFixed(2)}/5 |\n| First-attempt success | ${pct(metrics.shotcount.firstAttempt)} | ${pct(metrics.generic.firstAttempt)} |\n| Total measured cost | ${money(metrics.shotcount.cost)} | ${money(metrics.generic.cost)} |\n| Cost / successful task | ${money(metrics.shotcount.costPerSuccess)} | ${money(metrics.generic.costPerSuccess)} |\n| Successful runs / dollar | ${metrics.shotcount.successPerDollar.toFixed(2)} | ${metrics.generic.successPerDollar.toFixed(2)} |\n\n## Category results\n\n| Category | ShotCount | Generic OpenAI Agent |\n|---|---:|---:|\n${categoryRows}\n\nShotCount led Cross-tool by one run; the generic harness led Email and Browser by one run each. Calendar tied. These are small, noisy differences in a 15-run-per-category sample.\n\n## Interpretation\n\n1. **Success:** no aggregate improvement was demonstrated; Generic led by 1.7 percentage points.\n2. **User effort:** both averaged ${metrics.shotcount.interventions.averageSuccessful.toFixed(3)} non-approval interventions per successful task and had a median of zero.\n3. **Cost:** ShotCount cost per success was ${pct(Math.abs(costDifference))} ${costDifference >= 0 ? 'higher' : 'lower'} than Generic.\n4. **Precision:** both were 100%; neither created a duplicate or incorrect consequential external effect.\n5. **Category signal:** ShotCount's only observed lead was Cross-tool (73.3% vs 66.7%), but its async-resumption and premature-completion failures prevented a stronger result.\n6. **Architecture signal:** this run does not isolate a statistically convincing benefit from durable task state, reply resumption, retry/recovery, or completion evidence. Browser retries improved some recovery but did not overcome four live timeouts.\n7. **Investor meaning:** the honest YC result is that the current harness did not outperform a competent minimal baseline on aggregate reliability or measured inference efficiency. The defensible positive result is safety parity at 100% precision and a small Cross-tool lead.\n\n## Failure taxonomy\n\n| Harness | Task | Run | Classified mechanism | Final state |\n|---|---|---:|---|---|\n${failureRows}\n\nShotCount failures: four browser timeouts, two async-resumption failures, two premature completions, and one approval-state loss. Generic failures: four provider/setup request failures, three premature completions after reply handling, and one browser failure.\n\n## Limitations\n\n- This is one 120-run snapshot: 60 runs per harness and only 15 per category. A one-run aggregate difference is not evidence of a durable ranking.\n- The two conditions ran sequentially against live Gmail, Calendar, and Google Flights, so provider conditions were not perfectly simultaneous.\n- The production browser worker requires an opaque database compatibility row, and Gmail send requires a prepared-draft safety adapter. These were necessary to give the generic harness equivalent provider access.\n- The generic loop has in-process reply handling, while ShotCount has durable reply resumption. This benchmark tested task outcomes, not crash recovery across process restarts.\n- A stale controlled Calendar event invalidated the first ShotCount start; it was removed and the condition restarted from zero. A later generic attempt was invalidated by a host DNS outage and also restarted from zero. Neither partial set is included.\n- Measured cost covers model inference, not provider infrastructure, browser-worker compute, engineering cost, or product UX.\n`)

const reportPath = resolve(here, 'report.md')
const expandedReport = readFileSync(reportPath, 'utf8')
  .replace(
    `| Average interventions / success | ${metrics.shotcount.interventions.averageSuccessful.toFixed(3)} | ${metrics.generic.interventions.averageSuccessful.toFixed(3)} |\n| Distance-to-Done |`,
    `| Average interventions / success | ${metrics.shotcount.interventions.averageSuccessful.toFixed(3)} | ${metrics.generic.interventions.averageSuccessful.toFixed(3)} |\n| Clarification rate | ${pct(metrics.shotcount.clarificationRate)} | ${pct(metrics.generic.clarificationRate)} |\n| Correction rate | ${pct(metrics.shotcount.correctionRate)} | ${pct(metrics.generic.correctionRate)} |\n| Distance-to-Done |`,
  )
  .replace(
    `| First-attempt success | ${pct(metrics.shotcount.firstAttempt)} | ${pct(metrics.generic.firstAttempt)} |\n| Total measured cost |`,
    `| First-attempt success | ${pct(metrics.shotcount.firstAttempt)} | ${pct(metrics.generic.firstAttempt)} |\n| Retry count | ${metrics.shotcount.retries} | ${metrics.generic.retries} |\n| Active execution time | ${metrics.shotcount.time.activeTotal.toFixed(1)}s | ${metrics.generic.time.activeTotal.toFixed(1)}s |\n| External wait time | ${metrics.shotcount.time.externalTotal.toFixed(1)}s | ${metrics.generic.time.externalTotal.toFixed(1)}s |\n| Total tokens | ${metrics.shotcount.tokens.total.toLocaleString('en-US')} | ${metrics.generic.tokens.total.toLocaleString('en-US')} |\n| Total measured cost |`,
  )
  .replace(
    `| Total measured cost | ${money(metrics.shotcount.cost)} | ${money(metrics.generic.cost)} |\n| Cost / successful task |`,
    `| Total measured cost | ${money(metrics.shotcount.cost)} | ${money(metrics.generic.cost)} |\n| Cost / run | ${money(metrics.shotcount.costPerRun)} | ${money(metrics.generic.costPerRun)} |\n| Cost / successful task |`,
  )
  .replace(
    `2. **User effort:** both averaged ${metrics.shotcount.interventions.averageSuccessful.toFixed(3)} non-approval interventions per successful task and had a median of zero.`,
    `2. **User effort:** ShotCount averaged ${metrics.shotcount.interventions.averageSuccessful.toFixed(3)} and Generic ${metrics.generic.interventions.averageSuccessful.toFixed(3)} non-approval interventions per successful task; both had a median of zero.`,
  )
  .replace(
    '7. **Investor meaning:** the honest YC result is that the current harness did not outperform a competent minimal baseline on aggregate reliability or measured inference efficiency. The defensible positive result is safety parity at 100% precision and a small Cross-tool lead.',
    '7. **Investor meaning:** the honest YC result is that the current harness did not outperform a competent minimal baseline on aggregate reliability or user effort. It did use 3.0% less measured inference cost per successful task, maintained safety parity at 100% precision, and led Cross-tool by one run.',
  )
writeFileSync(reportPath, expandedReport)

console.log(JSON.stringify(summary, null, 2))
