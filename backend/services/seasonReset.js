// Season reset: clears one center's operational data — every farmer's records + audit, all
// certificates (with versions), realtime farmer_events and the fridge map (rooms + move log;
// with --farmer only that farmer's cells). Keeps config, users, the farmers/{name}
// documents (certificateProfile: numbering continues across seasons) and backups.
// Dry run unless { execute: true }. Executing requires a backup from the last 24 h
// (top-level `backups` metadata) unless { skipBackupCheck: true }.
const logger = require('../utils/logger');
const { FirestoreFridgeRepository } = require('../repositories/FirestoreFridgeRepository');

const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function assertRecentBackup(db, now) {
  const snap = await db.collection('backups').orderBy('timestamp', 'desc').limit(1).get();
  const latest = snap.empty ? null : snap.docs[0].data().timestamp?.toDate?.();
  if (!latest || now.getTime() - latest.getTime() > BACKUP_MAX_AGE_MS) {
    throw new Error(`No backup in the last 24 hours (latest: ${latest ? latest.toISOString() : 'none'}). Run one from Settings → גיבויים first.`);
  }
}

// { farmer } scopes the reset to one farmer: its records + audit and its certificates (farmer field), leaving
// everything else (other farmers, farmer_events) alone.
async function resetSeason(db, centerId, { execute = false, skipBackupCheck = false, now = new Date(), farmer = null } = {}) {
  const center = db.collection('centers').doc(centerId);
  let farmerRefs = await center.collection('farmers').listDocuments();
  if (farmer) {
    farmerRefs = farmerRefs.filter(r => r.id === farmer);
    if (!farmerRefs.length) throw new Error(`Farmer "${farmer}" not found`);
  }
  const farmers = {};
  for (const ref of farmerRefs) {
    const [records, audit] = await Promise.all([ref.collection('records').count().get(), ref.collection('audit').count().get()]);
    farmers[ref.id] = { records: records.data().count, audit: audit.data().count };
  }
  const certSnap = farmer
    ? await center.collection('certificates').where('farmer', '==', farmer).get()
    : await center.collection('certificates').get();
  let certificateVersions = 0;
  for (const d of certSnap.docs) certificateVersions += (await d.ref.collection('versions').count().get()).data().count;
  const farmerEvents = farmer ? 0 : (await center.collection('farmer_events').count().get()).data().count;
  const fridgeRefs = await center.collection('fridge').listDocuments();
  let fridgeCells = 0;
  let fridgeLog = 0;
  for (const ref of fridgeRefs) {
    const snap = await ref.get();
    const cells = Object.values(snap.exists ? (snap.data().cells || {}) : {});
    fridgeCells += farmer ? cells.filter(c => c.farmer === farmer).length : cells.length;
    if (!farmer) fridgeLog += (await ref.collection('log').count().get()).data().count;
  }
  const totalRecords = Object.values(farmers).reduce((n, f) => n + f.records, 0);
  const summary = { executed: false, ...(farmer ? { farmer } : {}), totalRecords, farmers, certificates: certSnap.size, certificateVersions, farmerEvents, fridgeCells, fridgeLog };
  logger.info(`[seasonReset] ${centerId} ${execute ? 'EXECUTE' : 'dry run'}: ${JSON.stringify(summary)}`);
  if (!execute) return summary;

  if (skipBackupCheck) logger.warn(`[seasonReset] ${centerId}: backup check SKIPPED`);
  else await assertRecentBackup(db, now);

  for (const ref of farmerRefs) {
    await db.recursiveDelete(ref.collection('records'));
    await db.recursiveDelete(ref.collection('audit'));
  }
  if (farmer) {
    for (const d of certSnap.docs) await db.recursiveDelete(d.ref);
    const fridgeRepo = new FirestoreFridgeRepository(db, centerId);
    for (const ref of fridgeRefs) await fridgeRepo.clearFarmer(ref.id, farmer);
  } else {
    await db.recursiveDelete(center.collection('certificates'));
    await db.recursiveDelete(center.collection('farmer_events'));
    await db.recursiveDelete(center.collection('fridge'));
  }
  logger.info(`[seasonReset] ${centerId}: season data cleared`);
  return { ...summary, executed: true };
}

module.exports = { resetSeason };
