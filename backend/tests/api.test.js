// HTTP-level tests for the Express app against the Firebase auth + Firestore emulators.
// Real ID tokens are minted by the auth emulator, so the full middleware chain
// (verifyFirebaseToken → ensureCenterAccess → ensureAdmin) runs unmocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import admin from 'firebase-admin';
import request from 'supertest';

const CENTER = 'apitest';
const FARMER = 'חקלאי-בדיקה';
const ADMIN = 'admin@test.local';
const USER = 'user@test.local';
const OUTSIDER = 'outsider@test.local';

// Pin env before the app (and config/center.js) load.
process.env.CENTER_ID = CENTER;
process.env.FRONT_CORS = 'http://localhost:5173';
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
const db = admin.firestore();
const { app } = await import('../app.js');
const shippingLabelsService = (await import('../services/shippingLabelsService.js')).default;

const center = db.collection('centers').doc(CENTER);
const farmerDoc = center.collection('farmers').doc(FARMER);
const tokens = {};

async function clearCollection(ref) {
  const snap = await ref.get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
}

// Create an auth-emulator user (optionally pre-stamped with the centers claim) and
// exchange its password for a real emulator ID token.
async function tokenFor(email, { centers = [CENTER] } = {}) {
  const password = 'secret123';
  let user;
  try { user = await admin.auth().getUserByEmail(email); }
  catch { user = await admin.auth().createUser({ email, password }); }
  await admin.auth().setCustomUserClaims(user.uid, centers ? { centers } : null);
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const res = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) }
  );
  const body = await res.json();
  if (!body.idToken) throw new Error(`emulator sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.idToken;
}

const api = (method, url, who = 'admin') => {
  const req = request(app)[method](url);
  return tokens[who] ? req.set('Authorization', `Bearer ${tokens[who]}`) : req;
};

const pallet = (overrides = {}) => ({
  farmer: FARMER, harvestDate: '2026-10-08', palletNumber: 1, boxes: 40,
  kind: 'קיט', size: 'L', ...overrides,
});

const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise(r => setTimeout(r, 100));
  }
};

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

afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });

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
    const u = await admin.auth().getUserByEmail('newcomer@test.local');
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

  it('updatemany rejects a pallet without shipment date or weight (blocks "apply to all" before weighing)', async () => {
    const records = (await api('get', `/api/farmers/${enc}/records`)).body.data;
    const unweighed = records.find(r => r.id !== id);
    const res = await api('put', `/api/farmers/${enc}/records/updatemany`).send([
      { ...unweighed, shipmentDate: '2026-10-09' },
    ]);
    expect(res.status).toBe(400);
  });

  it('stamping a certificate via updatemany sets cardId + sent and emits a bulk event', async () => {
    const rec = (await api('get', `/api/farmers/${enc}/records/pallet/1`)).body.data[0];
    const res = await api('put', `/api/farmers/${enc}/records/updatemany`).send([
      { ...rec, shipmentDate: '2026-10-09', cardId: 1001, sent: true },
    ]);
    expect(res.status).toBe(200);
    const data = (await farmerDoc.collection('records').doc(id).get()).data();
    expect(data).toMatchObject({ cardId: 1001, sent: true, shipmentDate: '2026-10-09', mark: true });

    const evt = await waitFor(async () => {
      const s = await center.collection('farmer_events').doc(FARMER).get();
      return s.data()?.type === 'bulk_update' ? s.data() : null;
    });
    expect(evt.pallets[0]).toMatchObject({ id, cardId: 1001, sent: true });
  });

  it('resetPallets clears the sent flag', async () => {
    const res = await api('put', `/api/farmers/${enc}/records/resetPallets`).send({ palletIds: [id] });
    expect(res.status).toBe(200);
    const data = (await farmerDoc.collection('records').doc(id).get()).data();
    expect(data.sent).toBe(false);
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
  it('a farmer added through config can take intake immediately', async () => {
    const cfg = (await center.collection('config').doc('global').get()).data();
    const res = await api('post', '/api/admin/config').send({
      ...cfg, farmers: [...cfg.farmers, { name: 'חקלאי-חדש', allowGidon: false }],
    });
    expect(res.status).toBe(200);

    const intake = await api('post', '/api/records').send(pallet({ farmer: 'חקלאי-חדש' }));
    expect(intake.status).toBe(201);
  });
});

describe('Google Sheets is unreachable from the emulator stack', () => {
  it('certificate creation fails loudly instead of writing a real spreadsheet', async () => {
    const res = await api('post', '/api/shipping/newlabel').send({ farmer: FARMER, pallets: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Google Sheets access is disabled/);
  });

  it('admin create-sheet fails loudly instead of touching the real farmers spreadsheet', async () => {
    const res = await api('post', '/api/admin/create-sheet').send({ name: 'x' });
    expect(res.status).toBe(500);
    expect(res.body.details).toMatch(/Google Sheets access is disabled/);
  });

  it('an unknown farmer has no label spreadsheet (no silent fallback to Tsuberi)', () => {
    expect(() => shippingLabelsService.getSpreadsheetIdByFarmer('לא-קיים'))
      .toThrow(/No shipping-label spreadsheet configured/);
  });
});
