# Read-only security check recommendations (Phase 3E.2)

Run from the repository root:

```sh
node scripts/security/recommend-security-checks.mjs
```

The command runs the existing Phase 3D inventory, reads `SECURITY-CHECK-CATALOG.json`, validates both contracts, and writes one JSON report to **stdout only**. It uses built-in Node APIs, makes no network request, reads no `.env` values, and does not execute catalog checks. Pipe to a JSON viewer if desired; redirecting output to a file is a separate, explicit shell action. Invalid inputs exit nonzero with a short error and no report.

## Report contract

The output has `schemaVersion: 1`, `tool: "security-check-recommendations"`, `inputs` with catalog and inventory versions and source labels, `scan` completeness and reason codes, `summary` counts, `recommendations[]`, `humanConfirmation[]`, and `boundaries`. Every catalog check appears exactly once, sorted by stable ID. Each recommendation carries its catalog `executionStatus`, matched signal status/confidence, at most five source paths per signal plus an omitted count, rationale, evidence needed, detection limit, next action, approval boundary, and provenance. Individual text is capped at 240 characters; the serialized report is capped at 64 KiB. JSON serialization escapes literal `<`, `>`, and `&` for safer later embedding; any future Markdown or HTML presenter must still escape parsed text for its own context.

`recommended` means an always-relevant check or at least one matching signal with concrete detected evidence. `needs_human_review` means the match is uncertain because evidence is partial, contradictory, missing, low-confidence, or the scan is incomplete. `not_currently_indicated` means the relevant feature was not found **in the inspected source** of a complete scan. It is not an absence finding or a waiver; external and offline practices still need confirmation. An incomplete scan turns source-based non-detections into human-review items. A clear positive remains recommended even if another part of the scan is incomplete, and `scan.complete` remains false.

The `humanConfirmation[]` list records a follow-up for each check: review the actual result of existing automation, arrange a proposed check, resolve uncertain applicability, or verify external use behind a bounded non-detection. The `boundaries` object states that this tool executed zero checks and determined no check result, risk acceptance, or legal compliance. `executionStatus: "automated_now"` means separate automation exists; this report does not read its latest result.

## Current La Segundita example

The current complete source scan inspects 47 files. It detects `nextjs`, `sanity_cms`, `api_routes`, `webhooks`, and `analytics`. The report recommends 11 of 15 catalog checks, including CMS access/content, webhook authentication/replay, API input, analytics privacy, dependency audit, and secret scanning. The four visitor-auth, public-form, payment, and separate-database checks are `not_currently_indicated` from source only. Sanity content storage is covered by CMS checks, not the separate `database` signal.

Live CMS roles and datasets, webhook delivery and replay controls, deployed headers, actual analytics collection, and offline or hosted business flows remain outside this source scan. The engine does not declare HIPAA, PCI DSS, GDPR, CCPA, or any other legal regime applicable. The approved three-advisory dependency baseline is unchanged; only its separate workflow can report its current result.

## Reusable Skill Knowledge

- **Inputs:** validate both versioned schemas and stable check IDs before matching; reject unknown IDs, malformed evidence paths, or catalog/inventory mismatch.
- **Matching:** preserve `always` and `any_signal` semantics. Use concrete detected evidence for a recommendation, route uncertainty and incomplete scans to review, and describe source non-detection narrowly.
- **Evidence:** carry status, confidence, bounded relative paths, omitted counts, and provenance into the report; never include source snippets, environment values, or provider credentials.
- **Read-only boundary:** emit deterministic JSON to stdout, no network or file writes, no check execution, risk acceptance, or legal determination.
- **Human checkpoint:** a person verifies actual check outcomes and external facts before remediation, production changes, or any owner risk decision.

## Review-only GitHub Actions summary (Phase 3E.4)

The `security-recommendations` job in `.github/workflows/security-baseline.yml` checks out the repository with read-only permissions, uses Node 22 without installing packages, runs catalog/engine/scenario/formatter tests, validates the catalog, then runs the engine's **no-argument** CLI. It stores JSON in the runner's temporary directory and passes that file to `scripts/security/format-security-recommendations.mjs`. The formatter publishes Markdown to `GITHUB_STEP_SUMMARY`; it does not upload the JSON or read secrets. The existing inventory, dependency-audit, and secret-scan jobs remain separate.

The summary lists all checks by stable ID in three groups: **recommended**, **needs human review**, and **not indicated within inspected scope**. It shows matched signal statuses and up to five escaped evidence paths per signal, plus scan completeness and counts. The formatter validates version 1 of the report, counts, IDs, statuses, evidence paths, and decision boundaries; it caps input at 128 KiB, displayed fields at 160 characters, and output at 16,000 characters with a visible truncation notice. Malformed or incompatible JSON exits nonzero with no partial recommendation summary. Generator, validation, test, or formatter failure fails the recommendations job; a detected or uncertain feature does not.

To preview the same output locally:

```sh
node --test scripts/security/format-security-recommendations.test.mjs
node scripts/security/recommend-security-checks.mjs > /tmp/security-recommendations.json
node scripts/security/format-security-recommendations.mjs /tmp/security-recommendations.json
```

This is a proposal report, not evidence that any catalog check ran or passed, an acceptance of the three dependency advisories, a legal conclusion, or proof that a source-undetected feature is absent. Verify live services and results separately. Local preview does not establish GitHub-hosted behavior. The job adds no new finding-based gate; enforcement needs separate authorization.

### Reusable Skill Knowledge

- Carry `inventory-project.mjs`, `validate-check-catalog.mjs`, `recommend-security-checks.mjs`, `format-security-recommendations.mjs`, catalog JSON, and their tests/fixtures as one versioned pipeline. The current inventory, catalog, and recommendation report schema versions are each `1`.
- Generate JSON with the engine's no-argument CLI, validate before rendering, and escape/truncate every source-controlled field for the output context. Keep malformed data as a tooling failure and uncertain findings as informational human-review items.
- Keep the existing dependency and secret checks independent. A human must review live settings, execution results, risk decisions, legal applicability, and any move from review-only presentation to enforcement.
