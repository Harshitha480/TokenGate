// Mock-only model catalog for integration tests: no network, deterministic outcomes.
const pricing = { inputPer1M: 1, outputPer1M: 2 };
const backupPricing = { inputPer1M: 3, outputPer1M: 6 };

const mockModel = (overrides) => ({
  displayName: 'Test model',
  provider: 'mock',
  upstreamModel: 'test-upstream',
  pricing,
  mock: { latencyMs: 0, failureRate: 0 },
  ...overrides,
});

const testModels = {
  'test-model': mockModel({ fallbacks: ['test-backup'] }),
  'test-backup': mockModel({
    displayName: 'Backup',
    upstreamModel: 'test-backup',
    pricing: backupPricing,
  }),
  'test-outage': mockModel({
    displayName: 'Always down, no fallback',
    mock: { latencyMs: 0, failureRate: 1, failStatus: 503 },
  }),
  'test-primary-down': mockModel({
    displayName: 'Always down, falls back',
    mock: { latencyMs: 0, failureRate: 1, failStatus: 503 },
    fallbacks: ['test-backup'],
  }),
  'test-bad-request': mockModel({
    displayName: 'Rejects every request',
    mock: { latencyMs: 0, failureRate: 1, failStatus: 400 },
    fallbacks: ['test-backup'],
  }),
  'test-slow': mockModel({
    displayName: 'Slower than its timeout',
    timeoutMs: 30,
    mock: { latencyMs: 500, failureRate: 0 },
    fallbacks: ['test-backup'],
  }),
};

const chatRequest = (overrides = {}) => ({
  model: 'test-model',
  messages: [{ role: 'user', content: 'Why is the sky blue?' }],
  ...overrides,
});

module.exports = { testModels, chatRequest, pricing, backupPricing };
