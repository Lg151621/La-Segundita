import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Standalone verification for the VitaNova security Skill candidate. It runs from wherever the Skill folder is
// copied, uses only synthetic projects built in temporary directories, needs no network, and never reads a client's
// repository. Run: node --test "$SKILL_DIR/tests/skill.test.mjs"
const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(SKILL_DIR, 'MANIFEST.json'), 'utf8'));
const run = (script, args, cwd) => spawnSync(process.execPath, [join(SKILL_DIR, 'scripts/security', script), ...args], { cwd, encoding: 'utf8' });

// The bundled client-records tests run as part of this suite.
await import('../scripts/security/validate-client-records.test.mjs');

function listFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), `symlink in Skill: ${relative(SKILL_DIR, path)}`);
    return stat.isDirectory() ? listFiles(path) : [relative(SKILL_DIR, path).split(sep).join('/')];
  });
}
function project(files, body) {
  const dir = mkdtempSync(join(tmpdir(), 'vitanova-skill-target-'));
  try {
    for (const [name, value] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
    }
    return body(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const snapshot = dir => Object.fromEntries(readdirSync(dir, { recursive: true }).sort().map(name => {
  const path = join(dir, name);
  return [name, lstatSync(path).isFile() ? readFileSync(path, 'utf8') : 'dir'];
}));
// Runs the documented workflow (steps 1 to 3) from an unrelated working directory and checks the target is untouched.
function review(dir) {
  const cwd = mkdtempSync(join(tmpdir(), 'vitanova-skill-cwd-'));
  try {
    const before = snapshot(dir);
    const inventory = run('inventory-project.mjs', ['--root', dir], cwd);
    assert.equal(inventory.status, 0, inventory.stderr);
    writeFileSync(join(cwd, 'inventory.json'), inventory.stdout);
    const inventorySummary = run('format-project-inventory.mjs', [join(cwd, 'inventory.json')], cwd);
    assert.equal(inventorySummary.status, 0, inventorySummary.stderr);
    const catalog = run('validate-check-catalog.mjs', ['--root', dir], cwd);
    assert.equal(catalog.status, 0, catalog.stderr);
    const recommend = run('recommend-security-checks.mjs', ['--root', dir], cwd);
    assert.equal(recommend.status, 0, recommend.stderr);
    writeFileSync(join(cwd, 'recommendations.json'), recommend.stdout);
    const summary = run('format-security-recommendations.mjs', [join(cwd, 'recommendations.json')], cwd);
    assert.equal(summary.status, 0, summary.stderr);
    assert.deepEqual(snapshot(dir), before, 'the review must not write into the target project');
    for (const output of [inventory.stdout, recommend.stdout, inventorySummary.stdout, summary.stdout]) {
      assert.ok(!output.includes(dir) && !output.includes(SKILL_DIR), 'outputs must not contain local absolute paths');
    }
    return { inventory: JSON.parse(inventory.stdout), report: JSON.parse(recommend.stdout), text: inventorySummary.stdout + summary.stdout };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
const byId = report => Object.fromEntries(report.recommendations.map(check => [check.id, check]));
const DISPOSITIONS = ['recommended', 'needs_human_review', 'not_currently_indicated'];
const NPM_LOCK = { name: 'synthetic-site', lockfileVersion: 3, requires: true, packages: { '': { name: 'synthetic-site' } } };

const supportedSite = {
  'package.json': JSON.stringify({ private: true, dependencies: { next: '16.0.0', react: '19.0.0', 'react-dom': '19.0.0' } }),
  'package-lock.json': NPM_LOCK,
  'next.config.ts': 'export default {}',
  'app/page.tsx': 'export default function Page() { return <form method="post"><input name="email" /></form> }',
  'app/api/contact/route.ts': 'export async function POST() { return new Response(null, { status: 204 }) }',
};

test('bundle integrity: every file is listed with a matching hash and nothing else ships', () => {
  assert.equal(manifest.kind, 'vitanova-security-skill-manifest');
  assert.equal(manifest.contracts.approvalPolicySchemaVersion, 2);
  assert.deepEqual(manifest.supportedPackageManagersForDependencyAudit, ['npm']);
  const listed = new Set(manifest.files.map(item => item.path));
  for (const item of manifest.files) {
    const hash = createHash('sha256').update(readFileSync(join(SKILL_DIR, item.path))).digest('hex');
    assert.equal(hash, item.sha256, `hash mismatch for ${item.path}`);
  }
  for (const path of listFiles(SKILL_DIR)) if (path !== 'MANIFEST.json') assert.ok(listed.has(path), `unlisted file ${path}`);
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: vitanova-security\ndescription: .+\n---\n/);
  assert.doesNotMatch(skill.split('---')[1], /allowed-tools/, 'the Skill must not pre-authorize tools');
});

test('dependency closure: bundled scripts import only bundled siblings and Node built-ins', () => {
  for (const path of [...manifest.entrypoints, ...manifest.bundledScripts]) assert.ok(existsSync(join(SKILL_DIR, path)), path);
  for (const path of manifest.bundledScripts) {
    const source = readFileSync(join(SKILL_DIR, path), 'utf8');
    for (const [, spec] of source.matchAll(/^\s*import\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (spec.startsWith('node:')) continue;
      assert.ok(manifest.bundledScripts.includes(join(dirname(path), spec).split(sep).join('/')), `${path} imports unbundled ${spec}`);
    }
    assert.doesNotMatch(source, /\bfetch\(|node:https?['"]|child_process/, `${path} must not use the network or spawn processes`);
  }
});

test('no client data, approvals, secrets or private records ship in the Skill', () => {
  const forbiddenNames = /(^|\/)(DEPENDENCY-AUDIT-BASELINE\.json|DEPENDENCY-RISK-REGISTER\.md|PROJECT-LOCAL-EVIDENCE\.json|PROJECT-SECURITY-PROFILE\.md|SECURITY-BASELINE-CI\.md|\.env[^/]*|\.github)(\/|$)/;
  const FAKE_TEST_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
  for (const path of listFiles(SKILL_DIR)) {
    assert.doesNotMatch(path, forbiddenNames, path);
    // Lines that are themselves negative assertions (guards like this one) may name what they forbid.
    const text = readFileSync(join(SKILL_DIR, path), 'utf8').split('\n').filter(line => !line.includes('doesNotMatch(')).join('\n');
    assert.doesNotMatch(text, /segundita|blythe|VitaNova Creations/i, path);
    assert.doesNotMatch(text, /\bGHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/, `${path} must not name a real advisory`);
    assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@(?!example\.(?:com|invalid)\b)[A-Za-z0-9-]+\.[a-z]{2,}/, `${path} must not contain an email address`);
    assert.doesNotMatch(text.replaceAll(FAKE_TEST_TOKEN, ''), /AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk_live_|-----BEGIN [A-Z ]*PRIVATE KEY/, `${path} must not contain credentials`);
  }
  const records = JSON.parse(readFileSync(join(SKILL_DIR, 'docs/security/templates/CLIENT-SECURITY-RECORDS.template.json'), 'utf8'));
  assert.equal(records.recordStatus, 'template');
  assert.equal(records.storage.location, 'private_access_controlled');
});

test('(a) supported synthetic website: detection, catalog validation and recommendations from outside the repo', () => project(supportedSite, dir => {
  const { inventory, report, text } = review(dir);
  assert.equal(inventory.support.framework.status, 'supported');
  assert.equal(inventory.support.framework.id, 'nextjs');
  assert.equal(inventory.support.packageManager.id, 'npm');
  assert.equal(report.projectSupport.nonDetectionReliable, true);
  const checks = byId(report);
  assert.ok(report.recommendations.every(check => DISPOSITIONS.includes(check.disposition)));
  assert.equal(checks.form_validation_abuse_privacy_review.disposition, 'recommended');
  assert.equal(checks.api_input_validation_review.disposition, 'recommended');
  assert.equal(checks.payment_flow_pci_scope_review.disposition, 'not_currently_indicated');
  assert.doesNotMatch(text, /\b(?:is|are) (?:secure|compliant)\b|\bcertified\b/i, 'reports must never claim security or compliance');
  // No CI, audit or secret-scan result exists here: toolkit capability must not read as project setup, a run or a pass.
  for (const id of ['dependency_scan', 'secret_scan']) {
    assert.deepEqual(checks[id].projectStatus, { toolkitCapability: 'automatable_with_toolkit', configuration: 'not_verified', execution: 'not_verified', result: 'not_verified' });
    assert.doesNotMatch(report.humanConfirmation.find(item => item.checkId === id).reason, /actual check result/);
  }
  assert.ok(report.recommendations.every(check => check.projectStatus.execution === 'not_verified' && check.projectStatus.result === 'not_verified'));
  assert.match(text, /Status: toolkit can automate; project setup not verified; run and result not verified\./);
  assert.match(text, /no check below is shown as configured, run, or passed in this project/);
}));

test('(b) unsupported or incomplete websites keep negatives uncertain and npm-only audit coverage explicit', () => {
  project({
    'package.json': JSON.stringify({ private: true, devDependencies: { '@sveltejs/kit': '2.0.0', svelte: '5.0.0' } }),
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    'src/routes/+page.svelte': '<form method="post"><input name="email" /></form>',
  }, dir => {
    const { inventory, report } = review(dir);
    assert.equal(inventory.support.framework.status, 'unsupported');
    assert.equal(inventory.support.packageManager.status, 'unsupported');
    assert.equal(report.projectSupport.nonDetectionReliable, false);
    const checks = byId(report);
    assert.ok(report.recommendations.filter(check => check.matchMode === 'any_signal').every(check => check.disposition !== 'not_currently_indicated'));
    assert.ok(checks.dependency_scan.supportNotes.length > 0, 'dependency_scan must say npm automation does not cover pnpm');
    assert.equal(checks.dependency_scan.projectStatus.toolkitCapability, 'toolkit_does_not_cover_this_project');
  });
  project({ 'index.html': '<!doctype html><title>Static</title><form><input name="q"></form>' }, dir => {
    const { inventory, report } = review(dir);
    assert.equal(inventory.support.framework.status, 'unknown');
    assert.equal(report.projectSupport.nonDetectionReliable, false);
    assert.ok(report.recommendations.filter(check => check.matchMode === 'any_signal').every(check => check.disposition !== 'not_currently_indicated'));
  });
});

test('(c) a project with no approval records: nothing is assumed, created or accepted', () => project(supportedSite, dir => {
  const cwd = tmpdir();
  const before = snapshot(dir);
  const renewal = run('assess-risk-renewal.mjs', ['--root', dir, '--project-id', 'synthetic-site'], cwd);
  assert.equal(renewal.status, 1);
  assert.match(renewal.stderr, /Baseline must be an existing regular file inside --root/);
  const gate = run('check-dependency-audit.mjs', [join(dir, 'missing-audit.json'), join(dir, 'docs/security/DEPENDENCY-AUDIT-BASELINE.json'), join(dir, 'package-lock.json')], cwd);
  assert.equal(gate.status, 1, 'the dependency gate fails closed without an audit and baseline');
  const template = run('validate-client-records.mjs', ['--template', '--json'], cwd);
  assert.equal(template.status, 0, template.stderr);
  const result = JSON.parse(template.stdout);
  assert.equal(result.authorizationsGranted, 0);
  assert.equal(result.counts.usableForAuthorization, 0);
  assert.deepEqual(snapshot(dir), before, 'no baseline, record or evidence file may be created in the target');
}));

test('repository-controlled text is escaped in Markdown summaries', () => project({
  ...supportedSite,
  'app/api/a<img src=x onerror=alert(1)>|b/route.ts': 'export async function GET() { return new Response("ok") }',
}, dir => {
  const { inventory, text } = review(dir);
  assert.ok(inventory.signals.find(signal => signal.id === 'api_routes').evidence.some(path => path.includes('<img')), 'synthetic hostile path is detected');
  assert.doesNotMatch(text, /<img/, 'hostile path must be escaped');
}));

test('a draft renewal packet for a synthetic accepted risk is never usable for authorization', () => project({
  ...supportedSite,
  'package-lock.json': { ...NPM_LOCK, packages: { ...NPM_LOCK.packages, 'node_modules/example-glob': { version: '1.0.0' } } },
  'docs/security/DEPENDENCY-AUDIT-BASELINE.json': { schemaVersion: 1, reviewBy: '2026-04-30',
    approval: { status: 'approved', reviewer: 'Synthetic Approver', approvedOn: '2026-03-01', expiresOn: '2026-04-30' },
    findings: [{ id: 'GHSA-synthetic-0001', package: 'example-glob', severity: 'high', direct: false, consumers: ['example-cli'],
      instances: [{ path: 'node_modules/example-glob', version: '1.0.0', dev: false, optional: false }] }] },
  'audit.json': { auditReportVersion: 2, metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: { 'example-glob': { isDirect: false,
    nodes: ['node_modules/example-glob'], effects: ['example-cli'], via: [{ url: 'https://github.com/advisories/GHSA-synthetic-0001', severity: 'high' }] } } },
}, dir => {
  const cwd = tmpdir();
  const before = snapshot(dir);
  const gate = run('check-dependency-audit.mjs', [join(dir, 'audit.json'), join(dir, 'docs/security/DEPENDENCY-AUDIT-BASELINE.json'), join(dir, 'package-lock.json')], cwd);
  assert.match(gate.stdout + gate.stderr, /Dependency audit gate/);
  const packet = run('assess-risk-renewal.mjs', ['--root', dir, '--project-id', 'synthetic-site', '--audit', join(dir, 'audit.json'), '--as-of', '2026-04-25', '--json'], cwd);
  assert.equal(packet.status, 0, packet.stderr);
  const parsed = JSON.parse(packet.stdout);
  assert.equal(parsed.status, 'DRAFT / NOT AUTHORIZED');
  assert.equal(parsed.usableForAuthorization, false);
  assert.equal(parsed.reviewStatus, 'review_due_before_expiry');
  assert.doesNotMatch(packet.stdout, /Synthetic Approver/);
  assert.deepEqual(snapshot(dir), before);
}));

test('bundled catalog wording assumes no single stack; Sanity appears only as a stated detection limit', () => {
  const catalog = JSON.parse(readFileSync(join(SKILL_DIR, 'docs/security/SECURITY-CHECK-CATALOG.json'), 'utf8'));
  for (const check of catalog.checks) {
    for (const [field, value] of Object.entries(check)) {
      if (['id', 'match', 'provenance'].includes(field)) continue;
      for (const item of [value].flat().filter(entry => typeof entry === 'string')) {
        assert.doesNotMatch(item, /trufflehog|\bPR\b|next\.config\.ts|github|studio|vercel/i, `${check.id}.${field}`);
        if (/sanity/i.test(item)) assert.match(item, /recognizes Sanity only/, `${check.id}.${field}`);
      }
    }
  }
});

test('bundled approval policy is schema 2; a schema 1 policy is rejected with an upgrade message', () => {
  const ok = run('validate-approval-policy.mjs', [], tmpdir());
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /no approval is granted or recorded/);
  const dir = mkdtempSync(join(tmpdir(), 'vitanova-skill-policy-'));
  try {
    const old = JSON.parse(readFileSync(join(SKILL_DIR, 'docs/security/SECURITY-APPROVAL-POLICY.json'), 'utf8'));
    old.schemaVersion = 1;
    writeFileSync(join(dir, 'policy.json'), JSON.stringify(old));
    const rejected = run('validate-approval-policy.mjs', ['--policy', join(dir, 'policy.json')], dir);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /schemaVersion 1 is no longer supported/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
