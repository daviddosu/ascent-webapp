# David synthetic applicant qualification

Run: `david-applicant-qualification-20260809`
Implementation commit: `7926e39e30ed19cbce36aaac03e305e1693f99db`
Command: `pnpm benchmark:david -- --applicant-trial --run-id david-applicant-qualification-20260809`

## Applicant and evidence boundary

The trial used synthetic applicant Nadia Okoye with uploaded CV, transcript, degree certificate, and supporting-work evidence. A private ground-truth oracle supplied the simulator’s applicant answers and was written only to each run’s `private-ground-truth.json`; it was not passed into the application engine or semantic validation request.

The trial retrieved and hashed six official programme/funding pages:

- [Imperial College London Computing PhD](https://www.imperial.ac.uk/computing/prospective-students/courses/phd/) and [Computing scholarships](https://www.imperial.ac.uk/computing/prospective-students/scholarships/)
- [University of Edinburgh Informatics PhD](https://study.ed.ac.uk/programmes/postgraduate-research/489-informatics-iml-machine-learning-computational-neuroscience) and [research-degree funding](https://study.ed.ac.uk/postgraduate/applying/research-degrees/funding)
- [University of Toronto CS PhD](https://web.cs.toronto.edu/graduate/phd) and [funding, tuition, and awards](https://web.cs.toronto.edu/graduate/funding-tuition-awards)

## Failure-driven campaign

Three application cases completed with all requirements verified:

| Case | Requirements | Injected failure | Recovery | Browser actions |
|---|---:|---|---:|---:|
| Imperial Computing PhD | 13/13 | renamed portal label | 1 | 28 |
| Edinburgh Informatics PhD | 12/12 | expired portal session | 1 | 28 |
| Toronto CS Direct-Entry PhD | 10/10 | rejected first CV upload | 1 | 29 |

Campaign metrics: complete `true`; verified completion `100%`; fabricated facts `0`; false completions `0`; duplicate submissions `0`; duplicate attempts blocked `3`; cross-case contamination `0`; injected-failure recovery `100%` (3/3); artifact integrity `100%`; writer cases `3/3`; referee cases `3/3`; professor cases `2/2`; current OTP cases `3/3`; calendar attendee-verification cases `1/1`; user interventions `9`; semantic validation repairs `7`; elapsed `133,613 ms`.

The failure trace also exercised an unsupported writer draft and revision, professor follow-up, referee replacement, delayed-referee follow-up, stale/unrelated OTP rejection, and final-submit idempotency.

## Three-run clean streak

All three clean runs completed all three cases with zero injected browser failures:

| Run | Cases | Complete | Elapsed | Fabricated / false / contamination |
|---|---:|---|---:|---:|
| clean-1 | 3 | true | 129,799 ms | 0 / 0 / 0 |
| clean-2 | 3 | true | 120,733 ms | 0 / 0 / 0 |
| clean-3 | 3 | true | 122,774 ms | 0 / 0 / 0 |

Clean streak: `3 consecutive runs`, qualified `true`. Clean `recoverySuccessRate: 0` means no failure was injected and no recovery was needed; it is not a failed recovery.

Machine-readable evidence is in the [clean streak summary](./david-applicant-qualification-20260809-clean-streak.json), [failure-driven report](./david-applicant-qualification-20260809-failure-driven/report.json), [clean-1 report](./david-applicant-qualification-20260809-clean-1/report.json), [clean-2 report](./david-applicant-qualification-20260809-clean-2/report.json), [clean-3 report](./david-applicant-qualification-20260809-clean-3/report.json), and each run’s `trace.json`.

## Root-cause repairs

- Added an explicit `VERIFY` transition so evidence-contract checks commit the requirement to `VERIFIED`.
- Fixed controlled Gmail reply identity collisions by giving inbound messages their own monotonic sequence.
- Added applicant/authoritative-source conflict resolution that preserves the candidate audit trail.
- Added Calendar as a first-class engine requirement and evidence contract.
- Repaired Calendar tests so Sunday execution and test selection do not assume that “tomorrow” is in the current week or depend on another test’s fixture state. The full `src/app.test.ts` suite passed `31/31`.
- Escaped a pre-existing Markdown backtick in the canonical benchmark report template that prevented the canonical runner from parsing.

## Canonical benchmark rerun

Command: `pnpm benchmark:david`
Run: `david-eval-20260809120909-5ae32a`
Results: `68/68` recorded cases passed; verified completion `100%`; recovery `100%`; false completions `0`; duplicate actions `0`; cross-case contamination `0`. The consolidated engine corpus passed `26/26` cases with semantic success `100%`, end-to-end verified completion `100%`, fabricated facts `0`, false completions `0`, duplicate actions `0`, and contamination `0`.

The canonical result is [latest.json](../results/latest.json); its production-readiness flags are deterministic `true`, stochastic `true`, live `false`, deployment `false`.

## Authenticated gate and deployment

- `pnpm check:cloud:auth`: blocked because `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SHOTCOUNT_TEST_EMAIL`, and `SHOTCOUNT_TEST_PASSWORD` are not available.
- `pnpm check:cloud`: blocked because the Supabase URL and anon key are not available.
- Vercel preview deployment: [READY preview](https://shotcount-workspace-ifyybt9dk-davids-projects-3c80ec66.vercel.app); [deployment inspector](https://vercel.com/davids-projects-3c80ec66/shotcount-workspace/4hP2VwijKUEQaLqw2Xm5xpEtGbpH). The remote `pnpm run build` completed successfully. No production promotion was attempted; the request authorized a deployment attempt and the deployment workflow defaults to preview.

The authenticated production gate remains conditional on supplying the project’s Supabase and approved test-account credentials. The controlled applicant campaign and canonical fixtures do not substitute for that external RLS/provider validation.
