// services/backupService.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const admin = require('firebase-admin');
const FirestoreRepository = require('../repositories/FirestoreRepository');
const { CENTER_ID } = require('../config/center');
const logger = require('../utils/logger');

// GCS client — reuses the same service-account key already present for Firebase.
// The key file lives in services/ (same one app.js uses).
const storage = new Storage({
    keyFilename: path.join(__dirname, 'SheetsCred.env.json'),
});

const BUCKET_NAME = process.env.GCS_BACKUP_BUCKET;
const BACKUPS_COLLECTION = 'backups';

/**
 * Build a complete, self-contained backup of one center (payload v2).
 * Every farmers/{name} doc is included (also ones missing from the config list), with soft-deleted
 * records. Any read failure rejects — a backup is all-or-nothing.
 */
async function buildBackupPayload(db, centerId) {
    const center = db.collection('centers').doc(centerId);
    const records = new FirestoreRepository(db, centerId);

    const configSnap = await center.collection('config').doc('global').get();
    const usersSnap = await center.collection('users').get();
    const farmerRefs = await center.collection('farmers').listDocuments();

    const farmerDocs = {};
    const farmers = {};
    const audit = {};
    for (const ref of farmerRefs) {
        const docSnap = await ref.get();
        if (docSnap.exists) farmerDocs[ref.id] = docSnap.data();
        farmers[ref.id] = await records.getRecords(ref.id, { includeDeleted: true });
        const auditSnap = await ref.collection('audit').get();
        audit[ref.id] = auditSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const certSnap = await center.collection('certificates').get();
    const certificates = [];
    for (const d of certSnap.docs) {
        const vs = await d.ref.collection('versions').get();
        const versions = vs.docs.map(v => ({ n: Number(v.id), ...v.data() })).sort((x, y) => x.n - y.n);
        certificates.push({ id: d.id, ...d.data(), versions });
    }

    return {
        version: 2,
        timestamp: new Date().toISOString(),
        centerId,
        config: configSnap.exists ? configSnap.data() : null,
        users: Object.fromEntries(usersSnap.docs.map(d => [d.id, d.data()])),
        farmerDocs,
        farmers,
        audit,
        certificates,
    };
}

/**
 * Perform a full backup of the center to GCS and record metadata in Firestore.
 * All-or-nothing: any read failure aborts before upload and before the metadata doc.
 *
 * @param {string} triggeredBy  - email of the user who requested the backup
 * @returns {{ filename: string, rowCount: number, farmerCount: number }}
 */
async function runBackup(triggeredBy) {
    // Guard: never let a test/emulator run reach the real bucket.
    if ((process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) && process.env.ALLOW_REAL_GCS !== 'true') {
        throw new Error('Backup upload is disabled while running against the Firebase emulators');
    }
    if (!BUCKET_NAME) {
        throw new Error('GCS_BACKUP_BUCKET environment variable is not set');
    }

    logger.info(`[backupService] Starting backup — triggeredBy: ${triggeredBy}`);

    const db = admin.firestore();
    const payload = await buildBackupPayload(db, CENTER_ID);
    const timestamp = new Date(payload.timestamp);
    const filename = `backups/${payload.timestamp.slice(0, 10)}.json`; // YYYY-MM-DD
    const farmerCount = Object.keys(payload.farmers).length;
    const rowCount = Object.values(payload.farmers).reduce((n, rows) => n + rows.length, 0);

    logger.info(`[backupService] Payload built — filename: ${filename}, farmers: ${farmerCount}, rows: ${rowCount}`);

    const body = JSON.stringify(payload, null, 2);
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filename);

    await file.save(body, {
        contentType: 'application/json',
        metadata: {
            cacheControl: 'no-cache',
        },
    });

    logger.info(`[backupService] Uploaded ${filename} to gs://${BUCKET_NAME} (${body.length} bytes)`);

    await db.collection(BACKUPS_COLLECTION).add({
        timestamp: admin.firestore.Timestamp.fromDate(timestamp),
        filename,
        farmerCount,
        rowCount,
        triggeredBy,
    });

    logger.info(`[backupService] Backup record saved to Firestore. rowCount=${rowCount}, farmerCount=${farmerCount}`);

    return { filename, rowCount, farmerCount };
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

module.exports = { runBackup, getRecentBackups, buildBackupPayload };
