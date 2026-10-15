// Firestore storage for the fridge (cold-room) map: one doc per room at centers/{c}/fridge/{roomId}
// holding `cells`, plus a `log` subcollection. Every change is one operation applied in a transaction,
// so concurrent devices can never overwrite each other (the loser gets the FridgeError).
const { getFirestore } = require('firebase-admin/firestore');
const { CENTER_ID } = require('../config/center');
const core = require('../services/fridgeCore');

class FirestoreFridgeRepository {
  constructor(db = null, centerId = CENTER_ID) {
    this._db = db;
    this.centerId = centerId;
  }

  get db() { return this._db || getFirestore(); }
  roomDoc(roomId) { return this.db.collection('centers').doc(this.centerId).collection('fridge').doc(roomId); }

  async getRoom(roomId) {
    const snap = await this.roomDoc(roomId).get();
    const d = snap.exists ? snap.data() : {};
    return { cells: d.cells || {}, updatedAt: d.updatedAt || null, updatedBy: d.updatedBy || null };
  }

  async applyOp(roomId, op, actor) {
    const ref = this.roomDoc(roomId);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const at = new Date().toISOString();
      const { cells, logEntry } = core.applyOp(roomId, snap.exists ? (snap.data().cells || {}) : {}, op, { actor, at });
      t.set(ref, { cells, updatedAt: at, updatedBy: actor });
      t.create(ref.collection('log').doc(), logEntry);
      return { cells, updatedAt: at, updatedBy: actor };
    });
  }

  // Season reset (--farmer): drop one farmer's cells; the log is history and stays.
  async clearFarmer(roomId, farmer) {
    const ref = this.roomDoc(roomId);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return 0;
      const cells = { ...(snap.data().cells || {}) };
      const mine = Object.keys(cells).filter(s => cells[s].farmer === farmer);
      if (!mine.length) return 0;
      mine.forEach(s => delete cells[s]);
      t.update(ref, { cells, updatedAt: new Date().toISOString(), updatedBy: 'season-reset' });
      return mine.length;
    });
  }
}

module.exports = { FirestoreFridgeRepository };
