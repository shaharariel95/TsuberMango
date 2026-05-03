// sheetController.js
const SheetModel = require("../models/sheetModel");
const sheetsService = require("../services/googleSheetsService");
const logger = require("../utils/logger");

class SheetController {
  async createRecord(req, res) {
    try {
      const {
        farmer,
        shipmentDate,
        cardId,
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

      const editedBy = req.user?.email || 'unknown';
      const editedAt = new Date().toISOString();

      const sheetRecord = new SheetModel(
        shipmentDate,
        cardId,
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

      const result = await sheetsService.appendRow(
        farmer,
        sheetRecord.toArray()
      );

      sheetsService.appendAuditLog(farmer, {
        recordId: result.id,
        palletNumber,
        action: 'קליטה',
        editedBy,
        editedAt,
      }).catch(err => logger.error(`appendAuditLog failed on create: ${err.message}`));

      res.status(201).json({
        message: "Record added successfully",
        data: result,
      });
    } catch (error) {
      if (error.message.includes("Invalid farmer sheet")) {
        return res.status(400).json({ error: error.message });
      } else if (error.message.includes("Missing required fields")) {
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

      const records = await sheetsService.getAllRecords(farmer);

      res.json({
        message: "Records retrieved successfully",
        count: records.length,
        data: records,
      });
    } catch (error) {
      if (error.message.includes("Invalid farmer sheet")) {
        return res.status(400).json({ error: error.message });
      } else {
        return res.status(500).json({
          error: "Failed to fetch records",
          details: error.message,
        });
      }
    }
  }

  async getAllRecordsforDestinations(req, res) {
    try {
      const { farmer } = req.params;
      if (!farmer) {
        return res.status(400).json({ error: "Farmer name is required" });
      }

      const records = await sheetsService.getAllRecords(farmer);
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

      const records = await sheetsService.getRowsByPallet(farmer, palletNumber);

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
      if (error.message.includes("Invalid farmer sheet")) {
        return res.status(400).json({ error: error.message });
      } else {
        return res.status(500).json({
          error: "Failed to fetch records",
          details: error.message,
        });
      }
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
      const result = await sheetsService.getLastPallet(farmer);
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

  async updateMultipleRecords(req, res) {
    try {
      logger.info(
        `Received request to update multiple records. Params: ${JSON.stringify(
          req.params
        )}`
      );

      const { farmer } = req.params;
      logger.info(`Farmer name from request: ${farmer}`);
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

      const editedBy = req.user?.email || 'unknown';
      const editedAt = new Date().toISOString();

      const ids = [];
      const updatedDataArray = [];

      for (const pallet of palletsData) {
        const {
          id,
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
          mark = false,
        } = pallet;

        if (
          !id ||
          !shipmentDate ||
          !harvestDate ||
          !palletNumber ||
          !kind ||
          !size ||
          !boxes ||
          !weight ||
          !destination
        ) {
          logger.warn(`Pallet validation failed: ${JSON.stringify(pallet)}`);
          return res
            .status(400)
            .json({ error: "Missing required fields in one of the pallets" });
        }

        ids.push(id);
        const sheetRecord = new SheetModel(
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
          mark,
          editedBy,
          editedAt
        );

        updatedDataArray.push(sheetRecord.toArray());
      }

      logger.info(`Updating ${ids.length} records for farmer: ${farmer}`);

      // Call the batch update function
      const result = await sheetsService.updateRowsByIds(
        farmer,
        ids,
        updatedDataArray
      );

      if (!result || result.success !== true) {
        logger.error(`Update function failed: ${JSON.stringify(result)}`);
        return res
          .status(500)
          .json({ error: "Update function failed, response was invalid" });
      }

      logger.info(`Successfully updated records for farmer: ${farmer}`);

      // Append audit log entries for each updated pallet (fire-and-forget; failures are silent)
      for (const pallet of palletsData) {
        await sheetsService.appendAuditLog(farmer, {
          recordId: pallet.id,
          palletNumber: pallet.palletNumber,
          action: 'עדכון',
          editedBy,
          editedAt,
        });
      }

      return res.json({
        message: result.message, // Use the correct message from the response
      });
    } catch (error) {
      logger.error(`Error updating records: ${error.message}`, {
        stack: error.stack,
      });

      if (!res.headersSent) {
        // ✅ Prevent multiple responses
        if (error.message.includes("Invalid farmer sheet")) {
          return res.status(400).json({ error: error.message });
        } else if (
          error.message.includes("Row with ID") &&
          error.message.includes("not found")
        ) {
          return res.status(404).json({ error: error.message });
        } else if (error.message.includes("Missing required fields")) {
          return res.status(400).json({ error: error.message });
        } else {
          return res.status(500).json({
            error: "Failed to update records",
            details: error.message,
          });
        }
      }
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

      const sheetRecord = new SheetModel(
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
        mark,
        editedBy,
        editedAt
      );

      const result = await sheetsService.updateRowById(
        farmer,
        parseInt(id),
        sheetRecord.toArray()
      );

      await sheetsService.appendAuditLog(farmer, {
        recordId: parseInt(id),
        palletNumber: req.body.palletNumber,
        action: 'עדכון',
        editedBy,
        editedAt,
      });

      res.json({
        message: "Record updated successfully",
        data: result,
      });
    } catch (error) {
      if (error.message.includes("Invalid farmer sheet")) {
        return res.status(400).json({ error: error.message });
      } else if (
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
      const { palletIds } = req.body; // Extract pallet IDs
      if (!Array.isArray(palletIds) || !palletIds.length) {
        return res.status(400).json({ error: "Invalid pallet IDs" });
      }
      // Bulk update logic
      const results = await sheetsService.updateSentStatusForPallets(
        farmer,
        palletIds,
        false
      );

      res.json({ message: "Pallets updated successfully", updated: results });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to reset pallets", details: error.message });
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
      const palletIds = palletsData.map(pallet => pallet.id); // Extract the 'id' field from each pallet
      // Bulk update logic
      const results = await sheetsService.updateSendToDestinationPallets(
        farmer,
        palletIds,
        false
      );

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
      const palletIds = palletsData.map(pallet => pallet.id); // Extract the 'id' field from each pallet
      // Bulk update logic
      const results = await sheetsService.updateSendToDestinationPallets(
        farmer,
        palletIds,
        true
      );

      res.json({ message: "Pallets updated successfully", updated: results });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to reset pallets", details: error.message });
    }
  }
}



module.exports = new SheetController();
