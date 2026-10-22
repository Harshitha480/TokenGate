const {
  ProviderError,
  fromUpstreamStatus,
  timeoutError,
  networkError,
  notConfiguredError,
} = require('./providerError');

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

function normalizeUsage(usage) {
  if (!Number.isFinite(usage?.prompt_tokens) || !Number.isFinite(usage?.completion_tokens)) {
    return null;
  }
  return { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens };
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
  function translateError(error, { callerSignal, timeoutSignal, timeoutMs }) {
    if (error instanceof ProviderError) return error;
    if (callerSignal?.aborted) return error;
    if (timeoutSignal.aborted) return timeoutError(name, timeoutMs);
    return networkError(name, error);
  }

  /** Sends the request and resolves once the upstream has answered with 2xx headers. */
  async function send(body, { signal: callerSignal, timeoutMs }) {
    if (!apiKey) throw notConfiguredError(name);

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
    const context = { callerSignal, timeoutSignal, timeoutMs };

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
    }

    return { body: json, usage: normalizeUsage(json.usage) };
  }

  return {
    name,
    isConfigured: () => Boolean(apiKey),
    complete,
    // Exposed for the streaming adapter added alongside it.
    send,
    translateError,
  };
}

module.exports = { createOpenAICompatibleProvider, normalizeUsage };
