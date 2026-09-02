# David application benchmark — david_application_engine_v3

Run **david-eval-20260902101023-e3bbec** at 2026-09-02T10:16:47.354Z; evaluated commit **b1db93825dadf6d5962a91ac850c400be5b3db77**. Frozen dataset: **85 atomic cases + 20 end-to-end cases**.

## Scorecard

| Metric | Result |
|---|---:|
| Primitive success rate | 95.5% |
| Harness success rate | 100.0% |
| Primitive → harness rescue rate | 100.0% |
| Adaptive step success rate | 100.0% |
| End-to-end application success rate | 100.0% |
| Verified completion rate | 100.0% |
| False completion rate | 0.0% (0) |
| Duplicate-action rate | 0.0% (0) |
| Manual intervention rate | 2.9% |
| Recovery success rate | 100.0% |
| Cross-case contamination rate | 0.0% |
| Average cost / completed application | $0.000000 |
| Average time / completed application | 5650 ms |

## Deterministic application engine

- Engine: david-application-engine@3
- Consolidated hard cases: 26
- Semantic validation: 100.0%
- E2E verified completion after autonomous recovery: 100.0%
- Recovery success: 100.0%
- Fabricated facts / false completions / duplicates / contamination: 0 / 0 / 0 / 0
- User interventions: 0
- Production qualification: NOT YET — stochastic and live gates remain conditional

## Production-model stability

- Run: david-engine-v3-stochastic-qualification
- Samples passed: 30/30
- Verified completion: 100.0%
- Fabricated facts / false completions / contamination: 0 / 0 / 0
- Total cost / average cost per E2E decision: $0.007890 / $0.000263
- Average model latency: 2023 ms

## Canonical research-proposal execution

- Qualification: 8/8 cases passed (david-application-engine-v3-research-proposals@1)
- Requirement evidence-backed / formatting / citation verification: 100.0% / 100.0% / 100.0%
- Exact artifact / delivery evidence: 100.0% / 100.0%
- Failures recovered / unresolved hallucinated citations / rejected hallucinated citations: 7 / 0 / 1
- Fabricated applicant facts / cross-case contamination: 0 / 0
- Autonomous context resolution: 10000.0%
- Readable report: /Users/daviddosu/Documents/ascent/output/research-proposals/latest/benchmark-report.md
- Production outputs: /Users/daviddosu/Documents/ascent/output/research-proposals/latest/proposal-applicant-defined-full/Ada_Okafor_proposal-applicant-defined-full_v2.pdf, /Users/daviddosu/Documents/ascent/output/research-proposals/latest/proposal-advertised-short-statement/Ada_Okafor_proposal-advertised-short-statement_v1.pdf, /Users/daviddosu/Documents/ascent/output/research-proposals/latest/proposal-conditional-after-supervisor/Ada_Okafor_proposal-conditional-after-supervisor_v2.pdf, /Users/daviddosu/Documents/ascent/output/research-proposals/latest/proposal-failure-writer-word-limit/Ada_Okafor_proposal-failure-writer-word-limit_v2.pdf, /Users/daviddosu/Documents/ascent/output/research-proposals/latest/proposal-failure-hallucinated-citation/Ada_Okafor_proposal-failure-hallucinated-citation_v2.pdf, /Users/daviddosu/Documents/ascent/output/research-proposals/latest/proposal-failure-stale-artifact/Ada_Okafor_proposal-failure-stale-artifact_v1.pdf, /Users/daviddosu/Documents/ascent/output/research-proposals/latest/proposal-failure-browser-interruption/Ada_Okafor_proposal-failure-browser-interruption_v1.pdf, /Users/daviddosu/Documents/ascent/output/research-proposals/latest/proposal-failure-infeasible-methodology/Ada_Okafor_proposal-failure-infeasible-methodology_v2.pdf

## Canonical recommendation-letter qualification

- Qualification: PASS (david_recommendation_coordination_qualification_v1)
- Auto-resolved facts / typed questions / broad free-text questions: 3 / 1 / 0
- Candidates discovered / requirement graph nodes: 3 / 9
- Automatic continuation rate: 100.0%
- Duplicate request keys / portal invitations / fabricated facts: 0 / 0 / 0
- Interaction mix: multiple_choice=1, approval=1
- UI payload kind: multiple_choice
- Progress Detail examples: approval, choice, email, attachment, relationship_confirmation, rare_short_text, weak_recommender_replacement
- Final recommendation status: complete (Dr Ada Lee)
- Email/support-pack/CV examples: /Users/daviddosu/Documents/ascent/benchmarks/david-applications/results/recommendation-qualification/graduate_application_cv_v1.pdf, /Users/daviddosu/Documents/ascent/benchmarks/david-applications/results/recommendation-qualification/graduate_application_cv_v1.tex, and the qualification report in the same output directory.

## Canonical Academic Records & Testing qualification

- Qualification: PASS (academic-evidence-qualification@1.0.0)
- Institutions / applications / detected requirements: 2 / 2 / 10
- Credential-evaluation cases / duplicate costs prevented: 1 / 3
- Typed Progress Detail interactions / sensitive interaction rejections: 7 / 1
- Forced-failure regressions: 14/14; false completions: 0
- Generated examples: `results/academic-evidence-latest.json`.

## Canonical application fee-waiver and payment qualification

- Qualification: PASS (david_fee_waiver_payment_qualification_v1)
- Cases / passed cases / failed assertions: 4 / 4 / 0
- No-inference passes / evidence checks / exact approval checks / duplicate guards: 1 / 2 / 1 / 1
- Generated manual waiver email examples: 1
- Production-generated examples: `results/application-fee-latest.json`.

## Canonical user-facing campaign summary qualification

- Qualification: PASS (david_campaign_summary_qualification_v1)
- Cases / passed cases / failed assertions: 2 / 2 / 0
- Generated counts — Doing / Waiting / Needs you / At risk / Submitted: 1 / 2 / 1 / 2 / 1
- Integrity: valid
- Production-generated examples: `results/campaign-summary-latest.json`.

## Canonical admissions clarification and post-submission recovery qualification

- Qualification: PASS (application-recovery-benchmark@1)
- Cases / passed cases: 10 / 10
- Admissions research resolved without email / targeted approvals: 1 / 1
- Typed post-submission requests / automatic artifact resolution / attachment handoffs: 2 / 1 / 1
- Duplicate actions prevented / false completions / cross-case contamination: 1 / 0 / 0
- Rejection recovery cases / admissions escalations: 1 / 1
- Production-generated examples: `results/application-recovery-latest.json`.

## Canonical writing-sample / portfolio qualification

- Qualification: 3/3 cases passed (david-application-engine-v3-work-samples@1)
- Requirement evidence-backed / candidate inspection / exact artifact match / portal read-back: 100.0% / 100.0% / 100.0% / 100.0%
- Automatic continuation / completed without clarification: 100.0% / 66.7%
- Approvals / structured choices / free-text questions / uploads: 3 / 4 / 0 / 3
- Secret blocks / wrong artifacts blocked / duplicate uploads blocked / false completions: 1 / 1 / 1 / 0
- Qualification report: /Users/daviddosu/Documents/ascent/output/work-samples/latest/qualification-report.md
- Production outputs: /Users/daviddosu/Documents/ascent/output/work-samples/latest/work-sample-academic-northbridge/David_Dosu_Writing_Sample.pdf, /Users/daviddosu/Documents/ascent/output/work-samples/latest/work-sample-code-northbridge/safe-repository-README.md, /Users/daviddosu/Documents/ascent/output/work-samples/latest/work-sample-portfolio-northbridge/David_Dosu_Portfolio.pdf

## Deployment and live gate

- Production migration/function/frontend deployment: not performed; qualification policy blocked deployment
- Production smoke: blocked
- External limitation: current authenticated RLS, Calendar, durable-restart, and exact-upload smoke requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SHOTCOUNT_TEST_EMAIL`, and `SHOTCOUNT_TEST_PASSWORD`, which are unavailable in this workspace.

## Primitive, harness, and adaptive comparison

| Path | Attempts | Success | Avg latency | Avg browser actions | Retries | Model cost |
|---|---:|---:|---:|---:|---:|---:|
| Primitive | 22 | 95.5% | 1379 ms | 0.5 | 0 | $0.000000 |
| Harness | 55 | 100.0% | 6741 ms | 5.2 | 1 | $0.000000 |
| Adaptive outcome | 68 | 100.0% | 5650 ms | 4.3 | 1 | $0.000000 |

Controlled paired evaluation values are shown as success / latency / browser actions.

| Case | Primitive | Harness | Adaptive choice |
|---|---:|---:|---|
| primitive-simple-form | pass / 6753 ms / 5 | pass / 6646 ms / 5 | primitive |

## Failures and regression corpus

| Case | Primary failure class | Mode | Escalation / suspected cause |
|---|---|---|---|
| — | — | — | No failures |

Every failed case is written to `failures/david-eval-20260902101023-e3bbec/` and added to the versioned regression corpus. Frozen definitions are never rewritten by the runner.

## Execution accounting

- Browser actions: 293
- Gmail fixture actions: 32
- Primitive success / failure: 21 / 1
- Harness success / failure: 55 / 0
- Escalations / rescued: 1 / 1
- Manual interventions / retries: 2 / 1
- Model calls / tokens / measured model cost: 0 / 0 / 0 / $0.000000
- Deterministic Gmail fixture messages: 35
- Connected Gmail evaluation: 6/6 executed cases provider-verified; 3 alternate-sender cases blocked; 7 messages labeled and archived.
- Separate live read-only web set: 5/5 verified with 0 write actions.
