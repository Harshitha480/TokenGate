const { z } = require('zod');

const keyName = z.string().trim().min(1, 'Name is required').max(60);
const rateLimitPerMinute = z.number().int().min(1).max(10_000);

const createKeyBody = z.object({
  name: keyName,
  rateLimitPerMinute: rateLimitPerMinute.optional(),
});

const updateKeyBody = z
  .object({
    name: keyName.optional(),
    // null clears a custom limit so the key falls back to the server default.
    rateLimitPerMinute: rateLimitPerMinute.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

module.exports = { createKeyBody, updateKeyBody };
