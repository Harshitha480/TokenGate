const { AppError } = require('../../lib/errors');
const { ProviderError } = require('../../providers/providerError');
const { simulatedOutageError } = require('../../providers/mockProvider');
const { estimateUsage } = require('../../lib/tokens');

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

/** Arguments for a provider's complete() or stream(). */
function providerCall(model, request, { signal, defaultTimeoutMs }) {
  return {
    upstreamModel: model.upstreamModel,
    body: buildUpstreamBody(model, request),
    signal,
    timeoutMs: model.timeoutMs ?? defaultTimeoutMs,
    mock: model.mock,
  };
}

/**
 * Wraps a provider call so the Playground's "make the primary fail" switch can
 * replace the first attempt with a simulated outage.
 */
function withFailureSimulation(call, { simulateFailure }) {
  return (model, index) =>
    simulateFailure && index === 0
      ? Promise.reject(simulatedOutageError(model.provider))
      : call(model, index);
}

function requireRoute(modelCatalog, modelId) {
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

function completionText(responseBody) {
  return responseBody?.choices?.[0]?.message?.content ?? '';
}

/** Reported usage when the provider gave it, otherwise an estimate flagged as such. */
function resolveUsage(reportedUsage, messages, text) {
  if (reportedUsage) return { ...reportedUsage, tokensEstimated: false };
  return { ...estimateUsage(messages, text), tokensEstimated: true };
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

/** RequestLog fields describing a failure. */
function failureFields(clientError, signal) {
  return {
    status: signal?.aborted ? 'aborted' : 'error',
    statusCode: clientError?.statusCode ?? 500,
    errorCode: clientError?.code ?? 'internal_error',
    errorMessage: clientError?.message ?? 'Unexpected gateway error',
  };
}

function startTimer() {
  const startedAt = performance.now();
  return () => Math.round(performance.now() - startedAt);
}

module.exports = {
  buildUpstreamBody,
  providerCall,
  withFailureSimulation,
  requireRoute,
  completionText,
  resolveUsage,
  toClientError,
  failureFields,
  startTimer,
};
