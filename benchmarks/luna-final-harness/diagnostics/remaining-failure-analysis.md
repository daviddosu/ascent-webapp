# Final-cycle diagnostics

| Historical mechanism | Diagnosis | Action |
|---|---|---|
| email-04 | Gmail search returned a stale message identity; `gmail.read_thread` then received provider 404. | Generalized stale identity reconciliation to `read_message` and `read_thread`; targeted acceptance passed. |
| cross-03 runs 2/3 | Required Calendar + Gmail effects were not derived when the run was labeled `gmail`; a premature completion could therefore bypass the ledger. | Derive required effects from the task contract. A second bug replayed rejected completion during stalled-run recovery; rejected completions now continue the same run instead of becoming terminal. |
| cross-04 | Gmail send succeeded and the run entered a real reply wait. The controlled two-account fixture now sends the real reply and exercises resumption. | No production semantic change; deterministic counterpart fixture used for evaluation. |
| browser-01 | Google Flights timed out after bounded retry, worker recycling, and canonical search reconstruction. | Safe exhaustion retained; no legitimate alternate provider exists in the current browser abstraction, so no unsafe fallback was added. |

Final-benchmark failures were preserved without reruns: repeated Calendar-02 model/verification failures, one Cross-01 approval wait, Browser-02 provider timeout/verification failures, and Browser-04 option invalidation.
