// Storage-agnostic contract for pallet-record persistence.
// Anchored to what recordController.js and backupService.js consume — NOT to any
// backend's mechanics — so a future PostgresRepository stays a mechanical swap.
class RecordRepository {
  // Live records only, unless includeDeleted (soft-deleted ones carry deleted: true).
  // eslint-disable-next-line no-unused-vars
  getRecords(farmer, { includeDeleted } = {}) { throw new Error('RecordRepository.getRecords not implemented'); }
  // Single record by id; resolves to null when missing or soft-deleted.
  getRecord(farmer, id) { throw new Error('not implemented'); }
  getRecordsByPallet(farmer, palletNumber) { throw new Error('not implemented'); }
  getLastPallet(farmer) { throw new Error('not implemented'); }
  appendRecord(farmer, record) { throw new Error('not implemented'); }
  updateRecord(farmer, id, record) { throw new Error('not implemented'); }
  updateRecords(farmer, ids, records) { throw new Error('not implemented'); }
  updateSentStatus(farmer, ids, value) { throw new Error('not implemented'); }
  updateMarkStatus(farmer, ids, value) { throw new Error('not implemented'); }
  // Partial update: touches only shipmentDate + editedBy/editedAt. Resolves to [{id, palletNumber, shipmentDate}].
  updateShipmentDate(farmer, ids, shipmentDate, editedBy, editedAt) { throw new Error('not implemented'); }
  // Partial update: sent=false, cardId='' + editedBy/editedAt (legacy cardIds with no certificate doc).
  clearCardIds(farmer, ids, editedBy, editedAt) { throw new Error('not implemented'); }
  appendAuditLog(farmer, entry) { throw new Error('not implemented'); }
  // Soft-deleted records only (deleted: true).
  getDeletedRecords(farmer) { throw new Error('not implemented'); }
  // Transactional soft delete. Throws RecordStateError 404 (missing/already deleted) or 409 (sent or has a cardId).
  softDeleteRecord(farmer, id, deletedBy, deletedAt) { throw new Error('not implemented'); }
  // Transactional restore of a soft-deleted record. Throws RecordStateError 404 if it is not deleted.
  restoreRecord(farmer, id, editedBy, editedAt) { throw new Error('not implemented'); }
}

module.exports = RecordRepository;
