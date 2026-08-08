# David Application Eval v2.1 methodology

V2.1 is a narrow repair benchmark. It adds no broad cases. Its manifest freezes the eight failed end-to-end cases from `david_application_eval_v2` by source spec, oracle, and trace SHA-256. Applicant source material, objective, uncertainty, portal failure, and hidden evaluation criteria are loaded from v2 without copying expected answers into model input.

The model receives the original task fixture plus a replaced compact `AUTHORITATIVE_APPLICATION_CONTEXT_V2_1` on every turn. The context contains the current campaign/case, controller state, unresolved requirements, fact IDs and source provenance, artifacts, checkpoints, and evidence count. It does not expose hidden expected values.

The v2.1 wrapper runs above the unchanged v2 controlled runtime. It rejects an unsupported applicant value before the original primitive sees it, preserves prior state, returns one structured repair instruction, and records harness fallback after repetition. Exact fields require an exact oracle-supported value. Composite fields require source-token grounding under the unchanged v2 composite rule. Readiness is rejected until every required section has per-case verified evidence. Completion is rejected unless the unchanged terminal assessor is satisfied (`NO_EVIDENCE => NO_COMPLETION`).

Cost order is targeted case, eight-case pass@1 slice, then five repetitions and full suites only after qualification. The initial infrastructure/calibration runs are retained and charged as real inference cost. The eight-case slice did not reach the 90% qualification threshold, so v2.1 pass@3, the 40-run set, and full v2 were intentionally not burned.

Original v1 and v2 directories remain byte-for-byte unchanged at Git tree hashes `4dfd5f753ee707e6814e188b6e91d12a04ca0a7e` and `52d8c584137c1bdc9a471918792fba04004e5a37`.
