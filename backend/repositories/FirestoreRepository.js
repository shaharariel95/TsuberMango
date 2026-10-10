const admin = require('firebase-admin');
const RecordRepository = require('./RecordRepository');
const { CENTER_ID } = require('../config/center');
const logger = require('../utils/logger');
const { RecordStateError } = require('./errors');

class FirestoreRepository extends RecordRepository {
  constructor(db = null, centerId = CENTER_ID) {
    super();
    this._db = db;
    this.centerId = centerId;
  }

  // Lazy so module load never runs before admin.initializeApp().
  get db() { return this._db || admin.firestore(); }

  centerDoc() { return this.db.collection('centers').doc(this.centerId); }
  farmerDoc(farmer) { return this.centerDoc().collection('farmers').doc(farmer); }
  recordsCol(farmer) { return this.farmerDoc(farmer).collection('records'); }
  auditCol(farmer) { return this.farmerDoc(farmer).collection('audit'); }

  async getRecords(farmer, { includeDeleted = false } = {}) {
    const snap = await this.recordsCol(farmer).get();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return includeDeleted ? all : all.filter(r => r.deleted !== true);
  }

  async getRecord(farmer, id) {
    const snap = await this.recordsCol(farmer).doc(id).get();
    return snap.exists && snap.data().deleted !== true ? { id: snap.id, ...snap.data() } : null;
  }

  async getDeletedRecords(farmer) {
    return (await this.getRecords(farmer, { includeDeleted: true })).filter(r => r.deleted === true);
  }

  async softDeleteRecord(farmer, id, deletedBy, deletedAt) {
    const ref = this.recordsCol(farmer).doc(id);
    const out = await this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists || snap.data().deleted === true) throw new RecordStateError(404, 'המשטח לא נמצא');
      const r = snap.data();
      if (r.sent === true || (r.cardId !== '' && r.cardId != null)) {
        throw new RecordStateError(409, 'לא ניתן למחוק משטח שנשלח או שיש לו תעודת משלוח');
      }
      t.update(ref, { deleted: true, deletedBy, deletedAt });
      return { id, ...r, deleted: true, deletedBy, deletedAt };
    });
    logger.info(`[FirestoreRepository.softDeleteRecord] ${farmer}/${id} by ${deletedBy}`);
    return out;
  }

  async restoreRecord(farmer, id, editedBy, editedAt) {
    const ref = this.recordsCol(farmer).doc(id);
    const { FieldValue } = admin.firestore;
    const out = await this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists || snap.data().deleted !== true) throw new RecordStateError(404, 'משטח מחוק לא נמצא');
      // eslint-disable-next-line no-unused-vars
      const { deleted, deletedBy, deletedAt, ...rest } = snap.data();
      t.update(ref, { deleted: FieldValue.delete(), deletedBy: FieldValue.delete(), deletedAt: FieldValue.delete(), editedBy, editedAt });
      return { id, ...rest, editedBy, editedAt };
    });
    logger.info(`[FirestoreRepository.restoreRecord] ${farmer}/${id} by ${editedBy}`);
    return out;
  }

  async getRecordsByPallet(farmer, palletNumber) {
    const all = await this.getRecords(farmer);
    return all.filter(r => String(r.palletNumber) === String(palletNumber));
  }

  async getLastPallet(farmer) {
    const all = await this.getRecords(farmer);
    const nums = all.map(r => parseInt(r.palletNumber)).filter(n => !isNaN(n));
    return nums.length ? Math.max(...nums) : 0;
  }

  async appendRecord(farmer, record) {
    const ref = this.recordsCol(farmer).doc(); // auto-id
    const data = { ...record };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async updateRecord(farmer, id, record) {
    const data = { ...record };
    const ref = this.recordsCol(farmer).doc(id);
    // Transactional so a concurrent soft delete is never overwritten (set() would wipe the deleted markers).
    await this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists || snap.data().deleted === true) throw new RecordStateError(404, 'המשטח לא נמצא');
      t.set(ref, data); // full overwrite (mirrors updateRowById)
    });
    return { id, ...data };
  }

  async updateRecords(farmer, ids, records) {
    const batch = this.db.batch();
    ids.forEach((id, i) => batch.set(this.recordsCol(farmer).doc(id), { ...records[i] }));
    await batch.commit();
    return { success: true, message: 'Rows updated successfully' };
  }

  async updateSentStatus(farmer, ids, value) {
    const batch = this.db.batch();
    ids.forEach(id => batch.update(this.recordsCol(farmer).doc(id), { sent: value }));
    await batch.commit();
    return ids.map(id => ({ id, sent: value }));
  }

  async updateMarkStatus(farmer, ids, value) {
    const batch = this.db.batch();
    ids.forEach(id => batch.update(this.recordsCol(farmer).doc(id), { mark: value }));
    await batch.commit();
    return ids.map(id => ({ id, mark: value }));
  }

  async clearCardIds(farmer, ids, editedBy, editedAt) {
    const batch = this.db.batch();
    ids.forEach(id => batch.update(this.recordsCol(farmer).doc(id), { sent: false, cardId: '', editedBy, editedAt }));
    await batch.commit();
  }

  async updateShipmentDate(farmer, ids, shipmentDate, editedBy, editedAt) {
    const refs = ids.map(id => this.recordsCol(farmer).doc(id));
    const snaps = await this.db.getAll(...refs);
    const missing = snaps.find(s => !s.exists || s.data().deleted === true);
    if (missing) throw new Error(`Row with ID ${missing.id} not found`);
    const batch = this.db.batch();
    refs.forEach(ref => batch.update(ref, { shipmentDate, editedBy, editedAt }));
    await batch.commit();
    return snaps.map(s => ({ id: s.id, palletNumber: s.data().palletNumber, shipmentDate }));
  }

  async appendAuditLog(farmer, entry) {
    // Never rethrow — audit must not break the main flow.
    try {
      await this.auditCol(farmer).add({
        recordId: entry.recordId,
        palletNumber: entry.palletNumber,
        action: entry.action,
        editedBy: entry.editedBy,
        editedAt: entry.editedAt,
      });
    } catch (err) {
      logger.error(`appendAuditLog failed for farmer "${farmer}": ${err.message}`);
      // swallowed — audit failures must never break the main flow
    }
  }
}

module.exports = FirestoreRepository;
