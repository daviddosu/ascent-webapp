# Luna blocker-fix diagnostic

Model: `gpt-5.6-luna`, reasoning effort `low`.

## Results

- Browser handoff: PASS. The worker re-identified the Royal Air Maroc LOS–STN itinerary, selected it, survived navigation, and reached the airline provider handoff without purchase.
- Browser recovery: PASS. The induced read-only browser failure recovered, reconstructed the search, selected the itinerary, and reached the provider handoff without purchase.
- Browser search control: PASS. Live constrained results returned with no regression.
- Calendar-change → email: frozen diagnostic verdict FAIL, product outcome PASS. Calendar and Gmail actions were both provider-confirmed, the draft stated August 5, 2026, 10:00 AM → 11:30 AM Africa/Lagos, retained the 30-minute duration, and exactly one message was sent. The frozen verifier missed the event because Google returned the equivalent instant as `2026-08-05T12:30:00+02:00` instead of the requested `2026-08-05T11:30:00+01:00`; its sent-message query also hardcoded `Updated meeting time:` while the valid sent subject was `Updated time:`. Verification was not loosened.

Execution precision was 100%. No duplicate or unintended consequential action was observed.
