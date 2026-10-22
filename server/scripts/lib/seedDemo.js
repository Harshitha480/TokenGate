const bcrypt = require('bcryptjs');
const User = require('../../src/models/User');
const ApiKey = require('../../src/models/ApiKey');
const RequestLog = require('../../src/models/RequestLog');
const { generateApiKey } = require('../../src/lib/apiKeyCrypto');
const { generateDemoTraffic } = require('./demoTraffic');

const DEMO_USER = {
  email: 'demo@tokengate.dev',
  password: 'tokengate-demo',
  name: 'Demo Admin',
};

const DEMO_KEYS = [
  { name: 'Production app', rateLimitPerMinute: 60 },
  { name: 'Batch jobs', rateLimitPerMinute: null },
];

/**
 * Creates (or recreates) the demo admin, two API keys and a week of request logs.
 * Only the demo account's own data is replaced, so it is safe to run repeatedly
 * against a database that also holds real accounts.
 *
 * @returns {Promise<{ user, keys: Array<{ name: string, secret: string }>, logCount: number }>}
 */
async function seedDemo({ models, bcryptRounds, now = new Date(), logCount = 500 }) {
  const passwordHash = await bcrypt.hash(DEMO_USER.password, bcryptRounds);
  const user = await User.findOneAndUpdate(
    { email: DEMO_USER.email },
    { $set: { name: DEMO_USER.name, passwordHash, role: 'admin' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  await Promise.all([
    ApiKey.deleteMany({ userId: user._id }),
    RequestLog.deleteMany({ userId: user._id }),
  ]);

  const created = await Promise.all(
    DEMO_KEYS.map(async ({ name, rateLimitPerMinute }) => {
      const { plaintextKey, keyHash, prefix, lastFour } = generateApiKey();
      const apiKey = await ApiKey.create({
        userId: user._id,
        name,
        keyHash,
        prefix,
        lastFour,
        rateLimitPerMinute,
      });
      return { apiKey, secret: plaintextKey };
    }),
  );

  const logs = generateDemoTraffic({
    userId: user._id,
    keys: created.map((entry) => entry.apiKey),
    models,
    now,
    count: logCount,
  });
  await RequestLog.insertMany(logs, { ordered: false });

  return {
    user,
    keys: created.map(({ apiKey, secret }) => ({ name: apiKey.name, secret })),
    logCount: logs.length,
  };
}

module.exports = { seedDemo, DEMO_USER };
