const { randomUUID } = require('node:crypto');

const KEY_PREFIX = 'tokengate:ratelimit:';

// The same sliding-window log as the memory store, kept in a sorted set scored by
// timestamp. Running it as one Lua script makes check-and-record atomic, so two
// gateway instances can never both take the last free slot.
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
local allowed = 0
if count < limit then
  redis.call('ZADD', key, now, ARGV[4])
  count = count + 1
  allowed = 1
end
redis.call('PEXPIRE', key, window)

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local oldestScore = now
if oldest[2] then oldestScore = tonumber(oldest[2]) end
return {allowed, count, oldestScore}
`;

/**
 * @param {{ redis: import('@upstash/redis').Redis, now?: () => number }} options
 */
function createUpstashRateLimitStore({ redis, now = Date.now }) {
  const script = redis.createScript(SLIDING_WINDOW_SCRIPT);

  async function hit(key, { limit, windowMs }) {
    const current = now();
    // A unique member per request: two requests in the same millisecond both count.
    const member = `${current}:${randomUUID()}`;
    const [allowedFlag, count, oldest] = await script.exec(
      [KEY_PREFIX + key],
      [String(current), String(windowMs), String(limit), member],
    );

    const allowed = Number(allowedFlag) === 1;
    const resetMs = Math.max(0, Number(oldest) + windowMs - current);
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - Number(count)),
      retryAfterMs: allowed ? 0 : resetMs,
      resetMs,
    };
  }

  return { name: 'upstash', hit, close: () => {} };
}

module.exports = { createUpstashRateLimitStore, SLIDING_WINDOW_SCRIPT, KEY_PREFIX };
