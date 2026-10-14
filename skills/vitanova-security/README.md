# VitaNova security Skill: V1 candidate

A portable, read-only-first Claude Code Skill packaged from VitaNova's tested security framework. It detects a project's framework and package manager, validates the security check catalog, recommends checks for **human review**, validates client security records, and drafts risk-renewal packets marked `DRAFT / NOT AUTHORIZED`. It never approves, renews, deploys or changes anything. See `SKILL.md` for the workflow Claude follows.

**Status: candidate.** It has not yet been piloted on a second real project. Treat its output as review input, never as a security result.

## Verify (one command)

From anywhere, with Node 22 (the tested version):

```sh
node --test path/to/vitanova-security/tests/skill.test.mjs
```

This checks:
- **Integrity:** file hashes against `MANIFEST.json`, and that no unlisted files ship.
- **Dependency closure:** the bundled scripts import only bundled siblings and Node built-ins.
- **Privacy:** no client data, approvals, emails or credentials ship.
- **Outside-repository runs against synthetic projects:**
  - a supported Next.js and npm site
  - an unsupported SvelteKit and pnpm site, and a static site with no `package.json`
  - a project with no approval records
- **Safety:**
  - hostile file names are escaped in Markdown
  - draft renewal packets are never usable for authorization
  - the bundled policy is schema 2
- **Bundled tests:** the client-records tests.

It needs no network and writes only to temporary directories.

## Install (local, manual)

Nothing installs automatically. Choose one, with the owner's approval:

- **Per project:** copy the folder to `<project>/.claude/skills/vitanova-security/`.
- **For your user:** copy it to `~/.claude/skills/vitanova-security/`. This makes the Skill available in every project, so only do it once the candidate is approved.

Copy the folder rather than symlinking it, so the manifest check stays meaningful, then run the verification command from the installed location. Claude Code discovers skills from these folders; check your installed version's documentation if discovery differs.

## Use

Ask Claude, for example: *"Use the vitanova-security skill to review ../client-site (read-only)."* Claude follows `SKILL.md`:

1. Inventory the project.
2. Validate the catalog.
3. Recommend checks.
4. Present the human-review items, then stop.

Running the dependency gate, drafting a renewal packet and validating client records are optional steps, and Claude asks before each. You can run the same scripts by hand; every command takes the target as `--root`, and outputs go to stdout or a scratch directory, never into the target.

## Compatibility and the approval-policy schema v2 migration

| Contract | Version | Notes |
| --- | --- | --- |
| Approval policy (`SECURITY-APPROVAL-POLICY.json`) | **2** | Version 1 is rejected with an explicit message. To migrate a v1 copy, set `schemaVersion` to 2 and add these items, then re-run `validate-approval-policy.mjs`. |
| Client security records | 1 | Must reference policy v2; written against `vitanova-security-approval-policy`. |
| Check catalog, inventory | 1 | Phase 4A additions such as `support` are optional fields within v1. Catalog `executionStatus` means toolkit capability only. |
| Recommendation report | 1 | Phase 4C.2 adds optional per-check `projectStatus` (toolkit capability, plus configuration, execution and result for this project, which are `not_verified` by default). Older reports without it still format. |
| Dependency baseline | 1 | Same contract as the dependency gate, including `pending` approvals. |
| Renewal packet | 1 | Output only; always `DRAFT / NOT AUTHORIZED`. |

To migrate a v1 policy copy, add:
- the `client_account_access_change` and `delegation_not_valid` conditions
- the account-access and out-of-scope escalations on dependency and authentication actions
- the `delegation_not_valid` escalation on the three delegable actions

All 17 action IDs and all field names are unchanged. Records or tools pinned to policy v1 must be updated together with the policy.

## Supported ecosystems

- **Frameworks:** Next.js, React with Vite and Astro are `supported`. Anything else is `partial`, `unsupported` or `unknown`, which keeps negative findings uncertain and needs human review.
- **Dependency audit:** **npm only.** pnpm, yarn, bun and deno projects are reported as not covered.

## What this Skill does not do (limitations)

- It does not prove security or compliance, inspect live services, deployed headers, CMS or hosting settings, or verify identities, signatures or authority.
- Source scanning is bounded and allowlisted:
  - at most 400 files, 2,000 entries, depth 8, and 64 KiB per file
  - it skips dotfiles and `.vue` or `.svelte` contents
  - it does not scan monorepo workspaces
- Static sites without `package.json` are `unknown`.
- Dependency auditing needs `npm audit --json`, which uses the network and is run only when the user agrees. Other package managers have no adapter yet.
- Renewal assessment covers npm baselines (schema 1) and registers that declare `risk-register-schema: 1` only.
- The Skill contains no client records. Creating a project's baseline, records or approvals is a human decision, stored privately.
- It has been tested on synthetic projects and on the framework's origin project only.

## Maintaining the bundle

The Skill is generated from the framework repository's tested sources, so do not edit the copied files here. From the framework root:

```sh
node scripts/security/build-skill-bundle.mjs --check   # fails if the bundle drifted from its sources
node scripts/security/build-skill-bundle.mjs --write   # regenerate after reviewing source changes
```

The builder:
- copies the scripts' full import closure, the catalog, the policy, the templates and the reference documents
- strips project-specific sections with named rules that must each match exactly once
- never copies baselines, registers, project evidence, workflows or client records

`SKILL.md`, `README.md` and `tests/skill.test.mjs` are written by hand; run `--write` after editing them so the manifest hashes update.
