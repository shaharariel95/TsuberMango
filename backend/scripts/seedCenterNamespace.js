// One-time carry-over: copy top-level config/global and users/* into
// centers/{CENTER_ID}/. Idempotent — safe to re-run. Records/audit are NOT
// touched (fresh-start). Run: node scripts/seedCenterNamespace.js
require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const { CENTER_ID } = require('../config/center');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      require(path.join(__dirname, '..', 'services', 'SheetsCred.env.json'))
    ),
  });
}
const db = admin.firestore();

async function run() {
  const center = db.collection('centers').doc(CENTER_ID);
  await center.set({ name: CENTER_ID, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  const cfg = await db.collection('config').doc('global').get();
  if (cfg.exists) {
    await center.collection('config').doc('global').set(cfg.data());
    console.log('copied config/global');
  } else {
    console.log('no top-level config/global to copy');
  }

  const users = await db.collection('users').get();
  let n = 0;
  const batch = db.batch();
  users.forEach(doc => { batch.set(center.collection('users').doc(doc.id), doc.data()); n++; });
  await batch.commit();
  console.log(`copied ${n} users`);

  console.log(`seed complete for center "${CENTER_ID}"`);
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
