const { createMockProvider } = require('../../src/providers/mockProvider');
const { ProviderError } = require('../../src/providers/providerError');

const body = { messages: [{ role: 'user', content: 'Why is the sky blue?' }] };
const call = (provider, overrides = {}) =>
  provider.complete({ upstreamModel: 'mock-test', body, timeoutMs: 1000, ...overrides });

describe('mock provider', () => {
  it('returns an OpenAI-shaped completion with usage', async () => {
    const result = await call(createMockProvider());

    expect(result.body).toMatchObject({
      object: 'chat.completion',
      model: 'mock-test',
      choices: [{ message: { role: 'assistant' }, finish_reason: 'stop' }],
    });
    expect(result.body.choices[0].message.content).toContain('Why is the sky blue?');
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.body.usage.total_tokens).toBe(
      result.usage.promptTokens + result.usage.completionTokens,
    );
  });

  it('fails as often as its failure rate says, imitating the configured status', async () => {
    const alwaysFails = createMockProvider({ random: () => 0 });

    await expect(
      call(alwaysFails, { mock: { latencyMs: 0, failureRate: 0.5, failStatus: 503 } }),
    ).rejects.toMatchObject({ code: 'upstream_error', retryable: true });
    await expect(
      call(alwaysFails, { mock: { latencyMs: 0, failureRate: 0.5, failStatus: 400 } }),
    ).rejects.toMatchObject({ code: 'upstream_rejected_request', retryable: false, status: 400 });

    const neverFails = createMockProvider({ random: () => 0.99 });
    await expect(
      call(neverFails, { mock: { latencyMs: 0, failureRate: 0.5 } }),
    ).resolves.toHaveProperty('body');
  });

  it('times out when its latency exceeds the timeout', async () => {
    const error = await call(createMockProvider(), {
      timeoutMs: 20,
      mock: { latencyMs: 5000, failureRate: 0 },
    }).catch((e) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: 'upstream_timeout', status: 504, retryable: true });
  });

  it('stops waiting when the caller aborts', async () => {
    const controller = new AbortController();
    const pending = call(createMockProvider(), {
      signal: controller.signal,
      mock: { latencyMs: 5000, failureRate: 0 },
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
