// Add test farmers to centers/{CENTER_ID}/config/global (field `farmers`).
// Idempotent — skips names already present, preserves all other config fields.
// Run seedCenterNamespace.js FIRST (this needs the namespaced config to exist).
//
// Usage:
//   node scripts/addTestFarmers.js                       (adds the two defaults)
//   node scripts/addTestFarmers.js "Name A" "Name B"     (custom names)
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

// { name, allowGidon } — matches the existing config.farmers shape.
const TEST_FARMERS = [
  { name: process.argv[2] || 'מטע בדיקה 1', allowGidon: false },
  { name: process.argv[3] || 'מטע בדיקה 2', allowGidon: false },
];

async function run() {
  const ref = db.collection('centers').doc(CENTER_ID).collection('config').doc('global');
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`config/global not found under centers/${CENTER_ID} — run seedCenterNamespace.js first`);
  }

  const data = snap.data();
  const farmers = Array.isArray(data.farmers) ? [...data.farmers] : [];
  const existing = new Set(farmers.map(f => f.name));

  let added = 0;
  for (const tf of TEST_FARMERS) {
    if (existing.has(tf.name)) {
      console.log(`already present, skipping: ${tf.name}`);
      continue;
    }
    farmers.push(tf);
    added++;
    console.log(`adding: ${tf.name}`);
  }

  if (added > 0) {
    await ref.update({ farmers }); // only touches the `farmers` field
    console.log(`done — added ${added} test farmer(s) to center "${CENTER_ID}"`);
  } else {
    console.log('no new farmers to add');
  }
}

run().then(() => process.exit(0)).catch(err => { console.error(err.message); process.exit(1); });
