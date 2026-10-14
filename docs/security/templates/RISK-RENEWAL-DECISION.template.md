# Risk renewal decision: TEMPLATE (blank)

> BLANK TEMPLATE. Not a decision, not an approval. Fill it in only after a human review following `RISK-RENEWAL-PROCEDURE.md`, and store the filled-in copy in the project's private, access-controlled records. Never commit a client's filled-in decision automatically.

## Subject

- Project ID:
- Review packet generated on (as-of date, UTC):
- Current acceptance: approved on ____, expires after ____ UTC, review by ____
- Exact findings under review (advisory ID, source package, installed path and version, severity):
  -

## Evidence reviewed

| Evidence | Result | Reference (opaque ID; no secrets, personal data or document contents) |
| --- | --- | --- |
| Fresh `npm audit --json` (date, environment) | | |
| Exact comparison: unchanged, changed, new or resolved | | |
| Upstream fix availability | | |
| Compatibility of candidate fixes | | |
| Reachable exposure (known or unknown) | | |
| Compensating controls | | |
| Residual risk | | |

## Decision (choose one)

- [ ] Remediate: plan and owner-reviewed change reference:
- [ ] Reject renewal: acceptance lapses after ____ UTC; findings are blocked until fixed or newly decided
- [ ] Time-bound accept, exact findings only. New expiry (UTC, inclusive): ____. Re-review triggers:

Changed or new findings are not covered by a renewal; record them as a separate acceptance decision.

## Who decided

Renewing an accepted dependency baseline needs both roles below (`risk_acceptance_renewal` and `ci_gate_weaken_or_bypass`). Verify each role separately, even if one person holds both.

| Policy role | Person acting (reference) | Authority verified by / when / evidence reference | Decision and time (with time zone) |
| --- | --- | --- | --- |
| Client decision-maker | | | |
| Technical owner | | | |

## Record

- Audit trail entry (who recorded or reviewed this, and when):
- Baseline updated by (reviewed change reference), only after this decision:
- Not verified (state plainly):
