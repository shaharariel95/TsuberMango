// Process entry point: startup side effects + listen. The Express app itself lives
// in app.js so the API tests can import it without binding a port.
require("dotenv").config();
const logger = require("./utils/logger");
const { app, db, usersCol } = require("./app");
const { isEmulatorMode } = require("./utils/sheetsGuard");

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  if (isEmulatorMode()) {
    logger.info("[STARTUP] Emulator mode — skipping Google Sheets cache warm");
    return;
  }

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
