const os = require('node:os');
const mongoose = require('mongoose');

function workerDatabaseUri() {
  const base = process.env.MONGO_TEST_URI;
  if (!base) throw new Error('MONGO_TEST_URI is not set; is the Jest globalSetup running?');
  const url = new URL(base);
  url.pathname = `/tokengate-test-${process.env.JEST_WORKER_ID ?? '0'}`;
  return url.toString();
}

async function connectTestDatabase() {
  // MongoDB driver 7 loads its `os` adapter with a dynamic import(), which Jest's
  // CommonJS sandbox cannot run; the handshake then goes out without client
  // metadata and the server rejects it. Handing the adapter over avoids the import.
  await mongoose.connect(workerDatabaseUri(), { runtimeAdapters: { os } });
  // Build indexes up front so unique constraints behave as they do in production.
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
}

async function clearTestDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function disconnectTestDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

module.exports = { connectTestDatabase, clearTestDatabase, disconnectTestDatabase };
