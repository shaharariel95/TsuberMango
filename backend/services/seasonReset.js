// Season reset: clears one center's operational data — every farmer's records + audit, all
// certificates (with versions) and realtime farmer_events. Keeps config, users, the farmers/{name}
// documents (certificateProfile: numbering continues across seasons) and backups.
// Dry run unless { execute: true }. Executing requires a backup from the last 24 h
// (top-level `backups` metadata) unless { skipBackupCheck: true }.
const logger = require('../utils/logger');

const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function assertRecentBackup(db, now) {
  const snap = await db.collection('backups').orderBy('timestamp', 'desc').limit(1).get();
  const latest = snap.empty ? null : snap.docs[0].data().timestamp?.toDate?.();
  if (!latest || now.getTime() - latest.getTime() > BACKUP_MAX_AGE_MS) {
    throw new Error(`No backup in the last 24 hours (latest: ${latest ? latest.toISOString() : 'none'}). Run one from Settings → גיבויים first.`);
  }
}

async function resetSeason(db, centerId, { execute = false, skipBackupCheck = false, now = new Date() } = {}) {
  const center = db.collection('centers').doc(centerId);
  const farmerRefs = await center.collection('farmers').listDocuments();
  const farmers = {};
  for (const ref of farmerRefs) {
    const [records, audit] = await Promise.all([ref.collection('records').count().get(), ref.collection('audit').count().get()]);
    farmers[ref.id] = { records: records.data().count, audit: audit.data().count };
  }
  const certSnap = await center.collection('certificates').get();
  let certificateVersions = 0;
  for (const d of certSnap.docs) certificateVersions += (await d.ref.collection('versions').count().get()).data().count;
  const farmerEvents = (await center.collection('farmer_events').count().get()).data().count;
  const summary = { executed: false, farmers, certificates: certSnap.size, certificateVersions, farmerEvents };
  logger.info(`[seasonReset] ${centerId} ${execute ? 'EXECUTE' : 'dry run'}: ${JSON.stringify(summary)}`);
  if (!execute) return summary;

  if (skipBackupCheck) logger.warn(`[seasonReset] ${centerId}: backup check SKIPPED`);
  else await assertRecentBackup(db, now);

  for (const ref of farmerRefs) {
    await db.recursiveDelete(ref.collection('records'));
    await db.recursiveDelete(ref.collection('audit'));
  }
  await db.recursiveDelete(center.collection('certificates'));
  await db.recursiveDelete(center.collection('farmer_events'));
  logger.info(`[seasonReset] ${centerId}: season data cleared`);
  return { ...summary, executed: true };
}

module.exports = { resetSeason };
