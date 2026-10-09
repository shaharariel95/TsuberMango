const admin = require('firebase-admin')
const logger = require('../utils/logger')
const { CENTER_ID } = require('../config/center')
const { currentClientId } = require('../utils/requestContext')

const db = () => admin.firestore()
const eventDoc = (farmer) =>
  db().collection('centers').doc(CENTER_ID).collection('farmer_events').doc(farmer)

function emit(farmer, payload) {
  const clientId = currentClientId()
  eventDoc(farmer).set({
    ...payload,
    ...(clientId ? { updatedByClient: clientId } : {}),
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
  emitShipmentDate:    (farmer, palletIds, shipmentDate, updatedBy) => emit(farmer, { type: 'shipment_date',    updatedBy, palletIds, shipmentDate }),
}
