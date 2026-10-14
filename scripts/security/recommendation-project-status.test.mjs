import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { formatRecommendationSummary, validateRecommendationReport } from './format-security-recommendations.mjs';
import { inventoryProject } from './inventory-project.mjs';
import { recommendSecurityChecks } from './recommend-security-checks.mjs';

// Phase 4C.2 regressions from the read-only pilot: toolkit capability must never read as project setup, a run or a
// pass, and reusable catalog text must not assume one project's stack. All projects here are synthetic.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(readFileSync(join(root, 'docs/security/SECURITY-CHECK-CATALOG.json'), 'utf8'));
const NPM_LOCK = JSON.stringify({ name: 'fixture', lockfileVersion: 3, requires: true, packages: { '': { name: 'fixture' } } });
const site = {
  'package.json': JSON.stringify({ private: true, dependencies: { next: '16.0.0', react: '19.0.0', 'react-dom': '19.0.0' } }),
  'package-lock.json': NPM_LOCK,
  'src/app/page.tsx': 'export default function Page() { return <form><input name="email" /></form> }',
};
const evidenceFor = checks => ({ schemaVersion: 1, kind: 'project-local-security-evidence', catalogId: catalog.catalogId,
  project: 'Synthetic project', note: 'Synthetic pointers.', checks });

function run(files, evidence = null) {
  const dir = mkdtempSync(join(tmpdir(), 'project-status-'));
  try {
    for (const [name, value] of Object.entries(files)) { mkdirSync(dirname(join(dir, name)), { recursive: true }); writeFileSync(join(dir, name), value); }
    const report = recommendSecurityChecks(inventoryProject(dir), catalog, root, { projectRoot: dir, projectEvidence: evidence });
    return { report, byId: Object.fromEntries(report.recommendations.map(check => [check.id, check])),
      reason: id => report.humanConfirmation.find(item => item.checkId === id).reason, markdown: formatRecommendationSummary(report) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
// Known negations ("nothing shows it is configured…") are removed before looking for affirmative claims.
const NEGATIONS = ['no check below is shown as configured, run, or passed in this project', 'nothing shows it is configured or has run in this project'];
const claimsIn = text => NEGATIONS.reduce((value, phrase) => value.replaceAll(phrase, ''), text);
const NO_CLAIMS = /\b(?:is|was|are|were) (?:configured|run|executed|passing)\b|\b(?:scan|check|checks) passed\b|\bpassed in this project\b|\bactual check result\b/i;

test('no CI, no audit, no secret-scan result: automatable is never reported as configured, run or passed', () => {
  const { report, byId, reason, markdown } = run(site);
  for (const id of ['dependency_scan', 'secret_scan']) {
    assert.equal(byId[id].executionStatus, 'automated_now', 'catalog capability is kept for compatibility');
    assert.deepEqual(byId[id].projectStatus, { toolkitCapability: 'automatable_with_toolkit', configuration: 'not_verified', execution: 'not_verified', result: 'not_verified' });
    assert.match(reason(id), /nothing shows it is configured or has run in this project/);
    assert.match(markdown, new RegExp(`${id.replaceAll('_', '&#95;')}</code> — \\*\\*recommended\\*\\*\\. [^\\n]*Status: toolkit can automate; project setup not verified; run and result not verified\\.`));
  }
  assert.ok(report.recommendations.every(check => check.projectStatus.execution === 'not_verified' && check.projectStatus.result === 'not_verified'));
  assert.equal(byId.build_verification.projectStatus.toolkitCapability, 'planned_not_yet_automated');
  assert.equal(byId.repo_host_access_review.projectStatus.toolkitCapability, 'human_review_only');
  assert.match(markdown, /Toolkit capability is not project setup: no check below is shown as configured, run, or passed in this project\./);
  assert.doesNotMatch(claimsIn(markdown), NO_CLAIMS);
  assert.doesNotMatch(claimsIn(report.humanConfirmation.map(item => item.reason).join(' ')), NO_CLAIMS);
});

test('project evidence files present: setup is "files present, not verified", and still never a run or a pass', () => {
  const files = { ...site, '.github/workflows/security.yml': 'name: security\n' };
  const { byId, reason, markdown } = run(files, evidenceFor({ dependency_scan: ['.github/workflows/security.yml'], secret_scan: ['.github/workflows/missing.yml'] }));
  assert.equal(byId.dependency_scan.projectStatus.configuration, 'project_files_present_not_verified');
  assert.equal(byId.dependency_scan.projectStatus.execution, 'not_verified');
  assert.equal(byId.dependency_scan.projectStatus.result, 'not_verified');
  assert.match(reason('dependency_scan'), /file presence is not a run or a pass/);
  assert.match(markdown, /project files present, setup not verified; run and result not verified/);
  // A listed but missing file is not evidence of setup.
  assert.equal(byId.secret_scan.projectEvidence[0].status, 'missing');
  assert.equal(byId.secret_scan.projectStatus.configuration, 'not_verified');
});

test('unsupported and unknown projects: npm-only automation is marked as not covering the project', () => {
  const pnpm = run({ 'package.json': JSON.stringify({ private: true, dependencies: { next: '16.0.0', react: '19.0.0' } }),
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n", 'src/app/page.tsx': 'export default () => null' });
  assert.equal(pnpm.byId.dependency_scan.projectStatus.toolkitCapability, 'toolkit_does_not_cover_this_project');
  assert.match(pnpm.reason('dependency_scan'), /toolkit automation does not cover this project type/);
  assert.equal(pnpm.byId.secret_scan.projectStatus.toolkitCapability, 'automatable_with_toolkit');
  assert.match(pnpm.markdown, /toolkit automation does not cover this project; project setup not verified/);

  const unknown = run({ 'index.html': '<!doctype html><form><input name="q"></form>' });
  assert.equal(unknown.report.projectSupport.framework.status, 'unknown');
  assert.equal(unknown.byId.dependency_scan.projectStatus.toolkitCapability, 'toolkit_does_not_cover_this_project');
  assert.ok(unknown.report.recommendations.filter(check => check.disposition === 'needs_human_review').length > 0);
  assert.match(unknown.markdown, /needs&#95;human&#95;review<\/code>|needs_human_review\*\*\. [^\n]*Status: /);
  assert.doesNotMatch(claimsIn(unknown.markdown), NO_CLAIMS);
});

test('report compatibility: projectStatus is optional, and any claimed run or result is rejected', () => {
  const { report } = run(site);
  const older = structuredClone(report);
  for (const check of older.recommendations) delete check.projectStatus;
  assert.doesNotThrow(() => formatRecommendationSummary(older));
  for (const mutate of [
    check => { check.projectStatus.execution = 'ran'; },
    check => { check.projectStatus.result = 'passed'; },
    check => { check.projectStatus.configuration = 'configured'; },
    check => { check.projectStatus.toolkitCapability = 'automated_now'; },
    check => { check.projectStatus.extra = true; },
  ]) {
    const changed = structuredClone(report);
    mutate(changed.recommendations[0]);
    assert.throws(() => validateRecommendationReport(changed), /Invalid security recommendation report/);
  }
});

test('reusable catalog wording names no single stack; Sanity appears only as a stated detection limit', () => {
  for (const check of catalog.checks) {
    for (const [field, value] of Object.entries(check)) {
      if (field === 'match' || field === 'provenance' || field === 'id') continue;
      for (const textValue of [value].flat().filter(item => typeof item === 'string')) {
        assert.doesNotMatch(textValue, /trufflehog|\bPR\b|pull request|next\.config\.ts|github|studio|vercel|segundita/i, `${check.id}.${field}`);
        if (/sanity/i.test(textValue)) assert.match(textValue, /recognizes Sanity only/, `${check.id}.${field} must state the Sanity-only detection limit`);
      }
    }
  }
  const ids = catalog.checks.map(check => check.id);
  assert.deepEqual(ids, [...new Set(ids)]);
  assert.equal(catalog.checks.length, 15, 'stable check set');
});
