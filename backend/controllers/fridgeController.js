// HTTP layer for the fridge (cold-room) map. Rules live in services/fridgeCore.js, the transaction in
// repositories/FirestoreFridgeRepository.js. Fridge writes change no records, so no farmer_events are
// emitted: clients listen to the room doc itself.
const repo = require('../repositories');
const { ROOMS, FridgeError, summarizeRoom } = require('../services/fridgeCore');
const { assertKnownFarmer } = require('./recordController');
const logger = require('../utils/logger');

const MESSAGES = {
  SLOT_TAKEN: () => 'התא תפוס',
  ALREADY_PLACED: (d) => `המשטח כבר במקרר בתא ${d.slot}`,
  SLOT_EMPTY: () => 'התא ריק',
  NOT_FOUND: () => 'המשטח לא נמצא',
  ALREADY_SENT: () => 'המשטח כבר נשלח',
  BAD_SLOT: () => 'בקשה לא תקינה',
  BAD_OP: () => 'בקשה לא תקינה',
  ROOM_NOT_FOUND: () => 'המקרר לא נמצא',
};

const actorOf = (req) => req.user?.email || 'unknown';

// Room + a live summary of every placed pallet (one records read per farmer on the map).
async function roomView(room) {
  const farmers = [...new Set(Object.values(room.cells).map(c => c.farmer))];
  const byFarmer = {};
  for (const f of farmers) {
    const all = await repo.getRecords(f, { includeDeleted: true });
    byFarmer[f] = { live: all.filter(r => r.deleted !== true), deleted: all.filter(r => r.deleted === true) };
  }
  return { ...room, pallets: summarizeRoom(room.cells, byFarmer) };
}

async function handle(res, label, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FridgeError) {
      logger.info(`[fridgeController.${label}] ${err.code} ${JSON.stringify(err.details)}`);
      return res.status(err.status).json({ error: (MESSAGES[err.code] || (() => err.code))(err.details), code: err.code, ...err.details });
    }
    logger.error(`[fridgeController.${label}] ${err.message}`);
    return res.status(500).json({ error: 'שגיאה במקרר', details: err.message });
  }
}

function assertRoom(roomId) {
  if (!ROOMS[roomId]) throw new FridgeError(404, 'ROOM_NOT_FOUND');
}

module.exports = {
  getRoom: (req, res) => handle(res, 'getRoom', async () => {
    assertRoom(req.params.roomId);
    const view = await roomView(await repo.fridge.getRoom(req.params.roomId));
    logger.info(`[fridgeController.getRoom] ${req.params.roomId}: ${Object.keys(view.cells).length} cells`);
    res.json(view);
  }),

  postOp: (req, res) => handle(res, 'postOp', async () => {
    const { roomId } = req.params;
    assertRoom(roomId);
    let op = req.body || {};
    if (op.op === 'place') {
      const farmerError = op.farmer ? await assertKnownFarmer(op.farmer) : null;
      if (farmerError) return res.status(400).json({ error: farmerError, code: 'UNKNOWN_FARMER' });
      if (op.farmer && op.palletNumber != null && op.palletNumber !== '') {
        const recs = await repo.getRecordsByPallet(op.farmer, op.palletNumber);
        if (!recs.length) throw new FridgeError(404, 'NOT_FOUND');
        if (recs.every(r => r.sent === true)) throw new FridgeError(409, 'ALREADY_SENT');
        op = { op: 'place', slot: op.slot, farmer: op.farmer, palletNumber: recs[0].palletNumber };
      }
    }
    const room = await repo.fridge.applyOp(roomId, op, actorOf(req));
    logger.info(`[fridgeController.postOp] ${roomId} ${op.op} ${JSON.stringify({ slot: op.slot, from: op.from, to: op.to, farmer: op.farmer, palletNumber: op.palletNumber })} by ${actorOf(req)}`);
    res.json(await roomView(room));
  }),
};
