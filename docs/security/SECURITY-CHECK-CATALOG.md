# Security check catalog (Phase 3E.1)

`SECURITY-CHECK-CATALOG.json` is a versioned, read-only description of **recommended checks**. It neither selects nor runs checks, changes CI, approves risks, nor determines legal compliance. The catalog extends the Phase 3D inventory's 13 stable `candidateChecks[].id` values with two review topics: `cms_content_link_review` and `webhook_replay_abuse_review`. The current file contains 15 checks.

## Contract

The top level has `schemaVersion: 1`, `inventorySchemaVersion: 1`, `catalogId`, and `checks[]`. Each check has a stable `id`, `name`, `purpose`, `concern`, `match`, `executionStatus`, `evidenceRequired[]`, `detectionLimits`, `falsePositives`, `falseNegatives`, `recommendedAction`, `ownerApprovalRequiredForRiskDecision`, and repository-file `provenance[]`. Changing field meaning requires a catalog schema version change; changing inventory signal meaning requires an inventory schema version change.

`match.mode` is `always` with empty `signals` and `statuses`, or `any_signal` with one or more actual Phase 3D `signals[].id` values. Conditional matches name both inventory statuses `detected` and `needs human verification`. Those statuses recommend **review**, not a successful check. `not detected in inspected scope` is a bounded source observation; a future engine may omit a source-triggered recommendation from that one snapshot, but must not claim the feature is absent everywhere or override external evidence. An incomplete scan (`scope.incomplete`) and unknown live-service state require human review. Project evidence can make a check relevant even when the source matcher did not fire.

`executionStatus` is one of `automated_now`, `future_implementation`, or `human_review`. Only `dependency_scan` and `secret_scan` are `automated_now`, reflecting the existing workflow. `build_verification` has a local command but is not yet a security CI job, so it is `future_implementation`. The status describes availability of the **specified check**, not whether it ran or passed for a project. `ownerApprovalRequiredForRiskDecision: true` records the boundary for risk acceptance, production changes, and material remediation; it does not grant approval.

Keep these states separate: a **detected feature** is source evidence; a **recommended check** is a catalog suggestion; **performed** means an identified check was actually run with dated evidence; **passed** is that check's scoped result; **risk accepted** requires an explicit owner decision with scope and expiry; **legally compliant** requires a separate qualified determination. None follows automatically from another. The existing three dependency exceptions remain governed by `DEPENDENCY-AUDIT-BASELINE.json` and `SECURITY-BASELINE-CI.md` through 2026-11-09 UTC.

## Validation and safe extension

Run `node scripts/security/validate-check-catalog.mjs` and `node --test scripts/security/validate-check-catalog.test.mjs`. The validator uses built-in Node APIs, reads the catalog and current inventory, and checks version compatibility, unique stable IDs, required descriptions and evidence, known match statuses and execution values, real signal references, all current inventory candidate IDs, and existing repository provenance paths. It does not execute catalog checks. An invalid catalog fails validation; it does not change the GitHub workflow.

To add a check, start with a concrete concern and evidence source. Reuse an existing signal only if its detection meaning truly supports the match. Record uncertainty, likely false positives and negatives, a specific next action, and the owner decision boundary. Assign `automated_now` only after the exact check actually exists and has been verified. Add fixtures for new status or matching semantics. Review with a human before any future CI gate, provider access, active probe, remediation, or risk decision.

## Local recommendation engine

Phase 3E.2 adds a separate read-only engine documented in [SECURITY-CHECK-RECOMMENDATIONS.md](SECURITY-CHECK-RECOMMENDATIONS.md). It validates this catalog and the Phase 3D inventory, then emits bounded JSON proposals on stdout. Phase 3E.4 presents them in a review-only GitHub Actions summary. Neither step runs catalog checks or changes CI approval behavior; enforcement requires a separate, authorized phase.

## Reusable Skill Knowledge

- **Portable schema:** version the catalog and inventory contracts; use stable IDs, explicit `always`/`any_signal` matches, readiness values, evidence requirements, limits, actions, and provenance.
- **Matching principle:** a detected or uncertain signal prompts review; bounded non-detection is not an absence certificate. External evidence and incomplete scans remain visible.
- **Evidence discipline:** store relative repository paths or reviewed provider evidence, not source snippets, environment values, tokens, or unsupported standards claims.
- **Human checkpoints:** separate discovery, recommendation, execution, result, risk acceptance, and legal conclusions. Require an owner for risky decisions and qualified review for legal applicability.
- **Claude Skill and Codex workflow:** validate the catalog first, compare it with the current project profile and live-service questions, present reasons and limitations, then stop at the authorization boundary for active tests or changes.
