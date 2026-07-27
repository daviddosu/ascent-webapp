import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const raw = JSON.parse(readFileSync(resolve(here, 'results/raw.json'), 'utf8'))
if (raw.runs.length !== 8) throw new Error(`Expected 8 runs, found ${raw.runs.length}`)
const harnesses = ['ShotCount', 'Minimal generic OpenAI agent']
const summarize = harness => {
  const runs = raw.runs.filter(run => run.harness === harness)
  const successful = runs.filter(run => run.success)
  const totalCost = runs.reduce((total, run) => total + Number(run.inference_cost_usd), 0)
  return {
    runs: runs.length,
    successful: successful.length,
    successRate: successful.length / runs.length,
    precision: runs.reduce((total, run) => total + Number(run.execution_precision), 0) / runs.length,
    totalCost,
    costPerScenario: totalCost / runs.length,
    costPerSuccessfulWorkflow: totalCost / successful.length,
  }
}
const metrics = Object.fromEntries(harnesses.map(harness => [harness, summarize(harness)]))
const summary = {
  model: 'gpt-5.6-luna', reasoningEffort: 'low', maxOutputTokens: 2400,
  store: false, toolChoice: 'auto', parallelToolCalls: false,
  compressedTime: true, runs: 8, metrics,
  decision: 'No measured ShotCount durability advantage; stop without hardening.',
}
writeFileSync(resolve(here, 'results/summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

const rows = raw.runs.map(run => [
  run.scenario, run.harness, run.success, run.execution_precision,
  run.user_reexplanation_required, run.duplicate_or_unintended_side_effects,
  run.same_logical_run_resumed, run.restart_survival ?? '', run.approval_state_survival ?? '',
  run.time_to_resume_seconds ?? '', run.inference_cost_usd, run.final_state, run.failure_reason,
])
const fields = ['scenario', 'harness', 'success', 'execution_precision', 'user_reexplanation_required', 'duplicate_or_unintended_side_effects', 'same_logical_run_resumed', 'restart_survival', 'approval_state_survival', 'time_to_resume_seconds', 'inference_cost_usd', 'final_state', 'failure_reason']
const cell = value => /[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value)
writeFileSync(resolve(here, 'results/comparison.csv'), `${fields.join(',')}\n${rows.map(row => row.map(cell).join(',')).join('\n')}\n`)

const byScenario = Object.fromEntries(raw.runs.map(run => [`${run.scenario}:${run.harness}`, run]))
const status = run => `${run.success ? 'PASS' : 'FAIL'} · ${run.final_state} · $${run.inference_cost_usd.toFixed(6)}`
writeFileSync(resolve(here, 'report.md'), `# Durable Luna execution smoke test\n\n## Result\n\nThere is **no evidence in this smoke test that ShotCount supplies durable execution capabilities a minimal generic Luna agent cannot reliably provide**. ShotCount passed 3/4 scenarios; the generic baseline passed 4/4. Both conditions maintained 100% execution precision, required no user re-explanation, and produced no duplicate or unintended side effects. Per the decision gate, no hardening or targeted rerun was performed.\n\n| Scenario | ShotCount Luna | Generic Luna |\n|---|---|---|\n| Reply → Calendar | ${status(byScenario['reply-calendar:ShotCount'])} | ${status(byScenario['reply-calendar:Minimal generic OpenAI agent'])} |\n| Timed follow-up | ${status(byScenario['timed-follow-up:ShotCount'])} | ${status(byScenario['timed-follow-up:Minimal generic OpenAI agent'])} |\n| Restart recovery | ${status(byScenario['restart-recovery:ShotCount'])} | ${status(byScenario['restart-recovery:Minimal generic OpenAI agent'])} |\n| Approval persistence | ${status(byScenario['approval-persistence:ShotCount'])} | ${status(byScenario['approval-persistence:Minimal generic OpenAI agent'])} |\n\n## What happened\n\n- **Reply → Calendar:** both sent exactly one initial email, resumed the same logical run after a real controlled-account reply, checked Calendar, created exactly one event, and completed only after provider confirmation. Resume latency was 11.460 seconds for ShotCount and 10.516 seconds for Generic.\n- **Timed follow-up:** ShotCount persisted the external wait but did not fire a two-minute deadline or send the requested follow-up. Its Gmail watch has a minimum one-day expiry and expiry transitions to user attention rather than executing an idempotent follow-up. Generic persisted a two-minute runner deadline, resumed the same model/tool history, sent exactly one follow-up, and remained waiting for the unresolved reply.\n- **Restart recovery:** both survived redeployment of their temporary execution service while waiting, reconstructed context without user input, resumed after the real reply, and created one Calendar event. Resume latency was 20.462 seconds for ShotCount and 17.139 seconds for Generic.\n- **Approval persistence:** both persisted an exact scoped Calendar approval across redeployment, approved only the saved action, created one event, and completed after verification.\n\n## OpenAI-native primitives\n\nOpenAI Background Responses continue long model generations and support polling or stream resumption. Conversations provide durable conversation objects, while webhooks notify applications when OpenAI background work completes. None of these primitives natively watches Gmail, schedules an application business deadline, stores a scoped product approval, or invokes Calendar after an external event.\n\nThe required store:false configuration also meant a Conversation identifier did not retain the function-call item needed for a later tool output in preflight. The final generic baseline therefore used OpenAI's documented stateless pattern: the minimal runner persisted the complete response output—including tool-call and encrypted reasoning items—and replayed it after pause or restart.\n\n## Cost\n\n| Metric | ShotCount | Generic |\n|---|---:|---:|\n| Successful workflows | ${metrics.ShotCount.successful}/4 | ${metrics['Minimal generic OpenAI agent'].successful}/4 |\n| Total Luna inference cost | $${metrics.ShotCount.totalCost.toFixed(6)} | $${metrics['Minimal generic OpenAI agent'].totalCost.toFixed(6)} |\n| Cost per scenario | $${metrics.ShotCount.costPerScenario.toFixed(6)} | $${metrics['Minimal generic OpenAI agent'].costPerScenario.toFixed(6)} |\n| Cost per successful workflow | $${metrics.ShotCount.costPerSuccessfulWorkflow.toFixed(6)} | $${metrics['Minimal generic OpenAI agent'].costPerSuccessfulWorkflow.toFixed(6)} |\n\nTotal measured inference cost was **$${(metrics.ShotCount.totalCost + metrics['Minimal generic OpenAI agent'].totalCost).toFixed(6)}**.\n\n## Decision\n\nDo not build a broader custom durability layer. The measured ShotCount primitives for external-event resumption, restart recovery, scoped approval persistence, provider verification, and idempotency worked, but the generic baseline matched them with OpenAI response-state replay plus a minimal application checkpoint.\n\nIf timed follow-up becomes a required product capability, the smallest future change is a model-agnostic deadline record handled by the existing watch sweep, with one idempotency key for the single permitted follow-up. That work was not performed because the decision gate says to stop when Generic performs roughly as well.\n\nA 12–24 hour soak test is **not warranted yet**. First decide whether timed follow-up is an intended product requirement; if it is, implement and narrowly verify that one scheduler gap before any soak.\n`)

console.log(JSON.stringify(summary, null, 2))
