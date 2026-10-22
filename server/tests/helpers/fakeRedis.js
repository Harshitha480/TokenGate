/**
 * In-memory stand-in for the subset of @upstash/redis the stores use. The script
 * runner re-implements the rate-limit Lua script in JS, so the store's argument
 * passing and result mapping are tested; the Lua itself is verified against a real
 * Upstash database in the live smoke run (see README).
 */
function createFakeRedis({ now = Date.now } = {}) {
  const strings = new Map(); // key -> { value, expiresAt }
  const sortedSets = new Map(); // key -> [{ score, member }]
  const calls = [];

  function runSlidingWindow([key], [nowArg, windowArg, limitArg, member]) {
    const current = Number(nowArg);
    const window = Number(windowArg);
    const limit = Number(limitArg);
    const set = (sortedSets.get(key) ?? []).filter((entry) => entry.score > current - window);
    let allowed = 0;
    if (set.length < limit) {
      set.push({ score: current, member });
      allowed = 1;
    }
    sortedSets.set(key, set);
    const oldest = set[0]?.score ?? current;
    return [allowed, set.length, oldest];
  }

  return {
    calls,
    strings,
    async get(key) {
      calls.push(['get', key]);
      const entry = strings.get(key);
      if (!entry || (entry.expiresAt && entry.expiresAt <= now())) return null;
      return entry.value;
    },
    async set(key, value, options = {}) {
      calls.push(['set', key, options]);
      strings.set(key, { value, expiresAt: options.ex ? now() + options.ex * 1000 : null });
      return 'OK';
    },
    createScript(source) {
      return {
        source,
        async exec(keys, args) {
          calls.push(['script', keys, args]);
          return runSlidingWindow(keys, args);
        },
      };
    },
  };
}

module.exports = { createFakeRedis };
