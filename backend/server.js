// Process entry point: startup side effects + listen. The Express app itself lives
// in app.js so the API tests can import it without binding a port.
require("dotenv").config({ quiet: true });
const logger = require("./utils/logger");
const { app, db, usersCol } = require("./app");

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
});
