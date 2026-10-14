# Security approval policy (Phase 4B.1)

This policy says **who must decide** before sensitive security work happens, **who may only recommend**, and **what evidence to record** for each decision. It applies to VitaNova projects and is written to travel with future VitaNova Claude Code Skills. The machine-readable form is [SECURITY-APPROVAL-POLICY.json](SECURITY-APPROVAL-POLICY.json).

**What this policy is not.** It is not legal advice, it does not give anyone signing authority over a client, and it records no decision. It is guidance, not an enforcement engine or an authorization token: nothing in it, and nothing its validator prints, means an action has been approved. It does not change any existing CI gate, check catalog, or recorded risk acceptance.

## Default rule

If it is unclear who may decide, the evidence is insufficient, signals conflict, or the work would go beyond what was approved: **stop and ask the appropriate person.** Risk is never accepted implicitly; silence, a passing check, or a recommendation is not approval. **Never assume a delegation exists:** only an explicit, scoped, written, **still-valid** delegation recorded in the project counts, and only for the routine operations listed below. Automation may recommend, and may execute within separately authorized scope, but never grants approval.

## Roles

| Role (ID) | Recommends | Authorizes | Executes | Notes |
| --- | --- | --- | --- | --- |
| Designated VitaNova technical owner or maintainer (`vitanova_technical_owner`) | Yes | Technical work within the client's engagement | Yes | Named per project in that project's records. |
| Authorized client decision-maker (`client_decision_maker`) | Yes | The client's accounts, content, users, data, releases and risk | No | Designated by the client per project; VitaNova never assumes who this is. |
| Specialist reviewer: legal, privacy, compliance or security (`specialist_reviewer`) | Yes | Determinations within their own qualification and engagement | No | Engaged only when a question needs it. |
| Automation: Claude Code, Codex, CI (`automation_agent`) | Yes | **Never** | Only after the required authorization is recorded | Inspects, proposes, runs read-only checks. |

One person may hold more than one role on a project (for example, when VitaNova is also the site owner). Record **which role** they acted in for each decision.

## Approval classes

| Class (ID) | Who recommends | Who authorizes | Who executes |
| --- | --- | --- | --- |
| Routine low-risk implementation (`routine_implementation`) | Automation, technical owner | Technical owner (an explicit, scoped task request counts) | Automation, technical owner |
| Technical or security change needing owner review (`owner_reviewed_change`) | Automation, technical owner, specialist | Technical owner; **also** the client decision-maker when the client's accounts, content, users, data or releases are affected | Automation, technical owner |
| Client-owned risk acceptance (`client_risk_acceptance`) | Automation, technical owner, specialist | **Client decision-maker only**, time-limited, never delegated | Technical owner (records it) |
| Specialist or legal determination (`specialist_determination`) | Automation, technical owner | Specialist reviewer; the client decides whether to act on or publish it | Technical owner |

## Actions and boundaries

| Area | Action ID | Class | Required approvals | Boundary |
| --- | --- | --- | --- | --- |
| Routine work | `routine_scoped_change` | routine | Technical owner | Becomes owner-reviewed once it touches dependencies, controls, secrets, access, CI or production. |
| Dependencies | `dependency_compatible_update` | owner-reviewed | Technical owner within existing authority; **escalate** on material client impact, changed access to client accounts, regulated data, or work outside the approved or delegated scope | Patch or minor within range; lockfile diff limited to the target. |
| | `dependency_override` | owner-reviewed | Technical owner; **escalate** as above | Record why, and the upstream release that should remove it (review trigger). |
| | `dependency_major_or_downgrade` | owner-reviewed | Technical owner; **escalate** as above | One tested change at a time; never forced audit fixes. |
| | `lockfile_broad_churn` | owner-reviewed | Technical owner; **escalate** as above | Stop and show the exact lockfile diff first. |
| Secrets | `secret_or_credential_change` | owner-reviewed | Technical owner **and** client; routine rotation only may rely on a written, still-valid delegation | Automation never sees, prints or stores secret values. |
| Auth | `authentication_authorization_change` | owner-reviewed | Technical owner within existing authority for code changes; **escalate** as for dependencies | Test denied paths, not only allowed ones. |
| CMS | `cms_permission_change` | owner-reviewed | Client **and** technical owner; **never delegable** | The client decides who may access its CMS. |
| | `cms_content_publish` | owner-reviewed | Client; routine client-supplied content only may rely on a written, still-valid delegation | Never invent or publish business facts without the client. |
| CI | `ci_gate_strengthen` | owner-reviewed | Technical owner | Review false-positive behavior before making a gate blocking. |
| | `ci_gate_weaken_or_bypass` | **risk acceptance** | Client **and** technical owner; **never delegable** | Disabling, skipping, downgrading or extending a gate is accepting risk: bounded scope, documented evidence, an expiry **and** re-review triggers. Never silent. |
| Production | `production_data_access` | owner-reviewed | Client **and** technical owner for each access, time-limited; **never delegable** | Least access; no copies in repositories or reports. |
| | `production_deployment` | owner-reviewed | Technical owner **and** client; routine releases only may rely on a written, still-valid delegation | Passing project checks and a rollback path. |
| Risk | `risk_acceptance` | risk acceptance | Client, with expiry | Exact findings only; ends on any new or changed finding, changed exposure, or expiry. |
| | `risk_acceptance_renewal` | risk acceptance | Client, with expiry | Fresh review required; never renewed automatically. |
| Legal | `regulatory_applicability_determination` | specialist | Specialist | Detection raises a question; it never decides applicability. |
| | `compliance_claim_publication` | specialist | Specialist **and** client | Automation never makes compliance claims. |

## Escalation

The technical owner's approval stays sufficient for dependency and authentication changes **unless** an escalation condition applies; then the listed roles must also decide for that instance before work continues.

| Condition | Escalates to |
| --- | --- |
| `material_client_impact`: could materially affect the client's users, data, accounts, availability, costs or obligations | Client decision-maker |
| `client_account_access_change`: alters who or what can access the client's accounts, CMS, hosting, data stores or users | Client decision-maker |
| `delegation_not_valid`: no written, scoped, still-valid delegation covers this exact operation | Client decision-maker |
| `personal_or_regulated_data`: personal, sensitive, payment, health or otherwise regulated data may be involved | Client decision-maker and specialist reviewer |
| `production_impact`: affects a live environment, users or data | Client decision-maker |
| `legal_or_contractual_question` | Specialist reviewer |
| `unknown_authority`, `scope_beyond_approval` | Technical owner and client decision-maker (to establish who decides) |
| `insufficient_evidence`, `conflicting_signals`, `new_or_changed_risk` | Technical owner |

## Delegation

Only three actions can rely on a delegation, and only for routine work. A delegation must be **explicit, scoped, written and still valid**: given by the client decision-maker, naming the technical owner, stating its scope and period, recorded in the project (`delegation_record`), and not expired, revoked or exceeded at the time of the operation. It is never inferred from silence, past practice or a previous approval, never broadened by interpretation, never given to automation or a specialist, and never covers the sensitive operations below; those always need the client's per-change approval. If no valid delegation covers the exact operation (`delegation_not_valid`), stop and ask the client decision-maker.

| Action | Routine scope a delegation may cover | Sensitive operations a delegation never covers |
| --- | --- | --- |
| `secret_or_credential_change` | Rotating an existing secret on its documented schedule to the same scope and services, following a written runbook | Creating a production credential or granting new access scope; changing which services or people can use a secret; revoking or replacing a credential after suspected exposure (notify the client immediately); payment, identity-provider or data-store credentials |
| `production_deployment` | Releases of reviewed content, styling, copy or bug fixes whose project checks pass, within the delegated scope and period | First launch, domain or DNS changes; releases changing authentication, authorization, secrets, payments, data handling or CI gates; schema or data migrations affecting live data; releases with failing, skipped or weakened security checks; anything outside the delegated scope or period |
| `cms_content_publish` | Publishing content the client supplied or approved (hours, photos, announcements, listings) within the delegated scope | New business claims, prices or offers the client did not supply; legal, privacy, accessibility or compliance statements; content with personal data about identifiable people; deleting or unpublishing client content; changing who may edit or publish |

**Never delegable:** `cms_permission_change`, `production_data_access`, `ci_gate_weaken_or_bypass`, `risk_acceptance`, `risk_acceptance_renewal`, `regulatory_applicability_determination`, `compliance_claim_publication`.

## Evidence checklist

Record per decision, in the project's own records: project identifier; change or risk ID; scope (and what is excluded); affected asset; source evidence (links or relative paths to audits, diffs, tests); alternatives considered; potential impact; the approver's role; the exact approval in their own words; decision timestamp with time zone; expiry or review trigger where applicable; verification performed and not performed; and the audit trail location. Add the delegation record when a delegation is used.

Never put secret values, credentials or tokens, personal data, or production data extracts in an approval record.

## What an approval is not

- **A documented approval is not a passing security check.** An accepted advisory is still a known vulnerability; acceptance fixes nothing.
- **A passing check is not an approval.** A green job says what one tool observed in its scope; it cannot accept risk or authorize a change.
- **A recommendation is not authorization.** Automation and reviewers may recommend; only the roles above authorize.
- **No unapproved change to existing gates.** The dependency audit, secret scan, inventory and recommendation jobs, and their baselines, change only through the actions above.

## Regulatory frameworks

Detecting a technology (payments, analytics, health or personal data) does not mean HIPAA, PCI DSS, GDPR, CCPA or any other law, standard or contract applies. Treat each as a **review question** for an authorized specialist (`regulatory_applicability_determination`). Only a specialist determination plus the client's approval allows a compliance claim to be stated or published.

## Project-local example: La Segundita

La Segundita's three accepted dependency advisories (`braces`, `sprintf-js`, `uuid`; approved 2026-10-09, expiring after 2026-11-09 UTC) are an example of `risk_acceptance` recorded in **that project's** `DEPENDENCY-AUDIT-BASELINE.json`, `DEPENDENCY-RISK-REGISTER.md` and `SECURITY-BASELINE-CI.md`. They are **not** a portable default, not part of this policy, and **not renewed** by it. This phase did not change those records or their expiry; any renewal is a new `risk_acceptance_renewal` decision by La Segundita's client decision-maker after a fresh review.

**Role ambiguity to resolve at the next renewal.** The existing record names the approver as "Project owner, VitaNova Creations". Under this policy, risk acceptance belongs to the **client decision-maker**, while VitaNova may also be the **technical owner**; the record does not say in which role the approval was given. That record stays exactly as it is until it expires. At the next renewal (on or before its expiry, or earlier on any new or changed finding), the renewal record should name the person and the role they acted in, confirm who La Segundita's client decision-maker is, and, if VitaNova holds both roles for this project, state that explicitly.

## Machine-readable policy and validator

```sh
node scripts/security/validate-approval-policy.mjs                  # bundled policy
node scripts/security/validate-approval-policy.mjs --policy FILE    # another copy
node --test scripts/security/validate-approval-policy.test.mjs
```

The validator is dependency-free and read-only. Beyond the rules below, it also enforces the refinements: `assumeDelegation` is false; every escalation condition names human roles that can authorize; client impact, changed account access and invalid delegation escalate to the client decision-maker, and regulated data to a specialist; dependency and authentication actions stay technical-owner approved and escalate material client impact, changed account access, regulated data and out-of-scope work; delegable actions escalate when no valid delegation applies; only delegable actions define `delegationLimits` (routine scope plus excluded sensitive operations), and the seven never-delegable actions cannot be delegated; CMS permission changes, production data access and gate weakening need both the client decision-maker and the technical owner; production data access and gate weakening must expire, and gate weakening stays a client risk acceptance. It checks the schema version, stable unique IDs, the four recognized roles and classes, coverage of all 17 required action IDs, that required approvers can authorize and belong to the action's class, that automation never authorizes or receives delegation, that risk acceptance is client-only, expiring and non-delegable, that evidence requirements cover each class minimum and the core checklist, and that escalation conditions are known. It also rejects anything that reads as a recorded decision or project data: approval-like fields (`approvedBy`, `expiresOn`, `reviewer`, …), calendar dates, advisory IDs, email addresses, phone numbers, credential-like values, and guarantee or certification wording. Its output always states that no approval is granted.

The schema is **version 2** and **strict**: unknown fields are rejected. Version 1 (committed in `a13839f`) is retired and rejected with an explicit message, because the 4B.1 finalization made validation stricter in a way older files can fail: every policy must now define the `client_account_access_change` and `delegation_not_valid` conditions (both escalating to the client decision-maker); dependency and authentication actions must escalate changed account access and out-of-scope work; and delegable actions must escalate when no valid delegation applies. Field names and types did not change, and all 17 action IDs are preserved, so upgrading a v1 file means setting `schemaVersion` to 2 and adding those condition entries and escalations. The policy and its validator are always updated together; adding an optional field means updating the validator and tests in the same change. Breaking changes (removing or renaming fields, changing meanings, adding required fields, roles, classes or required actions) need a version bump. The tests run with `node --test scripts/security/*.test.mjs`; they are **not** in the GitHub Actions workflow, because this phase does not change CI.

## Portable Skill vs. project-local records

| Ship in a portable VitaNova Skill | Keep in each client project |
| --- | --- |
| This policy document and `SECURITY-APPROVAL-POLICY.json`; `validate-approval-policy.mjs` and its tests; the evidence checklist and action IDs as vocabulary | Who holds each role; written delegations; every decision record (risk acceptances, renewals, exceptions, deployment approvals); dependency baselines and expiries; the project's security profile, evidence file and CI configuration |

A Skill may explain how to record a decision. It must never ship, copy, reuse, renew or infer one, and it must never carry one client's approvals or findings into another client's project. The per-project record format, blank template and read-only validator are described in [CLIENT-SECURITY-RECORDS.md](CLIENT-SECURITY-RECORDS.md).

## Limitations

- The policy describes required decisions; it cannot verify that a person really holds a role, that an approval is genuine, or that evidence is complete. Those remain human checks.
- Action IDs cover the common sensitive areas, not every possible change. Anything unlisted falls under the default rule.
- The text checks catch common unsafe content, not every possible secret or personal detail.
- Nothing here is enforced in CI, and nothing replaces a client contract or qualified legal advice.

## Reusable Skill Knowledge

- **Consult before acting.** Before any action in the table above, a Skill reads the policy, identifies the action ID, and checks whether the project's records already hold the required authorization for this exact scope. If not, it stops and asks.
- **Ask the right person, precisely.** Name the action, scope, evidence, alternatives and impact, and ask the specific role (technical owner, client decision-maker, or specialist). Do not ask automation, other clients, or an earlier conversation to stand in.
- **Record per project.** After a human decides, record the checklist fields in that project's own records, quote the exact approval, and set an expiry or review trigger where required. Never store secrets, credentials or personal data in the record.
- **Never self-authorize.** Automation recommends and executes only; a passing test, an earlier approval for a different scope, or an expired acceptance is never authority.
- **Treat legal questions as questions.** Raise a `regulatory_applicability_determination` for a specialist; never state or imply compliance.
- **Keep what travels separate from what stays.** Ship the policy, schema, validator and vocabulary; keep roles, delegations, decisions and baselines inside each client's project.
