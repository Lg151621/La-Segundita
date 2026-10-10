import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { inventoryProject } from './inventory-project.mjs';

function fixture(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'project-security-inventory-'));
  try {
    for (const [name, value] of Object.entries(files)) {
      const target = join(root, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, value);
    }
    return run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const manifest = dependencies => JSON.stringify({ dependencies });
const byId = report => Object.fromEntries(report.signals.map(signal => [signal.id, signal]));
const checkIds = report => report.candidateChecks.map(check => check.id);

test('marketing site selects CMS, webhook and analytics checks without inventing visitor login', () => fixture({
  'package.json': manifest({ next: '16.0.0', sanity: '6.0.0', 'next-sanity': '13.0.0', '@vercel/analytics': '2.0.0' }),
  'next.config.ts': 'export default {}',
  'sanity.config.ts': "import { defineConfig } from 'sanity'; export default defineConfig({})",
  'app/(en)/page.tsx': 'export default function Page() { return <main>Welcome</main> }',
  'app/(en)/layout.tsx': "import { Analytics } from '@vercel/analytics/next'; export default function Layout() { return <Analytics /> }",
  'app/(studio)/studio/[[...tool]]/page.tsx': "import { NextStudio } from 'next-sanity/studio'; export default function Studio() { return <NextStudio /> }",
  'app/api/revalidate/route.ts': "import { parseBody } from 'next-sanity/webhook'; export async function POST(req) { return parseBody(req) }",
}, root => {
  const report = inventoryProject(root), signals = byId(report);
  for (const id of ['nextjs', 'sanity_cms', 'api_routes', 'webhooks', 'analytics'])
    assert.equal(signals[id].status, 'detected', id);
  for (const id of ['browser_auth', 'public_forms', 'payments', 'database'])
    assert.equal(signals[id].status, 'not detected in inspected scope', id);
  assert.deepEqual(signals.webhooks.evidence, ['app/api/revalidate/route.ts']);
  assert.ok(checkIds(report).includes('cms_access_review'));
  assert.ok(checkIds(report).includes('webhook_authentication_review'));
  assert.ok(checkIds(report).includes('analytics_privacy_review'));
  assert.ok(!checkIds(report).includes('auth_session_authorization_review'));
}));

test('browser login and a public form select conditional reviews', () => fixture({
  'package.json': manifest({ next: '16.0.0', 'next-auth': '5.0.0' }),
  'app/login/page.tsx': "import { signIn } from 'next-auth/react'; export default function Login() { return <form><input /></form> }",
}, root => {
  const report = inventoryProject(root), signals = byId(report);
  assert.equal(signals.browser_auth.status, 'detected');
  assert.equal(signals.public_forms.status, 'detected');
  assert.ok(checkIds(report).includes('auth_session_authorization_review'));
  assert.ok(checkIds(report).includes('form_validation_abuse_privacy_review'));
}));

test('minimal static site reports bounded non-detection, not global absence', () => fixture({
  'index.html': '<html><body><h1>Hello</h1></body></html>',
}, root => {
  const report = inventoryProject(root);
  assert.equal(report.scope.packageManifest, 'missing');
  assert.ok(report.signals.every(signal => signal.status === 'not detected in inspected scope'));
  assert.deepEqual(checkIds(report), [
    'dependency_scan', 'secret_scan', 'secure_config_headers', 'build_verification', 'repo_host_access_review',
  ]);
}));

test('package-only technology remains uncertain', () => fixture({
  'package.json': manifest({ '@stripe/stripe-js': '1.0.0' }),
}, root => {
  const report = inventoryProject(root), signals = byId(report);
  assert.equal(signals.payments.status, 'needs human verification');
  assert.deepEqual(signals.payments.evidence, ['package.json']);
  assert.equal(signals.browser_auth.status, 'needs human verification');
  assert.ok(checkIds(report).includes('payment_flow_pci_scope_review'));
}));

test('missing manifest and source remain uncertain', () => fixture({}, root => {
  const report = inventoryProject(root);
  assert.equal(report.scope.sourceFilesInspected, 0);
  assert.ok(report.signals.every(signal => signal.status === 'needs human verification'));
}));

test('a webhook-named route without signature evidence remains uncertain', () => fixture({
  'package.json': manifest({ next: '16.0.0' }),
  'app/webhook/route.ts': 'export async function POST() { return Response.json({ ok: true }) }',
}, root => {
  const signals = byId(inventoryProject(root));
  assert.equal(signals.api_routes.status, 'detected');
  assert.equal(signals.webhooks.status, 'needs human verification');
}));

test('output is deterministic and never includes environment or source values', () => fixture({
  'package.json': manifest({ next: '16.0.0' }),
  'app/page.tsx': 'const privateValue = "DO_NOT_PRINT_THIS_VALUE"; export default function Page() { return <main /> }',
  '.env.local': 'SECRET=DO_NOT_PRINT_THIS_ENV_VALUE',
  'node_modules/stripe/index.js': 'DO_NOT_SCAN_DEPENDENCIES',
}, root => {
  const first = JSON.stringify(inventoryProject(root));
  const second = JSON.stringify(inventoryProject(root));
  assert.equal(first, second);
  assert.equal(JSON.parse(first).schemaVersion, 1);
  assert.equal(byId(JSON.parse(first)).nextjs.status, 'detected');
  for (const value of ['DO_NOT_PRINT_THIS_VALUE', 'DO_NOT_PRINT_THIS_ENV_VALUE', 'DO_NOT_SCAN_DEPENDENCIES'])
    assert.ok(!first.includes(value));
}));
