const { randomUUID } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { ProviderError, fromUpstreamStatus, timeoutError } = require('./providerError');
const { estimateUsage, messageText } = require('../lib/tokens');

const PROVIDER_NAME = 'mock';

function buildReply(messages) {
  const lastUserMessage = messages.findLast((message) => message.role === 'user');
  const prompt = messageText(lastUserMessage?.content).replace(/\s+/g, ' ').trim();
  const quoted = prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
  return (
    `This is a mock completion from TokenGate. You asked: "${quoted}". ` +
    'The mock provider returns canned text with realistic latency, so caching, ' +
    'rate limiting and fallback can be exercised without a real API key.'
  );
}

/** Waits like a real provider would, honouring both the timeout and a client abort. */
async function simulateLatency(latencyMs, { signal, timeoutMs }) {
  if (latencyMs > timeoutMs) {
    await sleep(timeoutMs, undefined, { signal });
    throw timeoutError(PROVIDER_NAME, timeoutMs);
  }
  await sleep(latencyMs, undefined, { signal });
}

/** Splits text into word-sized pieces, keeping the spaces, like streamed tokens. */
function toPieces(text) {
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * A provider that never leaves the process. Behaviour comes from the model's `mock`
 * config:
 *   latencyMs        time before the response (or the first streamed chunk)
 *   failureRate      0-1 chance of failing before anything is returned
 *   failStatus       HTTP status a failure imitates (503 default, 400 = bad request)
 *   chunkDelayMs     gap between streamed chunks (default 25)
 *   failAfterChunks  streams only: fail after sending this many chunks
 *   reportsUsage     streams only: false omits the usage chunk (default true)
 *
 * @param {{ random?: () => number }} options  inject a deterministic random for tests
 */
function createMockProvider({ random = Math.random } = {}) {
  async function startResponse({ signal, timeoutMs, mock }) {
    const { latencyMs = 0, failureRate = 0, failStatus = 503 } = mock;
    await simulateLatency(latencyMs, { signal, timeoutMs });
    if (failureRate > 0 && random() < failureRate) {
      throw fromUpstreamStatus(
        PROVIDER_NAME,
        failStatus,
        'Simulated failure from the mock provider',
      );
    }
  }

  async function complete({ upstreamModel, body, signal, timeoutMs, mock = {} }) {
    await startResponse({ signal, timeoutMs, mock });

    const content = buildReply(body.messages);
    const usage = estimateUsage(body.messages, content);
    return {
      body: {
        id: `chatcmpl-mock-${randomUUID()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: upstreamModel,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          total_tokens: usage.promptTokens + usage.completionTokens,
        },
      },
      usage,
    };
  }

  async function stream({ upstreamModel, body, signal, timeoutMs, mock = {} }) {
    await startResponse({ signal, timeoutMs, mock });
    const { chunkDelayMs = 25, failAfterChunks = null, reportsUsage = true } = mock;

    const content = buildReply(body.messages);
    const base = {
      id: `chatcmpl-mock-${randomUUID()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: upstreamModel,
    };
    const choice = (delta, finishReason = null) => ({
      ...base,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    });

    async function* chunks() {
      const events = [
        choice({ role: 'assistant', content: '' }),
        ...toPieces(content).map((piece) => choice({ content: piece })),
        choice({}, 'stop'),
      ];
      for (const [index, event] of events.entries()) {
        if (failAfterChunks !== null && index === failAfterChunks) {
          throw fromUpstreamStatus(PROVIDER_NAME, 502, 'Simulated mid-stream failure');
        }
        if (index > 0) await sleep(chunkDelayMs, undefined, { signal });
        yield event;
      }
      if (reportsUsage) {
        const usage = estimateUsage(body.messages, content);
        yield {
          ...base,
          choices: [],
          usage: {
            prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens,
            total_tokens: usage.promptTokens + usage.completionTokens,
          },
        };
      }
    }

    return chunks();
  }

  return { name: PROVIDER_NAME, isConfigured: () => true, complete, stream };
}

/** The error the Playground's "make the primary fail" switch injects. */
function simulatedOutageError(provider) {
  return new ProviderError({
    provider,
    status: 503,
    code: 'simulated_outage',
    message: `Simulated outage of ${provider} (requested with X-TokenGate-Simulate-Failure)`,
    retryable: true,
  });
}

module.exports = { createMockProvider, simulatedOutageError, buildReply };
