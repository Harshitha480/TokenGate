const { randomUUID } = require('node:crypto');
const { Redis } = require('@upstash/redis');
const {
  createUpstashRateLimitStore,
} = require('../../src/services/rateLimit/upstashRateLimitStore');
const { createUpstashCacheStore } = require('../../src/services/cache/upstashCacheStore');

// Runs only with real credentials (`npm run test:live` loads server/.env), so the
// Lua script is exercised against an actual Redis, not the fake used elsewhere.
const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
const describeLive = url && token ? describe : describe.skip;

describeLive('Upstash stores against a real database', () => {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  const runId = `live-test:${randomUUID()}`;

  afterAll(async () => {
    const keys = await redis.keys(`tokengate:*${runId}*`);
    if (keys.length > 0) await redis.del(...keys);
  });

  it('enforces the sliding window atomically', async () => {
    const store = createUpstashRateLimitStore({ redis });
    const limits = { limit: 3, windowMs: 60_000 };

    // Fire concurrently: the Lua script must still admit exactly three.
    const results = await Promise.all(
      Array.from({ length: 6 }, () => store.hit(`${runId}:burst`, limits)),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    const rejected = results.find((r) => !r.allowed);
    expect(rejected.retryAfterMs).toBeGreaterThan(55_000);
    expect(rejected.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('stores cache entries with a TTL', async () => {
    const store = createUpstashCacheStore({ redis, ttlSeconds: 120 });
    const value = { body: { id: 'chatcmpl-live' }, costUsd: 0.000123 };

    await store.set(`${runId}:entry`, value);

    expect(await store.get(`${runId}:entry`)).toEqual(value);
    const ttl = await redis.ttl(`tokengate:cache:${runId}:entry`);
    expect(ttl).toBeGreaterThan(100);
    expect(ttl).toBeLessThanOrEqual(120);
  });
});
