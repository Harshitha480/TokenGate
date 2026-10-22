const { Router } = require('express');
const authController = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { requireUser } = require('../middleware/auth');
const { registerBody, loginBody } = require('../validation/authSchemas');

/** Credential endpoints are rate limited per IP to slow down password guessing. */
function createAuthRouter({ authRateLimiter }) {
  const router = Router();

  router.post(
    '/register',
    authRateLimiter,
    validate({ body: registerBody }),
    authController.register,
  );
  router.post('/login', authRateLimiter, validate({ body: loginBody }), authController.login);
  router.get('/me', requireUser, authController.me);

  return router;
}

module.exports = { createAuthRouter };
