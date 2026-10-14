import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assessRiskRenewal, formatRenewalPacket, parseRegister } from './assess-risk-renewal.mjs';
import { evaluateAudit } from './check-dependency-audit.mjs';
import { validateClientRecords } from './validate-client-records.mjs';

// Phase 4B.3 renewal tests. Projects here are synthetic and built in temporary directories; advisory IDs and
// packages are fictitious. The one test that reads this repository's own baseline asserts only that it is untouched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(readFileSync(join(root, 'docs/security/SECURITY-APPROVAL-POLICY.json'), 'utf8'));
const script = join(root, 'scripts/security/assess-risk-renewal.mjs');
const cli = (args, cwd = root) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });

const FINDINGS = [
  { id: 'GHSA-aaaa-bbbb-cccc', package: 'example-glob', severity: 'high', direct: false, consumers: ['example-cli'], rationale: 'Fictional rationale.',
    instances: [{ path: 'node_modules/example-glob', version: '1.0.0', dev: false, optional: false }] },
  { id: 'GHSA-dddd-eeee-ffff', package: 'example-format', severity: 'moderate', direct: false, consumers: ['example-args'], rationale: 'Fictional rationale.',
    instances: [{ path: 'node_modules/example-format', version: '2.1.0', dev: false, optional: false }] },
];
const baselineFor = (overrides = {}) => ({
  schemaVersion: 1, verifiedOn: '2026-03-01', reviewBy: '2026-04-30', reviewTriggers: ['patched upstream release', 'changed dependency path'],
  approval: { status: 'approved', reviewer: 'Example Approver Name', approvedOn: '2026-03-01', expiresOn: '2026-04-30' },
  findings: structuredClone(FINDINGS), ...overrides,
});
const lockFor = () => ({ name: 'example-project', lockfileVersion: 3, packages: { '': { name: 'example-project' },
  'node_modules/example-glob': { version: '1.0.0' }, 'node_modules/example-format': { version: '2.1.0' } } });
const auditFor = (findings = FINDINGS) => ({ auditReportVersion: 2, metadata: { vulnerabilities: { total: findings.length } },
  vulnerabilities: Object.fromEntries(findings.map(item => [item.package, { isDirect: item.direct, nodes: item.instances.map(x => x.path),
    effects: [...item.consumers], via: [{ url: `https://github.com/advisories/${item.id}`, severity: item.severity }] }])) });
const REGISTER = '<!-- risk-register-schema: 1 -->\n| Advisory ID | Package | Severity | Priority | Status |\n| --- | --- | --- | --- | --- |\n' +
  '| [GHSA-aaaa-bbbb-cccc](https://example.invalid) | `example-glob@1.0.0` | High | Low | accepted-temporarily |\n' +
  '| [GHSA-dddd-eeee-ffff](https://example.invalid) | `example-format@2.1.0` | Moderate | Low | accepted-temporarily |\n';
const assess = (overrides = {}) => assessRiskRenewal({ baseline: baselineFor(), lock: lockFor(), audit: auditFor(), policy, asOf: '2026-03-15',
  projectId: 'example-project', ...overrides });
const finding = (packet, id) => packet.findings.find(item => item.id === id);

function project(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'risk-renewal-'));
  try {
    for (const [name, value] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
    }
    return run(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const standard = () => ({ 'docs/security/DEPENDENCY-AUDIT-BASELINE.json': baselineFor(), 'package-lock.json': lockFor(), 'audit.json': auditFor(), 'register.md': REGISTER });

test('exact, unexpired acceptance: draft packet only, never usable for authorization', () => {
  const packet = assess({ register: REGISTER });
  assert.equal(packet.status, 'DRAFT / NOT AUTHORIZED');
  assert.equal(packet.usableForAuthorization, false);
  assert.equal(packet.authorizationsGranted, 0);
  assert.equal(packet.renewalPerformed, false);
  assert.equal(packet.recordsModified, false);
  assert.equal(packet.reviewStatus, 'valid_no_decision_due_yet');
  assert.ok(packet.findings.every(item => item.currentState === 'exact_match' && item.coveredByExistingAcceptance && item.registerStatus === 'accepted-temporarily'));
  assert.deepEqual(packet.decisionOptions.map(item => item.id), ['remediate', 'reject_renewal', 'time_bound_accept']);
  assert.equal(packet.proposedDecisionDraft.status, 'proposed');
  assert.deepEqual(packet.proposedDecisionDraft.signoffs, []);
  assert.equal(packet.proposedDecisionDraft.expiresOn, null);
  assert.ok(packet.roleIdentification.every(item => item.personActing === null && item.verification === 'unverified'));
  assert.ok(packet.attention.some(item => /which policy role the approver acted in/.test(item)));
});

test('required roles come from the policy: renewal is a risk renewal and a gate extension', () => {
  const packet = assess();
  const roles = ids => [...new Set(ids.flatMap(id => policy.actions.find(action => action.id === id).requiredApprovals))].sort();
  const accept = packet.decisionOptions.find(item => item.id === 'time_bound_accept');
  assert.deepEqual(accept.policyActions, ['risk_acceptance_renewal', 'ci_gate_weaken_or_bypass']);
  assert.deepEqual([...accept.requiredRoles].sort(), roles(['risk_acceptance_renewal', 'ci_gate_weaken_or_bypass']));
  assert.ok(accept.requiredRoles.includes('client_decision_maker') && accept.requiredRoles.includes('vitanova_technical_owner'));
  assert.deepEqual(packet.roleIdentification.map(item => item.role).sort(), [...accept.requiredRoles].sort());
  assert.ok(!packet.roleIdentification.some(item => item.role === 'automation_agent'));
});

test('expiry boundary matches the dependency gate: last day inclusive, invalid the next UTC day', () => {
  for (const [asOf, state, accepts] of [['2026-04-29', 'nearing_expiry', true], ['2026-04-30', 'nearing_expiry', true], ['2026-05-01', 'expired', false]]) {
    const packet = assess({ asOf });
    assert.equal(packet.approvalState, state, asOf);
    assert.equal(packet.approvalWindow.gateAcceptsToday, accepts, asOf);
    const gate = evaluateAudit(auditFor(), baselineFor(), lockFor(), new Date(`${asOf}T23:59:59Z`));
    assert.equal(gate.approvalPending, !accepts, `comparator agrees on ${asOf}`);
  }
  const lapsed = assess({ asOf: '2026-05-01' });
  assert.equal(lapsed.reviewStatus, 'expired_review_required');
  assert.ok(lapsed.findings.every(item => !item.coveredByExistingAcceptance));
  assert.equal(assess({ asOf: '2026-04-16' }).approvalState, 'nearing_expiry', 'exactly warnDays left');
  assert.equal(assess({ asOf: '2026-04-15' }).approvalState, 'valid');
  assert.equal(assess({ asOf: '2026-04-15', warnDays: 30 }).approvalState, 'nearing_expiry');
});

test('the earlier of reviewBy and expiresOn governs', () => {
  const packet = assess({ baseline: baselineFor({ reviewBy: '2026-03-20' }), asOf: '2026-03-25' });
  assert.equal(packet.approvalState, 'expired');
  assert.equal(packet.reviewDeadline, '2026-03-20');
  assert.ok(packet.attention.some(item => /the earlier date governs/.test(item)));
});

test('missing, pending and conflicting approvals', () => {
  const pending = baselineFor({ approval: { status: 'pending', reviewer: null, approvedOn: null, expiresOn: null } });
  assert.equal(assess({ baseline: pending }).reviewStatus, 'approval_pending_or_missing');
  const future = assess({ baseline: baselineFor({ approval: { ...baselineFor().approval, approvedOn: '2026-04-01' } }) });
  assert.equal(future.approvalState, 'not_yet_effective');
  assert.equal(future.reviewStatus, 're_review_required');
  for (const [mutate, message] of [
    [value => { delete value.approval; }, /approval status/],
    [value => { value.approval.reviewer = ' '; }, /no recorded approver/],
    [value => { value.approval.expiresOn = '2026-02-01'; }, /expires before it was approved/],
    [value => { value.approval.status = 'renewed'; }, /approval status/],
  ]) {
    const value = baselineFor(); mutate(value);
    assert.throws(() => assess({ baseline: value }), message);
  }
});

test('changed advisory IDs, versions, paths and severity are not covered by the old acceptance', () => {
  const versionLock = lockFor(); versionLock.packages['node_modules/example-glob'].version = '1.0.1';
  const version = assess({ lock: versionLock });
  assert.equal(finding(version, 'GHSA-aaaa-bbbb-cccc').currentState, 'changed');
  assert.equal(finding(version, 'GHSA-aaaa-bbbb-cccc').coveredByExistingAcceptance, false);
  assert.equal(version.reviewStatus, 're_review_required');

  const worse = structuredClone(FINDINGS); worse[1].severity = 'critical';
  assert.match(finding(assess({ audit: auditFor(worse) }), 'GHSA-dddd-eeee-ffff').reasons[0], /severity increased/);

  const renamed = structuredClone(FINDINGS); renamed[0].id = 'GHSA-zzzz-yyyy-xxxx';
  const packet = assess({ audit: auditFor(renamed) });
  assert.equal(finding(packet, 'GHSA-aaaa-bbbb-cccc').currentState, 'resolved_in_audit');
  assert.deepEqual(packet.uncoveredFindings.map(item => item.id), ['GHSA-zzzz-yyyy-xxxx']);
  assert.ok(packet.attention.some(item => /not in the baseline/.test(item)));
  const fresh = packet.decisionOptions.find(item => item.id === 'time_bound_accept');
  assert.deepEqual(fresh.newFindingsPolicyActions, ['risk_acceptance', 'ci_gate_weaken_or_bypass']);

  const moved = structuredClone(FINDINGS); moved[0].instances[0].path = 'node_modules/other/node_modules/example-glob';
  const movedLock = lockFor(); movedLock.packages['node_modules/other/node_modules/example-glob'] = { version: '1.0.0' };
  assert.equal(finding(assess({ lock: movedLock, audit: auditFor(moved) }), 'GHSA-aaaa-bbbb-cccc').currentState, 'changed');
});

test('partial or unknown evidence: without a fresh audit the current state is unknown, and drift still shows', () => {
  const packet = assess({ audit: null });
  assert.ok(packet.findings.every(item => item.currentState === 'not_assessed_without_fresh_audit' && !item.coveredByExistingAcceptance));
  assert.equal(packet.inputs.freshAudit, false);
  assert.equal(packet.reviewStatus, 'fresh_audit_required');
  assert.equal(assess({ audit: null, asOf: '2026-05-01' }).reviewStatus, 'expired_review_required');
  assert.ok(packet.attention.some(item => /No fresh audit was supplied/.test(item)));
  assert.equal(finding(packet, 'GHSA-aaaa-bbbb-cccc').evidence.find(item => item.item === 'fresh_audit_comparison').status, 'missing');
  for (const item of ['remediation_availability', 'remediation_compatibility', 'reachable_exposure', 'compensating_controls_and_residual_risk']) {
    assert.equal(finding(packet, 'GHSA-aaaa-bbbb-cccc').evidence.find(entry => entry.item === item).status, 'human_required', item);
  }
  const drifted = lockFor(); delete drifted.packages['node_modules/example-format'];
  assert.equal(finding(assess({ audit: null, lock: drifted }), 'GHSA-dddd-eeee-ffff').currentState, 'lockfile_drift');
});

test('risk register conflicts and unknown formats are reported, never resolved automatically', () => {
  assert.deepEqual([...parseRegister(REGISTER)], [['GHSA-aaaa-bbbb-cccc', 'accepted-temporarily'], ['GHSA-dddd-eeee-ffff', 'accepted-temporarily']]);
  const conflict = REGISTER.replace('| Moderate | Low | accepted-temporarily |', '| Moderate | Low | resolved |') +
    '| [GHSA-gggg-hhhh-iiii](https://example.invalid) | `x@1` | Low | Low | accepted-temporarily |\n';
  const packet = assess({ register: conflict });
  assert.match(finding(packet, 'GHSA-dddd-eeee-ffff').reasons.join(), /register says "resolved"/);
  assert.ok(packet.attention.some(item => /accepts GHSA-gggg-hhhh-iiii, but the baseline does not/.test(item)));
  assert.equal(packet.reviewStatus, 're_review_required');
  const missing = assess({ register: REGISTER.split('\n').filter(line => !line.includes('GHSA-aaaa')).join('\n') });
  assert.equal(finding(missing, 'GHSA-aaaa-bbbb-cccc').registerStatus, 'not_in_register');
  const unknown = assess({ register: '# Notes without a schema marker' });
  assert.equal(unknown.inputs.register, 'unrecognized');
  assert.ok(unknown.attention.some(item => /compare it with the baseline by hand/.test(item)));
});

test('an attempted silent renewal is flagged and never treated as valid', () => {
  const extended = baselineFor({ reviewBy: '2026-06-30', approval: { ...baselineFor().approval, expiresOn: '2026-06-30' } });
  const packet = assess({ baseline: extended, previousBaseline: baselineFor(), asOf: '2026-05-15' });
  assert.equal(packet.approvalState, 'unverified_extension');
  assert.equal(packet.reviewStatus, 're_review_required');
  assert.ok(packet.findings.every(item => !item.coveredByExistingAcceptance));
  assert.ok(packet.attention.some(item => /Possible silent renewal: expiry or review date extended without a new approval date/.test(item)));
  const broadened = baselineFor(); broadened.findings.push({ ...structuredClone(FINDINGS[0]), id: 'GHSA-jjjj-kkkk-llll' });
  assert.ok(assess({ baseline: broadened, previousBaseline: baselineFor(), audit: null }).attention.some(item => /GHSA-jjjj-kkkk-llll added without a new approval date/.test(item)));
  // A new approval date is noted for human confirmation, not trusted.
  const reapproved = baselineFor({ reviewBy: '2026-06-30', approval: { ...baselineFor().approval, approvedOn: '2026-04-28', expiresOn: '2026-06-30' } });
  const noted = assess({ baseline: reapproved, previousBaseline: baselineFor(), asOf: '2026-05-01' });
  assert.notEqual(noted.approvalState, 'unverified_extension');
  assert.ok(noted.attention.some(item => /confirm a human renewal decision exists/.test(item)));
  assert.equal(noted.usableForAuthorization, false);
});

test('invalid dates, malformed input and older schemas', () => {
  assert.throws(() => assess({ baseline: baselineFor({ reviewBy: '2026-02-30' }) }), /reviewBy must be a calendar date/);
  assert.throws(() => assess({ baseline: baselineFor({ approval: { ...baselineFor().approval, approvedOn: '03/01/2026' } }) }), /calendar dates/);
  assert.throws(() => assess({ asOf: '2026-13-01' }), /--as-of/);
  assert.throws(() => assess({ warnDays: -1 }), /--warn-days/);
  assert.throws(() => assess({ projectId: 'Example Project' }), /--project-id/);
  assert.throws(() => assess({ baseline: baselineFor({ schemaVersion: 2 }) }), /unsupported schemaVersion \(supported: 1\)/);
  assert.throws(() => assess({ baseline: [] }), /must be a JSON object/);
  assert.throws(() => assess({ lock: { name: 'x' } }), /lockfile/);
  assert.throws(() => assess({ audit: { auditReportVersion: 1 } }), /fresh audit could not be compared/);
  const duplicate = baselineFor(); duplicate.findings.push(structuredClone(FINDINGS[0]));
  assert.throws(() => assess({ baseline: duplicate }), /twice/);
  // Schema 1 without optional verifiedOn/reviewTriggers (the gate's minimum) is still supported.
  const minimal = baselineFor(); delete minimal.verifiedOn; delete minimal.reviewTriggers;
  assert.deepEqual(assess({ baseline: minimal }).proposedDecisionDraft.reviewTriggers, []);
});

test('the proposed decision is a valid client-records proposal and stays unusable', () => {
  const packet = assess();
  const records = JSON.parse(readFileSync(join(root, 'scripts/security/fixtures/client-records/example-fictional-bakery.json'), 'utf8'));
  records.decisions.push(packet.proposedDecisionDraft);
  const result = validateClientRecords(records, policy, { asOf: '2026-10-14' });
  const draft = result.items.find(item => item.id === 'proposed-risk-renewal');
  assert.equal(draft.state, 'proposed');
  assert.equal(draft.usableForAuthorization, false);
  assert.match(packet.proposedDecisionDraft.note, /DRAFT \/ NOT AUTHORIZED/);
});

test('report text is labeled draft, says a passing gate is not a renewal, and omits approver names', () => {
  const text = formatRenewalPacket(assess({ register: REGISTER }));
  assert.match(text, /^# Risk renewal review packet: DRAFT \/ NOT AUTHORIZED\n/);
  assert.match(text, /A passing audit comparator or CI job is not a renewal decision\./);
  assert.match(text, /usable for authorization: no\. Approvals granted: 0\. Records modified: none\.\n$/);
  assert.doesNotMatch(text, /Example Approver Name|Fictional rationale/);
  assert.doesNotMatch(JSON.stringify(assess()), /Example Approver Name|Fictional rationale/);
});

test('CLI is read-only and fails closed on unknown or write-like options', () => project(standard(), dir => {
  const before = Object.fromEntries(readdirSync(dir, { recursive: true }).map(name => [name, statSync(join(dir, name)).isFile() ? readFileSync(join(dir, name), 'utf8') : null]));
  const ok = cli(['--root', dir, '--project-id', 'example-project', '--audit', join(dir, 'audit.json'), '--register', 'register.md', '--as-of', '2026-03-15']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /DRAFT \/ NOT AUTHORIZED/);
  assert.ok(!ok.stdout.includes(dir), 'output must not echo local paths');
  const json = JSON.parse(cli(['--root', dir, '--project-id', 'example-project', '--as-of', '2026-03-15', '--json']).stdout);
  assert.equal(json.usableForAuthorization, false);
  for (const flag of ['--renew', '--approve', '--write', '--apply']) {
    const result = cli(['--root', dir, '--project-id', 'example-project', flag]);
    assert.equal(result.status, 1, flag);
    assert.match(result.stderr, /Unknown option/);
  }
  const after = Object.fromEntries(readdirSync(dir, { recursive: true }).map(name => [name, statSync(join(dir, name)).isFile() ? readFileSync(join(dir, name), 'utf8') : null]));
  assert.deepEqual(after, before, 'no file may be created or changed');
}));

test('CLI errors: missing files, malformed JSON, missing options; no paths or values echoed', () => project({ ...standard(), 'broken.json': '{ "schemaVersion": ' }, dir => {
  for (const [args, message] of [
    [['--help'], null],
    [['--project-id', 'example-project'], /--root and --project-id are required/],
    [['--root', join(dir, 'missing'), '--project-id', 'example-project'], /Project root must be an existing directory/],
    [['--root', dir, '--project-id', 'example-project', '--baseline', 'nope.json'], /Baseline must be an existing regular file inside --root/],
    [['--root', dir, '--project-id', 'example-project', '--baseline', 'broken.json'], /Baseline is not valid JSON/],
    [['--root', dir, '--project-id', 'example-project', '--audit', join(dir, 'broken.json')], /Audit report is not valid JSON/],
    [['--root', dir, '--project-id', 'example-project', '--as-of', 'tomorrow'], /--as-of/],
    [['--root', dir, '--project-id', 'example-project', '--warn-days', '1e3'], /--warn-days/],
  ]) {
    const result = cli(args);
    if (!message) { assert.equal(result.status, 0); assert.match(result.stdout, /^Usage:/); assert.match(result.stdout, /never .*approves, renews or extends anything/is); continue; }
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, message);
    assert.ok(!result.stderr.includes(dir), 'stderr must not echo local paths');
    assert.equal(result.stdout, '');
  }
}));

test('cross-client isolation: inputs stay inside the project root and audits must match its lockfile', () => {
  const dirA = mkdtempSync(join(tmpdir(), 'client-a-'));
  const dirB = mkdtempSync(join(tmpdir(), 'client-b-'));
  try {
    for (const [dir, files] of [[dirA, standard()], [dirB, { ...standard(), 'package-lock.json': { name: 'other', lockfileVersion: 3, packages: { '': {}, 'node_modules/other-pkg': { version: '9.9.9' } } } }]]) {
      for (const [name, value] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, name)), { recursive: true });
        writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
    const outside = cli(['--root', dirB, '--project-id', 'client-b', '--baseline', join(dirA, 'docs/security/DEPENDENCY-AUDIT-BASELINE.json')]);
    assert.equal(outside.status, 1);
    assert.match(outside.stderr, /Baseline must be inside --root/);
    symlinkSync(join(dirA, 'register.md'), join(dirB, 'linked-register.md'));
    const linked = cli(['--root', dirB, '--project-id', 'client-b', '--register', 'linked-register.md']);
    assert.equal(linked.status, 1);
    assert.match(linked.stderr, /Register must be inside --root/);
    const traversal = cli(['--root', dirB, '--project-id', 'client-b', '--register', '../x/register.md']);
    assert.equal(traversal.status, 1);
    // Client A's audit against client B's lockfile does not match and fails closed.
    const mismatched = cli(['--root', dirB, '--project-id', 'client-b', '--audit', join(dirA, 'audit.json')]);
    assert.equal(mismatched.status, 1);
    assert.match(mismatched.stderr, /fresh audit could not be compared/);
    const own = JSON.parse(cli(['--root', dirA, '--project-id', 'client-a', '--as-of', '2026-03-15', '--json']).stdout);
    assert.equal(own.project.id, 'client-a');
    assert.doesNotMatch(JSON.stringify(own), /client-b|other-pkg/);
  } finally { rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true }); }
});

test('portable code and templates carry no project findings; this repository baseline is read, never changed', () => {
  const baselinePath = join(root, 'docs/security/DEPENDENCY-AUDIT-BASELINE.json');
  const registerPath = join(root, 'docs/security/DEPENDENCY-RISK-REGISTER.md');
  const before = [readFileSync(baselinePath, 'utf8'), readFileSync(registerPath, 'utf8')];
  const own = JSON.parse(before[0]);
  for (const path of ['scripts/security/assess-risk-renewal.mjs', 'docs/security/RISK-RENEWAL-PROCEDURE.md', 'docs/security/templates/RISK-RENEWAL-DECISION.template.md']) {
    const text = readFileSync(join(root, path), 'utf8');
    for (const item of own.findings) assert.ok(!text.includes(item.id), `${path} must not name ${item.id}`);
    assert.doesNotMatch(text, /segundita/i, path);
  }
  const result = cli(['--root', root, '--project-id', 'this-repository', '--as-of', '2026-10-14', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.findings.length, own.findings.length);
  assert.equal(packet.usableForAuthorization, false);
  assert.deepEqual([readFileSync(baselinePath, 'utf8'), readFileSync(registerPath, 'utf8')], before);
});
