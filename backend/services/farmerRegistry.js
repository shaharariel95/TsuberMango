// Farmer registry — the `farmers` array of centers/{c}/config/global ({name, allowGidon, archived?}).
// Every mutation is a Firestore transaction that writes only the `farmers` field, so concurrent
// edits (another admin tab, a config save) are never lost. Archiving hides a farmer from the app;
// their records, audit, certificates and certificateProfile are never touched here.
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('../utils/logger');
const { CENTER_ID } = require('../config/center');

const configRef = () => getFirestore().collection('centers').doc(CENTER_ID).collection('config').doc('global');

class FarmerRegistryError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'FarmerRegistryError';
    this.status = status;
  }
}

// Returns { name } (trimmed) or { error } (Hebrew, shown in Settings). The name becomes a Firestore
// doc id (farmers/{name}), so path separators and reserved ids are rejected.
function validateFarmerName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return { error: 'נדרש שם חקלאי' };
  if (name.length > 50) return { error: 'שם החקלאי ארוך מדי (עד 50 תווים)' };
  if (name.includes('/') || name === '.' || name === '..' || /^__/.test(name)) {
    return { error: 'שם החקלאי מכיל תווים לא חוקיים' };
  }
  return { name };
}

async function mutateFarmers(fn) {
  return getFirestore().runTransaction(async (t) => {
    const snap = await t.get(configRef());
    const farmers = ((snap.exists && snap.data().farmers) || []).map(f => ({ ...f }));
    const result = fn(farmers);
    t.set(configRef(), { farmers }, { merge: true });
    return result;
  });
}

function findOr404(farmers, name) {
  const f = farmers.find(x => x.name === name);
  if (!f) throw new FarmerRegistryError(404, 'חקלאי לא נמצא');
  return f;
}

async function addFarmer(rawName) {
  const { name, error } = validateFarmerName(rawName);
  if (error) throw new FarmerRegistryError(400, error);
  const out = await mutateFarmers((farmers) => {
    const existing = farmers.find(f => f.name === name);
    if (existing && !existing.archived) throw new FarmerRegistryError(409, 'חקלאי כזה כבר קיים');
    if (existing) { delete existing.archived; return { name, restored: true }; }
    farmers.push({ name, allowGidon: false });
    return { name, restored: false };
  });
  logger.info(`[farmerRegistry.addFarmer] ${name} ${out.restored ? 'restored' : 'added'}`);
  return out;
}

async function archiveFarmer(name) {
  await mutateFarmers((farmers) => { findOr404(farmers, name).archived = true; });
  logger.info(`[farmerRegistry.archiveFarmer] ${name} archived`);
  return { name };
}

async function setAllowGidon(name, allowGidon) {
  if (typeof allowGidon !== 'boolean') throw new FarmerRegistryError(400, 'allowGidon חייב להיות true/false');
  await mutateFarmers((farmers) => { findOr404(farmers, name).allowGidon = allowGidon; });
  logger.info(`[farmerRegistry.setAllowGidon] ${name} allowGidon=${allowGidon}`);
  return { name, allowGidon };
}

module.exports = { FarmerRegistryError, validateFarmerName, addFarmer, archiveFarmer, setAllowGidon };
