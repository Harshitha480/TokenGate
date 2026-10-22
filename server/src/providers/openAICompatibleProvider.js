const {
  ProviderError,
  fromUpstreamStatus,
  timeoutError,
  networkError,
  notConfiguredError,
} = require('./providerError');
const { parseSSE } = require('../lib/sse');
const { normalizeUsage } = require('../lib/tokens');

const MAX_UPSTREAM_MESSAGE_LENGTH = 300;

async function readUpstreamErrorMessage(response) {
  let text = '';
  try {
    text = await response.text();
    const json = JSON.parse(text);
    text = json?.error?.message ?? json?.message ?? json?.detail ?? text;
  } catch {
    // Not JSON: keep the raw text.
  }
  return String(text).slice(0, MAX_UPSTREAM_MESSAGE_LENGTH).trim();
}

/**
 * An abortable deadline. A non-streaming call never resets it, so it bounds the
 * whole request; a stream resets it on every chunk, so it bounds the silence
 * between chunks and a long answer that keeps arriving is never cut off.
 */
function createDeadline(timeoutMs) {
  const controller = new AbortController();
  let timer;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error('Provider deadline exceeded')), timeoutMs);
    // A deadline alone should never keep the process alive (e.g. during shutdown).
    timer.unref();
  };
  arm();
  return { signal: controller.signal, reset: arm, clear: () => clearTimeout(timer) };
}

/**
 * Adapter for any provider that speaks the OpenAI Chat Completions API
 * (NVIDIA build.nvidia.com, vLLM, OpenRouter, Together, OpenAI itself).
 *
 * @param {{ name: string, baseUrl: string, apiKey: string | null, fetchImpl?: typeof fetch }} options
 */
function createOpenAICompatibleProvider({ name, baseUrl, apiKey, fetchImpl = fetch }) {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  /**
   * Turns a thrown fetch/body error into a ProviderError. A caller-initiated abort
   * (client disconnected) is rethrown untouched so the gateway can tell it apart.
   */
  function translateError(error, { callerSignal, deadline, timeoutMs }) {
    if (error instanceof ProviderError) return error;
    if (callerSignal?.aborted) return error;
    if (deadline.signal.aborted) return timeoutError(name, timeoutMs);
    return networkError(name, error);
  }

  /** Sends the request and resolves once the upstream has answered with 2xx headers. */
  async function send(body, { signal: callerSignal, timeoutMs }) {
    if (!apiKey) throw notConfiguredError(name);

    const deadline = createDeadline(timeoutMs);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, deadline.signal])
      : deadline.signal;
    const context = { callerSignal, deadline, timeoutMs };

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: body.stream ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        throw fromUpstreamStatus(name, response.status, await readUpstreamErrorMessage(response));
      }
      return { response, context };
    } catch (error) {
      deadline.clear();
      throw translateError(error, context);
    }
  }

  async function complete({ upstreamModel, body, signal, timeoutMs }) {
    const { response, context } = await send(
      { ...body, model: upstreamModel, stream: false },
      { signal, timeoutMs },
    );

    let json;
    try {
      json = await response.json();
    } catch (error) {
      // A SyntaxError means the body arrived but was not JSON; anything else is the
      // connection failing, timing out or being aborted while the body streamed in.
      throw error instanceof SyntaxError
        ? fromUpstreamStatus(name, 502, 'Upstream returned malformed JSON')
        : translateError(error, context);
    } finally {
      context.deadline.clear();
    }

    return { body: json, usage: normalizeUsage(json.usage) };
  }

  /**
   * Opens a streamed completion. Resolves once the upstream accepted the request
   * (2xx headers) and returns an async iterator of parsed chunks; errors before
   * that point reject, errors mid-stream are thrown from the iterator.
   */
  async function stream({ upstreamModel, body, signal, timeoutMs }) {
    const { response, context } = await send(
      {
        ...body,
        model: upstreamModel,
        stream: true,
        // Always ask for the usage chunk; the gateway decides whether the client sees it.
        stream_options: { include_usage: true },
      },
      { signal, timeoutMs },
    );

    async function* chunks() {
      try {
        for await (const data of parseSSE(response.body)) {
          context.deadline.reset();
          if (data === '[DONE]') return;

          let chunk;
          try {
            chunk = JSON.parse(data);
          } catch {
            throw fromUpstreamStatus(name, 502, 'Upstream sent a malformed stream event');
          }
          // Some providers report failures inside an already-open stream.
          if (chunk.error) throw fromUpstreamStatus(name, 502, chunk.error.message);
          yield chunk;
        }
      } catch (error) {
        throw translateError(error, context);
      } finally {
        context.deadline.clear();
      }
    }

    return chunks();
  }

  return { name, isConfigured: () => Boolean(apiKey), complete, stream };
}

module.exports = { createOpenAICompatibleProvider };
