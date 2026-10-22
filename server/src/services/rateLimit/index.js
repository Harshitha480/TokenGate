const { createMemoryRateLimitStore } = require('./memoryRateLimitStore');
const { createUpstashRateLimitStore } = require('./upstashRateLimitStore');

/**
 * A RateLimitStore has one operation:
 *   hit(key, { limit, windowMs }) → Promise<{ allowed, limit, remaining, retryAfterMs, resetMs }>
 * It records the request when allowed. Swapping implementations needs no other change.
 */
function createRateLimitStore(rateLimitConfig, { getRedis }) {
  if (rateLimitConfig.driver === 'upstash') {
    return createUpstashRateLimitStore({ redis: getRedis() });
  }
  return createMemoryRateLimitStore();
}

module.exports = { createRateLimitStore };
