const request = require('supertest');
const { createApp } = require('../../src/app');
const { createContainer } = require('../../src/container');
const { calculateCostUsd } = require('../../src/services/costService');
const { createMemoryRateLimitStore } = require('../../src/services/rateLimit/memoryRateLimitStore');
const RequestLog = require('../../src/models/RequestLog');
const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = require('../helpers/db');
const { registerUser, createApiKey } = require('../helpers/factories');
const { waitFor } = require('../helpers/waitFor');
const { testModels, chatRequest, backupPricing } = require('../helpers/testModels');

const logFor = (res) =>
  waitFor(() => RequestLog.findOne({ requestId: res.headers['x-request-id'] }));

describe('gateway reliability', () => {
  let app;
  let token;
  let secret;

  const buildApp = (overrides = {}) =>
    createApp(
      createContainer({
        models: testModels,
        rateLimitStore: createMemoryRateLimitStore(),
        ...overrides,
      }),
    );

  beforeAll(connectTestDatabase);
  beforeEach(async () => {
    app = buildApp();
    ({ token } = await registerUser(app));
    ({ secret } = await createApiKey(app, token, { name: 'Reliability', rateLimitPerMinute: 100 }));
  });
  afterEach(clearTestDatabase);
  afterAll(disconnectTestDatabase);

  const complete = (body, headers = {}, targetApp = app, key = secret) =>
    request(targetApp)
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${key}`)
      .set(headers)
      .send(body);

  describe('exact-match cache', () => {
    it('serves the second identical temperature-0 request from the cache', async () => {
      const first = await complete(chatRequest({ temperature: 0 }));
      const second = await complete(chatRequest({ temperature: 0 }));

      expect(first.headers['x-tokengate-cache']).toBe('MISS');
      expect(second.headers['x-tokengate-cache']).toBe('HIT');
      expect(second.headers['x-tokengate-provider']).toBe('cache');
      expect(second.body).toEqual(first.body);

      const [firstLog, secondLog] = await Promise.all([logFor(first), logFor(second)]);
      expect(firstLog).toMatchObject({ cached: false, savedUsd: 0 });
      expect(firstLog.costUsd).toBeGreaterThan(0);
      expect(secondLog).toMatchObject({ cached: true, costUsd: 0, savedUsd: firstLog.costUsd });
      expect(secondLog.attempts).toHaveLength(0);
    });

    it('bypasses the cache for non-zero temperature', async () => {
      const first = await complete(chatRequest({ temperature: 0.7 }));
      const second = await complete(chatRequest({ temperature: 0.7 }));

      expect(first.headers['x-tokengate-cache']).toBe('BYPASS');
      expect(second.headers['x-tokengate-cache']).toBe('BYPASS');
    });

    it('caches any temperature when the client forces it', async () => {
      const force = { 'X-TokenGate-Cache': 'force' };
      const first = await complete(chatRequest({ temperature: 0.7 }), force);
      const second = await complete(chatRequest({ temperature: 0.7 }), force);

      expect(first.headers['x-tokengate-cache']).toBe('MISS');
      expect(second.headers['x-tokengate-cache']).toBe('HIT');
    });

    it("never serves one user's cached response to another", async () => {
      await complete(chatRequest({ temperature: 0 }));
      const other = await registerUser(app);
      const otherKey = await createApiKey(app, other.token);

      const res = await complete(chatRequest({ temperature: 0 }), {}, app, otherKey.secret);

      expect(res.headers['x-tokengate-cache']).toBe('MISS');
    });

    it('still answers when the cache store is down', async () => {
      const brokenCache = {
        get: () => Promise.reject(new Error('cache down')),
        set: () => Promise.reject(new Error('cache down')),
      };
      const appWithBrokenCache = buildApp({ cacheStore: brokenCache });

      const res = await complete(chatRequest({ temperature: 0 }), {}, appWithBrokenCache);

      expect(res.status).toBe(200);
      expect(res.headers['x-tokengate-cache']).toBe('MISS');
    });
  });

  describe('rate limiting', () => {
    it('returns 429 with Retry-After once a key exceeds its per-minute limit', async () => {
      const limited = await createApiKey(app, token, { name: 'Tight', rateLimitPerMinute: 2 });
      const send = () => complete(chatRequest(), {}, app, limited.secret);

      const first = await send();
      const second = await send();
      const third = await send();

      expect(first.status).toBe(200);
      expect(first.headers['x-ratelimit-limit']).toBe('2');
      expect(first.headers['x-ratelimit-remaining']).toBe('1');
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      expect(third.body.error.code).toBe('rate_limit_exceeded');
      expect(Number(third.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(Number(third.headers['retry-after'])).toBeLessThanOrEqual(60);
    });

    it('limits each key independently', async () => {
      const tight = await createApiKey(app, token, { name: 'Tight', rateLimitPerMinute: 1 });
      await complete(chatRequest(), {}, app, tight.secret);

      const blocked = await complete(chatRequest(), {}, app, tight.secret);
      const otherKey = await complete(chatRequest());

      expect(blocked.status).toBe(429);
      expect(otherKey.status).toBe(200);
    });

    it('lets traffic through if the rate limit store is unavailable', async () => {
      const brokenStore = { hit: () => Promise.reject(new Error('redis down')) };
      const appWithBrokenStore = buildApp({ rateLimitStore: brokenStore });

      const res = await complete(chatRequest(), {}, appWithBrokenStore);

      expect(res.status).toBe(200);
    });

    it('limits login attempts per IP', async () => {
      const strictApp = buildApp({ authRateLimitPerMinute: 2 });
      const attempt = () =>
        request(strictApp)
          .post('/api/auth/login')
          .send({ email: 'nobody@example.com', password: 'guess' });

      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(401);
      const third = await attempt();
      expect(third.status).toBe(429);
      expect(third.headers['retry-after']).toBeDefined();
    });
  });

  describe('automatic fallback', () => {
    it('retries on the next model when the primary has an outage', async () => {
      const res = await complete(chatRequest({ model: 'test-primary-down' }));

      expect(res.status).toBe(200);
      expect(res.headers['x-tokengate-fallback']).toBe('true');
      expect(res.headers['x-tokengate-model']).toBe('test-backup');
      expect(res.headers['x-tokengate-provider']).toBe('mock');

      const log = await logFor(res);
      expect(log).toMatchObject({
        model: 'test-primary-down',
        servedModel: 'test-backup',
        fallbackUsed: true,
        status: 'success',
      });
      expect(log.attempts.map((a) => [a.model, a.outcome])).toEqual([
        ['test-primary-down', 'error'],
        ['test-backup', 'success'],
      ]);
      // Billed at the price of the model that actually answered.
      expect(log.costUsd).toBe(
        calculateCostUsd(backupPricing, {
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
        }),
      );
    });

    it('falls back when the primary times out', async () => {
      const res = await complete(chatRequest({ model: 'test-slow' }));

      expect(res.status).toBe(200);
      expect(res.headers['x-tokengate-model']).toBe('test-backup');
      const log = await logFor(res);
      expect(log.attempts[0].errorCode).toBe('upstream_timeout');
    });

    it('does not fall back on a 4xx client error', async () => {
      const res = await complete(chatRequest({ model: 'test-bad-request' }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('upstream_rejected_request');
      const log = await logFor(res);
      expect(log.fallbackUsed).toBe(false);
      expect(log.attempts).toHaveLength(1);
    });

    it('can simulate a primary outage on demand to demo fallback', async () => {
      const res = await complete(chatRequest(), { 'X-TokenGate-Simulate-Failure': 'primary' });

      expect(res.status).toBe(200);
      expect(res.headers['x-tokengate-fallback']).toBe('true');
      expect(res.headers['x-tokengate-model']).toBe('test-backup');
      const log = await logFor(res);
      expect(log.attempts[0]).toMatchObject({ simulated: true, errorCode: 'simulated_outage' });
    });

    it('rejects unknown failure-simulation values', async () => {
      const res = await complete(chatRequest(), { 'X-TokenGate-Simulate-Failure': 'everything' });

      expect(res.status).toBe(400);
    });

    it('refuses failure simulation when it is disabled', async () => {
      const lockedDown = buildApp({ allowFailureSimulation: false });

      const res = await complete(
        chatRequest(),
        { 'X-TokenGate-Simulate-Failure': 'primary' },
        lockedDown,
      );

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('failure_simulation_disabled');
    });
  });
});
