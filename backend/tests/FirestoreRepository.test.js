import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import admin from 'firebase-admin';
import FirestoreRepository from '../repositories/FirestoreRepository.js';

const CENTER = 'test-center';
const FARMER = 'test-farmer';
let db;
let repo;

beforeAll(() => {
  // firebase emulators:exec sets FIRESTORE_EMULATOR_HOST for us.
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'demo-tsuber' });
  }
  db = admin.firestore();
  repo = new FirestoreRepository(db, CENTER);
});

afterAll(async () => {
  await Promise.all(admin.apps.map(app => app.delete()));
});

beforeEach(async () => {
  // Clear the farmer's records + audit between tests.
  for (const col of ['records', 'audit']) {
    const snap = await db.collection('centers').doc(CENTER)
      .collection('farmers').doc(FARMER).collection(col).get();
    await Promise.all(snap.docs.map(d => d.ref.delete()));
  }
});

it('instantiates with an injected db and center id', () => {
  expect(repo.centerId).toBe(CENTER);
  expect(repo.recordsCol(FARMER).path)
    .toBe(`centers/${CENTER}/farmers/${FARMER}/records`);
});

describe('reads', () => {
  it('getRecords returns docs with string id merged in', async () => {
    await db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER)
      .collection('records').add({ palletNumber: '5', kind: 'mango', sent: false });
    const recs = await repo.getRecords(FARMER);
    expect(recs).toHaveLength(1);
    expect(typeof recs[0].id).toBe('string');
    expect(recs[0].palletNumber).toBe('5');
  });

  it('getRecordsByPallet filters by palletNumber (string-compared)', async () => {
    const col = db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).collection('records');
    await col.add({ palletNumber: 5 });
    await col.add({ palletNumber: '7' });
    const hits = await repo.getRecordsByPallet(FARMER, '5');
    expect(hits).toHaveLength(1);
    expect(await repo.getRecordsByPallet(FARMER, '99')).toHaveLength(0);
  });

  it('getLastPallet returns the highest numeric palletNumber, else 0', async () => {
    expect(await repo.getLastPallet(FARMER)).toBe(0);
    const col = db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).collection('records');
    await col.add({ palletNumber: '3' });
    await col.add({ palletNumber: '11' });
    await col.add({ palletNumber: '' });
    expect(await repo.getLastPallet(FARMER)).toBe(11);
  });
});

describe('writes', () => {
  const rec = () => ({ palletNumber: '1', kind: 'mango', size: 'L', boxes: 10, weight: 200, sent: false, gidon: false, mark: false, harvestDate: '2026-07-13', shipmentDate: '', cardId: '', destination: '', editedBy: 'a@b.c', editedAt: '2026-07-13T00:00:00Z' });

  it('appendRecord assigns a string id and stores the object', async () => {
    const out = await repo.appendRecord(FARMER, rec());
    expect(typeof out.id).toBe('string');
    const back = await repo.getRecords(FARMER);
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe(out.id);
    expect(back[0].kind).toBe('mango');
  });

  it('updateRecord overwrites the doc at id', async () => {
    const { id } = await repo.appendRecord(FARMER, rec());
    await repo.updateRecord(FARMER, id, { ...rec(), weight: 999 });
    const back = await repo.getRecords(FARMER);
    expect(back[0].weight).toBe(999);
  });

  it('updateRecords batch-overwrites multiple docs', async () => {
    const a = await repo.appendRecord(FARMER, rec());
    const b = await repo.appendRecord(FARMER, rec());
    const res = await repo.updateRecords(FARMER, [a.id, b.id], [{ ...rec(), destination: 'X' }, { ...rec(), destination: 'Y' }]);
    expect(res.success).toBe(true);
    const back = (await repo.getRecords(FARMER)).sort((x, y) => x.destination.localeCompare(y.destination));
    expect(back.map(r => r.destination)).toEqual(['X', 'Y']);
  });
});

describe('bulk status + audit', () => {
  const rec = (extra) => ({ palletNumber: '1', sent: false, mark: false, ...extra });

  it('updateSentStatus flips sent on the given ids only', async () => {
    const a = await repo.appendRecord(FARMER, rec());
    const b = await repo.appendRecord(FARMER, rec());
    const out = await repo.updateSentStatus(FARMER, [a.id], true);
    expect(out).toEqual([{ id: a.id, sent: true }]);
    const back = await repo.getRecords(FARMER);
    expect(back.find(r => r.id === a.id).sent).toBe(true);
    expect(back.find(r => r.id === b.id).sent).toBe(false);
  });

  it('updateMarkStatus flips mark on the given ids', async () => {
    const a = await repo.appendRecord(FARMER, rec());
    const out = await repo.updateMarkStatus(FARMER, [a.id], true);
    expect(out).toEqual([{ id: a.id, mark: true }]);
    expect((await repo.getRecords(FARMER))[0].mark).toBe(true);
  });

  it('appendAuditLog writes an audit doc', async () => {
    await repo.appendAuditLog(FARMER, { recordId: 'r1', palletNumber: '1', action: 'קליטה', editedBy: 'a@b.c', editedAt: '2026-07-13T00:00:00Z' });
    const snap = await db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).collection('audit').get();
    expect(snap.size).toBe(1);
    expect(snap.docs[0].data().action).toBe('קליטה');
  });
});
