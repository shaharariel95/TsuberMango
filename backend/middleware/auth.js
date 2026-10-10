const admin = require('firebase-admin');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');

const db = () => admin.firestore();

// Verify the Firebase ID token carried in `Authorization: Bearer <token>`.
async function verifyFirebaseToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      email: decoded.email,
      uid: decoded.uid,
      centers: Array.isArray(decoded.centers) ? decoded.centers : [],
    };
    next();
  } catch (err) {
    logger.error(`[verifyFirebaseToken] verification failed: ${err.message}`);
    res.status(401).json({ message: 'Invalid token' });
  }
}

// Reject unless the active center is one the user is allowed into (claim-based).
function ensureCenterAccess(req, res, next) {
  if (req.user && Array.isArray(req.user.centers) && req.user.centers.includes(CENTER_ID)) {
    return next();
  }
  logger.error(`[ensureCenterAccess] ${req.user?.email} denied for center ${CENTER_ID}`);
  res.status(403).json({ message: 'Forbidden' });
}

// Require admin — read live from Firestore so role changes take effect immediately.
async function ensureAdmin(req, res, next) {
  try {
    const snap = await db().collection('centers').doc(CENTER_ID)
      .collection('users').doc(req.user.email).get();
    if (snap.exists && snap.data().role === 'admin') {
      req.user.role = 'admin';
      return next();
    }
    res.status(403).json({ message: 'Forbidden' });
  } catch (err) {
    logger.error(`[ensureAdmin] role lookup failed: ${err.message}`);
    res.status(500).json({ message: 'Role check failed' });
  }
}

// Compute the set of centers a user belongs to and stamp it as a custom claim.
// Returns true when the claim actually changed.
async function syncUserClaims(email) {
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (err) {
    logger.error(`[syncUserClaims] no auth user for ${email}: ${err.message}`);
    return false;
  }
  // A `centers/{id}` document only "exists" (and is returned by a top-level
  // `.collection('centers').get()`) if it was ever written directly — in
  // practice centers are implied purely by their subcollections, so we scan
  // the `users` collection group instead and derive the center id from each
  // matching doc's parent path.
  const usersSnap = await db().collectionGroup('users').get();
  const allowed = usersSnap.docs
    .filter((d) => d.id === email && d.ref.parent.parent)
    .map((d) => d.ref.parent.parent.id);
  const current = userRecord.customClaims?.centers || [];
  const changed = current.length !== allowed.length || !allowed.every(c => current.includes(c));
  if (changed) {
    await admin.auth().setCustomUserClaims(userRecord.uid, { centers: allowed });
    logger.info(`[syncUserClaims] ${email} centers -> [${allowed.join(', ')}]`);
  }
  return changed;
}

module.exports = { verifyFirebaseToken, ensureCenterAccess, ensureAdmin, syncUserClaims };
