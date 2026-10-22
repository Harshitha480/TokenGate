const { createOpenAICompatibleProvider } = require('./openAICompatibleProvider');
const { createMockProvider } = require('./mockProvider');

/** Provider adapters by the name models.js refers to them with. */
function createProviders(config) {
  return {
    nvidia: createOpenAICompatibleProvider({
      name: 'nvidia',
      baseUrl: config.providers.nvidia.baseUrl,
      apiKey: config.providers.nvidia.apiKey,
    }),
    mock: createMockProvider(),
  };
}

module.exports = { createProviders };
