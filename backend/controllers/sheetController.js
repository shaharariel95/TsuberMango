// sheetController.js
const SheetModel = require('../models/sheetModel');
const sheetsService = require('../services/googleSheetsService');

class SheetController {
    async createRecord(req, res) {
        try {
            const { farmer, shipmentDate, cardId, harvestDate, palletNumber, kind, size, boxes, weight, destination } = req.body;
            
            if (!farmer) {
                return res.status(400).json({ error: 'Farmer name is required' });
            }

            const sheetRecord = new SheetModel(
                shipmentDate, cardId, harvestDate, palletNumber, kind, size, boxes, weight, destination
            );
            
            const result = await sheetsService.appendRow(farmer, sheetRecord.toArray());
            res.status(201).json({ 
                message: 'Record added successfully',
                data: result 
            });
        } catch (error) {
            if (error.message.includes('Invalid farmer sheet')) {
                res.status(400).json({ error: error.message });
            } else if (error.message.includes('Missing required fields')) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to add record', details: error.message });
            }
        }
    }

    async getAllRecords(req, res) {
        try {
            const { farmer } = req.params;
            if (!farmer) {
                return res.status(400).json({ error: 'Farmer name is required' });
            }

            const records = await sheetsService.getAllRecords(farmer);
            
            res.json({ 
                message: 'Records retrieved successfully',
                count: records.length,
                data: records 
            });
        } catch (error) {
            if (error.message.includes('Invalid farmer sheet')) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ 
                    error: 'Failed to fetch records',
                    details: error.message 
                });
            }
        }
    }

    async getRecordsByPallet(req, res) {
        try {
            const { farmer, palletNumber } = req.params;
            if (!farmer || !palletNumber) {
                return res.status(400).json({ error: 'Farmer name and pallet number are required' });
            }

            const records = await sheetsService.getRowsByPallet(farmer, palletNumber);
            
            if (records.length === 0) {
                return res.status(404).json({ 
                    message: 'No records found for this pallet number',
                    farmer,
                    palletNumber 
                });
            }

            res.json({ 
                message: 'Records retrieved successfully',
                count: records.length,
                data: records 
            });
        } catch (error) {
            if (error.message.includes('Invalid farmer sheet')) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ 
                    error: 'Failed to fetch records',
                    details: error.message 
                });
            }
        }
    }

    async getLastPallet(req, res){
        const { farmer } = req.params;
        if (!farmer) {
            return res.status(400).json({ error: 'Farmer name required' });
        }

        const result = await sheetsService.getLastPallet(farmer)
        res.json({ 
            message: 'Record updated successfully',
            data: result 
        });
    }

    async updateRecord(req, res) {
        try {
            const { farmer, id } = req.params;
            if (!farmer || !id) {
                return res.status(400).json({ error: 'Farmer name and record ID are required' });
            }

            const { shipmentDate, cardId, harvestDate, palletNumber, kind, size, boxes, weight, destination } = req.body;
            
            const sheetRecord = new SheetModel(
                shipmentDate, cardId, harvestDate, palletNumber, kind, size, boxes, weight, destination
            );

            const result = await sheetsService.updateRowById(farmer, parseInt(id), sheetRecord.toArray());
            
            res.json({ 
                message: 'Record updated successfully',
                data: result 
            });
        } catch (error) {
            if (error.message.includes('Invalid farmer sheet')) {
                res.status(400).json({ error: error.message });
            } else if (error.message.includes('Row with ID') && error.message.includes('not found')) {
                res.status(404).json({ error: error.message });
            } else if (error.message.includes('Missing required fields')) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ 
                    error: 'Failed to update record',
                    details: error.message 
                });
            }
        }
    }
}

module.exports = new SheetController();