// One-off pre-season script (task 20): reads the old per-farmer label sheets once. It is the last user of `googleapis` — delete it and drop `googleapis` from package.json after production seeding.
// One-time, idempotent: seed centers/{CENTER_ID}/farmers/{name}.certificateProfile from each
// farmer's legacy label spreadsheet (read-only on Sheets). Skips farmers that already have a
// profile or whose sheet is not readable. Run: node scripts/seedCertificateProfiles.js [--dry-run]
require('dotenv').config();
const path = require('path');
const { adminInitOptions } = require('../utils/gcpCredentials');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');

const LEGACY = {
  'גבי צוברי': 'SHIPPING_LABELS_ID_TSUBERI', 'אבנר לוי': 'SHIPPING_LABELS_ID_AVNER', 'עידן לוי': 'SHIPPING_LABELS_ID_IDAN',
  'גמליאל': 'SHIPPING_LABELS_ID_PESAH', 'קופלר': 'SHIPPING_LABELS_ID_KOPLER', 'עטר שחק': 'SHIPPING_LABELS_ID_SHAHAK',
  'ברק מלצר': 'SHIPPING_LABELS_ID_MELTZER',
};
const dryRun = process.argv.includes('--dry-run');
const keyFile = path.join(__dirname, '..', 'services', 'SheetsCred.env.json');

if (!admin.apps.length) admin.initializeApp(adminInitOptions({ admin, keyFile }));

(async () => {
  const db = admin.firestore();
  const sheets = google.sheets({ version: 'v4', auth: await new google.auth.GoogleAuth({ keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] }).getClient() });
  for (const [farmer, envVar] of Object.entries(LEGACY)) {
    const ref = db.collection('centers').doc(CENTER_ID).collection('farmers').doc(farmer);
    const existing = await ref.get();
    if (existing.exists && existing.data().certificateProfile) { logger.info(`[seed] ${farmer}: has profile — skip`); continue; }
    const spreadsheetId = process.env[envVar];
    if (!spreadsheetId) { logger.warn(`[seed] ${farmer}: ${envVar} unset — enter in Settings`); continue; }
    try {
      const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: ['base!A1:A5', 'base!D7', 'base!A26:L26'] }, { timeout: 20000 });
      const [header, num, driverRow] = res.data.valueRanges.map(v => v.values || []);
      const headerLines = [0, 1, 2, 3, 4].map(i => String((header[i] || [])[0] || '').trim());
      const current = parseInt((num[0] || [])[0], 10);
      const driverCells = (driverRow[0] || []).map(c => String(c).trim()).filter(Boolean);
      const driverName = driverCells.includes('אדם') ? 'אדם' : '';
      if (!Number.isInteger(current)) throw new Error(`base!D7 is not a number`);
      const profile = { headerLines, driverName, nextNumber: current + 1 };
      logger.info(`[seed] ${farmer}: ${JSON.stringify(profile)}${dryRun ? ' (dry run)' : ''}`);
      if (!dryRun) await ref.set({ certificateProfile: profile }, { merge: true });
    } catch (err) {
      logger.warn(`[seed] ${farmer}: cannot read sheet (${err.message}) — enter in Settings`);
    }
  }
  process.exit(0);
})();
