import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const primitive = JSON.parse(readFileSync(resolve(root, 'benchmarks/luna-final/results/luna-primitive-reference.json'), 'utf8')).metrics
const current = JSON.parse(readFileSync(resolve(root, 'benchmarks/luna-final/results/luna-harness-v2.json'), 'utf8')).metrics
const acceptance = JSON.parse(readFileSync(resolve(root, 'benchmarks/minimal-execution-acceptance/results/final.json'), 'utf8'))
const harnessAblation = JSON.parse(readFileSync(resolve(root, 'benchmarks/harness-ablation/results/summary.json'), 'utf8')).metrics
const shotCountLogo = readFileSync(resolve(root, 'benchmarks/agent-execution-live/assets/shotcount-logo-transparent.png')).toString('base64')
const cost = current.costPerSuccessfulRunUsd

const C = { bg: '#FAF8F3', ink: '#121212', muted: '#69665F', grid: '#D8D4CB', purple: '#6E56D9', pink: '#E34A78', blue: '#3977D6', green: '#218A68', amber: '#D98928', pale: '#EEEAE2', white: '#FFFFFF' }
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const money = (value, digits = 3) => `$${value.toFixed(digits)}`
const pct = value => `${(value * 100).toFixed(value === 1 ? 0 : 1)}%`
const style = `<style>text{font-family:Inter,Arial,sans-serif}.title{font-size:52px;font-weight:750;letter-spacing:-1.5px}.subtitle{font-size:24px;fill:${C.muted}}.kicker{font-size:18px;font-weight:700;letter-spacing:2px}.label{font-size:23px;font-weight:680}.body{font-size:20px}.small{font-size:16px;fill:${C.muted}}.metric{font-size:48px;font-weight:760;letter-spacing:-1px}.hero{font-size:72px;font-weight:780;letter-spacing:-2px}</style>`
const shell = (title, subtitle, body, footnote = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="${C.bg}"/>${style}<text class="title" x="110" y="105">${esc(title)}</text>${subtitle ? `<text class="subtitle" x="110" y="150">${esc(subtitle)}</text>` : ''}${body}${footnote ? `<text class="small" x="110" y="1034">${esc(footnote)}</text>` : ''}</svg>`
const dirs = ['architecture', 'unit-economics', 'reliability', 'product-loop', 'appendix']
dirs.forEach(dir => mkdirSync(resolve(here, dir), { recursive: true }))
function render(dir, name, svg) {
  const svgPath = resolve(here, dir, `${name}.svg`)
  writeFileSync(svgPath, `${svg}\n`)
  execFileSync('rsvg-convert', ['--width', '3840', '--height', '2160', '--output', resolve(here, dir, `${name}.png`), svgPath])
}
function renderAt(dir, name, svg, width, height) {
  const svgPath = resolve(here, dir, `${name}.svg`)
  writeFileSync(svgPath, `${svg}\n`)
  execFileSync('rsvg-convert', ['--width', String(width), '--height', String(height), '--output', resolve(here, dir, `${name}.png`), svgPath])
}

function architecture() {
  const stackX=110, stackW=1040
  const luna=`<rect x="${stackX}" y="225" width="${stackW}" height="250" rx="12" fill="${C.pale}"/><text class="kicker" x="160" y="280">LUNA</text><text class="metric" x="160" y="355">Default intelligence</text><text class="body" x="160" y="405" fill="${C.muted}">Low-cost planning, tool choice and task execution</text>`
  const harness=`<rect x="${stackX}" y="495" width="${stackW}" height="330" rx="12" fill="${C.purple}"/><text class="kicker" x="160" y="550" fill="white">SHOTCOUNT RELIABILITY LAYER</text><text class="label" x="160" y="620" fill="white">Browser recovery</text><text class="label" x="520" y="620" fill="white">Provider reconciliation</text><text class="label" x="160" y="690" fill="white">State + ordering</text><text class="label" x="520" y="690" fill="white">Deterministic verification</text><text class="label" x="160" y="760" fill="white">Idempotency + completion evidence</text>`
  const sol=`<rect x="${stackX}" y="845" width="${stackW}" height="110" rx="12" fill="${C.ink}"/><text class="kicker" x="160" y="890" fill="white">SOL</text><text class="label" x="160" y="930" fill="white">Verified reasoning fallback only</text>`
  const evidence=[['3/3','known failure classes resolved'],['100%','execution precision'],['0','manual rescues'],['0','duplicate / unintended actions'],['0','infrastructure failures sent to Sol']].map(([v,l],i)=>`<text class="metric" x="1270" y="${280+i*145}">${v}</text><text class="body" x="1450" y="${280+i*145}">${l}</text><line x1="1270" x2="1810" y1="${315+i*145}" y2="${315+i*145}" stroke="${C.grid}"/>`).join('')
  return shell('Cheap intelligence. Deterministic reliability.','Frontier reasoning only when necessary · targeted acceptance evidence',`${luna}${harness}${sol}${evidence}`,'The Sol fallback was deliberately exercised once to verify plumbing; this does not measure production escalation frequency.')
}
render('architecture','execution-architecture',architecture())

function bars(title, subtitle, values, unit, highlightIndex, footnote) {
  const left=420,right=1740,top=260,row=130,max=Math.max(...values.map(v=>v.value))*1.08
  const marks=values.map((item,i)=>{const y=top+i*row,w=item.value/max*(right-left),active=i===highlightIndex,color=active?C.pink:C.purple;return `<text class="label" x="110" y="${y+39}">${item.label}</text><rect x="${left}" y="${y}" width="${w}" height="58" rx="5" fill="${color}"/><text class="label" x="${left+w+22}" y="${y+39}">${unit(item.value)}</text>${active?`<text class="small" x="${left+w+22}" y="${y+70}">typical planning case</text>`:''}`}).join('')
  return shell(title,subtitle,marks,footnote)
}
const levels=[5,10,20,50,100]
const perUser=levels.map(n=>({label:`${n} tasks / month`,value:n*cost}))
render('unit-economics','active-user-monthly-cost',bars('Agentic execution costs cents per active user','Measured production-path model inference at $0.008409 per successful task',perUser,v=>money(v,2),2,'Measured model inference only; excludes browser compute, database, storage, queues and monitoring.'))
const twoK=levels.map(n=>({label:`${n} tasks / user`,value:n*cost*2000}))
render('unit-economics','two-thousand-user-economics',bars('Model inference remains small at early scale','Estimated monthly inference spend · 2,000 active users',twoK,v=>money(v,0),2,'Inference only; not total infrastructure COGS. The highlighted 20-task case is $336.37/month.'))

function precision() {
  const ring=`<circle cx="535" cy="550" r="235" fill="none" stroke="${C.grid}" stroke-width="28"/><circle cx="535" cy="550" r="235" fill="none" stroke="${C.green}" stroke-width="28" stroke-dasharray="1476 1476" transform="rotate(-90 535 550)"/><text class="hero" x="535" y="545" text-anchor="middle">100%</text><text class="label" x="535" y="590" text-anchor="middle">execution precision</text>`
  const rows=[['0','duplicate / unintended actions'],['0','manual rescues'],['3/3','targeted known-failure acceptance']].map(([v,l],i)=>`<text class="metric" x="1000" y="${400+i*150}">${v}</text><text class="label" x="1155" y="${400+i*150}">${l}</text><line x1="1000" x2="1770" y1="${440+i*150}" y2="${440+i*150}" stroke="${C.grid}"/>`).join('')
  return shell('Measured execution precision','When ShotCount acts, provider-visible effects remain intended and exactly once',`${ring}${rows}`,'100% execution precision across measured benchmark and targeted acceptance runs; this is not a claim of universal task reliability.')
}
render('reliability','execution-precision',precision())

function failures() {
  const rows=[
    ['Browser / provider timeout','Worker recycle + canonical search reconstruction','PASS WITH LUNA'],
    ['Stale Gmail provider state','Provider reread + canonical reconciliation','PASS WITH LUNA'],
    ['Cross-tool ordering / reasoning boundary','Ordered evidence + deterministic verifier','SOL VERIFIED REPAIR'],
  ]
  const body=rows.map((r,i)=>{const y=300+i*235;return `<text class="label" x="110" y="${y}">${r[0]}</text><line x1="550" x2="730" y1="${y-8}" y2="${y-8}" stroke="${C.grid}" stroke-width="3"/><path d="M720 ${y-18} L740 ${y-8} L720 ${y+2}" fill="none" stroke="${C.grid}" stroke-width="3"/><rect x="760" y="${y-55}" width="590" height="95" rx="8" fill="${C.pale}"/><text class="body" x="800" y="${y+3}">${r[1]}</text><line x1="1380" x2="1480" y1="${y-8}" y2="${y-8}" stroke="${C.grid}" stroke-width="3"/><path d="M1470 ${y-18} L1490 ${y-8} L1470 ${y+2}" fill="none" stroke="${C.grid}" stroke-width="3"/><rect x="1510" y="${y-55}" width="300" height="95" rx="8" fill="${i===2?C.ink:C.green}"/><text x="1660" y="${y+2}" text-anchor="middle" fill="white" font-size="15" font-weight="700" letter-spacing="1.2">${r[2]}</text>`}).join('')
  return shell('ShotCount turns known agent failure modes into recoverable states','Three exact failures · three targeted production-path acceptances',body,'The third scenario used test-only semantic substitution to exercise Sol fallback; no production escalation rate is inferred.')
}
render('reliability','known-failures-recovered',failures())

function lunaEconomics(){
  const left=`<text class="kicker" x="110" y="270">BROADER 60-RUN BENCHMARK</text><text class="hero" x="110" y="390">90.0%</text><text class="label" x="110" y="435">primitive live-task success</text><text class="metric" x="110" y="555">100%</text><text class="body" x="110" y="590">execution precision</text><text class="metric" x="110" y="710">4.80/5</text><text class="body" x="110" y="745">Distance-to-Done</text><text class="metric" x="110" y="865">$0.007738</text><text class="body" x="110" y="900">cost per successful task</text>`
  const right=`<rect x="930" y="245" width="850" height="660" rx="16" fill="${C.purple}"/><text class="kicker" x="1000" y="315" fill="white">CURRENT PRODUCTION-PATH UNIT COST</text><text class="hero" x="1000" y="500" fill="white">$0.008409</text><text class="label" x="1000" y="550" fill="white">per successful task</text><text class="body" x="1000" y="650" fill="white">Conservative measured reference used</text><text class="body" x="1000" y="690" fill="white">for all investor unit economics</text><line x1="1000" x2="1670" y1="760" y2="760" stroke="white" opacity=".35"/><text class="body" x="1000" y="820" fill="white">Sub-cent model inference</text>`
  return shell('Sub-cent model economics for real-world execution','Broader model capability and current production-path unit cost are shown separately',`${left}<line x1="820" x2="820" y1="245" y2="905" stroke="${C.grid}"/>${right}`,'The 3/3 targeted acceptance is not presented as a success-rate estimate and is not directly compared to the 60-run benchmark.')
}
render('appendix','luna-execution-economics',lunaEconomics())

function productLoop(){
  const nodes=[
    [['INTENT'],['“Win a','scholarship”']],
    [['ASK ROON'],['Break outcome','into tasks']],
    [['TASK'],['Persistent','ShotCount object']],
    [['DELEGATE'],['Luna executes']],
    [['SHOTCOUNT','RELIABILITY'],['Recover · verify','· preserve']],
    [['REAL-WORLD','OUTCOME'],['Email · meeting','· flight']],
    [['SOCIAL','ACCOUNTABILITY'],['Progress becomes','visible']],
  ]
  const xs=nodes.map((_,i)=>100+i*250), width=210
  const lines=(items,x,y,size,weight,fill,gap)=>`<text x="${x}" y="${y}" text-anchor="middle" fill="${fill}" font-size="${size}" font-weight="${weight}">${items.map((line,j)=>`<tspan x="${x}" dy="${j?gap:0}">${line}</tspan>`).join('')}</text>`
  const body=nodes.map(([a,b],i)=>{const accent=i===4||i===5, cx=xs[i]+width/2;return `<rect x="${xs[i]}" y="400" width="${width}" height="185" rx="12" fill="${i===4?C.purple:i===5?C.green:C.pale}"/>${lines(a,cx,447,14,700,accent?'white':C.ink,18)}${lines(b,cx,515,17,400,accent?'white':C.muted,22)}${i<nodes.length-1?`<path d="M${xs[i]+width} 492 H${xs[i+1]-18} M${xs[i+1]-32} 480 L${xs[i+1]-18} 492 L${xs[i+1]-32} 504" fill="none" stroke="${C.ink}" stroke-width="2"/>`:''}`}).join('')
  const loop=`<path d="M1755 620 C1755 820 215 820 215 620" fill="none" stroke="${C.pink}" stroke-width="4"/><path d="M205 636 L215 616 L225 636" fill="none" stroke="${C.pink}" stroke-width="4"/><text class="label" x="985" y="870" text-anchor="middle">Visible progress creates the next execution cycle</text>`
  return shell('The to-do list becomes an execution interface','ShotCount connects intent, persistent tasks and provider-confirmed outcomes',`${body}${loop}`,'Product flow is conceptual; no quantitative frequency is implied.')
}
render('product-loop','todo-list-execution-interface',productLoop())

function harnessCategoryComparison(){
  const categories=[
    ['Email',harnessAblation.shotcount.category.email.success,harnessAblation.generic.category.email.success],
    ['Calendar',harnessAblation.shotcount.category.calendar.success,harnessAblation.generic.category.calendar.success],
    ['Cross-tool',harnessAblation.shotcount.category.cross_tool.success,harnessAblation.generic.category.cross_tool.success],
    ['Browser',harnessAblation.shotcount.category.browser.success,harnessAblation.generic.category.browser.success],
  ]
  const bg='#FFFFFF', ink='#111111', muted='#565656', dark='#B94F93', light='#E8A8CB', edge='#7F315F'
  const baseY=860, chartH=500, xs=[390,690,990,1290]
  const y=value=>baseY-value*chartH
  const ticks=[0,.2,.4,.6,.8,1].map(value=>`<text x="215" y="${y(value)+8}" text-anchor="end" font-size="22">${Math.round(value*100)}</text><line x1="230" x2="243" y1="${y(value)}" y2="${y(value)}" stroke="${ink}" stroke-width="2"/>`).join('')
  const bars=categories.map(([label,withHarness,withoutHarness],i)=>{
    const x=xs[i], wide=150, narrow=92, withoutTop=y(withoutHarness), withTop=y(withHarness)
    const labelY=Math.min(withoutTop,withTop)-18
    return `<rect x="${x-wide/2}" y="${withoutTop}" width="${wide}" height="${baseY-withoutTop}" rx="4" fill="${light}" stroke="${edge}" stroke-width="2"/>
      <rect x="${x-narrow/2}" y="${withTop}" width="${narrow}" height="${baseY-withTop}" rx="4" fill="${dark}" stroke="${edge}" stroke-width="2"/>
      <text x="${x-55}" y="${labelY}" text-anchor="middle" font-size="22">${(withoutHarness*100).toFixed(1)}%</text>
      <text x="${x+45}" y="${labelY}" text-anchor="middle" font-size="22" font-weight="700">${(withHarness*100).toFixed(1)}%</text>
      <text x="${x-52}" y="910" transform="rotate(-38 ${x-52} 910)" font-size="24">${label}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
    <rect width="1600" height="1200" fill="${bg}"/>
    <style>text{font-family:Arial,Helvetica,sans-serif;fill:${ink}}</style>
    <text x="110" y="105" font-size="34" font-weight="700">ShotCount harness ablation</text>
    <text x="110" y="145" font-size="34" font-weight="700">Live execution success by use-case category</text>
    <image x="1430" y="72" width="82" height="82" href="data:image/png;base64,${shotCountLogo}"/>
    <circle cx="245" cy="250" r="11" fill="${dark}" stroke="${edge}" stroke-width="2"/><text x="270" y="258" font-size="27">With harness</text>
    <circle cx="245" cy="290" r="11" fill="${light}" stroke="${edge}" stroke-width="2"/><text x="270" y="298" font-size="27">Without harness</text>
    <text x="105" y="655" transform="rotate(-90 105 655)" text-anchor="middle" font-size="27">Live task success (%)</text>
    ${ticks}${bars}
    <text x="110" y="1100" font-size="17" fill="${muted}">Same frozen GPT-5.6 Sol model and prompts · 15 live runs per category per condition.</text>
    <text x="110" y="1130" font-size="17" fill="${muted}">Bars share a zero baseline and overlap for comparison; values are not additive. “Without harness” is the competent minimal generic-agent baseline.</text>
  </svg>`
}
renderAt('reliability','harness-ablation-by-category',harnessCategoryComparison(),3200,2400)

console.log(JSON.stringify({ costPerSuccess: cost, perUser, twoK, acceptance: acceptance.acceptance }, null, 2))
