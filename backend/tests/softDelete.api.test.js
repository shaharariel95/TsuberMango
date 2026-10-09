import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import admin from 'firebase-admin';
import { clearCollection, tokenFor, waitFor, makeApi } from './helpers/apiHarness.js';

const CENTER = 'softdel';
const FARMER = 'חקלאי-מחיקה';
const ADMIN = 'sd-admin@test.local';
const USER = 'sd-user@test.local';

process.env.CENTER_ID = CENTER;
process.env.FRONT_CORS = 'http://localhost:5173';
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
const db = admin.firestore();
const { app } = await import('../app.js');

const center = db.collection('centers').doc(CENTER);
const farmerDoc = center.collection('farmers').doc(FARMER);
const tokens = {};
const api = makeApi(app, tokens);
const enc = encodeURIComponent;
const profile = { headerLines: ['צברי נורית וגבריאל', "משק מס' 10", 'חצבה', 'נייד', 'עוסק'], driverName: 'אדם', nextNumber: 51466 };

async function addRecord(palletNumber, o = {}) {
  const ref = await farmerDoc.collection('records').add({ palletNumber, kind: 'שלי', size: '15', boxes: 120, weight: 753,
    destination: 'שיווק האיחוד', shipmentDate: '2026-12-01', harvestDate: '2026-11-30', cardId: '', sent: false,
    mark: true, gidon: false, editedBy: '', editedAt: '', ...o });
  return ref.id;
}

beforeAll(async () => {
  await center.collection('config').doc('global').set({ kinds: ['שלי'], sizes: ['15'], destinations: ['שיווק האיחוד'],
    farmers: [{ name: FARMER, allowGidon: false }], farmerConfigs: {} });
  await center.collection('users').doc(ADMIN).set({ role: 'admin' });
  await center.collection('users').doc(USER).set({ role: 'user' });
  tokens.admin = await tokenFor(ADMIN, { centers: [CENTER] });
  tokens.user = await tokenFor(USER, { centers: [CENTER] });
});
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });
beforeEach(async () => {
  await db.recursiveDelete(center.collection('certificates'));
  await clearCollection(farmerDoc.collection('records'));
  await clearCollection(farmerDoc.collection('audit'));
  await farmerDoc.set({ certificateProfile: profile });
});

describe('soft delete', () => {
  it('a user can delete an unsent pallet; reads, by-pallet and export no longer see it; audit + event written', async () => {
    const id = await addRecord(501);
    const res = await api('delete', `/api/farmers/${enc(FARMER)}/records/${id}`, 'user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id, deleted: true });
    const list = await api('get', `/api/farmers/${enc(FARMER)}/records`);
    expect(JSON.stringify(list.body)).not.toContain(id);
    const byPallet = await api('get', `/api/farmers/${enc(FARMER)}/records/pallet/501`);
    expect(JSON.stringify(byPallet.body)).not.toContain(id);
    const exp = await api('get', '/api/admin/export/records');
    expect(exp.body.farmers[FARMER].map(r => r.id)).not.toContain(id);
    const stored = (await farmerDoc.collection('records').doc(id).get()).data();
    expect(stored).toMatchObject({ deleted: true, deletedBy: USER });
    const audit = await waitFor(async () => {
      const s = await farmerDoc.collection('audit').where('recordId', '==', id).get();
      return s.empty ? null : s;
    });
    expect(audit.docs.map(d => d.data().action)).toContain('מחיקה');
    const evt = await waitFor(async () => {
      const d = (await center.collection('farmer_events').doc(FARMER).get()).data();
      return d?.type === 'bulk_update' && d.pallets.some(p => p.id === id && p.deleted === true) ? d : null;
    });
    expect(evt).toBeTruthy();
  });

  it('409s a sent pallet and a pallet with a cardId; 404s a missing or already-deleted id', async () => {
    const sent = await addRecord(502, { sent: true });
    const carded = await addRecord(503, { cardId: 12 });
    expect((await api('delete', `/api/farmers/${enc(FARMER)}/records/${sent}`)).status).toBe(409);
    expect((await api('delete', `/api/farmers/${enc(FARMER)}/records/${carded}`)).status).toBe(409);
    expect((await api('delete', `/api/farmers/${enc(FARMER)}/records/nope`)).status).toBe(404);
    const gone = await addRecord(504);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${gone}`);
    expect((await api('delete', `/api/farmers/${enc(FARMER)}/records/${gone}`)).status).toBe(404);
  });

  it('editing a deleted (or missing) pallet 404s and does not resurrect it', async () => {
    const id = await addRecord(505);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${id}`);
    const body = { harvestDate: '2026-11-30', palletNumber: 505, boxes: 10, kind: 'שלי', size: '15' };
    expect((await api('put', `/api/farmers/${enc(FARMER)}/records/${id}`).send(body)).status).toBe(404);
    expect((await farmerDoc.collection('records').doc(id).get()).data().deleted).toBe(true);
    expect((await api('put', `/api/farmers/${enc(FARMER)}/records/does-not-exist`).send(body)).status).toBe(404);
    expect((await farmerDoc.collection('records').doc('does-not-exist').get()).exists).toBe(false);
  });

  it('a deleted pallet cannot be put on a certificate', async () => {
    const id = await addRecord(506);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${id}`);
    expect((await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] })).status).toBe(404);
    expect((await api('post', '/api/certificates/preview').send({ farmer: FARMER, recordIds: [id] })).status).toBe(404);
  });
});

describe('restore (admin)', () => {
  it('lists deleted pallets newest first and restores one; audit + event written', async () => {
    const a = await addRecord(511);
    const b = await addRecord(512);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${a}`);
    await api('delete', `/api/farmers/${enc(FARMER)}/records/${b}`);
    const list = await api('get', `/api/admin/farmers/${enc(FARMER)}/deleted-records`);
    expect(list.status).toBe(200);
    const ids = list.body.records.map(r => r.id);
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(a));
    const res = await api('post', `/api/admin/farmers/${enc(FARMER)}/records/${a}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.record).toMatchObject({ id: a, palletNumber: 511 });
    expect(res.body.record.deleted).toBeUndefined();
    const stored = (await farmerDoc.collection('records').doc(a).get()).data();
    expect(stored.deleted).toBeUndefined();
    expect(stored.deletedBy).toBeUndefined();
    const listed = await api('get', `/api/farmers/${enc(FARMER)}/records`);
    expect(JSON.stringify(listed.body)).toContain(a);
    const audit = await waitFor(async () => {
      const s = await farmerDoc.collection('audit').where('recordId', '==', a).get();
      return s.docs.some(d => d.data().action === 'שחזור') ? s : null;
    });
    expect(audit.docs.map(d => d.data().action)).toContain('שחזור');
    const evt = await waitFor(async () => {
      const d = (await center.collection('farmer_events').doc(FARMER).get()).data();
      return d?.type === 'bulk_update' && d.pallets.some(p => p.id === a && p.palletNumber == 511 && !p.deleted) ? d : null;
    });
    expect(evt).toBeTruthy();
  });

  it('404s restoring a live pallet; 403s a non-admin', async () => {
    const live = await addRecord(513);
    expect((await api('post', `/api/admin/farmers/${enc(FARMER)}/records/${live}/restore`)).status).toBe(404);
    expect((await api('get', `/api/admin/farmers/${enc(FARMER)}/deleted-records`, 'user')).status).toBe(403);
    expect((await api('post', `/api/admin/farmers/${enc(FARMER)}/records/${live}/restore`, 'user')).status).toBe(403);
  });
});
