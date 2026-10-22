const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config/env');
const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = require('../helpers/db');
const { registerUser } = require('../helpers/factories');

describe('auth', () => {
  const app = createApp();

  beforeAll(connectTestDatabase);
  afterEach(clearTestDatabase);
  afterAll(disconnectTestDatabase);

  describe('POST /api/auth/register', () => {
    it('creates an account and returns a session token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: ' Ada@Example.com ', name: 'Ada', password: 'analytical-engine' });

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        email: 'ada@example.com',
        name: 'Ada',
        role: 'member',
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(typeof res.body.token).toBe('string');
    });

    it('rejects a duplicate email with 409', async () => {
      await registerUser(app, { email: 'dup@example.com' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'dup@example.com', name: 'Again', password: 'another-password' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('conflict');
    });

    it('lists every validation problem', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', name: '', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
      expect(res.body.error.details.map((d) => d.path).sort()).toEqual([
        'body.email',
        'body.name',
        'body.password',
      ]);
    });
  });

  describe('POST /api/auth/login', () => {
    it('signs in with the right password', async () => {
      const { user, password } = await registerUser(app);

      const res = await request(app).post('/api/auth/login').send({ email: user.email, password });

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(user.id);
      expect(typeof res.body.token).toBe('string');
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const { user } = await registerUser(app);

      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong-password' });
      const unknownEmail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the signed-in user', async () => {
      const { user, token } = await registerUser(app);

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: user.id, email: user.email });
    });

    it('requires a token', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthorized');
    });

    it('reports an expired session distinctly', async () => {
      const { user } = await registerUser(app);
      const expired = jwt.sign({ role: 'member' }, config.jwt.secret, {
        subject: user.id,
        issuer: 'tokengate',
        expiresIn: -10,
      });

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('token_expired');
    });

    it('rejects unsigned tokens (alg: none)', async () => {
      const { user } = await registerUser(app);
      const unsigned = jwt.sign({ role: 'admin' }, null, {
        algorithm: 'none',
        subject: user.id,
        issuer: 'tokengate',
      });

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${unsigned}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('invalid_token');
    });
  });
});
