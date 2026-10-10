import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILES = 400;
const MAX_BYTES = 64 * 1024;
const MAX_DEPTH = 8;
const MAX_ENTRIES = 2000;
// `src` and `api` cover React/Vite, Astro and Vercel-style functions; a listed directory inside another is skipped.
const SOURCE_DIRS = ['app', 'pages', 'components', 'lib', 'sanity', 'src', 'api'];
const CONFIG_EXTENSIONS = ['js', 'mjs', 'cjs', 'ts', 'mts'];
const FRAMEWORK_CONFIGS = {
  nextjs: CONFIG_EXTENSIONS.map(ext => `next.config.${ext}`),
  astro: CONFIG_EXTENSIONS.map(ext => `astro.config.${ext}`),
  react_vite: CONFIG_EXTENSIONS.map(ext => `vite.config.${ext}`),
};
const ROOT_FILES = ['index.html', 'public/index.html', ...FRAMEWORK_CONFIGS.nextjs, ...FRAMEWORK_CONFIGS.astro,
  ...FRAMEWORK_CONFIGS.react_vite, 'sanity.config.js', 'sanity.config.ts'];
const SOURCE_EXTENSIONS = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts|html|astro)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '__tests__', '__fixtures__']);
const SKIP_FILES = /(?:\.test|\.spec|\.stories)\.[cm]?[jt]sx?$/;

// Phase 4A support targets. Anything else is reported as unsupported or unknown, never as secure.
export const SUPPORTED_FRAMEWORKS = ['nextjs', 'react_vite', 'astro'];
export const SUPPORTED_PACKAGE_MANAGERS = ['npm'];
export const SUPPORT_STATUSES = ['supported', 'partial', 'unsupported', 'unknown'];
// Application frameworks that own routing/rendering, recognised by package name.
const HOST_FRAMEWORKS = [
  ['nextjs', /^next$/], ['astro', /^astro$/], ['sveltekit', /^@sveltejs\/kit$/], ['nuxt', /^nuxt$/],
  ['remix', /^@remix-run\/(?:react|node|dev|serve|cloudflare|deno)$/], ['react_router_framework', /^@react-router\/dev$/],
  ['gatsby', /^gatsby$/], ['angular', /^@angular\/core$/], ['solidstart', /^@solidjs\/start$/],
  ['qwik', /^@builder\.io\/qwik(?:-city)?$/], ['create_react_app', /^react-scripts$/],
  ['expo_react_native', /^(?:expo|react-native)$/], ['ember', /^ember-source$/],
];
// Component languages whose files (.vue, .svelte) this scanner does not read.
const COMPONENT_FRAMEWORKS = [['vue', /^vue$/], ['svelte', /^svelte$/]];
// JSX-based libraries the scanner can read, but which have no supported host or build tool on their own.
const OTHER_UI_LIBRARIES = [['solid', /^solid-js$/], ['preact', /^preact$/], ['lit', /^lit$/]];
const SERVER_FRAMEWORKS = [['express', /^express$/], ['fastify', /^fastify$/], ['koa', /^koa$/], ['hono', /^hono$/],
  ['nestjs', /^@nestjs\/core$/], ['hapi', /^@hapi\/hapi$/]];
const LOCKFILES = [['npm', 'package-lock.json'], ['npm', 'npm-shrinkwrap.json'], ['pnpm', 'pnpm-lock.yaml'],
  ['yarn', 'yarn.lock'], ['bun', 'bun.lockb'], ['bun', 'bun.lock'], ['deno', 'deno.lock']];
const PACKAGE_MANAGERS = new Set(LOCKFILES.map(([id]) => id));

function sorted(paths) { return [...new Set(paths)].sort(); }
function pathOf(root, absolute) { return relative(root, absolute).split(sep).join('/'); }
function isFile(absolute) {
  try { return lstatSync(absolute, { throwIfNoEntry: false })?.isFile() === true; } catch { return false; }
}

// Only selected source/config files are read. Dotfiles (including every .env variant), docs,
// lockfiles, generated output and symlink targets are outside this inventory's scope.
// Lockfile and config names are checked for existence only; lockfile contents are never read.
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
    if (SOURCE_DIRS.some(other => other !== name && name.startsWith(`${other}/`))) continue;
    const absolute = join(root, name);
    try {
      if (lstatSync(absolute, { throwIfNoEntry: false })?.isDirectory()) walk(absolute, 0);
    } catch { incomplete.add('unreadable_source_directory'); }
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { files, incomplete: sorted([...incomplete]) };
}

function inspectManifest(root) {
  const file = join(root, 'package.json');
  const empty = state => ({ state, names: new Set(), workspaces: false, packageManagerField: null });
  if (!existsSync(file)) return empty('missing');
  try {
    const stat = lstatSync(file);
    if (!stat.isFile()) return empty('invalid');
    if (stat.size > MAX_BYTES) return empty('too_large');
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('invalid manifest');
    // Only the tool name from `packageManager` (e.g. "pnpm@9.1.0") is kept; anything else becomes "other".
    const field = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : null;
    return { state: 'valid', names: new Set([
      ...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}),
    ]), workspaces: pkg.workspaces !== undefined,
    packageManagerField: field === null ? null : PACKAGE_MANAGERS.has(field) ? field : 'other' };
  } catch { return empty('invalid'); }
}

function matches(names, list) { return list.filter(([, pattern]) => [...names].some(name => pattern.test(name))).map(([id]) => id); }

// Decides which application framework the scan can stand behind. Detection is by declared packages and
// root config files only; `partial` means a supported host plus code or packages this scanner cannot cover.
function detectFramework(root, manifest) {
  if (manifest.state === 'missing') return { status: 'unknown', id: null, confidence: 'low', detected: [], evidence: [], reasons: ['no_package_manifest'] };
  if (manifest.state !== 'valid') return { status: 'unknown', id: null, confidence: 'low', detected: [], evidence: [], reasons: ['unusable_package_manifest'] };
  const names = manifest.names;
  const hosts = matches(names, HOST_FRAMEWORKS);
  const components = matches(names, COMPONENT_FRAMEWORKS);
  const otherUi = matches(names, OTHER_UI_LIBRARIES);
  const servers = matches(names, SERVER_FRAMEWORKS);
  const hasVite = names.has('vite');
  const hasReact = names.has('react') || names.has('react-dom');
  if (!hosts.length && hasVite && hasReact) hosts.push('react_vite');
  const configs = id => (FRAMEWORK_CONFIGS[id] ?? []).filter(name => isFile(join(root, name)));
  const detected = sorted([...hosts, ...components, ...otherUi, ...servers]);
  if (hosts.length > 1) {
    return { status: 'unknown', id: null, confidence: 'low', detected, evidence: sorted(['package.json', ...hosts.flatMap(configs)]),
      reasons: ['multiple_frameworks'] };
  }
  if (!hosts.length) {
    const fallback = components[0] ?? otherUi[0] ?? servers[0];
    if (fallback) {
      return { status: 'unsupported', id: hasVite && !servers.includes(fallback) ? `vite_${fallback}` : fallback, confidence: 'medium',
        detected, evidence: ['package.json'], reasons: [servers.includes(fallback) ? 'server_framework_only' : 'unsupported_framework'] };
    }
    return { status: 'unknown', id: null, confidence: 'low', detected, evidence: [],
      reasons: [hasReact ? 'react_without_supported_build_tool' : 'no_recognized_framework'] };
  }
  const id = hosts[0];
  const configEvidence = configs(id);
  if (!SUPPORTED_FRAMEWORKS.includes(id)) {
    return { status: 'unsupported', id, confidence: 'medium', detected, evidence: ['package.json'], reasons: ['unsupported_framework'] };
  }
  const reasons = [];
  if (components.length) reasons.push('unsupported_component_framework');
  if (servers.length) reasons.push('additional_server_framework');
  if (manifest.workspaces) reasons.push('workspace_packages_not_scanned');
  return { status: reasons.length ? 'partial' : 'supported', id, confidence: configEvidence.length ? 'high' : 'medium',
    detected, evidence: sorted(['package.json', ...configEvidence]), reasons };
}

// Package manager from root lockfile names (existence only) and the manifest `packageManager` field.
function detectPackageManager(root, manifest) {
  const lockfiles = LOCKFILES.filter(([, name]) => isFile(join(root, name)));
  const evidence = sorted(lockfiles.map(([, name]) => name));
  if (manifest.state === 'missing') return { status: 'unknown', id: null, detected: [], evidence, reasons: ['no_package_manifest'] };
  if (manifest.state !== 'valid') return { status: 'unknown', id: null, detected: [], evidence, reasons: ['unusable_package_manifest'] };
  const managers = sorted([...lockfiles.map(([id]) => id), ...(manifest.packageManagerField ? [manifest.packageManagerField] : [])]);
  if (managers.length > 1) return { status: 'unknown', id: null, detected: managers, evidence, reasons: ['conflicting_package_managers'] };
  if (!lockfiles.length) return { status: 'unknown', id: null, detected: managers, evidence, reasons: ['no_lockfile'] };
  const id = managers[0];
  if (SUPPORTED_PACKAGE_MANAGERS.includes(id)) return { status: 'supported', id, detected: managers, evidence, reasons: [] };
  return { status: 'unsupported', id, detected: managers, evidence, reasons: ['unsupported_package_manager'] };
}

function evidence(files, pattern, include = () => true) {
  return files.filter(file => include(file.path) && pattern.test(file.text)).map(file => file.path);
}

const publicSource = path => !path.includes('/(studio)/') && !path.startsWith('sanity/') && !path.startsWith('src/sanity/');
function routeMatcher(frameworkId) {
  return path => /^(?:src\/)?app\/(?:.+\/)?route\.[cm]?[jt]s$/.test(path) ||
    /^(?:src\/)?pages\/api\/.+\.[cm]?[jt]s$/.test(path) ||
    /^api\/.+\.[cm]?[jt]s$/.test(path) ||
    // Astro endpoints: script files (not .astro pages) under src/pages.
    (frameworkId === 'astro' && /^src\/pages\/.+\.[cm]?[jt]s$/.test(path));
}
const hasPackage = (names, pattern) => [...names].some(name => pattern.test(name));

export function inventoryProject(projectRoot) {
  if (typeof projectRoot !== 'string' || !projectRoot) throw new Error('Project root must be a directory');
  const root = resolve(projectRoot);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) throw new Error('Project root must be a directory');
  const manifest = inspectManifest(root);
  const { files, incomplete } = inspectSource(root);
  if (manifest.state === 'invalid' || manifest.state === 'too_large') incomplete.push('unusable_package_manifest');
  const complete = files.length > 0 && incomplete.length === 0;
  const framework = detectFramework(root, manifest);
  const packageManager = detectPackageManager(root, manifest);
  const routePath = routeMatcher(framework.id);
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
  const sanityPackage = pkg(/^(?:sanity|next-sanity|@sanity\/astro)$/);
  const sanitySource = paths.filter(path => /^sanity\.config\./.test(path) || path.includes('/(studio)/studio/'));
  const signedWebhookSource = source(/(?:next-sanity\/webhook|verifySignature|isValidSignature|x-sanity-signature)/, routePath);
  const webhookSource = routeFiles.filter(path => /webhook|revalidate/i.test(path)).concat(signedWebhookSource);
  const authPackage = pkg(/^(?:next-auth|@auth\/.+|@clerk\/(?:nextjs|clerk-react|react|astro)|@auth0\/auth0-react|better-auth|lucia|@supabase\/(?:auth-helpers.*|supabase-js|ssr)|firebase)$/);
  const authSource = source(/(?:from\s*['"](?:next-auth|@auth\/|@clerk\/|@auth0\/|better-auth|lucia|firebase\/auth)|\b(?:signIn|useSession|getServerSession|ClerkProvider|SignedIn|useAuth0)\s*\()/, publicSource);
  const formSource = source(/<form(?:\s|>)/i, publicSource);
  const formPackage = pkg(/^(?:react-hook-form|formik)$/);
  const paymentPackage = pkg(/^(?:stripe|@stripe\/.+|@paypal\/.+|braintree|@adyen\/.+|square)$/);
  const paymentSource = source(/(?:from\s*['"](?:stripe|@stripe\/|@paypal\/|braintree|@adyen\/)|\bStripeProvider\b|\bPayPalScriptProvider\b)/, publicSource);
  const analyticsPackage = pkg(/^(?:@vercel\/analytics|@next\/third-parties|react-ga4|@segment\/analytics-next|posthog-js)$/);
  const analyticsSource = source(/(?:from\s*['"](?:@vercel\/analytics|@next\/third-parties|react-ga4|@segment\/analytics-next|posthog-js)|<Analytics\b|\bgtag\s*\()/, publicSource);
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
    // Additive in schema version 1 (Phase 4A). Consumers that predate it treat support as unknown.
    support: {
      supportedTargets: { frameworks: SUPPORTED_FRAMEWORKS, packageManagers: SUPPORTED_PACKAGE_MANAGERS },
      framework,
      packageManager,
    },
    signals,
    candidateChecks,
    boundaries: { complianceApplicability: 'not determined', riskLevel: 'not assigned',
      note: 'Candidate checks and source signals require human review before decisions or enforcement.' },
  };
}

// `[PROJECT_ROOT]` (positional, original form) or `--root PROJECT_ROOT`; defaults to the current directory.
export function parseRootArgument(args) {
  if (!args.length) return process.cwd();
  if (args.length === 1 && !args[0].startsWith('--')) return args[0];
  if (args.length === 2 && args[0] === '--root' && args[1] && !args[1].startsWith('--')) return args[1];
  throw new Error('usage');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let root;
  try { root = parseRootArgument(process.argv.slice(2)); }
  catch {
    process.stderr.write('Usage: node scripts/security/inventory-project.mjs [PROJECT_ROOT | --root PROJECT_ROOT]\n');
    process.exitCode = 1;
  }
  if (root !== undefined) {
    try { process.stdout.write(`${JSON.stringify(inventoryProject(root), null, 2)}\n`); }
    catch { process.stderr.write('Project inventory could not read the selected directory.\n'); process.exitCode = 1; }
  }
}
