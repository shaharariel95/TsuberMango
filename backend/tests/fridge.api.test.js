import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { clearCollection, tokenFor, makeApi } from './helpers/apiHarness.js';

const CENTER = 'fridgeapi';
const FARMER = 'חקלאי-מקרר';
const OTHER = 'חקלאי-שני';
const USER = 'fridge-user@test.local';
const STRANGER = 'fridge-stranger@test.local';

process.env.CENTER_ID = CENTER;
process.env.FRONT_CORS = 'http://localhost:5173';
if (!getApps().length) initializeApp({ projectId: 'demo-tsuber' });
const db = getFirestore();
const { app } = await import('../app.js');

const center = db.collection('centers').doc(CENTER);
const records = (f) => center.collection('farmers').doc(f).collection('records');
const room = center.collection('fridge').doc('main');
const tokens = {};
const api = makeApi(app, tokens);

async function addRecord(farmer, palletNumber, o = {}) {
  const ref = await records(farmer).add({ palletNumber, kind: 'שלי', size: '15', boxes: 40, weight: 300, sent: false,
    mark: false, gidon: false, cardId: '', harvestDate: '2027-05-01', shipmentDate: '', destination: '', editedBy: '', editedAt: '', ...o });
  return ref.id;
}
const place = (slot, palletNumber, farmer = FARMER) => api('post', '/api/fridge/main/ops', 'user').send({ op: 'place', slot, farmer, palletNumber });

beforeAll(async () => {
  await center.collection('config').doc('global').set({ kinds: ['שלי'], sizes: ['15'], destinations: [],
    farmers: [{ name: FARMER, allowGidon: false }, { name: OTHER, allowGidon: false }], farmerConfigs: {} });
  await center.collection('users').doc(USER).set({ role: 'user' });
  tokens.user = await tokenFor(USER, { centers: [CENTER] });
  tokens.stranger = await tokenFor(STRANGER, { centers: ['someone-else'] });
});
afterAll(async () => { await Promise.all(getApps().map(a => deleteApp(a))); });
beforeEach(async () => {
  await db.recursiveDelete(room);
  await clearCollection(records(FARMER));
  await clearCollection(records(OTHER));
});

describe('auth', () => {
  it('401 without a token, 403 without the center claim', async () => {
    expect((await api('get', '/api/fridge/main', 'none')).status).toBe(401);
    expect((await api('get', '/api/fridge/main', 'stranger')).status).toBe(403);
  });
});

describe('place / move / clear', () => {
  it('a regular user can place, move and clear; each returns the room with summaries', async () => {
    await addRecord(FARMER, 12);
    const p = await place('B3', 12);
    expect(p.status).toBe(200);
    expect(p.body.cells.B3).toMatchObject({ farmer: FARMER, palletNumber: 12, placedBy: USER });
    expect(p.body.pallets[`${FARMER}__12`]).toMatchObject({ status: 'ok', boxes: 40 });

    const m = await api('post', '/api/fridge/main/ops', 'user').send({ op: 'move', from: 'B3', to: 'E8' });
    expect(m.status).toBe(200);
    expect(Object.keys(m.body.cells)).toEqual(['E8']);

    const c = await api('post', '/api/fridge/main/ops', 'user').send({ op: 'clear', slot: 'E8' });
    expect(c.status).toBe(200);
    expect(c.body.cells).toEqual({});
    expect((await room.collection('log').get()).size).toBe(3);
  });

  it('string pallet number from the client is stored as the record value and still collides', async () => {
    await addRecord(FARMER, 12);
    const p = await place('A1', '12');
    expect(p.body.cells.A1.palletNumber).toBe(12);
    const again = await place('A2', 12);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_PLACED');
  });

  it('ALREADY_PLACED message names the slot', async () => {
    await addRecord(FARMER, 5);
    await place('C4', 5);
    const res = await place('D1', 5);
    expect(res.body).toMatchObject({ code: 'ALREADY_PLACED', slot: 'C4', error: 'המשטח כבר במקרר בתא C4' });
  });

  it('SLOT_TAKEN, bad slot, bad op, clear on empty', async () => {
    await addRecord(FARMER, 1);
    await addRecord(OTHER, 1);
    await place('A1', 1);
    const taken = await place('A1', 1, OTHER);
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ code: 'SLOT_TAKEN', error: 'התא תפוס' });
    expect((await place('A9', 1, OTHER)).status).toBe(400);
    expect((await api('post', '/api/fridge/main/ops', 'user').send({ op: 'swap' })).status).toBe(400);
    const empty = await api('post', '/api/fridge/main/ops', 'user').send({ op: 'clear', slot: 'E5' });
    expect(empty.status).toBe(409);
    expect(empty.body.code).toBe('SLOT_EMPTY');
  });

  it('place refuses unknown farmer, missing pallet, fully sent pallet; marked is fine', async () => {
    expect((await place('A1', 1, 'לא-קיים')).body.code).toBe('UNKNOWN_FARMER');
    const missing = await place('A1', 999);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    await addRecord(FARMER, 20, { sent: true, cardId: 51 });
    const sent = await place('A1', 20);
    expect(sent.status).toBe(409);
    expect(sent.body.code).toBe('ALREADY_SENT');
    await addRecord(FARMER, 21, { mark: true });
    expect((await place('A1', 21)).status).toBe(200);
    expect((await room.get()).data().cells.A1.palletNumber).toBe(21);
  });

  it('concurrent places into one slot over HTTP: one 200, one 409', async () => {
    await addRecord(FARMER, 1);
    await addRecord(FARMER, 2);
    const [a, b] = await Promise.all([place('C3', 1), place('C3', 2)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe('summaries follow the live records', () => {
  it('sent, partly sent, deleted, renumbered', async () => {
    const one = await addRecord(FARMER, 1);
    const twoA = await addRecord(FARMER, 2);
    await addRecord(FARMER, 2, { kind: 'קיט' });
    const three = await addRecord(FARMER, 3);
    const four = await addRecord(FARMER, 4);
    for (const [slot, n] of [['A1', 1], ['A2', 2], ['A3', 3], ['A4', 4]]) expect((await place(slot, n)).status).toBe(200);

    await records(FARMER).doc(one).update({ sent: true, cardId: 60 });
    await records(FARMER).doc(twoA).update({ sent: true });
    await records(FARMER).doc(three).update({ deleted: true, deletedBy: USER, deletedAt: '2027-05-02T00:00:00Z' });
    await records(FARMER).doc(four).update({ palletNumber: 44 });

    const res = await api('get', '/api/fridge/main', 'user');
    const s = (n) => res.body.pallets[`${FARMER}__${n}`].status;
    expect([s(1), s(2), s(3), s(4)]).toEqual(['sent', 'partly_sent', 'deleted', 'missing']);
    expect([...res.body.pallets[`${FARMER}__2`].kinds].sort()).toEqual(["שלי", "קיט"].sort());
  });
});
