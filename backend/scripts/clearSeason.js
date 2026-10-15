// Clear one season's operational data (records, audit, certificates, realtime events) for the
// center in CENTER_ID. Keeps config, users, farmer certificate profiles and backups.
// Dry run by default (prints counts). To delete:
//   node scripts/clearSeason.js --execute --center <CENTER_ID> [--skip-backup-check]
// One farmer only (records, audit, certificates; nothing else): add --farmer <name>.
// Executing requires a backup from the last 24 h unless --skip-backup-check (pre-season test data).
require('dotenv').config({ quiet: true });
const { adminInitOptions } = require('../utils/gcpCredentials');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');
const { resetSeason } = require('../services/seasonReset');
const { argValue } = require('./cliArgs');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
let centerArg, farmerArg;
try { centerArg = argValue(args, '--center'); farmerArg = argValue(args, '--farmer'); }
catch (err) { logger.error(`[clearSeason] ${err.message}`); process.exit(1); }
const execute = flag('--execute') && centerArg === CENTER_ID;

if (!getApps().length) initializeApp(adminInitOptions());

(async () => {
  if (flag('--execute') && !execute) {
    logger.error(`[clearSeason] --execute needs --center ${CENTER_ID} (the resolved CENTER_ID) — running as a dry run instead`);
  }
  const out = await resetSeason(getFirestore(), CENTER_ID, { execute, skipBackupCheck: flag('--skip-backup-check'),
    farmer: farmerArg || null });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((err) => { logger.error(`[clearSeason] ${err.message}`); process.exit(1); });
