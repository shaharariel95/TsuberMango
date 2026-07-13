// Storage-agnostic contract for pallet-record persistence.
// Anchored to what sheetController.js and backupService.js consume — NOT to any
// backend's mechanics — so a future PostgresRepository stays a mechanical swap.
class RecordRepository {
  // eslint-disable-next-line no-unused-vars
  getRecords(farmer) { throw new Error('RecordRepository.getRecords not implemented'); }
  getRecordsByPallet(farmer, palletNumber) { throw new Error('not implemented'); }
  getLastPallet(farmer) { throw new Error('not implemented'); }
  appendRecord(farmer, record) { throw new Error('not implemented'); }
  updateRecord(farmer, id, record) { throw new Error('not implemented'); }
  updateRecords(farmer, ids, records) { throw new Error('not implemented'); }
  updateSentStatus(farmer, ids, value) { throw new Error('not implemented'); }
  updateMarkStatus(farmer, ids, value) { throw new Error('not implemented'); }
  appendAuditLog(farmer, entry) { throw new Error('not implemented'); }
}

module.exports = RecordRepository;
