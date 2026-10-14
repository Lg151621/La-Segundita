---
name: vitanova-security
description: Read-only VitaNova security review for a website or web-app repository. Detects the framework and package manager, validates the VitaNova security check catalog, recommends security checks for human review, validates client security records, and drafts (never approves) dependency risk-renewal packets. Use when asked to review a site's security setup, recommend security checks, onboard a client project to the VitaNova security workflow, or prepare an accepted-risk renewal review. Do not use it to fix vulnerabilities, approve or renew risks, change CI, access secrets, or deploy.
---

# VitaNova security review (Skill V1 candidate)

This is a read-only-first workflow built from VitaNova's tested security scripts. It inspects a **target project** and reports what a human should review. It never decides for anyone.

`SKILL_DIR` below means the directory containing this `SKILL.md`. `TARGET` is the project being reviewed. Commands use Node built-ins only and are tested on Node 22. The scripts write nothing into `TARGET`, and only `npm audit` contacts the network.

## Ground rules (always)

- **Read-only by default.** Do not edit the target project, its CI, its dependencies, its baselines or its records unless the user explicitly asks for that specific change, and the approval policy allows it.
- **Automation proposes; humans authorize.** Never self-authorize. These all need the right human authorization first (see `docs/security/SECURITY-APPROVAL-POLICY.md`):
  - production changes or deployments
  - secret or credential access or changes
  - CMS permission changes
  - production data access
  - weakening or bypassing a CI or security gate
  - creating, renewing or extending an accepted-risk baseline
  - decisions about client data
  - publishing client content
  - any legal or compliance claim
- **Keep these six things separate, and never let one imply another:**

  | Term | Meaning | Never means |
  | --- | --- | --- |
  | **Feature detected** | Bounded source evidence matched a pattern | The feature is live, or secure |
  | **Check recommended** | The catalog suggests a human review it | It was run |
  | **Automatable** | The toolkit can perform the check (`projectStatus.toolkitCapability: automatable_with_toolkit`) | The project has it set up |
  | **Configured** | Evidence shows the project has the check set up. Reports only ever say `not_verified` or `project_files_present_not_verified`. | It ran |
  | **Check run** | Someone or something performed it, with evidence you can cite | It passed |
  | **Check passed** | That run found nothing within its stated limits | The project is secure |
  | **Risk accepted** | A recorded, unexpired human decision by the authorized role | The risk is fixed or acceptable forever |
  | **Compliance or legal determination** | A qualified specialist's determination | Something automation can make |

- Never call a project "secure", "compliant", "passed" or "clean" from these reports. Use "recommended", "needs human review", "not indicated within the inspected scope (supported projects only)", and name the limits.
- Never print secret values, environment files, personal data or private client documents. Reports contain relative paths and IDs only.
- Real client approval records stay in the client's private, access-controlled storage. Never commit them, and never copy one client's records, findings or decisions into another project or into this Skill.

## Supported ecosystems (V1)

| Dimension | Supported | Everything else |
| --- | --- | --- |
| Framework | Next.js, React with Vite, Astro | `partial`, `unsupported` or `unknown`. Negative findings stay uncertain, and every unmatched conditional check becomes `needs_human_review`. |
| Dependency audit | **npm only** (`package-lock.json` or `npm-shrinkwrap.json`, `npm audit --json` report v2) | pnpm, yarn, bun and deno are **not** covered. Say so, and propose that ecosystem's own audit for human review. Never cite the npm gate as coverage. |

Do not infer support that the inventory does not report. If support is incomplete, state the uncertainty and ask for human review.

## Workflow

Make a scratch directory outside `TARGET` for outputs, for example `OUT=$(mktemp -d)`.

1. **Detect the project.**
   ```sh
   node "$SKILL_DIR/scripts/security/inventory-project.mjs" --root "$TARGET" > "$OUT/inventory.json"
   node "$SKILL_DIR/scripts/security/format-project-inventory.mjs" "$OUT/inventory.json"
   ```
   Read `support.framework` and `support.packageManager` first, and report them before anything else.
2. **Validate the check catalog** against this project. The reference root defaults to `SKILL_DIR`.
   ```sh
   node "$SKILL_DIR/scripts/security/validate-check-catalog.mjs" --root "$TARGET"
   ```
   If `TARGET/docs/security/PROJECT-LOCAL-EVIDENCE.json` exists, it is validated as that project's own evidence pointers. Pass `--no-project-evidence` to skip it.
3. **Recommend checks.**
   ```sh
   node "$SKILL_DIR/scripts/security/recommend-security-checks.mjs" --root "$TARGET" > "$OUT/recommendations.json"
   node "$SKILL_DIR/scripts/security/format-security-recommendations.mjs" "$OUT/recommendations.json"
   ```
   Report each check's disposition (`recommended`, `needs_human_review`, `not_currently_indicated`), its support notes and its human-confirmation items. These are review topics, not results.
   Read `projectStatus` for each check: `toolkitCapability` is what the toolkit can do; `configuration`, `execution` and `result` describe this project and are `not_verified` unless a person shows otherwise. For a project with no CI and no recorded results, say "the toolkit can automate this check; this project's setup, runs and results are not verified". Never say a dependency or secret scan is configured, ran or passed because the toolkit supports it or another project has CI.
4. **Request human review.** Present the summary, the support status and limits, and the list of human-confirmation questions. Ask who holds each role (technical owner, client decision-maker, specialist reviewer) when a decision is needed. **Stop here** unless the user asks for one of the optional steps.
5. *(Optional, npm projects that already have their own baseline.)* **Run the dependency gate.** First ask before running `npm audit`, because it contacts the registry. Write its output to `$OUT`, never into `TARGET`.
   ```sh
   (cd "$TARGET" && npm audit --json) > "$OUT/audit.json"   # nonzero exit when advisories exist is expected
   node "$SKILL_DIR/scripts/security/check-dependency-audit.mjs" "$OUT/audit.json" "$TARGET/docs/security/DEPENDENCY-AUDIT-BASELINE.json" "$TARGET/package-lock.json"
   ```
   A pass means "exact baseline matches only". It is not a renewal or an approval. If the project has no baseline, never create one: accepting a risk is a client decision.
6. *(Optional)* **Draft a renewal review** for a project that has an accepted-risk baseline.
   ```sh
   node "$SKILL_DIR/scripts/security/assess-risk-renewal.mjs" --root "$TARGET" --project-id PROJECT_ID --audit "$OUT/audit.json" [--register REL_PATH] [--previous-baseline FILE]
   ```
   The packet is **`DRAFT / NOT AUTHORIZED`**. Follow `docs/security/RISK-RENEWAL-PROCEDURE.md`. Never edit a baseline's dates or findings from it.
7. *(Optional)* **Client records.** Explain the format (`docs/security/CLIENT-SECURITY-RECORDS.md`) and validate a records file the user gives you:
   ```sh
   node "$SKILL_DIR/scripts/security/validate-client-records.mjs" --records FILE
   ```
   Draft only `proposed` entries. Never mark anything approved or `human_confirmed`, and never write records into a Git repository automatically. Records marked `NOT usable for authorization` count as absent.

## Reporting

Lead with the support status. Then give the dispositions and the human-review items. End with the limits:
- the scan is bounded and allowlisted
- nothing inspected live services, deployed headers or provider settings
- legal applicability is a specialist question

Quote states using the scripts' own words. When something was not run, say so.

## Files

- `scripts/security/`: the bundled scripts, plus `validate-client-records.test.mjs` and its synthetic fixture.
- `docs/security/`: the check catalog and the approval policy (schema 2), with their reference documents, the client-records guide and the renewal procedure.
- `docs/security/templates/`: blank client-records and renewal-decision templates.
- `tests/skill.test.mjs`: synthetic, outside-repository verification.
- `MANIFEST.json`: file hashes and contract versions.
- `README.md`: installation, verification, compatibility and limitations.
