// Runs in every test worker before any module is required, so src/config/env.js
// sees a complete, credential-free configuration.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_TEST_URI ?? 'mongodb://127.0.0.1:27017/unused';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.LOG_PROMPTS = 'false';
