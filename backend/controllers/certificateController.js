const service = require('../services/certificateService');
const { assertKnownFarmer } = require('./sheetController');
const logger = require('../utils/logger');

const actorOf = (req) => req.user?.email || 'unknown';

async function handle(res, label, fn) {
  try {
    return await fn();
  } catch (err) {
    const mapped = service.toHttpError(err);
    if (mapped) {
      logger.info(`[certificateController.${label}] ${mapped.body.code}`);
      return res.status(mapped.status).json(mapped.body);
    }
    logger.error(`[certificateController.${label}] ${err.message}`);
    return res.status(500).json({ error: 'שגיאה בתעודות', details: err.message });
  }
}

async function requireFarmerAndIds(req, res) {
  const { farmer, recordIds } = req.body || {};
  if (!farmer || !Array.isArray(recordIds) || !recordIds.length) {
    res.status(400).json({ error: 'farmer and recordIds are required' });
    return null;
  }
  const farmerError = await assertKnownFarmer(farmer);
  if (farmerError) { res.status(400).json({ error: farmerError }); return null; }
  return { farmer, recordIds };
}

module.exports = {
  preview: (req, res) => handle(res, 'preview', async () => {
    const body = await requireFarmerAndIds(req, res); if (!body) return;
    res.json(await service.preview(body));
  }),
  issue: (req, res) => handle(res, 'issue', async () => {
    const body = await requireFarmerAndIds(req, res); if (!body) return;
    res.status(201).json({ certificates: await service.issue({ ...body, actor: actorOf(req) }) });
  }),
  reprint: (req, res) => handle(res, 'reprint', async () => {
    res.json(await service.reprint({ id: req.params.id, actor: actorOf(req) }));
  }),
  removePallet: (req, res) => handle(res, 'removePallet', async () => {
    if (!req.body?.recordId) return res.status(400).json({ error: 'recordId is required' });
    res.json(await service.removePallet({ id: req.params.id, recordId: req.body.recordId, actor: actorOf(req) }));
  }),
  list: (req, res) => handle(res, 'list', async () => {
    const { farmer, from, to } = req.query;
    if (!farmer) return res.status(400).json({ error: 'farmer is required' });
    res.json({ certificates: await service.list({ farmer, from, to }) });
  }),
  get: (req, res) => handle(res, 'get', async () => {
    const got = await service.get(req.params.id);
    if (!got) return res.status(404).json({ error: 'התעודה לא נמצאה' });
    res.json(got);
  }),
  getVersion: (req, res) => handle(res, 'getVersion', async () => {
    const snapshot = await service.getVersion(req.params.id, Number(req.params.n));
    if (!snapshot) return res.status(404).json({ error: 'הגרסה לא נמצאה' });
    res.json({ snapshot });
  }),
};
