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
}

module.exports = FirestoreRepository;
