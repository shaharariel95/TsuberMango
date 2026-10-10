// Restore a backup payload (v1: { timestamp, farmers }, v2: see backupService.buildBackupPayload)
// into a center. Dry run unless { execute: true }. Never overwrites: a farmer whose records/audit
// already exist, or a certificate id that exists, is a blocker and execute refuses.
// Ids are preserved. No realtime events are written — clients reload.
const logger = require('../utils/logger');

function stripId({ id, ...rest }) { return rest; }

async function restoreBackup(db, centerId, payload, { execute = false, farmer = null, withConfig = false } = {}) {
  if (!payload || typeof payload !== 'object' || typeof payload.timestamp !== 'string'
      || !payload.farmers || typeof payload.farmers !== 'object') {
    throw new Error('Input is not a backup (needs timestamp + farmers)');
  }
  const version = payload.version === 2 ? 2 : 1;
  if (withConfig && (farmer || version !== 2)) throw new Error('--with-config needs a full (no --farmer) restore of a v2 backup');
  if (farmer && !(farmer in payload.farmers)) throw new Error(`Farmer "${farmer}" is not in this backup`);

  const center = db.collection('centers').doc(centerId);
  const names = farmer ? [farmer] : Object.keys(payload.farmers);
  const audit = payload.audit || {};
  const farmerDocs = payload.farmerDocs || {};
  const certificates = (payload.certificates || []).filter(c => !farmer || c.farmer === farmer);

  const blockers = [];
  const farmers = {};
  for (const name of names) {
    const recs = payload.farmers[name];
    if (!Array.isArray(recs) || recs.some(r => !r || !r.id)) throw new Error(`Record without id in farmer "${name}"`);
    if ((audit[name] || []).some(e => !e || !e.id)) throw new Error(`Audit entry without id in farmer "${name}"`);
    const ref = center.collection('farmers').doc(name);
    farmers[name] = { records: recs.length, audit: (audit[name] || []).length };
    const [r, a] = await Promise.all([ref.collection('records').limit(1).get(), ref.collection('audit').limit(1).get()]);
    if (!r.empty) blockers.push(`farmer "${name}": records not empty`);
    if (!a.empty) blockers.push(`farmer "${name}": audit not empty`);
  }
  for (const c of certificates) {
    if ((await center.collection('certificates').doc(c.id).get()).exists) blockers.push(`certificate ${c.id} exists`);
  }
  const summary = {
    executed: false, version, backupTimestamp: payload.timestamp, farmers,
    farmerDocs: names.filter(n => farmerDocs[n]).length,
    certificates: certificates.length,
    certificateVersions: certificates.reduce((s, c) => s + (c.versions || []).length, 0),
    config: withConfig, users: withConfig ? Object.keys(payload.users || {}).length : 0,
    blockers,
  };
  logger.info(`[backupRestore] ${centerId} ${execute ? 'EXECUTE' : 'dry run'} from ${payload.timestamp}: ${JSON.stringify(summary)}`);
  if (!execute) return summary;
  if (blockers.length) throw new Error(`Target is not empty — nothing written: ${blockers.join('; ')}`);

  const writer = db.bulkWriter();
  let failed = null;
  writer.onWriteError((err) => { failed = failed || err; return false; });
  for (const name of names) {
    const ref = center.collection('farmers').doc(name);
    if (farmerDocs[name]) writer.set(ref, farmerDocs[name], { merge: true });
    for (const rec of payload.farmers[name]) writer.set(ref.collection('records').doc(rec.id), stripId(rec));
    for (const e of audit[name] || []) writer.set(ref.collection('audit').doc(e.id), stripId(e));
  }
  for (const c of certificates) {
    const { versions = [], ...cert } = stripId(c);
    const certRef = center.collection('certificates').doc(c.id);
    writer.set(certRef, cert);
    for (const { n, ...v } of versions) writer.set(certRef.collection('versions').doc(String(n)), v);
  }
  if (withConfig) {
    if (payload.config) writer.set(center.collection('config').doc('global'), payload.config);
    for (const [email, data] of Object.entries(payload.users || {})) writer.set(center.collection('users').doc(email), data);
  }
  await writer.close();
  if (failed) throw new Error(`Restore write failed (partial data may have been written): ${failed.message}`);
  logger.info(`[backupRestore] ${centerId}: restored backup from ${payload.timestamp}`);
  return { ...summary, executed: true };
}

module.exports = { restoreBackup };
