// Mock-only model catalog for integration tests: no network, deterministic outcomes.
const pricing = { inputPer1M: 1, outputPer1M: 2 };

const testModels = {
  'test-model': {
    displayName: 'Test model',
    provider: 'mock',
    upstreamModel: 'test-upstream',
    pricing,
    mock: { latencyMs: 0, failureRate: 0 },
  },
  'test-outage': {
    displayName: 'Always down',
    provider: 'mock',
    upstreamModel: 'test-outage',
    pricing,
    mock: { latencyMs: 0, failureRate: 1, failStatus: 503 },
  },
  'test-bad-request': {
    displayName: 'Rejects every request',
    provider: 'mock',
    upstreamModel: 'test-bad-request',
    pricing,
    mock: { latencyMs: 0, failureRate: 1, failStatus: 400 },
  },
};

const chatRequest = (overrides = {}) => ({
  model: 'test-model',
  messages: [{ role: 'user', content: 'Why is the sky blue?' }],
  ...overrides,
});

module.exports = { testModels, chatRequest };
