const {
  createUpstashRateLimitStore,
  SLIDING_WINDOW_SCRIPT,
} = require('../../src/services/rateLimit/upstashRateLimitStore');
const { createUpstashCacheStore } = require('../../src/services/cache/upstashCacheStore');
const { createFakeRedis } = require('../helpers/fakeRedis');

describe('Upstash rate limit store', () => {
  let clock;
  let redis;
  let store;

  beforeEach(() => {
    clock = 5_000_000;
    redis = createFakeRedis({ now: () => clock });
    store = createUpstashRateLimitStore({ redis, now: () => clock });
  });

  it('runs one atomic script per hit with namespaced keys and unique members', async () => {
    await store.hit('key:abc', { limit: 5, windowMs: 60_000 });
    await store.hit('key:abc', { limit: 5, windowMs: 60_000 });

    const scriptCalls = redis.calls.filter(([kind]) => kind === 'script');
    expect(scriptCalls).toHaveLength(2);
    expect(scriptCalls[0][1]).toEqual(['tokengate:ratelimit:key:abc']);
    expect(scriptCalls[0][2].slice(0, 3)).toEqual(['5000000', '60000', '5']);
    expect(scriptCalls[0][2][3]).not.toBe(scriptCalls[1][2][3]);
  });

  it('maps script results to the RateLimitStore contract', async () => {
    const limits = { limit: 2, windowMs: 60_000 };
    expect(await store.hit('k', limits)).toMatchObject({ allowed: true, remaining: 1 });
    clock += 15_000;
    expect(await store.hit('k', limits)).toMatchObject({ allowed: true, remaining: 0 });
    clock += 15_000;

    expect(await store.hit('k', limits)).toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterMs: 30_000,
      resetMs: 30_000,
    });
  });

  it('keeps check-and-record inside the Lua script', () => {
    expect(SLIDING_WINDOW_SCRIPT).toMatch(/ZREMRANGEBYSCORE[\s\S]*ZCARD[\s\S]*ZADD/);
    expect(SLIDING_WINDOW_SCRIPT).toContain('PEXPIRE');
  });
});

describe('Upstash cache store', () => {
  it('stores JSON under a namespaced key with the TTL, and reads it back', async () => {
    const redis = createFakeRedis();
    const store = createUpstashCacheStore({ redis, ttlSeconds: 3600 });
    const entry = { body: { id: 'chatcmpl-1' }, costUsd: 0.0001 };

    await store.set('abc', entry);

    expect(redis.calls).toContainEqual(['set', 'tokengate:cache:abc', { ex: 3600 }]);
    expect(await store.get('abc')).toEqual(entry);
    expect(await store.get('missing')).toBeNull();
  });
});
