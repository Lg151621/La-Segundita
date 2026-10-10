import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILES = 400;
const MAX_BYTES = 64 * 1024;
const MAX_DEPTH = 8;
const MAX_ENTRIES = 2000;
const SOURCE_DIRS = ['app', 'src/app', 'pages', 'src/pages', 'components', 'src/components', 'lib', 'src/lib', 'sanity', 'src/sanity'];
const ROOT_FILES = ['index.html', 'public/index.html', 'next.config.js', 'next.config.mjs', 'next.config.ts', 'sanity.config.js', 'sanity.config.ts'];
const SOURCE_EXTENSIONS = /\.(?:js|jsx|mjs|cjs|ts|tsx|html)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '__tests__', '__fixtures__']);
const SKIP_FILES = /(?:\.test|\.spec|\.stories)\.[cm]?[jt]sx?$/;

function sorted(paths) { return [...new Set(paths)].sort(); }
function pathOf(root, absolute) { return relative(root, absolute).split(sep).join('/'); }

// Only selected source/config files are read. Dotfiles (including every .env variant), docs,
// lockfiles, generated output and symlink targets are outside this inventory's scope.
function inspectSource(root) {
  const files = [];
  const incomplete = new Set();
  let seen = 0;
  let entriesSeen = 0;
  function addFile(absolute) {
    if (seen >= MAX_FILES) { incomplete.add('file_limit'); return; }
    seen++;
    try {
      const stat = lstatSync(absolute, { throwIfNoEntry: false });
      if (!stat?.isFile()) return;
      if (stat.size > MAX_BYTES) { incomplete.add('large_source_file'); return; }
      files.push({ path: pathOf(root, absolute), text: readFileSync(absolute, 'utf8') });
    } catch { incomplete.add('unreadable_source_file'); }
  }
  function walk(absolute, depth) {
    if (depth > MAX_DEPTH) { incomplete.add('depth_limit'); return; }
    if (entriesSeen >= MAX_ENTRIES) { incomplete.add('entry_limit'); return; }
    let entries;
    try { entries = readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')); }
    catch { incomplete.add('unreadable_source_directory'); return; }
    for (const entry of entries) {
      if (++entriesSeen > MAX_ENTRIES) { incomplete.add('entry_limit'); break; }
      if (seen >= MAX_FILES) { incomplete.add('file_limit'); break; }
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const child = join(absolute, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(child, depth + 1);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.test(entry.name) && !SKIP_FILES.test(entry.name)) addFile(child);
    }
  }
  for (const name of ROOT_FILES) {
    const absolute = join(root, name);
    if (existsSync(absolute)) addFile(absolute);
  }
  for (const name of SOURCE_DIRS) {
    const absolute = join(root, name);
    if (existsSync(absolute) && lstatSync(absolute).isDirectory()) walk(absolute, 0);
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { files, incomplete: sorted([...incomplete]) };
}

function inspectManifest(root) {
  const file = join(root, 'package.json');
  if (!existsSync(file)) return { state: 'missing', names: new Set() };
  try {
    const stat = lstatSync(file);
    if (!stat.isFile()) return { state: 'invalid', names: new Set() };
    if (stat.size > MAX_BYTES) return { state: 'too_large', names: new Set() };
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (!pkg || typeof pkg !== 'object') throw new Error('invalid manifest');
    return { state: 'valid', names: new Set([
      ...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}),
    ]) };
  } catch { return { state: 'invalid', names: new Set() }; }
}

function evidence(files, pattern, include = () => true) {
  return files.filter(file => include(file.path) && pattern.test(file.text)).map(file => file.path);
}

const publicSource = path => !path.includes('/(studio)/') && !path.startsWith('sanity/') && !path.startsWith('src/sanity/');
const routePath = path => /^(?:src\/)?app\/(?:.+\/)?route\.[cm]?[jt]s$/.test(path) ||
  /^(?:src\/)?pages\/api\/.+\.[cm]?[jt]s$/.test(path);
const hasPackage = (names, pattern) => [...names].some(name => pattern.test(name));

export function inventoryProject(projectRoot) {
  const root = resolve(projectRoot);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) throw new Error('Project root must be a directory');
  const manifest = inspectManifest(root);
  const { files, incomplete } = inspectSource(root);
  if (manifest.state === 'invalid' || manifest.state === 'too_large') incomplete.push('unusable_package_manifest');
  const complete = files.length > 0 && incomplete.length === 0;
  const paths = files.map(file => file.path);
  const pkg = (pattern) => manifest.state === 'valid' && hasPackage(manifest.names, pattern) ? ['package.json'] : [];
  const source = (pattern, include) => evidence(files, pattern, include);
  const routeFiles = paths.filter(routePath);

  function signal(id, strong, partial = [], confidence = 'high') {
    const confirmed = sorted(strong);
    const uncertain = sorted(partial);
    if (confirmed.length) return { id, status: 'detected', confidence, evidence: confirmed };
    if (uncertain.length) return { id, status: 'needs human verification', confidence: 'low', evidence: uncertain };
    return { id, status: complete ? 'not detected in inspected scope' : 'needs human verification', confidence: complete ? 'medium' : 'low', evidence: [] };
  }
  function packageAndUse(id, packagePaths, usePaths, extraPartial = []) {
    return signal(id, packagePaths.length && usePaths.length ? [...packagePaths, ...usePaths] : [],
      [...packagePaths, ...usePaths, ...extraPartial]);
  }

  const nextPackage = pkg(/^next$/);
  const nextSource = paths.filter(path => /^next\.config\./.test(path) ||
    /^(?:src\/)?app\/(?:.+\/)?(?:page|layout)\.[jt]sx?$/.test(path) ||
    /^(?:src\/)?pages\/(?!api\/).+\.[jt]sx?$/.test(path));
  const sanityPackage = pkg(/^(?:sanity|next-sanity)$/);
  const sanitySource = paths.filter(path => /^sanity\.config\./.test(path) || path.includes('/(studio)/studio/'));
  const signedWebhookSource = source(/(?:next-sanity\/webhook|verifySignature|isValidSignature|x-sanity-signature)/, routePath);
  const webhookSource = routeFiles.filter(path => /webhook|revalidate/i.test(path)).concat(signedWebhookSource);
  const authPackage = pkg(/^(?:next-auth|@auth\/.+|@clerk\/nextjs|@supabase\/(?:auth-helpers.*|supabase-js)|firebase)$/);
  const authSource = source(/(?:from\s*['"](?:next-auth|@auth\/|@clerk\/|firebase\/auth)|\b(?:signIn|useSession|getServerSession|ClerkProvider|SignedIn)\s*\()/, publicSource);
  const formSource = source(/<form(?:\s|>)/i, publicSource);
  const formPackage = pkg(/^(?:react-hook-form|formik)$/);
  const paymentPackage = pkg(/^(?:stripe|@stripe\/.+|@paypal\/.+|braintree|@adyen\/.+|square)$/);
  const paymentSource = source(/(?:from\s*['"](?:stripe|@stripe\/|@paypal\/|braintree|@adyen\/)|\bStripeProvider\b|\bPayPalScriptProvider\b)/, publicSource);
  const analyticsPackage = pkg(/^(?:@vercel\/analytics|@next\/third-parties|react-ga4|@segment\/analytics-next)$/);
  const analyticsSource = source(/(?:from\s*['"](?:@vercel\/analytics|@next\/third-parties|react-ga4|@segment\/analytics-next)|<Analytics\b|\bgtag\s*\()/, publicSource);
  const databasePackage = pkg(/^(?:@prisma\/client|prisma|drizzle-orm|mongoose|pg|mysql2|better-sqlite3|mongodb|@supabase\/supabase-js|@vercel\/postgres|@neondatabase\/serverless)$/);
  const databaseSource = source(/(?:from\s*['"](?:@prisma\/client|drizzle-orm|mongoose|pg|mysql2|better-sqlite3|mongodb|@supabase\/supabase-js|@vercel\/postgres|@neondatabase\/serverless)|\bnew\s+PrismaClient\s*\()/);

  const signals = [
    packageAndUse('nextjs', nextPackage, nextSource),
    packageAndUse('sanity_cms', sanityPackage, sanitySource),
    signal('api_routes', routeFiles),
    signal('webhooks', signedWebhookSource.length ? webhookSource : [], webhookSource),
    packageAndUse('browser_auth', authPackage, authSource),
    signal('public_forms', formSource, formPackage, 'medium'),
    packageAndUse('payments', paymentPackage, paymentSource),
    packageAndUse('analytics', analyticsPackage, analyticsSource),
    packageAndUse('database', databasePackage, databaseSource),
  ];
  const checks = [
    ['dependency_scan', []], ['secret_scan', []], ['secure_config_headers', []],
    ['build_verification', []], ['repo_host_access_review', []],
    ['cms_access_review', ['sanity_cms']], ['webhook_authentication_review', ['webhooks']],
    ['api_input_validation_review', ['api_routes']], ['auth_session_authorization_review', ['browser_auth']],
    ['form_validation_abuse_privacy_review', ['public_forms']], ['payment_flow_pci_scope_review', ['payments']],
    ['analytics_privacy_review', ['analytics']], ['database_access_retention_review', ['database']],
  ];
  const byId = new Map(signals.map(item => [item.id, item]));
  const candidateChecks = checks.filter(([, triggers]) => !triggers.length || triggers.some(id => byId.get(id).status !== 'not detected in inspected scope'))
    .map(([id, triggers]) => ({ id, basis: triggers.length ? 'conditional' : 'always', triggeredBy: triggers,
      requiresHumanReview: true }));

  return {
    schemaVersion: 1,
    tool: 'project-security-inventory',
    scope: { root: '.', sourceDirectories: SOURCE_DIRS, rootFiles: ROOT_FILES, maxFiles: MAX_FILES,
      maxEntries: MAX_ENTRIES,
      maxFileBytes: MAX_BYTES, maxDepth: MAX_DEPTH, sourceFilesInspected: files.length,
      packageManifest: manifest.state, incomplete: sorted(incomplete) },
    signals,
    candidateChecks,
    boundaries: { complianceApplicability: 'not determined', riskLevel: 'not assigned',
      note: 'Candidate checks and source signals require human review before decisions or enforcement.' },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) {
    process.stderr.write('Usage: node scripts/security/inventory-project.mjs [PROJECT_ROOT]\n');
    process.exitCode = 1;
  } else {
    try { process.stdout.write(`${JSON.stringify(inventoryProject(process.argv[2] ?? process.cwd()), null, 2)}\n`); }
    catch { process.stderr.write('Project inventory could not read the selected directory.\n'); process.exitCode = 1; }
  }
}
