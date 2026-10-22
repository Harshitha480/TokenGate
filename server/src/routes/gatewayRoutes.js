const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { requireApiKey } = require('../middleware/auth');
const { chatCompletionBody } = require('../validation/chatSchemas');

/**
 * OpenAI-compatible surface: point any OpenAI SDK's baseURL at <host>/v1.
 * Order matters: authenticate, then rate limit (so abusive clients are turned away
 * before any parsing work), then validate, then serve.
 */
function createGatewayRouter({ gatewayController, gatewayRateLimiter }) {
  const router = Router();

  router.use(requireApiKey);
  router.use(gatewayRateLimiter);
  router.get('/models', gatewayController.listModels);
  router.post(
    '/chat/completions',
    validate({ body: chatCompletionBody }),
    gatewayController.createChatCompletion,
  );

  return router;
}

module.exports = { createGatewayRouter };
