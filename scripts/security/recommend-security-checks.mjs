import { lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryProject } from './inventory-project.mjs';
import { loadSecurityInputs, validateCheckCatalog, validateProjectEvidence } from './validate-check-catalog.mjs';
import { BUNDLED_CATALOG, PROJECT_EVIDENCE_PATH, UsageError, sourceLabel } from './security-cli.mjs';

const MAX_REPORT_BYTES = 64 * 1024;
const MAX_CHECKS = 64;
const MAX_EVIDENCE = 5;
const MAX_TEXT = 240;

function text(value) {
  const clean = String(value).replace(/[\x00-\x1f\x7f]/g, ' ');
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
}
function bounded(values, limit = 5) { return values.slice(0, limit).map(text); }

// Inventories produced before Phase 4A carry no support block; treat both dimensions as unknown.
const UNASSESSED = { status: 'unknown', id: null, detected: [], evidence: [], reasons: ['support_not_assessed'] };
function supportOf(inventory) {
  const support = inventory.support;
  const item = value => ({ status: value.status, id: value.id, detected: bounded(value.detected, 10),
    evidence: bounded(value.evidence, 10), reasons: bounded(value.reasons, 10) });
  return {
    framework: item(support?.framework ?? UNASSESSED),
    packageManager: item(support?.packageManager ?? UNASSESSED),
    supportedTargets: support?.supportedTargets
      ? { frameworks: bounded(support.supportedTargets.frameworks, 10), packageManagers: bounded(support.supportedTargets.packageManagers, 10) }
      : { frameworks: [], packageManagers: [] },
  };
}

// Existence only: a project-local evidence file is never opened, and symlinks are not followed.
function evidenceStatus(projectRoot, path) {
  if (!projectRoot) return 'not_checked';
  try {
    const stat = lstatSync(join(projectRoot, path), { throwIfNoEntry: false });
    return !stat ? 'missing' : stat.isFile() ? 'present' : 'not_regular_file';
  } catch { return 'not_checked'; }
}

// `referenceRoot` resolves the catalog's reusable provenance. `options.projectRoot` and
// `options.projectEvidence` add project-local evidence presence; both are optional.
export function recommendSecurityChecks(inventory, catalog, referenceRoot, options = {}) {
  validateCheckCatalog(catalog, inventory, referenceRoot);
  if (catalog.checks.length > MAX_CHECKS) throw new Error('Catalog exceeds recommendation limit');
  const projectEvidence = options.projectEvidence ?? null;
  if (projectEvidence) validateProjectEvidence(projectEvidence, catalog);
  const support = supportOf(inventory);
  const frameworkLimited = support.framework.status !== 'supported';
  const packageManagerLimited = support.packageManager.status !== 'supported';

  const bySignal = new Map(inventory.signals.map(signal => [signal.id, signal]));
  const incompleteReasons = bounded(inventory.scope.incomplete, 20);
  if (inventory.scope.sourceFilesInspected === 0) incompleteReasons.push('no_source_files');
  if (['invalid', 'too_large'].includes(inventory.scope.packageManifest) &&
      !incompleteReasons.includes('unusable_package_manifest')) incompleteReasons.push('unusable_package_manifest');
  const complete = incompleteReasons.length === 0;
  const nonDetectionReliable = complete && !frameworkLimited;

  const recommendations = [...catalog.checks].sort((a, b) => a.id.localeCompare(b.id, 'en')).map(check => {
    const matchSignals = check.match.signals.map(id => {
      const signal = bySignal.get(id);
      return {
        id,
        status: signal.status,
        confidence: signal.confidence,
        evidence: bounded([...signal.evidence].sort(), MAX_EVIDENCE),
        evidenceOmitted: Math.max(0, signal.evidence.length - MAX_EVIDENCE),
      };
    });
    let disposition;
    let rationale;
    if (check.match.mode === 'always') {
      disposition = 'recommended';
      rationale = 'Catalog marks this check as relevant for every project; no check result was evaluated.';
    } else {
      const clearDetection = matchSignals.some(signal => signal.status === 'detected' &&
        signal.confidence !== 'low' && signal.evidence.length > 0);
      const uncertain = !complete || matchSignals.some(signal =>
        signal.status === 'needs human verification' || signal.confidence === 'low' ||
        (signal.status === 'detected' && signal.evidence.length === 0) ||
        (signal.status === 'not detected in inspected scope' && signal.evidence.length > 0));
      if (clearDetection) {
        disposition = 'recommended';
        rationale = uncertain || frameworkLimited
          ? 'At least one signal has concrete source evidence; other evidence or scan limits still need review.'
          : 'At least one matching signal has concrete source evidence; this is a check proposal only.';
      } else if (uncertain) {
        disposition = 'needs_human_review';
        rationale = 'Signal evidence is uncertain, contradictory, missing, or the scan is incomplete; confirm applicability.';
      } else if (frameworkLimited) {
        // An unsupported or unknown project layout can hide routes, forms or integrations from this scanner.
        disposition = 'needs_human_review';
        rationale = `Project framework support is ${support.framework.status}; source non-detection cannot rule this check out. Confirm applicability.`;
      } else {
        disposition = 'not_currently_indicated';
        rationale = 'No matching signal was detected in the inspected source; external or future use is not ruled out.';
      }
    }
    const supportNotes = [];
    if (check.requiresSupportedPackageManager === true && packageManagerLimited) {
      supportNotes.push(`Package manager support is ${support.packageManager.status}` +
        `${support.packageManager.id ? ` (${support.packageManager.id})` : ''}; the existing automation covers npm lockfiles only, ` +
        'so its result does not cover this project. Use the package manager\'s own advisory tooling and review manually.');
    }
    const localPaths = projectEvidence?.checks?.[check.id] ?? [];
    return {
      id: check.id,
      name: text(check.name),
      disposition,
      executionStatus: check.executionStatus,
      matchMode: check.match.mode,
      matchSignals,
      rationale,
      evidenceRequired: bounded(check.evidenceRequired),
      detectionLimits: text(check.detectionLimits),
      recommendedAction: text(check.recommendedAction),
      ownerApprovalRequiredForRiskDecision: check.ownerApprovalRequiredForRiskDecision,
      provenance: bounded(check.provenance),
      supportNotes: bounded(supportNotes, 3),
      projectEvidence: localPaths.slice(0, MAX_EVIDENCE).map(path => ({ path: text(path), status: evidenceStatus(options.projectRoot, path) })),
      projectEvidenceOmitted: Math.max(0, localPaths.length - MAX_EVIDENCE),
    };
  });

  const summary = { recommended: 0, needsHumanReview: 0, notCurrentlyIndicated: 0, total: recommendations.length };
  for (const check of recommendations) {
    if (check.disposition === 'recommended') summary.recommended++;
    else if (check.disposition === 'needs_human_review') summary.needsHumanReview++;
    else summary.notCurrentlyIndicated++;
  }
  const humanConfirmation = recommendations.map(check => ({
    checkId: check.id,
    reason: check.disposition === 'needs_human_review'
      ? 'Confirm applicability from missing, uncertain, conflicting, or incomplete evidence.'
      : check.disposition === 'not_currently_indicated'
        ? 'Confirm external or offline feature use before relying on this bounded non-detection.'
        : check.executionStatus === 'automated_now' && check.supportNotes.length
          ? 'Existing automation does not cover this project type; arrange an equivalent check and review it separately.'
        : check.executionStatus === 'automated_now'
          ? 'Review the actual check result separately; this report did not run the check.'
          : 'Confirm applicability and arrange this check; no execution result is recorded.',
  }));
  const report = {
    schemaVersion: 1,
    tool: 'security-check-recommendations',
    inputs: { inventorySchemaVersion: inventory.schemaVersion, catalogSchemaVersion: catalog.schemaVersion,
      catalogId: text(catalog.catalogId), inventorySource: 'local project inventory',
      catalogSource: text(options.catalogSource ?? BUNDLED_CATALOG),
      projectEvidenceSource: text(projectEvidence ? options.projectEvidenceSource ?? 'supplied project-local evidence' : 'none') },
    scan: { complete, sourceFilesInspected: inventory.scope.sourceFilesInspected,
      packageManifest: inventory.scope.packageManifest, incompleteReasons },
    // Additive in report schema version 1 (Phase 4A).
    projectSupport: { ...support, nonDetectionReliable },
    summary,
    recommendations,
    humanConfirmation,
    boundaries: {
      checksExecutedByThisTool: 0,
      checkResultsDetermined: false,
      riskAcceptanceDetermined: false,
      legalComplianceDetermined: false,
      note: 'Recommendations are source-based proposals for human review, not proof of absence or security status.',
    },
  };
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > MAX_REPORT_BYTES) {
    throw new Error('Recommendation report exceeds size limit');
  }
  return report;
}

export function serializeRecommendationReport(report) {
  // JSON remains parseable while the literal output is safe to embed in an HTML page later.
  const json = JSON.stringify(report).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  if (Buffer.byteLength(json, 'utf8') > MAX_REPORT_BYTES) throw new Error('Recommendation report exceeds size limit');
  return `${json}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const inputs = loadSecurityInputs(process.argv.slice(2));
    const report = recommendSecurityChecks(inventoryProject(inputs.projectRoot), inputs.catalog, inputs.referenceRoot, {
      projectRoot: inputs.projectRoot,
      projectEvidence: inputs.projectEvidence,
      catalogSource: sourceLabel(inputs.catalogPath, BUNDLED_CATALOG),
      projectEvidenceSource: inputs.evidencePath ? sourceLabel(inputs.evidencePath, PROJECT_EVIDENCE_PATH, inputs.projectRoot) : undefined,
    });
    process.stdout.write(serializeRecommendationReport(report));
  } catch (error) {
    // Usage and catalog-contract messages name options, check IDs and fields only, never local paths or file contents.
    process.stderr.write(error instanceof UsageError
      ? `${error.message}\nUsage: node scripts/security/recommend-security-checks.mjs [--root DIR] [--catalog FILE] [--reference-root DIR] [--project-evidence FILE | --no-project-evidence]\n`
      : /^Invalid security check catalog/.test(error.message) ? `${error.message}\n`
        : 'Security check recommendations could not be generated from valid local inputs.\n');
    process.exitCode = 1;
  }
}
