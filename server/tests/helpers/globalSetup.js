const { MongoMemoryServer } = require('mongodb-memory-server');

// One in-memory MongoDB for the whole run; each Jest worker uses its own database
// on it (see db.js), so test files can run in parallel without sharing state.
module.exports = async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  globalThis.__MONGOD__ = mongod;
  process.env.MONGO_TEST_URI = mongod.getUri();
};
