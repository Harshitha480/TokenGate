const { config } = require('./config/env');
const { models: configuredModels } = require('./config/models');
const { createProviders } = require('./providers');
const { createModelCatalog } = require('./services/modelCatalog');
const { createRequestLogService } = require('./services/requestLogService');
const { createGatewayService } = require('./services/gatewayService');
const { createCacheStore } = require('./services/cache');
const { createRateLimitStore } = require('./services/rateLimit');
const { effectiveRateLimit } = require('./services/apiKeyService');
const { createRateLimiter } = require('./middleware/rateLimit');
const { createUpstashClient } = require('./lib/upstash');

/**
 * Builds the gateway's collaborators in one place. Tests pass overrides (mock-only
 * model catalogs, in-memory stores, low limits) without touching module state.
 */
function createContainer(overrides = {}) {
  let redis = null;
  const getRedis = () => {
    redis ??= createUpstashClient(config.upstash);
    return redis;
  };

  const providers = overrides.providers ?? createProviders(config);
  const modelCatalog = createModelCatalog(overrides.models ?? configuredModels, {
    knownProviders: Object.keys(providers),
  });
  const requestLogService =
    overrides.requestLogService ?? createRequestLogService({ logPrompts: config.logPrompts });
  const cacheStore = overrides.cacheStore ?? createCacheStore(config.cache, { getRedis });
  const rateLimitStore =
    overrides.rateLimitStore ?? createRateLimitStore(config.rateLimit, { getRedis });

  const gatewayService = createGatewayService({
    modelCatalog,
    providers,
    requestLogService,
    cacheStore,
    defaultTimeoutMs: overrides.defaultTimeoutMs ?? config.providerTimeoutMs,
  });

  const gatewayRateLimiter = createRateLimiter({
    store: rateLimitStore,
    keyFor: (req) => `key:${req.apiKey.id}`,
    limitFor: (req) => effectiveRateLimit(req.apiKey),
  });
  const authRateLimiter = createRateLimiter({
    store: rateLimitStore,
    keyFor: (req) => `auth:${req.ip}`,
    limitFor: () => overrides.authRateLimitPerMinute ?? config.rateLimit.authPerMinute,
  });

  return {
    providers,
    modelCatalog,
    requestLogService,
    cacheStore,
    rateLimitStore,
    gatewayService,
    gatewayRateLimiter,
    authRateLimiter,
    allowFailureSimulation: overrides.allowFailureSimulation ?? config.allowFailureSimulation,
  };
}

module.exports = { createContainer };
