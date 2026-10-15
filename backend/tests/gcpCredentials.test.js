import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { adminInitOptions, storageOptions, keyFileIfPresent } = require('../utils/gcpCredentials');

const cert = (sa) => ({ certOf: sa.project_id });
const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const tmpKey = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbcred-'));
  dirs.push(dir);
  const file = path.join(dir, 'key.json');
  fs.writeFileSync(file, JSON.stringify({ project_id: 'key-project', client_email: 'x@y' }));
  return file;
};

describe('gcpCredentials', () => {
  it('uses the key file and its project_id when present', () => {
    expect(adminInitOptions({ keyFile: tmpKey(), projectId: undefined, cert }))
      .toEqual({ credential: { certOf: 'key-project' }, projectId: 'key-project' });
  });
  it('prefers an explicit projectId over the key project_id', () => {
    expect(adminInitOptions({ keyFile: tmpKey(), projectId: 'env-project', cert }).projectId).toBe('env-project');
  });
  it('falls back to ADC with projectId when no key file', () => {
    expect(adminInitOptions({ keyFile: null, projectId: 'env-project', cert })).toEqual({ projectId: 'env-project' });
  });
  it('throws a clear error with neither key nor project id', () => {
    expect(() => adminInitOptions({ keyFile: null, projectId: undefined, cert })).toThrow(/FIREBASE_PROJECT_ID/);
  });
  it('storageOptions maps key presence', () => {
    expect(storageOptions({ keyFile: '/k.json' })).toEqual({ keyFilename: '/k.json' });
    expect(storageOptions({ keyFile: null })).toEqual({});
  });
  it('keyFileIfPresent returns the path for an existing file', () => {
    const f = tmpKey();
    expect(keyFileIfPresent(f)).toBe(f);
  });
  it('keyFileIfPresent returns null for a missing file', () => {
    expect(keyFileIfPresent(path.join(os.tmpdir(), 'nope-does-not-exist.json'))).toBeNull();
  });
});
