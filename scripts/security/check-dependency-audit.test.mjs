import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateAudit } from './check-dependency-audit.mjs';

const baseline = JSON.parse(readFileSync(new URL('../../docs/security/DEPENDENCY-AUDIT-BASELINE.json', import.meta.url)));
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url)));
const approved = structuredClone(baseline);
approved.approval = { status: 'approved', reviewer: 'Test reviewer', approvedOn: '2026-10-09', expiresOn: '2026-11-09' };
const pending = structuredClone(baseline);
pending.approval = { status: 'pending', reviewer: null, approvedOn: null, expiresOn: null };
const today = new Date('2026-10-09T12:00:00Z');

function audit() {
  return {
    auditReportVersion: 2,
    metadata: { vulnerabilities: { total: 3 } },
    vulnerabilities: Object.fromEntries(baseline.findings.map((finding) => [finding.package, {
      isDirect: finding.direct,
      nodes: finding.instances.map((x) => x.path),
      effects: [...finding.consumers],
      via: [{ url: `https://github.com/advisories/${finding.id}`, severity: finding.severity }],
    }])),
  };
}

test('exact approved findings pass', () => {
  const result = evaluateAudit(audit(), approved, lock, today);
  assert.equal(result.pass, true);
  assert.equal(result.accepted.length, 3);
});

test('pending approval fails even for exact findings', () => {
  const result = evaluateAudit(audit(), pending, lock, today);
  assert.equal(result.pass, false);
  assert.equal(result.approvalPending, true);
});

test('brand-new advisory fails', () => {
  const report = audit();
  report.vulnerabilities.braces.via.push({ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'moderate' });
  const result = evaluateAudit(report, approved, lock, today);
  assert.equal(result.pass, false);
  assert.equal(result.newOrChanged[0].reason, 'new advisory or package');
});

test('changed installed version or path fails', () => {
  const changedLock = structuredClone(lock);
  changedLock.packages['node_modules/braces'].version = '3.0.2';
  const result = evaluateAudit(audit(), approved, changedLock, today);
  assert.equal(result.pass, false);
  assert.equal(result.newOrChanged[0].reason, 'installed version, path, consumer, or scope changed');
});

test('changed source package fails', () => {
  const report = audit();
  report.vulnerabilities['other-package'] = { ...report.vulnerabilities.braces };
  delete report.vulnerabilities.braces;
  const result = evaluateAudit(report, approved, lock, today);
  assert.equal(result.pass, false);
  assert.equal(result.newOrChanged[0].reason, 'new advisory or package');
  assert.deepEqual(result.resolved.map((x) => x.package), ['braces']);
});

test('changed direct scope fails', () => {
  const report = audit();
  report.vulnerabilities.uuid.isDirect = true;
  const result = evaluateAudit(report, approved, lock, today);
  assert.equal(result.pass, false);
  assert.equal(result.newOrChanged[0].reason, 'installed version, path, consumer, or scope changed');
});

test('new direct consumer fails', () => {
  const report = audit();
  report.vulnerabilities.braces.effects.push('new-consumer');
  const result = evaluateAudit(report, approved, lock, today);
  assert.equal(result.pass, false);
  assert.equal(result.newOrChanged[0].reason, 'installed version, path, consumer, or scope changed');
});

test('increased advisory severity fails', () => {
  const report = audit();
  report.vulnerabilities['sprintf-js'].via[0].severity = 'high';
  const result = evaluateAudit(report, approved, lock, today);
  assert.equal(result.pass, false);
  assert.equal(result.newOrChanged[0].reason, 'severity increased');
});

test('resolved advisory is reported and does not fail', () => {
  const report = audit();
  delete report.vulnerabilities.uuid;
  const result = evaluateAudit(report, approved, lock, today);
  assert.equal(result.pass, true);
  assert.deepEqual(result.resolved.map((x) => x.package), ['uuid']);
});

test('all findings resolved pass without acceptance', () => {
  const report = audit();
  report.vulnerabilities = {};
  report.metadata.vulnerabilities.total = 0;
  const result = evaluateAudit(report, pending, lock, today);
  assert.equal(result.pass, true);
  assert.equal(result.resolved.length, 3);
});

test('incomplete audit report fails closed', () => {
  const report = audit();
  delete report.metadata;
  assert.throws(() => evaluateAudit(report, approved, lock, today), /Invalid or incomplete npm audit JSON/);
});

test('expired approval fails', () => {
  const result = evaluateAudit(audit(), approved, lock, new Date('2026-11-10T12:00:00Z'));
  assert.equal(result.pass, false);
  assert.equal(result.approvalPending, true);
});

test('approval remains valid on its inclusive expiry date', () => {
  const result = evaluateAudit(audit(), approved, lock, new Date('2026-11-09T23:59:59Z'));
  assert.equal(result.pass, true);
});

test('missing approval fails closed', () => {
  const missing = structuredClone(approved);
  delete missing.approval;
  assert.throws(() => evaluateAudit(audit(), missing, lock, today), /Invalid baseline approval status/);
});
