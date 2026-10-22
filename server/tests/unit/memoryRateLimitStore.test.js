const { createMemoryRateLimitStore } = require('../../src/services/rateLimit/memoryRateLimitStore');

const WINDOW = 60_000;

describe('memory sliding-window rate limiter', () => {
  let clock;
  let store;

  beforeEach(() => {
    clock = 1_000_000;
    store = createMemoryRateLimitStore({ now: () => clock });
  });
  afterEach(() => store.close());

  const hit = (key = 'k', limit = 3) => store.hit(key, { limit, windowMs: WINDOW });

  it('allows up to the limit, then rejects with time until a slot frees', async () => {
    expect(await hit()).toMatchObject({ allowed: true, remaining: 2 });
    clock += 10_000;
    expect(await hit()).toMatchObject({ allowed: true, remaining: 1 });
    clock += 10_000;
    expect(await hit()).toMatchObject({ allowed: true, remaining: 0 });

    clock += 5_000;
    const rejected = await hit();
    expect(rejected).toMatchObject({ allowed: false, remaining: 0, limit: 3 });
    // The first request (25s ago) leaves the window in 35s.
    expect(rejected.retryAfterMs).toBe(35_000);
  });

  it('slides: each old request frees exactly one slot as it ages out', async () => {
    await hit();
    clock += 20_000;
    await hit();
    clock += 20_000;
    await hit();

    clock += 20_000; // first request is now exactly one window old
    expect(await hit()).toMatchObject({ allowed: true });
    expect(await hit()).toMatchObject({ allowed: false });

    clock += 20_000; // second request ages out
    expect(await hit()).toMatchObject({ allowed: true });
  });

  it('does not count rejected requests against the client', async () => {
    await hit('k', 1);
    for (let i = 0; i < 5; i += 1) await hit('k', 1);

    clock += WINDOW;
    expect(await hit('k', 1)).toMatchObject({ allowed: true });
  });

  it('keeps separate windows per key', async () => {
    await hit('a', 1);

    expect(await hit('a', 1)).toMatchObject({ allowed: false });
    expect(await hit('b', 1)).toMatchObject({ allowed: true });
  });

  it('forgets idle keys when swept', async () => {
    await hit('a');
    await hit('b');
    expect(store.size()).toBe(2);

    clock += WINDOW + 1;
    store.sweep();

    expect(store.size()).toBe(0);
  });
});
