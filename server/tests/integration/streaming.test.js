const { createApp } = require('../../src/app');
const { createContainer } = require('../../src/container');
const { createMemoryRateLimitStore } = require('../../src/services/rateLimit/memoryRateLimitStore');
const { parseSSE } = require('../../src/lib/sse');
const RequestLog = require('../../src/models/RequestLog');
const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = require('../helpers/db');
const { registerUser, createApiKey } = require('../helpers/factories');
const { waitFor } = require('../helpers/waitFor');
const { testModels, chatRequest } = require('../helpers/testModels');
const { buildReply } = require('../../src/providers/mockProvider');

// These tests use a real listening server and fetch, so they observe what a client
// actually receives over the wire, chunk by chunk.
describe('streaming completions (SSE)', () => {
  const app = createApp(
    createContainer({ models: testModels, rateLimitStore: createMemoryRateLimitStore() }),
  );
  let server;
  let baseUrl;
  let secret;

  beforeAll(async () => {
    await connectTestDatabase();
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  beforeEach(async () => {
    const { token } = await registerUser(app);
    ({ secret } = await createApiKey(app, token, { name: 'Stream', rateLimitPerMinute: 100 }));
  });
  afterEach(clearTestDatabase);
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDatabase();
  });

  const post = (body, { headers = {}, signal } = {}) =>
    fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal,
    });

  async function readEvents(response) {
    const events = [];
    for await (const data of parseSSE(response.body)) events.push(data);
    return events;
  }

  const contentOf = (events) =>
    events
      .filter((e) => e !== '[DONE]')
      .map((e) => JSON.parse(e).choices?.[0]?.delta?.content ?? '')
      .join('');

  const logFor = (response) =>
    waitFor(() => RequestLog.findOne({ requestId: response.headers.get('x-request-id') }));

  it('streams OpenAI-style chunks and ends with [DONE]', async () => {
    const response = await post(chatRequest({ stream: true }));
    const events = await readEvents(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(response.headers.get('x-tokengate-provider')).toBe('mock');
    expect(response.headers.get('x-tokengate-cache')).toBe('BYPASS');
    expect(events.at(-1)).toBe('[DONE]');
    expect(contentOf(events)).toBe(buildReply(chatRequest().messages));

    const log = await logFor(response);
    expect(log).toMatchObject({ stream: true, status: 'success', tokensEstimated: false });
    expect(log.ttftMs).toBeGreaterThanOrEqual(0);
    expect(log.completionTokens).toBeGreaterThan(0);
    expect(log.costUsd).toBeGreaterThan(0);
  });

  it('forwards the usage chunk only when the client asks for it', async () => {
    const without = await readEvents(await post(chatRequest({ stream: true })));
    const withUsage = await readEvents(
      await post(chatRequest({ stream: true, stream_options: { include_usage: true } })),
    );

    const hasUsage = (events) =>
      events.some((e) => e !== '[DONE]' && JSON.parse(e).usage !== undefined);
    expect(hasUsage(without)).toBe(false);
    expect(hasUsage(withUsage)).toBe(true);
  });

  it('delivers chunks as they are generated, not all at the end', async () => {
    const started = Date.now();
    const response = await post(chatRequest({ model: 'test-stream-slow', stream: true }));
    const arrivals = [];
    for await (const data of parseSSE(response.body)) {
      if (data !== '[DONE]') arrivals.push(Date.now() - started);
    }

    // About 40 words at 40ms each: the first must arrive long before the last.
    expect(arrivals.length).toBeGreaterThan(20);
    expect(arrivals.at(-1) - arrivals[0]).toBeGreaterThan(500);
    expect(arrivals[0]).toBeLessThan(arrivals.at(-1) / 3);
  });

  it('falls back before the first byte when the primary is down', async () => {
    const response = await post(chatRequest({ model: 'test-primary-down', stream: true }));
    const events = await readEvents(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-tokengate-fallback')).toBe('true');
    expect(response.headers.get('x-tokengate-model')).toBe('test-backup');
    expect(events.at(-1)).toBe('[DONE]');
  });

  it('never falls back after the first byte; it ends the stream with an error event', async () => {
    const response = await post(chatRequest({ model: 'test-stream-breaks', stream: true }));
    const events = await readEvents(response);

    expect(response.status).toBe(200); // already committed when the failure happened
    expect(response.headers.get('x-tokengate-fallback')).toBe('false');
    const last = JSON.parse(events.at(-1));
    expect(last.error).toMatchObject({ code: 'upstream_error', requestId: expect.any(String) });
    expect(events).not.toContain('[DONE]');

    const log = await logFor(response);
    expect(log).toMatchObject({
      status: 'error',
      errorCode: 'upstream_error',
      fallbackUsed: false,
    });
    expect(log.attempts).toHaveLength(1);
  });

  it('estimates and flags token usage when the provider does not report it', async () => {
    const response = await post(chatRequest({ model: 'test-no-usage', stream: true }));
    await readEvents(response);

    const log = await logFor(response);
    expect(log.tokensEstimated).toBe(true);
    expect(log.promptTokens).toBeGreaterThan(0);
    expect(log.completionTokens).toBeGreaterThan(0);
  });

  it('aborts the upstream stream when the client disconnects', async () => {
    const controller = new AbortController();
    const response = await post(chatRequest({ model: 'test-stream-slow', stream: true }), {
      signal: controller.signal,
    });
    const requestId = response.headers.get('x-request-id');

    const reader = parseSSE(response.body);
    await reader.next(); // receive the first chunk, then hang up
    controller.abort();
    await reader.return().catch(() => {});

    const log = await waitFor(() => RequestLog.findOne({ requestId }), { timeoutMs: 3000 });
    expect(log).toMatchObject({ status: 'aborted', statusCode: 499 });
    // Generation stopped early instead of running to completion on our dime.
    const fullAnswerTokens = Math.ceil(buildReply(chatRequest().messages).length / 4);
    expect(log.completionTokens).toBeLessThan(fullAnswerTokens);
  });

  it('never caches streams, even at temperature 0', async () => {
    await readEvents(await post(chatRequest({ stream: true, temperature: 0 })));
    const second = await post(chatRequest({ stream: true, temperature: 0 }));
    await readEvents(second);

    expect(second.headers.get('x-tokengate-cache')).toBe('BYPASS');
  });

  it('rejects stream_options on a non-streaming request', async () => {
    const response = await post(chatRequest({ stream_options: { include_usage: true } }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.details[0].path).toBe('body.stream_options');
  });
});
