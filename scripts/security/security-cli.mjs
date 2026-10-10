import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared, dependency-free helpers for the security CLIs. Paths come from the person running the
// command; files are opened only if they are regular files (no symlinks, devices, or directories).

// The framework root that ships the bundled catalog and its reusable reference documents.
export const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const BUNDLED_CATALOG = 'docs/security/SECURITY-CHECK-CATALOG.json';
export const PROJECT_EVIDENCE_PATH = 'docs/security/PROJECT-LOCAL-EVIDENCE.json';

export class UsageError extends Error {}

// Parses `--name value` pairs and bare `--flag` switches. Unknown, repeated or value-less options fail closed.
export function parseOptions(args, { values = [], flags = [] }) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    // Messages name only known option names, never the argument text itself (it may be a local path).
    const name = arg.startsWith('--') ? arg.slice(2) : null;
    if (!name) throw new UsageError('Unexpected positional argument');
    if (!flags.includes(name) && !values.includes(name)) throw new UsageError('Unknown option');
    if (Object.hasOwn(options, name)) throw new UsageError(`Repeated option --${name}`);
    if (flags.includes(name)) { options[name] = true; continue; }
    const value = args[++index];
    if (typeof value !== 'string' || !value || value.startsWith('--')) throw new UsageError(`Missing value for --${name}`);
    options[name] = value;
  }
  return options;
}

export function directoryPath(path, label) {
  const absolute = resolve(path);
  let stat;
  try { stat = lstatSync(absolute, { throwIfNoEntry: false }); } catch { stat = undefined; }
  if (!stat?.isDirectory()) throw new UsageError(`${label} must be an existing directory`);
  return absolute;
}

export function regularFile(path) {
  try { return lstatSync(resolve(path), { throwIfNoEntry: false })?.isFile() === true; } catch { return false; }
}

export function readJsonFile(path, maxBytes, label) {
  const absolute = resolve(path);
  let stat;
  try { stat = lstatSync(absolute, { throwIfNoEntry: false }); } catch { stat = undefined; }
  if (!stat?.isFile()) throw new UsageError(`${label} must be an existing regular file`);
  if (stat.size > maxBytes) throw new UsageError(`${label} exceeds its size limit`);
  try { return JSON.parse(readFileSync(absolute, 'utf8')); }
  catch { throw new UsageError(`${label} is not valid JSON`); }
}

// A short, non-identifying label for an input file, so reports never carry local absolute paths.
export function sourceLabel(path, bundledRelative, bundledRoot = FRAMEWORK_ROOT) {
  const absolute = resolve(path);
  if (absolute === resolve(bundledRoot, bundledRelative)) return bundledRelative;
  return `custom file: ${absolute.split(/[\\/]/).pop().slice(0, 80)}`;
}
