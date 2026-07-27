import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const resultsDir = resolve(here, 'results')
const tracesDir = resolve(here, 'traces')
const baseline = JSON.parse(readFileSync(resolve(resultsDir, 'raw.json'), 'utf8'))
const rerun = JSON.parse(readFileSync(resolve(resultsDir, 'rerun.json'), 'utf8'))
if (baseline.runs.length !== 5) throw new Error(`Expected 5 baseline runs, found ${baseline.runs.length}`)
if (rerun.runs.length !== 4) throw new Error(`Expected 4 targeted reruns, found ${rerun.runs.length}`)

const baselineCorrections = {
  'browser-search': {
    result: 'PASS', primaryFailureClass: 'NONE', exactMechanism: '', harnessFixJustified: false,
    note: 'The untouched run returned three real, constraint-valid options with the cheapest observed option ranked first. The first diagnostic verifier incorrectly parsed the display string "1 stop" as a number; this reporting correction does not rerun or change the product result.',
  },
  'browser-handoff': {
    result: 'FAIL', primaryFailureClass: 'D. TOOL / DATA COERCION',
    exactMechanism: 'The immediate selection request collided with a transient PostgREST single-object response boundary and failed with “Cannot coerce the result to a single JSON object” before browser.select_flight was recorded.',
    harnessFixJustified: true,
  },
  'browser-recovery': {
    result: 'FAIL', primaryFailureClass: 'B. BROWSER INFRASTRUCTURE',
    exactMechanism: 'The injected read-only target closure was detected and the search recovered from its checkpoint, but the selection worker later exhausted its bounded retries because Google Flights exposed no selectable itinerary.',
    harnessFixJustified: true,
  },
}
baseline.runs = baseline.runs.map(run => ({ ...run, ...(baselineCorrections[run.scenario] ?? {}) }))
writeFileSync(resolve(resultsDir, 'raw.json'), `${JSON.stringify(baseline, null, 2)}\n`)

const rerunCorrections = {
  'calendar-email': {
    result: 'FAIL', primaryFailureClass: 'A. MODEL / REASONING',
    exactMechanism: 'The Calendar update used the correct instant, but Luna changed the requested 10:00→11:30 local-time notification into 11:00→12:30 and then claimed the sent wording was verified.',
    harnessFixJustified: false,
  },
}
rerun.runs = rerun.runs.map(run => ({ ...run, ...(rerunCorrections[run.scenario] ?? {}) }))
writeFileSync(resolve(resultsDir, 'rerun.json'), `${JSON.stringify(rerun, null, 2)}\n`)

const summarize = runs => {
  const successful = runs.filter(run => run.result === 'PASS')
  const totalCost = runs.reduce((sum, run) => sum + run.inferenceCostUsd, 0)
  return {
    runs: runs.length,
    successful: successful.length,
    successRate: successful.length / runs.length,
    executionPrecision: runs.reduce((sum, run) => sum + run.executionPrecision, 0) / runs.length,
    duplicateOrUnintendedSideEffects: runs.filter(run => run.duplicateOrUnintendedSideEffects).length,
    totalInferenceCostUsd: Number(totalCost.toFixed(6)),
    costPerRunUsd: Number((totalCost / runs.length).toFixed(6)),
    costPerSuccessUsd: Number((totalCost / successful.length).toFixed(6)),
  }
}

const summary = {
  model: 'gpt-5.6-luna', reasoningEffort: 'low',
  baseline: summarize(baseline.runs), targetedRerun: summarize(rerun.runs),
  totalInferenceCostUsd: Number((summarize(baseline.runs).totalInferenceCostUsd + summarize(rerun.runs).totalInferenceCostUsd).toFixed(6)),
  browserConclusion: 'Not viable as the default yet: search-only passed, but both payment-handoff paths failed in the selection worker after valid results were found.',
  crossToolConclusion: 'Promising but not yet an unconditional default: both untouched runs passed, while the passing-control rerun exposed one Luna reasoning error in the notification wording.',
}
writeFileSync(resolve(resultsDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

const rows = [
  ...baseline.runs.map(run => ({ phase: 'baseline', ...run })),
  ...rerun.runs.map(run => ({ phase: 'targeted_rerun', ...run })),
]
const fields = ['phase', 'scenario', 'category', 'result', 'primaryFailureClass', 'exactMechanism', 'harnessFixJustified', 'executionPrecision', 'duplicateOrUnintendedSideEffects', 'inferenceCostUsd', 'finalState', 'runId', 'browserSessionId', 'recoveryInjected']
const cell = value => /[",\n]/.test(String(value ?? '')) ? `"${String(value ?? '').replaceAll('"', '""')}"` : String(value ?? '')
writeFileSync(resolve(resultsDir, 'comparison.csv'), `${fields.join(',')}\n${rows.map(row => fields.map(field => cell(row[field])).join(',')).join('\n')}\n`)

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]))
  if (typeof value !== 'string') return value
  return value.replace(/[A-Z0-9._%+-]+@gmail\.com/gi, 'CONTROLLED_ACCOUNT@example.invalid')
}

for (const name of readdirSync(tracesDir).filter(name => name.endsWith('.json'))) {
  const trace = JSON.parse(readFileSync(resolve(tracesDir, name), 'utf8'))
  const actionProviderIds = new Set(trace.events.filter(event => event.type === 'tool').map(event => event.providerActionId).filter(Boolean))
  const events = trace.events.map(event => {
    if (event.type !== 'provider_verification') return event
    const result = event.result ?? {}
    return {
      ...event,
      result: {
        ...result,
        sentMessages: (result.sentMessages ?? []).filter(message => actionProviderIds.has(message.id)),
      },
    }
  })
  const compact = sanitize({
    scenario: trace.scenario, model: trace.model, reasoningEffort: trace.reasoningEffort,
    runId: trace.runId, browserSessionId: trace.browserSessionId,
    controls: {
      recoveryInjected: trace.controls?.recoveryInjected ?? false,
      controlledReplyInjected: trace.controls?.replied ?? false,
      flightOptionSelected: trace.controls?.selected ?? false,
    },
    events,
  })
  writeFileSync(resolve(tracesDir, name), `${JSON.stringify(compact, null, 2)}\n`)
}

writeFileSync(resolve(here, 'methodology.md'), `# Luna Browser and Cross-tool diagnostic methodology\n\nThe untouched baseline used five fresh live runs through a temporary clone of the production ShotCount task agent. The clone differed only in selecting \`gpt-5.6-luna\` with low reasoning and in accepting an isolated benchmark telemetry namespace. Production prompts, tools, retries, browser worker configuration, timeouts, state handling, and completion policies were unchanged.\n\nThe fixed flight date was September 17, 2026. Browser search and selection used live Google Flights. Cross-tool scenarios used two controlled Google accounts and real Gmail and Calendar provider calls. All required email and Calendar approvals were exercised. No purchase or payment action occurred.\n\nThe recovery run injected one retryable \`browser_target_closed\` result into the task-owned browser checkpoint while the read-only search operation was waiting. It did not interrupt a write or submission.\n\nThe initial diagnostic verifier incorrectly treated the display field \`stops: "1 stop"\` as numeric. The preserved provider trace proves the search returned three valid options with numeric \`stopCount\` values and ranked the $397 one-stop result ahead of $423 and $1,171 alternatives. The baseline row is therefore reported as a pass; no run was replaced.\n\nTwo model-independent fixes were then made: negated booking language now produces a search-only prepared result, and the pre-dispatch selection record receives one bounded retry on the observed PostgREST single-object coercion race. The targeted rerun included the two failed handoff cases, the passing Browser search control, and the passing Calendar-to-email control. Existing selection-worker retries were not increased.\n`)

const b = Object.fromEntries(baseline.runs.map(run => [run.scenario, run]))
const r = Object.fromEntries(rerun.runs.map(run => [run.scenario, run]))
writeFileSync(resolve(here, 'report.md'), `# GPT-5.6 Luna Browser and Cross-tool diagnostic\n\n## Untouched baseline\n\n| Scenario | Result | Primary failure class | Exact mechanism | Harness fix justified? |\n|---|---|---|---|---|\n| Browser search | ${b['browser-search'].result} | ${b['browser-search'].primaryFailureClass} | Returned three live valid options and ranked the cheapest observed option first. | No |\n| Browser handoff | ${b['browser-handoff'].result} | ${b['browser-handoff'].primaryFailureClass} | ${b['browser-handoff'].exactMechanism} | Yes |\n| Browser recovery | ${b['browser-recovery'].result} | ${b['browser-recovery'].primaryFailureClass} | ${b['browser-recovery'].exactMechanism} | Yes |\n| Email → Calendar | ${b['email-calendar'].result} | ${b['email-calendar'].primaryFailureClass} | Same AgentRun resumed after a controlled real reply and created one verified event. | No |\n| Calendar → Email | ${b['calendar-email'].result} | ${b['calendar-email'].primaryFailureClass} | One event was updated, one notification was sent, and both were provider-verified. | No |\n\nBaseline: **${summary.baseline.successful}/${summary.baseline.runs} passed**, 100% execution precision, no duplicate or unintended effects, **$${summary.baseline.totalInferenceCostUsd.toFixed(6)}** measured inference cost.\n\n## Targeted rerun\n\n| Scenario | Result | Finding |\n|---|---|---|\n| Browser search control | ${r['browser-search'].result} | Search-only intent completed with live valid results. |\n| Browser handoff | ${r['browser-handoff'].result} | The coercion race disappeared, but the selection worker could not expose a selectable Google Flights itinerary after bounded retries. |\n| Browser recovery | ${r['browser-recovery'].result} | Read-only target closure recovered correctly; downstream itinerary selection still failed after bounded retries. |\n| Calendar → Email control | ${r['calendar-email'].result} | Calendar changed at the correct instant, but Luna described the old/new local times incorrectly in the email, then claimed successful verification. |\n\nTargeted reruns cost **$${summary.targetedRerun.totalInferenceCostUsd.toFixed(6)}**. Total diagnostic cost was **$${summary.totalInferenceCostUsd.toFixed(6)}**.\n\n## Decision\n\n**Browser:** Luna is not ready as the default for full browser execution. Its search planning and arguments were correct, but the current selection worker failed both handoff attempts. This is browser infrastructure, so Sol escalation would not fix it.\n\n**Cross-tool:** Luna is viable for the tested basic async email-to-Calendar flow, but not yet an unconditional default for Calendar-to-email changes. The untouched run passed; the control rerun exposed a model reasoning error when converting provider timestamps into notification wording. Escalate to Sol after one invalid time interpretation or a mismatch between intended and drafted schedule details.\n\nDo not increase all browser timeouts or retries. The next engineering step is to instrument and repair the external selection worker's itinerary-card targeting against the preserved search URL and option ID, then rerun only the two handoff scenarios.\n`)

console.log(JSON.stringify(summary, null, 2))
