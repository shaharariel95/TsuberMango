// routes/sheetRoutes.js
const express = require('express');
const router = express.Router();
const sheetController = require('../controllers/sheetController');

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

// Get records by pallet number
router.get('/farmers/:farmer/records/pallet/:palletNumber',
    validateFarmer,
    sheetController.getRecordsByPallet.bind(sheetController)
);

router.get('/farmers/:farmer/records/lastPallet', 
    validateFarmer,
    sheetController.getLastPallet.bind(sheetController)
);

// Update record
router.put('/farmers/:farmer/records/:id',
    validateFarmer,
    sheetController.updateRecord.bind(sheetController)
);

module.exports = router;