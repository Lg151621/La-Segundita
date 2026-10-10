# Portability: running the security inventory on other projects (Phase 4A)

The inventory, catalog validator and recommendation engine can now run against any project directory, with a configurable catalog and reference root, and they say plainly when a project is outside what they support. **Support status describes scanner coverage, not security.** A `supported` project is not secure, and an `unsupported` or `unknown` project is not insecure; for anything other than full support, the tools refuse to treat "not found" as "not present".

## Support targets

| Dimension | Supported in 4A | Recognised but unsupported | Unknown |
| --- | --- | --- | --- |
| Framework | `nextjs` (package `next`), `react_vite` (`vite` plus `react` or `react-dom`, no other host), `astro` (package `astro`) | `sveltekit`, `nuxt`, `remix`, `react_router_framework`, `gatsby`, `angular`, `solidstart`, `qwik`, `create_react_app`, `expo_react_native`, `ember`; Vue, Svelte, Solid, Preact or Lit without a supported host (`vite_vue`, `svelte`, …); server-only `express`, `fastify`, `koa`, `hono`, `nestjs`, `hapi` | no `package.json`, unreadable or oversized manifest, no recognised framework, React without Vite or Next.js, more than one host framework |
| Package manager | `npm` (`package-lock.json` or `npm-shrinkwrap.json` at the root) | `pnpm`, `yarn`, `bun`, `deno` | no lockfile, conflicting lockfiles, or a `packageManager` field that disagrees with the lockfile |

A framework is **`partial`** when a supported host is present together with something the scanner cannot read or follow: Vue or Svelte components (`unsupported_component_framework`), a separate Node server framework (`additional_server_framework`), or npm workspaces (`workspace_packages_not_scanned`, only the root is scanned). Detection uses declared package names and root config file names; it never runs project code.

| Reason code | Meaning |
| --- | --- |
| `no_package_manifest`, `unusable_package_manifest` | No readable `package.json`, so neither framework nor package manager can be identified. |
| `no_recognized_framework`, `react_without_supported_build_tool`, `multiple_frameworks` | The framework is `unknown`. |
| `unsupported_framework`, `server_framework_only` | A recognised framework or server stack outside the 4A targets. |
| `unsupported_component_framework`, `additional_server_framework`, `workspace_packages_not_scanned` | A supported host with coverage gaps (`partial`). |
| `no_lockfile`, `conflicting_package_managers`, `unsupported_package_manager` | Package-manager states other than `supported`. |
| `support_not_assessed` | The inventory predates Phase 4A and has no `support` block; treated as `unknown`. |

## What the status changes

- **Framework not `supported`:** conditional checks that found no evidence become `needs_human_review` ("framework support is …; source non-detection cannot rule this check out"), never `not_currently_indicated`. Detected evidence still makes a check `recommended`. `projectSupport.nonDetectionReliable` is `false`.
- **Package manager not `supported`:** checks marked `requiresSupportedPackageManager` in the catalog (currently `dependency_scan`) keep their disposition, but carry a `supportNotes[]` entry saying the existing npm-only automation does not cover the project, and their human-confirmation item asks for an equivalent check with that package manager's own advisory tooling.
- **Incomplete scan** (file, depth, entry or size limit, unreadable files): unchanged from Phase 3E, every unmatched conditional check needs review.

## What is scanned

Source under `app/`, `pages/`, `components/`, `lib/`, `sanity/`, `src/` and `api/` with extensions `.js .jsx .mjs .cjs .ts .tsx .mts .cts .html .astro`, plus root `index.html`, `public/index.html`, `next.config.*`, `vite.config.*`, `astro.config.*` and `sanity.config.*`. API routes are Next.js `app/**/route.*` and `pages/api/**`, Vercel-style `api/**` functions, and, for Astro only, script files under `src/pages/` (endpoints). Dotfiles (all `.env*`), symlinks, dependencies, build output, tests and stories are skipped; limits are 400 files, 2,000 entries, depth 8 and 64 KiB per file. `.vue` and `.svelte` files are never read.

## Running against another project

```sh
# From anywhere; the bundled catalog and its reusable references stay in the framework checkout.
node scripts/security/inventory-project.mjs --root ../client-site
node scripts/security/validate-check-catalog.mjs --root ../client-site
node scripts/security/recommend-security-checks.mjs --root ../client-site > /tmp/recommendations.json
node scripts/security/format-security-recommendations.mjs /tmp/recommendations.json
```

| Option | Default | Notes |
| --- | --- | --- |
| `--root DIR` | current directory | The project to inventory. Must be a real directory (not a symlink). |
| `--catalog FILE` | `docs/security/SECURITY-CHECK-CATALOG.json` in the framework | Regular file, at most 256 KiB, valid catalog contract. |
| `--reference-root DIR` | the framework root | Where the catalog's reusable `provenance[]` paths must exist. |
| `--project-evidence FILE` | `docs/security/PROJECT-LOCAL-EVIDENCE.json` inside `--root`, if present | Project-local pointers; at most 64 KiB. Use `--no-project-evidence` to skip discovery. |

With no options and the repository root as the working directory (as in CI), every command behaves exactly as before Phase 4A. Errors exit nonzero with no report, and messages never echo local paths; reports label custom inputs as `custom file: NAME` rather than absolute paths.

## Reusable provenance vs. project-local evidence

The catalog's `provenance[]` now lists only reusable method sources (the check matrix, inventory documentation and scripts). Files that belong to a single project live in that project:

```json
{
  "schemaVersion": 1,
  "kind": "project-local-security-evidence",
  "catalogId": "vitanova-security-checks",
  "project": "Example project",
  "note": "Pointers only; not check results or risk decisions.",
  "checks": {
    "webhook_authentication_review": ["src/pages/api/webhook.ts", "docs/security/PROJECT-SECURITY-PROFILE.md"]
  }
}
```

Rules: check IDs must exist in the catalog; at most 10 relative paths per check; no absolute paths, `..`, `.` segments, backslashes or `.env*` names (dot-directories such as `.github` are allowed). The recommendation report shows each path as `present`, `missing` or `not_regular_file` and never opens the file. La Segundita's file is `docs/security/PROJECT-LOCAL-EVIDENCE.json`; its entries are the project-specific provenance paths the catalog listed before Phase 4A, plus the dependency audit baseline.

## Approved decisions (owner approval, 2026-10-10)

1. **Stricter default for unsupported or unknown projects.** Unmatched conditional checks are `needs_human_review` whenever framework support is not `supported`. The synthetic `minimal-public` fixture stays at 5 / 10 / 0. Explicit static-site support is recorded under [Future improvements](#future-improvements).
2. **Provenance classification.** `PROJECT-AWARE-CHECK-MATRIX.md`, `PROJECT-INVENTORY-AUTOMATION.md` and the generic `scripts/security/*.mjs` are reusable references. `SECURITY-BASELINE-CI.md` is project-specific because it records La Segundita's dependency approval. See [Packaging map](#packaging-map-for-vitanova-skills).
3. **Schema versions stay at 1.** All 4A additions are optional and backward-compatible (see [Versioning policy](#versioning-policy)).
4. **Support classifications.** Workspaces are `partial`; React without confirmed Vite (or Next.js) is `unknown`; conflicting package-manager evidence is `unknown`.
5. **CI change.** One line in `.github/workflows/security-baseline.yml` adds `portability.test.mjs` to the review-only recommendations job. The dependency audit, secret scan, inventory and recommendations jobs, and the dependency approval behavior, are otherwise unchanged.

## Versioning policy

The inventory, catalog and recommendation report remain `schemaVersion: 1`. Phase 4A only **added optional fields**: inventory `support`; report `projectSupport`, `inputs.projectEvidenceSource`, and per-check `supportNotes`, `projectEvidence`, `projectEvidenceOmitted`; catalog `requiresSupportedPackageManager`. Validators accept inputs without them: an inventory without `support` is treated as `unknown` (`support_not_assessed`), a report without `projectSupport` renders as "not assessed (older report)", and a catalog without the new flag is valid. Any **breaking** change requires a version bump of the affected contract and matching validator, formatter and test updates. Breaking changes include removing or renaming a field, changing a field's type or meaning, adding a required field, adding a signal ID or status, or changing what a disposition means.

## Compatibility

- **La Segundita:** identical summary (11 / 0 / 4), dispositions, rationales, scan status, human-confirmation items and boundaries compared with `main`; same 47 files and signals. Its time-limited dependency approval (`DEPENDENCY-AUDIT-BASELINE.json`, through 2026-11-09) and the dependency and secret gates are untouched.
- **Additive schema changes:** inventory `support`, report `projectSupport`, per-check `supportNotes`, `projectEvidence`, `projectEvidenceOmitted`, and `inputs.projectEvidenceSource` are additive within schema version 1; the catalog gains an optional `requiresSupportedPackageManager`. Older inventories and reports still validate; an inventory without `support` is treated as `unknown`.
- **One intentional, approved behavior change:** the synthetic `minimal-public` fixture (a lone `index.html`) moved from 5 / 0 / 10 to 5 / 10 / 0, because its framework is unknown.

## Limitations

- Support covers Next.js, React with Vite, and Astro on npm only. Everything else is reported as unsupported or unknown and needs a human-led review; there are no ecosystem-specific signals for other frameworks, languages or package managers.
- Detection is pattern-based: package names and source regular expressions can miss custom or dynamically loaded integrations, and can match comments or dead code.
- Only the project root is inventoried; monorepo workspace packages, `.vue` and `.svelte` components, and server code outside the listed directories are not read.
- Lockfiles are identified by name only. `npm` support means the existing npm audit gate can apply; it does not mean dependencies were audited.
- Project-local evidence presence shows that a file exists, not that a check ran, passed or that a risk was accepted.
- Nothing here inspects deployed headers, live provider settings, identities, data flows or legal applicability.

## Future improvements

- **Explicit static-site support.** Plain HTML/CSS/JS sites without a `package.json` are `unknown` today, so every conditional check needs review (the `minimal-public` case). A future phase could add a `static_site` target with a defined scan scope (root and asset folders, inline and linked scripts, forms and third-party embeds) and its own tests, after which bounded non-detection could apply to such sites.
- Package-manager-specific dependency audits for pnpm, yarn and bun, so `dependency_scan` automation is not npm-only.
- Workspace (monorepo) package scanning, and reading `.vue` and `.svelte` components.
- Framework-specific route and integration patterns before adding any framework to the supported list.

## Packaging map for VitaNova Skills

| Ship in a reusable Skill | Keep in each project (never copied between clients) | Split before packaging |
| --- | --- | --- |
| `scripts/security/inventory-project.mjs`, `validate-check-catalog.mjs`, `recommend-security-checks.mjs`, `security-cli.mjs`, both formatters, `check-dependency-audit.mjs`, their tests and synthetic fixtures; `SECURITY-CHECK-CATALOG.json`; `PROJECT-AWARE-CHECK-MATRIX.md`; `PROJECT-INVENTORY-AUTOMATION.md`; this document | `SECURITY-BASELINE-CI.md` (records the approval), `DEPENDENCY-AUDIT-BASELINE.json`, `DEPENDENCY-RISK-REGISTER.md`, `PROJECT-SECURITY-PROFILE.md`, `PROJECT-LOCAL-EVIDENCE.json`, the project's own workflow file | `SECURITY-CHECK-CATALOG.md` (refers to La Segundita's dependency exceptions), `SECURITY-CHECK-RECOMMENDATIONS.md` (La Segundita example section), `SECURITY-RECOMMENDATION-SCENARIOS.md` (La Segundita results); `security-baseline.yml` can become a template only after project paths and approvals are removed |

Risk approvals, baselines and expiry dates are decisions by one owner for one project. A Skill may explain how to record them, but must never ship, reuse or infer them.

## Reusable Skill Knowledge

- **Invocation pattern:** run `inventory-project.mjs --root`, then `validate-check-catalog.mjs --root`, then `recommend-security-checks.mjs --root` and the formatter. Ship scripts, catalog and reusable references together so the default reference root resolves inside the Skill.
- **Support first:** read `projectSupport` before any other conclusion. If the framework is not `supported`, say so up front and treat every unmatched conditional check as a review item. If the package manager is not `npm`, do not cite the npm audit gate as coverage; propose the ecosystem's own audit for human review.
- **Separate what travels from what stays:** catalog, matrix and scripts are reusable; a project's evidence file, security profile, baselines and risk approvals stay in that project and are never copied between clients.
- **Wording:** never call a project "secure", "compliant", "passed" or "clean" from these reports. Use "recommended", "needs human review", "not indicated within inspected scope (supported project only)", and name the limits.
- **Approval stops:** adding a framework to the supported list, changing the catalog, accepting a risk, changing CI enforcement, or touching secrets, deployments or production data requires explicit human approval. Treat any new unsupported framework as a request for a future phase, not as something to infer.
- **Tests as specification:** `scripts/security/portability.test.mjs` defines the expected behavior for each support state, invalid inputs and incomplete scans; extend it before extending support.
