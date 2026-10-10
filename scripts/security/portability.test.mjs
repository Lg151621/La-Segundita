import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inventoryProject, parseRootArgument } from './inventory-project.mjs';
import { recommendSecurityChecks, serializeRecommendationReport } from './recommend-security-checks.mjs';
import { validateCheckCatalog, validateInventoryReport, validateProjectEvidence } from './validate-check-catalog.mjs';
import { formatRecommendationSummary } from './format-security-recommendations.mjs';
import { formatInventorySummary } from './format-project-inventory.mjs';
import { parseOptions } from './security-cli.mjs';

// Phase 4A portability tests. Every project here is synthetic and built in a temporary directory,
// so no fake lockfiles or framework manifests are committed to the repository.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(readFileSync(join(root, 'docs/security/SECURITY-CHECK-CATALOG.json'), 'utf8'));
const laSegunditaEvidence = JSON.parse(readFileSync(join(root, 'docs/security/PROJECT-LOCAL-EVIDENCE.json'), 'utf8'));
const NPM_LOCK = JSON.stringify({ name: 'fixture', lockfileVersion: 3, requires: true, packages: { '': { name: 'fixture' } } });
const SYMLINK = Symbol('symlink');
const byId = report => Object.fromEntries(report.recommendations.map(check => [check.id, check]));
const signals = inventory => Object.fromEntries(inventory.signals.map(signal => [signal.id, signal]));
const manifest = (dependencies, extra = {}) => JSON.stringify({ private: true, dependencies, ...extra });

function project(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'vitanova-portability-'));
  try {
    for (const [name, value] of Object.entries(files)) {
      const target = join(dir, name);
      mkdirSync(dirname(target), { recursive: true });
      if (Array.isArray(value) && value[0] === SYMLINK) symlinkSync(join(dir, value[1]), target);
      else writeFileSync(target, value);
    }
    return run(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function recommend(dir, options = {}) {
  return recommendSecurityChecks(inventoryProject(dir), catalog, root, { projectRoot: dir, ...options });
}
function cli(script, args, cwd = root) {
  return spawnSync(process.execPath, [join(root, 'scripts/security', script), ...args], { cwd, encoding: 'utf8' });
}
const conditional = report => report.recommendations.filter(check => check.matchMode === 'any_signal');

const reactVite = {
  'package.json': manifest({ react: '19.0.0', 'react-dom': '19.0.0' }, { devDependencies: { vite: '7.0.0', '@vitejs/plugin-react': '5.0.0' } }),
  'package-lock.json': NPM_LOCK,
  'vite.config.ts': "import react from '@vitejs/plugin-react'; export default { plugins: [react()] }",
  'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
  'src/main.tsx': "import App from './App'; export default App",
  'src/App.tsx': 'export default function App() { return <form><input name="email" /></form> }',
  'api/contact.ts': 'export default function handler(req, res) { res.status(200).end() }',
};
const astro = {
  'package.json': manifest({ astro: '5.0.0', '@vercel/analytics': '2.0.0' }),
  'package-lock.json': NPM_LOCK,
  'astro.config.mjs': "import { defineConfig } from 'astro/config'; export default defineConfig({})",
  'src/layouts/Base.astro': "---\nimport Analytics from '@vercel/analytics/astro';\n---\n<html><body><slot /><Analytics /></body></html>",
  'src/pages/index.astro': '---\n---\n<form method="post" action="/api/subscribe"><input name="email" /></form>',
  'src/pages/api/subscribe.ts': 'export const POST = async () => new Response(null, { status: 204 })',
};

test('React/Vite with npm is supported and maps src/ forms and api/ functions', () => project(reactVite, dir => {
  const inventory = inventoryProject(dir);
  assert.equal(validateInventoryReport(inventory).signalCount, 9);
  assert.deepEqual(inventory.support.framework, { status: 'supported', id: 'react_vite', confidence: 'high',
    detected: ['react_vite'], evidence: ['package.json', 'vite.config.ts'], reasons: [] });
  assert.deepEqual(inventory.support.packageManager, { status: 'supported', id: 'npm', detected: ['npm'],
    evidence: ['package-lock.json'], reasons: [] });
  const found = signals(inventory);
  assert.deepEqual(found.public_forms.evidence, ['src/App.tsx']);
  assert.deepEqual(found.api_routes.evidence, ['api/contact.ts']);
  assert.equal(found.nextjs.status, 'not detected in inspected scope');
  const report = recommend(dir);
  assert.equal(report.projectSupport.nonDetectionReliable, true);
  assert.equal(byId(report).form_validation_abuse_privacy_review.disposition, 'recommended');
  assert.equal(byId(report).api_input_validation_review.disposition, 'recommended');
  assert.equal(byId(report).payment_flow_pci_scope_review.disposition, 'not_currently_indicated');
  assert.deepEqual(byId(report).dependency_scan.supportNotes, []);
}));

test('Astro with npm is supported; .astro pages and src/pages endpoints are inspected', () => project(astro, dir => {
  const inventory = inventoryProject(dir);
  assert.equal(inventory.support.framework.status, 'supported');
  assert.equal(inventory.support.framework.id, 'astro');
  assert.deepEqual(inventory.support.framework.evidence, ['astro.config.mjs', 'package.json']);
  const found = signals(inventory);
  assert.deepEqual(found.api_routes.evidence, ['src/pages/api/subscribe.ts']);
  assert.deepEqual(found.public_forms.evidence, ['src/pages/index.astro']);
  assert.equal(found.analytics.status, 'detected');
  assert.deepEqual(found.analytics.evidence, ['package.json', 'src/layouts/Base.astro']);
  const report = recommend(dir);
  assert.equal(byId(report).analytics_privacy_review.disposition, 'recommended');
  assert.equal(byId(report).database_access_retention_review.disposition, 'not_currently_indicated');
}));

test('Next.js under src/ remains supported and pages-router pages are not mistaken for API routes', () => project({
  'package.json': manifest({ next: '16.0.0', react: '19.0.0', 'react-dom': '19.0.0' }),
  'package-lock.json': NPM_LOCK,
  'src/app/layout.tsx': 'export default function Layout({ children }) { return children }',
  'src/app/api/health/route.ts': 'export function GET() { return Response.json({ ok: true }) }',
  'src/pages/about.js': 'export default function About() { return null }',
  'src/utils/format.ts': 'export const format = value => String(value)',
}, dir => {
  const inventory = inventoryProject(dir);
  assert.equal(inventory.support.framework.id, 'nextjs');
  assert.equal(inventory.support.framework.status, 'supported');
  assert.equal(inventory.support.framework.confidence, 'medium');
  assert.deepEqual(signals(inventory).api_routes.evidence, ['src/app/api/health/route.ts']);
  assert.ok(inventory.scope.sourceFilesInspected >= 4);
}));

test('an unsupported framework never yields "not currently indicated" for conditional checks', () => project({
  'package.json': manifest({ '@sveltejs/kit': '2.0.0', svelte: '5.0.0' }, { devDependencies: { vite: '7.0.0' } }),
  'package-lock.json': NPM_LOCK,
  'src/routes/+page.svelte': '<form method="post"><input name="email" /></form>',
  'src/routes/api/+server.ts': 'export const POST = () => new Response()',
}, dir => {
  const inventory = inventoryProject(dir);
  assert.deepEqual(inventory.support.framework, { status: 'unsupported', id: 'sveltekit', confidence: 'medium',
    detected: ['svelte', 'sveltekit'], evidence: ['package.json'], reasons: ['unsupported_framework'] });
  const report = recommend(dir);
  assert.equal(report.projectSupport.nonDetectionReliable, false);
  assert.equal(report.summary.notCurrentlyIndicated, 0);
  for (const check of conditional(report)) {
    assert.equal(check.disposition, 'needs_human_review', check.id);
    assert.match(check.rationale, /framework support is unsupported/);
    assert.doesNotMatch(check.rationale, /\b(?:secure|passed|compliant)\b/i);
  }
  const summary = formatRecommendationSummary(report);
  assert.ok(summary.includes('sveltekit'));
  assert.ok(summary.includes('Limited support'));
  assert.ok(formatInventorySummary(inventory).includes('not evidence of absence'));
}));

for (const [name, files, expected] of [
  ['no package manifest', { 'index.html': '<h1>Hi</h1>' }, { status: 'unknown', reasons: ['no_package_manifest'] }],
  ['unusable package manifest', { 'package.json': '{ not json', 'src/index.js': 'export {}' }, { status: 'unknown', reasons: ['unusable_package_manifest'] }],
  ['no recognised framework', { 'package.json': manifest({ lodash: '4.0.0' }), 'src/index.js': 'export {}' }, { status: 'unknown', reasons: ['no_recognized_framework'] }],
  ['React without a supported build tool', { 'package.json': manifest({ react: '19.0.0', webpack: '5.0.0' }), 'src/index.js': 'export {}' }, { status: 'unknown', reasons: ['react_without_supported_build_tool'] }],
  ['multiple host frameworks', { 'package.json': manifest({ next: '16.0.0', astro: '5.0.0' }), 'app/page.tsx': 'export default () => null' }, { status: 'unknown', reasons: ['multiple_frameworks'] }],
  ['Create React App', { 'package.json': manifest({ react: '19.0.0', 'react-scripts': '5.0.0' }), 'src/index.js': 'export {}' }, { status: 'unsupported', id: 'create_react_app', reasons: ['unsupported_framework'] }],
  ['Vue on Vite', { 'package.json': manifest({ vue: '3.0.0', vite: '7.0.0' }), 'src/main.js': 'export {}' }, { status: 'unsupported', id: 'vite_vue', reasons: ['unsupported_framework'] }],
  ['server framework only', { 'package.json': manifest({ express: '5.0.0' }), 'src/server.js': 'export {}' }, { status: 'unsupported', id: 'express', reasons: ['server_framework_only'] }],
  ['Astro with Vue islands', { 'package.json': manifest({ astro: '5.0.0', '@astrojs/vue': '5.0.0', vue: '3.0.0' }), 'src/pages/index.astro': '<h1/>' }, { status: 'partial', id: 'astro', reasons: ['unsupported_component_framework'] }],
  ['React/Vite with an Express server', { 'package.json': manifest({ react: '19.0.0', vite: '7.0.0', express: '5.0.0' }), 'src/App.tsx': 'export default () => null' }, { status: 'partial', id: 'react_vite', reasons: ['additional_server_framework'] }],
  ['Next.js workspace root', { 'package.json': manifest({ next: '16.0.0' }, { workspaces: ['packages/*'] }), 'app/page.tsx': 'export default () => null' }, { status: 'partial', id: 'nextjs', reasons: ['workspace_packages_not_scanned'] }],
]) {
  test(`framework support: ${name}`, () => project(files, dir => {
    const inventory = inventoryProject(dir);
    validateInventoryReport(inventory);
    const framework = inventory.support.framework;
    assert.equal(framework.status, expected.status);
    assert.deepEqual(framework.reasons, expected.reasons);
    if (expected.id) assert.equal(framework.id, expected.id);
    else assert.equal(framework.id, null);
    const report = recommend(dir);
    assert.equal(report.projectSupport.nonDetectionReliable, false);
    assert.equal(report.summary.notCurrentlyIndicated, 0, 'no bounded non-detection for unsupported or unknown projects');
  }));
}

for (const [name, files, expected] of [
  ['npm lockfile', { 'package-lock.json': NPM_LOCK }, { status: 'supported', id: 'npm', reasons: [] }],
  ['npm shrinkwrap', { 'npm-shrinkwrap.json': NPM_LOCK }, { status: 'supported', id: 'npm', reasons: [] }],
  ['npm packageManager field with npm lockfile', { 'package-lock.json': NPM_LOCK, field: 'npm@10.9.0' }, { status: 'supported', id: 'npm', reasons: [] }],
  ['pnpm', { 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n" }, { status: 'unsupported', id: 'pnpm', reasons: ['unsupported_package_manager'] }],
  ['yarn', { 'yarn.lock': '# yarn lockfile v1\n' }, { status: 'unsupported', id: 'yarn', reasons: ['unsupported_package_manager'] }],
  ['bun', { 'bun.lock': '{}' }, { status: 'unsupported', id: 'bun', reasons: ['unsupported_package_manager'] }],
  ['no lockfile', {}, { status: 'unknown', id: null, reasons: ['no_lockfile'] }],
  ['conflicting lockfiles', { 'package-lock.json': NPM_LOCK, 'yarn.lock': '# yarn\n' }, { status: 'unknown', id: null, reasons: ['conflicting_package_managers'] }],
  ['packageManager field disagrees with lockfile', { 'package-lock.json': NPM_LOCK, field: 'pnpm@9.1.0' }, { status: 'unknown', id: null, reasons: ['conflicting_package_managers'] }],
  ['symlinked lockfile is not trusted', { 'real.json': NPM_LOCK, 'package-lock.json': [SYMLINK, 'real.json'] }, { status: 'unknown', id: null, reasons: ['no_lockfile'] }],
]) {
  test(`package manager support: ${name}`, () => {
    const { field, ...files2 } = files;
    project({ ...files2, 'package.json': manifest({ next: '16.0.0' }, field ? { packageManager: field } : {}),
      'app/page.tsx': 'export default () => null' }, dir => {
      const inventory = inventoryProject(dir);
      validateInventoryReport(inventory);
      const manager = inventory.support.packageManager;
      assert.equal(manager.status, expected.status);
      assert.equal(manager.id, expected.id);
      assert.deepEqual(manager.reasons, expected.reasons);
      const report = recommend(dir);
      const dependency = byId(report).dependency_scan;
      if (expected.status === 'supported') {
        assert.deepEqual(dependency.supportNotes, []);
      } else {
        assert.equal(dependency.supportNotes.length, 1);
        assert.match(dependency.supportNotes[0], /covers npm lockfiles only/);
        const confirmation = report.humanConfirmation.find(item => item.checkId === 'dependency_scan');
        assert.match(confirmation.reason, /does not cover this project type/);
        assert.ok(formatRecommendationSummary(report).includes('Limited support'));
      }
      // Package-manager limits affect dependency automation, not source non-detection for a supported framework.
      assert.equal(report.projectSupport.nonDetectionReliable, true);
    });
  });
}

test('incomplete scans of a supported framework keep every unmatched conditional check under review', () => {
  const many = Object.fromEntries(Array.from({ length: 405 }, (_, index) => [`src/generated/file${index}.ts`, 'export {}']));
  const deep = { [`src/${Array.from({ length: 10 }, (_, index) => `d${index}`).join('/')}/deep.ts`]: 'export {}' };
  const large = { 'src/large.ts': `export const blob = "${'x'.repeat(70 * 1024)}"` };
  for (const [extra, reason] of [[many, 'file_limit'], [deep, 'depth_limit'], [large, 'large_source_file']]) {
    project({ ...reactVite, ...extra }, dir => {
      const inventory = inventoryProject(dir);
      assert.equal(inventory.support.framework.status, 'supported');
      assert.ok(inventory.scope.incomplete.includes(reason), reason);
      const report = recommend(dir);
      assert.equal(report.scan.complete, false);
      assert.equal(report.projectSupport.nonDetectionReliable, false);
      assert.equal(report.summary.notCurrentlyIndicated, 0, reason);
      assert.equal(byId(report).payment_flow_pci_scope_review.disposition, 'needs_human_review');
    });
  }
});

test('invalid project roots are rejected by the library and every CLI without partial output', () => project({
  'not-a-directory.txt': 'x', 'real/app/page.tsx': 'export default () => null', 'link': [SYMLINK, 'real'],
}, dir => {
  for (const bad of [join(dir, 'missing'), join(dir, 'not-a-directory.txt'), join(dir, 'link'), '']) {
    assert.throws(() => inventoryProject(bad), /Project root must be a directory/);
  }
  for (const [script, args] of [
    ['inventory-project.mjs', ['--root', join(dir, 'missing')]],
    ['recommend-security-checks.mjs', ['--root', join(dir, 'missing')]],
    ['recommend-security-checks.mjs', ['--root', join(dir, 'link')]],
    ['validate-check-catalog.mjs', ['--root', join(dir, 'not-a-directory.txt')]],
  ]) {
    const result = cli(script, args);
    assert.equal(result.status, 1, `${script} ${args.join(' ')}`);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes(dir), 'stderr must not echo local paths');
  }
}));

test('invalid catalog, reference-root and evidence paths fail closed', () => project({
  'project/app/page.tsx': 'export default () => null',
  'project/package.json': manifest({ next: '16.0.0' }),
  'bad.json': '{ "schemaVersion": ',
  'big.json': `{"pad":"${'x'.repeat(300 * 1024)}"}`,
  'catalog-dir/placeholder.txt': 'x',
  'catalog-link.json': [SYMLINK, 'bad.json'],
}, dir => {
  const projectRoot = join(dir, 'project');
  for (const [args, message] of [
    [['--catalog', join(dir, 'missing.json')], /Catalog must be an existing regular file/],
    [['--catalog', join(dir, 'catalog-dir')], /Catalog must be an existing regular file/],
    [['--catalog', join(dir, 'catalog-link.json')], /Catalog must be an existing regular file/],
    [['--catalog', join(dir, 'bad.json')], /Catalog is not valid JSON/],
    [['--catalog', join(dir, 'big.json')], /Catalog exceeds its size limit/],
    [['--reference-root', join(dir, 'missing')], /Reference root must be an existing directory/],
    [['--reference-root', dir], /provenance/],
    [['--project-evidence', join(dir, 'missing.json')], /Project-local evidence must be an existing regular file/],
    [['--project-evidence', join(dir, 'bad.json')], /Project-local evidence is not valid JSON/],
    [['--project-evidence', join(dir, 'x.json'), '--no-project-evidence'], /Choose either/],
    [['--unknown', 'x'], /Unknown option/],
    [['--root'], /Missing value/],
    [['--root', projectRoot, '--root', projectRoot], /Repeated option --root/],
    [['positional'], /Unexpected positional argument/],
    [['--catalog', '/private/secret/path.json', '--bogus'], /Unknown option/],
  ]) {
    for (const script of ['recommend-security-checks.mjs', 'validate-check-catalog.mjs']) {
      // Cases that exercise --root itself pass their own arguments; all others target the synthetic project.
      const result = cli(script, args[0] === '--root' ? args : ['--root', projectRoot, ...args]);
      assert.equal(result.status, 1, `${script} ${args.join(' ')}`);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, message, `${script} ${args.join(' ')}`);
      assert.ok(!result.stderr.includes(dir), 'stderr must not echo local paths');
    }
  }
}));

test('option parser rejects ambiguous input', () => {
  assert.deepEqual(parseOptions(['--root', 'a', '--no-project-evidence'], { values: ['root'], flags: ['no-project-evidence'] }),
    { root: 'a', 'no-project-evidence': true });
  assert.throws(() => parseOptions(['--root', '--catalog'], { values: ['root', 'catalog'] }), /Missing value/);
  assert.throws(() => parseOptions(['--no-project-evidence', '--no-project-evidence'], { flags: ['no-project-evidence'] }), /Repeated/);
  assert.throws(() => parseOptions(['/Users/someone/private-dir'], { values: ['root'] }), error => !error.message.includes('private-dir'));
  assert.throws(() => parseOptions(['--/Users/someone/private-dir'], { values: ['root'] }), error => !error.message.includes('private-dir'));
  assert.equal(parseRootArgument([]), process.cwd());
  assert.equal(parseRootArgument(['some/dir']), 'some/dir');
  assert.equal(parseRootArgument(['--root', 'some/dir']), 'some/dir');
  assert.throws(() => parseRootArgument(['--root']), /usage/);
  assert.throws(() => parseRootArgument(['a', 'b']), /usage/);
});

test('reusable provenance resolves in the framework, project-local evidence in the scanned project', () => project({
  ...astro,
  'docs/security/PROJECT-LOCAL-EVIDENCE.json': JSON.stringify({
    schemaVersion: 1, kind: 'project-local-security-evidence', catalogId: catalog.catalogId,
    checks: { api_input_validation_review: ['src/pages/api/subscribe.ts', 'src/pages/api/missing.ts', 'src/pages'],
      secret_scan: ['.github/workflows/ci.yml'] },
  }),
  'src/pages/api/notes.txt': 'DO_NOT_READ_PROJECT_EVIDENCE',
}, dir => {
  // The catalog's reusable references exist only in the framework, not in this project.
  for (const check of catalog.checks) for (const path of check.provenance) {
    assert.ok(!path.startsWith('app/') && !path.includes('sanity.config'), `${check.id} provenance must be reusable: ${path}`);
  }
  assert.deepEqual(validateCheckCatalog(catalog, inventoryProject(dir), root), { checkCount: 15, signalCount: 9 });
  assert.throws(() => validateCheckCatalog(catalog, inventoryProject(dir), dir), /provenance/);
  const result = cli('recommend-security-checks.mjs', ['--root', dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(dir), 'report must not contain local absolute paths');
  assert.ok(!result.stdout.includes('DO_NOT_READ_PROJECT_EVIDENCE'));
  const report = JSON.parse(result.stdout);
  assert.equal(report.inputs.projectEvidenceSource, 'docs/security/PROJECT-LOCAL-EVIDENCE.json');
  assert.deepEqual(byId(report).api_input_validation_review.projectEvidence, [
    { path: 'src/pages/api/subscribe.ts', status: 'present' },
    { path: 'src/pages/api/missing.ts', status: 'missing' },
    { path: 'src/pages', status: 'not_regular_file' },
  ]);
  assert.deepEqual(byId(report).secret_scan.projectEvidence, [{ path: '.github/workflows/ci.yml', status: 'missing' }]);
  assert.deepEqual(byId(report).payment_flow_pci_scope_review.projectEvidence, []);
  const skipped = JSON.parse(cli('recommend-security-checks.mjs', ['--root', dir, '--no-project-evidence']).stdout);
  assert.equal(skipped.inputs.projectEvidenceSource, 'none');
  assert.deepEqual(byId(skipped).api_input_validation_review.projectEvidence, []);
}));

test('project-local evidence files are validated strictly', () => {
  assert.deepEqual(validateProjectEvidence(laSegunditaEvidence, catalog), { checkCount: 12 });
  const base = () => structuredClone(laSegunditaEvidence);
  const unknown = base(); unknown.checks.invented_check = ['README.md'];
  assert.throws(() => validateProjectEvidence(unknown, catalog), /unknown check/);
  for (const path of ['../outside.md', '/etc/passwd', '.env.local', 'config/.env', 'a/./b', 'a\\b', '']) {
    const bad = base(); bad.checks.secret_scan = [path];
    assert.throws(() => validateProjectEvidence(bad, catalog), /invalid project-local evidence paths/, path);
  }
  const other = base(); other.catalogId = 'another-catalog';
  assert.throws(() => validateProjectEvidence(other, catalog), /different catalog/);
  const kind = base(); kind.kind = 'risk-acceptance';
  assert.throws(() => validateProjectEvidence(kind, catalog), /schema/);
  const tooMany = base(); tooMany.checks.secret_scan = Array.from({ length: 11 }, (_, index) => `docs/f${index}.md`);
  assert.throws(() => validateProjectEvidence(tooMany, catalog), /invalid project-local evidence paths/);
  assert.throws(() => recommendSecurityChecks(inventoryProject(root), catalog, root, { projectEvidence: unknown }), /unknown check/);
});

test('backward compatibility: La Segundita defaults, legacy catalogs, and inventories without support', () => {
  const result = cli('recommend-security-checks.mjs', []);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.summary, { recommended: 11, needsHumanReview: 0, notCurrentlyIndicated: 4, total: 15 });
  assert.equal(report.projectSupport.framework.id, 'nextjs');
  assert.equal(report.projectSupport.packageManager.id, 'npm');
  assert.equal(report.inputs.catalogSource, 'docs/security/SECURITY-CHECK-CATALOG.json');
  assert.equal(report.inputs.projectEvidenceSource, 'docs/security/PROJECT-LOCAL-EVIDENCE.json');
  assert.ok(byId(report).dependency_scan.projectEvidence.every(item => item.status === 'present'));
  assert.ok(byId(report).webhook_authentication_review.projectEvidence.some(item => item.path === 'app/api/revalidate/route.ts'));
  assert.equal(cli('validate-check-catalog.mjs', []).status, 0);
  assert.equal(JSON.parse(cli('inventory-project.mjs', []).stdout).support.framework.id, 'nextjs');

  // A pre-4A catalog whose provenance names files in the repository root still validates there.
  const legacy = structuredClone(catalog);
  legacy.checks.find(check => check.id === 'cms_access_review').provenance = ['sanity.config.ts', 'docs/security/PROJECT-SECURITY-PROFILE.md'];
  delete legacy.checks.find(check => check.id === 'dependency_scan').requiresSupportedPackageManager;
  const inventory = inventoryProject(root);
  assert.deepEqual(validateCheckCatalog(legacy, inventory, root), { checkCount: 15, signalCount: 9 });

  // An inventory produced before 4A (no support block) is accepted and treated as unknown, never as supported.
  const old = structuredClone(inventory);
  delete old.support;
  const oldReport = recommendSecurityChecks(old, catalog, root);
  assert.equal(oldReport.projectSupport.framework.status, 'unknown');
  assert.deepEqual(oldReport.projectSupport.framework.reasons, ['support_not_assessed']);
  assert.equal(oldReport.summary.notCurrentlyIndicated, 0);
  assert.equal(oldReport.inputs.projectEvidenceSource, 'none');
  assert.ok(formatRecommendationSummary(oldReport).includes('Limited support'));
  const legacyReport = structuredClone(oldReport);
  delete legacyReport.projectSupport;
  for (const check of legacyReport.recommendations) { delete check.supportNotes; delete check.projectEvidence; delete check.projectEvidenceOmitted; }
  assert.ok(formatRecommendationSummary(legacyReport).includes('not assessed (older report)'));
  assert.equal(serializeRecommendationReport(oldReport), serializeRecommendationReport(recommendSecurityChecks(old, catalog, root)));
});

test('support block tampering is rejected', () => {
  const inventory = inventoryProject(root);
  const tampered = [
    value => { value.support.framework.status = 'secure'; },
    value => { value.support.framework.reasons = ['multiple_frameworks']; },
    value => { value.support.framework.id = 'sveltekit'; },
    value => { value.support.packageManager.status = 'partial'; value.support.packageManager.reasons = ['x']; },
    value => { value.support.framework.evidence = ['.env.local']; },
    value => { value.support.packageManager.id = null; },
  ];
  for (const change of tampered) {
    const copy = structuredClone(inventory);
    change(copy);
    assert.throws(() => validateInventoryReport(copy), /support/);
  }
});
