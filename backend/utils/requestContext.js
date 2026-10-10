// Per-request context (AsyncLocalStorage) so deep code — the realtime event emitter — can read the
// sending browser tab's id without threading it through every service signature.
const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();
const CLIENT_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function requestContext(req, res, next) {
  const raw = req.get('X-Client-Id');
  const clientId = raw && CLIENT_ID_RE.test(raw) ? raw : null; // malformed → ignored, never a 400
  als.run({ clientId }, next);
}

const currentClientId = () => als.getStore()?.clientId ?? null;

module.exports = { requestContext, currentClientId };
