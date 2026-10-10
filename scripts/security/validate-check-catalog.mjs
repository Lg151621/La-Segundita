import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryProject } from './inventory-project.mjs';

const MAX_CATALOG_BYTES = 256 * 1024;
const EXECUTION_STATUSES = new Set(['automated_now', 'future_implementation', 'human_review']);
const REVIEW_STATUSES = new Set(['detected', 'needs human verification']);
const SIGNAL_STATUSES = new Set([...REVIEW_STATUSES, 'not detected in inspected scope']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);
const SIGNAL_IDS = new Set(['nextjs', 'sanity_cms', 'api_routes', 'webhooks', 'browser_auth',
  'public_forms', 'payments', 'analytics', 'database']);
const MANIFEST_STATES = new Set(['valid', 'missing', 'invalid', 'too_large']);
const ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function fail(message) { throw new Error(`Invalid security check catalog: ${message}`); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function stringList(value, allowEmpty = false) {
  return Array.isArray(value) && (allowEmpty || value.length > 0) &&
    value.every(nonempty) && new Set(value).size === value.length;
}

function safeEvidencePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 240 &&
    !/[\x00-\x1f\x7f\\]/.test(path) && !path.startsWith('/') &&
    path.split('/').every(part => part && part !== '..' && part !== '.' && !part.startsWith('.'));
}

export function validateInventoryReport(inventory) {
  if (!object(inventory) || inventory.schemaVersion !== 1 ||
      inventory.tool !== 'project-security-inventory' || !object(inventory.scope) ||
      inventory.scope.root !== '.' || !Number.isSafeInteger(inventory.scope.sourceFilesInspected) ||
      inventory.scope.sourceFilesInspected < 0 || inventory.scope.sourceFilesInspected > 400 ||
      !MANIFEST_STATES.has(inventory.scope.packageManifest) ||
      !stringList(inventory.scope.incomplete, true) ||
      !Array.isArray(inventory.signals) || inventory.signals.length !== SIGNAL_IDS.size ||
      !Array.isArray(inventory.candidateChecks) || !object(inventory.boundaries) ||
      inventory.boundaries.complianceApplicability !== 'not determined' ||
      inventory.boundaries.riskLevel !== 'not assigned') {
    fail('invalid inventory schema or scope');
  }
  const seenSignals = new Set();
  for (const signal of inventory.signals) {
    if (!object(signal) || !SIGNAL_IDS.has(signal.id) || seenSignals.has(signal.id) ||
        !SIGNAL_STATUSES.has(signal.status) || !CONFIDENCES.has(signal.confidence) ||
        !Array.isArray(signal.evidence) || signal.evidence.length > 400 ||
        !signal.evidence.every(safeEvidencePath)) {
      fail('invalid, duplicate, or unknown inventory signal');
    }
    seenSignals.add(signal.id);
  }
  const seenChecks = new Set();
  for (const check of inventory.candidateChecks) {
    if (!object(check) || !ID_PATTERN.test(check.id ?? '') || seenChecks.has(check.id) ||
        !['always', 'conditional'].includes(check.basis) ||
        !stringList(check.triggeredBy, true) || !check.triggeredBy.every(id => SIGNAL_IDS.has(id)) ||
        check.requiresHumanReview !== true ||
        (check.basis === 'always' && check.triggeredBy.length) ||
        (check.basis === 'conditional' && !check.triggeredBy.length)) {
      fail('invalid or duplicate inventory candidate check');
    }
    seenChecks.add(check.id);
  }
  return { signalCount: seenSignals.size, candidateCount: seenChecks.size };
}

export function validateCheckCatalog(catalog, inventory, repositoryRoot) {
  if (!object(catalog) || catalog.schemaVersion !== 1 || catalog.inventorySchemaVersion !== 1 ||
      !nonempty(catalog.catalogId) || !Array.isArray(catalog.checks) || !catalog.checks.length) {
    fail('unsupported or missing top-level schema');
  }
  if (!object(inventory) || inventory.schemaVersion !== catalog.inventorySchemaVersion) {
    fail('inventory schema mismatch');
  }
  validateInventoryReport(inventory);
  const knownSignals = new Set(inventory.signals.map(signal => signal.id));
  const ids = new Set();
  for (const check of catalog.checks) {
    if (!object(check) || !ID_PATTERN.test(check.id ?? '') || check.id.length > 80 || ids.has(check.id)) fail('missing, duplicate, or unstable check ID');
    ids.add(check.id);
    for (const field of ['name', 'purpose', 'concern', 'detectionLimits', 'falsePositives', 'falseNegatives', 'recommendedAction']) {
      if (!nonempty(check[field])) fail(`${check.id}: missing ${field}`);
    }
    if (!EXECUTION_STATUSES.has(check.executionStatus)) fail(`${check.id}: unknown execution status`);
    if (check.ownerApprovalRequiredForRiskDecision !== true) fail(`${check.id}: risk-decision approval boundary missing`);
    if (!stringList(check.evidenceRequired) || !stringList(check.provenance)) fail(`${check.id}: evidence or provenance missing`);
    for (const path of check.provenance) {
      if (path.startsWith('/') || path.split('/').some(part => part === '..' || part === '.' || part === '') ||
          !existsSync(join(repositoryRoot, path)) || !lstatSync(join(repositoryRoot, path)).isFile()) {
        fail(`${check.id}: invalid provenance path`);
      }
    }
    const match = check.match;
    if (!object(match) || !stringList(match.signals, true) || !stringList(match.statuses, true)) fail(`${check.id}: invalid match fields`);
    if (match.mode === 'always') {
      if (match.signals.length || match.statuses.length) fail(`${check.id}: always match must not depend on signals`);
    } else if (match.mode === 'any_signal') {
      if (!match.signals.length || match.statuses.length !== REVIEW_STATUSES.size ||
          !match.statuses.every(status => REVIEW_STATUSES.has(status))) {
        fail(`${check.id}: conditional match must retain detected and uncertain signals`);
      }
      if (!match.signals.every(signal => knownSignals.has(signal))) fail(`${check.id}: unknown inventory signal`);
    } else fail(`${check.id}: unknown match mode`);
  }
  for (const candidate of inventory.candidateChecks) {
    if (!ids.has(candidate.id)) fail(`missing inventory candidate ${candidate.id}`);
    const check = catalog.checks.find(item => item.id === candidate.id);
    if (candidate.basis === 'always' && check.match.mode !== 'always') fail(`${candidate.id}: inventory match disagreement`);
    if (candidate.basis === 'conditional' &&
        (check.match.mode !== 'any_signal' || !candidate.triggeredBy.every(id => check.match.signals.includes(id)))) {
      fail(`${candidate.id}: inventory trigger disagreement`);
    }
  }
  return { checkCount: catalog.checks.length, signalCount: knownSignals.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) fail('no command-line arguments expected');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const path = join(root, 'docs/security/SECURITY-CHECK-CATALOG.json');
    if (statSync(path).size > MAX_CATALOG_BYTES) fail('catalog exceeds size limit');
    const catalog = JSON.parse(readFileSync(path, 'utf8'));
    const result = validateCheckCatalog(catalog, inventoryProject(root), root);
    process.stdout.write(`Security check catalog valid: ${result.checkCount} checks; ${result.signalCount} inventory signals.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof SyntaxError ? 'Invalid security check catalog JSON.' : error.message}\n`);
    process.exitCode = 1;
  }
}
