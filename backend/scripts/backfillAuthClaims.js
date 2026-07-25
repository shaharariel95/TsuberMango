// backend/scripts/backfillAuthClaims.js
// One-time, idempotent: ensure every Firestore user has a correct `centers` claim.
// Run: node scripts/backfillAuthClaims.js   (uses the same service account as the server)
const admin = require('firebase-admin');
const path = require('path');
const logger = require('../utils/logger');

if (!admin.apps.length) {
  const serviceAccount = require(path.join(__dirname, '..', 'services', 'SheetsCred.env.json'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const { syncUserClaims } = require('../middleware/auth');
const db = admin.firestore();

(async () => {
  // Discover users via a single `users` collection-group scan rather than
  // `db.collection('centers').get()` + per-center `users`. A `centers/{id}`
  // doc only "exists" for a top-level `.collection('centers').get()` if it was
  // ever written directly, so centers that are implied purely by their
  // subcollections (e.g. `centers/test` from seedTestCenter.js) would be
  // silently skipped. Scanning the `users` collection group finds every user
  // doc regardless — this mirrors syncUserClaims's own approach (see
  // middleware/auth.js). The group also picks up any legacy top-level
  // `users/*` docs; we dedupe by email, and syncUserClaims computes the
  // correct per-email centers list (excluding those legacy docs) itself.
  const usersSnap = await db.collectionGroup('users').get();
  const emails = new Set();
  usersSnap.docs.forEach(u => emails.add(u.id));
  logger.info(`[backfill] ${emails.size} distinct users across ${usersSnap.size} user docs`);
  for (const email of emails) {
    try { await syncUserClaims(email); }
    catch (err) { logger.error(`[backfill] ${email} failed: ${err.message}`); }
  }
  logger.info('[backfill] done');
  process.exit(0);
})();
