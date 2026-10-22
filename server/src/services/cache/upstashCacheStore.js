const KEY_PREFIX = 'tokengate:cache:';

/**
 * CacheStore backed by Upstash Redis. Redis expires keys itself (SET … EX), so
 * there is nothing to clean up.
 *
 * @param {{ redis: import('@upstash/redis').Redis, ttlSeconds: number }} options
 */
function createUpstashCacheStore({ redis, ttlSeconds }) {
  return {
    name: 'upstash',

    async get(key) {
      const raw = await redis.get(KEY_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    },

    async set(key, value) {
      await redis.set(KEY_PREFIX + key, JSON.stringify(value), { ex: ttlSeconds });
    },
  };
}

module.exports = { createUpstashCacheStore, KEY_PREFIX };
