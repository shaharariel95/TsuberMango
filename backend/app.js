require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sheetRoutes = require("./routes/sheetRoutes");
const admin = require("firebase-admin");
const path = require("path");
const logger = require("./utils/logger");
const { verifyFirebaseToken, ensureCenterAccess, ensureAdmin, syncUserClaims } = require('./middleware/auth');

// Express app definition — no listen() and no startup side effects, so tests can
// import it. The process entry point (listen, user seeding, cache warm) is server.js.

// 🔒 Initialize Firebase Admin. Skipped when a caller (e.g. the API tests) has
// already initialized it against the emulators.
if (!admin.apps.length) {
  try {
    const serviceAccount = require(path.join(__dirname, "services", "SheetsCred.env.json"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
    });
    console.log("Firebase Admin Initialized Successfully for project:", process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id);
  } catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
  }
}
const db = admin.firestore();

if (!process.env.FRONT_CORS) {
  throw new Error("FRONT_CORS env var is required (comma-separated list of allowed frontend origins)");
}

const { CENTER_ID } = require('./config/center');
const centerRef = () => db.collection('centers').doc(CENTER_ID);
const usersCol = () => centerRef().collection('users');
const configDoc = () => centerRef().collection('config').doc('global');

const app = express();

app.use(
  cors({
    origin: process.env.FRONT_CORS.split(","),
    credentials: false, // Bearer tokens, not cookies
  })
);
app.use(express.json());
app.set('trust proxy', 1);

// Current user — role read live from Firestore; keeps claims in sync.
app.get("/api/auth/me", verifyFirebaseToken, async (req, res) => {
  try {
    const snap = await usersCol().doc(req.user.email).get();
    if (!snap.exists) return res.status(403).json({ message: "User not authorized" });
    const changed = await syncUserClaims(req.user.email);
    res.json({ email: req.user.email, role: snap.data().role, centerId: CENTER_ID, refreshToken: changed });
  } catch (err) {
    logger.error("[/api/auth/me] failed:", err.message);
    res.status(500).json({ message: "Failed to load user" });
  }
});

// Logout — revoke refresh tokens so the session cannot be silently resumed.
app.post("/api/auth/logout", verifyFirebaseToken, async (req, res) => {
  try {
    await admin.auth().revokeRefreshTokens(req.user.uid);
    res.json({ success: true });
  } catch (err) {
    logger.error("[/api/auth/logout] revoke failed:", err.message);
    res.json({ success: true }); // client signs out regardless
  }
});

// 🕛 Internal endpoint for Cloud Scheduler — OIDC token auth, no session required
// Must be defined BEFORE the global app.use("/api", verifyFirebaseToken, ...) block
const backupService = require('./services/backupService');
const { OAuth2Client } = require('google-auth-library');
const oidcClient = new OAuth2Client();

app.post('/api/internal/backup', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (process.env.NODE_ENV !== 'production') {
    const devSecret = process.env.CRON_SECRET;
    if (devSecret && token === devSecret) {
      logger.info('[/api/internal/backup] Dev CRON_SECRET accepted');
      const result = await backupService.runBackup('cloud-scheduler/dev');
      return res.json({ success: true, ...result });
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const ticket = await oidcClient.verifyIdToken({
      idToken: token,
      audience: process.env.CLOUD_RUN_SERVICE_URL,
    });
    const payload = ticket.getPayload();
    const triggeredBy = payload.email || 'cloud-scheduler';
    logger.info(`[/api/internal/backup] OIDC verified — triggeredBy: ${triggeredBy}`);
    const result = await backupService.runBackup(triggeredBy);
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[/api/internal/backup] OIDC verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
});

// 📄 Shipping certificates (task 20) — mounted BEFORE the global /api chain, with its own
// auth chain, so token verification does not run twice per request.
app.use("/api/certificates", verifyFirebaseToken, ensureCenterAccess, require("./routes/certificateRoutes"));

app.use(
  "/api",
  verifyFirebaseToken,
  ensureCenterAccess,
  (req, res, next) => { logger.info(`API ${req.method} ${req.url}`); next(); },
  sheetRoutes
);

// 🔒 Secure Config Management (Proxy for Firestore)
app.post("/api/admin/config", ensureAdmin, async (req, res) => {
  try {
    // Farmers are owned by /api/admin/farmers (transactional); a stale Settings tab must not revert them.
    const { farmers: _ignored, ...rest } = req.body || {};
    await configDoc().set(rest, { merge: true });
    require('./controllers/sheetController').invalidateKnownFarmersCache();
    logger.info("[POST /api/admin/config] Config saved; known-farmers cache invalidated");
    res.json({ success: true, message: "Configuration saved to Firestore via Backend" });
  } catch (error) {
    console.error("Firebase Admin Error:", error);
    res.status(500).json({ error: "Failed to save config to Firestore", details: error.message });
  }
});

// 💾 Backup Endpoints
const sheetController = require('./controllers/sheetController');

app.post('/api/admin/backup', ensureAdmin, sheetController.triggerBackup.bind(sheetController));
app.get('/api/admin/backups', ensureAdmin, sheetController.listBackups.bind(sheetController));

// 📄 Certificate profile per farmer (header lines, driver, next number) — task 20.
const certRepo = require('./repositories').certificates;

app.get("/api/admin/farmers/:farmer/certificate-profile", ensureAdmin, async (req, res) => {
  try {
    res.json({ profile: await certRepo.getProfile(req.params.farmer) });
  } catch (err) {
    logger.error(`[GET certificate-profile] ${err.message}`);
    res.status(500).json({ error: "Failed to load profile", details: err.message });
  }
});

app.put("/api/admin/farmers/:farmer/certificate-profile", ensureAdmin, async (req, res) => {
  const { farmer } = req.params;
  const { headerLines, driverName = '', nextNumber } = req.body || {};
  const farmerError = await sheetController.assertKnownFarmer(farmer);
  if (farmerError) return res.status(400).json({ error: farmerError });
  if (!Array.isArray(headerLines) || headerLines.length !== 5 || headerLines.some(l => typeof l !== 'string')) {
    return res.status(400).json({ error: "נדרשות בדיוק 5 שורות כותרת" });
  }
  if (!Number.isInteger(nextNumber) || nextNumber < 1) {
    return res.status(400).json({ error: "מספר התעודה הבא חייב להיות מספר שלם חיובי" });
  }
  try {
    const maxIssued = await certRepo.maxIssuedNumber(farmer);
    if (nextNumber <= maxIssued) {
      return res.status(400).json({ error: `מספר התעודה הבא חייב להיות גדול מ-${maxIssued} (התעודה האחרונה שהונפקה)` });
    }
    const profile = { headerLines, driverName: String(driverName), nextNumber };
    await certRepo.setProfile(farmer, profile);
    logger.info(`[PUT certificate-profile] ${farmer} nextNumber=${nextNumber} by ${req.user.email}`);
    res.json({ profile });
  } catch (err) {
    logger.error(`[PUT certificate-profile] ${err.message}`);
    res.status(500).json({ error: "Failed to save profile", details: err.message });
  }
});

// 👨‍🌾 Farmer registry (task 6) — add / hide / restore / gidon flag. Hiding keeps all data.
const farmerRegistry = require('./services/farmerRegistry');

function farmerRegistryHandler(label, run) {
  return async (req, res) => {
    try {
      const { status = 200, body } = await run(req);
      sheetController.invalidateKnownFarmersCache();
      logger.info(`[${label}] ${JSON.stringify(body)} by ${req.user.email}`);
      res.status(status).json(body);
    } catch (err) {
      if (err instanceof farmerRegistry.FarmerRegistryError) return res.status(err.status).json({ error: err.message });
      logger.error(`[${label}] ${err.message}`);
      res.status(500).json({ error: 'Failed to update farmers', details: err.message });
    }
  };
}

app.post('/api/admin/farmers', ensureAdmin, farmerRegistryHandler('POST /api/admin/farmers', async (req) => {
  const body = await farmerRegistry.addFarmer(req.body?.name);
  return { status: body.restored ? 200 : 201, body };
}));

app.delete('/api/admin/farmers/:name', ensureAdmin, farmerRegistryHandler('DELETE /api/admin/farmers',
  async (req) => ({ body: await farmerRegistry.archiveFarmer(req.params.name) })));

app.patch('/api/admin/farmers/:name', ensureAdmin, farmerRegistryHandler('PATCH /api/admin/farmers',
  async (req) => ({ body: await farmerRegistry.setAllowGidon(req.params.name, req.body?.allowGidon) })));

// 📤 Season export — all farmers' pallet records (the frontend builds the Excel file).
app.get("/api/admin/export/records", ensureAdmin, async (req, res) => {
  try {
    const recordsRepo = require('./repositories');
    const snap = await configDoc().get();
    const names = ((snap.exists && snap.data().farmers) || []).map(f => f.name).filter(Boolean);
    const farmers = {};
    for (const name of names) farmers[name] = await recordsRepo.getRecords(name);
    logger.info(`[GET export/records] ${names.length} farmers by ${req.user.email}`);
    res.json({ farmers });
  } catch (err) {
    logger.error(`[GET export/records] ${err.message}`);
    res.status(500).json({ error: "Failed to export", details: err.message });
  }
});

// 👥 User Management Endpoints
app.get("/api/admin/users", ensureAdmin, async (req, res) => {
  try {
    const snapshot = await usersCol().get();
    const users = snapshot.docs.map(doc => ({ email: doc.id, ...doc.data() }));
    logger.info(`[GET /api/admin/users] Returned ${users.length} users`);
    res.json(users);
  } catch (err) {
    logger.error("[GET /api/admin/users] Failed to fetch users:", err);
    res.status(500).json({ error: "Failed to fetch users", details: err.message });
  }
});

app.post("/api/admin/users", ensureAdmin, async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ error: "email and role are required" });
  }
  if (!["admin", "user"].includes(role)) {
    return res.status(400).json({ error: "role must be 'admin' or 'user'" });
  }
  try {
    await usersCol().doc(email).set({ role });
    await syncUserClaims(email).catch(err => logger.error('[admin/users] claim sync failed:', err.message));
    logger.info(`[POST /api/admin/users] Upserted user: ${email} (role: ${role})`);
    res.json({ success: true, email, role });
  } catch (err) {
    logger.error(`[POST /api/admin/users] Failed to upsert user ${email}:`, err);
    res.status(500).json({ error: "Failed to save user", details: err.message });
  }
});

app.delete("/api/admin/users/:email", ensureAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  try {
    // Prevent deleting the last admin
    const snapshot = await usersCol().where("role", "==", "admin").get();
    const adminDocs = snapshot.docs;
    if (adminDocs.length === 1 && adminDocs[0].id === email) {
      logger.info(`[DELETE /api/admin/users] Blocked deletion of last admin: ${email}`);
      return res.status(400).json({ error: "לא ניתן למחוק את המנהל האחרון במערכת" });
    }
    await usersCol().doc(email).delete();
    await syncUserClaims(email).catch(err => logger.error('[admin/users] claim sync failed:', err.message));
    logger.info(`[DELETE /api/admin/users] Deleted user: ${email}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`[DELETE /api/admin/users] Failed to delete user ${email}:`, err);
    res.status(500).json({ error: "Failed to delete user", details: err.message });
  }
});

module.exports = { app, db, usersCol };
