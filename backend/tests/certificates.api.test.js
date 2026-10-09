import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import admin from 'firebase-admin';
import { clearCollection, tokenFor, waitFor, makeApi } from './helpers/apiHarness.js';

const CENTER = 'certapi';
const FARMER = 'חקלאי-תעודה';
const ADMIN = 'cert-admin@test.local';
const USER = 'cert-user@test.local';

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
  await farmerDoc.set({ certificateProfile: profile });
});

describe('issue', () => {
  it('a regular user can preview and issue; pallets are stamped; event + audit emitted', async () => {
    const ids = [await addRecord(421), await addRecord(422)];
    const pv = await api('post', '/api/certificates/preview', 'user').send({ farmer: FARMER, recordIds: ids });
    expect(pv.status).toBe(200);
    expect(pv.body).toMatchObject({ destination: 'שיווק האיחוד', shipmentDate: '2026-12-01', chunks: [{ rows: 2, pallets: 2 }] });

    const res = await api('post', '/api/certificates', 'user').send({ farmer: FARMER, recordIds: ids });
    expect(res.status).toBe(201);
    expect(res.body.certificates).toHaveLength(1);
    expect(res.body.certificates[0]).toMatchObject({ id: `${FARMER}__51466`, number: 51466 });
    expect((await farmerDoc.collection('records').doc(ids[0]).get()).data()).toMatchObject({ cardId: 51466, sent: true, mark: false, editedBy: USER });

    const evt = await waitFor(async () => {
      const s = await center.collection('farmer_events').doc(FARMER).get();
      return s.data()?.type === 'bulk_update' ? s.data() : null;
    });
    expect(evt.pallets.map(p => p.id).sort()).toEqual([...ids].sort());
    const audit = await waitFor(async () => {
      const s = await farmerDoc.collection('audit').where('recordId', '==', ids[0]).get();
      return s.empty ? null : s.docs[0].data();
    });
    expect(audit.action).toBe('הפקת תעודה 51466');
  });

  it('14 pallets → two certificates 13 + 1', async () => {
    const ids = [];
    for (let p = 1; p <= 14; p++) ids.push(await addRecord(p));
    const pv = await api('post', '/api/certificates/preview').send({ farmer: FARMER, recordIds: ids });
    expect(pv.body.chunks.map(c => c.rows)).toEqual([13, 1]);
    const res = await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: ids });
    expect(res.body.certificates.map(c => c.number)).toEqual([51466, 51467]);
    // One realtime event per request: the (final) event carries every pallet of both certificates.
    const evt = await waitFor(async () => {
      const snap = await center.collection('farmer_events').doc(FARMER).get();
      return snap.data()?.type === 'bulk_update' && snap.data().pallets.length === 14 ? snap.data() : null;
    });
    expect(evt).toBeTruthy();
    expect(evt.pallets.map(p => p.id).sort()).toEqual([...ids].sort());
    expect(new Set(evt.pallets.map(p => p.cardId))).toEqual(new Set([51466, 51467]));
  });

  it('mixed destination → 400 Hebrew', async () => {
    const ids = [await addRecord(1), await addRecord(2, { destination: 'אחר' })];
    const res = await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: ids });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch('יעדים שונים');
  });

  it('already certified → 409 naming the certificate', async () => {
    const id = await addRecord(421);
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] });
    const res = await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('משטח 421 כבר בתעודה 51466 — הסר אותו מהתעודה כדי להפיק חדשה');
    expect(res.body.conflicts[0]).toMatchObject({ certificateId: `${FARMER}__51466` });
  });

  it('no profile → 400 pointing to settings, nothing stamped', async () => {
    await farmerDoc.set({});
    const id = await addRecord(1);
    const res = await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('חסרים פרטי תעודה לחקלאי — הגדר בהגדרות');
    expect((await farmerDoc.collection('records').doc(id).get()).data().sent).toBe(false);
  });

  it('unknown farmer → 400', async () => {
    const res = await api('post', '/api/certificates').send({ farmer: 'לא-קיים', recordIds: ['x'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown farmer/);
  });

  it('parallel issues over HTTP get distinct numbers', async () => {
    const a = await addRecord(1); const b = await addRecord(2);
    const [r1, r2] = await Promise.all([
      api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [a] }),
      api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [b] }),
    ]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect([r1.body.certificates[0].number, r2.body.certificates[0].number].sort()).toEqual([51466, 51467]);
  });
});

describe('auth and error paths', () => {
  it('401 without a token; 403 for a token without this center', async () => {
    expect((await api('get', `/api/certificates?farmer=${enc(FARMER)}`, 'nobody')).status).toBe(401);
    tokens.outsider = await tokenFor('cert-outsider@test.local', { centers: ['other-center'] });
    expect((await api('get', `/api/certificates?farmer=${enc(FARMER)}`, 'outsider')).status).toBe(403);
  });

  it('preview: 409 already certified, 400 mixed destination, 400 no profile', async () => {
    const id = await addRecord(421);
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] });
    const dup = await api('post', '/api/certificates/preview').send({ farmer: FARMER, recordIds: [id] });
    expect(dup.status).toBe(409);
    expect(dup.body.conflicts[0]).toMatchObject({ certificateId: `${FARMER}__51466` });

    const mixed = [await addRecord(1), await addRecord(2, { destination: 'אחר' })];
    const mx = await api('post', '/api/certificates/preview').send({ farmer: FARMER, recordIds: mixed });
    expect(mx.status).toBe(400);
    expect(mx.body.error).toMatch('יעדים שונים');

    await farmerDoc.set({});
    const np = await api('post', '/api/certificates/preview').send({ farmer: FARMER, recordIds: [mixed[0]] });
    expect(np.status).toBe(400);
    expect(np.body.error).toBe('חסרים פרטי תעודה לחקלאי — הגדר בהגדרות');
  });
});

describe('reprint / remove / reads', () => {
  it('unknown certificate → 404', async () => {
    expect((await api('get', `/api/certificates/${enc('nope__1')}`)).status).toBe(404);
  });

  it('remove-pallet with a record not on the certificate → 400', async () => {
    const a = await addRecord(1); const b = await addRecord(2);
    const issued = (await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [a] })).body.certificates[0];
    const rm = await api('post', `/api/certificates/${enc(issued.id)}/remove-pallet`).send({ recordId: b });
    expect(rm.status).toBe(400);
    expect(rm.body.error).toBe('המשטח אינו בתעודה זו');
  });

  it('reprint after weight edit creates version 2; reads expose history', async () => {
    const id = await addRecord(421);
    const issued = (await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] })).body.certificates[0];
    await farmerDoc.collection('records').doc(id).update({ weight: 700 });
    const rp = await api('post', `/api/certificates/${enc(issued.id)}/reprint`);
    expect(rp.body).toMatchObject({ version: 2, created: true });

    const got = await api('get', `/api/certificates/${enc(issued.id)}`);
    expect(got.body.versions.map(v => v.reason)).toEqual(['issue', 'reprint']);
    const v1 = await api('get', `/api/certificates/${enc(issued.id)}/versions/1`);
    expect(v1.body.snapshot.rows[0].weight).toBe(753);
    expect((await api('get', `/api/certificates/${enc(issued.id)}/versions/9`)).status).toBe(404);
  });

  it('remove-pallet returns the pallet to shipment prep and cancels when empty', async () => {
    const id = await addRecord(421);
    const issued = (await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] })).body.certificates[0];
    const rm = await api('post', `/api/certificates/${enc(issued.id)}/remove-pallet`).send({ recordId: id });
    expect(rm.body).toMatchObject({ version: 2, cancelled: true });
    expect((await farmerDoc.collection('records').doc(id).get()).data()).toMatchObject({ cardId: '', sent: false, mark: true });
    expect((await api('post', `/api/certificates/${enc(issued.id)}/reprint`)).status).toBe(409);
  });

  it('list requires farmer and filters by date range', async () => {
    const a = await addRecord(1, { shipmentDate: '2026-12-01' });
    const b = await addRecord(2, { shipmentDate: '2026-12-05' });
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [a] });
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [b] });
    expect((await api('get', '/api/certificates')).status).toBe(400);
    const all = await api('get', `/api/certificates?farmer=${enc(FARMER)}`);
    expect(all.body.certificates.map(c => c.number)).toEqual([51467, 51466]);
    const ranged = await api('get', `/api/certificates?farmer=${enc(FARMER)}&from=2026-12-02&to=2026-12-31`);
    expect(ranged.body.certificates.map(c => c.number)).toEqual([51467]);
  });
});

describe('admin: certificate profile + export', () => {
  const url = `/api/admin/farmers/${enc(FARMER)}/certificate-profile`;
  it('admin reads and writes the profile; user is forbidden', async () => {
    expect((await api('get', url, 'user')).status).toBe(403);
    const put = await api('put', url).send({ ...profile, nextNumber: 60000 });
    expect(put.status).toBe(200);
    expect((await api('get', url)).body.profile.nextNumber).toBe(60000);
  });
  it('rejects a profile for an unknown farmer', async () => {
    const res = await api('put', `/api/admin/farmers/${enc('לא-קיים')}/certificate-profile`).send(profile);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown farmer/);
  });
  it('validates shape: 5 header lines, integer nextNumber ≥ 1', async () => {
    expect((await api('put', url).send({ ...profile, headerLines: ['a'] })).status).toBe(400);
    expect((await api('put', url).send({ ...profile, nextNumber: 0 })).status).toBe(400);
    expect((await api('put', url).send({ ...profile, nextNumber: 1.5 })).status).toBe(400);
  });
  it('rejects nextNumber ≤ highest issued number', async () => {
    const id = await addRecord(1);
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] }); // issues 51466
    const res = await api('put', url).send({ ...profile, nextNumber: 51466 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch('51466');
  });
  it('season export is admin-only and returns records per farmer', async () => {
    await addRecord(1);
    expect((await api('get', '/api/admin/export/records', 'user')).status).toBe(403);
    const res = await api('get', '/api/admin/export/records');
    expect(res.status).toBe(200);
    expect(res.body.farmers[FARMER]).toHaveLength(1);
  });
});

describe('record paths stay consistent with certificates', () => {
  it('resetPallets on a certified pallet removes it from its certificate', async () => {
    const id = await addRecord(421);
    const issued = (await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] })).body.certificates[0];
    const res = await api('put', `/api/farmers/${enc(FARMER)}/records/resetPallets`).send({ palletIds: [id] });
    expect(res.status).toBe(200);
    expect((await farmerDoc.collection('records').doc(id).get()).data()).toMatchObject({ cardId: '', sent: false });
    const got = await api('get', `/api/certificates/${enc(issued.id)}`);
    expect(got.body.certificate.status).toBe('cancelled');
  });
  it('resetPallets with certified + plain + legacy pallets emits one bulk event with the final state of all', async () => {
    const cert = await addRecord(1);
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [cert] });
    const plain = await addRecord(2, { sent: true });
    const legacy = await addRecord(3, { sent: true, cardId: 999 });
    const res = await api('put', `/api/farmers/${enc(FARMER)}/records/resetPallets`).send({ palletIds: [cert, plain, legacy] });
    expect(res.status).toBe(200);
    const evt = await waitFor(async () => {
      const snap = await center.collection('farmer_events').doc(FARMER).get();
      return snap.data()?.type === 'bulk_update' && snap.data().pallets.length === 3 ? snap.data() : null;
    });
    expect(evt).toBeTruthy();
    const by = Object.fromEntries(evt.pallets.map(p => [p.id, p]));
    expect(by[cert]).toMatchObject({ cardId: '', sent: false, mark: true });
    expect(by[plain]).toMatchObject({ sent: false });
    expect(by[legacy]).toMatchObject({ cardId: '', sent: false });
    expect((await farmerDoc.collection('records').doc(legacy).get()).data()).toMatchObject({ cardId: '', sent: false });
  });
  it('updatemany is gone', async () => {
    expect((await api('put', `/api/farmers/${enc(FARMER)}/records/updatemany`).send([])).status).not.toBe(200);
  });
  it('single-record edit cannot change cardId/sent of a certified pallet', async () => {
    const id = await addRecord(421);
    await api('post', '/api/certificates').send({ farmer: FARMER, recordIds: [id] });
    const res = await api('put', `/api/farmers/${enc(FARMER)}/records/${id}`).send({
      farmer: FARMER, harvestDate: '2026-11-30', palletNumber: 421, boxes: 120, kind: 'שלי', size: '15',
      weight: 760, destination: 'שיווק האיחוד', shipmentDate: '2026-12-01', cardId: '', sent: false, mark: false,
    });
    expect(res.status).toBe(200);
    expect((await farmerDoc.collection('records').doc(id).get()).data()).toMatchObject({ weight: 760, cardId: 51466, sent: true });
  });
  it('the old Sheets label endpoint is gone', async () => {
    expect((await api('post', '/api/shipping/newlabel').send({ farmer: FARMER, pallets: [] })).status).toBe(404);
  });
});
