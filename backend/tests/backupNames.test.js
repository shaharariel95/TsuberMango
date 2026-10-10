import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { backupFileName, resolveBackupName } = createRequire(import.meta.url)('../services/backupNames');

const names = ['backups/2026-07-14.json', 'backups/2026-07-14-020000.json', 'backups/2026-07-14-230000.json', 'backups/2026-07-13.json', 'backups/2026-07-15-230000.json'];

describe('backup names', () => {
  it('builds a UTC timestamped name', () => {
    expect(backupFileName('2026-07-20T23:00:01.123Z')).toBe('backups/2026-07-20-230001.json');
    expect(() => backupFileName('nope')).toThrow();
  });
  it('latest = newest, old date-only sorts before same-day timestamped', () => {
    expect(resolveBackupName(names, 'latest').name).toBe('backups/2026-07-15-230000.json');
    expect(resolveBackupName(['backups/2026-07-14.json', 'backups/2026-07-14-000100.json'], 'latest').name).toBe('backups/2026-07-14-000100.json');
  });
  it('a date resolves to the newest of that day and lists all candidates', () => {
    const r = resolveBackupName(names, '2026-07-14');
    expect(r.name).toBe('backups/2026-07-14-230000.json');
    expect(r.candidates).toEqual(['backups/2026-07-14.json', 'backups/2026-07-14-020000.json', 'backups/2026-07-14-230000.json']);
    expect(resolveBackupName(names, '2026-07-13').name).toBe('backups/2026-07-13.json');
    expect(() => resolveBackupName(names, '2026-01-01')).toThrow(/No backup/);
  });
  it('a full object name passes through', () => {
    expect(resolveBackupName(names, 'backups/2026-07-14-020000.json').name).toBe('backups/2026-07-14-020000.json');
  });
});
