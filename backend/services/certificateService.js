// Orchestrates certificate operations: validation, repository transactions, then the
// side effects every write owes (audit entries + realtime event), in that order.
const repo = require('../repositories');
const { CertificateError } = require('../repositories/FirestoreCertificateRepository');
const core = require('./certificateCore');
const firestoreEventService = require('./firestoreEventService');
const logger = require('../utils/logger');

const MESSAGES = {
  NO_PROFILE: () => 'חסרים פרטי תעודה לחקלאי — הגדר בהגדרות',
  ALREADY_CERTIFIED: (d) => d.conflicts.map(c => `משטח ${c.palletNumber} כבר בתעודה ${c.certificateNumber} — הסר אותו מהתעודה כדי להפיק חדשה`).join(' · '),
  INVALID_SELECTION: (d) => d.errors.join(' · '),
  RECORD_NOT_FOUND: () => 'משטח לא נמצא',
  CERTIFICATE_NOT_FOUND: () => 'התעודה לא נמצאה',
  CERTIFICATE_CANCELLED: () => 'התעודה בוטלה',
  NOT_ON_CERTIFICATE: () => 'המשטח אינו בתעודה זו',
  MIXED_ON_CERTIFICATE: (d) => `משטח ${d.palletNumber} שונה ביעד/תאריך משאר התעודה — הסר אותו מהתעודה`,
  NUMBER_TAKEN: (d) => `מספר התעודה ${d.number} כבר קיים — עדכן את "מספר התעודה הבא" בהגדרות`,
};

function toHttpError(err) {
  if (err instanceof CertificateError) {
    return { status: err.status, body: { error: (MESSAGES[err.code] || (() => err.code))(err.details || {}), code: err.code, ...err.details } };
  }
  return null;
}

// Audit entries stay per record; the realtime event is one bulk_update per request (rapid writes to the
// same farmer_events doc can be coalesced, so listeners would miss intermediate states).
function audit(farmer, records, action, actor) {
  const editedAt = new Date().toISOString();
  Promise.allSettled(records.map(r => repo.appendAuditLog(farmer, {
    recordId: r.id, palletNumber: r.palletNumber, action, editedBy: actor, editedAt,
  })));
}

// "Certified" = the record's cardId points at an existing certificate doc. A cardId with no doc is legacy
// (pre-task-20 / manual stamping) data: it can be edited, cleared or reset like an uncertified pallet.
async function isCertified(farmer, record) {
  if (!record || record.cardId === '' || record.cardId == null) return false;
  return repo.certificates.exists(`${farmer}__${record.cardId}`);
}

async function preview({ farmer, recordIds }) {
  logger.info(`[certificateService.preview] farmer=${farmer} records=${recordIds.length}`);
  const records = (await repo.getRecords(farmer)).filter(r => recordIds.includes(r.id));
  if (records.length !== new Set(recordIds).size) throw new CertificateError(404, 'RECORD_NOT_FOUND');
  const profile = await repo.certificates.getProfile(farmer);
  if (!profile || !Number.isInteger(profile.nextNumber)) throw new CertificateError(400, 'NO_PROFILE');
  const plan = core.planIssue(records);
  if (plan.conflicts.length) {
    throw new CertificateError(409, 'ALREADY_CERTIFIED',
      { conflicts: plan.conflicts.map(c => ({ ...c, certificateId: `${farmer}__${c.certificateNumber}` })) });
  }
  if (plan.errors.length) throw new CertificateError(400, 'INVALID_SELECTION', { errors: plan.errors });
  return { destination: plan.destination, shipmentDate: plan.shipmentDate,
    chunks: plan.chunks.map(c => ({ rows: c.length, pallets: new Set(c.map(r => String(r.palletNumber))).size })) };
}

async function issue({ farmer, recordIds, actor }) {
  logger.info(`[certificateService.issue] farmer=${farmer} records=${recordIds.length} by=${actor}`);
  const issued = await repo.certificates.issue({ farmer, recordIds, actor });
  issued.forEach(c => audit(farmer, c.records, `הפקת תעודה ${c.number}`, actor));
  firestoreEventService.emitBulkUpdate(farmer, issued.flatMap(c => c.records), actor);
  logger.info(`[certificateService.issue] issued ${issued.map(c => c.number).join(', ')}`);
  return issued.map(({ id, number, snapshot }) => ({ id, number, snapshot }));
}

async function reprint({ id, actor }) {
  const result = await repo.certificates.reprint({ id, actor });
  logger.info(`[certificateService.reprint] ${id} version=${result.version} created=${result.created}`);
  return result;
}

// opts.emit=false: the caller batches the realtime event itself (resetPallets); the touched record
// is returned as `record` so it can be included in that single event. Audit is always written here.
async function removePallet({ id, recordId, actor }, { emit = true } = {}) {
  const result = await repo.certificates.removePallet({ id, recordId, actor });
  if (result.record) {
    audit(result.farmer, [result.record], `הוסר מתעודה ${result.snapshot.number}`, actor);
    if (emit) firestoreEventService.emitBulkUpdate(result.farmer, [result.record], actor);
  }
  logger.info(`[certificateService.removePallet] ${id} record=${recordId} cancelled=${result.cancelled}`);
  return { snapshot: result.snapshot, version: result.version, cancelled: result.cancelled, record: result.record };
}

async function list({ farmer, from, to }) {
  logger.info(`[certificateService.list] farmer=${farmer} from=${from || ''} to=${to || ''}`);
  return (await repo.certificates.list(farmer))
    .filter(c => (!from || c.shipmentDate >= from) && (!to || c.shipmentDate <= to));
}

async function get(id) {
  logger.info(`[certificateService.get] ${id}`);
  return repo.certificates.get(id);
}

async function getVersion(id, n) {
  logger.info(`[certificateService.getVersion] ${id} v${n}`);
  return repo.certificates.getVersion(id, n);
}

module.exports = { isCertified, preview, issue, reprint, removePallet, list, get, getVersion, toHttpError };
