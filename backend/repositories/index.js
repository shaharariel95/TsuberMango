// Selects the active RecordRepository implementation. Future impls (Postgres,
// behind an explicit trigger) swap here only.
const FirestoreRepository = require('./FirestoreRepository');

module.exports = new FirestoreRepository();
