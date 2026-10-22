const { AppError } = require('../lib/errors');
const { logger } = require('../lib/logger');

function toAppError(err) {
  if (err instanceof AppError) return err;

  // express.json() raises these for malformed or oversized bodies.
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'invalid_json', 'Request body is not valid JSON');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'payload_too_large', 'Request body is too large');
  }
  if (err.name === 'CastError') {
    return new AppError(400, 'invalid_id', `Invalid value for ${err.path}`);
  }
  return null;
}

function notFoundHandler(req, res, next) {
  next(new AppError(404, 'route_not_found', `No route for ${req.method} ${req.path}`));
}

// Express recognises error handlers by their four-argument signature.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const appError = toAppError(err);
  const log = req.log ?? logger;

  if (!appError) {
    log.error({ err, requestId: req.id }, 'Unhandled error');
  }

  const status = appError?.statusCode ?? 500;
  const body = {
    error: {
      code: appError?.code ?? 'internal_error',
      message: appError?.message ?? 'Something went wrong on our side',
      requestId: req.id,
      ...(appError?.details && { details: appError.details }),
    },
  };

  if (appError?.headers) res.set(appError.headers);

  if (res.headersSent) {
    // A streamed response already committed its status; all we can do is end it.
    res.end();
    return;
  }
  res.status(status).json(body);
}

module.exports = { errorHandler, notFoundHandler };
