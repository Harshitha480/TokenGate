const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/**
 * Sliding-window log in process memory: each key keeps the timestamps of the
 * requests it was allowed in the last window. Exact, and cheap at per-minute limits.
 * State is per process, so run one instance or switch to the Upstash store.
 *
 * @param {{ now?: () => number, sweepIntervalMs?: number }} options
 */
function createMemoryRateLimitStore({
  now = Date.now,
  sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS,
} = {}) {
  const windows = new Map(); // key -> { timestamps: number[], windowMs: number }

  function dropExpired(timestamps, cutoff) {
    let firstLive = 0;
    while (firstLive < timestamps.length && timestamps[firstLive] <= cutoff) firstLive += 1;
    if (firstLive > 0) timestamps.splice(0, firstLive);
  }

  async function hit(key, { limit, windowMs }) {
    const current = now();
    const window = windows.get(key) ?? { timestamps: [], windowMs };
    window.windowMs = windowMs;
    dropExpired(window.timestamps, current - windowMs);

    const allowed = window.timestamps.length < limit;
    if (allowed) window.timestamps.push(current);
    windows.set(key, window);

    const oldest = window.timestamps[0] ?? current;
    const resetMs = Math.max(0, oldest + windowMs - current);
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - window.timestamps.length),
      retryAfterMs: allowed ? 0 : resetMs,
      resetMs,
    };
  }

  // Forget keys that have been idle for a whole window so memory stays bounded.
  function sweep() {
    const current = now();
    for (const [key, window] of windows) {
      dropExpired(window.timestamps, current - window.windowMs);
      if (window.timestamps.length === 0) windows.delete(key);
    }
  }

  const timer = setInterval(sweep, sweepIntervalMs);
  timer.unref();

  return {
    name: 'memory',
    hit,
    sweep,
    size: () => windows.size,
    close: () => clearInterval(timer),
  };
}

module.exports = { createMemoryRateLimitStore };
