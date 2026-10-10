# Dependency risk register — La Segundita

<!-- risk-register-schema: 1; one record per GHSA heading; status vocabulary: open, mitigated, accepted-temporarily, resolved -->

**Reviewed:** 2026-10-09

**Owner for decisions:** VitaNova Creations / project owner

**Scope:** Phase 2C.3 recorded the checked-in lockfile at `2160c9e`. Phase 2C.5 patched the lockfile at `c10d1d4`. Phase 3A adds a proposed automated audit baseline. No production change is verified by this register.

**Decision state:** Five `js-yaml` advisories are **resolved** in the tested local lockfile by the `3.15.2` override. Three advisories remain **open**; none is formally accepted. Revisit open risks by **2026-11-09**, and sooner on the triggers below.

**Phase 3A CI proposal:** A fresh 2026-10-09 audit again found 17 flagged package entries from these same three source IDs. `DEPENDENCY-AUDIT-BASELINE.json` lists their exact installed copies. Its approval status is **pending**; the CI audit job fails on these baseline findings until the owner records an explicit, time-limited approval. New or worsened findings fail independently. This proposed baseline does not change the open status of any record below.

## Baseline and interpretation

The Phase 2C.3 baseline `npm audit --json` reported **17 flagged package entries** (8 high, 9 moderate), arising from **8 distinct advisory IDs**. After the Phase 2C.5 override, a fresh audit reports **17 flagged package entries** (7 high, 10 moderate) from **3 distinct advisory IDs**: `braces`, `sprintf-js`, and `uuid`. The five `js-yaml` IDs disappeared and no new ID appeared. The package-entry count did not fall because `js-yaml` still inherits an `argparse → sprintf-js` warning. None of the eight original advisory sources is a direct dependency. `sanity@6.18.0` and `next-sanity@13.3.4` are direct dependencies that inherit warnings from the Sanity CLI tree. A parent warning is not another independent vulnerability. npm's proposed major downgrades are not approved or established as safe fixes for this Next.js 16 / Sanity 6 app.

The prior `smol-toml` override remains present: `@vercel/frameworks` resolves `smol-toml@1.9.1`. Commit `2160c9e` contains that earlier change. Phase 2C.5 adds only a parent-scoped `js-yaml@3.15.2` override beneath `@vercel/frameworks`. **Deployment and live authenticated Studio publishing after these dependency changes remain unverified.** Audit results describe the local lockfile, not production.

### Application context and reachability evidence

This is a public bilingual marketing site with an embedded Sanity Studio, a tokenless read-only Sanity content fetch, and one signed Sanity revalidation webhook. It has no checkout, public accounts, or visitor-submitted YAML/glob/format-string input. The affected dependency paths are under `sanity → @sanity/cli`; although installed through a production dependency, they appear oriented to CLI, code generation, and framework configuration work. `@vercel/frameworks/dist/read-config-file.js` calls `js-yaml.safeLoad` on local YAML configuration in its Hugo and Jekyll helpers; this Next.js repository has no tracked YAML configuration. `typeid-js/dist/index.mjs` imports `uuid` `v7` and `stringify`, whereas its advisory concerns `v3`/`v5`/`v6` with output buffers. A prior bundle string scan found no `js-yaml`, `sprintf-js`, or `typeid-js` package names; this does **not prove** absence from every served bundle or build/install/CLI path. Phase 2C.5 did perform an isolated clean install, build, CLI checks, parser smoke tests, and local GET route checks. No live exploit test, complete call graph, authenticated publishing test, or production inspection was performed.

**Shared containment while open:** Keep development and build inputs trusted; do not run Sanity CLI commands or builds on unreviewed repositories/configuration files; retain the signed webhook and restrict who can edit deployment configuration. Re-audit before any dependency change. These measures reduce plausible exposure but are not patches.

### Advisory index

| Advisory ID | Source package installed | Advisory severity | Project priority | Status |
| --- | --- | --- | --- | --- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces@3.0.3` | High | Low | open |
| [GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m) | `js-yaml@3.15.2` | Moderate | Medium | resolved |
| [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) | `js-yaml@3.15.2` | Moderate | Medium | resolved |
| [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) | `js-yaml@3.15.2` | High | Medium | resolved |
| [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | `js-yaml@3.15.2` | High | Medium | resolved |
| [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | `js-yaml@3.15.2` | High | Medium | resolved |
| [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | `sprintf-js@1.0.3` | Moderate | Low | open |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | `uuid@10.0.0` | Moderate | Low | open |

All paths below start at the root project's direct `sanity@6.18.0` dependency unless stated otherwise. The five `js-yaml` records share one installed package and path; they remain separate records because they are separate advisories.

## Advisory records

### GHSA-vfj7-8cjw-p6xm — `braces` recursion exhaustion

- **Affected/installed:** `<=3.0.3`; installed `3.0.3`. **Advisory severity:** High. **Project priority:** Low. **Status:** open. **Confidence:** Medium.
- **Exact transitive paths:** `sanity@6.18.0 → @sanity/cli@8.14.0 → @sanity/codegen@8.2.0 → chokidar@3.6.0 → braces@3.0.3`; and `@sanity/codegen → globby@11.1.0 → fast-glob@3.3.3 → micromatch@4.0.8 → braces@3.0.3`.
- **Impact and preconditions:** A deeply nested, attacker-controlled brace pattern can exhaust the Node.js stack and stop a process. The site does not accept visitor-supplied glob patterns. Exposure would require an affected codegen/watch/tooling path to process such a pattern from untrusted input; that call path has not been demonstrated here.
- **Fix/containment:** The advisory lists no patched `braces` version. Avoid untrusted glob patterns in local/CI tooling; watch for upstream Sanity/codegen or `braces` fixes. npm's proposed Sanity major downgrade is not a validated remedy for this application.
- **Phase 2C.5 outcome:** Deferred. npm still lists `3.0.3` as the latest release and the advisory lists no patched version. No compatible fix was available to test. Exposure remains a tooling/glob-pattern scenario with medium confidence; inspect again when an upstream release or input path changes.
- **Owner review proposal:** Consider temporary acceptance of this low-context-priority CLI risk until an upstream compatible fix exists. Re-review if a patched release appears, codegen/watch workflows change, untrusted patterns become possible, or an exploit is reported in a similar toolchain; otherwise monthly.

### GHSA-mh29-5h37-fv8m — `js-yaml` prototype pollution through merge keys

- **Affected/installed:** `<3.14.2`; previously `3.13.1`, now `3.15.2`. **Advisory severity:** Moderate. **Project priority:** Medium before the fix. **Status:** resolved (local lockfile). **Confidence:** High in version/audit resolution; medium in full integration compatibility.
- **Exact transitive path:** `sanity@6.18.0 → @sanity/cli@8.14.0 → @vercel/frameworks@3.29.0 → js-yaml@3.15.2`.
- **Impact and preconditions:** Parsing crafted YAML with merge keys can modify the prototype of the parsed result. A vulnerable YAML parser must read attacker-controlled content; the observed framework helper reads local YAML configuration, so the relevant scenario is untrusted repository/build configuration, not a public website request.
- **Phase 2C.5 outcome:** Fixed in the local lockfile by the parent-scoped `3.15.2` override; this ID disappeared from the post-change audit. The framework's `safeLoad` API passed representative YAML parsing. Keep build configuration trusted. Re-review if the override is removed, framework pin changes, or a parser regression is found.

### GHSA-h67p-54hq-rp68 — `js-yaml` repeated-alias merge CPU exhaustion

- **Affected/installed:** `<3.15.0`; previously `3.13.1`, now `3.15.2`. **Advisory severity:** Moderate. **Project priority:** Medium before the fix. **Status:** resolved (local lockfile). **Confidence:** High in version/audit resolution; medium in full integration compatibility.
- **Exact transitive path:** `sanity → @sanity/cli → @vercel/frameworks → js-yaml@3.15.2`, with versions as above.
- **Impact and preconditions:** A YAML merge sequence that repeats aliases can make parse time grow quadratically and delay or exhaust a Node.js build/tooling process. It requires the framework helper or another parser path to read crafted YAML; no visitor-facing YAML input is present.
- **Phase 2C.5 outcome:** Fixed locally by `3.15.2`; this ID disappeared from the audit. The new parser enforces merge-work limits, so unusual large YAML may parse differently. Re-review if a configuration hits a merge limit, the override is removed, or an upstream replacement appears.

### GHSA-52cp-r559-cp3m — `js-yaml` merge-chain CPU exhaustion

- **Affected/installed:** `>=3.0.0 <3.15.0`; previously `3.13.1`, now `3.15.2`. **Advisory severity:** High. **Project priority:** Medium before the fix. **Status:** resolved (local lockfile). **Confidence:** High in version/audit resolution; medium in full integration compatibility.
- **Exact transitive path:** `sanity → @sanity/cli → @vercel/frameworks → js-yaml@3.15.2`, with versions as above.
- **Impact and preconditions:** Chained YAML mappings that merge their predecessors can cause quadratic CPU work. Exploitation here requires untrusted YAML to be parsed during tooling/build work; the public app has no such request path identified.
- **Phase 2C.5 outcome:** Fixed locally by `3.15.2`; this ID disappeared from the audit. Restrict build configuration to reviewed sources. Re-review if the override is removed, merge-limit compatibility changes, or new parser exposure appears.

### GHSA-5p4m-2wfm-xmqj — `js-yaml` `!!omap` CPU exhaustion

- **Affected/installed:** `>=3.0.0 <3.15.1`; previously `3.13.1`, now `3.15.2`. **Advisory severity:** High. **Project priority:** Medium before the fix. **Status:** resolved (local lockfile). **Confidence:** High in version/audit resolution; medium in full integration compatibility.
- **Exact transitive path:** `sanity → @sanity/cli → @vercel/frameworks → js-yaml@3.15.2`, with versions as above.
- **Impact and preconditions:** A crafted `!!omap` sequence can require quadratic CPU time under the default YAML schema. It matters if untrusted YAML reaches the local framework configuration parser or another build/tooling parser; no public input route was found.
- **Phase 2C.5 outcome:** Fixed locally by `3.15.2`; this ID disappeared from the audit. Re-review if the override is removed, YAML configuration changes, or new parser exposure appears.

### GHSA-2883-xcg3-v3hh — `js-yaml` empty merge-source CPU exhaustion

- **Affected/installed:** `>=3.0.0 <3.15.2`; previously `3.13.1`, now `3.15.2`. **Advisory severity:** High. **Project priority:** Medium before the fix. **Status:** resolved (local lockfile). **Confidence:** High in version/audit resolution; medium in full integration compatibility.
- **Exact transitive path:** `sanity → @sanity/cli → @vercel/frameworks → js-yaml@3.15.2`, with versions as above.
- **Impact and preconditions:** Many empty YAML merge sources can consume CPU while bypassing the parser's merge-key limit. The practical scenario again requires crafted YAML in local/CI configuration or another parser input, not merely a visit to this site.
- **Phase 2C.5 outcome:** Fixed locally by `3.15.2`; all five `js-yaml` IDs disappeared. The `js-yaml` package entry remains flagged through `argparse → sprintf-js`, a separate advisory. Re-review if the override is removed, unusual YAML hits a new merge limit, or upstream fixes replace the override.

### GHSA-hp3w-g68c-fv3c — `sprintf-js` precision-triggered exception

- **Affected/installed:** `<=1.1.3`; installed `1.0.3`. **Advisory severity:** Moderate. **Project priority:** Low. **Status:** open. **Confidence:** Medium.
- **Exact transitive path:** `sanity@6.18.0 → @sanity/cli@8.14.0 → @vercel/frameworks@3.29.0 → js-yaml@3.15.2 → argparse@1.0.10 → sprintf-js@1.0.3`.
- **Impact and preconditions:** An attacker-controlled format string with excessive precision can cause an uncaught `RangeError` and abort the calling operation. `argparse` uses `sprintf` to format CLI help and errors; no visitor-controlled format string or public request path was identified. Whether its CLI format inputs can be influenced by an untrusted configuration needs deeper call-path analysis.
- **Fix/containment:** The advisory lists no patched `sprintf-js` release. Keep CLI/configuration input trusted; monitor `argparse`, `js-yaml`, and framework updates. npm's proposed Sanity downgrade is not validated.
- **Phase 2C.5 outcome:** Deferred. npm still lists `1.1.3` as latest and the advisory lists no patched release; `argparse` still resolves `1.0.3`. No compatible fix was available to test. Re-review on a patched release, upstream replacement, or newly reachable format-string input.
- **Owner review proposal:** Consider temporary acceptance at low contextual priority. Re-review if CLI format strings become untrusted, a patch or upstream replacement appears, exploit reports emerge, or monthly.

### GHSA-w5hq-g745-h8pq — `uuid` output-buffer bounds

- **Affected/installed:** `<11.1.1`; installed vulnerable copy `10.0.0`. Other installed copies (`11.1.1`, `14.0.2`) are outside this advisory's affected ranges. **Advisory severity:** Moderate. **Project priority:** Low. **Status:** open. **Confidence:** Medium-high for the observed `typeid-js` imports; lower for any uninspected dynamic use.
- **Exact transitive path:** `sanity@6.18.0 → @sanity/cli@8.14.0 → typeid-js@1.2.0 → uuid@10.0.0`.
- **Impact and preconditions:** `uuid` `v3()`, `v5()`, or `v6()` with an undersized caller-supplied output buffer or oversized offset can silently write only part of the UUID. `typeid-js` imports `v7` and `stringify`, not these affected methods in the inspected distribution. A harmful path would require another use of the vulnerable APIs with a caller-controlled buffer; none was found in this dependency path.
- **Fix/containment:** Patched in `uuid@11.1.1` (11.x), but `typeid-js@1.2.0` requests `^10.0.0`; forcing 11.x crosses its declared major range and needs testing or an upstream update. Avoid relying on the npm-suggested Sanity major downgrade.
- **Phase 2C.5 outcome:** Deferred. `typeid-js@1.2.0` is its latest release and still declares `uuid@^10.0.0`. UUID 11 changes `v7` behavior, which `typeid-js` uses, so a major override was not included in this low-risk batch. Re-review after upstream support or a separately approved compatibility exercise.
- **Owner review proposal:** Consider temporary acceptance at low contextual priority. Re-review if `typeid-js` or CLI begins using `v3`/`v5`/`v6`, an upstream compatible fix appears, architecture changes, exploit reports emerge, or monthly.

## Owner decision and follow-up

Review the five locally resolved `js-yaml` records and the clean-install verification before deciding whether to deploy this patch. The `braces`, `sprintf-js`, and `uuid` records remain open until the owner accepts a time-bounded risk or a compatible fix is validated. No accepted-risk decision, production deployment, authenticated publishing result, or legal compliance claim is implied here. If acceptance is granted later, record the approver, decision date, expiry/revisit date, rationale, and compensating controls in each record before changing its status to `accepted-temporarily`.

If deployment is authorized in a later phase, verify the deployed build and an authenticated Studio publish and signed webhook round trip in the proper environment. Review upstream `braces` and `sprintf-js` releases for patches, and seek `typeid-js` support for a patched `uuid` major before considering that override. These are follow-up recommendations, not actions performed in Phase 2C.5.

## Future VitaNova Automation Rules

1. Parse `npm audit --json` by each object in `vulnerabilities[*].via`, key records by GHSA ID, and compare IDs, affected installed versions, and severity against a reviewed baseline. Report new IDs, worsened severity, changed paths, and resolved IDs separately. Parent package warnings should point to the root advisory rather than create duplicate risks.
2. Inventory routes, authentication, APIs, CMS, data flows, deployment, payments, and sensitive data before selecting checks. This marketing site needs a different review from an authenticated SaaS app, commerce site, or regulated-data service.
3. Automate repeatable evidence collection such as dependency audit, secret scanning, static analysis, typecheck, build, tests, and diff checks. Human judgment remains necessary for reachability, exploit preconditions, business impact, temporary acceptance, and applicable legal obligations; automated checks cannot certify compliance.
4. Gate overrides, major upgrades or downgrades, authentication or secret changes, production deployments, and legal/compliance claims on explicit human approval after presenting a focused, testable proposal.
5. Re-review accepted risks monthly, on dependency or architecture changes, when an exploit becomes public, or when a previously unreachable input becomes reachable. Expired accepted risks return to `open` until reviewed again.
6. For each proposed dependency fix, back up manifests, change one dependency path, inspect the exact lockfile diff, compare audit IDs and affected installed copies, and run consumer-specific compatibility checks. Roll back only the failed candidate; retain independently verified fixes.
7. Retain dated baseline and final audit JSON, dependency paths, advisory links and ranges, exact version/diff evidence, command results, unperformed checks, and owner decisions. Keep secrets and production data out of retained artifacts. Distinguish local verification from deployed behavior.

## Evidence and limits

- Read-only commands on 2026-10-09: `git status --short`, `git branch --show-current`, `git log -3 --oneline`, `npm audit --json`, `npm ls --all --json`, `npm explain braces js-yaml sprintf-js uuid`, and lockfile/package inspection. The initial sandboxed audit could not resolve the npm registry; a read-only retry with network access succeeded and is the baseline above.
- Advisory descriptions and patch floors were checked against the eight linked GitHub Advisory Database records. The local `npm audit` response supplied the exact current advisory set and severity values; the lockfile and `npm explain` supplied installed versions and paths.
- `npm ls --all` reported two unrelated extraneous local packages (`@emnapi/runtime` and `@img/sharp-wasm32`); they are not in the lockfile risk paths and did not alter the eight-advisory baseline. The advisory set can change as the registry is updated; re-run the audit on the next review date.
- Phase 2C.5 baseline and final audit JSON were saved outside the repository at `/tmp/la-segundita-phase-2c5-baseline.json` and `/tmp/la-segundita-phase-2c5-post-yaml.json`. The final audit removed the five `js-yaml` IDs; the remaining three IDs and installed copies are shown above. `npm view` confirmed no patched `braces` or `sprintf-js` release and that `typeid-js@1.2.0` still requests `uuid@^10.0.0`.
- The sole kept dependency change was `@vercel/frameworks`-scoped `js-yaml@3.15.2`, installed through a lockfile-only update. The lockfile diff changes the root `node_modules/js-yaml` version, tarball URL, and integrity; the prior `smol-toml@1.9.1` override remains. No candidate fix was installed and rolled back.
- An isolated `npm ci` installed 941 packages. `npm ls` confirmed the resolved tree; `npm run typecheck`, `npm run build`, `sanity --version`, `sanity schemas validate --level error` (zero errors), and `sanity migrations list` passed. Direct `@vercel/frameworks` `readConfigFile` calls parsed representative Hugo `config.yaml` and Jekyll `_config.yml` content, including a merge alias. A locally started Next server returned HTTP 200 for `/`, `/es/`, `/our-story/`, `/es/our-story/`, `/studio/`, `/robots.txt`, and `/sitemap.xml`. These checks did not exercise authenticated publishing, production deployment, or the live webhook.
