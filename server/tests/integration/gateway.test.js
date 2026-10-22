const request = require('supertest');
const { createApp } = require('../../src/app');
const { createContainer } = require('../../src/container');
const { createRequestLogService } = require('../../src/services/requestLogService');
const { calculateCostUsd } = require('../../src/services/costService');
const RequestLog = require('../../src/models/RequestLog');
const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = require('../helpers/db');
const { registerUser, createApiKey } = require('../helpers/factories');
const { waitFor } = require('../helpers/waitFor');
const { testModels, chatRequest } = require('../helpers/testModels');

describe('POST /v1/chat/completions', () => {
  const app = createApp(createContainer({ models: testModels }));
  let user;
  let token;
  let key;
  let secret;

  beforeAll(connectTestDatabase);
  beforeEach(async () => {
    ({ user, token } = await registerUser(app));
    ({ key, secret } = await createApiKey(app, token));
  });
  afterEach(clearTestDatabase);
  afterAll(disconnectTestDatabase);

  const complete = (body, targetApp = app) =>
    request(targetApp)
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${secret}`)
      .send(body);

  it('returns an OpenAI-compatible completion with gateway headers', async () => {
    const res = await complete(chatRequest());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'chat.completion',
      choices: [{ message: { role: 'assistant' } }],
      usage: { prompt_tokens: expect.any(Number), completion_tokens: expect.any(Number) },
    });
    expect(res.headers['x-tokengate-provider']).toBe('mock');
    expect(res.headers['x-tokengate-model']).toBe('test-model');
    expect(res.headers['x-tokengate-fallback']).toBe('false');
    expect(Number(res.headers['x-tokengate-latency-ms'])).toBeGreaterThanOrEqual(0);
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('logs the request with token usage and the cost from the configured prices', async () => {
    const res = await complete(chatRequest());

    const log = await waitFor(() => RequestLog.findOne({ requestId: res.headers['x-request-id'] }));
    expect(log).toMatchObject({
      model: 'test-model',
      servedModel: 'test-model',
      provider: 'mock',
      status: 'success',
      statusCode: 200,
      cached: false,
      fallbackUsed: false,
      tokensEstimated: false,
      promptTokens: res.body.usage.prompt_tokens,
      completionTokens: res.body.usage.completion_tokens,
    });
    expect(log.apiKeyId.toString()).toBe(key.id);
    expect(log.userId.toString()).toBe(user.id);
    expect(log.costUsd).toBe(
      calculateCostUsd(testModels['test-model'].pricing, {
        promptTokens: res.body.usage.prompt_tokens,
        completionTokens: res.body.usage.completion_tokens,
      }),
    );
    expect(log.costUsd).toBeGreaterThan(0);
    expect(log.attempts).toHaveLength(1);
  });

  it('does not store prompts or completions by default', async () => {
    const res = await complete(chatRequest());

    const log = await waitFor(() =>
      RequestLog.findOne({ requestId: res.headers['x-request-id'] }).lean(),
    );
    expect(log.prompt).toBeUndefined();
    expect(log.completion).toBeUndefined();
  });

  it('stores prompts and completions when LOG_PROMPTS is on', async () => {
    const loggingApp = createApp(
      createContainer({
        models: testModels,
        requestLogService: createRequestLogService({ logPrompts: true }),
      }),
    );

    const res = await complete(chatRequest(), loggingApp);

    const log = await waitFor(() => RequestLog.findOne({ requestId: res.headers['x-request-id'] }));
    expect(log.prompt).toContain('Why is the sky blue?');
    expect(log.completion).toBe(res.body.choices[0].message.content);
  });

  it('returns 404 with the available models for an unknown model', async () => {
    const res = await complete(chatRequest({ model: 'gpt-9' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('model_not_found');
    expect(res.body.error.message).toContain('test-model');
  });

  it('rejects malformed requests before calling any provider', async () => {
    const res = await complete({ model: 'test-model', messages: [], temprature: 0.2 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(['body.messages']),
    );
    expect(await RequestLog.countDocuments()).toBe(0);
  });

  it('reports a provider outage as a 502 and logs the failure', async () => {
    const res = await complete(chatRequest({ model: 'test-outage' }));

    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ code: 'upstream_error', requestId: expect.any(String) });
    const log = await waitFor(() => RequestLog.findOne({ requestId: res.headers['x-request-id'] }));
    expect(log).toMatchObject({ status: 'error', statusCode: 502, errorCode: 'upstream_error' });
    expect(log.costUsd).toBe(0);
  });

  it("passes a provider's 4xx through to the client", async () => {
    const res = await complete(chatRequest({ model: 'test-bad-request' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('upstream_rejected_request');
  });

  it('requires a gateway API key', async () => {
    const res = await request(app).post('/v1/chat/completions').send(chatRequest());

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('missing_api_key');
  });
});

describe('GET /v1/models', () => {
  const app = createApp(createContainer({ models: testModels }));

  beforeAll(connectTestDatabase);
  afterAll(disconnectTestDatabase);

  it('lists configured models in the OpenAI format', async () => {
    const { token } = await registerUser(app);
    const { secret } = await createApiKey(app, token);

    const res = await request(app).get('/v1/models').set('Authorization', `Bearer ${secret}`);

    expect(res.status).toBe(200);
    expect(res.body.object).toBe('list');
    expect(res.body.data.map((m) => m.id)).toEqual(Object.keys(testModels));
  });
});

describe('shipped model config without provider keys', () => {
  const app = createApp();

  beforeAll(connectTestDatabase);
  afterAll(disconnectTestDatabase);

  it('answers with a clear 503 instead of crashing', async () => {
    const { token } = await registerUser(app);
    const { secret } = await createApiKey(app, token);

    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${secret}`)
      .send(chatRequest({ model: 'gpt-oss-20b' }));

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('provider_not_configured');
  });
});
