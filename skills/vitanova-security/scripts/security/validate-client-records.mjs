import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAMEWORK_ROOT, UsageError, parseOptions, readJsonFile } from './security-cli.mjs';
import { BUNDLED_POLICY, validateApprovalPolicy } from './validate-approval-policy.mjs';

// Read-only validator for one project's security records (role assignments, delegations, decisions, risk acceptances
// and audit trail) checked against the approval policy. It checks FORM only: whether the records are complete and
// consistent with the policy. It cannot verify identities, signatures or that evidence is genuine, so nothing it
// reports is an authorization, and a file's existence never implies that anyone approved anything.

export const SCHEMA_VERSION = 1;
export const RECORDS_KIND = 'client-security-records';
export const TEMPLATE_PATH = 'docs/security/templates/CLIENT-SECURITY-RECORDS.template.json';
const MAX_RECORDS_BYTES = 512 * 1024;
const MAX_POLICY_BYTES = 128 * 1024;
const MAX_TEXT = 600;
const MAX_ITEMS = 200;
const MAX_ERRORS = 50;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const FINDING_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/;
// Opaque "kind:reference" pointers (pr:12, ticket:EX-101, doc:signed-delegation-001, repo:docs/x.md); never contents.
const EVIDENCE_REF = /^[a-z][a-z0-9-]{0,23}:[A-Za-z0-9][A-Za-z0-9._/#-]{0,119}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const RECORD_STATUS = ['template', 'synthetic_example', 'project'];
const VERIFICATION = ['unverified', 'human_confirmed'];
const DELEGATION_STATUS = ['proposed', 'active', 'revoked', 'expired'];
const DECISION_STATUS = ['proposed', 'pending', 'approved', 'rejected', 'withdrawn'];
const SIGNOFF_DECISIONS = ['approved', 'rejected'];
const AUDIT_EVENTS = ['requested', 'recorded', 'reviewed', 'confirmed', 'status_changed', 'revoked', 'renewed'];
// Private, access-controlled storage is the default; Git storage needs an explicit client decision.
const STORAGE_LOCATIONS = ['private_access_controlled', 'git_repository'];
const STORAGE_REVIEW = ['not_reviewed', 'reviewed_no_sensitive_content'];
const BOUNDARY_FLAGS = ['grantsApproval', 'verifiesIdentity', 'verifiesAuthenticity', 'isLegalAdvice'];

// Records may name findings and dates (they belong to one project), but never contact details, secrets or documents.
const UNSAFE_TEXT = [
  [/[^\s@:]+@[^\s@]+\.[a-z]{2,}/i, 'an email address'],
  [/(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/, 'a phone-like number'],
  [/(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk_(?:live|test)_[A-Za-z0-9]{10,}|xox[abprs]-|-----BEGIN [A-Z ]*PRIVATE KEY|\bBearer\s+[A-Za-z0-9._-]{20,})/, 'a credential-like value'],
  [/\b(?:password|passwd|api[_ -]?key|secret[_ -]?key|private[_ -]?key|access[_ -]?token)\s*[:=]/i, 'a credential assignment'],
  [/data:[a-z]+\/[a-z0-9.+-]+;base64,|[A-Za-z0-9+/]{60,}={0,2}/, 'an embedded file, signature or encoded blob'],
];

// Field specs. Kinds ending in "?" also accept null.
const SPEC = {
  top: { schemaVersion: 'any', kind: 'any', recordStatus: RECORD_STATUS, policy: 'object', boundaries: 'object', project: 'object',
    storage: 'object', roleAssignments: 'list', delegations: 'list', decisions: 'list', riskAcceptances: 'list', auditTrail: 'list' },
  policy: { policyId: 'text', schemaVersion: 'any' },
  boundaries: { grantsApproval: false, verifiesIdentity: false, verifiesAuthenticity: false, isLegalAdvice: false, note: 'text' },
  project: { id: 'id', note: 'text?' },
  storage: { location: STORAGE_LOCATIONS, sensitiveDataReview: STORAGE_REVIEW, note: 'text?' },
  roleAssignment: { id: 'id', role: 'role', holderRef: 'id', holdsOtherRoles: 'boolean', verification: VERIFICATION, evidenceRefs: 'refs',
    confirmedAt: 'timestamp?', confirmedByRole: 'role?', endedAt: 'timestamp?', note: 'text?' },
  delegation: { id: 'id', action: 'action', status: DELEGATION_STATUS, grantorAssignmentRef: 'id', recipientAssignmentRef: 'id',
    scope: 'text', policyExclusionsApply: true, evidenceRefs: 'refs', issuedAt: 'timestamp?', expiresOn: 'date?',
    revokedAt: 'timestamp?', verification: VERIFICATION },
  decision: { id: 'id', action: 'action', status: DECISION_STATUS, scope: 'text', changeRefs: 'refs', escalations: 'conditions',
    delegationRef: 'id?', delegatedScopeConfirmation: 'scopeConfirmation?', signoffs: 'list', conditions: 'texts', reviewBy: 'date?', expiresOn: 'date?', reviewTriggers: 'texts', note: 'text?' },
  signoff: { assignmentRef: 'id', role: 'role', decision: SIGNOFF_DECISIONS, decidedAt: 'timestamp', evidenceRefs: 'refs', verification: VERIFICATION },
  riskAcceptance: { id: 'id', decisionRef: 'id', renewsRef: 'id?', findings: 'list', compensatingControls: 'texts',
    residualRiskRationale: 'text', evidenceRefs: 'refs' },
  finding: { id: 'finding', source: 'text', affectedAsset: 'text' },
  audit: { id: 'id', recordRef: 'id', event: AUDIT_EVENTS, actorRole: 'anyRole', actorRef: 'id?', at: 'timestamp', evidenceRefs: 'refs', note: 'text?' },
};

export class RecordsError extends Error {
  constructor(errors) { super(`Invalid client security records:\n${errors.map(item => `- ${item}`).join('\n')}`); this.errors = errors; }
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT; }
function calendarDate(value) {
  const match = typeof value === 'string' && DATE.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === +match[1] && date.getUTCMonth() + 1 === +match[2] && date.getUTCDate() === +match[3];
}
function timestamp(value) { const match = typeof value === 'string' && TIMESTAMP.exec(value); return Boolean(match) && calendarDate(match[1]) && !Number.isNaN(Date.parse(value)); }
const endOfDay = date => Date.parse(`${date}T23:59:59.999Z`);
const dayOf = instant => new Date(instant).toISOString().slice(0, 10);
const label = (list, item, index) => `${list}[${object(item) && typeof item.id === 'string' && ID.test(item.id) && item.id.length <= 64 ? item.id : `#${index}`}]`;

export function validateClientRecords(records, policy, { asOf } = {}) {
  validateApprovalPolicy(policy);
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  if (!calendarDate(today)) throw new UsageError('--as-of must be a calendar date (YYYY-MM-DD)');
  const now = endOfDay(today);
  const errors = [];
  const err = message => { if (errors.length < MAX_ERRORS) errors.push(message); };
  const roles = Object.fromEntries(policy.roles.map(role => [role.id, role]));
  const authorizers = policy.roles.filter(role => role.canAuthorize).map(role => role.id);
  const actions = Object.fromEntries(policy.actions.map(item => [item.id, item]));
  const conditions = Object.fromEntries(policy.conditions.map(item => [item.id, item]));

  // Shape: exact keys and typed values. Messages name paths and record IDs only, never values.
  function field(kind, value) {
    if (Array.isArray(kind)) return kind.includes(value);
    if (typeof kind === 'boolean') return value === kind;
    const optional = kind.endsWith('?');
    if (optional && value === null) return true;
    switch (optional ? kind.slice(0, -1) : kind) {
      case 'any': return true;
      case 'object': return object(value);
      case 'boolean': return typeof value === 'boolean';
      case 'scopeConfirmation': return object(value) && Object.keys(value).sort().join() === 'confirmedAt,confirmedByRole,evidenceRefs' &&
        field('role', value.confirmedByRole) && field('timestamp', value.confirmedAt) && field('refs', value.evidenceRefs) && value.evidenceRefs.length > 0;
      case 'list': return Array.isArray(value) && value.length <= MAX_ITEMS;
      case 'text': return text(value);
      case 'texts': return Array.isArray(value) && value.length <= 20 && value.every(text);
      case 'id': return typeof value === 'string' && value.length <= 64 && ID.test(value);
      case 'finding': return typeof value === 'string' && FINDING_ID.test(value);
      case 'role': return authorizers.includes(value);
      case 'anyRole': return Object.hasOwn(roles, value);
      case 'action': return typeof value === 'string' && Object.hasOwn(actions, value);
      case 'conditions': return Array.isArray(value) && value.length <= 20 && value.every(id => typeof id === 'string' && Object.hasOwn(conditions, id)) && new Set(value).size === value.length;
      case 'refs': return Array.isArray(value) && value.length <= 20 && value.every(ref => typeof ref === 'string' && EVIDENCE_REF.test(ref) && !ref.split(/[:/]/).includes('..')) && new Set(value).size === value.length;
      case 'date': return calendarDate(value);
      case 'timestamp': return timestamp(value);
      default: return false;
    }
  }
  function shape(value, spec, path) {
    if (!object(value)) { err(`${path} must be an object`); return false; }
    const unknown = Object.keys(value).filter(key => !Object.hasOwn(spec, key));
    const missing = Object.keys(spec).filter(key => !Object.hasOwn(value, key));
    if (unknown.length || missing.length) { err(`${path} has ${unknown.length ? 'unknown' : 'missing'} field(s)`); return false; }
    let ok = true;
    for (const [key, kind] of Object.entries(spec)) if (!field(kind, value[key])) { err(`${path}.${key} is missing or invalid`); ok = false; }
    return ok;
  }
  function scan(value, path) {
    if (Array.isArray(value)) { value.forEach((item, index) => scan(item, `${path}[${index}]`)); return; }
    if (object(value)) { for (const [key, child] of Object.entries(value)) scan(child, `${path}.${key}`); return; }
    if (typeof value === 'string') for (const [pattern, reason] of UNSAFE_TEXT) if (pattern.test(value)) { err(`${path} contains ${reason}; store an opaque evidence reference instead`); return; }
  }

  if (!object(records)) throw new RecordsError(['top level must be an object']);
  if (records.schemaVersion !== SCHEMA_VERSION) throw new RecordsError(['unsupported schemaVersion']);
  if (records.kind !== RECORDS_KIND) throw new RecordsError(['unexpected kind']);
  if (!shape(records, SPEC.top, 'records')) throw new RecordsError(errors);
  const sections = ['policy', 'boundaries', 'project', 'storage'].every(key => shape(records[key], SPEC[key], key));
  scan(records, 'records');
  const lists = {
    roleAssignments: SPEC.roleAssignment, delegations: SPEC.delegation, decisions: SPEC.decision,
    riskAcceptances: SPEC.riskAcceptance, auditTrail: SPEC.audit,
  };
  let shaped = sections;
  for (const [list, spec] of Object.entries(lists)) records[list].forEach((item, index) => { if (!shape(item, spec, label(list, item, index))) shaped = false; });
  for (const [index, decision] of records.decisions.entries()) {
    if (Array.isArray(decision?.signoffs)) decision.signoffs.forEach((item, at) => { if (!shape(item, SPEC.signoff, `${label('decisions', decision, index)}.signoffs[${at}]`)) shaped = false; });
  }
  for (const [index, risk] of records.riskAcceptances.entries()) {
    if (Array.isArray(risk?.findings)) risk.findings.forEach((item, at) => { if (!shape(item, SPEC.finding, `${label('riskAcceptances', risk, index)}.findings[${at}]`)) shaped = false; });
  }
  if (!shaped || errors.length) throw new RecordsError(errors);

  // Records must be written against this exact policy, and the file itself never claims to authorize anything.
  if (records.policy.policyId !== policy.policyId || records.policy.schemaVersion !== policy.schemaVersion) {
    err('policy reference does not match the approval policy in use (policyId and schemaVersion must match)');
  }
  const status = records.recordStatus;
  const projectId = records.project.id;
  if (status === 'template' && projectId !== 'replace-with-project-id') err('a template must keep the placeholder project id');
  if (status === 'synthetic_example' && !projectId.startsWith('example-')) err('a synthetic example must use a project id starting with "example-"');
  if (status === 'project' && /^(?:example|replace)-/.test(projectId)) err('a project record must not use an example or placeholder project id');
  if (status === 'project' && JSON.stringify(records).includes('REPLACE')) err('a project record still contains template placeholders');

  const byId = new Map();
  for (const list of Object.keys(lists)) for (const item of records[list]) {
    if (byId.has(item.id)) err(`${list}[${item.id}] reuses an ID already used in this file`);
    byId.set(item.id, { list, item });
  }
  const find = (id, list) => (byId.get(id)?.list === list ? byId.get(id).item : null);
  const items = [];
  const attention = [];
  const notice = (id, message) => attention.push({ id, message });
  const future = (value, path) => { if (value !== null && Date.parse(value) > now) err(`${path} is dated after ${today}`); };

  // Role assignments: who holds which policy role. Confirmation is a human statement, never checked against identity.
  const assignmentOk = new Map();
  const rolesByHolder = new Map();
  for (const item of records.roleAssignments) rolesByHolder.set(item.holderRef, new Set([...(rolesByHolder.get(item.holderRef) ?? []), item.role]));
  for (const item of records.roleAssignments) {
    const path = `roleAssignments[${item.id}]`;
    // Multiple roles must be declared, never inferred, and each role's authority is verified on its own assignment.
    if (item.holdsOtherRoles !== rolesByHolder.get(item.holderRef).size > 1) err(`${path}.holdsOtherRoles does not match the other assignments for this holder`);
    future(item.confirmedAt, `${path}.confirmedAt`);
    future(item.endedAt, `${path}.endedAt`);
    if (item.verification === 'human_confirmed') {
      if (item.confirmedAt === null || item.confirmedByRole === null || !item.evidenceRefs.length) err(`${path} is human_confirmed without confirmedAt, confirmedByRole and evidence references`);
    } else if (item.confirmedAt !== null || item.confirmedByRole !== null) err(`${path} is unverified but records a confirmation`);
    if (item.endedAt !== null && item.confirmedAt !== null && Date.parse(item.endedAt) < Date.parse(item.confirmedAt)) err(`${path} ends before it was confirmed`);
    const ended = item.endedAt !== null;
    const state = ended ? 'ended' : item.verification === 'human_confirmed' ? 'human_confirmed' : 'unverified_requires_human_confirmation';
    assignmentOk.set(item.id, item.verification === 'human_confirmed');
    items.push({ kind: 'roleAssignment', id: item.id, role: item.role, state });
    if (state === 'unverified_requires_human_confirmation') notice(item.id, `${item.role} assignment is unverified; a human must confirm who holds this role${item.holdsOtherRoles ? ' (this holder has several roles; verify authority for each role separately)' : ''}`);
  }

  // Delegations: written, scoped, still valid, granted by the client decision-maker, only for delegable actions.
  const delegationValidAt = (item, instant) => item.status !== 'proposed' && item.issuedAt !== null && item.expiresOn !== null &&
    Date.parse(item.issuedAt) <= instant && instant <= endOfDay(item.expiresOn) && (item.revokedAt === null || instant < Date.parse(item.revokedAt));
  const delegationState = new Map();
  for (const item of records.delegations) {
    const path = `delegations[${item.id}]`;
    const action = actions[item.action];
    const grantor = find(item.grantorAssignmentRef, 'roleAssignments');
    const recipient = find(item.recipientAssignmentRef, 'roleAssignments');
    if (!action.delegableTo.length) err(`${path}: ${item.action} can never be delegated under the policy`);
    if (!grantor || grantor.role !== 'client_decision_maker') err(`${path}: the grantor must be a client_decision_maker role assignment`);
    if (!recipient || !action.delegableTo.includes(recipient.role)) err(`${path}: the recipient must hold a role the policy allows this action to be delegated to`);
    for (const key of ['issuedAt', 'revokedAt']) future(item[key], `${path}.${key}`);
    if (item.status === 'proposed') {
      if (item.revokedAt !== null) err(`${path} is proposed but records a revocation`);
      if (item.verification === 'human_confirmed') err(`${path} is proposed but marked human_confirmed`);
    } else {
      if (item.issuedAt === null || item.expiresOn === null || !item.evidenceRefs.length) err(`${path} is ${item.status} without issuedAt, expiresOn and written evidence references`);
      if (item.issuedAt !== null && item.expiresOn !== null && endOfDay(item.expiresOn) < Date.parse(item.issuedAt)) err(`${path} expires before it was issued`);
      if (item.status === 'revoked' && item.revokedAt === null) err(`${path} is revoked without revokedAt`);
      if (item.status !== 'revoked' && item.revokedAt !== null) err(`${path} records revokedAt but is not revoked`);
      if (item.status === 'expired' && item.expiresOn !== null && endOfDay(item.expiresOn) >= now) err(`${path} is marked expired before its expiry date; use revoked`);
    }
    let state = item.status;
    if (item.status === 'active') {
      const confirmed = item.verification === 'human_confirmed' && grantor && recipient && assignmentOk.get(grantor.id) && assignmentOk.get(recipient.id);
      if (item.expiresOn !== null && endOfDay(item.expiresOn) < now) { state = 'expired'; notice(item.id, 'delegation is recorded as active but its expiry has passed; not usable for authorization until a new delegation is recorded'); }
      else if (!confirmed) { state = 'unverified_requires_human_confirmation'; notice(item.id, 'delegation, or the role assignments it relies on, is unverified; not usable for authorization until a human verifies it'); }
      else state = 'formally_complete';
      if (grantor && recipient && grantor.holderRef === recipient.holderRef) notice(item.id, 'grantor and recipient are the same holder; a human must confirm this is intended');
    }
    delegationState.set(item.id, state);
    items.push({ kind: 'delegation', id: item.id, action: item.action, state });
  }

  // Decisions: the policy's required approvals, plus escalated roles, must all be recorded before "approved".
  const riskClassActions = policy.actions.filter(item => item.class === 'client_risk_acceptance').map(item => item.id);
  const riskByDecision = new Map();
  for (const risk of records.riskAcceptances) {
    if (riskByDecision.has(risk.decisionRef)) err(`riskAcceptances[${risk.id}]: decision ${risk.decisionRef} is already linked to another risk record`);
    riskByDecision.set(risk.decisionRef, risk);
  }
  for (const item of records.decisions) {
    const path = `decisions[${item.id}]`;
    const action = actions[item.action];
    const delegation = item.delegationRef === null ? null : find(item.delegationRef, 'delegations');
    if (item.delegationRef !== null && !delegation) err(`${path}.delegationRef does not name a delegation in this file`);
    if (delegation && delegation.action !== item.action) err(`${path} relies on a delegation for a different action`);
    if (item.delegationRef !== null && !action.delegableTo.length) err(`${path}: ${item.action} can never rely on a delegation`);
    if (item.reviewBy !== null && item.expiresOn !== null && item.reviewBy > item.expiresOn) err(`${path}.reviewBy is after expiresOn`);
    if (item.delegatedScopeConfirmation !== null && item.delegationRef === null) err(`${path} records a delegated-scope confirmation without a delegation`);
    if (item.delegatedScopeConfirmation !== null) future(item.delegatedScopeConfirmation.confirmedAt, `${path}.delegatedScopeConfirmation.confirmedAt`);
    const seenRoles = new Set();
    let latest = null;
    const reasons = [];
    for (const signoff of item.signoffs) {
      const assignment = find(signoff.assignmentRef, 'roleAssignments');
      if (!assignment) { err(`${path}: a signoff names an unknown role assignment`); continue; }
      if (assignment.role !== signoff.role) err(`${path}: a signoff's role does not match its role assignment`);
      if (seenRoles.has(signoff.role)) err(`${path} records more than one signoff for ${signoff.role}`);
      seenRoles.add(signoff.role);
      future(signoff.decidedAt, `${path}.signoffs.decidedAt`);
      if (assignment.endedAt !== null && Date.parse(signoff.decidedAt) >= Date.parse(assignment.endedAt)) err(`${path}: a signoff was made after its role assignment ended`);
      if (signoff.verification === 'human_confirmed' && !signoff.evidenceRefs.length) err(`${path}: a human_confirmed signoff needs evidence references`);
      if (signoff.verification !== 'human_confirmed') reasons.push(`the ${signoff.role} signoff is unverified`);
      else if (!assignmentOk.get(assignment.id)) reasons.push(`the ${signoff.role} role assignment is unverified`);
      latest = Math.max(latest ?? 0, Date.parse(signoff.decidedAt));
    }
    const signed = role => item.signoffs.find(entry => entry.role === role && entry.decision === 'approved');
    let state = item.status;
    if (item.status === 'approved') {
      if (item.signoffs.some(entry => entry.decision === 'rejected')) err(`${path} is approved but records a rejection`);
      // With a valid delegation, the delegated role's recorded approval stands in for the client's per-change approval.
      const required = new Set(action.requiredApprovals);
      if (delegation) {
        const grantor = find(delegation.grantorAssignmentRef, 'roleAssignments');
        const recipient = find(delegation.recipientAssignmentRef, 'roleAssignments');
        if (grantor) required.delete(grantor.role);
        if (recipient) required.add(recipient.role);
        if (item.escalations.includes('delegation_not_valid')) err(`${path} relies on a delegation while recording that no valid delegation applies`);
        if (latest !== null && !delegationValidAt(delegation, latest)) err(`${path} relies on a delegation that was not issued, was expired or was revoked when it was decided`);
        const delegated = delegationState.get(delegation.id);
        if (delegated === 'unverified_requires_human_confirmation' || delegation.verification !== 'human_confirmed') reasons.push('the delegation it relies on is unverified');
        // A person must confirm the operation is inside the delegation's written scope; the tool cannot judge scope text.
        if (item.delegatedScopeConfirmation === null) reasons.push('no human has confirmed the operation is inside the delegation\'s written scope');
      }
      for (const condition of item.escalations) for (const role of conditions[condition].escalatesTo) required.add(role);
      for (const role of required) if (!signed(role)) err(`${path} is approved without the required ${role} approval`);
      if (action.requiresExpiryOrReviewTrigger && (item.expiresOn === null || !item.reviewTriggers.length)) err(`${path}: ${item.action} must record expiresOn and reviewTriggers`);
      if (item.expiresOn !== null && latest !== null && endOfDay(item.expiresOn) < latest) err(`${path} expires before it was decided`);
      if (!item.signoffs.length) err(`${path} is approved without any signoff`);
      // One holder acting in several required roles counts only when each of those role assignments is verified.
      const byHolder = new Map();
      for (const entry of item.signoffs) {
        const holder = find(entry.assignmentRef, 'roleAssignments');
        if (holder) byHolder.set(holder.holderRef, [...(byHolder.get(holder.holderRef) ?? []), holder]);
      }
      for (const held of byHolder.values()) {
        if (held.length < 2) continue;
        if (held.some(entry => !assignmentOk.get(entry.id))) reasons.push('one holder acted in several roles without verified authority for each role');
        else notice(item.id, `one holder acted as ${held.map(entry => entry.role).join(' and ')}; each role's authority is recorded as verified separately`);
      }
      if (riskClassActions.includes(item.action) && !riskByDecision.has(item.id)) err(`${path}: an approved ${item.action} needs a linked risk acceptance record`);
      if (item.expiresOn !== null && endOfDay(item.expiresOn) < now) { state = 'expired'; notice(item.id, `approval expired on ${item.expiresOn}; not usable for authorization until renewed by a new decision (never renewed automatically)`); }
      else if (reasons.length) { state = 'unverified_requires_human_confirmation'; notice(item.id, `recorded as approved, but ${[...new Set(reasons)].join('; ')}; not usable for authorization until a human verifies it`); }
      else state = 'formally_complete';
    } else if (item.status === 'rejected') {
      if (!item.signoffs.some(entry => entry.decision === 'rejected')) err(`${path} is rejected without a rejecting signoff`);
      state = 'closed_not_approved';
    } else if (item.status === 'withdrawn') state = 'closed_not_approved';
    items.push({ kind: 'decision', id: item.id, action: item.action, state, delegated: Boolean(delegation) });
  }

  // Risk acceptances: exact findings within this project only; a renewal may not add findings.
  for (const risk of records.riskAcceptances) {
    const path = `riskAcceptances[${risk.id}]`;
    const decision = find(risk.decisionRef, 'decisions');
    if (!decision) { err(`${path}.decisionRef does not name a decision in this file`); continue; }
    if (!riskClassActions.includes(decision.action)) err(`${path} must link a risk acceptance, renewal or gate-weakening decision`);
    if (!risk.findings.length) err(`${path} must list the exact findings accepted`);
    if (new Set(risk.findings.map(item => item.id)).size !== risk.findings.length) err(`${path} lists a finding twice`);
    if (!risk.compensatingControls.length) err(`${path} must list compensating controls (state "None identified" if there are none)`);
    if (decision.action === 'risk_acceptance_renewal') {
      const previous = risk.renewsRef === null ? null : find(risk.renewsRef, 'riskAcceptances');
      if (!previous || previous.id === risk.id) err(`${path}: a renewal must name the earlier risk record it renews`);
      else {
        const earlier = new Set(previous.findings.map(item => item.id));
        if (risk.findings.some(item => !earlier.has(item.id))) err(`${path}: a renewal cannot add findings; record a new risk_acceptance for them`);
        const seen = new Set([risk.id]);
        for (let next = previous; next; next = next.renewsRef === null ? null : find(next.renewsRef, 'riskAcceptances')) {
          if (seen.has(next.id)) { err(`${path}: renewal chain loops`); break; }
          seen.add(next.id);
        }
      }
    } else if (risk.renewsRef !== null) err(`${path}: only a risk_acceptance_renewal decision may renew an earlier record`);
    items.push({ kind: 'riskAcceptance', id: risk.id, decision: decision.id, findings: risk.findings.length, state: items.find(entry => entry.kind === 'decision' && entry.id === decision.id)?.state });
  }

  // Audit trail: who recorded or reviewed what. A statement, not cryptographic proof.
  const audited = new Set();
  for (const entry of records.auditTrail) {
    const path = `auditTrail[${entry.id}]`;
    const target = byId.get(entry.recordRef);
    if (!target || target.list === 'auditTrail') err(`${path}.recordRef does not name a record in this file`);
    if (entry.event === 'confirmed' && !roles[entry.actorRole].canAuthorize) err(`${path}: automation can record but never confirm`);
    future(entry.at, `${path}.at`);
    audited.add(entry.recordRef);
  }
  for (const entry of items) {
    const recorded = entry.state === 'formally_complete' || entry.state === 'human_confirmed' ||
      (entry.state === 'unverified_requires_human_confirmation' && entry.kind !== 'roleAssignment');
    if (recorded && entry.kind !== 'riskAcceptance' && !audited.has(entry.id)) notice(entry.id, 'no audit trail entry says who recorded or reviewed this');
  }

  // A template teaches the format; it must never look like a recorded authorization.
  if (status === 'template' && (records.roleAssignments.some(item => item.verification !== 'unverified') ||
      records.delegations.some(item => item.status !== 'proposed') || records.decisions.some(item => item.status !== 'proposed' || item.signoffs.length) ||
      records.riskAcceptances.length || records.auditTrail.length)) {
    err('a template may only contain proposed, unverified entries with no signoffs, risk records or audit entries');
  }
  if (status === 'project' && records.storage.location === 'git_repository') {
    notice(projectId, `records are stored in a Git repository instead of the default private, access-controlled storage${records.storage.sensitiveDataReview === 'not_reviewed' ? ' and without a sensitive-data review' : ''}; this needs an explicit client decision, and records must never be committed automatically`);
  }
  if (errors.length) throw new RecordsError(errors);
  // Only a verified, unexpired record may be relied on, and even then authenticity is a human check.
  for (const entry of items) entry.usableForAuthorization = entry.state === 'formally_complete' || entry.state === 'human_confirmed';

  const count = state => items.filter(entry => entry.kind !== 'roleAssignment' && entry.kind !== 'riskAcceptance' && entry.state === state).length;
  return {
    recordStatus: status, projectId, asOf: today, policy: `${policy.policyId} v${policy.schemaVersion}`,
    counts: { roleAssignments: records.roleAssignments.length, delegations: records.delegations.length, decisions: records.decisions.length,
      riskAcceptances: records.riskAcceptances.length, auditEntries: records.auditTrail.length,
      formallyComplete: count('formally_complete'), requiresHumanConfirmation: count('unverified_requires_human_confirmation'),
      proposedOrPending: count('proposed') + count('pending'), expiredOrRevoked: count('expired') + count('revoked'),
      usableForAuthorization: items.filter(entry => entry.kind !== 'roleAssignment' && entry.kind !== 'riskAcceptance' && entry.usableForAuthorization).length },
    items, attention,
    authorizationsGranted: 0, identityVerified: false, authenticityVerified: false,
  };
}

const STATUS_LABEL = {
  template: 'BLANK TEMPLATE (no real records)',
  synthetic_example: 'SYNTHETIC EXAMPLE (fictitious; not real authorizations)',
  project: 'PROJECT RECORDS',
};
const STATE_LABEL = {
  formally_complete: 'formally complete (policy-matched; authenticity not verified)',
  unverified_requires_human_confirmation: 'UNVERIFIED: requires human confirmation',
  human_confirmed: 'confirmed by a human (identity not verified by this tool)',
};

export function formatClientRecordsReport(result) {
  const lines = [
    `Client security records: ${STATUS_LABEL[result.recordStatus]}`,
    `Project: ${result.projectId} | policy ${result.policy} | as of ${result.asOf} (UTC)`,
    'Formal check only: structure, references, dates and policy rules are consistent.',
    'NOT verified: identities, signatures, authenticity or completeness of evidence, or legal effect. A formally complete record is not proof that anyone approved anything.',
    '',
  ];
  const c = result.counts;
  lines.push(`Role assignments: ${c.roleAssignments} | delegations: ${c.delegations} | decisions: ${c.decisions} | risk acceptances: ${c.riskAcceptances} | audit entries: ${c.auditEntries}`);
  lines.push(`Usable for authorization (formally; authenticity still a human check): ${c.usableForAuthorization} of ${c.delegations + c.decisions} delegations and decisions`);
  lines.push(`Formally complete: ${c.formallyComplete} | requires human confirmation: ${c.requiresHumanConfirmation} | proposed or pending: ${c.proposedOrPending} | expired or revoked: ${c.expiredOrRevoked}`);
  for (const [kind, title] of [['roleAssignment', 'Role assignments'], ['delegation', 'Delegations'], ['decision', 'Decisions'], ['riskAcceptance', 'Risk acceptances']]) {
    const entries = result.items.filter(entry => entry.kind === kind);
    if (!entries.length) continue;
    lines.push('', `${title}:`);
    for (const entry of entries) {
      const subject = entry.action ?? entry.role ?? `decision ${entry.decision}, ${entry.findings} finding(s)`;
      const usable = entry.usableForAuthorization ? '' : ' [NOT usable for authorization]';
      lines.push(`- ${entry.id} (${subject}${entry.delegated ? ', via delegation' : ''}): ${STATE_LABEL[entry.state] ?? entry.state.replaceAll('_', ' ')}${usable}`);
    }
  }
  lines.push('', `Needs human attention: ${result.attention.length}`);
  for (const entry of result.attention) lines.push(`- ${entry.id}: ${entry.message}`);
  lines.push('', 'No approval, delegation or risk acceptance is granted, renewed or recorded by this check.');
  return `${lines.join('\n')}\n`;
}

const HELP = `Usage:
  node scripts/security/validate-client-records.mjs --records FILE [--policy FILE] [--as-of YYYY-MM-DD] [--json]
  node scripts/security/validate-client-records.mjs --template [--policy FILE]

Read-only. Checks one project's security records (role assignments, delegations, decisions, risk
acceptances, audit trail) against the approval policy (default: ${BUNDLED_POLICY}).

  --records FILE   project records to check
  --template       check the bundled blank template (${TEMPLATE_PATH})
  --policy FILE    approval policy to check against
  --as-of DATE     evaluate expiries on this UTC date instead of today
  --json           print the result as JSON

Exit 0: formally valid. Unverified or expired records are warnings, marked NOT usable for authorization
until verified or renewed. Exit 1: invalid input, invalid delegations or policy contradictions.
This is a formal check only. It never verifies identities, signatures or evidence, and never grants,
renews or records an approval. Errors name fields and record IDs, never record contents.
`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2), { values: ['records', 'policy', 'as-of'], flags: ['template', 'json', 'help'] });
    if (options.help) { process.stdout.write(HELP); }
    else {
      if (Boolean(options.records) === Boolean(options.template)) throw new UsageError('Pass exactly one of --records FILE or --template (see --help)');
      const policy = readJsonFile(options.policy ?? join(FRAMEWORK_ROOT, BUNDLED_POLICY), MAX_POLICY_BYTES, 'Approval policy');
      const records = readJsonFile(options.records ?? join(FRAMEWORK_ROOT, TEMPLATE_PATH), MAX_RECORDS_BYTES, 'Client records');
      const result = validateClientRecords(records, policy, { asOf: options['as-of'] });
      process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : formatClientRecordsReport(result));
    }
  } catch (error) {
    const safe = error instanceof UsageError || error instanceof RecordsError || /^Invalid security approval policy/.test(error.message);
    process.stderr.write(`${safe ? error.message : 'Client security records could not be validated.'}\n`);
    process.exitCode = 1;
  }
}
