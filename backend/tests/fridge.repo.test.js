import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';

if (!getApps().length) initializeApp({ projectId: 'demo-tsuber' });
const db = getFirestore();
const require = createRequire(import.meta.url);
const { FirestoreFridgeRepository } = require('../repositories/FirestoreFridgeRepository');
const { FridgeError } = require('../services/fridgeCore');

const C = 'fridgerepo';
const center = db.collection('centers').doc(C);
const room = center.collection('fridge').doc('main');
const repo = new FirestoreFridgeRepository(db, C);

beforeEach(async () => { await db.recursiveDelete(center); });
afterAll(async () => { await Promise.all(getApps().map(a => deleteApp(a))); });

describe('FirestoreFridgeRepository', () => {
  it('getRoom on a missing doc is empty', async () => {
    expect(await repo.getRoom('main')).toEqual({ cells: {}, updatedAt: null, updatedBy: null });
  });

  it('place → move → clear writes the doc and one log entry each', async () => {
    await repo.applyOp('main', { op: 'place', slot: 'A1', farmer: 'א', palletNumber: 4 }, 'a@x');
    await repo.applyOp('main', { op: 'move', from: 'A1', to: 'B2' }, 'b@x');
    const afterMove = await repo.getRoom('main');
    expect(Object.keys(afterMove.cells)).toEqual(['B2']);
    expect(afterMove.cells.B2).toMatchObject({ farmer: 'א', palletNumber: 4, placedBy: 'a@x' });
    expect(afterMove.updatedBy).toBe('b@x');
    await repo.applyOp('main', { op: 'clear', slot: 'B2' }, 'a@x');
    expect((await repo.getRoom('main')).cells).toEqual({});
    const log = (await room.collection('log').orderBy('at').get()).docs.map(d => d.data().op);
    expect(log.sort()).toEqual(['clear', 'move', 'place']);
  });

  it('a refused op writes nothing', async () => {
    await expect(repo.applyOp('main', { op: 'clear', slot: 'A1' }, 'a@x')).rejects.toBeInstanceOf(FridgeError);
    expect((await room.get()).exists).toBe(false);
    expect((await room.collection('log').get()).size).toBe(0);
  });

  it('two concurrent places into one slot: exactly one wins', async () => {
    const results = await Promise.allSettled([
      repo.applyOp('main', { op: 'place', slot: 'C3', farmer: 'א', palletNumber: 1 }, 'a@x'),
      repo.applyOp('main', { op: 'place', slot: 'C3', farmer: 'ב', palletNumber: 2 }, 'b@x'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected');
    expect(rejected.reason.code).toBe('SLOT_TAKEN');
    expect(Object.keys((await repo.getRoom('main')).cells)).toEqual(['C3']);
    expect((await room.collection('log').get()).size).toBe(1);
  });

  it('one pallet placed into two slots concurrently: exactly one wins', async () => {
    const results = await Promise.allSettled([
      repo.applyOp('main', { op: 'place', slot: 'A1', farmer: 'א', palletNumber: 7 }, 'a@x'),
      repo.applyOp('main', { op: 'place', slot: 'E8', farmer: 'א', palletNumber: 7 }, 'b@x'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason.code).toBe('ALREADY_PLACED');
    expect(Object.keys((await repo.getRoom('main')).cells)).toHaveLength(1);
  });

  it('clearFarmer removes only that farmer', async () => {
    await repo.applyOp('main', { op: 'place', slot: 'A1', farmer: 'א', palletNumber: 1 }, 'a@x');
    await repo.applyOp('main', { op: 'place', slot: 'A2', farmer: 'א', palletNumber: 2 }, 'a@x');
    await repo.applyOp('main', { op: 'place', slot: 'A3', farmer: 'ב', palletNumber: 1 }, 'a@x');
    expect(await repo.clearFarmer('main', 'א')).toBe(2);
    expect(Object.keys((await repo.getRoom('main')).cells)).toEqual(['A3']);
    expect(await repo.clearFarmer('main', 'ג')).toBe(0);
  });
});
