import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryProject } from './inventory-project.mjs';
import { validateCheckCatalog } from './validate-check-catalog.mjs';

const MAX_CATALOG_BYTES = 256 * 1024;
const MAX_REPORT_BYTES = 64 * 1024;
const MAX_CHECKS = 64;
const MAX_EVIDENCE = 5;
const MAX_TEXT = 240;

function text(value) {
  const clean = String(value).replace(/[\x00-\x1f\x7f]/g, ' ');
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
}
function bounded(values, limit = 5) { return values.slice(0, limit).map(text); }

export function recommendSecurityChecks(inventory, catalog, repositoryRoot) {
  validateCheckCatalog(catalog, inventory, repositoryRoot);
  if (catalog.checks.length > MAX_CHECKS) throw new Error('Catalog exceeds recommendation limit');

  const bySignal = new Map(inventory.signals.map(signal => [signal.id, signal]));
  const incompleteReasons = bounded(inventory.scope.incomplete, 20);
  if (inventory.scope.sourceFilesInspected === 0) incompleteReasons.push('no_source_files');
  if (['invalid', 'too_large'].includes(inventory.scope.packageManifest) &&
      !incompleteReasons.includes('unusable_package_manifest')) incompleteReasons.push('unusable_package_manifest');
  const complete = incompleteReasons.length === 0;

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
        rationale = uncertain
          ? 'At least one signal has concrete source evidence; other evidence or scan limits still need review.'
          : 'At least one matching signal has concrete source evidence; this is a check proposal only.';
      } else if (uncertain) {
        disposition = 'needs_human_review';
        rationale = 'Signal evidence is uncertain, contradictory, missing, or the scan is incomplete; confirm applicability.';
      } else {
        disposition = 'not_currently_indicated';
        rationale = 'No matching signal was detected in the inspected source; external or future use is not ruled out.';
      }
    }
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
        : check.executionStatus === 'automated_now'
          ? 'Review the actual check result separately; this report did not run the check.'
          : 'Confirm applicability and arrange this check; no execution result is recorded.',
  }));
  const report = {
    schemaVersion: 1,
    tool: 'security-check-recommendations',
    inputs: { inventorySchemaVersion: inventory.schemaVersion, catalogSchemaVersion: catalog.schemaVersion,
      catalogId: text(catalog.catalogId), inventorySource: 'local project inventory',
      catalogSource: 'docs/security/SECURITY-CHECK-CATALOG.json' },
    scan: { complete, sourceFilesInspected: inventory.scope.sourceFilesInspected,
      packageManifest: inventory.scope.packageManifest, incompleteReasons },
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
    if (process.argv.length !== 2) throw new Error('Unexpected arguments');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const catalogPath = join(root, 'docs/security/SECURITY-CHECK-CATALOG.json');
    const stat = lstatSync(catalogPath);
    if (!stat.isFile() || stat.size > MAX_CATALOG_BYTES) throw new Error('Invalid catalog file');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    const report = recommendSecurityChecks(inventoryProject(root), catalog, root);
    process.stdout.write(serializeRecommendationReport(report));
  } catch {
    process.stderr.write('Security check recommendations could not be generated from valid local inputs.\n');
    process.exitCode = 1;
  }
}
