// Selects the active RecordRepository implementation. Future impls (Postgres,
// behind an explicit trigger) swap here only.
const FirestoreRepository = require('./FirestoreRepository');
const { FirestoreCertificateRepository } = require('./FirestoreCertificateRepository');
const { FirestoreFridgeRepository } = require('./FirestoreFridgeRepository');

module.exports = new FirestoreRepository();
module.exports.certificates = new FirestoreCertificateRepository();
module.exports.fridge = new FirestoreFridgeRepository();
