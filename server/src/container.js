const { config } = require('./config/env');
const { models: configuredModels } = require('./config/models');
const { createProviders } = require('./providers');
const { createModelCatalog } = require('./services/modelCatalog');
const { createRequestLogService } = require('./services/requestLogService');
const { createGatewayService } = require('./services/gatewayService');

/**
 * Builds the gateway's collaborators in one place. Tests pass overrides (mock-only
 * model catalogs, fake providers) without touching module state.
 */
function createContainer(overrides = {}) {
  const providers = overrides.providers ?? createProviders(config);
  const modelCatalog = createModelCatalog(overrides.models ?? configuredModels, {
    knownProviders: Object.keys(providers),
  });
  const requestLogService =
    overrides.requestLogService ?? createRequestLogService({ logPrompts: config.logPrompts });
  const gatewayService = createGatewayService({
    modelCatalog,
    providers,
    requestLogService,
    defaultTimeoutMs: overrides.defaultTimeoutMs ?? config.providerTimeoutMs,
  });

  return { providers, modelCatalog, requestLogService, gatewayService };
}

module.exports = { createContainer };
