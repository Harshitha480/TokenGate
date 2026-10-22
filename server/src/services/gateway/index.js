const { logger: defaultLogger } = require('../../lib/logger');
const { createCompletionHandler } = require('./completion');
const { createStreamHandler } = require('./streaming');

/**
 * The gateway: routes OpenAI-compatible chat requests to providers with caching,
 * fallback and usage logging.
 *
 * @param {{
 *   modelCatalog: object, providers: object, requestLogService: object,
 *   cacheStore: object, defaultTimeoutMs: number, logger?: import('pino').Logger,
 * }} deps
 */
function createGatewayService({ logger = defaultLogger, ...deps }) {
  return {
    createChatCompletion: createCompletionHandler({ ...deps, logger }),
    streamChatCompletion: createStreamHandler({ ...deps, logger }),
  };
}

module.exports = { createGatewayService };
