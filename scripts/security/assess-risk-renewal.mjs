import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateAudit } from './check-dependency-audit.mjs';
import { FRAMEWORK_ROOT, UsageError, directoryPath, parseOptions, readJsonFile } from './security-cli.mjs';
import { BUNDLED_POLICY, validateApprovalPolicy } from './validate-approval-policy.mjs';

// Read-only review of a project's temporarily accepted dependency risks before they expire. It compares the
// project-local baseline with its lockfile and, when supplied, a fresh `npm audit --json` report, then drafts a
// review packet. It never runs npm, never contacts the network, never writes files, and never approves, renews or
// extends anything: every packet is DRAFT / NOT AUTHORIZED and only humans decide.

export const PACKET_KIND = 'risk-renewal-review-packet';
export const PACKET_VERSION = 1;
export const DEFAULT_BASELINE = 'docs/security/DEPENDENCY-AUDIT-BASELINE.json';
export const DEFAULT_LOCKFILE = 'package-lock.json';
const DRAFT = 'DRAFT / NOT AUTHORIZED';
const MAX_JSON_BYTES = { baseline: 256 * 1024, lockfile: 32 * 1024 * 1024, audit: 32 * 1024 * 1024, policy: 128 * 1024 };
const MAX_REGISTER_BYTES = 512 * 1024;
const SEVERITY = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PROJECT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DAY = 86400000;
// Changing an accepted dependency baseline renews the risk and also extends what the CI gate lets through, so both
// policy actions apply. Required roles for these actions are read from the policy.
const RENEWAL_ACTIONS = ['risk_acceptance_renewal', 'ci_gate_weaken_or_bypass'];
const NEW_ACCEPTANCE_ACTIONS = ['risk_acceptance', 'ci_gate_weaken_or_bypass'];
const REMEDIATION_ACTIONS = ['dependency_compatible_update', 'dependency_override', 'dependency_major_or_downgrade'];

export class RenewalInputError extends Error {}
const fail = message => { throw new RenewalInputError(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function calendarDate(value) {
  const match = typeof value === 'string' && DATE.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === +match[1] && date.getUTCMonth() + 1 === +match[2] && date.getUTCDate() === +match[3];
}
const daysUntil = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const minDate = (a, b) => (a <= b ? a : b);
const findingKey = finding => `${finding.id}|${finding.package}`;

// Mirrors the dependency gate's baseline contract (schema 1, including "pending" approvals), with stricter date checks.
export function validateBaseline(baseline, label = 'baseline') {
  if (!object(baseline)) fail(`${label} must be a JSON object`);
  if (baseline.schemaVersion !== 1) fail(`${label} has an unsupported schemaVersion (supported: 1)`);
  if (!calendarDate(baseline.reviewBy)) fail(`${label} reviewBy must be a calendar date`);
  if (baseline.verifiedOn !== undefined && !calendarDate(baseline.verifiedOn)) fail(`${label} verifiedOn must be a calendar date`);
  if (baseline.reviewTriggers !== undefined && !(Array.isArray(baseline.reviewTriggers) && baseline.reviewTriggers.every(item => typeof item === 'string' && item.length <= 400))) {
    fail(`${label} reviewTriggers must be a list of short strings`);
  }
  const approval = baseline.approval;
  if (!object(approval) || !['pending', 'approved'].includes(approval.status)) fail(`${label} approval status must be "pending" or "approved"`);
  if (approval.status === 'approved') {
    if (typeof approval.reviewer !== 'string' || !approval.reviewer.trim()) fail(`${label} approved approval has no recorded approver`);
    if (!calendarDate(approval.approvedOn) || !calendarDate(approval.expiresOn)) fail(`${label} approval dates must be calendar dates`);
    if (approval.expiresOn < approval.approvedOn) fail(`${label} approval expires before it was approved`);
  }
  if (!Array.isArray(baseline.findings) || baseline.findings.length > 500) fail(`${label} findings must be a list`);
  const seen = new Set();
  for (const finding of baseline.findings) {
    if (!object(finding) || typeof finding.id !== 'string' || !/^GHSA-[a-z0-9-]+$/.test(finding.id) || typeof finding.package !== 'string' ||
        !finding.package || SEVERITY[finding.severity] === undefined) fail(`${label} has an invalid finding`);
    if (typeof finding.direct !== 'boolean' || !Array.isArray(finding.consumers) || !finding.consumers.every(item => typeof item === 'string') ||
        !Array.isArray(finding.instances) || !finding.instances.length ||
        !finding.instances.every(item => object(item) && typeof item.path === 'string' && typeof item.version === 'string' && typeof item.dev === 'boolean' && typeof item.optional === 'boolean')) {
      fail(`${label} finding ${finding.id} has an invalid scope`);
    }
    if (seen.has(findingKey(finding))) fail(`${label} lists finding ${finding.id} twice`);
    seen.add(findingKey(finding));
  }
  return baseline;
}

// Statuses from a register that declares `risk-register-schema: 1` and an advisory index table. Anything else is unknown.
export function parseRegister(markdown) {
  if (typeof markdown !== 'string' || !/risk-register-schema:\s*1\b/.test(markdown)) return null;
  const statuses = new Map();
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*\[?(GHSA-[a-z0-9-]+)\]?(?:\([^)]*\))?\s*\|.*\|\s*(open|mitigated|accepted-temporarily|resolved)\s*\|\s*$/i.exec(line.trim());
    if (match) statuses.set(match[1], match[2].toLowerCase());
  }
  return statuses;
}

function rolesFor(policy, actionIds) {
  const roles = new Set();
  for (const id of actionIds) for (const role of policy.actions.find(action => action.id === id).requiredApprovals) roles.add(role);
  return [...roles];
}

export function assessRiskRenewal({ baseline, lock, audit = null, register = null, previousBaseline = null, policy, asOf, warnDays = 14, projectId }) {
  validateApprovalPolicy(policy);
  if (typeof projectId !== 'string' || !PROJECT_ID.test(projectId) || projectId.length > 64) throw new UsageError('--project-id must be a lowercase, hyphenated identifier');
  if (!calendarDate(asOf)) throw new UsageError('--as-of must be a calendar date (YYYY-MM-DD)');
  if (!Number.isInteger(warnDays) || warnDays < 0 || warnDays > 365) throw new UsageError('--warn-days must be a whole number from 0 to 365');
  validateBaseline(baseline);
  if (!object(lock) || !object(lock.packages)) fail('lockfile is not a package-lock.json with a packages map');
  if (previousBaseline !== null) validateBaseline(previousBaseline, 'previous baseline');

  const attention = [];
  const approval = baseline.approval;

  // Approval window. The comparator rule is reproduced exactly: approvedOn <= today <= expiresOn and today <= reviewBy,
  // all as UTC calendar dates, so the last valid day is inclusive.
  const window = { status: approval.status, approvedOn: approval.approvedOn ?? null, expiresOn: approval.expiresOn ?? null, reviewBy: baseline.reviewBy,
    verifiedOn: baseline.verifiedOn ?? null, approverRecorded: approval.status === 'approved', approverRoleRecorded: false };
  let approvalState;
  if (approval.status !== 'approved') { approvalState = 'pending_or_missing'; attention.push('No approved acceptance is recorded; the dependency gate blocks these findings.'); }
  else {
    window.deadline = minDate(approval.expiresOn, baseline.reviewBy);
    window.daysRemaining = daysUntil(asOf, window.deadline);
    window.gateAcceptsToday = approval.approvedOn <= asOf && approval.expiresOn >= asOf && baseline.reviewBy >= asOf;
    if (approval.approvedOn > asOf) { approvalState = 'not_yet_effective'; attention.push('The recorded approval date is after the as-of date; the record conflicts with the timeline.'); }
    else if (asOf > window.deadline) { approvalState = 'expired'; attention.push(`The acceptance lapsed after ${window.deadline} UTC; the findings are open again until a new decision is recorded.`); }
    else if (window.daysRemaining <= warnDays) { approvalState = 'nearing_expiry'; attention.push(`The acceptance ends after ${window.deadline} UTC (${window.daysRemaining} day(s) left); a fresh review and decision are due before then.`); }
    else approvalState = 'valid';
    if (baseline.reviewBy !== approval.expiresOn) attention.push(`reviewBy (${baseline.reviewBy}) and expiresOn (${approval.expiresOn}) differ; the earlier date governs.`);
    if (baseline.verifiedOn && baseline.verifiedOn > approval.approvedOn) attention.push('Evidence is dated after the approval it supports; confirm what the approver actually reviewed.');
    // Schema 1 stores a free-text approver and no policy role; the next decision must name the role exercised.
    attention.push('The recorded approval does not state which policy role the approver acted in; the renewal must identify the person acting in each required role.');
  }

  // Silent renewal: dates extended or scope broadened without a new approval date.
  const silent = [];
  if (previousBaseline !== null) {
    const before = previousBaseline.approval;
    const sameApproval = before.status === 'approved' && approval.status === 'approved' && before.approvedOn === approval.approvedOn;
    if (sameApproval && (approval.expiresOn > before.expiresOn || baseline.reviewBy > previousBaseline.reviewBy)) silent.push('expiry or review date extended without a new approval date');
    const previous = new Map(previousBaseline.findings.map(item => [findingKey(item), item]));
    for (const finding of baseline.findings) {
      const prior = previous.get(findingKey(finding));
      if (sameApproval && !prior) silent.push(`finding ${finding.id} added without a new approval date`);
      else if (sameApproval && prior && JSON.stringify([prior.severity, prior.direct, prior.instances, [...prior.consumers].sort()]) !==
        JSON.stringify([finding.severity, finding.direct, finding.instances, [...finding.consumers].sort()])) silent.push(`finding ${finding.id} scope changed without a new approval date`);
    }
    if (approval.status === 'approved' && before.status === 'approved' && approval.approvedOn !== before.approvedOn) {
      attention.push(`A new approval date (${approval.approvedOn}) is recorded; confirm a human renewal decision exists for it. This tool cannot verify it.`);
    }
    if (silent.length) {
      approvalState = 'unverified_extension';
      attention.push(`Possible silent renewal: ${silent.join('; ')}. Treat the change as unauthorized until a recorded human decision covers it.`);
    }
  }

  // Current state of each finding: from the fresh audit when supplied (via the gate's own comparator), else lockfile only.
  let comparison = null;
  if (audit !== null) {
    try { comparison = evaluateAudit(audit, baseline, lock, new Date(`${asOf}T12:00:00Z`)); }
    catch (error) { fail(`fresh audit could not be compared with this project's baseline and lockfile (${error.message})`); }
  }
  const changed = new Map((comparison?.newOrChanged ?? []).map(item => [findingKey(item), item]));
  const accepted = new Set((comparison?.accepted ?? []).map(findingKey));
  const resolved = new Set((comparison?.resolved ?? []).map(findingKey));
  const registerStatuses = register === null ? null : parseRegister(register);
  if (register !== null && registerStatuses === null) attention.push('The risk register does not declare a recognized schema; compare it with the baseline by hand.');

  const findings = baseline.findings.map(finding => {
    const key = findingKey(finding);
    const reasons = [];
    let currentState;
    if (comparison) {
      if (accepted.has(key)) currentState = 'exact_match';
      else if (changed.has(key)) { currentState = 'changed'; reasons.push(changed.get(key).reason); }
      else if (resolved.has(key)) currentState = 'resolved_in_audit';
      else currentState = 'unknown';
    } else {
      const drift = finding.instances.filter(item => {
        const entry = lock.packages[item.path];
        return !entry || entry.version !== item.version || Boolean(entry.dev) !== item.dev || Boolean(entry.optional) !== item.optional;
      });
      currentState = drift.length ? 'lockfile_drift' : 'not_assessed_without_fresh_audit';
      if (drift.length) reasons.push('recorded installed path, version or scope no longer matches the lockfile');
    }
    let registerStatus = null;
    if (registerStatuses) {
      registerStatus = registerStatuses.get(finding.id) ?? 'not_in_register';
      if (registerStatus === 'not_in_register') reasons.push('not listed in the risk register');
      else if (registerStatus !== 'accepted-temporarily') reasons.push(`risk register says "${registerStatus}" while the baseline still accepts it`);
    }
    const covered = currentState === 'exact_match' && ['valid', 'nearing_expiry'].includes(approvalState) && !silent.length;
    const evidence = [
      { item: 'fresh_audit_comparison', status: comparison ? 'checked_by_tool' : 'missing', note: comparison ? 'Compared with the dependency gate comparator.' : 'Run `npm audit --json` and pass it with --audit.' },
      { item: 'installed_version_path_and_scope', status: comparison || currentState === 'lockfile_drift' || currentState === 'not_assessed_without_fresh_audit' ? 'checked_by_tool' : 'missing' },
      { item: 'severity_change', status: comparison ? 'checked_by_tool' : 'missing' },
      { item: 'remediation_availability', status: 'human_required', note: 'Check upstream releases and the advisory; this tool does not query the network.' },
      { item: 'remediation_compatibility', status: 'human_required', note: 'Test any candidate fix one dependency path at a time.' },
      { item: 'reachable_exposure', status: 'human_required', note: typeof finding.rationale === 'string' && finding.rationale.trim()
        ? 'A recorded rationale exists in the baseline; it is a prior claim, not verified by this tool.' : 'No rationale is recorded.' },
      { item: 'compensating_controls_and_residual_risk', status: 'human_required' },
    ];
    return { id: finding.id, package: finding.package, severity: finding.severity, direct: finding.direct,
      recordedInstances: finding.instances.map(item => ({ path: item.path, version: item.version })),
      currentState, registerStatus, reasons, coveredByExistingAcceptance: covered, evidence };
  });
  const uncovered = (comparison?.newOrChanged ?? []).filter(item => !baseline.findings.some(finding => findingKey(finding) === findingKey(item)))
    .map(item => ({ id: item.id, package: item.package, severity: item.severity, reason: item.reason }));
  if (registerStatuses) {
    for (const [id, status] of registerStatuses) {
      if (status === 'accepted-temporarily' && !baseline.findings.some(finding => finding.id === id)) attention.push(`The risk register accepts ${id}, but the baseline does not; the records conflict.`);
    }
  }
  if (!comparison) attention.push('No fresh audit was supplied; current advisory IDs, severities and paths are unknown.');
  if (findings.some(item => item.currentState === 'changed' || item.currentState === 'lockfile_drift')) attention.push('At least one accepted finding changed; the existing acceptance does not cover it.');
  if (uncovered.length) attention.push(`${uncovered.length} finding(s) in the fresh audit are not in the baseline; they need their own decision.`);
  if (findings.some(item => item.currentState === 'resolved_in_audit')) attention.push('At least one accepted finding no longer appears; a human should confirm the fix and close it, not renew it.');

  const needsReReview = silent.length || uncovered.length || findings.some(item => item.reasons.length || item.currentState === 'unknown') ||
    approvalState === 'not_yet_effective' || attention.some(item => /records conflict/.test(item));
  const reviewStatus = approvalState === 'pending_or_missing' ? 'approval_pending_or_missing'
    : needsReReview ? 're_review_required'
    : approvalState === 'expired' ? 'expired_review_required'
    // Without a fresh audit the current findings are unknown, so the packet cannot say the acceptance still fits.
    : !comparison ? 'fresh_audit_required'
    : approvalState === 'nearing_expiry' ? 'review_due_before_expiry'
    : 'valid_no_decision_due_yet';

  const renewalRoles = rolesFor(policy, RENEWAL_ACTIONS);
  return {
    packetKind: PACKET_KIND, packetVersion: PACKET_VERSION, status: DRAFT,
    usableForAuthorization: false, authorizationsGranted: 0, renewalPerformed: false, recordsModified: false,
    project: { id: projectId }, asOf, warnDays, policy: `${policy.policyId} v${policy.schemaVersion}`,
    inputs: { baselineSchemaVersion: baseline.schemaVersion, freshAudit: Boolean(comparison), register: register === null ? 'not supplied' : registerStatuses ? 'recognized' : 'unrecognized',
      previousBaseline: previousBaseline !== null },
    reviewStatus, approvalState, approvalWindow: window, reviewDeadline: window.deadline ?? null,
    findings, uncoveredFindings: uncovered, resolvedCount: findings.filter(item => item.currentState === 'resolved_in_audit').length,
    attention,
    decisionOptions: [
      { id: 'remediate', description: 'Fix or remove the vulnerable dependency path, one tested change at a time; escalate per the policy\'s conditions.',
        policyActions: REMEDIATION_ACTIONS, requiredRoles: rolesFor(policy, REMEDIATION_ACTIONS) },
      { id: 'reject_renewal', description: 'Do not renew. The acceptance lapses at its expiry and the dependency gate blocks the findings until they are fixed or a new decision is recorded. The client decision-maker owns the risk.',
        policyActions: [], requiredRoles: ['client_decision_maker'] },
      { id: 'time_bound_accept', description: 'Renew for exact, re-reviewed findings only, with a new expiry and re-review triggers. Changed or new findings need a new acceptance.',
        policyActions: RENEWAL_ACTIONS, requiredRoles: renewalRoles, newFindingsPolicyActions: NEW_ACCEPTANCE_ACTIONS, newFindingsRequiredRoles: rolesFor(policy, NEW_ACCEPTANCE_ACTIONS) },
    ],
    roleIdentification: renewalRoles.map(role => ({ role, personActing: null, verification: 'unverified',
      note: 'Identify who acts in this role and verify their authority. If one person holds several roles, verify each role separately; never infer it.' })),
    proposedDecisionDraft: {
      id: 'proposed-risk-renewal', action: 'risk_acceptance_renewal', status: 'proposed',
      scope: `${DRAFT}: review of ${findings.length} exact baseline finding(s) listed in the packet; changed or new findings are excluded.`,
      changeRefs: [], escalations: needsReReview ? ['new_or_changed_risk'] : [], delegationRef: null, delegatedScopeConfirmation: null,
      signoffs: [], conditions: [], reviewBy: null, expiresOn: null,
      reviewTriggers: (baseline.reviewTriggers ?? []).slice(0, 20), note: `${DRAFT}. Generated by the renewal assessment; nothing was recorded. A human decides whether to use it.`,
    },
  };
}

export function formatRenewalPacket(packet) {
  const w = packet.approvalWindow;
  const lines = [
    `# Risk renewal review packet: ${packet.status}`,
    '',
    `Project: ${packet.project.id} | as of ${packet.asOf} (UTC) | policy ${packet.policy}`,
    `Review status: ${packet.reviewStatus.replaceAll('_', ' ')} | approval: ${packet.approvalState.replaceAll('_', ' ')}`,
    w.status === 'approved'
      ? `Recorded window: approved ${w.approvedOn}, expires after ${w.expiresOn}, review by ${w.reviewBy}; deadline ${w.deadline} (${w.daysRemaining} day(s)); gate accepts on as-of date: ${w.gateAcceptsToday ? 'yes' : 'no'}`
      : 'Recorded window: no approved acceptance.',
    'This packet authorizes nothing. It does not renew, extend or change any acceptance, date or record. A passing audit comparator or CI job is not a renewal decision.',
    '',
    `## Findings (${packet.findings.length})`,
  ];
  for (const item of packet.findings) {
    lines.push(`- ${item.id} ${item.package} (${item.severity}; ${item.recordedInstances.map(x => `${x.path}@${x.version}`).join(', ')}): ${item.currentState.replaceAll('_', ' ')}` +
      `${item.registerStatus ? `; register: ${item.registerStatus}` : ''}${item.reasons.length ? `; ${item.reasons.join('; ')}` : ''}`);
  }
  if (packet.uncoveredFindings.length) {
    lines.push('', `## Not covered by the baseline (${packet.uncoveredFindings.length})`);
    for (const item of packet.uncoveredFindings) lines.push(`- ${item.id} ${item.package} (${item.severity}): ${item.reason}`);
  }
  lines.push('', '## Evidence still required (each finding)');
  const evidence = new Map();
  for (const item of packet.findings) for (const entry of item.evidence) if (entry.status !== 'checked_by_tool') evidence.set(entry.item, entry);
  for (const entry of evidence.values()) lines.push(`- ${entry.item.replaceAll('_', ' ')}: ${entry.status.replaceAll('_', ' ')}${entry.note ? `. ${entry.note}` : ''}`);
  lines.push('', '## Needs attention');
  for (const entry of packet.attention) lines.push(`- ${entry}`);
  lines.push('', '## Decision options (a human chooses)');
  for (const option of packet.decisionOptions) lines.push(`- ${option.id}: ${option.description} Roles: ${option.requiredRoles.join(' and ')}${option.policyActions.length ? ` (policy: ${option.policyActions.join(', ')})` : ''}.`);
  lines.push('', '## Who must decide');
  for (const entry of packet.roleIdentification) lines.push(`- ${entry.role}: person acting not identified; authority unverified.`);
  lines.push('', `Decision needed by: ${packet.reviewDeadline ?? 'no recorded deadline (no approved acceptance)'}. Missing the deadline lets the acceptance lapse; it is never extended automatically.`);
  lines.push(`${packet.status}: usable for authorization: no. Approvals granted: 0. Records modified: none.`);
  return `${lines.join('\n')}\n`;
}

// Project-local inputs must live inside the declared project root, so one client's records never feed another's packet.
function insideRoot(root, path, label) {
  const absolute = isAbsolute(path) ? path : join(root, path);
  let real;
  try { real = realpathSync(absolute); } catch { throw new UsageError(`${label} must be an existing regular file inside --root`); }
  const rel = relative(root, real);
  if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new UsageError(`${label} must be inside --root`);
  return real;
}
function readText(path, maxBytes, label) {
  let stat;
  try { stat = lstatSync(path, { throwIfNoEntry: false }); } catch { stat = undefined; }
  if (!stat?.isFile()) throw new UsageError(`${label} must be an existing regular file`);
  if (stat.size > maxBytes) throw new UsageError(`${label} exceeds its size limit`);
  return readFileSync(path, 'utf8');
}

const HELP = `Usage:
  node scripts/security/assess-risk-renewal.mjs --root DIR --project-id ID [options]

Read-only review of a project's temporarily accepted dependency risks. Prints a ${DRAFT}
review packet. Never runs npm, contacts the network, writes files, or approves, renews or extends anything.

  --root DIR                 project root; project-local inputs must be inside it
  --project-id ID            label for this project's packet (lowercase-hyphenated)
  --baseline FILE            accepted-risk baseline inside the root (default ${DEFAULT_BASELINE})
  --lockfile FILE            lockfile inside the root (default ${DEFAULT_LOCKFILE})
  --register FILE            optional risk register inside the root (needs "risk-register-schema: 1")
  --audit FILE               optional fresh \`npm audit --json\` output for this project
  --previous-baseline FILE   optional earlier copy of the baseline, to detect silent renewal
  --policy FILE              approval policy (default: bundled ${BUNDLED_POLICY})
  --as-of DATE               evaluate on this UTC date (default: today)
  --warn-days N              days before expiry to report a review as due (default 14)
  --json                     print the packet as JSON

Exit 0: packet produced (read its review status). Exit 1: invalid or missing input.
A passing audit comparator or CI job is not a renewal decision.
`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2), {
      values: ['root', 'project-id', 'baseline', 'lockfile', 'register', 'audit', 'previous-baseline', 'policy', 'as-of', 'warn-days'], flags: ['json', 'help'] });
    if (options.help) process.stdout.write(HELP);
    else {
      if (!options.root || !options['project-id']) throw new UsageError('--root and --project-id are required (see --help)');
      const root = realpathSync(directoryPath(options.root, 'Project root'));
      const warnText = options['warn-days'] ?? '14';
      if (!/^\d{1,3}$/.test(warnText)) throw new UsageError('--warn-days must be a whole number from 0 to 365');
      const packet = assessRiskRenewal({
        baseline: readJsonFile(insideRoot(root, options.baseline ?? DEFAULT_BASELINE, 'Baseline'), MAX_JSON_BYTES.baseline, 'Baseline'),
        lock: readJsonFile(insideRoot(root, options.lockfile ?? DEFAULT_LOCKFILE, 'Lockfile'), MAX_JSON_BYTES.lockfile, 'Lockfile'),
        register: options.register ? readText(insideRoot(root, options.register, 'Register'), MAX_REGISTER_BYTES, 'Register') : null,
        audit: options.audit ? readJsonFile(options.audit, MAX_JSON_BYTES.audit, 'Audit report') : null,
        previousBaseline: options['previous-baseline'] ? readJsonFile(options['previous-baseline'], MAX_JSON_BYTES.baseline, 'Previous baseline') : null,
        policy: readJsonFile(options.policy ?? join(FRAMEWORK_ROOT, BUNDLED_POLICY), MAX_JSON_BYTES.policy, 'Approval policy'),
        asOf: options['as-of'] ?? new Date().toISOString().slice(0, 10), warnDays: Number(warnText), projectId: options['project-id'],
      });
      process.stdout.write(options.json ? `${JSON.stringify(packet, null, 2)}\n` : formatRenewalPacket(packet));
    }
  } catch (error) {
    const safe = error instanceof UsageError || error instanceof RenewalInputError || /^Invalid security approval policy/.test(error.message);
    process.stderr.write(`${safe ? `Risk renewal assessment failed: ${error.message}` : 'Risk renewal assessment failed: input could not be read.'}\n`);
    process.exitCode = 1;
  }
}
