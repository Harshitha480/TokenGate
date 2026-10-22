const { AppError } = require('../lib/errors');
const { logger } = require('../lib/logger');

const ONE_MINUTE_MS = 60_000;

/**
 * Express middleware over a RateLimitStore.
 *
 * If the store itself is unreachable (Redis outage) the request is allowed: briefly
 * losing rate limiting is a smaller failure than turning every request into a 500.
 *
 * @param {{
 *   store: { hit: Function },
 *   keyFor: (req) => string,
 *   limitFor: (req) => number,
 *   windowMs?: number,
 * }} options
 */
function createRateLimiter({ store, keyFor, limitFor, windowMs = ONE_MINUTE_MS }) {
  return async function rateLimit(req, res, next) {
    let result;
    try {
      result = await store.hit(keyFor(req), { limit: limitFor(req), windowMs });
    } catch (err) {
      (req.log ?? logger).warn({ err }, 'Rate limit store unavailable; allowing request');
      return next();
    }

    res.set({
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetMs / 1000)),
    });

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      return next(
        new AppError(
          429,
          'rate_limit_exceeded',
          `Rate limit of ${result.limit} requests per minute exceeded; retry in ${retryAfterSeconds}s`,
          { headers: { 'Retry-After': String(retryAfterSeconds) } },
        ),
      );
    }
    next();
  };
}

module.exports = { createRateLimiter };
