const { calculateCostUsd } = require('../costService');
const { normalizeUsage } = require('../../lib/tokens');
const { executeWithFallback } = require('./fallback');
const {
  providerCall,
  withFailureSimulation,
  requireRoute,
  resolveUsage,
  toClientError,
  failureFields,
  startTimer,
} = require('./shared');

/** Text a chunk adds to the answer, reasoning included (it is billed as output). */
function chunkText(chunk) {
  const delta = chunk.choices?.[0]?.delta;
  if (!delta) return '';
  // NVIDIA sends reasoning under both names with the same text; count it once.
  return (delta.reasoning_content ?? delta.reasoning ?? '') + (delta.content ?? '');
}

function isUsageOnlyChunk(chunk) {
  return Boolean(chunk.usage) && (chunk.choices?.length ?? 0) === 0;
}

/**
 * Streaming completions (SSE). The client's response is committed only when the
 * first upstream chunk arrives, so fallback stays possible until then; after the
 * first byte, a failure ends the stream with an error event instead.
 *
 * The caller passes a `sink` that owns the transport:
 *   start(meta) · send(chunk) → Promise · fail(errorBody) · end()
 */
function createStreamHandler({
  modelCatalog,
  providers,
  requestLogService,
  defaultTimeoutMs,
  logger,
}) {
  async function openStream(model, request, signal) {
    const chunks = await providers[model.provider].stream(
      providerCall(model, request, { signal, defaultTimeoutMs }),
    );
    // Waiting for the first chunk keeps a provider that accepts the request and then
    // fails immediately inside the fallback window.
    const first = await chunks.next();
    return { chunks, first };
  }

  /**
   * @param {{
   *   apiKey: object, request: object, requestId: string, signal?: AbortSignal,
   *   simulateFailure?: boolean, sink: object,
   * }} params
   */
  return async function streamChatCompletion({
    apiKey,
    request,
    requestId,
    signal,
    simulateFailure = false,
    sink,
  }) {
    const route = requireRoute(modelCatalog, request.model);
    const elapsed = startTimer();
    const log = logger.child({ requestId });
    const baseEntry = {
      requestId,
      userId: apiKey.userId,
      apiKeyId: apiKey._id,
      model: route[0].id,
      stream: true,
    };

    const opened = await executeWithFallback({
      route,
      signal,
      attempt: withFailureSimulation((model) => openStream(model, request, signal), {
        simulateFailure,
      }),
      onFallback: ({ from, to, error }) =>
        log.warn({ from: from.id, to: to.id, errorCode: error.code }, 'Falling back'),
    });
    const fallbackUsed = opened.attempts.length > 1;

    if (!opened.ok) {
      const clientError = toClientError(opened.error, signal);
      requestLogService.record(
        {
          ...baseEntry,
          provider: opened.attempts.at(-1).provider,
          latencyMs: elapsed(),
          ...failureFields(clientError, signal),
          fallbackUsed,
          attempts: opened.attempts,
        },
        { messages: request.messages },
      );
      // Nothing has been sent yet, so this still becomes a normal JSON error response.
      throw clientError ?? opened.error;
    }

    const { model: served } = opened;
    const { chunks, first } = opened.value;
    const ttftMs = elapsed();
    const clientWantsUsage = request.stream_options?.include_usage === true;
    let answerText = '';
    let reportedUsage = null;
    let failure = null;

    sink.start({
      provider: served.provider,
      servedModel: served.id,
      latencyMs: ttftMs,
      fallbackUsed,
      cache: 'BYPASS',
    });

    try {
      for (let step = first; !step.done; step = await chunks.next()) {
        const chunk = step.value;
        answerText += chunkText(chunk);
        if (chunk.usage) reportedUsage = normalizeUsage(chunk.usage);
        if (isUsageOnlyChunk(chunk) && !clientWantsUsage) continue;
        await sink.send(chunk);
      }
    } catch (error) {
      failure = error;
      // Make sure the upstream request is torn down, not just abandoned.
      await chunks.return?.().catch(() => {});
    }

    const latencyMs = elapsed();
    // Tokens generated before a failure or disconnect were still produced (and billed
    // upstream), so they are counted either way.
    const usage = resolveUsage(reportedUsage, request.messages, answerText);
    const entry = {
      ...baseEntry,
      servedModel: served.id,
      provider: served.provider,
      ...usage,
      costUsd: calculateCostUsd(served.pricing, usage),
      latencyMs,
      ttftMs,
      fallbackUsed,
      attempts: opened.attempts,
    };

    if (failure) {
      const clientError = toClientError(failure, signal);
      if (!clientError) log.error({ err: failure }, 'Stream failed unexpectedly');
      const fields = failureFields(clientError, signal);
      if (!signal?.aborted) {
        sink.fail({ code: fields.errorCode, message: fields.errorMessage, requestId });
      }
      requestLogService.record({ ...entry, ...fields }, { messages: request.messages });
      return;
    }

    sink.end();
    requestLogService.record(
      { ...entry, status: 'success', statusCode: 200 },
      { messages: request.messages, completionText: answerText },
    );
  };
}

module.exports = { createStreamHandler, chunkText };
