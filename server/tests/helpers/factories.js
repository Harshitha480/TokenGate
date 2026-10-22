const request = require('supertest');

let userCounter = 0;

async function registerUser(app, overrides = {}) {
  userCounter += 1;
  const body = {
    email: `user${userCounter}@example.com`,
    name: `Test User ${userCounter}`,
    password: 'correct-horse-battery',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return { user: res.body.user, token: res.body.token, password: body.password };
}

async function createApiKey(app, token, body = { name: 'Test key' }) {
  const res = await request(app)
    .post('/api/keys')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  if (res.status !== 201) throw new Error(`create key failed: ${JSON.stringify(res.body)}`);
  return { key: res.body.key, secret: res.body.secret };
}

module.exports = { registerUser, createApiKey };
