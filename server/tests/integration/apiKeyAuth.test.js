const express = require('express');
const request = require('supertest');
const { createApp } = require('../../src/app');
const ApiKey = require('../../src/models/ApiKey');
const { requireApiKey } = require('../../src/middleware/auth');
const { requestId } = require('../../src/middleware/requestId');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = require('../helpers/db');
const { registerUser, createApiKey } = require('../helpers/factories');
const { waitFor } = require('../helpers/waitFor');

// A minimal app that only exercises the gateway-key middleware.
function createProbeApp() {
  const probe = express();
  probe.use(requestId);
  probe.get('/probe', requireApiKey, (req, res) => res.json({ apiKeyId: req.apiKey.id }));
  probe.use(errorHandler);
  return probe;
}

describe('requireApiKey middleware', () => {
  const app = createApp();
  const probe = createProbeApp();
  let token;
  let key;
  let secret;

  beforeAll(connectTestDatabase);
  beforeEach(async () => {
    ({ token } = await registerUser(app));
    ({ key, secret } = await createApiKey(app, token));
  });
  afterEach(clearTestDatabase);
  afterAll(disconnectTestDatabase);

  it('accepts a bearer key and identifies it', async () => {
    const res = await request(probe).get('/probe').set('Authorization', `Bearer ${secret}`);

    expect(res.status).toBe(200);
    expect(res.body.apiKeyId).toBe(key.id);
  });

  it('accepts the x-api-key header', async () => {
    const res = await request(probe).get('/probe').set('x-api-key', secret);

    expect(res.status).toBe(200);
  });

  it('records when the key was last used', async () => {
    await request(probe).get('/probe').set('Authorization', `Bearer ${secret}`);

    const stored = await waitFor(() => ApiKey.findOne({ _id: key.id, lastUsedAt: { $ne: null } }));
    expect(stored.lastUsedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['no key', {}, 'missing_api_key'],
    ['a malformed key', { Authorization: 'Bearer hello' }, 'invalid_api_key'],
    ['an unknown key', { Authorization: `Bearer tg_live_${'a'.repeat(32)}` }, 'invalid_api_key'],
  ])('rejects %s', async (_label, headers, code) => {
    const res = await request(probe).get('/probe').set(headers);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(code);
  });

  it('rejects a revoked key', async () => {
    await request(app).delete(`/api/keys/${key.id}`).set('Authorization', `Bearer ${token}`);

    const res = await request(probe).get('/probe').set('Authorization', `Bearer ${secret}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('api_key_revoked');
  });
});
