const { AppError } = require('../lib/errors');
const { logger: defaultLogger } = require('../lib/logger');
const { ProviderError } = require('../providers/providerError');
const { simulatedOutageError } = require('../providers/mockProvider');
const { calculateCostUsd } = require('./costService');
const { executeWithFallback } = require('./fallback');
const { buildCacheKey, isCacheable } = require('./cache/cacheKey');
const { estimateMessagesTokens, estimateTextTokens } = require('../lib/tokens');

// Request fields the gateway acts on itself instead of forwarding as-is.
const GATEWAY_ONLY_FIELDS = new Set(['model', 'stream', 'stream_options']);
const CLIENT_CLOSED_REQUEST = 499; // nginx's convention for "client went away"
const CACHE_PROVIDER = 'cache';

function buildUpstreamBody(model, request) {
  const body = { ...model.defaultParams };
  for (const [field, value] of Object.entries(request)) {
    if (!GATEWAY_ONLY_FIELDS.has(field) && value !== undefined) body[field] = value;
  }
  return body;
}

function completionText(responseBody) {
  return responseBody?.choices?.[0]?.message?.content ?? '';
}

function resolveUsage(outcome, request) {
  if (outcome.usage) return { ...outcome.usage, tokensEstimated: false };
  return {
    promptTokens: estimateMessagesTokens(request.messages),
    completionTokens: estimateTextTokens(completionText(outcome.body)),
    tokensEstimated: true,
  };
}

/** The error the client receives for a failed request, or null if it was a bug. */
function toClientError(error, signal) {
  if (signal?.aborted) {
    return new AppError(
      CLIENT_CLOSED_REQUEST,
      'client_closed_request',
      'Client closed the request',
    );
  }
  if (error instanceof ProviderError) return new AppError(error.status, error.code, error.message);
  if (error instanceof AppError) return error;
  return null;
}

function startTimer() {
  const startedAt = performance.now();
  return () => Math.round(performance.now() - startedAt);
}

/**
 * Serves OpenAI-compatible chat completions: exact-match cache, then the requested
 * model, then its fallbacks. Records one RequestLog per request.
 */
function createGatewayService({
  modelCatalog,
  providers,
  requestLogService,
  cacheStore,
  defaultTimeoutMs,
  logger = defaultLogger,
}) {
  function requireRoute(modelId) {
    const route = modelCatalog.routeFor(modelId);
    if (route.length === 0) {
      const available = modelCatalog
        .list()
        .map((m) => m.id)
        .join(', ');
      throw new AppError(
        404,
        'model_not_found',
        `Model "${modelId}" is not available. Try one of: ${available}`,
      );
    }
    return route;
  }

  function callModel(model, request, signal) {
    return providers[model.provider].complete({
      upstreamModel: model.upstreamModel,
      body: buildUpstreamBody(model, request),
      signal,
      timeoutMs: model.timeoutMs ?? defaultTimeoutMs,
      mock: model.mock,
    });
  }

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
  async function createChatCompletion({
    apiKey,
    request,
    requestId,
    signal,
    forceCache = false,
    simulateFailure = false,
  }) {
    const route = requireRoute(request.model);
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
      attempt: (model, index) =>
        simulateFailure && index === 0
          ? Promise.reject(simulatedOutageError(model.provider))
          : callModel(model, request, signal),
      onFallback: ({ from, to, error }) =>
        log.warn({ from: from.id, to: to.id, errorCode: error.code }, 'Falling back'),
    });
    const latencyMs = elapsed();
    const fallbackUsed = result.attempts.length > 1;

    if (!result.ok) {
      const clientError = toClientError(result.error, signal);
      const lastAttempt = result.attempts.at(-1);
      requestLogService.record(
        {
          ...baseEntry,
          provider: lastAttempt.provider,
          latencyMs,
          status: signal?.aborted ? 'aborted' : 'error',
          statusCode: clientError?.statusCode ?? 500,
          errorCode: clientError?.code ?? 'internal_error',
          errorMessage: clientError?.message ?? 'Unexpected gateway error',
          fallbackUsed,
          attempts: result.attempts,
        },
        { messages: request.messages },
      );
      throw clientError ?? result.error;
    }

    const { value: outcome, model: served } = result;
    const usage = resolveUsage(outcome, request);
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
      { messages: request.messages, completionText: completionText(outcome.body) },
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
  }

  return { createChatCompletion };
}

module.exports = { createGatewayService, buildUpstreamBody };
