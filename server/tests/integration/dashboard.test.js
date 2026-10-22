const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../../src/app');
const { createContainer } = require('../../src/container');
const { createMemoryRateLimitStore } = require('../../src/services/rateLimit/memoryRateLimitStore');
const RequestLog = require('../../src/models/RequestLog');
const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = require('../helpers/db');
const { registerUser, createApiKey } = require('../helpers/factories');
const { waitFor } = require('../helpers/waitFor');
const { testModels, chatRequest } = require('../helpers/testModels');

const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR);

describe('dashboard API', () => {
  const app = createApp(
    createContainer({ models: testModels, rateLimitStore: createMemoryRateLimitStore() }),
  );
  let user;
  let token;
  let key;
  let otherKey;

  const authed = (req) => req.set('Authorization', `Bearer ${token}`);

  function logRow(overrides = {}) {
    return {
      requestId: new mongoose.Types.ObjectId().toString(),
      userId: user.id,
      apiKeyId: key.id,
      model: 'test-model',
      servedModel: 'test-model',
      provider: 'mock',
      promptTokens: 100,
      completionTokens: 50,
      costUsd: 0.001,
      latencyMs: 100,
      status: 'success',
      statusCode: 200,
      cacheStatus: 'BYPASS',
      createdAt: hoursAgo(1),
      ...overrides,
    };
  }

  beforeAll(connectTestDatabase);
  beforeEach(async () => {
    ({ user, token } = await registerUser(app));
    ({ key } = await createApiKey(app, token, { name: 'Production' }));
    ({ key: otherKey } = await createApiKey(app, token, { name: 'Batch' }));
  });
  afterEach(clearTestDatabase);
  afterAll(disconnectTestDatabase);

  describe('GET /api/stats/overview', () => {
    it('summarises the range and the period before it', async () => {
      const outsider = await registerUser(app);
      await RequestLog.insertMany([
        logRow({ latencyMs: 100, cacheStatus: 'MISS' }),
        logRow({ latencyMs: 200, cacheStatus: 'MISS', fallbackUsed: true }),
        logRow({
          latencyMs: 5,
          costUsd: 0,
          savedUsd: 0.001,
          cached: true,
          cacheStatus: 'HIT',
          provider: 'cache',
        }),
        logRow({
          latencyMs: 900,
          costUsd: 0,
          status: 'error',
          statusCode: 502,
          servedModel: null,
        }),
        logRow({ latencyMs: 60_000, status: 'aborted', statusCode: 499 }),
        // Previous 24h window.
        logRow({ createdAt: hoursAgo(30), costUsd: 0.5 }),
        // Another user's traffic must never show up.
        logRow({ userId: outsider.user.id, costUsd: 99 }),
      ]);

      const res = await authed(request(app).get('/api/stats/overview?range=24h'));

      expect(res.status).toBe(200);
      expect(res.body.current).toMatchObject({
        requests: 5,
        costUsd: 0.003,
        savedUsd: 0.001,
        cacheHits: 1,
        cacheHitRate: 1 / 3, // 1 HIT out of 3 cache lookups; BYPASS traffic does not count
        errorCount: 1,
        errorRate: 1 / 5,
        fallbackCount: 1,
        avgLatencyMs: Math.round((100 + 200 + 5 + 900) / 4), // aborted excluded
      });
      expect(res.body.current.p95LatencyMs).toBeGreaterThanOrEqual(200);
      expect(res.body.current.p95LatencyMs).toBeLessThanOrEqual(900);
      expect(res.body.previous).toMatchObject({ requests: 1, costUsd: 0.5 });
    });

    it('returns zeros and nulls (not NaN) for an empty range', async () => {
      const res = await authed(request(app).get('/api/stats/overview?range=7d'));

      expect(res.body.current).toMatchObject({
        requests: 0,
        costUsd: 0,
        cacheHitRate: null,
        errorRate: null,
        avgLatencyMs: null,
        p95LatencyMs: null,
      });
    });

    it('rejects an unknown range', async () => {
      const res = await authed(request(app).get('/api/stats/overview?range=1y'));

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/stats/timeseries', () => {
    it('returns one point per bucket, empty buckets included, summing to the total', async () => {
      await RequestLog.insertMany([
        logRow({ createdAt: hoursAgo(1) }),
        logRow({ createdAt: hoursAgo(1.2) }),
        logRow({ createdAt: hoursAgo(5), status: 'error', statusCode: 502 }),
      ]);

      const res = await authed(request(app).get('/api/stats/timeseries?range=24h&metric=requests'));

      expect(res.status).toBe(200);
      expect(res.body.bucket).toEqual({ unit: 'hour', size: 1 });
      expect(res.body.points.length).toBeGreaterThanOrEqual(24);
      expect(res.body.points.reduce((sum, p) => sum + p.value, 0)).toBe(3);
      expect(res.body.points.reduce((sum, p) => sum + p.errors, 0)).toBe(1);
      expect(res.body.points.filter((p) => p.value === 0).length).toBeGreaterThan(18);
    });

    it("buckets by the viewer's time zone", async () => {
      await RequestLog.insertMany([logRow()]);

      const res = await authed(
        request(app).get('/api/stats/timeseries?range=24h&metric=cost&tz=Asia/Kolkata'),
      );

      // IST hours begin at :30 past the UTC hour.
      expect(new Date(res.body.points[0].t).getUTCMinutes()).toBe(30);
      expect(res.body.points.reduce((sum, p) => sum + p.value, 0)).toBeCloseTo(0.001, 9);
    });

    it('matches MongoDB 6-hour bins in a half-hour time zone', async () => {
      await RequestLog.insertMany([
        logRow({ createdAt: hoursAgo(2) }),
        logRow({ createdAt: hoursAgo(40) }),
      ]);

      const res = await authed(
        request(app).get('/api/stats/timeseries?range=7d&metric=requests&tz=Asia/Kolkata'),
      );

      // If the bucket starts computed in JS disagreed with $dateTrunc, rows would be dropped.
      expect(res.body.points.reduce((sum, p) => sum + p.value, 0)).toBe(2);
      expect(new Date(res.body.points[0].t).getUTCMinutes()).toBe(30);
    });

    it('leaves latency empty (null) for buckets with no traffic', async () => {
      await RequestLog.insertMany([logRow({ latencyMs: 250 })]);

      const res = await authed(request(app).get('/api/stats/timeseries?range=7d&metric=latency'));

      const withTraffic = res.body.points.filter((p) => p.value !== null);
      expect(withTraffic).toHaveLength(1);
      expect(withTraffic[0]).toMatchObject({ value: 250, p95: 250 });
    });

    it('validates the metric and time zone', async () => {
      const badMetric = await authed(request(app).get('/api/stats/timeseries?metric=tokens'));
      const badZone = await authed(request(app).get('/api/stats/timeseries?tz=Not/AZone'));

      expect(badMetric.status).toBe(400);
      expect(badZone.status).toBe(400);
    });
  });

  describe('GET /api/stats/by-model', () => {
    it('attributes requests to the model that answered, failures to the one requested', async () => {
      await RequestLog.insertMany([
        logRow({ servedModel: 'test-backup', model: 'test-model', costUsd: 0.003 }),
        logRow({ servedModel: 'test-backup', model: 'test-backup', costUsd: 0.003 }),
        logRow({ servedModel: 'test-model', costUsd: 0.001 }),
        logRow({ servedModel: null, model: 'test-outage', status: 'error', costUsd: 0 }),
      ]);

      const res = await authed(request(app).get('/api/stats/by-model?range=24h'));

      expect(res.body.data.map((row) => [row.model, row.requests, row.costUsd])).toEqual([
        ['test-backup', 2, 0.006],
        ['test-model', 1, 0.001],
        ['test-outage', 1, 0],
      ]);
      expect(res.body.data[2].errorRate).toBe(1);
    });
  });

  describe('GET /api/logs', () => {
    beforeEach(async () => {
      await RequestLog.insertMany([
        ...Array.from({ length: 30 }, (_, i) =>
          logRow({ createdAt: new Date(Date.now() - i * 60_000), prompt: 'secret prompt' }),
        ),
        logRow({ status: 'error', statusCode: 502, model: 'test-outage', apiKeyId: otherKey.id }),
        logRow({ cached: true, cacheStatus: 'HIT', costUsd: 0 }),
      ]);
    });

    it('paginates newest first and keeps heavy fields out of the list', async () => {
      const res = await authed(request(app).get('/api/logs?page=2&limit=10'));

      expect(res.status).toBe(200);
      expect(res.body.pagination).toEqual({ page: 2, limit: 10, total: 32, totalPages: 4 });
      expect(res.body.data).toHaveLength(10);
      const times = res.body.data.map((log) => new Date(log.createdAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(res.body.data[0]).not.toHaveProperty('prompt');
      expect(res.body.data[0].apiKeyName).toBe('Production');
    });

    it.each([
      ['status', 'status=error', 1],
      ['model', 'model=test-outage', 1],
      ['key', () => `apiKeyId=${otherKey.id}`, 1],
      ['cache', 'cached=true', 1],
    ])('filters by %s', async (_label, query, expected) => {
      const qs = typeof query === 'function' ? query() : query;

      const res = await authed(request(app).get(`/api/logs?${qs}`));

      expect(res.body.pagination.total).toBe(expected);
    });

    it('finds a request by the X-Request-Id the client saw', async () => {
      const [log] = await RequestLog.insertMany([logRow({ requestId: 'req-lookup-12345' })]);

      const res = await authed(request(app).get('/api/logs?requestId=req-lookup-12345'));

      expect(res.body.data.map((row) => row.id)).toEqual([log.id]);
    });

    it('caps the page size', async () => {
      const res = await authed(request(app).get('/api/logs?limit=500'));

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/logs/:id', () => {
    it('returns the full entry, attempts included', async () => {
      const [log] = await RequestLog.insertMany([
        logRow({
          attempts: [
            { model: 'test-model', provider: 'mock', outcome: 'error', latencyMs: 3 },
            { model: 'test-backup', provider: 'mock', outcome: 'success', latencyMs: 4 },
          ],
        }),
      ]);

      const res = await authed(request(app).get(`/api/logs/${log.id}`));

      expect(res.status).toBe(200);
      expect(res.body.log.attempts).toHaveLength(2);
      expect(res.body.log.apiKeyName).toBe('Production');
    });

    it("hides other users' logs", async () => {
      const outsider = await registerUser(app);
      const [log] = await RequestLog.insertMany([logRow({ userId: outsider.user.id })]);

      const res = await authed(request(app).get(`/api/logs/${log.id}`));

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/models', () => {
    it('lists models with prices, fallbacks and availability', async () => {
      const res = await authed(request(app).get('/api/models'));

      expect(res.body.data.find((m) => m.id === 'test-model')).toEqual({
        id: 'test-model',
        displayName: 'Test model',
        provider: 'mock',
        pricing: { inputPer1M: 1, outputPer1M: 2 },
        fallbacks: ['test-backup'],
        available: true,
      });
    });
  });

  describe('POST /api/playground/chat/completions', () => {
    const playground = (keyId, body = chatRequest()) =>
      authed(request(app).post('/api/playground/chat/completions'))
        .set('X-TokenGate-Key-Id', keyId)
        .send(body);

    it('runs the request through the gateway as the selected key', async () => {
      const res = await playground(key.id);

      expect(res.status).toBe(200);
      expect(res.headers['x-tokengate-provider']).toBe('mock');
      const log = await waitFor(() =>
        RequestLog.findOne({ requestId: res.headers['x-request-id'] }),
      );
      expect(log.apiKeyId.toString()).toBe(key.id);
    });

    it('refuses revoked keys and keys owned by someone else', async () => {
      await authed(request(app).delete(`/api/keys/${otherKey.id}`));
      const outsider = await registerUser(app);
      const foreign = await createApiKey(app, outsider.token);

      expect((await playground(otherKey.id)).status).toBe(409);
      expect((await playground(foreign.key.id)).status).toBe(404);
      expect((await playground('not-an-id')).status).toBe(400);
    });
  });

  it('requires a session for every dashboard endpoint', async () => {
    const paths = ['/api/stats/overview', '/api/stats/timeseries', '/api/logs', '/api/models'];
    const statuses = await Promise.all(paths.map((p) => request(app).get(p)));

    expect(statuses.map((res) => res.status)).toEqual([401, 401, 401, 401]);
  });
});
