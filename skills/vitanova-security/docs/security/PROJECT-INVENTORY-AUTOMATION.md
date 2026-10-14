# Read-only project security inventory

`scripts/security/inventory-project.mjs` is a small source-discovery aid. It suggests security checks from repository evidence; it does not run those checks, assign a risk level, decide legal applicability or approve an exception. The project's own human-reviewed security profile, if it has one, and the [general check matrix](PROJECT-AWARE-CHECK-MATRIX.md) remain the interpretation layer. A project's dependency gate and any time-limited risk approvals stay in that project's own records.

## Run

From the repository root:

```sh
node scripts/security/inventory-project.mjs
```

Pass an optional directory to inventory another project: `node scripts/security/inventory-project.mjs /path/to/project` or, equivalently, `--root /path/to/project`. A missing, non-directory, or symlinked root fails with a short message and no output. JSON goes to stdout, so callers can parse it without creating a project file. The script uses built-in Node APIs, makes no network request and writes nothing. Its output has no time-dependent field, so the same files produce the same JSON.

## Scope and schema

The script reads `package.json`; selected root `next.config.*`, `vite.config.*`, `astro.config.*`, `sanity.config.*` and `index.html` files; and JavaScript, TypeScript, HTML or Astro (`.astro`) source under `app/`, `pages/`, `components/`, `lib/`, `sanity/`, `src/` and `api/` (Phase 4A widened `src/` from five subfolders to the whole folder and added `api/` for Vercel-style functions). It checks root lockfile **names** (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock(b)`, `deno.lock`) for existence only and never reads lockfile contents; symlinked lockfiles are ignored. It skips hidden files (including all `.env` variants), docs, common test filenames/directories, generated/dependency directories and symlinks. It reads at most 400 source files, 2,000 directory entries, eight levels and 64 KiB per file; a hit limit or unreadable file is recorded in `scope.incomplete`. It does not inspect `.env` values, lockfiles, Git history, provider accounts, browser traffic, live data or production configuration. Only recognized evidence paths and fixed signal labels leave the process; no source snippets, package values or credential values are emitted. File names themselves are evidence, so review output before sharing it outside the project.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Integer output contract version; currently `1`. Optional additions (such as 4A `support`) keep version 1; breaking changes require a bump (see the Skill README). |
| `scope` | Relative root marker, scanned directory/file categories, limits, manifest state, file count and incompleteness reason codes. An incomplete scan cannot justify a negative conclusion. |
| `support` | Phase 4A, additive. `framework` and `packageManager`, each with `status` (`supported`, `partial` for frameworks only, `unsupported`, or `unknown`), `id`, `detected[]`, `evidence[]` and reason codes; plus the `supportedTargets` list. Supported targets are Next.js, React with Vite, and Astro on npm. Support states are summarized in the Skill's `SKILL.md`. |
| `signals[]` | Fixed IDs for `nextjs`, `sanity_cms`, `api_routes`, `webhooks`, `browser_auth`, `public_forms`, `payments`, `analytics` and `database`. Each has a status, confidence and sorted relative evidence paths. |
| `candidateChecks[]` | Always-relevant checks plus conditional check suggestions for detected or uncertain signals. `triggeredBy` names the signal; `requiresHumanReview` marks that applicability, findings and enforcement need review. This is not a check result. |
| `boundaries` | Explicitly says legal/compliance applicability and risk level were not determined. |

`detected` means the limited source or manifest evidence met a documented pattern; it does not prove the feature is active in production or secure. `not detected in inspected scope` means the bounded readable source did not match; it never means absent everywhere. `needs human verification` means evidence is partial, the project has no inspectable source, or the scan was incomplete. High confidence normally combines a named package with relevant source use, or an API route path; medium confidence is a source pattern or bounded negative; low confidence is partial or incomplete evidence. Patterns can miss custom integrations or match dead/commented code.

## Reusable Skill Knowledge

- **Triggers for a future Claude `SKILL.md` or Codex workflow:** run discovery when onboarding a website, changing routes or integrations, or reviewing a security profile; keep it read-only until a human authorizes changes.
- **Evidence collection:** inventory a bounded, allowlisted source set; emit relative paths, signal IDs and incompleteness reasons, never snippets or environment values. Compare the draft with the project profile and matrix, including existing risk decisions.
- **Confidence:** reserve `detected` for concrete patterns, downgrade package-only or path-only hints to `needs human verification`, and preserve `not detected in inspected scope` as a limited statement. An incomplete scan must keep negatives uncertain.
- **Human gates:** a person verifies live CMS/hosting access, authentication boundaries, analytics data, payments, regulated data, legal applicability, risk exceptions and any CI/production action. Automation may recommend checks but may not accept findings or declare compliance.
- **Support honesty:** report the framework and package manager the scan can stand behind; an unsupported, partial, or unknown project keeps every negative uncertain and is never described as secure.
- **Portable schema:** keep `schemaVersion`, `scope`, `signals` with status/confidence/evidence and `candidateChecks` with triggers and review boundary stable. Version the contract before changing field meaning or adding enforcement.
