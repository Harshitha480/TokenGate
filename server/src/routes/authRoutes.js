const { Router } = require('express');
const authController = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { requireUser } = require('../middleware/auth');
const { registerBody, loginBody } = require('../validation/authSchemas');

const router = Router();

router.post('/register', validate({ body: registerBody }), authController.register);
router.post('/login', validate({ body: loginBody }), authController.login);
router.get('/me', requireUser, authController.me);

module.exports = router;
