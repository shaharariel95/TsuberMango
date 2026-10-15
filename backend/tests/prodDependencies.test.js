// Every package the server code requires must be a declared production dependency. The Docker
// image installs with `npm ci --omit=dev`, so a package that only happens to be hoisted into
// node_modules by a dev tool works in tests and crashes the Cloud Run container at boot
// (google-auth-library, found by review after the storage 8 / firebase-admin 14 upgrade).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const ROOT = path.resolve(__dirname, '..');
// What runs in production: server entry points and everything they can load. scripts/ and tests/
// are run from a developer machine with dev dependencies installed.
const PROD_ENTRIES = ['app.js', 'server.js', 'config', 'controllers', 'middleware', 'models', 'repositories', 'routes', 'services', 'utils'];

function jsFiles(entry) {
  const full = path.join(ROOT, entry);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return full.endsWith('.js') ? [full] : [];
  return fs.readdirSync(full).flatMap(name => jsFiles(path.join(entry, name)));
}

function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

describe('production dependencies', () => {
  it('declares every package required by server code', () => {
    const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const builtins = new Set(builtinModules);
    const missing = [];
    for (const file of PROD_ENTRIES.flatMap(jsFiles)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const [, spec] of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if (spec.startsWith('.') || spec.startsWith('node:') || builtins.has(spec)) continue;
        if (!dependencies[packageName(spec)]) missing.push(`${path.relative(ROOT, file)}: ${spec}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
