// routes/recordRoutes.js — pallet-record endpoints under /api (records, shipment prep, destinations)
const express = require('express');
const router = express.Router();
const recordController = require('../controllers/recordController');
const logger = require('../utils/logger');

// Middleware to validate farmer parameter
const validateFarmer = (req, res, next) => {
    const farmer = req.params.farmer || req.body.farmer;
    if (!farmer) {
        return res.status(400).json({ error: 'Farmer name is required' });
    }
    // Convert to proper sheet name format if needed
    req.farmer = farmer.trim();
    next();
};

// Create new record
router.post('/records', 
    validateFarmer,
    recordController.createRecord.bind(recordController)
);

// Get all records for a farmer
router.get('/farmers/:farmer/records',
    validateFarmer,
    recordController.getAllRecords.bind(recordController)
);

router.get('/farmers/:farmer/records/destinations',
    validateFarmer,
    recordController.getAllRecordsforDestinations.bind(recordController)
);

// Get records by pallet number
router.get('/farmers/:farmer/records/pallet/:palletNumber',
    validateFarmer,
    recordController.getRecordsByPallet.bind(recordController)
);

router.get('/farmers/:farmer/records/lastPallet', 
    validateFarmer,
    recordController.getLastPallet.bind(recordController)
);

// reset bulk sent
router.put('/farmers/:farmer/records/resetPallets',
    validateFarmer,
    recordController.resetSentStatus.bind(recordController)
);

// Bulk-stamp shipmentDate on selected pallets (must precede the /:id route)
router.put('/farmers/:farmer/records/shipmentDate',
    validateFarmer,
    recordController.updateShipmentDate.bind(recordController)
);

// Update record
router.put('/farmers/:farmer/records/:id',
    validateFarmer,
    recordController.updateRecord.bind(recordController)
);

router.post('/farmers/:farmer/destinations/toSend',
    (req,res,next)=> {logger.info(`in /farmer/:farmer/destinations/toSend`); next()},
    recordController.sendToDestination.bind(recordController)
);

router.post('/farmers/:farmer/destinations/Sent',
    (req,res,next)=> {logger.info(`in /shipping/destinations/Sent`); next()},
    recordController.removeFromDestination.bind(recordController)
);

module.exports = router;