const { createOpenAICompatibleProvider } = require('../../src/providers/openAICompatibleProvider');
const { startFakeUpstream, sendJson } = require('../helpers/fakeUpstream');

const completion = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hi!' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
};

const body = { messages: [{ role: 'user', content: 'Hello' }], temperature: 0 };

describe('OpenAI-compatible provider', () => {
  let upstream;
  let respond;

  beforeAll(async () => {
    upstream = await startFakeUpstream((req, res, reqBody) => respond(req, res, reqBody));
  });
  afterAll(() => upstream.close());
  beforeEach(() => {
    upstream.requests.length = 0;
  });

  const provider = (overrides = {}) =>
    createOpenAICompatibleProvider({
      name: 'nvidia',
      baseUrl: upstream.baseUrl,
      apiKey: 'upstream-secret',
      ...overrides,
    });
  const call = (p, overrides = {}) =>
    p.complete({ upstreamModel: 'vendor/model-x', body, timeoutMs: 2000, ...overrides });

  it('sends the upstream model id with its own credentials and normalises usage', async () => {
    respond = (req, res) => sendJson(res, 200, completion);

    const result = await call(provider());

    expect(result.body).toEqual(completion);
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 3 });
    expect(upstream.requests[0].headers.authorization).toBe('Bearer upstream-secret');
    expect(upstream.requests[0].body).toMatchObject({
      model: 'vendor/model-x',
      stream: false,
      temperature: 0,
    });
  });

  it('reports missing usage as null so the gateway can estimate', async () => {
    respond = (req, res) => sendJson(res, 200, { ...completion, usage: undefined });

    const result = await call(provider());

    expect(result.usage).toBeNull();
  });

  it.each([
    [503, 'upstream_error', true, 502],
    [500, 'upstream_error', true, 502],
    [429, 'upstream_rate_limited', true, 429],
    [401, 'upstream_auth_failed', true, 502],
    [400, 'upstream_rejected_request', false, 400],
    [422, 'upstream_rejected_request', false, 422],
  ])('maps upstream %i to %s (retryable: %s)', async (status, code, retryable, clientStatus) => {
    respond = (req, res) => sendJson(res, status, { error: { message: 'upstream says no' } });

    await expect(call(provider())).rejects.toMatchObject({
      code,
      retryable,
      status: clientStatus,
      upstreamStatus: status,
      provider: 'nvidia',
    });
  });

  it('keeps the upstream explanation for rejected requests', async () => {
    respond = (req, res) => sendJson(res, 400, { error: { message: 'max_tokens is too large' } });

    await expect(call(provider())).rejects.toThrow(/max_tokens is too large/);
  });

  it('times out a slow upstream as a retryable error', async () => {
    respond = (req, res) => setTimeout(() => sendJson(res, 200, completion), 500);

    await expect(call(provider(), { timeoutMs: 50 })).rejects.toMatchObject({
      code: 'upstream_timeout',
      status: 504,
      retryable: true,
    });
  });

  it('treats an unreachable host as a retryable network error', async () => {
    const unreachable = provider({ baseUrl: 'http://127.0.0.1:1/v1' });

    await expect(call(unreachable)).rejects.toMatchObject({
      code: 'upstream_unreachable',
      retryable: true,
    });
  });

  it('fails fast and retryably when no key is configured', async () => {
    await expect(call(provider({ apiKey: null }))).rejects.toMatchObject({
      code: 'provider_not_configured',
      status: 503,
      retryable: true,
    });
    expect(upstream.requests).toHaveLength(0);
  });

  it('rethrows a caller abort untouched so it is not mistaken for an outage', async () => {
    respond = (req, res) => setTimeout(() => sendJson(res, 200, completion), 500);
    const controller = new AbortController();

    const pending = call(provider(), { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
