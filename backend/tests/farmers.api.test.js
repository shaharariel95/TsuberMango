import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import admin from 'firebase-admin';
import { tokenFor, makeApi } from './helpers/apiHarness.js';

const CENTER = 'farmersapi';
const ADMIN = 'farmers-admin@test.local';
const USER = 'farmers-user@test.local';
const KEPT = 'חקלאי-קיים';

process.env.CENTER_ID = CENTER;
process.env.FRONT_CORS = 'http://localhost:5173';
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
const db = admin.firestore();
const { app } = await import('../app.js');

const center = db.collection('centers').doc(CENTER);
const configRef = center.collection('config').doc('global');
const tokens = {};
const api = makeApi(app, tokens);
const enc = encodeURIComponent;
const farmers = async () => (await configRef.get()).data().farmers;

beforeAll(async () => {
  await center.collection('users').doc(ADMIN).set({ role: 'admin' });
  await center.collection('users').doc(USER).set({ role: 'user' });
  tokens.admin = await tokenFor(ADMIN, { centers: [CENTER] });
  tokens.user = await tokenFor(USER, { centers: [CENTER] });
});
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });
beforeEach(async () => {
  await configRef.set({ kinds: ['קיט'], sizes: ['L'], destinations: ['יעד'], farmers: [{ name: KEPT, allowGidon: false }] });
});

describe('POST /api/admin/farmers', () => {
  it('adds a trimmed farmer (201) and it can take intake at once', async () => {
    const res = await api('post', '/api/admin/farmers').send({ name: '  חקלאי-חדש  ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ name: 'חקלאי-חדש', restored: false });
    expect(await farmers()).toEqual([{ name: KEPT, allowGidon: false }, { name: 'חקלאי-חדש', allowGidon: false }]);
    const intake = await api('post', '/api/records').send({ farmer: 'חקלאי-חדש', harvestDate: '2026-10-09',
      palletNumber: 1, boxes: 40, kind: 'קיט', size: 'L' });
    expect(intake.status).toBe(201);
  });
  it('409s a duplicate active farmer, including a whitespace-only difference', async () => {
    const res = await api('post', '/api/admin/farmers').send({ name: ` ${KEPT} ` });
    expect(res.status).toBe(409);
    expect(await farmers()).toHaveLength(1);
  });
  it('restores an archived farmer with the same name (200)', async () => {
    await configRef.set({ farmers: [{ name: KEPT, allowGidon: true, archived: true }] }, { merge: true });
    const res = await api('post', '/api/admin/farmers').send({ name: KEPT });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: KEPT, restored: true });
    expect(await farmers()).toEqual([{ name: KEPT, allowGidon: true }]);
  });
  it.each([[''], ['   '], ['a/b'], ['.'], ['..'], ['__x__'], ['א'.repeat(51)], [42]])('400s an invalid name %j', async (name) => {
    const res = await api('post', '/api/admin/farmers').send({ name });
    expect(res.status).toBe(400);
    expect(await farmers()).toHaveLength(1);
  });
  it('403s a non-admin', async () => {
    expect((await api('post', '/api/admin/farmers', 'user').send({ name: 'x' })).status).toBe(403);
  });
});

describe('DELETE /api/admin/farmers/:name (hide)', () => {
  it('archives the farmer, keeps its records, and the season export still includes it', async () => {
    const recs = center.collection('farmers').doc(KEPT).collection('records');
    await recs.add({ palletNumber: 7, boxes: 1 });
    const res = await api('delete', `/api/admin/farmers/${enc(KEPT)}`);
    expect(res.status).toBe(200);
    expect(await farmers()).toEqual([{ name: KEPT, allowGidon: false, archived: true }]);
    expect((await recs.get()).size).toBeGreaterThan(0);
    const exp = await api('get', '/api/admin/export/records');
    expect(Object.keys(exp.body.farmers)).toContain(KEPT);
  });
  it('404s an unknown farmer', async () => {
    expect((await api('delete', `/api/admin/farmers/${enc('אין-כזה')}`)).status).toBe(404);
  });
  it('403s a non-admin', async () => {
    expect((await api('delete', `/api/admin/farmers/${enc(KEPT)}`, 'user')).status).toBe(403);
  });
});

describe('PATCH /api/admin/farmers/:name', () => {
  it('sets allowGidon', async () => {
    const res = await api('patch', `/api/admin/farmers/${enc(KEPT)}`).send({ allowGidon: true });
    expect(res.status).toBe(200);
    expect(await farmers()).toEqual([{ name: KEPT, allowGidon: true }]);
  });
  it('400s a non-boolean and 404s an unknown farmer', async () => {
    expect((await api('patch', `/api/admin/farmers/${enc(KEPT)}`).send({ allowGidon: 'yes' })).status).toBe(400);
    expect((await api('patch', `/api/admin/farmers/${enc('אין-כזה')}`).send({ allowGidon: true })).status).toBe(404);
  });
});

describe('POST /api/admin/config no longer owns farmers', () => {
  it('a stale farmers array in the body leaves the stored farmers untouched', async () => {
    await api('post', '/api/admin/farmers').send({ name: 'נוסף-בטאב-אחר' });
    const res = await api('post', '/api/admin/config').send({
      kinds: ['קיט', 'זן-חדש'], sizes: ['L'], destinations: ['יעד'], farmers: [{ name: KEPT, allowGidon: false }],
    });
    expect(res.status).toBe(200);
    const cfg = (await configRef.get()).data();
    expect(cfg.kinds).toEqual(['קיט', 'זן-חדש']);
    expect(cfg.farmers.map(f => f.name)).toEqual([KEPT, 'נוסף-בטאב-אחר']);
  });
});
