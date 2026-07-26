import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const solPayload = JSON.parse(readFileSync(resolve(here, '../agent-execution-live/results/live-v2/latest.json'), 'utf8'))
const terraPayload = JSON.parse(readFileSync(resolve(here, 'results/terra/latest.json'), 'utf8'))
const sol = solPayload.runs
const terra = terraPayload.runs
if (sol.length !== 60 || terra.length !== 60) throw new Error('Model ablation requires 60 runs for each model.')

const categories = ['overall', 'email', 'calendar', 'cross_tool', 'browser']
const labels = { overall: 'Overall', email: 'Email', calendar: 'Calendar', cross_tool: 'Cross-tool', browser: 'Browser' }
const mean = values => values.reduce((sum, value) => sum + Number(value), 0) / values.length
const median = values => { const a = [...values].sort((x, y) => x - y); return (a[29] + a[30]) / 2 }
const pick = (rows, category) => category === 'overall' ? rows : rows.filter(row => row.category === category)
const money = value => `$${value.toFixed(6)}`
const pct = value => `${(value * 100).toFixed(1)}%`
const pp = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function summarize(rows) {
  const byCategory = Object.fromEntries(categories.map(category => {
    const selected = pick(rows, category)
    return [category, { runs: selected.length, passed: selected.reduce((n, row) => n + Number(row.success), 0), success: mean(selected.map(row => row.success)) }]
  }))
  const cost = rows.reduce((sum, row) => sum + Number(row.inference_cost_usd), 0)
  const tokens = ['input_tokens', 'cached_input_tokens', 'cache_write_tokens', 'output_tokens'].reduce((out, key) => ({ ...out, [key]: rows.reduce((sum, row) => sum + Number(row[key]), 0) }), {})
  return {
    ...byCategory, cost, costPerRun: cost / rows.length,
    costPerSuccess: cost / byCategory.overall.passed,
    precision: mean(rows.map(row => row.execution_precision)),
    medianInterventions: median(rows.map(row => Number(row.non_approval_human_interventions))),
    averageInterventions: mean(rows.map(row => row.non_approval_human_interventions)),
    distance: mean(rows.map(row => row.distance_to_done)),
    firstAttempt: mean(rows.map(row => row.first_attempt_success)),
    retries: rows.reduce((sum, row) => sum + Number(row.retry_count), 0), tokens,
  }
}

const s = summarize(sol)
const t = summarize(terra)
const savings = s.cost - t.cost
const reduction = savings / s.cost
const chartDir = resolve(here, 'charts')
const summaryDir = resolve(here, 'yc-summary')
const solDir = resolve(here, 'results/sol-reference')
mkdirSync(chartDir, { recursive: true }); mkdirSync(summaryDir, { recursive: true }); mkdirSync(solDir, { recursive: true })
copyFileSync(resolve(here, '../agent-execution-live/results/live-v2/latest.json'), resolve(solDir, 'latest.json'))
copyFileSync(resolve(here, '../agent-execution-live/results/live-v2/latest.csv'), resolve(solDir, 'latest.csv'))
const logo = readFileSync(resolve(here, '../agent-execution-live/assets/shotcount-logo-transparent.png')).toString('base64')
const colors = { sol: '#7867D8', terra: '#E87DB9', teal: '#68C9C1', orange: '#F2A65A' }

function shell(title, subtitle, content, note = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1160" viewBox="0 0 1600 1160"><rect width="1600" height="1160" fill="#fff"/><style>text{font-family:Arial,Helvetica,sans-serif;fill:#111}.title{font-size:34px;font-weight:700}.subtitle{font-size:32px;font-weight:700}.axis{font-size:21px}.label{font-size:23px}.value{font-size:23px}.note{font-size:18px;fill:#555}.big{font-size:52px;font-weight:700}.small{font-size:19px;fill:#555}</style><text class="title" x="112" y="102">${esc(title)}</text><text class="subtitle" x="112" y="142">${esc(subtitle)}</text><image href="data:image/png;base64,${logo}" x="1410" y="66" width="92" height="92" preserveAspectRatio="xMidYMid meet"/>${content}${note ? `<text class="note" x="112" y="1110">${esc(note)}</text>` : ''}</svg>`
}
function render(name, svg, dir = chartDir) {
  const path = resolve(dir, `${name}.svg`); writeFileSync(path, `${svg}\n`)
  execFileSync('rsvg-convert', ['--width', '3200', '--height', '2320', '--output', resolve(dir, `${name}.png`), path])
}
function successChart() {
  const left = 205, top = 315, bottom = 840, group = 250, width = 82
  const ticks = [0,20,40,60,80,100].map(v => `<text class="axis" x="175" y="${bottom-v/100*(bottom-top)+7}" text-anchor="end">${v}</text>`).join('')
  const bars = categories.map((key, i) => {
    const x = left + i * group
    return [['sol',s[key].success],['terra',t[key].success]].map(([skey,value],j) => { const bx=x+j*100, h=value*(bottom-top), y=bottom-h; return `<rect x="${bx}" y="${y}" width="${width}" height="${h}" rx="4" fill="${colors[skey]}" fill-opacity=".78"/><text class="value" x="${bx+width/2}" y="${y-14}" text-anchor="middle">${pct(value)}</text>` }).join('') + `<text class="label" x="${x+91}" y="890" text-anchor="middle">${labels[key]}</text>`
  }).join('')
  return shell('ShotCount execution quality across model tiers','Same product, prompts, tools and verification',`${ticks}<text class="axis" transform="translate(105 578) rotate(-90)" text-anchor="middle">Successful runs (%)</text>${bars}<circle cx="610" cy="240" r="11" fill="${colors.sol}"/><text class="label" x="632" y="248">GPT-5.6 Sol</text><circle cx="840" cy="240" r="11" fill="${colors.terra}"/><text class="label" x="862" y="248">GPT-5.6 Terra</text>`,'20 tasks · three fresh runs each · 60 production-path runs per model')
}
function costChart() {
  const x0=245,x1=1390,y0=840,y1=310,x=v=>x0+(v-.8)/(1.8-.8)*(x1-x0),y=v=>y0-(v-.7)/(1-.7)*(y0-y1)
  const ticks=[.8,1,1.2,1.4,1.6,1.8].map(v=>`<text class="axis" x="${x(v)}" y="885" text-anchor="middle">$${v.toFixed(1)}</text>`).join('')
  const yt=[70,80,90,100].map(v=>`<text class="axis" x="205" y="${y(v/100)+7}" text-anchor="end">${v}%</text>`).join('')
  const point=(name,m,color,dx,dy)=>`<circle cx="${x(m.cost)}" cy="${y(m.overall.success)}" r="18" fill="${color}"/><text class="value" x="${x(m.cost)+dx}" y="${y(m.overall.success)+dy}">${name}</text><text class="small" x="${x(m.cost)+dx}" y="${y(m.overall.success)+dy+30}">${money(m.cost)} · ${pct(m.overall.success)}</text>`
  return shell('Execution quality vs model cost','Measured inference spend across 60 live runs',`${ticks}${yt}<text class="axis" x="820" y="955" text-anchor="middle">Inference cost per 60-run benchmark</text><text class="axis" transform="translate(112 580) rotate(-90)" text-anchor="middle">Task success rate</text>${point('GPT-5.6 Sol',s,colors.sol,-205,-30)}${point('GPT-5.6 Terra',t,colors.terra,30,5)}`,'Terra costs 44.6% less, but loses 20.0 percentage points of task success')
}
function twoBars(title,subtitle,solValue,terraValue,format,maximum,note) {
  const bottom=840,top=330,h=v=>(v/maximum)*(bottom-top)
  const bar=(x,v,color,label)=>`<rect x="${x}" y="${bottom-h(v)}" width="250" height="${h(v)}" rx="5" fill="${color}" fill-opacity=".78"/><text class="value" x="${x+125}" y="${bottom-h(v)-18}" text-anchor="middle">${format(v)}</text><text class="label" x="${x+125}" y="890" text-anchor="middle">${label}</text>`
  return shell(title,subtitle,`${bar(410,solValue,colors.sol,'GPT-5.6 Sol')}${bar(910,terraValue,colors.terra,'GPT-5.6 Terra')}`,note)
}
render('01-success-vs-model', successChart())
render('02-cost-vs-success', costChart())
render('03-execution-precision', twoBars('Execution precision across model tiers','Correct external effects without duplicate writes',s.precision*100,t.precision*100,v=>`${v.toFixed(1)}%`,100,'Both models preserved 100% execution precision across 60 runs'))
render('04-user-interventions', twoBars('User intervention across model tiers','Average non-approval interventions per run',s.averageInterventions,t.averageInterventions,v=>v.toFixed(2),.5,'Median interventions: 0 for Sol and 0 for Terra'))

const summary = shell('ShotCount model-cost ablation','Measured production-path execution quality and cost',`<text class="label" x="240" y="310">GPT-5.6 Sol</text><text class="big" x="240" y="400">${pct(s.overall.success)}</text><text class="small" x="240" y="438">task success</text><text class="big" x="240" y="545">${pct(s.precision)}</text><text class="small" x="240" y="583">execution precision</text><text class="big" x="240" y="690">${s.medianInterventions.toFixed(0)}</text><text class="small" x="240" y="728">median interventions</text><text class="big" x="240" y="835">${money(s.cost)}</text><text class="small" x="240" y="873">60-run inference cost</text><text class="label" x="900" y="310">GPT-5.6 Terra</text><text class="big" x="900" y="400">${pct(t.overall.success)}</text><text class="small" x="900" y="438">task success</text><text class="big" x="900" y="545">${pct(t.precision)}</text><text class="small" x="900" y="583">execution precision</text><text class="big" x="900" y="690">${t.medianInterventions.toFixed(0)}</text><text class="small" x="900" y="728">median interventions</text><text class="big" x="900" y="835">${money(t.cost)}</text><text class="small" x="900" y="873">60-run inference cost</text>`,'Terra is cheaper and equally precise, but its 20-point quality loss fails the near-frontier threshold')
render('shotcount-model-ablation-summary', summary, summaryDir)
writeFileSync(resolve(summaryDir,'index.html'),'<!doctype html><meta charset="utf-8"><title>ShotCount model ablation</title><style>html,body{margin:0;background:#fff}img{display:block;width:100%;height:auto}</style><img src="shotcount-model-ablation-summary.svg" alt="ShotCount model ablation summary">\n')

const categoryRows = categories.slice(1).map(key=>`| ${labels[key]} | ${s[key].passed}/15 (${pct(s[key].success)}) | ${t[key].passed}/15 (${pct(t[key].success)}) | ${pp(t[key].success-s[key].success)} |`).join('\n')
const failures = terra.filter(row=>!row.success)
const failureCounts = Object.entries(Object.groupBy(failures,row=>row.failure_reason)).map(([reason,rows])=>`- ${reason}: ${rows.length}`).join('\n')
writeFileSync(resolve(here,'report.md'),`# ShotCount model-cost ablation\n\n## Result\n\nTerra reduced measured inference cost by **${pct(reduction)}** (${money(savings)}) but reduced task success by **20.0 percentage points**, from **59/60 (${pct(s.overall.success)})** to **47/60 (${pct(t.overall.success)})**. Execution precision remained **100%**, and median non-approval interventions remained **0**. Terra does not meet the benchmark's conservative near-frontier definition.\n\n| Category | GPT-5.6 Sol | GPT-5.6 Terra | Delta |\n|---|---:|---:|---:|\n${categoryRows}\n\n## Quality and economics\n\n| Metric | Sol | Terra | Delta |\n|---|---:|---:|---:|\n| Overall success | ${pct(s.overall.success)} | ${pct(t.overall.success)} | ${pp(t.overall.success-s.overall.success)} |\n| Execution precision | ${pct(s.precision)} | ${pct(t.precision)} | ${pp(t.precision-s.precision)} |\n| Median interventions | ${s.medianInterventions.toFixed(2)} | ${t.medianInterventions.toFixed(2)} | ${(t.medianInterventions-s.medianInterventions).toFixed(2)} |\n| Average interventions | ${s.averageInterventions.toFixed(2)} | ${t.averageInterventions.toFixed(2)} | ${(t.averageInterventions-s.averageInterventions).toFixed(2)} |\n| Distance-to-Done | ${s.distance.toFixed(2)}/5 | ${t.distance.toFixed(2)}/5 | ${(t.distance-s.distance).toFixed(2)} |\n| First-attempt success | ${pct(s.firstAttempt)} | ${pct(t.firstAttempt)} | ${pp(t.firstAttempt-s.firstAttempt)} |\n| Inference cost | ${money(s.cost)} | ${money(t.cost)} | -${money(savings)} |\n| Cost per run | ${money(s.costPerRun)} | ${money(t.costPerRun)} | |\n| Cost per successful run | ${money(s.costPerSuccess)} | ${money(t.costPerSuccess)} | |\n\n## Terra failures\n\n${failureCounts}\n\nThe dominant sensitivity is browser execution: Terra completed 3/15 browser runs versus Sol's 14/15. Email and cross-tool remained perfect. Calendar lost one run to an incomplete approval/resumption state. These results point to weaker browser recovery/reasoning at this model tier, not unsafe duplicate effects.\n\n## Recommendation\n\n**Keep Sol for everything (Option A) for now.** Terra is materially cheaper but falls too far below the current production reliability bar. The measured data does not support Terra as the default, and no dynamic routing change should be implemented from this ablation alone. Luna was not run because Terra fell more than five percentage points below Sol.\n`)
writeFileSync(resolve(here,'methodology.md'),`# Methodology\n\nThis is a frozen model-cost ablation of SHOTCOUNT-EVAL LIVE v2. The same 20 tasks were executed three independent times through the same production ShotCount harness, tools, Gmail/Calendar/browser integrations, approvals, retries, prompts, tool schemas, scoring, verification, provider mix, external-state reset, and success criteria. The only intended independent variable was the OpenAI model: GPT-5.6 Sol low reasoning versus GPT-5.6 Terra low reasoning.\n\nAll 60 Terra executions are preserved. Failed runs were not replaced. The isolated benchmark endpoint changed only the model identifier; production routing remained on Sol. Costs use measured token usage and each model's corresponding input, cached-input, cache-write, and output rates.\n\nTerra is considered to preserve Sol-level quality only if success is within five percentage points, precision remains 100% or statistically indistinguishable, median interventions remains zero, and Distance-to-Done falls by no more than 0.25. Terra failed the success and Distance-to-Done gates, so Luna was not automatically run.\n`)
writeFileSync(resolve(here,'results/summary.json'),`${JSON.stringify({sol:s,terra:t,delta:{costSavingsUsd:savings,costReduction:reduction,success:t.overall.success-s.overall.success,precision:t.precision-s.precision,medianInterventions:t.medianInterventions-s.medianInterventions,averageInterventions:t.averageInterventions-s.averageInterventions,distance:t.distance-s.distance,firstAttempt:t.firstAttempt-s.firstAttempt},terraFailures:failures.map(row=>({taskId:row.task_id,runNumber:row.run_number,reason:row.failure_reason,finalState:row.final_state})),lunaRun:false},null,2)}\n`)
console.log(JSON.stringify({sol:s,terra:t,savings,reduction,failures:failures.length},null,2))
