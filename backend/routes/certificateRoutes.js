const express = require('express');
const router = express.Router();
const c = require('../controllers/certificateController');

router.post('/preview', c.preview);
router.post('/', c.issue);
router.get('/', c.list);
router.get('/:id', c.get);
router.get('/:id/versions/:n', c.getVersion);
router.post('/:id/reprint', c.reprint);
router.post('/:id/remove-pallet', c.removePallet);

module.exports = router;
