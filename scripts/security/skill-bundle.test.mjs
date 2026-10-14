import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SKILL_DIR, checkBundle, scriptClosure } from './build-skill-bundle.mjs';

// Phase 4C.1: the Skill candidate must match its tested sources, must carry none of this repository's client data,
// and must pass its own suite when copied outside the repository.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const skill = join(root, SKILL_DIR);
const files = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name));

test('Skill bundle is in sync with the framework sources', () => {
  assert.deepEqual(checkBundle(), []);
  assert.deepEqual(scriptClosure(), ['assess-risk-renewal.mjs', 'check-dependency-audit.mjs', 'format-project-inventory.mjs',
    'format-security-recommendations.mjs', 'inventory-project.mjs', 'recommend-security-checks.mjs', 'security-cli.mjs',
    'validate-approval-policy.mjs', 'validate-check-catalog.mjs', 'validate-client-records.mjs']);
});

test("Skill contains none of this project's approvals, findings, dates or approver text", () => {
  const baseline = JSON.parse(readFileSync(join(root, 'docs/security/DEPENDENCY-AUDIT-BASELINE.json'), 'utf8'));
  const register = readFileSync(join(root, 'docs/security/DEPENDENCY-RISK-REGISTER.md'), 'utf8');
  const forbidden = new Set([...baseline.findings.map(item => item.id), ...register.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/g),
    baseline.approval.reviewer, baseline.approval.approvedOn, baseline.approval.expiresOn, baseline.reviewBy, baseline.verifiedOn]);
  for (const path of files(skill)) {
    const text = readFileSync(path, 'utf8');
    for (const value of forbidden) assert.ok(!text.includes(value), `${relative(root, path)} contains project value ${value}`);
  }
});

test('drift is detected: changed, missing and unexpected files fail the check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitanova-skill-drift-'));
  try {
    cpSync(skill, dir, { recursive: true });
    assert.deepEqual(checkBundle(dir), []);
    writeFileSync(join(dir, 'scripts/security/inventory-project.mjs'), '// tampered\n');
    writeFileSync(join(dir, 'docs/security/DEPENDENCY-AUDIT-BASELINE.json'), '{}');
    rmSync(join(dir, 'docs/security/SECURITY-CHECK-CATALOG.json'));
    const problems = checkBundle(dir).join('\n');
    assert.match(problems, /out of date scripts\/security\/inventory-project\.mjs/);
    assert.match(problems, /unexpected file docs\/security\/DEPENDENCY-AUDIT-BASELINE\.json/);
    assert.match(problems, /missing docs\/security\/SECURITY-CHECK-CATALOG\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the Skill copied outside this repository passes its own synthetic suite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitanova-skill-install-'));
  try {
    const installed = join(dir, 'vitanova-security');
    cpSync(skill, installed, { recursive: true });
    assert.ok(relative(root, installed).startsWith('..'), 'copy must be outside the repository');
    // A nested test run must not inherit this runner's reporting channel.
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', join(installed, 'tests/skill.test.mjs')], { cwd: dir, encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stdout.slice(-2000) + result.stderr.slice(-2000));
    assert.match(result.stdout, /# fail 0/);
    assert.ok(Number(/# pass (\d+)/.exec(result.stdout)[1]) >= 90);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
