const admin = require('firebase-admin');
const RecordRepository = require('./RecordRepository');
const { CENTER_ID } = require('../config/center');

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

  async getRecords(farmer) {
    const snap = await this.recordsCol(farmer).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    await this.recordsCol(farmer).doc(id).set(data); // full overwrite (mirrors updateRowById)
    return { id, ...data };
  }

  async updateRecords(farmer, ids, records) {
    const batch = this.db.batch();
    ids.forEach((id, i) => batch.set(this.recordsCol(farmer).doc(id), { ...records[i] }));
    await batch.commit();
    return { success: true, message: 'Rows updated successfully' };
  }
}

module.exports = FirestoreRepository;
