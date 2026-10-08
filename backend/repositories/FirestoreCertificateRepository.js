// Firestore storage for shipping certificates and per-farmer certificate profiles.
// Owns the transactions that update certificates AND pallet records together, so a
// certificate and its pallets can never disagree (no orphans, no duplicate numbers).
const admin = require('firebase-admin');
const { CENTER_ID } = require('../config/center');
const logger = require('../utils/logger');
const core = require('../services/certificateCore');

class CertificateError extends Error {
  constructor(status, code, details = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const certId = (farmer, number) => `${farmer}__${number}`;

class FirestoreCertificateRepository {
  constructor(db = null, centerId = CENTER_ID) {
    this._db = db;
    this.centerId = centerId;
  }

  get db() { return this._db || admin.firestore(); }
  centerDoc() { return this.db.collection('centers').doc(this.centerId); }
  farmerDoc(farmer) { return this.centerDoc().collection('farmers').doc(farmer); }
  recordsCol(farmer) { return this.farmerDoc(farmer).collection('records'); }
  certsCol() { return this.centerDoc().collection('certificates'); }
  versionsCol(id) { return this.certsCol().doc(id).collection('versions'); }

  async getProfile(farmer) {
    const snap = await this.farmerDoc(farmer).get();
    return (snap.exists && snap.data().certificateProfile) || null;
  }

  async setProfile(farmer, profile) {
    await this.farmerDoc(farmer).set({ certificateProfile: profile }, { merge: true });
  }

  async maxIssuedNumber(farmer) {
    const snap = await this.certsCol().where('farmer', '==', farmer).get();
    return snap.docs.reduce((m, d) => Math.max(m, d.data().number || 0), 0);
  }

  async issue({ farmer, recordIds, actor }) {
    if (!recordIds?.length) throw new CertificateError(400, 'INVALID_SELECTION', { errors: ['לא נבחרו משטחים'] });
    recordIds = [...new Set(recordIds)];
    const now = new Date().toISOString();
    return this.db.runTransaction(async (t) => {
      // --- reads (all before writes) ---
      const farmerSnap = await t.get(this.farmerDoc(farmer));
      const profile = farmerSnap.exists ? farmerSnap.data().certificateProfile : null;
      if (!profile || !Number.isInteger(profile.nextNumber)) throw new CertificateError(400, 'NO_PROFILE');

      const recSnaps = await t.getAll(...recordIds.map(id => this.recordsCol(farmer).doc(id)));
      const missing = recSnaps.find(s => !s.exists);
      if (missing) throw new CertificateError(404, 'RECORD_NOT_FOUND', { recordId: missing.id });
      const records = recSnaps.map(s => ({ id: s.id, ...s.data() }));

      const plan = core.planIssue(records);
      if (plan.conflicts.length) {
        throw new CertificateError(409, 'ALREADY_CERTIFIED',
          { conflicts: plan.conflicts.map(c => ({ ...c, certificateId: certId(farmer, c.certificateNumber) })) });
      }
      if (plan.errors.length) throw new CertificateError(400, 'INVALID_SELECTION', { errors: plan.errors });
      const { destination, shipmentDate, chunks } = plan;

      // --- writes ---
      let number = profile.nextNumber;
      const issued = [];
      for (const chunk of chunks) {
        const snapshot = core.buildSnapshot({ profile, number, destination, shipmentDate, records: chunk });
        const id = certId(farmer, number);
        t.create(this.certsCol().doc(id), {
          farmer, number, destination, shipmentDate,
          recordIds: chunk.map(r => r.id),
          palletCount: snapshot.palletCount, totalBoxes: snapshot.totalBoxes, totalWeight: snapshot.totalWeight,
          status: 'issued', currentVersion: 1,
          issuedBy: actor, issuedAt: now, updatedBy: actor, updatedAt: now,
        });
        t.create(this.versionsCol(id).doc('1'), { ...snapshot, reason: 'issue', createdBy: actor, createdAt: now });
        chunk.forEach(r => t.update(this.recordsCol(farmer).doc(r.id),
          { cardId: number, sent: true, mark: false, editedBy: actor, editedAt: now }));
        issued.push({ id, number, snapshot, records: chunk });
        number += 1;
      }
      t.set(this.farmerDoc(farmer), { certificateProfile: { ...profile, nextNumber: number } }, { merge: true });
      return issued.map(({ id, number: n, snapshot, records: rs }) => ({ id, number: n, snapshot, records: rs.map(r => ({ ...r, cardId: n, sent: true, mark: false, editedBy: actor, editedAt: now })) }));
    });
  }

  // Shared by reprint/removePallet: rebuild a snapshot from the current records + profile.
  async _currentSnapshot(t, cert, recordIds) {
    const farmerSnap = await t.get(this.farmerDoc(cert.farmer));
    const profile = (farmerSnap.exists && farmerSnap.data().certificateProfile) || { headerLines: [], driverName: '' };
    const recSnaps = recordIds.length ? await t.getAll(...recordIds.map(id => this.recordsCol(cert.farmer).doc(id))) : [];
    const records = recSnaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));
    return { snapshot: core.buildSnapshot({ profile, number: cert.number, destination: cert.destination,
      shipmentDate: cert.shipmentDate, records }), records, existingIds: records.map(r => r.id) };
  }

  async reprint({ id, actor }) {
    const now = new Date().toISOString();
    return this.db.runTransaction(async (t) => {
      const certSnap = await t.get(this.certsCol().doc(id));
      if (!certSnap.exists) throw new CertificateError(404, 'CERTIFICATE_NOT_FOUND');
      const cert = certSnap.data();
      if (cert.status === 'cancelled') throw new CertificateError(409, 'CERTIFICATE_CANCELLED');
      const latestSnap = await t.get(this.versionsCol(id).doc(String(cert.currentVersion)));
      const { snapshot, existingIds } = await this._currentSnapshot(t, cert, cert.recordIds);
      const drifted = existingIds.length !== cert.recordIds.length;
      if (drifted) logger.warn(`Certificate ${id}: ${cert.recordIds.length - existingIds.length} record(s) no longer exist; reconciling recordIds`);
      if (!drifted && !core.snapshotsDiffer(snapshot, latestSnap.data())) {
        return { snapshot: latestSnap.data(), version: cert.currentVersion, created: false };
      }
      const version = cert.currentVersion + 1;
      t.create(this.versionsCol(id).doc(String(version)), { ...snapshot, reason: 'reprint', createdBy: actor, createdAt: now });
      t.update(this.certsCol().doc(id), { currentVersion: version, recordIds: existingIds, updatedBy: actor, updatedAt: now,
        palletCount: snapshot.palletCount, totalBoxes: snapshot.totalBoxes, totalWeight: snapshot.totalWeight });
      return { snapshot, version, created: true };
    });
  }

  async removePallet({ id, recordId, actor }) {
    const now = new Date().toISOString();
    return this.db.runTransaction(async (t) => {
      const certSnap = await t.get(this.certsCol().doc(id));
      if (!certSnap.exists) throw new CertificateError(404, 'CERTIFICATE_NOT_FOUND');
      const cert = certSnap.data();
      if (!cert.recordIds.includes(recordId)) throw new CertificateError(400, 'NOT_ON_CERTIFICATE');
      const remaining = cert.recordIds.filter(r => r !== recordId);
      const removedSnap = await t.get(this.recordsCol(cert.farmer).doc(recordId));
      const { snapshot, existingIds } = await this._currentSnapshot(t, cert, remaining);
      if (existingIds.length !== remaining.length) logger.warn(`Certificate ${id}: ${remaining.length - existingIds.length} record(s) no longer exist; reconciling recordIds`);
      const version = cert.currentVersion + 1;
      const cancelled = existingIds.length === 0;
      t.create(this.versionsCol(id).doc(String(version)), { ...snapshot, reason: 'remove-pallet', createdBy: actor, createdAt: now });
      t.update(this.certsCol().doc(id), { recordIds: existingIds, currentVersion: version,
        status: cancelled ? 'cancelled' : cert.status, updatedBy: actor, updatedAt: now,
        palletCount: snapshot.palletCount, totalBoxes: snapshot.totalBoxes, totalWeight: snapshot.totalWeight });
      const patch = { cardId: '', sent: false, mark: true, editedBy: actor, editedAt: now };
      if (removedSnap.exists) t.update(this.recordsCol(cert.farmer).doc(recordId), patch);
      return { snapshot, version, cancelled, farmer: cert.farmer,
        record: removedSnap.exists ? { id: recordId, ...removedSnap.data(), ...patch } : null };
    });
  }

  async list(farmer) {
    const snap = await this.certsCol().where('farmer', '==', farmer).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.number - a.number);
  }

  async get(id) {
    const snap = await this.certsCol().doc(id).get();
    if (!snap.exists) return null;
    const vs = await this.versionsCol(id).get();
    const versions = vs.docs.map(d => ({ n: Number(d.id), reason: d.data().reason, createdBy: d.data().createdBy, createdAt: d.data().createdAt }))
      .sort((a, b) => a.n - b.n);
    return { certificate: { id, ...snap.data() }, versions };
  }

  async getVersion(id, n) {
    const snap = await this.versionsCol(id).doc(String(n)).get();
    return snap.exists ? snap.data() : null;
  }

  async listAllWithVersions() {
    const snap = await this.certsCol().get();
    return Promise.all(snap.docs.map(async d => {
      const vs = await this.versionsCol(d.id).get();
      return { id: d.id, ...d.data(), versions: vs.docs.map(v => ({ n: Number(v.id), ...v.data() })) };
    }));
  }
}

module.exports = { FirestoreCertificateRepository, CertificateError };
