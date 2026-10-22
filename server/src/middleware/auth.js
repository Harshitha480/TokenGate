const authService = require('../services/authService');
const apiKeyService = require('../services/apiKeyService');
const { AppError, unauthorized } = require('../lib/errors');
const { logger } = require('../lib/logger');

function bearerToken(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

/** Dashboard routes: requires a valid session JWT and sets `req.user`. */
function requireUser(req, res, next) {
  const token = bearerToken(req);
  if (!token) return next(unauthorized('Sign in to continue'));
  req.user = authService.verifyToken(token);
  next();
}

/**
 * Gateway routes: requires a TokenGate API key (as `Authorization: Bearer tg_live_…`
 * so OpenAI SDKs work unchanged, or as `x-api-key`) and sets `req.apiKey`.
 */
async function requireApiKey(req, res, next) {
  const plaintextKey = bearerToken(req) ?? req.get('x-api-key');
  if (!plaintextKey) {
    return next(
      new AppError(401, 'missing_api_key', 'Provide an API key as "Authorization: Bearer <key>"'),
    );
  }

  const { apiKey, reason } = await apiKeyService.authenticateKey(plaintextKey);
  if (!apiKey) {
    return next(
      reason === 'revoked'
        ? new AppError(401, 'api_key_revoked', 'This API key has been revoked')
        : new AppError(401, 'invalid_api_key', 'API key is not valid'),
    );
  }

  req.apiKey = apiKey;
  apiKeyService
    .recordKeyUsage(apiKey)
    .catch((err) => logger.warn({ err, apiKeyId: apiKey.id }, 'Failed to record key usage'));
  next();
}

module.exports = { requireUser, requireApiKey };
