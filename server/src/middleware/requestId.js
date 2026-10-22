const { randomUUID } = require('node:crypto');

// Accept a caller-supplied id so traces can span services, but only if it is
// short and plain enough to be safe in logs and response headers.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

module.exports = { requestId };
