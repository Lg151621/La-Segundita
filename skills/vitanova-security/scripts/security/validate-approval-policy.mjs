import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAMEWORK_ROOT, UsageError, parseOptions, readJsonFile } from './security-cli.mjs';

// Read-only validator for the portable security approval policy. The policy is guidance: it describes who must
// decide and what to record per project. This validator checks that description; it never treats anything as approved.

export const BUNDLED_POLICY = 'docs/security/SECURITY-APPROVAL-POLICY.json';
const MAX_POLICY_BYTES = 128 * 1024;
const MAX_TEXT = 400;
const MAX_ITEMS = 64;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const POLICY_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const ROLE_IDS = ['vitanova_technical_owner', 'client_decision_maker', 'specialist_reviewer', 'automation_agent'];
const CLASS_IDS = ['routine_implementation', 'owner_reviewed_change', 'client_risk_acceptance', 'specialist_determination'];
const CORE_EVIDENCE = ['project_id', 'change_or_risk_id', 'scope', 'approver_role', 'exact_approval', 'decision_timestamp',
  'verification', 'audit_trail'];
const CHECKLIST_EVIDENCE = [...CORE_EVIDENCE, 'affected_asset', 'source_evidence', 'alternatives', 'potential_impact',
  'expiry_or_review_trigger', 'delegation_record'];
const PROHIBITED_CONTENT = ['secret_values', 'credentials_or_tokens', 'personal_data', 'production_data_extracts'];
const STOP_CONDITIONS = ['unknown_authority', 'insufficient_evidence', 'conflicting_signals'];
// Escalations that dependency and authentication changes must always carry: they stay technical-owner approved within
// existing authority, and escalate material client impact, changed account access, regulated data and out-of-scope work.
const IMPACT_ESCALATIONS = ['material_client_impact', 'client_account_access_change', 'personal_or_regulated_data', 'scope_beyond_approval'];
// Conditions that must bring the client decision-maker in.
const CLIENT_ESCALATIONS = ['material_client_impact', 'client_account_access_change', 'delegation_not_valid'];
const OWNER_APPROVED_WITH_ESCALATION = ['dependency_compatible_update', 'dependency_override', 'dependency_major_or_downgrade',
  'lockfile_broad_churn', 'authentication_authorization_change'];
// Decisions that a written delegation can never cover.
const NEVER_DELEGABLE = ['cms_permission_change', 'production_data_access', 'ci_gate_weaken_or_bypass', 'risk_acceptance',
  'risk_acceptance_renewal', 'regulatory_applicability_determination', 'compliance_claim_publication'];
// Actions that always need both the client decision-maker and the technical owner.
const DUAL_AUTHORIZATION = ['cms_permission_change', 'production_data_access', 'ci_gate_weaken_or_bypass'];
// Every sensitive area the policy must cover, by stable action ID.
export const REQUIRED_ACTIONS = ['routine_scoped_change', 'dependency_compatible_update', 'dependency_override',
  'dependency_major_or_downgrade', 'lockfile_broad_churn', 'secret_or_credential_change',
  'authentication_authorization_change', 'cms_permission_change', 'cms_content_publish', 'ci_gate_strengthen',
  'ci_gate_weaken_or_bypass', 'production_data_access', 'production_deployment', 'risk_acceptance',
  'risk_acceptance_renewal', 'regulatory_applicability_determination', 'compliance_claim_publication'];

// v2: v1 policies lacked the account-access and delegation escalations that v2 requires.
export const SCHEMA_VERSION = 2;
const TOP_KEYS = ['schemaVersion', 'kind', 'policyId', 'status', 'boundaries', 'defaultRule', 'roles', 'approvalClasses',
  'evidenceFields', 'prohibitedEvidenceContent', 'conditions', 'actions'];
const BOUNDARY_FLAGS = ['grantsApproval', 'isEnforcementEngine', 'isLegalAdvice', 'establishesSigningAuthority',
  'detectionImpliesLegalApplicability', 'passingCheckIsApproval', 'recommendationIsAuthorization'];
const DEFAULT_STOPS = ['onUnknownAuthority', 'onInsufficientEvidence', 'onConflictingSignals', 'onScopeBeyondApproval'];
const ROLE_KEYS = ['id', 'name', 'description', 'canRecommend', 'canAuthorize', 'canExecute'];
const CLASS_KEYS = ['id', 'name', 'description', 'recommendedBy', 'authorizedBy', 'executedBy', 'minimumEvidence'];
const ACTION_KEYS = ['id', 'name', 'class', 'examples', 'boundary', 'requiredApprovals', 'delegableTo', 'delegationLimits',
  'requiresExpiryOrReviewTrigger', 'requiredEvidence', 'escalateWhen'];

// A portable policy must not look like a recorded decision or carry project data.
const GRANTED_KEY = /^(?:approved|approvedBy|approvedOn|approvedAt|approval|approvalStatus|approvals|approver|approverName|granted|grantedBy|grantedOn|grantedAt|signature|signedBy|signedOn|token|authorizationToken|expiresOn|expiry|reviewer)$/i;
const UNSAFE_TEXT = [
  [/\b\d{4}-\d{2}-\d{2}\b/, 'a calendar date (decisions and expiries belong in project records)'],
  [/\b(?:GHSA-[a-z0-9]{4}-|CVE-\d{4}-)/i, 'an advisory identifier (findings belong in project records)'],
  [/[^\s@]+@[^\s@]+\.[a-z]{2,}/i, 'an email address'],
  [/\+?\d[\d ().-]{8,}\d/, 'a phone-like number'],
  [/(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk_(?:live|test)_[A-Za-z0-9]{10,}|xox[abprs]-|-----BEGIN [A-Z ]*PRIVATE KEY|\bBearer\s+[A-Za-z0-9._-]{20,})/, 'a credential-like value'],
  [/\bguarantee[sd]?\b|\bcertif(?:y|ied|ies|ication)\b|\b(?:is|are|be) (?:fully )?compliant\b/i, 'a legal guarantee or certification claim'],
];

function fail(message) { throw new Error(`Invalid security approval policy: ${message}`); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT; }
function idList(value, { allowEmpty = false, max = MAX_ITEMS } = {}) {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= max &&
    value.every(item => typeof item === 'string' && ID_PATTERN.test(item)) && new Set(value).size === value.length;
}
function exactKeys(value, keys, label) {
  const actual = Object.keys(value);
  const unknown = actual.filter(key => !keys.includes(key));
  const missing = keys.filter(key => !actual.includes(key));
  if (unknown.length || missing.length) fail(`${label} has ${unknown.length ? 'unknown' : 'missing'} field(s)`);
}
function subset(values, allowed) { return values.every(value => allowed.includes(value)); }

// Recursively rejects keys that read as a recorded approval and text that carries project data or secrets.
function scan(value, path = 'policy') {
  if (Array.isArray(value)) { value.forEach((item, index) => scan(item, `${path}[${index}]`)); return; }
  if (object(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (GRANTED_KEY.test(key)) fail(`${path} uses a field that reads as a granted approval`);
      scan(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string') {
    for (const [pattern, reason] of UNSAFE_TEXT) if (pattern.test(value)) fail(`${path} contains ${reason}`);
  }
}

function uniqueItems(list, keys, label) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_ITEMS) fail(`${label} must be a non-empty list`);
  const ids = new Set();
  for (const item of list) {
    if (!object(item)) fail(`${label} entries must be objects`);
    exactKeys(item, keys, `${label} entry`);
    if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id) || item.id.length > 80) fail(`${label} has an unstable ID`);
    if (ids.has(item.id)) fail(`${label} has duplicate ID ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

export function validateApprovalPolicy(policy) {
  if (!object(policy)) fail('top level must be an object');
  exactKeys(policy, TOP_KEYS, 'top level');
  if (policy.schemaVersion === 1) fail('schemaVersion 1 is no longer supported; update the policy to schemaVersion 2');
  if (policy.schemaVersion !== SCHEMA_VERSION) fail('unsupported schemaVersion');
  if (policy.kind !== 'security-approval-policy') fail('unexpected kind');
  if (typeof policy.policyId !== 'string' || !POLICY_ID_PATTERN.test(policy.policyId)) fail('invalid policyId');
  if (policy.status !== 'guidance') fail('status must be "guidance"; the policy never records or grants approval');
  scan(policy);

  const boundaries = policy.boundaries;
  if (!object(boundaries)) fail('boundaries missing');
  exactKeys(boundaries, [...BOUNDARY_FLAGS, 'note'], 'boundaries');
  for (const flag of BOUNDARY_FLAGS) if (boundaries[flag] !== false) fail(`boundaries.${flag} must be false`);
  if (!text(boundaries.note)) fail('boundaries.note missing');

  const rule = policy.defaultRule;
  if (!object(rule)) fail('defaultRule missing');
  exactKeys(rule, [...DEFAULT_STOPS, 'implicitRiskAcceptance', 'silenceIsApproval', 'assumeDelegation'], 'defaultRule');
  for (const key of DEFAULT_STOPS) if (rule[key] !== 'stop_and_request_review') fail(`defaultRule.${key} must stop and request review`);
  if (rule.implicitRiskAcceptance !== false || rule.silenceIsApproval !== false) fail('defaultRule must never accept risk implicitly');
  if (rule.assumeDelegation !== false) fail('defaultRule must never assume a delegation exists');

  const roleIds = uniqueItems(policy.roles, ROLE_KEYS, 'roles');
  if (roleIds.size !== ROLE_IDS.length || !ROLE_IDS.every(id => roleIds.has(id))) fail('roles must be exactly the recognized roles');
  const roles = Object.fromEntries(policy.roles.map(role => [role.id, role]));
  for (const role of policy.roles) {
    if (!text(role.name) || !text(role.description)) fail(`${role.id}: name and description required`);
    for (const flag of ['canRecommend', 'canAuthorize', 'canExecute']) if (typeof role[flag] !== 'boolean') fail(`${role.id}: ${flag} must be boolean`);
  }
  if (roles.automation_agent.canAuthorize !== false) fail('automation_agent can never authorize');
  if (roles.client_decision_maker.canAuthorize !== true) fail('client_decision_maker must be able to authorize client decisions');
  const authorizers = ROLE_IDS.filter(id => roles[id].canAuthorize);
  const executors = ROLE_IDS.filter(id => roles[id].canExecute);
  const recommenders = ROLE_IDS.filter(id => roles[id].canRecommend);

  const evidenceIds = uniqueItems(policy.evidenceFields, ['id', 'description'], 'evidenceFields');
  if (!CHECKLIST_EVIDENCE.every(id => evidenceIds.has(id))) fail('evidenceFields must include the full decision checklist');
  for (const field of policy.evidenceFields) if (!text(field.description)) fail(`${field.id}: description required`);
  const evidence = [...evidenceIds];

  if (!idList(policy.prohibitedEvidenceContent) || !subset(PROHIBITED_CONTENT, policy.prohibitedEvidenceContent)) {
    fail('prohibitedEvidenceContent must exclude secrets, credentials, personal data and production data');
  }

  const conditionIds = uniqueItems(policy.conditions, ['id', 'description', 'escalatesTo'], 'conditions');
  if (!STOP_CONDITIONS.every(id => conditionIds.has(id))) fail('conditions must include the default stop conditions');
  if (![...IMPACT_ESCALATIONS, 'delegation_not_valid'].every(id => conditionIds.has(id))) {
    fail('conditions must include client-impact, account-access, regulated-data, out-of-scope and delegation escalations');
  }
  for (const condition of policy.conditions) {
    if (!text(condition.description)) fail(`${condition.id}: description required`);
    if (!idList(condition.escalatesTo) || !subset(condition.escalatesTo, authorizers)) fail(`${condition.id}: escalatesTo must name human roles that can authorize`);
  }
  const conditions = Object.fromEntries(policy.conditions.map(item => [item.id, item]));
  for (const id of CLIENT_ESCALATIONS) if (!conditions[id].escalatesTo.includes('client_decision_maker')) fail(`${id} must escalate to the client decision-maker`);
  if (!conditions.personal_or_regulated_data.escalatesTo.includes('specialist_reviewer')) fail('personal_or_regulated_data must escalate to a specialist reviewer');

  const classIds = uniqueItems(policy.approvalClasses, CLASS_KEYS, 'approvalClasses');
  if (classIds.size !== CLASS_IDS.length || !CLASS_IDS.every(id => classIds.has(id))) fail('approvalClasses must be exactly the recognized classes');
  const classes = Object.fromEntries(policy.approvalClasses.map(item => [item.id, item]));
  for (const item of policy.approvalClasses) {
    if (!text(item.name) || !text(item.description)) fail(`${item.id}: name and description required`);
    if (!idList(item.recommendedBy) || !subset(item.recommendedBy, recommenders)) fail(`${item.id}: recommendedBy must name roles that can recommend`);
    if (!idList(item.authorizedBy) || !subset(item.authorizedBy, authorizers)) fail(`${item.id}: authorizedBy must name roles that can authorize`);
    if (!idList(item.executedBy) || !subset(item.executedBy, executors)) fail(`${item.id}: executedBy must name roles that can execute`);
    if (!idList(item.minimumEvidence) || !subset(item.minimumEvidence, evidence) || !subset(CORE_EVIDENCE, item.minimumEvidence)) {
      fail(`${item.id}: minimumEvidence must be known fields including the core checklist`);
    }
  }
  if (!classes.client_risk_acceptance.authorizedBy.includes('client_decision_maker') ||
      classes.client_risk_acceptance.authorizedBy.some(id => id !== 'client_decision_maker')) {
    fail('client_risk_acceptance can only be authorized by the client decision-maker');
  }
  if (!classes.client_risk_acceptance.minimumEvidence.includes('expiry_or_review_trigger')) fail('client_risk_acceptance must record an expiry or review trigger');
  if (!classes.specialist_determination.authorizedBy.includes('specialist_reviewer')) fail('specialist_determination requires a specialist reviewer');

  const actionIds = uniqueItems(policy.actions, ACTION_KEYS, 'actions');
  const missingActions = REQUIRED_ACTIONS.filter(id => !actionIds.has(id));
  if (missingActions.length) fail(`actions missing required coverage: ${missingActions.join(', ')}`);
  for (const action of policy.actions) {
    const item = classes[action.class];
    if (!item) fail(`${action.id}: unknown approval class`);
    if (!text(action.name) || !text(action.boundary)) fail(`${action.id}: name and boundary required`);
    if (!Array.isArray(action.examples) || !action.examples.length || action.examples.length > 10 || !action.examples.every(text)) fail(`${action.id}: examples required`);
    if (!idList(action.requiredApprovals) || !subset(action.requiredApprovals, authorizers)) fail(`${action.id}: requiredApprovals must name roles that can authorize`);
    if (!action.requiredApprovals.some(id => item.authorizedBy.includes(id))) fail(`${action.id}: requiredApprovals must include an authorizer of its class`);
    if (action.class === 'client_risk_acceptance' && !action.requiredApprovals.includes('client_decision_maker')) fail(`${action.id}: risk acceptance requires the client decision-maker`);
    if (action.class === 'specialist_determination' && !action.requiredApprovals.includes('specialist_reviewer')) fail(`${action.id}: requires a specialist reviewer`);
    if (!idList(action.delegableTo, { allowEmpty: true }) || action.delegableTo.some(id => id === 'automation_agent' || id === 'specialist_reviewer' || !roles[id]?.canAuthorize)) {
      fail(`${action.id}: delegableTo may only name a human role that can authorize`);
    }
    if (action.delegableTo.length && !action.requiredApprovals.includes('client_decision_maker')) fail(`${action.id}: only client decisions can be delegated`);
    if (action.delegableTo.length && (action.class === 'client_risk_acceptance' || NEVER_DELEGABLE.includes(action.id))) fail(`${action.id}: cannot be delegated`);
    // A delegation covers routine work only: delegable actions must spell out what it covers and what it never covers.
    if (action.delegableTo.length) {
      // Delegated work stops when no written, scoped, still-valid delegation covers it.
      if (!action.escalateWhen.includes('delegation_not_valid')) fail(`${action.id}: delegable actions must escalate when no valid delegation applies`);
      const limits = action.delegationLimits;
      if (!object(limits)) fail(`${action.id}: delegable actions must define delegationLimits`);
      exactKeys(limits, ['routineScope', 'excludedSensitiveOperations'], `${action.id} delegationLimits`);
      for (const key of ['routineScope', 'excludedSensitiveOperations']) {
        if (!Array.isArray(limits[key]) || !limits[key].length || limits[key].length > 10 || !limits[key].every(text)) fail(`${action.id}: delegationLimits.${key} must list operations`);
      }
    } else if (action.delegationLimits !== null) fail(`${action.id}: delegationLimits must be null when the action is not delegable`);
    if (DUAL_AUTHORIZATION.includes(action.id) &&
        !['client_decision_maker', 'vitanova_technical_owner'].every(id => action.requiredApprovals.includes(id))) {
      fail(`${action.id}: requires both the client decision-maker and the technical owner`);
    }
    if (OWNER_APPROVED_WITH_ESCALATION.includes(action.id)) {
      if (action.requiredApprovals.length !== 1 || action.requiredApprovals[0] !== 'vitanova_technical_owner') fail(`${action.id}: must remain technical-owner approved`);
      if (!subset(IMPACT_ESCALATIONS, action.escalateWhen)) fail(`${action.id}: must escalate material client impact, account access, regulated data and out-of-scope work`);
    }
    if (typeof action.requiresExpiryOrReviewTrigger !== 'boolean') fail(`${action.id}: requiresExpiryOrReviewTrigger must be boolean`);
    if (action.class === 'client_risk_acceptance' && !action.requiresExpiryOrReviewTrigger) fail(`${action.id}: risk acceptance must expire or have a review trigger`);
    if (!idList(action.requiredEvidence) || !subset(action.requiredEvidence, evidence) || !subset(item.minimumEvidence, action.requiredEvidence)) {
      fail(`${action.id}: requiredEvidence must be known fields covering its class minimum`);
    }
    if (action.requiresExpiryOrReviewTrigger && !action.requiredEvidence.includes('expiry_or_review_trigger')) fail(`${action.id}: must record expiry_or_review_trigger`);
    if (!idList(action.escalateWhen) || !subset(action.escalateWhen, [...conditionIds])) fail(`${action.id}: escalateWhen must name known conditions`);
  }

  for (const id of ['production_data_access', 'ci_gate_weaken_or_bypass']) {
    if (!policy.actions.find(item => item.id === id).requiresExpiryOrReviewTrigger) fail(`${id}: must expire or have a review trigger`);
  }
  if (policy.actions.find(item => item.id === 'ci_gate_weaken_or_bypass').class !== 'client_risk_acceptance') fail('ci_gate_weaken_or_bypass must be a client risk acceptance');

  return { roleCount: roleIds.size, classCount: classIds.size, actionCount: actionIds.size,
    evidenceFieldCount: evidenceIds.size, approvalsGranted: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2), { values: ['policy'] });
    const policy = readJsonFile(options.policy ?? join(FRAMEWORK_ROOT, BUNDLED_POLICY), MAX_POLICY_BYTES, 'Approval policy');
    const result = validateApprovalPolicy(policy);
    process.stdout.write(`Security approval policy valid: ${result.roleCount} roles, ${result.classCount} approval classes, ` +
      `${result.actionCount} actions, ${result.evidenceFieldCount} evidence fields. Guidance only; no approval is granted or recorded.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof UsageError || /^Invalid security approval policy/.test(error.message)
      ? error.message : 'Security approval policy could not be validated.'}\n`);
    process.exitCode = 1;
  }
}
