const admin = require('firebase-admin')
const logger = require('../utils/logger')

const COL = 'farmer_events'
const db = () => admin.firestore()

function emit(farmer, payload) {
  db().collection(COL).doc(farmer).set({
    ...payload,
    farmer,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(err =>
    logger.error(`[firestoreEventService] emit failed for "${farmer}": ${err.message}`)
  )
}

module.exports = {
  emitCreate:          (farmer, pallet, updatedBy)            => emit(farmer, { type: 'create',           updatedBy, pallet }),
  emitUpdate:          (farmer, pallet, updatedBy)            => emit(farmer, { type: 'update',           updatedBy, pallet }),
  emitBulkUpdate:      (farmer, pallets, updatedBy)           => emit(farmer, { type: 'bulk_update',      updatedBy, pallets }),
  emitResetSent:       (farmer, palletIds, updatedBy)         => emit(farmer, { type: 'reset_sent',       updatedBy, palletIds }),
  emitMarkDestination: (farmer, pallets, newValue, updatedBy) => emit(farmer, { type: 'mark_destination', updatedBy, pallets, newValue }),
}
