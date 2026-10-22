const { calculateCostUsd } = require('../costService');
const { executeWithFallback } = require('./fallback');
const { buildCacheKey, isCacheable } = require('../cache/cacheKey');
const {
  providerCall,
  withFailureSimulation,
  requireRoute,
  completionText,
  resolveUsage,
  toClientError,
  failureFields,
  startTimer,
} = require('./shared');

const CACHE_PROVIDER = 'cache';

/**
 * Non-streaming completions: exact-match cache, then the requested model, then its
 * fallbacks. Records one RequestLog per request.
 */
function createCompletionHandler({
  modelCatalog,
  providers,
  requestLogService,
  cacheStore,
  defaultTimeoutMs,
  logger,
}) {
  // A cache outage must never fail a request; it only costs the saving.
  async function readCache(key, log) {
    try {
      return await cacheStore.get(key);
    } catch (err) {
      log.warn({ err }, 'Cache read failed; treating as a miss');
      return null;
    }
  }

  async function writeCache(key, entry, log) {
    try {
      await cacheStore.set(key, entry);
    } catch (err) {
      log.warn({ err }, 'Cache write failed');
    }
  }

  function serveFromCache({ hit, request, baseEntry, latencyMs }) {
    requestLogService.record(
      {
        ...baseEntry,
        servedModel: hit.servedModel,
        provider: CACHE_PROVIDER,
        promptTokens: hit.usage.promptTokens,
        completionTokens: hit.usage.completionTokens,
        costUsd: 0,
        savedUsd: hit.costUsd,
        latencyMs,
        status: 'success',
        statusCode: 200,
        cached: true,
      },
      { messages: request.messages, completionText: completionText(hit.body) },
    );
    return {
      body: hit.body,
      meta: {
        provider: CACHE_PROVIDER,
        servedModel: hit.servedModel,
        latencyMs,
        fallbackUsed: false,
        cache: 'HIT',
      },
    };
  }

  /**
   * @param {{
   *   apiKey: object, request: object, requestId: string, signal?: AbortSignal,
   *   forceCache?: boolean, simulateFailure?: boolean,
   * }} params
   */
  return async function createChatCompletion({
    apiKey,
    request,
    requestId,
    signal,
    forceCache = false,
    simulateFailure = false,
  }) {
    const route = requireRoute(modelCatalog, request.model);
    const elapsed = startTimer();
    const log = logger.child({ requestId });
    const baseEntry = {
      requestId,
      userId: apiKey.userId,
      apiKeyId: apiKey._id,
      model: route[0].id,
      stream: false,
    };

    const cacheKey = isCacheable(request, { force: forceCache })
      ? buildCacheKey(apiKey.userId, request)
      : null;
    if (cacheKey) {
      const hit = await readCache(cacheKey, log);
      if (hit) return serveFromCache({ hit, request, baseEntry, latencyMs: elapsed() });
    }

    const result = await executeWithFallback({
      route,
      signal,
      attempt: withFailureSimulation(
        (model) =>
          providers[model.provider].complete(
            providerCall(model, request, { signal, defaultTimeoutMs }),
          ),
        { simulateFailure },
      ),
      onFallback: ({ from, to, error }) =>
        log.warn({ from: from.id, to: to.id, errorCode: error.code }, 'Falling back'),
    });
    const latencyMs = elapsed();
    const fallbackUsed = result.attempts.length > 1;

    if (!result.ok) {
      const clientError = toClientError(result.error, signal);
      requestLogService.record(
        {
          ...baseEntry,
          provider: result.attempts.at(-1).provider,
          latencyMs,
          ...failureFields(clientError, signal),
          fallbackUsed,
          attempts: result.attempts,
        },
        { messages: request.messages },
      );
      throw clientError ?? result.error;
    }

    const { value: outcome, model: served } = result;
    const text = completionText(outcome.body);
    const usage = resolveUsage(outcome.usage, request.messages, text);
    const costUsd = calculateCostUsd(served.pricing, usage);

    if (cacheKey) {
      await writeCache(
        cacheKey,
        {
          body: outcome.body,
          servedModel: served.id,
          usage: { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens },
          costUsd,
        },
        log,
      );
    }

    requestLogService.record(
      {
        ...baseEntry,
        servedModel: served.id,
        provider: served.provider,
        ...usage,
        costUsd,
        latencyMs,
        status: 'success',
        statusCode: 200,
        fallbackUsed,
        attempts: result.attempts,
      },
      { messages: request.messages, completionText: text },
    );

    return {
      body: outcome.body,
      meta: {
        provider: served.provider,
        servedModel: served.id,
        latencyMs,
        fallbackUsed,
        cache: cacheKey ? 'MISS' : 'BYPASS',
      },
    };
  };
}

module.exports = { createCompletionHandler };
