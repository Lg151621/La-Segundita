import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inventoryProject } from './inventory-project.mjs';
import { recommendSecurityChecks, serializeRecommendationReport } from './recommend-security-checks.mjs';
import { validateCheckCatalog, validateInventoryReport } from './validate-check-catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures = join(root, 'scripts/security/fixtures/recommendations');
const catalog = JSON.parse(readFileSync(join(root, 'docs/security/SECURITY-CHECK-CATALOG.json'), 'utf8'));
const always = ['build_verification', 'dependency_scan', 'repo_host_access_review',
  'secret_scan', 'secure_config_headers'];
const sorted = values => [...values].sort();
const byId = report => Object.fromEntries(report.recommendations.map(check => [check.id, check]));

const scenarios = [
  {
    name: 'cms-marketing',
    detected: ['nextjs', 'sanity_cms', 'api_routes', 'webhooks', 'analytics'],
    conditional: ['cms_access_review', 'cms_content_link_review', 'webhook_authentication_review',
      'webhook_replay_abuse_review', 'api_input_validation_review', 'analytics_privacy_review'],
    expected: { recommended: 11, needsHumanReview: 0, notCurrentlyIndicated: 4, total: 15 },
  },
  {
    name: 'calendar-user-data',
    detected: ['nextjs', 'api_routes', 'browser_auth', 'database'],
    conditional: ['api_input_validation_review', 'auth_session_authorization_review',
      'database_access_retention_review'],
    expected: { recommended: 8, needsHumanReview: 0, notCurrentlyIndicated: 7, total: 15 },
  },
  {
    name: 'store-checkout',
    detected: ['nextjs', 'api_routes', 'payments'],
    conditional: ['api_input_validation_review', 'payment_flow_pci_scope_review'],
    expected: { recommended: 7, needsHumanReview: 0, notCurrentlyIndicated: 8, total: 15 },
  },
  {
    name: 'minimal-public',
    detected: [],
    conditional: [],
    expected: { recommended: 5, needsHumanReview: 0, notCurrentlyIndicated: 10, total: 15 },
  },
];

for (const scenario of scenarios) {
  test(`${scenario.name}: real inventory and catalog produce the expected scoped proposals`, () => {
    const fixtureRoot = join(fixtures, scenario.name);
    const inventory = inventoryProject(fixtureRoot);
    assert.deepEqual(validateInventoryReport(inventory).signalCount, 9);
    assert.deepEqual(validateCheckCatalog(catalog, inventory, root), { checkCount: 15, signalCount: 9 });
    assert.equal(inventory.schemaVersion, 1);
    assert.equal(catalog.schemaVersion, 1);
    assert.equal(catalog.inventorySchemaVersion, 1);
    assert.deepEqual(sorted(inventory.signals.filter(signal => signal.status === 'detected').map(signal => signal.id)),
      sorted(scenario.detected));
    for (const signal of inventory.signals) {
      if (scenario.detected.includes(signal.id)) {
        assert.ok(signal.evidence.length > 0, signal.id);
        for (const path of signal.evidence) assert.ok(existsSync(join(fixtureRoot, path)), path);
      } else {
        assert.equal(signal.status, 'not detected in inspected scope', signal.id);
      }
    }

    const report = recommendSecurityChecks(inventory, catalog, root);
    assert.deepEqual(report.summary, scenario.expected);
    assert.equal(report.scan.complete, true);
    assert.deepEqual(report.scan.incompleteReasons, []);
    assert.deepEqual(sorted(report.recommendations.filter(check => check.disposition === 'recommended')
      .map(check => check.id)), sorted([...always, ...scenario.conditional]));
    assert.equal(report.recommendations.length, 15);
    assert.deepEqual(report.recommendations.map(check => check.id), sorted(report.recommendations.map(check => check.id)));
    assert.equal(report.humanConfirmation.length, 15);
    for (const check of report.recommendations) {
      assert.ok(check.provenance.length > 0, check.id);
      assert.ok(check.evidenceRequired.length > 0, check.id);
      assert.equal(check.ownerApprovalRequiredForRiskDecision, true);
      if (check.disposition === 'recommended' && check.matchMode !== 'always') {
        assert.ok(check.matchSignals.some(signal => signal.status === 'detected' && signal.evidence.length > 0), check.id);
      }
      if (check.disposition === 'not_currently_indicated') {
        assert.match(check.rationale, /inspected source/);
        assert.match(check.rationale, /not ruled out/);
        assert.ok(check.matchSignals.every(signal => signal.status === 'not detected in inspected scope'), check.id);
      }
      assert.doesNotMatch(check.rationale, /\b(?:passed|compliant|accepted)\b/i);
    }
    assert.deepEqual(report.boundaries, {
      checksExecutedByThisTool: 0,
      checkResultsDetermined: false,
      riskAcceptanceDetermined: false,
      legalComplianceDetermined: false,
      note: 'Recommendations are source-based proposals for human review, not proof of absence or security status.',
    });
    assert.equal(serializeRecommendationReport(report),
      serializeRecommendationReport(recommendSecurityChecks(inventoryProject(fixtureRoot), catalog, root)));
  });
}

test('checkout detection recommends PCI scope review without deciding applicability or compliance', () => {
  const report = recommendSecurityChecks(inventoryProject(join(fixtures, 'store-checkout')), catalog, root);
  const payment = byId(report).payment_flow_pci_scope_review;
  assert.equal(payment.disposition, 'recommended');
  assert.equal(payment.executionStatus, 'human_review');
  assert.deepEqual(payment.matchSignals[0].evidence, ['app/api/checkout/route.js', 'package.json']);
  assert.match(payment.detectionLimits, /cannot determine final PCI scope/);
  assert.equal(report.boundaries.legalComplianceDetermined, false);
  assert.equal(report.boundaries.checkResultsDetermined, false);
});

test('package-only and file-limited inventories retain uncertainty for every conditional check', () => {
  const packageOnly = inventoryProject(join(fixtures, 'package-only-uncertain'));
  assert.equal(validateInventoryReport(packageOnly).signalCount, 9);
  assert.equal(packageOnly.signals.find(signal => signal.id === 'payments').status, 'needs human verification');
  assert.deepEqual(packageOnly.signals.find(signal => signal.id === 'payments').evidence, ['package.json']);
  const report = recommendSecurityChecks(packageOnly, catalog, root);
  assert.deepEqual(report.summary, { recommended: 5, needsHumanReview: 10, notCurrentlyIndicated: 0, total: 15 });
  assert.deepEqual(report.scan.incompleteReasons, ['no_source_files']);
  assert.equal(byId(report).payment_flow_pci_scope_review.disposition, 'needs_human_review');

  const fileLimited = structuredClone(inventoryProject(join(fixtures, 'minimal-public')));
  fileLimited.scope.incomplete = ['file_limit'];
  assert.equal(validateInventoryReport(fileLimited).signalCount, 9);
  const limitedReport = recommendSecurityChecks(fileLimited, catalog, root);
  assert.equal(limitedReport.scan.complete, false);
  assert.deepEqual(limitedReport.scan.incompleteReasons, ['file_limit']);
  assert.deepEqual(limitedReport.summary, { recommended: 5, needsHumanReview: 10,
    notCurrentlyIndicated: 0, total: 15 });
});

test('conflicting status is flagged for review; invalid schema, IDs, and references fail closed', () => {
  const base = inventoryProject(join(fixtures, 'store-checkout'));
  const conflict = structuredClone(base);
  conflict.signals.find(signal => signal.id === 'payments').status = 'not detected in inspected scope';
  assert.equal(validateInventoryReport(conflict).signalCount, 9);
  const report = recommendSecurityChecks(conflict, catalog, root);
  assert.equal(byId(report).payment_flow_pci_scope_review.disposition, 'needs_human_review');
  assert.match(byId(report).payment_flow_pci_scope_review.rationale, /contradictory/);
  assert.deepEqual(byId(report).payment_flow_pci_scope_review.matchSignals[0].evidence,
    ['app/api/checkout/route.js', 'package.json']);

  assert.throws(() => JSON.parse('{"schemaVersion":1,"signals":['), SyntaxError);
  const badVersion = structuredClone(base); badVersion.schemaVersion = 2;
  assert.throws(() => recommendSecurityChecks(badVersion, catalog, root), /schema/);
  const badSignal = structuredClone(base); badSignal.signals[0].id = 'invented_oauth_signal';
  assert.throws(() => recommendSecurityChecks(badSignal, catalog, root), /unknown inventory signal/);
  const badCandidate = structuredClone(base); badCandidate.candidateChecks.push({
    id: 'invented_check', basis: 'always', triggeredBy: [], requiresHumanReview: true,
  });
  assert.throws(() => recommendSecurityChecks(badCandidate, catalog, root), /missing inventory candidate/);
  const badCatalog = structuredClone(catalog);
  badCatalog.checks.find(check => check.id === 'payment_flow_pci_scope_review').match.signals = ['invented_oauth_signal'];
  assert.throws(() => recommendSecurityChecks(base, badCatalog, root), /unknown inventory signal/);
  const badCatalogVersion = structuredClone(catalog); badCatalogVersion.inventorySchemaVersion = 2;
  assert.throws(() => recommendSecurityChecks(base, badCatalogVersion, root), /schema/);
});

test('large evidence and hostile display text remain bounded, deterministic, and safe to serialize', () => {
  const inventory = inventoryProject(join(fixtures, 'cms-marketing'));
  inventory.signals.find(signal => signal.id === 'webhooks').evidence =
    Array.from({ length: 100 }, (_, index) => `app/api/webhook${index}.js`);
  const alteredCatalog = structuredClone(catalog);
  alteredCatalog.checks.find(check => check.id === 'webhook_authentication_review').name =
    '</script><b>synthetic</b>\nunsafe heading';
  const first = recommendSecurityChecks(inventory, alteredCatalog, root);
  const second = recommendSecurityChecks(inventory, alteredCatalog, root);
  assert.deepEqual(first, second);
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

test('actual La Segundita inventory remains at the established Phase 3E.2 example', () => {
  const inventory = inventoryProject(root);
  const report = recommendSecurityChecks(inventory, catalog, root);
  assert.deepEqual(report.summary, { recommended: 11, needsHumanReview: 0,
    notCurrentlyIndicated: 4, total: 15 });
  assert.deepEqual(sorted(inventory.signals.filter(signal => signal.status === 'detected').map(signal => signal.id)),
    sorted(['nextjs', 'sanity_cms', 'api_routes', 'webhooks', 'analytics']));
  assert.equal(report.scan.complete, true);
});
