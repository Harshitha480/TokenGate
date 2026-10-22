const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { requireUser } = require('../middleware/auth');
const { chatCompletionBody } = require('../validation/chatSchemas');
const apiKeyService = require('../services/apiKeyService');
const { AppError, badRequest } = require('../lib/errors');

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * The dashboard never holds a plaintext gateway key (it is shown once, then only its
 * hash is kept). Instead the signed-in user names one of their keys by id, and the
 * request then runs through exactly the same rate limiter, validation and gateway
 * as a direct /v1 call made with that key.
 */
async function useSelectedKey(req, res, next) {
  const keyId = req.get('x-tokengate-key-id');
  if (!keyId || !OBJECT_ID.test(keyId)) {
    return next(badRequest('Send the id of one of your API keys in X-TokenGate-Key-Id'));
  }
  const apiKey = await apiKeyService.getOwnedKey(req.user.userId, keyId);
  if (apiKey.revokedAt) {
    return next(new AppError(409, 'key_revoked', 'This API key has been revoked'));
  }
  req.apiKey = apiKey;
  next();
}

function createPlaygroundRouter({ gatewayController, gatewayRateLimiter }) {
  const router = Router();
  router.post(
    '/chat/completions',
    requireUser,
    useSelectedKey,
    gatewayRateLimiter,
    validate({ body: chatCompletionBody }),
    gatewayController.createChatCompletion,
  );
  return router;
}

module.exports = { createPlaygroundRouter };
