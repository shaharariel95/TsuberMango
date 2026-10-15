// Restore a backup payload (v1: { timestamp, farmers }, v2: see backupService.buildBackupPayload)
// into a center. Dry run unless { execute: true }. Never overwrites records, audit or certificates: a farmer
// whose records/audit already exist, or a certificate id that exists, is a blocker and execute refuses.
// Farmer docs (certificateProfile) are merged; certificateProfile.nextNumber never goes down.
// Fridge rooms (+ move log) only with { withFridge } (full restores only); a non-empty target room or log is a blocker.
// Ids are preserved. No realtime events are written — clients reload.
const logger = require('../utils/logger');

function stripId({ id, ...rest }) { return rest; }

const badId = (id) => id == null || id === '' || String(id).includes('/') || String(id) === '.' || String(id) === '..' || /^__.*__$/.test(String(id));
const toInt = (n) => { const v = typeof n === 'string' && n.trim() === '' ? NaN : Number(n); return Number.isInteger(v) ? v : null; };

async function restoreBackup(db, centerId, payload, { execute = false, farmer = null, withConfig = false, withFridge = false } = {}) {
  if (!payload || typeof payload !== 'object' || typeof payload.timestamp !== 'string'
      || !payload.farmers || typeof payload.farmers !== 'object') {
    throw new Error('Input is not a backup (needs timestamp + farmers)');
  }
  const version = payload.version === 2 ? 2 : 1;
  if (withConfig && (farmer || version !== 2)) throw new Error('--with-config needs a full (no --farmer) restore of a v2 backup');
  if (withFridge && farmer) throw new Error('--with-fridge needs a full (no --farmer) restore');
  if (farmer && !(farmer in payload.farmers)) throw new Error(`Farmer "${farmer}" is not in this backup`);

  const center = db.collection('centers').doc(centerId);
  const names = farmer ? [farmer] : Object.keys(payload.farmers);
  const audit = payload.audit || {};
  const farmerDocs = payload.farmerDocs || {};
  const certificates = (payload.certificates || []).filter(c => !farmer || c.farmer === farmer);

  const blockers = [];
  const farmers = {};
  const profiles = {};
  const targetFarmerDocs = {};
  for (const name of names) {
    const recs = payload.farmers[name];
    if (!Array.isArray(recs) || recs.some(r => !r || badId(r.id))) throw new Error(`Record without id in farmer "${name}"`);
    if ((audit[name] || []).some(e => !e || badId(e.id))) throw new Error(`Audit entry without id in farmer "${name}"`);
    const ref = center.collection('farmers').doc(name);
    const cur = await ref.get();
    targetFarmerDocs[name] = cur.exists ? cur.data() : null;
    const curNext = targetFarmerDocs[name]?.certificateProfile?.nextNumber;
    const bakNext = farmerDocs[name]?.certificateProfile?.nextNumber;
    profiles[name] = { current: toInt(curNext), backup: toInt(bakNext) };
    farmers[name] = { records: recs.length, audit: (audit[name] || []).length };
    const [r, a] = await Promise.all([ref.collection('records').limit(1).get(), ref.collection('audit').limit(1).get()]);
    if (!r.empty) blockers.push(`farmer "${name}": records not empty`);
    if (!a.empty) blockers.push(`farmer "${name}": audit not empty`);
  }
  for (const c of certificates) {
    if (!c || badId(c.id)) throw new Error('Certificate without a valid id in backup');
    if ((c.versions || []).some(v => !v || v.n == null || Number.isNaN(Number(v.n)))) throw new Error(`Certificate ${c.id} has a version without n`);
  }
  for (const c of certificates) {
    if ((await center.collection('certificates').doc(c.id).get()).exists) blockers.push(`certificate ${c.id} exists`);
  }
  const fridgeRooms = withFridge ? Object.entries(payload.fridge || {}) : [];
  for (const [roomId, r] of fridgeRooms) {
    if (badId(roomId)) throw new Error(`Fridge room with an invalid id in backup: ${roomId}`);
    if ((r.log || []).some(e => !e || badId(e.id))) throw new Error(`Fridge log entry without id in room "${roomId}"`);
    const ref = center.collection('fridge').doc(roomId);
    const cur = await ref.get();
    if (cur.exists && Object.keys(cur.data().cells || {}).length) blockers.push(`fridge room "${roomId}": cells not empty`);
    if (!(await ref.collection('log').limit(1).get()).empty) blockers.push(`fridge room "${roomId}": log not empty`);
  }
  const summary = {
    executed: false, version, backupTimestamp: payload.timestamp, farmers, profiles,
    farmerDocs: names.filter(n => farmerDocs[n]).length,
    certificates: certificates.length,
    certificateVersions: certificates.reduce((s, c) => s + (c.versions || []).length, 0),
    config: withConfig, users: withConfig ? Object.keys(payload.users || {}).length : 0,
    fridge: withFridge ? {
      rooms: fridgeRooms.length,
      cells: fridgeRooms.reduce((n, [, r]) => n + Object.keys(r.doc?.cells || {}).length, 0),
      log: fridgeRooms.reduce((n, [, r]) => n + (r.log || []).length, 0),
    } : null,
    blockers,
  };
  logger.info(`[backupRestore] ${centerId} ${execute ? 'EXECUTE' : 'dry run'} from ${payload.timestamp}: ${JSON.stringify(summary)}`);
  if (!execute) return summary;
  if (blockers.length) throw new Error(`Target is not empty — nothing written: ${blockers.join('; ')}`);

  const writer = db.bulkWriter();
  let failed = null;
  writer.onWriteError((err) => {
    if (err.failedAttempts < 5 && [4, 8, 10, 13, 14].includes(err.code)) return true; // transient: retry
    failed = failed || err;
    return false;
  });
  const set = (ref, data, opts) => { writer.set(ref, data, opts).catch(() => {}); };
  try {
  for (const name of names) {
    const ref = center.collection('farmers').doc(name);
    if (farmerDocs[name]) {
      const data = JSON.parse(JSON.stringify(farmerDocs[name]));
      const { current, backup } = profiles[name];
      if (current != null && data.certificateProfile) data.certificateProfile.nextNumber = backup != null ? Math.max(current, backup) : current;
      set(ref, data, { merge: true });
    }
    for (const rec of payload.farmers[name]) set(ref.collection('records').doc(String(rec.id)), stripId(rec));
    for (const e of audit[name] || []) set(ref.collection('audit').doc(String(e.id)), stripId(e));
  }
  for (const c of certificates) {
    const { versions = [], ...cert } = stripId(c);
    const certRef = center.collection('certificates').doc(String(c.id));
    set(certRef, cert);
    for (const { n, ...v } of versions) set(certRef.collection('versions').doc(String(n)), v);
  }
  if (withConfig) {
    if (payload.config) set(center.collection('config').doc('global'), payload.config);
    for (const [email, data] of Object.entries(payload.users || {})) set(center.collection('users').doc(email), data);
  }
  for (const [roomId, r] of fridgeRooms) {
    const ref = center.collection('fridge').doc(roomId);
    if (r.doc) set(ref, r.doc);
    for (const e of r.log || []) set(ref.collection('log').doc(String(e.id)), stripId(e));
  }
  } catch (e) { failed = failed || e; } // synchronous validation error while queueing
  await writer.close();
  if (failed) throw new Error(`Restore failed — partial data may have been written: ${failed.message}`);
  logger.info(`[backupRestore] ${centerId}: restored backup from ${payload.timestamp}`);
  return { ...summary, executed: true };
}

module.exports = { restoreBackup };
