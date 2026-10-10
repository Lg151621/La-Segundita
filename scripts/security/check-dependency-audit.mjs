import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const severityOrder = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function advisoryId(via) {
  const match = typeof via.url === 'string' && via.url.match(/\/advisories\/(GHSA-[a-z0-9-]+)(?:$|[/?#])/i);
  return match?.[1] ?? (via.source == null ? null : `npm:${via.source}`);
}

function instances(nodes, lock) {
  assert(Array.isArray(nodes) && nodes.length > 0, 'Audit finding has no installed nodes');
  return nodes.map((path) => {
    const entry = lock.packages?.[path];
    assert(entry?.version, `Audit node missing from lockfile: ${path}`);
    return { path, version: entry.version, dev: !!entry.dev, optional: !!entry.optional };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function identity(finding) {
  return `${finding.id}|${finding.package}`;
}

function sameInstances(a, b) {
  if (a.length !== b.length) return false;
  const byPath = new Map(b.map((instance) => [instance.path, instance]));
  return a.every((instance) => {
    const expected = byPath.get(instance.path);
    return expected && instance.version === expected.version && instance.dev === expected.dev &&
      instance.optional === expected.optional;
  });
}

function sameStrings(a, b) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

export function evaluateAudit(audit, baseline, lock, now = new Date()) {
  assert(audit?.auditReportVersion === 2 && audit.vulnerabilities && typeof audit.vulnerabilities === 'object' &&
    typeof audit.metadata?.vulnerabilities?.total === 'number', 'Invalid or incomplete npm audit JSON');
  assert(lock?.packages && typeof lock.packages === 'object', 'Invalid package-lock.json');
  assert(baseline?.schemaVersion === 1 && Array.isArray(baseline.findings), 'Invalid dependency baseline schema');
  assert(['pending', 'approved'].includes(baseline.approval?.status), 'Invalid baseline approval status');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(baseline.reviewBy), 'Invalid baseline review date');

  const expected = new Map();
  for (const finding of baseline.findings) {
    assert(/^GHSA-[a-z0-9-]+$/.test(finding.id) && finding.package && severityOrder[finding.severity] !== undefined,
      'Invalid baseline finding');
    assert(typeof finding.direct === 'boolean' && Array.isArray(finding.instances) && finding.instances.length > 0,
      `Invalid baseline scope for ${finding.id}`);
    assert(Array.isArray(finding.consumers) && finding.consumers.every((x) => typeof x === 'string'),
      `Invalid baseline consumers for ${finding.id}`);
    assert(finding.instances.every((x) => typeof x.path === 'string' && typeof x.version === 'string' &&
      typeof x.dev === 'boolean' && typeof x.optional === 'boolean'), `Invalid baseline instances for ${finding.id}`);
    assert(new Set(finding.instances.map((x) => x.path)).size === finding.instances.length,
      `Duplicate baseline path for ${finding.id}`);
    assert(!expected.has(identity(finding)), `Duplicate baseline finding: ${finding.id}`);
    expected.set(identity(finding), finding);
  }

  const actual = new Map();
  for (const [packageName, vulnerability] of Object.entries(audit.vulnerabilities)) {
    assert(Array.isArray(vulnerability.via), `Invalid audit via for ${packageName}`);
    for (const via of vulnerability.via) {
      if (typeof via !== 'object' || via === null) continue; // Parent warnings are not separate advisories.
      const id = advisoryId(via);
      assert(id && severityOrder[via.severity] !== undefined, `Unidentified advisory for ${packageName}`);
      const finding = {
        id, package: packageName, severity: via.severity,
        direct: vulnerability.isDirect, consumers: vulnerability.effects,
        instances: instances(vulnerability.nodes, lock),
      };
      assert(typeof finding.direct === 'boolean', `Invalid audit scope for ${id}`);
      assert(Array.isArray(finding.consumers), `Invalid audit consumers for ${id}`);
      const key = identity(finding);
      const prior = actual.get(key);
      if (prior) {
        assert(prior.direct === finding.direct, `Inconsistent audit scope for ${id}`);
        prior.instances = [...new Map([...prior.instances, ...finding.instances].map((x) => [x.path, x])).values()];
        prior.consumers = [...new Set([...prior.consumers, ...finding.consumers])];
        if (severityOrder[finding.severity] > severityOrder[prior.severity]) prior.severity = finding.severity;
      } else actual.set(key, finding);
    }
  }

  const accepted = [];
  const newOrChanged = [];
  const resolved = [];
  for (const [key, finding] of actual) {
    const prior = expected.get(key);
    if (!prior) newOrChanged.push({ ...finding, reason: 'new advisory or package' });
    else if (severityOrder[finding.severity] > severityOrder[prior.severity])
      newOrChanged.push({ ...finding, reason: 'severity increased' });
    else if (finding.direct !== prior.direct || !sameInstances(finding.instances, prior.instances) ||
      !sameStrings(finding.consumers, prior.consumers))
      newOrChanged.push({ ...finding, reason: 'installed version, path, consumer, or scope changed' });
    else accepted.push(finding);
  }
  for (const [key, finding] of expected) if (!actual.has(key)) resolved.push(finding);
  assert(audit.metadata.vulnerabilities.total === 0 || actual.size > 0,
    'Audit reports vulnerabilities without source advisory records');

  const today = now.toISOString().slice(0, 10);
  const approval = baseline.approval;
  const approvalValid = approval.status === 'approved' &&
    typeof approval.reviewer === 'string' && approval.reviewer.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(approval.approvedOn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(approval.expiresOn) &&
    approval.approvedOn <= today && approval.expiresOn >= today && baseline.reviewBy >= today;
  const approvalPending = accepted.length > 0 && !approvalValid;
  return { accepted, newOrChanged, resolved, approvalPending,
    pass: newOrChanged.length === 0 && !approvalPending };
}

export function formatSummary(result) {
  const lines = [
    '## Dependency audit gate',
    `Checked npm advisory IDs: ${result.accepted.length + result.newOrChanged.length}; new or changed: ${result.newOrChanged.length}; exact baseline matches: ${result.accepted.length}; resolved: ${result.resolved.length}.`,
  ];
  for (const finding of result.newOrChanged)
    lines.push(`- FAIL ${finding.id} (${finding.package}@${finding.instances.map((x) => x.version).join(', ')}): ${finding.reason}`);
  for (const finding of result.accepted)
    lines.push(`- BASELINE ${finding.id} (${finding.package}@${finding.instances.map((x) => x.version).join(', ')})`);
  for (const finding of result.resolved) lines.push(`- RESOLVED ${finding.id} (${finding.package})`);
  if (result.approvalPending) lines.push('- Baseline approval is pending or expired. Owner review is required before this gate can pass with these findings.');
  if (result.newOrChanged.length) lines.push('- Review the new finding and remediate it; update the baseline only after a documented owner decision.');
  if (result.pass) lines.push('- No new or worsened advisory; approved baseline matches only.');
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert(process.argv.length === 5, 'Usage: node check-dependency-audit.mjs AUDIT_JSON BASELINE_JSON PACKAGE_LOCK_JSON');
    const [auditPath, baselinePath, lockPath] = process.argv.slice(2);
    const inputs = [auditPath, baselinePath, lockPath].map((path, index) => {
      try { return JSON.parse(readFileSync(path, 'utf8')); }
      catch { throw new Error(`Cannot read valid ${['audit', 'baseline', 'lockfile'][index]} JSON`); }
    });
    const result = evaluateAudit(...inputs);
    const summary = formatSummary(result);
    process.stdout.write(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    if (!result.pass) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Dependency audit gate failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
