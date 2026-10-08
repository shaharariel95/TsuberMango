// Pure certificate logic: chunking, row building, snapshots, selection validation.
// No I/O — unit-tested in tests/certificateCore.test.js.
const MAX_ROWS = 13;

const byPalletNumber = (a, b) => Number(a.palletNumber) - Number(b.palletNumber);

// Group rows by pallet number and pack whole groups into chunks of ≤ MAX_ROWS rows,
// so a mixed pallet never straddles two certificates.
function chunkRecords(records) {
  const groups = new Map();
  [...records].sort(byPalletNumber).forEach(r => {
    const key = String(r.palletNumber);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const chunks = [];
  let current = [];
  for (const [palletNumber, group] of groups) {
    if (group.length > MAX_ROWS) throw new Error(`PALLET_TOO_LARGE:${palletNumber}`);
    if (current.length + group.length > MAX_ROWS) {
      chunks.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function buildRows(records) {
  const seen = new Set();
  return records.map(r => {
    const key = String(r.palletNumber);
    const firstOfPallet = !seen.has(key);
    seen.add(key);
    return {
      recordId: r.id, palletNumber: r.palletNumber, kind: r.kind, size: r.size,
      boxes: r.boxes, weight: r.weight, firstOfPallet,
    };
  });
}

function buildSnapshot({ profile, number, destination, shipmentDate, records }) {
  const rows = buildRows([...records].sort(byPalletNumber));
  return {
    headerLines: [...(profile.headerLines || [])],
    driverName: profile.driverName || '',
    number, shipmentDate, destination, rows,
    palletCount: rows.filter(r => r.firstOfPallet).length,
    totalBoxes: rows.reduce((s, r) => s + (Number(r.boxes) || 0), 0),
    totalWeight: rows.reduce((s, r) => s + (Number(r.weight) || 0), 0),
  };
}

const PRINTED_FIELDS = ['headerLines', 'driverName', 'number', 'shipmentDate', 'destination',
  'rows', 'palletCount', 'totalBoxes', 'totalWeight'];

function snapshotsDiffer(a, b) {
  return PRINTED_FIELDS.some(f => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
}

function validateIssueSelection(records) {
  if (!records.length) return { errors: ['לא נבחרו משטחים'] };
  const errors = [];
  const missing = records.filter(r => !r.weight || !r.boxes || !r.destination || !r.shipmentDate);
  if (missing.length) {
    errors.push(`חסרים משקל / ארגזים / יעד / תאריך משלוח במשטחים: ${[...new Set(missing.map(r => r.palletNumber))].join(', ')}`);
  }
  const destinations = new Set(records.map(r => r.destination).filter(Boolean));
  const dates = new Set(records.map(r => r.shipmentDate).filter(Boolean));
  if (destinations.size > 1) errors.push('למשטחים שנבחרו יש יעדים שונים');
  if (dates.size > 1) errors.push('למשטחים שנבחרו יש תאריכי משלוח שונים');
  return { errors, destination: [...destinations][0], shipmentDate: [...dates][0] };
}

// Single source of truth for "can these records be certified, and how would they split".
// Callers decorate conflicts with certificateId and throw their own errors.
function planIssue(records) {
  const conflicts = records.filter(r => r.cardId !== '' && r.cardId != null)
    .map(r => ({ recordId: r.id, palletNumber: r.palletNumber, certificateNumber: r.cardId }));
  const { errors, destination, shipmentDate } = validateIssueSelection(records);
  let chunks;
  if (!conflicts.length && !errors.length) {
    try { chunks = chunkRecords(records); }
    catch (e) {
      if (!String(e.message).startsWith('PALLET_TOO_LARGE:')) throw e;
      errors.push(`משטח ${e.message.split(':')[1]} חורג מ-${MAX_ROWS} שורות`);
    }
  }
  return { conflicts, errors, destination, shipmentDate, chunks };
}

module.exports = { MAX_ROWS, chunkRecords, buildRows, buildSnapshot, snapshotsDiffer, validateIssueSelection, planIssue };
