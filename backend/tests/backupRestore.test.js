import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';

if (!getApps().length) initializeApp({ projectId: 'demo-tsuber' });
const db = getFirestore();
const require = createRequire(import.meta.url);
const { buildBackupPayload } = require('../services/backupService');
const { restoreBackup } = require('../services/backupRestore');
const { resetSeason } = require('../services/seasonReset');

const A = 'restoresrc';
const B = 'restoredst';
const ca = db.collection('centers').doc(A);
const cb = db.collection('centers').doc(B);

async function seed() {
  await db.recursiveDelete(ca);
  await db.recursiveDelete(cb);
  await ca.collection('config').doc('global').set({ kinds: ['שלי'], farmers: [{ name: 'א', allowGidon: true }] });
  await ca.collection('users').doc('a@x').set({ role: 'admin' });
  await ca.collection('farmers').doc('א').set({ certificateProfile: { headerLines: ['1', '2', '3', '4', '5'], driverName: 'אדם', nextNumber: 80 } });
  await ca.collection('farmers').doc('א').collection('records').doc('r1').set({ palletNumber: 1, boxes: 40, cardId: 79, sent: true, weight: 700 });
  await ca.collection('farmers').doc('א').collection('records').doc('r2').set({ palletNumber: 2, deleted: true, deletedBy: 'a@x', deletedAt: '2026-10-10T00:00:00Z' });
  await ca.collection('farmers').doc('א').collection('audit').doc('a1').set({ recordId: 'r1', action: 'קליטה', editedAt: '2026-10-01T00:00:00Z' });
  await ca.collection('farmers').doc('ב').collection('records').doc('r3').set({ palletNumber: 3 });
  const cert = ca.collection('certificates').doc('א__79');
  await cert.set({ farmer: 'א', number: 79, currentVersion: 2, recordIds: ['r1'] });
  await cert.collection('versions').doc('1').set({ issuedAt: '2026-10-01T00:00:00Z', rows: [{ palletNumber: 1 }] });
  await cert.collection('versions').doc('2').set({ issuedAt: '2026-10-02T00:00:00Z', rows: [{ palletNumber: 1 }] });
}
// Everything restore must bring back, normalized for comparison
async function snapshot(center) {
  const out = { farmerDocs: {}, records: {}, audit: {}, certs: {} };
  for (const ref of await center.collection('farmers').listDocuments()) {
    const d = await ref.get();
    if (d.exists) out.farmerDocs[ref.id] = d.data();
    out.records[ref.id] = Object.fromEntries((await ref.collection('records').get()).docs.map(x => [x.id, x.data()]));
    out.audit[ref.id] = Object.fromEntries((await ref.collection('audit').get()).docs.map(x => [x.id, x.data()]));
  }
  for (const c of (await center.collection('certificates').get()).docs) {
    out.certs[c.id] = { ...c.data(), versions: Object.fromEntries((await c.ref.collection('versions').get()).docs.map(v => [v.id, v.data()])) };
  }
  return out;
}
const asFile = async (center) => JSON.parse(JSON.stringify(await buildBackupPayload(db, center)));

beforeEach(seed);
afterAll(async () => { await Promise.all(getApps().map(a => deleteApp(a))); });

describe('restoreBackup', () => {
  it('backup → wipe → restore brings back records (incl. deleted and unlisted farmers), audit, certificates and profiles', async () => {
    const before = await snapshot(ca);
    const payload = await asFile(A);
    await resetSeason(db, A, { execute: true, skipBackupCheck: true });
    await ca.collection('farmers').doc('א').update({ certificateProfile: FieldValue.delete() });

    const dry = await restoreBackup(db, A, payload);
    expect(dry).toMatchObject({ executed: false, version: 2, blockers: [], certificates: 1, certificateVersions: 2, farmerDocs: 1, config: false, users: 0 });
    expect(dry.farmers).toEqual({ 'א': { records: 2, audit: 1 }, 'ב': { records: 1, audit: 0 } });
    expect((await ca.collection('farmers').doc('א').collection('records').get()).size).toBe(0);

    const done = await restoreBackup(db, A, payload, { execute: true });
    expect(done.executed).toBe(true);
    expect(await snapshot(ca)).toEqual(before);
  });

  it('refuses to restore over existing data and writes nothing', async () => {
    const payload = await asFile(A);
    const dry = await restoreBackup(db, A, payload);
    expect(dry.blockers.length).toBeGreaterThan(0);
    await expect(restoreBackup(db, A, payload, { execute: true })).rejects.toThrow(/not empty|exists/i);
    expect((await ca.collection('farmers').doc('א').collection('records').get()).size).toBe(2);
  });

  it('restores a single farmer (records, audit, farmer doc, its certificates) into another center', async () => {
    const payload = await asFile(A);
    await restoreBackup(db, B, payload, { execute: true, farmer: 'א' });
    expect((await cb.collection('farmers').doc('א').collection('records').get()).size).toBe(2);
    expect((await cb.collection('farmers').doc('ב').collection('records').get()).size).toBe(0);
    expect((await cb.collection('certificates').doc('א__79').get()).exists).toBe(true);
    expect((await cb.collection('farmers').doc('א').get()).data().certificateProfile.nextNumber).toBe(80);
    expect((await cb.collection('config').doc('global').get()).exists).toBe(false);
    await expect(restoreBackup(db, B, payload, { farmer: 'אין-כזה' })).rejects.toThrow();
  });

  it('--with-config also restores config and users (full scope, v2 only)', async () => {
    const payload = await asFile(A);
    await restoreBackup(db, B, payload, { execute: true, withConfig: true });
    expect((await cb.collection('config').doc('global').get()).data().kinds).toEqual(['שלי']);
    expect((await cb.collection('users').doc('a@x').get()).data()).toEqual({ role: 'admin' });
    await expect(restoreBackup(db, B, payload, { withConfig: true, farmer: 'א' })).rejects.toThrow();
  });

  it('restores an old v1 file (records only)', async () => {
    const v1 = { timestamp: '2026-07-01T23:00:00.000Z', farmers: { 'ג': [{ id: 'x1', palletNumber: 9, boxes: 1 }] } };
    const out = await restoreBackup(db, B, v1, { execute: true });
    expect(out.version).toBe(1);
    expect((await cb.collection('farmers').doc('ג').collection('records').doc('x1').get()).data()).toEqual({ palletNumber: 9, boxes: 1 });
    await expect(restoreBackup(db, B, v1, { withConfig: true })).rejects.toThrow();
  });

  it('restores Sheets-era v1 backups with numeric ids', async () => {
    const v1 = { timestamp: '2026-07-14T23:00:00.000Z', farmers: { 'ד': [{ id: 1, palletNumber: 1 }, { id: 2, palletNumber: 2 }] } };
    await restoreBackup(db, B, v1, { execute: true });
    expect((await cb.collection('farmers').doc('ד').collection('records').doc('1').get()).data()).toEqual({ palletNumber: 1 });
    expect((await cb.collection('farmers').doc('ד').collection('records').doc('2').get()).exists).toBe(true);
  });

  it('a failing write rejects with a partial-data message', async () => {
    const v1 = { timestamp: '2026-07-14T23:00:00.000Z', farmers: { 'ה': [{ id: 'big', blob: 'x'.repeat(1_200_000) }] } };
    await expect(restoreBackup(db, B, v1, { execute: true })).rejects.toThrow(/Restore failed — partial data may have been written/);
  });

  it('a corrupt payload (record without id) rejects on execute and writes nothing', async () => {
    const bad = { timestamp: '2026-07-14T23:00:00.000Z', farmers: { 'ו': [{ id: 'ok', a: 1 }, { a: 2 }] } };
    await expect(restoreBackup(db, B, bad, { execute: true })).rejects.toThrow(/without id/);
    expect((await cb.collection('farmers').doc('ו').collection('records').get()).size).toBe(0);
    const badCert = { timestamp: 't', farmers: {}, certificates: [{ id: 'c', farmer: 'x', versions: [{ rows: [] }] }] };
    await expect(restoreBackup(db, B, badCert, { execute: true })).rejects.toThrow(/without n/);
  });

  it('never moves nextNumber backwards and reports both numbers in the dry run', async () => {
    const payload = await asFile(A); // backup nextNumber 80
    await resetSeason(db, A, { execute: true, skipBackupCheck: true });
    await ca.collection('farmers').doc('א').update({ 'certificateProfile.nextNumber': 90 });
    const dry = await restoreBackup(db, A, payload);
    expect(dry.profiles['א']).toEqual({ current: 90, backup: 80 });
    await restoreBackup(db, A, payload, { execute: true });
    expect((await ca.collection('farmers').doc('א').get()).data().certificateProfile.nextNumber).toBe(90);
    expect((await ca.collection('farmers').doc('א').get()).data().certificateProfile.driverName).toBe('אדם');
  });

  it('a string backup nextNumber cannot lower the current one', async () => {
    const payload = await asFile(A);
    payload.farmerDocs['א'].certificateProfile.nextNumber = '80';
    await resetSeason(db, A, { execute: true, skipBackupCheck: true });
    await ca.collection('farmers').doc('א').update({ 'certificateProfile.nextNumber': 90 });
    await restoreBackup(db, A, payload, { execute: true });
    expect((await ca.collection('farmers').doc('א').get()).data().certificateProfile.nextNumber).toBe(90);
  });

  it('rejects ids that are invalid Firestore paths', async () => {
    for (const id of ['a/b', '.', '..', '__x__']) {
      const bad = { timestamp: 't', farmers: { 'ז': [{ id, a: 1 }] } };
      await expect(restoreBackup(db, B, bad, { execute: true })).rejects.toThrow(/without id/);
    }
    const badCert = { timestamp: 't', farmers: {}, certificates: [{ id: 'a/b', farmer: 'x' }] };
    await expect(restoreBackup(db, B, badCert, { execute: true })).rejects.toThrow(/valid id/);
  });

  it('rejects a payload that is not a backup', async () => {
    await expect(restoreBackup(db, B, { hello: 1 })).rejects.toThrow(/not a backup/i);
  });
});
