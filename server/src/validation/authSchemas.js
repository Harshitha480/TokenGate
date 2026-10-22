const { z } = require('zod');

// Normalise before checking the format, so " Ada@Example.com " is accepted and stored canonically.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Must be a valid email address'));

const registerBody = z.object({
  email,
  name: z.string().trim().min(1, 'Name is required').max(80),
  // bcrypt only reads the first 72 bytes, so longer passwords would be silently truncated.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

const loginBody = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(72),
});

module.exports = { registerBody, loginBody };
