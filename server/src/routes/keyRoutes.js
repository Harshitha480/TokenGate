const { Router } = require('express');
const keyController = require('../controllers/keyController');
const { validate } = require('../middleware/validate');
const { requireUser } = require('../middleware/auth');
const { idParams } = require('../validation/common');
const { createKeyBody, updateKeyBody } = require('../validation/keySchemas');

const router = Router();

router.use(requireUser);

router.get('/', keyController.listKeys);
router.post('/', validate({ body: createKeyBody }), keyController.createKey);
router.get('/:id', validate({ params: idParams }), keyController.getKey);
router.patch('/:id', validate({ params: idParams, body: updateKeyBody }), keyController.updateKey);
// Revocation is a soft delete: request logs keep pointing at the key.
router.delete('/:id', validate({ params: idParams }), keyController.revokeKey);

module.exports = router;
