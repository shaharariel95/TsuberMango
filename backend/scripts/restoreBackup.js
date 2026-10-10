// Restore a backup into the center in CENTER_ID. Dry run by default (prints what would be written
// and any blockers). Source: --file <path> or --gcs <latest|YYYY-MM-DD|backups/…json> (bucket GCS_BACKUP_BUCKET).
//   node scripts/restoreBackup.js --gcs latest
//   node scripts/restoreBackup.js --gcs 2027-06-14 --execute --center <CENTER_ID> [--farmer <name>] [--with-config]
// Never overwrites records, audit or certificates (clear first with scripts/clearSeason.js [--farmer <name>]); farmer details are merged and nextNumber never goes down.
// Restore drill (no production writes): run under the Firestore emulator with CENTER_ID=drill — see NEW_SEASON.md.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');
const { restoreBackup } = require('../services/backupRestore');
const { resolveBackupName } = require('../services/backupNames');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const keyFile = path.join(__dirname, '..', 'services', 'SheetsCred.env.json');

async function readSource() {
  if (value('--file')) return JSON.parse(fs.readFileSync(value('--file'), 'utf8'));
  const which = value('--gcs');
  if (!which) throw new Error('Give --file <path> or --gcs <latest|YYYY-MM-DD|backups/…json>');
  const bucketName = process.env.GCS_BACKUP_BUCKET;
  if (!bucketName) throw new Error('GCS_BACKUP_BUCKET is not set');
  const { Storage } = require('@google-cloud/storage');
  const bucket = new Storage(fs.existsSync(keyFile) ? { keyFilename: keyFile } : {}).bucket(bucketName);
  let name = which;
  if (which === 'latest' || /^\d{4}-\d{2}-\d{2}$/.test(which)) {
    const [files] = await bucket.getFiles({ prefix: 'backups/' }); // read-only listing
    const r = resolveBackupName(files.map(f => f.name), which);
    name = r.name;
    logger.info(`[restoreBackup] candidates: ${r.candidates.join(', ')} -> using ${name}`);
  }
  logger.info(`[restoreBackup] reading gs://${bucketName}/${name}`);
  const [buf] = await bucket.file(name).download(); // read-only
  return JSON.parse(buf.toString('utf8'));
}

(async () => {
  if (!admin.apps.length) {
    admin.initializeApp(fs.existsSync(keyFile)
      ? { credential: admin.credential.cert(require(keyFile)), projectId: process.env.FIREBASE_PROJECT_ID }
      : { projectId: process.env.FIREBASE_PROJECT_ID || 'demo-tsuber' });
  }
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `EMULATOR ${process.env.FIRESTORE_EMULATOR_HOST}` : 'REAL Firestore';
  logger.info(`[restoreBackup] target: ${target}, center: ${CENTER_ID}`);
  if (flag('--execute') && !process.env.FIRESTORE_EMULATOR_HOST && CENTER_ID !== 'tsuberi') {
    throw new Error('Real Firestore execute is only allowed for the production center (tsuberi); drills must run under the emulator (firebase emulators:exec)');
  }
  const execute = flag('--execute') && value('--center') === CENTER_ID;
  if (flag('--execute') && !execute) {
    logger.error(`[restoreBackup] --execute needs --center ${CENTER_ID} (the resolved CENTER_ID) — running as a dry run instead`);
  }
  const payload = await readSource();
  const out = await restoreBackup(admin.firestore(), CENTER_ID, payload,
    { execute, farmer: value('--farmer') || null, withConfig: flag('--with-config') });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((err) => { logger.error(`[restoreBackup] ${err.message}`); process.exit(1); });
