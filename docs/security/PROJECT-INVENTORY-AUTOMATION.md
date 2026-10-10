# Read-only project security inventory

`scripts/security/inventory-project.mjs` is a small source-discovery aid. It suggests security checks from repository evidence; it does not run those checks, assign a risk level, decide legal applicability or approve an exception. The human-reviewed [project profile](PROJECT-SECURITY-PROFILE.md) and [general check matrix](PROJECT-AWARE-CHECK-MATRIX.md) remain the interpretation layer. The existing dependency/secret CI gate and its time-limited risk approval remain governed by `SECURITY-BASELINE-CI.md`, `DEPENDENCY-AUDIT-BASELINE.json` and `DEPENDENCY-RISK-REGISTER.md`.

## Run

From the repository root:

```sh
node scripts/security/inventory-project.mjs
node --test scripts/security/inventory-project.test.mjs
node --test scripts/security/format-project-inventory.test.mjs
```

Pass an optional directory to inventory another project: `node scripts/security/inventory-project.mjs /path/to/project` or, equivalently, `--root /path/to/project`. A missing, non-directory, or symlinked root fails with a short message and no output. JSON goes to stdout, so callers can parse it without creating a project file. The script uses built-in Node APIs, makes no network request and writes nothing. Its output has no time-dependent field, so the same files produce the same JSON.

## Scope and schema

The script reads `package.json`; selected root `next.config.*`, `vite.config.*`, `astro.config.*`, `sanity.config.*` and `index.html` files; and JavaScript, TypeScript, HTML or Astro (`.astro`) source under `app/`, `pages/`, `components/`, `lib/`, `sanity/`, `src/` and `api/` (Phase 4A widened `src/` from five subfolders to the whole folder and added `api/` for Vercel-style functions). It checks root lockfile **names** (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock(b)`, `deno.lock`) for existence only and never reads lockfile contents; symlinked lockfiles are ignored. It skips hidden files (including all `.env` variants), docs, common test filenames/directories, generated/dependency directories and symlinks. It reads at most 400 source files, 2,000 directory entries, eight levels and 64 KiB per file; a hit limit or unreadable file is recorded in `scope.incomplete`. It does not inspect `.env` values, lockfiles, Git history, provider accounts, browser traffic, live data or production configuration. Only recognized evidence paths and fixed signal labels leave the process; no source snippets, package values or credential values are emitted. File names themselves are evidence, so review output before sharing it outside the project.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Integer output contract version; currently `1`. Optional additions (such as 4A `support`) keep version 1; breaking changes require a bump (see [PORTABILITY.md](PORTABILITY.md#versioning-policy)). |
| `scope` | Relative root marker, scanned directory/file categories, limits, manifest state, file count and incompleteness reason codes. An incomplete scan cannot justify a negative conclusion. |
| `support` | Phase 4A, additive. `framework` and `packageManager`, each with `status` (`supported`, `partial` for frameworks only, `unsupported`, or `unknown`), `id`, `detected[]`, `evidence[]` and reason codes; plus the `supportedTargets` list. Supported targets are Next.js, React with Vite, and Astro on npm. See [PORTABILITY.md](PORTABILITY.md). |
| `signals[]` | Fixed IDs for `nextjs`, `sanity_cms`, `api_routes`, `webhooks`, `browser_auth`, `public_forms`, `payments`, `analytics` and `database`. Each has a status, confidence and sorted relative evidence paths. |
| `candidateChecks[]` | Always-relevant checks plus conditional check suggestions for detected or uncertain signals. `triggeredBy` names the signal; `requiresHumanReview` marks that applicability, findings and enforcement need review. This is not a check result. |
| `boundaries` | Explicitly says legal/compliance applicability and risk level were not determined. |

`detected` means the limited source or manifest evidence met a documented pattern; it does not prove the feature is active in production or secure. `not detected in inspected scope` means the bounded readable source did not match; it never means absent everywhere. `needs human verification` means evidence is partial, the project has no inspectable source, or the scan was incomplete. High confidence normally combines a named package with relevant source use, or an API route path; medium confidence is a source pattern or bounded negative; low confidence is partial or incomplete evidence. Patterns can miss custom integrations or match dead/commented code.

## La Segundita comparison

The current run detects Next.js, Sanity CMS/Studio, the revalidation API route and signed-webhook call, and Vercel Analytics. Evidence includes `package.json`, `sanity.config.ts`, `app/(studio)/studio/[[...tool]]/page.tsx`, `app/api/revalidate/route.ts` and both public layouts. It does not detect visitor authentication, public forms, payment packages or a separate application database integration in the inspected scope. These match the corresponding source classifications in the Phase 3D.1 profile.

The deliberate difference is that the profile calls **Sanity external content storage present**, while the generator's `database` signal means a **separate application database integration**; Sanity is represented by `sanity_cms`. The generator does not classify public marketing pages, editor uploads, personal/family content, real-world payments, hosting permissions, cookies or legal regimes. The profile's external-verification questions remain open. A matched webhook helper shows code-level signature handling but does not validate the live secret, provider delivery, replay resistance or rate controls.

## Reusable Skill Knowledge

- **Triggers for a future Claude `SKILL.md` or Codex workflow:** run discovery when onboarding a website, changing routes or integrations, or reviewing a security profile; keep it read-only until a human authorizes changes.
- **Evidence collection:** inventory a bounded, allowlisted source set; emit relative paths, signal IDs and incompleteness reasons, never snippets or environment values. Compare the draft with the project profile and matrix, including existing risk decisions.
- **Confidence:** reserve `detected` for concrete patterns, downgrade package-only or path-only hints to `needs human verification`, and preserve `not detected in inspected scope` as a limited statement. An incomplete scan must keep negatives uncertain.
- **Human gates:** a person verifies live CMS/hosting access, authentication boundaries, analytics data, payments, regulated data, legal applicability, risk exceptions and any CI/production action. Automation may recommend checks but may not accept findings or declare compliance.
- **Support honesty:** report the framework and package manager the scan can stand behind; an unsupported, partial, or unknown project keeps every negative uncertain and is never described as secure.
- **Portable schema:** keep `schemaVersion`, `scope`, `signals` with status/confidence/evidence and `candidateChecks` with triggers and review boundary stable. Version the contract before changing field meaning or adding enforcement.

## Review-only CI summary

The `project-inventory` job in `.github/workflows/security-baseline.yml` runs on pull requests and manual dispatch. It uses pinned checkout and Node setup actions, tests the generator and formatter, writes inventory JSON under the runner's temporary directory, and renders a bounded Markdown job summary. It does not install packages, upload the JSON, inspect environment values, change the dependency audit or secret scan, or fail CI because a capability is detected, uncertain, or not detected. A broken generator, invalid schema, or failed formatter does fail the job and produces a short failure message.

The summary groups signals by exact status, lists at most five escaped evidence paths per signal, reports scan limits and incomplete-scan reasons, and lists candidate checks as **human-review topics**, never completed checks. The formatter limits fields and total output and escapes repository-controlled labels and paths before inserting them into HTML code elements. To preview it locally:

```sh
node scripts/security/inventory-project.mjs > /tmp/project-inventory.json
node scripts/security/format-project-inventory.mjs /tmp/project-inventory.json
```

Do not treat the summary as proof that a feature is absent or as a compliance certification. Compare it with `PROJECT-SECURITY-PROFILE.md`, then verify live CMS/hosting access, provider settings, analytics handling, webhook behavior, payments, and legal applicability with a human owner as relevant. The JSON schema and statuses are a reusable interface for future VitaNova Claude Skills and Codex workflows; any future gate or remediation requires a separate approved phase.
