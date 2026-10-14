import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { TEMPLATE_PATH, formatClientRecordsReport, validateClientRecords } from './validate-client-records.mjs';

// Phase 4B.2 client-record tests. Every record here is synthetic: the template is blank and the example is a
// fictional bakery. No real client, person, approval or finding is used.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(readFileSync(join(root, 'docs/security/SECURITY-APPROVAL-POLICY.json'), 'utf8'));
const templatePath = join(root, TEMPLATE_PATH);
const examplePath = join(root, 'scripts/security/fixtures/client-records/example-fictional-bakery.json');
const template = JSON.parse(readFileSync(templatePath, 'utf8'));
const example = JSON.parse(readFileSync(examplePath, 'utf8'));
const AS_OF = '2026-10-14';
const copy = () => structuredClone(example);
const check = (records, asOf = AS_OF) => validateClientRecords(records, policy, { asOf });
const state = (result, id) => result.items.find(item => item.id === id && item.kind !== 'riskAcceptance').state;
const decision = (records, id) => records.decisions.find(item => item.id === id);
const assignment = (records, id) => records.roleAssignments.find(item => item.id === id);
const delegation = (records, id) => records.delegations.find(item => item.id === id);
const cli = args => spawnSync(process.execPath, [join(root, 'scripts/security/validate-client-records.mjs'), ...args], { cwd: root, encoding: 'utf8' });
const signoff = (assignmentRef, role, decidedAt = '2026-10-05T10:00:00Z', extra = {}) => ({ assignmentRef, role, decision: 'approved', decidedAt,
  evidenceRefs: ['doc:example-approval'], verification: 'human_confirmed', ...extra });

test('blank template is valid and records nothing', () => {
  const result = check(template);
  assert.equal(result.recordStatus, 'template');
  assert.equal(result.authorizationsGranted, 0);
  assert.equal(result.counts.formallyComplete, 0);
  assert.equal(result.counts.requiresHumanConfirmation, 0);
  assert.ok(result.items.every(item => ['proposed', 'unverified_requires_human_confirmation'].includes(item.state)));
  assert.deepEqual(template.riskAcceptances, []);
  assert.deepEqual(template.auditTrail, []);
});

test('synthetic example: formal validity is reported separately from authenticity', () => {
  const result = check(example);
  assert.equal(result.recordStatus, 'synthetic_example');
  assert.equal(result.authorizationsGranted, 0);
  assert.equal(result.identityVerified, false);
  assert.equal(result.authenticityVerified, false);
  assert.equal(state(result, 'delegation-routine-releases'), 'formally_complete');
  assert.equal(state(result, 'decision-override-example'), 'formally_complete');
  assert.equal(state(result, 'decision-release-example'), 'formally_complete');
  assert.equal(state(result, 'decision-editor-invite'), 'pending');
  assert.equal(state(result, 'decision-gate-example'), 'proposed');
  assert.equal(state(result, 'delegation-menu-publishing'), 'proposed');
  // An unverified signoff never becomes an authorization, even when the record says "approved".
  assert.equal(state(result, 'decision-risk-example'), 'unverified_requires_human_confirmation');
  assert.equal(state(result, 'specialist-example'), 'unverified_requires_human_confirmation');
  // The delegated release records a human confirmation of the written scope, so it is formally usable.
  assert.equal(result.items.find(item => item.id === 'decision-release-example').usableForAuthorization, true);
  const report = formatClientRecordsReport(result);
  assert.match(report, /SYNTHETIC EXAMPLE \(fictitious; not real authorizations\)/);
  assert.match(report, /NOT verified: identities, signatures, authenticity/);
  assert.match(report, /formally complete \(policy-matched; authenticity not verified\)/);
  assert.match(report, /No approval, delegation or risk acceptance is granted, renewed or recorded by this check\.\n$/);
  assert.doesNotMatch(report, /bakery editor|transitive advisory in the build/, 'report must not echo record text');
});

test('expiry is evaluated against the as-of date and never renews anything', () => {
  const result = check(example, '2027-03-15');
  assert.equal(state(result, 'delegation-routine-releases'), 'expired');
  assert.equal(state(result, 'decision-override-example'), 'expired');
  assert.equal(state(result, 'decision-risk-example'), 'expired');
  // A release decided while the delegation was valid stays valid after the delegation expires.
  assert.equal(state(result, 'decision-release-example'), 'formally_complete');
  assert.ok(result.attention.some(item => item.id === 'delegation-routine-releases' && /not usable for authorization until a new delegation/.test(item.message)));
  assert.ok(result.counts.expiredOrRevoked >= 3);
});

test('one holder in several roles counts only with verified authority for each role', () => {
  const value = copy();
  assignment(value, 'owner-example').holdsOtherRoles = true;
  value.roleAssignments.push({ ...assignment(value, 'client-example'), id: 'client-also-owner', holderRef: 'example-maintainer-a', holdsOtherRoles: true });
  value.decisions.push({ ...decision(value, 'decision-editor-invite'), id: 'decision-dual', status: 'approved', note: null,
    signoffs: [signoff('client-also-owner', 'client_decision_maker'), signoff('owner-example', 'vitanova_technical_owner')] });
  value.auditTrail.push({ ...value.auditTrail[0], id: 'audit-dual', recordRef: 'decision-dual' });
  // Both role assignments verified separately: formally complete, with an explicit notice.
  let result = check(value);
  assert.equal(state(result, 'decision-dual'), 'formally_complete');
  assert.ok(result.attention.some(item => item.id === 'decision-dual' && /verified separately/.test(item.message)));
  // Authority for one of the roles unverified: never inferred from the other role.
  Object.assign(assignment(value, 'client-also-owner'), { verification: 'unverified', confirmedAt: null, confirmedByRole: null });
  result = check(value);
  assert.equal(state(result, 'decision-dual'), 'unverified_requires_human_confirmation');
  assert.equal(result.items.find(item => item.id === 'decision-dual').usableForAuthorization, false);
  assert.ok(result.attention.some(item => item.id === 'decision-dual' && /without verified authority for each role/.test(item.message)));
  assert.ok(result.attention.some(item => item.id === 'client-also-owner' && /verify authority for each role separately/.test(item.message)));
});

test('a delegated decision needs a human confirmation of the written scope', () => {
  const value = copy();
  decision(value, 'decision-release-example').delegatedScopeConfirmation = null;
  const result = check(value);
  assert.equal(state(result, 'decision-release-example'), 'unverified_requires_human_confirmation');
  assert.equal(result.items.find(item => item.id === 'decision-release-example').usableForAuthorization, false);
  assert.ok(result.attention.some(item => item.id === 'decision-release-example' && /inside the delegation's written scope/.test(item.message)));
});

test('unverified and expired records are warnings, explicitly unusable for authorization', () => {
  const current = check(example);
  const usable = id => current.items.find(item => item.id === id && item.kind !== 'riskAcceptance').usableForAuthorization;
  assert.equal(usable('decision-override-example'), true);
  assert.equal(usable('decision-risk-example'), false);
  assert.equal(usable('decision-gate-example'), false);
  assert.equal(usable('specialist-example'), false);
  assert.equal(current.counts.usableForAuthorization, 3);
  assert.match(formatClientRecordsReport(current), /decision-risk-example \(risk_acceptance\): UNVERIFIED: requires human confirmation \[NOT usable for authorization\]/);
  const later = check(example, '2027-03-15');
  assert.equal(later.items.find(item => item.id === 'decision-override-example').usableForAuthorization, false);
  assert.ok(later.attention.some(item => item.id === 'decision-override-example' && /not usable for authorization until renewed/.test(item.message)));
});

test('an escalation brings in the escalated role before approval is complete', () => {
  const value = copy();
  decision(value, 'decision-override-example').escalations = ['material_client_impact'];
  assert.throws(() => check(value), /approved without the required client_decision_maker approval/);
  decision(value, 'decision-override-example').signoffs.push(signoff('client-example', 'client_decision_maker', '2026-09-11T10:00:00Z'));
  assert.equal(state(check(value), 'decision-override-example'), 'formally_complete');
});

test('a renewal links the earlier record, keeps exact findings and names the role exercised', () => {
  const value = copy();
  value.decisions.push({ ...decision(value, 'decision-risk-example'), id: 'decision-renewal', action: 'risk_acceptance_renewal',
    expiresOn: '2027-01-31', reviewBy: '2027-01-15', signoffs: [signoff('client-example', 'client_decision_maker', '2026-10-10T09:00:00Z')] });
  value.riskAcceptances.push({ ...structuredClone(value.riskAcceptances[0]), id: 'risk-renewal', decisionRef: 'decision-renewal', renewsRef: 'risk-example-advisory' });
  value.auditTrail.push({ ...value.auditTrail[0], id: 'audit-renewal', recordRef: 'decision-renewal', event: 'renewed' });
  assert.equal(state(check(value), 'decision-renewal'), 'formally_complete');
  value.riskAcceptances[1].findings.push({ id: 'EXAMPLE-ADVISORY-0002', source: 'npm audit (fictional)', affectedAsset: 'node_modules/example-other' });
  assert.throws(() => check(value), /cannot add findings/);
});

test('project records default to private storage; Git storage is always flagged for a client decision', () => {
  const value = copy();
  value.recordStatus = 'project'; value.project.id = 'fictional-client-site';
  assert.ok(check(value).attention.some(item => /instead of the default private, access-controlled storage; this needs an explicit client decision/.test(item.message)));
  value.storage.sensitiveDataReview = 'not_reviewed';
  assert.ok(check(value).attention.some(item => /without a sensitive-data review/.test(item.message)));
  value.storage.location = 'private_access_controlled';
  const result = check(value);
  assert.ok(!result.attention.some(item => /Git repository/.test(item.message)));
  assert.equal(result.authorizationsGranted, 0);
  assert.equal(template.storage.location, 'private_access_controlled');
});

const rejections = [
  ['non-object input', () => [], /top level/],
  ['unsupported schema version', value => { value.schemaVersion = 2; }, /unsupported schemaVersion/],
  ['unexpected kind', value => { value.kind = 'security-approval-policy'; }, /unexpected kind/],
  ['unknown top-level field', value => { value.approvedBy = 'someone'; }, /unknown field/],
  ['records written for policy v1', value => { value.policy.schemaVersion = 1; }, /policy reference does not match/],
  ['boundary claims to grant approval', value => { value.boundaries.grantsApproval = true; }, /boundaries\.grantsApproval/],
  ['boundary claims identity verification', value => { value.boundaries.verifiesIdentity = true; }, /boundaries\.verifiesIdentity/],
  ['unknown action ID', value => { decision(value, 'decision-gate-example').action = 'quick_fix'; }, /action is missing or invalid/],
  ['unknown escalation condition', value => { decision(value, 'decision-gate-example').escalations = ['bad_vibes']; }, /escalations is missing or invalid/],
  ['automation holding an authorizing role', value => { assignment(value, 'specialist-example').role = 'automation_agent'; }, /role is missing or invalid/],
  ['automation signing off', value => { decision(value, 'decision-gate-example').signoffs = [signoff('owner-example', 'automation_agent')]; }, /role is missing or invalid/],
  ['automation confirming a record', value => { value.auditTrail[3].event = 'confirmed'; }, /automation can record but never confirm/],
  ['duplicate record ID', value => { value.decisions[1].id = value.decisions[0].id; }, /reuses an ID/],
  ['invalid calendar date', value => { decision(value, 'decision-override-example').expiresOn = '2027-02-30'; }, /expiresOn is missing or invalid/],
  ['timestamp without time zone', value => { value.auditTrail[0].at = '2026-08-03T10:00:00'; }, /at is missing or invalid/],
  ['decision dated in the future', value => { decision(value, 'decision-override-example').signoffs[0].decidedAt = '2026-12-01T10:00:00Z'; }, /dated after 2026-10-14/],
  ['reviewBy after expiry', value => { decision(value, 'decision-override-example').reviewBy = '2027-06-01'; }, /reviewBy is after expiresOn/],
  ['approval missing a required role', value => { const item = decision(value, 'decision-editor-invite'); item.status = 'approved'; }, /approved without the required vitanova_technical_owner approval/],
  ['dual authorization by the client alone', value => { const item = decision(value, 'decision-gate-example'); item.status = 'approved'; item.expiresOn = '2026-10-20'; item.reviewTriggers = ['x']; item.signoffs = [signoff('client-example', 'client_decision_maker')]; value.riskAcceptances.push({ ...value.riskAcceptances[0], id: 'risk-gate', decisionRef: 'decision-gate-example' }); }, /required vitanova_technical_owner approval/],
  ['approval that also records a rejection', value => { decision(value, 'decision-override-example').signoffs.push({ ...signoff('client-example', 'client_decision_maker'), decision: 'rejected' }); }, /approved but records a rejection/],
  ['approved without any signoff', value => { const item = decision(value, 'decision-gate-example'); item.action = 'routine_scoped_change'; item.status = 'approved'; }, /without the required vitanova_technical_owner approval/],
  ['rejected without a rejecting signoff', value => { decision(value, 'decision-gate-example').status = 'rejected'; }, /rejected without a rejecting signoff/],
  ['signoff role differs from its assignment', value => { decision(value, 'decision-override-example').signoffs[0].role = 'client_decision_maker'; }, /does not match its role assignment/],
  ['two signoffs for one role', value => { const item = decision(value, 'decision-override-example'); item.signoffs.push(item.signoffs[0]); }, /more than one signoff/],
  ['signoff from an unknown assignment', value => { decision(value, 'decision-override-example').signoffs[0].assignmentRef = 'nobody'; }, /unknown role assignment/],
  ['signoff after the role assignment ended', value => { assignment(value, 'owner-example').endedAt = '2026-09-01T00:00:00Z'; }, /after its role assignment ended/],
  ['confirmed signoff without evidence', value => { decision(value, 'decision-override-example').signoffs[0].evidenceRefs = []; }, /needs evidence references/],
  ['confirmed role assignment without confirmation details', value => { assignment(value, 'owner-example').confirmedAt = null; }, /human_confirmed without confirmedAt/],
  ['unverified role assignment claiming confirmation', value => { assignment(value, 'specialist-example').confirmedByRole = 'client_decision_maker'; }, /unverified but records a confirmation/],
  ['risk acceptance without expiry', value => { decision(value, 'decision-risk-example').expiresOn = null; }, /must record expiresOn and reviewTriggers/],
  ['risk acceptance without review triggers', value => { decision(value, 'decision-risk-example').reviewTriggers = []; }, /must record expiresOn and reviewTriggers/],
  ['risk acceptance by the technical owner', value => { decision(value, 'decision-risk-example').signoffs = [signoff('owner-example', 'vitanova_technical_owner', '2026-10-02T09:15:00Z')]; }, /required client_decision_maker approval/],
  ['approved risk acceptance without a risk record', value => { value.riskAcceptances = []; }, /needs a linked risk acceptance record/],
  ['risk record linked to a non-risk decision', value => { value.riskAcceptances[0].decisionRef = 'decision-override-example'; }, /must link a risk acceptance/],
  ['risk record without findings', value => { value.riskAcceptances[0].findings = []; }, /exact findings/],
  ['risk record with a duplicate finding', value => { const risk = value.riskAcceptances[0]; risk.findings.push(risk.findings[0]); }, /finding twice/],
  ['risk record without compensating controls', value => { value.riskAcceptances[0].compensatingControls = []; }, /compensating controls/],
  ['renewal pointer on a first acceptance', value => { value.riskAcceptances[0].renewsRef = 'risk-example-advisory'; }, /only a risk_acceptance_renewal/],
  ['delegation of a never-delegable action', value => { delegation(value, 'delegation-menu-publishing').action = 'cms_permission_change'; }, /can never be delegated/],
  ['delegation of risk acceptance', value => { delegation(value, 'delegation-menu-publishing').action = 'risk_acceptance'; }, /can never be delegated/],
  ['delegation granted by the technical owner', value => { delegation(value, 'delegation-routine-releases').grantorAssignmentRef = 'owner-example'; }, /grantor must be a client_decision_maker/],
  ['delegation to a specialist', value => { delegation(value, 'delegation-menu-publishing').recipientAssignmentRef = 'specialist-example'; }, /recipient must hold a role/],
  ['delegation claiming to override policy exclusions', value => { delegation(value, 'delegation-routine-releases').policyExclusionsApply = false; }, /policyExclusionsApply/],
  ['active delegation without a period', value => { delegation(value, 'delegation-routine-releases').expiresOn = null; }, /without issuedAt, expiresOn and written evidence/],
  ['active delegation without written evidence', value => { delegation(value, 'delegation-routine-releases').evidenceRefs = []; }, /written evidence/],
  ['revoked delegation without a revocation time', value => { delegation(value, 'delegation-routine-releases').status = 'revoked'; }, /revoked without revokedAt/],
  ['delegation marked expired early', value => { delegation(value, 'delegation-routine-releases').status = 'expired'; }, /marked expired before its expiry date/],
  ['proposed delegation marked confirmed', value => { delegation(value, 'delegation-menu-publishing').verification = 'human_confirmed'; }, /proposed but marked human_confirmed/],
  ['decision relying on a delegation for another action', value => { decision(value, 'decision-override-example').delegationRef = 'delegation-routine-releases'; }, /delegation for a different action/],
  ['decision relying on a delegation issued later', value => { delegation(value, 'delegation-routine-releases').issuedAt = '2026-09-25T00:00:00Z'; }, /not issued, was expired or was revoked/],
  ['decision relying on a revoked delegation', value => { const item = delegation(value, 'delegation-routine-releases'); item.status = 'revoked'; item.revokedAt = '2026-09-15T00:00:00Z'; }, /not issued, was expired or was revoked/],
  ['decision relying on a proposed delegation', value => { const item = decision(value, 'decision-release-example'); item.action = 'cms_content_publish'; item.delegationRef = 'delegation-menu-publishing'; }, /not issued, was expired or was revoked/],
  ['delegated decision that records no valid delegation', value => { decision(value, 'decision-release-example').escalations = ['delegation_not_valid']; }, /while recording that no valid delegation applies/],
  ['undeclared multiple roles', value => { value.roleAssignments.push({ ...assignment(value, 'specialist-example'), id: 'owner-also-specialist', holderRef: 'example-maintainer-a' }); }, /holdsOtherRoles does not match/],
  ['multiple roles claimed for a single-role holder', value => { assignment(value, 'specialist-example').holdsOtherRoles = true; }, /holdsOtherRoles does not match/],
  ['scope confirmation without a delegation', value => { decision(value, 'decision-override-example').delegatedScopeConfirmation = { confirmedByRole: 'client_decision_maker', confirmedAt: '2026-09-10T15:00:00Z', evidenceRefs: ['doc:x'] }; }, /delegated-scope confirmation without a delegation/],
  ['scope confirmed by automation', value => { decision(value, 'decision-release-example').delegatedScopeConfirmation.confirmedByRole = 'automation_agent'; }, /delegatedScopeConfirmation is missing or invalid/],
  ['scope confirmation without evidence', value => { decision(value, 'decision-release-example').delegatedScopeConfirmation.evidenceRefs = []; }, /delegatedScopeConfirmation is missing or invalid/],
  ['retired storage location', value => { value.storage.location = 'external_system'; }, /storage\.location/],
  ['audit entry for an unknown record', value => { value.auditTrail[0].recordRef = 'missing-record'; }, /recordRef does not name a record/],
  ['email address in record text', value => { decision(value, 'decision-gate-example').note = 'Ask owner@example.com'; }, /email address/],
  ['phone number in record text', value => { assignment(value, 'specialist-example').note = 'Call (555) 010-1234'; }, /phone-like/],
  ['credential in record text', value => { decision(value, 'decision-gate-example').note = 'Token ghp_abcdefghijklmnopqrstuvwxyz123456'; }, /credential-like/],
  ['password assignment in record text', value => { decision(value, 'decision-gate-example').note = 'password: hunter2'; }, /credential assignment/],
  ['embedded signature image', value => { decision(value, 'decision-gate-example').note = 'data:image/png;base64,iVBORw0KGgo'; }, /embedded file, signature/],
  ['URL or path traversal as evidence', value => { value.riskAcceptances[0].evidenceRefs = ['repo:../../secrets.txt']; }, /evidenceRefs is missing or invalid/],
  ['raw URL as evidence', value => { value.riskAcceptances[0].evidenceRefs = ['https://example.com/doc?token=abc']; }, /evidenceRefs is missing or invalid/],
  ['overlong text', value => { decision(value, 'decision-gate-example').scope = 'x'.repeat(700); }, /scope is missing or invalid/],
  ['synthetic example with a real-looking project id', value => { value.project.id = 'acme-shop'; }, /synthetic example must use a project id/],
  ['project record with template placeholders', value => { value.recordStatus = 'project'; value.project.id = 'fictional-client-site'; value.project.note = 'REPLACE: describe'; }, /template placeholders/],
  ['template with a recorded approval', () => { const value = structuredClone(template); value.decisions[0].status = 'approved'; return value; }, /template may only contain proposed/],
  ['template with a confirmed role holder', () => { const value = structuredClone(template); Object.assign(value.roleAssignments[0], { verification: 'human_confirmed', confirmedAt: '2026-10-01T00:00:00Z', confirmedByRole: 'client_decision_maker', evidenceRefs: ['doc:x'] }); return value; }, /template may only contain proposed/],
];
for (const [name, mutate, message] of rejections) {
  test(`rejects ${name}`, () => {
    const value = copy();
    const replaced = mutate(value);
    assert.throws(() => check(replaced ?? value), message);
  });
}

test('records are checked against a valid approval policy only', () => {
  const stale = structuredClone(policy); stale.schemaVersion = 1;
  assert.throws(() => validateClientRecords(example, stale, { asOf: AS_OF }), /schemaVersion 1 is no longer supported/);
  assert.throws(() => validateClientRecords(example, policy, { asOf: '2026-13-01' }), /--as-of/);
});

test('template and example stay fictitious and carry no real project data', () => {
  for (const path of [templatePath, examplePath]) {
    const raw = readFileSync(path, 'utf8');
    assert.doesNotMatch(raw, /segundita|blythe|vercel\.app|sanity\.io/i, path);
    assert.doesNotMatch(raw, /GHSA-|CVE-\d/, path);
  }
  assert.match(example.boundaries.note, /SYNTHETIC EXAMPLE/);
  assert.match(template.boundaries.note, /BLANK TEMPLATE/);
});

test('CLI prints help, validates the template and example, and writes nothing', () => {
  const help = cli(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage:/);
  assert.match(help.stdout, /never grants,\s+renews or records an approval/);
  const blank = cli(['--template', '--as-of', AS_OF]);
  assert.equal(blank.status, 0, blank.stderr);
  assert.match(blank.stdout, /BLANK TEMPLATE/);
  const before = readFileSync(examplePath, 'utf8');
  const sample = cli(['--records', examplePath, '--as-of', AS_OF]);
  assert.equal(sample.status, 0, sample.stderr);
  assert.match(sample.stdout, /SYNTHETIC EXAMPLE/);
  assert.ok(!sample.stdout.includes(root), 'output must not echo local paths');
  const json = JSON.parse(cli(['--records', examplePath, '--as-of', AS_OF, '--json']).stdout);
  assert.equal(json.authorizationsGranted, 0);
  assert.equal(json.authenticityVerified, false);
  assert.equal(readFileSync(examplePath, 'utf8'), before);
});

test('CLI fails closed without echoing paths or sensitive record values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'client-records-'));
  try {
    writeFileSync(join(dir, 'broken.json'), '{ "schemaVersion": ');
    const unsafe = copy(); decision(unsafe, 'decision-gate-example').note = 'Reach owner@example.com, token ghp_abcdefghijklmnopqrstuvwxyz123456';
    writeFileSync(join(dir, 'unsafe.json'), JSON.stringify(unsafe));
    const before = readdirSync(dir).sort();
    for (const [args, message] of [
      [[], /exactly one of --records FILE or --template/],
      [['--records', join(dir, 'broken.json'), '--template'], /exactly one of/],
      [['--records', join(dir, 'missing.json')], /Client records must be an existing regular file/],
      [['--records', join(dir, 'broken.json')], /Client records is not valid JSON/],
      [['--records', dir], /Client records must be an existing regular file/],
      [['--records', join(dir, 'unsafe.json'), '--as-of', AS_OF], /email address/],
      [['--records', examplePath, '--as-of', 'yesterday'], /--as-of must be a calendar date/],
      [['--unknown'], /Unknown option/],
    ]) {
      const result = cli(args);
      assert.equal(result.status, 1, args.join(' '));
      assert.equal(result.stdout, '');
      assert.match(result.stderr, message);
      assert.ok(!result.stderr.includes(dir), 'stderr must not echo local paths');
      assert.ok(!/owner@example|ghp_/.test(result.stderr), 'stderr must not echo record values');
    }
    assert.deepEqual(readdirSync(dir).sort(), before, 'validator must not write files');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
