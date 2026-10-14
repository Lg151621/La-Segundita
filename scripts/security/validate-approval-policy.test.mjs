import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { REQUIRED_ACTIONS, validateApprovalPolicy } from './validate-approval-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = join(root, 'docs/security/SECURITY-APPROVAL-POLICY.json');
const policyText = readFileSync(policyPath, 'utf8');
const policy = JSON.parse(policyText);
const copy = () => structuredClone(policy);
const action = (value, id) => value.actions.find(item => item.id === id);
const cls = (value, id) => value.approvalClasses.find(item => item.id === id);
const cli = (args, cwd = root) => spawnSync(process.execPath, [join(root, 'scripts/security/validate-approval-policy.mjs'), ...args], { cwd, encoding: 'utf8' });

test('bundled policy is valid, complete and grants nothing', () => {
  assert.deepEqual(validateApprovalPolicy(policy), { roleCount: 4, classCount: 4, actionCount: 17, evidenceFieldCount: 14, approvalsGranted: 0 });
  assert.deepEqual(policy.approvalClasses.map(item => item.id),
    ['routine_implementation', 'owner_reviewed_change', 'client_risk_acceptance', 'specialist_determination']);
  for (const id of REQUIRED_ACTIONS) assert.ok(action(policy, id), id);
  assert.equal(policy.status, 'guidance');
  assert.ok(Object.values(policy.boundaries).filter(value => typeof value === 'boolean').every(value => value === false));
});

test('policy semantics: automation never authorizes; risk is client-owned, expiring and non-delegable', () => {
  for (const item of policy.actions) {
    assert.ok(!item.requiredApprovals.includes('automation_agent'), item.id);
    assert.ok(!item.delegableTo.includes('automation_agent'), item.id);
  }
  for (const item of policy.approvalClasses) assert.ok(!item.authorizedBy.includes('automation_agent'), item.id);
  for (const item of policy.actions.filter(entry => entry.class === 'client_risk_acceptance')) {
    assert.ok(item.requiredApprovals.includes('client_decision_maker'), item.id);
    assert.equal(item.requiresExpiryOrReviewTrigger, true, item.id);
    assert.deepEqual(item.delegableTo, [], item.id);
  }
  assert.deepEqual(action(policy, 'compliance_claim_publication').requiredApprovals, ['specialist_reviewer', 'client_decision_maker']);
  assert.deepEqual(action(policy, 'regulatory_applicability_determination').requiredApprovals, ['specialist_reviewer']);
  assert.ok(action(policy, 'production_deployment').requiredApprovals.includes('client_decision_maker'));
  assert.equal(action(policy, 'ci_gate_weaken_or_bypass').class, 'client_risk_acceptance');
  assert.equal(action(policy, 'ci_gate_strengthen').class, 'owner_reviewed_change');
  for (const key of ['onUnknownAuthority', 'onInsufficientEvidence', 'onConflictingSignals', 'onScopeBeyondApproval']) {
    assert.equal(policy.defaultRule[key], 'stop_and_request_review');
  }
});

test('refinements: delegation is limited to routine scope for secrets, deployment and CMS publication only', () => {
  assert.equal(policy.defaultRule.assumeDelegation, false);
  const delegable = policy.actions.filter(item => item.delegableTo.length).map(item => item.id).sort();
  assert.deepEqual(delegable, ['cms_content_publish', 'production_deployment', 'secret_or_credential_change']);
  for (const id of delegable) {
    const limits = action(policy, id).delegationLimits;
    assert.ok(limits.routineScope.length >= 1 && limits.excludedSensitiveOperations.length >= 3, id);
    assert.ok(action(policy, id).requiredApprovals.includes('client_decision_maker'), id);
  }
  for (const id of ['cms_permission_change', 'production_data_access', 'ci_gate_weaken_or_bypass']) {
    const item = action(policy, id);
    assert.deepEqual(item.delegableTo, [], id);
    assert.equal(item.delegationLimits, null, id);
    assert.ok(['client_decision_maker', 'vitanova_technical_owner'].every(role => item.requiredApprovals.includes(role)), id);
  }
  // Time-limited: production data access and gate weakening. CMS permission changes keep their existing rules.
  for (const id of ['production_data_access', 'ci_gate_weaken_or_bypass']) assert.equal(action(policy, id).requiresExpiryOrReviewTrigger, true, id);
  for (const id of ['dependency_compatible_update', 'dependency_override', 'dependency_major_or_downgrade', 'lockfile_broad_churn', 'authentication_authorization_change']) {
    assert.deepEqual(action(policy, id).requiredApprovals, ['vitanova_technical_owner'], id);
    assert.ok(['material_client_impact', 'personal_or_regulated_data'].every(condition => action(policy, id).escalateWhen.includes(condition)), id);
  }
  for (const id of ['dependency_compatible_update', 'dependency_override', 'dependency_major_or_downgrade', 'lockfile_broad_churn', 'authentication_authorization_change']) {
    for (const condition of ['client_account_access_change', 'scope_beyond_approval']) assert.ok(action(policy, id).escalateWhen.includes(condition), `${id} ${condition}`);
  }
  for (const id of delegable) {
    assert.ok(action(policy, id).escalateWhen.includes('delegation_not_valid'), id);
    assert.match(action(policy, id).boundary, /still-valid delegation/, id);
  }
  assert.match(action(policy, 'ci_gate_weaken_or_bypass').boundary, /bounded scope, documented evidence, an expiry and re-review triggers/);
  const escalation = Object.fromEntries(policy.conditions.map(item => [item.id, item.escalatesTo]));
  assert.deepEqual(escalation.client_account_access_change, ['client_decision_maker']);
  assert.deepEqual(escalation.delegation_not_valid, ['client_decision_maker']);
  assert.deepEqual(escalation.material_client_impact, ['client_decision_maker']);
  assert.ok(escalation.personal_or_regulated_data.includes('specialist_reviewer'));
});

test('policy is portable: no project names, findings, dates, people or approvals embedded', () => {
  assert.doesNotMatch(policyText, /segundita|sanity\.io|vercel\.app/i);
  assert.doesNotMatch(policyText, /GHSA-|CVE-\d/);
  assert.doesNotMatch(policyText, /\d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(policyText, /DEPENDENCY-AUDIT-BASELINE|DEPENDENCY-RISK-REGISTER/);
  assert.doesNotMatch(policyText, /"(?:approved|approvedBy|approvedOn|reviewer|expiresOn)"\s*:/);
});

test('a recorded project approval is not a policy and is rejected', () => {
  const baseline = JSON.parse(readFileSync(join(root, 'docs/security/DEPENDENCY-AUDIT-BASELINE.json'), 'utf8'));
  assert.throws(() => validateApprovalPolicy(baseline), /Invalid security approval policy/);
  const disguised = copy(); disguised.actions[0].approval = baseline.approval;
  assert.throws(() => validateApprovalPolicy(disguised), /granted approval/);
});

const rejections = [
  ['non-object input', () => [], /top level/],
  ['retired schema version 1', value => { value.schemaVersion = 1; }, /schemaVersion 1 is no longer supported/],
  ['unsupported schema version', value => { value.schemaVersion = 3; }, /unsupported schemaVersion/],
  ['schema version as a string', value => { value.schemaVersion = '2'; }, /unsupported schemaVersion/],
  ['unknown top-level field', value => { value.extra = true; }, /unknown/],
  ['status other than guidance', value => { value.status = 'active'; }, /guidance/],
  ['boundary claims to grant approval', value => { value.boundaries.grantsApproval = true; }, /grantsApproval/],
  ['boundary treats passing checks as approval', value => { value.boundaries.passingCheckIsApproval = true; }, /passingCheckIsApproval/],
  ['default rule proceeds on unknown authority', value => { value.defaultRule.onUnknownAuthority = 'proceed'; }, /stop and request review/],
  ['default rule accepts risk implicitly', value => { value.defaultRule.implicitRiskAcceptance = true; }, /implicitly/],
  ['automation can authorize', value => { value.roles.find(role => role.id === 'automation_agent').canAuthorize = true; }, /automation_agent can never authorize/],
  ['unrecognized role', value => { value.roles[0].id = 'chief_wizard'; }, /recognized roles/],
  ['unrecognized class', value => { value.approvalClasses[0].id = 'misc'; }, /recognized classes/],
  ['duplicate action ID', value => { value.actions[1].id = value.actions[0].id; }, /duplicate/],
  ['unstable action ID', value => { value.actions[0].id = 'Routine-Change'; }, /unstable ID/],
  ['missing required action', value => { value.actions = value.actions.filter(item => item.id !== 'production_deployment'); }, /production_deployment/],
  ['unknown action class', value => { value.actions[0].class = 'quick_fix'; }, /unknown approval class/],
  ['automation as required approver', value => { action(value, 'dependency_override').requiredApprovals = ['automation_agent']; }, /requiredApprovals/],
  ['unknown approving role', value => { action(value, 'risk_acceptance').requiredApprovals = ['ceo']; }, /requiredApprovals/],
  ['approver outside the class', value => { action(value, 'risk_acceptance').requiredApprovals = ['specialist_reviewer']; }, /authorizer of its class/],
  ['risk acceptance by technical owner alone', value => { cls(value, 'client_risk_acceptance').authorizedBy = ['vitanova_technical_owner']; }, /only be authorized by the client/],
  ['risk acceptance without expiry', value => { action(value, 'risk_acceptance').requiresExpiryOrReviewTrigger = false; }, /expire/],
  ['delegated risk acceptance', value => { action(value, 'risk_acceptance').delegableTo = ['vitanova_technical_owner']; }, /cannot be delegated/],
  ['delegation to automation', value => { action(value, 'production_deployment').delegableTo = ['automation_agent']; }, /delegableTo/],
  ['delegation of a non-client decision', value => { action(value, 'dependency_override').delegableTo = ['vitanova_technical_owner']; }, /only client decisions/],
  ['missing core evidence', value => { action(value, 'dependency_override').requiredEvidence = action(value, 'dependency_override').requiredEvidence.filter(id => id !== 'exact_approval'); }, /class minimum/],
  ['expiry flag without expiry evidence', value => { const item = action(value, 'routine_scoped_change'); item.requiresExpiryOrReviewTrigger = true; }, /expiry_or_review_trigger/],
  ['unknown evidence field', value => { action(value, 'dependency_override').requiredEvidence.push('gut_feeling'); }, /requiredEvidence/],
  ['unknown escalation condition', value => { action(value, 'ci_gate_strengthen').escalateWhen = ['bad_vibes']; }, /escalateWhen/],
  // Phase 4B.1 refinements.
  ['assumed delegation', value => { value.defaultRule.assumeDelegation = true; }, /never assume a delegation/],
  ['escalation to automation', value => { value.conditions[0].escalatesTo = ['automation_agent']; }, /escalatesTo/],
  ['missing client-impact condition', value => { value.conditions = value.conditions.filter(item => item.id !== 'material_client_impact'); }, /client-impact/],
  ['client impact not escalated to the client', value => { value.conditions.find(item => item.id === 'material_client_impact').escalatesTo = ['vitanova_technical_owner']; }, /client decision-maker/],
  ['regulated data not escalated to a specialist', value => { value.conditions.find(item => item.id === 'personal_or_regulated_data').escalatesTo = ['client_decision_maker']; }, /specialist reviewer/],
  ['dependency change without impact escalation', value => { action(value, 'dependency_compatible_update').escalateWhen = ['new_or_changed_risk']; }, /must escalate material client impact/],
  ['authentication change without regulated-data escalation', value => { action(value, 'authentication_authorization_change').escalateWhen = ['material_client_impact']; }, /must escalate material client impact/],
  // Phase 4B.1 finalization.
  ['dependency change without out-of-scope escalation', value => { const item = action(value, 'dependency_override'); item.escalateWhen = item.escalateWhen.filter(id => id !== 'scope_beyond_approval'); }, /out-of-scope work/],
  ['authentication change without account-access escalation', value => { const item = action(value, 'authentication_authorization_change'); item.escalateWhen = item.escalateWhen.filter(id => id !== 'client_account_access_change'); }, /account access/],
  ['missing account-access condition', value => { value.conditions = value.conditions.filter(item => item.id !== 'client_account_access_change'); }, /account-access/],
  ['missing delegation condition', value => { value.conditions = value.conditions.filter(item => item.id !== 'delegation_not_valid'); }, /delegation escalations/],
  ['account-access change not escalated to the client', value => { value.conditions.find(item => item.id === 'client_account_access_change').escalatesTo = ['vitanova_technical_owner']; }, /client_account_access_change must escalate to the client/],
  ['invalid delegation not escalated to the client', value => { value.conditions.find(item => item.id === 'delegation_not_valid').escalatesTo = ['vitanova_technical_owner']; }, /delegation_not_valid must escalate to the client/],
  ['delegable action that ignores invalid delegation', value => { const item = action(value, 'production_deployment'); item.escalateWhen = item.escalateWhen.filter(id => id !== 'delegation_not_valid'); }, /no valid delegation/],
  ['dependency change no longer owner-approved', value => { action(value, 'dependency_override').requiredApprovals = ['client_decision_maker', 'vitanova_technical_owner']; }, /technical-owner approved/],
  ['delegable CMS permission change', value => { const item = action(value, 'cms_permission_change'); item.delegableTo = ['vitanova_technical_owner']; }, /cannot be delegated/],
  ['delegable production data access', value => { const item = action(value, 'production_data_access'); item.delegableTo = ['vitanova_technical_owner']; }, /cannot be delegated/],
  ['delegable gate bypass', value => { const item = action(value, 'ci_gate_weaken_or_bypass'); item.delegableTo = ['vitanova_technical_owner']; }, /cannot be delegated/],
  ['CMS permission change without the technical owner', value => { action(value, 'cms_permission_change').requiredApprovals = ['client_decision_maker']; }, /both the client decision-maker and the technical owner/],
  ['production data access without the client', value => { action(value, 'production_data_access').requiredApprovals = ['vitanova_technical_owner']; }, /both the client decision-maker and the technical owner/],
  ['production data access without expiry', value => { action(value, 'production_data_access').requiresExpiryOrReviewTrigger = false; }, /expire/],
  ['gate bypass by the client alone', value => { action(value, 'ci_gate_weaken_or_bypass').requiredApprovals = ['client_decision_maker']; }, /both the client decision-maker and the technical owner/],
  ['gate bypass reclassified as routine review', value => { action(value, 'ci_gate_weaken_or_bypass').class = 'owner_reviewed_change'; }, /client risk acceptance/],
  ['delegable action without limits', value => { action(value, 'production_deployment').delegationLimits = null; }, /must define delegationLimits/],
  ['delegation without excluded sensitive operations', value => { action(value, 'secret_or_credential_change').delegationLimits.excludedSensitiveOperations = []; }, /excludedSensitiveOperations/],
  ['limits on a non-delegable action', value => { action(value, 'risk_acceptance').delegationLimits = { routineScope: ['x'], excludedSensitiveOperations: ['y'] }; }, /must be null/],
  ['incomplete evidence checklist', value => { value.evidenceFields = value.evidenceFields.filter(item => item.id !== 'alternatives'); }, /checklist/],
  ['secrets allowed in evidence', value => { value.prohibitedEvidenceContent = ['production_data_extracts']; }, /prohibitedEvidenceContent/],
  ['missing default stop condition', value => { value.conditions = value.conditions.filter(item => item.id !== 'conflicting_signals'); }, /stop conditions/],
  ['granted-approval field', value => { action(value, 'risk_acceptance').approvedBy = 'client'; }, /granted approval/],
  ['nested expiry field', value => { value.boundaries.expiresOn = 'soon'; }, /granted approval/],
  ['embedded date', value => { action(value, 'risk_acceptance').examples = ['Accepted until 2030-01-01']; }, /calendar date/],
  ['embedded advisory', value => { action(value, 'risk_acceptance').examples = ['Keep GHSA-abcd-1234-efgh']; }, /advisory identifier/],
  ['embedded email', value => { value.roles[1].description = 'Ask owner@example.com'; }, /email/],
  ['embedded phone', value => { value.roles[1].description = 'Call +1 (555) 010-1234'; }, /phone-like/],
  ['embedded credential', value => { value.boundaries.note = 'Use ghp_abcdefghijklmnopqrstuvwxyz123456'; }, /credential-like/],
  ['legal guarantee wording', value => { action(value, 'compliance_claim_publication').boundary = 'The site is fully compliant once reviewed.'; }, /legal guarantee/],
  ['overlong text', value => { value.roles[0].description = 'x'.repeat(500); }, /description/],
];
for (const [name, mutate, message] of rejections) {
  test(`rejects ${name}`, () => {
    const value = copy();
    const replaced = mutate(value);
    assert.throws(() => validateApprovalPolicy(replaced ?? value), message);
  });
}

test('CLI validates the bundled policy read-only and reports that nothing is approved', () => {
  const before = statSync(policyPath).mtimeMs;
  const result = cli([]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^Security approval policy valid: 4 roles, 4 approval classes, 17 actions, 14 evidence fields\. Guidance only; no approval is granted or recorded\.\n$/);
  assert.equal(statSync(policyPath).mtimeMs, before);
  assert.equal(readFileSync(policyPath, 'utf8'), policyText);
});

test('CLI fails closed on invalid inputs without echoing paths or contents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'approval-policy-'));
  try {
    writeFileSync(join(dir, 'broken.json'), '{ "schemaVersion": ');
    const unsafe = copy(); unsafe.boundaries.note = 'Token ghp_abcdefghijklmnopqrstuvwxyz123456';
    writeFileSync(join(dir, 'unsafe.json'), JSON.stringify(unsafe));
    const before = readdirSync(dir).sort();
    for (const [args, message] of [
      [['--policy', join(dir, 'missing.json')], /Approval policy must be an existing regular file/],
      [['--policy', join(dir, 'broken.json')], /Approval policy is not valid JSON/],
      [['--policy', dir], /Approval policy must be an existing regular file/],
      [['--policy', join(dir, 'unsafe.json')], /credential-like/],
      [['--unknown'], /Unknown option/],
      [[join(dir, 'broken.json')], /Unexpected positional argument/],
    ]) {
      const result = cli(args);
      assert.equal(result.status, 1, args.join(' '));
      assert.equal(result.stdout, '');
      assert.match(result.stderr, message);
      assert.ok(!result.stderr.includes(dir), 'stderr must not echo local paths');
      assert.ok(!result.stderr.includes('ghp_'), 'stderr must not echo secret-like values');
    }
    assert.deepEqual(readdirSync(dir).sort(), before, 'validator must not write files');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
