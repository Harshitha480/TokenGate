const { createMongoCacheStore } = require('./mongoCacheStore');
const { createUpstashCacheStore } = require('./upstashCacheStore');

/**
 * A CacheStore has two methods:
 *   get(key) → Promise<object | null>
 *   set(key, value) → Promise<void>   (expires after the configured TTL)
 */
function createCacheStore(cacheConfig, { getRedis }) {
  if (cacheConfig.driver === 'upstash') {
    return createUpstashCacheStore({ redis: getRedis(), ttlSeconds: cacheConfig.ttlSeconds });
  }
  return createMongoCacheStore({ ttlSeconds: cacheConfig.ttlSeconds });
}

module.exports = { createCacheStore };
