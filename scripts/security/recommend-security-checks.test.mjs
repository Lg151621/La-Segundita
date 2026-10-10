import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inventoryProject } from './inventory-project.mjs';
import { recommendSecurityChecks, serializeRecommendationReport } from './recommend-security-checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(readFileSync(join(root, 'docs/security/SECURITY-CHECK-CATALOG.json'), 'utf8'));
const inventory = inventoryProject(root);
const byId = report => Object.fromEntries(report.recommendations.map(check => [check.id, check]));
const copy = value => structuredClone(value);

test('real project maps CMS, webhook, API and analytics evidence without reporting check results', () => {
  const report = recommendSecurityChecks(inventory, catalog, root);
  assert.deepEqual(report.summary, { recommended: 11, needsHumanReview: 0, notCurrentlyIndicated: 4, total: 15 });
  assert.equal(report.scan.complete, true);
  const checks = byId(report);
  for (const id of ['cms_access_review', 'cms_content_link_review', 'webhook_authentication_review',
    'webhook_replay_abuse_review', 'analytics_privacy_review', 'api_input_validation_review']) {
    assert.equal(checks[id].disposition, 'recommended', id);
    assert.ok(checks[id].matchSignals[0].evidence.length > 0, id);
  }
  for (const id of ['auth_session_authorization_review', 'form_validation_abuse_privacy_review',
    'payment_flow_pci_scope_review', 'database_access_retention_review']) {
    assert.equal(checks[id].disposition, 'not_currently_indicated', id);
    assert.match(checks[id].rationale, /not ruled out/);
  }
  assert.equal(report.boundaries.checksExecutedByThisTool, 0);
  assert.equal(report.boundaries.checkResultsDetermined, false);
  assert.equal(report.boundaries.riskAcceptanceDetermined, false);
  assert.equal(report.boundaries.legalComplianceDetermined, false);
});

test('rejects schema changes, duplicate or unknown IDs, and invalid evidence paths', () => {
  const version = copy(inventory); version.schemaVersion = 2;
  assert.throws(() => recommendSecurityChecks(version, catalog, root), /schema/);
  const missingVersion = copy(inventory); delete missingVersion.schemaVersion;
  assert.throws(() => recommendSecurityChecks(missingVersion, catalog, root), /schema/);
  const catalogVersion = copy(catalog); catalogVersion.schemaVersion = 2;
  assert.throws(() => recommendSecurityChecks(inventory, catalogVersion, root), /schema/);
  const duplicateSignal = copy(inventory); duplicateSignal.signals[1].id = duplicateSignal.signals[0].id;
  assert.throws(() => recommendSecurityChecks(duplicateSignal, catalog, root), /duplicate/);
  const unknownSignal = copy(inventory); unknownSignal.signals[1].id = 'imaginary_service';
  assert.throws(() => recommendSecurityChecks(unknownSignal, catalog, root), /unknown/);
  const unknownCandidate = copy(inventory); unknownCandidate.candidateChecks.push({
    id: 'imaginary_check', basis: 'always', triggeredBy: [], requiresHumanReview: true,
  });
  assert.throws(() => recommendSecurityChecks(unknownCandidate, catalog, root), /missing inventory candidate/);
  const badPath = copy(inventory); badPath.signals[0].evidence = ['.env.local'];
  assert.throws(() => recommendSecurityChecks(badPath, catalog, root), /inventory signal/);
});

test('uncertain signal and missing detected evidence request human review', () => {
  const uncertain = copy(inventory);
  const webhook = uncertain.signals.find(signal => signal.id === 'webhooks');
  webhook.status = 'needs human verification'; webhook.confidence = 'low';
  const report = recommendSecurityChecks(uncertain, catalog, root);
  assert.equal(byId(report).webhook_authentication_review.disposition, 'needs_human_review');
  assert.equal(byId(report).webhook_replay_abuse_review.disposition, 'needs_human_review');
  assert.deepEqual(byId(report).webhook_authentication_review.matchSignals[0].evidence, ['app/api/revalidate/route.ts']);
  const missing = copy(inventory);
  missing.signals.find(signal => signal.id === 'sanity_cms').evidence = [];
  assert.equal(byId(recommendSecurityChecks(missing, catalog, root)).cms_access_review.disposition, 'needs_human_review');
});

test('incomplete scan and contradictory negative evidence do not silently exclude checks', () => {
  const incomplete = copy(inventory);
  incomplete.scope.incomplete = ['file_limit'];
  const report = recommendSecurityChecks(incomplete, catalog, root);
  assert.equal(report.scan.complete, false);
  assert.ok(report.scan.incompleteReasons.includes('file_limit'));
  assert.equal(byId(report).payment_flow_pci_scope_review.disposition, 'needs_human_review');
  assert.equal(byId(report).cms_access_review.disposition, 'recommended');
  const contradictory = copy(inventory);
  contradictory.signals.find(signal => signal.id === 'payments').evidence = ['package.json'];
  assert.equal(byId(recommendSecurityChecks(contradictory, catalog, root)).payment_flow_pci_scope_review.disposition, 'needs_human_review');
});

test('output is bounded, deterministic, and safe as serialized JSON for later presentation', () => {
  const broad = copy(inventory);
  broad.signals.find(signal => signal.id === 'webhooks').evidence = Array.from({ length: 100 }, (_, i) => `app/api/route${i}.ts`);
  const unusualCatalog = copy(catalog);
  unusualCatalog.checks.find(check => check.id === 'webhook_authentication_review').name = '</script><b>Injected</b>\n## heading';
  const first = recommendSecurityChecks(broad, unusualCatalog, root);
  const second = recommendSecurityChecks(broad, unusualCatalog, root);
  assert.deepEqual(first, second);
  assert.deepEqual(first.recommendations.map(check => check.id), [...first.recommendations.map(check => check.id)].sort());
  const webhook = byId(first).webhook_authentication_review;
  assert.equal(webhook.matchSignals[0].evidence.length, 5);
  assert.equal(webhook.matchSignals[0].evidenceOmitted, 95);
  assert.ok(!webhook.name.includes('\n'));
  const serialized = serializeRecommendationReport(first);
  assert.ok(Buffer.byteLength(serialized, 'utf8') <= 64 * 1024);
  assert.ok(!serialized.includes('</script>'));
  assert.ok(serialized.includes('\\u003c/script\\u003e'));
  assert.deepEqual(JSON.parse(serialized), first);
});

test('local CLI emits only JSON on stdout with no file argument or report artifact', () => {
  const result = spawnSync(process.execPath, ['scripts/security/recommend-security-checks.mjs'],
    { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).summary.total, 15);
});

test('fixture inventory ignores environment values and needs no network or writes', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'recommendation-fixture-'));
  const originalFetch = globalThis.fetch;
  try {
    mkdirSync(join(fixtureRoot, 'app'));
    writeFileSync(join(fixtureRoot, '.env.local'), 'SECRET=DO_NOT_PRINT_THIS_VALUE');
    writeFileSync(join(fixtureRoot, 'app/page.tsx'), 'export default function Page() { return <main /> }');
    const before = readdirSync(fixtureRoot).sort();
    globalThis.fetch = () => { throw new Error('network call attempted'); };
    const report = recommendSecurityChecks(inventoryProject(fixtureRoot), catalog, root);
    assert.ok(!serializeRecommendationReport(report).includes('DO_NOT_PRINT_THIS_VALUE'));
    assert.deepEqual(readdirSync(fixtureRoot).sort(), before);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
