import { existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryProject, SUPPORT_STATUSES } from './inventory-project.mjs';
import { BUNDLED_CATALOG, FRAMEWORK_ROOT, PROJECT_EVIDENCE_PATH, UsageError, directoryPath, parseOptions,
  readJsonFile, regularFile } from './security-cli.mjs';

const MAX_CATALOG_BYTES = 256 * 1024;
const MAX_EVIDENCE_FILE_BYTES = 64 * 1024;
const MAX_EVIDENCE_PATHS = 10;
const MAX_SUPPORT_ITEMS = 20;
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

// Project-local evidence may name dot-directories such as `.github`, but never environment files.
// These paths are only checked for existence later; their contents are never read.
export function safeProjectLocalPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 240 &&
    !/[\x00-\x1f\x7f\\]/.test(path) && !path.startsWith('/') &&
    path.split('/').every(part => part && part !== '..' && part !== '.' && !/^\.env/i.test(part));
}

// Optional `support` block (Phase 4A). Absent means support was not assessed and is treated as unknown.
function validateSupport(support) {
  const supportItem = (item, kind) => object(item) && SUPPORT_STATUSES.includes(item.status) &&
    (item.status !== 'partial' || kind === 'framework') &&
    (item.id === null || (typeof item.id === 'string' && ID_PATTERN.test(item.id) && item.id.length <= 80)) &&
    (item.status === 'unknown' || item.id !== null) &&
    stringList(item.detected, true) && item.detected.length <= MAX_SUPPORT_ITEMS && item.detected.every(id => ID_PATTERN.test(id)) &&
    stringList(item.evidence, true) && item.evidence.length <= MAX_SUPPORT_ITEMS && item.evidence.every(safeEvidencePath) &&
    stringList(item.reasons, true) && item.reasons.length <= MAX_SUPPORT_ITEMS && item.reasons.every(code => ID_PATTERN.test(code)) &&
    (item.status === 'supported') === (item.reasons.length === 0);
  if (!object(support) || !object(support.supportedTargets) ||
      !stringList(support.supportedTargets.frameworks) || !stringList(support.supportedTargets.packageManagers) ||
      !supportItem(support.framework, 'framework') || !supportItem(support.packageManager, 'packageManager') ||
      (support.framework.confidence !== undefined && !CONFIDENCES.has(support.framework.confidence)) ||
      (support.framework.status === 'supported' && !support.supportedTargets.frameworks.includes(support.framework.id)) ||
      (support.packageManager.status === 'supported' && !support.supportedTargets.packageManagers.includes(support.packageManager.id))) {
    fail('invalid inventory support block');
  }
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
  if (inventory.support !== undefined) validateSupport(inventory.support);
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

// `referenceRoot` resolves the catalog's reusable `provenance` (method documents and scripts shipped with the
// catalog). It is not the scanned project: project-local evidence lives in a separate file in that project.
export function validateCheckCatalog(catalog, inventory, referenceRoot) {
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
          !existsSync(join(referenceRoot, path)) || !lstatSync(join(referenceRoot, path)).isFile()) {
        fail(`${check.id}: invalid provenance path`);
      }
    }
    if (check.requiresSupportedPackageManager !== undefined && typeof check.requiresSupportedPackageManager !== 'boolean') {
      fail(`${check.id}: requiresSupportedPackageManager must be a boolean`);
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

// Project-local evidence: which files in *this* project document or implement each check.
export function validateProjectEvidence(evidence, catalog) {
  if (!object(evidence) || evidence.schemaVersion !== 1 || evidence.kind !== 'project-local-security-evidence' ||
      !nonempty(evidence.catalogId) || !object(evidence.checks)) fail('invalid project-local evidence schema');
  if (evidence.catalogId !== catalog.catalogId) fail('project-local evidence names a different catalog');
  const known = new Set(catalog.checks.map(check => check.id));
  const entries = Object.entries(evidence.checks);
  if (entries.length > known.size) fail('project-local evidence lists too many checks');
  for (const [id, paths] of entries) {
    if (!known.has(id)) fail(`project-local evidence names unknown check ${String(id).slice(0, 80)}`);
    if (!stringList(paths) || paths.length > MAX_EVIDENCE_PATHS || !paths.every(safeProjectLocalPath)) {
      fail(`${id}: invalid project-local evidence paths`);
    }
  }
  return { checkCount: entries.length };
}

// Resolves CLI options shared by the catalog validator and the recommendation command.
export function loadSecurityInputs(args) {
  const options = parseOptions(args, { values: ['root', 'catalog', 'reference-root', 'project-evidence'],
    flags: ['no-project-evidence'] });
  if (options['project-evidence'] && options['no-project-evidence']) throw new UsageError('Choose either --project-evidence or --no-project-evidence');
  const projectRoot = directoryPath(options.root ?? process.cwd(), 'Project root');
  const referenceRoot = directoryPath(options['reference-root'] ?? FRAMEWORK_ROOT, 'Reference root');
  const catalogPath = resolve(options.catalog ?? join(FRAMEWORK_ROOT, BUNDLED_CATALOG));
  const catalog = readJsonFile(catalogPath, MAX_CATALOG_BYTES, 'Catalog');
  let evidencePath = null;
  if (options['project-evidence']) evidencePath = resolve(options['project-evidence']);
  else if (!options['no-project-evidence'] && regularFile(join(projectRoot, PROJECT_EVIDENCE_PATH))) {
    evidencePath = join(projectRoot, PROJECT_EVIDENCE_PATH);
  }
  const projectEvidence = evidencePath ? readJsonFile(evidencePath, MAX_EVIDENCE_FILE_BYTES, 'Project-local evidence') : null;
  return { projectRoot, referenceRoot, catalogPath, catalog, evidencePath, projectEvidence };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const inputs = loadSecurityInputs(process.argv.slice(2));
    const result = validateCheckCatalog(inputs.catalog, inventoryProject(inputs.projectRoot), inputs.referenceRoot);
    const evidence = inputs.projectEvidence ? validateProjectEvidence(inputs.projectEvidence, inputs.catalog) : null;
    process.stdout.write(`Security check catalog valid: ${result.checkCount} checks; ${result.signalCount} inventory signals.` +
      `${evidence ? ` Project-local evidence valid: ${evidence.checkCount} checks.` : ''}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof UsageError || /^Invalid security check catalog/.test(error.message) ? error.message : 'Security check catalog could not be validated.'}\n`);
    process.exitCode = 1;
  }
}
