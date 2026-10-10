import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { formatInventorySummary } from './format-project-inventory.mjs';

const report = overrides => ({
  schemaVersion: 1,
  tool: 'project-security-inventory',
  scope: { sourceFilesInspected: 3, packageManifest: 'valid', incomplete: [] },
  signals: [
    { id: 'sanity_cms', status: 'detected', confidence: 'high', evidence: ['sanity.config.ts'] },
    { id: 'payments', status: 'not detected in inspected scope', confidence: 'medium', evidence: [] },
    { id: 'webhooks', status: 'needs human verification', confidence: 'low', evidence: ['app/api/webhook/route.ts'] },
  ],
  candidateChecks: [{ id: 'cms_access_review', requiresHumanReview: true, triggeredBy: ['sanity_cms'] }],
  ...overrides,
});

test('renders all statuses and human review topics without making findings gates', () => {
  const output = formatInventorySummary(report());
  for (const text of ['Detected capabilities', 'Needs human verification', 'Not detected in inspected scope',
    'sanity.config.ts', 'app/api/webhook/route.ts', 'cms access review', 'not proof of absence', 'not compliance certification']) {
    assert.ok(output.includes(text), text);
  }
});

test('escapes repository controlled paths and labels', () => {
  const attack = '</code><script>alert(1)</script> [link](https://example.test) &';
  const output = formatInventorySummary(report({
    signals: [{ id: attack, status: 'detected', confidence: 'high', evidence: [attack + '\n## injected'] }],
    candidateChecks: [{ id: attack, requiresHumanReview: true, triggeredBy: [attack] }],
  }));
  assert.ok(!output.includes('<script>'));
  assert.ok(!output.includes('</code><script>'));
  assert.ok(!output.includes('\n## injected'));
  assert.ok(output.includes('&lt;script&gt;'));
  assert.ok(output.includes('&amp;'));
});

test('handles missing optional fields and reports incomplete scans', () => {
  const output = formatInventorySummary(report({ scope: { incomplete: ['file_limit'] }, candidateChecks: undefined }));
  assert.ok(output.includes('file_limit'));
  assert.ok(output.includes('No review topics were supplied'));
  assert.ok(output.includes('unknown'));
});

test('bounds evidence, signals and total output', () => {
  const signals = Array.from({ length: 100 }, (_, index) => ({
    id: `feature_${index}`, status: 'detected', confidence: 'high', evidence: Array(50).fill('long/'.repeat(100)),
  }));
  const output = formatInventorySummary(report({ signals }));
  assert.ok(output.length <= 12_000);
  assert.ok(output.includes('truncated') || output.includes('limited'));
});

test('rejects broken inventory data', () => {
  assert.throws(() => formatInventorySummary({ ...report(), schemaVersion: 2 }));
  assert.throws(() => formatInventorySummary(report({ signals: [{ id: 'bad', status: 'passed', confidence: 'high', evidence: [] }] })));
});

test('invalid JSON fails without printing its contents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inventory-summary-test-'));
  try {
    const path = join(dir, 'inventory.json');
    writeFileSync(path, '{"secret":"DO_NOT_PRINT_THIS_VALUE"');
    const result = spawnSync(process.execPath, ['scripts/security/format-project-inventory.mjs', path], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes('could not be generated'));
    assert.ok(!result.stderr.includes('DO_NOT_PRINT_THIS_VALUE'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
