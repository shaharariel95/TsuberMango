// recordController.js
const PalletRecord = require("../models/palletRecord");
const repo = require("../repositories");
const backupService = require("../services/backupService");
const logger = require("../utils/logger");
const certificateService = require("../services/certificateService");
const firestoreEventService = require("../services/firestoreEventService");
const admin = require("firebase-admin");
const { CENTER_ID } = require("../config/center");

// In-memory TTL cache for the known-farmer-names lookup, so write endpoints
// don't hit Firestore on every request.
const KNOWN_FARMERS_TTL_MS = 5 * 60 * 1000;
let knownFarmersCache = { names: null, fetchedAt: 0 };

/**
 * Read known farmer names from centers/{CENTER_ID}/config/global (field `farmers`,
 * array of { name, allowGidon }). Cached for KNOWN_FARMERS_TTL_MS.
 * Fails OPEN: returns null on a read error so writes are never blocked by a
 * transient Firestore issue.
 *
 * @returns {Promise<string[]|null>}
 */
async function getKnownFarmerNames() {
  const now = Date.now();
  if (knownFarmersCache.names !== null && (now - knownFarmersCache.fetchedAt) < KNOWN_FARMERS_TTL_MS) {
    return knownFarmersCache.names;
  }

  try {
    const db = admin.firestore();
    const snap = await db.collection('centers').doc(CENTER_ID).collection('config').doc('global').get();
    if (!snap.exists) {
      knownFarmersCache = { names: [], fetchedAt: now };
      return [];
    }
    const data = snap.data();
    const farmers = data.farmers || [];
    const names = farmers.map(f => f.name).filter(Boolean);
    knownFarmersCache = { names, fetchedAt: now };
    return names;
  } catch (error) {
    logger.error(`[getKnownFarmerNames] Failed to read config/global: ${error.message}`);
    return null;
  }
}

/**
 * Returns an error message string if `farmer` is not a known farmer, or null if it's
 * valid / validation could not be performed (fail-open on transient read errors).
 *
 * @param {string} farmer
 * @returns {Promise<string|null>}
 */
async function assertKnownFarmer(farmer) {
  const names = await getKnownFarmerNames();
  if (names !== null && !names.includes(farmer)) {
    return `Unknown farmer: ${farmer}`;
  }
  return null;
}

class RecordController {
  async createRecord(req, res) {
    try {
      const {
        farmer,
        shipmentDate,
        harvestDate,
        palletNumber,
        kind,
        size,
        boxes,
        weight,
        destination,
        gidon,
      } = req.body;

      if (!farmer) {
        return res.status(400).json({ error: "Farmer name is required" });
      }

      const farmerError = await assertKnownFarmer(farmer);
      if (farmerError) {
        return res.status(400).json({ error: farmerError });
      }

      const editedBy = req.user?.email || 'unknown';
      const editedAt = new Date().toISOString();

      // A certificate number only ever comes from issuing a certificate; intake never accepts one.
      const palletRecord = new PalletRecord(
        shipmentDate,
        '' /*cardId*/,
        harvestDate,
        palletNumber,
        kind,
        size,
        boxes,
        weight,
        destination,
        false /*sent*/,
        gidon,
        false /*mark*/,
        editedBy,
        editedAt
      );

      const result = await repo.appendRecord(farmer, { ...palletRecord });

      repo.appendAuditLog(farmer, {
        recordId: result.id,
        palletNumber,
        action: 'קליטה',
        editedBy,
        editedAt,
      }).catch(err => logger.error(`appendAuditLog failed on create: ${err.message}`));

      firestoreEventService.emitCreate(farmer, { id: result.id, ...palletRecord }, editedBy);

      res.status(201).json({
        message: "Record added successfully",
        data: result,
      });
    } catch (error) {
      if (error.message.includes("Missing required fields")) {
        return res.status(400).json({ error: error.message });
      } else {
        return res
          .status(500)
          .json({ error: "Failed to add record", details: error.message });
      }
    }
  }

  async getAllRecords(req, res) {
    try {
      const { farmer } = req.params;
      if (!farmer) {
        return res.status(400).json({ error: "Farmer name is required" });
      }

      const records = await repo.getRecords(farmer);

      res.json({
        message: "Records retrieved successfully",
        count: records.length,
        data: records,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to fetch records",
        details: error.message,
      });
    }
  }

  async getAllRecordsforDestinations(req, res) {
    try {
      const { farmer } = req.params;
      if (!farmer) {
        return res.status(400).json({ error: "Farmer name is required" });
      }

      const records = await repo.getRecords(farmer);
      // get all records where column 12 is true
      const filteredRecords = records.filter(record => record['mark'] === true);
      
      res.json({
        message: "Records retrieved successfully",
        count: filteredRecords.length,
        data: filteredRecords,
      })
    } catch(e) {
      return res.status(500).json({
        error: "Failed to fetch records",
        details: e.message,
      });
    }
  }

  async getRecordsByPallet(req, res) {
    try {
      const { farmer, palletNumber } = req.params;
      if (!farmer || !palletNumber) {
        return res
          .status(400)
          .json({ error: "Farmer name and pallet number are required" });
      }

      const records = await repo.getRecordsByPallet(farmer, palletNumber);

      if (records.length === 0) {
        return res.status(404).json({
          message: "No records found for this pallet number",
          farmer,
          palletNumber,
        });
      }

      res.json({
        message: "Records retrieved successfully",
        count: records.length,
        data: records,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to fetch records",
        details: error.message,
      });
    }
  }

  async getLastPallet(req, res) {
    const { farmer } = req.params;
    console.log(`[getLastPallet] Received request for farmer: ${farmer}`);

    if (!farmer) {
      console.warn(`[getLastPallet] Missing farmer parameter.`);
      return res.status(400).json({ error: "Farmer name required" });
    }

    try {
      const result = await repo.getLastPallet(farmer);
      console.log(
        `[getLastPallet] Successfully fetched last pallet for farmer: ${farmer}, result:`,
        result
      );
      res.json({
        message: "Record updated successfully",
        data: result,
      });
    } catch (error) {
      console.error(
        `[getLastPallet] Error fetching last pallet for farmer: ${farmer}`,
        error
      );
      return res
        .status(500)
        .json({ error: "Failed to fetch last pallet", details: error.message });
    }
  }

  async updateRecord(req, res) {
    try {
      const { farmer, id } = req.params;
      if (!farmer || !id) {
        return res
          .status(400)
          .json({ error: "Farmer name and record ID are required" });
      }

      const farmerError = await assertKnownFarmer(farmer);
      if (farmerError) {
        return res.status(400).json({ error: farmerError });
      }

      const {
        shipmentDate,
        cardId,
        harvestDate,
        palletNumber,
        kind,
        size,
        boxes,
        weight,
        destination,
        sent,
        gidon,
        mark
      } = req.body;

      const editedBy = req.user?.email || 'unknown';
      const editedAt = new Date().toISOString();

      const existing = await repo.getRecord(farmer, id);
      const certified = await certificateService.isCertified(farmer, existing);
      const effectiveCardId = certified ? existing.cardId : cardId;
      const effectiveSent = certified ? existing.sent : sent;

      const palletRecord = new PalletRecord(
        shipmentDate,
        effectiveCardId,
        harvestDate,
        palletNumber,
        kind,
        size,
        boxes,
        weight,
        destination,
        effectiveSent,
        gidon,
        mark,
        editedBy,
        editedAt
      );

      const result = await repo.updateRecord(farmer, id, { ...palletRecord });

      repo.appendAuditLog(farmer, {
        recordId: id,
        palletNumber: req.body.palletNumber,
        action: 'עדכון',
        editedBy,
        editedAt,
      }).catch(err => logger.error(`appendAuditLog failed on update: ${err.message}`));

      firestoreEventService.emitUpdate(farmer, { id, ...palletRecord }, editedBy);

      res.json({
        message: "Record updated successfully",
        data: result,
      });
    } catch (error) {
      if (
        error.message.includes("Row with ID") &&
        error.message.includes("not found")
      ) {
        return res.status(404).json({ error: error.message });
      } else if (error.message.includes("Missing required fields")) {
        return res.status(400).json({ error: error.message });
      } else {
        return res.status(500).json({
          error: "Failed to update record",
          details: error.message,
        });
      }
    }
  }

  async resetSentStatus(req, res) {
    try {
      const { farmer } = req.params;
      const farmerError = await assertKnownFarmer(farmer);
      if (farmerError) {
        return res.status(400).json({ error: farmerError });
      }
      const { palletIds } = req.body; // Extract pallet IDs
      if (!Array.isArray(palletIds) || !palletIds.length) {
        return res.status(400).json({ error: "Invalid pallet IDs" });
      }
      const actor = req.user?.email || 'unknown';
      const all = await repo.getRecords(farmer);
      const byId = new Map(all.map(r => [r.id, r]));
      // Certified = a certificate doc exists for the record's cardId; those leave their certificate.
      // Legacy cardIds (no doc) reset plainly and lose the stale cardId too.
      const certified = [];
      const legacy = [];
      const plain = [];
      for (const id of palletIds) {
        const r = byId.get(id);
        if (r && await certificateService.isCertified(farmer, r)) certified.push(r);
        else if (r && r.cardId !== '' && r.cardId != null) legacy.push(r);
        else plain.push(id);
      }
      // Each step records what it changed; the single realtime event (see certificateService) goes out
      // in `finally`, so a later step throwing doesn't hide earlier, already-committed changes.
      const touched = [];
      try {
        for (const r of certified) {
          const out = await certificateService.removePallet({ id: `${farmer}__${r.cardId}`, recordId: r.id, actor }, { emit: false });
          if (out.record) touched.push(out.record);
        }
        if (plain.length) {
          await repo.updateSentStatus(farmer, plain, false);
          plain.forEach(id => { if (byId.has(id)) touched.push({ ...byId.get(id), sent: false }); });
        }
        if (legacy.length) {
          const editedAt = new Date().toISOString();
          await repo.clearCardIds(farmer, legacy.map(r => r.id), actor, editedAt);
          legacy.forEach(r => touched.push({ ...r, sent: false, cardId: '', editedBy: actor, editedAt }));
        }
      } finally {
        if (touched.length) firestoreEventService.emitBulkUpdate(farmer, touched, actor);
      }
      logger.info(`[resetSentStatus] ${farmer}: ${certified.length} removed from certificates, ${legacy.length} legacy cardId cleared, ${plain.length} reset`);

      res.json({
        message: "Pallets updated successfully",
        updated: touched.map(({ id, sent, cardId, mark }) => ({ id, sent, cardId, mark })),
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to reset pallets", details: error.message });
    }
  }

  // Narrow bulk update: stamps only shipmentDate (+ editedBy/editedAt) on the given pallets.
  async updateShipmentDate(req, res) {
    try {
      const { farmer } = req.params;
      const farmerError = await assertKnownFarmer(farmer);
      if (farmerError) {
        return res.status(400).json({ error: farmerError });
      }
      const { palletIds, shipmentDate } = req.body || {};
      if (!Array.isArray(palletIds) || !palletIds.length || palletIds.some(id => typeof id !== 'string' || !id)) {
        return res.status(400).json({ error: "Invalid pallet IDs" });
      }
      const validDate = typeof shipmentDate === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(shipmentDate)
        && !isNaN(new Date(`${shipmentDate}T00:00:00Z`).getTime())
        && new Date(`${shipmentDate}T00:00:00Z`).toISOString().startsWith(shipmentDate);
      if (!validDate) {
        return res.status(400).json({ error: "shipmentDate must be a valid yyyy-mm-dd date" });
      }

      const ids = [...new Set(palletIds)];
      const editedBy = req.user?.email || 'unknown';
      const editedAt = new Date().toISOString();
      const updated = await repo.updateShipmentDate(farmer, ids, shipmentDate, editedBy, editedAt);

      updated.forEach(u => {
        repo.appendAuditLog(farmer, {
          recordId: u.id,
          palletNumber: u.palletNumber,
          action: 'עדכון תאריך משלוח',
          editedBy,
          editedAt,
        }).catch(err => logger.error(`appendAuditLog failed on shipmentDate: ${err.message}`));
      });

      firestoreEventService.emitShipmentDate(farmer, ids, shipmentDate, editedBy);

      logger.info(`Shipment date ${shipmentDate} set on ${ids.length} pallet(s) for "${farmer}" by ${editedBy}`);
      res.json({ message: "Shipment date updated successfully", updated });
    } catch (error) {
      if (error.message.includes("Row with ID") && error.message.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      logger.error(`updateShipmentDate failed: ${error.message}`);
      return res
        .status(500)
        .json({ error: "Failed to update shipment date", details: error.message });
    }
  }

  async removeFromDestination(req, res) {
    try {
      const { farmer } = req.params;
      if (!farmer) {
        logger.warn("Missing farmer name in request.");
        return res.status(400).json({ error: "Farmer name is required" });
      }

      const palletsData = req.body; // Array of pallets data
      if (!Array.isArray(palletsData) || palletsData.length === 0) {
        logger.warn("Invalid or missing pallets data.");
        return res
          .status(400)
          .json({ error: "Pallets data is required and must be an array" });
      }
      const farmerError = await assertKnownFarmer(farmer);
      if (farmerError) {
        return res.status(400).json({ error: farmerError });
      }
      const palletIds = palletsData.map(pallet => pallet.id); // Extract the 'id' field from each pallet
      // Bulk update logic
      const results = await repo.updateMarkStatus(farmer, palletIds, false);

      firestoreEventService.emitMarkDestination(farmer, palletsData, false, req.user?.email || 'unknown');

      res.json({ message: "Pallets updated successfully", updated: results });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to reset pallets", details: error.message });
    }
  }

  async sendToDestination(req, res) {
    try {
      const { farmer } = req.params;
      if (!farmer) {
        logger.warn("Missing farmer name in request.");
        return res.status(400).json({ error: "Farmer name is required" });
      }

      const palletsData = req.body; // Array of pallets data
      if (!Array.isArray(palletsData) || palletsData.length === 0) {
        logger.warn("Invalid or missing pallets data.");
        return res
          .status(400)
          .json({ error: "Pallets data is required and must be an array" });
      }
      const farmerError = await assertKnownFarmer(farmer);
      if (farmerError) {
        return res.status(400).json({ error: farmerError });
      }
      const palletIds = palletsData.map(pallet => pallet.id); // Extract the 'id' field from each pallet
      // Bulk update logic
      const results = await repo.updateMarkStatus(farmer, palletIds, true);

      firestoreEventService.emitMarkDestination(farmer, palletsData, true, req.user?.email || 'unknown');

      res.json({ message: "Pallets updated successfully", updated: results });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to reset pallets", details: error.message });
    }
  }

  // POST /api/admin/backup
  async triggerBackup(req, res) {
    try {
      const triggeredBy = req.user?.email || 'unknown';
      logger.info(`[triggerBackup] Backup requested by ${triggeredBy}`);

      const result = await backupService.runBackup(triggeredBy);

      logger.info(`[triggerBackup] Backup completed — filename: ${result.filename}, rowCount: ${result.rowCount}`);
      return res.json({
        success: true,
        filename: result.filename,
        rowCount: result.rowCount,
        farmerCount: result.farmerCount,
      });
    } catch (error) {
      logger.error(`[triggerBackup] Backup failed: ${error.message}`);
      return res.status(500).json({ error: 'גיבוי נכשל', details: error.message });
    }
  }

  // GET /api/admin/backups
  async listBackups(req, res) {
    try {
      logger.info('[listBackups] Fetching recent backup records from Firestore');
      const backups = await backupService.getRecentBackups(7);
      logger.info(`[listBackups] Returning ${backups.length} backup records`);
      return res.json({ backups });
    } catch (error) {
      logger.error(`[listBackups] Failed to list backups: ${error.message}`);
      return res.status(500).json({ error: 'שגיאה בטעינת גיבויים', details: error.message });
    }
  }
}



module.exports = new RecordController();

// Called after an admin config write so a newly added farmer can take intake
// immediately instead of after the cache TTL.
module.exports.invalidateKnownFarmersCache = () => {
  knownFarmersCache = { names: null, fetchedAt: 0 };
};
module.exports.assertKnownFarmer = assertKnownFarmer;
