# Minimal production-architecture acceptance

Exactly three final production-path conditions were exercised. Earlier invalidated attempts remain preserved in the diagnostic results directory and are excluded from the final 3/3 score.

1. A controlled `flight_results_timeout` was injected during read-only Google Flights search. The run had to recycle the poisoned worker, reconstruct the saved search, rediscover live result cards, select a valid itinerary, and stop at payment handoff.
2. A controlled stale Gmail watch checkpoint was injected before provider reread. The run had to reject the stale state, reread the canonical provider thread, and continue without Sol.
3. A controlled out-of-order continuation was attempted before Calendar confirmation. After it was blocked, Luna naturally produced correct notification wording. A test-only 11:00 AM candidate was substituted to exercise deterministic rejection and one-step Sol repair before the single send.

Provider-confirmed external actions, run events, model usage, approval state, and duplicate effects were inspected directly. The corrected Calendar→Gmail acceptance is a pass: its live action trace contains one confirmed Calendar update, one confirmed Gmail send, a subsequent provider read of that exact sent message, and completion only afterward. The diagnostic's initial post-run search missed the natural repaired subject; that verifier query was corrected without changing the underlying acceptance execution.
