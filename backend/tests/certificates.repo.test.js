import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import admin from 'firebase-admin';
import CertRepoModule from '../repositories/FirestoreCertificateRepository.js';
const { FirestoreCertificateRepository, CertificateError } = CertRepoModule;

const CENTER = 'cert-repo-test';
const FARMER = 'חקלאי-תעודות';
const ACTOR = 'tester@test.local';
let db, repo, records;

const profile = { headerLines: ['צברי', 'משק 10', 'חצבה', 'טל', 'עוסק'], driverName: 'אדם', nextNumber: 51466 };
const recordsCol = () => db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).collection('records');

async function addRecord(palletNumber, o = {}) {
  const ref = await recordsCol().add({ palletNumber, kind: 'שלי', size: '15', boxes: 10, weight: 100,
    destination: 'יעד', shipmentDate: '2026-12-01', harvestDate: '2026-11-30', cardId: '', sent: false, mark: true,
    gidon: false, editedBy: '', editedAt: '', ...o });
  return ref.id;
}

beforeAll(() => {
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
  db = admin.firestore();
  repo = new FirestoreCertificateRepository(db, CENTER);
});
afterAll(async () => { await Promise.all(admin.apps.map(a => a.delete())); });

beforeEach(async () => {
  await db.recursiveDelete(db.collection('centers').doc(CENTER));
  await repo.setProfile(FARMER, profile);
  records = [await addRecord(1), await addRecord(2)];
});

describe('profiles', () => {
  it('round-trips a profile', async () => {
    expect(await repo.getProfile(FARMER)).toEqual(profile);
    expect(await repo.getProfile('nobody')).toBeNull();
  });
});

describe('issue', () => {
  it('creates certificate + version 1, stamps records, bumps nextNumber', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR });
    expect(c).toMatchObject({ id: `${FARMER}__51466`, number: 51466 });
    expect(c.snapshot.rows).toHaveLength(2);
    const r = (await recordsCol().doc(records[0]).get()).data();
    expect(r).toMatchObject({ cardId: 51466, sent: true, mark: false, editedBy: ACTOR });
    expect((await repo.getProfile(FARMER)).nextNumber).toBe(51467);
    const got = await repo.get(c.id);
    expect(got.certificate).toMatchObject({ status: 'issued', currentVersion: 1, palletCount: 2, recordIds: records });
    expect(got.versions.map(v => v.reason)).toEqual(['issue']);
  });

  it('splits 14 pallets into two consecutive numbers', async () => {
    const ids = [...records];
    for (let p = 3; p <= 14; p++) ids.push(await addRecord(p));
    const certs = await repo.issue({ farmer: FARMER, recordIds: ids, actor: ACTOR });
    expect(certs.map(c => [c.number, c.snapshot.rows.length])).toEqual([[51466, 13], [51467, 1]]);
  });

  it('rejects already-certified records with conflicts', async () => {
    await repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR });
    await expect(repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR }))
      .rejects.toMatchObject({ status: 409, code: 'ALREADY_CERTIFIED',
        details: { conflicts: [{ recordId: records[0], palletNumber: 1, certificateNumber: 51466, certificateId: `${FARMER}__51466` }] } });
    expect((await recordsCol().doc(records[1]).get()).data().cardId).toBe('');
  });

  it('rejects a farmer with no profile without touching records', async () => {
    await db.collection('centers').doc(CENTER).collection('farmers').doc(FARMER).update({ certificateProfile: admin.firestore.FieldValue.delete() });
    await expect(repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR }))
      .rejects.toMatchObject({ status: 400, code: 'NO_PROFILE' });
    expect((await recordsCol().doc(records[0]).get()).data().sent).toBe(false);
  });

  it('two concurrent issues get distinct consecutive numbers', async () => {
    const [a, b] = await Promise.all([
      repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR }),
      repo.issue({ farmer: FARMER, recordIds: [records[1]], actor: ACTOR }),
    ]);
    expect([a[0].number, b[0].number].sort()).toEqual([51466, 51467]);
  });

  it('two concurrent issues of the SAME pallet: exactly one wins', async () => {
    const results = await Promise.allSettled([
      repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR }),
      repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const reason = results.find(r => r.status === 'rejected').reason;
    expect(reason).toBeInstanceOf(CertificateError);
    expect(reason.code).toBe('ALREADY_CERTIFIED');
    expect(await repo.list(FARMER)).toHaveLength(1);
    expect((await repo.getProfile(FARMER)).nextNumber).toBe(51467);
  });

  it('rejects an empty selection', async () => {
    await expect(repo.issue({ farmer: FARMER, recordIds: [], actor: ACTOR }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_SELECTION', details: { errors: ['לא נבחרו משטחים'] } });
  });

  it('dedupes repeated record ids', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: [records[0], records[0]], actor: ACTOR });
    expect(c.snapshot.rows).toHaveLength(1);
    expect((await repo.get(c.id)).certificate.recordIds).toEqual([records[0]]);
  });
});

describe('reprint', () => {
  it('no change → no new version; weight change → version 2, version 1 intact', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR });
    const same = await repo.reprint({ id: c.id, actor: ACTOR });
    expect(same).toMatchObject({ version: 1, created: false });

    await recordsCol().doc(records[0]).update({ weight: 555 });
    const changed = await repo.reprint({ id: c.id, actor: 'other@test.local' });
    expect(changed).toMatchObject({ version: 2, created: true });
    expect(changed.snapshot.rows.find(r => r.recordId === records[0]).weight).toBe(555);
    expect((await repo.getVersion(c.id, 1)).rows.find(r => r.recordId === records[0]).weight).toBe(100);
    expect((await repo.get(c.id)).certificate).toMatchObject({ currentVersion: 2, updatedBy: 'other@test.local' });
  });
});

describe('recordIds drift', () => {
  it('reprint after a record doc is deleted creates a new version and reconciles recordIds', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR });
    await recordsCol().doc(records[1]).delete();
    const r = await repo.reprint({ id: c.id, actor: ACTOR });
    expect(r).toMatchObject({ version: 2, created: true });
    expect(r.snapshot.rows).toHaveLength(1);
    expect((await repo.get(c.id)).certificate.recordIds).toEqual([records[0]]);
  });
});

describe('removePallet', () => {
  it('removes one pallet → new version; last pallet → cancelled', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: records, actor: ACTOR });
    const r1 = await repo.removePallet({ id: c.id, recordId: records[0], actor: ACTOR });
    expect(r1).toMatchObject({ version: 2, cancelled: false });
    expect(r1.snapshot.rows.map(r => r.recordId)).toEqual([records[1]]);
    expect((await recordsCol().doc(records[0]).get()).data()).toMatchObject({ cardId: '', sent: false, mark: true });

    const r2 = await repo.removePallet({ id: c.id, recordId: records[1], actor: ACTOR });
    expect(r2).toMatchObject({ version: 3, cancelled: true });
    expect((await repo.get(c.id)).certificate).toMatchObject({ status: 'cancelled', recordIds: [], palletCount: 0 });
  });

  it('rejects a record that is not on the certificate', async () => {
    const [c] = await repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR });
    await expect(repo.removePallet({ id: c.id, recordId: records[1], actor: ACTOR }))
      .rejects.toMatchObject({ status: 400, code: 'NOT_ON_CERTIFICATE' });
  });
});

describe('list / maxIssuedNumber', () => {
  it('lists newest first and reports the max number', async () => {
    await repo.issue({ farmer: FARMER, recordIds: [records[0]], actor: ACTOR });
    await repo.issue({ farmer: FARMER, recordIds: [records[1]], actor: ACTOR });
    expect((await repo.list(FARMER)).map(c => c.number)).toEqual([51467, 51466]);
    expect(await repo.maxIssuedNumber(FARMER)).toBe(51467);
    expect(await repo.maxIssuedNumber('nobody')).toBe(0);
  });
});
