// Selects the active RecordRepository implementation. Future impls (Postgres,
// behind an explicit trigger) swap here only.
const FirestoreRepository = require('./FirestoreRepository');
const { FirestoreCertificateRepository } = require('./FirestoreCertificateRepository');

module.exports = new FirestoreRepository();
module.exports.certificates = new FirestoreCertificateRepository();
