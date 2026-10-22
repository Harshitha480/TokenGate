const request = require('supertest');
const { createApp } = require('../../src/app');
const ApiKey = require('../../src/models/ApiKey');
const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = require('../helpers/db');
const { registerUser, createApiKey } = require('../helpers/factories');

describe('API key management', () => {
  const app = createApp();
  let token;

  beforeAll(connectTestDatabase);
  beforeEach(async () => {
    ({ token } = await registerUser(app));
  });
  afterEach(clearTestDatabase);
  afterAll(disconnectTestDatabase);

  const authed = (req) => req.set('Authorization', `Bearer ${token}`);

  it('returns the secret exactly once, at creation', async () => {
    const created = await authed(request(app).post('/api/keys')).send({ name: 'Production' });

    expect(created.status).toBe(201);
    expect(created.body.secret).toMatch(/^tg_live_[A-Za-z0-9_-]{32}$/);
    expect(created.body.key).toMatchObject({
      name: 'Production',
      status: 'active',
      rateLimitPerMinute: 20,
      hasCustomRateLimit: false,
    });
    expect(created.body.key.maskedKey).toBe(
      `${created.body.secret.slice(0, 12)}…${created.body.secret.slice(-4)}`,
    );

    const listed = await authed(request(app).get('/api/keys'));
    const serialized = JSON.stringify(listed.body);
    expect(serialized).not.toContain(created.body.secret);
    expect(serialized).not.toContain('keyHash');
  });

  it('fetches a single key by id', async () => {
    const { key } = await createApiKey(app, token, { name: 'Staging' });

    const res = await authed(request(app).get(`/api/keys/${key.id}`));

    expect(res.status).toBe(200);
    expect(res.body.key).toMatchObject({ id: key.id, name: 'Staging', status: 'active' });
  });

  it('stores only a hash of the key', async () => {
    const { secret } = await createApiKey(app, token);

    const stored = await ApiKey.findOne().select('+keyHash').lean();

    expect(stored.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(secret);
  });

  it('sets, changes and clears a custom rate limit', async () => {
    const { key } = await createApiKey(app, token, { name: 'Batch jobs', rateLimitPerMinute: 5 });
    expect(key).toMatchObject({ rateLimitPerMinute: 5, hasCustomRateLimit: true });

    const raised = await authed(request(app).patch(`/api/keys/${key.id}`)).send({
      rateLimitPerMinute: 120,
    });
    expect(raised.body.key.rateLimitPerMinute).toBe(120);

    const cleared = await authed(request(app).patch(`/api/keys/${key.id}`)).send({
      rateLimitPerMinute: null,
    });
    expect(cleared.body.key).toMatchObject({ rateLimitPerMinute: 20, hasCustomRateLimit: false });
  });

  it('revokes a key and refuses further changes to it', async () => {
    const { key } = await createApiKey(app, token);

    const revoked = await authed(request(app).delete(`/api/keys/${key.id}`));
    expect(revoked.status).toBe(200);
    expect(revoked.body.key.status).toBe('revoked');

    const rename = await authed(request(app).patch(`/api/keys/${key.id}`)).send({ name: 'New' });
    expect(rename.status).toBe(409);
    expect(rename.body.error.code).toBe('key_revoked');
  });

  it("hides other users' keys behind a 404", async () => {
    const { key } = await createApiKey(app, token);
    const other = await registerUser(app);

    const res = await request(app)
      .delete(`/api/keys/${key.id}`)
      .set('Authorization', `Bearer ${other.token}`);

    expect(res.status).toBe(404);
  });

  it('validates ids and bodies', async () => {
    const badId = await authed(request(app).get('/api/keys/not-an-id'));
    expect(badId.status).toBe(400);
    expect(badId.body.error.details[0].path).toBe('params.id');

    const emptyPatch = await authed(request(app).patch('/api/keys/64b7f0c2a1b2c3d4e5f60718')).send(
      {},
    );
    expect(emptyPatch.status).toBe(400);

    const badLimit = await authed(request(app).post('/api/keys')).send({
      name: 'x',
      rateLimitPerMinute: 0,
    });
    expect(badLimit.status).toBe(400);
  });

  it('requires a session', async () => {
    const res = await request(app).get('/api/keys');

    expect(res.status).toBe(401);
  });
});
