// HTTP-level tests for the Express app against the Firebase auth + Firestore emulators.
// Real ID tokens are minted by the auth emulator, so the full middleware chain
// (verifyFirebaseToken → ensureCenterAccess → ensureAdmin) runs unmocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { clearCollection, tokenFor as rawTokenFor, waitFor, makeApi } from './helpers/apiHarness.js';

const CENTER = 'apitest';
const FARMER = 'חקלאי-בדיקה';
const ADMIN = 'admin@test.local';
const USER = 'user@test.local';
const OUTSIDER = 'outsider@test.local';

// Pin env before the app (and config/center.js) load.
process.env.CENTER_ID = CENTER;
process.env.FRONT_CORS = 'http://localhost:5173';
if (!getApps().length) initializeApp({ projectId: 'demo-tsuber' });
const db = getFirestore();
const { app } = await import('../app.js');

const center = db.collection('centers').doc(CENTER);
const farmerDoc = center.collection('farmers').doc(FARMER);
const tokens = {};

const tokenFor = (email, o = {}) => rawTokenFor(email, { centers: 'centers' in o ? o.centers : [CENTER] });
const api = makeApi(app, tokens);

const pallet = (overrides = {}) => ({
  farmer: FARMER, harvestDate: '2026-10-08', palletNumber: 1, boxes: 40,
  kind: 'קיט', size: 'L', ...overrides,
});

beforeAll(async () => {
  await clearCollection(farmerDoc.collection('records'));
  await clearCollection(farmerDoc.collection('audit'));
  await clearCollection(center.collection('users'));
  await center.collection('config').doc('global').set({
    kinds: ['קיט'], sizes: ['S', 'M', 'L'], destinations: ['יעד-א', 'יעד-ב'],
    farmers: [{ name: FARMER, allowGidon: false }], farmerConfigs: {},
  });
  await center.collection('users').doc(ADMIN).set({ role: 'admin' });
  await center.collection('users').doc(USER).set({ role: 'user' });
  tokens.admin = await tokenFor(ADMIN);
  tokens.user = await tokenFor(USER);
  tokens.outsider = await tokenFor(OUTSIDER, { centers: ['some-other-center'] });
  tokens.claimless = await tokenFor('newcomer@test.local', { centers: null });
});

afterAll(async () => { await Promise.all(getApps().map(a => deleteApp(a))); });

describe('auth gates', () => {
  it('401s without a token', async () => {
    const res = await api('get', `/api/farmers/${encodeURIComponent(FARMER)}/records`, 'none');
    expect(res.status).toBe(401);
  });

  it('403s a token whose centers claim does not include this center', async () => {
    const res = await api('get', `/api/farmers/${encodeURIComponent(FARMER)}/records`, 'outsider');
    expect(res.status).toBe(403);
  });

  it('/api/auth/me rejects a signed-in user with no users doc', async () => {
    const res = await api('get', '/api/auth/me', 'outsider');
    expect(res.status).toBe(403);
  });

  it('/api/auth/me returns role + centerId for a known user', async () => {
    const res = await api('get', '/api/auth/me', 'user');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: USER, role: 'user', centerId: CENTER });
  });

  it('/api/auth/me self-heals a claimless known user and asks for a token refresh', async () => {
    await center.collection('users').doc('newcomer@test.local').set({ role: 'user' });
    const res = await api('get', '/api/auth/me', 'claimless');
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBe(true);
    const u = await getAuth().getUserByEmail('newcomer@test.local');
    expect(u.customClaims).toEqual({ centers: [CENTER] });
  });

  it('non-admin users are blocked from admin endpoints', async () => {
    const res = await api('get', '/api/admin/users', 'user');
    expect(res.status).toBe(403);
  });
});

describe('season flow: intake → weigh → mark → certificate → sent', () => {
  const enc = encodeURIComponent(FARMER);
  let id;

  it('intake creates a record with ISO harvest date and no weight', async () => {
    const res = await api('post', '/api/records').send(pallet());
    expect(res.status).toBe(201);
    id = res.body.data.id;
    expect(typeof id).toBe('string');

    const snap = await farmerDoc.collection('records').doc(id).get();
    expect(snap.data()).toMatchObject({
      harvestDate: '2026-10-08', palletNumber: 1, boxes: 40, kind: 'קיט', size: 'L',
      sent: false, mark: false, gidon: false, cardId: '', shipmentDate: '', editedBy: ADMIN,
    });
  });

  it('intake writes an audit entry and a realtime event', async () => {
    const audit = await waitFor(async () => {
      const s = await farmerDoc.collection('audit').where('recordId', '==', id).get();
      return s.empty ? null : s.docs[0].data();
    });
    expect(audit).toMatchObject({ action: 'קליטה', editedBy: ADMIN });

    const evt = await waitFor(async () => {
      const s = await center.collection('farmer_events').doc(FARMER).get();
      return s.exists && s.data().pallet?.id === id ? s.data() : null;
    });
    expect(evt).toMatchObject({ type: 'create', updatedBy: ADMIN });
  });

  it('intake ignores a cardId in the body (certificate numbers only come from issuing)', async () => {
    const res = await api('post', '/api/records').send(pallet({ palletNumber: 77, cardId: 555 }));
    expect(res.status).toBe(201);
    expect((await farmerDoc.collection('records').doc(res.body.data.id).get()).data().cardId).toBe('');
    await farmerDoc.collection('records').doc(res.body.data.id).delete();
  });

  it('intake rejects missing required fields with a 400', async () => {
    const res = await api('post', '/api/records').send(pallet({ kind: '', size: '' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields: kind, size/);
  });

  it('intake rejects an unknown farmer with a 400', async () => {
    const res = await api('post', '/api/records').send(pallet({ farmer: 'לא-קיים' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown farmer/);
  });

  it('reads: all records, last pallet, by pallet number', async () => {
    await api('post', '/api/records').send(pallet({ palletNumber: 2, boxes: 30 }));

    const all = await api('get', `/api/farmers/${enc}/records`);
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(2);

    const last = await api('get', `/api/farmers/${enc}/records/lastPallet`);
    expect(last.status).toBe(200);
    expect(Number(last.body.data)).toBe(2);

    const byPallet = await api('get', `/api/farmers/${enc}/records/pallet/1`);
    expect(byPallet.status).toBe(200);
    expect(byPallet.body.data.map(r => r.id)).toEqual([id]);

    const missing = await api('get', `/api/farmers/${enc}/records/pallet/999`);
    expect(missing.status).toBe(404);
  });

  it('weighing via single-record update keeps an empty certificate number empty', async () => {
    const res = await api('put', `/api/farmers/${enc}/records/${id}`).send({
      ...pallet(), weight: 480, destination: 'יעד-א', cardId: 0, sent: false, mark: false,
    });
    expect(res.status).toBe(200);
    const data = (await farmerDoc.collection('records').doc(id).get()).data();
    expect(data).toMatchObject({ weight: 480, destination: 'יעד-א', cardId: '' });
  });

  it('a regular (non-admin) user can also update records', async () => {
    const res = await api('put', `/api/farmers/${enc}/records/${id}`, 'user').send({
      ...pallet(), weight: 481, destination: 'יעד-א',
    });
    expect(res.status).toBe(200);
    const data = (await farmerDoc.collection('records').doc(id).get()).data();
    expect(data.editedBy).toBe(USER);
  });

  it('mark for shipment → listed on the destinations view; unmark → removed', async () => {
    const mark = await api('post', `/api/farmers/${enc}/destinations/toSend`).send([{ id }]);
    expect(mark.status).toBe(200);
    let dest = await api('get', `/api/farmers/${enc}/records/destinations`);
    expect(dest.body.data.map(r => r.id)).toEqual([id]);

    const unmark = await api('post', `/api/farmers/${enc}/destinations/Sent`).send([{ id }]);
    expect(unmark.status).toBe(200);
    dest = await api('get', `/api/farmers/${enc}/records/destinations`);
    expect(dest.body.count).toBe(0);

    await api('post', `/api/farmers/${enc}/destinations/toSend`).send([{ id }]);
  });

  it('shipmentDate bulk update stamps only the date, works on unweighed pallets, audits and emits an event', async () => {
    const records = (await api('get', `/api/farmers/${enc}/records`)).body.data;
    const unweighed = records.find(r => r.id !== id);
    const before = (await farmerDoc.collection('records').doc(unweighed.id).get()).data();

    const res = await api('put', `/api/farmers/${enc}/records/shipmentDate`).send({
      palletIds: [unweighed.id, id], shipmentDate: '2026-10-12',
    });
    expect(res.status).toBe(200);

    const after = (await farmerDoc.collection('records').doc(unweighed.id).get()).data();
    expect(after).toEqual({ ...before, shipmentDate: '2026-10-12', editedBy: ADMIN, editedAt: expect.any(String) });
    expect(after.weight).toEqual(before.weight);
    expect((await farmerDoc.collection('records').doc(id).get()).data().shipmentDate).toBe('2026-10-12');

    const audit = await waitFor(async () => {
      const s = await farmerDoc.collection('audit').where('action', '==', 'עדכון תאריך משלוח').get();
      return s.size >= 2 ? s.docs.map(d => d.data().recordId) : null;
    });
    expect(audit).toEqual(expect.arrayContaining([unweighed.id, id]));

    const evt = await waitFor(async () => {
      const s = await center.collection('farmer_events').doc(FARMER).get();
      return s.data()?.type === 'shipment_date' ? s.data() : null;
    });
    expect(evt).toMatchObject({ updatedBy: ADMIN, shipmentDate: '2026-10-12' });
    expect(evt.palletIds).toEqual(expect.arrayContaining([unweighed.id, id]));
  });

  it('shipmentDate bulk update rejects bad input and unknown farmer/pallets', async () => {
    const url = `/api/farmers/${enc}/records/shipmentDate`;
    for (const body of [
      { palletIds: [id], shipmentDate: '09/10/2026' },
      { palletIds: [id], shipmentDate: '2026-02-31' },
      { palletIds: [id] },
      { palletIds: [], shipmentDate: '2026-10-12' },
      { palletIds: 'x', shipmentDate: '2026-10-12' },
    ]) {
      expect((await api('put', url).send(body)).status, JSON.stringify(body)).toBe(400);
    }
    const unknown = await api('put', `/api/farmers/${encodeURIComponent('לא-קיים')}/records/shipmentDate`)
      .send({ palletIds: [id], shipmentDate: '2026-10-12' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/Unknown farmer/);
    const nope = await api('put', url).send({ palletIds: ['no-such-id'], shipmentDate: '2026-10-12' });
    expect(nope.status).toBe(404);
  });

  it('resetPallets clears the sent flag and emits one bulk event with the new state', async () => {
    await farmerDoc.collection('records').doc(id).update({ sent: true });
    const res = await api('put', `/api/farmers/${enc}/records/resetPallets`).send({ palletIds: [id] });
    expect(res.status).toBe(200);
    expect(res.body.updated).toEqual([expect.objectContaining({ id, sent: false })]);
    const data = (await farmerDoc.collection('records').doc(id).get()).data();
    expect(data.sent).toBe(false);
    const evt = await waitFor(async () => {
      const s = await center.collection('farmer_events').doc(FARMER).get();
      return s.data()?.type === 'bulk_update' ? s.data() : null;
    });
    expect(evt.pallets[0]).toMatchObject({ id, sent: false });
  });

  it('resetPallets on a legacy pallet (cardId without a certificate) clears the cardId too', async () => {
    await farmerDoc.collection('records').doc(id).update({ cardId: 777, sent: true });
    const res = await api('put', `/api/farmers/${enc}/records/resetPallets`).send({ palletIds: [id] });
    expect(res.status).toBe(200);
    expect((await farmerDoc.collection('records').doc(id).get()).data()).toMatchObject({ cardId: '', sent: false });
  });

  it('a legacy cardId (no certificate doc) can be cleared through a single-record edit', async () => {
    await farmerDoc.collection('records').doc(id).update({ cardId: 778, sent: true });
    const res = await api('put', `/api/farmers/${enc}/records/${id}`).send({
      ...pallet(), weight: 481, destination: 'יעד-א', cardId: '', sent: false, mark: false,
    });
    expect(res.status).toBe(200);
    expect((await farmerDoc.collection('records').doc(id).get()).data()).toMatchObject({ cardId: '', sent: false });
  });

  it('bulk mark/unmark/reset reject an unknown farmer with a 400', async () => {
    const bad = encodeURIComponent('לא-קיים');
    for (const [method, url, body] of [
      ['post', `/api/farmers/${bad}/destinations/toSend`, [{ id }]],
      ['post', `/api/farmers/${bad}/destinations/Sent`, [{ id }]],
      ['put', `/api/farmers/${bad}/records/resetPallets`, { palletIds: [id] }],
    ]) {
      const res = await api(method, url).send(body);
      expect(res.status, url).toBe(400);
      expect(res.body.error).toMatch(/Unknown farmer/);
    }
  });

  it('every write left an audit trail', async () => {
    const s = await farmerDoc.collection('audit').where('recordId', '==', id).get();
    const actions = s.docs.map(d => d.data().action);
    expect(actions).toContain('קליטה');
    expect(actions.filter(a => a === 'עדכון').length).toBeGreaterThanOrEqual(3);
  });
});

describe('admin: users', () => {
  it('lists, upserts and deletes users', async () => {
    const add = await api('post', '/api/admin/users').send({ email: 'added@test.local', role: 'user' });
    expect(add.status).toBe(200);
    const list = await api('get', '/api/admin/users');
    expect(list.body.map(u => u.email)).toContain('added@test.local');
    const del = await api('delete', `/api/admin/users/${encodeURIComponent('added@test.local')}`);
    expect(del.status).toBe(200);
    expect((await center.collection('users').doc('added@test.local').get()).exists).toBe(false);
  });

  it('rejects an invalid role', async () => {
    const res = await api('post', '/api/admin/users').send({ email: 'x@test.local', role: 'owner' });
    expect(res.status).toBe(400);
  });

  it('refuses to delete the last admin', async () => {
    const res = await api('delete', `/api/admin/users/${encodeURIComponent(ADMIN)}`);
    expect(res.status).toBe(400);
  });
});

describe('admin: config', () => {
  it('a farmer added through the farmers endpoint can take intake immediately', async () => {
    const res = await api('post', '/api/admin/farmers').send({ name: 'חקלאי-חדש' });
    expect(res.status).toBe(201);

    const intake = await api('post', '/api/records').send(pallet({ farmer: 'חקלאי-חדש' }));
    expect(intake.status).toBe(201);
  });
});

describe('Google Sheets is gone', () => {
  it.each(['create-sheet', 'delete-sheet', 'refresh-cache'])('POST /api/admin/%s no longer exists', async (path) => {
    const res = await api('post', `/api/admin/${path}`).send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('realtime events carry the sending tab id', () => {
  it('stamps updatedByClient from a valid X-Client-Id header', async () => {
    const res = await api('post', '/api/records').set('X-Client-Id', 'tab-123e4567').send(pallet({ palletNumber: 9101 }));
    expect(res.status).toBe(201);
    const evt = await waitFor(async () => {
      const d = (await center.collection('farmer_events').doc(FARMER).get()).data();
      return d?.pallet?.palletNumber == 9101 ? d : null;
    });
    expect(evt.updatedByClient).toBe('tab-123e4567');
  });
  it('ignores a malformed header instead of failing the request', async () => {
    const res = await api('post', '/api/records').set('X-Client-Id', 'x'.repeat(65)).send(pallet({ palletNumber: 9102 }));
    expect(res.status).toBe(201);
    const evt = await waitFor(async () => {
      const d = (await center.collection('farmer_events').doc(FARMER).get()).data();
      return d?.pallet?.palletNumber == 9102 ? d : null;
    });
    expect(evt.updatedByClient).toBeUndefined();
  });
});
