const { z } = require('zod');

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Must be a valid id');

const idParams = z.object({ id: objectId });

module.exports = { objectId, idParams };
