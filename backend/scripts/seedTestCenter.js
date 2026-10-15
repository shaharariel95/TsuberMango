// backend/scripts/seedTestCenter.js
// Idempotent: stand up centers/test with a small config + fake farmer/records,
// and add the developer as an admin user of the test center.
// Run: node scripts/seedTestCenter.js your-email@gmail.com
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { adminInitOptions } = require('../utils/gcpCredentials');
const logger = require('../utils/logger');

if (!getApps().length) initializeApp(adminInitOptions());
const db = getFirestore();
const CENTER = 'test';

(async () => {
  const emails = process.argv.slice(2);
  if (!emails.length) { logger.error('usage: node scripts/seedTestCenter.js <admin-email> [more-admin-emails...]'); process.exit(1); }
  const center = db.collection('centers').doc(CENTER);

  await center.collection('config').doc('global').set({
    kinds: ['טסט-זן'], sizes: ['S', 'M', 'L'], destinations: ['יעד-טסט'],
    farmers: [{ name: 'חקלאי-טסט', allowGidon: false }],
    farmerConfigs: {},
  }, { merge: true });

  await center.collection('farmers').doc('חקלאי-טסט').set({
    certificateProfile: {
      headerLines: ['חקלאי טסט', "משק מס' 1", 'מושב טסט', 'נייד: 050-0000000', 'עוסק מורשה 000000000'],
      driverName: 'אדם', nextNumber: 1000,
    },
  }, { merge: true });

  for (const email of emails) {
    await center.collection('users').doc(email).set({ role: 'admin' }, { merge: true });
  }

  const records = center.collection('farmers').doc('חקלאי-טסט').collection('records');
  const existing = await records.limit(1).get();
  if (existing.empty) {
    await records.add({
      harvestDate: '2026-07-25', palletNumber: 1, boxes: 10, kind: 'טסט-זן', size: 'M',
      weight: 0, destination: '', sent: false, gidon: false, mark: false,
      editedBy: 'seed', editedAt: new Date().toISOString(),
    });
  }
  logger.info(`[seedTestCenter] centers/${CENTER} ready; admins: ${emails.join(', ')}`);
  process.exit(0);
})();
