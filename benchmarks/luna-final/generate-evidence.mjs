import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const primitivePath = resolve(here, '../model-ablation/results/luna-v1/latest.json')
const harnessPath = resolve(here, 'results/final-60-2/latest.json')
const loadRuns = path => JSON.parse(readFileSync(path, 'utf8')).runs
const primitiveRuns = loadRuns(primitivePath)
const harnessRuns = loadRuns(harnessPath)
if (primitiveRuns.length !== 60 || harnessRuns.length !== 60) throw new Error('Both frozen result sets must contain 60 runs.')

const categories = ['email', 'calendar', 'cross_tool', 'browser']
const labels = { email: 'Email', calendar: 'Calendar', cross_tool: 'Cross-tool', browser: 'Browser' }
const mean = values => values.reduce((sum, value) => sum + Number(value), 0) / values.length
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0)
const median = values => { const sorted = values.map(Number).sort((a, b) => a - b); const m = sorted.length / 2; return (sorted[m - 1] + sorted[m]) / 2 }
const summarize = rows => {
  const passed = rows.filter(row => row.success).length
  const cost = sum(rows, 'inference_cost_usd')
  return {
    runs: rows.length,
    successfulRuns: passed,
    successRate: passed / rows.length,
    categories: Object.fromEntries(categories.map(category => {
      const selected = rows.filter(row => row.category === category)
      const successful = selected.filter(row => row.success).length
      return [category, { runs: selected.length, successfulRuns: successful, successRate: successful / selected.length }]
    })),
    executionPrecision: mean(rows.map(row => row.execution_precision)),
    medianNonApprovalInterventions: median(rows.map(row => row.non_approval_human_interventions)),
    averageNonApprovalInterventions: mean(rows.map(row => row.non_approval_human_interventions)),
    distanceToDone: mean(rows.map(row => row.distance_to_done)),
    firstAttemptSuccess: mean(rows.map(row => row.first_attempt_success)),
    retryCount: sum(rows, 'retry_count'),
    activeExecutionTimeSeconds: { total: sum(rows, 'active_execution_time_seconds'), average: mean(rows.map(row => row.active_execution_time_seconds)), median: median(rows.map(row => row.active_execution_time_seconds)) },
    tokens: { input: sum(rows, 'input_tokens'), cachedInput: sum(rows, 'cached_input_tokens'), cacheWrite: sum(rows, 'cache_write_tokens'), output: sum(rows, 'output_tokens'), total: sum(rows, 'input_tokens') + sum(rows, 'output_tokens') },
    measuredInferenceCostUsd: cost,
    costPerRunUsd: cost / rows.length,
    costPerSuccessfulRunUsd: cost / passed,
  }
}

const primitive = summarize(primitiveRuns)
const harness = summarize(harnessRuns)
const failures = harnessRuns.filter(row => !row.success).map(row => ({ taskId: row.task_id, category: row.category, runNumber: row.run_number, failureReason: row.failure_reason, finalState: row.final_state, retryCount: row.retry_count }))
const failureTaxonomy = Object.fromEntries([...new Set(failures.map(row => row.failureReason))].map(reason => [reason, failures.filter(row => row.failureReason === reason).length]))
const gates = {
  overallSuccessAtLeast95: harness.successRate >= .95,
  executionPrecision100: harness.executionPrecision === 1,
  medianInterventionsZero: harness.medianNonApprovalInterventions === 0,
  distanceToDoneAtLeast485: harness.distanceToDone >= 4.85,
  emailAtLeast95: harness.categories.email.successRate >= .95,
  calendarAtLeast95: harness.categories.calendar.successRate >= .95,
  crossToolAtLeast90: harness.categories.cross_tool.successRate >= .90,
  browserAtLeast90: harness.categories.browser.successRate >= .90,
  noSystemicDuplicateSideEffects: harness.executionPrecision === 1,
}
const sufficient = Object.values(gates).every(Boolean)
const unitLevels = [5, 10, 20, 50, 100]
const unitEconomics = unitLevels.map(tasksPerMonth => ({ tasksPerMonth, perActiveUserUsd: harness.costPerSuccessfulRunUsd * tasksPerMonth, twoThousandActiveUsersUsd: harness.costPerSuccessfulRunUsd * tasksPerMonth * 2000 }))

mkdirSync(resolve(here, 'results'), { recursive: true })
mkdirSync(resolve(here, 'charts'), { recursive: true })
mkdirSync(resolve(here, 'investor-summary'), { recursive: true })
mkdirSync(resolve(here, 'unit-economics'), { recursive: true })
const config = { model: 'gpt-5.6-luna', reasoningEffort: 'low', store: false, toolChoice: 'automatic', parallelToolCalls: false, maxOutputTokens: 2400 }
writeFileSync(resolve(here, 'results/luna-primitive-reference.json'), `${JSON.stringify({ label: 'Luna primitive / Luna v1', frozen: true, config, source: primitivePath, metrics: primitive }, null, 2)}\n`)
writeFileSync(resolve(here, 'results/luna-harness-v2.json'), `${JSON.stringify({ label: 'Luna + ShotCount Harness', config, source: harnessPath, metrics: harness, failures, failureTaxonomy, decisionGates: gates, sufficientForSoleDefault: sufficient }, null, 2)}\n`)
writeFileSync(resolve(here, 'results/comparison.csv'), `metric,luna_primitive,luna_plus_harness\noverall_success,${primitive.successRate},${harness.successRate}\nemail_success,${primitive.categories.email.successRate},${harness.categories.email.successRate}\ncalendar_success,${primitive.categories.calendar.successRate},${harness.categories.calendar.successRate}\ncross_tool_success,${primitive.categories.cross_tool.successRate},${harness.categories.cross_tool.successRate}\nbrowser_success,${primitive.categories.browser.successRate},${harness.categories.browser.successRate}\nexecution_precision,${primitive.executionPrecision},${harness.executionPrecision}\ndistance_to_done,${primitive.distanceToDone},${harness.distanceToDone}\nfirst_attempt_success,${primitive.firstAttemptSuccess},${harness.firstAttemptSuccess}\nmeasured_inference_cost_usd,${primitive.measuredInferenceCostUsd},${harness.measuredInferenceCostUsd}\ncost_per_success_usd,${primitive.costPerSuccessfulRunUsd},${harness.costPerSuccessfulRunUsd}\n`)
writeFileSync(resolve(here, 'unit-economics/unit-economics.json'), `${JSON.stringify({ basis: 'Measured Luna + Harness inference cost per successful execution', costPerSuccessfulExecutionUsd: harness.costPerSuccessfulRunUsd, exclusions: ['browser worker compute', 'database', 'queues', 'storage', 'monitoring', 'other infrastructure'], estimates: unitEconomics }, null, 2)}\n`)
writeFileSync(resolve(here, 'unit-economics/unit-economics.csv'), `tasks_per_user_month,per_active_user_usd,2000_active_users_usd\n${unitEconomics.map(row => `${row.tasksPerMonth},${row.perActiveUserUsd},${row.twoThousandActiveUsersUsd}`).join('\n')}\n`)

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const pct = value => `${(value * 100).toFixed(1)}%`
const money = value => `$${value.toFixed(6)}`
const colors = { primitive: '#7357D9', harness: '#E04F78', negative: '#D1495B', neutral: '#171717', grid: '#DEDCD6', muted: '#66635D', bg: '#FBFAF6' }
const shell = (title, subtitle, body, footnote = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="${colors.bg}"/><style>text{font-family:Inter,Arial,sans-serif;fill:${colors.neutral}}.title{font-size:44px;font-weight:700;letter-spacing:-1.1px}.subtitle{font-size:22px;fill:${colors.muted}}.axis{font-size:17px;fill:${colors.muted}}.label{font-size:21px;font-weight:650}.value{font-size:25px;font-weight:700}.big{font-size:54px;font-weight:750}.note{font-size:16px;fill:${colors.muted}}</style><text class="title" x="105" y="92">${esc(title)}</text><text class="subtitle" x="105" y="132">${esc(subtitle)}</text>${body}${footnote ? `<text class="note" x="105" y="958">${esc(footnote)}</text>` : ''}</svg>`
const render = (directory, name, svg) => { const svgPath = resolve(here, directory, `${name}.svg`); writeFileSync(svgPath, `${svg}\n`); execFileSync('rsvg-convert', ['--width', '3200', '--height', '2000', '--output', resolve(here, directory, `${name}.png`), svgPath]) }
const points = [{ key: 'primitive', name: 'Luna primitive', metric: primitive }, { key: 'harness', name: 'Luna + Harness', metric: harness }]

function scatter(title, subtitle, selector, formatter, domain, ticks, footnote) {
  const left = 215, right = 1460, top = 235, bottom = 820
  const costs = points.map(point => point.metric.measuredInferenceCostUsd), minCost = Math.min(...costs) - .012, maxCost = Math.max(...costs) + .012
  const x = cost => left + (cost - minCost) / (maxCost - minCost) * (right - left)
  const y = value => bottom - (value - domain[0]) / (domain[1] - domain[0]) * (bottom - top)
  const grid = ticks.map(tick => `<line x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}" stroke="${colors.grid}"/><text class="axis" x="190" y="${y(tick)+6}" text-anchor="end">${formatter(tick)}</text>`).join('')
  const line = `<line x1="${x(costs[0])}" y1="${y(selector(primitive))}" x2="${x(costs[1])}" y2="${y(selector(harness))}" stroke="${colors.neutral}" stroke-width="3"/>`
  const marks = points.map((point, index) => { const cx=x(point.metric.measuredInferenceCostUsd), cy=y(selector(point.metric)); const anchor=index ? 'end':'start'; const tx=index ? cx-22:cx+22; return `<circle cx="${cx}" cy="${cy}" r="13" fill="${colors[point.key]}"/><text class="label" x="${tx}" y="${cy-36}" text-anchor="${anchor}">${point.name}</text><text class="axis" x="${tx}" y="${cy-8}" text-anchor="${anchor}">${money(point.metric.measuredInferenceCostUsd)} · ${formatter(selector(point.metric))}</text>` }).join('')
  const xTicks = costs.map(cost => `<text class="axis" x="${x(cost)}" y="865" text-anchor="middle">${money(cost)}</text>`).join('')
  return shell(title, subtitle, `${grid}${line}${marks}${xTicks}<text class="axis" x="838" y="918" text-anchor="middle">Measured inference cost · 60 live runs</text>`, footnote)
}

render('charts', 'success-vs-cost', scatter('Execution reliability vs inference cost', 'Same GPT-5.6 Luna model · ShotCount reliability layer is the changed variable', metric => metric.successRate, pct, [.82,.94], [.84,.86,.88,.90,.92,.94], 'Observed success fell 3.3 percentage points; provider timeouts dominated the final run.'))
render('charts', 'precision-vs-cost', scatter('Reliable execution without unsafe side effects', 'Both result sets preserved correct external effects and duplicate protection', metric => metric.executionPrecision, pct, [.98,1.005], [.98,.99,1], 'Execution precision remained 100.0% in both 60-run samples.'))
render('charts', 'distance-to-done-vs-cost', scatter('Distance-to-Done vs inference cost', 'Failed runs remain included in the score', metric => metric.distanceToDone, value => `${value.toFixed(2)}/5`, [4.4,4.9], [4.4,4.5,4.6,4.7,4.8,4.9], 'The harness result did not meet the pre-registered 4.85/5 production gate.'))

function deltaBars(title, subtitle, baseValue, finalValue, footnote) {
  const max=1, left=270, width=1120, barH=120, y1=330, y2=590, scale=value=>value/max*width, delta=finalValue-baseValue
  const deltaColor=delta>=0?colors.harness:colors.negative
  const body=`<text class="label" x="105" y="${y1+72}">Luna primitive</text><rect x="${left}" y="${y1}" width="${scale(baseValue)}" height="${barH}" rx="5" fill="${colors.primitive}"/><text class="value" x="${left+scale(baseValue)-18}" y="${y1+73}" text-anchor="end" fill="#fff">${pct(baseValue)}</text><text class="label" x="105" y="${y2+72}">Luna + Harness</text><rect x="${left}" y="${y2}" width="${scale(finalValue)}" height="${barH}" rx="5" fill="${colors.harness}"/><text class="value" x="${left+scale(finalValue)-18}" y="${y2+73}" text-anchor="end" fill="#fff">${pct(finalValue)}</text><text class="big" x="${left}" y="820" fill="${deltaColor}">${delta>=0?'+':''}${(delta*100).toFixed(1)} pp</text><text class="axis" x="${left}" y="855">measured change</text>`
  return shell(title, subtitle, body, footnote)
}
render('charts','primitive-plus-harness',deltaBars('Cheap model + execution layer','The measured final run was affected by browser-provider degradation',primitive.successRate,harness.successRate,'No uplift is claimed: overall success moved from 90.0% to 86.7%.'))
render('charts','browser-uplift',deltaBars('Browser success before and after the harness','Same Luna model · provider-confirmed live executions',primitive.categories.browser.successRate,harness.categories.browser.successRate,'Google Flights timeouts produced six of eight final-run failures.'))

function categoryChart(){
  const left=390,right=1430,top=260,rowGap=145,x=value=>left+value*(right-left)
  const rows=categories.map((category,index)=>{const y=top+index*rowGap,p=primitive.categories[category].successRate,h=harness.categories[category].successRate,same=p===h;return `<text class="label" x="105" y="${y+7}">${labels[category]}</text><line x1="${x(p)}" x2="${x(h)}" y1="${y}" y2="${y}" stroke="${colors.neutral}" stroke-width="3"/><circle cx="${x(p)+(same?-10:0)}" cy="${y}" r="12" fill="${colors.primitive}"/><circle cx="${x(h)+(same?10:0)}" cy="${y}" r="12" fill="${colors.harness}"/><text class="axis" x="${x(p)}" y="${y-24}" text-anchor="middle">${same?'both ':''}${pct(p)}</text>${same?'':`<text class="axis" x="${x(h)}" y="${y+39}" text-anchor="middle">${pct(h)}</text>`}`}).join('')
  const legend=`<circle cx="390" cy="190" r="9" fill="${colors.primitive}"/><text class="axis" x="410" y="197">Luna primitive</text><circle cx="610" cy="190" r="9" fill="${colors.harness}"/><text class="axis" x="630" y="197">Luna + Harness</text>`
  const ticks=[.6,.7,.8,.9,1].map(v=>`<text class="axis" x="${x(v)}" y="870" text-anchor="middle">${pct(v)}</text>`).join('')
  return shell('Category reliability before and after','Exact same 20-task benchmark · three fresh runs per task',`${legend}${rows}${ticks}`,'Email and Calendar stayed perfect; Cross-tool improved; Browser regressed under provider timeouts.')
}
render('charts','category-before-after',categoryChart())
render('charts','cost-per-success',deltaBars('Cost per successful real-world task','Measured inference cost divided by provider-verified successful runs',primitive.costPerSuccessfulRunUsd/.01,harness.costPerSuccessfulRunUsd/.01,'Scale is $0.010000; exact costs: Luna primitive $0.007738 · Luna + Harness $0.008409.').replace('Luna primitive</text>','Luna primitive</text>').replace(`${pct(primitive.costPerSuccessfulRunUsd/.01)}`,money(primitive.costPerSuccessfulRunUsd)).replace(`${pct(harness.costPerSuccessfulRunUsd/.01)}`,money(harness.costPerSuccessfulRunUsd)).replace(/[-+]\d+\.\d pp<\/text><text class="axis"[^>]*>measured change<\/text>/,'</text>'))

function summaryGraphic(){
  const metrics=[['Live task success',primitive.successRate,harness.successRate,pct],['Browser success',primitive.categories.browser.successRate,harness.categories.browser.successRate,pct],['Cross-tool success',primitive.categories.cross_tool.successRate,harness.categories.cross_tool.successRate,pct],['Execution precision',primitive.executionPrecision,harness.executionPrecision,pct],['Distance-to-Done',primitive.distanceToDone,harness.distanceToDone,v=>`${v.toFixed(2)}/5`],['Cost per success',primitive.costPerSuccessfulRunUsd,harness.costPerSuccessfulRunUsd,money]]
  const header=`<text class="label" x="815" y="215" text-anchor="middle">LUNA PRIMITIVE</text><text class="label" x="1265" y="215" text-anchor="middle">LUNA + SHOTCOUNT</text>`
  const rows=metrics.map(([label,p,h,format],i)=>{const y=300+i*102;return `<text class="label" x="105" y="${y}">${label}</text><text class="value" x="815" y="${y}" text-anchor="middle">${format(p)}</text><text class="value" x="1265" y="${y}" text-anchor="middle">${format(h)}</text><line x1="105" x2="1450" y1="${y+34}" y2="${y+34}" stroke="${colors.grid}"/>`}).join('')
  return shell('Same model. Reliability still depends on provider execution.','The final 60-run sample preserved safety but missed the production reliability gates',`${header}${rows}<text class="axis" x="105" y="918">Decision: Luna + Harness is not sufficient as the sole default for current use cases.</text>`,'Six browser-provider timeouts, one stale-message read, and one cross-tool ordering failure account for all eight failures.')
}
render('investor-summary','luna-final-summary',summaryGraphic())

const categoryRows=categories.map(category=>`| ${labels[category]} | ${pct(primitive.categories[category].successRate)} | ${pct(harness.categories[category].successRate)} | ${((harness.categories[category].successRate-primitive.categories[category].successRate)*100).toFixed(1)} pp |`).join('\n')
const failureRows=failures.map(f=>`| ${f.taskId} | ${f.runNumber} | ${labels[f.category]} | ${f.failureReason} | ${f.finalState} |`).join('\n')
writeFileSync(resolve(here,'methodology.md'),`# Luna final benchmark methodology\n\n- Model: \`gpt-5.6-luna\`, reasoning effort low, storage disabled, automatic tool choice, parallel tools disabled, 2,400 maximum output tokens.\n- Benchmark: the frozen 20 tasks, three independent fresh executions per task, 60 runs total.\n- Providers, accounts, tools, prompts, approvals, scoring, and completion semantics were unchanged.\n- The only intended variable was the model-agnostic reliability and semantic verification layer.\n- Semantic verification compares canonical instants and timezone meaning, attendee/date/time/duration facts, and contradictions against provider-confirmed Calendar state. Natural but factually equivalent email subjects are accepted.\n- The complete final result is \`results/final-60-2/latest.json\`. Earlier interrupted/preflight runs remain preserved but are excluded from final metrics.\n- All failed runs are preserved. No failed result was replaced.\n`)
writeFileSync(resolve(here,'report.md'),`# Luna + ShotCount Harness — final evidence\n\n## Decision\n\nLuna + Harness is **not sufficient as the sole default** for current use cases under the pre-registered gates. It achieved ${harness.successfulRuns}/60 (${pct(harness.successRate)}), 100% precision, and zero median non-approval interventions, but missed overall success, Cross-tool, Browser, and Distance-to-Done gates.\n\n## Before and after\n\n| Category | Luna primitive | Luna + Harness | Change |\n|---|---:|---:|---:|\n${categoryRows}\n\nOverall success moved from ${pct(primitive.successRate)} to ${pct(harness.successRate)}. Cross-tool improved by 6.7 percentage points. Browser fell by 20.0 points because repeated Google Flights timeouts dominated the final sample. The measured harness cost rose ${((harness.measuredInferenceCostUsd/primitive.measuredInferenceCostUsd-1)*100).toFixed(1)}%, from ${money(primitive.measuredInferenceCostUsd)} to ${money(harness.measuredInferenceCostUsd)}.\n\n## Production gates\n\n${Object.entries(gates).map(([key,value])=>`- ${value?'PASS':'FAIL'} — ${key}`).join('\n')}\n\n## Preserved failures\n\n| Task | Run | Category | Failure | Final state |\n|---|---:|---|---|---|\n${failureRows}\n\nThe failures are primarily systems/provider failures, not evidence that a stronger language model would resolve browser-provider availability. The cross-tool failures expose one provider-state read failure and one orchestration ordering/state issue. Sol or Terra therefore cannot be retired on this evidence, but model escalation alone is not a demonstrated remedy for these failures.\n\n## Investor interpretation\n\n1. Luna + ShotCount cannot yet replace Sol/Terra as the sole default under the frozen production criteria.\n2. The measured reliability change was -3.3 points overall, +6.7 Cross-tool, and -20.0 Browser; no overall uplift should be claimed.\n3. Inference cost increased 4.7%, which is modest in absolute dollars but did not buy higher observed success.\n4. Execution precision remained 100%.\n5. Cross-tool benefited most; Browser regressed because of provider timeouts.\n6. A verified successful task cost ${money(harness.costPerSuccessfulRunUsd)} in model inference.\n7. At 20 successful tasks per month, model inference is about $${(harness.costPerSuccessfulRunUsd*20).toFixed(3)} per active user.\n8. Investors can confidently be shown 100% execution precision, perfect Email/Calendar results, low inference cost, and the honest remaining Browser/provider reliability risk.\n`)
console.log(JSON.stringify({ primitive, harness, failures, gates, sufficient, unitEconomics }, null, 2))
