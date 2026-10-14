import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds or checks the portable VitaNova security Skill candidate in skills/vitanova-security/ from this framework's
// tested sources. Default mode only checks; `--write` regenerates the copied files and MANIFEST.json. Project-specific
// sections are stripped by named rules that must each match exactly once, so a changed source fails loudly instead of
// leaking client data. Client records, baselines, registers, evidence files and workflows are never copied.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SKILL_DIR = 'skills/vitanova-security';
export const SKILL_NAME = 'vitanova-security';
export const SKILL_VERSION = '1.0.0-candidate';
const MANIFEST = 'MANIFEST.json';

// Entry points the Skill runs; their relative imports are bundled automatically.
export const ENTRYPOINTS = ['inventory-project.mjs', 'format-project-inventory.mjs', 'validate-check-catalog.mjs',
  'recommend-security-checks.mjs', 'format-security-recommendations.mjs', 'check-dependency-audit.mjs',
  'validate-approval-policy.mjs', 'validate-client-records.mjs', 'assess-risk-renewal.mjs'];

const dropSection = heading => text => {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0 || text.indexOf(`\n${heading}\n`, start + 1) >= 0) throw new Error(`section "${heading}" must appear exactly once`);
  const next = text.indexOf('\n## ', start + heading.length + 2);
  return next < 0 ? `${text.slice(0, start).trimEnd()}\n` : text.slice(0, start) + text.slice(next);
};
const replaceOnce = (from, to) => text => {
  if (text.split(from).length !== 2) throw new Error(`text to replace must appear exactly once: ${from.slice(0, 60)}`);
  return text.replace(from, to);
};

// Reference files, by destination path inside the Skill. Sanitized files list the rules applied to their source.
export const COPIES = [
  ['docs/security/SECURITY-CHECK-CATALOG.json'],
  ['docs/security/SECURITY-APPROVAL-POLICY.json'],
  ['docs/security/RISK-RENEWAL-PROCEDURE.md'],
  ['docs/security/templates/CLIENT-SECURITY-RECORDS.template.json'],
  ['docs/security/templates/RISK-RENEWAL-DECISION.template.md'],
  ['scripts/security/fixtures/client-records/example-fictional-bakery.json'],
  ['scripts/security/validate-client-records.test.mjs'],
  ['docs/security/PROJECT-AWARE-CHECK-MATRIX.md', [
    replaceOnce(" [La Segundita's profile](PROJECT-SECURITY-PROFILE.md) is one application of these rules.", ''),
  ]],
  ['docs/security/PROJECT-INVENTORY-AUTOMATION.md', [
    dropSection('## La Segundita comparison'), dropSection('## Review-only CI summary'),
    replaceOnce('The human-reviewed [project profile](PROJECT-SECURITY-PROFILE.md) and [general check matrix](PROJECT-AWARE-CHECK-MATRIX.md) remain the interpretation layer. ' +
      'The existing dependency/secret CI gate and its time-limited risk approval remain governed by `SECURITY-BASELINE-CI.md`, `DEPENDENCY-AUDIT-BASELINE.json` and `DEPENDENCY-RISK-REGISTER.md`.',
      "The project's own human-reviewed security profile, if it has one, and the [general check matrix](PROJECT-AWARE-CHECK-MATRIX.md) remain the interpretation layer. " +
      "A project's dependency gate and any time-limited risk approvals stay in that project's own records."),
    replaceOnce('\nnode --test scripts/security/inventory-project.test.mjs\nnode --test scripts/security/format-project-inventory.test.mjs\n', '\n'),
    replaceOnce(' (see [PORTABILITY.md](PORTABILITY.md#versioning-policy))', ' (see the Skill README)'),
    replaceOnce(' See [PORTABILITY.md](PORTABILITY.md).', ' Support states are summarized in the Skill\'s `SKILL.md`.'),
  ]],
  ['docs/security/SECURITY-APPROVAL-POLICY.md', [dropSection('## Project-local example: La Segundita')]],
  ['docs/security/CLIENT-SECURITY-RECORDS.md', [
    text => text.replace(/\*\*Existing approvals are not migrated\.\*\*[^\n]*\n/, match => {
      if (!/La Segundita/.test(match)) throw new Error('client-records migration paragraph changed; review the sanitizing rule');
      return "**Existing approvals are not migrated.** A host project's existing approvals stay where they are; nothing converts them into this format. This Skill contains no client records.\n";
    }),
  ]],
];
// Files written by hand inside the Skill; hashed in the manifest but never generated.
export const AUTHORED = ['SKILL.md', 'README.md', 'tests/skill.test.mjs'];

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

export function scriptClosure(entrypoints = ENTRYPOINTS) {
  const seen = new Set();
  const visit = name => {
    if (seen.has(name)) return;
    const path = join(ROOT, 'scripts/security', name);
    if (!existsSync(path)) throw new Error(`missing script ${name}`);
    seen.add(name);
    for (const [, spec] of readFileSync(path, 'utf8').matchAll(/^\s*import\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('./') || spec.includes('/', 2)) throw new Error(`${name} imports ${spec}; only sibling scripts and node: built-ins can be bundled`);
      visit(spec.slice(2));
    }
  };
  entrypoints.forEach(visit);
  return [...seen].sort();
}

export function expectedFiles() {
  const files = new Map();
  for (const name of scriptClosure()) files.set(`scripts/security/${name}`, { source: `scripts/security/${name}`, transform: 'copy', content: readFileSync(join(ROOT, 'scripts/security', name)) });
  for (const [path, rules = []] of COPIES) {
    let content = readFileSync(join(ROOT, path), 'utf8');
    for (const rule of rules) content = rule(content);
    files.set(path, { source: path, transform: rules.length ? 'sanitized' : 'copy', content: Buffer.from(content) });
  }
  return files;
}

function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`symlink in Skill bundle: ${relative(base, path)}`);
    return stat.isDirectory() ? listFiles(path, base) : [relative(base, path).split(sep).join('/')];
  });
}

export function buildManifest(files, skillDir) {
  const entries = [...files].map(([path, item]) => ({ path, sha256: sha256(item.content), source: item.source, transform: item.transform }));
  for (const path of AUTHORED) entries.push({ path, sha256: sha256(readFileSync(join(skillDir, path))), source: null, transform: 'authored' });
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const scripts = scriptClosure();
  return `${JSON.stringify({ schemaVersion: 1, kind: 'vitanova-security-skill-manifest', skill: SKILL_NAME, version: SKILL_VERSION,
    contracts: { approvalPolicySchemaVersion: 2, checkCatalogSchemaVersion: 1, inventorySchemaVersion: 1, clientRecordsSchemaVersion: 1,
      dependencyBaselineSchemaVersion: 1, renewalPacketVersion: 1 },
    supportedPackageManagersForDependencyAudit: ['npm'], entrypoints: ENTRYPOINTS.map(name => `scripts/security/${name}`),
    bundledScripts: scripts.map(name => `scripts/security/${name}`), files: entries }, null, 2)}\n`;
}

export function checkBundle(skillDir = join(ROOT, SKILL_DIR)) {
  const problems = [];
  const files = expectedFiles();
  for (const [path, item] of files) {
    const target = join(skillDir, path);
    if (!existsSync(target)) problems.push(`missing ${path}`);
    else if (!readFileSync(target).equals(item.content)) problems.push(`out of date ${path}`);
  }
  for (const path of AUTHORED) if (!existsSync(join(skillDir, path))) problems.push(`missing authored ${path}`);
  const allowed = new Set([...files.keys(), ...AUTHORED, MANIFEST]);
  for (const path of listFiles(skillDir)) if (!allowed.has(path)) problems.push(`unexpected file ${path}`);
  if (!problems.length) {
    const manifest = existsSync(join(skillDir, MANIFEST)) ? readFileSync(join(skillDir, MANIFEST), 'utf8') : null;
    if (manifest !== buildManifest(files, skillDir)) problems.push('MANIFEST.json is out of date');
  }
  return problems;
}

export function writeBundle(skillDir = join(ROOT, SKILL_DIR)) {
  const files = expectedFiles();
  for (const [path, item] of files) {
    mkdirSync(dirname(join(skillDir, path)), { recursive: true });
    writeFileSync(join(skillDir, path), item.content);
  }
  writeFileSync(join(skillDir, MANIFEST), buildManifest(files, skillDir));
  return checkBundle(skillDir);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--write', '--check'].includes(arg)) || args.length > 1) {
    process.stderr.write('Usage: node scripts/security/build-skill-bundle.mjs [--check | --write]\n');
    process.exit(1);
  }
  try {
    const problems = args[0] === '--write' ? writeBundle() : checkBundle();
    if (problems.length) { process.stderr.write(`Skill bundle is not in sync:\n${problems.map(item => `- ${item}`).join('\n')}\nRun with --write after reviewing the source changes.\n`); process.exitCode = 1; }
    else process.stdout.write(`Skill bundle ${SKILL_DIR} is in sync with its sources (${scriptClosure().length} scripts).\n`);
  } catch (error) {
    process.stderr.write(`Skill bundle build failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
