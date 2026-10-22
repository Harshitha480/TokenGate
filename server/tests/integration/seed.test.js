const request = require('supertest');
const { createApp } = require('../../src/app');
const { createModelCatalog } = require('../../src/services/modelCatalog');
const { models } = require('../../src/config/models');
const User = require('../../src/models/User');
const ApiKey = require('../../src/models/ApiKey');
const RequestLog = require('../../src/models/RequestLog');
const { seedDemo, DEMO_USER } = require('../../scripts/lib/seedDemo');
const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = require('../helpers/db');
const { registerUser } = require('../helpers/factories');

describe('seed script', () => {
  const app = createApp();
  const catalogModels = createModelCatalog(models, { knownProviders: ['nvidia', 'mock'] }).list();
  const seed = () => seedDemo({ models: catalogModels, bcryptRounds: 4 });

  beforeAll(connectTestDatabase);
  afterEach(clearTestDatabase);
  afterAll(disconnectTestDatabase);

  it('creates a demo admin who can sign in and see a week of traffic', async () => {
    const { keys, logCount } = await seed();

    expect(keys.map((key) => key.name)).toEqual(['Production app', 'Batch jobs']);
    expect(keys.every((key) => key.secret.startsWith('tg_live_'))).toBe(true);
    expect(logCount).toBe(500);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: DEMO_USER.email, password: DEMO_USER.password });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('admin');

    const overview = await request(app)
      .get('/api/stats/overview?range=7d')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(overview.body.current.requests).toBeGreaterThan(450);
    expect(overview.body.current.costUsd).toBeGreaterThan(0);
  });

  it("is idempotent and leaves other accounts' data alone", async () => {
    const someoneElse = await registerUser(app);
    await RequestLog.create({
      requestId: 'real-user-request-1',
      userId: someoneElse.user.id,
      apiKeyId: someoneElse.user.id,
      model: 'gpt-oss-20b',
      latencyMs: 10,
      status: 'success',
      statusCode: 200,
    });

    await seed();
    await seed();

    expect(await User.countDocuments({ email: DEMO_USER.email })).toBe(1);
    const demo = await User.findOne({ email: DEMO_USER.email });
    expect(await ApiKey.countDocuments({ userId: demo._id })).toBe(2);
    expect(await RequestLog.countDocuments({ userId: demo._id })).toBe(500);
    expect(await RequestLog.countDocuments({ userId: someoneElse.user.id })).toBe(1);
  });
});
