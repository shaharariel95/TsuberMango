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
