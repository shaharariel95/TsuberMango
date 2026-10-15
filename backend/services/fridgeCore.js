// Pure fridge (cold-room map) logic: slot validation, the place/move/clear rules and pallet summaries.
// No I/O — the repository runs applyOp inside a Firestore transaction, the controller builds summaries.
const ROOMS = { main: { cols: ['A', 'B', 'C', 'D', 'E'], rows: 8 } };

class FridgeError extends Error {
  constructor(status, code, details = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isValidSlot(roomId, slot) {
  const room = ROOMS[roomId];
  if (!room || typeof slot !== 'string') return false;
  const m = /^([A-Z])([1-9][0-9]?)$/.exec(slot);
  return !!m && room.cols.includes(m[1]) && Number(m[2]) <= room.rows;
}

const palletKey = (farmer, palletNumber) => `${farmer}__${palletNumber}`;

function findPallet(cells, farmer, palletNumber) {
  return Object.keys(cells).find(s => cells[s].farmer === farmer && String(cells[s].palletNumber) === String(palletNumber)) || null;
}

function applyOp(roomId, cells, op, { actor, at }) {
  if (!ROOMS[roomId]) throw new FridgeError(404, 'ROOM_NOT_FOUND');
  const slotOk = (s) => { if (!isValidSlot(roomId, s)) throw new FridgeError(400, 'BAD_SLOT', { slot: s ?? null }); };
  const next = { ...cells };
  const log = (c, from, to) => ({ op: op.op, farmer: c.farmer, palletNumber: c.palletNumber, from, to, by: actor, at });

  switch (op?.op) {
    case 'place': {
      slotOk(op.slot);
      if (!op.farmer || op.palletNumber == null || op.palletNumber === '') throw new FridgeError(400, 'BAD_OP');
      if (next[op.slot]) throw new FridgeError(409, 'SLOT_TAKEN', { slot: op.slot });
      const already = findPallet(next, op.farmer, op.palletNumber);
      if (already) throw new FridgeError(409, 'ALREADY_PLACED', { slot: already });
      next[op.slot] = { farmer: op.farmer, palletNumber: op.palletNumber, placedBy: actor, placedAt: at };
      return { cells: next, logEntry: log(next[op.slot], null, op.slot) };
    }
    case 'move': {
      slotOk(op.from);
      slotOk(op.to);
      if (op.from === op.to) throw new FridgeError(400, 'BAD_OP');
      const c = next[op.from];
      if (!c) throw new FridgeError(409, 'SLOT_EMPTY', { slot: op.from });
      if (next[op.to]) throw new FridgeError(409, 'SLOT_TAKEN', { slot: op.to });
      delete next[op.from];
      next[op.to] = c; // placedBy/placedAt = when it entered the room; the log records the move
      return { cells: next, logEntry: log(c, op.from, op.to) };
    }
    case 'clear': {
      slotOk(op.slot);
      const c = next[op.slot];
      if (!c) throw new FridgeError(409, 'SLOT_EMPTY', { slot: op.slot });
      delete next[op.slot];
      return { cells: next, logEntry: log(c, op.slot, null) };
    }
    default:
      throw new FridgeError(400, 'BAD_OP');
  }
}

const uniq = (records, field) => [...new Set(records.map(r => r[field]).filter(v => v !== '' && v != null))];

// live = the pallet's non-deleted records, deleted = its soft-deleted ones (same farmer + number).
function summarizePallet(live, deleted) {
  if (!live.length) {
    return { status: deleted.length ? 'deleted' : 'missing', kinds: [], sizes: [], boxes: 0, weightMissing: false, mark: false, hasCertificate: false };
  }
  const sent = live.filter(r => r.sent === true).length;
  return {
    status: sent === 0 ? 'ok' : sent === live.length ? 'sent' : 'partly_sent',
    kinds: uniq(live, 'kind'),
    sizes: uniq(live, 'size'),
    boxes: live.reduce((n, r) => n + (Number(r.boxes) || 0), 0),
    weightMissing: live.some(r => !(Number(r.weight) > 0)),
    mark: live.some(r => r.mark === true),
    hasCertificate: live.some(r => r.cardId !== '' && r.cardId != null),
  };
}

function summarizeRoom(cells, byFarmer) {
  const out = {};
  for (const c of Object.values(cells)) {
    const f = byFarmer[c.farmer] || { live: [], deleted: [] };
    const same = (r) => String(r.palletNumber) === String(c.palletNumber);
    out[palletKey(c.farmer, c.palletNumber)] = summarizePallet(f.live.filter(same), f.deleted.filter(same));
  }
  return out;
}

module.exports = { ROOMS, FridgeError, isValidSlot, palletKey, findPallet, applyOp, summarizePallet, summarizeRoom };
