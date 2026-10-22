const CacheEntry = require('../../models/CacheEntry');

/** CacheStore backed by a MongoDB collection with a TTL index. */
function createMongoCacheStore({ ttlSeconds }) {
  return {
    name: 'mongo',

    async get(key) {
      // The TTL monitor only runs about once a minute, so check expiry here too.
      const entry = await CacheEntry.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
      return entry ? JSON.parse(entry.payload) : null;
    },

    async set(key, value) {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await CacheEntry.updateOne(
        { key },
        { $set: { payload: JSON.stringify(value), expiresAt } },
        { upsert: true },
      );
    },
  };
}

module.exports = { createMongoCacheStore };
