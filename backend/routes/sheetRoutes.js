// routes/sheetRoutes.js
const express = require('express');
const router = express.Router();
const sheetController = require('../controllers/sheetController');
const labelController = require('../controllers/labelController');
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
    sheetController.createRecord.bind(sheetController)
);

// Get all records for a farmer
router.get('/farmers/:farmer/records',
    validateFarmer,
    sheetController.getAllRecords.bind(sheetController)
);

router.get('/farmers/:farmer/records/destinations',
    validateFarmer,
    sheetController.getAllRecordsforDestinations.bind(sheetController)
);

// Get records by pallet number
router.get('/farmers/:farmer/records/pallet/:palletNumber',
    validateFarmer,
    sheetController.getRecordsByPallet.bind(sheetController)
);

router.get('/farmers/:farmer/records/lastPallet', 
    validateFarmer,
    sheetController.getLastPallet.bind(sheetController)
);

// reset bulk sent
router.put('/farmers/:farmer/records/resetPallets',
    validateFarmer,
    sheetController.resetSentStatus.bind(sheetController)
);

// Update records
router.put('/farmers/:farmer/records/updatemany',
    validateFarmer,
    (req,res,next)=> {logger.info(`in farmers/:farmer/records/updatemany`); next()},
    sheetController.updateMultipleRecords.bind(sheetController)
);

// Update record
router.put('/farmers/:farmer/records/:id',
    validateFarmer,
    sheetController.updateRecord.bind(sheetController)
);

router.post('/shipping/newlabel/',
    (req,res,next)=> {logger.info(`in /shipping/newlabel`); next()},
    labelController.createNewShippingLabel.bind(labelController)
);

router.post('/farmers/:farmer/destinations/toSend',
    (req,res,next)=> {logger.info(`in /farmer/:farmer/destinations/toSend`); next()},
    sheetController.sendToDestination.bind(sheetController)
);

router.post('/farmers/:farmer/destinations/Sent',
    (req,res,next)=> {logger.info(`in /shipping/destinations/Sent`); next()},
    sheetController.removeFromDestination.bind(sheetController)
);

module.exports = router;