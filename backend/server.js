require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sheetRoutes = require("./routes/sheetRoutes");
const admin = require("firebase-admin");
const path = require("path");
const logger = require("./utils/logger");
const { verifyFirebaseToken, ensureCenterAccess, ensureAdmin, syncUserClaims } = require('./middleware/auth');

// 🔒 Initialize Firebase Admin for Secure Config Management
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
const db = admin.firestore();

const { CENTER_ID } = require('./config/center');
const centerRef = () => db.collection('centers').doc(CENTER_ID);
const usersCol = () => centerRef().collection('users');
const configDoc = () => centerRef().collection('config').doc('global');

// 🌱 Seed Firestore users collection from users.json on startup (if empty)
async function seedUsersIfEmpty() {
  try {
    const snapshot = await usersCol().limit(1).get();
    if (!snapshot.empty) {
      logger.info("Firestore users collection already seeded — skipping.");
      return;
    }
    const SEED_USERS = require("./users.json");
    const batch = db.batch();
    for (const [email, role] of Object.entries(SEED_USERS)) {
      batch.set(usersCol().doc(email), { role });
    }
    await batch.commit();
    logger.info(`Firestore users collection seeded with ${Object.keys(SEED_USERS).length} users.`);
  } catch (err) {
    logger.error("Failed to seed Firestore users collection:", err);
  }
}
seedUsersIfEmpty();

const app = express();

app.use(
  cors({
    origin: process.env.FRONT_CORS.split(","),
    credentials: false, // Bearer tokens, not cookies
  })
);
app.use(express.json());
app.set('trust proxy', 1);
const USERS = require("./users.json"); // Contains emails and roles

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

const PORT = process.env.PORT || 3000;

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

app.use(
  "/api",
  verifyFirebaseToken,
  ensureCenterAccess,
  (req, res, next) => { logger.info(`API ${req.method} ${req.url}`); next(); },
  sheetRoutes
);

// 🛠️ Admin Sheet Management
app.post("/api/admin/create-sheet", ensureAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Sheet name is required" });

  try {
    const sheetsService = require("./services/googleSheetsService");
    await sheetsService.addSheet(name);
    res.json({ success: true, message: `Sheet '${name}' created successfully` });
  } catch (error) {
    res.status(500).json({ error: "Failed to create sheet", details: error.message });
  }
});

app.post("/api/admin/delete-sheet", ensureAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Sheet name is required" });

  try {
    const sheetsService = require("./services/googleSheetsService");
    await sheetsService.deleteSheet(name);
    res.json({ success: true, message: `Sheet '${name}' deleted successfully` });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete sheet", details: error.message });
  }
});

// 🔄 Manual Cache Refresh Endpoint (Admin only)
app.post("/api/admin/refresh-cache", ensureAdmin, async (req, res) => {
  try {
    const sheetsService = require("./services/googleSheetsService");
    sheetsService.cachedSheetNames = null;
    sheetsService.cachedAuditSheetExists.clear();
    sheetsService.cachedFarmerRecords.clear();
    sheetsService.activeRecordFetches.clear();
    await sheetsService.initialize();
    
    // Eagerly pre-populate farmer sheet names
    const response = await sheetsService.sheets.spreadsheets.get({
      spreadsheetId: sheetsService.SPREADSHEET_ID
    });
    sheetsService.cachedSheetNames = response.data.sheets.map(sheet => sheet.properties.title);
    
    logger.info("[POST /api/admin/refresh-cache] Backend cache manually refreshed successfully.");
    res.json({ success: true, message: "זיכרון המטמון רענן בהצלחה" });
  } catch (error) {
    logger.error("[POST /api/admin/refresh-cache] Cache refresh failed:", error);
    res.status(500).json({ error: "Failed to refresh cache", details: error.message });
  }
});

// 🔒 Secure Config Management (Proxy for Firestore)
app.post("/api/admin/config", ensureAdmin, async (req, res) => {
  try {
    await configDoc().set(req.body);
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  // Warm the sheet name cache so the first real request doesn't pay the miss cost
  const sheetsService = require('./services/googleSheetsService');
  sheetsService.initialize()
    .then(() => sheetsService.sheets.spreadsheets.get({ spreadsheetId: sheetsService.SPREADSHEET_ID }))
    .then(response => {
      sheetsService.cachedSheetNames = response.data.sheets.map(s => s.properties.title);
      logger.info(`[STARTUP] Sheet name cache warmed — ${sheetsService.cachedSheetNames.length} sheets cached`);
    })
    .catch(err => logger.error(`[STARTUP] Failed to warm sheet name cache: ${err.message}`));
});
