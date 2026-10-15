const express = require('express');
const router = express.Router();
const c = require('../controllers/fridgeController');

router.get('/:roomId', c.getRoom);
router.post('/:roomId/ops', c.postOp);

module.exports = router;
