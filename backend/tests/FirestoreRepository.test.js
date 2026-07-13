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
