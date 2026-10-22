const { randomUUID } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { ProviderError, fromUpstreamStatus, timeoutError } = require('./providerError');
const { estimateMessagesTokens, estimateTextTokens, messageText } = require('../lib/tokens');

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

/**
 * A provider that never leaves the process. Behaviour comes from the model's `mock`
 * config: `latencyMs`, `failureRate` (0-1) and `failStatus` (the HTTP status a
 * failure imitates; 503 by default, 400 to imitate a rejected request).
 *
 * @param {{ random?: () => number }} options  inject a deterministic random for tests
 */
function createMockProvider({ random = Math.random } = {}) {
  function shouldFail(failureRate) {
    return failureRate > 0 && random() < failureRate;
  }

  async function complete({ upstreamModel, body, signal, timeoutMs, mock = {} }) {
    const { latencyMs = 0, failureRate = 0, failStatus = 503 } = mock;
    await simulateLatency(latencyMs, { signal, timeoutMs });

    if (shouldFail(failureRate)) {
      throw fromUpstreamStatus(
        PROVIDER_NAME,
        failStatus,
        'Simulated failure from the mock provider',
      );
    }

    const content = buildReply(body.messages);
    const usage = {
      promptTokens: estimateMessagesTokens(body.messages),
      completionTokens: estimateTextTokens(content),
    };
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

  return { name: PROVIDER_NAME, isConfigured: () => true, complete };
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
