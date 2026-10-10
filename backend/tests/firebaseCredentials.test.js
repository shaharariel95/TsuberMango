import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { adminInitOptions, storageOptions, keyFileIfPresent } = require('../utils/firebaseCredentials');

const admin = { credential: { cert: (sa) => ({ certOf: sa.project_id }) } };
const tmpKey = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbcred-'));
  const file = path.join(dir, 'key.json');
  fs.writeFileSync(file, JSON.stringify({ project_id: 'key-project', client_email: 'x@y' }));
  return file;
};

describe('firebaseCredentials', () => {
  it('uses the key file and its project_id when present', () => {
    expect(adminInitOptions({ keyFile: tmpKey(), projectId: undefined, admin }))
      .toEqual({ credential: { certOf: 'key-project' }, projectId: 'key-project' });
  });
  it('prefers an explicit projectId over the key project_id', () => {
    expect(adminInitOptions({ keyFile: tmpKey(), projectId: 'env-project', admin }).projectId).toBe('env-project');
  });
  it('falls back to ADC with projectId when no key file', () => {
    expect(adminInitOptions({ keyFile: null, projectId: 'env-project', admin })).toEqual({ projectId: 'env-project' });
  });
  it('throws a clear error with neither key nor project id', () => {
    expect(() => adminInitOptions({ keyFile: null, projectId: undefined, admin })).toThrow(/FIREBASE_PROJECT_ID/);
  });
  it('storageOptions maps key presence', () => {
    expect(storageOptions({ keyFile: '/k.json' })).toEqual({ keyFilename: '/k.json' });
    expect(storageOptions({ keyFile: null })).toEqual({});
  });
  it('keyFileIfPresent returns null for a missing file', () => {
    expect(keyFileIfPresent(path.join(os.tmpdir(), 'nope-does-not-exist.json'))).toBeNull();
  });
});
