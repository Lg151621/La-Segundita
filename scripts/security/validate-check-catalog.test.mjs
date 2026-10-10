import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inventoryProject } from './inventory-project.mjs';
import { validateCheckCatalog } from './validate-check-catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(readFileSync(join(root, 'docs/security/SECURITY-CHECK-CATALOG.json'), 'utf8'));
const inventory = inventoryProject(root);
const copy = () => structuredClone(catalog);

test('real catalog validates against the current inventory schema and candidate IDs', () => {
  assert.deepEqual(validateCheckCatalog(catalog, inventory, root), { checkCount: 15, signalCount: 9 });
  assert.equal(catalog.checks.filter(check => check.executionStatus === 'automated_now').length, 2);
});

test('catalog covers conditional candidates even when absent from this project', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'catalog-inventory-'));
  try {
    const files = {
      'package.json': JSON.stringify({ dependencies: {
        next: '16.0.0', sanity: '6.0.0', 'next-auth': '5.0.0', stripe: '1.0.0',
        '@vercel/analytics': '2.0.0', pg: '8.0.0',
      } }),
      'sanity.config.ts': "import { defineConfig } from 'sanity'; export default defineConfig({})",
      'app/page.tsx': "import { signIn } from 'next-auth/react'; import { Analytics } from '@vercel/analytics/next'; import Stripe from 'stripe'; export default function Page() { return <form><Analytics /></form> }",
      'app/api/webhook/route.ts': "import { parseBody } from 'next-sanity/webhook'; export async function POST(req) { return parseBody(req) }",
      'lib/db.ts': "import pg from 'pg'; export const pool = new pg.Pool()",
    };
    for (const [path, content] of Object.entries(files)) {
      const target = join(fixtureRoot, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    const fullInventory = inventoryProject(fixtureRoot);
    assert.equal(fullInventory.candidateChecks.length, 13);
    assert.deepEqual(validateCheckCatalog(catalog, fullInventory, root), { checkCount: 15, signalCount: 9 });
  } finally { rmSync(fixtureRoot, { recursive: true, force: true }); }
});

test('rejects duplicate IDs and missing required fields', () => {
  const duplicate = copy(); duplicate.checks[1].id = duplicate.checks[0].id;
  assert.throws(() => validateCheckCatalog(duplicate, inventory, root), /duplicate/);
  const missing = copy(); delete missing.checks[0].evidenceRequired;
  assert.throws(() => validateCheckCatalog(missing, inventory, root), /evidence/);
});

test('rejects unknown signals, execution statuses, and inventory schema changes', () => {
  const signal = copy(); signal.checks.find(check => check.id === 'cms_access_review').match.signals = ['invented_signal'];
  assert.throws(() => validateCheckCatalog(signal, inventory, root), /unknown inventory signal/);
  const status = copy(); status.checks[0].executionStatus = 'passed';
  assert.throws(() => validateCheckCatalog(status, inventory, root), /unknown execution status/);
  const version = copy(); version.inventorySchemaVersion = 2;
  assert.throws(() => validateCheckCatalog(version, inventory, root), /schema/);
});

test('uncertain signals cannot be silently omitted or treated as absence', () => {
  const bad = copy(); bad.checks.find(check => check.id === 'cms_access_review').match.statuses = ['detected'];
  assert.throws(() => validateCheckCatalog(bad, inventory, root), /uncertain/);
});

test('provenance must be an existing repository file', () => {
  const bad = copy(); bad.checks[0].provenance = ['../outside'];
  assert.throws(() => validateCheckCatalog(bad, inventory, root), /provenance/);
});
