const request = require('supertest');
const { createApp } = require('../../src/app');
const { connectTestDatabase, disconnectTestDatabase } = require('../helpers/db');

describe('GET /health', () => {
  const app = createApp();

  beforeAll(connectTestDatabase);
  afterAll(disconnectTestDatabase);

  it('reports ok while the database is connected', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('assigns a request id to every response', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('propagates a safe caller-supplied request id', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'trace-abc-12345');

    expect(res.headers['x-request-id']).toBe('trace-abc-12345');
  });

  it('replaces an unsafe caller-supplied request id', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'bad id <script>');

    expect(res.headers['x-request-id']).not.toBe('bad id <script>');
  });
});
