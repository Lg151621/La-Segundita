# Client security records (Phase 4B.2)

The [approval policy](SECURITY-APPROVAL-POLICY.md) says **who must decide** each kind of security work. This format records, for **one client project**, **what was actually decided**: who holds each role, which written delegations exist, which decisions were requested or recorded, which risks were accepted, and who recorded or reviewed each entry. The reusable part is the format, the blank template and the validator; the records themselves always belong to one project.

> **Formal validity is not authenticity.** The validator checks that records are complete and consistent with the policy. It cannot check that a person really holds a role, that a signoff is genuine, that evidence exists or says what it claims, or what legal effect a decision has. A "formally complete" record is **not proof that anyone approved anything**, and a file's existence never implies an authorization. Identity and authenticity always need a human check.

## Files

| File | What it is | Where it lives |
| --- | --- | --- |
| [`templates/CLIENT-SECURITY-RECORDS.template.json`](templates/CLIENT-SECURITY-RECORDS.template.json) | Blank template: placeholder project, unverified roles, one proposed delegation and one proposed decision, no signoffs, risk records or audit entries | Reusable toolkit (ships in a Skill) |
| [`../../scripts/security/validate-client-records.mjs`](../../scripts/security/validate-client-records.mjs) and its tests | Read-only validator and formatter | Reusable toolkit |
| [`../../scripts/security/fixtures/client-records/example-fictional-bakery.json`](../../scripts/security/fixtures/client-records/example-fictional-bakery.json) | Synthetic example for a fictional bakery; obviously fictitious people, findings and references | Reusable toolkit (test fixture) |
| A project's own records file | Real decisions for that client only | **Private, access-controlled storage by default** (below); never committed to Git automatically, never copied between clients |

**Existing approvals are not migrated.** A host project's existing approvals stay where they are; nothing converts them into this format. In this repository, La Segundita's dependency approval stays in `DEPENDENCY-AUDIT-BASELINE.json`, `DEPENDENCY-RISK-REGISTER.md` and `SECURITY-BASELINE-CI.md`, unchanged. Its three accepted advisories need a fresh review by the client decision-maker before they expire after 2026-11-09 UTC. This repository contains no client records file.

## Format (`client-security-records`, schema version 1)

Strict JSON: unknown or missing fields are rejected. Every record ID is unique within the file, and every reference points inside the same file, so findings and decisions never cross projects.

| Section | Fields | Rules |
| --- | --- | --- |
| Top level | `schemaVersion` (1), `kind`, `recordStatus` (`template`, `synthetic_example`, `project`), `policy` (`policyId`, `schemaVersion`) | `policy` must match the approval policy in use (currently `vitanova-security-approval-policy` v2). A template keeps the placeholder project ID and holds no recorded decisions; a synthetic example uses an `example-` project ID; a project record may not use example or placeholder IDs or `REPLACE` text. |
| `boundaries` | `grantsApproval`, `verifiesIdentity`, `verifiesAuthenticity`, `isLegalAdvice` (all `false`), `note` | The file records human decisions; it never grants or proves them. |
| `project`, `storage` | `id`, `note`; `location` (`private_access_controlled`, the default, or `git_repository`), `sensitiveDataReview` (`not_reviewed`, `reviewed_no_sensitive_content`), `note` | Project records stored in Git are always flagged: Git storage needs an explicit client decision. |
| `roleAssignments[]` | `id`, `role`, `holderRef`, `holdsOtherRoles`, `verification` (`unverified`, `human_confirmed`), `evidenceRefs`, `confirmedAt`, `confirmedByRole`, `endedAt`, `note` | Only human roles that can authorize; automation is never assigned. `holderRef` is an opaque label (names and contact details stay in engagement records). `holdsOtherRoles` must be declared, and must match the file. `human_confirmed` needs who confirmed, when, and evidence. Each role is verified on its own assignment: authority in one role never implies another. |
| `delegations[]` | `id`, `action`, `status` (`proposed`, `active`, `revoked`, `expired`), `grantorAssignmentRef`, `recipientAssignmentRef`, `scope`, `policyExclusionsApply` (always `true`), `evidenceRefs`, `issuedAt`, `expiresOn`, `revokedAt`, `verification` | Only actions the policy makes delegable, granted by the client decision-maker to a role the policy allows. Anything but `proposed` needs an issue time, an expiry and written evidence; `revoked` needs `revokedAt`. The policy's excluded sensitive operations always apply. |
| `decisions[]` | `id`, `action`, `status` (`proposed`, `pending`, `approved`, `rejected`, `withdrawn`), `scope`, `changeRefs`, `escalations` (policy condition IDs), `delegationRef`, `delegatedScopeConfirmation` (`confirmedByRole`, `confirmedAt`, `evidenceRefs`, or `null`), `signoffs[]`, `conditions`, `reviewBy`, `expiresOn`, `reviewTriggers`, `note` | `approved` needs an approving signoff from every role the policy requires for the action **plus every role its escalations bring in**. A valid delegation can stand in for the client's per-change approval only on delegable actions, only if it was issued, unexpired and unrevoked at the decision time, and never alongside `delegation_not_valid`. Actions that must expire need `expiresOn` and `reviewTriggers`. Dual-authorization actions keep both approvals. A delegated approval also needs a human's `delegatedScopeConfirmation` (never automation, with evidence), or it is unusable. A holder signing in several roles counts only if each of those role assignments is verified. |
| `signoffs[]` | `assignmentRef`, `role`, `decision` (`approved`, `rejected`), `decidedAt`, `evidenceRefs`, `verification` | The role exercised is always recorded and must match the assignment. One signoff per role. A signoff after the assignment ended is invalid. |
| `riskAcceptances[]` | `id`, `decisionRef`, `renewsRef`, `findings[]` (`id`, `source`, `affectedAsset`), `compensatingControls`, `residualRiskRationale`, `evidenceRefs` | Links a `risk_acceptance`, `risk_acceptance_renewal` or `ci_gate_weaken_or_bypass` decision to the exact findings in this project. A renewal names the record it renews and **cannot add findings**; new findings need a new acceptance. |
| `auditTrail[]` | `id`, `recordRef`, `event` (`requested`, `recorded`, `reviewed`, `confirmed`, `status_changed`, `revoked`, `renewed`), `actorRole`, `actorRef`, `at`, `evidenceRefs`, `note` | Who recorded or reviewed what, and when. Automation may record but never confirm. This is a statement, not a cryptographic signature. |

Dates: `expiresOn` and `reviewBy` are calendar dates, valid through the end of that UTC day. `decidedAt`, `issuedAt`, `confirmedAt` and audit `at` are timestamps with a time zone. Nothing may be dated after the evaluation date.

**Evidence references are pointers, never contents.** Use `kind:reference` values such as `pr:12`, `ticket:EX-101`, `doc:signed-delegation-001` or `repo:docs/security/X.md`. URLs, `..` paths, email addresses, phone numbers, credential-like values, password assignments and embedded files or signatures are rejected wherever they appear.

## Effective states

The validator reports a state and a `usableForAuthorization` flag for every role assignment, delegation and decision. Only humans change the recorded status. Invalid delegations and policy contradictions are **errors** (exit 1). Unverified and expired records are **warnings**: the file still validates, but the report marks those records **NOT usable for authorization** until they are verified or renewed.

| State | Usable for authorization | Meaning |
| --- | --- | --- |
| `proposed`, `pending` | No | A request. Not an authorization. |
| `unverified_requires_human_confirmation` | No | Recorded, but one of these is missing: a verified signoff, a verified role assignment, a verified delegation it relies on, a confirmation of the delegated scope, or verified authority for each role a multi-role holder exercised. |
| `formally_complete` (decisions, delegations), `human_confirmed` (role assignments) | Formally yes | Consistent with the policy and verified by a recorded human statement. Identity and authenticity are still a human check. |
| `expired`, `revoked`, `ended` | No | No longer covers anything. Never renewed automatically. |
| `closed_not_approved` | No | Rejected or withdrawn. |

## Validating

```sh
node scripts/security/validate-client-records.mjs --help
node scripts/security/validate-client-records.mjs --template
node scripts/security/validate-client-records.mjs --records scripts/security/fixtures/client-records/example-fictional-bakery.json --as-of 2026-10-14
node scripts/security/validate-client-records.mjs --records FILE [--policy FILE] [--as-of YYYY-MM-DD] [--json]
node --test scripts/security/validate-client-records.test.mjs
```

Exit 0 means formally valid; items may still need human attention, and the report lists them. Exit 1 means invalid input or records. Errors name fields and record IDs only; they never echo record text, local paths or values. The command is read-only, is not in CI, and never grants, renews or records anything.

## Workflow

1. **Request.** Automation or the technical owner identifies the policy action ID, then adds a `proposed` decision with the exact scope, change references and any escalation conditions that apply.
2. **Ask the right roles.** These are the roles the policy requires plus any escalated roles. Escalations, the delegation scope and legal questions are human judgments; the validator only checks that the recorded result is consistent.
3. **Record.** When a human decides, add a signoff naming the role they acted in, the time and an opaque evidence reference to their own words. Set the status to `approved` or `rejected`, add an audit entry, and set an expiry and review triggers where the policy requires them.
4. **Confirm.** A person who can check the evidence marks signoffs and role assignments `human_confirmed`. Until then, the decision reports as unverified.
5. **Renew or revoke.** Renewing an acceptance is a new `risk_acceptance_renewal` decision after a fresh review. It names the earlier record and the role exercised, and covers the same or fewer findings. Revoking a delegation sets `revoked` and `revokedAt`. An expired item is never extended in place.

**Delegated publishing and deployments.** Only `cms_content_publish`, `production_deployment` and routine `secret_or_credential_change` can rely on a delegation. The delegation must be written, scoped and still valid when the operation happens, and the policy's excluded sensitive operations always need per-change client approval. A delegated decision stays unusable until a human records `delegatedScopeConfirmation`, confirming the operation is inside the written scope and is not an excluded operation. The validator cannot judge scope text, so it never infers this.

## Storage, access and retention

- **Default: private, access-controlled storage.** Keep real client records in a private system with access limited to the people who need them, such as the client's or VitaNova's controlled document store. Record the location in `storage`.
- **Never commit client records or approvals to Git automatically.** A Git repository is visible to everyone with repository access, keeps history permanently, and is copied to every clone and fork. Storing records there needs an explicit client decision; the validator flags every project record that says it lives in Git.
- Never store secrets, credentials, personal data, signatures, signed documents or production data extracts in records. Keep the documents in the client's or VitaNova's controlled document system and reference them by opaque ID.
- Agree retention with the client, such as how long after a decision or the end of the engagement records are kept and who may read them. Removing a file from Git does not remove it from history.

## CI (deferred)

Nothing here runs in GitHub Actions. Adding it is a separately reviewed change. Future CI should test only the reusable parts (the template, the validator and its tests, and the synthetic fixture), and must never read, fetch or require access to private client records.

## Human decisions vs. legal and compliance review

Records capture **business decisions**: a client accepting a risk, delegating releases, or approving a change. Whether a law, standard or contract applies, and whether a compliance claim may be made, is a `regulatory_applicability_determination` or `compliance_claim_publication` for a qualified specialist. Neither the format nor the validator decides legal questions. A record of a specialist determination states that it was made; it does not make it correct.

## Use by VitaNova Claude Skills

- Ship the template, validator, tests and synthetic fixture with the approval policy. Never ship, copy or infer a client's records.
- Before a sensitive action, a Skill reads the project's records, finds a `formally_complete` decision or delegation for the **exact** action and scope, and still treats authenticity as unverified. If there is none, or it is unverified, expired or out of scope, the Skill stops and asks the right person.
- A Skill may draft a `proposed` decision, and may record a human's decision when that human asks. It never marks anything approved or `human_confirmed` on its own, never confirms a delegated scope, never renews, and never extends an expiry.
- A Skill writes real records only to the private storage the client chose, and never commits client records or approvals to Git automatically.
- Treat every record marked `NOT usable for authorization` as absent: stop and ask for verification or renewal.
- Report states with the validator's wording ("formally complete; authenticity not verified"). Never write "approved", "authorized" or "compliant" from the tool output alone.

## Limitations

- Identity, signatures, evidence contents and legal effect are not verified, and cannot be by a file-based check.
- Scope wording is free text. The validator cannot tell whether an operation falls inside a delegation's scope or outside the policy's routine scope; a human decides that.
- The text checks catch common unsafe content, not every possible secret or personal detail.
- The format covers one project per file and is not enforced in CI.
- The validator reads a records file you point it at; it does not know where records are actually stored or who can read them. `storage` is a human statement.
