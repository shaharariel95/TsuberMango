import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';

if (!getApps().length) initializeApp({ projectId: 'demo-tsuber' });
const db = getFirestore();
const { resetSeason } = createRequire(import.meta.url)('../services/seasonReset');

const C = 'resettest';
const OTHER = 'resetother';
const center = db.collection('centers').doc(C);
const NOW = new Date('2026-12-01T10:00:00Z');

async function seed() {
  await db.recursiveDelete(center);
  await db.recursiveDelete(db.collection('centers').doc(OTHER));
  await db.recursiveDelete(db.collection('backups'));
  await center.collection('config').doc('global').set({ farmers: [{ name: 'א', allowGidon: false }] });
  await center.collection('users').doc('a@x').set({ role: 'admin' });
  await center.collection('farmers').doc('א').set({ certificateProfile: { headerLines: ['1', '2', '3', '4', '5'], driverName: '', nextNumber: 77 } });
  await center.collection('farmers').doc('א').collection('records').add({ palletNumber: 1 });
  await center.collection('farmers').doc('א').collection('records').add({ palletNumber: 2 });
  await center.collection('farmers').doc('א').collection('audit').add({ action: 'קליטה' });
  // Parent-only farmer: records exist but no farmers/ב document
  await center.collection('farmers').doc('ב').collection('records').add({ palletNumber: 3 });
  const cert = center.collection('certificates').doc('א__76');
  await cert.set({ number: 76, farmer: 'א' });
  await cert.collection('versions').doc('1').set({ n: 1 });
  await cert.collection('versions').doc('2').set({ n: 2 });
  await center.collection('farmer_events').doc('א').set({ type: 'create' });
  await db.collection('centers').doc(OTHER).collection('farmers').doc('ג').collection('records').add({ palletNumber: 9 });
}
const count = async (ref) => (await ref.get()).size;

beforeEach(seed);
afterAll(async () => { await Promise.all(getApps().map(a => deleteApp(a))); });

describe('resetSeason', () => {
  it('dry run (default) reports counts and deletes nothing', async () => {
    const out = await resetSeason(db, C, { now: NOW });
    expect(out).toEqual({ executed: false, totalRecords: 3, farmers: { 'א': { records: 2, audit: 1 }, 'ב': { records: 1, audit: 0 } },
      certificates: 1, certificateVersions: 2, farmerEvents: 1 });
    expect(await count(center.collection('farmers').doc('א').collection('records'))).toBe(2);
    expect(await count(center.collection('certificates'))).toBe(1);
  });

  it('execute without a backup in the last 24h refuses and deletes nothing', async () => {
    await expect(resetSeason(db, C, { execute: true, now: NOW })).rejects.toThrow(/backup/i);
    await db.collection('backups').add({ timestamp: Timestamp.fromDate(new Date('2026-11-29T10:00:00Z')) });
    await expect(resetSeason(db, C, { execute: true, now: NOW })).rejects.toThrow(/backup/i);
    expect(await count(center.collection('farmers').doc('א').collection('records'))).toBe(2);
  });

  it('execute with a recent backup clears the season and keeps config, users, profiles and other centers', async () => {
    await db.collection('backups').add({ timestamp: Timestamp.fromDate(new Date('2026-12-01T08:00:00Z')) });
    const out = await resetSeason(db, C, { execute: true, now: NOW });
    expect(out.executed).toBe(true);
    expect(out.farmers['ב']).toEqual({ records: 1, audit: 0 });
    expect(await count(center.collection('farmers').doc('א').collection('records'))).toBe(0);
    expect(await count(center.collection('farmers').doc('א').collection('audit'))).toBe(0);
    expect(await count(center.collection('farmers').doc('ב').collection('records'))).toBe(0);
    expect(await count(center.collection('certificates'))).toBe(0);
    expect(await count(center.collection('certificates').doc('א__76').collection('versions'))).toBe(0);
    expect(await count(center.collection('farmer_events'))).toBe(0);
    expect((await center.collection('farmers').doc('א').get()).data().certificateProfile.nextNumber).toBe(77);
    expect((await center.collection('config').doc('global').get()).exists).toBe(true);
    expect((await center.collection('users').doc('a@x').get()).exists).toBe(true);
    expect(await count(db.collection('centers').doc(OTHER).collection('farmers').doc('ג').collection('records'))).toBe(1);
  });

  it('skipBackupCheck allows execute without a backup', async () => {
    const out = await resetSeason(db, C, { execute: true, skipBackupCheck: true, now: NOW });
    expect(out.executed).toBe(true);
    expect(await count(center.collection('certificates'))).toBe(0);
  });

  it('farmer scope throws for an unknown farmer (dry run too)', async () => {
    await expect(resetSeason(db, C, { farmer: 'אין', now: NOW })).rejects.toThrow(/not found/);
  });

  it('farmer scope clears only that farmer (records, audit, its certificates) and leaves events and others', async () => {
    const dry = await resetSeason(db, C, { farmer: 'א', now: NOW });
    expect(dry).toEqual({ executed: false, farmer: 'א', totalRecords: 2, farmers: { 'א': { records: 2, audit: 1 } },
      certificates: 1, certificateVersions: 2, farmerEvents: 0 });
    await resetSeason(db, C, { farmer: 'א', execute: true, skipBackupCheck: true, now: NOW });
    expect(await count(center.collection('farmers').doc('א').collection('records'))).toBe(0);
    expect(await count(center.collection('farmers').doc('א').collection('audit'))).toBe(0);
    expect(await count(center.collection('certificates'))).toBe(0);
    expect(await count(center.collection('farmers').doc('ב').collection('records'))).toBe(1);
    expect(await count(center.collection('farmer_events'))).toBe(1);
    expect((await center.collection('farmers').doc('א').get()).data().certificateProfile.nextNumber).toBe(77);
  });
});
