const { AppError } = require('../lib/errors');
const { ProviderError } = require('../providers/providerError');
const { calculateCostUsd } = require('./costService');
const { estimateMessagesTokens, estimateTextTokens } = require('../lib/tokens');

// Request fields the gateway acts on itself instead of forwarding as-is.
const GATEWAY_ONLY_FIELDS = new Set(['model', 'stream', 'stream_options']);
const CLIENT_CLOSED_REQUEST = 499; // nginx's convention for "client went away"

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

/** The error the client receives, and the fields that describe it in the log. */
function describeFailure(error, signal) {
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

/**
 * Serves OpenAI-compatible chat completions through the configured providers and
 * records one RequestLog per request.
 */
function createGatewayService({ modelCatalog, providers, requestLogService, defaultTimeoutMs }) {
  function requireModel(modelId) {
    const model = modelCatalog.get(modelId);
    if (!model) {
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
    return model;
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

  async function createChatCompletion({ apiKey, request, requestId, signal }) {
    const model = requireModel(request.model);
    const startedAt = performance.now();
    const elapsed = () => Math.round(performance.now() - startedAt);
    const baseEntry = {
      requestId,
      userId: apiKey.userId,
      apiKeyId: apiKey._id,
      model: model.id,
      provider: model.provider,
      stream: false,
    };

    let outcome;
    try {
      outcome = await callModel(model, request, signal);
    } catch (error) {
      const latencyMs = elapsed();
      const failure = describeFailure(error, signal);
      requestLogService.record(
        {
          ...baseEntry,
          latencyMs,
          status: signal?.aborted ? 'aborted' : 'error',
          statusCode: failure?.statusCode ?? 500,
          errorCode: failure?.code ?? 'internal_error',
          errorMessage: failure?.message ?? 'Unexpected gateway error',
          attempts: [
            {
              model: model.id,
              provider: model.provider,
              outcome: 'error',
              errorCode: failure?.code ?? 'internal_error',
              latencyMs,
            },
          ],
        },
        { messages: request.messages },
      );
      throw failure ?? error;
    }

    const latencyMs = elapsed();
    const usage = resolveUsage(outcome, request);
    requestLogService.record(
      {
        ...baseEntry,
        servedModel: model.id,
        ...usage,
        costUsd: calculateCostUsd(model.pricing, usage),
        latencyMs,
        status: 'success',
        statusCode: 200,
        attempts: [{ model: model.id, provider: model.provider, outcome: 'success', latencyMs }],
      },
      { messages: request.messages, completionText: completionText(outcome.body) },
    );

    return {
      body: outcome.body,
      meta: { provider: model.provider, servedModel: model.id, latencyMs, fallbackUsed: false },
    };
  }

  return { createChatCompletion };
}

module.exports = { createGatewayService, buildUpstreamBody };
