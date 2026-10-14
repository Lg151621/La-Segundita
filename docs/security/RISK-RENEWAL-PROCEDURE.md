# Risk acceptance review and renewal (Phase 4B.3)

A temporarily accepted dependency vulnerability is still a known, unfixed vulnerability. Before its acceptance expires, someone must review it again from fresh evidence, and the right people must decide what happens next. This procedure is portable across VitaNova projects. Each project's baseline, register and decisions stay in that project.

> **A passing audit comparator or CI job is not a renewal decision.** The dependency gate only says the installed findings still exactly match an acceptance that has not yet expired. It cannot say the risk is still acceptable, and it cannot approve, renew or extend anything. Only the roles named below decide, and only after this review.

## What the assessment tool does

`scripts/security/assess-risk-renewal.mjs` is read-only. It reads:

- the project's accepted-risk baseline (schema 1, the same contract as the dependency gate)
- its lockfile
- optionally, a fresh `npm audit --json` report
- optionally, a risk register declaring `risk-register-schema: 1`
- optionally, a previous copy of the baseline

It prints a review packet marked **`DRAFT / NOT AUTHORIZED`**. The packet always says `usableForAuthorization: false` and `authorizationsGranted: 0`. The tool never runs npm, never contacts the network, never writes files, never changes recorded dates, and never migrates the baseline into another format.

```sh
node scripts/security/assess-risk-renewal.mjs --help
npm audit --json > "$TMPDIR/audit.json"    # exits nonzero when advisories exist; that is expected
node scripts/security/assess-risk-renewal.mjs --root . --project-id PROJECT --audit "$TMPDIR/audit.json" \
  [--register docs/security/DEPENDENCY-RISK-REGISTER.md] [--previous-baseline FILE] [--as-of YYYY-MM-DD] [--warn-days 14] [--json]
node --test scripts/security/assess-risk-renewal.test.mjs
```

Project-local inputs must sit inside `--root`; a baseline, lockfile or register outside it is rejected. A fresh audit that names packages missing from the project's lockfile fails closed, so one client's audit cannot feed another client's packet. Errors never echo local paths. Packets omit the free-text approver name and the recorded rationale text.

| The tool can determine | Only humans can verify or decide |
| --- | --- |
| Whether the recorded approval is valid, nearing expiry, expired, pending, not yet effective, or extended without a new approval date (with `--previous-baseline`), using the gate's own inclusive UTC rule | Whether the approval was really given, by whom, and in which role; whether the person had that authority |
| Whether each accepted finding still exactly matches the fresh audit, changed (version, path, consumer, scope, severity), disappeared, or drifted from the lockfile | Whether the vulnerable code is reachable in this project, and how exposed it is (a recorded rationale is a prior claim, not evidence) |
| New findings that the acceptance does not cover | Whether a fix exists upstream and is compatible; whether a downgrade or override is safe |
| Conflicts between the baseline and a recognized risk register | What the residual risk is, which compensating controls apply, and whether to accept it |
| Which policy actions and roles a decision needs (read from the approval policy) | Legal, contractual or compliance consequences (a specialist question) |

## Procedure

1. **Gather evidence early.** Start well before the deadline, which is the earlier of `expiresOn` and `reviewBy`; the tool reports a review as due within `--warn-days`, 14 by default. Run a fresh `npm audit --json` and record when and where it ran. Keep audit output outside the repository unless the project decides otherwise.
2. **Compare exactly.** Run the assessment with `--audit`. Each accepted finding is identified by advisory ID and source package, and the comparison covers severity, direct or transitive scope, consumers, and every installed path and version.
   - Only `exact_match` findings can be considered for renewal.
   - `changed` findings are outside the old acceptance.
   - New findings need their own `risk_acceptance` decision.
   - Findings that no longer appear should be confirmed as fixed and closed, not renewed.
3. **Check for drift and silent changes.** Pass `--previous-baseline` (for example, the copy on the main branch) to detect a later expiry or a broadened scope without a new approval date. Treat any such change as unauthorized until a recorded human decision covers it.
4. **Assess remediation.** For each finding, check upstream releases and the advisory for a fix. Test any candidate one dependency path at a time, and never use forced audit fixes. If a compatible fix exists, prefer remediation over renewal.
5. **Assess actual exposure.** Decide, with evidence, whether visitor-controlled or otherwise untrusted input can reach the vulnerable code. Where exposure cannot be determined, say "unknown". Never infer that a vulnerability is harmless from a package name or static analysis alone.
6. **State the remaining risk and mitigations.** Record the residual risk, the compensating controls in place and any proposed controls. Mitigations reduce exposure; they are not patches.
7. **Identify the deciders.** Under the approval policy, renewing an accepted dependency baseline is a `risk_acceptance_renewal`. It also extends what the CI gate lets through, which is `ci_gate_weaken_or_bypass`. Together these need the **client decision-maker and the technical owner**; neither is delegable.
   - Identify the person acting in each role and verify their authority.
   - If one person holds several roles, verify each role separately; never infer dual authorization.
   - Automation never authorizes.
8. **Decide.** One of:
   - **Remediate:** fix the dependency path. This is an owner-reviewed dependency change that escalates per the policy.
   - **Reject renewal:** let the acceptance lapse. After the deadline the gate blocks the findings until they are fixed or a new decision is recorded. That is intended, not a failure to work around.
   - **Time-bound accept:** renew exact, re-reviewed findings only, with a new expiry, re-review triggers and the roles exercised. Never extend in place without a new decision.
9. **Record.** Record the decision in the project's own records: the exact findings, the evidence reviewed, the decision, the role and person for each signoff, the decision time, the new expiry, the re-review triggers and the audit trail. Use [templates/RISK-RENEWAL-DECISION.template.md](templates/RISK-RENEWAL-DECISION.template.md) or the [client records](CLIENT-SECURITY-RECORDS.md) format. Keep real records in private, access-controlled storage by default, and never commit client approvals automatically.
   - Only after a recorded decision may the technical owner update the project's baseline, through a reviewed change with new dates.
   - The packet's `proposedDecisionDraft` is a `proposed` entry with no signoffs or dates; a human decides whether to use it.
10. **On a missed deadline.** The acceptance is expired from the next UTC day, and the findings are open again. Nobody extends it retroactively; the next decision is a fresh review.

## Review status vocabulary

| `reviewStatus` | Meaning |
| --- | --- |
| `valid_no_decision_due_yet` | Exact matches, approval valid, outside the warning window. Still not an authorization. |
| `fresh_audit_required` | No fresh audit was supplied, so the current findings are unknown. Run `npm audit --json` and pass it with `--audit`. |
| `review_due_before_expiry` | Inside the warning window: start or finish the review now. |
| `expired_review_required` | The acceptance has lapsed; the gate blocks the findings. |
| `re_review_required` | Something changed, conflicts or is unknown (changed or new findings, register conflict, silent extension, approval dated in the future). |
| `approval_pending_or_missing` | No approved acceptance is recorded. |

## Future CI (recommended, not implemented)

A separately reviewed change could add, as a review-only job:

- the assessment's synthetic tests
- a packet summary for the project's own baseline, run without network access and given the audit JSON the existing job already produces

It must not fail the build on `review_due_before_expiry` without an owner decision, must never write to baselines or records, and must never read private client records. The existing dependency gate stays the enforcing control.

## Limitations

- Supports npm lockfiles and `npm audit` report version 2, as the dependency gate does. Other package managers need their own audit and a future adapter.
- Register parsing recognizes only the advisory-index table of a register that declares `risk-register-schema: 1`; anything else is reported as unrecognized for a human to compare.
- Silent-renewal detection needs a previous baseline copy and compares approval dates. A renewal recorded with a new date still needs a human to confirm that a real decision exists.
- Dates are UTC calendar dates; local time zones are not considered.
