import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';

if (!getApps().length) initializeApp({ projectId: 'demo-tsuber' });
const db = getFirestore();
const require = createRequire(import.meta.url);
const { buildBackupPayload } = require('../services/backupService');
const FirestoreRepository = require('../repositories/FirestoreRepository');

const C = 'backuptest';
const center = db.collection('centers').doc(C);

beforeEach(async () => {
  await db.recursiveDelete(center);
  await center.collection('config').doc('global').set({ kinds: ['שלי'], farmers: [{ name: 'א', allowGidon: false }] });
  await center.collection('users').doc('a@x').set({ role: 'admin' });
  await center.collection('farmers').doc('א').set({ certificateProfile: { headerLines: ['1', '2', '3', '4', '5'], driverName: 'אדם', nextNumber: 80 } });
  await center.collection('farmers').doc('א').collection('records').doc('r1').set({ palletNumber: 1, sent: false, cardId: '' });
  await center.collection('farmers').doc('א').collection('records').doc('r2').set({ palletNumber: 2, deleted: true, deletedBy: 'a@x', deletedAt: '2026-10-10T00:00:00Z' });
  await center.collection('farmers').doc('א').collection('audit').doc('a1').set({ recordId: 'r1', action: 'קליטה' });
  // Not in the config list, records only (no farmers/ב document)
  await center.collection('farmers').doc('ב').collection('records').doc('r3').set({ palletNumber: 3 });
  const cert = center.collection('certificates').doc('א__79');
  await cert.set({ farmer: 'א', number: 79, currentVersion: 2, recordIds: ['r1'] });
  await cert.collection('versions').doc('1').set({ issuedAt: '2026-10-01T00:00:00Z' });
  await cert.collection('versions').doc('2').set({ issuedAt: '2026-10-02T00:00:00Z' });
  await center.collection('fridge').doc('main').set({ cells: { A1: { farmer: 'א', palletNumber: 1, placedBy: 'a@x', placedAt: '2027-05-01T00:00:00Z' } }, updatedAt: '2027-05-01T00:00:00Z', updatedBy: 'a@x' });
  await center.collection('fridge').doc('main').collection('log').doc('l1').set({ op: 'place', farmer: 'א', palletNumber: 1, from: null, to: 'A1', by: 'a@x', at: '2027-05-01T00:00:00Z' });
});
afterAll(async () => { await Promise.all(getApps().map(a => deleteApp(a))); });

describe('buildBackupPayload (v2)', () => {
  it('includes the fridge rooms with their logs', async () => {
    const p = await buildBackupPayload(db, C);
    expect(p.fridge.main.doc.cells.A1).toMatchObject({ farmer: 'א', palletNumber: 1 });
    expect(p.fridge.main.log).toEqual([{ id: 'l1', op: 'place', farmer: 'א', palletNumber: 1, from: null, to: 'A1', by: 'a@x', at: '2027-05-01T00:00:00Z' }]);
  });

  it('contains config, users, farmer docs, every farmer incl. unlisted + soft-deleted records, audit and certificates', async () => {
    const p = await buildBackupPayload(db, C);
    expect(p.version).toBe(2);
    expect(p.centerId).toBe(C);
    expect(typeof p.timestamp).toBe('string');
    expect(p.config.kinds).toEqual(['שלי']);
    expect(p.users).toEqual({ 'a@x': { role: 'admin' } });
    expect(p.farmerDocs['א'].certificateProfile.nextNumber).toBe(80);
    expect(p.farmerDocs['ב']).toBeUndefined();
    expect(p.farmers['א'].map(r => r.id).sort()).toEqual(['r1', 'r2']);
    expect(p.farmers['א'].find(r => r.id === 'r2').deleted).toBe(true);
    expect(p.farmers['ב'].map(r => r.id)).toEqual(['r3']);
    expect(p.audit['א']).toEqual([{ id: 'a1', recordId: 'r1', action: 'קליטה' }]);
    expect(p.audit['ב']).toEqual([]);
    expect(p.certificates).toHaveLength(1);
    expect(p.certificates[0]).toMatchObject({ id: 'א__79', number: 79 });
    expect(p.certificates[0].versions.map(v => v.n)).toEqual([1, 2]);
  });

  it('fails as a whole when any read fails (no partial backup)', async () => {
    const spy = vi.spyOn(FirestoreRepository.prototype, 'getRecords').mockRejectedValueOnce(new Error('boom'));
    try {
      await expect(buildBackupPayload(db, C)).rejects.toThrow('boom');
    } finally { spy.mockRestore(); }
  });
});
