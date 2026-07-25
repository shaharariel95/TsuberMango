// backend/scripts/seedTestCenter.js
// Idempotent: stand up centers/test with a small config + fake farmer/records,
// and add the developer as an admin user of the test center.
// Run: node scripts/seedTestCenter.js your-email@gmail.com
const admin = require('firebase-admin');
const path = require('path');
const logger = require('../utils/logger');

if (!admin.apps.length) {
  const serviceAccount = require(path.join(__dirname, '..', 'services', 'SheetsCred.env.json'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
const CENTER = 'test';

(async () => {
  const email = process.argv[2];
  if (!email) { logger.error('usage: node scripts/seedTestCenter.js <admin-email>'); process.exit(1); }
  const center = db.collection('centers').doc(CENTER);

  await center.collection('config').doc('global').set({
    kinds: ['טסט-זן'], sizes: ['S', 'M', 'L'], destinations: ['יעד-טסט'],
    farmers: [{ name: 'חקלאי-טסט', allowGidon: false }],
    farmerConfigs: {},
  }, { merge: true });

  await center.collection('users').doc(email).set({ role: 'admin' }, { merge: true });

  const records = center.collection('farmers').doc('חקלאי-טסט').collection('records');
  const existing = await records.limit(1).get();
  if (existing.empty) {
    await records.add({
      harvestDate: '2026-07-25', palletNumber: 1, boxes: 10, kind: 'טסט-זן', size: 'M',
      weight: 0, destination: '', sent: false, gidon: false, mark: false,
      editedBy: 'seed', editedAt: new Date().toISOString(),
    });
  }
  logger.info(`[seedTestCenter] centers/${CENTER} ready; admin: ${email}`);
  process.exit(0);
})();
