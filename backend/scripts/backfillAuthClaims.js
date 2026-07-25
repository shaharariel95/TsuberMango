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
  const centersSnap = await db.collection('centers').get();
  const emails = new Set();
  for (const c of centersSnap.docs) {
    const users = await c.ref.collection('users').get();
    users.docs.forEach(u => emails.add(u.id));
  }
  logger.info(`[backfill] ${emails.size} distinct users across ${centersSnap.size} centers`);
  for (const email of emails) {
    try { await syncUserClaims(email); }
    catch (err) { logger.error(`[backfill] ${email} failed: ${err.message}`); }
  }
  logger.info('[backfill] done');
  process.exit(0);
})();
