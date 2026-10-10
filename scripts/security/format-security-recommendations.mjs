import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_INPUT_BYTES = 128 * 1024;
const MAX_SUMMARY_CHARS = 16_000;
const MAX_CHECKS = 64;
const MAX_FIELD_CHARS = 160;
const MAX_EVIDENCE = 5;
const DISPOSITIONS = ['recommended', 'needs_human_review', 'not_currently_indicated'];
const SIGNAL_IDS = new Set(['nextjs', 'sanity_cms', 'api_routes', 'webhooks', 'browser_auth',
  'public_forms', 'payments', 'analytics', 'database']);
const SIGNAL_STATUSES = new Set(['detected', 'needs human verification', 'not detected in inspected scope']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);
const EXECUTION_STATUSES = new Set(['automated_now', 'future_implementation', 'human_review']);
const MANIFEST_STATES = new Set(['valid', 'missing', 'invalid', 'too_large']);
const ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const SUPPORT_STATUSES = new Set(['supported', 'partial', 'unsupported', 'unknown']);
const EVIDENCE_STATUSES = new Set(['present', 'missing', 'not_regular_file', 'not_checked']);

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function integer(value, max) { return Number.isSafeInteger(value) && value >= 0 && value <= max; }
function safePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 240 &&
    !/[\x00-\x1f\x7f\\]/.test(value) && !value.startsWith('/') &&
    value.split('/').every(part => part && part !== '.' && part !== '..' && !part.startsWith('.'));
}
function safeProvenance(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 240 &&
    !/[\x00-\x1f\x7f\\]/.test(value) && !value.startsWith('/') &&
    value.split('/').every(part => part && part !== '.' && part !== '..');
}
function escaped(value) {
  const normalized = String(value).replace(/[\x00-\x1f\x7f]/g, ' ');
  const clipped = normalized.length > MAX_FIELD_CHARS
    ? `${normalized.slice(0, MAX_FIELD_CHARS - 1)}…` : normalized;
  return clipped.replace(/[&<>"'`\[\]()!*_|#]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    '`': '&#96;', '[': '&#91;', ']': '&#93;', '(': '&#40;', ')': '&#41;',
    '!': '&#33;', '*': '&#42;', '_': '&#95;', '|': '&#124;', '#': '&#35;',
  })[character]);
}
function code(value) { return `<code>${escaped(value)}</code>`; }
function invalid() { throw new Error('Invalid security recommendation report'); }
function shortStrings(value, max) {
  return Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 240);
}
// Optional Phase 4A fields: older reports without them remain valid.
function validSupportItem(item) {
  return object(item) && SUPPORT_STATUSES.has(item.status) &&
    (item.id === null || (typeof item.id === 'string' && ID_PATTERN.test(item.id))) &&
    shortStrings(item.detected, 10) && shortStrings(item.evidence, 10) && shortStrings(item.reasons, 10);
}
function validProjectSupport(value) {
  return value === undefined || (object(value) && validSupportItem(value.framework) && validSupportItem(value.packageManager) &&
    typeof value.nonDetectionReliable === 'boolean');
}

export function validateRecommendationReport(report) {
  if (!object(report) || report.schemaVersion !== 1 || report.tool !== 'security-check-recommendations' ||
      !object(report.inputs) || report.inputs.inventorySchemaVersion !== 1 ||
      report.inputs.catalogSchemaVersion !== 1 || !report.inputs.catalogId ||
      typeof report.inputs.catalogId !== 'string' ||
      typeof report.inputs.inventorySource !== 'string' || !report.inputs.inventorySource ||
      typeof report.inputs.catalogSource !== 'string' || !report.inputs.catalogSource ||
      !object(report.scan) || typeof report.scan.complete !== 'boolean' ||
      !integer(report.scan.sourceFilesInspected, 400) || !MANIFEST_STATES.has(report.scan.packageManifest) ||
      !Array.isArray(report.scan.incompleteReasons) || report.scan.incompleteReasons.length > 20 ||
      !report.scan.incompleteReasons.every(reason => typeof reason === 'string' && reason.length > 0) ||
      (report.scan.complete && (report.scan.incompleteReasons.length > 0 || report.scan.sourceFilesInspected === 0)) ||
      (!report.scan.complete && report.scan.incompleteReasons.length === 0) ||
      (report.scan.complete && ['invalid', 'too_large'].includes(report.scan.packageManifest)) ||
      !object(report.summary) || !Array.isArray(report.recommendations) ||
      report.recommendations.length < 1 || report.recommendations.length > MAX_CHECKS ||
      !Array.isArray(report.humanConfirmation) || !object(report.boundaries) ||
      report.boundaries.checksExecutedByThisTool !== 0 ||
      report.boundaries.checkResultsDetermined !== false ||
      report.boundaries.riskAcceptanceDetermined !== false ||
      report.boundaries.legalComplianceDetermined !== false ||
      !validProjectSupport(report.projectSupport)) invalid();

  const counts = { recommended: 0, needsHumanReview: 0, notCurrentlyIndicated: 0 };
  const ids = new Set();
  for (const check of report.recommendations) {
    if (!object(check) || typeof check.id !== 'string' || check.id.length > 80 ||
        !ID_PATTERN.test(check.id) || ids.has(check.id) || !DISPOSITIONS.includes(check.disposition) ||
        !EXECUTION_STATUSES.has(check.executionStatus) ||
        !['always', 'any_signal'].includes(check.matchMode) || !Array.isArray(check.matchSignals) ||
        check.matchSignals.length > 9 ||
        (check.matchMode === 'always' && check.matchSignals.length !== 0) ||
        (check.matchMode === 'any_signal' && check.matchSignals.length === 0) ||
        check.ownerApprovalRequiredForRiskDecision !== true ||
        typeof check.name !== 'string' || !check.name ||
        typeof check.rationale !== 'string' || !check.rationale ||
        typeof check.detectionLimits !== 'string' || !check.detectionLimits ||
        typeof check.recommendedAction !== 'string' || !check.recommendedAction ||
        !Array.isArray(check.evidenceRequired) || check.evidenceRequired.length === 0 ||
        !check.evidenceRequired.every(value => typeof value === 'string' && value.length > 0) ||
        !Array.isArray(check.provenance) || check.provenance.length === 0 ||
        !check.provenance.every(safeProvenance) ||
        (check.supportNotes !== undefined && !shortStrings(check.supportNotes, 3)) ||
        (check.projectEvidence !== undefined && (!Array.isArray(check.projectEvidence) || check.projectEvidence.length > MAX_EVIDENCE ||
          !check.projectEvidence.every(item => object(item) && safeProvenance(item.path) && EVIDENCE_STATUSES.has(item.status))))) invalid();
    ids.add(check.id);
    counts[check.disposition === 'recommended' ? 'recommended' :
      check.disposition === 'needs_human_review' ? 'needsHumanReview' : 'notCurrentlyIndicated']++;
    const signalIds = new Set();
    for (const signal of check.matchSignals) {
      if (!object(signal) || !SIGNAL_IDS.has(signal.id) ||
          signalIds.has(signal.id) || !SIGNAL_STATUSES.has(signal.status) ||
          !CONFIDENCES.has(signal.confidence) || !Array.isArray(signal.evidence) ||
          signal.evidence.length > MAX_EVIDENCE || !signal.evidence.every(safePath) ||
          !integer(signal.evidenceOmitted, 400)) invalid();
      signalIds.add(signal.id);
    }
  }
  if (!integer(report.summary.recommended, MAX_CHECKS) ||
      !integer(report.summary.needsHumanReview, MAX_CHECKS) ||
      !integer(report.summary.notCurrentlyIndicated, MAX_CHECKS) ||
      report.summary.total !== report.recommendations.length ||
      Object.entries(counts).some(([key, count]) => report.summary[key] !== count) ||
      report.humanConfirmation.length !== ids.size ||
      new Set(report.humanConfirmation.map(item => item?.checkId)).size !== ids.size ||
      report.humanConfirmation.some(item => !object(item) || !ids.has(item.checkId) ||
        typeof item.reason !== 'string' || item.reason.length === 0)) invalid();
  return counts;
}

function evidenceFor(check) {
  if (!check.matchSignals.length) return 'Catalog-wide proposal; no source trigger.';
  return check.matchSignals.map(signal => {
    const paths = signal.evidence.map(code);
    const remainder = signal.evidenceOmitted ? `, and ${signal.evidenceOmitted} more` : '';
    return `${code(signal.id)} (${code(signal.status)}): ${paths.length ? `${paths.join(', ')}${remainder}` : 'no matched source path'}`;
  }).join('; ');
}

export function formatRecommendationSummary(report) {
  validateRecommendationReport(report);
  const lines = [
    '## Security check recommendations (review only)',
    '',
    '**Proposals only.** This report did not execute or pass checks, accept risk, determine legal compliance, or prove a feature absent.',
    '',
    `Source files inspected: ${report.scan.sourceFilesInspected}. Scan: **${report.scan.complete ? 'complete within the inventory scope' : 'incomplete; human review required'}**.`,
    `Recommended: **${report.summary.recommended}** · Needs human review: **${report.summary.needsHumanReview}** · Not indicated within inspected scope: **${report.summary.notCurrentlyIndicated}**.`,
    '',
  ];
  if (!report.scan.complete) {
    lines.push(`Coverage limits: ${report.scan.incompleteReasons.map(code).join(', ') || 'unknown'}.`, '');
  }
  const support = report.projectSupport;
  const describe = item => `${item.id ? code(item.id) : 'not identified'} (**${item.status}**)` +
    `${item.reasons.length ? `; reasons: ${item.reasons.map(code).join(', ')}` : ''}`;
  if (support) {
    lines.push(`Framework: ${describe(support.framework)}. Package manager: ${describe(support.packageManager)}.`);
    if (!support.nonDetectionReliable || support.packageManager.status !== 'supported') {
      lines.push('**Limited support.** Unsupported, partial, or unknown project types are not shown to be secure; ' +
        'source non-detection is not evidence of absence, and conditional checks need human review.');
    }
    lines.push('');
  } else {
    lines.push('Framework and package manager support: not assessed (older report).', '');
  }
  const groups = [
    ['recommended', 'Recommended checks'],
    ['needs_human_review', 'Needs human review'],
    ['not_currently_indicated', 'Not indicated within inspected scope'],
  ];
  for (const [disposition, title] of groups) {
    lines.push(`### ${title}`, '');
    const checks = report.recommendations.filter(check => check.disposition === disposition)
      .sort((a, b) => a.id.localeCompare(b.id, 'en'));
    if (!checks.length) lines.push('None in this group.');
    for (const check of checks) {
      const notes = (check.supportNotes ?? []).map(note => ` Note: ${escaped(note)}`).join('');
      lines.push(`- ${code(check.id)} — **${disposition}**. ${evidenceFor(check)}${notes}`);
    }
    lines.push('');
  }
  lines.push('Source non-detection applies only to inspected files and patterns. Confirm live services, account settings, and offline activity with the owner before acting.');

  const summary = `${lines.join('\n')}\n`;
  if (summary.length <= MAX_SUMMARY_CHARS) return summary;
  const cutoff = summary.slice(0, MAX_SUMMARY_CHARS - 160).lastIndexOf('\n');
  return `${summary.slice(0, cutoff)}\n\nOutput truncated at ${MAX_SUMMARY_CHARS} characters; rerun the local recommendation command for the full report.\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Expected one recommendation JSON path');
    if (statSync(process.argv[2]).size > MAX_INPUT_BYTES) throw new Error('Recommendation JSON is too large');
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(formatRecommendationSummary(report));
  } catch {
    process.stderr.write('Security recommendation summary could not be generated from valid JSON.\n');
    process.exitCode = 1;
  }
}
