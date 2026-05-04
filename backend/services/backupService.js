// services/backupService.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const admin = require('firebase-admin');
const sheetsService = require('./googleSheetsService');
const logger = require('../utils/logger');

// GCS client — reuses the same service-account key already present for Sheets/Firebase.
// The key file path mirrors how googleSheetsService.js resolves it.
const storage = new Storage({
    keyFilename: path.join(__dirname, 'SheetsCred.env.json'),
});

const BUCKET_NAME = process.env.GCS_BACKUP_BUCKET;
const BACKUPS_COLLECTION = 'backups';

/**
 * Retrieve the list of farmer names from Firestore config/global.
 * Falls back to an empty array if the document doesn't exist or has no farmers.
 *
 * @returns {Promise<string[]>}
 */
async function getFarmerNames() {
    const db = admin.firestore();
    const snap = await db.collection('config').doc('global').get();
    if (!snap.exists) {
        logger.info('[backupService] config/global not found — no farmers to back up');
        return [];
    }
    const data = snap.data();
    const farmers = data.farmers || [];
    // farmers is an array of { name, allowGidon } objects
    return farmers.map(f => f.name).filter(Boolean);
}

/**
 * Perform a full backup of all farmer sheets to GCS and record metadata in Firestore.
 *
 * @param {string} triggeredBy  - email of the user who requested the backup
 * @returns {{ filename: string, rowCount: number, farmerCount: number }}
 */
async function runBackup(triggeredBy) {
    if (!BUCKET_NAME) {
        throw new Error('GCS_BACKUP_BUCKET environment variable is not set');
    }

    const timestamp = new Date();
    const dateStr = timestamp.toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `backups/${dateStr}.json`;

    logger.info(`[backupService] Starting backup — filename: ${filename}, triggeredBy: ${triggeredBy}`);

    // 1. Enumerate farmers
    const farmerNames = await getFarmerNames();
    logger.info(`[backupService] Backing up ${farmerNames.length} farmers: ${farmerNames.join(', ')}`);

    // 2. Fetch all records per farmer
    const farmersData = {};
    let totalRows = 0;

    for (const farmer of farmerNames) {
        try {
            const records = await sheetsService.getAllRecords(farmer);
            farmersData[farmer] = records;
            totalRows += records.length;
            logger.info(`[backupService] Fetched ${records.length} rows for farmer: ${farmer}`);
        } catch (err) {
            // Log and continue so one bad sheet doesn't abort the whole backup
            logger.error(`[backupService] Failed to fetch records for farmer ${farmer}: ${err.message}`);
            farmersData[farmer] = [];
        }
    }

    // 3. Serialize
    const payload = JSON.stringify(
        {
            timestamp: timestamp.toISOString(),
            farmers: farmersData,
        },
        null,
        2
    );

    // 4. Upload to GCS
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filename);

    await file.save(payload, {
        contentType: 'application/json',
        metadata: {
            cacheControl: 'no-cache',
        },
    });

    logger.info(`[backupService] Uploaded ${filename} to gs://${BUCKET_NAME} (${payload.length} bytes)`);

    // 5. Write Firestore metadata record
    const db = admin.firestore();
    await db.collection(BACKUPS_COLLECTION).add({
        timestamp: admin.firestore.Timestamp.fromDate(timestamp),
        filename,
        farmerCount: farmerNames.length,
        rowCount: totalRows,
        triggeredBy,
    });

    logger.info(`[backupService] Backup record saved to Firestore. rowCount=${totalRows}, farmerCount=${farmerNames.length}`);

    return { filename, rowCount: totalRows, farmerCount: farmerNames.length };
}

/**
 * Return the last N backup records from Firestore, ordered newest first.
 *
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function getRecentBackups(limit = 7) {
    const db = admin.firestore();
    const snap = await db
        .collection(BACKUPS_COLLECTION)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

    return snap.docs.map(doc => {
        const d = doc.data();
        return {
            id: doc.id,
            timestamp: d.timestamp?.toDate?.()?.toISOString() ?? null,
            filename: d.filename,
            farmerCount: d.farmerCount,
            rowCount: d.rowCount,
            triggeredBy: d.triggeredBy,
        };
    });
}

module.exports = { runBackup, getRecentBackups };
