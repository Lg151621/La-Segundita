import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { formatRecommendationSummary } from './format-security-recommendations.mjs';
import { inventoryProject } from './inventory-project.mjs';
import { recommendSecurityChecks } from './recommend-security-checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(readFileSync(join(root, 'docs/security/SECURITY-CHECK-CATALOG.json'), 'utf8'));
const fixture = name => join(root, 'scripts/security/fixtures/recommendations', name);
const reportFor = name => recommendSecurityChecks(inventoryProject(fixture(name)), catalog, root);
const copy = value => structuredClone(value);

test('renders real project counts, every stable ID, three distinct labels, and bounded source evidence', () => {
  const report = recommendSecurityChecks(inventoryProject(root), catalog, root);
  const summary = formatRecommendationSummary(report);
  assert.deepEqual(report.summary, { recommended: 11, needsHumanReview: 0,
    notCurrentlyIndicated: 4, total: 15 });
  for (const id of catalog.checks.map(check => check.id)) assert.ok(summary.includes(id.replaceAll('_', '&#95;')), id);
  for (const text of ['Recommended: **11**', 'Needs human review: **0**',
    'Not indicated within inspected scope: **4**', 'sanity.config.ts',
    'app/api/revalidate/route.ts', '**recommended**', '**not_currently_indicated**',
    'did not execute or pass checks', 'accept risk', 'determine legal compliance',
    'prove a feature absent']) assert.ok(summary.includes(text), text);
  assert.ok(!summary.includes('Risk accepted'));
  assert.ok(summary.length <= 16_000);
  assert.equal(summary, formatRecommendationSummary(report));
});

test('uncertain and incomplete inventories render human-review findings without failing', () => {
  const packageOnly = formatRecommendationSummary(reportFor('package-only-uncertain'));
  assert.ok(packageOnly.includes('Needs human review: **10**'));
  assert.ok(packageOnly.includes('incomplete; human review required'));
  assert.ok(packageOnly.includes('no&#95;source&#95;files'));
  assert.ok(packageOnly.includes('payment&#95;flow&#95;pci&#95;scope&#95;review'));
  assert.ok(packageOnly.includes('package.json'));
  assert.ok(packageOnly.includes('**needs_human_review**'));

  const inventory = inventoryProject(fixture('minimal-public'));
  inventory.scope.incomplete = ['file_limit'];
  const fileLimited = formatRecommendationSummary(recommendSecurityChecks(inventory, catalog, root));
  assert.ok(fileLimited.includes('Needs human review: **10**'));
  assert.ok(fileLimited.includes('file&#95;limit'));
  assert.ok(!fileLimited.includes('Not indicated within inspected scope: **10**'));
});

test('missing fields, invalid versions, unknown statuses, bad counts and changed boundaries fail closed', () => {
  const base = reportFor('store-checkout');
  const bad = [];
  const mutate = change => { const candidate = copy(base); change(candidate); bad.push(candidate); };
  mutate(report => { report.schemaVersion = 2; });
  mutate(report => { report.inputs.catalogSchemaVersion = 2; });
  mutate(report => { delete report.recommendations[0].matchSignals; });
  mutate(report => { delete report.recommendations[0].name; });
  mutate(report => { report.recommendations[0].disposition = 'passed'; });
  mutate(report => { report.recommendations[0].executionStatus = 'passed'; });
  mutate(report => { report.recommendations.find(check => check.matchSignals.length).matchSignals[0].status = 'absent'; });
  mutate(report => { report.recommendations.find(check => check.matchSignals.length).matchSignals[0].id = 'invented_signal'; });
  mutate(report => { report.recommendations[1].id = report.recommendations[0].id; });
  mutate(report => { report.summary.recommended++; });
  mutate(report => { report.scan.complete = false; delete report.scan.incompleteReasons; });
  mutate(report => { report.humanConfirmation[1].checkId = report.humanConfirmation[0].checkId; });
  mutate(report => { report.boundaries.riskAcceptanceDetermined = true; });
  for (const candidate of bad) assert.throws(() => formatRecommendationSummary(candidate), /Invalid security recommendation report/);
});

test('Markdown and HTML injection in evidence is escaped, including link and heading syntax', () => {
  const report = reportFor('store-checkout');
  const payment = report.recommendations.find(check => check.id === 'payment_flow_pci_scope_review');
  payment.matchSignals[0].evidence = ['app/</code><script>alert(1)</script>[link](evil)#heading.ts'];
  const summary = formatRecommendationSummary(report);
  assert.ok(!summary.includes('<script>'));
  assert.ok(!summary.includes('</code><script>'));
  assert.ok(!summary.includes('[link](evil)'));
  assert.ok(!summary.includes('#heading'));
  assert.ok(summary.includes('&lt;script&gt;'));
  assert.ok(summary.includes('&#91;link&#93;'));
  const invalidPath = copy(report);
  invalidPath.recommendations.find(check => check.id === 'payment_flow_pci_scope_review')
    .matchSignals[0].evidence = ['.env.local'];
  assert.throws(() => formatRecommendationSummary(invalidPath), /Invalid security recommendation report/);
});

test('large untrusted evidence remains bounded and truncation is visible', () => {
  const report = reportFor('package-only-uncertain');
  const template = report.recommendations.find(check => check.matchSignals.length);
  report.recommendations = Array.from({ length: 64 }, (_, index) => ({
    ...copy(template), id: `synthetic_check_${index}`,
  }));
  report.humanConfirmation = report.recommendations.map(check => ({
    checkId: check.id, reason: 'Confirm applicability.',
  }));
  report.summary = { recommended: 0, needsHumanReview: 64, notCurrentlyIndicated: 0, total: 64 };
  for (const check of report.recommendations) {
    for (const signal of check.matchSignals) {
      signal.evidence = Array.from({ length: 5 }, (_, index) => `app/${'a'.repeat(228)}${index}.ts`);
      signal.evidenceOmitted = 395;
    }
  }
  const summary = formatRecommendationSummary(report);
  assert.ok(summary.length <= 16_000);
  assert.ok(summary.includes('Output truncated at 16000 characters'));
  assert.ok(summary.includes('and 395 more'));
  assert.equal(summary, formatRecommendationSummary(report));
});

test('CLI emits only a valid summary and rejects invalid or oversized JSON without leaking input', () => {
  const temp = mkdtempSync(join(tmpdir(), 'recommendation-summary-'));
  const input = join(temp, 'recommendations.json');
  try {
    writeFileSync(input, JSON.stringify(reportFor('cms-marketing')));
    const valid = spawnSync(process.execPath, ['scripts/security/format-security-recommendations.mjs', input],
      { cwd: root, encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stderr, '');
    assert.ok(valid.stdout.includes('Recommended: **11**'));
    writeFileSync(input, '{"secret":"DO_NOT_PRINT_VALUE"');
    const malformed = spawnSync(process.execPath, ['scripts/security/format-security-recommendations.mjs', input],
      { cwd: root, encoding: 'utf8' });
    assert.equal(malformed.status, 1);
    assert.equal(malformed.stdout, '');
    assert.ok(!malformed.stderr.includes('DO_NOT_PRINT_VALUE'));
    writeFileSync(input, JSON.stringify({ schemaVersion: 9 }));
    const invalid = spawnSync(process.execPath, ['scripts/security/format-security-recommendations.mjs', input],
      { cwd: root, encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    writeFileSync(input, 'x'.repeat(128 * 1024 + 1));
    const oversized = spawnSync(process.execPath, ['scripts/security/format-security-recommendations.mjs', input],
      { cwd: root, encoding: 'utf8' });
    assert.equal(oversized.status, 1);
    assert.equal(oversized.stdout, '');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
