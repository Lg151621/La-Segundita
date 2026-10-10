import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_INPUT_BYTES = 128 * 1024;
const MAX_SUMMARY_CHARS = 12_000;
const MAX_SIGNALS = 30;
const MAX_CHECKS = 30;
const MAX_EVIDENCE = 5;
const MAX_FIELD_CHARS = 160;
const STATUSES = ['detected', 'needs human verification', 'not detected in inspected scope'];
const CONFIDENCES = new Set(['high', 'medium', 'low']);

function safeText(value) {
  const normalized = String(value).replace(/[\x00-\x1f\x7f]/g, ' ');
  const clipped = normalized.length > MAX_FIELD_CHARS
    ? `${normalized.slice(0, MAX_FIELD_CHARS)}…` : normalized;
  return clipped.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function code(value) { return `<code>${safeText(value)}</code>`; }

function array(value) { return Array.isArray(value) ? value : []; }

function validate(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report) ||
      report.schemaVersion !== 1 || report.tool !== 'project-security-inventory' ||
      !Array.isArray(report.signals)) {
    throw new Error('Invalid project inventory schema');
  }
  for (const signal of report.signals) {
    if (!signal || typeof signal.id !== 'string' || !STATUSES.includes(signal.status) ||
        !CONFIDENCES.has(signal.confidence) || !Array.isArray(signal.evidence) ||
        !signal.evidence.every(path => typeof path === 'string')) {
      throw new Error('Invalid project inventory signal');
    }
  }
  if (report.candidateChecks !== undefined && !Array.isArray(report.candidateChecks)) {
    throw new Error('Invalid project inventory checks');
  }
}

export function formatInventorySummary(report) {
  validate(report);
  const lines = [
    '## Project security inventory',
    '',
    '**Automated observations only.** These findings are not proof of absence and are not compliance certification.',
    '',
  ];
  const signals = report.signals.slice(0, MAX_SIGNALS);
  for (const status of STATUSES) {
    lines.push(`### ${status === 'detected' ? 'Detected capabilities' : status === 'needs human verification' ? 'Needs human verification' : 'Not detected in inspected scope'}`, '');
    const group = signals.filter(signal => signal.status === status);
    if (!group.length) lines.push('None in this group.');
    for (const signal of group) {
      const evidence = signal.evidence.slice(0, MAX_EVIDENCE).map(code);
      const hidden = signal.evidence.length - evidence.length;
      const reference = evidence.length ? ` Evidence: ${evidence.join(', ')}${hidden ? `, and ${hidden} more` : ''}.` : '';
      lines.push(`- ${code(signal.id)} (${code(signal.confidence)} confidence).${reference}`);
    }
    lines.push('');
  }
  if (report.signals.length > signals.length) lines.push(`Signal list limited to ${MAX_SIGNALS} entries.`, '');

  const incomplete = array(report.scope?.incomplete).filter(value => typeof value === 'string');
  lines.push('### Scope and uncertainty', '');
  lines.push(`Source files inspected: ${Number.isSafeInteger(report.scope?.sourceFilesInspected) && report.scope.sourceFilesInspected >= 0 ? report.scope.sourceFilesInspected : 'unknown'}.`);
  lines.push(`Package manifest: ${code(typeof report.scope?.packageManifest === 'string' ? report.scope.packageManifest : 'unknown')}.`);
  lines.push(incomplete.length ? `Incomplete scan reasons: ${incomplete.slice(0, 10).map(code).join(', ')}${incomplete.length > 10 ? ', and more' : ''}.` : 'No scan limit or unreadable source was reported.');
  lines.push('A non-detection applies only to the files and patterns inspected. Verify live services, provider settings, and production behavior separately.', '');

  lines.push('### Follow-up topics for human review', '');
  const checks = array(report.candidateChecks).filter(check => check?.requiresHumanReview === true).slice(0, MAX_CHECKS);
  if (!checks.length) lines.push('No review topics were supplied.');
  for (const check of checks) {
    const triggers = array(check.triggeredBy).filter(value => typeof value === 'string').slice(0, 5);
    lines.push(`- ${code(typeof check.id === 'string' ? check.id.replaceAll('_', ' ') : 'unnamed check')}${triggers.length ? ` (trigger: ${triggers.map(code).join(', ')})` : ''}`);
  }
  if (array(report.candidateChecks).length > MAX_CHECKS) lines.push(`Review topic list limited to ${MAX_CHECKS} entries.`);
  lines.push('', 'Review the source evidence and project profile before deciding applicability, risk, remediation, or enforcement.');

  const summary = `${lines.join('\n')}\n`;
  if (summary.length <= MAX_SUMMARY_CHARS) return summary;
  return `${summary.slice(0, MAX_SUMMARY_CHARS - 91).replace(/[^\n]*$/, '')}\nOutput truncated at ${MAX_SUMMARY_CHARS} characters; inspect the inventory JSON locally for full details.\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Expected one inventory JSON path');
    if (statSync(process.argv[2]).size > MAX_INPUT_BYTES) throw new Error('Inventory JSON is too large');
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(formatInventorySummary(report));
  } catch {
    process.stderr.write('Project inventory summary could not be generated from valid JSON.\n');
    process.exitCode = 1;
  }
}
